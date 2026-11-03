import assert from "node:assert/strict";
import test from "node:test";
import {StructuralSheet} from "../src/spreadsheet/structural-sheet.ts";
import type {StructuralSheetOp} from "../src/spreadsheet/structural-sheet.ts";
import {createSpreadsheetSchema} from "../src/spreadsheet/schema.ts";
const make = (actor: string) => new StructuralSheet({actor, sheetId: "structural", rows: 1_000_000_000, columns: 50});

test("S2 billion-row axes remain sparse and cells follow stable row and column IDs", () => {
    const a = make("a"), row = a.rowIdAt(5), column = a.columnIdAt(4);
    a.setCell(5, 4, {value: "tracked", bold: true});
    a.insertRows(2, 3); a.insertColumns(1, 2);
    assert.equal(a.rowIndexOf(row), 8); assert.equal(a.columnIndexOf(column), 6);
    assert.deepEqual(a.getCell(8, 6), {value: "tracked", bold: true});
    a.moveRows(8, 1, 0); a.moveColumns(6, 1, 0);
    assert.deepEqual(a.getCell(0, 0), {value: "tracked", bold: true});
    assert.equal(a.stats().registers, 2); assert.ok(a.stats().rowRuns < 12); assert.ok(a.stats().columnRuns < 12);
    assert.equal(a.captureState().checkpoint.rows.length, 2);
});

test("S2 offline cell writes survive row deletion, hidden local writes reject, undo restores retained data", () => {
    const a = make("a"), b = make("b"), row = a.rowIdAt(3), column = a.columnIdAt(2);
    const remote = b.setCell(3, 2, {value: "offline"});
    a.deleteRows(3); const before = a.captureState();
    assert.throws(() => a.setCellById(row, column, {value: "invalid"})); assert.deepEqual(a.captureState(), before);
    a.receive(remote); assert.equal(a.rowIndexOf(row), -1); assert.deepEqual(a.getCellById(row, column), {value: "offline"});
    a.undo(); assert.equal(a.rowIndexOf(row), 3); assert.equal(a.getCell(3, 2).value, "offline");
    a.redo(); assert.equal(a.rowIndexOf(row), -1);
});

test("S2 concurrent inserts and offline writes converge across operation permutations and duplicate delivery", () => {
    const a = make("a"), b = make("b");
    const ai = a.insertRows(2, 2), bi = b.insertRows(2, 1);
    const aw = a.setCell(2, 0, {value: "A"}), bw = b.setCell(2, 0, {value: "B"});
    const original = [...ai, ...bi, ...aw, ...bw];
    const visible = (s: StructuralSheet) => Array.from({length: 7}, (_, i) => [s.rowIdAt(i), s.getCell(i, 0)]);
    const expected = make("reference"); expected.receive(original);
    for (const ops of [original, [...original].reverse(), [bw[0], ai[0], aw[0], bi[0]]]) {
        const replica = make("reader"); for (const op of ops) replica.receive([op]); replica.receive(original);
        assert.deepEqual(visible(replica), visible(expected)); assert.equal(replica.stats().retainedOps, original.length);
    }
});

test("S2 selective cell undo preserves peer fields and same-value writer fences across structural edits", () => {
    const a = make("a"), b = make("b");
    b.receive(a.setCell(2, 1, {value: "first", bold: true}));
    const peer = b.setCell(2, 1, {value: "first"}); a.receive(peer);
    a.insertRows(0, 2); a.undo();
    const undo = a.undo(); assert.equal(undo.length, 1); assert.deepEqual(a.getCell(2, 1), {value: "first"});
    a.redo(); assert.deepEqual(a.getCell(2, 1), {value: "first", bold: true});
});

test("S2 consecutive own cell undo and redo retain S1 linked compensation semantics", () => {
    const a = make("a"); a.setCell(0, 0, {value: "one"}); a.setCell(0, 0, {value: "two"});
    a.undo(); assert.equal(a.getCell(0, 0).value, "one"); a.undo(); assert.deepEqual(a.getCell(0, 0), {});
    a.redo(); assert.equal(a.getCell(0, 0).value, "one"); a.redo(); assert.equal(a.getCell(0, 0).value, "two");
});

