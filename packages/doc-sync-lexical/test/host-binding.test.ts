import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, $getSelection, $isRangeSelection, INSERT_PARAGRAPH_COMMAND} from "lexical";
import {registerRichText} from "@lexical/rich-text";
import {LexicalBinding, LexicalHostBinding, buildLexicalSchema, readLexicalModel, $setLexicalSelection, $lexicalSelection} from "../dist/index.js";
import {createSyncClientEditorHost, InputSession} from "../../doc-sync/dist/editor/index.js";
import type {EditorHost} from "../../doc-sync/dist/editor/index.js";
import {MemoryNet} from "../../doc-sync/test/harness.ts";

function contractOnly(host: EditorHost): EditorHost {
    return new Proxy(host, {get(target, key) {
        assert.ok(key in target, `Unexpected host access: ${String(key)}`);
        if (key === "createSession") return () => {
            const session = target.createSession();
            return new Proxy(session, {get(value, name) {
                assert.ok(name in value, `Unexpected session access: ${String(name)}`);
                return Reflect.get(value, name);
            }});
        };
        return Reflect.get(target, key);
    }});
}

test("LexicalHostBinding preserves Unicode, token Enter, remote composition, history, reset, and ownership through a contract-only host", async () => {
    const net = new MemoryNet(), a = net.add("host-lexical"), b = net.add("remote");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "A😀B"}]).ops); await net.settle(); a.clearHistory();
    const info = buildLexicalSchema(net.schema), editor = createEditor({nodes: info.nodes, onError: error => {throw error;}});
    const stop = registerRichText(editor), binding = new LexicalHostBinding(contractOnly(createSyncClientEditorHost(a)), editor, info);
    const type = (path: number[], value: string) => editor.update(() => {
        assert.ok($setLexicalSelection(info, {anchor: path, focus: path}));
        const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.insertText(value);
    }, {discrete: true});
    const model = () => readLexicalModel(editor, info);
    const firstText = () => { const run = model().children![0].runs![0]; return "text" in run ? run.text : null; };
    try {
        assert.throws(() => new LexicalBinding(a, editor, info), /already owns/);
        binding.beginComposition(); type([0, 3], "한"); type([0, 4], "글");
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await net.settle();
        assert.equal(firstText(), "A😀한글B");
        binding.endComposition(); await net.settle();
        assert.equal(firstText(), "RA😀한글B");
        binding.undo(); await net.settle(); assert.equal(firstText(), "RA😀B");
        binding.redo(); await net.settle(); assert.deepEqual(model(), b.doc.toJSON());
        editor.update(() => {$setLexicalSelection(info, {anchor: [0, 4], focus: [0, 4]});}, {discrete: true});
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined); editor.update(() => {}, {discrete: true}); await net.settle();
        assert.deepEqual(editor.getEditorState().read(() => $lexicalSelection(info)), {anchor: [1, 0], focus: [1, 0]});
        assert.deepEqual(model(), b.doc.toJSON());
        binding.beginComposition(); type([1, 0], "stale"); net.hub.reset(); await net.settle();
        assert.equal(binding.session.active, false); assert.deepEqual(model(), a.doc.toJSON());
        binding.dispose(); const before = model();
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "after"}]).ops); await net.settle(); assert.deepEqual(model(), before);
    } finally { binding.dispose(); stop(); a.disconnect(); b.disconnect(); }
});

test("LexicalBinding keeps the original InputSession object and creates one composition fork", async () => {
    const net = new MemoryNet(), client = net.add("legacy-lexical");
    const info = buildLexicalSchema(net.schema), editor = createEditor({nodes: info.nodes, onError: error => {throw error;}});
    const binding = new LexicalBinding(client, editor, info), input = binding.input;
    const snapshot = client.doc.snapshot.bind(client.doc); let forks = 0;
    client.doc.snapshot = () => { forks++; return snapshot(); };
    try {
        assert.equal(binding.client, client); assert.ok(input instanceof InputSession); assert.equal(input.client, client);
        binding.beginComposition(); binding.beginComposition();
        assert.equal(binding.input, input); assert.equal(input.active, true); assert.equal(binding.session.active, true); assert.equal(forks, 1);
        assert.equal(input.doc, input.doc);
        binding.cancelComposition(); assert.equal(input.active, false);
    } finally { binding.dispose(); }
});

import {schemaVersion} from "../../doc-sync/dist/crdt/schema-version.js";

