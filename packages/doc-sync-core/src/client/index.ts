import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {EngineSelection, EngineAnchoredSelection} from "../engine/contract.ts";
import type {EditorHost, EditorObserver, EditorSession, EditorStamp} from "../editor/host-contract.ts";
import {createSyncClientEditorHost} from "../editor/sync-client-host.ts";
import type {SyncClientEditorInput} from "../editor/sync-client-host.ts";
import {subscribeClient} from "../editor/index.ts";
import {LocalClient} from "../local/client.ts";
import {createLocalEditorHost} from "../local/editor-host.ts";
import {SyncClient} from "../sync/client.ts";
import type {ClientOptions as SyncOptions} from "../sync/client.ts";
import type {Presence, Transport} from "../sync/protocol.ts";

export interface ClientOptions {
    schema: Schema;
    actor?: string;
    transport?: Transport;
    syncOptions?: Omit<SyncOptions, "schema">;
}
export type BindingClient = Client | LocalClient | SyncClient;
export interface ClientNotificationError {readonly phase: keyof EditorObserver; readonly message: string}
type Entry = {observer: EditorObserver; origin?: object};
const bridges = new WeakMap<SyncClient, SyncBridge>();
const clientBackends = new WeakMap<Client, LocalClient | SyncClient>();

/** One observer fan-out per sync backend. Legacy callbacks keep their own semantics. */
class SyncBridge {
    readonly entries = new Set<Entry>();
    readonly errors: ClientNotificationError[] = [];
    origin: object | undefined;
    notifying = false;
    private stop: (() => void) | null = null;
    private stamp: EditorStamp;
    private pending: {origin: object; ops: Op[]} | null = null;
    readonly client: SyncClient;
    constructor(client: SyncClient) { this.client = client; this.stamp = client.engine.stamp(); }
    mutable() { if (this.notifying) throw new Error("Client observer mutation is not allowed"); }
    settled() { this.mutable(); if (this.pending) throw new Error("Commit pending operations first"); }
    dispose() { this.stop?.(); this.stop = null; this.entries.clear(); }
    emit(phase: keyof EditorObserver, invoke: (observer: EditorObserver) => void) {
        const previous = this.notifying; this.notifying = phase !== "beforeEvent" || previous;
        try {
            for (const entry of [...this.entries]) {
                if (!this.entries.has(entry) || phase !== "beforeEvent" && this.origin && entry.origin === this.origin) continue;
                try { invoke(entry.observer); } catch (error) {
                    this.errors.push(Object.freeze({phase, message: error instanceof Error ? error.message : String(error)}));
                    if (this.errors.length > 100) this.errors.shift();
                }
            }
        } finally { this.notifying = previous; }
    }
    subscribe(observer: EditorObserver, origin?: object) {
        this.mutable();
        if (!this.stop) {
            this.stamp = this.client.engine.stamp();
            this.stop = subscribeClient(this.client, {
                beforeEvent: event => {
                    // This is an acknowledgement of an already-applied local edit.
                    // Native paths still belong to the old projection until update.
                    if (event.type === "change" && event.envelope.change?.actor === this.client.actor) return;
                    this.emit("beforeEvent", item => item.beforeEvent?.(event));
                },
                modelEvents: (edits, info) => {
                    this.stamp = this.client.engine.stamp();
                    const origin = this.origin; this.origin = undefined;
                    try { this.emit("modelEvents", item => item.modelEvents?.(edits, info)); } finally { this.origin = origin; }
                },
                update: () => {
                    const next = this.client.engine.stamp();
                    if (next.generation !== this.stamp.generation || next.revision !== this.stamp.revision) {
                        this.stamp = next;
                        // SyncClient.commit has no local model-event payload. Invalidate honestly.
                        this.emit("modelEvents", item => item.modelEvents?.([], {cause: "local", fallback: true}));
                    }
                    this.emit("update", item => item.update?.());
                },
            });
        }
        const entry = {observer, origin}; this.entries.add(entry);
        return () => {
            this.entries.delete(entry);
            if (!this.entries.size) { this.stop?.(); this.stop = null; }
        };
    }
    scoped<T>(origin: object, run: () => T): T {
        this.mutable(); const prior = this.origin; this.origin = origin;
        try { return run(); } finally { this.origin = prior; }
    }
    apply(origin: object, run: () => Op[] | null): Op[] | null {
        this.mutable();
        if (this.pending && this.pending.origin !== origin) throw new Error("Commit pending operations before changing origin");
        const ops = run();
        if (ops?.length) {
            this.pending ??= {origin, ops: []}; this.pending.ops.push(...ops);
        }
        return ops;
    }
    commit(origin: object, ops: Op[], run: () => void) {
        this.mutable();
        const pending = this.pending;
        if (pending ? pending.origin !== origin || pending.ops.length !== ops.length || pending.ops.some((op, at) => op !== ops[at]) : ops.length > 0) {
            throw new Error("Commit requires this host's pending operations in order");
        }
        this.client.assertLocalEditing();
        this.scoped(origin, () => {
            // Clear before callbacks, including a synchronous transport acknowledgement.
            this.pending = null; run();
        });
    }
}
function bridge(client: SyncClient) {
    let value = bridges.get(client);
    if (!value) { value = new SyncBridge(client); bridges.set(client, value); }
    return value;
}

