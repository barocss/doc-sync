import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import type {Op} from "../src/crdt/doc.ts";
import {createDataSchema} from "../src/data/index.ts";
import {Client, createEditorHost} from "../src/client/index.ts";
import {LocalClient} from "../src/local/client.ts";
import {createDataHub, DocHub, prepareDurableMutation} from "../src/server/index.ts";
import type {Change} from "../src/sync/protocol.ts";

const id = (n: number) => `data:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entry = (n: number, value: unknown = {scalar: n}, key = "same") => ({type: "entry", attrs: {id: id(n), key, value}});
const root = {lamport: 0, actor: "~root"};
const change = (actor: string, seq: number, ops: Op[]): Change => ({actor, seq, ops});
function rejection(hub: ReturnType<typeof createDataHub>, bad: Change) {
    const before = hub.doc.snapshot(), log = structuredClone(hub.log), seq = hub.serverSeq;
    let appends = 0, events = 0;
    hub.onAppend = () => appends++;
    const unlisten = hub.listen(() => events++);
    assert.throws(() => hub.submit(bad));
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.deepEqual(hub.log, log); assert.equal(hub.serverSeq, seq);
    assert.equal(appends, 0); assert.equal(events, 0); unlisten();
}

test("admission permits concurrent same-key entries with separate persistent IDs", () => {
    const hub = createDataHub();
    for (const [actor, n] of [["A", 1], ["B", 2]] as const) {
        const doc = new Doc(actor, createDataSchema());
        hub.submit(change(actor, 1, doc.edit([{op: "insert", at: [0], content: [entry(n)]}]).ops));
    }
    assert.equal(hub.doc.toJSON().children!.length, 2);
});

test("a retained deleted collection accepts a queued child and reference, then undo restores both", () => {
    const hub = createDataHub(), a = new Doc("A", createDataSchema());
    hub.submit(change("A", 1, a.edit([{op: "insert", at: [0], content: [{type: "map", attrs: {id: id(1)}, children: []}]}]).ops));
    const b = Doc.fromSnapshot("B", hub.doc.snapshot(), createDataSchema());
    const deletion = a.edit([{op: "delete", at: [0], count: 1}]).ops;
    hub.submit(change("A", 2, deletion));
    const queued = b.edit([{op: "insert", at: [0, 0], content: [entry(2)]}, {op: "insert", at: [1], content: [entry(3, {reference: id(1), kind: "map"}, "child")]}]).ops;
    hub.submit(change("B", 1, queued));
    const del = deletion.find(op => op.t === "del")!;
    assert.equal(del.t, "del");
    hub.submit(change("A", 3, [{t: "undel", at: {lamport: 100, actor: "A"}, cancels: [del.at], ids: del.ids}]));
    const model = hub.doc.toJSON();
    assert.equal(model.children!.find(node => node.type === "map")!.children![0].attrs!.id, id(2));
    assert.equal(model.children!.find(node => node.type === "entry")!.attrs!.id, id(3));
});

test("delete and reinsert cannot alias the persistent ID of a retained tombstone", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    hub.submit(change("A", 1, doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops));
    hub.submit(change("A", 2, doc.edit([{op: "delete", at: [0], count: 1}]).ops));
    rejection(hub, change("A", 3, doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops));
});

test("malformed LWW-loser values and immutable field writes fail before persistence", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    const birth = doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops;
    hub.submit(change("A", 1, birth));
    const token = birth.find(op => op.t === "node")!; assert.equal(token.t, "node");
    hub.submit(change("A", 2, [{t: "set", at: {lamport: 100, actor: "A"}, ids: [token.id], key: "value", value: {scalar: 7}}]));
    for (const [key, value] of [["value", {}], ["value", {scalar: NaN}], ["value", {scalar: 1, kind: "map"}], ["id", id(2)], ["key", "renamed"], ["$type", "map"]] as const) {
        rejection(hub, change("B", 1, [{t: "set", at: {lamport: 3, actor: "B"}, ids: [token.id], key, value}]));
    }
});

test("failed append permits exact retry without reserving a persistent ID", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    const request = change("A", 1, doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops);
    const before = hub.doc.snapshot();
    hub.onAppend = () => {throw new Error("disk failure");};
    assert.throws(() => hub.submit(request), /disk failure/);
    assert.equal(hub.serverSeq, 0); assert.deepEqual(hub.doc.snapshot(), before);
    hub.onAppend = null;
    assert.equal(hub.submit(request)!.serverSeq, 1);
    assert.equal(hub.submit(request), null);
});

test("raw encoded values reject accessors, nonenumerable fields and symbols before cloning", () => {
    for (const makeValue of [
        () => Object.defineProperty({}, "scalar", {enumerable: true, get() {throw new Error("getter must not run");}}),
        () => Object.defineProperty({scalar: 1}, "extra", {enumerable: false, value: 2}),
        () => Object.assign({scalar: 1}, {[Symbol("hidden")]: 2}),
        () => Object.assign(Object.create({extra: 2}), {scalar: 1}),
    ]) {
        const hub = createDataHub();
        const request = change("A", 1, [{t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: id(1), key: "bad", value: makeValue()}}]);
        rejection(hub, request);
    }
});

test("references use retained collection identity and require the correct root kind", () => {
    const hub = createDataHub();
    hub.submit(change("A", 1, [{t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: id(1), key: "self", value: {reference: "$root", kind: "map"}}}]));
    for (const value of [{reference: "$root", kind: "list"}, {reference: id(1), kind: "map"}, {reference: id(9), kind: "map"}]) {
        rejection(hub, change("B", 1, [{t: "node", id: {lamport: 2, actor: "B"}, origin: root, type: "entry", attrs: {id: id(2), key: "bad", value}}]));
    }
});

test("a change can reference a collection created later in its causal batch", () => {
    const hub = createDataHub();
    hub.submit(change("A", 1, [
        {t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: id(1), key: "child", value: {reference: id(2), kind: "list"}}},
        {t: "node", id: {lamport: 2, actor: "A"}, origin: root, type: "list", attrs: {id: id(2)}},
    ]));
    assert.equal(hub.serverSeq, 1);
});


test("conditional and staged admission reject before receipt or durable record preparation", () => {
    const hub = createDataHub({generation: "generation"});
    const request = change("A", 1, [{t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: id(1), key: "bad", value: {reference: id(9), kind: "map"}}}]);
    const base = {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion};
    let appends = 0;
    hub.onAppend = () => appends++; hub.onRecoveryPin = () => {}; hub.onSchemaChange = () => {};
    assert.throws(() => hub.submitConditional(request, base));
    assert.equal(hub.findChangeReceipt("generation", request).status, "unknown");
    assert.deepEqual(hub.recoveryReceiptState(), []);
    assert.throws(() => prepareDurableMutation(hub, () => hub.submit(request)));
    assert.equal(appends, 0); assert.equal(hub.serverSeq, 0);
});

test("the generic schema-only hub retains its original storage admission behavior", () => {
    const hub = new DocHub({schema: createDataSchema()});
    hub.submit(change("A", 1, [{t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: "legacy", key: "bad", value: {legacy: true}}}]));
    assert.equal(hub.serverSeq, 1);
});

test("malformed tags and missing required birth attributes fail admission", () => {
    for (const op of [
        {t: "unknown", at: {lamport: 1, actor: "A"}, ids: []},
        {t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: id(1), key: "x"}},
        {t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "map"},
    ]) rejection(createDataHub(), change("A", 1, [op as Op]));
});

test("data GC retains deleted IDs and replay cannot erase admission metadata", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    hub.submit(change("A", 1, doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops));
    hub.submit(change("A", 2, doc.edit([{op: "delete", at: [0], count: 1}]).ops));
    const before = hub.doc.snapshot(), seq = hub.serverSeq;
    assert.equal(hub.gc(), null); assert.equal(hub.serverSeq, seq);
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.throws(() => hub.replayGc(hub.serverSeq));
    assert.deepEqual(hub.doc.snapshot(), before);
    rejection(hub, change("A", 3, doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops));
});

test("fixed data schema rejects extension and reset starts a fresh ID generation", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    const request = change("A", 1, doc.edit([{op: "insert", at: [0], content: [entry(1)]}]).ops);
    hub.submit(request);
    const before = hub.doc.snapshot();
    const extended = createDataSchema(); extended.nodes.entry.attrs!.extra = {default: null};
    assert.throws(() => hub.transitionSchema(extended, {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion!}));
    assert.deepEqual(hub.doc.snapshot(), before);
    hub.reset("new-generation");
    hub.submit(request); assert.equal(hub.serverSeq, 1);
    rejection(hub, change("B", 1, [{t: "node", id: {lamport: 1, actor: "B"}, origin: root, type: "list", attrs: {id: id(1)}}]));
});

test("an entry cannot change between map and list semantics through movement", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    const birth = doc.edit([{op: "insert", at: [0], content: [{type: "list", attrs: {id: id(1)}, children: [entry(2, {scalar: 2}, "")]}]}]).ops;
    hub.submit(change("A", 1, birth));
    rejection(hub, change("A", 2, doc.edit([{op: "move", from: [0, 0], at: [1]}]).ops));
});

test("same-list movement and its history compensation remain admissible", () => {
    const hub = createDataHub(), doc = new Doc("A", createDataSchema());
    hub.submit(change("A", 1, doc.edit([{op: "insert", at: [0], content: [{type: "list", attrs: {id: id(1)}, children: [entry(2), entry(3)]}]}]).ops));
    hub.submit(change("A", 2, doc.edit([{op: "move", from: [0, 0], at: [0, 1]}]).ops));
    assert.deepEqual(hub.doc.toJSON().children![0].children!.map(node => node.attrs!.id), [id(3), id(2)]);
    hub.submit(change("A", 3, doc.edit([{op: "move", from: [0, 1], at: [0, 0]}]).ops));
    assert.deepEqual(hub.doc.toJSON().children![0].children!.map(node => node.attrs!.id), [id(2), id(3)]);
});


test("local data notifications can read values while hidden collection references are retained", () => {
    const data = new Client({schema: createDataSchema(), actor: "A"}), child = data.data.createMap();
    data.data.root.set("hidden", child); data.data.root.set("x", 0);
    const seen: unknown[] = [];
    data.subscribe({update: () => {seen.push(data.data.root.get("x")); assert.equal(data.data.root.has("hidden"), true);}});
    data.edit([{op: "delete", at: [0], count: 1}]);
    data.data.root.set("x", 1);
    assert.deepEqual(seen, [0, 1]);
    assert.deepEqual(data.notificationErrors, []);
    data.dispose();
});

test("local storage snapshots include pending edits and own all returned nested values", () => {
    const client = new LocalClient({actor: "A", schema: createDataSchema()});
    let notifications = 0;
    client.subscribe({update() {notifications++; assert.ok(client.snapshot().lines.length);}});
    const pending = client.apply([{op: "insert", at: [0], content: [entry(1)]}]);
    const stamp = client.stamp(), history = client.historyStatus(), snapshot = client.snapshot();
    assert.equal(notifications, 0); assert.throws(() => client.captureState(), /pending/);
    const stored = snapshot.lines.flatMap(line => line.items).find(item => item.b === "entry")!;
    const value = stored.a!.find(([key]) => key === "value")![1] as {scalar: number};
    value.scalar = 999; snapshot.lines.length = 0;
    assert.deepEqual(client.stamp(), stamp); assert.deepEqual(client.historyStatus(), history);
    assert.deepEqual(client.model().children![0].attrs!.value, {scalar: 1});
    assert.ok(client.snapshot().lines.flatMap(line => line.items).some(item => item.b === "entry"));
    client.commit(pending); assert.equal(notifications, 1); client.dispose();
    assert.throws(() => client.snapshot(), /disposed/);
});

test("Client snapshot reads pending local edits and data reads need no committed-state capture", () => {
    const data = new Client({schema: createDataSchema(), actor: "A"}), child = data.data.createMap();
    data.data.root.set("hidden", child); data.data.root.set("x", 0);
    const host = createEditorHost(data);
    const pending = host.apply([{op: "delete", at: [0], count: 1}]);
    const stamp = data.stamp();
    assert.equal(data.data.root.get("x"), 0); assert.equal(data.data.root.has("hidden"), true);
    assert.ok(data.snapshot().lines.flatMap(line => line.items).some(item => item.b === "map" && item.d?.length));
    assert.deepEqual(data.stamp(), stamp);
    host.commit(pending); data.dispose();
    const client = new Client({actor: "B", schema: createDataSchema()});
    client.edit([{op: "insert", at: [0], content: [entry(2)]}]);
    client.snapshot().lines.length = 0;
    assert.equal(client.model().children!.length, 1); client.dispose();
});

test("guarded Client.data accepts empty, Unicode and prototype-like keys, null and cyclic references", async () => {
    const hub = createDataHub(), pending: Change[] = [];
    const data = new Client({schema: createDataSchema(), actor: "A", transport: {
        subscribe(since, receive, epoch) {receive(hub.hello(since, epoch)); return hub.listen(receive);},
        async send(message) {if (message.kind === "change") pending.push(message.change); else if (message.kind === "ack") hub.ack(message.ack);},
        sendPresence() {},
    }});
    data.connect();
    const map = data.data.createMap(), list = data.data.createList();
    data.data.root.set("", null); data.data.root.set("한글😀", "문자열"); data.data.root.set("__proto__", false);
    data.data.root.set("map", map); data.data.root.set("root", data.data.root);
    map.set("list", list); list.push(map); list.push(null); list.push(data.data.root);
    for (let turn = 0; turn < 30; turn++) {await Promise.resolve(); for (const request of pending.splice(0)) hub.submit(request);}
    assert.equal(data.data.root.get(""), null); assert.equal(data.data.root.get("한글😀"), "문자열");
    assert.equal(data.data.root.get("__proto__"), false); assert.equal(data.data.root.get("root"), data.data.root);
    assert.equal(map.get("list"), list); assert.equal(list.at(0)!.value, map);
    assert.equal(list.at(1)!.value, null); assert.equal(list.at(2)!.value, data.data.root);
    const storedList = hub.doc.toJSON().children!.find(node => node.type === "list")!;
    assert.equal(storedList.children![1].attrs!.key, "");
    assert.deepEqual(storedList.children![1].attrs!.value, {scalar: null});
    assert.deepEqual(data.model(), hub.doc.toJSON());
    data.clearHistory(); data.disconnect(); data.dispose();
});

test("accepted conditional and recovery retries reject raw accessors before receipt shortcuts", () => {
    const hub = createDataHub({generation: "generation"});
    hub.onRecoveryPin = () => {};
    const request = change("A", 1, [{t: "node", id: {lamport: 1, actor: "A"}, origin: root, type: "entry", attrs: {id: id(1), key: "x", value: {scalar: null}}}]);
    const base = {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion};
    assert.equal(hub.submitConditional(request, base).serverSeq, 1);
    assert.equal(hub.submitConditional(request, base).serverSeq, 1);
    assert.equal(hub.reserveRecovery("generation", "A", "reservation", null).status, "protected");
    assert.equal(hub.submitRecovery("generation", "reservation", hub.schemaVersion, request).status, "accepted");
    let getters = 0;
    const hostile = structuredClone(request);
    const op = hostile.ops[0]; assert.equal(op.t, "node");
    op.attrs!.value = Object.defineProperty({}, "scalar", {enumerable: true, get() {getters++; return null;}});
    const before = hub.doc.snapshot(), seq = hub.serverSeq;
    assert.throws(() => hub.submitConditional(hostile, base), /Data:/);
    assert.throws(() => hub.submitRecovery("generation", "reservation", hub.schemaVersion, hostile), /Data:/);
    assert.equal(getters, 0); assert.equal(hub.serverSeq, seq); assert.deepEqual(hub.doc.snapshot(), before);
});
