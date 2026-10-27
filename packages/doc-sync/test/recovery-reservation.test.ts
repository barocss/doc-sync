import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {DocHub, RecoveryCompactionDeferredError} from "../src/server/hub.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

test("durable recovery reservation outlives peer lease and rejects compacted history", () => {
    let now = 0;
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation, lease: 5, now: () => now});
    const local = new Doc("a", DEMO_SCHEMA);
    hub.submit({actor: "a", seq: 1, ops: local.edit([{op: "insert", at: [0, 0], content: "x"}]).ops});
    const records: Array<{actor: string; reservationId: string; pin: number | null}> = [];
    hub.onRecoveryPin = entry => records.push(entry);
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", null), {status: "protected", generation, pin: 2, lastGc: 0, existing: false});
    hub.submit({actor: "a", seq: 2, ops: local.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    hub.connect("a", 2);
    hub.ack({actor: "a", serverSeq: 2, pin: null});
    hub.disconnect("a");
    now = 100;
    assert.equal(hub.gc(), null);
    assert.equal(hub.frontier(), 1);
    assert.deepEqual(hub.reserveRecovery(generation, "a", "two", null), {status: "protected", generation, pin: 3, lastGc: 0, existing: false});
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", null), {status: "protected", generation, pin: 2, lastGc: 0, existing: true});
    assert.deepEqual(hub.releaseRecovery(generation, "a", "one"), {status: "released"});
    assert.equal(hub.gc()?.gc, 2);
    assert.deepEqual(hub.releaseRecovery(generation, "a", "two"), {status: "released"});
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", 2), {status: "unsafe"});
    assert.deepEqual(records, [{actor: "a", reservationId: "one", pin: 2}, {actor: "a", reservationId: "two", pin: 3}, {actor: "a", reservationId: "one", pin: 2}, {actor: "a", reservationId: "one", pin: null}, {actor: "a", reservationId: "two", pin: null}]);
});

test("one reservation cannot release another reservation for the same actor", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const doc = new Doc("a", DEMO_SCHEMA);
    hub.onRecoveryPin = () => {};
    hub.reserveRecovery(generation, "a", "one", null);
    hub.reserveRecovery(generation, "a", "two", null);
    hub.submit({actor: "a", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops});
    hub.submit({actor: "a", seq: 2, ops: doc.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    hub.releaseRecovery(generation, "a", "one");
    assert.equal(hub.gc(), null);
    hub.releaseRecovery(generation, "a", "two");
    assert.equal(hub.gc()?.gc, 2);
});

test("released reservation IDs are generation-bound, durable and idempotent", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const entries: Array<{actor: string; reservationId: string; pin: number | null}> = [];
    hub.onRecoveryPin = entry => entries.push(entry);
    assert.equal(hub.reserveRecovery(generation, "a", "one", null).status, "protected");
    assert.equal(hub.reserveRecovery(generation, "a", "two", null).status, "protected");
    assert.deepEqual(hub.releaseRecovery("old-generation", "a", "two"), {status: "unsafe"});
    assert.deepEqual(hub.releaseRecovery(generation, "a", "one"), {status: "released"});
    assert.deepEqual(hub.releaseRecovery(generation, "a", "one"), {status: "released"});
    assert.equal(entries.filter(entry => entry.reservationId === "one" && entry.pin === null).length, 1);
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", null), {status: "unsafe"});
    assert.equal(hub.reserveRecovery(generation, "a", "two", null, true).status, "protected");

    // A release can overtake a create that was not submitted yet. The delayed
    // create must stay rejected after a server restart.
    assert.deepEqual(hub.releaseRecovery(generation, "a", "not-created"), {status: "released"});
    assert.deepEqual(hub.reserveRecovery(generation, "a", "not-created", null), {status: "unsafe"});
    const replay = new DocHub({schema: DEMO_SCHEMA, generation});
    replay.onRecoveryPin = () => {};
    for (const entry of entries) replay.replayRecoveryPin(entry);
    assert.deepEqual(replay.releaseRecovery(generation, "a", "one"), {status: "released"});
    assert.deepEqual(replay.reserveRecovery(generation, "a", "one", null), {status: "unsafe"});
    assert.deepEqual(replay.reserveRecovery(generation, "a", "not-created", null), {status: "unsafe"});
    assert.equal(replay.reserveRecovery(generation, "a", "two", null, true).status, "protected");

    replay.reset("new-generation");
    assert.equal(replay.reserveRecovery("new-generation", "a", "one", null).status, "protected");
});

