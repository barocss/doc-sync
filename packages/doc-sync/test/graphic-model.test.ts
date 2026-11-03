import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, canonical, applyEdits, checkSchema, readDocumentSlice, type Op, type Schema} from "../src/index.ts";
import {GRAPHIC_SCHEMA as schema, emptyCanvas, graphicShape as shape, graphicLabel as label, graphicFrame as frame, graphicGroup as group} from "../../../fixtures/graphic-schema.ts";

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const restore = (doc: Doc) => assert.deepEqual(Doc.fromSnapshot("reopened", json(doc.snapshot()), schema).toJSON(), doc.toJSON());

test("graphic canvas and stored containers stay empty through normalization and snapshot", () => {
    assert.deepEqual(checkSchema(schema), []);
    const doc = new Doc("A", schema);
    assert.deepEqual(doc.toJSON(), emptyCanvas()); restore(doc);
    doc.edit([{op: "insert", at: [0], content: [frame(), group()]}]);
    const expected = {type: "canvas", children: [frame(), group()]};
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(canonical(schema, expected), expected); restore(doc);
    doc.edit([{op: "delete", at: [0], count: 2}]);
    assert.deepEqual(doc.toJSON(), emptyCanvas()); restore(doc);
});

test("public Doc and canonical reject invalid new domain and container combinations", () => {
    const metadata = structuredClone(schema); metadata.nodes.canvas.attrs = {name: {default: "unsupported"}};
    const wrongDomain = {...schema, domain: "document"} as Schema;
    const unmarked = {root: schema.root, nodes: schema.nodes, marks: schema.marks} as Schema;
    for (const invalid of [metadata, wrongDomain, unmarked]) {
        assert.ok(checkSchema(invalid).length);
        assert.throws(() => new Doc("A", invalid));
        assert.throws(() => canonical(invalid, emptyCanvas()));
    }
});

for (const content of [shape("first"), label("한글😀")]) test(`first ${content.type} has no synthetic siblings after insertion or deletion`, () => {
    const doc = new Doc("A", schema), history = new History();
    const ops = doc.edit([{op: "insert", at: [0], content: [content]}]).ops;
    history.record(ops, doc, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [content]}); restore(doc);
    history.undo(doc); assert.deepEqual(doc.toJSON(), emptyCanvas());
    history.redo(doc); assert.deepEqual(doc.toJSON(), {type: "canvas", children: [content]});
    doc.edit([{op: "delete", at: [0], count: 1}]); assert.deepEqual(doc.toJSON(), emptyCanvas()); restore(doc);
});

test("object reorder and moves into and out of empty stored containers keep exact hierarchy", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [shape("one"), shape("two"), frame(), group()]}]);
    doc.edit([{op: "move", from: [1], at: [0]}]);
    assert.deepEqual(doc.toJSON().children, [shape("two"), shape("one"), frame(), group()]);
    doc.edit([{op: "move", from: [0], at: [2, 0]}]);
    assert.deepEqual(doc.toJSON().children, [shape("one"), frame([shape("two")]), group()]);
    doc.edit([{op: "move", from: [1, 0], at: [2, 0]}]);
    assert.deepEqual(doc.toJSON().children, [shape("one"), frame(), group([shape("two")])]);
    doc.edit([{op: "move", from: [2, 0], at: [0]}]);
    assert.deepEqual(doc.toJSON().children, [shape("two"), shape("one"), frame(), group()]); restore(doc);
});

test("graphic text and explicit document flow have separate empty-child behavior", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [frame([label("")]), {type: "text-box", children: []}]}]);
    doc.edit([{op: "insert", at: [0, 0, 0], content: "Hello😀"}, {op: "update", at: [0, 0, 0], length: 5, attrs: {bold: true}}]);
    assert.deepEqual(doc.toJSON().children![0], frame([{type: "label", runs: [{text: "Hello", marks: {bold: true}}, {text: "😀", marks: {}}]}]));
    assert.deepEqual(doc.toJSON().children![1], {type: "text-box", children: [{type: "paragraph", runs: []}]});
    doc.edit([{op: "delete", at: [0, 0], count: 1}]);
    assert.deepEqual(doc.toJSON().children![0], frame()); restore(doc);
});

test("graphic scoped text normalization retains the container domain", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [frame([label("abc")])]}]);
    doc.edit([{op: "insert", at: [0, 0, 1], content: "한😀"}], {normalize: true});
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [frame([label("a한😀bc")])]}); restore(doc);
});

