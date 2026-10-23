import {COMMAND_PRIORITY_HIGH, INSERT_PARAGRAPH_COMMAND, REDO_COMMAND, SKIP_DOM_SELECTION_TAG, UNDO_COMMAND, $addUpdateTag, $getRoot, $isElementNode} from "lexical";
import {$isTableCellNode} from "@lexical/table";
import {InputSession, commitModelEdits, modelEdits, sameModel, subscribeClient} from "../editor/index.ts";
import {$fromLexical, $syncLexicalCells, $toLexical, readLexicalModel} from "./convert.ts";
import {buildLexicalSchema} from "./schema.ts";
import {$lexicalSelection, $setLexicalSelection} from "./selection.ts";
import {$nativePlacements, nativeReparent} from "./movement.ts";
import {applyEdits} from "../crdt/model.ts";
import {$modelData} from "./nodes.ts";
import {anchorAt, pathAt} from "../crdt/edit.ts";
import {keyOf} from "../crdt/ticket.ts";
import {runsToUnits} from "../crdt/model.ts";
import type {LexicalEditor} from "lexical";
import type {SyncClient} from "../sync/client.ts";
import type {AnchoredRange} from "../editor/index.ts";
import type {LexicalSchemaInfo} from "./schema.ts";
import type {Op} from "../crdt/doc.ts";

export const LEXICAL_REMOTE_TAG = "doc-sync-remote";
export type LexicalBindingOptions = {info?: LexicalSchemaInfo; onError?: (error: Error) => void; groupTyping?: boolean};
const owners = new WeakMap<LexicalEditor, LexicalBinding>();

export class LexicalBinding {
    readonly client: SyncClient;
    readonly editor: LexicalEditor;
    readonly info: LexicalSchemaInfo;
    readonly input: InputSession;
    private saved: AnchoredRange | null = null;
    private disposed = false;
    private cleanup: Array<() => void> = [];
    private finishTimer: ReturnType<typeof setTimeout> | null = null;
    private localCommand = false;
    private report: (error: Error) => void;

