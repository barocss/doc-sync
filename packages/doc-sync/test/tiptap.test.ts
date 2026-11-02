import assert from "node:assert/strict";
import {after, test} from "node:test";
import {JSDOM} from "jsdom";
import {Editor, Extension} from "@tiptap/core";
import {Plugin, PluginKey} from "@tiptap/pm/state";
import {DocSync, createTiptapExtensions} from "@barocss/doc-sync/tiptap";
import {buildPmSchema, fromPmJSON} from "../../doc-sync-prosemirror/dist/index.js";
import {canonical} from "../../doc-sync-core/dist/crdt/model.js";
import {MemoryNet} from "./harness.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {pretendToBeVisual: true});
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "DOMParser", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    Object.defineProperty(globalThis, name, {value: (dom.window as any)[name], configurable: true, writable: true});
}
after(() => dom.window.close());
const setup = async (text = "abc", extra: Extension[] = []) => {
    const net = new MemoryNet();
    const clients = [net.add("tiptap-a"), net.add("tiptap-b")];
    clients.forEach(client => client.connect());
    await net.settle();
    const editors = clients.map((client, index) => new Editor({
        element: document.body.appendChild(document.createElement("div")),
        extensions: [...createTiptapExtensions(client.schema), DocSync.configure({client}), ...(index === 0 ? extra : [])],
    }));
    if (text) { editors[0].commands.insertContent(text); await net.settle(); }
    return {net, clients, editors, dispose() { editors.forEach(editor => editor.destroy()); clients.forEach(client => client.disconnect()); }};
};
const equal = (s: Awaited<ReturnType<typeof setup>>) => {
    for (let i = 0; i < 2; i++) {
        assert.deepEqual(canonical(s.net.schema, fromPmJSON(buildPmSchema(s.net.schema), s.net.schema, s.editors[i].getJSON(), s.clients[i].doc.toJSON())), s.clients[i].doc.toJSON());
        assert.deepEqual(s.clients[i].doc.toJSON(), s.net.hub.doc.toJSON());
        assert.equal(s.clients[i].pending.length, 0);
    }
};

test("Tiptap real Editor chain edits and remote receipt do not echo", async t => {
    const s = await setup(); t.after(() => s.dispose());
    let echoes = 0;
    const commit = s.clients[1].commit.bind(s.clients[1]);
    s.clients[1].commit = (...args) => { echoes++; return commit(...args); };
    assert.equal(s.editors[0].chain().setTextSelection(2).insertContent("😀").run(), true);
    await s.net.settle();
    assert.equal(s.editors[1].getText(), "a😀bc");
    assert.equal(echoes, 0); equal(s);
});

test("Tiptap accepted appended transactions retain plugin state and reject filtered edits", async t => {
    const key = new PluginKey<number>("test-counter");
    const extra = Extension.create({name: "transactionChecks", addProseMirrorPlugins() { return [new Plugin({key,
        state: {init: () => 0, apply: (tr, value) => value + Number(tr.docChanged)},
        filterTransaction: tr => !tr.doc.textContent.includes("BLOCK"),
        appendTransaction(transactions, _old, state) {
            return transactions.some(tr => tr.getMeta("append-exclamation")) ? state.tr.insertText("!", state.doc.content.size - 1) : null;
        },
    })]; }});
    const s = await setup("abc", [extra]); t.after(() => s.dispose());
    const before = key.getState(s.editors[0].state)!;
    s.editors[0].view.dispatch(s.editors[0].state.tr.insertText("X", 2).setMeta("append-exclamation", true));
    await s.net.settle(); assert.equal(s.editors[1].getText(), "aXbc!");
    assert.equal(key.getState(s.editors[0].state), before + 2);
    s.editors[0].commands.insertContent("BLOCK"); await s.net.settle();
    assert.equal(s.editors[0].getText().includes("BLOCK"), false); equal(s);
});

