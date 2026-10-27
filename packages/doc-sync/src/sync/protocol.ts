import type {Op, Snapshot} from "../crdt/doc.ts";

/**
 * 동기화 프로토콜.
 *
 * 참여자는 자기 편집을 Change(연산 묶음)로 보낸다. 서버는 받은 순서대로 serverSeq 를 붙여 로그에 쌓고 모두에게
 * 퍼뜨린다. 서버의 순서가 곧 인과 순서다 — 누가 어떤 토큰을 기준으로 삼았다면 그 토큰은 이미 더 앞 번호로
 * 로그에 있기 때문이다. 그래서 참여자는 버전 벡터 없이 "마지막으로 받은 serverSeq" 하나만 기억하면 된다.
 *
 * GC 도 로그의 한 줄이다. 서버가 "frontier 까지 안정된 묘비를 압축하라"는 줄을 로그에 넣으면, 모든 복제본이 로그의
 * 같은 자리에서 같은 압축을 한다.
 */

/** Version 3 requires schema identity and retains the version 2 document capabilities. */
export const PROTOCOL_VERSION = 3 as const;
export const DOCUMENT_CAPABILITIES = Object.freeze(["placement-v1", "fields-v1", "annotations-v1", "cardinality-v1"] as const);

export type Change = {
    actor: string;
    /** 참여자별 1, 2, 3 … — 서버가 중복·누락을 가린다 */
    seq: number;
    ops: Op[];
};

export type Envelope =
    | {serverSeq: number; change: Change; gc?: undefined}
    | {serverSeq: number; gc: number; change?: undefined};

/**
 * 참여자가 서버에 알리는 "여기까지 받았다". GC 의 기준이 된다.
 * pin: 내 되돌리기·다시하기가 아직 취소할 수 있는 내 지우기 가운데 가장 이른 서버 번호 — 서버는 그 앞에서만 압축한다.
 *
 * Change 와 같은 줄(같은 순서)로 보낸다. 그래야 "되돌리기로 되살린 변경"보다 "더 이상 핀이 없다"는 알림이 먼저
 * 도착하는 일이 없다.
 */
export type Ack = {actor: string; serverSeq: number; pin: number | null};

export type Outbound = {kind: "change"; change: Change} | {kind: "ack"; ack: Ack};

export type Presence = {
    actor: string;
    name: string;
    color: string;
    /** 커서가 붙은 토큰 키 (그 토큰 바로 뒤) */
    anchor: string | null;
    /** 선택 영역의 다른 끝 */
    focus: string | null;
};

export type ServerEvent =
    /** Protocol 3 requires a nonempty epoch and an explicit schema identity or schema-free marker. */
    | {type: "hello"; protocol?: number; capabilities?: readonly string[]; epoch?: string; schemaVersion?: string | null; serverSeq: number; snapshot: Snapshot | null; delSeqs: Array<[string, number]>; presence: Presence[]; clientSeqs?: Array<[string, number]>}
    | {type: "change"; envelope: Envelope}
    | {type: "presence"; presence: Presence}
    | {type: "leave"; actor: string}
    /** The server changed the document schema. Clients must verify before sending more changes. */
    | {type: "schema"; schemaVersion: string}
    | {type: "reset"; epoch?: string};

/** 참여자 쪽에서 본 전송 계층. 메모리 안 시험용과 HTTP 용이 이것을 구현한다 */
export interface Transport {
    /**
     * 서버 이벤트를 받기 시작한다. since 이후의 변경만 받는다 (0 이면 스냅숏부터).
     * Pass the last accepted document epoch. A different epoch requires a full snapshot.
     * A schema version identifies the schema the client is prepared to use.
     * @returns 구독 끊기
     */
    subscribe(since: number, onEvent: (event: ServerEvent) => void, epoch?: string, schemaVersion?: string): () => void;
    /** 보낸 순서대로 서버에 닿아야 한다 */
    send(message: Outbound): Promise<void>;
    sendPresence(presence: Presence): void;
}
