import {Doc, MAIN} from "../crdt/doc.ts";
import type {Op, Snapshot} from "../crdt/doc.ts";
import {pathAt, posOfPath, resolvePath, withPathMemo} from "../crdt/edit.ts";
import {deleteRange} from "../crdt/commands.ts";
import {isFieldSpec} from "../crdt/fields.ts";
import {History} from "../crdt/history.ts";
import type {RecordOptions} from "../crdt/history.ts";
import {applyEdits, diffModels, runsToUnits, canonMarks} from "../crdt/model.ts";
import type {EditOp, ModelPath, NodeJSON, Run} from "../crdt/model.ts";
import {attrValueOk} from "../crdt/schema.ts";
import type {Schema} from "../crdt/schema.ts";
import {assertCompatibleSchema, schemaVersion} from "../crdt/schema-version.ts";
import {keyOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";
import {modelEventWindow, textEventScopes} from "../sync/model-events.ts";
import {commitModelEdits} from "./editing.ts";
import {ENGINE_CONTRACT_VERSION} from "./contract.ts";
import type {EngineCapability, EngineCheckpoint, EngineSelection, EngineAnchoredSelection} from "./contract.ts";
import type {ClientEngine, ClientEngineFactory, EngineReceiveResult, EngineEditingView, EngineInputSession, EnginePreparedDocument, EnginePreparedState, EngineEventCapture, TypeScriptClientCompatibility} from "./client-contract.ts";

const MODEL_EDIT_KINDS = Object.freeze(["insert", "delete", "update", "split", "merge", "move"]);
const CRDT_OPERATION_KINDS = Object.freeze(["text", "node", "set", "del", "undel", "move"]);

let nextGeneration = 0;
const ENGINE = "doc-sync-typescript";
const CAPABILITIES: readonly EngineCapability[] = ["edit", "receive", "history", "anchors", "checkpoint", "composition", "events", "gc", "schema-transition"];
/** Reject lossy JSON conversions, getters, sparse arrays, exotic objects and cycles. */
function copy<T>(value: T): T {
    const active = new Set<object>();
    const visit = (v: unknown): void => {
        if (v === null || typeof v === "string" || typeof v === "boolean") return;
        if (typeof v === "number" && Number.isFinite(v)) return;
        if (typeof v !== "object" || active.has(v)) throw new Error("Engine DTO must be finite plain JSON");
        const proto = Object.getPrototypeOf(v);
        if (Array.isArray(v) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error("Engine DTO must be plain JSON");
        const keys = Reflect.ownKeys(v);
        if (Array.isArray(v) && (keys.length !== v.length + 1 || Object.keys(v).some((key, i) => key !== String(i)))) throw new Error("Engine DTO arrays must be dense");
        active.add(v);
        for (const key of keys) {
            if (Array.isArray(v) && key === "length") continue;
            const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
            if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) throw new Error("Engine DTO must contain plain values");
            visit(descriptor.value);
        }
        active.delete(v);
    };
    visit(value);
    return structuredClone(value);
}
const isTicket = (v: unknown): v is Ticket => !!v && typeof v === "object" && "lamport" in v && Number.isSafeInteger(v.lamport) && (v.lamport as number) >= 0 && "actor" in v && typeof v.actor === "string" && !!v.actor;
const invalid = (message: string): never => {throw new Error(`Invalid engine checkpoint: ${message}`);};

/** Own public factory input once; no schema work is added to individual edits. */
function ownSchema(input: Schema): Schema {
    schemaVersion(input);
    const schema = copy(input);
    const freeze = (value: unknown): void => {
        if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
    };
    freeze(schema);
    return schema;
}

const replaceAll = (before: NodeJSON, after: NodeJSON): EditOp[] => [
    {op: "delete", at: [0], count: (before.children ?? []).length},
    {op: "insert", at: [0], content: after.children ?? []},
];
type Prepared = {doc: Doc; schema: Schema};
type State = Prepared & {history: History};
type Capture = {
    scopes: ReturnType<typeof textEventScopes>; before: NodeJSON | null;
    batch?: {source: Op[]; owned: Op[]; generation: number; revision: number; tokens: number; schema: Schema | null; used: boolean};
};

/** Authoritative mutable TS implementation. The immutable draft engine is separate. */
class TypeScriptClientEngine implements ClientEngine, TypeScriptClientCompatibility {
    private doc: Doc;
    private history = new History();
    private definition: Schema;
    private generation = ++nextGeneration;
    private cachedModel: {generation: number; revision: number; value: NodeJSON} | null = null;
    private disposed = false;
    private hooks: {guard: (() => void) | null; listener: ((edits: EditOp[], normalize: EditOp[]) => void) | null} = {guard: null, listener: null};
    private readonly prepared = new WeakMap<EnginePreparedDocument, Prepared>();
    private readonly states = new WeakMap<EnginePreparedState, State>();
    private readonly captures = new WeakMap<EngineEventCapture, Capture>();
    private readonly sessions = new Set<EngineInputSession>();
    private guardWrapper: (() => void) | null = null;
    private readonly actor: string;
    constructor(actor: string, schema: Schema) {
        this.actor = actor;
        if (typeof actor !== "string") throw new Error("Invalid engine actor");
        this.definition = ownSchema(schema); this.doc = new Doc(actor, this.definition);
    }
    private alive(): void { if (this.disposed) throw new Error("Engine is disposed"); }
    identity() { this.alive(); return {engine: ENGINE, contractVersion: ENGINE_CONTRACT_VERSION, actor: this.actor, schemaVersion: schemaVersion(this.definition), capabilities: [...CAPABILITIES]}; }
    schema() { this.alive(); return this.definition; }
    requireCapabilities(required: readonly EngineCapability[]): void { this.alive(); for (const value of required) if (!CAPABILITIES.includes(value)) throw new Error(`Unsupported engine capability: ${value}`); }
    stamp() { this.alive(); return {generation: this.generation, revision: this.doc.version}; }
    model() {
        this.alive(); const revision = this.doc.version;
        if (!this.cachedModel || this.cachedModel.generation !== this.generation || this.cachedModel.revision !== revision) this.cachedModel = {generation: this.generation, revision, value: this.doc.toJSON()};
        return this.cachedModel.value;
    }
    setEditHooks(hooks: typeof this.hooks): void {
        this.alive(); this.hooks = hooks; this.attach();
    }
    private attach(): void {
        const previous = this.doc.editGuard === this.guardWrapper ? null : this.doc.editGuard;
        if (!this.guardWrapper || this.doc.editGuard !== this.guardWrapper) {
            this.guardWrapper = () => { this.alive(); this.hooks.guard?.(); previous?.(); };
            this.doc.editGuard = this.guardWrapper;
        }
        this.doc.editListener = this.hooks.listener;
    }
    assertEditing(): void { this.alive(); this.doc.editGuard?.(); }
    typescriptDocument() { this.alive(); return this.doc; }
    typescriptHistory() { this.alive(); return this.history; }
    replaceTypeScriptDocument(doc: Doc): void { this.alive(); this.doc = doc; this.generation = ++nextGeneration; this.guardWrapper = null; this.attach(); }
    replaceTypeScriptHistory(history: History): void { this.alive(); this.history = history; }
    private clone(doc = this.doc): Doc { return Doc.fromSnapshot(this.actor, doc.snapshot(), doc.schema); }
    private inspect<T>(doc: Doc, read: (view: Doc) => T): T {
        const result = doc.inspectStored(read);
        return result.needsProjection ? doc.withReadProjection(read) : result.value as T;
    }
    /** Only existing physical text with a bounded allocation is safe without a detached preflight. */
    private fastText(doc: Doc, edits: EditOp[]): boolean {
        if (edits.length !== 1) return false;
        const edit = edits[0];
        if (!edit || !Array.isArray(edit.at) || edit.at.length < 2 || edit.at.some(n => !Number.isSafeInteger(n) || n < 0)) return false;
        const resolved = this.inspect(doc, read => {
            const pos = posOfPath(read, edit.at);
            return pos && pos.o === edit.at.at(-1) ? {pos, block: read.textAt(pos)} : null;
        });
        if (!resolved) return false;
        const {pos, block} = resolved;
        // Virtual/cardinality heads can allocate structural metadata. Existing physical
        // text inside cardinality documents stays on this path.
        if (block.virtual || !doc.hasStoredToken(block.marker.key) || block.marker.kind === "char") return false;
        let allocation = 0;
        if (edit.op === "insert") {
            if (typeof edit.content === "string") allocation = edit.content.length;
            else {
                if (!Array.isArray(edit.content) || edit.content.some(run => !("text" in run) || typeof run.text !== "string" || !run.marks || typeof run.marks !== "object")) return false;
                const units = runsToUnits(this.definition, edit.content as Run[]);
                for (const unit of units) { if (!("ch" in unit)) return false; canonMarks(this.definition, unit.marks); allocation += unit.ch.length; }
            }
        } else if (edit.op === "delete") {
            if (!Number.isSafeInteger(edit.count) || edit.count < 0 || edit.count > block.chars.length - pos.o) return false;
            allocation = 1;
        } else if (edit.op === "update") {
            if (!Number.isSafeInteger(edit.length) || edit.length! < 0 || edit.length! > block.chars.length - pos.o ||
                !edit.attrs || typeof edit.attrs !== "object" || Array.isArray(edit.attrs)) return false;
            const schema = doc.schema ?? this.definition, entries = Object.entries(edit.attrs);
            for (const [key, value] of entries) {
                if (key.startsWith("$")) return false;
                if (schema.marks.includes(key)) {
                    if (value !== null && typeof value !== "boolean") return false;
                } else {
                    const spec = schema.markValues && Object.hasOwn(schema.markValues, key) ? schema.markValues[key] : undefined;
                    if (!spec || !attrValueOk(spec, value)) return false;
                }
            }
            // The text compiler writes at most one set per key, over character
            // targets only. Structural attributes and inline-node updates stay detached.
            allocation = edit.length === 0 ? 0 : entries.length;
            if (allocation > Number.MAX_SAFE_INTEGER - doc.clock.lamport) return false;
        } else return false;
        if (!Number.isSafeInteger(doc.clock.lamport) || doc.clock.lamport < 0 || allocation > Number.MAX_SAFE_INTEGER - doc.clock.lamport) throw new Error("Lamport clock exhausted its safe integer range");
        // Each possible movement promotion needs a retained marker. Use a cheap
        // conservative bound; only scarce clock space needs a detached proof.
        if (doc.hasMoves && doc.storedTokenCount() > Number.MAX_SAFE_INTEGER - doc.clock.lamport - allocation) return false;
        return true;
    }
    /** Bounded plain-root Enter/Backspace. Rich structural cases keep detached proof. */
    private fastStructure(doc: Doc, edits: EditOp[]): boolean {
        const edit = edits[0];
        if (edits.length !== 1 || (edit.op !== "split" && edit.op !== "merge") || doc.hasMoves || doc.hasCardinality) return false;
        const schema = doc.schema, root = schema?.nodes[schema.root];
        if (!schema || root?.shape !== "flow" || Object.keys(root.childRules ?? {}).length ||
            !root.children.every(type => schema.nodes[type]?.shape === "text")) return false;
        const physical = (block: ReturnType<Doc["textAt"]>) => !block.virtual && !block.parts && doc.hasStoredToken(block.marker.key);
        if (edit.op === "split") {
            if (edit.at.length !== 2) return false;
            const valid = this.inspect(doc, read => {
                const pos = posOfPath(read, edit.at);
                if (!pos || pos.line && pos.line !== MAIN || pos.o !== edit.at[1]) return false;
                const block = read.textAt(pos);
                if (!physical(block) || !read.takesText(block.type)) return false;
                const source = schema.nodes[block.type];
                if (source?.shape !== "text") return false;
                const type = pos.o === block.chars.length && source.next ? source.next : block.type;
                const target = schema.nodes[type];
                if (target?.shape !== "text" || !root.children.includes(type)) return false;
                for (const [key, spec] of Object.entries(target.attrs ?? {})) {
                    const value = block.attrs[key];
                    if (spec.inherit && value !== undefined && value !== spec.default && (isFieldSpec(spec) || !attrValueOk(spec, value))) return false;
                }
                return true;
            });
            if (!valid) return false;
        } else {
            if (edit.at.length !== 1) return false;
            const valid = this.inspect(doc, read => {
                const ref = resolvePath(read, edit.at);
                if (ref.kind !== "block" || ref.line !== MAIN || ref.flat === 0) return false;
                const blocks = read.blocks(MAIN), block = blocks[ref.b], previous = blocks[ref.b - 1];
                // In a plain all-text root, a physical immediately preceding text
                // block is also the preceding visible block used by the compiler.
                return block?.kind === "text" && previous?.kind === "text" && physical(block) && physical(previous) && read.takesText(previous.type);
            });
            if (!valid) return false;
        }
        if (!Number.isSafeInteger(doc.clock.lamport) || doc.clock.lamport < 0 || doc.clock.lamport >= Number.MAX_SAFE_INTEGER) throw new Error("Lamport clock exhausted its safe integer range");
        return true;
    }
    private compile(doc: Doc, edits: EditOp[], options: {normalize?: boolean} = {}) {
        const input = copy(edits);
        if (!Array.isArray(input)) throw new Error("Invalid edit batch");
        for (const edit of input) {
            if (!edit || !MODEL_EDIT_KINDS.includes(edit.op) || !Array.isArray(edit.at) || edit.at.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid edit operation or path");
            if (edit.op === "delete" && (!Number.isSafeInteger(edit.count) || edit.count < 0)) throw new Error("Invalid delete count");
        }
        return withPathMemo(doc, () => doc.edit(input, {...options, preflight: () => {
            if (!this.fastText(doc, input) && !this.fastStructure(doc, input)) this.clone(doc).edit(input, {normalize: true});
        }}));
    }
    apply(edits: EditOp[], options?: {normalize?: boolean; accepted?: boolean}): Op[] {
        this.alive(); if (!options?.accepted) return this.compile(this.doc, edits, options).ops;
        const guard = this.doc.editGuard; this.doc.editGuard = () => this.hooks.guard?.();
        try { return this.compile(this.doc, edits, options).ops; } finally { this.doc.editGuard = guard; }
    }
    applyModelEdits(before: NodeJSON, edits: EditOp[]): Op[] { this.alive(); return commitModelEdits(this.doc, before, edits, mapped => this.apply(mapped)); }
    deleteRange(from: ModelPath, to: ModelPath): Op[] | null {
        this.assertEditing(); const doc = this.clone(), a = posOfPath(doc, copy(from)), b = posOfPath(doc, copy(to));
        if (!a || !b) return null;
        const ops = deleteRange(doc, a, b); if (ops) this.emitLocal(ops); return ops;
    }
    captureAnchor(path: ModelPath): string | null {
        this.alive(); if (!Array.isArray(path) || path.length < 2 || path.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
        return this.inspect(this.doc, doc => {
            const pos = posOfPath(doc, path);
            return pos && pos.o === path.at(-1) && doc.visible(pos.line ?? MAIN) ? doc.anchorOf(pos) : null;
        });
    }
    locateAnchor(key: string, visibility: "visible" | "retained"): ModelPath | null {
        this.alive(); if (typeof key !== "string") return null;
        return this.inspect(this.doc, doc => {
            const item = doc.get(key); if (!item) return null;
            if (visibility === "visible") {
                const visible = doc.hasMoves || doc.hasCardinality ? doc.tokenLocation(key)?.visible : doc.visible(item.line.key);
                if (!visible) return null;
            }
            return pathAt(doc, key);
        });
    }
    record(ops: Op[], options: RecordOptions): void { this.alive(); this.history.record(ops, this.doc, options); }
    private validateWire(doc: Doc, writer: string, ops: Op[]): Op[] {
        if (typeof writer !== "string" || !writer.length) throw new Error("Invalid wire operation writer");
        return this.validateBatch(doc, ops);
    }
    private validateBatch(doc: Doc, ops: Op[]): Op[] {
        const input = copy(ops);
        if (!Array.isArray(input)) throw new Error("Invalid wire operation batch");
        for (const op of input) {
            if (!op || !CRDT_OPERATION_KINDS.includes(op.t)) throw new Error("Invalid wire operation kind");
            const ticket = op.t === "text" || op.t === "node" ? op.id : op.at;
            if (!isTicket(ticket)) throw new Error("Invalid wire operation ticket");
        }
        const problem = doc.check(input); if (problem) throw new Error(`Invalid wire operation batch: ${problem}`);
        return input;
    }
    private applyReceived(ops: Op[]): EngineReceiveResult {
        const deletions: string[] = [];
        for (const op of ops) { this.doc.apply(op); if (op.t === "del") deletions.push(keyOf(op.at)); }
        return {deletions};
    }
    receive(writer: string, ops: Op[], capture?: EngineEventCapture): EngineReceiveResult {
        this.alive();
        if (capture === undefined) return this.applyReceived(this.validateWire(this.doc, writer, ops));
        if (typeof writer !== "string" || !writer.length) throw new Error("Invalid wire operation writer");
        const batch = this.captures.get(capture)?.batch;
        if (!batch || batch.used || batch.source !== ops) throw new Error("Foreign, consumed or mismatched prepared receive capture");
        // Event scopes retain their capture-time document and model paths. They
        // cannot cross an intervening edit, replacement or schema change.
        if (batch.generation !== this.generation || batch.revision !== this.doc.version || batch.schema !== this.doc.schema) throw new Error("Stale prepared receive capture");
        if (batch.tokens !== this.doc.storedTokenCount() || !Object.isFrozen(this.doc.schema)) {
            const problem = this.doc.check(batch.owned);
            if (problem) throw new Error(`Invalid wire operation batch: ${problem}`);
        }
        const result = this.applyReceived(batch.owned);
        batch.used = true;
        return result;
    }
    emitLocal(ops: Op[]): void { this.alive(); this.validateWire(this.doc, this.actor, ops); this.doc.emit(ops); }
    check(ops: Op[]) { this.alive(); return this.doc.check(copy(ops)); }
    private historyAction(action: "undo" | "redo") {
        this.alive();
        // Normal histories run directly. At large clocks, prove the complete action
        // on detached state before History can pop a live group or allocate a ticket.
        if (!Number.isSafeInteger(this.doc.clock.lamport) || this.doc.clock.lamport < 0 || this.doc.clock.lamport >= Number.MAX_SAFE_INTEGER / 2) {
            History.fromSnapshot(this.history.snapshot())[action](this.clone());
        }
        return this.history[action](this.doc);
    }
    undo() { return this.historyAction("undo"); }
    redo() { return this.historyAction("redo"); }
    historyStatus() { this.alive(); return {canUndo: this.history.canUndo, canRedo: this.history.canRedo}; }
    clearHistory(): void { this.alive(); this.history.clear(); }
    historyDeletionKeys(): string[] { this.alive(); const keys = new Set<string>(); this.history.pin(key => { keys.add(key); return undefined; }); return [...keys]; }
    historyPin(deletions: readonly [string, number][]) { this.alive(); const map = new Map(deletions); return this.history.pin(key => map.get(key)); }
    compact(frontier: number, deletions: readonly [string, number][]): void { this.alive(); if (!Number.isSafeInteger(frontier) || frontier < 0) throw new Error("Invalid compaction frontier"); const map = new Map(deletions); this.doc.compact(frontier, key => map.get(key)); }
    snapshot() { this.alive(); return this.doc.snapshot(); }
    allocationFloor() { this.alive(); return this.doc.clock.lamport; }
    prepareSnapshot(snapshot: Snapshot, schema = this.definition): EnginePreparedDocument {
        this.alive(); const definition = schema === this.definition ? schema : ownSchema(schema);
        const value = {} as EnginePreparedDocument; this.prepared.set(value, {doc: Doc.fromSnapshot(this.actor, copy(snapshot), definition), schema: definition}); return value;
    }
    private document(value: EnginePreparedDocument): Prepared { this.alive(); const state = this.prepared.get(value); if (!state) throw new Error("Foreign or consumed prepared document"); return state; }
    replayPrepared(value: EnginePreparedDocument, writer: string, ops: Op[]): void { const {doc} = this.document(value); this.validateWire(doc, writer, ops).forEach(op => doc.apply(op)); }
    compilePrepared(value: EnginePreparedDocument, edits: EditOp[]) { return this.compile(this.document(value).doc, edits); }
    installPrepared(value: EnginePreparedDocument, options: {clockFloor?: number; clearHistory?: boolean} = {}): void {
        const state = this.document(value);
        if (options.clockFloor !== undefined && (!Number.isSafeInteger(options.clockFloor) || options.clockFloor < 0)) throw new Error("Invalid allocation floor");
        state.doc.clock.lamport = Math.max(state.doc.clock.lamport, options.clockFloor ?? 0);
        this.definition = state.schema; this.replaceTypeScriptDocument(state.doc); if (options.clearHistory) this.history.clear(); this.prepared.delete(value);
    }
    checkpoint(): EngineCheckpoint { this.alive(); return {format: "doc-sync-typescript-checkpoint-v1", identity: this.identity(), revision: this.doc.version, document: this.doc.snapshot(), history: this.history.snapshot()}; }
    prepareCheckpoint(checkpoint: EngineCheckpoint): EnginePreparedState {
        this.alive(); const value = copy(checkpoint);
        if (value.format !== "doc-sync-typescript-checkpoint-v1" || value.identity?.engine !== ENGINE || value.identity.contractVersion !== ENGINE_CONTRACT_VERSION || value.identity.actor !== this.actor || value.identity.schemaVersion !== schemaVersion(this.definition)) invalid("engine, actor or schema mismatch");
        if (!Array.isArray(value.identity.capabilities) || value.identity.capabilities.length !== CAPABILITIES.length || CAPABILITIES.some(capability => !value.identity.capabilities.includes(capability))) invalid("capabilities mismatch");
        if (!Number.isSafeInteger(value.revision) || value.revision < 0) invalid("revision");
        const doc = Doc.fromSnapshot(this.actor, value.document as Snapshot, this.definition), history = History.fromSnapshot(value.history);
        const handle = {} as EnginePreparedState; this.states.set(handle, {doc, history, schema: this.definition}); return handle;
    }
    installCheckpoint(value: EnginePreparedState): void { this.alive(); const state = this.states.get(value); if (!state) throw new Error("Foreign or consumed prepared state"); this.replaceTypeScriptDocument(state.doc); this.history = state.history; this.states.delete(value); }
    previewSchema(next: Schema): NodeJSON { this.alive(); assertCompatibleSchema(this.definition, next); return Doc.fromSnapshot(this.actor, this.doc.snapshot(), next).toJSON(); }
    upgradeSchema(next: Schema): void { this.alive(); assertCompatibleSchema(this.definition, next); const prepared = this.prepareSnapshot(this.snapshot(), next); this.installPrepared(prepared); }
    reset(): void { this.alive(); this.replaceTypeScriptDocument(new Doc(this.actor, this.definition)); this.history.clear(); }
    beginEvents(ops?: Op[]): EngineEventCapture {
        this.alive();
        // Prove the complete copied batch before any scoped read can materialize
        // implicit storage. The opaque capture owns that exact prepared value.
        const owned = ops === undefined ? undefined : this.validateBatch(this.doc, ops);
        const batch = ops === undefined ? undefined : {source: ops, owned: owned!, generation: this.generation,
            revision: this.doc.version, tokens: this.doc.storedTokenCount(), schema: this.doc.schema, used: false};
        const scopes = owned ? textEventScopes(this.doc, owned) : null;
        const value = {} as EngineEventCapture;
        this.captures.set(value, {scopes, before: scopes ? null : this.doc.toJSON(), batch});
        return value;
    }
    finishEvents(value: EngineEventCapture): {events: EditOp[]; fallback: boolean} {
        this.alive(); const capture = this.captures.get(value); if (!capture) throw new Error("Foreign or consumed event capture"); this.captures.delete(value);
        if (capture.batch && !capture.batch.used && (capture.batch.generation !== this.generation || capture.batch.revision !== this.doc.version || capture.batch.schema !== this.doc.schema)) throw new Error("Stale prepared receive capture");
        const {scopes, before} = capture; let events: EditOp[] = [], fallback = false;
        if (scopes) {
            for (const scope of scopes) {
                const after = scope.read(); if (JSON.stringify(scope.before) === JSON.stringify(after)) continue;
                const next = diffModels(scope.schema, scope.before, after);
                if (JSON.stringify(applyEdits(scope.schema, scope.before, next)) !== JSON.stringify(after)) { const whole = this.doc.toJSON(); events = replaceAll(whole, whole); fallback = true; break; }
                for (const event of next) events.push({...event, at: [...scope.path, ...event.at.slice(1)]});
            }
        } else {
            const after = this.doc.toJSON(); if (JSON.stringify(before) === JSON.stringify(after)) return {events, fallback};
            const window = modelEventWindow(this.definition, before!, after), localBefore = window?.before ?? before!, localAfter = window?.after ?? after;
            const local = diffModels(this.definition, localBefore, localAfter);
            if (JSON.stringify(applyEdits(this.definition, localBefore, local)) !== JSON.stringify(localAfter)) { events = replaceAll(before!, after); fallback = true; }
            else { const path = (at: number[]) => [at[0] + window!.start, ...at.slice(1)]; events = window ? local.map(event => event.op === "move" ? {...event, at: path(event.at), from: path(event.from)} : {...event, at: path(event.at)}) : local; }
        }
        return {events, fallback};
    }
    createSession(): EngineInputSession {
        this.alive(); const live = this; let draft: TypeScriptClientEngine | null = null; let pending: Array<{ops: Op[]; record?: RecordOptions | null}> = [];
        const current = () => { live.alive(); session.reserveClock(); return draft ?? live; };
        const session: EngineInputSession & {typescriptDocument(): Doc} = {
            get active() { return draft !== null; },
            begin() { live.assertEditing(); if (draft) return; draft = new TypeScriptClientEngine(live.actor, live.definition); draft.replaceTypeScriptDocument(live.clone()); draft.setEditHooks({guard: () => live.assertEditing(), listener: null}); pending = []; live.sessions.add(session); },
            reserveClock() { live.alive(); if (draft) { const floor = Math.max(live.doc.clock.lamport, draft.doc.clock.lamport); live.doc.clock.lamport = floor; draft.doc.clock.lamport = floor; } },
            stamp: () => current().stamp(), model: () => current().model(),
            apply: (edits, options) => { if (draft) live.assertEditing(); return current().apply(edits, options); },
            applyModelEdits: (before, edits) => { if (draft) live.assertEditing(); return current().applyModelEdits(before, edits); },
            deleteRange: (from, to) => { if (draft) live.assertEditing(); return current().deleteRange(from, to); }, captureAnchor: path => current().captureAnchor(path), locateAnchor: (key, visibility) => current().locateAnchor(key, visibility),
            typescriptDocument: () => current().typescriptDocument(),
            collect(ops, record) { live.assertEditing(); if (!draft) throw new Error("Input session is not active"); session.reserveClock(); if (ops.length) pending.push({ops: copy(ops), record: record ? copy(record) : record}); },
            publish() { live.assertEditing(); if (!draft) return null; session.reserveClock(); const ops = pending.flatMap(change => change.ops); const first = pending[0]?.record, last = pending.at(-1)?.record; live.emitLocal(ops); session.cancel(); return {ops, record: {caretBefore: first?.caretBefore ?? "", caretAfter: last?.caretAfter ?? "", typing: false}}; },
            cancel() { draft?.dispose(); draft = null; pending = []; live.sessions.delete(session); },
            capture(range: EngineSelection | null): EngineAnchoredSelection | null { if (!range) return null; const anchor = current().captureAnchor(range.anchor), focus = current().captureAnchor(range.focus); return anchor && focus ? {anchor, focus} : null; },
            resolve(range: EngineAnchoredSelection | null): EngineSelection | null { if (!range) return null; const anchor = live.locateAnchor(range.anchor, "visible"), focus = live.locateAnchor(range.focus, "visible"); return anchor && focus ? {anchor, focus} : null; },
        };
        return session;
    }
    dispose(): void { if (this.disposed) return; for (const session of this.sessions) session.cancel(); this.sessions.clear(); this.disposed = true; }
}
export const typescriptClientEngineFactory: ClientEngineFactory = Object.freeze({engine: ENGINE, contractVersion: ENGINE_CONTRACT_VERSION, create: (actor: string, schema: Schema): ClientEngine => new TypeScriptClientEngine(actor, schema)});
