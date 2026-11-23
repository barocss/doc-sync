import {keyOf} from "../crdt/ticket.ts";
import {Doc} from "../crdt/doc.ts";
import {assertCompatibleSchema, schemaVersion} from "../crdt/schema-version.ts";
import type {Schema} from "../crdt/schema.ts";
import {DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "../sync/protocol.ts";
import type {Ack, Change, Envelope, Presence, ServerEvent} from "../sync/protocol.ts";

/**
 * 문서 하나의 서버 쪽 심장. 전송(HTTP·메모리)과 무관하다.
 *
 * 1. 받은 Change 를 검사하고, 통과하면 serverSeq 를 붙여 로그에 쌓는다 (같은 참여자의 같은 seq 는 한 번만)
 * 2. 같은 CRDT 로 서버 문서에도 적용한다 — 새 참여자에게 줄 스냅숏이 된다
 * 3. 구독자 모두에게 퍼뜨린다
 * 4. 참여자들의 "여기까지 받았다(ack)"를 모아 GC 기준점(frontier)을 정하고, GC 를 로그의 한 줄로 넣는다
 *
 * 서버는 편집을 "판정"하지 않는다. 수렴은 CRDT 가 보장한다.
 */

type Peer = {seq: number; pin: number | null; online: boolean; lastSeen: number};
type ConditionalBase = {epoch: string; serverSeq: number; schemaVersion: string | null};
type RecoveryState = {era: number; active: Array<{actor: string; reservationId: string; pin: number}>};

/** Unversioned identifiers predate compaction and belong to era zero. */
function reservationEra(id: string): number | null {
    if (!/^r[^~]*~/.test(id)) return 0;
    const match = /^r(0|[1-9][0-9]*)~[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(id);
    if (!match) return null;
    const era = Number(match[1]);
    return Number.isSafeInteger(era) ? era : null;
}

/** The durable callback returned, but local installation did not complete. */
export class PostPersistUncertainError extends Error {}

/** A legacy active identifier cannot safely be represented by the next era. */
export class RecoveryCompactionDeferredError extends Error {}

function freezeSchema(value: unknown): void {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) freezeSchema(child);
    Object.freeze(value);
}

export type HubOptions = {
    /**
     * 문서 스키마. 주면 변경을 스키마로도 검사하고 모델(toJSON)을 계산할 수 있다. 없어도 순서 매기기·적용·GC 는
     * 똑같이 한다 — 서버는 블록 종류를 몰라도 된다.
     */
    schema?: Schema | null;
    /** 끊긴 참여자의 핀을 얼마나 지켜 줄지 (ms). 지나면 그 참여자를 기다리지 않고 GC 한다 */
    lease?: number;
    now?: () => number;
    /** Durable document generation, provided by the storage layer. Null means unknown. */
    generation?: string | null;
};

export class DocHub {
    /** A restart gets a new epoch; clients with unconfirmed edits must stop safely. */
    epoch = crypto.randomUUID();
    generation: string | null;
    doc: Doc;
    log: Envelope[] = [];
    private readonly lastSeq = new Map<string, number>();
    private readonly acceptedChanges = new Map<string, number>();
    private readonly conditionalReceipts = new Map<string, {base: ConditionalBase; change: Change; serverSeq: number}>();
    /** 지우기 연산 이름표 → 그 지우기가 들어간 서버 번호 */
    private readonly delSeq = new Map<string, number>();
    private readonly peers = new Map<string, Peer>();
    // Recovery reservations are independent of expiring peer leases. They remain
    // until their owner explicitly releases them, including across a restart.
    private readonly recoveryPins = new Map<string, number>();
    // Once released, an ID cannot be reused within this generation. This makes
    // delayed release retries harmless even if another session starts later.
    private readonly releasedRecoveryPins = new Set<string>();
    private reservationEra = 0;
    get recoveryEra(): number { return this.reservationEra; }
    /** Inspect an existing protection without changing or persisting it. */
    hasRecoveryReservation(generation: string, actor: string, reservationId: string): boolean {
        return !!this.generation && generation === this.generation && this.recoveryPins.has(JSON.stringify([actor, reservationId]));
    }
    private lastGc = 0;
    readonly presence = new Map<string, Presence>();
    private readonly listeners = new Set<(event: ServerEvent) => void>();
    private readonly lease: number;
    private readonly now: () => number;
    /** 로그에 새 항목이 붙을 때 (영속 저장용) */
    onAppend: ((envelope: Envelope, conditionalBase?: ConditionalBase) => void) | null = null;
    onRecoveryPin: ((entry: {actor: string; reservationId: string; pin: number | null}) => void) | null = null;
    /** Listener failures must not turn an accepted change into a reported rejection. */
    onListenerError: ((error: unknown) => void) | null = null;
    /** Storage owners must discard this in-memory hub and reopen the durable log. */
    onPostPersistError: ((error: unknown) => void) | null = null;

    private schema: Schema | null;
    /** The schema identity is derived from the complete canonical schema. */
    schemaVersion: string | null;
    onSchemaChange: ((entry: {from: string; to: string; schema: Schema}) => void) | null = null;

    constructor(options: HubOptions = {}) {
        this.generation = options.generation ?? null;
        if (options.schema) schemaVersion(options.schema);
        this.schema = options.schema ? structuredClone(options.schema) : null;
        this.schemaVersion = this.schema ? schemaVersion(this.schema) : null;
        if (this.schema) freezeSchema(this.schema);
        this.doc = new Doc("~server", this.schema);
        this.lease = options.lease ?? Infinity;
        this.now = options.now ?? Date.now;
    }

    get serverSeq(): number {
        return this.log.length;
    }

    readonly seqOf = (delKey: string): number | undefined => this.delSeq.get(delKey);

    /**
     * @returns 새로 받아들였으면 그 Envelope, 이미 받은 것이면 null
     * @throws 순서가 비었거나 적용할 수 없는 연산이면 — 이때 서버 문서는 전혀 바뀌지 않는다
     */
    submit(change: Change, conditionalBase?: ConditionalBase): Envelope | null {
        const last = this.lastSeq.get(change.actor) ?? 0;

        if (change.seq <= last) {
            const accepted = this.acceptedChanges.get(JSON.stringify([change.actor, change.seq]));
            if (!accepted || JSON.stringify(this.log[accepted - 1]?.change) !== JSON.stringify(change)) throw new Error("change_conflict");
            return null;
        }

        if (change.seq !== last + 1) {
            throw new Error(`${change.actor} 의 seq ${last + 1} 을 기다리는데 ${change.seq} 가 왔다`);
        }

        const problem = this.doc.check(change.ops);

        if (problem) {
            throw new Error(problem);
        }

        // Validate reserved payload descriptors before cloning: cloning invokes getters.
        // Own the validated payload and recheck that retained copy before application.
        change = structuredClone(change);
        const retainedProblem = this.doc.check(change.ops);
        if (retainedProblem) throw new Error(retainedProblem);
        const envelope: Envelope = {serverSeq: this.log.length + 1, change};
        // Persist before changing the document or claiming an accepted request.
        // An I/O failure must leave the revision available for an exact retry.
        this.onAppend?.(structuredClone(envelope), conditionalBase ? structuredClone(conditionalBase) : undefined);
        try {
            change.ops.forEach(op => this.doc.apply(op));

            change.ops.forEach(op => op.t === "del" && this.delSeq.set(keyOf(op.at), envelope.serverSeq));
            this.lastSeq.set(change.actor, change.seq);
            this.acceptedChanges.set(JSON.stringify([change.actor, change.seq]), envelope.serverSeq);
            if (conditionalBase) this.conditionalReceipts.set(JSON.stringify([change.actor, change.seq]), {
                base: structuredClone(conditionalBase), change: structuredClone(change), serverSeq: envelope.serverSeq,
            });
            this.append(envelope, false);
        } catch (error) {
            try { this.onPostPersistError?.(error); } catch { /* Preserve the uncertain outcome. */ }
            throw new PostPersistUncertainError(`Persisted change may have been accepted: ${(error as Error).message}`);
        }

        return envelope;
    }

    /** Atomically check the authoritative revision and accept a change, or identify an exact retry. */
    submitConditional(change: Change, base: ConditionalBase): Envelope {
        // A reset can reuse actor/sequence/payload in a different document generation.
        // Never report that later change as confirmation of an earlier generation.
        if (base.epoch !== this.epoch) throw new Error("conditional_epoch");
        const receipt = this.conditionalReceipts.get(JSON.stringify([change.actor, change.seq]));
        if (receipt) {
            if (JSON.stringify(receipt.change) !== JSON.stringify(change) ||
                receipt.base.epoch !== base.epoch || receipt.base.serverSeq !== base.serverSeq || receipt.base.schemaVersion !== base.schemaVersion) throw new Error("conditional_conflict");
            return {serverSeq: receipt.serverSeq, change: structuredClone(receipt.change)};
        }
        if ((this.lastSeq.get(change.actor) ?? 0) >= change.seq) throw new Error("conditional_conflict");
        if (base.schemaVersion !== this.schemaVersion) throw new Error("conditional_schema");
        if (base.serverSeq !== this.serverSeq) throw new Error("conditional_stale");
        const accepted = this.submit(change, base);
        if (!accepted) throw new Error("conditional_conflict");
        return accepted;
    }

    /** A matching receipt proves acceptance; every other result remains unknown. */
    findConditionalReceipt(generation: string, base: ConditionalBase, change: Change): {status: "accepted"; generation: string; serverSeq: number} | {status: "unknown"} {
        if (!this.generation || generation !== this.generation) return {status: "unknown"};
        const receipt = this.conditionalReceipts.get(JSON.stringify([change.actor, change.seq]));
        if (!receipt || receipt.base.epoch !== base.epoch || receipt.base.serverSeq !== base.serverSeq ||
            receipt.base.schemaVersion !== base.schemaVersion || JSON.stringify(receipt.change) !== JSON.stringify(change)) return {status: "unknown"};
        return {status: "accepted", generation: this.generation, serverSeq: receipt.serverSeq};
    }

    /** A detached, deterministic view used to verify receipt evidence before storage compaction. */
    recoveryReceiptState(): Array<{base: ConditionalBase; change: Change; serverSeq: number}> {
        return [...this.conditionalReceipts.values()]
            .sort((a, b) => a.serverSeq - b.serverSeq)
            .map(receipt => structuredClone(receipt));
    }

    /** Prove that the exact ordinary or conditional change was durably accepted. */
    findChangeReceipt(generation: string, change: Change): {status: "accepted"; generation: string; serverSeq: number} | {status: "unknown"} {
        if (!this.generation || generation !== this.generation) return {status: "unknown"};
        const serverSeq = this.acceptedChanges.get(JSON.stringify([change.actor, change.seq]));
        if (!serverSeq || JSON.stringify(this.log[serverSeq - 1]?.change) !== JSON.stringify(change)) return {status: "unknown"};
        return {status: "accepted", generation: this.generation, serverSeq};
    }

    /** Install a compatible schema without resetting identities, history or pending clients. */
    transitionSchema(next: Schema, base: {epoch: string; serverSeq: number; schemaVersion: string}): string {
        if (!this.schema || !this.schemaVersion) throw new Error("Schema-free documents cannot transition schemas");
        if (base.epoch !== this.epoch || base.serverSeq !== this.serverSeq || base.schemaVersion !== this.schemaVersion) throw new Error("Stale schema transition base");
        schemaVersion(next);
        const owned = structuredClone(next);
        const version = schemaVersion(owned);
        assertCompatibleSchema(this.schema, owned);
        if (version === this.schemaVersion) return version;
        const candidate = Doc.fromSnapshot("~server", this.doc.snapshot(), owned);
        const from = this.schemaVersion;
        freezeSchema(owned);
        // Persist before changing the active state. A failed write leaves the hub unchanged.
        this.onSchemaChange?.({from, to: version, schema: structuredClone(owned)});
        this.schema = owned;
        this.schemaVersion = version;
        this.doc = candidate;
        this.emit({type: "schema", schemaVersion: version});
        return version;
    }

    getSchema(): Schema | null { return this.schema ? structuredClone(this.schema) : null; }

    // ── GC ────────────────────────────────────────────────────────────────

    reserveRecovery(generation: string, actor: string, reservationId: string, pin: number | null, requireExisting = false):
        {status: "protected"; generation: string; pin: number; lastGc: number; existing: boolean} | {status: "unsafe"} {
        if (!this.onRecoveryPin || !this.generation || generation !== this.generation || !actor || !reservationId ||
            (pin !== null && (!Number.isSafeInteger(pin) || pin < 1 || pin > this.serverSeq + 1))) return {status: "unsafe"};
        const key = JSON.stringify([actor, reservationId]);
        if (this.releasedRecoveryPins.has(key)) return {status: "unsafe"};
        const existing = this.recoveryPins.has(key);
        const era = reservationEra(reservationId);
        // Existing legacy reservations remain protected. Unknown IDs from a
        // sealed era can never become active, even after tombstones are removed.
        if (!existing && (era === null || era !== this.reservationEra)) return {status: "unsafe"};
        if (requireExisting && !existing) return {status: "unsafe"};
        const floor = Math.min(pin ?? Infinity, this.serverSeq + 1, this.recoveryPins.get(key) ?? Infinity);
        if (floor <= this.lastGc) return {status: "unsafe"};
        this.onRecoveryPin?.({actor, reservationId, pin: floor});
        this.recoveryPins.set(key, floor);
        return {status: "protected", generation, pin: floor, lastGc: this.lastGc, existing};
    }

    /** Recover an exact original change only while its durable reservation exists. */
    submitRecovery(generation: string, reservationId: string, version: string | null, change: Change):
        {status: "accepted"; generation: string; serverSeq: number} | {status: "unsafe"} | {status: "conflict"} {
        if (!this.onRecoveryPin || !this.generation || generation !== this.generation || version !== this.schemaVersion ||
            !reservationId || !this.recoveryPins.has(JSON.stringify([change.actor, reservationId]))) return {status: "unsafe"};
        const prior = this.findChangeReceipt(generation, change);
        if (prior.status === "accepted") return prior;
        if (change.seq !== (this.lastSeq.get(change.actor) ?? 0) + 1) return {status: "conflict"};
        const envelope = this.submit(change);
        if (!envelope) return {status: "conflict"};
        return {status: "accepted", generation, serverSeq: envelope.serverSeq};
    }

    releaseRecovery(generation: string, actor: string, reservationId: string): {status: "released"} | {status: "unsafe"} {
        if (!this.onRecoveryPin || !this.generation || generation !== this.generation || !actor || !reservationId) return {status: "unsafe"};
        const key = JSON.stringify([actor, reservationId]);
        if (this.releasedRecoveryPins.has(key)) return {status: "released"};
        const existing = this.recoveryPins.has(key);
        const era = reservationEra(reservationId);
        // A malformed versioned ID can never be reserved. Its old release can
        // therefore be acknowledged even after compaction removed its tombstone.
        if (!existing && era === null) return {status: "released"};
        if (!existing && era! > this.reservationEra) return {status: "unsafe"};
        if (!existing && era! < this.reservationEra) return {status: "released"};
        // Persist the tombstone even if an earlier create request never arrived.
        // A subsequent delayed create for this ID must not become a live pin.
        this.onRecoveryPin?.({actor, reservationId, pin: null});
        this.recoveryPins.delete(key);
        if (era === null || era >= this.reservationEra) this.releasedRecoveryPins.add(key);
        return {status: "released"};
    }

    /** Replay a durably recorded reservation in the original log order. */
    replayRecoveryPin(entry: {actor: string; reservationId: string; pin: number | null}): void {
        const key = entry && JSON.stringify([entry.actor, entry.reservationId]);
        if (!entry || typeof entry.actor !== "string" || !entry.actor || typeof entry.reservationId !== "string" || !entry.reservationId ||
            (entry.pin !== null && (!Number.isSafeInteger(entry.pin) || entry.pin < 1 ||
                entry.pin > this.serverSeq + 1 || entry.pin <= this.lastGc ||
                entry.pin > (this.recoveryPins.get(key) ?? Infinity)))) {
            throw new Error("Invalid recovery reservation");
        }
        const era = reservationEra(entry.reservationId);
        if (this.reservationEra > 0) {
            const existing = this.recoveryPins.has(key);
            if ((!existing && (era === null || era !== this.reservationEra)) ||
                (entry.pin !== null && this.releasedRecoveryPins.has(key))) throw new Error("Invalid recovery reservation era");
        }
        if (entry.pin === null) {
            this.recoveryPins.delete(key);
            if (era === null || era >= this.reservationEra) this.releasedRecoveryPins.add(key);
        } else {
            // Legacy logs could reuse an ID after release. Replay their original
            // order; newly submitted reservations can no longer do this.
            this.releasedRecoveryPins.delete(key);
            this.recoveryPins.set(key, entry.pin);
        }
    }

    /** A pure prospective barrier. Storage must persist it before installation. */
    recoveryCompactionState(): RecoveryState {
        if (!Number.isSafeInteger(this.reservationEra + 1)) throw new Error("Recovery reservation era is exhausted");
        const active = [...this.recoveryPins].map(([key, pin]) => {
            const [actor, reservationId] = JSON.parse(key) as [string, string];
            return {actor, reservationId, pin};
        }).sort((a, b) => a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : a.reservationId < b.reservationId ? -1 : a.reservationId > b.reservationId ? 1 : 0);
        const state = {era: this.reservationEra + 1, active};
        for (const entry of active) {
            const era = reservationEra(entry.reservationId);
            if (era === null || era >= state.era) throw new RecoveryCompactionDeferredError("An active legacy reservation cannot be represented in the next recovery era");
        }
        for (const key of this.releasedRecoveryPins) {
            const [, reservationId] = JSON.parse(key) as [string, string];
            const era = reservationEra(reservationId);
            // A legacy release could contain an ID from a future era. Dropping
            // it now would let a delayed create activate after the barrier.
            if (era !== null && era >= state.era) throw new RecoveryCompactionDeferredError("A released legacy reservation belongs to a future recovery era");
        }
        this.validateRecoveryState(state);
        return state;
    }

    /** Called only after the storage owner has durably installed the snapshot. */
    commitRecoveryCompaction(state: RecoveryState): void {
        if (JSON.stringify(state) !== JSON.stringify(this.recoveryCompactionState())) throw new Error("Recovery reservations changed during compaction");
        this.reservationEra = state.era;
        this.releasedRecoveryPins.clear();
    }

    /** Restore the compacted reservation state after replaying the document log. */
    replayRecoveryState(state: RecoveryState): void {
        if (this.reservationEra !== 0 || this.recoveryPins.size || this.releasedRecoveryPins.size) throw new Error("Recovery state must precede later reservation records");
        this.validateRecoveryState(state);
        this.reservationEra = state.era;
        for (const {actor, reservationId, pin} of state.active) this.recoveryPins.set(JSON.stringify([actor, reservationId]), pin);
    }

    private validateRecoveryState(state: RecoveryState): void {
        if (!state || typeof state !== "object" || JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(["active", "era"]) ||
            !Number.isSafeInteger(state.era) || state.era < 1 || !Array.isArray(state.active) ||
            Object.keys(state.active).length !== state.active.length) throw new Error("Invalid compacted recovery state");
        const keys = new Set<string>();
        for (const entry of state.active) {
            if (!entry || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(["actor", "pin", "reservationId"]) ||
                typeof entry.actor !== "string" || !entry.actor || typeof entry.reservationId !== "string" || !entry.reservationId ||
                !Number.isSafeInteger(entry.pin) || entry.pin <= this.lastGc || entry.pin > this.serverSeq + 1) throw new Error("Invalid compacted recovery reservation");
            const era = reservationEra(entry.reservationId);
            if (era === null || era >= state.era) throw new Error("Invalid compacted reservation era");
            const key = JSON.stringify([entry.actor, entry.reservationId]);
            if (keys.has(key)) throw new Error("Duplicate compacted recovery reservation");
            keys.add(key);
        }
    }

    connect(actor: string, seq: number): void {
        const peer = this.peers.get(actor);

        this.peers.set(actor, {seq: Math.max(peer?.seq ?? 0, seq), pin: peer?.pin ?? null, online: true, lastSeen: this.now()});
    }

    disconnect(actor: string): void {
        const peer = this.peers.get(actor);

        peer && Object.assign(peer, {online: false, lastSeen: this.now()});
    }

    ack({actor, serverSeq, pin}: Ack): void {
        const peer = this.peers.get(actor) ?? {seq: 0, pin: null, online: true, lastSeen: this.now()};

        Object.assign(peer, {seq: Math.max(peer.seq, serverSeq), pin, lastSeen: this.now()});
        this.peers.set(actor, peer);
    }

    /**
     * GC 기준점: 아직 기다려야 할 모든 참여자가 받은 곳, 그리고 그들의 핀 바로 앞 중 가장 이른 곳.
     * 이 이하 번호의 지우기는 모두가 보았고, 누구도 되돌리기로 취소할 수 없다.
     */
    frontier(): number {
        let f = this.serverSeq;

        for (const pin of this.recoveryPins.values()) f = Math.min(f, pin - 1);

        for (const peer of this.peers.values()) {
            if (!peer.online && this.now() - peer.lastSeen > this.lease) {
                continue;
            }

            f = Math.min(f, peer.seq, peer.pin === null ? Infinity : peer.pin - 1);
        }

        return f;
    }

    /** 압축할 묘비가 있으면 GC 줄을 로그에 넣는다 */
    gc(minStable = 1): Envelope | null {
        const f = this.frontier();

        if (f <= this.lastGc || this.doc.countStable(f, this.seqOf) < minStable) {
            return null;
        }

        const envelope: Envelope = {serverSeq: this.log.length + 1, gc: f};
        // Keep the document and frontier unchanged until durable storage accepts
        // the GC record, just as for an ordinary change.
        this.onAppend?.(structuredClone(envelope));
        try {
            this.doc.compact(f, this.seqOf);
            this.lastGc = f;
            this.append(envelope, false);
        } catch (error) {
            try { this.onPostPersistError?.(error); } catch { /* Preserve the uncertain outcome. */ }
            throw new PostPersistUncertainError(`Persisted GC may have been accepted: ${(error as Error).message}`);
        }

        return envelope;
    }

    /** 다시 켤 때: 저장된 GC 줄을 그대로 되풀이한다 */
    replayGc(frontier: number): void {
        for (const pin of this.recoveryPins.values()) {
            if (frontier >= pin) throw new Error("Stored GC crosses a recovery reservation");
        }
        this.doc.compact(frontier, this.seqOf);
        this.lastGc = frontier;
        this.append({serverSeq: this.log.length + 1, gc: frontier}, false);
    }

    // ── 그 밖 ─────────────────────────────────────────────────────────────

    since(serverSeq: number): Envelope[] {
        return structuredClone(this.log.slice(serverSeq));
    }

    /** Include a full snapshot for new clients or a different document generation. */
    hello(since: number, epoch?: string): ServerEvent {
        const snapshot = since === 0 || epoch !== this.epoch;
        return {
            type: "hello",
            protocol: PROTOCOL_VERSION,
            capabilities: [...DOCUMENT_CAPABILITIES],
            epoch: this.epoch,
            schemaVersion: this.schemaVersion,
            serverSeq: this.serverSeq,
            snapshot: snapshot ? this.doc.snapshot() : null,
            delSeqs: snapshot ? [...this.delSeq] : [],
            clientSeqs: snapshot ? [...this.lastSeq] : [],
            presence: [...this.presence.values()].map(presence => ({...presence})),
        };
    }

    setPresence(presence: Presence): void {
        this.presence.set(presence.actor, {...presence});
        this.emit({type: "presence", presence});
    }

    /** 연결이 끊겼다 — 커서는 감추되, 그 참여자의 GC 핀은 lease 동안 지켜 준다 */
    dropPresence(actor: string): void {
        this.presence.delete(actor) && this.emit({type: "leave", actor});
    }

    /** 참여자가 아주 떠났다 (창을 닫음) — 더 기다리지 않는다 */
    leave(actor: string): void {
        this.peers.delete(actor);
        this.dropPresence(actor);
    }

    /** 확인·시각화용: 참여자별 받은 곳과 핀 */
    peerInfo(): Array<{actor: string; seq: number; pin: number | null; online: boolean}> {
        return [...this.peers].map(([actor, p]) => ({actor, seq: p.seq, pin: p.pin, online: p.online}));
    }

    get lastFrontier(): number {
        return this.lastGc;
    }

    listen(listener: (event: ServerEvent) => void): () => void {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    /** 데모용: 문서를 비운다 */
    reset(generation: string | null = null): void {
        this.epoch = crypto.randomUUID();
        this.generation = generation;
        this.doc = new Doc("~server", this.schema);
        this.log = [];
        this.lastSeq.clear();
        this.acceptedChanges.clear();
        this.conditionalReceipts.clear();
        this.delSeq.clear();
        this.recoveryPins.clear();
        this.releasedRecoveryPins.clear();
        this.reservationEra = 0;
        this.lastGc = 0;
        this.peers.forEach(p => Object.assign(p, {seq: 0, pin: null}));
        this.emit({type: "reset", epoch: this.epoch});
    }

    private append(envelope: Envelope, persist = true): void {
        const stored = structuredClone(envelope);
        this.log.push(stored);
        persist && this.onAppend?.(structuredClone(stored));
        this.emit({type: "change", envelope: stored});
    }

    private emit(event: ServerEvent): void {
        this.listeners.forEach(listener => {
            try { listener(structuredClone(event)); }
            catch (error) {
                try { this.onListenerError?.(error); } catch { /* Observation must not affect the committed state. */ }
            }
        });
    }
}