test("legacy logs that reused a released reservation replay in order", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    hub.onRecoveryPin = () => {};
    hub.replayRecoveryPin({actor: "a", reservationId: "one", pin: 1});
    hub.replayRecoveryPin({actor: "a", reservationId: "one", pin: null});
    hub.replayRecoveryPin({actor: "a", reservationId: "one", pin: 1});
    assert.equal(hub.reserveRecovery(generation, "a", "one", null, true).status, "protected");
    assert.deepEqual(hub.releaseRecovery(generation, "a", "one"), {status: "released"});
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", null), {status: "unsafe"});
});

test("failed release persistence retains the existing GC pin", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const doc = new Doc("a", DEMO_SCHEMA);
    hub.onRecoveryPin = () => {};
    hub.reserveRecovery(generation, "a", "one", null);
    hub.submit({actor: "a", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops});
    hub.submit({actor: "a", seq: 2, ops: doc.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    hub.onRecoveryPin = () => { throw new Error("disk"); };
    assert.throws(() => hub.releaseRecovery(generation, "a", "one"), /disk/);
    assert.equal(hub.gc(), null);
    hub.onRecoveryPin = () => {};
    assert.equal(hub.reserveRecovery(generation, "a", "one", null, true).status, "protected");
});

test("reservation persistence failure and corrupt replay fail closed", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", null), {status: "unsafe"});
    hub.onRecoveryPin = () => { throw new Error("disk"); };
    assert.throws(() => hub.reserveRecovery(generation, "a", "one", null), /disk/);
    assert.equal(hub.frontier(), 0);
    assert.deepEqual(hub.reserveRecovery("wrong", "a", "one", null), {status: "unsafe"});
    hub.replayRecoveryPin({actor: "a", reservationId: "one", pin: 1});
    assert.throws(() => hub.replayGc(1), /crosses/);
    assert.throws(() => hub.replayRecoveryPin({actor: "a", reservationId: "one", pin: 2}), /Invalid/);
});

test("ordinary receipts require exact generation and payload and conflicting retries fail", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const doc = new Doc("a", DEMO_SCHEMA);
    const change = {actor: "a", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
    hub.submit(change);
    assert.deepEqual(hub.findChangeReceipt(generation, change), {status: "accepted", generation, serverSeq: 1});
    assert.deepEqual(hub.findChangeReceipt(generation, {...change, ops: []}), {status: "unknown"});
    assert.deepEqual(hub.findChangeReceipt("other", change), {status: "unknown"});
    assert.equal(hub.submit(change), null);
    assert.throws(() => hub.submit({...change, ops: []}), /change_conflict/);
});

test("compaction receipt evidence preserves exact bases and cannot mutate live receipts", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const doc = new Doc("a", DEMO_SCHEMA);
    const first = {actor: "a", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
    const firstBase = {epoch: hub.epoch, serverSeq: 0, schemaVersion: hub.schemaVersion};
    hub.submitConditional(first, firstBase);
    const second = {actor: "a", seq: 2, ops: doc.edit([{op: "insert", at: [0, 1], content: "y"}]).ops};
    const secondBase = {epoch: hub.epoch, serverSeq: 1, schemaVersion: hub.schemaVersion};
    hub.submitConditional(second, secondBase);
    const evidence = hub.recoveryReceiptState();
    assert.deepEqual(evidence, [{base: firstBase, change: first, serverSeq: 1}, {base: secondBase, change: second, serverSeq: 2}]);
    evidence[0].base.epoch = crypto.randomUUID();
    evidence[0].change.ops.length = 0;
    assert.deepEqual(hub.findConditionalReceipt(generation, firstBase, first), {status: "accepted", generation, serverSeq: 1});
    assert.equal(hub.recoveryReceiptState()[0].change.ops.length, first.ops.length);
});

