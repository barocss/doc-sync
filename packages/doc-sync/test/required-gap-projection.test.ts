import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, type NodeJSON, type Op, type Schema} from "../src/index.ts";

const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "rule"], default: "paragraph", childRules: {rule: {min: 1, max: 1}}},
    paragraph: {shape: "text", attrs: {label: {default: ""}}}, rule: {shape: "atom"},
}};
const options = {caretBefore: "", caretAfter: ""};
function seed(): Doc {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "root"}, {op: "insert", at: [1], content: [
        {type: "paragraph", attrs: {label: "kept"}, runs: [{text: "content", marks: {}}]},
    ]}]);
    return doc;
}
function text(node: NodeJSON): string {return (node.runs ?? []).map(run => "text" in run ? run.text : "").join("");}
function assertRead(doc: Doc, afterRule: boolean, label = "kept"): void {
    const first = doc.toJSON();
    const children = first.children!;
    const index = children.findIndex(node => text(node) === "content");
    assert.ok(index >= 0, "nonempty authored paragraph remains visible");
    assert.deepEqual(children[index].attrs, {label});
    const rule = children.findIndex(node => node.type === "rule");
    assert.equal(afterRule ? index > rule : index < rule, true);
    for (let i = 0; i < 3; i++) assert.deepEqual(doc.toJSON(), first, "reads must not change projection order");
    assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), schema).toJSON(), first);
}
function deliver(doc: Doc, ops: Op[]): void {
    assert.equal(doc.check(ops), null);
    for (const op of ops) doc.apply(op);
}

test("required automatic gaps retain nonempty text and attrs through move, undo, redo and repeated reads", () => {
    const doc = seed(), history = new History();
    assertRead(doc, false);
    history.record(doc.edit([{op: "move", from: [1], at: [2]}]).ops, doc, options);
    assertRead(doc, true);
    history.undo(doc); assertRead(doc, false);
    history.redo(doc); assertRead(doc, true);
});

test("required gap projection converges with a foreign attribute writer across move history", () => {
    const a = seed(), b = Doc.fromSnapshot("B", a.snapshot(), schema), history = new History();
    const moved = a.edit([{op: "move", from: [1], at: [2]}]).ops;
    history.record(moved, a, options);
    const foreign = b.edit([{op: "update", at: [1], attrs: {label: "foreign"}}]).ops;
    deliver(a, foreign); deliver(b, moved);
    for (const doc of [a, b]) assertRead(doc, true, "foreign");
    assert.deepEqual(a.toJSON(), b.toJSON());
    deliver(b, history.undo(a).ops);
    for (const doc of [a, b]) assertRead(doc, false, "foreign");
    deliver(b, history.redo(a).ops);
    for (const doc of [a, b]) assertRead(doc, true, "foreign");
    assert.deepEqual(a.toJSON(), b.toJSON());
});
