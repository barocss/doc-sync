import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {upgradeOpenEditorSchema} from "../src/editor/schema-transition.ts";
import type {OpenEditorSchemaHost} from "../src/editor/schema-transition.ts";
import type {ModelRange} from "../src/editor/index.ts";
import {MemoryNet} from "./harness.ts";

function extended() {
    const next = structuredClone(DEMO_SCHEMA);
    next.marks = [...next.marks, "highlight"];
    return next;
}
function host(range: ModelRange | null) {
    const events: string[] = [];
    let restored: ModelRange | null = null;
    const adapter: OpenEditorSchemaHost<string> = {
        pause() { events.push("pause"); }, selection() { return range; },
        prepare(_schema, model) { events.push("prepare"); assert.ok(model); return "prepared"; },
        detach() { events.push("detach"); },
        install(value, selection) { assert.equal(value, "prepared"); restored = selection; events.push("install"); },
        resume() { events.push("resume"); },
    };
    return {adapter, events, restored: () => restored};
}

test("open editor upgrades with a backward selection and pending change while retaining remote edits and history", async () => {
    const net = new MemoryNet(), a = net.add("a"), b = net.add("b");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "abcd"}]).ops); await net.settle();
    a.disconnect();
    a.commit(a.doc.edit([{op: "insert", at: [0, 4], content: "X"}]).ops);
    const pending = structuredClone(a.pending), history = a.history;
    b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops); await net.settle();
    const next = extended(); net.hub.transitionSchema(next, {epoch: net.hub.epoch, serverSeq: net.hub.serverSeq, schemaVersion: net.hub.schemaVersion!});
    const view = host({anchor: [0, 4], focus: [0, 1]});
    const priorEvent = () => {}; a.onEvent = priorEvent;
    const transition = upgradeOpenEditorSchema(a, next, view.adapter);
    assert.deepEqual(a.pending, pending); assert.equal(a.history, history);
    assert.deepEqual(view.restored(), {anchor: [0, 4], focus: [0, 1]});
    assert.deepEqual(view.events, ["pause", "prepare", "detach", "install"]);
    await net.settle(); await transition; await net.settle();
    assert.deepEqual(view.events, ["pause", "prepare", "detach", "install", "resume"]);
    assert.equal(a.pending.length, 0);
    assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
    assert.equal(a.history, history);
    assert.equal(a.onEvent, priorEvent);
    a.undo(); await net.settle();
    const text = a.doc.toJSON().children![0].runs!.map(run => "text" in run ? run.text : "").join("");
    assert.equal(text, "Rabcd");
});

test("incompatible schemas and failed preparation leave the old editor and client intact", () => {
    const net = new MemoryNet(), a = net.add("a"), view = host(null), oldDoc = a.doc;
    const invalid = structuredClone(DEMO_SCHEMA); invalid.marks = [];
    return assert.rejects(upgradeOpenEditorSchema(a, invalid, view.adapter), /Incompatible schema/).then(async () => {
        assert.deepEqual(view.events, []);
        view.adapter.prepare = () => { throw new Error("native build failed"); };
        await assert.rejects(upgradeOpenEditorSchema(a, extended(), view.adapter), /native build failed/);
        assert.deepEqual(view.events, ["pause", "resume"]);
        assert.equal(a.doc, oldDoc);
    });
});

test("installation failure leaves input paused and preserves the pending change", async () => {
    const net = new MemoryNet(), a = net.add("a"), view = host(null);
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "pending"}]).ops);
    const pending = structuredClone(a.pending);
    view.adapter.install = () => { throw new Error("mount failed"); };
    await assert.rejects(upgradeOpenEditorSchema(a, extended(), view.adapter), /mount failed/);
    assert.deepEqual(a.pending, pending);
    assert.deepEqual(view.events, ["pause", "prepare", "detach"]);
    assert.equal(a.online, false);
});

