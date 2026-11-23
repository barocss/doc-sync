import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import type {Schema} from "../src/crdt/schema.ts";
import {DocHub} from "../src/server/hub.ts";
import {SyncClient} from "../src/sync/client.ts";
import type {Change, Transport} from "../src/sync/protocol.ts";

const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"},
}};
const network = (hub: DocHub): Transport => ({
    subscribe: (_since, receive) => { receive(hub.hello(0)); return hub.listen(receive); },
    send: async () => {}, sendPresence: () => {},
});
function server() {
    const hub = new DocHub({schema}), peer = new Doc("peer", schema);
    hub.submit({actor: "peer", seq: 1, ops: peer.edit([{op: "insert", at: [0, 0], content: "seed"}]).ops});
    return hub;
}

test("same-epoch protected checkpoint retains the allocation floor through complete hello adoption", async () => {
    const hub = server(), transport = network(hub), original = new SyncClient("a", transport, {schema});
    original.connect(); original.disconnect();
    const checkpoint = original.checkpoint();
    assert.equal(checkpoint.snapshot.lamport, 4);
    // Retired candidate identities 5..11 remain allocated without entering the document.
    checkpoint.snapshot.lamport = 11;
    const restored = new SyncClient("a", transport, {schema});
    restored.restoreCheckpoint(checkpoint, hub.epoch);
    const release = restored.protectRecoveryHistory();
    const before = restored.checkpoint(), content = restored.doc.toJSON();
    restored.connect();
    assert.equal(restored.synchronized, true);
    assert.equal(restored.doc.clock.lamport, 11);
    assert.deepEqual(restored.doc.toJSON(), content);
    assert.deepEqual(restored.checkpoint().history, before.history);
    assert.equal(restored.checkpoint().seq, before.seq);
    assert.deepEqual(restored.pending, []);
    let submitted: Change | undefined;
    await restored.conditionalEdit({epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion},
        [{op: "insert", at: [0, 0], content: "new"}], async (_base, change) => {
            submitted = change;
            return {status: "rejected", code: "stale", error: "test stops before submit"};
        });
    assert.equal(submitted?.seq, 1, "retirement does not consume the actor sequence");
    assert.ok(submitted?.ops.length);
    for (const op of submitted!.ops) {
        if ("id" in op) assert.ok(op.id.lamport > 11, "new identity must exceed every retired identity");
        if ("at" in op && ["del", "restore", "mark", "attr"].includes(op.t)) assert.ok(op.at.lamport > 11);
    }
    restored.disconnect(); release();
    const next = new SyncClient("a", transport, {schema});
    next.restoreCheckpoint(restored.checkpoint(), hub.epoch); next.connect();
    assert.ok(next.doc.clock.lamport >= 11, "the allocation floor survives another checkpoint and hello");
    next.disconnect();
});

test("a proven same-generation epoch resume retains the checkpoint allocation floor", () => {
    const hub = server(), transport = network(hub), restored = new SyncClient("a", transport, {schema});
    const checkpoint = restored.checkpoint(); checkpoint.snapshot.lamport = 30;
    restored.restoreCheckpoint(checkpoint, "old-process-epoch");
    restored.resumeProvenEpoch(restored.checkpoint(), "old-process-epoch", hub.epoch);
    restored.connect();
    assert.equal(restored.synchronized, true);
    assert.equal(restored.doc.clock.lamport, 30);
    restored.disconnect();
});

test("an unprotected different-epoch replacement keeps reset behavior", () => {
    const hub = server(), restored = new SyncClient("a", network(hub), {schema});
    const checkpoint = restored.checkpoint(); checkpoint.snapshot.lamport = 30;
    restored.restoreCheckpoint(checkpoint, "old-generation-epoch");
    restored.connect();
    assert.equal(restored.synchronized, true);
    assert.equal(restored.doc.clock.lamport, hub.doc.clock.lamport);
    assert.equal(restored.checkpoint().seq, 0);
    restored.disconnect();
});
