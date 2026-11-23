import assert from "node:assert/strict";
import {test} from "node:test";
import {createTiptapClientCompat} from "../../doc-sync-tiptap/dist/sync-client-compat.js";
import type {DocSyncOptions} from "../../doc-sync-tiptap/dist/index.js";
import {MemoryNet} from "./harness.ts";

const options = (): DocSyncOptions => ({client: null, presence: null, onSelection: null, onError: null});

test("Tiptap compatibility runs native callbacks before app microtasks and keeps replacement hooks on dispose", async t => {
    const net = new MemoryNet();
    const client = net.add("tiptap-compat-order");
    client.connect(); await net.settle(); t.after(() => client.disconnect());
    const calls: string[] = [];
    const priorModel = () => { calls.push("app-model"); };
    const priorUpdate = () => { calls.push("app-update"); };
    client.onModelEvents = priorModel;
    client.onUpdate = priorUpdate;
    const compat = createTiptapClientCompat(client, options());
    t.after(() => compat.dispose());
    compat.connect(() => calls.push("native-model"), () => calls.push("native-update"));
    client.onModelEvents?.([], {cause: "remote", fallback: false});
    client.onUpdate?.();
    assert.deepEqual(calls, ["native-model", "native-update"]);
    await Promise.resolve();
    assert.deepEqual(calls, ["native-model", "native-update", "app-model", "app-update"]);
    // Already queued app callbacks stop after detach. New app hooks remain installed.
    client.onUpdate?.();
    const replacement = () => { calls.push("replacement"); };
    client.onUpdate = replacement;
    compat.dispose();
    await Promise.resolve();
    assert.equal(calls.filter(value => value === "app-update").length, 1);
    assert.equal(client.onUpdate, replacement);
    assert.equal(client.onModelEvents, priorModel);
});

test("Tiptap compatibility records presence before synchronous transport re-entry and cancels queued selections", async t => {
    const net = new MemoryNet();
    const client = net.add("tiptap-compat-reentry");
    client.connect(); await net.settle(); t.after(() => client.disconnect());
    const settings = options();
    settings.presence = {name: "Peer", color: "blue"};
    let sends = 0, selections = 0;
    settings.onSelection = () => { selections++; };
    const compat = createTiptapClientCompat(client, settings);
    t.after(() => compat.dispose());
    compat.connect(() => undefined, () => compat.publishIfNeeded());
    client.setPresence = () => { sends++; client.onUpdate?.(); };
    compat.selection(null, null, true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(sends, 1);
    assert.equal(selections, 1);
    compat.selection("queued", null, true);
    compat.dispose();
    await Promise.resolve();
    assert.equal(sends, 1);
    assert.equal(selections, 1);
});
