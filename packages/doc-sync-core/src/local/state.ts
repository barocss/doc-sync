import type {Doc, Snapshot} from "../crdt/doc.ts";
import type {HistorySnapshot} from "../crdt/history.ts";
import {keyOf, ticketOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";
import type {EngineCheckpoint} from "../engine/contract.ts";
import {parseRequired} from "../crdt/cardinality.ts";

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

/** Validate only known state fields. User attribute values are not ticket records. */
export function validateLocalState(doc: Doc, history: HistorySnapshot, snapshot: Snapshot, actor: string): void {
    const invalid = (message: string): never => { throw new Error(`Invalid local state: ${message}`); };
    const floor = snapshot.lamport;
    const ticket = (value: Ticket): void => {
        if (!value || !Number.isSafeInteger(value.lamport) || value.lamport < 0 || typeof value.actor !== "string" || !value.actor) invalid("invalid ticket");
        // Required-child identities are deterministic schema storage, not clock allocations.
        if (value.lamport > floor && !(value.lamport === 1 && parseRequired(keyOf(value)))) invalid("ticket exceeds saved clock");
    };
    const key = (value: string): void => {
        if (typeof value !== "string") invalid("invalid ticket key");
        const parsed = ticketOf(value); ticket(parsed);
        if (keyOf(parsed) !== value) invalid("invalid ticket key");
    };
    const exists = (value: Ticket): void => { ticket(value); if (!doc.hasStoredToken(keyOf(value))) invalid("history token is absent from document"); };
    for (const line of doc.lines()) for (const item of line.items) {
        ticket({...item.id, lamport: item.id.lamport + item.span - 1});
        for (const entry of item.attrs.values()) ticket(entry.at);
        item.dels.forEach(key); item.cancels.forEach(key);
    }
    for (const move of snapshot.moves ?? []) {
        ticket(move.at); ticket(move.target); ticket(move.parent); if (move.after) ticket(move.after);
    }
    for (const value of history.sets) {
        const state = value as {at?: Ticket}; if (state.at) ticket(state.at);
    }
    const placements = new Map((snapshot.moves ?? []).map(move => [keyOf(move.at), move]));
    for (const value of history.moves) {
        const state = value as {at: Ticket; parent: Ticket; after: Ticket | null};
        ticket(state.at); exists(state.parent);
        if (state.after) {
            ticket(state.after);
            // Placement anchors can name an earlier movement, independently of token IDs.
            const placement = placements.get(keyOf(state.after));
            if (placement) { if (keyOf(placement.parent) !== keyOf(state.parent)) invalid("history placement anchor has another parent"); }
            else exists(state.after);
        }
    }
    for (const value of [...history.undo, ...history.redo]) {
        const group = value as {steps: Array<{type: string; ids: Ticket[]; delAt: Ticket | null; id: Ticket; target: Ticket; targets: Array<{id: Ticket}>}>};
        for (const step of group.steps) {
            if (step.type === "existence") {
                step.ids.forEach(exists);
                const owned = step.delAt === null ? step.ids : [step.delAt];
                for (const value of owned) { ticket(value); if (value.actor !== actor) invalid("history belongs to another actor"); }
            } else if (step.type === "split") exists(step.id);
            else if (step.type === "move") exists(step.target);
            else if (step.type === "set") step.targets.forEach(target => exists(target.id));
        }
    }
}
