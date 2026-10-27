import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {DocHub, PostPersistUncertainError} from "../src/server/hub.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

test("receipt evidence is exact and survives reconstruction within one document generation", () => {
    const generation = crypto.randomUUID();
    const first = new DocHub({schema: DEMO_SCHEMA, generation});
    const base: {epoch: string; serverSeq: number; schemaVersion: string | null} = {epoch: first.epoch, serverSeq: 0, schemaVersion: first.schemaVersion};
    const doc = new Doc("ai", DEMO_SCHEMA);
    const change = {actor: "ai", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "saved"}]).ops};
    let retained: {change: typeof change; base: typeof base} | undefined;
    first.onAppend = (envelope, conditionalBase) => {
        assert.ok(envelope.change);
        assert.ok(conditionalBase);
        retained = {change: envelope.change, base: conditionalBase};
    };
    first.submitConditional(change, base);
    assert.deepEqual(first.findConditionalReceipt(generation, base, change), {status: "accepted", generation, serverSeq: 1});
    assert.deepEqual(first.findConditionalReceipt(generation, {...base, serverSeq: 1}, change), {status: "unknown"});
    assert.deepEqual(first.findConditionalReceipt(generation, base, {...change, ops: []}), {status: "unknown"});
    assert.deepEqual(first.findConditionalReceipt(crypto.randomUUID(), base, change), {status: "unknown"});
    assert.ok(retained);
    const restarted = new DocHub({schema: DEMO_SCHEMA, generation});
    restarted.submit(retained.change, retained.base);
    assert.notEqual(restarted.epoch, first.epoch);
    assert.deepEqual(restarted.findConditionalReceipt(generation, base, change), {status: "accepted", generation, serverSeq: 1});
    assert.throws(() => restarted.submitConditional(change, base), /conditional_epoch/);
    restarted.reset(crypto.randomUUID());
    assert.deepEqual(restarted.findConditionalReceipt(generation, base, change), {status: "unknown"});
});

test("ordinary and legacy changes never become authoritative conditional receipts", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const doc = new Doc("actor", DEMO_SCHEMA);
    const change = {actor: "actor", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
    const base = {epoch: hub.epoch, serverSeq: 0, schemaVersion: hub.schemaVersion};
    hub.submit(change);
    assert.deepEqual(hub.findConditionalReceipt(generation, base, change), {status: "unknown"});
    const legacy = new DocHub({schema: DEMO_SCHEMA});
    legacy.submit(change, base);
    assert.deepEqual(legacy.findConditionalReceipt(generation, base, change), {status: "unknown"});
});

test("post-persist installation failure is uncertain and its durable receipt can be reconstructed", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const doc = new Doc("actor", DEMO_SCHEMA);
    const change = {actor: "actor", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "saved"}]).ops};
    const base: {epoch: string; serverSeq: number; schemaVersion: string | null} = {epoch: hub.epoch, serverSeq: 0, schemaVersion: hub.schemaVersion};
    let retained: {change: typeof change; base: typeof base} | undefined;
    let poisoned = false;
    hub.onAppend = (envelope, savedBase) => {
        assert.ok(envelope.change); assert.ok(savedBase);
        retained = {change: envelope.change, base: savedBase};
    };
    hub.onPostPersistError = () => { poisoned = true; };
    hub.doc.apply = () => { throw new Error("injected installation failure"); };
    assert.throws(() => hub.submitConditional(change, base), PostPersistUncertainError);
    assert.equal(poisoned, true);
    assert.ok(retained);
    const recovered = new DocHub({schema: DEMO_SCHEMA, generation});
    recovered.submit(retained.change, retained.base);
    assert.deepEqual(recovered.findConditionalReceipt(generation, base, change), {status: "accepted", generation, serverSeq: 1});
    assert.match(JSON.stringify(recovered.doc.toJSON()), /saved/);
});

test("an unbacked reset does not reuse the previous durable generation", () => {
    const generation = crypto.randomUUID();
    const hub = new DocHub({schema: DEMO_SCHEMA, generation});
    hub.reset();
    assert.equal(hub.generation, null);
});