test("graphic label split merge and history keep explicit siblings and identities", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0], content: [frame([label("abcd")])]}]);
    const original = readDocumentSlice(doc, {path: [0], limit: 1}).children[0].blockId;
    const split = doc.edit([{op: "split", at: [0, 0, 2]}]).ops;
    history.record(split, doc, {caretBefore: "", caretAfter: ""});
    const expected = {type: "canvas", children: [frame([label("ab"), label("cd")])]};
    assert.deepEqual(doc.toJSON(), expected);
    const ids = readDocumentSlice(doc, {path: [0]}).children.map(child => child.blockId);
    assert.equal(ids[0], original); assert.notEqual(ids[1], ids[0]);
    const merge = doc.edit([{op: "merge", at: [0, 1]}]).ops;
    history.record(merge, doc, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [frame([label("abcd")])]});
    history.undo(doc); assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(readDocumentSlice(doc, {path: [0]}).children.map(child => child.blockId), ids);
    history.undo(doc); assert.deepEqual(doc.toJSON(), {type: "canvas", children: [frame([label("abcd")])]});
    history.redo(doc); assert.deepEqual(doc.toJSON(), expected);
    history.redo(doc); assert.deepEqual(doc.toJSON(), {type: "canvas", children: [frame([label("abcd")])]});
    assert.equal(readDocumentSlice(doc, {path: [0], limit: 1}).children[0].blockId, original); restore(doc);
});

test("graphic inserting an atom into label text and undo retain the original tail", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0], content: [label("abcd"), shape("existing tail")]}]);
    const ops = doc.edit([{op: "insert", at: [0, 2], content: [shape("middle")]}]).ops;
    history.record(ops, doc, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [label("ab"), shape("middle"), label("cd"), shape("existing tail")]});
    history.undo(doc); assert.deepEqual(doc.toJSON(), {type: "canvas", children: [label("abcd"), shape("existing tail")]});
    history.redo(doc); assert.deepEqual(doc.toJSON(), {type: "canvas", children: [label("ab"), shape("middle"), label("cd"), shape("existing tail")]}); restore(doc);
});

test("graphic explicit flow retains document computed groups inside an object", () => {
    const nested = structuredClone(schema);
    nested.nodes["text-box"] = {shape: "flow", children: ["paragraph", "list"], default: "paragraph"};
    nested.nodes.list = {shape: "group", children: ["item"], by: []}; nested.nodes.item = {shape: "text"};
    const doc = new Doc("A", nested);
    doc.edit([{op: "insert", at: [0], content: [{type: "text-box", children: [
        {type: "list", children: [{type: "item", runs: [{text: "inside", marks: {}}]}]},
    ]}]}]);
    const model = doc.toJSON();
    assert.deepEqual(model.children![0].children![0], {type: "list", children: [{type: "item", runs: [{text: "inside", marks: {}}]}]});
    assert.deepEqual(Doc.fromSnapshot("fresh", json(doc.snapshot()), nested).toJSON(), model);
    const before = json(doc.snapshot());
    assert.throws(() => doc.edit([{op: "insert", at: [1], content: [{type: "list", children: [{type: "item", runs: []}]}]}]));
    assert.deepEqual(doc.snapshot(), before);
});

test("graphic explicit text owners accept inline-following text and enforce text false", () => {
    const inline = structuredClone(schema);
    inline.nodes.label = {shape: "text", children: ["icon"]}; inline.nodes.icon = {shape: "inline"};
    const doc = new Doc("A", inline);
    const batch = doc.edit([{op: "insert", at: [0], content: [{type: "label", runs: [{text: "a", marks: {}}, {type: "icon"}, {text: "b", marks: {}}]}]}]).ops;
    const peer = new Doc("B", inline); assert.equal(peer.check(batch), null); batch.forEach(op => peer.apply(op));
    const next = doc.edit([{op: "insert", at: [0, 2], content: "!"}]).ops;
    assert.equal(peer.check(next), null); next.forEach(op => peer.apply(op)); assert.deepEqual(peer.toJSON(), doc.toJSON());
    assert.deepEqual(doc.toJSON().children![0].runs, [{text: "a", marks: {}}, {type: "icon"}, {text: "!b", marks: {}}]);
    const forbidden = new Doc("C", inline);
    assert.ok(forbidden.check([{t: "node", id: {actor: "peer", lamport: 1}, origin: {actor: "~root", lamport: 0}, type: "icon"}]));
    const noText = structuredClone(inline); noText.nodes.label = {shape: "text", children: ["icon"], text: false};
    const object = new Doc("D", noText); object.edit([{op: "insert", at: [0], content: [label("")]}]);
    const before = json(object.snapshot()); assert.throws(() => object.edit([{op: "insert", at: [0, 0], content: "forbidden"}]));
    assert.deepEqual(object.snapshot(), before);
});

test("graphic invalid edit batches fail before valid prefixes mutate state", () => {
    const doc = new Doc("A", schema);
    for (const invalid of [
        {op: "insert" as const, at: [0], content: [{type: "paragraph", runs: []}]},
        {op: "insert" as const, at: [0], content: "unowned text"},
        {op: "move" as const, from: [99], at: [0]},
        {op: "update" as const, at: [], attrs: {name: "unsupported root metadata"}},
    ]) {
        const before = json(doc.snapshot());
        assert.throws(() => doc.edit([{op: "insert", at: [0], content: [shape("prefix")]}, invalid]));
        assert.deepEqual(doc.snapshot(), before); assert.deepEqual(doc.toJSON(), emptyCanvas());
    }
    assert.throws(() => applyEdits(schema, emptyCanvas(), [{op: "insert", at: [0], content: [{type: "paragraph", runs: []}]}]));
});

