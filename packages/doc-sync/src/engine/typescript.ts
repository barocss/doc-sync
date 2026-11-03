import {Doc, MAIN} from "../crdt/doc.ts";
import type {Op, Snapshot} from "../crdt/doc.ts";
import {anchorAt, pathAt, posOfPath} from "../crdt/edit.ts";
import {History} from "../crdt/history.ts";
import type {HistorySnapshot, RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import {schemaVersion} from "../crdt/schema-version.ts";
import {keyOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";
import {ENGINE_CONTRACT_VERSION} from "./contract.ts";
import type {EngineAnchoredSelection, EngineCapability, EngineCheckpoint, EngineIdentity, EngineSelection, TypeScriptEngine, TypeScriptEngineCheckpoint, TypeScriptEngineFactory} from "./contract.ts";

const CRDT_OPERATION_KINDS = Object.freeze(["text", "node", "set", "del", "undel", "move"]);

const ENGINE = "doc-sync-typescript";
const CAPABILITIES: readonly EngineCapability[] = ["edit", "receive", "history", "anchors", "checkpoint"];

/** Reject lossy JSON conversions, getters, sparse arrays, exotic objects and cycles. */
function copy<T>(value: T): T {
    const active = new Set<object>();
    let count = 0;
    const visit = (v: unknown, depth: number): void => {
        if (++count > 1000000 || depth > 128) throw new Error("Engine DTO exceeds JSON limits");
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
            visit(descriptor.value, depth + 1);
        }
        active.delete(v);
    };
    visit(value, 0);
    return structuredClone(value);
}
const actorOK = (actor: string) => typeof actor === "string" && /^[\w~-]+$/.test(actor) && actor !== "~root";
const isTicket = (v: unknown): v is Ticket => !!v && typeof v === "object" && "lamport" in v && Number.isSafeInteger(v.lamport) && (v.lamport as number) >= 0 && "actor" in v && typeof v.actor === "string" && !!v.actor;
const invalid = (message: string): never => {throw new Error(`Invalid engine checkpoint: ${message}`);};

/** History's own decoder validates its reference graph; this checks document coupling. */
function validateHistoryDocument(history: HistorySnapshot, doc: Doc, actor: string): void {
    const ticketExists = (value: unknown): void => {
        if (!isTicket(value) || !doc.get(keyOf(value))) invalid("history token is absent from document");
    };
    const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {value.forEach(visit); return;}
        const obj = value as Record<string, unknown>;
        if (obj.type === "existence") {
            (obj.ids as unknown[]).forEach(ticketExists);
            const owned = obj.delAt === null ? obj.ids as unknown[] : [obj.delAt];
            if (owned.some(value => !isTicket(value) || value.actor !== actor)) invalid("history belongs to another actor");
        }
        if (obj.type === "split") ticketExists(obj.id);
        if (obj.type === "move") ticketExists(obj.target);
        if (obj.type === "set") (obj.targets as Array<{id: Ticket}>).forEach(target => ticketExists(target.id));
        if (isTicket(value) && value.lamport > doc.clock.lamport) invalid("history exceeds document clock");
        Object.values(obj).forEach(visit);
    };
    visit(history);
}

