import {COMMAND_PRIORITY_HIGH, INSERT_PARAGRAPH_COMMAND, REDO_COMMAND, SKIP_DOM_SELECTION_TAG, UNDO_COMMAND, $addUpdateTag, $getRoot} from "lexical";
import {modelEdits, sameModel} from "@barocss/doc-sync-core/editor";
import {$fromLexical, $projectLexical, $syncLexicalCells, $toLexical, readLexicalModel} from "./convert.ts";
import {buildLexicalSchema} from "./schema.ts";
import {$lexicalSelection, $setLexicalSelection} from "./selection.ts";
import {$nativePlacements, nativeReparent} from "./movement.ts";
import {applyEdits} from "@barocss/doc-sync-core";
import {keyOf} from "@barocss/doc-sync-core";
import {runsToUnits, unitsToRuns} from "@barocss/doc-sync-core";
import type {EditorState, LexicalEditor} from "lexical";
import type {EditorHost, EditorSession, AnchoredRange, ModelRange} from "@barocss/doc-sync-core/editor";
import type {LexicalSchemaInfo} from "./schema.ts";
import type {Op} from "@barocss/doc-sync-core";
import type {NodeJSON, EditOp, Unit, Schema} from "@barocss/doc-sync-core";

export const LEXICAL_REMOTE_TAG = "doc-sync-remote";
export type LexicalBindingOptions = {info?: LexicalSchemaInfo; onError?: (error: Error) => void; groupTyping?: boolean};
const owners = new WeakMap<LexicalEditor, LexicalHostBinding>();

/** Preserve the native splice position when repeated text permits several model diffs. */
function nativeTextEdits(schema: Schema, before: NodeJSON, next: NodeJSON, previous: ModelRange | null, current: ModelRange | null): EditOp[] | null {
    if (!current || !sameModel(current.anchor, current.focus)) return null;
    const path = current.focus.slice(0, -1);
    let left = before, right = next;
    for (const index of path) {
        if (!left.children?.[index] || !right.children?.[index]) return null;
        // Only this native text block may change; structural edits use modelEdits.
        if (!sameModel({...left, children: undefined}, {...right, children: undefined}) || left.children.length !== right.children.length) return null;
        if (left.children.some((node, at) => at !== index && !sameModel(node, right.children![at]))) return null;
        left = left.children[index]; right = right.children[index];
    }
    if (!left.runs || !right.runs || !sameModel({...left, runs: undefined}, {...right, runs: undefined})) return null;
    const a = runsToUnits(schema, left.runs), b = runsToUnits(schema, right.runs);
    const unitIndex = (units: Unit[], offset: number): number | null => {
        let at = 0;
        for (let index = 0; index < units.length; index++) {
            if (at === offset) return index;
            const unit = units[index]; at += "ch" in unit ? unit.ch.length : 1;
        }
        return at === offset ? units.length : null;
    };
    const end = unitIndex(b, current.focus.at(-1)!);
    if (end === null) return null;
    const splice = (start: number, removed: number): EditOp[] | null => {
        const added = b.length - a.length + removed;
        if (start < 0 || removed < 0 || added < 0 || start + removed > a.length || start + added !== end) return null;
        if (!sameModel(a.slice(0, start), b.slice(0, start)) || !sameModel(a.slice(start + removed), b.slice(end))) return null;
        const at = [...path, start], edits: EditOp[] = [];
        if (removed) edits.push({op: "delete", at, count: removed});
        if (added) edits.push({op: "insert", at, content: unitsToRuns(schema, b.slice(start, end))});
        return edits.length ? edits : null;
    };
    if (previous && sameModel(previous.anchor.slice(0, -1), path) && sameModel(previous.focus.slice(0, -1), path)) {
        const anchor = unitIndex(a, previous.anchor.at(-1)!), focus = unitIndex(a, previous.focus.at(-1)!);
        if (anchor !== null && focus !== null) {
            const edits = splice(Math.min(anchor, focus), Math.abs(anchor - focus));
            if (edits) return edits;
        }
    }
    // A programmatic native update can set its selection and type in one update,
    // so prevEditorState may not contain that selection. The resulting caret
    // still fixes the position of a pure insertion or deletion.
    const delta = b.length - a.length;
    return delta > 0 ? splice(end - delta, 0) : delta < 0 ? splice(end, -delta) : null;
}

export class LexicalHostBinding {
    readonly host: EditorHost;
    readonly editor: LexicalEditor;
    readonly info: LexicalSchemaInfo;
    readonly session: EditorSession;
    private saved: AnchoredRange | null = null;
    private disposed = false;
    private cleanup: Array<() => void> = [];
    private finishTimer: ReturnType<typeof setTimeout> | null = null;
    private localCommand = false;
    private native: {state: EditorState; model: NodeJSON} | null = null;
    private report: (error: Error) => void;

