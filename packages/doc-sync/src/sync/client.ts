import {resolveActorProfile} from "../client/profile.ts";
import type {ActorProfile, ResolvedActorProfile} from "../client/profile.ts";
import {keyOf} from "../crdt/ticket.ts";
import type {Doc} from "../crdt/doc.ts";
import type {History, HistorySnapshot} from "../crdt/history.ts";
import {assertCompatibleSchema, schemaVersion} from "../crdt/schema-version.ts";
import type {Op, Snapshot} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import {typescriptClientEngineFactory} from "../engine/typescript-client.ts";
import {ENGINE_CONTRACT_VERSION} from "../engine/contract.ts";
import type {EngineCheckpoint} from "../engine/contract.ts";
import type {ClientEngine, ClientEngineFactory, EnginePreparedDocument, EngineEventCapture, TypeScriptClientCompatibility} from "../engine/client-contract.ts";
import {CONTAINER_CAPABILITY, DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "./protocol.ts";
import type {Change, Envelope, Outbound, Presence, PresenceInput, ServerEvent, Transport} from "./protocol.ts";

const REQUIRED_CLIENT_ENGINE_METHODS = /* @__PURE__ */ Object.freeze(["identity", "schema", "requireCapabilities", "setEditHooks", "assertEditing", "stamp", "model", "apply", "applyModelEdits", "deleteRange", "captureAnchor", "locateAnchor", "record", "receive", "emitLocal", "check", "undo", "redo", "historyStatus", "clearHistory", "historyDeletionKeys", "historyPin", "compact", "snapshot", "allocationFloor", "prepareSnapshot", "replayPrepared", "compilePrepared", "installPrepared", "checkpoint", "prepareCheckpoint", "installCheckpoint", "previewSchema", "upgradeSchema", "reset", "beginEvents", "finishEvents", "createSession", "dispose"] as const);

/**
 * 참여자 하나. 문서·되돌리기·서버 연결을 묶는다.
 *
 * 내 편집은 바로 내 문서에 적용하고(기다리지 않는다), Change 로 만들어 서버에 보낸다. 서버가 그 Change 를
 * 다시 퍼뜨려 오면 "받았다"는 확인으로만 쓰고 다시 적용하지 않는다. 남의 Change 는 받는 대로 적용한다.
 * CRDT 연산은 순서를 바꿔 적용해도 결과가 같으므로 되감기(rebase)가 필요 없다.
 *
 * 끊긴 동안의 편집은 쌓아 두었다가 다시 이어지면 보낸다. 서버가 (actor, seq) 로 중복을 걸러 주므로 다시 보내도 안전하다.
 *
 * 받은 만큼은 ack 로 알린다. ack 는 Change 와 같은 줄에 서서 순서대로 나간다 — GC 의 안전이 이 순서에 기댄다
 * (protocol.ts 의 Ack 설명).
 */
export type ClientOptions = {
    profile?: ActorProfile;
    /** 문서 스키마 — 바깥에서 주입한다. 블록 종류·속성·서식을 정한다 (schema.ts) */
    schema: Schema;
    /** Authoritative production engine. The immutable draft factory is not compatible. */
    engineFactory?: ClientEngineFactory;
    /** 받은 뒤 ack 를 보내기까지 기다리는 시간 (ms). 0 이면 바로 */
    ackDelay?: number;
    /** Persist the current checkpoint before a change or acknowledgement can leave this client. */
    beforeSend?: () => void;
};

/** 모델 이벤트가 생긴 까닭 */
export type EventCause = "remote" | "undo" | "redo" | "snapshot" | "reset";
type LocalEditsListener = (edits: EditOp[], normalize: EditOp[]) => void;

export type ConditionalBase = {epoch: string; serverSeq: number; schemaVersion: string | null};
export type ConditionalReply = {status: "accepted"; serverSeq: number} | {status: "rejected"; code: string; error: string};
export type ConditionalSender = (base: ConditionalBase, change: Change) => Promise<ConditionalReply>;
/** Local state only. Restoring it does not prove server generation or GC safety. */
export type ClientCheckpoint = {
    format: 1; actor: string; schemaVersion: string; snapshot: Snapshot;
    history: ReturnType<History["snapshot"]>; seq: number; serverSeq: number;
    gcFrontier: number; delSeq: Array<[string, number]>; pending: Change[];
};
/** Backend-neutral local state. The tagged engine payload is stored exactly once. */
export type ClientStateCheckpoint = {
    format: 2; actor: string; schemaVersion: string; engine: EngineCheckpoint;
    seq: number; serverSeq: number; gcFrontier: number; delSeq: Array<[string, number]>; pending: Change[];
};
type ClientStateMetadata = Omit<ClientStateCheckpoint, "format" | "engine">;
type ConditionalAttempt = {
    base: ConditionalBase; change: Change; edits: EditOp[]; snapshot: string;
    events: Array<{event: ServerEvent; connection: number}>; reconnect: boolean; attempting: boolean; priorGuard: (() => void) | null; wasUnconfirmed: boolean;
};

function freezeOwnedSchema(value: unknown): void {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(freezeOwnedSchema);
        Object.freeze(value);
    }
}

