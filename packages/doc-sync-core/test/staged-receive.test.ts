import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {applyEdits} from "../src/crdt/model.ts";
import type {Op} from "../src/crdt/doc.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {TypeScriptClientCompatibility, ClientEngineFactory} from "../src/engine/client-contract.ts";
import {typescriptClientEngineFactory} from "../src/engine/index.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DocHub} from "../src/server/hub.ts";
import type {ServerEvent} from "../src/sync/protocol.ts";
const schema: Schema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}};
const make = () => typescriptClientEngineFactory.create("A", schema);
const document = (engine: ReturnType<typeof make>) => (engine as unknown as TypeScriptClientCompatibility).typescriptDocument();

for (const events of [false, true]) test(`remote eight-block batch has one complete validation with events=${events}`, () => {
    const seed = new Doc("seed", schema), hub = new DocHub({schema});
    const initial = seed.edit([{op: "insert", at: [0], content: Array.from({length: 8}, () => ({type: "p", runs: [{text: "seed", marks: {}}]}))}]).ops;
    hub.submit({actor: "seed", seq: 1, ops: initial}); let receive: (event: ServerEvent) => void = () => {};
    const client = new SyncClient("A", {subscribe: (_since, listener) => { receive = listener; listener(hub.hello(0)); return () => {}; }, send: async () => {}, sendPresence: () => {}}, {schema});
    client.connect(); if (events) client.onModelEvents = () => {};
    const peer = Doc.fromSnapshot("B", hub.doc.snapshot(), schema);
    const ops = peer.edit(Array.from({length: 8}, (_,i) => ({op: "insert" as const, at: [i, 0], content: "R"}))).ops;
    const doc = client.doc, check = doc.check.bind(doc); let checks = 0;
    doc.check = value => { checks++; return check(value); };
    receive({type: "change", envelope: {serverSeq: hub.serverSeq + 1, change: {actor: "relay", seq: 1, ops}}});
    assert.equal(checks, 1); assert.deepEqual(client.engine.model(), peer.toJSON()); client.disconnect();
});

test("prepared capture owns its batch and returns deletion keys from applied values", () => {
    const engine = make(), peer = new Doc("B", schema);
    engine.receive("relay", peer.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops);
    const ops = peer.edit([{op: "delete", at: [0, 1], count: 1}]).ops, before = engine.model();
    const deletion = ops[0]; assert.equal(deletion.t, "del"); if (deletion.t !== "del") throw new Error("Missing deletion");
    const key = `${deletion.at.lamport}@${deletion.at.actor}`, capture = engine.beginEvents(ops);
    deletion.at.actor = "mutated"; deletion.at.lamport = 999; deletion.ids.length = 0;
    const result = engine.receive("relay", ops, capture);
    assert.deepEqual(result.deletions, [key]); assert.deepEqual(engine.model(), peer.toJSON());
    const {events, fallback} = engine.finishEvents(capture);
    assert.equal(fallback, false); assert.deepEqual(applyEdits(schema, before, events), engine.model());
});

test("prepared receive rejects foreign mismatched used and stale scopes before applying", () => {
    const peer = new Doc("B", schema), ops = peer.edit([{op: "insert", at: [0, 0], content: "remote"}]).ops;
    const engine = make(), other = make(), capture = engine.beginEvents(ops);
    const before = engine.checkpoint(), otherBefore = other.checkpoint();
    assert.throws(() => other.receive("relay", ops, capture), /Foreign|capture/); assert.deepEqual(other.checkpoint(), otherBefore);
    assert.throws(() => engine.receive("relay", [...ops], capture), /mismatched/); assert.deepEqual(engine.checkpoint(), before);
    engine.receive("relay", ops, capture); const applied = engine.checkpoint();
    assert.throws(() => engine.receive("relay", ops, capture), /consumed/); assert.deepEqual(engine.checkpoint(), applied);
    assert.ok(engine.finishEvents(capture).events.length);
    for (const replace of [false, true]) {
        const current = make(), pending = current.beginEvents(ops);
        if (replace) current.reset(); else current.apply([{op: "insert", at: [0, 0], content: "local"}]);
        const changed = current.checkpoint();
        assert.throws(() => current.receive("relay", ops, pending), /Stale/); assert.deepEqual(current.checkpoint(), changed);
        assert.throws(() => current.finishEvents(pending), /Stale/);
    }
    const observational = engine.beginEvents();
    assert.throws(() => engine.receive("relay", ops, observational), /capture/);
    assert.deepEqual(engine.finishEvents(observational), {events: [], fallback: false});
});

