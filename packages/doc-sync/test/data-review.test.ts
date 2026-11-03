import {Client} from "../src/client/index.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {createDataSchema} from "../src/data/index.ts";
import {DocHub} from "../src/server/hub.ts";
import type {Outbound, Transport} from "../src/sync/protocol.ts";

function peers() {
    const hub = new DocHub({schema: createDataSchema()}), pending: Outbound[] = [];
    const clients: Client[] = [];
    const peer = (actor: string) => {
        const transport: Transport = {
            subscribe(since, receive, epoch) { receive(hub.hello(since, epoch)); return hub.listen(receive); },
            async send(message) { pending.push(message); }, sendPresence() {},
        };
        const client = new Client({schema: createDataSchema(), actor, transport}); clients.push(client); client.connect(); return client;
    };
    const flush = async () => {
        for (let turn = 0; turn < 20; turn++) {
            await Promise.resolve();
            for (const message of pending.splice(0)) {
                if (message.kind === "change") hub.submit(message.change);
                else if (message.kind === "ack") hub.ack(message.ack);
            }
        }
    };
    return {peer, flush, async close() {
        clients.forEach(client => client.clearHistory()); await flush();
        for (const client of clients) {client.disconnect(); client.dispose();}
    }};
}

test("duplicate map deletion undo restores peer value and redo removes observed candidates", async () => {
    const net = peers(), a = net.peer("A"), b = net.peer("B");
    a.data.root.set("same", "a"); b.data.root.set("same", "b"); await net.flush();
    a.clearHistory(); b.clearHistory();
    a.data.root.delete("same"); b.data.root.set("same", "peer"); await net.flush();
    assert.equal(a.data.root.has("same"), false);
    a.undo(); await net.flush(); assert.equal(a.data.root.get("same"), "peer");
    a.redo(); await net.flush(); assert.equal(a.data.root.has("same"), false);
    assert.deepEqual(a.data.root.entries(), b.data.root.entries()); await net.close();
});

test("list deletion undo retains concurrent peer value and placement", async () => {
    const net = peers(), a = net.peer("A"), b = net.peer("B"), left = a.data.createList();
    const first = left.push(1), second = left.push(2); await net.flush();
    const right = b.data.getList(left.id)!; a.clearHistory(); b.clearHistory();
    left.delete(first); right.set(first, 9); right.move(first, 1); await net.flush();
    assert.equal(left.get(first), undefined); a.undo(); await net.flush();
    assert.deepEqual(left.entries(), [{id: second, value: 2}, {id: first, value: 9}]);
    assert.deepEqual(left.entries(), right.entries()); await net.close();
});

test("undoing last reference retains peer data through the collection handle", async () => {
    const net = peers(), a = net.peer("A"), b = net.peer("B"), child = a.data.createMap();
    a.data.root.set("child", child); await net.flush();
    b.data.getMap(child.id)!.set("peer", 7); await net.flush();
    a.undo(); await net.flush();
    assert.equal(a.data.root.has("child"), false); assert.equal(child.get("peer"), 7);
    assert.equal(b.data.getMap(child.id)!.get("peer"), 7); await net.close();
});

test("stale handles reject writes and cross-client handles cannot change ownership", () => {
    const a = new Client({schema: createDataSchema()}), child = a.data.createMap(), b = new Client({schema: createDataSchema()});
    a.edit([{op: "delete", at: [0], count: 1}]);
    assert.throws(() => child.set("x", 1), /not visible/);
    assert.throws(() => b.data.root.set("child", child), /another client/);
    assert.equal(b.data.root.has("child"), false); a.dispose(); b.dispose();
});

test("duplicate storage IDs fail closed without aliasing two collections", () => {
    const client = new Client({schema: createDataSchema()}), map = client.data.createMap();
    client.edit([{op: "insert", at: [1], content: [{type: "list", attrs: {id: map.id}, children: []}]}]);
    assert.throws(() => client.data.root.entries(), /storage ID/); client.dispose();
});

test("a rejected duplicate-key deletion cannot change the cached winner", () => {
    const client = new Client({schema: createDataSchema(), data: {validate(write) {if (write.operation === "delete") throw new Error("rejected");}}});
    client.edit([{op: "insert", at: [0], content: [
        {type: "entry", attrs: {id: "data:00000000-0000-4000-8000-000000000001", key: "same", value: {scalar: "a"}}},
        {type: "entry", attrs: {id: "data:ffffffff-ffff-4fff-8fff-ffffffffffff", key: "same", value: {scalar: "z"}}},
    ]}]);
    assert.equal(client.data.root.get("same"), "z");
    const before = client.captureState();
    assert.throws(() => client.data.root.delete("same"), /rejected/);
    assert.deepEqual(client.captureState(), before);
    assert.equal(client.data.root.get("same"), "z"); client.dispose();
});

test("public helper results cannot mutate cached collection values or paths", () => {
    const client = new Client({schema: createDataSchema()}); client.data.root.set("x", 1);
    const candidates = client.data.root.candidates("x"), item = candidates[0];
    assert.throws(() => (candidates as unknown as unknown[]).pop(), TypeError);
    assert.throws(() => {item.path[0] = 999;}, TypeError);
    assert.throws(() => {item.node.attrs!.value = {scalar: 99};}, TypeError);
    assert.equal(client.data.root.get("x"), 1); client.data.root.set("x", 2);
    assert.equal(client.data.root.get("x"), 2); client.dispose();
});

for (const value of [{}, {scalar: 1, reference: "$root", kind: "map"}, {reference: "$root", kind: "list"}, {reference: "missing", kind: "map"}, {scalar: {nested: true}}]) {
    test(`malformed stored value fails closed: ${JSON.stringify(value)}`, () => {
        const client = new Client({schema: createDataSchema()});
        client.edit([{op: "insert", at: [0], content: [{type: "entry", attrs: {id: `data:${globalThis.crypto.randomUUID()}`, key: "bad", value}}]}]);
        assert.throws(() => client.data.root.get("bad"), /Data:/); client.dispose();
    });
}
