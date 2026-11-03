import assert from "node:assert/strict";
import {test} from "node:test";
import {Client, createEditorHost, clientOwner, isBindingClient} from "../src/client/index.ts";
import {LocalClient} from "../src/local/client.ts";
import {SyncClient} from "../src/sync/client.ts";
import {Doc} from "../src/crdt/doc.ts";
import {DocHub} from "../src/server/hub.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {EditOp} from "../src/crdt/model.ts";
import type {Transport, Outbound} from "../src/sync/protocol.ts";
const schema: Schema = {root: "book", marks: [], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const insert = (content: string, offset = 0): EditOp[] => [{op: "insert", at: [0, offset], content}];
const text = (client: Client) => client.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join("");
function setup(synchronous = false) {
    const hub = new DocHub({schema}), sent: Outbound[] = [];
    let subscriptions = 0, presence = 0;
    const transport: Transport = {
        subscribe(since, receive, epoch) { subscriptions++; receive(hub.hello(since, epoch)); return hub.listen(receive); },
        async send(message) { if (!synchronous) await Promise.resolve(); sent.push(message); if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence() { presence++; },
    };
    const client = new Client({schema, actor: "A", transport});
    return {client, hub, sent, transport, subscriptions: () => subscriptions, presence: () => presence};
}

test("transport omission creates a fixed memory-only backend", () => {
    const client = new Client({schema});
    assert.equal(client.mode, "local"); assert.equal(client.sync, null);
    assert.equal(Reflect.set(client, "mode", "sync"), false); assert.equal(client.mode, "local");
    assert.equal("backend" in client, false);
    assert.ok(clientOwner(client) instanceof LocalClient); assert.ok(isBindingClient(client));
    for (const key of ["seq", "serverSeq", "outbox", "transport", "ackTimer", "others"]) assert.equal(key in clientOwner(client), false);
    client.connect(); client.disconnect(); client.setPresence({name: "A", color: "red", anchor: null, focus: null});
    assert.deepEqual([...client.presence()], []);
    assert.deepEqual(client.status(), {online: false, synchronized: false});
    assert.deepEqual(client.capabilities, {sync: false, presence: false});
    client.edit(insert("hello")); assert.equal(text(client), "hello");
    const selection = {anchor: [0, 1], focus: [0, 4]};
    assert.deepEqual(client.resolveSelection(client.captureSelection(selection)), selection);
    client.undo(); assert.equal(text(client), ""); assert.equal(client.historyStatus().canUndo, false);
    client.redo(); assert.equal(text(client), "hello"); client.clearHistory(); assert.equal(client.historyStatus().canUndo, false);
    client.dispose();
});

test("invalid sync configuration fails before backend creation", () => {
    const s = setup();
    assert.throws(() => new Client({schema, transport: s.transport}), /actor/);
    assert.throws(() => new Client({schema, transport: null as unknown as Transport}), /transport/);
    assert.throws(() => new Client({schema, syncOptions: {ackDelay: 1}}), /transport/);
    assert.throws(() => new Client({schema, engineFactory: {}} as never), /engineFactory/);
    assert.throws(() => new Client({schema, actor: "A", transport: s.transport, syncOptions: {schema} as never}), /Unsupported/);
    assert.equal(s.subscriptions(), 0);
});

for (const mode of ["local", "sync"] as const) test(`${mode} hosts suppress their own commit and notify sibling views once`, () => {
    const client = mode === "local" ? new Client({schema, actor: "A"}) : setup().client;
    const first = createEditorHost(client), second = createEditorHost(client);
    let a = 0, b = 0, external = 0, fallback = false;
    const stopA = first.subscribe({modelEvents() { a++; }}), stopB = second.subscribe({modelEvents(_events, info) { b++; fallback = info.fallback; }});
    const stopC = client.subscribe({modelEvents() { external++; }});
    const ops = first.apply(insert("a"));
    assert.throws(() => second.commit(ops));
    assert.throws(() => first.commit(structuredClone(ops)));
    first.commit(ops);
    assert.equal(a, 0); assert.equal(b, 1); assert.equal(external, 1);
    assert.equal(fallback, mode === "sync");
    assert.throws(() => first.commit(ops));
    client.edit(insert("b", 1)); assert.equal(a, 1); assert.equal(b, 2); assert.equal(external, 2);
    assert.equal(text(client), "ab");
    client.undo(); assert.equal(text(client), "a"); client.undo(); assert.equal(text(client), "");
    assert.equal(client.historyStatus().canUndo, false);
    stopA(); stopA(); stopB(); stopC(); if (client.sync) { assert.throws(() => client.dispose(), /protected/); client.disconnect(); } else client.dispose();
});

for (const mode of ["local", "sync"] as const) test(`${mode} isolates observer failures and rejects edit reentry`, () => {
    const client = mode === "local" ? new Client({schema}) : setup().client;
    let updates = 0, rejected = 0;
    client.subscribe({modelEvents() { throw new Error("observer failure"); }, update() { throw new Error("update failure"); }});
    client.subscribe({modelEvents() { assert.throws(() => client.edit(insert("bad")), /observer/i); rejected++; }, update() { updates++; }});
    client.edit(insert("good")); assert.equal(text(client), "good");
    assert.equal(updates, 1); assert.equal(rejected, 1); assert.equal(client.notificationErrors.length, 2);
    if (client.sync) { assert.throws(() => client.dispose(), /protected/); client.disconnect(); } else client.dispose();
});

test("sync delegates acknowledgement, foreign edits, offline queue and reconnect unchanged", async () => {
    const s = setup(), client = s.client;
    assert.ok(client.sync instanceof SyncClient); assert.equal(s.subscriptions(), 0);
    let models = 0; client.subscribe({modelEvents() { models++; }});
    client.connect(); assert.equal(s.subscriptions(), 1);
    const before = models;
    client.edit(insert("A")); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(models, before + 1); assert.equal(client.sync!.pending.length, 0);
    assert.equal(s.sent.filter(message => message.kind === "change").length, 1);
    const peer = Doc.fromSnapshot("B", s.hub.doc.snapshot(), schema);
    s.hub.submit({actor: "B", seq: 1, ops: peer.edit(insert("B", 1)).ops});
    assert.equal(text(client), "AB"); assert.equal(models, before + 2);
    client.disconnect(); client.edit(insert("C", 2)); assert.equal(client.sync!.pending.length, 1);
    client.connect(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(s.subscriptions(), 2); assert.equal(client.sync!.pending.length, 0); assert.equal(text(client), "ABC");
    assert.deepEqual(client.model(), s.hub.doc.toJSON()); client.clearHistory(); client.dispose();
});

test("sync native edit adds no model reads or snapshot copies and own ack adds no invalidation", async () => {
    const s = setup(), raw = s.client.sync!, host = createEditorHost(s.client);
    s.client.connect(); await new Promise(resolve => setTimeout(resolve, 0));
    let reads = 0, snapshots = 0, ownEvents = 0, siblingEvents = 0;
    const model = raw.engine.model.bind(raw.engine), snapshot = raw.engine.snapshot.bind(raw.engine);
    raw.engine.model = () => { reads++; return model(); };
    raw.engine.snapshot = () => { snapshots++; return snapshot(); };
    host.subscribe({modelEvents() { ownEvents++; }});
    const sibling = createEditorHost(s.client); sibling.subscribe({modelEvents() { siblingEvents++; }});
    const apply = raw.engine.apply.bind(raw.engine), record = raw.engine.record.bind(raw.engine);
    let applies = 0, records = 0;
    raw.engine.apply = edits => { applies++; return apply(edits); };
    raw.engine.record = (ops, options) => { records++; return record(ops, options); };
    host.commit(host.apply(insert("a"))); await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual({reads, snapshots, applies, records, ownEvents, siblingEvents}, {reads: 0, snapshots: 0, applies: 1, records: 1, ownEvents: 0, siblingEvents: 1});
    s.client.clearHistory(); s.client.dispose();
});

test("legacy raw SyncClient host preserves application callbacks and removes only its observer", () => {
    const raw = setup().client.sync!;
    let rawUpdates = 0, rawEvents = 0, views = 0;
    const callback = () => { rawUpdates++; }; raw.onUpdate = callback;
    raw.onModelEvents = () => { rawEvents++; };
    const host = createEditorHost(raw), stop = host.subscribe({modelEvents() { views++; }});
    raw.commit(raw.engine.apply(insert("a")));
    assert.deepEqual({rawUpdates, rawEvents, views}, {rawUpdates: 1, rawEvents: 0, views: 1});
    stop(); assert.equal(raw.onUpdate, callback);
    assert.throws(() => raw.dispose(), /protected/); raw.disconnect();
});

for (const mode of ["local", "sync"] as const) test(`${mode} composition publishes one group and suppresses only its source view`, () => {
    const client = mode === "local" ? new Client({schema}) : setup().client;
    const host = createEditorHost(client), sibling = createEditorHost(client);
    let own = 0, other = 0;
    host.subscribe({modelEvents() { own++; }}); sibling.subscribe({modelEvents() { other++; }});
    const input = host.createSession(); input.begin(); input.commit(input.apply(insert("a"))); input.commit(input.apply(insert("b", 1)));
    assert.equal(text(client), ""); input.end(); assert.equal(text(client), "ab");
    assert.deepEqual({own, other}, {own: 0, other: 1});
    client.undo(); assert.equal(text(client), ""); assert.equal(client.historyStatus().canUndo, false);
    if (client.sync) client.disconnect(); else client.dispose();
});

for (const mode of ["local", "sync"] as const) test(`${mode} composition end retains its draft until sibling pending operations commit`, () => {
    const client = mode === "local" ? new Client({schema}) : setup().client;
    const host = createEditorHost(client), sibling = createEditorHost(client), input = host.createSession();
    input.begin(); input.commit(input.apply(insert("A")));
    const foreign = sibling.apply(insert("B"));
    assert.equal(text(client), "B");
    assert.throws(() => input.end(), /pending/i);
    assert.equal(input.active, true);
    assert.equal(text(client), "B");
    assert.equal(client.historyStatus().canUndo, false);
    sibling.commit(foreign);
    assert.equal(text(client), "B");
    assert.ok(input.end().length > 0);
    assert.equal(input.active, false);
    assert.deepEqual([...text(client)!].sort(), ["A", "B"]);
    client.undo(); assert.equal(text(client), "B");
    client.undo(); assert.equal(text(client), ""); assert.equal(client.historyStatus().canUndo, false);
    client.redo(); assert.equal(text(client), "B");
    client.redo(); assert.deepEqual([...text(client)!].sort(), ["A", "B"]);
    if (client.sync) client.disconnect(); else client.dispose();
});

test("sync pending native operations block history and session changes until committed", () => {
    const client = setup().client, host = createEditorHost(client);
    const ops = host.apply(insert("a"));
    assert.throws(() => client.undo(), /pending/); assert.throws(() => client.redo(), /pending/);
    assert.throws(() => client.clearHistory(), /pending/);
    assert.throws(() => client.connect(), /pending/); assert.equal(client.online, false);
    assert.throws(() => host.createSession().begin(), /pending/);
    const release = client.sync!.pauseLocalMutations();
    assert.throws(() => host.commit(ops), /paused/); release();
    host.commit(ops); assert.equal(text(client), "a");
    assert.equal(client.sync!.pending.length, 1); client.disconnect();
});

test("sync beforeEvent permits the native pending-input flush before a remote operation", async () => {
    const s = setup(), client = s.client, host = createEditorHost(client);
    client.connect(); await new Promise(resolve => setTimeout(resolve, 0));
    let flushes = 0;
    host.subscribe({beforeEvent(event) {
        if (event.type !== "change" || event.envelope.change?.actor !== "B") return;
        host.commit(host.apply(insert("local"))); flushes++;
    }});
    const peer = Doc.fromSnapshot("B", s.hub.doc.snapshot(), schema);
    s.hub.submit({actor: "B", seq: 1, ops: peer.edit(insert("remote")).ops});
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(flushes, 1); assert.deepEqual(client.model(), s.hub.doc.toJSON());
    assert.equal(client.notificationErrors.length, 0);
    client.clearHistory(); client.dispose();
});


test("own synchronous change echo cannot recapture native selection against the changed model", async () => {
    const s = setup(true), client = s.client;
    client.connect(); client.edit(insert("AB")); await new Promise(resolve => setTimeout(resolve, 0));
    const host = createEditorHost(client);
    let saved = client.captureSelection({anchor: [0, 1], focus: [0, 1]}), beforeEvents = 0;
    host.subscribe({beforeEvent() {
        // Native selection still refers to the old projection when a local echo arrives.
        saved = client.captureSelection({anchor: [0, 1], focus: [0, 1]}); beforeEvents++;
    }});
    client.edit(insert("X")); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(beforeEvents, 0);
    assert.deepEqual(client.resolveSelection(saved), {anchor: [0, 2], focus: [0, 2]});
    client.clearHistory(); client.dispose();
});
