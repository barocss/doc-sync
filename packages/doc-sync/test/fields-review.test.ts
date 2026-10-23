import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, checkSchema} from "../src/index.ts";
import type {NodeJSON, Schema} from "../src/index.ts";

const settings = {default: {width: 10, layout: {x: 1}, tags: ["base"]}, fields: {
    width: {default: 10}, layout: {default: {x: 1}, fields: {x: {default: 1}}}, tags: {default: ["base"]},
}};
const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["p", "table", "hidden"], default: "p", childRules: {hidden: {max: 0}}},
    p: {shape: "text", children: ["badge"], attrs: {settings}},
    badge: {shape: "inline", attrs: {settings}}, hidden: {shape: "atom", attrs: {settings}},
    table: {shape: "grid", children: ["row"]}, row: {shape: "row", children: ["cell"]},
    cell: {shape: "cell", children: ["body"], attrs: {settings}},
    body: {shape: "flow", children: ["p"], default: "p"},
}};
const mutate = (value: unknown) => {
    const nested = value as {width: number; layout: {x: number}; tags: string[]};
    nested.width = 77; nested.layout.x = 88; nested.tags.push("changed");
};
function seed(): Doc {
    const doc = new Doc("field-output", schema);
    doc.edit([{op: "insert", at: [0], content: [
        {type: "p", runs: [{text: "a", marks: {}}, {type: "badge"}]},
        {type: "table", children: [{type: "row", children: [{type: "cell"}]}]},
        {type: "hidden"},
    ]}]);
    return doc;
}
const selectors: Array<[string, (model: NodeJSON) => unknown]> = [
    ["block", model => model.children![0].attrs!.settings],
    ["inline", model => { const run = model.children![0].runs![1]; return "text" in run ? null : run.attrs!.settings; }],
    ["cell", model => model.children![1].children![0].children![0].attrs!.settings],
];
for (const [name, select] of selectors) test(`nested ${name} field outputs do not alias other models or cached document state`, () => {
    const doc = seed();
    const first = doc.toJSON(), second = doc.toJSON(), expected = structuredClone(second);
    const snapshot = doc.snapshot();
    mutate(select(first));
    assert.deepEqual(second, expected);
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(doc.snapshot(), snapshot);
    assert.deepEqual(Doc.fromSnapshot("peer", snapshot, schema).toJSON(), expected);
});

test("nested overflow field outputs do not alias later overflow reads", () => {
    const doc = seed();
    const first = doc.overflow(), second = doc.overflow(), expected = structuredClone(second);
    const snapshot = doc.snapshot();
    assert.equal(first.length, 1);
    mutate(first[0].attrs!.settings);
    assert.deepEqual(second, expected);
    assert.deepEqual(doc.overflow(), expected);
    assert.deepEqual(doc.snapshot(), snapshot);
});

for (const position of ["root", "row", "cell-body", "group", "span"] as const) {
    test(`field schemas reject unsupported ${position} attribute storage`, () => {
        const value = structuredClone(schema);
        if (position === "root") value.nodes.content.attrs = {settings};
        if (position === "row") value.nodes.row.attrs = {settings};
        if (position === "cell-body") value.nodes.body.attrs = {settings};
        if (position === "group") {
            value.nodes.group = {shape: "group", children: ["p"], by: [], attrs: {settings}};
        }
        if (position === "span") {
            value.markValues = {url: {default: ""}};
            value.nodes.link = {shape: "span", mark: "url", attr: "url", attrs: {settings}};
        }
        assert.ok(checkSchema(value).some(problem => /field/i.test(problem)), position);
        assert.throws(() => new Doc("unsupported", value), /field/i);
    });
}