function ownedSchema(input: Schema): Schema {
    // Inspect the original before cloning: structuredClone would invoke getters.
    schemaVersion(input);
    const result = structuredClone(input);
    schemaVersion(result);
    freezeOwnedSchema(result);
    return result;
}

function validHelloCounters(value: unknown): boolean {
    return Array.isArray(value) && value.every(entry =>
        Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && Number.isSafeInteger(entry[1]) && entry[1] >= 0);
}

export class SyncClient {
    readonly engine: ClientEngine;
    readonly engineFactory: ClientEngineFactory;
    private compatibility(): TypeScriptClientCompatibility {
        const engine = this.engine as ClientEngine & Partial<TypeScriptClientCompatibility>;
        if (typeof engine.typescriptDocument !== "function" || typeof engine.typescriptHistory !== "function" ||
            typeof engine.replaceTypeScriptDocument !== "function" || typeof engine.replaceTypeScriptHistory !== "function") {
            throw new Error("Selected engine does not provide TypeScript compatibility");
        }
        return engine as ClientEngine & TypeScriptClientCompatibility;
    }
    get doc(): Doc { return this.compatibility().typescriptDocument(); }
    set doc(doc: Doc) { this.compatibility().replaceTypeScriptDocument(doc); this.attach(); }
    get history(): History { return this.compatibility().typescriptHistory(); }
    set history(history: History) { this.compatibility().replaceTypeScriptHistory(history); }
    historyStatus() { return this.engine.historyStatus(); }
    previewSchema(next: Schema): NodeJSON { return this.engine.previewSchema(next); }
    readonly actor: string;
    readonly profile: ResolvedActorProfile;
    online = false;
    /** Set when the server cannot safely process this client version. Pending edits are retained. */
    connectionError: Error | null = null;
    /** Identifies the server document generation. Restart/reset changes it. */
    epoch: string | undefined;
    private ready = false;
    /** True only after the current connection has processed a compatible hello. */
    get synchronized(): boolean { return this.online && this.ready && !this.connectionError; }
    private forceSnapshot = false;
    private recoveryHistoryGuards = 0;
    private localMutationPauses = 0;
    private checkpointFailed = false;
    private disposed = false;
    /** Persist synchronous state changes, including disconnected edits. A failure stops the connection. */
    onCheckpoint: (() => void) | null = null;

    private assertLocalMutation(): void {
        if (this.disposed) throw new Error("Client is disposed");
        if (this.localMutationPauses) throw new Error("Local changes are paused until recovery completes");
    }

    /** Check editor draft/lifecycle mutations without invoking document-specific guards twice. */
    assertLocalEditing(): void {
        this.assertLocalMutation();
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before another edit");
    }

    /** Hold all local edit entry points while a disconnected recovery operation is unresolved. */
    pauseLocalMutations(): () => void {
        if (this.online || this.conditional) throw new Error("Pausing local changes requires a disconnected client without a conditional request");
        this.localMutationPauses += 1;
        let active = true;
        return () => { if (active) { active = false; this.localMutationPauses -= 1; } };
    }

    private persistCheckpoint(invoke: (() => void) | null | undefined): void {
        try { invoke?.(); }
        catch (error) {
            this.connectionError = error instanceof Error ? error : new Error(String(error));
            if (!this.checkpointFailed) { this.checkpointFailed = true; this.localMutationPauses += 1; }
            // Do not notify here: a notification would call the failed persistence hook again.
            this.online = false; this.ready = false; this.schemaVerified = false;
            this.connection += 1;
            this.unsubscribe?.(); this.unsubscribe = null;
            throw error;
        }
    }

    /** Keep protected live undo history until its recovery controller is released. */
    protectRecoveryHistory(): () => void {
        this.recoveryHistoryGuards += 1;
        let active = true;
        return () => { if (active) { active = false; this.recoveryHistoryGuards -= 1; } };
    }

    private get hasProtectedLocalState(): boolean {
        return this.pending.length > 0 || this.recoveryHistoryGuards > 0;
    }
    private connection = 0;
    serverSeq = 0;
    /** 아직 서버에서 돌아오지 않은 내 변경 (다시 이어지면 다시 보낸다) */
    pending: Change[] = [];
    others = new Map<string, Presence>();
    /** 마지막으로 따른 GC 기준점 */
    gcFrontier = 0;
    /** 문서·연결 상태가 바뀔 때마다 */
    onUpdate: (() => void) | null = null;
    /** 서버 이벤트를 그대로 엿보고 싶을 때 (데모의 서버 로그 같은) */
    onEvent: ((event: ServerEvent) => void) | null = null;
    /**
     * 받는 쪽 이벤트 — 남의 변경·되돌리기·스냅숏으로 모델이 바뀌면, 앞 모델을 뒤 모델로 바꾸는 편집 연산들.
     * 편집기(스키마 기반 문서 에디터 같은)는 이것을 자기 모델에 적용하면 이 문서와 같아진다. 내보내기 전에 앞 모델에 적용해 검산하고,
     * 맞지 않으면 문서 전체를 바꾸는 연산으로 물러선다 (fallback).
     */
    onModelEvents: ((events: EditOp[], info: {cause: EventCause; fallback: boolean}) => void) | null = null;
    /** 내 편집 연산과, 편집기가 맞춰야 할 차이 (Doc.edit 의 normalize) */
    private localEdits: LocalEditsListener | null = null;