    constructor(client: SyncClient, editor: LexicalEditor, infoOrOptions: LexicalSchemaInfo | LexicalBindingOptions = {}) {
        if (owners.has(editor)) throw new Error("A LexicalBinding already owns this editor");
        this.client = client; this.editor = editor;
        const options = "schema" in infoOrOptions ? {info: infoOrOptions} : infoOrOptions;
        this.info = options.info ?? buildLexicalSchema(client.schema);
        if (!sameModel(this.info.schema, client.schema)) throw new Error("Lexical binding schema differs from client schema");
        if (!editor.hasNodes(this.info.nodes)) throw new Error("Register buildLexicalSchema(schema).nodes before constructing LexicalBinding");
        this.input = new InputSession(client);
        this.report = options.onError ?? (error => { throw error; });
        owners.set(editor, this);
        try {
            this.pull();
            this.cleanup.push(editor.registerUpdateListener(({editorState, prevEditorState, tags, dirtyElements, dirtyLeaves}) => {
                if (this.disposed || tags.has(LEXICAL_REMOTE_TAG) || (!dirtyElements.size && !dirtyLeaves.size)) return;
                try {
                    const next = editorState.read(() => $fromLexical(this.info), {editor});
                    const before = this.input.doc.toJSON();
                    if (sameModel(before, next)) return;
                    const reparent = nativeReparent(
                        prevEditorState.read(() => $nativePlacements(this.info), {editor}),
                        editorState.read(() => $nativePlacements(this.info), {editor}),
                    );
                    const edits = reparent
                        ? [reparent, ...modelEdits(client.schema, applyEdits(client.schema, before, [reparent]), next)]
                        : modelEdits(client.schema, before, next);
                    const previousRange = prevEditorState.read(() => $lexicalSelection(this.info), {editor});
                    let caretBefore = this.input.capture(previousRange)?.focus ?? "";
                    const first = edits[0];
                    const textInsertion = (edit: (typeof edits)[number]) => edit.op === "insert" && (typeof edit.content === "string"
                        ? !edit.content.includes("\n")
                        : edit.content.every(item => "text" in item && !item.text.includes("\n")));
                    const textEdit = (edit: (typeof edits)[number]) => {
                        let parent = before;
                        for (const index of edit.at.slice(0, -1)) parent = parent.children?.[index] ?? parent;
                        return parent.runs ? parent : null;
                    };
                    if (first && (!caretBefore || (edits.length === 1 && textInsertion(first)))) {
                        const parent = textEdit(first);
                        if (parent?.runs) {
                            const units = runsToUnits(client.schema, parent.runs);
                            const offset = units.slice(0, first.at.at(-1)).reduce((sum, unit) => sum + ("ch" in unit ? unit.ch.length : 1), 0);
                            caretBefore = anchorAt(this.input.doc, [...first.at.slice(0, -1), offset]) ?? "";
                        }
                    }
                    const ops = commitModelEdits(this.input.doc, before, edits);
                    this.captureSelection();
                    this.input.commit(ops, {
                        caretBefore, caretAfter: this.saved?.focus ?? "",
                        typing: options.groupTyping !== false && !tags.has("paste") && edits.length > 0 && edits.every(edit => !!textEdit(edit) && (edit.op === "delete" || textInsertion(edit))),
                    });
                    if (!this.input.active && !sameModel(client.doc.toJSON(), next)) this.pull();
                } catch (error) {
                    this.input.cancel();
                    this.saved = null;
                    const failure = error instanceof Error ? error : new Error(String(error));
                    // Updates requested by an update listener are queued. Report only
                    // after recovery commits, even when the error callback throws.
                    this.editor.update(() => $toLexical(this.info, client.doc.toJSON()), {
                        discrete: true,
                        tag: this.focused() ? LEXICAL_REMOTE_TAG : [LEXICAL_REMOTE_TAG, SKIP_DOM_SELECTION_TAG],
                        onUpdate: () => { this.refreshHiddenCells(); this.report(failure); },
                    });
                }
            }));
            this.cleanup.push(subscribeClient(client, {
                beforeEvent: event => {
                    if (event.type === "reset") { this.input.cancel(); this.saved = null; }
                    else this.captureSelection();
                },
                modelEvents: (_events, info) => {
                    if (info.cause === "reset") { this.input.cancel(); this.saved = null; }
                    this.input.reserveClock(); this.pull();
                },
                update: () => { this.input.reserveClock(); if (!this.localCommand) this.pull(); },
            }));
            this.cleanup.push(editor.registerCommand(INSERT_PARAGRAPH_COMMAND, () => {
                const range = $lexicalSelection(this.info);
                if (!range || !sameModel(range.anchor, range.focus)) return false;
                const before = this.input.capture(range);
                $addUpdateTag(LEXICAL_REMOTE_TAG);
                const doc = this.input.doc;
                const ops = doc.edit([{op: "split", at: range.anchor}]).ops;
                const marker = ops.find(op => op.t === "node");
                const after = marker ? pathAt(doc, keyOf(marker.id)) : null;
                this.localCommand = true;
                try { this.input.commit(ops, {caretBefore: before?.anchor ?? "", caretAfter: marker ? keyOf(marker.id) : "", typing: false}); }
                finally { this.localCommand = false; }
                $toLexical(this.info, doc.toJSON());
                if (after) $setLexicalSelection(this.info, {anchor: after, focus: after});
                this.saved = this.input.capture(after ? {anchor: after, focus: after} : null);
                return true;
            }, COMMAND_PRIORITY_HIGH));
            this.cleanup.push(editor.registerCommand(UNDO_COMMAND, () => { this.undo(); return true; }, COMMAND_PRIORITY_HIGH));
            this.cleanup.push(editor.registerCommand(REDO_COMMAND, () => { this.redo(); return true; }, COMMAND_PRIORITY_HIGH));
            const start = () => this.beginComposition();
            const finish = () => {
                if (this.finishTimer !== null) clearTimeout(this.finishTimer);
                this.finishTimer = setTimeout(() => {
                    this.finishTimer = null;
                    if (!this.disposed && this.input.active) this.endComposition();
                }, 0);
            };
            this.cleanup.push(editor.registerRootListener((root, previous) => {
                previous?.removeEventListener("compositionstart", start, true);
                previous?.removeEventListener("compositionend", finish, true);
                root?.addEventListener("compositionstart", start, true);
                root?.addEventListener("compositionend", finish, true);
            }));
        } catch (error) { this.dispose(); throw error; }
    }

