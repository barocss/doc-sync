import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, type EditOp, type Schema} from "../src/index.ts";

const schema: Schema = {root: "content", marks: ["bold", "italic"], nodes: {
    content: {shape: "flow", children: ["p", "box"], default: "p"},
    p: {shape: "text"}, box: {shape: "flow", children: ["p", "box"], default: "p"},
}};
const p = (text: string) => ({type: "p", runs: text ? [{text, marks: {}}] : []});
const options = {caretBefore: "before", caretAfter: "after"};
function edit(doc: Doc, history: History, operation: EditOp) {
    const ops = doc.edit([operation]).ops;
    history.record(ops, doc, options);
}
function checkpoint(doc: Doc, history: History) {
    const saved = JSON.parse(JSON.stringify(history.snapshot()));
    return {doc: Doc.fromSnapshot("A", doc.snapshot(), schema), history: History.fromSnapshot(saved)};
}
function compare(doc: Doc, history: History, restored: ReturnType<typeof checkpoint>, actions: Array<"undo" | "redo">) {
    for (const action of actions) {
        assert.deepEqual(restored.history[action](restored.doc), history[action](doc));
        assert.deepEqual(restored.doc.toJSON(), doc.toJSON());
        assert.equal(restored.history.canUndo, history.canUndo);
        assert.equal(restored.history.canRedo, history.canRedo);
        assert.deepEqual(restored.history.snapshot(), history.snapshot());
    }
}

test("restores linked formatting ownership, undo and redo around foreign writes", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    edit(doc, history, {op: "update", at: [0, 0], length: 2, attrs: {bold: true}});
    edit(doc, history, {op: "update", at: [0, 0], length: 2, attrs: {bold: false}});
    history.undo(doc);
    const peer = Doc.fromSnapshot("B", doc.snapshot(), schema);
    peer.edit([{op: "update", at: [0, 1], length: 1, attrs: {bold: false, italic: true}}]).ops.forEach(op => doc.apply(op));
    const restored = checkpoint(doc, history);
    compare(doc, history, restored, ["redo", "undo", "undo", "redo", "redo"]);
});

test("restores deletion pins and preserves a concurrent deletion", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    const peer = Doc.fromSnapshot("B", doc.snapshot(), schema);
    edit(doc, history, {op: "delete", at: [0, 1], count: 1});
    peer.edit([{op: "delete", at: [0, 1], count: 1}]).ops.forEach(op => doc.apply(op));
    const restored = checkpoint(doc, history);
    const seq = () => 12;
    assert.equal(restored.history.pin(seq), history.pin(seq));
    compare(doc, history, restored, ["undo", "redo", "undo"]);
    assert.deepEqual(doc.toJSON(), peer.toJSON());
});

test("restores shared move and split state through undo and redo", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0], content: [p("abc"), p("DEFG"), {type: "box", children: [p("inside")]}]}]);
    edit(doc, history, {op: "move", from: [1], at: [2, 1]});
    edit(doc, history, {op: "split", at: [1, 1, 2]});
    edit(doc, history, {op: "move", from: [1, 2], at: [1]});
    history.undo(doc);
    const restored = checkpoint(doc, history);
    compare(doc, history, restored, ["undo", "undo", "redo", "redo", "redo", "undo", "undo"]);
});

test("rejects malformed history without mutating the active instance", () => {
    const doc = new Doc("A", schema), history = new History();
    edit(doc, history, {op: "insert", at: [0, 0], content: "a"});
    const saved = history.snapshot(), before = JSON.stringify(saved), invalid = structuredClone(saved);
    invalid.version = 2 as 1;
    assert.throws(() => History.fromSnapshot(invalid), /Invalid history snapshot/);
    assert.throws(() => History.fromSnapshot({...saved, undo: [{steps: [{type: "move", target: {lamport: 1, actor: "A"}, before: 99, after: 0, undone: false}], caretBefore: "", caretAfter: "", typing: false, at: 0}]}), /Invalid history snapshot/);
    assert.equal(JSON.stringify(history.snapshot()), before);
    assert.equal(history.undo(doc).ops.length > 0, true);
});

test("retains typing group boundaries when new edits are recorded after restoration", () => {
    const doc = new Doc("A", schema), history = new History();
    const first = doc.edit([{op: "insert", at: [0, 0], content: "a"}]).ops;
    history.record(first, doc, {caretBefore: "0", caretAfter: "1", typing: true});
    const restored = checkpoint(doc, history);
    for (const [d, h] of [[doc, history], [restored.doc, restored.history]] as const) {
        const ops = d.edit([{op: "insert", at: [0, 1], content: "b"}]).ops;
        h.record(ops, d, {caretBefore: "1", caretAfter: "2", typing: true});
        assert.equal(h.snapshot().undo.length, 1);
    }
    compare(doc, history, restored, ["undo", "redo"]);
});

test("rejects non-JSON payloads and detached snapshots do not alias live state", () => {
    const doc = new Doc("A", schema), history = new History();
    edit(doc, history, {op: "insert", at: [0, 0], content: "a"});
    const saved = history.snapshot(), before = JSON.stringify(saved);
    const holes = new Array(1); Object.defineProperty(holes, "extra", {value: 1, enumerable: true});
    assert.throws(() => History.fromSnapshot({...saved, undo: holes}), /Invalid history snapshot/);
    assert.throws(() => History.fromSnapshot({...saved, sets: [NaN]}), /Invalid history snapshot/);
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    assert.throws(() => History.fromSnapshot(cyclic), /Invalid history snapshot/);
    history.undo(doc);
    assert.equal(JSON.stringify(saved), before);
});

test("new formatting links to restored state rather than losing ownership", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0, 0], content: "a"}]);
    edit(doc, history, {op: "update", at: [0, 0], length: 1, attrs: {bold: true}});
    const restored = checkpoint(doc, history);
    edit(doc, history, {op: "update", at: [0, 0], length: 1, attrs: {bold: false}});
    edit(restored.doc, restored.history, {op: "update", at: [0, 0], length: 1, attrs: {bold: false}});
    compare(doc, history, restored, ["undo", "undo", "redo", "redo"]);
});
