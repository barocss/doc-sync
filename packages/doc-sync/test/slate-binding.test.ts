import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, Editor, Transforms} from "slate";
import {SlateBinding, fromSlate, slateRangeToModel, toSlate} from "../src/slate/index.ts";
import {MemoryNet, tick} from "./harness.ts";
import type {Descendant} from "slate";
import type {NodeJSON} from "../src/crdt/model.ts";

const start = async (text = "abcd", groupTyping = true) => {
    const net = new MemoryNet();
    const a = net.add("alice"), b = net.add("bob");
    a.connect(); b.connect();
    await net.settle();
    if (text) a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: text}]).ops);
    await net.settle();
    a.clearHistory();
    const editor = createEditor();
    const errors: Error[] = [];
    const notifications: NodeJSON[] = [];
    let nativeCalls = 0, events = 0, models = 0, updates = 0;
    const previous = {
        native: () => { nativeCalls += 1; }, event: () => { events += 1; },
        model: () => { models += 1; }, update: () => { updates += 1; },
    };
    editor.onChange = previous.native;
    a.onEvent = previous.event; a.onModelEvents = previous.model; a.onUpdate = previous.update;
    const inline = editor.isInline, isVoid = editor.isVoid;
    const binding = new SlateBinding(a, editor, {groupTyping, onError: error => errors.push(error), onChange: model => notifications.push(model)});
    const flush = async () => { await tick(); await net.settle(); await tick(); };
    await flush();
    const same = () => {
        assert.deepEqual(errors.map(error => error.message), []);
        assert.deepEqual(fromSlate(net.schema, editor.children), a.doc.toJSON());
        assert.deepEqual(a.doc.toJSON(), b.doc.toJSON());
        assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
        assert.equal(a.pending.length, 0); assert.equal(b.pending.length, 0);
    };
    const close = () => { binding.destroy(); a.disconnect(); b.disconnect(); };
    return {net, a, b, editor, binding, errors, notifications, previous, inline, isVoid, flush, same, close,
        counts: () => ({nativeCalls, events, models, updates})};
};
const plain = (model: NodeJSON): string => (model.children ?? []).map(node => (node.runs ?? []).map(run => "text" in run ? run.text : "*").join("")).join("|");
const point = (offset: number) => ({path: [0, 0], offset});

test("SlateBinding initializes a real Slate editor, preserves callbacks and sends native edits once", async () => {
    const c = await start();
    try {
        assert.deepEqual(fromSlate(c.net.schema, c.binding.initialValue), c.a.doc.toJSON());
        assert.throws(() => new SlateBinding(c.a, c.editor), /already has a binding/);
        Transforms.select(c.editor, point(2));
        await c.flush();
        Transforms.insertText(c.editor, "X");
        await c.flush();
        c.same();
        assert.equal(plain(c.a.doc.toJSON()), "abXcd");
        assert.equal(c.net.hub.serverSeq, 2);
        assert.ok(c.counts().nativeCalls > 0 && c.counts().events > 0 && c.counts().updates > 0);
        assert.ok(c.notifications.some(model => plain(model) === "abXcd"));
        await c.flush();
        assert.equal(c.net.hub.serverSeq, 2, "no echo after native callbacks settle");
    } finally { c.close(); }
});

for (const reverse of [false, true]) test(`SlateBinding preserves ${reverse ? "backward" : "forward"} UTF16 selections after remote edits and leaf splits`, async () => {
    const c = await start("A😀BCD");
    try {
        Transforms.select(c.editor, {anchor: point(reverse ? 5 : 3), focus: point(reverse ? 3 : 5)});
        await c.flush();
        c.b.commit(c.b.doc.edit([
            {op: "insert", at: [0, 0], content: "Q"},
            {op: "update", at: [0, 4], length: 2, attrs: {bold: true}},
        ]).ops);
        await c.flush();
        c.same();
        assert.deepEqual(slateRangeToModel(c.net.schema, c.editor.children, c.editor.selection), {
            anchor: [0, reverse ? 6 : 4], focus: [0, reverse ? 4 : 6],
        });
        assert.equal(c.a.pending.length, 0);
        assert.ok(c.counts().models > 0);
    } finally { c.close(); }
});

test("SlateBinding groups continuous native UTF16 typing and restores undo/redo carets", async () => {
    const c = await start("A😀B");
    try {
        Transforms.select(c.editor, point(3)); await c.flush();
        Transforms.insertText(c.editor, "X"); await c.flush();
        Transforms.insertText(c.editor, "Y"); await c.flush();
        assert.equal(plain(c.a.doc.toJSON()), "A😀XYB");
        c.binding.undo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "A😀B");
        assert.deepEqual(slateRangeToModel(c.net.schema, c.editor.children, c.editor.selection), {anchor: [0, 3], focus: [0, 3]});
        c.binding.redo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "A😀XYB");
        assert.deepEqual(slateRangeToModel(c.net.schema, c.editor.children, c.editor.selection), {anchor: [0, 5], focus: [0, 5]});
    } finally { c.close(); }
});

