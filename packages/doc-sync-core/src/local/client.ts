import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {ClientEngine, EngineEditingView} from "../engine/client-contract.ts";
import type {EngineSelection, EngineAnchoredSelection} from "../engine/contract.ts";
import {typescriptClientEngineFactory} from "../engine/typescript-client.ts";
import type {TypeScriptClientCompatibility} from "../engine/client-contract.ts";
import type {Snapshot} from "../crdt/doc.ts";
import {schemaVersion} from "../crdt/schema-version.ts";
import {copyLocalState, validateLocalState} from "./state.ts";
import type {LocalClientState} from "./state.ts";

export interface LocalClientOptions {schema: Schema; actor?: string; onNotificationError?: (error: LocalNotificationError) => void}
export type LocalClientRestoreOptions = Pick<LocalClientOptions, "schema" | "onNotificationError">;
export interface LocalNotificationError {readonly phase: "modelEvents" | "update" | "onNotificationError"; readonly cause: LocalEventCause; readonly message: string}
export type LocalEventCause = "local" | "undo" | "redo";
export interface LocalObserver {
    modelEvents?(edits: readonly EditOp[], info: {cause: LocalEventCause; fallback: boolean}): void;
    update?(): void;
}
export interface LocalSession extends EngineEditingView {
    readonly active: boolean;
    begin(): void;
    reserveClock(): void;
    /** null applies this batch without undo history. end groups recorded batches once. */
    commit(ops: Op[], record?: RecordOptions | null): void;
    end(): Op[];
    cancel(): void;
    capture(range: EngineSelection | null): EngineAnchoredSelection | null;
    resolve(range: EngineAnchoredSelection | null): EngineSelection | null;
}
const defaultRecord = (): RecordOptions => ({caretBefore: "", caretAfter: ""});
function freeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
}
type Batch = {ops: Op[]; edits: EditOp[]; fallback: boolean; origin?: object};
/**
 * Memory-only editing through the production TypeScript client engine.
 * model() is a borrowed read-only view. apply() changes it immediately; commit()
 * records and notifies once. Commit must contain all pending operation objects in
 * application order. A new concatenated array is allowed; copied operations are not.
 */