export function clientOwner(client: BindingClient): LocalClient | SyncClient {
    return client instanceof Client ? clientBackends.get(client)! : client;
}
export function isBindingClient(value: unknown): value is BindingClient {
    return value instanceof Client || value instanceof LocalClient || value instanceof SyncClient;
}

/** Create a distinct view origin. Disposing a view only removes its subscription. */
export function createEditorHost(client: BindingClient, options: {input?: SyncClientEditorInput} = {}): EditorHost {
    const owner = clientOwner(client);
    if (owner instanceof LocalClient) {
        if (options.input) throw new Error("Sync input is unavailable in local mode");
        return createLocalEditorHost(owner);
    }
    const base = createSyncClientEditorHost(owner, options), state = bridge(owner), origin = {};
    const session = (input: EditorSession): EditorSession => ({
        ...input,
        get active() { return input.active; },
        begin: () => { state.settled(); state.scoped(origin, () => input.begin()); },
        apply: edits => input.active ? state.scoped(origin, () => input.apply(edits)) : state.apply(origin, () => input.apply(edits))!,
        applyModelEdits: (before, edits) => input.active ? state.scoped(origin, () => input.applyModelEdits(before, edits)) : state.apply(origin, () => input.applyModelEdits(before, edits))!,
        deleteRange: (from, to) => input.active ? state.scoped(origin, () => input.deleteRange(from, to)) : state.apply(origin, () => input.deleteRange(from, to)),
        commit: (ops, record) => input.active ? state.scoped(origin, () => input.commit(ops, record)) : state.commit(origin, ops, () => input.commit(ops, record)),
        end: () => { if (input.active) state.settled(); return state.scoped(origin, () => input.end()); },
        cancel: () => state.scoped(origin, () => input.cancel()),
    });
    return {
        ...base,
        get actor() { return base.actor; }, get schema() { return base.schema; },
        apply: edits => state.apply(origin, () => base.apply(edits))!,
        applyModelEdits: (before, edits) => state.apply(origin, () => base.applyModelEdits(before, edits))!,
        deleteRange: (from, to) => state.apply(origin, () => base.deleteRange(from, to)),
        commit: (ops, record) => state.commit(origin, ops, () => base.commit(ops, record)),
        undo: () => { state.settled(); return base.undo(); },
        redo: () => { state.settled(); return base.redo(); },
        createSession: () => session(base.createSession()),
        subscribe: observer => state.subscribe(observer, origin),
    };
}