test("SlateBinding sends semantic Enter while concurrent trailing text survives", async () => {
    const c = await start();
    try {
        Transforms.select(c.editor, point(2)); await c.flush();
        Transforms.splitNodes(c.editor, {at: point(2)});
        await tick();
        assert.ok(c.a.pending[0].ops.some(op => op.t === "node" && op.boundary));
        assert.equal(c.a.pending[0].ops.some(op => op.t === "del"), false);
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 3], content: "R"}]).ops);
        await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "ab|cRd");
    } finally { c.close(); }
});

test("SlateBinding concurrent same-boundary Enter opens only one new line", async () => {
    const c = await start();
    const other = createEditor();
    const errors: Error[] = [];
    const binding = new SlateBinding(c.b, other, {onError: error => errors.push(error)});
    try {
        await c.flush();
        Transforms.splitNodes(c.editor, {at: point(2)});
        Transforms.splitNodes(other, {at: point(2)});
        await c.flush(); c.same();
        assert.deepEqual(errors, []);
        assert.deepEqual(fromSlate(c.net.schema, other.children), c.a.doc.toJSON());
        assert.equal(plain(c.a.doc.toJSON()), "ab|cd");
    } finally { binding.destroy(); c.close(); }
});

test("SlateBinding composition defers display, preserves remote text, and commits one undo unit", async () => {
    const c = await start();
    try {
        Transforms.select(c.editor, point(2)); await c.flush();
        c.binding.beginComposition();
        Transforms.insertText(c.editor, "한"); await c.flush();
        assert.equal(c.binding.composing, true);
        assert.equal(plain(c.a.doc.toJSON()), "abcd");
        assert.equal(c.a.pending.length, 0);
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops);
        await c.flush();
        assert.equal(plain(c.a.doc.toJSON()), "Rabcd");
        assert.equal(plain(fromSlate(c.net.schema, c.editor.children)), "ab한cd");
        c.binding.endComposition(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "Rab한cd");
        c.binding.undo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "Rabcd");
        c.binding.redo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "Rab한cd");
    } finally { c.close(); }
});

test("SlateBinding composition cancellation discards its draft but retains received changes", async () => {
    const c = await start();
    try {
        Transforms.select(c.editor, point(2)); await c.flush();
        c.binding.beginComposition();
        Transforms.insertText(c.editor, "draft"); await c.flush();
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await c.flush();
        c.binding.cancelComposition(); await c.flush(); c.same();
        assert.equal(c.binding.composing, false);
        assert.equal(plain(c.a.doc.toJSON()), "Rabcd");
    } finally { c.close(); }
});

test("SlateBinding reset cancels active composition even when live document was empty", async () => {
    const c = await start("");
    try {
        Transforms.select(c.editor, point(0)); await c.flush();
        c.binding.beginComposition();
        Transforms.insertText(c.editor, "draft"); await c.flush();
        c.net.hub.reset(); await c.flush();
        c.same();
        assert.equal(c.binding.composing, false);
        assert.equal(plain(c.a.doc.toJSON()), "");
        c.binding.endComposition(); await c.flush();
        assert.equal(plain(c.a.doc.toJSON()), "");
        Transforms.select(c.editor, point(0)); Transforms.insertText(c.editor, "Z");
        await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "Z");
    } finally { c.close(); }
});

test("SlateBinding handles reconnect snapshots without re-sending composition draft", async () => {
    const c = await start();
    try {
        Transforms.select(c.editor, point(2)); await c.flush();
        c.binding.beginComposition();
        Transforms.insertText(c.editor, "한"); await c.flush();
        c.a.disconnect();
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await c.flush();
        c.a.connect(); await c.flush();
        assert.equal(plain(fromSlate(c.net.schema, c.editor.children)), "ab한cd");
        c.binding.endComposition(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "Rab한cd");
    } finally { c.close(); }
});

