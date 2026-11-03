import assert from "node:assert/strict";
import {test} from "node:test";
import {Client, clientOwner, createEditorHost} from "../src/client/index.ts";
import {createDataSchema, SharedMap} from "../src/data/index.ts";
import type {ClientOptions} from "../src/client/index.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {Outbound, Transport} from "../src/sync/protocol.ts";
import {DocHub} from "../src/server/hub.ts";
import {createDataHub} from "../src/server/data.ts";

const plain: Schema = {root: "book", marks: [], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
function setup(schema: Schema, data?: ClientOptions["data"]) {
    let subscriptions = 0, stops = 0;
    const sent: Outbound[] = [], hub = new DocHub({schema});
    const transport: Transport = {
        subscribe(since, receive, epoch) { subscriptions++; receive(hub.hello(since, epoch)); const stop = hub.listen(receive); return () => {stops++; stop();}; },
        async send(message) { sent.push(message); if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); }, sendPresence() {},
    };
    const client = new Client({schema, data, actor: "review", transport});
    const flush = async () => {client.connect(); for (let n = 0; n < 20; n++) await Promise.resolve();};
    const close = async () => {client.clearHistory(); await flush(); client.clearHistory(); await flush(); client.dispose();};
    return {client, sent, flush, close, subscriptions: () => subscriptions, stops: () => stops};
}
function state(client: Client) {
    return structuredClone({snapshot: client.snapshot(), stamp: client.stamp(), history: client.historyStatus(), pending: client.sync?.pending, status: client.status()});
}

test("data attaches once to the same Client and does not subscribe to transport", async () => {
    const net = setup(createDataSchema()), {client} = net;
    const backend = clientOwner(client), first = client.data, root = first.root;
    assert.equal(net.subscriptions(), 0);
    client.connect(); assert.equal(net.subscriptions(), 1);
    assert.equal(client.data, first); assert.equal(client.data.root, root);
    const child = first.createMap(); root.set("child", child);
    assert.equal(client.data.getMap(child.id), child);
    assert.equal(root.get("child"), child); assert.equal(clientOwner(client), backend);
    const other = new Client({schema: createDataSchema()});
    assert.throws(() => other.data.root.set("child", child), /another client/);
    assert.equal(other.data.root.size, 0);
    assert.equal(net.subscriptions(), 1);
    await net.close(); assert.equal(net.stops(), 1); other.dispose();
});

for (const mode of ["local", "sync"] as const) test(`${mode} unsupported data access preserves model, history, pending and transport`, async () => {
    const net = setup(plain), client = mode === "sync" ? net.client : new Client({schema: plain});
    if (mode === "sync") client.connect();
    client.edit([{op: "insert", at: [0, 0], content: "keep"}]);
    const before = state(client), sent = structuredClone(net.sent);
    for (let n = 0; n < 2; n++) assert.throws(() => client.data, /createDataSchema/);
    assert.deepEqual(state(client), before); assert.deepEqual(net.sent, sent);
    assert.equal(net.subscriptions(), mode === "sync" ? 1 : 0);
    if (mode === "sync") await net.close(); else {client.dispose(); net.client.dispose();}
});

test("local policy is captured before lazy access and cannot be replaced through options", () => {
    let called = 0;
    const policy = {validate(): void {called++; throw new Error("policy denied");}};
    const client = new Client({schema: createDataSchema(), data: policy});
    policy.validate = () => {};
    const data = client.data, before = client.captureState();
    assert.throws(() => data.root.set("blocked", 1), /policy denied/);
    assert.equal(client.data, data);
    assert.throws(() => client.data.root.set("blocked", 2), /policy denied/);
    assert.equal(called, 2); assert.deepEqual(client.captureState(), before); client.dispose();
});

for (const mode of ["local", "sync"] as const) test(`${mode} validators cannot mutate the owning Client or allocate collections`, async () => {
    let attempt = () => {};
    const policy = {validate() {attempt();}};
    const net = setup(createDataSchema(), policy);
    const client = mode === "sync" ? net.client : new Client({schema: createDataSchema(), data: policy});
    const data = client.data;
    data.root.set("keep", 1);
    const mutations = [
        () => client.edit([{op: "delete", at: [0], count: 1}]),
        () => client.undo(), () => client.redo(), () => client.clearHistory(),
        () => client.dispose(), () => client.connect(), () => client.disconnect(),
        () => client.data.createMap(), () => data.createList(),
        () => data.root.delete("missing"),
    ];
    for (const mutation of mutations) {
        const before = state(client), sent = structuredClone(net.sent);
        attempt = mutation;
        assert.throws(() => data.root.set("outer", 2), /validator mutation/);
        assert.deepEqual(state(client), before); assert.deepEqual(net.sent, sent);
        assert.equal(data.root.get("keep"), 1); assert.equal(data.root.has("outer"), false);
    }
    assert.equal(net.subscriptions(), 0); attempt = () => {};
    data.root.set("outer", 3); assert.equal(data.root.get("outer"), 3);
    if (mode === "sync") await net.close(); else {client.dispose(); net.client.dispose();}
});

