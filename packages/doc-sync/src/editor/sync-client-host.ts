import type {Doc, Op} from "../crdt/doc.ts";
import {anchorAt, pathAt, posOfPath} from "../crdt/edit.ts";
import {deleteRange} from "../crdt/commands.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {EngineEditingView} from "../engine/client-contract.ts";
import type {SyncClient} from "../sync/client.ts";
import {InputSession, commitModelEdits, subscribeClient} from "./index.ts";
import type {AnchoredRange, ModelRange} from "./index.ts";
import type {AnchorVisibility, EditorHost, EditorModelView, EditorSession, EditorStamp} from "./host-contract.ts";

/** TypeScript compatibility input for existing custom composition sessions. */
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

function typeScriptCompatibilityEditingView(client: SyncClient, document: () => Doc) {
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

/** Wrap a selected engine view without exposing its document representation. */
function editingView(client: SyncClient, selected: EngineEditingView) {
    let cached: EditorModelView | null = null;
    return {
        stamp: () => selected.stamp(),
        model(): EditorModelView {
            const stamp = selected.stamp();
            if (!cached || cached.stamp.generation !== stamp.generation || cached.stamp.revision !== stamp.revision) {
                cached = {stamp, model: selected.model()};
            }
            return cached;
        },
        apply(edits: EditOp[]): Op[] { client.assertLocalEditing(); return selected.apply(edits); },
        applyModelEdits(before: NodeJSON, edits: EditOp[]): Op[] { client.assertLocalEditing(); return selected.applyModelEdits(before, edits); },
        deleteRange(from: ModelPath, to: ModelPath): Op[] | null { client.assertLocalEditing(); return selected.deleteRange(from, to); },
        captureAnchor: (path: ModelPath) => selected.captureAnchor(path),
        locateAnchor: (key: string, visibility: AnchorVisibility) => selected.locateAnchor(key, visibility),
    };
}

function inputEditingView(client: SyncClient, input: SyncClientEditorInput) {
    return input instanceof InputSession
        ? editingView(client, input.editing)
        : typeScriptCompatibilityEditingView(client, () => input.doc);
}

export function createSyncClientEditorSession(client: SyncClient, input: SyncClientEditorInput = new InputSession(client)): EditorSession {
    return {
        ...inputEditingView(client, input),
        get active() { return input.active; },
        begin: () => { client.assertLocalEditing(); input.begin(); },
        // Remote notifications reserve clocks even when local mutations are paused.
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
        ...(options.input ? inputEditingView(client, options.input)
            : !client.engine || (!Object.hasOwn(client, "engine") && Object.hasOwn(client, "doc"))
                ? typeScriptCompatibilityEditingView(client, () => client.doc)
                : editingView(client, client.engine)),
        status: () => ({online: client.online, synchronized: client.synchronized}),
        historyStatus: () => {
            const {canUndo, canRedo} = client.engine.historyStatus();
            return {canUndo, canRedo};
        },
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
