import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, anchorAt, pathAt} from "../src/index.ts";
import type {EditOp, NodeJSON, Op, Schema} from "../src/index.ts";

const schema: Schema = {root: "content", marks: ["bold"], nodes: {
    content: {shape: "flow", children: ["p", "box"], default: "p"},
    p: {shape: "text"}, box: {shape: "flow", children: ["p", "box"], default: "p"},
}};
const p = (text: string): NodeJSON => ({type: "p", runs: text ? [{text, marks: {}}] : []});
const expected = (inside: NodeJSON[], root: NodeJSON[] = [p("abc")]): NodeJSON => ({
    type: "content", children: [...root, {type: "box", children: inside}, p("")],
});
function setup() {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0], content: [p("abc"), p("DEFG"), {type: "box", children: [p("inside")]}]}]);
    const edit = (operation: EditOp) => {
        const ops = doc.edit([operation]).ops;
        history.record(ops, doc, {caretBefore: "", caretAfter: ""});
        return ops;
    };
    return {doc, history, edit};
}
const deliver = (doc: Doc, ops: Op[]) => { assert.equal(doc.check(ops), null); ops.forEach(op => doc.apply(op)); };

test("post-move split undo retains the original tail and restores token carets", () => {
    const {doc, history, edit} = setup();
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    const caret = anchorAt(doc, [1, 1, 3])!;
    const original = doc.blocks()[1];
    assert.equal(original.kind, "flow");
    const snapshot = doc.snapshot();
    edit({op: "split", at: [1, 1, 2]});
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DE"), p("FG")]));
    assert.deepEqual(pathAt(doc, caret), [1, 2, 1]);
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
    assert.deepEqual(pathAt(doc, caret), [1, 1, 3]);
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DE"), p("FG")]));
    assert.deepEqual(pathAt(doc, caret), [1, 2, 1]);
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), Doc.fromSnapshot("before", snapshot, schema).toJSON());
    assert.deepEqual(Doc.fromSnapshot("after", doc.snapshot(), schema).toJSON(), expected([p("inside"), p("DEFG")]));
});

test("move split merge undo and redo preserve all physical fragments", () => {
    const {doc, history, edit} = setup();
    edit({op: "move", from: [1], at: [2, 1]});
    edit({op: "split", at: [1, 1, 2]});
    edit({op: "merge", at: [1, 2]});
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DE"), p("FG")]));
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside")], [p("abc"), p("DEFG")]));
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DE"), p("FG")]));
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
});

test("undo of a split inside joined fragments restores the full original prefix", () => {
    const {doc, history, edit} = setup();
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    edit({op: "merge", at: [1, 1]});
    assert.deepEqual(doc.toJSON(), expected([p("insideDEFG")]));
    edit({op: "split", at: [1, 0, 3]});
    assert.deepEqual(doc.toJSON(), expected([p("ins"), p("ideDEFG")]));
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("insideDEFG")]));
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
    history.redo(doc); history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("ins"), p("ideDEFG")]));
});

test("post-move split undo preserves foreign tail input and formatting", () => {
    const {doc, history, edit} = setup();
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    const peer = Doc.fromSnapshot("B", doc.snapshot(), schema);
    const split = edit({op: "split", at: [1, 1, 2]});
    deliver(peer, split);
    const foreign = peer.edit([
        {op: "insert", at: [1, 2, 1], content: "X"},
        {op: "update", at: [1, 2, 0], length: 1, attrs: {bold: true}},
    ]).ops;
    deliver(doc, foreign);
    deliver(peer, history.undo(doc).ops);
    const model = expected([p("inside"), {type: "p", runs: [
        {text: "DE", marks: {}}, {text: "F", marks: {bold: true}}, {text: "XG", marks: {}},
    ]}]);
    assert.deepEqual(doc.toJSON(), model);
    assert.deepEqual(peer.toJSON(), model);
    deliver(peer, history.redo(doc).ops);
    const splitModel = expected([p("inside"), p("DE"), {type: "p", runs: [
        {text: "F", marks: {bold: true}}, {text: "XG", marks: {}},
    ]}]);
    assert.deepEqual(doc.toJSON(), splitModel);
    assert.deepEqual(peer.toJSON(), splitModel);
});

test("deleting and restoring a moved joined paragraph retains foreign fragment input", () => {
    const {doc, history, edit} = setup();
    doc.edit([{op: "move", from: [1], at: [2, 1]}, {op: "merge", at: [1, 1]}]);
    const peer = Doc.fromSnapshot("B", doc.snapshot(), schema);
    const deletion = edit({op: "delete", at: [1, 0], count: 1});
    const foreign = peer.edit([{op: "insert", at: [1, 0, 8], content: "X"}]).ops;
    deliver(doc, foreign); deliver(peer, deletion);
    assert.deepEqual(doc.toJSON(), expected([p("")]));
    assert.deepEqual(peer.toJSON(), expected([p("")]));
    deliver(peer, history.undo(doc).ops);
    assert.deepEqual(doc.toJSON(), expected([p("insideDEXFG")]));
    assert.deepEqual(peer.toJSON(), expected([p("insideDEXFG")]));
});

test("split undo does not reclaim a tail after an observed foreign move", () => {
    const {doc, history, edit} = setup();
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    edit({op: "split", at: [1, 1, 2]});
    const peer = Doc.fromSnapshot("B", doc.snapshot(), schema);
    const moved = peer.edit([{op: "move", from: [1, 2], at: [1]}]).ops;
    deliver(doc, moved);
    const model = expected([p("inside"), p("DE")], [p("abc"), p("FG")]);
    assert.deepEqual(doc.toJSON(), model);
    deliver(peer, history.undo(doc).ops);
    assert.deepEqual(doc.toJSON(), model);
    assert.deepEqual(peer.toJSON(), model);
    deliver(peer, history.redo(doc).ops);
    assert.deepEqual(doc.toJSON(), model);
    assert.deepEqual(peer.toJSON(), model);
});

test("own tail move undo restores the placement ownership needed for split undo", () => {
    const {doc, history, edit} = setup();
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    edit({op: "split", at: [1, 1, 2]});
    edit({op: "move", from: [1, 2], at: [1]});
    const moved = expected([p("inside"), p("DE")], [p("abc"), p("FG")]);
    assert.deepEqual(doc.toJSON(), moved);
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DE"), p("FG")]));
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DEFG")]));
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected([p("inside"), p("DE"), p("FG")]));
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), moved);
});

test("authored paragraph moves past a required child without moving the required identity", () => {
    const constrained: Schema = {root: "body", marks: [], nodes: {
        body: {shape: "flow", children: ["p", "caption"], default: "p", childRules: {caption: {min: 1, max: 1}}},
        p: {shape: "text"}, caption: {shape: "text"},
    }};
    const doc = new Doc("A", constrained);
    doc.edit([{op: "insert", at: [0, 0], content: "source"}]);
    const required = doc.blocks()[1].marker.key, peer = Doc.fromSnapshot("B", doc.snapshot(), constrained);
    const ops = doc.edit([{op: "move", from: [0], at: [1]}]).ops;
    deliver(peer, ops);
    const model = {type: "body", children: [{type: "caption", runs: []}, p("source")]};
    assert.deepEqual(doc.toJSON(), model);
    assert.deepEqual(peer.toJSON(), model);
    assert.equal(doc.blocks()[0].marker.key, required);
});