    private focused(): boolean {
        const root = this.editor.getRootElement();
        return !root || root.contains(root.ownerDocument.activeElement);
    }
    private captureSelection(): void {
        if (!this.focused()) { this.saved = null; return; }
        const range = this.editor.getEditorState().read(() => $lexicalSelection(this.info), {editor: this.editor});
        this.saved = this.input.capture(range);
    }
    /** Native tables keep hidden full-grid cells; hide only their DOM, never their data. */
    private refreshHiddenCells(): void {
        this.editor.getEditorState().read(() => {
            const visit = (node: import("lexical").LexicalNode) => {
                if ($isTableCellNode(node)) {
                    const element = this.editor.getElementByKey(node.getKey());
                    if (element) element.style.display = $modelData(node)?.attrs?.spanned === true ? "none" : "";
                }
                if ($isElementNode(node)) node.getChildren().forEach(visit);
            };
            visit($getRoot());
        }, {editor: this.editor});
    }
    pull(): void {
        if (this.disposed || this.input.active) return;
        const model = this.client.doc.toJSON();
        const populated = this.editor.getEditorState().read(() => $getRoot().getChildrenSize() > 0, {editor: this.editor});
        let matches = false;
        try { matches = populated && sameModel(readLexicalModel(this.editor, this.info), model); }
        catch { /* Replace rejected native content from the authoritative document. */ }
        if (matches) {
            this.editor.update(() => $syncLexicalCells(model), {discrete: true, tag: LEXICAL_REMOTE_TAG});
            this.refreshHiddenCells();
            return;
        }
        const range = this.input.resolve(this.saved);
        this.editor.update(() => {
            $toLexical(this.info, model);
            if (range) $setLexicalSelection(this.info, range);
        }, {discrete: true, tag: this.focused() ? [LEXICAL_REMOTE_TAG] : [LEXICAL_REMOTE_TAG, SKIP_DOM_SELECTION_TAG]});
        this.refreshHiddenCells();
    }
    beginComposition(): void {
        if (this.disposed) return;
        if (this.finishTimer !== null) clearTimeout(this.finishTimer);
        this.finishTimer = null;
        this.input.begin();
    }
    endComposition(): Op[] {
        if (this.disposed || !this.input.active) return [];
        this.editor.update(() => {}, {discrete: true});
        const next = readLexicalModel(this.editor, this.info), before = this.input.doc.toJSON();
        if (!sameModel(before, next)) this.input.commit(commitModelEdits(this.input.doc, before, modelEdits(this.client.schema, before, next)));
        this.captureSelection();
        const ops = this.input.end();
        this.pull();
        return ops;
    }
    cancelComposition(): void { this.input.cancel(); this.saved = null; this.pull(); }
    private selectToken(key: string | null): void {
        if (!key) return;
        const range = this.input.resolve({anchor: key, focus: key});
        if (!range) return;
        this.saved = {anchor: key, focus: key};
        this.editor.update(() => { $setLexicalSelection(this.info, range); }, {discrete: true, tag: this.focused() ? LEXICAL_REMOTE_TAG : [LEXICAL_REMOTE_TAG, SKIP_DOM_SELECTION_TAG]});
    }
    undo(): void { if (this.disposed) return; this.endComposition(); this.captureSelection(); const caret = this.client.undo(); this.pull(); this.selectToken(caret); }
    redo(): void { if (this.disposed) return; this.endComposition(); this.captureSelection(); const caret = this.client.redo(); this.pull(); this.selectToken(caret); }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.finishTimer !== null) clearTimeout(this.finishTimer);
        this.input.cancel();
        for (const remove of this.cleanup.splice(0).reverse()) remove();
        if (owners.get(this.editor) === this) owners.delete(this.editor);
    }
}
