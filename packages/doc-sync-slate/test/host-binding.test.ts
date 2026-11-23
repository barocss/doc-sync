import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, Transforms} from "slate";
import {SlateBinding, SlateHostBinding, fromSlate} from "../dist/index.js";
import {createSyncClientEditorHost} from "../../doc-sync-core/dist/editor/index.js";
import type {EditorHost} from "../../doc-sync-core/dist/editor/index.js";
import {MemoryNet, tick} from "../../doc-sync/test/harness.ts";

/** A consumer can expose only the public contract, without a client/document escape. */
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
const text = (model: ReturnType<typeof fromSlate>) => model.children?.map(node => node.runs?.map(run => "text" in run ? run.text : "*").join("")).join("|");

test("SlateHostBinding uses only the host contract through Unicode edits, remote composition, undo, reset, and disposal", async () => {
    const net = new MemoryNet(), a = net.add("host-slate"), b = net.add("remote");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "A😀B"}]).ops); await net.settle(); a.clearHistory();
    const editor = createEditor(), original = editor.onChange;
    const host = contractOnly(createSyncClientEditorHost(a));
    const binding = new SlateHostBinding(host, editor);
    const flush = async () => { await tick(); await net.settle(); await tick(); };
    try {
        await flush();
        assert.throws(() => new SlateBinding(a, editor), /already has a binding/);
        Transforms.select(editor, {path: [0, 0], offset: 3}); await flush();
        binding.beginComposition();
        Transforms.insertText(editor, "한"); await flush();
        Transforms.insertText(editor, "글"); await flush();
        assert.equal(text(a.doc.toJSON()), "A😀B");
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await flush();
        assert.equal(text(fromSlate(net.schema, editor.children)), "A😀한글B");
        binding.endComposition(); await flush();
        assert.equal(text(a.doc.toJSON()), "RA😀한글B");
        assert.deepEqual(fromSlate(net.schema, editor.children), b.doc.toJSON());
        binding.undo(); await flush(); assert.equal(text(a.doc.toJSON()), "RA😀B");
        binding.redo(); await flush(); assert.equal(text(a.doc.toJSON()), "RA😀한글B");
        binding.beginComposition(); Transforms.insertText(editor, "stale"); await flush();
        net.hub.reset(); await flush();
        assert.equal(binding.composing, false);
        assert.deepEqual(fromSlate(net.schema, editor.children), a.doc.toJSON());
        binding.dispose(); assert.equal(editor.onChange, original);
        const children = structuredClone(editor.children);
        b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "after"}]).ops); await flush();
        assert.deepEqual(editor.children, children);
    } finally { binding.dispose(); a.disconnect(); b.disconnect(); }
});

test("SlateBinding keeps the exact legacy client identity", async () => {
    const net = new MemoryNet(), client = net.add("legacy-slate");
    const binding = new SlateBinding(client, createEditor());
    try { assert.equal(binding.client, client); assert.ok(binding instanceof SlateHostBinding); }
    finally { binding.dispose(); }
});

import {schemaVersion} from "../../doc-sync-core/dist/crdt/schema-version.js";

test("Slate binding disconnects after a lost conditional response without a native callback error", async () => {
    const net = new MemoryNet(), a = net.add("conditional-slate");
    a.connect(); await net.settle();
    const editor = createEditor(), errors: Error[] = [];
    const binding = new SlateBinding(a, editor, {onError: error => errors.push(error)});
    const flush = async () => { await tick(); await net.settle(); await tick(); };
    const model = () => fromSlate(net.schema, editor.children);
    const input = () => { Transforms.select(editor, {path: [0, 0], offset: 0}); Transforms.insertText(editor, "blocked"); };
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
    } finally { binding.dispose(); a.disconnect(); }
});

test("Slate binding refreshes a received model while recovery pauses local input", async () => {
    const net = new MemoryNet(), a = net.add("paused-slate"), b = net.add("remote");
    a.connect(); b.connect(); await net.settle();
    let release: (() => void) | undefined;
    // The application enters recovery after a real remote mutation, before native observers.
    a.onModelEvents = (_edits, info) => {
        if (info.cause === "remote") { a.disconnect(); release = a.pauseLocalMutations(); }
    };
    const editor = createEditor(), errors: Error[] = [];
    const binding = new SlateBinding(a, editor, {onError: error => errors.push(error)});
    const flush = async () => { await tick(); await net.settle(); await tick(); };
    const model = () => fromSlate(net.schema, editor.children);
    const input = () => { Transforms.select(editor, {path: [0, 0], offset: 0}); Transforms.insertText(editor, "blocked"); };
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
    } finally { release?.(); binding.dispose(); a.disconnect(); b.disconnect(); }
});