test("Tiptap native marks, paragraph splits, flattened lists, and tables converge", async t => {
    const s = await setup(); t.after(() => s.dispose());
    s.editors[0].chain().setTextSelection({from: 1, to: 3}).setMark("bold").run();
    await s.net.settle(); assert.equal(s.editors[1].getJSON().content![0].content![0].marks![0].type, "bold");
    s.editors[0].chain().setTextSelection(3).splitBlock().run(); await s.net.settle();
    assert.equal(s.editors[1].getJSON().content!.length, 2);
    s.editors[0].chain().setTextSelection(1).setNode("list_item", {listType: "bullet", level: 1}).run(); await s.net.settle();
    assert.equal(s.clients[1].doc.toJSON().children![0].type, "list");
    s.editors[0].commands.insertContentAt(s.editors[0].state.doc.content.size, {type: "table", content: [{type: "table_row", content: [{type: "table_cell", content: [{type: "paragraph", content: [{type: "text", text: "cell"}]}]}]}]});
    await s.net.settle(); assert.equal(s.clients[1].doc.toJSON().children!.at(-1)!.type, "table"); equal(s);
});

test("Tiptap CRDT undo preserves foreign text and supports command can/redo", async t => {
    const s = await setup(""); t.after(() => s.dispose());
    assert.equal(s.editors[0].can().docSyncUndo(), false);
    s.editors[0].commands.insertContent("A"); await s.net.settle();
    s.editors[1].commands.insertContentAt(2, "B"); await s.net.settle();
    assert.equal(s.editors[0].can().docSyncUndo(), true);
    assert.equal(s.editors[0].getText(), "AB");
    s.editors[0].commands.docSyncUndo(); await s.net.settle(); assert.equal(s.editors[1].getText(), "B");
    s.editors[0].chain().docSyncRedo().run(); await s.net.settle(); assert.equal(s.editors[1].getText(), "AB"); equal(s);
});

test("Tiptap remote receipt maps UTF-16 range endpoints without changing focus", async t => {
    const s = await setup("abcdef"); t.after(() => s.dispose());
    s.editors[1].commands.setTextSelection({from: 3, to: 6});
    const focused = document.activeElement;
    s.editors[0].commands.insertContentAt(2, "😀"); await s.net.settle();
    assert.equal(s.editors[1].state.selection.from, 5); assert.equal(s.editors[1].state.selection.to, 8);
    assert.equal(document.activeElement, focused); equal(s);
});

test("Tiptap reset and offline reconnect update native state; read-only accepts remote edits", async t => {
    const s = await setup(); t.after(() => s.dispose());
    s.editors[1].setEditable(false);
    s.clients[1].disconnect();
    s.editors[0].commands.insertContentAt(2, "X"); await s.net.settle();
    s.clients[1].connect(); await s.net.settle(); assert.equal(s.editors[1].getText(), "aXbc");
    s.net.hub.reset(); s.net.down(); await s.net.settle();
    assert.equal(s.editors[0].getText(), ""); assert.equal(s.editors[1].getText(), ""); equal(s);
});

test("Tiptap destruction restores application callbacks and permits a new editor", async t => {
    const s = await setup(); t.after(() => s.dispose());
    s.editors[0].destroy();
    let updates = 0;
    const onUpdate = () => updates++;
    s.clients[0].onUpdate = onUpdate;
    const replacement = new Editor({element: document.body.appendChild(document.createElement("div")), extensions: [...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0]})], content: "ignored"});
    assert.equal(replacement.getText(), "abc"); replacement.destroy();
    assert.equal(s.clients[0].onUpdate, onUpdate);
    s.editors[1].commands.insertContentAt(1, "remote"); await s.net.settle(); assert.ok(updates > 0);
    assert.equal(replacement.isDestroyed, true);
});

test("Tiptap rejects extra schema nodes and native history before shared editing", async t => {
    const s = await setup(); t.after(() => s.dispose());
    s.editors[0].destroy();
    const conflicting = Extension.create({name: "history"});
    assert.throws(() => new Editor({extensions: [...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0]}), conflicting]}), /disable history/);
    assert.throws(() => new Editor({extensions: [DocSync.configure({client: s.clients[0]})]}));
});

