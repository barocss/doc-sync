import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {DocHub} from "../src/server/hub.ts";
import {prepareDurableMutation} from "../src/server/staged.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

function durableHub() {
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    hub.onAppend = () => undefined; hub.onRecoveryPin = () => undefined; hub.onSchemaChange = () => undefined;
    return hub;
}

test("staged conditional edit remains invisible until its exact record commits", () => {
    const hub = durableHub(), author = new Doc("a", DEMO_SCHEMA);
    const change = {actor: "a", seq: 1, ops: author.edit([{op: "insert", at: [0, 0], content: "A"}]).ops};
    const base = {epoch: hub.epoch, serverSeq: 0, schemaVersion: hub.schemaVersion};
    const events: unknown[] = []; hub.listen(event => events.push(event));
    const stage = prepareDurableMutation(hub, () => hub.submitConditional(change, base));
    assert.equal(stage.status, "write");
    if (stage.status !== "write") return;
    assert.equal(hub.serverSeq, 0); assert.equal(events.length, 0);
    assert.deepEqual(hub.findConditionalReceipt(hub.generation!, base, change), {status: "unknown"});
    assert.equal(Object.isFrozen(stage.record), true);
    assert.equal(stage.commit().serverSeq, 1);
    assert.equal(events.length, 1);
    assert.equal(hub.findConditionalReceipt(hub.generation!, base, change).status, "accepted");
    assert.throws(() => stage.commit(), /already committed/);
});

test("GC does not compact before its record is accepted by durable storage", () => {
    const hub = durableHub(), author = new Doc("a", DEMO_SCHEMA);
    hub.submit({actor: "a", seq: 1, ops: author.edit([{op: "insert", at: [0, 0], content: "X"}]).ops});
    hub.submit({actor: "a", seq: 2, ops: author.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    const before = JSON.stringify(hub.doc.snapshot()), seq = hub.serverSeq;
    hub.onAppend = () => { throw new Error("storage failed"); };
    assert.throws(() => hub.gc(), /storage failed/);
    assert.equal(hub.serverSeq, seq); assert.equal(JSON.stringify(hub.doc.snapshot()), before);
    hub.onAppend = () => undefined;
    const stage = prepareDurableMutation(hub, () => hub.gc());
    assert.equal(stage.status, "write");
    if (stage.status !== "write") return;
    assert.deepEqual(stage.record, {gc: 2});
    assert.equal(hub.serverSeq, seq); assert.equal(JSON.stringify(hub.doc.snapshot()), before);
    assert.equal(stage.commit()?.gc, 2); assert.equal(hub.serverSeq, seq + 1);
});

test("a staged reservation does not protect GC before commit and rejects changed state", () => {
    const hub = durableHub(), author = new Doc("a", DEMO_SCHEMA), generation = hub.generation!;
    const stage = prepareDurableMutation(hub, () => hub.reserveRecovery(generation, "a", "one", null));
    assert.equal(stage.status, "write");
    if (stage.status !== "write") return;
    assert.equal(hub.frontier(), 0);
    hub.submit({actor: "a", seq: 1, ops: author.edit([{op: "insert", at: [0, 0], content: "X"}]).ops});
    assert.throws(() => stage.commit(), /changed before commit/);
    assert.equal(hub.reserveRecovery(generation, "a", "one", null, true).status, "unsafe");
});

test("a listener can persist a reentrant change after the staged record commits", () => {
    const hub = durableHub(), first = new Doc("a", DEMO_SCHEMA), second = new Doc("b", DEMO_SCHEMA);
    const persisted: string[] = [];
    hub.onAppend = envelope => { persisted.push(envelope.change?.actor ?? "gc"); };
    hub.listen(event => {
        if (event.type === "change" && event.envelope.change?.actor === "a") {
            const change = {actor: "b", seq: 1, ops: second.edit([{op: "insert", at: [0, 0], content: "B"}]).ops};
            hub.submit(change);
        }
    });
    const change = {actor: "a", seq: 1, ops: first.edit([{op: "insert", at: [0, 0], content: "A"}]).ops};
    const stage = prepareDurableMutation(hub, () => hub.submit(change));
    assert.equal(stage.status, "write");
    if (stage.status !== "write") return;
    stage.commit();
    assert.equal(hub.serverSeq, 2);
    assert.deepEqual(persisted, ["b"]); // The caller already persisted the staged record.
});

test("GC lease expiry between preparation and commit rejects the changed record", () => {
    let now = 0;
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID(), lease: 5, now: () => now});
    hub.onAppend = () => undefined; hub.onRecoveryPin = () => undefined; hub.onSchemaChange = () => undefined;
    const author = new Doc("a", DEMO_SCHEMA);
    hub.submit({actor: "a", seq: 1, ops: author.edit([{op: "insert", at: [0, 0], content: "X"}]).ops});
    hub.submit({actor: "a", seq: 2, ops: author.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    hub.submit({actor: "a", seq: 3, ops: author.edit([{op: "insert", at: [0, 0], content: "Y"}]).ops});
    hub.connect("slow", 2); hub.ack({actor: "slow", serverSeq: 2, pin: null}); hub.disconnect("slow");
    const before = JSON.stringify(hub.doc.snapshot());
    const stage = prepareDurableMutation(hub, () => hub.gc());
    assert.equal(stage.status, "write");
    if (stage.status !== "write") return;
    assert.deepEqual(stage.record, {gc: 2});
    now = 10;
    assert.throws(() => stage.commit(), /changed before commit/);
    assert.equal(hub.serverSeq, 3); assert.equal(JSON.stringify(hub.doc.snapshot()), before);
    // Reopening the durable log can replay the already persisted, safe frontier.
    hub.replayGc(2);
    assert.equal(hub.serverSeq, 4);
});
