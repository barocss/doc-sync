import assert from "node:assert/strict";
import {after, test} from "node:test";
import {JSDOM} from "jsdom";
import {Editor} from "@tiptap/core";
import {Client} from "@barocss/doc-sync-core/client";
import {LocalClient} from "@barocss/doc-sync-core/local";
import {DocSync, createTiptapExtensions} from "@barocss/doc-sync/tiptap";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";
import type {BindingClient} from "@barocss/doc-sync-core/client";
import type {Transport} from "@barocss/doc-sync-core/sync";
import type {DocSyncOptions} from "@barocss/doc-sync/tiptap";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {pretendToBeVisual: true});
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "DOMParser", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    Object.defineProperty(globalThis, name, {value: (dom.window as any)[name], configurable: true, writable: true});
}
after(() => dom.window.close());
const mount = (client: BindingClient, options: Partial<DocSyncOptions> = {}) => new Editor({
    element: document.body.appendChild(document.createElement("div")),
    content: "must not replace model",
    extensions: [...createTiptapExtensions(client.schema), DocSync.configure({client, ...options})],
});

for (const raw of [false, true]) test(`Tiptap ${raw ? "LocalClient" : "Client without transport"} shares two views and history`, async t => {
    const client = raw ? new LocalClient({schema: DEMO_SCHEMA, actor: "tiptap-local-raw"}) : new Client({schema: DEMO_SCHEMA, actor: "tiptap-local"});
    const editors = [mount(client), mount(client)];
    t.after(() => { editors.forEach(editor => editor.destroy()); client.dispose(); });
    const before = client.stamp();
    assert.equal(editors[0].getText(), "");
    assert.equal(editors[0].can().docSyncUndo(), false);
    editors[0].commands.insertContent("abcdef");
    assert.equal(editors[1].getText(), "abcdef");
    assert.equal(client.stamp().revision, before.revision + 1, "receiving view must not write the model again");
    editors[1].commands.setTextSelection({from: 3, to: 6});
    const focused = document.activeElement;
    client.edit([{op: "insert", at: [0, 1], content: "😀"}]);
    assert.equal(editors[0].getText(), "a😀bcdef");
    assert.equal(editors[1].getText(), "a😀bcdef");
    assert.equal(editors[1].state.selection.from, 5);
    assert.equal(editors[1].state.selection.to, 8);
    assert.equal(document.activeElement, focused);
    editors[1].commands.docSyncUndo();
    assert.equal(editors[0].getText(), "abcdef");
    editors[0].commands.docSyncRedo();
    assert.equal(editors[1].getText(), "a😀bcdef");
    editors[0].destroy();
    editors[1].commands.insertContentAt(1, "X");
    const replacement = mount(client); editors.push(replacement);
    assert.equal(replacement.getText(), editors[1].getText());
    assert.equal(client.notificationErrors.length, 0);
    if (client instanceof Client) {
        assert.deepEqual(client.status(), {online: false, synchronized: false});
        assert.deepEqual(client.capabilities, {sync: false, presence: false});
        assert.equal(client.sync, null);
    }
});

test("Tiptap local selection callbacks run after apply, report errors, and stop after destruction", async t => {
    const client = new Client({schema: DEMO_SCHEMA});
    let calls = 0; let sent = 0;
    const errors: string[] = [];
    client.setPresence = () => { sent++; };
    const editor = mount(client, {presence: {name: "Local", color: "#123456"}, onSelection() {
        calls++;
        assert.equal(editor.getText(), "A");
        throw new Error("selection failed");
    }, onError(error, callback) { errors.push(`${callback}: ${(error as Error).message}`); }});
    t.after(() => { editor.destroy(); client.dispose(); });
    editor.commands.insertContent("A");
    assert.equal(calls, 0);
    await Promise.resolve();
    assert.ok(calls > 0);
    assert.deepEqual(errors, ["onSelection: selection failed"]);
    assert.equal(sent, 0);
    editor.commands.setTextSelection(1);
    editor.destroy(); const before = calls;
    await Promise.resolve();
    assert.equal(calls, before);
});