/** A fixed local or sync document. Omitting transport creates only a LocalClient. */
export class Client {
    readonly #backend: LocalClient | SyncClient;
    get mode(): "local" | "sync" { return this.#backend instanceof LocalClient ? "local" : "sync"; }
    private readonly host: EditorHost;
    constructor(options: ClientOptions) {
        if (Object.hasOwn(options, "engineFactory")) throw new Error("Put engineFactory in syncOptions with a transport");
        if (options.syncOptions && Object.keys(options.syncOptions).some(key => !["engineFactory", "ackDelay", "beforeSend"].includes(key))) throw new Error("Unsupported syncOptions");
        if (options.transport !== undefined) {
            if (!options.transport || typeof options.transport.subscribe !== "function" || typeof options.transport.send !== "function" || typeof options.transport.sendPresence !== "function") throw new Error("Invalid transport");
            if (typeof options.actor !== "string" || !/^[\w~-]+$/.test(options.actor) || options.actor === "~root") throw new Error("Sync mode requires a valid actor");
            this.#backend = new SyncClient(options.actor, options.transport, {...options.syncOptions, schema: options.schema});
        } else {
            if (options.syncOptions !== undefined) throw new Error("syncOptions require a transport");
            this.#backend = new LocalClient({schema: options.schema, actor: options.actor});
        }
        clientBackends.set(this, this.#backend);
        this.host = createEditorHost(this.#backend);
    }
    get actor() { return this.#backend.actor; }
    get schema() { return this.#backend.schema; }
    get sync(): SyncClient | null { return this.#backend instanceof SyncClient ? this.#backend : null; }
    get notificationErrors() { return this.#backend instanceof LocalClient ? this.#backend.notificationErrors : bridge(this.#backend).errors.slice(); }
    model() { return this.host.model().model; }
    stamp() { return this.host.stamp(); }
    edit(edits: EditOp[], record?: RecordOptions | null): Op[] {
        if (this.#backend instanceof LocalClient) return this.#backend.edit(edits, record);
        const ops = this.host.apply(edits); this.host.commit(ops, record); return ops;
    }
    historyStatus() { return this.host.historyStatus(); }
    undo() { return this.host.undo(); }
    redo() { return this.host.redo(); }
    clearHistory() {
        if (this.#backend instanceof SyncClient) bridge(this.#backend).settled();
        this.#backend.clearHistory();
        if (this.#backend instanceof SyncClient) bridge(this.#backend).emit("update", observer => observer.update?.());
    }
    captureAnchor(path: ModelPath) { return this.host.captureAnchor(path); }
    locateAnchor(key: string, visibility: "visible" | "retained" = "visible") { return this.host.locateAnchor(key, visibility); }
    captureSelection(range: EngineSelection | null): EngineAnchoredSelection | null {
        if (!range) return null;
        const anchor = this.captureAnchor(range.anchor), focus = this.captureAnchor(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
    resolveSelection(range: EngineAnchoredSelection | null): EngineSelection | null {
        if (!range) return null;
        const anchor = this.locateAnchor(range.anchor), focus = this.locateAnchor(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
    subscribe(observer: EditorObserver): () => void {
        return this.#backend instanceof LocalClient ? this.#backend.subscribe(observer) : bridge(this.#backend).subscribe(observer);
    }
    status() { return this.host.status(); }
    get online() { return this.status().online; }
    get synchronized() { return this.status().synchronized; }
    get capabilities() { return {sync: this.mode === "sync", presence: this.mode === "sync"}; }
    connect() { if (this.sync) { bridge(this.sync).settled(); this.sync.connect(); } }
    disconnect() { if (this.sync) { bridge(this.sync).mutable(); this.sync.disconnect(); } }
    presence(): Iterable<Presence> { return this.host.presence(); }
    setPresence(value: Omit<Presence, "actor">) { this.host.setPresence(value); }
    dispose() {
        if (this.sync) bridge(this.sync).settled();
        this.#backend.dispose();
        if (this.sync) bridge(this.sync).dispose();
    }
}
