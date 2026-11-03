import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {History} from "../src/crdt/history.ts";
import {copyLocalState} from "../src/local/state.ts";
import {DocHub} from "../src/server/hub.ts";
import {prepareDurableMutation} from "../src/server/staged.ts";
import {SyncClient} from "../src/sync/client.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {ServerEvent} from "../src/sync/protocol.ts";

const schema: Schema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}};

function durableHub() {
    const hub = new DocHub({schema});
    hub.onAppend = () => undefined;
    hub.onRecoveryPin = () => undefined;
    hub.onSchemaChange = () => undefined;
    return hub;
}

function change(actor: string, text: string) {
    const doc = new Doc(actor, schema);
    return {actor, seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: text}]).ops};
}

test("interleaved staged mutations retain separate records, freezes and commit guards", () => {
    const left = durableHub(), right = durableHub();
    const a = prepareDurableMutation(left, () => left.submit(change("A", "left")));
    const b = prepareDurableMutation(right, () => right.submit(change("B", "right")));
    assert.equal(a.status, "write"); assert.equal(b.status, "write");
    if (a.status !== "write" || b.status !== "write") throw new Error("Expected staged writes");
    assert.equal(left.serverSeq, 0); assert.equal(right.serverSeq, 0);
    assert.notStrictEqual(a.record, b.record);
    assert.ok(Object.isFrozen(a.record));
    assert.ok("change" in a.record && Object.isFrozen(a.record.change.ops[0]));
    b.commit();
    assert.equal(left.serverSeq, 0); assert.equal(right.serverSeq, 1);
    a.commit();
    assert.equal(left.serverSeq, 1);
    assert.throws(() => a.commit(), /already committed/);
    assert.notDeepEqual(left.doc.toJSON(), right.doc.toJSON());
});

test("failed history restoration cannot poison subsequent detached restorations", () => {
    const doc = new Doc("A", schema), history = new History();
    const ops = doc.edit([{op: "insert", at: [0, 0], content: "한😀"}]).ops;
    history.record(ops, doc, {caretBefore: "before", caretAfter: "after"});
    const saved = history.snapshot();
    const invalid = structuredClone(saved) as unknown as {version: number}; invalid.version = 2;
    assert.throws(() => History.fromSnapshot(invalid), /Invalid history snapshot/);
    const first = History.fromSnapshot(saved), second = History.fromSnapshot(saved);
    const a = Doc.fromSnapshot("A", doc.snapshot(), schema), b = Doc.fromSnapshot("A", doc.snapshot(), schema);
    first.undo(a);
    assert.equal(first.canRedo, true); assert.equal(second.canRedo, false);
    assert.deepEqual(b.toJSON(), doc.toJSON());
    second.undo(b); assert.deepEqual(a.toJSON(), b.toJSON());
    first.redo(a); second.redo(b); assert.deepEqual(a.toJSON(), doc.toJSON()); assert.deepEqual(a.toJSON(), b.toJSON());
});

test("local JSON traversal is per call and preserves shared acyclic values without invoking getters", () => {
    const cycle: {self?: unknown} = {}; cycle.self = cycle;
    assert.throws(() => copyLocalState(cycle), /finite plain JSON/);
    let reads = 0;
    const getter = Object.defineProperty({}, "value", {enumerable: true, get() { reads++; return 1; }});
    assert.throws(() => copyLocalState(getter), /plain values/); assert.equal(reads, 0);
    const shared = {value: [1, "한😀"]}, source = {a: shared, b: shared};
    const copy = copyLocalState(source);
    assert.deepEqual(copy, source); assert.notStrictEqual(copy.a, shared); assert.strictEqual(copy.a, copy.b);
    copy.a.value.push(2); assert.deepEqual(shared.value, [1, "한😀"]);
});

test("hello counter validation remains independent and preserves rejected offline edits", () => {
    for (const counters of [null, [["A", -1]], [["A", 0.5]], [[1, 0]], [["A", 0, 1]], [["A", Number.MAX_SAFE_INTEGER + 1]]]) {
        const hub = new DocHub({schema});
        const event = {...hub.hello(0), delSeqs: counters} as unknown as ServerEvent;
        const client = new SyncClient("A", {subscribe: (_since, receive) => { receive(event); return () => {}; }, send: async () => {}, sendPresence: () => {}}, {schema});
        client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "pending"}]).ops);
        const before = client.doc.toJSON(), pending = structuredClone(client.pending);
        client.connect();
        assert.match(client.connectionError?.message ?? "", /Invalid doc-sync hello metadata/);
        assert.equal(client.online, false); assert.deepEqual(client.doc.toJSON(), before); assert.deepEqual(client.pending, pending);
        assert.throws(() => client.dispose(), /protected local state or history/);
    }
    const hub = new DocHub({schema}), client = new SyncClient("fresh", {subscribe: (_since, receive) => { receive(hub.hello(0)); return () => {}; }, send: async () => {}, sendPresence: () => {}}, {schema});
    client.connect(); assert.equal(client.connectionError, null); assert.equal(client.synchronized, true); client.dispose();
});
