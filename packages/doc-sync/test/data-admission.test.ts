import {Client} from "../src/client/index.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {SharedMap} from "../src/data/index.ts";
import {createDataHub} from "../src/server/index.ts";
import {Doc} from "../src/crdt/doc.ts";
import {createDataSchema} from "../src/data/schema.ts";
import {schemaVersion} from "../src/crdt/schema-version.ts";
import type {Change} from "../src/sync/protocol.ts";

const id = (n: number) => `data:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("a rejected mixed batch leaves document, log, sequence, receipt, append and broadcast unchanged", () => {
    const hub = createDataHub({generation: "generation"}), source = new Doc("A", createDataSchema());
    const ops = source.edit([{op: "insert", at: [0], content: [
        {type: "entry", attrs: {id: id(1), key: "first", value: {scalar: 1}}},
        {type: "entry", attrs: {id: id(2), key: "second", value: {scalar: 2}}},
    ]}]).ops;
    const change: Change = {actor: "A", seq: 1, ops}, invalid = structuredClone(change);
    const bad = [...invalid.ops].reverse().find(op => op.t === "node")!;
    if (bad.t === "node") bad.attrs!.value = {scalar: {bad: true}};
    let appended = 0, broadcast = 0;
    hub.onAppend = () => { appended++; }; hub.listen(() => { broadcast++; });
    const before = hub.doc.snapshot();
    assert.throws(() => hub.submit(invalid), /Data:/);
    assert.deepEqual(hub.doc.snapshot(), before); assert.equal(hub.serverSeq, 0); assert.deepEqual(hub.log, []);
    assert.equal(appended, 0); assert.equal(broadcast, 0);
    assert.equal(hub.findChangeReceipt("generation", invalid).status, "unknown");
    assert.equal(hub.submit(change)!.serverSeq, 1);
    assert.equal(hub.submit(change), null);
    assert.equal(appended, 1); assert.equal(broadcast, 1);
});

test("hidden reference handles preserve root reads and local observer reads through deletion and undo", () => {
    const data = new Client({schema: createDataSchema()}), child = data.data.createMap(); child.set("value", 1); data.data.root.set("child", child); data.data.root.set("other", 2);
    let reads = 0;
    const stop = data.subscribe({update: () => { assert.equal(data.data.root.get("other"), 2); assert.ok(data.data.root.get("child") instanceof SharedMap); reads++; }});
    data.edit([{op: "delete", at: [0], count: 1}]);
    assert.equal((data.data.root.get("child") as SharedMap).id, child.id);
    assert.throws(() => child.set("value", 2), /not visible/);
    assert.equal(data.data.root.get("other"), 2); assert.ok(reads > 0); assert.deepEqual(data.notificationErrors, []);
    data.undo(); assert.equal(child.get("value"), 1); assert.equal(data.data.root.get("other"), 2);
    stop(); data.dispose();
});

test("conditional and recovery retry paths reject accessors before inspecting accepted payloads", () => {
    const hub = createDataHub({generation: "generation"}), doc = new Doc("A", createDataSchema());
    const change: Change = {actor: "A", seq: 1, ops: doc.edit([{op: "insert", at: [0], content: [{type: "entry", attrs: {id: id(1), key: "x", value: {scalar: 1}}}]}]).ops};
    const base = {epoch: hub.epoch, serverSeq: 0, schemaVersion: hub.schemaVersion};
    hub.submitConditional(change, base);
    let reads = 0;
    const hostile = structuredClone(change);
    Object.defineProperty(hostile, "ops", {enumerable: true, get() { reads++; return change.ops; }});
    assert.throws(() => hub.submit(hostile), /Data:/);
    assert.throws(() => hub.submitConditional(hostile, base), /Data:/);
    assert.throws(() => hub.submitRecovery("generation", "reservation", hub.schemaVersion, hostile), /Data:/);
    assert.throws(() => hub.settleConditional("generation", base, hostile), /Data:/);
    assert.throws(() => hub.findConditionalReceipt("generation", base, hostile), /Data:/);
    assert.throws(() => hub.findChangeReceipt("generation", hostile), /Data:/);
    assert.equal(reads, 0); assert.equal(hub.serverSeq, 1);
    assert.equal(hub.submitConditional(change, base).serverSeq, 1);
});

test("extracting the fixed storage schema preserves the existing client fingerprint", () => {
    assert.equal(schemaVersion(createDataSchema()), "sha256:96b65879a3d426ab2aeeeb7e60b02e207ba5bfb66e9b211f14b2707be972f23f");
});

test("guarded direct admission rejects malformed actors and sequences without consuming a retry", () => {
    const hub = createDataHub(), source = new Doc("A", createDataSchema());
    const request: Change = {actor: "A", seq: 1, ops: source.edit([{op: "insert", at: [0], content: [{type: "entry", attrs: {id: id(1), key: "x", value: {scalar: 1}}}]}]).ops};
    const before = hub.doc.snapshot(); let appended = 0;
    hub.onAppend = () => { appended++; };
    for (const actor of [{}, [], null, "", "~root", "bad actor", 1]) {
        assert.throws(() => hub.submit({...request, actor} as Change), /Data:/);
    }
    for (const seq of [0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => hub.submit({...request, seq} as Change), /Data:/);
    }
    assert.deepEqual(hub.doc.snapshot(), before); assert.equal(hub.serverSeq, 0); assert.equal(appended, 0);
    assert.equal(hub.submit(request)!.serverSeq, 1); assert.equal(appended, 1);
});
