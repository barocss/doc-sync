import type {Op, Snapshot} from "../crdt/doc.ts";
import type {HistorySnapshot, RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";

/** Draft contract revision. This is independent of the transport protocol version. */
export const ENGINE_CONTRACT_VERSION = 1 as const;
export type EngineCapability = "edit" | "receive" | "history" | "anchors" | "checkpoint" | "composition" | "events" | "gc" | "schema-transition";
export interface EngineIdentity {
    engine: string;
    contractVersion: typeof ENGINE_CONTRACT_VERSION;
    actor: string;
    schemaVersion: string;
    capabilities: readonly EngineCapability[];
}
/** All string offsets count UTF-16 code units. A backward selection stays backward. */
export interface EngineSelection {anchor: ModelPath; focus: ModelPath}
export interface EngineAnchoredSelection {anchor: string; focus: string}
export interface EngineEditResult {ops: Op[]; normalize: EditOp[]}
export interface EngineHistoryResult {ops: Op[]; caret: string | null}
export interface EngineHistoryStatus {canUndo: boolean; canRedo: boolean}
/** Engine-specific payload: other engines must reject this format until parity is proved. */
export interface EngineCheckpoint<DocumentState = unknown, HistoryState = unknown> {
    format: string;
    identity: EngineIdentity;
    revision: number;
    document: DocumentState;
    history: HistoryState;
}
/** TypeScript payload only; the common port makes no native state-layout assumption. */
export type TypeScriptEngineCheckpoint = EngineCheckpoint<Snapshot, HistorySnapshot> & {format: "doc-sync-typescript-checkpoint-v1"};
export interface TypeScriptEngine extends DocumentEngine {
    checkpoint(): TypeScriptEngineCheckpoint;
}
export interface TypeScriptEngineFactory extends EngineFactory {
    create(actor: string, schema: Schema): TypeScriptEngine;
    restore(actor: string, schema: Schema, checkpoint: EngineCheckpoint): TypeScriptEngine;
}
/** Value DTO boundary only. No Doc, Item, Line, Map, Clock or callback crosses it. */
export interface DocumentEngine {
    identity(): EngineIdentity;
    revision(): number;
    model(): NodeJSON;
    schema(): Schema;
    requireCapability(capability: EngineCapability): void;
    /** Record only this actor's compiled operations. null disables recording. */
    edit(edits: EditOp[], record?: RecordOptions | null): EngineEditResult;
    /** Causal predecessors must already exist; retries are idempotent. Never records history. */
    receive(writer: string, ops: Op[]): void;
    captureAnchor(path: ModelPath): string | null;
    resolveAnchor(anchor: string): ModelPath | null;
    captureSelection(selection: EngineSelection | null): EngineAnchoredSelection | null;
    resolveSelection(selection: EngineAnchoredSelection | null): EngineSelection | null;
    historyStatus(): EngineHistoryStatus;
    undo(): EngineHistoryResult;
    redo(): EngineHistoryResult;
    clearHistory(): void;
    /** Deletion-ticket/server-sequence pairs, supplied by the transport owner. No GC is performed. */
    historyPin(deletions: Array<[string, number]>): number | null;
    checkpoint(): EngineCheckpoint;
    /** Failure leaves document, history, revision and clock unchanged. Same actor/schema only. */
    restore(checkpoint: EngineCheckpoint): void;
}
export interface EngineFactory {
    readonly engine: string;
    readonly contractVersion: typeof ENGINE_CONTRACT_VERSION;
    create(actor: string, schema: Schema): DocumentEngine;
    restore(actor: string, schema: Schema, checkpoint: EngineCheckpoint): DocumentEngine;
}
