import {Editor, Transforms} from "slate";
import {InputSession, commitModelEdits, modelEdits, sameModel, subscribeClient} from "../editor/index.ts";
import {applyEdits} from "../crdt/model.ts";
import {fromSlate, modelRangeToSlate, slateRangeToModel, toSlate, projectSlateBlock} from "./codec.ts";
import type {BaseEditor, Descendant} from "slate";
import type {EditOp, NodeJSON} from "../crdt/model.ts";
import type {SyncClient} from "../sync/client.ts";
import type {AnchoredRange} from "../editor/index.ts";
import type {SlateElement} from "./codec.ts";

export type SlateBindingOptions = {
    /** Bind native composition events without requiring slate-react. */
    element?: HTMLElement;
    onError?: (error: Error) => void;
    /** Group adjacent typing through CRDT History. Defaults to true. */
    groupTyping?: boolean;
    /** Model notification after a local or received content change. */
    onChange?: (model: NodeJSON) => void;
};

const owners = new WeakMap<BaseEditor, SlateBinding>();

/** Schema-driven Slate integration. The SyncClient remains the authoritative document. */
export class SlateBinding {
    readonly client: SyncClient;
    readonly editor: BaseEditor;
    readonly initialValue: Descendant[];
    private readonly options: SlateBindingOptions;
    private readonly session: InputSession;
    private readonly originalChange: BaseEditor["onChange"];
    private readonly originalInline: BaseEditor["isInline"];
    private readonly originalVoid: BaseEditor["isVoid"];
    private readonly changeHandler: BaseEditor["onChange"];
    private readonly inlineHandler: BaseEditor["isInline"];
    private readonly voidHandler: BaseEditor["isVoid"];
    private readonly unsubscribe: () => void;
    private disposed = false;
    private busy = false;
    private resetPending = false;
    private selection: AnchoredRange | null = null;
    private rendered: NodeJSON;
    private native: {children: Descendant[]; model: NodeJSON; projected: boolean} | null = null;