test("restored Client keeps collection IDs, values, history and the same single backend", () => {
    const client = new Client({schema: createDataSchema(), actor: "restore"});
    const list = client.data.createList(), id = list.push("first");
    client.data.root.set("list", list); client.clearHistory(); list.set(id, "second");
    const saved = JSON.parse(JSON.stringify(client.captureState()));
    // The existing fixed storage encoding must remain compatible.
    assert.equal(saved.schemaVersion, "sha256:96b65879a3d426ab2aeeeb7e60b02e207ba5bfb66e9b211f14b2707be972f23f");
    let validations = 0;
    const restored = Client.fromState(saved, {schema: createDataSchema(), data: {validate() {validations++;}}});
    const backend = clientOwner(restored), restoredList = restored.data.getList(list.id)!;
    assert.equal(restored.actor, client.actor); assert.equal(restored.mode, "local");
    assert.equal(restored.data.root.get("list"), restoredList);
    assert.deepEqual(restoredList.entries(), [{id, value: "second"}]);
    assert.deepEqual(restored.captureState().engine.document, saved.engine.document);
    assert.deepEqual(restored.captureState().engine.history, saved.engine.history);
    restored.undo(); assert.equal(restoredList.get(id), "first");
    restored.redo(); assert.equal(restoredList.get(id), "second");
    restoredList.set(id, "third"); assert.equal(validations, 1);
    assert.equal(clientOwner(restored), backend); assert.equal(restored.data.getList(list.id), restoredList);
    assert.equal(list.get(id), "second");
    client.dispose(); restored.dispose();
});

test("retained references stay readable in notifications and reject collection operations while hidden", () => {
    const client = new Client({schema: createDataSchema()}), data = client.data, child = data.createMap();
    child.set("value", 7); data.root.set("child", child);
    const seen: SharedMap[] = [];
    client.subscribe({update() {seen.push(data.root.get("child") as SharedMap);}});
    client.edit([{op: "delete", at: [0], count: 1}]);
    assert.deepEqual(seen, [child]); assert.equal(data.root.get("child"), child);
    assert.equal(data.getMap(child.id), undefined);
    assert.throws(() => child.get("value"), /not visible/);
    assert.throws(() => child.set("value", 8), /not visible/);
    assert.deepEqual(client.notificationErrors, []);
    client.undo(); assert.equal(data.getMap(child.id), child); assert.equal(child.get("value"), 7);
    client.dispose();
});

test("schema upgrade invalidates cached data access and every retained handle", async () => {
    const net = setup(createDataSchema()), {client} = net, data = client.data, child = data.createMap();
    data.root.set("child", child);
    client.clearHistory(); await net.flush();
    const next = createDataSchema(); next.nodes.unused = {shape: "atom"};
    client.sync!.upgradeSchema(next);
    const before = state(client);
    for (const access of [() => client.data, () => data.root.entries(), () => child.get("x"), () => data.createMap(), () => data.root.delete("missing")]) {
        assert.throws(access, /createDataSchema|schema/);
        assert.deepEqual(state(client), before);
    }
    client.dispose();
});

for (const mode of ["local", "sync"] as const) test(`${mode} retained data handles reject reads and writes after disposal`, async () => {
    const net = setup(createDataSchema()), client = mode === "sync" ? net.client : new Client({schema: createDataSchema()});
    const data = client.data; data.root.set("x", 1); const child = data.createList();
    if (mode === "sync") {client.clearHistory(); await net.flush();}
    client.dispose();
    for (const action of [() => data.root.get("x"), () => child.entries(), () => data.getMap("$root"), () => data.root.set("x", 2), () => data.createList()]) assert.throws(action, /disposed/);
    if (mode === "local") net.client.dispose();
});

test("accessing data preserves editor origin filtering and sibling subscriptions", () => {
    const client = new Client({schema: createDataSchema()}), own = createEditorHost(client), sibling = createEditorHost(client);
    let ownEvents = 0, siblingEvents = 0;
    own.subscribe({modelEvents() {ownEvents++;}}); sibling.subscribe({modelEvents() {siblingEvents++;}});
    const data = client.data;
    const ops = own.apply([{op: "insert", at: [0], content: [{type: "entry", attrs: {id: "data:00000000-0000-4000-8000-000000000001", key: "x", value: {scalar: 1}}}]}]);
    own.commit(ops); assert.equal(ownEvents, 0); assert.equal(siblingEvents, 1);
    data.root.set("x", 2); assert.equal(ownEvents, 1); assert.equal(siblingEvents, 2);
    assert.equal(data.root.get("x"), 2); client.dispose();
});

test("data server admission still rejects before append and permits a corrected same-sequence retry", () => {
    const hub = createDataHub(), snapshot = hub.doc.snapshot();
    let appended = 0, events = 0;
    hub.onAppend = () => {appended++;}; const stop = hub.listen(() => {events++;});
    const node = {t: "node" as const, id: {lamport: 1, actor: "bad"}, origin: {lamport: 0, actor: "~root"}, type: "entry", attrs: {id: "data:00000000-0000-4000-8000-000000000001", key: "x", value: {reference: "missing", kind: "map"}}};
    assert.throws(() => hub.submit({actor: "bad", seq: 1, ops: [node]}), /reference/);
    assert.equal(appended, 0); assert.equal(events, 0); assert.equal(hub.serverSeq, 0); assert.deepEqual(hub.doc.snapshot(), snapshot);
    const fixed = {...node, attrs: {...node.attrs, value: {scalar: 1}}};
    hub.submit({actor: "bad", seq: 1, ops: [fixed]});
    assert.equal(appended, 1); assert.equal(events, 1); assert.equal(hub.serverSeq, 1); stop();
});

test("ESM core and data entry points import without DOM globals and expose only the unified Client", async () => {
    assert.equal(typeof globalThis.document, "undefined");
    const core = await import("../src/index.ts"), data = await import("../src/data/index.ts");
    assert.equal(core.Client, Client); assert.equal("DataClient" in core, false); assert.equal("DataClient" in data, false);
    const client = new core.Client({schema: data.createDataSchema()});
    client.data.root.set("ssr", true); assert.equal(client.data.root.get("ssr"), true); client.dispose();
});
