import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, MAIN, anchorAt, applyEdits, blockPath, checkSchema, pathAt, posOfPath, readDocumentSlice} from "../src/index.ts";
import type {EditOp, ModelPath, NodeJSON, Op, Schema} from "../src/index.ts";

const schema: Schema = {root: "doc", marks: [], nodes: {
    doc: {shape: "flow", children: ["list"], default: "a"},
    list: {shape: "group", children: ["a", "b"], by: ["color"]},
    a: {shape: "text", attrs: {color: {default: "red", values: ["red", "green"]}}},
    b: {shape: "text", attrs: {color: {default: "red", values: ["red", "blue"]}}},
}};
const text = (type: string, value: string): NodeJSON => ({type, runs: value ? [{text: value, marks: {}}] : []});
const list = (color: string, ...children: NodeJSON[]): NodeJSON => ({type: "list", attrs: {color}, children});
const seed = (s = schema): Doc => {
    const doc = new Doc("seed", s);
    doc.edit([{op: "insert", at: [0], content: [list("green", text("a", "A")), list("red", text("b", "B"))]}], {normalize: false});
    return doc;
};
const edit = (doc: Doc, ...ops: EditOp[]) => {
    const expected = applyEdits(doc.schema!, doc.toJSON(), ops);
    const result = doc.edit(ops, {normalize: true});
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(result.normalize, []);
    return result.ops;
};
const deliver = (doc: Doc, ops: Op[]) => {
    assert.equal(doc.check(ops), null);
    ops.forEach(op => doc.apply(op));
};
const textPaths = (node: NodeJSON, path: ModelPath = []): ModelPath[] => node.runs ? [path] : (node.children ?? []).flatMap((child, i) => textPaths(child, [...path, i]));
const assertPositions = (doc: Doc) => {
    const paths = textPaths(doc.toJSON());
    for (const path of paths) {
        let node = doc.toJSON();
        for (const index of path) node = node.children![index];
        const length = node.runs!.reduce((n, run) => n + ("text" in run ? run.text.length : 1), 0);
        for (let offset = 0; offset <= length; offset++) {
            const pos = posOfPath(doc, [...path, offset]);
            assert.ok(pos, `missing text path ${JSON.stringify(path)}`);
            assert.deepEqual(blockPath(doc, pos.line ?? MAIN, pos.b), path);
            const anchor = anchorAt(doc, [...path, offset]);
            assert.ok(anchor);
            assert.deepEqual(pathAt(doc, anchor), [...path, offset]);
        }
    }
};

test("canonical group paths address the second item after a type changes its attribute domain", () => {
    assert.deepEqual(checkSchema(schema), []);
    const doc = seed(), marker = doc.blocks()[0].marker, retained = marker.attrs.get("color");
    edit(doc, {op: "update", at: [0, 0], attrs: {type: "b"}});
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("red", text("b", "A"), text("b", "B"), text("a", ""))]});
    edit(doc, {op: "insert", at: [0, 1, 0], content: "X"});
    assertPositions(doc);
    assert.deepEqual(doc.toJSON().children![0].children![1].runs, [{text: "XB", marks: {}}]);
    assert.equal(doc.blocks()[0].marker, marker);
    assert.deepEqual(marker.attrs.get("color"), retained);
    doc.edit([{op: "update", at: [0, 0], attrs: {type: "a"}}], {normalize: false});
    assert.equal(doc.toJSON().children![0].attrs!.color, "green");
});

test("inserting into a canonical group inherits its visible attributes instead of retained invalid ones", () => {
    const doc = seed();
    edit(doc, {op: "update", at: [0, 0], attrs: {type: "b"}});
    edit(doc, {op: "insert", at: [0, 1], content: [text("a", "C")]});
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("red", text("b", "A"), text("a", "C"), text("b", "B"), text("a", ""))]});
    assert.equal(doc.blocks()[0].marker.attrs.get("color")!.value, "green");
    assertPositions(doc);
});