test("Tiptap unified sync client retains legacy ownership, callbacks, and reconnect behavior", async t => {
    const net = new MemoryNet();
    const relay = net.add("tiptap-unified");
    const remote = net.add("tiptap-remote");
    // Use the harness transport with the public Client constructor.
    const client = new Client({schema: net.schema, actor: relay.actor, transport: Reflect.get(relay, "transport") as Transport});
    client.connect(); remote.connect(); await net.settle();
    const sync = client.sync!;
    let updates = 0;
    const priorUpdate = () => { updates++; throw new Error("application callback failed"); };
    sync.onUpdate = priorUpdate;
    const errors: string[] = [];
    const editor = mount(client, {onError(_error, callback) { errors.push(callback); }});
    const other = mount(remote);
    t.after(() => { editor.destroy(); other.destroy(); sync.onUpdate = null; client.clearHistory(); client.dispose(); remote.disconnect(); });
    const hook = sync.onUpdate;
    assert.throws(() => mount(sync), /already has/);
    assert.equal(sync.onUpdate, hook);
    editor.commands.insertContent("A"); await net.settle();
    assert.equal(other.getText(), "A");
    assert.equal(sync.pending.length, 0);
    other.commands.insertContentAt(2, "B"); await net.settle();
    assert.equal(editor.getText(), "AB");
    client.disconnect();
    other.commands.insertContentAt(3, "C"); await net.settle();
    client.connect(); await net.settle();
    assert.equal(editor.getText(), "ABC");
    assert.ok(updates > 0); assert.ok(errors.includes("onUpdate"));
    editor.destroy();
    assert.equal(sync.onUpdate, priorUpdate);
    sync.onUpdate = null;
    const replacement = mount(client);
    assert.equal(replacement.getText(), "ABC"); replacement.destroy();
});

for (const subscribeFirst of [false, true]) for (const destroyFirst of [false, true]) test(`Tiptap callback lifecycle: subscribe ${subscribeFirst ? 'before' : 'after'} mount, destroy ${destroyFirst ? 'before' : 'after'} unsubscribe`, async t => {
    const net = new MemoryNet();
    const relay = net.add(`lifecycle-${Number(subscribeFirst)}-${Number(destroyFirst)}`), remote = net.add('lifecycle-remote');
    const client = new Client({schema: net.schema, actor: relay.actor, transport: Reflect.get(relay, 'transport') as Transport, syncOptions: {ackDelay: 0}});
    client.connect(); remote.connect(); await net.settle();
    const sync = client.sync!;
    let updates = 0, models = 0, selections = 0, observerUpdates = 0, observerModels = 0;
    const observer = {update() { observerUpdates++; }, modelEvents() { observerModels++; }};
    const priorUpdate = () => { updates++; }, priorModel = () => { models++; };
    sync.onUpdate = priorUpdate; sync.onModelEvents = priorModel;
    let release = () => {};
    if (subscribeFirst) release = client.subscribe(observer);
    const editor = mount(client, {onSelection() { selections++; }});
    if (!subscribeFirst) release = client.subscribe(observer);
    t.after(() => { editor.destroy(); release(); sync.onUpdate = null; sync.onModelEvents = null; client.clearHistory(); client.dispose(); remote.disconnect(); });
    if (destroyFirst) {
        editor.commands.setTextSelection(1);
        editor.destroy();
        const priorSelections = selections;
        remote.commit(remote.engine.apply([{op: 'insert', at: [0, 0], content: 'foreign'}]));
        const beforeUpdates = updates, beforeModels = models;
        await net.settle();
        assert.ok(updates > beforeUpdates, 'application update callback survives while the other subscription remains');
        assert.ok(models > beforeModels, 'application model callback survives while the other subscription remains');
        assert.equal(selections, priorSelections, 'queued editor-owned callbacks remain cancelled');
        release();
    } else {
        release();
        editor.destroy();
    }
    assert.equal(sync.onUpdate, priorUpdate, 'final update callback identity is restored');
    assert.equal(sync.onModelEvents, priorModel, 'final model callback identity is restored');
    const stoppedUpdates = observerUpdates, stoppedModels = observerModels;
    remote.commit(remote.engine.apply([{op: 'insert', at: [0, 0], content: 'after'}])); await net.settle();
    assert.equal(observerUpdates, stoppedUpdates); assert.equal(observerModels, stoppedModels);
});


for (const subscribeFirst of [false, true]) test(`Tiptap and Client subscriptions retain unrelated replacement hooks (${subscribeFirst ? 'subscribe first' : 'mount first'})`, async t => {
    const net = new MemoryNet(), relay = net.add('replacement-client');
    const client = new Client({schema: net.schema, actor: relay.actor, transport: Reflect.get(relay, 'transport') as Transport});
    client.connect(); await net.settle();
    let release = () => {};
    if (subscribeFirst) release = client.subscribe({update() {}});
    const editor = mount(client);
    if (!subscribeFirst) release = client.subscribe({update() {}});
    const sync = client.sync!, replacementUpdate = () => {}, replacementModel = () => {};
    sync.onUpdate = replacementUpdate; sync.onModelEvents = replacementModel;
    t.after(() => { editor.destroy(); release(); sync.onUpdate = null; sync.onModelEvents = null; client.clearHistory(); client.dispose(); });
    editor.destroy();
    assert.equal(sync.onUpdate, replacementUpdate); assert.equal(sync.onModelEvents, replacementModel);
    release();
    assert.equal(sync.onUpdate, replacementUpdate); assert.equal(sync.onModelEvents, replacementModel);
});
