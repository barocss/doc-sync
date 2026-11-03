import {compareTicket, keyOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";

const AXIS_RECORD_PROTOTYPES = Object.freeze([Object.prototype, null]);
const AXIS_TICKET_FIELDS = Object.freeze(["lamport", "actor"]);
const AXIS_ID_FIELDS = Object.freeze(["source", "offset"]);
const AXIS_SPAN_FIELDS = Object.freeze(["source", "start", "count"]);
const INSERT_ACTION_FIELDS = Object.freeze(["kind", "at", "before", "count"]);
const VISIBILITY_ACTION_FIELDS = Object.freeze(["kind", "at", "targets", "visible"]);
const MOVE_ACTION_FIELDS = Object.freeze(["kind", "at", "targets", "before"]);
const TOGGLE_ACTION_FIELDS = Object.freeze(["kind", "at", "target", "active"]);

/** An offset within an immutable initial or inserted run. */
export interface AxisId {source: string; offset: number}
export interface AxisSpan {source: string; start: number; count: number}
export type AxisAction =
    | {kind: "insert"; at: Ticket; before: AxisId | null; count: number}
    | {kind: "visibility"; at: Ticket; targets: AxisSpan[]; visible: boolean}
    | {kind: "move"; at: Ticket; targets: AxisSpan[]; before: AxisId | null}
    | {kind: "toggle"; at: Ticket; target: Ticket; active: boolean};
type Run = AxisSpan & {visible: boolean; enabled: boolean};
const LIMIT = 10_000;
const INITIAL = "initial";
const copy = <T>(value: T): T => structuredClone(value);
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" &&
    !Array.isArray(value) && AXIS_RECORD_PROTOTYPES.includes(Object.getPrototypeOf(value));
function fail(message: string): never { throw new Error(`Interval axis: ${message}`); }
function keys(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
    if (!record(value)) fail("invalid object");
    const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(value);
    if (own.length !== names.length || own.some(key => typeof key !== "string" || !names.includes(key) ||
        !descriptors[key].enumerable || !("value" in descriptors[key]))) fail("invalid object fields");
}
function ticket(value: unknown): asserts value is Ticket {
    keys(value, AXIS_TICKET_FIELDS);
    if (!integer(value.lamport, 1) || typeof value.actor !== "string" || !/^[\w~-]{1,128}$/.test(value.actor) || value.actor === "~root") fail("invalid ticket");
}
function sourceTicket(value: unknown): Ticket | null {
    if (value === INITIAL) return null;
    if (typeof value !== "string") fail("invalid source");
    const match = /^([1-9][0-9]*)@([\w~-]{1,128})$/.exec(value);
    if (!match) fail("invalid source");
    const at = {lamport: Number(match[1]), actor: match[2]};
    ticket(at);
    if (keyOf(at) !== value) fail("invalid source");
    return at;
}
export function axisSource(at: Ticket): string { ticket(at); return keyOf(at); }
export function assertAxisId(value: unknown): asserts value is AxisId {
    keys(value, AXIS_ID_FIELDS);
    sourceTicket(value.source);
    if (!integer(value.offset)) fail("invalid ID offset");
}
function before(value: unknown, at: Ticket): void {
    if (value === null) return;
    assertAxisId(value);
    const origin = sourceTicket(value.source);
    if (origin && origin.lamport >= at.lamport) fail("forward ID reference");
}
function spans(value: unknown, at: Ticket): asserts value is AxisSpan[] {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > LIMIT ||
        Reflect.ownKeys(value).length !== value.length + 1) fail("invalid target spans");
    const grouped = new Map<string, AxisSpan[]>();
    let total = 0;
    for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid target span descriptor");
        const span = descriptor.value;
        keys(span, AXIS_SPAN_FIELDS);
        const origin = sourceTicket(span.source);
        if (origin && origin.lamport >= at.lamport) fail("forward span reference");
        if (!integer(span.start) || !integer(span.count, 1) || span.start > Number.MAX_SAFE_INTEGER - span.count) fail("invalid target span bounds");
        total += span.count;
        if (!Number.isSafeInteger(total)) fail("target count overflow");
        const list = grouped.get(span.source as string) ?? [];
        list.push(span as unknown as AxisSpan); grouped.set(span.source as string, list);
    }
    for (const list of grouped.values()) {
        list.sort((a, b) => a.start - b.start);
        if (list.some((span, index) => index > 0 && span.start < list[index - 1].start + list[index - 1].count)) fail("overlapping target spans");
    }
}
/** Checks wire shape without requiring causal delivery of referenced births. */
export function assertAxisAction(value: unknown): asserts value is AxisAction {
    if (!record(value)) fail("invalid action");
    const kind = Object.getOwnPropertyDescriptor(value, "kind");
    if (!kind?.enumerable || !("value" in kind)) fail("invalid action kind");
    if (kind.value === "insert") {
        keys(value, INSERT_ACTION_FIELDS); ticket(value.at); before(value.before, value.at);
        if (!integer(value.count, 1)) fail("invalid insert count");
    } else if (kind.value === "visibility") {
        keys(value, VISIBILITY_ACTION_FIELDS); ticket(value.at); spans(value.targets, value.at);
        if (typeof value.visible !== "boolean") fail("invalid visibility");
    } else if (kind.value === "move") {
        keys(value, MOVE_ACTION_FIELDS); ticket(value.at); spans(value.targets, value.at); before(value.before, value.at);
        const anchor = value.before as AxisId | null;
        if (anchor && value.targets.some(span => span.source === anchor.source && anchor.offset >= span.start && anchor.offset < span.start + span.count)) fail("move anchor is a target");
    } else if (kind.value === "toggle") {
        keys(value, TOGGLE_ACTION_FIELDS); ticket(value.at); ticket(value.target);
        if (value.at.actor !== value.target.actor || value.target.lamport >= value.at.lamport || typeof value.active !== "boolean") fail("invalid history target");
    } else fail("unknown action kind");
}
function canonicalAxisId(value: AxisId | null): [string, number] | null {
    return value && [value.source, value.offset];
}
function canonical(action: AxisAction): string {
    const at = [action.at.lamport, action.at.actor];
    if (action.kind === "insert") return JSON.stringify([action.kind, at, canonicalAxisId(action.before), action.count]);
    if (action.kind === "toggle") return JSON.stringify([action.kind, at, [action.target.lamport, action.target.actor], action.active]);
    return JSON.stringify([action.kind, at, action.targets.map(span => [span.source, span.start, span.count]), action.kind === "move" ? canonicalAxisId(action.before) : action.visible]);
}
function coalesce(runs: Run[]): Run[] {
    const result: Run[] = [];
    for (const run of runs) {
        const last = result.at(-1);
        if (last && last.source === run.source && last.start + last.count === run.start && last.visible === run.visible && last.enabled === run.enabled) last.count += run.count;
        else result.push({...run});
    }
    return result;
}
/** Splits only at touched boundaries. It never enumerates IDs in a span. */
function partition(runs: Run[], targets: AxisSpan[]): Array<{run: Run; selected: boolean}> {
    const grouped = new Map<string, AxisSpan[]>();
    for (const target of targets) {
        const list = grouped.get(target.source) ?? [];
        list.push(target); grouped.set(target.source, list);
    }
    const result: Array<{run: Run; selected: boolean}> = [];
    for (const run of runs) {
        const end = run.start + run.count;
        const matching = (grouped.get(run.source) ?? []).filter(target => target.start < end && target.start + target.count > run.start);
        const cuts = [...new Set([run.start, end, ...matching.flatMap(target => [Math.max(run.start, target.start), Math.min(end, target.start + target.count)])])].sort((a, b) => a - b);
        for (let index = 1; index < cuts.length; index++) {
            const start = cuts[index - 1];
            result.push({run: {...run, start, count: cuts[index] - start}, selected: matching.some(target => start >= target.start && start < target.start + target.count)});
        }
    }
    return result;
}
function place(runs: Run[], moved: Run[], anchor: AxisId | null): Run[] | null {
    if (anchor === null) return [...runs, ...moved];
    const index = runs.findIndex(run => run.source === anchor.source && anchor.offset >= run.start && anchor.offset < run.start + run.count);
    if (index < 0) return null;
    const run = runs[index], split = anchor.offset - run.start;
    return [...runs.slice(0, index), ...(split ? [{...run, count: split}] : []), ...moved,
        {...run, start: anchor.offset, count: run.count - split}, ...runs.slice(index + 1)];
}