test("S2 structural undo retains peer deletion and peer move operations", () => {
    const a = new StructuralSheet({actor: "a", sheetId: "s", rows: 6, columns: 2}), b = new StructuralSheet({actor: "b", sheetId: "s", rows: 6, columns: 2});
    const deleted = a.rowIdAt(2); b.receive(a.deleteRows(2)); a.receive(b.deleteRows(2));
    a.undo(); assert.equal(a.rowIndexOf(deleted), 2); assert.equal(a.rowIndexOf({source: "initial", offset: 3}), -1);
    a.redo(); assert.equal(a.rowIndexOf(deleted), -1);
});

test("S2 atomic operation preflight rejects collisions, actor forks, invalid mixed batches and acknowledgements", () => {
    const a = make("a"), b = make("b"); const [cell] = b.setCell(0, 0, {value: "b"});
    const before = a.captureState();
    assert.throws(() => a.receive([cell, {...cell, kind: "unknown"} as unknown as StructuralSheetOp])); assert.deepEqual(a.captureState(), before);
    assert.throws(() => a.receive([cell, {...cell, value: "collision"} as StructuralSheetOp])); assert.deepEqual(a.captureState(), before);
    const fork = make("a").setCell(1, 1, {value: 9}); assert.throws(() => a.receive(fork)); assert.deepEqual(a.captureState(), before);
    const own = a.insertColumns(0); assert.throws(() => a.acknowledge([...own, cell])); assert.deepEqual(a.pendingChanges(), own);
    a.acknowledge(own); assert.deepEqual(a.pendingChanges(), []);
});

test("S2 schema identity binds structural and stable cell operations, snapshot replay preserves history and pending", () => {
    const schema = createSpreadsheetSchema({domain: "spreadsheet", version: 1, fields: {status: {type: "string", default: "open", values: ["open", "done"]}}});
    const a = new StructuralSheet({actor: "a", sheetId: "custom", rows: 10, columns: 5, schema});
    assert.equal(a.getCellValue(0, 0, "status"), "open"); a.insertRows(1, 2); a.setCell(1, 0, {status: "done"}); a.moveRows(1, 1, 0); a.undo();
    const state = a.captureState(), restored = StructuralSheet.fromState(state); assert.deepEqual(restored.captureState(), state);
    assert.deepEqual(restored.redo(), a.redo()); assert.deepEqual(restored.undo(), a.undo()); assert.deepEqual(restored.undo(), a.undo());
    const tampered = structuredClone(state); tampered.checkpoint.clock++; assert.throws(() => StructuralSheet.fromState(tampered));
    const b = new StructuralSheet({actor: "b", sheetId: "custom", rows: 10, columns: 5}); assert.throws(() => b.receive(a.pendingChanges()));
});

test("S2 stable cell keys ignore JSON object property order and IDs survive JSON snapshot transport", () => {
    const a = make("a"), b = make("b"); a.insertRows(0); const ops = a.setCell(0, 1, {value: "stable"});
    const reversed = ops.map(op => op.kind === "cell" ? {...op, row: {offset: op.row.offset, source: op.row.source}, column: {offset: op.column.offset, source: op.column.source}} : op);
    b.receive([...a.pendingChanges().filter(op => op.kind !== "cell"), ...reversed]);
    assert.deepEqual(b.getCell(0, 1), {value: "stable"});
    const row = a.rowIdAt(0), column = a.columnIdAt(1);
    assert.deepEqual(b.getCellById({offset: row.offset, source: row.source}, {offset: column.offset, source: column.source}), {value: "stable"});
    b.receive(ops); assert.equal(b.stats().registers, 1);
    assert.deepEqual(StructuralSheet.fromState(JSON.parse(JSON.stringify(b.captureState()))).getCell(0, 1), {value: "stable"});
});

test("S2 stable cell sources reject future births, wrong axes, source overruns and identity collisions atomically", () => {
    const a = make("a"), b = make("b"); const [birth] = b.insertRows(0); const [cell] = b.setCell(0, 0, {value: "born"});
    if (cell.kind !== "cell") throw new Error("expected cell");
    for (const bad of [{...cell, at: {actor: "b", lamport: 1}}, {...cell, row: {...cell.row, offset: 99}}, {...cell, row: cell.column, column: cell.row}]) {
        const before = a.captureState(); assert.throws(() => a.receive([birth, bad])); assert.deepEqual(a.captureState(), before);
    }
    const unknown = {...cell, row: {...cell.row, offset: 99}}; a.receive([unknown]); const checkpoint = a.captureState();
    assert.throws(() => a.receive([birth])); assert.deepEqual(a.captureState(), checkpoint);
});

