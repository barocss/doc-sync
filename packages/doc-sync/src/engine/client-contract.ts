import type {Op, Snapshot} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {EngineAnchoredSelection, EngineCapability, EngineCheckpoint, EngineEditResult, EngineHistoryResult, EngineHistoryStatus, EngineIdentity, EngineSelection} from "./contract.ts";
/** Deletion-ticket keys from the batch that was actually applied. */
export interface EngineReceiveResult {deletions: string[]}
export interface EngineStamp {generation: number; revision: number}
declare const handle: unique symbol;
export interface EnginePreparedDocument {readonly [handle]: "document"}
export interface EnginePreparedState {readonly [handle]: "state"}
export interface EngineEventCapture {readonly [handle]: "events"}
/** Applied operations have no History entry until record is called. */
export interface EngineEditingView {
    stamp(): EngineStamp;
    model(): NodeJSON;
    apply(edits: EditOp[], options?: {normalize?: boolean; accepted?: boolean}): Op[];
    applyModelEdits(before: NodeJSON, edits: EditOp[]): Op[];
    deleteRange(from: ModelPath, to: ModelPath): Op[] | null;
    captureAnchor(path: ModelPath): string | null;
    locateAnchor(key: string, visibility: "visible" | "retained"): ModelPath | null;
}
export interface EngineInputSession extends EngineEditingView {
    readonly active: boolean;
    begin(): void;
    reserveClock(): void;
    collect(ops: Op[], record?: RecordOptions | null): void;
    publish(): {ops: Op[]; record: RecordOptions} | null;
    cancel(): void;
    capture(range: EngineSelection | null): EngineAnchoredSelection | null;
    resolve(range: EngineAnchoredSelection | null): EngineSelection | null;
}
export interface ClientEngine extends EngineEditingView {
    identity(): EngineIdentity;
    schema(): Schema;
    requireCapabilities(required: readonly EngineCapability[]): void;
    setEditHooks(hooks: {guard: (() => void) | null; listener: ((edits: EditOp[], normalize: EditOp[]) => void) | null}): void;
    assertEditing(): void;
    record(ops: Op[], options: RecordOptions): void;
    /**
     * A capture from beginEvents(ops) owns the prepare-time batch; later mutation
     * of the same source array does not change it. Foreign, used, mismatched or
     * stale document/revision/schema captures fail before application. Token-only
     * lazy storage changes require validation again. The result describes applied values.
     */
    receive(writer: string, ops: Op[], capture?: EngineEventCapture): EngineReceiveResult;
    emitLocal(ops: Op[]): void;
    check(ops: Op[]): string | null;
    undo(): EngineHistoryResult;
    redo(): EngineHistoryResult;
    historyStatus(): EngineHistoryStatus;
    clearHistory(): void;
    historyDeletionKeys(): string[];
    historyPin(deletions: readonly [string, number][]): number | null;
    compact(frontier: number, deletions: readonly [string, number][]): void;
    snapshot(): Snapshot;
    allocationFloor(): number;
    prepareSnapshot(snapshot: Snapshot, schema?: Schema): EnginePreparedDocument;
    replayPrepared(prepared: EnginePreparedDocument, writer: string, ops: Op[]): void;
    compilePrepared(prepared: EnginePreparedDocument, edits: EditOp[]): EngineEditResult;
    installPrepared(prepared: EnginePreparedDocument, options?: {clockFloor?: number; clearHistory?: boolean}): void;
    checkpoint(): EngineCheckpoint;
    prepareCheckpoint(value: EngineCheckpoint): EnginePreparedState;
    installCheckpoint(value: EnginePreparedState): void;
    previewSchema(next: Schema): NodeJSON;
    upgradeSchema(next: Schema): void;
    reset(): void;
    /** With ops, validate and own the batch before scoped reads; receive can reuse its proof. */
    beginEvents(ops?: Op[]): EngineEventCapture;
    finishEvents(capture: EngineEventCapture): {events: EditOp[]; fallback: boolean};
    createSession(): EngineInputSession;
    dispose(): void;
}
export interface ClientEngineFactory {
    readonly engine: string;
    readonly contractVersion: number;
    create(actor: string, schema: Schema): ClientEngine;
}
/** Optional legacy TypeScript access. These objects are the authoritative state. */
export interface TypeScriptClientCompatibility {
    typescriptDocument(): import("../crdt/doc.ts").Doc;
    replaceTypeScriptDocument(doc: import("../crdt/doc.ts").Doc): void;
    typescriptHistory(): import("../crdt/history.ts").History;
    replaceTypeScriptHistory(history: import("../crdt/history.ts").History): void;
}
