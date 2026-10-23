import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, checkSchema, type Schema, type Op} from "../src/index.ts";

const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "caption", "rule"], default: "paragraph", childRules: {caption: {min: 1, max: 1}, rule: {min: 0, max: 0}}},
    paragraph: {shape: "text"}, caption: {shape: "text"}, rule: {shape: "atom"},
}};
const caption = (text: string) => ({type: "caption", runs: [{text, marks: {}}]});
const texts = (doc: Doc) => doc.toJSON().children!.filter(node => node.type === "caption").map(node => (node.runs ?? []).map(run => "text" in run ? run.text : "").join(""));

test("required children have stable editable identities without changing runtime schema", () => {
    const doc = new Doc("A", schema), before = JSON.stringify(schema);
    assert.deepEqual(checkSchema(schema), []);
    const key = doc.blocks()[1].marker.key;
    doc.edit([{op: "insert", at: [1, 0], content: "caption"}]);
    assert.deepEqual(texts(doc), ["caption"]);
    assert.equal(doc.blocks()[1].marker.key, key);
    assert.equal(doc.blocks()[1].marker.key, key);
    assert.equal(JSON.stringify(schema), before);
});

test("fresh peers can validate and apply edits to an unread required fallback", () => {
    const a = new Doc("A", schema), b = new Doc("B", schema);
    const {ops} = a.edit([{op: "insert", at: [1, 0], content: "shared"}]);
    assert.equal(b.check(ops), null);
    ops.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
});

test("max zero hides authored candidates while preserving their content in overflow", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [1], content: [{type: "rule"}]}]);
    assert.equal(doc.toJSON().children!.some(node => node.type === "rule"), false);
    assert.deepEqual(doc.overflow().map(node => node.type), ["rule"]);
});

test("min zero and max zero can produce a truly empty constrained flow", () => {
    const empty: Schema = {root: "content", marks: [], nodes: {content: {shape: "flow", children: ["paragraph"], default: "paragraph", childRules: {paragraph: {min: 0, max: 0}}}, paragraph: {shape: "text"}}};
    const doc = new Doc("A", empty);
    assert.deepEqual(doc.toJSON(), {type: "content", children: []});
    assert.equal(doc.blocks().length, 0);
});

test("concurrent inserts retain overflow and converge in both causal receipt orders", () => {
    for (const reverse of [false, true]) {
        const a = new Doc("A", schema), b = new Doc("B", schema);
        const left = a.edit([{op: "insert", at: [1], content: [caption("left")]}]).ops;
        const right = b.edit([{op: "insert", at: [1], content: [caption("right")]}]).ops;
        const merged = new Doc("M", schema);
        for (const batch of reverse ? [right, left] : [left, right]) { assert.equal(merged.check(batch), null); batch.forEach(op => merged.apply(op)); }
        right.forEach(op => a.apply(op)); left.forEach(op => b.apply(op));
        assert.deepEqual(a.toJSON(), b.toJSON()); assert.deepEqual(a.toJSON(), merged.toJSON());
        assert.deepEqual(texts(merged), ["right"]);
        assert.equal(merged.overflow().filter(node => node.type === "caption").length, 1);
    }
});

test("deleting the visible candidate promotes overflow and undo preserves every identity", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [1], content: [caption("one"), caption("two")]}]);
    assert.deepEqual(texts(doc), ["one"]);
    const operations = doc.edit([{op: "delete", at: [1], count: 1}]).ops;
    history.record(operations, doc, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(texts(doc), ["two"]);
    history.undo(doc); assert.deepEqual(texts(doc), ["one"]);
    history.redo(doc); assert.deepEqual(texts(doc), ["two"]);
});

test("deleting required fallback content leaves its stable empty editable slot", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [1, 0], content: "kept"}]);
    const key = doc.blocks()[1].marker.key;
    const operations = doc.edit([{op: "delete", at: [1], count: 1}]).ops;
    assert.equal(doc.check(operations), null);
    assert.deepEqual(texts(doc), [""]);
    assert.equal(doc.blocks()[1].marker.key, key);
    doc.edit([{op: "insert", at: [1, 0], content: "again"}]);
    assert.deepEqual(texts(doc), ["again"]);
});

test("fallback state survives authored replacement, deletion, and snapshot reconstruction", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [1, 0], content: "fallback"}]);
    const key = doc.blocks()[1].marker.key;
    doc.edit([{op: "insert", at: [1], content: [caption("authored")]}]);
    assert.deepEqual(texts(doc), ["authored"]);
    doc.edit([{op: "delete", at: [1], count: 1}]);
    assert.deepEqual(texts(doc), ["fallback"]);
    assert.equal(doc.blocks()[1].marker.key, key);
    const copy = Doc.fromSnapshot("B", doc.snapshot(), schema);
    assert.deepEqual(copy.toJSON(), doc.toJSON());
    assert.ok(copy.snapshot().capabilities!.includes("cardinality-v1"));
});

