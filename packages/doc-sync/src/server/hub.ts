import {keyOf} from "../crdt/ticket.ts";
import {Doc} from "../crdt/doc.ts";
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

export type HubOptions = {
    /**
     * 문서 스키마. 주면 변경을 스키마로도 검사하고 모델(toJSON)을 계산할 수 있다. 없어도 순서 매기기·적용·GC 는
     * 똑같이 한다 — 서버는 블록 종류를 몰라도 된다.
     */
    schema?: Schema | null;
    /** 끊긴 참여자의 핀을 얼마나 지켜 줄지 (ms). 지나면 그 참여자를 기다리지 않고 GC 한다 */
    lease?: number;
    now?: () => number;
};

export class DocHub {
    /** A restart gets a new epoch; clients with unconfirmed edits must stop safely. */
    epoch = crypto.randomUUID();
    doc: Doc;
    log: Envelope[] = [];
    private readonly lastSeq = new Map<string, number>();
    /** 지우기 연산 이름표 → 그 지우기가 들어간 서버 번호 */
    private readonly delSeq = new Map<string, number>();
    private readonly peers = new Map<string, Peer>();
    private lastGc = 0;
    readonly presence = new Map<string, Presence>();
    private readonly listeners = new Set<(event: ServerEvent) => void>();
    private readonly lease: number;
    private readonly now: () => number;
    /** 로그에 새 항목이 붙을 때 (영속 저장용) */
    onAppend: ((envelope: Envelope) => void) | null = null;

    private readonly schema: Schema | null;

    constructor(options: HubOptions = {}) {
        this.schema = options.schema ?? null;
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
    submit(change: Change): Envelope | null {
        const last = this.lastSeq.get(change.actor) ?? 0;

        if (change.seq <= last) {
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
        change.ops.forEach(op => this.doc.apply(op));

        const envelope: Envelope = {serverSeq: this.log.length + 1, change};

        change.ops.forEach(op => op.t === "del" && this.delSeq.set(keyOf(op.at), envelope.serverSeq));
        this.append(envelope);
        this.lastSeq.set(change.actor, change.seq);

        return envelope;
    }

    // ── GC ────────────────────────────────────────────────────────────────

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

        this.doc.compact(f, this.seqOf);
        this.lastGc = f;

        const envelope: Envelope = {serverSeq: this.log.length + 1, gc: f};

        this.append(envelope);

        return envelope;
    }

    /** 다시 켤 때: 저장된 GC 줄을 그대로 되풀이한다 */
    replayGc(frontier: number): void {
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
    reset(): void {
        this.epoch = crypto.randomUUID();
        this.doc = new Doc("~server", this.schema);
        this.log = [];
        this.lastSeq.clear();
        this.delSeq.clear();
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
        this.listeners.forEach(listener => listener(structuredClone(event)));
    }
}
