import assert from "node:assert/strict";
import test from "node:test";
import {createSpreadsheetSchema, spreadsheetSchemaVersion, validateSpreadsheetFieldValue, DEFAULT_SPREADSHEET_SCHEMA} from "../src/spreadsheet/index.ts";
import type {SpreadsheetSchema} from "../src/spreadsheet/index.ts";
const schema: SpreadsheetSchema = {domain: "spreadsheet", version: 1, fields: {
    count: {type: "number", default: 2, min: 0, max: 9},
    label: {type: "string", default: "new", values: ["new", "done"], maxLength: 4},
    enabled: {type: "boolean", default: true}, any: {type: "scalar", default: null},
}};
test("spreadsheet fingerprints are stable, independent of field and property order", () => {
    const reordered = {fields: Object.fromEntries(Object.entries(schema.fields).reverse().map(([key, value]) => [key, Object.fromEntries(Object.entries(value).reverse())])), version: 1, domain: "spreadsheet"} as SpreadsheetSchema;
    assert.equal(spreadsheetSchemaVersion(schema), spreadsheetSchemaVersion(reordered));
    assert.notEqual(spreadsheetSchemaVersion(schema), spreadsheetSchemaVersion(DEFAULT_SPREADSHEET_SCHEMA));
    assert.match(spreadsheetSchemaVersion(schema), /^sha256:[a-f0-9]{64}$/);
    const detached = createSpreadsheetSchema(schema); detached.fields.count.default = 3;
    assert.equal(schema.fields.count.default, 2);
});
test("field rules enforce types, bounds, choices, and explicit clear", () => {
    for (const [field, value] of [["count", 0], ["count", 9], ["label", "done"], ["enabled", false], ["any", true], ["count", null]]) assert.equal(validateSpreadsheetFieldValue(schema, field as string, value), true);
    for (const [field, value] of [["count", -1], ["count", 10], ["count", "2"], ["count", NaN], ["label", "other"], ["enabled", 1], ["missing", true]]) assert.equal(validateSpreadsheetFieldValue(schema, field as string, value), false);
});
test("unsafe definitions and unsupported rules fail before accessor reads", () => {
    const invalid: unknown[] = [null, {}, {...schema, unknown: true}, {...schema, fields: {}}, {...schema, fields: {count: {type: "number", default: NaN}}},
        {...schema, fields: {count: {type: "number", default: -1, min: 0}}}, {...schema, fields: {count: {type: "string", default: null, min: 0}}},
        {...schema, fields: {count: {type: "number", default: null, min: 2, max: 1}}}, {...schema, fields: {count: {type: "scalar", default: null, maxLength: 2}}},
        {...schema, fields: {count: {type: "number", default: null, values: [1, 1]}}}, {...schema, fields: {count: {type: "number", default: null, values: ["bad"]}}},
        {...schema, fields: {count: {type: "number", default: null, values: [null]}}}, {...schema, fields: {constructor: {type: "string", default: null}}},
        {...schema, fields: {count: {type: "string", default: null, validate: () => true}}}, {...schema, fields: Object.create({x: {type: "string", default: null}})},
        {...schema, fields: Object.fromEntries(Array.from({length: 129}, (_, index) => [`f${index}`, {type: "string", default: null}]))}];
    let accessed = false;
    invalid.push(Object.defineProperty({}, "domain", {enumerable: true, get() { accessed = true; return "spreadsheet"; }}));
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic; invalid.push(cyclic);
    const holes = new Array(1); Object.assign(holes, {extra: 1});
    invalid.push({...schema, fields: {count: {type: "number", default: null, values: holes}}});
    for (const value of invalid) assert.throws(() => createSpreadsheetSchema(value as SpreadsheetSchema));
    assert.equal(accessed, false);
});
