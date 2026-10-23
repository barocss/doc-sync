import {compareTicket, keyOf} from "./ticket.ts";
import type {Ticket} from "./ticket.ts";

/** Object identity and placement identity are deliberately separate. */
export type MoveOp = {t: "move"; at: Ticket; target: Ticket; parent: Ticket; after: Ticket | null};
export type Placement = {id: Ticket; target: string; parent: string; after: string | null};
export type PlacementProjection = {current: Map<string, Placement>; order: Map<string, string[]>};

/** Retained movement log. No pruning is safe merely because a deletion is stable. */
export class Placements {
    private readonly records = new Map<string, MoveOp>();
    get active(): boolean { return this.records.size > 0; }
    get(id: string): MoveOp | undefined { return this.records.get(id); }
    values(): MoveOp[] { return [...this.records.values()].sort((a, b) => compareTicket(a.at, b.at)); }
    apply(op: MoveOp): void {
        const key = keyOf(op.at), previous = this.records.get(key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(op)) throw new Error("Conflicting movement identity");
        if (!previous) this.records.set(key, structuredClone(op));
    }
    project(base: Placement[], ownerOf: (line: string) => string | null): PlacementProjection {
        const current = new Map(base.map(entry => [entry.target, entry]));
        const all = new Map(base.map(entry => [keyOf(entry.id), entry]));
        for (const op of this.values()) {
            const entry: Placement = {id: op.at, target: keyOf(op.target), parent: keyOf(op.parent), after: op.after && keyOf(op.after)};
            all.set(keyOf(op.at), entry);
            if (!current.has(entry.target)) continue;
            let owner = ownerOf(entry.parent);
            const seen = new Set<string>();
            while (owner !== null && owner !== entry.target && !seen.has(owner)) {
                seen.add(owner);
                const parent = current.get(owner);
                owner = parent ? ownerOf(parent.parent) : null;
            }
            // Re-evaluated in total Ticket order. Never permanently reject a move
            // based on whichever concurrent ancestry happened to arrive first.
            if (owner !== entry.target && owner === null) current.set(entry.target, entry);
        }
        const children = new Map<string, Map<string | null, Placement[]>>();
        for (const entry of all.values()) {
            let line = children.get(entry.parent);
            if (!line) children.set(entry.parent, line = new Map());
            const siblings = line.get(entry.after) ?? [];
            siblings.push(entry); line.set(entry.after, siblings);
        }
        const order = new Map<string, string[]>();
        for (const [parent, byOrigin] of children) {
            for (const siblings of byOrigin.values()) siblings.sort((a, b) => compareTicket(b.id, a.id));
            const result: string[] = [], visited = new Set<string>();
            const stack = [...(byOrigin.get(null) ?? [])].reverse();
            while (stack.length) {
                const entry = stack.pop()!, key = keyOf(entry.id);
                if (visited.has(key)) continue;
                visited.add(key);
                const winner = current.get(entry.target);
                if (winner && keyOf(winner.id) === key && winner.parent === parent) result.push(entry.target);
                stack.push(...[...(byOrigin.get(key) ?? [])].reverse());
            }
            order.set(parent, result);
        }
        return {current, order};
    }
}
