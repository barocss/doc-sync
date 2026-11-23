import type {Doc, Snapshot} from "../crdt/doc.ts";
import type {HistorySnapshot} from "../crdt/history.ts";
import type {EngineCheckpoint} from "../engine/contract.ts";
import {validateCheckpointDocument} from "../engine/checkpoint-validation.ts";

/** Detached local document state. Storage and replacement of open views belong to the caller. */
export interface LocalClientState {
    format: "doc-sync-local-state-v1";
    actor: string;
    schemaVersion: string;
    engine: EngineCheckpoint;
}

/** Check descriptors before cloning so getters cannot run during an open operation. */
export function copyLocalState<T>(value: T): T {
    const active = new Set<object>();
    const visit = (value: unknown, depth: number): void => {
        if (depth > 128) throw new Error("Local state exceeds JSON nesting limit");
        if (value === null || typeof value === "string" || typeof value === "boolean") return;
        if (typeof value === "number" && Number.isFinite(value)) return;
        if (typeof value !== "object" || active.has(value)) throw new Error("Local state must contain finite plain JSON");
        const array = Array.isArray(value), proto = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
        if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error("Local state must contain plain JSON");
        if (array && (keys.length !== value.length + 1 || Object.keys(value).some((key, index) => key !== String(index)))) throw new Error("Local state arrays must be dense");
        active.add(value);
        for (const key of keys) {
            if (array && key === "length") continue;
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) throw new Error("Local state must contain plain values");
            visit(descriptor.value, depth + 1);
        }
        active.delete(value);
    };
    visit(value, 0);
    return structuredClone(value);
}

function invalidLocalState(message: string): never {
    throw new Error(`Invalid local state: ${message}`);
}

/** Retain the local-state validation entry point and error contract. */
export function validateLocalState(doc: Doc, history: HistorySnapshot, snapshot: Snapshot, actor: string): void {
    validateCheckpointDocument(doc, history, snapshot, actor, invalidLocalState);
}
