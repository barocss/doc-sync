import type {Doc} from "../crdt/doc.ts";
import {applyEdits, diffModels, runsToUnits} from "../crdt/model.ts";
import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {SyncClient} from "../sync/client.ts";
import {createTypeScriptCompatibilitySession} from "./typescript-compatibility.ts";
import type {EngineInputSession} from "../engine/client-contract.ts";

/** Native editor points use UTF-16 offsets, with one position per inline node. */
export type ModelRange = {anchor: ModelPath; focus: ModelPath};
export type AnchoredRange = {anchor: string; focus: string};
export const sameModel = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Keep composition edits on their original token identities while remote receipt stays live. */
export class InputSession {
    readonly client: SyncClient;
    /** The selected engine owns the live and composition state. */
    readonly editing: EngineInputSession;

    constructor(client: SyncClient) {
        this.client = client;
        this.editing = client.engine ? client.engine.createSession() : createTypeScriptCompatibilitySession(client);
    }
    get active(): boolean { return this.editing.active; }
    /** Legacy TypeScript access. Portable editor hosts use editing instead. */
    get doc(): Doc {
        this.reserveClock();
        const session = this.editing as EngineInputSession & {typescriptDocument?: () => Doc};
        if (!session.typescriptDocument) throw new Error("The selected engine does not expose a TypeScript document");
        return session.typescriptDocument();
    }
    reserveClock(): void { this.editing.reserveClock(); }
    begin(): void { this.client.assertLocalEditing(); this.editing.begin(); }
    end(): Op[] {
        if (!this.active) return [];
        this.client.assertLocalEditing();
        const published = this.editing.publish();
        if (!published) return [];
        this.client.commit(published.ops, published.record);
        this.cancel();
        return published.ops;
    }
    cancel(): void { this.editing.cancel(); }
    commit(ops: Op[], record?: RecordOptions | null): void {
        this.client.assertLocalEditing();
        if (this.active) this.editing.collect(ops, record);
        else if (record === undefined) this.client.commit(ops);
        else this.client.commit(ops, record);
    }
    capture(range: ModelRange | null): AnchoredRange | null { return this.editing.capture(range); }
    resolve(range: AnchoredRange | null): ModelRange | null { return this.editing.resolve(range); }
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

export {commitModelEdits} from "../engine/editing.ts";

type Observer = {
    beforeEvent?: NonNullable<SyncClient["onEvent"]>;
    modelEvents?: NonNullable<SyncClient["onModelEvents"]>;
    update?: NonNullable<SyncClient["onUpdate"]>;
};
type Subscription = {observers: Set<Observer>; restore: () => void};
const subscriptions = new WeakMap<SyncClient, Subscription>();

/** Post-mutation observers must all see accepted state even if another consumer fails. */
function notifyObservers<T>(prior: ((value: T) => void) | null, observers: Set<Observer>, invoke: (observer: Observer, value: T) => void, value: T): void {
    const errors: unknown[] = [];
    try { prior?.(value); } catch (error) { errors.push(error); }
    for (const observer of [...observers]) {
        try { invoke(observer, value); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Editor observers failed", {cause: errors[0]});
}

/** Preserve application callbacks and remove only this observer on disposal. */
export function subscribeClient(client: SyncClient, observer: Observer): () => void {
    let state = subscriptions.get(client);
    if (!state) {
        const event = client.onEvent, model = client.onModelEvents, update = client.onUpdate;
        const observers = new Set<Observer>();
        const eventHook: NonNullable<SyncClient["onEvent"]> = value => { event?.(value); for (const item of [...observers]) item.beforeEvent?.(value); };
        const modelHook: NonNullable<SyncClient["onModelEvents"]> = (events, info) => {
            notifyObservers(model && (value => model(value.events, value.info)), observers,
                (item, value) => item.modelEvents?.(value.events, value.info), {events, info});
        };
        const updateHook = () => notifyObservers(update, observers, item => item.update?.(), undefined);
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

export type {AnchorVisibility, EditorStamp, EditorModelView, EditorEventCause, EditorObserver, EditorEditingView, EditorSession, EditorHost} from "./host-contract.ts";
export {createSyncClientEditorHost, createSyncClientEditorSession, getSyncClientEditorHostOwner} from "./sync-client-host.ts";
export type {SyncClientEditorInput} from "./sync-client-host.ts";
