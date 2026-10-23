import {Doc, MAIN} from "../crdt/doc.ts";
import {anchorAt, pathAt, posOfPath} from "../crdt/edit.ts";
import {applyEdit, applyEdits, diffModels, runsToUnits} from "../crdt/model.ts";
import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {SyncClient} from "../sync/client.ts";

/** Native editor points use UTF-16 offsets, with one position per inline node. */
export type ModelRange = {anchor: ModelPath; focus: ModelPath};
export type AnchoredRange = {anchor: string; focus: string};
export const sameModel = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Keep composition edits on their original token identities while remote receipt stays live. */
export class InputSession {
    readonly client: SyncClient;
    private fork: Doc | null = null;
    private pending: Array<{ops: Op[]; record?: RecordOptions | null}> = [];

    constructor(client: SyncClient) { this.client = client; }
    get active(): boolean { return this.fork !== null; }
    get doc(): Doc { this.reserveClock(); return this.fork ?? this.client.doc; }

    reserveClock(): void {
        if (!this.fork) return;
        const lamport = Math.max(this.fork.clock.lamport, this.client.doc.clock.lamport);
        this.fork.clock.lamport = lamport;
        this.client.doc.clock.lamport = lamport;
    }

    begin(): void {
        if (this.fork) return;
        this.fork = Doc.fromSnapshot(this.client.actor, this.client.doc.snapshot(), this.client.schema);
        this.pending = [];
    }

    end(): Op[] {
        if (!this.fork) return [];
        this.reserveClock();
        const ops = this.pending.flatMap(change => change.ops);
        const first = this.pending[0]?.record;
        const last = this.pending.at(-1)?.record;
        this.client.doc.emit(ops);
        this.client.commit(ops, {caretBefore: first?.caretBefore ?? "", caretAfter: last?.caretAfter ?? "", typing: false});
        this.cancel();
        return ops;
    }

    cancel(): void { this.fork = null; this.pending = []; }

    commit(ops: Op[], record?: RecordOptions | null): void {
        if (this.fork) {
            this.reserveClock();
            if (ops.length) this.pending.push({ops, record});
        } else if (record === undefined) this.client.commit(ops);
        else this.client.commit(ops, record);
    }