test("Lexical binding disconnects after a lost conditional response without a native callback error", async () => {
    const net = new MemoryNet(), a = net.add("conditional-lexical");
    a.connect(); await net.settle();
    const info = buildLexicalSchema(net.schema), errors: Error[] = [];
    const editor = createEditor({nodes: info.nodes, onError: error => {throw error;}});
    const stop = registerRichText(editor), binding = new LexicalBinding(a, editor, {info, onError: error => errors.push(error)});
    const flush = () => net.settle();
    const model = () => readLexicalModel(editor, info);
    const input = () => editor.update(() => {
        $setLexicalSelection(info, {anchor: [0, 0], focus: [0, 0]});
        const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.insertText("blocked");
    }, {discrete: true});
    try {
        await flush();
        const result = await a.conditionalEdit({epoch: a.epoch!, serverSeq: a.serverSeq, schemaVersion: schemaVersion(net.schema)},
            [{op: "insert", at: [0, 0], content: "unknown"}], async (base, change) => { net.hub.submitConditional(change, base); throw new Error("response lost"); });
        assert.equal(result.status, "unconfirmed"); assert.equal(a.conditionalPending, true);
        const before = a.doc.toJSON();
        assert.doesNotThrow(() => a.disconnect());
        assert.equal(a.online, false); assert.deepEqual(errors, []); assert.deepEqual(model(), before);
        assert.throws(() => binding.host.apply([{op: "insert", at: [0, 0], content: "blocked"}]), /conditional/);
        const retried = await a.retryConditional(async (base, change) => ({status: "accepted", serverSeq: net.hub.submitConditional(change, base).serverSeq}));
        assert.equal(retried.status, "accepted"); assert.equal(a.conditionalPending, false);
        assert.deepEqual(model(), net.hub.doc.toJSON()); assert.deepEqual(errors, []);
        a.connect(); await flush(); assert.deepEqual(model(), net.hub.doc.toJSON());
    } finally { binding.dispose(); stop(); a.disconnect(); }
});

test("Lexical binding refreshes a received model while recovery pauses local input", async () => {
    const net = new MemoryNet(), a = net.add("paused-lexical"), b = net.add("remote");
    a.connect(); b.connect(); await net.settle();
    let release: (() => void) | undefined;
    // The application enters recovery after a real remote mutation, before native observers.
    a.onModelEvents = (_edits, info) => {
        if (info.cause === "remote") { a.disconnect(); release = a.pauseLocalMutations(); }
    };
    const info = buildLexicalSchema(net.schema), errors: Error[] = [];
    const editor = createEditor({nodes: info.nodes, onError: error => {throw error;}});
    const stop = registerRichText(editor), binding = new LexicalBinding(a, editor, {info, onError: error => errors.push(error)});
    const flush = () => net.settle();
    const model = () => readLexicalModel(editor, info);
    const input = () => editor.update(() => {
        $setLexicalSelection(info, {anchor: [0, 0], focus: [0, 0]});
        const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.insertText("blocked");
    }, {discrete: true});
    try {
        await flush();
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "received"}]).ops);
        await assert.doesNotReject(() => flush());
        assert.ok(release); assert.deepEqual(model(), a.doc.toJSON()); assert.deepEqual(model(), b.doc.toJSON());
        const before = a.doc.toJSON(), pending = structuredClone(a.pending), history = a.history.snapshot();
        input(); await flush();
        assert.equal(errors.length, 1); assert.match(errors[0].message, /paused/);
        assert.deepEqual(a.doc.toJSON(), before); assert.deepEqual(a.pending, pending); assert.deepEqual(a.history.snapshot(), history);
        assert.deepEqual(model(), before);
    } finally { release?.(); binding.dispose(); stop(); a.disconnect(); b.disconnect(); }
});

import {LocalClient, createLocalEditorHost} from "../../doc-sync/dist/local/index.js";

for (const [label, anchor, focus] of [["forward", 1, 3], ["backward", 3, 1], ["collapsed", 3, 3]] as const) {
    test(`Lexical local host retains ${label} native selection across an application insert`, () => {
        const schema = {root: "content", marks: [], nodes: {content: {shape: "flow" as const, children: ["paragraph"], default: "paragraph"}, paragraph: {shape: "text" as const}}};
        const client = new LocalClient({schema, actor: `local-selection-${label}`});
        client.edit([{op: "insert", at: [0, 0], content: "A😀BC"}], null);
        const info = buildLexicalSchema(schema), editor = createEditor({nodes: info.nodes, onError: error => {throw error;}});
        const stop = registerRichText(editor), binding = new LexicalHostBinding(createLocalEditorHost(client), editor, info);
        try {
            // This changes selection only. It must not create a history entry.
            editor.update(() => { assert.ok($setLexicalSelection(info, {anchor: [0, anchor], focus: [0, focus]})); }, {discrete: true});
            assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
            client.edit([{op: "insert", at: [0, 0], content: "Local "}]);
            assert.deepEqual(readLexicalModel(editor, info), client.model());
            assert.deepEqual(editor.getEditorState().read(() => $lexicalSelection(info)), {anchor: [0, anchor + 6], focus: [0, focus + 6]});
            assert.deepEqual(client.notificationErrors, []);
        } finally { binding.dispose(); stop(); client.dispose(); }
    });
}
