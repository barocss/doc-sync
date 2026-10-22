import {compareTicket, keyOf} from "./ticket.ts";
import type {Ticket} from "./ticket.ts";
import type {Op, Doc} from "./doc.ts";

/**
 * 참여자별 되돌리기·다시하기.
 *
 * 되돌리기는 과거로 돌아가는 것이 아니라 "반대 연산을 새로 만들어 보내는 것"이다. 그래서 남의 편집과 섞여도
 * 일반 연산처럼 합쳐진다. 지키는 약속:
 * - 내 편집만 되돌린다. 남이 그 사이 친 글자는 그대로 남는다.
 * - 지운 것을 되돌리면 **내가 한 그 지우기만** 취소한다. 남이 동시에 같은 글자를 지웠으면 그 글자는 계속 죽어 있다.
 * - 서식·블록 종류·속성은 그 사이 남이 다시 바꾸지 않았을 때만 되돌린다. 남의 나중 변경을 덮어쓰지 않는다.
 * - 표·행·열을 넣거나 지운 것도 같은 "살리고 죽이기" 걸음이다. 지운 열을 되돌리면 그 열의 칸 글도 함께 돌아온다.
 * - 이어 친 글자는 한 번에 되돌린다. 되돌린 뒤 커서는 편집 직전 자리로 간다.
 *
 * GC 와의 약속: 되돌리기·다시하기가 취소할 수 있는 내 지우기는 "핀"으로 서버에 알린다. 서버는 핀 이후의 묘비를
 * 압축하지 않는다 — 되살릴 수 있는 묘비를 버리는 일이 없다.
 */

type Step = {
    undo(doc: Doc): Op[];
    redo(doc: Doc): Op[];
    /** 이 걸음이 취소할 수 있는 내 지우기 (없으면 null) */
    pinned(): Ticket | null;
};

/** 토큰 묶음을 살리고 죽이는 걸음. 마지막으로 내가 한 지우기를 기억해 두었다가 그것만 취소한다 */
class ExistenceStep implements Step {
    private delAt: Ticket | null;
    private readonly ids: Ticket[];

    constructor(ids: Ticket[], delAt: Ticket | null) {
        this.ids = ids;
        this.delAt = delAt;
    }

    /** 넣은 걸음이면 지우고, 지운 걸음이면 되살린다 (다시하기도 같은 뒤집기다) */
    undo(doc: Doc): Op[] {
        return this.delAt ? this.revive(doc) : this.kill(doc);
    }

    redo(doc: Doc): Op[] {
        return this.undo(doc);
    }

    pinned(): Ticket | null {
        return this.delAt;
    }

    private kill(doc: Doc): Op[] {
        const at = doc.clock.next();
        const op: Op = {t: "del", at, ids: this.ids};

        doc.apply(op);
        this.delAt = at;

        return [op];
    }

    private revive(doc: Doc): Op[] {
        const op: Op = {t: "undel", at: doc.clock.next(), cancels: [this.delAt!], ids: this.ids};

        doc.apply(op);
        this.delAt = null;

        return [op];
    }
}

/**
 * 속성 쓰기(블록 종류·속성·글자 서식)를 되돌리는 걸음. 토큰마다 직전 값으로 — 그 사이 남이 다시 바꾼 토큰은 건드리지 않는다.
 * "남이 바꿨나"는 지금 값을 쓴 연산의 이름표가 내 것인지로 본다.
 */
class SetStep implements Step {
    private readonly key: string;
    private readonly value: unknown;
    private readonly targets: Array<{id: Ticket; before: unknown; mine: Ticket}>;

    constructor(op: Extract<Op, {t: "set"}>, before: Array<{id: Ticket; value: unknown}>) {
        this.key = op.key;
        this.value = op.value;
        this.targets = before.map(b => ({id: b.id, before: b.value ?? null, mine: op.at}));
    }

    undo(doc: Doc): Op[] {
        return this.set(doc, t => t.before);
    }

    redo(doc: Doc): Op[] {
        return this.set(doc, () => this.value);
    }

    pinned(): Ticket | null {
        return null;
    }