test("graphic deleted text compacts and reopens without synthesizing objects", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [frame([label("abcdefgh")]), group()]}]);
    doc.edit([{op: "delete", at: [0, 0, 0], count: 8}]);
    assert.ok(doc.compact(Infinity, () => 0) > 0);
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [frame([label("")]), group()]}); restore(doc);
    doc.edit([{op: "delete", at: [0, 0], count: 1}]);
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [frame(), group()]}); restore(doc);
});

test("graphic raw character births require an explicit text marker", () => {
    const doc = new Doc("A", schema), before = json(doc.snapshot());
    const raw = {t: "text" as const, id: {lamport: 1, actor: "peer"}, origin: {lamport: 0, actor: "~root"}, text: "invalid"};
    assert.ok(doc.check([raw])); assert.deepEqual(doc.snapshot(), before);
    const peer = new Doc("peer", schema);
    const valid = peer.edit([{op: "insert", at: [0], content: [label("valid")]}]).ops;
    assert.equal(doc.check(valid), null); valid.forEach(op => doc.apply(op));
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [label("valid")]});
    doc.edit([{op: "insert", at: [1], content: [frame()]}]);
    doc.edit([{op: "move", from: [0], at: [1, 0]}, {op: "insert", at: [0], content: [shape("new first")]}]);
    assert.deepEqual(doc.toJSON(), {type: "canvas", children: [shape("new first"), frame([label("valid")])]}); restore(doc);
});

test("graphic causal birth validation checks parent and text owner before application", () => {
    const source = new Doc("peer", schema), target = new Doc("receiver", schema);
    const batch = source.edit([{op: "insert", at: [0], content: [frame([label("nested")]), shape("atom")]}]).ops;
    assert.equal(target.check(batch), null);
    const forbidden = batch.map(op => op.t === "node" && op.type === "label" ? {...op, type: "paragraph"} : op);
    assert.ok(target.check(forbidden)); assert.deepEqual(target.toJSON(), emptyCanvas());
    const missingParent = batch.find(op => op.t === "node" && op.type === "label")!;
    assert.ok(target.check([missingParent]));
    batch.forEach(op => target.apply(op));
    assert.deepEqual(target.toJSON(), source.toJSON());
    const atom = batch.find(op => op.t === "node" && op.type === "shape")!;
    assert.equal(atom.t, "node");
    if (atom.t !== "node") return;
    const text: Op = {t: "text", id: {actor: "intruder", lamport: 100}, origin: atom.id, text: "hidden"};
    const before = json(target.snapshot());
    assert.ok(target.check([text])); assert.deepEqual(target.snapshot(), before);
    for (const key of ["$type", "$join"]) {
        const forged: Op = {t: "set", at: {actor: "intruder", lamport: 101}, ids: [{actor: "~root", lamport: 0}], key, value: key === "$type" ? "label" : "0@~root"};
        assert.ok(target.check([forged])); assert.deepEqual(target.snapshot(), before);
    }
    restore(target);
});

test("graphic bounded reads keep object blockId through reorder reparent undo and snapshot", () => {
    const doc = new Doc("A", schema), history = new History();
    assert.deepEqual(readDocumentSlice(doc, {}).children, []);
    doc.edit([{op: "insert", at: [0], content: [shape("one"), frame(), group()]}]);
    const id = readDocumentSlice(doc, {limit: 1}).children[0].blockId;
    assert.ok(id); assert.deepEqual(readDocumentSlice(doc, {path: [1]}).children, []);
    assert.deepEqual(readDocumentSlice(doc, {path: [2]}).children, []);
    const reorder = doc.edit([{op: "move", from: [0], at: [2]}]).ops;
    history.record(reorder, doc, {caretBefore: "", caretAfter: ""});
    assert.equal(readDocumentSlice(doc, {start: 2, limit: 1}).children[0].blockId, id);
    const reparent = doc.edit([{op: "move", from: [2], at: [0, 0]}]).ops;
    history.record(reparent, doc, {caretBefore: "", caretAfter: ""});
    assert.equal(readDocumentSlice(doc, {path: [0], limit: 1}).children[0].blockId, id);
    const restored = Doc.fromSnapshot("fresh", json(doc.snapshot()), schema);
    assert.equal(readDocumentSlice(restored, {path: [0], limit: 1}).children[0].blockId, id);
    history.undo(doc);
    assert.equal(readDocumentSlice(doc, {start: 2, limit: 1}).children[0].blockId, id);
    history.undo(doc);
    assert.equal(readDocumentSlice(doc, {limit: 1}).children[0].blockId, id);
});
