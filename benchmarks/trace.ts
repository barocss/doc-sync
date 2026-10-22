/**
 * 편집 대본 — 엔진과 무관한 문단 목록 위의 편집. 같은 씨앗이면 같은 대본이다.
 *
 *   ins   b 번째 문단 o 자리에 글 s
 *   del   b 번째 문단 o 자리부터 n 글자
 *   split b 번째 문단을 o 자리에서 나눈다 (Enter)
 *   merge b 번째 문단을 앞 문단에 붙인다 (문단 맨 앞 Backspace)
 *
 * 사람이 쓰는 모양을 흉내 낸다: 대부분 커서 자리에서 한 글자씩 치고, 가끔 Enter·Backspace·커서 옮기기·범위 지우기·붙여 넣기.
 * 참조 모델(문자열 배열)을 함께 굴려 마지막 글을 엔진 결과와 맞춰 본다.
 */

export type TraceOp =
    | {t: "ins"; b: number; o: number; s: string}
    | {t: "del"; b: number; o: number; n: number}
    | {t: "split"; b: number; o: number}
    | {t: "merge"; b: number};

export type Trace = {ops: TraceOp[]; final: string[]};

export const rng = (seed: number): (() => number) => {
    let s = seed;

    return () => {
        s = (s + 0x6d2b79f5) | 0;

        let t = s;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const ALPHABET = "abcdefghijklmnopqrstuvwxyz     가나다라마바사아자차카타파하는이에를";

/** 글자 수가 chars 에 이를 때까지 대본을 만든다 */
export const makeTrace = (chars: number, seed = 1): Trace => {
    const random = rng(seed);
    const pick = (n: number): number => Math.floor(random() * n);
    const word = (n: number): string => Array.from({length: n}, () => ALPHABET[pick(ALPHABET.length)]).join("");
    const doc: string[] = [""];
    const ops: TraceOp[] = [];
    let total = 0;
    let b = 0;
    let o = 0;

    const push = (op: TraceOp): void => {
        ops.push(op);

        if (op.t === "ins") {
            doc[op.b] = doc[op.b].slice(0, op.o) + op.s + doc[op.b].slice(op.o);
            total += op.s.length;
        } else if (op.t === "del") {
            doc[op.b] = doc[op.b].slice(0, op.o) + doc[op.b].slice(op.o + op.n);
            total -= op.n;
        } else if (op.t === "split") {
            doc.splice(op.b + 1, 0, doc[op.b].slice(op.o));
            doc[op.b] = doc[op.b].slice(0, op.o);
        } else {
            doc[op.b - 1] += doc[op.b];
            doc.splice(op.b, 1);
        }
    };

    while (total < chars) {
        const r = random();

        if (r < 0.8) {
            push({t: "ins", b, o, s: ALPHABET[pick(ALPHABET.length)]});
            o += 1;

            // 문단 길이 40~120 자 근처에서 Enter
            if (doc[b].length > 40 && o === doc[b].length && random() < 0.02) {
                push({t: "split", b, o});
                b += 1;
                o = 0;
            }
        } else if (r < 0.88) {
            if (o > 0) {
                push({t: "del", b, o: o - 1, n: 1});
                o -= 1;
            } else if (b > 0) {
                const join = doc[b - 1].length;

                push({t: "merge", b});
                b -= 1;
                o = join;
            }
        } else if (r < 0.93) {
            b = pick(doc.length);
            o = pick(doc[b].length + 1);
        } else if (r < 0.95) {
            if (o < doc[b].length) {
                push({t: "del", b, o, n: Math.min(doc[b].length - o, 1 + pick(20))});
            }
        } else if (r < 0.96) {
            const s = word(50 + pick(250));

            push({t: "ins", b, o, s});
            o += s.length;
        } else if (r < 0.975) {
            push({t: "split", b, o});
            b += 1;
            o = 0;
        }
    }

    return {ops, final: doc};
};