test("SlateBinding maps nested table input and preserves covered-cell content on remote span changes", async () => {
    const c = await start("root");
    try {
        c.b.commit(c.b.doc.edit([{op: "insert", at: [1], content: [{type: "table", children: [{type: "table-row", children: [
            {type: "table-cell", children: [{type: "table-cell-body", children: [{type: "paragraph", runs: [{text: "left", marks: {}}]}]}]},
            {type: "table-cell", children: [{type: "table-cell-body", children: [{type: "paragraph", runs: [{text: "hidden", marks: {}}]}]}]},
        ]}]}]}]).ops);
        await c.flush(); c.same();
        const nativePoint = {path: [1, 0, 0, 0, 0, 0], offset: 4};
        Transforms.select(c.editor, nativePoint); await c.flush();
        Transforms.insertText(c.editor, "!"); await c.flush(); c.same();
        assert.deepEqual(c.a.doc.toJSON().children![1].children![0].children![0].children![0].children![0].runs, [{text: "left!", marks: {}}]);
        c.b.commit(c.b.doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 2}}]).ops);
        await c.flush(); c.same();
        assert.deepEqual(c.a.doc.toJSON().children![1].children![0].children![1].children![0].children![0].runs, [{text: "hidden", marks: {}}]);
    } finally { c.close(); }
});

test("SlateBinding rejects unsupported native types and supports token-preserving native block moves", async () => {
    const c = await start();
    try {
        const before = c.a.doc.toJSON();
        Transforms.insertNodes(c.editor, {type: "unknown", children: [{text: "lost"}]} as unknown as Descendant, {at: [1]});
        await c.flush();
        assert.equal(c.errors.length, 1);
        assert.match(c.errors[0].message, /not an allowed child/);
        assert.deepEqual(c.a.doc.toJSON(), before);
        assert.deepEqual(fromSlate(c.net.schema, c.editor.children), before);
        c.errors.length = 0;
        c.b.commit(c.b.doc.edit([{op: "insert", at: [1], content: [{type: "paragraph", runs: [{text: "second", marks: {}}]}]}]).ops);
        await c.flush();
        const tokenKeys = c.a.doc.items.map(item => item.key);
        Transforms.moveNodes(c.editor, {at: [1], to: [0]});
        await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "second|abcd");
        assert.deepEqual(c.a.doc.items.map(item => item.key), tokenKeys);
        c.binding.undo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "abcd|second");
        c.binding.redo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "second|abcd");
    } finally { c.close(); }
});

test("SlateBinding DOM event hooks are removable and disposal restores native/client callbacks", async () => {
    const c = await start();
    c.binding.destroy();
    const element = new EventTarget();
    const binding = new SlateBinding(c.a, c.editor, {element: element as HTMLElement, onError: error => c.errors.push(error)});
    try {
        await c.flush();
        element.dispatchEvent(new Event("compositionstart"));
        assert.equal(binding.composing, true);
        Transforms.select(c.editor, point(2)); Transforms.insertText(c.editor, "X");
        await c.flush();
        element.dispatchEvent(new Event("compositionend")); await c.flush();
        assert.equal(binding.composing, false);
        assert.equal(plain(c.a.doc.toJSON()), "abXcd");
        binding.dispose(); binding.dispose(); await c.flush();
        assert.equal(c.editor.onChange, c.previous.native);
        assert.equal(c.editor.isInline, c.inline);
        assert.equal(c.editor.isVoid, c.isVoid);
        assert.equal(c.a.onEvent, c.previous.event);
        assert.equal(c.a.onModelEvents, c.previous.model);
        assert.equal(c.a.onUpdate, c.previous.update);
        const nativeBefore = structuredClone(c.editor.children);
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await c.flush();
        assert.deepEqual(c.editor.children, nativeBefore);
        element.dispatchEvent(new Event("compositionstart"));
        assert.equal(binding.composing, false);
    } finally { binding.destroy(); c.close(); }
});


test("SlateBinding can keep each native input in a separate undo unit", async () => {
    const c = await start("ab", false);
    try {
        Transforms.select(c.editor, point(2)); await c.flush();
        Transforms.insertText(c.editor, "X"); await c.flush();
        Transforms.insertText(c.editor, "Y"); await c.flush();
        c.binding.undo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "abX");
        c.binding.redo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "abXY");
    } finally { c.close(); }
});

test("SlateBinding undo commits a composition draft then undoes only that draft", async () => {
    const c = await start("ab");
    try {
        Transforms.select(c.editor, point(2)); await c.flush();
        Transforms.insertText(c.editor, "P"); await c.flush();
        c.binding.beginComposition();
        Transforms.insertText(c.editor, "Q"); await c.flush();
        c.b.commit(c.b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await c.flush();
        c.binding.undo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "RabP");
        assert.equal(c.binding.composing, false);
        c.binding.redo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "RabPQ");
        c.binding.undo(); await c.flush();
        c.binding.undo(); await c.flush(); c.same();
        assert.equal(plain(c.a.doc.toJSON()), "Rab");
    } finally { c.close(); }
});
