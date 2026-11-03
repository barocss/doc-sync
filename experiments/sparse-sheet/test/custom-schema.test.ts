import assert from "node:assert/strict";
import test from "node:test";
import {SparseSheet} from "../src/sheet.ts";
import type {SpreadsheetSchema} from "@barocss/doc-sync";
import {TASK_SHEET_SCHEMA as taskSchema, SENSOR_SHEET_SCHEMA as sensorSchema} from "../custom-schema-fixture.ts";
const make = (actor = "a", schema = taskSchema) => new SparseSheet({actor, sheetId: "custom", rows: 1_000_000_000, columns: 1_000_000, schema});
test("two unrelated schemas resolve defaults in huge blank sheets without allocation", () => {
    for (const schema of [taskSchema, sensorSchema]) {
        const sheet = make("a", schema), before = sheet.captureState();
        for (const [field, rule] of Object.entries(schema.fields)) assert.equal(sheet.getCellValue(999_999_999, 999_999, field), rule.default);
        assert.deepEqual(sheet.getCell(999_999_999, 999_999), {});
        assert.deepEqual(sheet.getRange({row: 0, column: 0, rowCount: 1_000_000_000, columnCount: 1_000_000}), []);
        assert.deepEqual(sheet.captureState(), before);
        assert.equal(sheet.stats().registers, 0);
    }
});
test("custom field ordering, concurrent first writes, and independent field merges converge", () => {
    const reverse: SpreadsheetSchema = {...taskSchema, fields: Object.fromEntries(Object.entries(taskSchema.fields).reverse())};
    const a = make(), z = make("z", reverse);
    const ao = a.setCell(7, 9, {title: "A", progress: 25, archived: false});
    const zo = z.setCell(7, 9, {progress: 50, title: "Z"});
    assert.deepEqual(ao.map(op => op.field), ["archived", "progress", "title"]);
    assert.equal(ao[0].schemaVersion, zo[0].schemaVersion);
    assert.deepEqual(make("a", reverse).setCell(7, 9, {archived: false, progress: 25, title: "A"}), ao);
    a.receive(zo); z.receive(ao);
    assert.deepEqual(a.getCell(7, 9), z.getCell(7, 9));
    assert.deepEqual(a.getCell(7, 9), {archived: false, progress: 25, title: "A"});
    assert.throws(() => a.setCell(0, 0, {progress: 101}));
    assert.throws(() => a.setCell(0, 0, {unit: "C"}));
});
test("peer writes fence own history while two undo and redo retain custom field rules", () => {
    const a = make(), b = make("b");
    b.receive(a.setCell(0, 0, {title: "one", progress: 10}));
    b.receive(a.setCell(0, 0, {title: "two", progress: 20}));
    a.receive(b.setCell(0, 0, {title: "peer"}));
    a.undo(); a.undo();
    assert.deepEqual(a.getCell(0, 0), {title: "peer"});
    assert.equal(a.getCellValue(0, 0, "progress"), 0);
    a.redo(); a.redo();
    assert.deepEqual(a.getCell(0, 0), {progress: 20, title: "peer"});
});
test("mixed wrong-schema batches fail atomically before clocks, pending, or reads change", () => {
    const a = make(), b = make("b"), wrong = make("c", sensorSchema);
    a.setCell(0, 0, {title: "local"});
    const good = b.setCell(0, 1, {progress: 10}), bad = wrong.setCell(0, 2, {reading: 2});
    const before = a.captureState();
    assert.throws(() => a.receive([...good, ...bad])); assert.deepEqual(a.captureState(), before);
    assert.throws(() => a.receive(good.map(({schemaVersion, ...op}) => op))); assert.deepEqual(a.captureState(), before);
    const capture = a.captureState, getCell = a.getCell, getRange = a.getRange;
    a.captureState = () => { throw Error("capture forbidden"); }; a.getCell = () => { throw Error("cell read forbidden"); }; a.getRange = () => { throw Error("range read forbidden"); };
    a.receive(good);
    a.captureState = capture; a.getCell = getCell; a.getRange = getRange;
    assert.equal(a.getCellValue(0, 1, "progress"), 10);
});
test("custom snapshots replay exact retry, defaults after clear, and reject damaged schema or pending atomically", () => {
    const a = make(), b = make("b");
    a.setCell(0, 0, {title: "one"}); a.setCell(0, 0, {title: null});
    a.receive(b.setCell(0, 1, {progress: 30})); a.undo();
    const state = a.captureState(), recovered = SparseSheet.fromState(state);
    assert.deepEqual(recovered.captureState(), state); assert.deepEqual(recovered.pendingChanges(), a.pendingChanges());
    recovered.acknowledge(recovered.pendingChanges()); recovered.redo();
    assert.equal(recovered.getCellValue(0, 0, "title"), "Untitled"); assert.deepEqual(recovered.getCell(0, 0), {});
    const damaged = structuredClone(state); damaged.options.schema!.fields.progress.max = 99;
    const pending = structuredClone(state); pending.checkpoint.pending[0].schemaVersion = "sha256:bad";
    for (const bad of [damaged, pending, {...state, schemaVersion: "sha256:bad"}]) {
        assert.throws(() => a.restoreState(bad)); assert.deepEqual(a.captureState(), state);
    }
    const different = make("a", sensorSchema).captureState(); assert.throws(() => a.restoreState(different)); assert.deepEqual(a.captureState(), state);
});