test("mixed adjacent group types and values share canonical paths without merging different visible values", () => {
    const doc = seed();
    edit(doc, {op: "insert", at: [2], content: [list("blue", text("b", "C")), list("green", text("a", "D")), list("red", text("a", "E"))]});
    edit(doc, {op: "update", at: [0, 0], attrs: {type: "b"}});
    assert.deepEqual(doc.toJSON().children!.map(child => child.attrs!.color), ["red", "blue", "green", "red"]);
    const snapshot = doc.snapshot();
    for (const path of textPaths(doc.toJSON())) {
        const copy = Doc.fromSnapshot("probe", snapshot, schema);
        edit(copy, {op: "insert", at: [...path, 0], content: "X"});
        assertPositions(copy);
    }
});

test("maximum child constraints retain the same visible model and hidden candidates", () => {
    const constrained = structuredClone(schema);
    const root = constrained.nodes.doc;
    assert.equal(root.shape, "flow");
    if (root.shape !== "flow") throw Error("flow");
    root.childRules = {list: {max: 1}};
    const doc = seed(constrained);
    doc.edit([{op: "update", at: [0, 0], attrs: {type: "b"}}], {normalize: false});
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("red", text("b", "A"))]});
    const hidden = doc.overflow(), id = doc.blocks()[0].marker.key;
    edit(doc, {op: "insert", at: [0, 0, 0], content: "X"});
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("red", text("b", "XA"))]});
    assert.deepEqual(doc.overflow(), hidden);
    assert.equal(doc.blocks()[0].marker.key, id);
    assertPositions(doc);
});

test("required storage remains editable and model-only group minima continue to fail closed", () => {
    const constrained = structuredClone(schema);
    const root = constrained.nodes.doc;
    assert.equal(root.shape, "flow");
    if (root.shape !== "flow") throw Error("flow");
    root.childRules = {list: {min: 2}};
    const empty = new Doc("empty", constrained);
    const ids = empty.blocks().map(block => block.marker.key);
    for (const path of textPaths(empty.toJSON())) edit(empty, {op: "insert", at: [...path, 0], content: "R"});
    assert.deepEqual(empty.blocks().map(block => block.marker.key), ids);
    assertPositions(empty);
    const doc = seed(constrained);
    doc.edit([{op: "update", at: [0, 0], attrs: {type: "b"}}], {normalize: false});
    assert.equal(doc.toJSON().children!.length, 2);
    const snapshot = doc.snapshot(), version = doc.version, clock = doc.clock.lamport;
    assert.throws(() => doc.edit([{op: "insert", at: [1, 0, 0], content: "X"}], {normalize: false}), /자식이 없다/);
    assert.throws(() => readDocumentSlice(doc, {}), /Unsupported slice/);
    assert.deepEqual(doc.snapshot(), snapshot);
    assert.equal(doc.version, version);
    assert.equal(doc.clock.lamport, clock);
});

test("concurrent type and attribute writes converge before canonical path edits in both delivery orders", () => {
    const initial = seed(), snapshot = initial.snapshot();
    const typeWriter = Doc.fromSnapshot("type", snapshot, schema), attrWriter = Doc.fromSnapshot("attrs", snapshot, schema);
    const typeOps = typeWriter.edit([{op: "update", at: [0, 0], attrs: {type: "b"}}], {normalize: false}).ops;
    const attrOps = attrWriter.edit([{op: "update", at: [0, 0], attrs: {color: "green"}}], {normalize: false}).ops;
    const replicas = [Doc.fromSnapshot("first", snapshot, schema), Doc.fromSnapshot("second", snapshot, schema)];
    deliver(replicas[0], [...typeOps, ...attrOps]);
    deliver(replicas[1], [...attrOps, ...typeOps]);
    assert.deepEqual(replicas[0].toJSON(), replicas[1].toJSON());
    assert.deepEqual(replicas[0].snapshot(), replicas[1].snapshot());
    const before = replicas[0].toJSON();
    for (const doc of replicas) assertPositions(doc);
    const ops = edit(replicas[0], {op: "insert", at: [0, 1, 0], content: "X"});
    deliver(replicas[1], ops);
    assert.deepEqual(replicas[0].toJSON(), applyEdits(schema, before, [{op: "insert", at: [0, 1, 0], content: "X"}]));
    assert.deepEqual(replicas[0].toJSON(), replicas[1].toJSON());
    assertPositions(replicas[1]);
});