    get onLocalEdits(): LocalEditsListener | null {
        return this.localEdits;
    }

    set onLocalEdits(listener: LocalEditsListener | null) {
        this.localEdits = listener;
        this.attach();
    }

    /** 받는 쪽 이벤트 통계 — 바뀐 횟수·연산 수·물러선 횟수 */
    readonly eventStats = {changes: 0, events: 0, fallbacks: 0};

    /** 지우기 연산 이름표 → 서버 번호. GC 와 되돌리기 핀에 쓴다 */
    private readonly delSeq = new Map<string, number>();
    private outbox: Outbound[] = [];
    private seq = 0;
    private unsubscribe: (() => void) | null = null;
    private sending = false;
    private ackTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly transport: Transport;
    private readonly ackDelay: number;
    private readonly beforeSend: (() => void) | undefined;
    private currentSchema: Schema;
    get schema(): Schema { return this.engine?.schema() ?? this.currentSchema; }
    /** False for an explicitly schema-free server. */
    schemaVerified = false;
    private conditional: ConditionalAttempt | null = null;
    private installingConditional = false;
    private finalizingConditional = false;
    /** Notification failures during accepted conditional finalization. Oldest entries are discarded after 100. */
    readonly notificationErrors: Array<{callback: string; message: string}> = [];
    onNotificationError: ((error: unknown, callback: string) => void) | null = null;

    private notify(callback: string, invoke: () => void): void {
        if (callback === "onUpdate") this.persistCheckpoint(this.onCheckpoint);
        if (!this.finalizingConditional) { invoke(); return; }
        try { invoke(); }
        catch (error) {
            this.notificationErrors.push({callback, message: error instanceof Error ? error.message : String(error)});
            if (this.notificationErrors.length > 100) this.notificationErrors.shift();
            try { this.onNotificationError?.(error, callback); } catch { /* A reporting callback must not interrupt finalization. */ }
        }
    }

    /** A conditional request with an unknown outcome must be retried with the same payload. */
    get conditionalPending(): boolean { return this.conditional !== null; }
    /** A copy of the unresolved request, for inspection and recovery after an epoch change. */
    get conditionalRequest(): {base: ConditionalBase; change: Change} | null {
        return this.conditional ? structuredClone({base: this.conditional.base, change: this.conditional.change}) : null;
    }
    /** Snapshot and model edits prepared before sending, for durable recovery evidence. */
    get conditionalEvidence(): {base: ConditionalBase; change: Change; edits: EditOp[]; snapshot: Snapshot; schema: Schema} | null {
        const attempt = this.conditional;
        return attempt ? structuredClone({base: attempt.base, change: attempt.change, edits: attempt.edits,
            snapshot: JSON.parse(attempt.snapshot) as Snapshot, schema: this.schema}) : null;
    }

    constructor(actor: string, transport: Transport, options: ClientOptions) {
        this.actor = actor;
        this.profile = resolveActorProfile(actor, options.profile);
        this.transport = transport;
        this.currentSchema = ownedSchema(options.schema);
        this.ackDelay = options.ackDelay ?? 0;
        this.beforeSend = options.beforeSend;
        this.engineFactory = options.engineFactory ?? typescriptClientEngineFactory;
        if (!this.engineFactory || this.engineFactory.contractVersion !== ENGINE_CONTRACT_VERSION || typeof this.engineFactory.create !== "function") throw new Error("Incompatible client engine factory");
        this.engine = this.engineFactory.create(actor, this.schema);
        try {
        if (!this.engine || REQUIRED_CLIENT_ENGINE_METHODS.some(method => typeof this.engine[method] !== "function")) throw new Error("Incompatible production client engine");
        const identity = this.engine.identity();
        if (identity.engine !== this.engineFactory.engine || identity.contractVersion !== ENGINE_CONTRACT_VERSION || identity.actor !== actor || identity.schemaVersion !== schemaVersion(this.schema)) throw new Error("Client engine identity mismatch");
        this.engine.requireCapabilities(["edit", "receive", "history", "anchors", "checkpoint", "composition", "events", "gc", "schema-transition"]);
        this.attach();
        } catch (error) { try { this.engine?.dispose?.(); } catch { /* Preserve the validation failure. */ } throw error; }
    }

    /** 문서를 갈아 끼울 때마다 내 편집 알림을 잇는다 */
    private attach(): void {
        this.engine.setEditHooks({guard: () => {
            this.assertLocalMutation();
            if (this.conditional && !this.installingConditional) throw new Error("A conditional edit is unresolved; retry it before changing the document");
        }, listener: this.localEdits ? (edits, normalize) => {
            const installing = this.installingConditional;
            this.installingConditional = false;
            try { this.notify("onLocalEdits", () => this.localEdits?.(edits, normalize)); }
            finally { this.installingConditional = installing; }
        } : null});
    }

    private withEvents<T>(cause: EventCause, fn: (capture?: EngineEventCapture) => T, ops?: Op[]): T {
        if (!this.onModelEvents) return fn();
        const capture = this.engine.beginEvents(ops);
        const result = fn(capture);
        const {events, fallback} = this.engine.finishEvents(capture);
        if (events.length) {
            this.eventStats.changes += 1; this.eventStats.events += events.length;
            if (fallback) this.eventStats.fallbacks += 1;
            this.notify("onModelEvents", () => this.onModelEvents?.(events, {cause, fallback}));
        }
        return result;
    }

