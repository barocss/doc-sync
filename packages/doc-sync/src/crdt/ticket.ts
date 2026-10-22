/**
 * 모든 항목·연산에 붙는 이름표. Lamport 시계 + 참여자 id.
 *
 * 순서가 전체 순서(total order)라서, 복제본이 달라도 같은 두 이름표는 언제나 같은 쪽이 크다.
 * CRDT 의 모든 "누가 이기나" 판단은 이것 하나로 한다.
 */
export type Ticket = {lamport: number; actor: string};

/** a 가 b 보다 크면 양수 */
export const compareTicket = (a: Ticket, b: Ticket): number =>
    a.lamport !== b.lamport ? a.lamport - b.lamport : a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0;

/** 지도·집합의 열쇠로 쓰는 문자열 */
export const keyOf = (t: Ticket): string => `${t.lamport}@${t.actor}`;

/** keyOf 의 반대. 참여자 이름에는 @ 가 없고, 자리 머리의 참여자 이름(`주인키/자리`)에는 있을 수 있어 첫 @ 에서 자른다 */
export const ticketOf = (key: string): Ticket => {
    const at = key.indexOf("@");

    return {lamport: Number(key.slice(0, at)), actor: key.slice(at + 1)};
};

/** 화면에 보일 짧은 이름 — `12A` 처럼 */
export const shortOf = (t: Ticket): string => (t.actor === "~root" ? "root" : `${t.lamport}${t.actor.slice(0, 1).toUpperCase()}`);

/** 문서 맨 앞 루트 문단 표지의 이름표. 모든 복제본이 같은 값을 쓴다 */
export const ROOT: Ticket = {lamport: 0, actor: "~root"};

/**
 * 복제본 하나의 Lamport 시계.
 *
 * 내가 만드는 이름표는 지금까지 본 어떤 이름표보다 크다 — 그래서 "나중에 만든 것"이 언제나 더 큰 이름표를 갖고,
 * 같은 자리에 동시에 넣은 것들의 순서를 이름표만으로 정할 수 있다.
 */
export class Clock {
    actor: string;
    lamport = 0;

    constructor(actor: string) {
        this.actor = actor;
    }

    next(): Ticket {
        this.lamport += 1;

        return {lamport: this.lamport, actor: this.actor};
    }

    /** 남의 이름표를 보면 시계를 그 뒤로 당긴다 */
    observe(t: Ticket): void {
        this.lamport = Math.max(this.lamport, t.lamport);
    }
}
