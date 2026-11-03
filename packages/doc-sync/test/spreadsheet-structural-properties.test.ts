import assert from "node:assert/strict";
import test from "node:test";
import {StructuralSheet} from "../src/spreadsheet/structural-sheet.ts";
import type {StructuralSheetOp} from "../src/spreadsheet/structural-sheet.ts";

function random(seed: number) { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; }; }
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
    const result = [...items]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result;
}
function visible(sheet: StructuralSheet) {
    return {rows: Array.from({length: sheet.rows}, (_, index) => sheet.rowIdAt(index)), columns: Array.from({length: sheet.columns}, (_, index) => sheet.columnIdAt(index)),
        cells: sheet.getRange({row: 0, column: 0, rowCount: sheet.rows, columnCount: sheet.columns, limit: 100_000})};
}

for (let seed = 1; seed <= 20; seed++) test(`S2 mixed wrapper history converges for seed ${seed}, 40 actions and 5 shuffled deliveries`, () => {
    const rng = random(seed), pick = (size: number) => Math.floor(rng() * size);
    const make = (actor: string) => new StructuralSheet({actor, sheetId: `mixed-${seed}`, rows: 8, columns: 7});
    const peers = [make("a"), make("b"), make("c")], ops: StructuralSheetOp[] = [];
    for (let step = 0; step < 40; step++) {
        const peer = peers[pick(peers.length)];
        if (rng() < 0.4) peer.receive(shuffled(ops, rng));
        const choice = pick(10), axis = rng() < 0.5 ? "row" : "column", length = axis === "row" ? peer.rows : peer.columns;
        let made: StructuralSheetOp[];
        if (choice < 3 && peer.rows && peer.columns) made = peer.setCell(pick(peer.rows), pick(peer.columns), {[choice === 0 ? "value" : choice === 1 ? "bold" : "fill"]: choice === 0 ? `${seed}:${step}` : choice === 1 ? rng() < 0.5 : `color-${pick(5)}`});
        else if (choice === 3 || !length) made = axis === "row" ? peer.insertRows(pick(length + 1), 1 + pick(2)) : peer.insertColumns(pick(length + 1), 1 + pick(2));
        else if (choice === 4 || choice === 5) {
            const start = pick(length), count = 1 + pick(Math.min(2, length - start));
            made = axis === "row" ? peer.deleteRows(start, count) : peer.deleteColumns(start, count);
        } else if (choice === 6 || choice === 7) {
            const start = pick(length), count = 1 + pick(Math.min(2, length - start)), destination = pick(length - count + 1);
            made = axis === "row" ? peer.moveRows(start, count, destination) : peer.moveColumns(start, count, destination);
        } else made = choice === 8 ? peer.undo() : peer.redo();
        ops.push(...made);
        if (made.length && rng() < 0.3) peers[pick(peers.length)].receive(shuffled([...made, ...made], rng));
    }
    for (const peer of peers) peer.receive(ops);
    const expected = visible(peers[0]); for (const peer of peers) assert.deepEqual(visible(peer), expected);
    for (let delivery = 0; delivery < 5; delivery++) {
        const replica = make(`reader-${delivery}`), order = shuffled(ops, rng);
        // Each receive can contain a late dependency, a duplicate, or several unrelated writes.
        for (let cursor = 0; cursor < order.length;) {
            const count = 1 + pick(5), batch = order.slice(cursor, cursor + count); cursor += count;
            replica.receive(rng() < 0.5 ? [...batch, ...batch] : batch);
        }
        replica.receive(shuffled(ops, rng)); assert.deepEqual(visible(replica), expected);
        assert.equal(replica.stats().retainedOps, ops.length);
    }
    for (const peer of peers) {
        const restored = StructuralSheet.fromState(JSON.parse(JSON.stringify(peer.captureState())));
        assert.deepEqual(restored.captureState(), peer.captureState()); assert.deepEqual(restored.pendingChanges(), peer.pendingChanges());
        const inPlace = make(peer.captureState().options.actor);
        inPlace.restoreState(JSON.parse(JSON.stringify(peer.captureState())));
        assert.deepEqual(inPlace.captureState(), peer.captureState());
        assert.deepEqual(visible(inPlace), visible(peer));
        assert.deepEqual(restored.undo(), peer.undo()); assert.deepEqual(visible(restored), visible(peer));
        assert.deepEqual(restored.redo(), peer.redo()); assert.deepEqual(visible(restored), visible(peer));
        const prefix = peer.pendingChanges().slice(0, Math.floor(peer.pendingChanges().length / 2));
        peer.acknowledge(prefix); restored.acknowledge(prefix); assert.deepEqual(restored.captureState(), peer.captureState());
    }
});
