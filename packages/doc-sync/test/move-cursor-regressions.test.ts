import assert from "node:assert/strict";
import {test} from "node:test";
import {TextSelection} from "prosemirror-state";
import {Doc, History, MAIN, pathAt, slotKey, type NodeJSON, type Schema} from "../../doc-sync/dist/index.js";
import {InputSession} from "../../doc-sync/dist/editor/index.js";
import {PmBinding} from "../../doc-sync-prosemirror/dist/binding.js";
import {buildPmSchema} from "../../doc-sync-prosemirror/dist/schema.js";
import type {SyncClient} from "../../doc-sync/dist/sync/client.js";

const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
    paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
}};
const p = (text: string): NodeJSON => ({type: "paragraph", runs: text ? [{text, marks: {}}] : []});
const box = (...children: NodeJSON[]): NodeJSON => ({type: "box", children});

function hiddenRootGap(text: string) {
    const doc = new Doc("cursor", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "HEAD"}, {op: "insert", at: [1], content: [box(p("BODY"))]}, {op: "move", from: [0], at: [1, 0]}]);
    const key = doc.blocks()[0].marker.key;
    assert.equal(key, "0@~text:0%40~root:");
    const history = new History();
    const ops = doc.edit([{op: "insert", at: [0], content: [p(text)]}]).ops;
    history.record(ops, doc, {caretBefore: key, caretAfter: key});
    assert.equal(doc.get(key)!.line.owner, null);
    assert.equal(doc.tokenLocation(key)!.visible, false);
    return {doc, key, history};
}

for (const text of ["", "REPLACEMENT"]) test(`hidden private root leading gap falls back to visible root start (${text || "empty"})`, () => {
    const {doc, key} = hiddenRootGap(text);
    assert.deepEqual(doc.posAfter(key), {b: 0, o: 0});
    assert.deepEqual(pathAt(doc, key), [0, 0]);
    assert.equal(doc.visible(MAIN), true);
    assert.equal(doc.blocks()[0].kind, "text");
});

test("hidden root lookup preserves CRDT state, clock, operations, and history", () => {
    const {doc, key, history} = hiddenRootGap("REPLACEMENT");
    const state = {actor: doc.actor, version: doc.version, clock: doc.clock.lamport, snapshot: doc.snapshot(), model: doc.toJSON(), history: history.snapshot()};
    const emitted: unknown[] = [];
    const emit = doc.emit;
    doc.emit = ops => {emitted.push(...ops); return emit.call(doc, ops);};
    for (let count = 0; count < 3; count++) {
        assert.deepEqual(doc.posAfter(key), {b: 0, o: 0});
        assert.deepEqual(pathAt(doc, key), [0, 0]);
    }
    assert.deepEqual({actor: doc.actor, version: doc.version, clock: doc.clock.lamport, snapshot: doc.snapshot(), model: doc.toJSON(), history: history.snapshot()}, state);
    assert.deepEqual(emitted, []);
    const restored = Doc.fromSnapshot("restored", state.snapshot, schema);
    assert.deepEqual(restored.posAfter(key), {b: 0, o: 0});
    assert.deepEqual(restored.toJSON(), state.model);
});

test("hidden remote endpoints remain unresolved while local history lookup has a fallback", () => {
    const {doc, key} = hiddenRootGap("REPLACEMENT");
    const input = new InputSession({doc} as SyncClient);
    assert.equal(input.resolve({anchor: key, focus: key}), null);
    assert.deepEqual(pathAt(doc, key), [0, 0]);
    assert.equal(doc.tokenLocation(key)!.visible, false);
});

test("hidden nested private gap retains its position and escapes a deleted owner", () => {
    const doc = new Doc("nested", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "ROOT"}, {op: "insert", at: [1], content: [box(p("HEAD"), box(p("BODY")))]}, {op: "move", from: [1, 0], at: [1, 1, 0]}]);
    const outer = doc.blocks().find(block => block.kind === "flow")!.marker;
    const body = slotKey(outer.key, "body");
    const key = doc.blocks(body)[0].marker.key;
    doc.edit([{op: "insert", at: [1, 0], content: [p("REPLACEMENT")]}]);
    assert.equal(doc.tokenLocation(key)!.visible, false);
    assert.equal(doc.get(key)!.line.owner, outer);
    assert.deepEqual(doc.posAfter(key), {line: key, b: 0, o: 0});
    assert.deepEqual(pathAt(doc, key), [1, 0, 0]);
    doc.edit([{op: "delete", at: [1], count: 1}]);
    assert.deepEqual(doc.posAfter(key), {b: 0, o: 4});
    assert.deepEqual(pathAt(doc, key), [0, 4]);
});

test("ProseMirror synthetic undo and redo select the hidden root fallback without throwing", () => {
    const {doc, key} = hiddenRootGap("REPLACEMENT");
    const client = {doc, schema, undo: () => key, redo: () => key} as unknown as SyncClient;
    const binding = new PmBinding(client, buildPmSchema(schema));
    binding.state = binding.state.apply(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, 4)));
    binding.undo();
    assert.equal(binding.state.selection.head, 1);
    binding.state = binding.state.apply(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, 4)));
    binding.redo();
    assert.equal(binding.state.selection.head, 1);
    assert.equal(doc.tokenLocation(key)!.visible, false);
});
