import type {Doc, Op} from "../crdt/doc.ts";
import {anchorAt, pathAt, posOfPath} from "../crdt/edit.ts";
import {deleteRange} from "../crdt/commands.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {SyncClient} from "../sync/client.ts";
import {InputSession, commitModelEdits, subscribeClient} from "./index.ts";
import type {AnchoredRange, ModelRange} from "./index.ts";
import type {AnchorVisibility, EditorHost, EditorModelView, EditorSession, EditorStamp} from "./host-contract.ts";

/** Also accepts the demo's existing composition session without creating a second fork. */
export interface SyncClientEditorInput {
    readonly doc: Doc;
    readonly active: boolean;
    begin(): void;
    reserveClock(): void;
    commit(ops: Op[], record?: RecordOptions | null): void;
    end(): Op[];
    cancel(): void;
    capture(range: ModelRange | null): AnchoredRange | null;
    resolve(range: AnchoredRange | null): ModelRange | null;
}
const owners = new WeakMap<EditorHost, object>();
/** Legacy mount bridges use backend identity, even when two adapters wrap one client. */
export const getSyncClientEditorHostOwner = (host: EditorHost): object => owners.get(host) ?? host;

function editingView(client: SyncClient, document: () => Doc) {
    let current: Doc | null = null, generation = 0;
    let cached: EditorModelView | null = null;
    const stamp = (): EditorStamp => {
        const doc = document();
        if (current !== doc) { current = doc; generation++; cached = null; }
        return {generation, revision: doc.version};
    };
    const mutableDocument = () => {
        client.assertLocalEditing();
        const doc = document();
        // A fork does not inherit the live document's custom guard.
        if (doc !== client.doc) client.doc.editGuard?.();
        return doc;
    };
    return {
        stamp,
        model(): EditorModelView {
            const value = stamp();
            if (!cached || cached.stamp.revision !== value.revision) cached = {stamp: value, model: current!.toJSON()};
            return cached;
        },
        apply(edits: EditOp[]): Op[] { return mutableDocument().edit(edits).ops; },
        applyModelEdits(before: NodeJSON, edits: EditOp[]): Op[] { return commitModelEdits(mutableDocument(), before, edits); },
        deleteRange(from: ModelPath, to: ModelPath): Op[] | null {
            const doc = mutableDocument(), a = posOfPath(doc, from), b = posOfPath(doc, to);
            return a && b ? deleteRange(doc, a, b) : null;
        },
        captureAnchor(path: ModelPath): string | null { return anchorAt(document(), path); },
        locateAnchor(key: string, visibility: AnchorVisibility): ModelPath | null {
            const doc = document();
            if (visibility === "visible") {
                const item = doc.get(key);
                const visible = doc.hasMoves || doc.hasCardinality ? doc.tokenLocation(key)?.visible : item && doc.visible(item.line.key);
                if (!item || !visible) return null;
            }
            return pathAt(doc, key);
        },
    };
}

export function createSyncClientEditorSession(client: SyncClient, input: SyncClientEditorInput = new InputSession(client)): EditorSession {
    return {
        ...editingView(client, () => input.doc),
        get active() { return input.active; },
        begin: () => { client.assertLocalEditing(); input.begin(); },
        // Clock reservation only synchronizes bookkeeping. Remote notifications must
        // keep running while local mutations are paused or conditionally blocked.
        reserveClock: () => input.reserveClock(),
        commit: (ops, record) => { client.assertLocalEditing(); input.commit(ops, record); },
        end: () => { client.assertLocalEditing(); return input.end(); },
        cancel: () => input.cancel(),
        capture: range => input.capture(range),
        resolve: range => input.resolve(range),
    };
}

export function createSyncClientEditorHost(client: SyncClient, options: {input?: SyncClientEditorInput} = {}): EditorHost {
    const host: EditorHost = {
        kind: "doc-sync-editor-host",
        contractVersion: 1,
        get actor() { return client.actor; },
        get schema() { return client.schema; },
        ...editingView(client, () => options.input?.doc ?? client.doc),
        status: () => ({online: client.online, synchronized: client.synchronized}),
        historyStatus: () => ({canUndo: client.history.canUndo, canRedo: client.history.canRedo}),
        commit: (ops, record) => {
            client.assertLocalEditing();
            (options.input ?? client).commit(ops, record);
        },
        undo: () => client.undo(),
        redo: () => client.redo(),
        createSession: () => createSyncClientEditorSession(client, options.input),
        presence: () => client.others.values(),
        setPresence: value => client.setPresence(value),
        subscribe: observer => subscribeClient(client, observer),
    };
    owners.set(host, client);
    return host;
}