    private set(doc: Doc, valueOf: (t: {before: unknown}) => unknown): Op[] {
        const mine = this.targets.filter(t => {
            const current = doc.setTicket(t.id, this.key);

            return !!current && compareTicket(current, t.mine) === 0;
        });
        // 같은 값으로 돌아갈 토큰끼리 연산 하나로
        const groups = new Map<string, typeof mine>();

        mine.forEach(t => {
            const k = JSON.stringify(valueOf(t));

            groups.set(k, [...(groups.get(k) ?? []), t]);
        });

        return [...groups].map(([value, targets]) => {
            const op: Op = {t: "set", at: doc.clock.next(), ids: targets.map(t => t.id), key: this.key, value: JSON.parse(value)};

            doc.apply(op);
            targets.forEach(t => (t.mine = op.at));

            return op;
        });
    }
}

const idsOf = (op: Op): Ticket[] => {
    if (op.t === "text") {
        return [...op.text].map((_, i) => ({lamport: op.id.lamport + i, actor: op.id.actor}));
    }

    return op.t === "node" ? [op.id] : [];
};

type Group = {steps: Step[]; caretBefore: string; caretAfter: string; typing: boolean; at: number};

/** 되돌리기 칸 수. 오래된 칸은 버린다 — 핀이 영원히 GC 를 막지 않도록 */
const DEPTH = 100;

/** 이어 치기로 묶는 시간 */
const TYPING_WINDOW = 1500;

export type RecordOptions = {
    /** 편집 직전·직후 커서 (토큰 키) */
    caretBefore: string;
    caretAfter: string;
    /** 글자 입력이면 true — 바로 앞 입력에 이어 붙일 수 있다 */
    typing?: boolean;
};

export class History {
    private readonly undoStack: Group[] = [];
    private readonly redoStack: Group[] = [];

    /** 방금 한 내 편집을 쌓는다. 바로 앞 칸이 이어 치기였고 커서가 그 끝에 있으면 그 칸에 붙인다 */
    record(ops: Op[], doc: Doc, options: RecordOptions): void {
        const steps: Step[] = [];

        for (const op of ops) {
            if (op.t === "text" || op.t === "node") {
                steps.push(new ExistenceStep(idsOf(op), null));
            } else if (op.t === "del") {
                steps.push(new ExistenceStep(op.ids, op.at));
            } else if (op.t === "set") {
                steps.push(new SetStep(op, doc.priorOf(op)));
            }
        }

        if (!steps.length) {
            return;
        }

        const now = Date.now();
        const last = this.undoStack.at(-1);

        if (
            options.typing &&
            last?.typing &&
            last.caretAfter === options.caretBefore &&
            now - last.at < TYPING_WINDOW
        ) {
            last.steps.push(...steps);
            last.caretAfter = options.caretAfter;
            last.at = now;
        } else {
            this.undoStack.push({
                steps,
                caretBefore: options.caretBefore,
                caretAfter: options.caretAfter,
                typing: !!options.typing,
                at: now,
            });
            this.undoStack.length > DEPTH && this.undoStack.shift();
        }

        this.redoStack.length = 0;
    }

    /** 기록을 비운다 (예: 저장할 때). 핀이 풀려 GC 가 내 지난 지우기도 압축할 수 있게 된다 */
    clear(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /** @returns 보낼 연산과, 되돌린 뒤 커서를 둘 토큰 키 */
    undo(doc: Doc): {ops: Op[]; caret: string | null} {
        const group = this.undoStack.pop();

        if (!group) {
            return {ops: [], caret: null};
        }

        this.redoStack.push(group);

        return {ops: [...group.steps].reverse().flatMap(s => s.undo(doc)), caret: group.caretBefore};
    }

    redo(doc: Doc): {ops: Op[]; caret: string | null} {
        const group = this.redoStack.pop();

        if (!group) {
            return {ops: [], caret: null};
        }

        this.undoStack.push(group);

        return {ops: group.steps.flatMap(s => s.redo(doc)), caret: group.caretAfter};
    }

    /**
     * 되돌리기·다시하기가 취소할 수 있는 내 지우기 가운데 가장 이른 서버 번호. GC 는 이보다 앞에서만 한다.
     * 아직 서버에 안 들어간 지우기는 셀 필요가 없다 — 그 지우기는 어차피 GC 대상이 아니다.
     */
    pin(seqOf: (delKey: string) => number | undefined): number | null {
        let min: number | null = null;

        for (const group of [...this.undoStack, ...this.redoStack]) {
            for (const step of group.steps) {
                const at = step.pinned();
                const seq = at && seqOf(keyOf(at));

                if (seq !== undefined && seq !== null && (min === null || seq < min)) {
                    min = seq;
                }
            }
        }

        return min;
    }
}