class TypeScriptDocumentEngine implements TypeScriptEngine {
    private doc: Doc;
    private history = new History();
    private valueRevision = 0;
    private readonly definition: Schema;
    private readonly identityValue: EngineIdentity;
    constructor(actor: string, schema: Schema) {
        if (!actorOK(actor)) throw new Error("Invalid engine actor");
        const version = schemaVersion(schema);
        this.definition = copy(schema);
        this.identityValue = {engine: ENGINE, contractVersion: ENGINE_CONTRACT_VERSION, actor, schemaVersion: version, capabilities: [...CAPABILITIES]};
        this.doc = new Doc(actor, this.definition);
    }
    identity(): EngineIdentity {return copy(this.identityValue);}
    revision(): number {return this.valueRevision;}
    schema(): Schema {return copy(this.definition);}
    model() {return copy(this.doc.toJSON());}
    requireCapability(capability: EngineCapability): void {
        if (!CAPABILITIES.includes(capability)) throw new Error(`Unsupported engine capability: ${capability}`);
    }
    /** Snapshot clones isolate transient compiler/prior-value caches and partial batch application. */
    private transaction<T>(action: (doc: Doc, history: History) => T): T {
        const doc = Doc.fromSnapshot(this.identityValue.actor, this.doc.snapshot(), this.definition);
        const history = History.fromSnapshot(this.history.snapshot());
        const result = action(doc, history);
        const detached = copy(result);
        this.doc = doc; this.history = history; this.valueRevision += 1;
        return detached;
    }
    edit(edits: EditOp[], record: RecordOptions | null = {caretBefore: "", caretAfter: ""}) {
        const input = copy(edits), options = record === null ? null : copy(record);
        return this.transaction((doc, history) => {
            const result = doc.edit(input, {normalize: true});
            if (options) history.record(result.ops, doc, options);
            return result;
        });
    }
    receive(writer: string, ops: Op[]): void {
        if (!actorOK(writer)) throw new Error("Invalid wire operation writer");
        const input = copy(ops);
        if (!Array.isArray(input)) throw new Error("Invalid wire operation batch");
        for (const op of input) {
            if (!op || !CRDT_OPERATION_KINDS.includes(op.t)) throw new Error("Invalid wire operation kind");
            const ticket = op.t === "text" || op.t === "node" ? op.id : op.at;
            if (!isTicket(ticket) || ticket.actor !== writer) throw new Error("Invalid wire operation writer");
        }
        this.transaction((doc) => {
            const error = doc.check(input);
            if (error) throw new Error(`Invalid wire operation batch: ${error}`);
            input.forEach(op => doc.apply(op));
            return null;
        });
    }
    captureAnchor(path: ModelPath): string | null {
        if (!Array.isArray(path) || path.length < 2 || path.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
        const pos = posOfPath(this.doc, path);
        return pos && pos.o === path.at(-1) && this.doc.visible(pos.line ?? MAIN) ? anchorAt(this.doc, path) : null;
    }
    resolveAnchor(anchor: string): ModelPath | null {
        const item = this.doc.get(anchor);
        const visible = this.doc.hasMoves || this.doc.hasCardinality ? this.doc.tokenLocation(anchor)?.visible : item && this.doc.visible(item.line.key);
        return item && visible ? copy(pathAt(this.doc, anchor)) : null;
    }
    captureSelection(selection: EngineSelection | null): EngineAnchoredSelection | null {
        if (!selection) return null;
        const anchor = this.captureAnchor(selection.anchor), focus = this.captureAnchor(selection.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
    resolveSelection(selection: EngineAnchoredSelection | null): EngineSelection | null {
        if (!selection) return null;
        const anchor = this.resolveAnchor(selection.anchor), focus = this.resolveAnchor(selection.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
    historyStatus() {return {canUndo: this.history.canUndo, canRedo: this.history.canRedo};}
    undo() {return this.transaction((doc, history) => history.undo(doc));}
    redo() {return this.transaction((doc, history) => history.redo(doc));}
    clearHistory(): void {this.transaction((_, history) => {history.clear(); return null;});}
    historyPin(deletions: Array<[string, number]>): number | null {
        const entries = copy(deletions);
        const map = new Map<string, number>();
        for (const [ticket, seq] of entries) {
            if (typeof ticket !== "string" || !Number.isSafeInteger(seq) || seq < 1 || map.has(ticket)) throw new Error("Invalid deletion sequence mapping");
            map.set(ticket, seq);
        }
        return this.history.pin(key => map.get(key));
    }
    checkpoint(): TypeScriptEngineCheckpoint {
        return copy({format: "doc-sync-typescript-checkpoint-v1", identity: this.identity(), revision: this.valueRevision, document: this.doc.snapshot(), history: this.history.snapshot()});
    }
    restore(checkpoint: EngineCheckpoint): void {
        const value = copy(checkpoint);
        if (value.format !== "doc-sync-typescript-checkpoint-v1" || !value.identity || value.identity.engine !== ENGINE || value.identity.contractVersion !== ENGINE_CONTRACT_VERSION) invalid("engine or version mismatch");
        if (value.identity.actor !== this.identityValue.actor || value.identity.schemaVersion !== this.identityValue.schemaVersion) invalid("actor or schema mismatch");
        if (!Array.isArray(value.identity.capabilities) || value.identity.capabilities.length !== CAPABILITIES.length || CAPABILITIES.some(cap => !value.identity.capabilities.includes(cap))) invalid("capabilities mismatch");
        if (!Number.isSafeInteger(value.revision) || value.revision < 0) invalid("revision");
        const doc = Doc.fromSnapshot(this.identityValue.actor, value.document as Snapshot, this.definition);
        const history = History.fromSnapshot(value.history);
        validateHistoryDocument(history.snapshot(), doc, this.identityValue.actor);
        this.doc = doc; this.history = history; this.valueRevision = value.revision;
    }
}

export const typescriptEngine: TypeScriptEngineFactory = Object.freeze({
    engine: ENGINE,
    contractVersion: ENGINE_CONTRACT_VERSION,
    create: (actor: string, schema: Schema): TypeScriptEngine => new TypeScriptDocumentEngine(actor, schema),
    restore: (actor: string, schema: Schema, checkpoint: EngineCheckpoint): TypeScriptEngine => {
        const engine = new TypeScriptDocumentEngine(actor, schema);
        engine.restore(checkpoint);
        return engine;
    },
});
