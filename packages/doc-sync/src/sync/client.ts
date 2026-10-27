import {keyOf} from "../crdt/ticket.ts";
import {Doc} from "../crdt/doc.ts";
import {History} from "../crdt/history.ts";
import {applyEdits, diffModels} from "../crdt/model.ts";
import {assertCompatibleSchema, schemaVersion} from "../crdt/schema-version.ts";
import {modelEventWindow, textEventScopes} from "./model-events.ts";
import type {Op, Snapshot} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import {DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "./protocol.ts";
import type {Change, Envelope, Outbound, Presence, ServerEvent, Transport} from "./protocol.ts";

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
    /** 문서 스키마 — 바깥에서 주입한다. 블록 종류·속성·서식을 정한다 (schema.ts) */
    schema: Schema;
    /** 받은 뒤 ack 를 보내기까지 기다리는 시간 (ms). 0 이면 바로 */
    ackDelay?: number;
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
type ConditionalAttempt = {
    base: ConditionalBase; change: Change; edits: EditOp[]; snapshot: string;
    events: Array<{event: ServerEvent; connection: number}>; reconnect: boolean; attempting: boolean; priorGuard: (() => void) | null; wasUnconfirmed: boolean;
};

function ownedSchema(input: Schema): Schema {
    // Inspect the original before cloning: structuredClone would invoke getters.
    schemaVersion(input);
    const result = structuredClone(input);
    schemaVersion(result);
    const freeze = (value: unknown): void => {
        if (value && typeof value === "object" && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
    };
    freeze(result);
    return result;
}

export class SyncClient {
    doc: Doc;
    history = new History();
    readonly actor: string;
    online = false;
    /** Set when the server cannot safely process this client version. Pending edits are retained. */
    connectionError: Error | null = null;
    /** Identifies the server document generation. Restart/reset changes it. */
    epoch: string | undefined;
    private ready = false;
    /** True only after the current connection has processed a compatible hello. */
    get synchronized(): boolean { return this.online && this.ready && !this.connectionError; }
    private forceSnapshot = false;
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
        this.attach(this.doc);
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
    private currentSchema: Schema;
    get schema(): Schema { return this.currentSchema; }
    /** False for an explicitly schema-free server. */
    schemaVerified = false;
    private conditional: ConditionalAttempt | null = null;
    private installingConditional = false;
    private finalizingConditional = false;
    /** Notification failures during accepted conditional finalization. Oldest entries are discarded after 100. */
    readonly notificationErrors: Array<{callback: string; message: string}> = [];
    onNotificationError: ((error: unknown, callback: string) => void) | null = null;

    private notify(callback: string, invoke: () => void): void {
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
        this.transport = transport;
        this.currentSchema = ownedSchema(options.schema);
        this.ackDelay = options.ackDelay ?? 0;
        this.doc = this.attach(new Doc(actor, this.schema));
    }

    /** 문서를 갈아 끼울 때마다 내 편집 알림을 잇는다 */
    private attach(doc: Doc): Doc {
        // 구독자가 없으면 normalize 를 위한 모델 계산도 필요 없다. 명시한 normalize 옵션은 Doc.edit 이 지킨다.
        doc.editListener = this.localEdits ? (edits, normalize) => {
            const installing = this.installingConditional;
            this.installingConditional = false;
            try { this.notify("onLocalEdits", () => this.localEdits?.(edits, normalize)); }
            finally { this.installingConditional = installing; }
        } : null;

        return doc;
    }

    /** fn 이 모델을 바꾸면 받는 쪽 이벤트를 낸다 (듣는 쪽이 있을 때만 계산한다) */
    private withEvents<T>(cause: EventCause, fn: () => T, ops?: Op[]): T {
        if (!this.onModelEvents) {
            return fn();
        }

        const scopes = ops ? textEventScopes(this.doc, ops) : null;
        const before = scopes ? null : this.doc.toJSON();
        const result = fn();
        let events: EditOp[] = [];
        let fallback = false;

        if (scopes) {
            for (const scope of scopes) {
                const after = scope.read();

                if (JSON.stringify(scope.before) === JSON.stringify(after)) {
                    continue;
                }

                const next = diffModels(scope.schema, scope.before, after);

                if (JSON.stringify(applyEdits(scope.schema, scope.before, next)) !== JSON.stringify(after)) {
                    const wholeAfter = this.doc.toJSON();

                    // 부분 결과는 모두 버린다. 글자만 바뀌어 루트 자식 수는 이전과 같다.
                    events = replaceAll(wholeAfter, wholeAfter);
                    fallback = true;
                    break;
                }

                for (const event of next) {
                    events.push({...event, at: [...scope.path, ...event.at.slice(1)]});
                }
            }
        } else {
            const after = this.doc.toJSON();

            if (JSON.stringify(before) === JSON.stringify(after)) {
                return result;
            }

            const window = modelEventWindow(this.schema, before!, after);
            const localBefore = window?.before ?? before!;
            const localAfter = window?.after ?? after;
            const local = diffModels(this.schema, localBefore, localAfter);

            if (JSON.stringify(applyEdits(this.schema, localBefore, local)) !== JSON.stringify(localAfter)) {
                events = replaceAll(before!, after);
                fallback = true;
            } else {
                const path = (at: number[]) => [at[0] + window!.start, ...at.slice(1)];
                events = window ? local.map(event => event.op === "move"
                    ? {...event, at: path(event.at), from: path(event.from)} : {...event, at: path(event.at)}) : local;
            }
        }

        if (!events.length) {
            return result;
        }

        this.eventStats.changes += 1;
        this.eventStats.events += events.length;
        fallback && (this.eventStats.fallbacks += 1);
        this.notify("onModelEvents", () => this.onModelEvents?.(events, {cause, fallback}));

        return result;
    }

    readonly seqOf = (delKey: string): number | undefined => this.delSeq.get(delKey);

    /** Capture a single synchronous replica state. Persisting it requires a separate durable boundary. */
    checkpoint(): ClientCheckpoint {
        if (this.conditional) throw new Error("An unresolved conditional request needs its own recovery evidence");
        return structuredClone({format: 1 as const, actor: this.actor, schemaVersion: schemaVersion(this.schema),
            snapshot: this.doc.snapshot(), history: this.history.snapshot(), seq: this.seq, serverSeq: this.serverSeq,
            gcFrontier: this.gcFrontier, delSeq: [...this.delSeq], pending: this.pending});
    }

    /** Restore only after the caller proves matching generation, schema and GC protection. */
    restoreCheckpoint(value: ClientCheckpoint, epoch: string): void {
        if (this.online || this.conditional || this.pending.length) throw new Error("Restore requires a disconnected, settled client");
        if (!value || value.format !== 1 || value.actor !== this.actor || value.schemaVersion !== schemaVersion(this.schema) ||
            typeof epoch !== "string" || !epoch || !Number.isSafeInteger(value.seq) || value.seq < 0 ||
            !Number.isSafeInteger(value.serverSeq) || value.serverSeq < 0 || !Number.isSafeInteger(value.gcFrontier) ||
            value.gcFrontier < 0 || value.gcFrontier > value.serverSeq || !Array.isArray(value.delSeq) || !Array.isArray(value.pending)) {
            throw new Error("Invalid client checkpoint");
        }
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
        const doc = Doc.fromSnapshot(this.actor, value.snapshot, this.schema);
        const history = History.fromSnapshot(value.history);
        // Validate into detached values before replacing any live state.
        const pending = structuredClone(value.pending);
        this.doc = this.attach(doc); this.history = history; this.seq = value.seq;
        this.serverSeq = value.serverSeq;
        this.forceSnapshot = true; // Reconcile against the complete server snapshot before sending.
        this.gcFrontier = value.gcFrontier;
        this.delSeq.clear(); for (const [key, seq] of delSeq) this.delSeq.set(key, seq);
        this.pending = pending; this.epoch = epoch; this.connectionError = null;
    }

    /** Install a separately proven accepted conditional intent before reconnecting. */
    restoreAcceptedIntent(snapshot: Snapshot, edits: EditOp[], change: Change): void {
        if (this.online || this.conditional || this.pending.length || change.actor !== this.actor || change.seq !== this.seq + 1) {
            throw new Error("Accepted intent cannot follow this checkpoint");
        }
        const doc = Doc.fromSnapshot(this.actor, snapshot, this.schema);
        const {ops} = doc.edit(edits);
        if (JSON.stringify(ops) !== JSON.stringify(change.ops)) throw new Error("Accepted intent does not reproduce its change");
        // Validate on a detached history graph so failed installation is atomic.
        const history = History.fromSnapshot(this.history.snapshot());
        history.record(ops, doc, {caretBefore: "", caretAfter: ""});
        this.doc = this.attach(doc); this.history = history; this.seq = change.seq;
        // Server snapshot will supply the already accepted change.
    }

    // ── 연결 ──────────────────────────────────────────────────────────────

    connect(): void {
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
        if (this.conditional) throw new Error("Resolve the conditional edit before changing schema");
        assertCompatibleSchema(this.schema, nextSchema);
        const next = ownedSchema(nextSchema);
        assertCompatibleSchema(this.schema, next);
        const replacement = Doc.fromSnapshot(this.actor, this.doc.snapshot(), next);
        this.disconnect();
        this.currentSchema = next;
        this.doc = this.attach(replacement);
        this.schemaVerified = false;
        this.notify("onUpdate", () => this.onUpdate?.());
    }

    // ── 내 편집 ───────────────────────────────────────────────────────────

    /**
     * 이미 내 문서에 적용된 연산을 서버로 보낼 줄에 세운다.
     * @param record 되돌리기 기록에 남길 때 그 정보. 되돌리기가 만든 연산은 null
     */
    commit(ops: Op[], record: RecordOptions | null = {caretBefore: "", caretAfter: ""}): void {
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before another edit");
        if (!ops.length) {
            return;
        }

        record && this.history.record(ops, this.doc, record);
        this.seq += 1;

        const change: Change = {actor: this.actor, seq: this.seq, ops};

        this.pending.push(change);
        this.outbox.push({kind: "change", change});
        this.flush();
        this.notify("onUpdate", () => this.onUpdate?.());
    }

    /** @returns 되돌린 뒤 커서를 둘 토큰 키 */
    undo(): string | null {
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before undo");
        const {ops, caret} = this.withEvents("undo", () => this.history.undo(this.doc));

        this.commit(ops, null);

        return caret;
    }

    redo(): string | null {
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before redo");
        const {ops, caret} = this.withEvents("redo", () => this.history.redo(this.doc));

        this.commit(ops, null);

        return caret;
    }

    /** 되돌리기 기록을 비운다 — 핀이 풀렸다고 서버에 바로 알린다 */
    clearHistory(): void {
        if (this.conditional) throw new Error("A conditional edit is unresolved; retry it before clearing history");
        this.history.clear();
        this.scheduleAck();
    }

    setPresence(presence: Omit<Presence, "actor">): void {
        this.online && this.ready && this.transport.sendPresence({...presence, actor: this.actor});
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
        this.doc.editGuard?.();
        const snapshot = JSON.stringify(this.doc.snapshot());
        const draft = Doc.fromSnapshot(this.actor, JSON.parse(snapshot), this.schema);
        const candidate = draft.edit(edits);
        const problem = this.doc.check(candidate.ops);
        if (problem) throw new Error(`Schema or operation validation failed: ${problem}`);
        if (!candidate.ops.length) return {status: "no_change"};
        this.conditional = {base: {...base}, change: {actor: this.actor, seq: this.seq + 1, ops: candidate.ops},
            edits: structuredClone(edits), snapshot, events: [], reconnect: false, attempting: false, priorGuard: this.doc.editGuard, wasUnconfirmed: false};
        const priorGuard = this.doc.editGuard;
        this.doc.editGuard = () => {
            if (!this.installingConditional) throw new Error("A conditional edit is unresolved; retry it before changing the document");
        };
        return this.retryConditional(send);
    }

    /** Retry the identical conditional request. A network failure does not establish its outcome. */
    async retryConditional(send: ConditionalSender): Promise<ConditionalReply | {status: "unconfirmed"; message: string}> {
        const attempt = this.conditional;
        if (!attempt) throw new Error("No conditional edit is awaiting resolution");
        if (attempt.attempting) throw new Error("The conditional edit is already being submitted");
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
            if (JSON.stringify(this.doc.snapshot()) !== attempt.snapshot || this.seq + 1 !== attempt.change.seq) {
                return {status: "unconfirmed", message: "The server accepted the edit, but the local state changed. The request is retained for recovery."};
            }
            const check = Doc.fromSnapshot(this.actor, this.doc.snapshot(), this.schema).edit(attempt.edits);
            if (JSON.stringify(check.ops) !== JSON.stringify(attempt.change.ops)) {
                return {status: "unconfirmed", message: "The accepted edit could not be reproduced locally. The request is retained for recovery."};
            }
            this.installingConditional = true;
            let ops: Op[];
            try { ({ops} = this.doc.edit(attempt.edits)); }
            finally { this.installingConditional = false; }
            this.history.record(ops, this.doc, {caretBefore: "", caretAfter: ""});
            this.seq = attempt.change.seq;
            this.pending.push(attempt.change);
        }
        this.doc.editGuard = attempt.priorGuard;
        this.conditional = null;
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

    /** 줄에 선 것을 차례로 하나씩 보낸다. 끊기면 멈추고, 다시 이어질 때 확인 안 된 변경부터 다시 보낸다 */
    private async flush(): Promise<void> {
        if (this.sending) {
            return;
        }

        this.sending = true;

        try {
            while (this.online && this.ready && this.outbox.length) {
                const message = this.outbox[0];

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
                ack: {actor: this.actor, serverSeq: this.serverSeq, pin: this.history.pin(this.seqOf)},
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
        let helloDoc: Doc | null = null;
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
            if (event.schemaVersion === undefined || (event.schemaVersion !== null && event.schemaVersion !== schemaVersion(this.schema))) {
                this.connectionError = new Error("Server schema version is missing or incompatible; local document and pending edits are preserved");
                this.schemaVerified = false;
                this.disconnect();
                return;
            }
            this.schemaVerified = event.schemaVersion !== null;
            if (event.protocol !== PROTOCOL_VERSION || !Array.isArray(event.capabilities) ||
                !event.capabilities.every(capability => typeof capability === "string") ||
                DOCUMENT_CAPABILITIES.some(capability => !event.capabilities!.includes(capability)) ||
                typeof event.epoch !== "string" || !event.epoch.length) {
                this.connectionError = new Error("Incompatible doc-sync protocol, document capabilities, or epoch");
                this.disconnect();
                return;
            }
            if (this.epoch !== undefined && event.epoch !== this.epoch && this.pending.length) {
                this.connectionError = new Error("Document epoch changed with unconfirmed edits; local document and pending edits are preserved");
                this.disconnect();
                return;
            }
            if (this.epoch !== event.epoch && !event.snapshot) {
                this.connectionError = new Error("Document epoch changed without a complete snapshot");
                this.disconnect();
                return;
            }
            const counters = (value: unknown): boolean => Array.isArray(value) && value.every(entry =>
                Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && Number.isSafeInteger(entry[1]) && entry[1] >= 0);
            const presenceValid = Array.isArray(event.presence) && event.presence.every(peer => peer &&
                typeof peer.actor === "string" && typeof peer.name === "string" && typeof peer.color === "string" &&
                (peer.anchor === null || typeof peer.anchor === "string") && (peer.focus === null || typeof peer.focus === "string"));
            if (!Number.isSafeInteger(event.serverSeq) || event.serverSeq < 0 || !counters(event.delSeqs) ||
                (event.clientSeqs !== undefined && !counters(event.clientSeqs)) || !presenceValid) {
                this.connectionError = new Error("Invalid doc-sync hello metadata");
                this.disconnect();
                return;
            }
            // Prepare untrusted stored state before acknowledging or discarding any pending edit.
            // A failed snapshot must also leave native composition/reset hooks untouched.
            if (event.snapshot) {
                try { helloDoc = Doc.fromSnapshot(this.actor, event.snapshot, this.schema); }
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
        if (event.type === "hello" && this.epoch !== undefined && event.epoch !== this.epoch && this.pending.length) {
            this.connectionError = new Error("Document epoch changed with unconfirmed edits; local document and pending edits are preserved");
            this.disconnect();
            return;
        }

        switch (event.type) {
            case "hello": {
                const accepted = event.snapshot ? event.clientSeqs?.find(([actor]) => actor === this.actor)?.[1] ?? 0 : 0;
                const pending = event.snapshot ? this.pending.filter(change => change.seq > accepted) : this.pending;
                if (helloDoc) {
                    const mine = pending.flatMap(change => change.ops);
                    try {
                        const problem = helloDoc.check(mine);
                        if (problem) throw new Error(`Cannot reapply pending edits: ${problem}`);
                        mine.forEach(op => helloDoc!.apply(op));
                    } catch (error) {
                        this.connectionError = error instanceof Error ? error : new Error(String(error));
                        this.disconnect();
                        return;
                    }
                }
                if (this.epoch !== undefined && event.epoch !== this.epoch) {
                    this.history = new History();
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
                    this.withEvents("snapshot", () => { this.doc = this.attach(replacement); });
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
                this.withEvents("reset", () => (this.doc = this.attach(new Doc(this.actor, this.schema))));
                this.history = new History();
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
        // 스냅숏에 이미 포함된 내 변경도 수신 확인은 처리한다.
        if (envelope.change?.actor === this.actor) {
            this.pending = this.pending.filter(change => change.seq > envelope.change!.seq);
        }

        if (envelope.serverSeq <= this.serverSeq) {
            return;
        }

        this.serverSeq = envelope.serverSeq;

        if (envelope.gc !== undefined) {
            // 로그의 이 자리에서 모두가 같은 압축을 한다
            this.doc.compact(envelope.gc, this.seqOf);
            this.gcFrontier = envelope.gc;
            this.scheduleAck();

            return;
        }

        const {change} = envelope;

        change.ops.forEach(op => op.t === "del" && this.delSeq.set(keyOf(op.at), envelope.serverSeq));

        if (change.actor !== this.actor) {
            this.withEvents("remote", () => change.ops.forEach(op => this.doc.apply(op)), change.ops);
        }

        this.scheduleAck();
    }
}

/** 물러서기 — 맨 위 자식을 모두 지우고 뒤 모델의 자식으로 채운다 */
const replaceAll = (before: NodeJSON, after: NodeJSON): EditOp[] => [
    {op: "delete", at: [0], count: (before.children ?? []).length},
    {op: "insert", at: [0], content: after.children ?? []},
];