test("recovery submit requires an existing reservation and accepts the exact change once", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    hub.onRecoveryPin = () => {};
    const doc = new Doc("a", DEMO_SCHEMA);
    const change = {actor: "a", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
    assert.deepEqual(hub.reserveRecovery(generation, "a", "one", null, true), {status: "unsafe"});
    assert.deepEqual(hub.submitRecovery(generation, "one", hub.schemaVersion, change), {status: "unsafe"});
    hub.reserveRecovery(generation, "a", "one", null);
    assert.deepEqual(hub.submitRecovery(generation, "one", "wrong-schema", change), {status: "unsafe"});
    const accepted = {status: "accepted", generation, serverSeq: 1};
    assert.deepEqual(hub.submitRecovery(generation, "one", hub.schemaVersion, change), accepted);
    assert.deepEqual(hub.submitRecovery(generation, "one", hub.schemaVersion, change), accepted);
    assert.equal(hub.serverSeq, 1);
    assert.deepEqual(hub.submitRecovery(generation, "one", hub.schemaVersion, {...change, ops: []}), {status: "conflict"});
});

test("sealing eras retains active reservations while released IDs stay closed without tombstones", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const persisted: Array<{actor: string; reservationId: string; pin: number | null}> = [];
    hub.onRecoveryPin = entry => persisted.push(entry);
    const oldId = `r0~${crypto.randomUUID()}`, activeId = `r0~${crypto.randomUUID()}`;
    assert.equal(hub.reserveRecovery(generation, "a", oldId, null).status, "protected");
    assert.equal(hub.reserveRecovery(generation, "a", activeId, null).status, "protected");
    assert.equal(hub.reserveRecovery(generation, "b", activeId, null).status, "protected");
    assert.equal(hub.releaseRecovery(generation, "a", oldId).status, "released");
    const before = hub.recoveryCompactionState();
    assert.equal(before.era, 1);
    assert.deepEqual(before.active.map(entry => entry.actor), ["a", "b"]);
    assert.equal(hub.recoveryEra, 0, "preparing compaction must not change the live era");
    hub.commitRecoveryCompaction(before);
    assert.equal(hub.recoveryEra, 1);
    const count = persisted.length;
    assert.equal(hub.reserveRecovery(generation, "a", oldId, null).status, "unsafe");
    assert.equal(hub.releaseRecovery(generation, "a", oldId).status, "released");
    assert.equal(persisted.length, count, "closed-era release must not add another tombstone");
    assert.equal(hub.reserveRecovery(generation, "a", activeId, null, true).status, "protected");
    assert.equal(hub.releaseRecovery(generation, "a", activeId).status, "released");
    assert.equal(hub.reserveRecovery(generation, "a", activeId, null).status, "unsafe");
    assert.equal(hub.reserveRecovery(generation, "b", activeId, null, true).status, "protected", "another actor's reservation must remain active");
    const nextId = `r1~${crypto.randomUUID()}`;
    assert.equal(hub.reserveRecovery(generation, "a", nextId, null).status, "protected");
    assert.equal(hub.releaseRecovery(generation, "a", nextId).status, "released");
    assert.equal(hub.reserveRecovery(generation, "a", nextId, null).status, "unsafe");
    assert.equal(hub.reserveRecovery(generation, "a", `r2~${crypto.randomUUID()}`, null).status, "unsafe");
    for (const invalid of [`r01~${crypto.randomUUID()}`, `r9007199254740992~${crypto.randomUUID()}`, "r1~bad"]) {
        assert.equal(hub.reserveRecovery(generation, "a", invalid, null).status, "unsafe");
        assert.equal(hub.releaseRecovery(generation, "a", invalid).status, "released");
    }
});

