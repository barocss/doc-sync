import {parseSplitBoundary} from "./text-storage.ts";
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

/** A split owns a logical break, while the original tail tokens remain stored. */
class SplitStep implements Step {
    private readonly before: SetState;
    private readonly after: SetState;
    private undone = false;
    private readonly id: Ticket;
    private readonly states: SetStates;
    private readonly slot: string;
    private readonly placement: MoveState;
    constructor(id: Ticket, into: string, after: string, states: SetStates, placement: MoveState) {
        this.placement = placement;
        this.id = id; this.states = states; this.slot = JSON.stringify([keyOf(id), "$join"]);
        this.after = states.initial(this.slot, null);
        this.before = {value: {into, after}, users: 1};
    }
    pinned(): Ticket | null { return null; }
    undo(doc: Doc): Op[] { return this.write(doc, true); }
    redo(doc: Doc): Op[] { return this.write(doc, false); }
    private write(doc: Doc, undo: boolean): Op[] {
        if (this.undone === undo) return [];
        const currentPlacement = doc.placementOf(this.id);
        if (!currentPlacement || compareTicket(currentPlacement.at, this.placement.at) !== 0) return [];
        const current = doc.setTicket(this.id, "$join"), source = undo ? this.after : this.before;
        if (current ? !source.at || compareTicket(current, source.at) !== 0 : !!source.at) return [];
        const target = undo ? this.before : this.after;
        const op: Op = {t: "set", at: doc.clock.next(), ids: [this.id], key: "$join", value: target.value};
        doc.apply(op); this.states.restore(this.slot, target, op.at); this.undone = undo; return [op];
    }
}

type MoveState = {parent: Ticket; after: Ticket | null; at: Ticket};
class MoveStep implements Step {
    private readonly before: MoveState;
    private readonly after: MoveState;
    private undone = false;
    private readonly target: Ticket;
    constructor(target: Ticket, op: Extract<Op, {t: "move"}>, before: MoveState, states: Map<string, MoveState>) {
        this.target = target;
        const cached = states.get(keyOf(target));
        this.before = cached && compareTicket(cached.at, before.at) === 0 ? cached : {...before};
        this.after = {parent: op.parent, after: op.after, at: op.at}; states.set(keyOf(target), this.after);
    }
    pinned(): Ticket | null { return null; }
    undo(doc: Doc): Op[] { return this.write(doc, true); }
    redo(doc: Doc): Op[] { return this.write(doc, false); }
    private write(doc: Doc, undo: boolean): Op[] {
        if (this.undone === undo) return [];
        const current = doc.placementOf(this.target), source = undo ? this.after : this.before;
        if (!current || compareTicket(current.at, source.at) !== 0) return [];
        const location = undo ? this.before : this.after;
        const op: Op = {t: "move", at: doc.clock.next(), target: this.target, parent: location.parent, after: location.after};
        doc.apply(op);
        // Suppressed movement records must still be replicated. Only a winning
        // inverse acquires ownership of the restored state.
        if (compareTicket(doc.placementOf(this.target)!.at, op.at) === 0) { location.at = op.at; this.undone = undo; }
        return [op];
    }
}

type SetState = {readonly value: unknown; at?: Ticket; users: number};

/** 같은 History 안에서 실제로 이어진 속성 상태만 공유한다. 값이나 actor의 일치로 연결하지 않는다. */
class SetStates {
    private readonly current = new Map<string, SetState>();

    initial(slot: string, value: unknown): SetState {
        const state = {value, users: 1}; this.current.set(slot, state); return state;
    }

    capture(slot: string, prior: {value: unknown; at?: Ticket}, op: Extract<Op, {t: "set"}>): {before: SetState; after: SetState} {
        const cached = this.current.get(slot);
        const same = cached && (cached.at ? !!prior.at && compareTicket(cached.at, prior.at) === 0 : !prior.at);
        const before = same ? cached : {value: prior.value ?? null, at: prior.at, users: 0};
        const after = {value: op.value, at: op.at, users: 1};

        before.users += 1;
        this.current.set(slot, after);

        return {before, after};
    }

    restore(slot: string, state: SetState, at: Ticket): void {
        state.at = at;
        this.current.set(slot, state);
    }

    release(slot: string, state: SetState): void {
        state.users -= 1;
        if (state.users === 0 && this.current.get(slot) === state) {
            this.current.delete(slot);
        }
    }

    clear(): void {
        this.current.clear();
    }
}

/** 속성 undo/redo는 현재 쓰기 ID를 검사한다. 자기 History가 복원한 상태의 새 ID는 연결된 이전/다음 걸음도 사용한다. */
class SetStep implements Step {
    private readonly key: string;
    private readonly states: SetStates;
    private readonly targets: Array<{id: Ticket; slot: string; before: SetState; after: SetState; undone: boolean}>;

