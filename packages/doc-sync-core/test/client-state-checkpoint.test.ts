import assert from "node:assert/strict";
import {test} from "node:test";
import {SyncClient} from "../src/sync/client.ts";
import type {ClientEngineFactory} from "../src/engine/client-contract.ts";
import type {EngineCheckpoint} from "../src/engine/contract.ts";
import {typescriptClientEngineFactory} from "../src/engine/index.ts";
import {DocHub} from "../src/server/hub.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {Transport, ServerEvent} from "../src/sync/protocol.ts";
const schema: Schema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}};
const transport: Transport = {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}};
const factory: ClientEngineFactory = {...typescriptClientEngineFactory, engine: "opaque-test", create(actor, schema) {
    const base = typescriptClientEngineFactory.create(actor, schema);
    const identity = () => ({...base.identity(), engine: "opaque-test"});
    return new Proxy(base, {get(target, key) {
        if (String(key).toLowerCase().includes("typescript")) return undefined;
        if (key === "identity") return identity;
        if (key === "checkpoint") return (): EngineCheckpoint => ({format: "opaque-test-v1", identity: identity(), revision: base.stamp().revision, document: {payload: base.checkpoint()}, history: null});
        if (key === "prepareCheckpoint") return (value: EngineCheckpoint) => {
            assert.equal(value.format, "opaque-test-v1"); assert.equal(value.identity.engine, "opaque-test");
            return base.prepareCheckpoint((value.document as {payload: EngineCheckpoint}).payload);
        };
        const member = Reflect.get(target, key, target); return typeof member === "function" ? member.bind(target) : member;
    }});
}};

test("format 2 captures one opaque selected payload and restores without TS compatibility", () => {
    const source = new SyncClient("A", transport, {schema, engineFactory: factory});
    source.commit(source.engine.apply([{op: "insert", at: [0, 0], content: "opaque"}]));
    const state = source.captureState(); assert.equal(state.format, 2); assert.equal("snapshot" in state, false); assert.equal("history" in state, false);
    assert.equal(state.engine.format, "opaque-test-v1"); assert.throws(() => source.doc, /compatibility/); assert.throws(() => source.checkpoint(), /TypeScript/);
    const restored = new SyncClient("A", transport, {schema, engineFactory: factory});
    restored.restoreState(state, "proved-epoch"); assert.deepEqual(restored.engine.model(), source.engine.model());
    assert.deepEqual(restored.pending, source.pending); assert.deepEqual(restored.engine.historyStatus(), source.engine.historyStatus());
    const settled = new SyncClient("A", transport, {schema, engineFactory: factory}), before = settled.captureState(), stamp = settled.engine.stamp();
    const incompatible = structuredClone(state); incompatible.engine.identity.engine = "foreign";
    assert.throws(() => settled.restoreState(incompatible, "proved-epoch")); assert.deepEqual(settled.captureState(), before); assert.deepEqual(settled.engine.stamp(), stamp);
    const malformed = structuredClone(state); malformed.pending[0].seq = 99;
    assert.throws(() => settled.restoreState(malformed, "proved-epoch")); assert.deepEqual(settled.captureState(), before);
});

test("invalid remote batches preserve transport cursor deletion ledger and selected state", () => {
    const hub = new DocHub({schema}); let receive: (event: ServerEvent) => void = () => {};
    const client = new SyncClient("A", {...transport, subscribe: (_since, listener) => { receive = listener; listener(hub.hello(0)); return () => {}; }}, {schema});
    client.connect(); client.onModelEvents = () => {};
    const before = client.captureState(), stamp = client.engine.stamp();
    assert.throws(() => receive({type: "change", envelope: {serverSeq: client.serverSeq + 1, change: {actor: "B", seq: 1, ops: [
        {t: "text", id: {actor: "B", lamport: 1}, origin: {actor: "~root", lamport: 0}, text: "valid-first"},
        {t: "del", at: {actor: "B", lamport: 20}, ids: [{actor: "missing", lamport: 999}]},
    ]}}}));
    assert.deepEqual(client.captureState(), before); assert.deepEqual(client.engine.stamp(), stamp); client.disconnect();
});

test("accepted conditional edits retain lifecycle guards during legacy listener reentry", async () => {
    const hub = new DocHub({schema});
    const client = new SyncClient("A", {...transport, subscribe: (_since, listener) => { listener(hub.hello(0)); return () => {}; }}, {schema});
    client.connect(); let guards = 0, blocked = 0; const prior = client.doc.editGuard;
    client.doc.editGuard = () => { guards++; prior?.(); };
    client.onLocalEdits = () => {
        assert.throws(() => client.doc.edit([{op: "insert", at: [0, 0], content: "reentrant"}]), /conditional/); blocked++;
    };
    const reply = await client.conditionalEdit({epoch: client.epoch!, serverSeq: client.serverSeq, schemaVersion: client.engine.identity().schemaVersion},
        [{op: "insert", at: [0, 0], content: "accepted"}], async () => ({status: "accepted", serverSeq: 1}));
    assert.equal(reply.status, "accepted"); assert.equal(blocked, 1); assert.equal(guards, 1);
    assert.equal(client.engine.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join(""), "accepted"); client.disconnect();
});

test("raw legacy document edits honor lifecycle guards from first construction", async () => {
    const client = new SyncClient("A", transport, {schema});
    const pause = client.pauseLocalMutations(), before = client.captureState();
    assert.throws(() => client.doc.edit([{op: "insert", at: [0, 0], content: "paused"}]), /paused/);
    assert.deepEqual(client.captureState(), before); pause();
    const hub = new DocHub({schema});
    const connected = new SyncClient("A", {...transport, subscribe: (_since, listener) => { listener(hub.hello(0)); return () => {}; }}, {schema});
    connected.connect(); await connected.conditionalEdit({epoch: connected.epoch!, serverSeq: 0, schemaVersion: connected.engine.identity().schemaVersion},
        [{op: "insert", at: [0, 0], content: "uncertain"}], async () => { throw new Error("lost reply"); });
    const state = connected.engine.checkpoint();
    assert.throws(() => connected.doc.edit([{op: "insert", at: [0, 0], content: "blocked"}]), /conditional/);
    assert.deepEqual(connected.engine.checkpoint(), state); connected.disconnect();
});