/** Experimental operation-set axis. Replaying the total Ticket order makes
 * concurrent moves deterministic without predecessor graphs or move cycles.
 * Storage scales with edits and interval boundaries, not logical axis length.
 */
export class IntervalAxis {
    private initialCount: number;
    private ledger = new Map<string, AxisAction>();
    private births = new Map<string, number>();
    private runs: Run[];
    private visibleCount: number;
    private totalCount: number;

    constructor(initialCount: number) {
        if (!integer(initialCount)) fail("invalid initial count");
        this.initialCount = initialCount; this.visibleCount = initialCount; this.totalCount = initialCount;
        this.births.set(INITIAL, initialCount);
        this.runs = initialCount ? [{source: INITIAL, start: 0, count: initialCount, visible: true, enabled: true}] : [];
    }
    get length(): number { return this.visibleCount; }
    idAt(index: number): AxisId {
        if (!integer(index) || index >= this.length) fail("index outside visible extent");
        let remaining = index;
        for (const run of this.runs) if (run.visible && run.enabled) {
            if (remaining < run.count) return {source: run.source, offset: run.start + remaining};
            remaining -= run.count;
        }
        return fail("invalid interval state");
    }
    has(id: AxisId): boolean {
        assertAxisId(id);
        return id.offset < (this.births.get(id.source) ?? 0);
    }
    indexOf(id: AxisId): number {
        assertAxisId(id);
        let index = 0;
        for (const run of this.runs) {
            if (run.source === id.source && id.offset >= run.start && id.offset < run.start + run.count) return run.visible && run.enabled ? index + id.offset - run.start : -1;
            if (run.visible && run.enabled) index += run.count;
        }
        return -1;
    }
    spans(index: number, count: number): AxisSpan[] {
        if (!integer(index) || !integer(count) || index > this.length || count > this.length - index) fail("range outside visible extent");
        const result: AxisSpan[] = [];
        let offset = 0;
        for (const run of this.runs) if (run.visible && run.enabled) {
            const start = Math.max(index, offset), end = Math.min(index + count, offset + run.count);
            if (start < end) {
                const span = {source: run.source, start: run.start + start - offset, count: end - start}, last = result.at(-1);
                if (last && last.source === span.source && last.start + last.count === span.start) last.count += span.count;
                else result.push(span);
                if (end === index + count) break;
            }
            offset += run.count;
        }
        if (result.length > LIMIT) fail("range has too many intervals");
        return result;
    }
    apply(actions: readonly AxisAction[]): void {
        if (!Array.isArray(actions) || Object.getPrototypeOf(actions) !== Array.prototype || actions.length > LIMIT || Reflect.ownKeys(actions).length !== actions.length + 1) fail("invalid action batch");
        const next = new Map(this.ledger);
        for (let index = 0; index < actions.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(actions, String(index));
            if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid action descriptor");
            const action = descriptor.value; assertAxisAction(action);
            const id = keyOf(action.at), known = next.get(id);
            if (known && canonical(known) !== canonical(action)) fail("conflicting action identity");
            if (!known) next.set(id, copy(action));
        }
        const births = new Map<string, number>([[INITIAL, this.initialCount]]);
        let total = this.initialCount;
        for (const action of next.values()) if (action.kind === "insert") {
            if (total > Number.MAX_SAFE_INTEGER - action.count) fail("axis count overflow");
            births.set(axisSource(action.at), action.count); total += action.count;
        }
        const validateId = (id: AxisId) => {
            const size = births.get(id.source);
            if (size !== undefined && id.offset >= size) fail("ID outside birth extent");
            const birth = id.source === INITIAL ? undefined : next.get(id.source);
            if (birth && birth.kind !== "insert") fail("ID source is not an insertion");
        };
        for (const action of next.values()) {
            if ((action.kind === "insert" || action.kind === "move") && action.before) validateId(action.before);
            if (action.kind === "visibility" || action.kind === "move") for (const target of action.targets) {
                validateId({source: target.source, offset: target.start + target.count - 1});
            }
            if (action.kind === "toggle" && next.get(keyOf(action.target))?.kind === "toggle") fail("history cannot target history");
        }
        const ordered = [...next.values()].sort((a, b) => compareTicket(a.at, b.at));
        const enabled = new Map<string, boolean>();
        for (const action of ordered) if (action.kind === "toggle") enabled.set(keyOf(action.target), action.active);
        let runs: Run[] = this.initialCount ? [{source: INITIAL, start: 0, count: this.initialCount, visible: true, enabled: true}] : [];
        for (const action of ordered) {
            if (action.kind === "toggle") continue;
            const active = enabled.get(keyOf(action.at)) ?? true;
            if (action.kind === "insert") {
                const placed = place(runs, [{source: axisSource(action.at), start: 0, count: action.count, visible: true, enabled: active}], action.before);
                if (placed) runs = coalesce(placed);
            } else if (active && action.kind === "visibility") {
                runs = coalesce(partition(runs, action.targets).map(({run, selected}) => selected ? {...run, visible: action.visible} : run));
            } else if (active && action.kind === "move") {
                const pieces = partition(runs, action.targets), selected = pieces.filter(piece => piece.selected).map(piece => piece.run);
                const remaining = pieces.filter(piece => !piece.selected).map(piece => piece.run);
                const placed = place(remaining, selected, action.before);
                if (placed) runs = coalesce(placed);
            }
        }
        this.ledger = next; this.births = births; this.totalCount = total; this.runs = runs;
        this.visibleCount = runs.reduce((sum, run) => sum + (run.visible && run.enabled ? run.count : 0), 0);
    }
    actions(): AxisAction[] { return copy([...this.ledger.values()].sort((a, b) => compareTicket(a.at, b.at))); }
    stats() { return {runs: this.runs.length, actions: this.ledger.size, total: this.totalCount, visible: this.visibleCount}; }
}