    readonly seqOf = (delKey: string): number | undefined => this.delSeq.get(delKey);

    /** Capture a single synchronous replica state. Persisting it requires a separate durable boundary. */
    checkpoint(): ClientCheckpoint {
        if (this.conditional) throw new Error("An unresolved conditional request needs its own recovery evidence");
        const state = this.engine.checkpoint();
        if (state.format !== "doc-sync-typescript-checkpoint-v1") throw new Error("Legacy format-1 client checkpoint requires a TypeScript engine payload");
        return structuredClone({format: 1 as const, actor: this.actor, schemaVersion: schemaVersion(this.schema),
            snapshot: state.document as Snapshot, history: state.history as HistorySnapshot, seq: this.seq, serverSeq: this.serverSeq,
            gcFrontier: this.gcFrontier, delSeq: [...this.delSeq], pending: this.pending});
    }

    /** Resume a live replica only after its caller proves the exact pending changes and GC protection. */
    resumeProvenEpoch(expected: ClientCheckpoint, oldEpoch: string, newEpoch: string): void {
        if (this.online || this.conditional || !oldEpoch || !newEpoch || this.epoch !== oldEpoch ||
            JSON.stringify(this.checkpoint()) !== JSON.stringify(expected)) {
            throw new Error("Local recovery state changed; retry recovery before reconnecting");
        }
        this.epoch = newEpoch;
        this.forceSnapshot = true;
        this.connectionError = null;
    }

    /** Capture engine-private state without assuming TypeScript document or History layout. */
    captureState(): ClientStateCheckpoint {
        if (this.conditional) throw new Error("An unresolved conditional request needs its own recovery evidence");
        const engine = this.engine.checkpoint();
        this.assertCheckpointIdentity(engine);
        return structuredClone({format: 2 as const, actor: this.actor, schemaVersion: schemaVersion(this.schema), engine,
            seq: this.seq, serverSeq: this.serverSeq, gcFrontier: this.gcFrontier, delSeq: [...this.delSeq], pending: this.pending});
    }

    private assertCheckpointIdentity(checkpoint: EngineCheckpoint): void {
        const selected = this.engine.identity(), identity = checkpoint?.identity;
        if (!checkpoint || typeof checkpoint.format !== "string" || !checkpoint.format || !identity ||
            identity.engine !== selected.engine || identity.contractVersion !== selected.contractVersion ||
            identity.actor !== this.actor || identity.schemaVersion !== schemaVersion(this.schema)) throw new Error("Incompatible tagged engine checkpoint");
    }

