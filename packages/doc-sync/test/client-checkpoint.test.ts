import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, type Schema} from "../src/index.ts";
import {SyncClient, type ClientCheckpoint, type Transport} from "../src/sync/index.ts";
import {DocHub} from "../src/server/index.ts";

const schema: Schema = {root: "content", marks: ["bold", "italic"], nodes: {
    content: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"},
}};
const transport: Transport = {subscribe: () => () => undefined, send: async () => undefined, sendPresence: () => undefined};
const client = (actor = "A") => new SyncClient(actor, transport, {schema});

test("checkpoint restores pending changes and the undo ownership graph around remote formatting", () => {
    const original = client();
    original.doc.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    for (const bold of [true, false]) {
        const ops = original.doc.edit([{op: "update", at: [0, 0], length: 2, attrs: {bold}}]).ops;
        original.commit(ops);
    }
    const peer = Doc.fromSnapshot("B", original.doc.snapshot(), schema);
    peer.edit([{op: "update", at: [0, 1], length: 1, attrs: {italic: true}}]).ops.forEach(op => original.doc.apply(op));
    const saved = JSON.parse(JSON.stringify(original.checkpoint())) as ClientCheckpoint;
    const restored = client(); restored.restoreCheckpoint(saved, "verified-epoch");
    assert.deepEqual(restored.pending, original.pending);
    assert.deepEqual(restored.doc.toJSON(), original.doc.toJSON());
    for (const action of ["undo", "undo", "redo", "redo"] as const) {
        assert.deepEqual(restored.history[action](restored.doc), original.history[action](original.doc));
        assert.deepEqual(restored.doc.toJSON(), original.doc.toJSON());
    }
    assert.deepEqual(restored.history.snapshot(), original.history.snapshot());
});

test("rejects invalid metadata before changing the destination replica", () => {
    const source = client();
    for (const text of ["a", "b"]) {
        const ops = source.doc.edit([{op: "insert", at: [0, text === "a" ? 0 : 1], content: text}]).ops;
        source.commit(ops);
    }
    const good = source.checkpoint(), target = client(), before = target.checkpoint();
    const wrongActor = structuredClone(good); wrongActor.actor = "B";
    const badSeq = structuredClone(good); badSeq.pending[1].seq += 1; badSeq.seq += 1;
    const trailingSeq = structuredClone(good); trailingSeq.seq += 1;
    const duplicate = structuredClone(good); duplicate.delSeq = [["id", 1], ["id", 1]]; duplicate.serverSeq = 1;
    const invalidHistory = structuredClone(good); invalidHistory.history.version = 2 as 1;
    for (const malformed of [wrongActor, badSeq, trailingSeq, duplicate, invalidHistory]) {
        assert.throws(() => target.restoreCheckpoint(malformed, "epoch"));
        assert.deepEqual(target.checkpoint(), before);
    }
    assert.throws(() => target.restoreCheckpoint(good, ""), /Invalid client checkpoint/);
    assert.deepEqual(target.checkpoint(), before);
});

test("restored state and exported checkpoint do not alias each other", () => {
    const source = client();
    source.commit(source.doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops);
    const saved = source.checkpoint(), restored = client(); restored.restoreCheckpoint(saved, "epoch");
    saved.pending[0].seq = 99;
    assert.equal(restored.pending[0].seq, 1);
    assert.equal(source.pending[0].seq, 1);
});

test("restored GC metadata survives a second checkpoint before a full snapshot reconnect", () => {
    const hub = new DocHub({schema});
    const subscriptions: number[] = [];
    const network: Transport = {
        subscribe: (since, listener, epoch) => {
            subscriptions.push(since);
            listener(hub.hello(since, epoch));
            return hub.listen(listener);
        },
        send: async () => undefined,
        sendPresence: () => undefined,
    };
    const original = new SyncClient("A", network, {schema});
    original.connect();
    const peer = new Doc("B", schema);
    hub.submit({actor: "B", seq: 1, ops: peer.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops});
    hub.submit({actor: "B", seq: 2, ops: peer.edit([{op: "delete", at: [0, 2], count: 1}]).ops});
    assert.equal(hub.gc()?.gc, 2);
    hub.submit({actor: "B", seq: 3, ops: peer.edit([{op: "delete", at: [0, 1], count: 1}]).ops});

    const saved = original.checkpoint();
    assert.equal(saved.serverSeq, 4);
    assert.equal(saved.gcFrontier, 2);
    assert.equal(saved.delSeq.length, 2);
    original.disconnect();

    const restored = new SyncClient("A", network, {schema});
    restored.restoreCheckpoint(saved, hub.epoch);
    const savedAgain = restored.checkpoint();
    assert.deepEqual(savedAgain, saved);
    const restarted = new SyncClient("A", network, {schema});
    restarted.restoreCheckpoint(savedAgain, hub.epoch);
    restarted.connect();
    assert.equal(subscriptions.at(-1), 0, "a restored client requests a full server snapshot");
    assert.deepEqual(restarted.doc.toJSON(), hub.doc.toJSON());
    assert.equal(restarted.serverSeq, hub.serverSeq);
    assert.equal(restarted.connectionError, null);
    restarted.disconnect();
});

test("recovery rejects a hello without a full snapshot or actor sequences before sending pending changes", () => {
    const hub = new DocHub({schema});
    const source = client();
    source.commit(source.doc.edit([{op: "insert", at: [0, 0], content: "pending"}]).ops);
    const saved = source.checkpoint();
    const hello = hub.hello(0, hub.epoch);
    assert.equal(hello.type, "hello");
    if (hello.type !== "hello") throw new Error("Expected hello");
    for (const incomplete of [{...hello, snapshot: null}, {...hello, clientSeqs: undefined}]) {
        let sends = 0;
        const network: Transport = {
            subscribe: (_since, listener) => { listener(incomplete); return () => undefined; },
            send: async () => { sends += 1; },
            sendPresence: () => undefined,
        };
        const restored = new SyncClient("A", network, {schema});
        restored.restoreCheckpoint(saved, hub.epoch);
        restored.connect();
        assert.match(restored.connectionError?.message ?? "", /complete server snapshot and actor sequences/);
        assert.equal(restored.online, false);
        assert.equal(sends, 0);
        assert.deepEqual(restored.checkpoint(), saved);
    }
});