test("Tiptap rejects mixed history/content chains before either model changes", async t => {
    const s = await setup("abc"); t.after(() => s.dispose());
    for (const run of [
        () => s.editors[0].chain().docSyncUndo().insertContent("X").run(),
        () => s.editors[0].chain().insertContent("X").docSyncUndo().run(),
    ]) {
        const editor = s.editors[0].getJSON();
        const model = s.clients[0].doc.toJSON();
        const seq = s.net.hub.serverSeq;
        assert.throws(run, /separate chain/);
        await s.net.settle();
        assert.deepEqual(s.editors[0].getJSON(), editor);
        assert.deepEqual(s.clients[0].doc.toJSON(), model);
        assert.equal(s.net.hub.serverSeq, seq); equal(s);
    }
    assert.equal(s.editors[0].chain().setTextSelection(1).docSyncUndo().run(), true);
    await s.net.settle(); assert.equal(s.editors[1].getText(), ""); equal(s);
});

test("Tiptap mounts an existing snapshot without rewriting or adding undo history", async t => {
    const s = await setup("snapshot 😀"); t.after(() => s.dispose());
    s.editors[1].destroy();
    const before = s.clients[1].doc.toJSON();
    const seq = s.net.hub.serverSeq;
    const replacement = new Editor({element: document.body.appendChild(document.createElement("div")), content: "must not replace shared content", extensions: [
        ...createTiptapExtensions(s.clients[1].schema), DocSync.configure({client: s.clients[1]}),
    ]});
    t.after(() => replacement.destroy());
    await s.net.settle();
    assert.equal(replacement.getText(), "snapshot 😀");
    assert.deepEqual(s.clients[1].doc.toJSON(), before);
    assert.equal(s.net.hub.serverSeq, seq);
    assert.equal(replacement.can().docSyncUndo(), false);
});

test("Tiptap reports both presence endpoints and rejects duplicate ownership without stealing callbacks", async t => {
    const s = await setup("abcdef"); t.after(() => s.dispose());
    s.editors[0].destroy();
    const selections: Array<[string | null, string | null]> = [];
    const presence: unknown[] = [];
    s.clients[0].setPresence = value => { presence.push(value); };
    const editor = new Editor({element: document.body.appendChild(document.createElement("div")), extensions: [
        ...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0], presence: {name: "Alice", color: "#2274a5"}, onSelection: (anchor, focus) => selections.push([anchor, focus])}),
    ]});
    t.after(() => editor.destroy());
    const callback = s.clients[0].onUpdate;
    assert.throws(() => new Editor({extensions: [...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0]})]}), /already has/);
    assert.equal(s.clients[0].onUpdate, callback);
    editor.commands.setTextSelection({from: 2, to: 5});
    await s.net.settle();
    const last = selections.at(-1)!;
    assert.ok(last[0]); assert.ok(last[1]); assert.notEqual(last[0], last[1]);
    assert.deepEqual(presence.at(-1), {name: "Alice", color: "#2274a5", anchor: last[0], focus: last[1]});
    editor.commands.insertContent("X"); await s.net.settle();
    assert.equal(s.editors[1].getText(), "aXef");
});


test("Tiptap unavailable history cannot allow mixed edit chains", async t => {
    const s = await setup(""); t.after(() => s.dispose());
    for (const run of [
        () => s.editors[0].chain().docSyncUndo().insertContent("X").run(),
        () => s.editors[0].chain().insertContent("X").docSyncUndo().run(),
        () => s.editors[0].chain().docSyncRedo().insertContent("X").run(),
        () => s.editors[0].chain().insertContent("X").docSyncRedo().run(),
    ]) {
        const before = s.editors[0].getJSON();
        const model = s.clients[0].doc.toJSON();
        assert.throws(run, /separate chain/);
        await s.net.settle();
        assert.deepEqual(s.editors[0].getJSON(), before);
        assert.deepEqual(s.clients[0].doc.toJSON(), model); equal(s);
    }
});


test("Tiptap rejects altered generated node schema before shared editing", async t => {
    const s = await setup(); t.after(() => s.dispose());
    s.editors[0].destroy();
    const extensions = createTiptapExtensions(s.clients[0].schema).map(extension => extension.name === "paragraph" ? extension.extend({group: "extra"}) : extension);
    const before = s.clients[0].doc.toJSON();
    assert.throws(() => new Editor({extensions: [...extensions, DocSync.configure({client: s.clients[0]})]}), /incompatible node/);
    assert.deepEqual(s.clients[0].doc.toJSON(), before);
});