test("own canonical-path text undo and redo preserve foreign text and attribute ownership", () => {
    const doc = seed(), history = new History();
    doc.edit([{op: "update", at: [0, 0], attrs: {type: "b"}}], {normalize: false});
    const peer = Doc.fromSnapshot("foreign", doc.snapshot(), schema);
    const own = edit(doc, {op: "insert", at: [0, 1, 0], content: "X"});
    history.record(own, doc, {caretBefore: "", caretAfter: ""});
    deliver(peer, own);
    const foreign = peer.edit([
        {op: "insert", at: [0, 1, 1], content: "Y"},
        {op: "update", at: [0, 0], attrs: {color: "blue"}},
    ], {normalize: false}).ops;
    deliver(doc, foreign);
    const foreignRegister = doc.blocks()[0].marker.attrs.get("color");
    deliver(peer, history.undo(doc).ops);
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("blue", text("b", "A")), list("red", text("b", "YB"), text("a", ""))]});
    assert.deepEqual(doc.toJSON(), peer.toJSON());
    assert.deepEqual(doc.blocks()[0].marker.attrs.get("color"), foreignRegister);
    assertPositions(doc);
    deliver(peer, history.redo(doc).ops);
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("blue", text("b", "A")), list("red", text("b", "XYB"), text("a", ""))]});
    assert.deepEqual(doc.toJSON(), peer.toJSON());
    assert.deepEqual(doc.blocks()[0].marker.attrs.get("color"), foreignRegister);
    assertPositions(doc);
});

test("type undo and redo retain foreign attribute registers and foreign type writes fence undo", () => {
    const doc = seed(), history = new History(), peer = Doc.fromSnapshot("foreign", doc.snapshot(), schema);
    const own = edit(doc, {op: "update", at: [0, 0], attrs: {type: "b"}});
    history.record(own, doc, {caretBefore: "", caretAfter: ""});
    deliver(peer, own);
    deliver(doc, peer.edit([{op: "update", at: [0, 0], attrs: {color: "blue"}}], {normalize: false}).ops);
    const foreignColor = doc.blocks()[0].marker.attrs.get("color");
    deliver(peer, history.undo(doc).ops);
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("red", text("a", "A"), text("b", "B"), text("a", ""))]});
    assert.deepEqual(doc.blocks()[0].marker.attrs.get("color"), foreignColor);
    deliver(peer, history.redo(doc).ops);
    assert.deepEqual(doc.toJSON(), {type: "doc", children: [list("blue", text("b", "A")), list("red", text("b", "B"), text("a", ""))]});
    assert.deepEqual(doc.blocks()[0].marker.attrs.get("color"), foreignColor);
    deliver(doc, peer.edit([
        {op: "update", at: [0, 0], attrs: {type: "a"}},
        {op: "update", at: [0, 0], attrs: {type: "b"}},
    ], {normalize: false}).ops);
    const foreignType = doc.blocks()[0].marker.attrs.get("$type");
    assert.deepEqual(history.undo(doc).ops, []);
    assert.deepEqual(doc.blocks()[0].marker.attrs.get("$type"), foreignType);
    assertPositions(doc);
});

test("nested flow paths use canonical group boundaries and ordinary typing does not read a full model or snapshot", () => {
    const nested = structuredClone(schema);
    nested.nodes.doc = {shape: "flow", children: ["list", "box"], default: "a"};
    nested.nodes.box = {shape: "flow", children: ["list"], default: "a"};
    const doc = new Doc("nested", nested);
    edit(doc, {op: "insert", at: [1], content: [{type: "box", children: [list("green", text("a", "A")), list("red", text("b", "B"))]}]});
    edit(doc, {op: "update", at: [1, 0, 0], attrs: {type: "b"}});
    const expected = applyEdits(nested, doc.toJSON(), [{op: "insert", at: [1, 0, 1, 0], content: "X"}]);
    const snapshot = doc.snapshot, model = doc.toJSON;
    doc.snapshot = () => { throw Error("full snapshot"); };
    doc.toJSON = () => { throw Error("full model"); };
    try { doc.edit([{op: "insert", at: [1, 0, 1, 0], content: "X"}], {normalize: false}); }
    finally { doc.snapshot = snapshot; doc.toJSON = model; }
    assert.deepEqual(doc.toJSON(), expected);
    assertPositions(doc);
});

