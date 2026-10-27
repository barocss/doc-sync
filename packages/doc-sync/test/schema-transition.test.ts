import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {schemaVersion} from "../src/crdt/schema-version.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import {DocHub} from "../src/server/hub.ts";
import {SyncClient} from "../src/sync/client.ts";
import {MemoryNet} from "./harness.ts";

function extended(): Schema {
    const schema = structuredClone(DEMO_SCHEMA);
    schema.nodes["new-atom"] = {shape: "atom"};
    const flow = schema.nodes.content;
    if (flow.shape !== "flow") throw new Error("Expected flow");
    flow.children = [...flow.children, "new-atom"];
    schema.marks = [...schema.marks, "highlight"];
    return schema;
}

function base(hub: DocHub) {
    if (hub.schemaVersion === null) throw new Error("Expected schema");
    return {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion};
}

test("transition checks revision and schema identity, and rejects incompatible or invalid changes without mutation", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const original = base(hub), before = hub.doc.snapshot();
    const broken = structuredClone(DEMO_SCHEMA);
    broken.marks = broken.marks.slice(1);
    assert.throws(() => hub.transitionSchema(broken, original), /Incompatible schema/);
    assert.throws(() => hub.transitionSchema(extended(), {...original, epoch: "old"}), /Stale/);
    assert.throws(() => hub.transitionSchema(extended(), {...original, serverSeq: original.serverSeq + 1}), /Stale/);
    assert.throws(() => hub.transitionSchema(extended(), {...original, schemaVersion: "old"}), /Stale/);
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.deepEqual(base(hub), original);
    assert.equal(hub.transitionSchema(extended(), original), schemaVersion(extended()));
    // An unchanged document sequence is insufficient after a schema transition.
    assert.throws(() => hub.transitionSchema(extended(), original), /Stale/);
    assert.throws(() => hub.submitConditional({actor: "old", seq: 1, ops: []}, original), /conditional_schema/);
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.equal(hub.epoch, original.epoch);
    assert.equal(hub.serverSeq, original.serverSeq);
    assert.equal(schemaVersion(hub.getSchema()!), hub.schemaVersion);
});

test("schema ownership isolates caller mutations and failed persistence leaves the transition unchanged", () => {
    const initial = structuredClone(DEMO_SCHEMA);
    const hub = new DocHub({schema: initial});
    const initialVersion = hub.schemaVersion, initialSnapshot = hub.doc.snapshot();
    initial.marks = [...initial.marks, "external"];
    assert.equal(hub.schemaVersion, initialVersion);
    assert.equal(schemaVersion(hub.getSchema()!), initialVersion);
    assert.equal(hub.getSchema()!.marks.includes("external"), false);
    const proposed = extended();
    hub.onSchemaChange = () => { throw new Error("storage failed"); };
    assert.throws(() => hub.transitionSchema(proposed, base(hub)), /storage failed/);
    assert.equal(hub.schemaVersion, initialVersion);
    assert.deepEqual(hub.doc.snapshot(), initialSnapshot);
    hub.onSchemaChange = null;
    hub.transitionSchema(proposed, base(hub));
    const version = hub.schemaVersion;
    proposed.marks = [...proposed.marks, "external"];
    const exported = hub.getSchema()!;
    exported.marks = [...exported.marks, "external"];
    assert.equal(hub.schemaVersion, version);
    assert.equal(schemaVersion(hub.getSchema()!), version);
    assert.equal(hub.getSchema()!.marks.includes("external"), false);
});

test("server and client reject schema accessors without invoking them", () => {
    const net = new MemoryNet(), client = net.add("accessor");
    let called = false;
    const schema = extended();
    Object.defineProperty(schema.nodes.paragraph, "extra", {enumerable: true, get() { called = true; return 1; }});
    const before = net.hub.doc.snapshot();
    assert.throws(() => net.hub.transitionSchema(schema, base(net.hub)));
    assert.equal(called, false);
    assert.deepEqual(net.hub.doc.snapshot(), before);
    assert.throws(() => client.upgradeSchema(schema));
    assert.equal(called, false);
});