test("compaction state is atomic and replay preserves GC pins and sealed eras", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    hub.onRecoveryPin = () => {};
    const doc = new Doc("a", DEMO_SCHEMA);
    hub.submit({actor: "a", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "xy"}]).ops});
    hub.submit({actor: "a", seq: 2, ops: doc.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    assert.equal(hub.gc()?.gc, 2);
    const activeId = `r0~${crypto.randomUUID()}`;
    assert.equal(hub.reserveRecovery(generation, "a", activeId, null).status, "protected");
    hub.submit({actor: "a", seq: 3, ops: doc.edit([{op: "delete", at: [0, 0], count: 1}]).ops});
    assert.equal(hub.gc(), null);
    const snapshot = hub.recoveryCompactionState();
    assert.throws(() => hub.commitRecoveryCompaction({...snapshot, era: snapshot.era + 1}), /changed/);
    assert.equal(hub.recoveryEra, 0);
    hub.commitRecoveryCompaction(snapshot);
    assert.equal(hub.gc(), null);

    const replay = new DocHub({schema: DEMO_SCHEMA, generation});
    for (const envelope of hub.log) {
        if (envelope.change) replay.submit(envelope.change);
        else if (envelope.gc !== undefined) replay.replayGc(envelope.gc);
    }
    replay.onRecoveryPin = () => {};
    replay.replayRecoveryState(snapshot);
    assert.equal(replay.recoveryEra, 1);
    assert.equal(replay.gc(), null);
    assert.equal(replay.reserveRecovery(generation, "a", activeId, null, true).status, "protected");
    assert.equal(replay.releaseRecovery(generation, "a", activeId).status, "released");
    assert.equal(replay.reserveRecovery(generation, "a", activeId, null).status, "unsafe");
    assert.equal(replay.gc()?.gc, 4);
    replay.reset("new-generation");
    assert.equal(replay.recoveryEra, 0);
});

test("invalid compacted states and impossible legacy IDs fail without mutating recovery state", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    hub.onRecoveryPin = () => {};
    const id = `r0~${crypto.randomUUID()}`;
    const valid = {era: 1, active: [{actor: "a", reservationId: id, pin: 1}]};
    assert.throws(() => hub.replayRecoveryState({...valid, active: [...valid.active, ...valid.active]}), /Duplicate/);
    assert.throws(() => hub.replayRecoveryState({...valid, active: [{...valid.active[0], pin: 2}]}), /Invalid/);
    assert.throws(() => hub.replayRecoveryState({...valid, active: [{...valid.active[0], reservationId: `r1~${crypto.randomUUID()}`}]}), /era/);
    assert.equal(hub.recoveryEra, 0);
    hub.replayRecoveryPin({actor: "legacy", reservationId: `r5~${crypto.randomUUID()}`, pin: 1});
    assert.throws(() => hub.recoveryCompactionState(), RecoveryCompactionDeferredError);
    assert.equal(hub.releaseRecovery(generation, "legacy", `r5~${crypto.randomUUID()}`).status, "unsafe");
    assert.equal(hub.recoveryEra, 0);
});

test("a legacy future-era tombstone blocks unsafe compaction and stale recreation", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    hub.onRecoveryPin = () => {};
    const legacyFuture = `r1~${crypto.randomUUID()}`;
    // Old logs permitted arbitrary IDs. Replay a future-looking ID and its release.
    hub.replayRecoveryPin({actor: "a", reservationId: legacyFuture, pin: 1});
    hub.replayRecoveryPin({actor: "a", reservationId: legacyFuture, pin: null});
    assert.throws(() => hub.recoveryCompactionState(), RecoveryCompactionDeferredError);
    assert.equal(hub.recoveryEra, 0);
    assert.equal(hub.reserveRecovery(generation, "a", legacyFuture, null).status, "unsafe");
    assert.equal(hub.releaseRecovery(generation, "a", legacyFuture).status, "released");
    const other = `r2~${crypto.randomUUID()}`;
    assert.equal(hub.releaseRecovery(generation, "a", other).status, "unsafe");
});

test("malformed legacy release remains idempotent after tombstone compaction", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    let writes = 0;
    hub.onRecoveryPin = () => { writes += 1; };
    const malformed = "r1~old-invalid";
    hub.replayRecoveryPin({actor: "a", reservationId: malformed, pin: 1});
    assert.equal(hub.releaseRecovery(generation, "a", malformed).status, "released");
    const state = hub.recoveryCompactionState();
    hub.commitRecoveryCompaction(state);
    const before = writes;
    assert.equal(hub.releaseRecovery(generation, "a", malformed).status, "released");
    assert.equal(writes, before);
    assert.equal(hub.reserveRecovery(generation, "a", malformed, null).status, "unsafe");
});