    constructor(op: Extract<Op, {t: "set"}>, before: Array<{id: Ticket; value: unknown; at?: Ticket}>, states: SetStates) {
        this.key = op.key;
        this.states = states;
        this.targets = before.map(prior => {
            const slot = JSON.stringify([keyOf(prior.id), op.key]);

            return {id: prior.id, slot, ...states.capture(slot, prior, op), undone: false};
        });
    }

    undo(doc: Doc): Op[] {
        return this.set(doc, true);
    }

    redo(doc: Doc): Op[] {
        return this.set(doc, false);
    }

    pinned(): Ticket | null {
        return null;
    }

    release(): void {
        for (const target of this.targets) {
            this.states.release(target.slot, target.before);
            this.states.release(target.slot, target.after);
        }
    }

    private set(doc: Doc, undo: boolean): Op[] {
        const mine = this.targets.filter(t => {
            if (undo ? t.undone : !t.undone) {
                return false;
            }
            const current = doc.setTicket(t.id, this.key);
            const source = undo ? t.after : t.before;

            return !!current && !!source.at && compareTicket(current, source.at) === 0;
        });
        // 같은 값으로 돌아갈 토큰끼리 연산 하나로
        const groups = new Map<string, typeof mine>();

        mine.forEach(t => {
            const k = JSON.stringify((undo ? t.before : t.after).value);

            const group = groups.get(k);

            if (group) {
                group.push(t);
            } else {
                groups.set(k, [t]);
            }
        });

        return [...groups].map(([value, targets]) => {
            const op: Op = {t: "set", at: doc.clock.next(), ids: targets.map(t => t.id), key: this.key, value: JSON.parse(value)};

            doc.apply(op);
            targets.forEach(t => {
                this.states.restore(t.slot, undo ? t.before : t.after, op.at);
                t.undone = undo;
            });

            return op;
        });
    }
}

const idsOf = (op: Op): Ticket[] => {
    if (op.t === "text") {
        // Doc.apply creates one token per UTF-16 code unit, including both halves of a surrogate pair.
        return Array.from({length: op.text.length}, (_, i) => ({lamport: op.id.lamport + i, actor: op.id.actor}));
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
    private readonly setStates = new SetStates();
    private readonly moveStates = new Map<string, MoveState>();

    private release(group: Group): void {
        group.steps.forEach(step => step instanceof SetStep && step.release());
    }

    /** 방금 한 내 편집을 쌓는다. 바로 앞 칸이 이어 치기였고 커서가 그 끝에 있으면 그 칸에 붙인다 */
    record(ops: Op[], doc: Doc, options: RecordOptions): void {
        const steps: Step[] = [];

        for (const op of ops) {
            if (op.t === "text" || op.t === "node") {
                if (op.t === "node" && op.boundary?.startsWith("virtual:")) continue;
                const split = op.t === "node" && parseSplitBoundary(op.boundary ?? "");
                if (split) {
                    const movement = ops.find((candidate): candidate is Extract<Op, {t: "move"}> => candidate.t === "move" && keyOf(candidate.target) === keyOf(op.id));
                    const placement = movement ? {parent: movement.parent, after: movement.after, at: movement.at} : doc.placementOf(op.id)!;
                    this.moveStates.set(keyOf(op.id), placement);
                    steps.push(new SplitStep(op.id, split.into, split.after, this.setStates, placement)); continue;
                }
                steps.push(new ExistenceStep(idsOf(op), null));
            } else if (op.t === "del") {
                steps.push(new ExistenceStep(op.ids, op.at));
            } else if (op.t === "move") {
                const prior = doc.priorPlacementOf(op);
                const splitBirth = ops.find(candidate => candidate.t === "node" && keyOf(candidate.id) === keyOf(op.target) && parseSplitBoundary(candidate.boundary ?? ""));
                const firstSplitMove = splitBirth && ops.find(candidate => candidate.t === "move" && keyOf(candidate.target) === keyOf(op.target));
                if (prior && firstSplitMove !== op) steps.push(new MoveStep(op.target, op, prior, this.moveStates));
            } else if (op.t === "set") {
                steps.push(new SetStep(op, doc.priorOf(op), this.setStates));
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
            this.undoStack.length > DEPTH && this.release(this.undoStack.shift()!);
        }

        this.redoStack.forEach(group => this.release(group));
        this.redoStack.length = 0;
    }

    /** 기록을 비운다 (예: 저장할 때). 핀이 풀려 GC 가 내 지난 지우기도 압축할 수 있게 된다 */
    clear(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.setStates.clear();
        this.moveStates.clear();
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