test("unresolvable selection is rejected before the mounted editor is detached", async () => {
    const net = new MemoryNet(), a = net.add("a"), view = host({anchor: [42, 1], focus: [42, 1]});
    const doc = a.doc;
    await assert.rejects(upgradeOpenEditorSchema(a, extended(), view.adapter), /selection/);
    assert.equal(a.doc, doc);
    assert.deepEqual(view.events, ["pause", "resume"]);
});

test("active composition can refuse the transition without cancelling its draft", async () => {
    const net = new MemoryNet(), a = net.add("a"), view = host(null);
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "pending"}]).ops);
    const pending = structuredClone(a.pending), doc = a.doc;
    view.adapter.pause = () => { throw new Error("finish composition first"); };
    await assert.rejects(upgradeOpenEditorSchema(a, extended(), view.adapter), /finish composition/);
    assert.deepEqual(a.pending, pending);
    assert.equal(a.doc, doc);
    assert.deepEqual(view.events, []);
});

test("reconnect timeout keeps the editor paused and preserves pending edits; concurrent upgrades are rejected", async () => {
    const net = new MemoryNet(), a = net.add("a"), view = host(null);
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "pending"}]).ops);
    const pending = structuredClone(a.pending);
    const next = extended();
    net.hub.transitionSchema(next, {epoch: net.hub.epoch, serverSeq: net.hub.serverSeq, schemaVersion: net.hub.schemaVersion!});
    const first = upgradeOpenEditorSchema(a, next, view.adapter, 30);
    await assert.rejects(upgradeOpenEditorSchema(a, extended(), host(null).adapter), /already in progress/);
    await assert.rejects(first, /timed out/);
    assert.deepEqual(a.pending, pending);
    assert.equal(a.online, false);
    assert.deepEqual(view.events, ["pause", "prepare", "detach", "install"]);
    const retry = upgradeOpenEditorSchema(a, next, view.adapter);
    await net.settle(); await retry; await net.settle();
    assert.equal(a.pending.length, 0);
    assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
    assert.equal(view.events.at(-1), "resume");
});

test("another server schema change during native installation leaves pending work paused", async () => {
    const net = new MemoryNet(), a = net.add("a"), view = host(null), next = extended();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "pending"}]).ops);
    const pending = structuredClone(a.pending);
    net.hub.transitionSchema(next, {epoch: net.hub.epoch, serverSeq: net.hub.serverSeq, schemaVersion: net.hub.schemaVersion!});
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    view.adapter.install = async () => { view.events.push("install"); await gate; };
    const transition = upgradeOpenEditorSchema(a, next, view.adapter);
    const rejected = assert.rejects(transition, /schema/i);
    const newer = structuredClone(next); newer.marks = [...newer.marks, "later"];
    net.hub.transitionSchema(newer, {epoch: net.hub.epoch, serverSeq: net.hub.serverSeq, schemaVersion: net.hub.schemaVersion!});
    release(); await net.settle(); await rejected;
    assert.deepEqual(a.pending, pending);
    assert.equal(a.online, false);
    assert.deepEqual(view.events, ["pause", "prepare", "detach", "install"]);
});

test("a server reset during installation cannot silently discard settled history", async () => {
    const net = new MemoryNet(), a = net.add("a"), view = host(null), next = extended();
    a.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "history"}]).ops); await net.settle();
    const model = a.doc.toJSON(), history = a.history.snapshot();
    net.hub.transitionSchema(next, {epoch: net.hub.epoch, serverSeq: net.hub.serverSeq, schemaVersion: net.hub.schemaVersion!});
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    view.adapter.install = async () => { view.events.push("install"); await gate; };
    a.onEvent = () => { throw new Error("application listener failed"); };
    const transition = upgradeOpenEditorSchema(a, next, view.adapter);
    const rejected = assert.rejects(transition, /epoch changed/);
    net.hub.reset(); release(); await net.settle(); await rejected;
    assert.deepEqual(a.doc.toJSON(), model);
    assert.deepEqual(a.history.snapshot(), history);
    assert.equal(a.online, false);
    assert.deepEqual(view.events, ["pause", "prepare", "detach", "install"]);
});