test("group requirements create a real editable item and project one group", () => {
    const grouped: Schema = {root: "content", marks: [], nodes: {
        content: {shape: "flow", children: ["paragraph", "caption"], default: "paragraph", childRules: {caption: {min: 1, max: 1}}},
        paragraph: {shape: "text"}, caption: {shape: "group", children: ["caption-paragraph"], by: []}, "caption-paragraph": {shape: "text"},
    }};
    const doc = new Doc("A", grouped);
    doc.edit([{op: "insert", at: [1, 0, 0], content: "group text"}]);
    assert.deepEqual(doc.toJSON().children![1], {type: "caption", children: [{type: "caption-paragraph", runs: [{text: "group text", marks: {}}]}]});
});

test("schema rejects invalid bounds, missing types, and infinite required recursion", () => {
    const invalid = structuredClone(schema);
    const root = invalid.nodes.content; assert.equal(root.shape, "flow");
    if (root.shape !== "flow") return;
    root.childRules = {caption: {min: 2, max: 1}, missing: {min: -1}, rule: {max: 1.5}};
    assert.ok(checkSchema(invalid).length >= 3);
    const recursive: Schema = {root: "box", marks: [], nodes: {box: {shape: "flow", children: ["paragraph", "box"], default: "paragraph", childRules: {box: {min: 1}}}, paragraph: {shape: "text"}}};
    assert.ok(checkSchema(recursive).some(problem => problem.includes("cycle")));
});

test("concurrent authored replacement retains edited fallback in overflow and undo restores its slot", () => {
    const a = new Doc("A", schema), b = new Doc("B", schema), history = new History();
    const fallback = a.edit([{op: "insert", at: [1, 0], content: "fallback"}]).ops;
    const authored = b.edit([{op: "insert", at: [1], content: [caption("authored")]}]).ops;
    assert.equal(a.check(authored), null); assert.equal(b.check(fallback), null);
    authored.forEach(op => a.apply(op)); fallback.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON()); assert.deepEqual(texts(a), ["authored"]);
    assert.equal((a.overflow().find(node => node.type === "caption")!.runs![0] as {text: string}).text, "fallback");
    const deletion = a.edit([{op: "delete", at: [1], count: 1}]).ops;
    history.record(deletion, a, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(texts(a), ["fallback"]);
    history.undo(a); assert.deepEqual(texts(a), ["authored"]);
    history.redo(a); assert.deepEqual(texts(a), ["fallback"]);
});

test("hidden fallback accepts remote text and attribute edits before promotion", () => {
    const configured = structuredClone(schema);
    configured.nodes.caption.attrs = {tone: {default: ""}};
    const visible = new Doc("A", configured);
    visible.edit([{op: "insert", at: [1, 0], content: "old"}]);
    const hidden = Doc.fromSnapshot("B", visible.snapshot(), configured);
    hidden.edit([{op: "insert", at: [1], content: [caption("replacement")]}]);
    const updates = visible.edit([{op: "insert", at: [1, 3], content: " remote"}, {op: "update", at: [1], attrs: {tone: "retained"}}]).ops;
    assert.equal(hidden.check(updates), null); updates.forEach(op => hidden.apply(op));
    assert.deepEqual(texts(hidden), ["replacement"]);
    assert.equal((hidden.overflow().find(node => node.type === "caption")!.runs![0] as {text: string}).text, "old remote");
    hidden.edit([{op: "delete", at: [1], count: 1}]);
    assert.deepEqual(texts(hidden), ["old remote"]);
    assert.equal(hidden.toJSON().children![1].attrs!.tone, "retained");
});

test("invalid required references and whole changes leave unread storage and version unchanged", () => {
    const doc = new Doc("A", schema), before = doc.snapshot(), version = doc.version;
    const valid = new Doc("B", schema).edit([{op: "insert", at: [1, 0], content: "valid"}]).ops;
    const invalid: Op = {t: "text", id: {lamport: 500, actor: "B"}, origin: {lamport: 1, actor: "~required:0%40~root:caption:0"}, text: "invalid"};
    assert.equal(typeof doc.check([...valid, invalid]), "string");
    assert.deepEqual(doc.snapshot(), before); assert.equal(doc.version, version);
});