    capture(range: ModelRange | null): AnchoredRange | null {
        if (!range) return null;
        const doc = this.doc;
        const valid = (path: ModelPath) => {
            if (path.length < 2 || path.some(value => !Number.isInteger(value) || value < 0)) return null;
            const pos = posOfPath(doc, path);
            return pos && pos.o === path.at(-1) && doc.visible(pos.line ?? MAIN) ? anchorAt(doc, path) : null;
        };
        const anchor = valid(range.anchor), focus = valid(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }

    resolve(range: AnchoredRange | null): ModelRange | null {
        if (!range) return null;
        const doc = this.client.doc;
        const resolve = (key: string) => {
            const item = doc.get(key);
            const visible = doc.hasMoves || doc.hasCardinality ? doc.tokenLocation(key)?.visible : item && doc.visible(item.line.key);
            return item && visible ? pathAt(doc, key) : null;
        };
        const anchor = resolve(range.anchor), focus = resolve(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
}

/** Prefer semantic split/merge when a model transition has that exact meaning. */
export function modelEdits(schema: Schema, before: NodeJSON, after: NodeJSON): EditOp[] {
    const matches = (edit: EditOp): boolean => {
        try { return sameModel(applyEdits(schema, before, [edit]), after); }
        catch { return false; }
    };
    const visit = (left: NodeJSON, right: NodeJSON, path: ModelPath): EditOp[] | null => {
        const a = left.children ?? [], b = right.children ?? [];
        if (b.length === a.length + 1) {
            for (let i = 0; i < a.length; i++) {
                if (schema.nodes[a[i].type]?.shape !== "text" || !b[i]?.runs || !b[i + 1]?.runs) continue;
                const edit: EditOp = {op: "split", at: [...path, i, runsToUnits(schema, b[i].runs).length]};
                if (matches(edit)) return [edit];
            }
        }
        if (a.length === b.length + 1) {
            for (let i = 1; i < a.length; i++) {
                if (schema.nodes[a[i].type]?.shape !== "text") continue;
                const edit: EditOp = {op: "merge", at: [...path, i]};
                if (matches(edit)) return [edit];
            }
        }
        if (a.length === b.length && a.length > 1) {
            const changed = a.flatMap((node, index) => sameModel(node, b[index]) ? [] : [index]);
            if (changed.length > 1) {
                const first = changed[0], last = changed.at(-1)!;
                for (const [from, at] of [[first, last], [last, first]]) {
                    const edit: EditOp = {op: "move", from: [...path, from], at: [...path, at]};
                    if (matches(edit)) return [edit];
                }
            }
        }
        if (a.length === b.length) for (let i = 0; i < a.length; i++) {
            if (sameModel(a[i], b[i])) continue;
            const edits = visit(a[i], b[i], [...path, i]);
            if (edits) return edits;
        }
        return null;
    };
    return visit(before, after, []) ?? diffModels(schema, before, after);
}

/** Model diffs count code points; Doc.edit consumes UTF-16 token offsets. */
export function commitModelEdits(doc: Doc, before: NodeJSON, edits: EditOp[]): Op[] {
    const work = structuredClone(before);
    const mapped: EditOp[] = [];
    for (const edit of edits) {
        let parent: NodeJSON | undefined = work;
        for (const index of edit.at.slice(0, -1)) parent = parent?.children?.[index];
        let next = edit;
        const target = edit.at.length ? parent?.children?.[edit.at.at(-1)!] : work;
        if (edit.op === "update" && target && doc.schema!.nodes[target.type]?.shape === "cell") {
            const attrs = {...edit.attrs};
            if (attrs.rowspan === null) attrs.rowspan = 1;
            if (attrs.colspan === null) attrs.colspan = 1;
            next = {...edit, attrs};
        }
        if (parent?.runs && edit.op !== "merge") {
            const units = runsToUnits(doc.schema!, parent.runs);
            const size = (from: number, count: number) => units.slice(from, from + count).reduce((sum, unit) => sum + ("ch" in unit ? unit.ch.length : 1), 0);
            const start = edit.at.at(-1)!;
            next = {...edit, at: [...edit.at.slice(0, -1), size(0, start)]};
            if (next.op === "delete" && edit.op === "delete") next.count = size(start, edit.count);
            if (next.op === "update" && edit.op === "update" && edit.length !== undefined) next.length = size(start, edit.length);
        }
        mapped.push(next);
        applyEdit(doc.schema!, work, edit);
    }
    // Validate movement batches on a disposable replica before changing live state.
    // Native editors can normalize several operations in one update.
    if (mapped.some(edit => edit.op === "move")) {
        Doc.fromSnapshot(doc.clock.actor, doc.snapshot(), doc.schema).edit(mapped);
    }
    return doc.edit(mapped).ops;
}

type Observer = {
    beforeEvent?: NonNullable<SyncClient["onEvent"]>;
    modelEvents?: NonNullable<SyncClient["onModelEvents"]>;
    update?: NonNullable<SyncClient["onUpdate"]>;
};
type Subscription = {observers: Set<Observer>; restore: () => void};
const subscriptions = new WeakMap<SyncClient, Subscription>();

/** Preserve application callbacks and remove only this observer on disposal. */
export function subscribeClient(client: SyncClient, observer: Observer): () => void {
    let state = subscriptions.get(client);
    if (!state) {
        const event = client.onEvent, model = client.onModelEvents, update = client.onUpdate;
        const observers = new Set<Observer>();
        const eventHook: NonNullable<SyncClient["onEvent"]> = value => { event?.(value); for (const item of [...observers]) item.beforeEvent?.(value); };
        const modelHook: NonNullable<SyncClient["onModelEvents"]> = (events, info) => { model?.(events, info); for (const item of [...observers]) item.modelEvents?.(events, info); };
        const updateHook = () => { update?.(); for (const item of [...observers]) item.update?.(); };
        client.onEvent = eventHook; client.onModelEvents = modelHook; client.onUpdate = updateHook;
        state = {observers, restore: () => {
            if (client.onEvent === eventHook) client.onEvent = event;
            if (client.onModelEvents === modelHook) client.onModelEvents = model;
            if (client.onUpdate === updateHook) client.onUpdate = update;
        }};
        subscriptions.set(client, state);
    }
    const current = state;
    current.observers.add(observer);
    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        current.observers.delete(observer);
        if (!current.observers.size) {
            current.restore();
            if (subscriptions.get(client) === current) subscriptions.delete(client);
        }
    };
}