    constructor(host: EditorHost, editor: LexicalEditor, infoOrOptions: LexicalSchemaInfo | LexicalBindingOptions = {}) {
        if (owners.has(editor)) throw new Error("A LexicalBinding already owns this editor");
        this.host = host; this.editor = editor;
        const options = "schema" in infoOrOptions ? {info: infoOrOptions} : infoOrOptions;
        this.info = options.info ?? buildLexicalSchema(host.schema);
        if (!sameModel(this.info.schema, host.schema)) throw new Error("Lexical binding schema differs from client schema");
        if (!editor.hasNodes(this.info.nodes)) throw new Error("Register buildLexicalSchema(schema).nodes before constructing LexicalBinding");
        this.session = host.createSession();
        this.report = options.onError ?? (error => { throw error; });
        owners.set(editor, this);
        try {
            this.pull();
            this.cleanup.push(editor.registerUpdateListener(({editorState, prevEditorState, tags, dirtyElements, dirtyLeaves}) => {
                if (this.disposed || tags.has(LEXICAL_REMOTE_TAG)) return;
                // Local hosts do not send a beforeEvent notification. Save native
                // selection-only changes before a later application edit changes
                // token positions. These updates do not create document history.
                if (!dirtyElements.size && !dirtyLeaves.size) { this.captureSelection(); return; }
                try {
                    this.native = null;
                    const next = editorState.read(() => $fromLexical(this.info), {editor});
                    const before = this.session.model().model;
                    if (sameModel(before, next)) return;
                    const reparent = nativeReparent(
                        prevEditorState.read(() => $nativePlacements(this.info), {editor}),
                        editorState.read(() => $nativePlacements(this.info), {editor}),
                    );
                    const previousRange = prevEditorState.read(() => $lexicalSelection(this.info), {editor});
                    const currentRange = editorState.read(() => $lexicalSelection(this.info), {editor});
                    const edits = reparent
                        ? [reparent, ...modelEdits(host.schema, applyEdits(host.schema, before, [reparent]), next)]
                        : nativeTextEdits(host.schema, before, next, previousRange, currentRange) ?? modelEdits(host.schema, before, next);
                    let caretBefore = this.session.capture(previousRange)?.focus ?? "";
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
                            const units = runsToUnits(host.schema, parent.runs);
                            const offset = units.slice(0, first.at.at(-1)).reduce((sum, unit) => sum + ("ch" in unit ? unit.ch.length : 1), 0);
                            caretBefore = this.session.captureAnchor([...first.at.slice(0, -1), offset]) ?? "";
                        }
                    }
                    const ops = this.session.applyModelEdits(before, edits);
                    this.captureSelection();
                    this.session.commit(ops, {
                        caretBefore, caretAfter: this.saved?.focus ?? "",
                        typing: options.groupTyping !== false && !tags.has("paste") && edits.length > 0 && edits.every(edit => !!textEdit(edit) && (edit.op === "delete" || textInsertion(edit))),
                    });
                    if (!this.session.active && !sameModel(host.model().model, next)) this.pull();
                } catch (error) {
                    this.session.cancel();
                    this.saved = null;
                    const failure = error instanceof Error ? error : new Error(String(error));
                    // Updates requested by an update listener are queued. Report only
                    // after recovery commits, even when the error callback throws.
                    this.editor.update(() => $toLexical(this.info, host.model().model), {
                        discrete: true,
                        tag: this.focused() ? LEXICAL_REMOTE_TAG : [LEXICAL_REMOTE_TAG, SKIP_DOM_SELECTION_TAG],
                        onUpdate: () => this.report(failure),
                    });
                }
            }));
            this.cleanup.push(host.subscribe({
                beforeEvent: event => {
                    if (event.type === "reset") { this.session.cancel(); this.saved = null; }
                    else this.captureSelection();
                },
                modelEvents: (_events, info) => {
                    if (info.cause === "reset") { this.session.cancel(); this.saved = null; }
                    this.session.reserveClock(); this.pull();
                },
                update: () => { this.session.reserveClock(); if (!this.localCommand) this.pull(); },
            }));
            this.cleanup.push(editor.registerCommand(INSERT_PARAGRAPH_COMMAND, () => {
                const range = $lexicalSelection(this.info);
                if (!range || !sameModel(range.anchor, range.focus)) return false;
                const before = this.session.capture(range);
                $addUpdateTag(LEXICAL_REMOTE_TAG);
                const ops = this.session.apply([{op: "split", at: range.anchor}]);
                const marker = ops.find(op => op.t === "node");
                const after = marker ? this.session.locateAnchor(keyOf(marker.id), "retained") : null;
                this.localCommand = true;
                try { this.session.commit(ops, {caretBefore: before?.anchor ?? "", caretAfter: marker ? keyOf(marker.id) : "", typing: false}); }
                finally { this.localCommand = false; }
                $toLexical(this.info, this.session.model().model);
                if (after) $setLexicalSelection(this.info, {anchor: after, focus: after});
                this.saved = this.session.capture(after ? {anchor: after, focus: after} : null);
                return true;
            }, COMMAND_PRIORITY_HIGH));
            this.cleanup.push(editor.registerCommand(UNDO_COMMAND, () => { this.undo(); return true; }, COMMAND_PRIORITY_HIGH));
            this.cleanup.push(editor.registerCommand(REDO_COMMAND, () => { this.redo(); return true; }, COMMAND_PRIORITY_HIGH));
            const start = () => this.beginComposition();
            const finish = () => {
                if (this.finishTimer !== null) clearTimeout(this.finishTimer);
                this.finishTimer = setTimeout(() => {
                    this.finishTimer = null;
                    if (!this.disposed && this.session.active) this.endComposition();
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
        this.saved = this.session.capture(range);
    }
    pull(): void {
        if (this.disposed || this.session.active) return;
        const model = this.host.model().model;
        const state = this.editor.getEditorState();
        const previous = this.native?.state === state ? this.native.model : null;
        if (previous && sameModel(previous, model)) return;
        const populated = this.editor.getEditorState().read(() => $getRoot().getChildrenSize() > 0, {editor: this.editor});
        let matches = false;
        try { matches = populated && sameModel(previous ?? readLexicalModel(this.editor, this.info), model); }
        catch { /* Replace rejected native content from the authoritative document. */ }
        if (matches) {
            this.editor.update(() => $syncLexicalCells(this.info, model), {discrete: true, tag: LEXICAL_REMOTE_TAG,
                onUpdate: () => { this.native = null; },
            });
            return;
        }
        const range = this.session.resolve(this.saved);
        this.editor.update(() => {
            if (previous) $projectLexical(this.info, previous, model);
            else $toLexical(this.info, model);
            if (range) $setLexicalSelection(this.info, range);
        }, {discrete: true, tag: this.focused() ? [LEXICAL_REMOTE_TAG] : [LEXICAL_REMOTE_TAG, SKIP_DOM_SELECTION_TAG],
            onUpdate: () => {
                // Native transforms and application codecs can alter the projection.
                // Cache the verified readback, never the requested model alone.
                try { this.native = {state: this.editor.getEditorState(), model: readLexicalModel(this.editor, this.info)}; }
                catch { this.native = null; }
            },
        });
    }
    beginComposition(): void {
        if (this.disposed) return;
        if (this.finishTimer !== null) clearTimeout(this.finishTimer);
        this.finishTimer = null;
        this.session.begin();
    }
    endComposition(): Op[] {
        if (this.disposed || !this.session.active) return [];
        this.editor.update(() => {}, {discrete: true});
        const next = readLexicalModel(this.editor, this.info), before = this.session.model().model;
        if (!sameModel(before, next)) this.session.commit(this.session.applyModelEdits(before, modelEdits(this.host.schema, before, next)));
        this.captureSelection();
        const ops = this.session.end();
        this.pull();
        return ops;
    }
    cancelComposition(): void { this.session.cancel(); this.saved = null; this.pull(); }
    private selectToken(key: string | null): void {
        if (!key) return;
        const range = this.session.resolve({anchor: key, focus: key});
        if (!range) return;
        this.saved = {anchor: key, focus: key};
        this.editor.update(() => { $setLexicalSelection(this.info, range); }, {discrete: true, tag: this.focused() ? LEXICAL_REMOTE_TAG : [LEXICAL_REMOTE_TAG, SKIP_DOM_SELECTION_TAG]});
    }
    undo(): void { if (this.disposed) return; this.endComposition(); this.captureSelection(); const caret = this.host.undo(); this.pull(); this.selectToken(caret); }
    redo(): void { if (this.disposed) return; this.endComposition(); this.captureSelection(); const caret = this.host.redo(); this.pull(); this.selectToken(caret); }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.finishTimer !== null) clearTimeout(this.finishTimer);
        this.session.cancel();
        for (const remove of this.cleanup.splice(0).reverse()) remove();
        if (owners.get(this.editor) === this) owners.delete(this.editor);
    }
}