test("capture rejects invalid-after-valid batch before lazy scope reads", () => {
    const engine = make(), doc = document(engine), peer = new Doc("B", schema);
    const valid = peer.edit([{op: "insert", at: [0, 0], content: "valid"}]).ops;
    const invalid: Op = {t: "del", at: {actor: "B", lamport: 99}, ids: [{actor: "missing", lamport: 42}]};
    const before = engine.checkpoint(); doc.toJSON = () => { throw new Error("Unvalidated model read"); };
    assert.throws(() => engine.beginEvents([...valid, invalid]), /Invalid wire operation batch/); assert.deepEqual(engine.checkpoint(), before);
});

test("lazy token-only scope materialization rechecks the owned proof", () => {
    const required: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p", "box"], default: "p", childRules: {box: {min: 1}}},
        p: {shape: "text"}, box: {shape: "flow", children: ["p"], default: "p"},
    }};
    const engine = typescriptClientEngineFactory.create("A", required), doc = document(engine), check = doc.check.bind(doc); let checks = 0;
    doc.check = ops => { checks++; return check(ops); };
    const ops: Op[] = [{t: "text", id: {actor: "B", lamport: 1}, origin: {actor: "~root", lamport: 0}, text: "X"}];
    const capture = engine.beginEvents(ops); engine.receive("relay", ops, capture); engine.finishEvents(capture);
    assert.equal(checks, 2);
    const run = engine.model().children?.[0].runs?.[0]; assert.equal(run && "text" in run ? run.text : null, "X");
});

test("client deletion ledger uses staged applied values after source mutation", () => {
    const hub = new DocHub({schema}), seed = new Doc("seed", schema);
    hub.submit({actor: "seed", seq: 1, ops: seed.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops});
    let receive: (event: ServerEvent) => void = () => {};
    const factory: ClientEngineFactory = {...typescriptClientEngineFactory, create(actor, definition) {
        const base = typescriptClientEngineFactory.create(actor, definition);
        return new Proxy(base, {get(target, key) {
            if (key === "beginEvents") return (ops?: Op[]) => {
                const capture = base.beginEvents(ops);
                if (ops?.[0]?.t === "del") { ops[0].at.actor = "mutated"; ops[0].at.lamport = 999; ops[0].ids.length = 0; }
                return capture;
            };
            const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
        }});
    }};
    const client = new SyncClient("A", {subscribe: (_since, listener) => { receive = listener; listener(hub.hello(0)); return () => {}; }, send: async () => {}, sendPresence: () => {}}, {schema, engineFactory: factory});
    client.connect(); client.onModelEvents = () => {};
    const peer = Doc.fromSnapshot("B", hub.doc.snapshot(), schema), ops = peer.edit([{op: "delete", at: [0, 1], count: 1}]).ops;
    const deletion = ops[0]; if (deletion.t !== "del") throw new Error("Missing deletion"); const expected = `${deletion.at.lamport}@${deletion.at.actor}`;
    receive({type: "change", envelope: {serverSeq: hub.serverSeq + 1, change: {actor: "relay", seq: 1, ops}}});
    assert.deepEqual(client.captureState().delSeq, [[expected, hub.serverSeq + 1]]);
    assert.deepEqual(client.engine.model(), peer.toJSON()); client.disconnect();
});