export class LocalClient {
    readonly actor: string;
    readonly schema: Schema;
    private readonly engine: ClientEngine;
    private observers = new Set<{observer: LocalObserver; origin?: object}>();
    private pending: Batch[] = [];
    private captured: EditOp[] | null = null;
    private notifying = false;
    private disposed = false;
    private activeCompositions = 0;
    private errors: LocalNotificationError[] = [];
    onNotificationError?: (error: LocalNotificationError) => void;
    get notificationErrors(): readonly LocalNotificationError[] { return this.errors.slice(); }
    constructor(options: LocalClientOptions) {
        const actor = options.actor ?? globalThis.crypto.randomUUID();
        if (typeof actor !== "string" || !/^[\w~-]+$/.test(actor) || actor === "~root") throw new Error("Invalid local actor");
        this.actor = actor;
        this.onNotificationError = options.onNotificationError;
        this.engine = typescriptClientEngineFactory.create(actor, options.schema);
        this.schema = this.engine.schema();
        this.hooks();
    }
    /** Open a detached state as a new client. Existing clients and views are never changed. */
    static fromState(state: unknown, options: LocalClientRestoreOptions): LocalClient {
        const value = copyLocalState(state) as LocalClientState;
        if (!value || value.format !== "doc-sync-local-state-v1" || typeof value.actor !== "string" || value.schemaVersion !== schemaVersion(options.schema)) throw new Error("Invalid local state format, actor or schema");
        const client = new LocalClient({...options, actor: value.actor});
        try {
            const prepared = client.engine.prepareCheckpoint(value.engine);
            client.engine.installCheckpoint(prepared);
            const engine = client.engine as ClientEngine & TypeScriptClientCompatibility;
            validateLocalState(engine.typescriptDocument(), engine.typescriptHistory().snapshot(), value.engine.document as Snapshot, value.actor);
            return client;
        } catch (error) { client.dispose(); throw error; }
    }
    /** Capture committed state only. The caller chooses storage and its durable write boundary. */
    captureState(): LocalClientState {
        this.settled();
        if (this.activeCompositions) throw new Error("End or cancel active composition before capturing local state");
        return copyLocalState({format: "doc-sync-local-state-v1" as const, actor: this.actor, schemaVersion: schemaVersion(this.schema), engine: this.engine.checkpoint()});
    }
    private alive(): void { if (this.disposed) throw new Error("LocalClient is disposed"); }
    private mutable(): void { this.alive(); if (this.notifying) throw new Error("Local observer mutation is not allowed"); }
    private settled(): void { this.mutable(); if (this.pending.length) throw new Error("Commit pending local operations first"); }
    private wantsEvents(origin?: object): boolean {
        return [...this.observers].some(entry => entry.observer.modelEvents && (!origin || entry.origin !== origin));
    }
    private hooks(origin?: object): void {
        this.engine.setEditHooks({guard: () => this.mutable(), listener: this.wantsEvents(origin)
            ? (edits, normalize) => { this.captured?.push(...structuredClone(edits), ...structuredClone(normalize)); } : null});
    }
    stamp() { this.alive(); return this.engine.stamp(); }
    model(): NodeJSON { this.alive(); return this.engine.model(); }
    historyStatus() { this.alive(); return this.engine.historyStatus(); }
    captureAnchor(path: ModelPath): string | null { this.alive(); return this.engine.captureAnchor(path); }
    locateAnchor(key: string, visibility: "visible" | "retained" = "visible"): ModelPath | null { this.alive(); return this.engine.locateAnchor(key, visibility); }
    captureSelection(range: EngineSelection | null): EngineAnchoredSelection | null {
        this.alive(); if (!range) return null;
        const anchor = this.captureAnchor(range.anchor), focus = this.captureAnchor(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
    resolveSelection(range: EngineAnchoredSelection | null): EngineSelection | null {
        this.alive(); if (!range) return null;
        const anchor = this.locateAnchor(range.anchor), focus = this.locateAnchor(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
    private applied(run: () => Op[] | null, origin?: object, capture = false): Op[] | null {
        this.mutable();
        if (this.pending.length && this.pending[0].origin !== origin) throw new Error("Commit pending operations before changing origin");
        const events = capture && this.wantsEvents(origin) ? this.engine.beginEvents() : null;
        const captured: EditOp[] = []; this.captured = captured; this.hooks(origin);
        let ops: Op[] | null;
        try { ops = run(); }
        catch (error) {
            if (events) this.engine.finishEvents(events);
            throw error;
        } finally { this.captured = null; this.hooks(); }
        const edits = captured;
        const result = events ? this.engine.finishEvents(events) : {events: edits, fallback: false};
        if (ops !== null) {
            freeze(ops);
            if (ops.length) this.pending.push({ops, edits: result.events, fallback: result.fallback, origin});
        }
        return ops;
    }
    apply(edits: EditOp[], origin?: object): Op[] { return this.applied(() => this.engine.apply(edits), origin)!; }
    applyModelEdits(before: NodeJSON, edits: EditOp[], origin?: object): Op[] { return this.applied(() => this.engine.applyModelEdits(before, edits), origin)!; }
    deleteRange(from: ModelPath, to: ModelPath, origin?: object): Op[] | null { return this.applied(() => this.engine.deleteRange(from, to), origin, true); }
    private verify(ops: Op[], batches: Batch[]): void {
        let at = 0;
        for (const batch of batches) for (const op of batch.ops) if (ops[at++] !== op) throw new Error("Commit requires the pending local operations in order");
        if (at !== ops.length || !batches.length && ops.length) throw new Error("Foreign or consumed local operations");
    }
    commit(ops: Op[], record: RecordOptions | null = defaultRecord(), origin?: object): void {
        this.mutable(); this.verify(ops, this.pending);
        if (!this.pending.length) return;
        const batches = this.pending;
        if (origin && origin !== batches[0].origin) throw new Error("Commit origin does not match pending operations");
        if (record) this.engine.record(ops, structuredClone(record));
        this.pending = [];
        this.notify(batches.flatMap(batch => batch.edits), "local", batches.some(batch => batch.fallback), origin ?? batches[0].origin);
    }
    edit(edits: EditOp[], record: RecordOptions | null = defaultRecord(), origin?: object): Op[] {
        this.settled(); const ops = this.apply(edits, origin); this.commit(ops, record, origin); return ops;
    }
    private report(error: unknown, phase: LocalNotificationError["phase"], cause: LocalEventCause): void {
        let message = "Notification callback failed";
        try { message = (error instanceof Error ? String(error.message) : String(error)).slice(0, 2000); } catch { /* error formatting must not interrupt an accepted edit */ }
        const entry = Object.freeze({phase, cause, message});
        this.errors.push(entry); if (this.errors.length > 100) this.errors.shift();
        if (phase === "onNotificationError") return;
        try { this.onNotificationError?.(entry); } catch (reporterError) { this.report(reporterError, "onNotificationError", cause); }
    }
    private notify(edits: EditOp[], cause: LocalEventCause, fallback: boolean, origin?: object): void {
        if (!this.observers.size) return;
        const events = freeze(edits), info = Object.freeze({cause, fallback});
        this.notifying = true;
        try {
            for (const entry of [...this.observers]) {
                if (!this.observers.has(entry) || origin && entry.origin === origin) continue;
                try { if (events.length) entry.observer.modelEvents?.(events, info); } catch (error) { this.report(error, "modelEvents", cause); }
                try { entry.observer.update?.(); } catch (error) { this.report(error, "update", cause); }
            }
        } finally { this.notifying = false; }
    }
    private history(action: "undo" | "redo"): string | null {
        this.settled();
        const capture = this.wantsEvents() ? this.engine.beginEvents() : null;
        const result = this.engine[action]();
        const events = capture ? this.engine.finishEvents(capture) : {events: [], fallback: false};
        if (result.ops.length) this.notify(events.events, action, events.fallback);
        return result.caret;
    }
    undo(): string | null { return this.history("undo"); }
    redo(): string | null { return this.history("redo"); }
    clearHistory(): void { this.settled(); this.engine.clearHistory(); this.notify([], "local", false); }
    subscribe(observer: LocalObserver, options: {origin?: object} = {}): () => void {
        this.mutable();
        if (this.pending.length) throw new Error("Subscribe before applying local operations");
        const entry = {observer, origin: options.origin}; this.observers.add(entry); this.hooks();
        return () => { if (this.disposed) return; this.observers.delete(entry); this.hooks(); };
    }
    createSession(origin?: object): LocalSession {
        this.mutable(); const input = this.engine.createSession(), client = this;
        const track = <T>(run: () => T): T => {
            const before = input.active;
            try { return run(); }
            finally { if (before !== input.active) client.activeCompositions += input.active ? 1 : -1; }
        };
        let pending: Batch[] = [];
        let collected: Array<{ops: Op[]; record: RecordOptions | null}> = [];
        const applied = (run: () => Op[] | null): Op[] | null => {
            client.mutable();
            if (!input.active) return client.applied(run, origin);
            let ops: Op[] | null;
            try { ops = run(); } finally { input.reserveClock(); }
            if (ops !== null) { freeze(ops); if (ops.length) pending.push({ops, edits: [], fallback: false}); } return ops;
        };
        const session: LocalSession = {
            get active() { client.alive(); return input.active; },
            stamp: () => { client.alive(); return input.stamp(); }, model: () => { client.alive(); return input.model(); },
            apply: (edits, options) => applied(() => input.apply(edits, options))!,
            applyModelEdits: (before, edits) => applied(() => input.applyModelEdits(before, edits))!,
            deleteRange: (from, to) => applied(() => input.deleteRange(from, to)),
            captureAnchor: path => { client.alive(); return input.captureAnchor(path); },
            locateAnchor: (key, visibility) => { client.alive(); return input.locateAnchor(key, visibility); },
            begin() { client.settled(); if (!input.active) collected = []; track(() => input.begin()); }, reserveClock() { client.alive(); input.reserveClock(); },
            commit(ops, record) {
                client.mutable(); if (!input.active) { client.commit(ops, record, origin); return; }
                client.verify(ops, pending);
                const ownedRecord = record === null ? null : structuredClone(record ?? defaultRecord());
                input.collect(ops, ownedRecord);
                if (ops.length) collected.push({ops: [...ops], record: ownedRecord});
                pending = [];
            },
            end() {
                client.settled(); if (pending.length) throw new Error("Commit pending composition operations first");
                if (!input.active) return [];
                const capture = client.wantsEvents(origin) ? client.engine.beginEvents() : null;
                const result = track(() => input.publish());
                const events = capture ? client.engine.finishEvents(capture) : {events: [], fallback: false};
                if (!result) return [];
                freeze(result.ops);
                // publish() preserves collect order and applies its owned copies. Map
                // history by that order, and record the actual published objects once.
                const expected = collected.flatMap(segment => segment.ops);
                if (expected.length !== result.ops.length || expected.some((op, at) => JSON.stringify(op) !== JSON.stringify(result.ops[at]))) throw new Error("Composition publication does not match collected operations");
                let at = 0;
                const recorded: Op[] = [], records: RecordOptions[] = [];
                for (const segment of collected) {
                    if (segment.record) { recorded.push(...result.ops.slice(at, at + segment.ops.length)); records.push(segment.record); }
                    at += segment.ops.length;
                }
                collected = [];
                if (recorded.length) client.engine.record(recorded, {caretBefore: records[0].caretBefore, caretAfter: records.at(-1)!.caretAfter, typing: false});
                if (result.ops.length) client.notify(events.events, "local", events.fallback, origin);
                return result.ops;
            },
            cancel() {
                if (!client.disposed) client.mutable();
                track(() => input.cancel()); pending = []; collected = [];
            },
            capture: range => { client.alive(); return input.capture(range); }, resolve: range => { client.alive(); return input.resolve(range); },
        };
        return session;
    }
    dispose(): void {
        if (this.disposed) return; this.mutable();
        this.engine.dispose(); this.activeCompositions = 0; this.pending = []; this.observers.clear(); this.captured = null; this.errors = []; this.onNotificationError = undefined; this.disposed = true;
    }
}
