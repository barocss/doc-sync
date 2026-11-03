import assert from "node:assert/strict";
import test from "node:test";
import {SparseSheet, createSpreadsheetSchema} from "../src/spreadsheet/index.ts";

test("public standalone spreadsheet accepts custom fields and retains sparse defaults", () => {
    const schema = createSpreadsheetSchema({domain: "spreadsheet", version: 1, fields: {
        status: {type: "string", default: "open", values: ["open", "done"]},
        estimate: {type: "number", default: 0, min: 0},
    }});
    const a = new SparseSheet({actor: "a", sheetId: "public", rows: 1_000_000_000, columns: 20, schema});
    const b = new SparseSheet({actor: "b", sheetId: "public", rows: 1_000_000_000, columns: 20, schema});
    assert.equal(a.getCellValue(1, 2, "status"), "open");
    assert.equal(a.stats().registers, 0);
    b.receive(a.setCell(1, 2, {status: "done", estimate: 3}));
    assert.deepEqual(b.getCell(1, 2), {estimate: 3, status: "done"});
    assert.throws(() => a.setCell(1, 2, {status: "invalid"}));
    const restored = SparseSheet.fromState(a.captureState());
    assert.deepEqual(restored.pendingChanges(), a.pendingChanges());
    assert.equal(restored.getCellValue(1, 2, "status"), "done");
});

test("custom fields can reuse legacy names with different scalar types", () => {
    const schema = createSpreadsheetSchema({domain: "spreadsheet", version: 1, fields: {
        formula: {type: "number", default: 0}, bold: {type: "string", default: "normal"},
    }});
    const sheet = new SparseSheet({actor: "custom", sheetId: "names", rows: 2, columns: 2, schema});
    sheet.setCell(0, 0, {formula: 2, bold: "yes"});
    assert.deepEqual(sheet.getCell(0, 0), {bold: "yes", formula: 2});
    const formula: string | number | boolean | undefined = sheet.getCell(0, 0).formula;
    assert.equal(formula, 2);
    assert.throws(() => sheet.setCell(0, 0, {formula: "invalid"}));
    const legacy = new SparseSheet({actor: "legacy", sheetId: "old", rows: 2, columns: 2});
    assert.throws(() => legacy.setCell(0, 0, {formula: 2}));
});
