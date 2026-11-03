import {assertDataSchema, createDataAccess} from "../data/access.ts";
import type {DataValidator, SharedData} from "../data/access.ts";
export type {ActorProfile, ResolvedActorProfile, ProfileJSON} from "./profile.ts";
import type {ActorProfile} from "./profile.ts";
import type {Op, Snapshot} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {EngineSelection, EngineAnchoredSelection} from "../engine/contract.ts";
import type {EditorHost, EditorObserver, EditorStamp} from "../editor/host-contract.ts";
import {createSyncClientEditorHost} from "../editor/sync-client-host.ts";
import type {SyncClientEditorInput} from "../editor/sync-client-host.ts";
import {subscribeClient} from "../editor/index.ts";
import {LocalClient} from "../local/client.ts";
import type {LocalClientState} from "../local/state.ts";
export type {LocalClientState} from "../local/state.ts";
import {createLocalEditorHost} from "../local/editor-host.ts";
import {SyncClient} from "../sync/client.ts";
import type {ClientOptions as SyncOptions} from "../sync/client.ts";
import {ClientDataPolicy} from "./data-policy.ts";
import {overrideEditorView, wrapEditorSession} from "./editor-session.ts";
import type {Presence, PresenceInput, ServerEvent, Transport} from "../sync/protocol.ts";