test("a disconnected participant upgrades and retries pending edits without losing undo or remote changes", async () => {
    const net = new MemoryNet(), user = net.add("human"), ai = net.add("ai");
    user.connect(); ai.connect(); await net.settle();
    try {
        user.commit(user.doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops);
        await net.settle();
        user.disconnect();
        user.commit(user.doc.edit([{op: "insert", at: [0, 1], content: "p"}]).ops);
        const pending = structuredClone(user.pending), history = user.history, local = user.doc.toJSON();
        ai.commit(ai.doc.edit([{op: "insert", at: [0, 1], content: "b"}]).ops);
        await net.settle();
        const next = extended();
        net.hub.transitionSchema(next, base(net.hub));
        net.down();
        assert.equal(ai.online, false);
        assert.match(ai.connectionError!.message, /schema/i);
        user.connect(); await net.settle();
        assert.equal(user.online, false);
        assert.match(user.connectionError!.message, /schema/i);
        assert.deepEqual(user.doc.toJSON(), local);
        assert.deepEqual(user.pending, pending);
        assert.equal(user.history, history);
        user.upgradeSchema(next); ai.upgradeSchema(next);
        assert.deepEqual(user.pending, pending);
        assert.equal(user.history, history);
        user.connect(); ai.connect(); await net.settle();
        assert.equal(user.pending.length, 0);
        assert.deepEqual(user.doc.toJSON(), net.hub.doc.toJSON());
        assert.deepEqual(ai.doc.toJSON(), net.hub.doc.toJSON());
        user.undo(); await net.settle();
        assert.deepEqual(user.doc.toJSON(), net.hub.doc.toJSON());
        let runs = user.doc.toJSON().children![0].runs!;
        assert.equal(runs.map(run => "text" in run ? run.text : "").join(""), "xb");
        user.redo(); await net.settle();
        assert.deepEqual(user.doc.toJSON(), ai.doc.toJSON());
        runs = user.doc.toJSON().children![0].runs!;
        const text = runs.map(run => "text" in run ? run.text : "").join("");
        assert.ok(text.includes("p") && text.includes("b"));
    } finally { user.disconnect(); ai.disconnect(); }
});

test("an accepted edit with a lost echo survives a schema transition without being applied twice", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    let suppressChanges = true;
    const client = new SyncClient("lost-echo", {
        subscribe: (since, handler, epoch) => {
            const hello = hub.hello(since, epoch);
            handler(hello);
            if (hello.type === "hello" && !hello.snapshot) {
                hub.since(since).forEach(envelope => handler({type: "change", envelope}));
            }
            return hub.listen(event => { if (!suppressChanges || event.type !== "change") handler(event); });
        },
        send: async message => { if (message.kind === "change") hub.submit(message.change); },
        sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});
    try {
        client.connect();
        client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "once"}]).ops);
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(hub.serverSeq, 1);
        assert.equal(client.pending.length, 1);
        const history = client.history;
        client.disconnect();
        const next = extended();
        hub.transitionSchema(next, base(hub));
        client.connect();
        assert.equal(client.online, false);
        assert.equal(client.pending.length, 1);
        assert.equal(client.history, history);
        client.upgradeSchema(next);
        suppressChanges = false;
        client.connect();
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(client.pending.length, 0);
        assert.equal(client.history, history);
        assert.equal(hub.serverSeq, 1);
        assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
        assert.deepEqual(hub.doc.toJSON().children![0].runs, [{text: "once", marks: {}}]);
        client.undo();
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
        assert.deepEqual(hub.doc.toJSON().children![0].runs, []);
    } finally { client.disconnect(); }
});

const paragraph = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [paragraph(text)]}]});

test("schema transition preserves identities and pending edits in hidden merged cells", async () => {
    const net = new MemoryNet(), user = net.add("user"), ai = net.add("ai");
    user.connect(); ai.connect(); await net.settle();
    try {
        const table: NodeJSON = {type: "table", children: [
            {type: "table-row", children: [cell("a"), cell("b")]},
            {type: "table-row", children: [cell("c"), cell("d")]},
        ]};
        user.commit(user.doc.edit([{op: "insert", at: [1], content: [table]}]).ops); await net.settle();
        user.clearHistory(); ai.clearHistory();
        ai.disconnect();
        ai.commit(ai.doc.edit([{op: "insert", at: [1, 1, 1, 0, 0, 1], content: "X"}]).ops);
        const pending = structuredClone(ai.pending), history = ai.history;
        user.commit(user.doc.edit([{op: "update", at: [1, 0, 0], attrs: {rowspan: 2, colspan: 2}}]).ops); await net.settle();
        const before = net.hub.doc.snapshot();
        const next = extended();
        net.hub.transitionSchema(next, base(net.hub)); net.down();
        assert.deepEqual(net.hub.doc.snapshot(), before, "schema transition does not recreate CRDT identities");
        ai.upgradeSchema(next); user.upgradeSchema(next);
        assert.deepEqual(ai.pending, pending);
        assert.equal(ai.history, history);
        ai.connect(); user.connect(); await net.settle();
        assert.deepEqual(ai.doc.toJSON(), net.hub.doc.toJSON());
        let hidden = net.hub.doc.toJSON().children![1].children![1].children![1];
        assert.equal(hidden.attrs?.spanned, true);
        assert.deepEqual(hidden.children![0].children![0].runs, [{text: "dX", marks: {}}]);
        ai.undo(); await net.settle();
        hidden = net.hub.doc.toJSON().children![1].children![1].children![1];
        assert.deepEqual(hidden.children![0].children![0].runs, [{text: "d", marks: {}}]);
        ai.redo(); await net.settle();
        assert.deepEqual(ai.doc.toJSON(), user.doc.toJSON());
        hidden = net.hub.doc.toJSON().children![1].children![1].children![1];
        assert.deepEqual(hidden.children![0].children![0].runs, [{text: "dX", marks: {}}]);
    } finally { user.disconnect(); ai.disconnect(); }
});
