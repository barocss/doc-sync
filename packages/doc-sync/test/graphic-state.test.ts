import assert from "node:assert/strict";
import {test} from "node:test";
import {Client} from "../src/client/index.ts";
import {Doc} from "../src/crdt/doc.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DocHub} from "../src/server/hub.ts";
import type {Transport} from "../src/sync/protocol.ts";
import type {TypeScriptEngineCheckpoint} from "../src/engine/contract.ts";
import {GRAPHIC_SCHEMA as schema, emptyCanvas, graphicShape as shape, graphicFrame as frame, graphicGroup as group} from "../../../fixtures/graphic-schema.ts";

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const transport: Transport = {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}};

test("public graphic Client saves an empty canvas and restores object moves with redo", () => {
    const client = new Client({schema, actor: "saved"});
    const empty = Client.fromState(json(client.captureState()), {schema});
    assert.deepEqual(empty.model(), emptyCanvas()); empty.dispose();
    client.edit([{op: "insert", at: [0], content: [frame(), group(), shape("one")]}], null);
    client.edit([{op: "move", from: [2], at: [0, 0]}]);
    client.edit([{op: "move", from: [0, 0], at: [1, 0]}]); client.undo();
    const restored = Client.fromState(json(client.captureState()), {schema});
    assert.equal(restored.actor, client.actor); assert.deepEqual(restored.model(), client.model());
    assert.deepEqual(restored.historyStatus(), client.historyStatus());
    for (const action of ["redo", "undo", "undo", "redo", "redo"] as const) {
        assert.equal(restored[action](), client[action]()); assert.deepEqual(restored.model(), client.model());
    }
    client.edit([{op: "insert", at: [0, 0], content: [shape("next")]}]);
    restored.edit([{op: "insert", at: [0, 0], content: [shape("next")]}]);
    assert.deepEqual((restored.captureState().engine as TypeScriptEngineCheckpoint).document, (client.captureState().engine as TypeScriptEngineCheckpoint).document);
    assert.deepEqual(restored.model(), client.model()); client.dispose(); restored.dispose();
});

test("graphic SyncClient state retains pending objects and undo before connection", () => {
    const source = new SyncClient("saved", transport, {schema});
    source.commit(source.doc.edit([{op: "insert", at: [0], content: [frame(), shape("offline")]}]).ops);
    const state = json(source.captureState()), restored = new SyncClient("saved", transport, {schema});
    restored.restoreState(state, "proved-epoch");
    assert.deepEqual(restored.doc.toJSON(), source.doc.toJSON()); assert.deepEqual(restored.pending, source.pending);
    restored.undo(); source.undo(); assert.deepEqual(restored.doc.toJSON(), emptyCanvas());
    assert.deepEqual(restored.doc.toJSON(), source.doc.toJSON());
    restored.redo(); source.redo(); assert.deepEqual(restored.doc.toJSON(), source.doc.toJSON());
});

test("graphic recovery reservations protect deletion and accept pending object recovery once", () => {
    const generation = crypto.randomUUID(), hub = new DocHub({schema, generation}), doc = new Doc("offline", schema);
    hub.onRecoveryPin = () => {};
    const first = {actor: "offline", seq: 1, ops: doc.edit([{op: "insert", at: [0], content: [shape("first")]}]).ops};
    hub.submit(first); assert.equal(hub.reserveRecovery(generation, "offline", "saved", null).status, "protected");
    hub.submit({actor: "offline", seq: 2, ops: doc.edit([{op: "delete", at: [0], count: 1}]).ops});
    assert.equal(hub.gc(), null); assert.deepEqual(hub.doc.toJSON(), emptyCanvas());
    const pending = {actor: "offline", seq: 3, ops: doc.edit([{op: "insert", at: [0], content: [frame()]}]).ops};
    assert.equal(hub.submitRecovery(generation, "saved", "wrong", pending).status, "unsafe");
    assert.equal(hub.submitRecovery(generation, "saved", hub.schemaVersion!, pending).status, "accepted");
    assert.equal(hub.submitRecovery(generation, "saved", hub.schemaVersion!, pending).status, "accepted");
    assert.deepEqual(hub.doc.toJSON(), {type: "canvas", children: [frame()]});
    hub.releaseRecovery(generation, "offline", "saved"); hub.gc();
    assert.deepEqual(Doc.fromSnapshot("fresh", json(hub.doc.snapshot()), schema).toJSON(), hub.doc.toJSON());
});