export interface ClientOptions {
    schema: Schema;
    /** Application policy for writes through client.data. Remote writes need server admission. */
    data?: {validate?: DataValidator};
    actor?: string;
    profile?: ActorProfile;
    transport?: Transport;
    syncOptions?: Omit<SyncOptions, "schema" | "profile">;
}
export type BindingClient = Client | LocalClient | SyncClient;
export interface ClientNotificationError {readonly phase: keyof EditorObserver; readonly message: string}
const syncOptionKeys: readonly string[] = Object.freeze(["engineFactory", "ackDelay", "beforeSend"]);
type ModelEventInfo = Parameters<NonNullable<EditorObserver["modelEvents"]>>[1];
type Entry = {observer: EditorObserver; origin?: object};
const bridges = new WeakMap<SyncClient, SyncBridge>();
const clientBackends = new WeakMap<Client, LocalClient | SyncClient>();
const restoredLocal = Symbol("restored local backend");
type InternalClientOptions = ClientOptions & {[restoredLocal]?: LocalClient};

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
    emit(phase: "beforeEvent", event: ServerEvent): void;
    emit(phase: "modelEvents", edits: readonly EditOp[], info: ModelEventInfo): void;
    emit(phase: "fallbackModelEvents"): void;
    emit(phase: "update"): void;
    emit(phase: keyof EditorObserver | "fallbackModelEvents", payload?: ServerEvent | readonly EditOp[], info?: ModelEventInfo) {
        const previous = this.notifying; this.notifying = phase !== "beforeEvent" || previous;
        try {
            for (const entry of [...this.entries]) {
                if (!this.entries.has(entry) || phase !== "beforeEvent" && this.origin && entry.origin === this.origin) continue;
                try {
                    const observer = entry.observer;
                    if (phase === "beforeEvent") observer.beforeEvent?.(payload as ServerEvent);
                    else if (phase === "fallbackModelEvents") observer.modelEvents?.([], {cause: "local", fallback: true});
                    else if (phase === "modelEvents") observer.modelEvents?.(payload as readonly EditOp[], info!);
                    else observer.update?.();
                } catch (error) {
                    this.errors.push(Object.freeze({phase: phase === "fallbackModelEvents" ? "modelEvents" : phase, message: error instanceof Error ? error.message : String(error)}));
                    if (this.errors.length > 100) this.errors.shift();
                }
            }
        } finally { this.notifying = previous; }
    }
    // Stable callbacks for the whole backend, including unsubscribe/resubscribe.
    private readonly observer: EditorObserver = {
        beforeEvent: event => {
            // Local echoes already changed the model. Native selection still uses
            // the old projection until update, so do not recapture it here.
            if (event.type === "change" && event.envelope.change?.actor === this.client.actor) return;
            this.emit("beforeEvent", event);
        },
        modelEvents: (edits, info) => {
            this.stamp = this.client.engine.stamp();
            const origin = this.origin; this.origin = undefined;
            try { this.emit("modelEvents", edits, info); } finally { this.origin = origin; }
        },
        update: () => {
            const next = this.client.engine.stamp();
            if (next.generation !== this.stamp.generation || next.revision !== this.stamp.revision) {
                this.stamp = next;
                // Each observer owns its fallback array and metadata.
                this.emit("fallbackModelEvents");
            }
            this.emit("update");
        },
    };
    subscribe(observer: EditorObserver, origin?: object) {
        this.mutable();
        if (!this.stop) {
            this.stamp = this.client.engine.stamp();
            this.stop = subscribeClient(this.client, this.observer);
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
    return overrideEditorView(base, {
        get actor() { return base.actor; }, get schema() { return base.schema; },
        apply: edits => state.apply(origin, () => base.apply(edits))!,
        applyModelEdits: (before, edits) => state.apply(origin, () => base.applyModelEdits(before, edits))!,
        deleteRange: (from, to) => state.apply(origin, () => base.deleteRange(from, to)),
        commit: (ops, record) => state.commit(origin, ops, () => base.commit(ops, record)),
        undo: () => { state.settled(); return base.undo(); },
        redo: () => { state.settled(); return base.redo(); },
        createSession: () => wrapEditorSession(base.createSession(), state, origin),
        subscribe: observer => state.subscribe(observer, origin),
    });
}

/** A fixed local or sync document. Omitting transport creates only a LocalClient. */
export class Client {
    readonly #backend: LocalClient | SyncClient;
    readonly #dataValidator?: DataValidator;
    #dataAccess?: SharedData;
    #dataPolicy?: ClientDataPolicy;
    #assertDataMutationAllowed() { this.#dataPolicy?.assertMutable(); }
    get data(): SharedData {
        assertDataSchema(this);
        if (!this.#dataAccess) {
            const policy = this.#dataPolicy ??= new ClientDataPolicy(this.#dataValidator, this);
            this.#dataAccess = createDataAccess(this, policy.validate, policy.assertMutable);
        }
        return this.#dataAccess;
    }
    get mode(): "local" | "sync" { return this.#backend instanceof LocalClient ? "local" : "sync"; }
    private readonly host: EditorHost;
    constructor(options: ClientOptions) {
        const restored = (options as InternalClientOptions)[restoredLocal];
        if (options.data?.validate !== undefined && typeof options.data.validate !== "function") throw new Error("Data: validate must be a function");
        this.#dataValidator = options.data?.validate;
        if (Object.hasOwn(options, "engineFactory")) throw new Error("Put engineFactory in syncOptions with a transport");
        if (options.syncOptions && Object.keys(options.syncOptions).some(key => !syncOptionKeys.includes(key))) throw new Error("Unsupported syncOptions");
        if (restored) this.#backend = restored;
        else if (options.transport !== undefined) {
            if (!options.transport || typeof options.transport.subscribe !== "function" || typeof options.transport.send !== "function" || typeof options.transport.sendPresence !== "function") throw new Error("Invalid transport");
            if (typeof options.actor !== "string" || !/^[\w~-]+$/.test(options.actor) || options.actor === "~root") throw new Error("Sync mode requires a valid actor");
            this.#backend = new SyncClient(options.actor, options.transport, {...options.syncOptions, schema: options.schema, profile: options.profile});
        } else {
            if (options.syncOptions !== undefined) throw new Error("syncOptions require a transport");
            this.#backend = new LocalClient({schema: options.schema, actor: options.actor, profile: options.profile});
        }
        clientBackends.set(this, this.#backend);
        this.host = createEditorHost(this.#backend);
    }
    static fromState(state: unknown, options: {schema: Schema; profile?: ActorProfile; data?: ClientOptions["data"]}): Client {
        const backend = LocalClient.fromState(state, options);
        try {
            const internal: InternalClientOptions = {schema: backend.schema, data: options.data, [restoredLocal]: backend};
            return new Client(internal);
        } catch (error) { backend.dispose(); throw error; }
    }
    captureState(): LocalClientState {
        if (!(this.#backend instanceof LocalClient)) throw new Error("Local state capture requires local mode; use SyncClient.captureState with its recovery proof in sync mode");
        return this.#backend.captureState();
    }
    get profile() { return this.#backend.profile; }
    get actor() { return this.#backend.actor; }
    get schema() { return this.#backend.schema; }
    get sync(): SyncClient | null { return this.#backend instanceof SyncClient ? this.#backend : null; }
    get notificationErrors() { return this.#backend instanceof LocalClient ? this.#backend.notificationErrors : bridge(this.#backend).errors.slice(); }
    model() { return this.host.model().model; }
    /** Detached document storage, including retained hidden nodes. Safe during read notifications. */
    snapshot(): Snapshot {
        return this.#backend instanceof LocalClient ? this.#backend.snapshot() : structuredClone(this.#backend.engine.snapshot());
    }
    stamp() { return this.host.stamp(); }
    /** Raw schema edits bypass the optional client.data application policy. */
    edit(edits: EditOp[], record?: RecordOptions | null): Op[] {
        this.#assertDataMutationAllowed();
        if (this.#backend instanceof LocalClient) return this.#backend.edit(edits, record);
        const ops = this.host.apply(edits); this.host.commit(ops, record); return ops;
    }
    historyStatus() { return this.host.historyStatus(); }
    undo() { this.#assertDataMutationAllowed(); return this.host.undo(); }
    redo() { this.#assertDataMutationAllowed(); return this.host.redo(); }
    clearHistory() {
        this.#assertDataMutationAllowed();
        if (this.#backend instanceof SyncClient) bridge(this.#backend).settled();
        this.#backend.clearHistory();
        if (this.#backend instanceof SyncClient) bridge(this.#backend).emit("update");
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
    connect() { this.#assertDataMutationAllowed(); if (this.sync) { bridge(this.sync).settled(); this.sync.connect(); } }
    disconnect() { this.#assertDataMutationAllowed(); if (this.sync) { bridge(this.sync).mutable(); this.sync.disconnect(); } }
    presence(): Iterable<Presence> { return this.host.presence(); }
    setPresence(value: PresenceInput) { this.host.setPresence(value); }
    dispose() {
        this.#assertDataMutationAllowed();
        if (this.sync) bridge(this.sync).settled();
        this.#backend.dispose();
        if (this.sync) bridge(this.sync).dispose();
    }
}
