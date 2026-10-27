import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {Doc} from "../src/crdt/doc.ts";
import {DocHub} from "../src/server/hub.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {Change} from "../src/sync/protocol.ts";

function base(hub: DocHub) {
    return {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion};
}

function change(actor: string, text: string): Change {
    const doc = new Doc(actor, DEMO_SCHEMA);
    return {actor, seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: text}]).ops};
}

test("conditional retry requires the exact accepted base and payload", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const initial = base(hub), first = change("ai", "one");
    const accepted = hub.submitConditional(first, initial);
    assert.equal(accepted.serverSeq, 1);

    // Other changes and a schema transition may advance the authoritative state.
    const extended = structuredClone(DEMO_SCHEMA);
    extended.marks = [...extended.marks, "reviewed"];
    hub.transitionSchema(extended, {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion!});
    hub.submit(change("human", "two"));
    const after = hub.doc.snapshot();
    assert.deepEqual(hub.submitConditional(structuredClone(first), {...initial}), accepted);
    assert.deepEqual(hub.doc.snapshot(), after);
    assert.equal(hub.serverSeq, 2);

    assert.throws(() => hub.submitConditional(first, {...initial, serverSeq: initial.serverSeq + 1}), /conditional_conflict/);
    assert.throws(() => hub.submitConditional(first, {...initial, schemaVersion: hub.schemaVersion}), /conditional_conflict/);
    assert.throws(() => hub.submitConditional({...first, ops: []}, initial), /conditional_conflict/);
    assert.throws(() => hub.submitConditional(first, {...initial, epoch: "different-generation"}), /conditional_epoch/);
    assert.throws(() => hub.submitConditional({...first, actor: "different-actor"}, initial), /conditional_schema/);
    assert.deepEqual(hub.doc.snapshot(), after);
    assert.equal(hub.serverSeq, 2);
});

test("an ordinary accepted change is not a conditional receipt", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const initial = base(hub), edit = change("actor", "text");
    assert.ok(hub.submit(edit));
    assert.throws(() => hub.submitConditional(edit, initial), /conditional_conflict/);
    assert.equal(hub.serverSeq, 1);
});

test("reset rejects a prior generation even when a new change has an identical actor, sequence and payload", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const old = base(hub), edit = change("actor", "text");
    assert.equal(hub.submitConditional(edit, old).serverSeq, 1);
    hub.reset();
    const current = base(hub);
    assert.notEqual(old.epoch, current.epoch);
    assert.equal(hub.submitConditional(edit, current).serverSeq, 1);
    assert.throws(() => hub.submitConditional(edit, old), /conditional_epoch/);
    assert.equal(hub.serverSeq, 1);
    assert.equal(hub.submitConditional(edit, current).serverSeq, 1);
});

test("persistence failure leaves the document, revision and receipt untouched", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const initial = base(hub), before = hub.doc.snapshot(), edit = change("actor", "text");
    let events = 0;
    hub.listen(() => { events += 1; });
    hub.onAppend = () => { throw new Error("storage failure"); };
    assert.throws(() => hub.submitConditional(edit, initial), /storage failure/);
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.equal(hub.serverSeq, 0);
    assert.equal(events, 0);
    let retained: unknown;
    hub.onAppend = (envelope, conditionalBase) => { retained = {envelope, conditionalBase}; };
    const accepted = hub.submitConditional(edit, initial);
    assert.equal(accepted.serverSeq, 1);
    assert.deepEqual(retained, {envelope: accepted, conditionalBase: initial});
    assert.equal(events, 1);
});

test("one failing listener cannot reverse accepted changes or block other listeners", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const initial = base(hub), edit = change("actor", "text");
    const events: string[] = [];
    hub.listen(() => { throw new Error("listener failed"); });
    hub.listen(event => events.push(event.type));
    assert.equal(hub.submitConditional(edit, initial).serverSeq, 1);
    assert.equal(hub.serverSeq, 1);
    assert.deepEqual(hub.submitConditional(edit, initial).change, edit);
    const next = structuredClone(DEMO_SCHEMA);
    next.marks = [...next.marks, "reviewed"];
    assert.doesNotThrow(() => hub.transitionSchema(next, {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion!}));
    assert.deepEqual(events, ["change", "schema"]);
    assert.equal(hub.serverSeq, 1);
});

test("an additive schema requiring a missing snapshot capability is rejected without mutation", () => {
    const schema: Schema = {root: "content", marks: [], nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    }};
    const hub = new DocHub({schema});
    const before = hub.doc.snapshot(), initial = base(hub);
    const next = structuredClone(schema);
    const root = next.nodes.content;
    if (root.shape !== "flow") throw new Error("Expected flow");
    root.children = [...root.children, "box"];
    next.nodes.box = {shape: "flow", children: ["paragraph"], default: "paragraph", childRules: {paragraph: {min: 1}}};
    assert.throws(() => hub.transitionSchema(next, {...initial, schemaVersion: initial.schemaVersion!}), /capability|format/i);
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.deepEqual(base(hub), initial);
});
