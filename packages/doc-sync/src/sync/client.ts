import {keyOf} from "../crdt/ticket.ts";
import {Doc} from "../crdt/doc.ts";
import {History} from "../crdt/history.ts";
import {applyEdits, diffModels} from "../crdt/model.ts";
import {checkSchema} from "../crdt/schema.ts";
import {textEventScopes} from "./model-events.ts";
import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
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

export class SyncClient {
    doc: Doc;
    history = new History();
    readonly actor: string;
    online = false;
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
    readonly schema: Schema;

    constructor(actor: string, transport: Transport, options: ClientOptions) {
        const problems = checkSchema(options.schema);

        if (problems.length) {
            throw new Error(`스키마가 맞지 않는다: ${problems.join("; ")}`);
        }

        this.actor = actor;
        this.transport = transport;
        this.schema = options.schema;
        this.ackDelay = options.ackDelay ?? 0;
        this.doc = this.attach(new Doc(actor, this.schema));
    }

    /** 문서를 갈아 끼울 때마다 내 편집 알림을 잇는다 */
    private attach(doc: Doc): Doc {
        // 구독자가 없으면 normalize 를 위한 모델 계산도 필요 없다. 명시한 normalize 옵션은 Doc.edit 이 지킨다.
        doc.editListener = this.localEdits ? (edits, normalize) => this.localEdits?.(edits, normalize) : null;

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

            events = diffModels(this.schema, before!, after);

            if (JSON.stringify(applyEdits(this.schema, before!, events)) !== JSON.stringify(after)) {
                events = replaceAll(before!, after);
                fallback = true;
            }
        }

        if (!events.length) {
            return result;
        }

        this.eventStats.changes += 1;
        this.eventStats.events += events.length;
        fallback && (this.eventStats.fallbacks += 1);
        this.onModelEvents(events, {cause, fallback});

        return result;
    }

    readonly seqOf = (delKey: string): number | undefined => this.delSeq.get(delKey);

    // ── 연결 ──────────────────────────────────────────────────────────────

    connect(): void {
        if (this.online) {
            return;
        }

        this.online = true;
        // 다시 이어질 때는 확인 안 된 변경을 모두 다시 보낸다 (서버가 중복을 거른다)
        this.outbox = this.pending.map(change => ({kind: "change", change}));
        this.unsubscribe = this.transport.subscribe(this.serverSeq, event => this.receive(event));
        this.flush();
        this.onUpdate?.();
    }

    disconnect(): void {
        if (!this.online) {
            return;
        }

        this.online = false;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.onUpdate?.();
    }

    // ── 내 편집 ───────────────────────────────────────────────────────────

    /**
     * 이미 내 문서에 적용된 연산을 서버로 보낼 줄에 세운다.
     * @param record 되돌리기 기록에 남길 때 그 정보. 되돌리기가 만든 연산은 null
     */
    commit(ops: Op[], record: RecordOptions | null = {caretBefore: "", caretAfter: ""}): void {
        if (!ops.length) {
            return;
        }

        record && this.history.record(ops, this.doc, record);
        this.seq += 1;

        const change: Change = {actor: this.actor, seq: this.seq, ops};

        this.pending.push(change);
        this.outbox.push({kind: "change", change});
        this.flush();
        this.onUpdate?.();
    }

    /** @returns 되돌린 뒤 커서를 둘 토큰 키 */
    undo(): string | null {
        const {ops, caret} = this.withEvents("undo", () => this.history.undo(this.doc));

        this.commit(ops, null);

        return caret;
    }

    redo(): string | null {
        const {ops, caret} = this.withEvents("redo", () => this.history.redo(this.doc));

        this.commit(ops, null);

        return caret;
    }

    /** 되돌리기 기록을 비운다 — 핀이 풀렸다고 서버에 바로 알린다 */
    clearHistory(): void {
        this.history.clear();
        this.scheduleAck();
    }

    setPresence(presence: Omit<Presence, "actor">): void {
        this.online && this.transport.sendPresence({...presence, actor: this.actor});
    }

    /** 줄에 선 것을 차례로 하나씩 보낸다. 끊기면 멈추고, 다시 이어질 때 확인 안 된 변경부터 다시 보낸다 */
    private async flush(): Promise<void> {
        if (this.sending) {
            return;
        }

        this.sending = true;

        try {
            while (this.online && this.outbox.length) {
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

    private receive(event: ServerEvent): void {
        this.onEvent?.(event);

        switch (event.type) {
            case "hello": {
                if (event.snapshot) {
                    // 처음 붙을 때: 서버 문서를 통째로 받고, 그 위에 내가 먼저 한 편집이 있으면 다시 얹는다
                    const accepted = event.clientSeqs?.find(([actor]) => actor === this.actor)?.[1] ?? 0;
                    this.pending = this.pending.filter(change => change.seq > accepted);
                    this.outbox = this.outbox.filter(message => message.kind !== "change" || message.change.seq > accepted);
                    const mine = this.pending.flatMap(c => c.ops);
                    const snapshot = event.snapshot;

                    this.withEvents("snapshot", () => {
                        this.doc = this.attach(Doc.fromSnapshot(this.actor, snapshot, this.schema));
                        mine.forEach(op => this.doc.apply(op));
                    });
                    event.delSeqs.forEach(([k, s]) => this.delSeq.set(k, s));
                    // 스냅숏이 거기까지를 담고 있다. 스냅숏 없이 다시 이어진 경우는 뒤따라 오는 밀린 변경들이 번호를 올린다
                    this.serverSeq = event.serverSeq;
                }

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
            case "reset":
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

        this.onUpdate?.();
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