test("S2 history and prefix acknowledgement continue after strict replay and failed restore is atomic", () => {
    const a = make("a"), b = make("b"); b.receive(a.setCell(0, 0, {value: "original"})); a.receive(b.setCell(0, 0, {value: "peer"}));
    a.deleteColumns(0); a.undo(); a.undo(); // peer fence makes the cell undo emit no writes
    const restored = StructuralSheet.fromState(a.captureState()); assert.deepEqual(restored.redo(), a.redo());
    const prefix = a.pendingChanges().slice(0, 2); a.acknowledge(prefix); restored.acknowledge(prefix);
    assert.deepEqual(restored.captureState(), a.captureState());
    const before = a.captureState(), bad = structuredClone(before); bad.options.actor = "other";
    assert.throws(() => a.restoreState(bad)); assert.deepEqual(a.captureState(), before);
});

test("S2 public stable ID APIs reject accessors and cycles before reading values or mutating state", () => {
    const a = make("a"), before = a.captureState(); let calls = 0;
    const accessor = {offset: 0, get source() { calls++; return "initial"; }};
    const cyclic: any = {source: "initial", offset: 0}; cyclic.extra = cyclic;
    for (const id of [accessor, cyclic]) {
        assert.throws(() => a.rowIndexOf(id)); assert.throws(() => a.columnIndexOf(id));
        assert.throws(() => a.getCellById(id, a.columnIdAt(0))); assert.throws(() => a.setCellById(id, a.columnIdAt(0), {value: "invalid"}));
    }
    assert.equal(calls, 0); assert.deepEqual(a.captureState(), before);
    const b = make("b"), [cell] = b.setCell(0, 0, {value: "invalid"}); if (cell.kind !== "cell") throw Error("expected cell");
    assert.throws(() => a.receive([{...cell, row: {source: "initial", offset: a.rows}}])); assert.deepEqual(a.captureState(), before);
});

test("S2 staged global ledger rejects cells and opposite axes used as birth sources, including split delivery", () => {
    const source = make("source"), [cell] = source.setCell(0, 0, {value: "not a birth"});
    const forged = {...cell, at: {lamport: 2, actor: "forger"}, row: {source: "1@source", offset: 0}} as StructuralSheetOp;
    const a = make("a"), before = a.captureState(); assert.throws(() => a.receive([cell, forged])); assert.deepEqual(a.captureState(), before);
    a.receive([forged]); const unresolved = a.captureState(); assert.throws(() => a.receive([cell])); assert.deepEqual(a.captureState(), unresolved);
    const b = make("b"), [column] = source.insertColumns(0);
    const badAnchor: StructuralSheetOp = {kind: "insert", at: {lamport: 3, actor: "forger"}, sheetId: "structural", axis: "row", count: 1, before: {source: "2@source", offset: 0}};
    assert.throws(() => b.receive([column, badAnchor])); assert.equal(b.stats().retainedOps, 0);
});

test("S2 strict causal admission rejects unresolved references atomically and accepts same-batch births", () => {
    const source = make("source"); const born = source.insertRows(0), written = source.setCell(0, 0, {value: "born"});
    const server = make("server"), before = server.captureState();
    assert.throws(() => server.receive(written, {requireKnownReferences: true})); assert.deepEqual(server.captureState(), before);
    server.receive([...written, ...born], {requireKnownReferences: true}); assert.equal(server.getCell(0, 0).value, "born");
    const badMove: StructuralSheetOp = {kind: "move", at: {lamport: 5, actor: "forger"}, sheetId: "structural", axis: "row", targets: [{source: "3@missing", start: 0, count: 1}], before: null};
    const checkpoint = server.captureState(); assert.throws(() => server.receive([badMove], {requireKnownReferences: true})); assert.deepEqual(server.captureState(), checkpoint);
    const client = make("client"); client.receive(written); client.receive(born); assert.equal(client.getCell(0, 0).value, "born");
});