    private prepareMetadata(value: ClientStateMetadata, epoch: string): {delSeq: Map<string, number>; pending: Change[]} {
        if (!value || value.actor !== this.actor || value.schemaVersion !== schemaVersion(this.schema) ||
            typeof epoch !== "string" || !epoch || !Number.isSafeInteger(value.seq) || value.seq < 0 ||
            !Number.isSafeInteger(value.serverSeq) || value.serverSeq < 0 || !Number.isSafeInteger(value.gcFrontier) ||
            value.gcFrontier < 0 || value.gcFrontier > value.serverSeq || !Array.isArray(value.delSeq) || !Array.isArray(value.pending)) throw new Error("Invalid client checkpoint");
        const delSeq = new Map<string, number>();
        for (const pair of value.delSeq) {
            if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || !pair[0] ||
                !Number.isSafeInteger(pair[1]) || pair[1] < 1 || pair[1] > value.serverSeq || delSeq.has(pair[0])) throw new Error("Invalid checkpoint deletion sequence");
            delSeq.set(pair[0], pair[1]);
        }
        let priorSeq = 0;
        for (const change of value.pending) {
            if (!change || change.actor !== this.actor || !Number.isSafeInteger(change.seq) || change.seq < 1 || (priorSeq > 0 && change.seq !== priorSeq + 1) ||
                change.seq > value.seq || !Array.isArray(change.ops) || !change.ops.length) throw new Error("Invalid checkpoint pending changes");
            priorSeq = change.seq;
        }
        if (priorSeq && priorSeq !== value.seq) throw new Error("Invalid checkpoint pending sequence");
        return {delSeq, pending: structuredClone(value.pending)};
    }

    private installMetadata(value: ClientStateMetadata, metadata: ReturnType<SyncClient["prepareMetadata"]>, epoch: string): void {
        this.seq = value.seq; this.serverSeq = value.serverSeq;
        this.forceSnapshot = true;
        this.gcFrontier = value.gcFrontier;
        this.delSeq.clear(); for (const [key, seq] of metadata.delSeq) this.delSeq.set(key, seq);
        this.pending = metadata.pending; this.epoch = epoch; this.connectionError = null;
    }

    /** Restore only after the caller proves matching generation, schema and GC protection. */
    restoreCheckpoint(value: ClientCheckpoint, epoch: string): void {
        if (this.online || this.conditional || this.pending.length) throw new Error("Restore requires a disconnected, settled client");
        if (!value || value.format !== 1) throw new Error("Invalid client checkpoint");
        const metadata = this.prepareMetadata(value, epoch);
        const prepared = this.engine.prepareCheckpoint({format: "doc-sync-typescript-checkpoint-v1", identity: this.engine.identity(), revision: 0,
            document: value.snapshot, history: value.history});
        this.engine.installCheckpoint(prepared);
        this.installMetadata(value, metadata, epoch);
    }

    /** Restore a tagged engine payload after the same external recovery proof as format 1. */
    restoreState(value: ClientStateCheckpoint, epoch: string): void {
        if (this.online || this.conditional || this.pending.length) throw new Error("Restore requires a disconnected, settled client");
        if (!value || value.format !== 2) throw new Error("Invalid client state checkpoint");
        const metadata = this.prepareMetadata(value, epoch);
        this.assertCheckpointIdentity(value.engine);
        const prepared = this.engine.prepareCheckpoint(value.engine);
        this.engine.installCheckpoint(prepared);
        this.installMetadata(value, metadata, epoch);
    }

    /** Install a separately proven accepted conditional intent before reconnecting. */
    restoreAcceptedIntent(snapshot: Snapshot, edits: EditOp[], change: Change): void {
        if (this.online || this.conditional || this.pending.length || change.actor !== this.actor || change.seq !== this.seq + 1) {
            throw new Error("Accepted intent cannot follow this checkpoint");
        }
        const prepared = this.engine.prepareSnapshot(snapshot);
        const {ops} = this.engine.compilePrepared(prepared, edits);
        if (JSON.stringify(ops) !== JSON.stringify(change.ops)) throw new Error("Accepted intent does not reproduce its change");
        this.engine.installPrepared(prepared);
        this.engine.record(ops, {caretBefore: "", caretAfter: ""}); this.seq = change.seq;
        // Server snapshot will supply the already accepted change.
    }

    // ── 연결 ──────────────────────────────────────────────────────────────

    connect(): void {
        this.assertLocalMutation();
        if (this.online) {
            return;
        }

        this.connectionError = null;
        this.ready = false;
        this.online = true;
        // 다시 이어질 때는 확인 안 된 변경을 모두 다시 보낸다 (서버가 중복을 거른다)
        this.outbox = this.pending.map(change => ({kind: "change", change}));
        const connection = ++this.connection;
        try {
            const stop = this.transport.subscribe(this.forceSnapshot ? 0 : this.serverSeq, event => {
                if (!this.online || this.connection !== connection) return;
                if (this.conditional) {
                    // Reconnect from the last applied cursor rather than dropping a buffered event.
                    if (this.conditional.events.length >= 1024) {
                        this.conditional.events = [];
                        this.conditional.reconnect = true;
                        this.disconnect();
                    } else this.conditional.events.push({event, connection});
                    return;
                }
                if (this.ready || event.type === "hello") this.receive(event, connection);
            }, this.epoch, schemaVersion(this.schema));
            // Synchronous callbacks can disconnect or start another connection.
            // A stale subscription must never replace the current cleanup handle.
            if (this.online && this.connection === connection) this.unsubscribe = stop;
            else stop();
        } catch (error) {
            if (this.connection !== connection) return;
            this.connectionError = error instanceof Error ? error : new Error(String(error));
            this.disconnect();
            return;
        }
        if (!this.online || this.connection !== connection) return;
        this.flush();
        this.notify("onUpdate", () => this.onUpdate?.());
    }

    disconnect(): void {
        if (!this.online) {
            return;
        }

        this.online = false;
        this.ready = false;
        this.schemaVerified = false;
        this.connection += 1;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.notify("onUpdate", () => this.onUpdate?.());
    }

    /** Install a compatible local schema while retaining the document, pending changes and history. Reconnect explicitly afterwards. */
    upgradeSchema(nextSchema: Schema): void {
        this.assertLocalMutation();
        if (this.conditional) throw new Error("Resolve the conditional edit before changing schema");
        assertCompatibleSchema(this.schema, nextSchema);
        const next = ownedSchema(nextSchema);
        assertCompatibleSchema(this.schema, next);
        this.engine.previewSchema(next);
        this.disconnect();
        this.engine.upgradeSchema(next);
        this.currentSchema = next;
        this.schemaVerified = false;
        this.notify("onUpdate", () => this.onUpdate?.());
    }

    // ── 내 편집 ───────────────────────────────────────────────────────────

    /**
     * 이미 내 문서에 적용된 연산을 서버로 보낼 줄에 세운다.
     * @param record 되돌리기 기록에 남길 때 그 정보. 되돌리기가 만든 연산은 null
     */
    commit(ops: Op[], record: RecordOptions | null = {caretBefore: "", caretAfter: ""}): void {
        this.assertLocalMutation();
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before another edit");
        if (!ops.length) {
            return;
        }

        record && this.engine.record(ops, record);
        this.seq += 1;

        const change: Change = {actor: this.actor, seq: this.seq, ops};

        this.pending.push(change);
        this.outbox.push({kind: "change", change});
        this.flush();
        this.notify("onUpdate", () => this.onUpdate?.());
    }

    /** @returns 되돌린 뒤 커서를 둘 토큰 키 */
    undo(): string | null {
        this.assertLocalMutation();
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before undo");
        const {ops, caret} = this.withEvents("undo", () => this.engine.undo());

        this.commit(ops, null);

        return caret;
    }

    redo(): string | null {
        this.assertLocalMutation();
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before redo");
        const {ops, caret} = this.withEvents("redo", () => this.engine.redo());

        this.commit(ops, null);

        return caret;
    }

    /** 되돌리기 기록을 비운다 — 핀이 풀렸다고 서버에 바로 알린다 */
    clearHistory(): void {
        this.assertLocalMutation();
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before clearing history");
        this.engine.clearHistory();
        this.persistCheckpoint(this.onCheckpoint);
        this.scheduleAck();
    }

    setPresence(presence: PresenceInput): void {
        this.online && this.ready && this.transport.sendPresence({...this.profile, ...presence, name: presence.name ?? this.profile.name, color: presence.color ?? this.profile.color, actor: this.actor});
    }

    /** Submit model edits without changing the live replica until the server accepts the exact base. */
    async conditionalEdit(base: ConditionalBase, edits: EditOp[], send: ConditionalSender): Promise<ConditionalReply | {status: "unconfirmed"; message: string} | {status: "no_change"}> {
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before another edit");
        if (!this.online || !this.ready || this.connectionError || this.pending.length) throw new Error("The client must be connected and have no pending changes");
        if (base.epoch !== this.epoch || base.serverSeq !== this.serverSeq || base.schemaVersion !== (this.schemaVerified ? schemaVersion(this.schema) : null)) {
            throw new Error("The local document or schema changed since it was read");
        }
        // Honor a caller's guard before submitting. Do not invoke arbitrary guards
        // again after the server has accepted the change.
        this.engine.assertEditing();
        const snapshot = JSON.stringify(this.engine.snapshot());
        const draft = this.engine.prepareSnapshot(JSON.parse(snapshot) as Snapshot);
        const candidate = this.engine.compilePrepared(draft, edits);
        const problem = this.engine.check(candidate.ops);
        if (problem) throw new Error(`Schema or operation validation failed: ${problem}`);
        if (!candidate.ops.length) return {status: "no_change"};
        this.conditional = {base: {...base}, change: {actor: this.actor, seq: this.seq + 1, ops: candidate.ops},
            edits: structuredClone(edits), snapshot, events: [], reconnect: false, attempting: false, priorGuard: null, wasUnconfirmed: false};
        this.attach();
        return this.retryConditional(send);
    }

    /** Retry the identical conditional request. A network failure does not establish its outcome. */
    async retryConditional(send: ConditionalSender): Promise<ConditionalReply | {status: "unconfirmed"; message: string}> {
        const attempt = this.conditional;
        if (!attempt) throw new Error("No conditional edit is awaiting resolution");
        if (attempt.attempting) throw new Error("The conditional edit is already being submitted");
        this.persistCheckpoint(this.beforeSend);
        this.persistCheckpoint(this.onCheckpoint);
        attempt.attempting = true;
        let reply: ConditionalReply;
        try { reply = await send(attempt.base, attempt.change); }
        catch (error) {
            attempt.attempting = false;
            attempt.wasUnconfirmed = true;
            return {status: "unconfirmed", message: error instanceof Error ? error.message : String(error)};
        }
        attempt.attempting = false;
        if (reply.status === "rejected" && reply.code === "epoch" && attempt.wasUnconfirmed) {
            return {status: "unconfirmed", message: "The server epoch changed after a lost response. The original outcome is unknown and the request is retained for recovery."};
        }
        this.finalizingConditional = true;
        try {
        if (reply.status === "accepted") {
            // Do not install accepted operations onto an unexpectedly changed local state.
            // The original request remains available for idempotent recovery.
            if (JSON.stringify(this.engine.snapshot()) !== attempt.snapshot || this.seq + 1 !== attempt.change.seq) {
                return {status: "unconfirmed", message: "The server accepted the edit, but the local state changed. The request is retained for recovery."};
            }
            const preview = this.engine.prepareSnapshot(this.engine.snapshot());
            const check = this.engine.compilePrepared(preview, attempt.edits);
            if (JSON.stringify(check.ops) !== JSON.stringify(attempt.change.ops)) {
                return {status: "unconfirmed", message: "The accepted edit could not be reproduced locally. The request is retained for recovery."};
            }
            this.installingConditional = true;
            let ops: Op[];
            try { ops = this.engine.apply(attempt.edits, {accepted: true}); }
            finally { this.installingConditional = false; }
            this.engine.record(ops, {caretBefore: "", caretAfter: ""});
            this.seq = attempt.change.seq;
            this.pending.push(attempt.change);
        }
        this.conditional = null;
        this.attach();
        if (attempt.reconnect) {
            if (!this.online) this.connect();
        } else {
            for (const {event, connection} of attempt.events) {
                if (this.online && this.connection === connection && (this.ready || event.type === "hello")) this.receive(event, connection);
            }
        }
        this.notify("onUpdate", () => this.onUpdate?.());
        return reply;
        } finally {
            this.finalizingConditional = false;
        }
    }

    dispose(): void {
        if (this.disposed) return;
        const history = this.engine.historyStatus();
        if (this.hasProtectedLocalState || this.conditional || history.canUndo || history.canRedo) throw new Error("Cannot dispose a client with protected local state or history");
        this.disconnect(); this.engine.dispose(); this.disposed = true;
    }

    /** 줄에 선 것을 차례로 하나씩 보낸다. 끊기면 멈추고, 다시 이어질 때 확인 안 된 변경부터 다시 보낸다 */
    private async flush(): Promise<void> {
        if (this.sending) {
            return;
        }

        this.sending = true;

        try {
            while (this.online && this.ready && this.outbox.length) {
                const message = this.outbox[0];

                this.persistCheckpoint(this.beforeSend);
                this.persistCheckpoint(this.onCheckpoint);
                await this.transport.send(message);
                // 보내는 사이 줄이 바뀌었을 수 있다(새 ack 로 갈아 끼움) — 보낸 것만 뺀다
                this.outbox = this.outbox.filter(m => m !== message);
            }
        } catch {
            this.online && setTimeout(() => this.flush(), 500);
        } finally {
            this.sending = false;
        }
    }

    /** 받은 곳까지를 서버에 알린다. 내 되돌리기 핀도 함께 */
    private scheduleAck(): void {
        if (this.ackTimer) {
            return;
        }

        const send = () => {
            this.ackTimer = null;

            if (!this.online) {
                return;
            }

            // 줄에 이미 선 ack 는 새것으로 바꾼다 — 그 앞의 변경 순서는 그대로
            this.outbox = this.outbox.filter(m => m.kind !== "ack");
            this.outbox.push({
                kind: "ack",
                ack: {actor: this.actor, serverSeq: this.serverSeq, pin: this.engine.historyPin(this.engine.historyDeletionKeys().flatMap(key => { const seq = this.delSeq.get(key); return seq === undefined ? [] : [[key, seq] as [string, number]]; }))},
            });
            this.flush();
        };

        if (this.ackDelay > 0) {
            this.ackTimer = setTimeout(send, this.ackDelay);
        } else {
            this.ackTimer = 1 as unknown as ReturnType<typeof setTimeout>;
            queueMicrotask(send);
        }
    }

    // ── 서버에서 온 것 ────────────────────────────────────────────────────

    private receive(event: ServerEvent, connection: number): void {
        let helloDoc: EnginePreparedDocument | null = null;
        // A reset replaces the document generation. Never discard unconfirmed
        // local work merely because a live reset arrived before a new hello.
        if (event.type === "reset" && this.hasProtectedLocalState) {
            this.connectionError = new Error("Document reset with unconfirmed edits or protected history; local document and pending edits are preserved");
            this.disconnect();
            return;
        }
        if (event.type === "schema" && event.schemaVersion !== schemaVersion(this.schema)) {
            this.connectionError = new Error("Server schema changed; local document, history and pending edits are preserved. Upgrade the schema before reconnecting.");
            this.schemaVerified = false;
            this.disconnect();
            return;
        }
        if (event.type === "hello") {
            if (this.forceSnapshot && (!event.snapshot || !Array.isArray(event.clientSeqs))) {
                this.connectionError = new Error("Recovery requires a complete server snapshot and actor sequences");
                this.disconnect();
                return;
            }
            if (event.schemaVersion === undefined || (this.schema.domain === "graphic" && event.schemaVersion === null) || (event.schemaVersion !== null && event.schemaVersion !== schemaVersion(this.schema))) {
                this.connectionError = new Error("Server schema version is missing or incompatible; local document and pending edits are preserved");
                this.schemaVerified = false;
                this.disconnect();
                return;
            }
            this.schemaVerified = event.schemaVersion !== null;
            if (event.protocol !== PROTOCOL_VERSION || !Array.isArray(event.capabilities) ||
                !event.capabilities.every(capability => typeof capability === "string") ||
                DOCUMENT_CAPABILITIES.some(capability => !event.capabilities!.includes(capability)) ||
                (this.schema.domain === "graphic" && !event.capabilities.includes(CONTAINER_CAPABILITY)) ||
                typeof event.epoch !== "string" || !event.epoch.length) {
                this.connectionError = new Error("Incompatible doc-sync protocol, document capabilities, or epoch");
                this.disconnect();
                return;
            }
            if (this.epoch !== undefined && event.epoch !== this.epoch && this.hasProtectedLocalState) {
                this.connectionError = new Error("Document epoch changed with unconfirmed edits or protected history; local document and pending edits are preserved");
                this.disconnect();
                return;
            }
            if (this.epoch !== event.epoch && !event.snapshot) {
                this.connectionError = new Error("Document epoch changed without a complete snapshot");
                this.disconnect();
                return;
            }
            const presenceValid = Array.isArray(event.presence) && event.presence.every(peer => peer &&
                typeof peer.actor === "string" && typeof peer.name === "string" && typeof peer.color === "string" &&
                (peer.anchor === null || typeof peer.anchor === "string") && (peer.focus === null || typeof peer.focus === "string"));
            if (!Number.isSafeInteger(event.serverSeq) || event.serverSeq < 0 || !validHelloCounters(event.delSeqs) ||
                (event.clientSeqs !== undefined && !validHelloCounters(event.clientSeqs)) || !presenceValid) {
                this.connectionError = new Error("Invalid doc-sync hello metadata");
                this.disconnect();
                return;
            }
            // Prepare untrusted stored state before acknowledging or discarding any pending edit.
            // A failed snapshot must also leave native composition/reset hooks untouched.
            if (event.snapshot) {
                try { helloDoc = this.engine.prepareSnapshot(event.snapshot); }
                catch (error) {
                    this.connectionError = error instanceof Error ? error : new Error(String(error));
                    this.disconnect();
                    return;
                }
            }
        }
        if (event.type === "hello" && this.epoch !== undefined && event.epoch !== this.epoch) {
            // Native composition drafts are outside pending until committed.
            this.notify("onEvent", () => this.onEvent?.({type: "reset", epoch: event.epoch}));
            if (!this.online || this.connection !== connection) return;
        }
        this.notify("onEvent", () => this.onEvent?.(event));
        if (!this.online || this.connection !== connection) return;
        // A reset listener can commit an editor's in-progress composition.
        if (event.type === "reset" && this.hasProtectedLocalState) {
            this.connectionError = new Error("Document reset with unconfirmed edits or protected history; local document and pending edits are preserved");
            this.disconnect();
            return;
        }
        if (event.type === "hello" && this.epoch !== undefined && event.epoch !== this.epoch && this.hasProtectedLocalState) {
            this.connectionError = new Error("Document epoch changed with unconfirmed edits or protected history; local document and pending edits are preserved");
            this.disconnect();
            return;
        }

        switch (event.type) {
            case "hello": {
                // A same-generation snapshot can omit locally allocated identities
                // from retired or protected work. Never allocate those names again.
                // Epoch replacement still uses the existing reset rules below.
                const allocationFloor = this.epoch !== undefined && this.epoch === event.epoch ? this.engine.allocationFloor() : 0;
                const accepted = event.snapshot ? event.clientSeqs?.find(([actor]) => actor === this.actor)?.[1] ?? 0 : 0;
                const pending = event.snapshot ? this.pending.filter(change => change.seq > accepted) : this.pending;
                if (helloDoc) {
                    const mine = pending.flatMap(change => change.ops);
                    try {
                        this.engine.replayPrepared(helloDoc, this.actor, mine);
                    } catch (error) {
                        this.connectionError = error instanceof Error ? error : new Error(String(error));
                        this.disconnect();
                        return;
                    }
                }
                if (this.epoch !== undefined && event.epoch !== this.epoch) {
                    this.engine.clearHistory();
                    this.seq = 0;
                    this.delSeq.clear();
                    this.gcFrontier = 0;
                    this.serverSeq = 0;
                    this.outbox = [];
                }
                this.epoch = event.epoch;
                if (helloDoc) {
                    this.seq = Math.max(this.seq, accepted);
                    this.pending = pending;
                    this.outbox = this.outbox.filter(message => message.kind !== "change" || message.change.seq > accepted);
                    const replacement = helloDoc;
                    this.withEvents("snapshot", () => this.engine.installPrepared(replacement, {clockFloor: allocationFloor}));
                    event.delSeqs.forEach(([key, seq]) => this.delSeq.set(key, seq));
                    this.serverSeq = event.serverSeq;
                    this.forceSnapshot = false;
                }

                this.ready = true;
                this.flush();
                this.scheduleAck();
                this.others = new Map(event.presence.filter(p => p.actor !== this.actor).map(p => [p.actor, p]));
                break;
            }
            case "change":
                this.receiveEnvelope(event.envelope);
                break;
            case "presence":
                event.presence.actor !== this.actor && this.others.set(event.presence.actor, event.presence);
                break;
            case "leave":
                this.others.delete(event.actor);
                break;
            case "schema":
                break;
            case "reset":
                if (event.epoch) this.epoch = event.epoch;
                this.withEvents("reset", () => this.engine.reset());
                this.engine.clearHistory();
                this.pending = [];
                this.outbox = [];
                this.delSeq.clear();
                this.serverSeq = 0;
                this.seq = 0;
                this.gcFrontier = 0;
                break;
        }

        this.notify("onUpdate", () => this.onUpdate?.());
    }

    private receiveEnvelope(envelope: Envelope): void {
        const own = envelope.change?.actor === this.actor;
        if (envelope.serverSeq <= this.serverSeq) {
            if (own) this.pending = this.pending.filter(change => change.seq > envelope.change!.seq);
            return;
        }
        if (envelope.gc !== undefined) {
            this.engine.compact(envelope.gc, [...this.delSeq]);
            this.serverSeq = envelope.serverSeq;
            this.gcFrontier = envelope.gc;
            this.scheduleAck();
            return;
        }
        const {change} = envelope;
        const accepted = (deletions: string[]) => {
            this.serverSeq = envelope.serverSeq;
            deletions.forEach(key => this.delSeq.set(key, envelope.serverSeq));
            if (own) this.pending = this.pending.filter(pending => pending.seq > change.seq);
        };
        if (own) accepted(change.ops.flatMap(op => op.t === "del" ? [keyOf(op.at)] : []));
        else this.withEvents("remote", capture => { const result = this.engine.receive(change.actor, change.ops, capture); accepted(result.deletions); }, change.ops);
        this.scheduleAck();
    }
}
