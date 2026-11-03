import assert from "node:assert/strict";
import {test} from "node:test";
import {diffFields, fieldValueOk, patchFields} from "../src/crdt/fields.ts";
import {applyEdits, diffModels} from "../src/crdt/model.ts";
import type {AttrSpec, Schema} from "../src/crdt/schema.ts";

const fields: AttrSpec = {default: {layout: {x: 1}, tags: ["base"]}, fields: {
    layout: {default: {x: 1}, fields: {x: {default: 1}}}, tags: {default: ["base"]},
}};
test("module field helpers retain per-call results and branch reset semantics", () => {
    const before = {layout: {x: 2}, tags: ["base"]};
    const next = {layout: {x: 3}, tags: ["next"]};
    const expected = {layout: {x: 3}, tags: ["next"]};
    const first = diffFields(fields, before, next)!;
    assert.deepEqual(first, expected);
    (first.tags as string[]).push("mutated");
    assert.deepEqual(diffFields(fields, before, next), expected);
    assert.deepEqual(diffFields(fields, next, fields.default), {layout: {x: null}, tags: null});
    assert.equal(diffFields(fields, next, next), null);
    assert.deepEqual(patchFields(fields, before, {layout: null}), {layout: {x: 1}, tags: ["base"]});
    assert.ok(fieldValueOk(fields, {layout: {x: 5}}));
    assert.equal(fieldValueOk(fields, {layout: {unknown: 5}}), false);
    assert.equal(fieldValueOk(fields, {layout: {x: Infinity}}), false);
    assert.ok(fieldValueOk(fields, {layout: {x: 5}}));
});

test("module unit content helper preserves text diff prefix/suffix and marks", () => {
    const schema: Schema = {root: "doc", marks: ["strong"], nodes: {
        doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"},
    }};
    const before = {type: "doc", children: [{type: "p", runs: [{text: "앞😀tail", marks: {}}]}]};
    const after = {type: "doc", children: [{type: "p", runs: [{text: "앞X", marks: {strong: true}}, {text: "tail", marks: {}}]}]};
    const edits = diffModels(schema, before, after);
    assert.deepEqual(applyEdits(schema, before, edits), after);
    assert.deepEqual(diffModels(schema, after, after), []);
    assert.deepEqual(applyEdits(schema, after, diffModels(schema, after, before)), before);
});

// Doc.apply is deliberately lower level than admission. The copy boundary must
// preserve primitive behavior even when public admission would reject a value.
import {Doc} from "../src/crdt/doc.ts";
const copySchema: Schema = {root: "doc", marks: [], nodes: {
    doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text", attrs: {value: {default: null}}},
}};
function valueDoc(value: unknown): Doc {
    const doc = new Doc("copy", copySchema);
    doc.apply({t: "node", id: {lamport: 1, actor: "copy"}, origin: {lamport: 0, actor: "~root"}, type: "p", attrs: {value}});
    return doc;
}
const snapshotValue = (doc: Doc): unknown => doc.snapshot().lines[0].items[1].a!.find(([key]) => key === "value")![1];
test("primitive copies preserve undefined, bigint, nonfinite numbers, and negative zero", () => {
    const clone = globalThis.structuredClone;
    let primitiveHostClones = 0;
    globalThis.structuredClone = <T>(value: T, options?: StructuredSerializeOptions): T => {
        if (value === null || typeof value !== "object") primitiveHostClones += 1;
        return clone(value, options);
    };
    try {
        for (const value of [undefined, null, true, false, "text", 0, -0, NaN, Infinity, -Infinity, 12n]) {
            assert.ok(Object.is(snapshotValue(valueDoc(value)), value), String(value));
        }
        assert.equal(primitiveHostClones, 0);
    } finally { globalThis.structuredClone = clone; }
});

test("object copies remain detached; functions, symbols, proxies, and throwing accessors still reject", () => {
    const input = {nested: [1]}, doc = valueDoc(input);
    input.nested.push(2);
    const output = snapshotValue(doc) as typeof input;
    assert.deepEqual(output, {nested: [1]});
    output.nested.push(3);
    assert.deepEqual(snapshotValue(doc), {nested: [1]});
    for (const value of [() => 1, Symbol("value"), new Proxy({}, {})]) assert.throws(() => valueDoc(value), {name: "DataCloneError"});
    const expected = new Error("accessor failed");
    assert.throws(() => valueDoc({get value() { throw expected; }}), error => error === expected);
    let reads = 0;
    const accessor = valueDoc({get value() { reads += 1; return {nested: [1]}; }});
    assert.equal(reads, 1);
    assert.deepEqual(snapshotValue(accessor), {value: {nested: [1]}});
});
