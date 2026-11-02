import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Presence} from "../sync/protocol.ts";
import type {AnchorVisibility, EditorHost, EditorModelView, EditorObserver, EditorSession, EditorStamp} from "../editor/host-contract.ts";
import type {LocalClient} from "./client.ts";

/** Keep the borrowed model stable until its document or revision changes. */
function cachedModel(view: {stamp(): EditorStamp; model(): NodeJSON}): () => EditorModelView {
    let cached: EditorModelView | null = null;
    return () => {
        const stamp = view.stamp();
        if (!cached || cached.stamp.generation !== stamp.generation || cached.stamp.revision !== stamp.revision) {
            cached = {stamp, model: view.model()};
        }
        return cached;
    };
}

/** A local document backend for the existing native editor bindings. */
export class LocalEditorHost implements EditorHost {
    readonly kind = "doc-sync-editor-host";
    readonly contractVersion = 1;
    private readonly origin = {};
    readonly client: LocalClient;
    readonly model: () => EditorModelView;

    constructor(client: LocalClient) {
        this.client = client;
        this.model = cachedModel(client);
    }

    get actor() { return this.client.actor; }
    get schema() { return this.client.schema; }
    stamp(): EditorStamp { return this.client.stamp(); }
    status() { return {online: false, synchronized: false}; }
    historyStatus() { return this.client.historyStatus(); }
    apply(edits: EditOp[]): Op[] { return this.client.apply(edits, this.origin); }
    applyModelEdits(before: NodeJSON, edits: EditOp[]): Op[] { return this.client.applyModelEdits(before, edits, this.origin); }
    deleteRange(from: ModelPath, to: ModelPath): Op[] | null { return this.client.deleteRange(from, to, this.origin); }
    captureAnchor(path: ModelPath): string | null { return this.client.captureAnchor(path); }
    locateAnchor(key: string, visibility: AnchorVisibility): ModelPath | null { return this.client.locateAnchor(key, visibility); }
    commit(ops: Op[], record?: RecordOptions | null): void { this.client.commit(ops, record, this.origin); }
    undo(): string | null { return this.client.undo(); }
    redo(): string | null { return this.client.redo(); }
    createSession(): EditorSession {
        const session = this.client.createSession(this.origin);
        return {
            stamp: () => session.stamp(),
            model: cachedModel(session),
            apply: edits => session.apply(edits),
            applyModelEdits: (before, edits) => session.applyModelEdits(before, edits),
            deleteRange: (from, to) => session.deleteRange(from, to),
            captureAnchor: path => session.captureAnchor(path),
            locateAnchor: (key, visibility) => session.locateAnchor(key, visibility),
            get active() { return session.active; },
            begin: () => session.begin(),
            reserveClock: () => session.reserveClock(),
            commit: (ops, record) => session.commit(ops, record),
            end: () => session.end(),
            cancel: () => session.cancel(),
            capture: range => session.capture(range),
            resolve: range => session.resolve(range),
        };
    }
    presence(): Iterable<Presence> { return []; }
    /** Native bindings can report selection even though local mode has no peers. */
    setPresence(_value: Omit<Presence, "actor">): void {}
    subscribe(observer: EditorObserver): () => void {
        return this.client.subscribe(observer, {origin: this.origin});
    }
}

export function createLocalEditorHost(client: LocalClient): LocalEditorHost {
    return new LocalEditorHost(client);
}
