import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {EventCause} from "../sync/client.ts";
import type {Presence, ServerEvent} from "../sync/protocol.ts";
import type {AnchoredRange, ModelRange} from "./index.ts";

export interface EditorStamp { readonly generation: number; readonly revision: number }
/** The model is a borrowed immutable view. Consumers must not mutate it. */
export interface EditorModelView { readonly stamp: EditorStamp; readonly model: NodeJSON }
export type AnchorVisibility = "visible" | "retained";
/** Local hosts publish editor changes without a server event. */
export type EditorEventCause = EventCause | "local";
export interface EditorObserver {
    beforeEvent?(event: ServerEvent): void;
    modelEvents?(edits: readonly EditOp[], info: {cause: EditorEventCause; fallback: boolean}): void;
    update?(): void;
}
export interface EditorEditingView {
    /** Read document identity/revision without materializing its model. */
    stamp(): EditorStamp;
    model(): EditorModelView;
    apply(edits: EditOp[]): Op[];
    applyModelEdits(before: NodeJSON, edits: EditOp[]): Op[];
    deleteRange(from: ModelPath, to: ModelPath): Op[] | null;
    captureAnchor(path: ModelPath): string | null;
    locateAnchor(key: string, visibility: AnchorVisibility): ModelPath | null;
}
export interface EditorSession extends EditorEditingView {
    readonly active: boolean;
    begin(): void;
    reserveClock(): void;
    commit(ops: Op[], record?: RecordOptions | null): void;
    end(): Op[];
    cancel(): void;
    capture(range: ModelRange | null): AnchoredRange | null;
    resolve(range: AnchoredRange | null): ModelRange | null;
}
export interface EditorHost extends EditorEditingView {
    readonly kind: "doc-sync-editor-host";
    readonly contractVersion: 1;
    readonly actor: string;
    readonly schema: Schema;
    status(): {online: boolean; synchronized: boolean};
    historyStatus(): {canUndo: boolean; canRedo: boolean};
    commit(ops: Op[], record?: RecordOptions | null): void;
    undo(): string | null;
    redo(): string | null;
    createSession(): EditorSession;
    presence(): Iterable<Presence>;
    setPresence(value: Omit<Presence, "actor">): void;
    subscribe(observer: EditorObserver): () => void;
}