test("deterministic mixed-group edit fuzz matches the public model oracle and token anchors", () => {
    let state = 0x5a17c0de;
    const random = (max: number) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % max; };
    const s = structuredClone(schema);
    s.marks = ["bold"];
    for (let run = 0; run < 32; run++) {
        const doc = new Doc(`fuzz-${run}`, s);
        const children = Array.from({length: 6}, (_, i) => {
            const type = random(2) ? "a" : "b";
            const color = random(2) ? "red" : type === "a" ? "green" : "blue";
            return list(color, text(type, `${i}:한글`));
        });
        doc.edit([{op: "insert", at: [0], content: children}], {normalize: false});
        for (let step = 0; step < 40; step++) {
            const paths = textPaths(doc.toJSON()), path = paths[random(paths.length)];
            let node = doc.toJSON();
            for (const index of path) node = node.children![index];
            const length = node.runs!.reduce((n, run) => n + ("text" in run ? run.text.length : 1), 0), offset = random(length + 1);
            const choice = random(5);
            if (choice === 0) {
                // Restoring a former type can reveal retained attributes. Existing normalize ops express that rule.
                const op: EditOp = {op: "update", at: path, attrs: {type: random(2) ? "a" : "b"}};
                const before = doc.toJSON(), result = doc.edit([op], {normalize: true});
                assert.deepEqual(doc.toJSON(), applyEdits(s, applyEdits(s, before, [op]), result.normalize));
            } else if (choice === 1) {
                const type = node.type, color = random(2) ? "red" : type === "a" ? "green" : "blue";
                edit(doc, {op: "update", at: path, attrs: {color}});
            } else if (choice === 2 && length) {
                edit(doc, {op: "delete", at: [...path, Math.min(offset, length - 1)], count: 1});
            } else if (choice === 3 && length) {
                edit(doc, {op: "update", at: [...path, Math.min(offset, length - 1)], length: 1, attrs: {bold: !!random(2)}});
            } else edit(doc, {op: "insert", at: [...path, offset], content: random(2) ? "X" : "한글"});
            assertPositions(doc);
        }
        assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), s).toJSON(), doc.toJSON());
    }
});

test("concurrent group edit fuzz converges across six packet orders and duplicate delivery", () => {
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (let run = 0; run < 24; run++) {
        const snapshot = seed().snapshot();
        const writers = ["type", "attrs", "text"].map(actor => Doc.fromSnapshot(`${actor}-${run}`, snapshot, schema));
        const packets = [
            writers[0].edit([{op: "update", at: [0, 0], attrs: {type: run % 2 ? "a" : "b"}}], {normalize: false}).ops,
            writers[1].edit([{op: "update", at: [0, 0], attrs: {color: ["green", "red", null][run % 3]}}], {normalize: false}).ops,
            writers[2].edit([{op: "insert", at: [1, 0, 0], content: "Y"}], {normalize: false}).ops,
        ];
        const replicas = orders.map((order, i) => {
            const doc = Doc.fromSnapshot(`receiver-${i}`, snapshot, schema);
            for (const packet of order) deliver(doc, packets[packet]);
            for (const packet of [...order].reverse()) deliver(doc, packets[packet]);
            assertPositions(doc);
            return doc;
        });
        const reference = replicas[0], before = reference.toJSON();
        for (const replica of replicas) assert.deepEqual(replica.toJSON(), before);
        const paths = textPaths(before);
        const target = paths.find(path => {
            let node = before;
            for (const index of path) node = node.children![index];
            return node.runs!.some(run => "text" in run && run.text.includes("B"));
        })!;
        assert.ok(target);
        const authored = edit(reference, {op: "insert", at: [...target, 1], content: "X"});
        for (const replica of replicas.slice(1)) {
            deliver(replica, authored);
            deliver(replica, authored);
            assert.deepEqual(replica.toJSON(), reference.toJSON());
            assertPositions(replica);
            assert.deepEqual(Doc.fromSnapshot("restored", replica.snapshot(), schema).toJSON(), reference.toJSON());
        }
    }
});
