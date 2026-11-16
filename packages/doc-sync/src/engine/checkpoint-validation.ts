import type {Doc, Snapshot} from "../crdt/doc.ts";
import type {HistorySnapshot} from "../crdt/history.ts";
import {keyOf, ticketOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";
import {parseRequired} from "../crdt/cardinality.ts";

/** Validate only known state fields. User attribute values are not ticket records. */
export function validateCheckpointDocument(doc: Doc, history: HistorySnapshot, snapshot: Snapshot, actor: string, invalid: (message: string) => never): void {
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
    for (const [stack, groups] of [["undo", history.undo], ["redo", history.redo]] as const) for (const value of groups) {
        const group = value as {steps: Array<{type: string; ids: Ticket[]; delAt: Ticket | null; id: Ticket; target: Ticket; targets: Array<{id: Ticket}>}>};
        for (const step of group.steps) {
            if (step.type === "existence") {
                step.ids.forEach(exists);
                // A revived local deletion has null delAt in the redo stack and may
                // legitimately target foreign text. Null undo steps are insertions.
                const owned = step.delAt === null ? stack === "undo" ? step.ids : [] : [step.delAt];
                for (const value of owned) { ticket(value); if (value.actor !== actor) invalid("history belongs to another actor"); }
            } else if (step.type === "split") exists(step.id);
            else if (step.type === "move") exists(step.target);
            else if (step.type === "set") step.targets.forEach(target => exists(target.id));
        }
    }
}