test("Tiptap presence broadcast settles without a selection feedback loop", async t => {
    const s = await setup("abcdef"); t.after(() => s.dispose());
    s.editors[0].destroy();
    let sends = 0;
    s.clients[0].setPresence = value => { sends++; if (sends > 20) throw new Error("presence feedback loop"); s.net.hub.setPresence({actor: s.clients[0].actor, ...value}); };
    const editor = new Editor({element: document.body.appendChild(document.createElement("div")), extensions: [
        ...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0], presence: {name: "Alice", color: "#2274a5"}}),
    ]});
    t.after(() => editor.destroy());
    editor.commands.setTextSelection({from: 2, to: 5});
    await s.net.settle();
    assert.ok(sends > 0 && sends < 5, `presence sends: ${sends}`);
    assert.ok(s.clients[1].others.has(s.clients[0].actor));
    const beforeRemote = sends;
    s.editors[1].commands.insertContentAt(1, "remote");
    await s.net.settle();
    assert.equal(sends, beforeRemote, "remote receipt must not publish a new selection");
    s.clients[0].disconnect(); s.clients[0].connect(); await s.net.settle();
    assert.equal(sends, beforeRemote + 1, "reconnect must republish once");
    const options = editor.extensionManager.extensions.find(extension => extension.name === "docSync")!.options;
    options.presence.name = "Renamed Alice";
    s.clients[0].onUpdate?.(); await s.net.settle();
    assert.equal(sends, beforeRemote + 2, "metadata change must publish once");
    assert.equal(s.clients[1].others.get(s.clients[0].actor)!.name, "Renamed Alice");
});


test("Tiptap reports host callback errors after apply without losing document changes", async t => {
    const s = await setup(""); t.after(() => s.dispose());
    s.editors[0].destroy();
    const errors: Array<{error: Error; callback: string}> = [];
    s.clients[0].onUpdate = () => { throw new Error("host update failed"); };
    s.clients[0].onModelEvents = () => { throw new Error("host model failed"); };
    const editor = new Editor({element: document.body.appendChild(document.createElement("div")), extensions: [
        ...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0],
            onSelection() { throw new Error("host selection failed"); },
            onError(error, callback) { errors.push({error: error as Error, callback}); },
        }),
    ]});
    t.after(() => { editor.destroy(); s.clients[0].onUpdate = null; s.clients[0].onModelEvents = null; });
    assert.doesNotThrow(() => editor.commands.insertContent("X"));
    await s.net.settle();
    assert.equal(editor.getText(), "X"); assert.equal(s.editors[1].getText(), "X");
    assert.deepEqual(s.clients[0].doc.toJSON(), s.net.hub.doc.toJSON());
    assert.equal(s.clients[0].pending.length, 0);
    assert.ok(errors.some(value => value.error.message === "host selection failed"));
    assert.ok(errors.some(value => value.error.message === "host update failed"));
    s.editors[1].commands.insertContentAt(2, "B"); await s.net.settle();
    assert.equal(editor.getText(), "XB");
    assert.ok(errors.some(value => value.error.message === "host model failed"));
});

test("Tiptap selection callbacks can issue commands after apply and stop after destroy", async t => {
    const s = await setup(""); t.after(() => s.dispose());
    s.editors[0].destroy();
    let calls = 0; let reentered = false;
    const editor = new Editor({element: document.body.appendChild(document.createElement("div")), extensions: [
        ...createTiptapExtensions(s.clients[0].schema), DocSync.configure({client: s.clients[0], onSelection() {
            calls++;
            if (!reentered) { reentered = true; editor.commands.insertContent("R"); }
        }}),
    ]});
    t.after(() => editor.destroy());
    editor.commands.insertContent("A"); await s.net.settle();
    assert.equal(editor.getText(), "AR"); assert.equal(s.editors[1].getText(), "AR");
    assert.deepEqual(s.clients[0].doc.toJSON(), s.net.hub.doc.toJSON());
    assert.equal(s.clients[0].pending.length, 0);
    editor.commands.setTextSelection(1);
    editor.destroy(); const before = calls;
    await s.net.settle(); assert.equal(calls, before);
});
