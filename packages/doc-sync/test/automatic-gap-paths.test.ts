import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, MAIN, anchorAt, pathAt, posOfPath, visibleBlocks} from "../src/index.ts";
import type {EditOp, NodeJSON, Schema} from "../src/index.ts";

const schema: Schema = {root: "content", marks: ["bold"], nodes: {
    content: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
    paragraph: {shape: "text"},
    box: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
}};
const p = (text: string): NodeJSON => ({type: "paragraph", runs: text ? [{text, marks: {}}] : []});
const box = (...children: NodeJSON[]): NodeJSON => ({type: "box", children});
const root = (...children: NodeJSON[]): NodeJSON => ({type: "content", children});
const marked: NodeJSON = {type: "paragraph", runs: [{text: "a", marks: {bold: true}}, {text: "b", marks: {}}]};
const cases = [
    {name: "incoming structured move", move: {op: "move", from: [1], at: [0]} as EditOp, path: [2], model: (...nodes: NodeJSON[]) => root(p(""), box(p("body")), ...nodes, p("lead"))},
    {name: "automatic same-parent move", move: {op: "move", from: [0], at: [2]} as EditOp, path: [3], model: (...nodes: NodeJSON[]) => root(p(""), box(p("body")), p("lead"), ...nodes)},
    {name: "automatic cross-parent move", move: {op: "move", from: [0], at: [1, 1]} as EditOp, path: [1, 1], model: (...nodes: NodeJSON[]) => root(p(""), box(p("body"), ...nodes), p("lead"))},
];
function setup(scene: typeof cases[number]) {
    const doc = new Doc("A", schema);
    const edit = (op: EditOp) => {const ops = doc.edit([op]).ops; doc.toJSON(); return ops;};
    doc.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: [p("lead"), box(p("body"))]}]);
    doc.toJSON();
    edit({op: "move", from: [1], at: [0]});
    edit({op: "insert", at: [0, 0], content: "a"});
    edit(scene.move);
    // Force reconstruction after the replacement's first lazy materialization.
    edit({op: "insert", at: [...scene.path, 1], content: "b"});
    assert.deepEqual(doc.toJSON(), scene.model(p("ab")));
    return doc;
}
const check = (doc: Doc, expected: NodeJSON) => {
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), schema).toJSON(), expected);
};

for (const scene of cases) {
    test(`${scene.name}: reconstructed leading gap has a visible model path`, () => {
        const doc = setup(scene);
        assert.equal(doc.blocks()[0].kind, "text");
        assert.notEqual((doc.blocks()[0] as {virtual?: boolean}).virtual, true);
        assert.equal(visibleBlocks(doc, MAIN).length, doc.toJSON().children!.length);
        for (const peer of [doc, Doc.fromSnapshot("peer", doc.snapshot(), schema)]) {
            const anchor = anchorAt(peer, [...scene.path, 1]);
            assert.ok(anchor);
            assert.deepEqual(pathAt(peer, anchor), [...scene.path, 1]);
            assert.ok(posOfPath(peer, [...scene.path, 0]));
        }
    });
    for (const action of ["insert", "delete", "update", "split"] as const) {
        test(`${scene.name}: ${action} targets the paragraph after an empty replacement`, () => {
            const doc = setup(scene);
            const peer = Doc.fromSnapshot("B", doc.snapshot(), schema);
            const op: EditOp = action === "insert" ? {op: "insert", at: [...scene.path, 1], content: "X"}
                : action === "delete" ? {op: "delete", at: [...scene.path, 0], count: 1}
                : action === "update" ? {op: "update", at: [...scene.path, 0], length: 1, attrs: {bold: true}}
                : {op: "split", at: [...scene.path, 1]};
            const ops = doc.edit([op]).ops;
            assert.equal(peer.check(ops), null);
            ops.forEach(op => peer.apply(op));
            const nodes = action === "insert" ? [p("aXb")] : action === "delete" ? [p("b")]
                : action === "update" ? [marked] : [p("a"), p("b")];
            for (const replica of [doc, peer]) check(replica, scene.model(...nodes));
        });
    }
    test(`${scene.name}: deletion undo and redo preserve the unrelated paragraph`, () => {
        const doc = setup(scene), history = new History();
        history.record(doc.edit([{op: "delete", at: [...scene.path, 0], count: 1}]).ops, doc, {caretBefore: "", caretAfter: ""});
        check(doc, scene.model(p("b")));
        history.undo(doc); check(doc, scene.model(p("ab")));
        history.redo(doc); check(doc, scene.model(p("b")));
    });
}