    constructor(client: SyncClient, editor: BaseEditor, options: SlateBindingOptions = {}) {
        if (owners.has(editor)) throw new Error("SlateBinding: the editor already has a binding");
        this.client = client;
        this.editor = editor;
        this.options = options;
        this.session = new InputSession(client);
        this.initialValue = toSlate(client.schema, client.doc.toJSON());
        this.rendered = client.doc.toJSON();
        this.originalChange = editor.onChange;
        this.originalInline = editor.isInline;
        this.originalVoid = editor.isVoid;
        this.inlineHandler = element => {
            const spec = client.schema.nodes[(element as SlateElement).type];
            return spec ? spec.shape === "inline" || spec.shape === "span" : this.originalInline(element);
        };
        this.voidHandler = element => {
            const spec = client.schema.nodes[(element as SlateElement).type];
            return spec ? spec.shape === "inline" || spec.shape === "atom" : this.originalVoid(element);
        };
        this.changeHandler = changeOptions => {
            try {
                if (!this.disposed && !this.busy) this.push();
            } finally {
                this.originalChange.call(editor, changeOptions);
            }
        };
        editor.isInline = this.inlineHandler;
        editor.isVoid = this.voidHandler;
        editor.onChange = this.changeHandler;
        this.unsubscribe = subscribeClient(client, {
            beforeEvent: event => {
                if (event.type === "reset") {
                    this.session.cancel();
                    this.selection = null;
                    this.resetPending = true;
                } else if (!this.busy) {
                    this.push();
                    this.capture();
                }
            },
            modelEvents: () => this.sync(),
            update: () => {
                this.session.reserveClock();
                if (this.resetPending) {
                    this.resetPending = false;
                    this.sync(true);
                } else this.sync();
            },
        });
        owners.set(editor, this);
        try {
            this.sync(true);
            options.element?.addEventListener("compositionstart", this.compositionStart);
            options.element?.addEventListener("compositionend", this.compositionEnd);
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    get composing(): boolean { return this.session.active; }

    private error(error: unknown): void {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (this.options.onError) this.options.onError(failure);
        else throw failure;
    }
    private capture(): void {
        this.selection = this.session.capture(slateRangeToModel(this.client.schema, this.editor.children, this.editor.selection));
    }
    private push(): void {
        if (this.disposed || this.busy) return;
        this.busy = true;
        try {
            if (this.native?.children === this.editor.children) { this.capture(); return; }
            const after = fromSlate(this.client.schema, this.editor.children);
            this.native = {children: this.editor.children, model: after, projected: false};
            const before = this.session.doc.toJSON();
            if (sameModel(before, after)) {
                this.capture();
                return;
            }
            const caretBefore = this.selection?.focus ?? "";
            const operations = [...this.editor.operations];
            const moves = operations.filter(operation => operation.type === "move_node").map(operation => ({op: "move" as const, from: operation.path, at: operation.newPath}));
            let edits: EditOp[];
            if (moves.length) {
                if (operations.some(operation => !["move_node", "set_selection"].includes(operation.type)) ||
                    !sameModel(applyEdits(this.client.schema, before, moves), after)) {
                    throw new Error("SlateBinding: perform block moves in a separate native update");
                }
                edits = moves;
            } else edits = modelEdits(this.client.schema, before, after);
            const ops = commitModelEdits(this.session.doc, before, edits);
            this.capture();
            this.session.commit(ops, {
                caretBefore,
                caretAfter: this.selection?.focus ?? "",
                typing: this.options.groupTyping !== false && operations.some(operation => operation.type === "insert_text" || operation.type === "remove_text") &&
                    operations.every(operation => ["insert_text", "remove_text", "set_selection"].includes(operation.type)),
            });
            this.rendered = this.session.doc.toJSON();
            this.options.onChange?.(this.rendered);
        } catch (error) {
            this.session.cancel();
            this.busy = false;
            this.sync(true);
            this.error(error);
            return;
        } finally {
            this.busy = false;
        }
        if (!this.session.active) this.sync();
    }

    /** Pull authoritative content. No browser focus call is made. */
    sync(force = false): void {
        if (this.disposed || this.busy || (this.session.active && !force)) return;
        const model = this.client.doc.toJSON();
        let native: NodeJSON | null = null;
        try { native = this.native?.children === this.editor.children ? this.native.model : fromSlate(this.client.schema, this.editor.children); } catch { /* Replace unsupported native content on recovery. */ }
        if (!force && native && sameModel(native, model)) {
            this.native = {children: this.editor.children, model, projected: this.native?.children === this.editor.children && this.native.projected || false};
            return;
        }
        this.busy = true;
        try {
            // Reuse identical root blocks. Rebuild only the changed interval;
            // grid projection and custom normalization stay on the existing codec.
            const previous = !force && this.native?.projected && this.native.children === this.editor.children ? this.native.model : null;
            const old = previous?.children ?? [], next = model.children ?? [];
            let start = 0, end = old.length, nextEnd = next.length;
            if (previous) {
                while (start < end && start < nextEnd && sameModel(old[start], next[start])) start++;
                while (end > start && nextEnd > start && sameModel(old[end - 1], next[nextEnd - 1])) { end--; nextEnd--; }
            }
            const children = previous ? next.slice(start, nextEnd).map(node => projectSlateBlock(this.client.schema, node)) : toSlate(this.client.schema, model);
            const expected = previous ? [...this.editor.children.slice(0, start), ...children, ...this.editor.children.slice(end)] : children;
            const anchored = this.selection;
            Editor.withoutNormalizing(this.editor, () => {
                Transforms.deselect(this.editor);
                for (let index = (previous ? end : this.editor.children.length) - 1; index >= (previous ? start : 0); index -= 1) Transforms.removeNodes(this.editor, {at: [index]});
                if (children.length) Transforms.insertNodes(this.editor, children, {at: [previous ? start : 0]});
            });
            const range = modelRangeToSlate(this.client.schema, this.editor.children, this.session.resolve(anchored));
            if (range) Transforms.select(this.editor, range);
            this.capture();
            const exact = sameModel(this.editor.children, expected);
            const matches = exact || sameModel(fromSlate(this.client.schema, this.editor.children), model);
            if (!matches) throw new Error("SlateBinding: editor normalization changed schema content");
            this.native = {children: this.editor.children, model, projected: exact};
            const changed = !sameModel(this.rendered, model);
            this.rendered = model;
            if (changed) this.options.onChange?.(model);
        } catch (error) {
            this.error(error);
        } finally {
            this.busy = false;
        }
    }

    beginComposition(): void {
        if (this.disposed || this.session.active) return;
        this.push();
        this.session.begin();
        this.capture();
    }
    endComposition(): void {
        if (this.disposed || !this.session.active) return;
        this.push();
        this.busy = true;
        try { this.session.end(); } finally { this.busy = false; }
        this.sync(true);
    }
    cancelComposition(): void {
        if (this.disposed) return;
        this.session.cancel();
        this.sync(true);
    }
    private readonly compositionStart = (): void => this.beginComposition();
    private readonly compositionEnd = (): void => { queueMicrotask(() => this.endComposition()); };

    undo(): void {
        if (this.disposed) return;
        this.endComposition();
        const caret = this.client.undo();
        if (caret) this.selection = {anchor: caret, focus: caret};
        this.sync(true);
    }
    redo(): void {
        if (this.disposed) return;
        this.endComposition();
        const caret = this.client.redo();
        if (caret) this.selection = {anchor: caret, focus: caret};
        this.sync(true);
    }
    destroy(): void {
        if (this.disposed) return;
        this.session.cancel();
        this.disposed = true;
        this.unsubscribe();
        this.options.element?.removeEventListener("compositionstart", this.compositionStart);
        this.options.element?.removeEventListener("compositionend", this.compositionEnd);
        if (this.editor.onChange === this.changeHandler) this.editor.onChange = this.originalChange;
        if (this.editor.isInline === this.inlineHandler) this.editor.isInline = this.originalInline;
        if (this.editor.isVoid === this.voidHandler) this.editor.isVoid = this.originalVoid;
        owners.delete(this.editor);
    }
    dispose(): void { this.destroy(); }
}
