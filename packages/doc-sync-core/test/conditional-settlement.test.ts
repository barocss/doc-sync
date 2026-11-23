import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {test} from "node:test";
import {DocHub} from "../src/server/hub.ts";
import type {ConditionalSeal} from "../src/server/hub.ts";
import {prepareDurableMutation} from "../src/server/staged.ts";

const change = {actor: "a", seq: 1, ops: []};
const base = (hub: DocHub) => ({epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion});
function durable(hub: DocHub) {
    const records: ConditionalSeal[] = [];
    hub.onConditionalSeal = seal => records.push(seal);
    return records;
}

test("a durable seal leaves document sequence and state unchanged, and fences all submit bases", () => {
    const hub = new DocHub({generation: "g"}), records = durable(hub), before = hub.doc.snapshot(), initial = base(hub);
    const proof = hub.settleConditional("g", initial, change);
    assert.equal(proof.status, "not_applied");
    if (proof.status !== "not_applied") return;
    assert.equal(proof.requestDigest, createHash("sha256").update(JSON.stringify({generation: "g", base: initial, change})).digest("hex"));
    assert.equal(hub.serverSeq, 0);
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.throws(() => hub.submit(change), /conditional_sealed/);
    assert.throws(() => hub.submitConditional(change, initial), /conditional_sealed/);
    assert.deepEqual(hub.settleConditional("g", initial, change), proof);
    assert.equal(records.length, 1);
    hub.onRecoveryPin = () => {};
    hub.reserveRecovery("g", "a", "reservation", null);
    assert.throws(() => hub.submitRecovery("g", "reservation", null, change), /conditional_sealed/);
});

test("accepted exact request stays accepted; accepted body under another base stays unknown", () => {
    const hub = new DocHub({generation: "g"}); durable(hub);
    const initial = base(hub);
    hub.submitConditional(change, initial);
    assert.deepEqual(hub.settleConditional("g", initial, change), {status: "accepted", generation: "g", serverSeq: 1});
    assert.deepEqual(hub.settleConditional("g", {...initial, epoch: "other"}, change), {status: "unknown"});
    assert.deepEqual(hub.settleConditional("other-generation", initial, change), {status: "unknown"});
});

test("seal replay survives GC and blocks delayed payload; consuming a different body safely retires the active fence", () => {
    const hub = new DocHub({generation: "g"}), records = durable(hub);
    hub.settleConditional("g", base(hub), change);
    hub.replayGc(0);
    const reopened = new DocHub({generation: "g"}); durable(reopened);
    reopened.replayConditionalSeal(records[0]);
    assert.throws(() => reopened.submit(change), /conditional_sealed/);
    // A different exact body can consume the same actor revision.
    reopened.submit({...change, replacement: true} as typeof change);
    assert.equal(reopened.serverSeq, 1);
    assert.throws(() => reopened.submit(change), /change_conflict/);
    const again = new DocHub({generation: "g"});
    again.replayConditionalSeal(records[0]);
    again.submit({...change, replacement: true} as typeof change);
    assert.throws(() => again.submit(change), /change_conflict/);
});

test("missing persistence, generation mismatch, corruption and storage failures never produce negative evidence", () => {
    const hub = new DocHub({generation: "g"});
    assert.deepEqual(hub.settleConditional("g", base(hub), change), {status: "unknown"});
    const records = durable(hub);
    hub.onConditionalSeal = () => { throw new Error("disk failure"); };
    assert.throws(() => hub.settleConditional("g", base(hub), change), /disk failure/);
    assert.equal(hub.serverSeq, 0);
    // No seal was installed after a failed callback.
    hub.submit(change);
    const other = new DocHub({generation: "g"}); durable(other);
    other.settleConditional("g", base(other), change);
    other.onConditionalSeal = seal => records.push(seal);
    other.settleConditional("g", {...base(other), epoch: "another"}, change);
    assert.throws(() => new DocHub({generation: "g"}).replayConditionalSeal({...records[0], changeDigest: "bad"}), /Invalid stored/);
});

test("staged settlement installs the fence only after the durable owner commits", () => {
    const hub = new DocHub({generation: "g"});
    hub.onAppend = () => {}; hub.onRecoveryPin = () => {}; hub.onSchemaChange = () => {}; durable(hub);
    const initial = base(hub);
    const prepared = prepareDurableMutation(hub, () => hub.settleConditional("g", initial, change));
    assert.equal(prepared.status, "write");
    if (prepared.status !== "write") return;
    assert.ok("conditionalSeal" in prepared.record);
    assert.equal(prepared.commit().status, "not_applied");
    assert.throws(() => hub.submit(change), /conditional_sealed/);
});

test("active seal capacity fails closed and a consumed actor sequence frees capacity", () => {
    const hub = new DocHub({generation: "g"}); durable(hub);
    const initial = base(hub);
    for (let index = 0; index < 4096; index++) assert.equal(hub.settleConditional("g", initial, {...change, actor: `actor${index}`}).status, "not_applied");
    assert.equal(hub.settleConditional("g", initial, {...change, actor: "overflow"}).status, "unknown");
    hub.submit({...change, actor: "actor0", replacement: true} as typeof change);
    assert.equal(hub.settleConditional("g", initial, {...change, actor: "overflow"}).status, "not_applied");
});
