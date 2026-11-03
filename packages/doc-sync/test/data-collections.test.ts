import {Client} from "../src/client/index.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {SharedMap, SharedList, createDataSchema} from "../src/data/index.ts";
import {DocHub} from "../src/server/hub.ts";
import type {Outbound, Transport} from "../src/sync/protocol.ts";

function network() {
    const hub = new DocHub({schema: createDataSchema()}), pending: Outbound[] = [];
    const clients: Client[] = [];
    function peer(actor: string) {
        const transport: Transport = {
            subscribe(since, receive, epoch) { receive(hub.hello(since, epoch)); return hub.listen(receive); },
            async send(message) { pending.push(message); }, sendPresence() {},
        };
        const client = new Client({schema: createDataSchema(), actor, transport}); clients.push(client); client.connect(); return client;
    }
    async function flush(reverse: boolean | string[] = false) {
        for (let turn = 0; turn < 20; turn++) {
            await Promise.resolve();
            // Reverse actor groups while retaining per-actor causal operation order.
            const batch = pending.splice(0), actors = [...new Set(batch.filter(item => item.kind === "change").map(item => item.change.actor))];
            if (Array.isArray(reverse)) actors.sort((a, b) => reverse.indexOf(a) - reverse.indexOf(b));
            else if (reverse) actors.reverse();
            for (const actor of actors) for (const item of batch) if (item.kind === "change" && item.change.actor === actor) hub.submit(item.change);
            for (const item of batch) if (item.kind === "ack") hub.ack(item.ack);
        }
    }
    return {peer, flush, dispose() { clients.forEach(client => {client.clearHistory(); client.disconnect(); client.dispose();}); }};
}

test("map scalar values, missing/null and dangerous keys remain distinct", () => {
    const client = new Client({schema: createDataSchema(), actor: "A"}), map = client.data.root;
    assert.equal(map.get("missing"), undefined); assert.equal(map.has("missing"), false);
    for (const [key, value] of [["", null], ["__proto__", "safe"], ["constructor", false], ["toString", 4], ["a.b", "문자열"]] as const) map.set(key, value);
    assert.equal(map.has(""), true); assert.equal(map.get(""), null); assert.equal(map.get("__proto__"), "safe"); assert.equal(map.size, 5);
    assert.equal(map.delete("missing"), false); assert.equal(map.delete(""), true); assert.equal(map.has(""), false);
    client.undo(); assert.equal(map.get(""), null); client.redo(); assert.equal(map.has(""), false);
    client.dispose();
});

test("list IDs survive moves, replacement, undo, redo and capture/restore", () => {
    const client = new Client({schema: createDataSchema(), actor: "A"}), list = client.data.createList(); client.data.root.set("items", list);
    const a = list.push("a"), b = list.push("b"), c = list.insert(1, "c");
    assert.deepEqual(list.entries().map(entry => entry.id), [a, c, b]);
    list.move(a, 2); assert.deepEqual(list.entries().map(entry => entry.id), [c, b, a]);
    list.set(a, null); assert.equal(list.get(a), null); client.undo(); assert.equal(list.get(a), "a");
    client.undo(); assert.deepEqual(list.entries().map(entry => entry.id), [a, c, b]); client.redo();
    list.delete(c); client.undo(); assert.equal(list.get(c), "c");
    const restored = Client.fromState(client.captureState(), {schema: createDataSchema()}), copy = restored.data.getList(list.id)!;
    assert.ok(restored.data.root.get("items") instanceof SharedList); assert.deepEqual(copy.entries(), list.entries());
    assert.equal(restored.data.root.get("items"), copy); assert.equal(copy.get(a), "a");
    restored.redo(); assert.equal(copy.get(c), undefined); restored.undo(); assert.equal(copy.get(c), "c");
    client.dispose(); restored.dispose();
});

test("shared maps/lists use explicit same-document references, including graph cycles", () => {
    const client = new Client({schema: createDataSchema()}), map = client.data.createMap(), list = client.data.createList();
    client.data.root.set("map", map); map.set("list", list); list.push(map);
    assert.equal(client.data.root.get("map"), map); assert.equal(map.get("list"), list); assert.equal(list.at(0)?.value, map);
    assert.ok(map instanceof SharedMap); const other = new Client({schema: createDataSchema()});
    assert.throws(() => map.set("foreign", other.data.root), /another client/); assert.equal(map.has("foreign"), false);
    client.clearHistory(); const spare = client.data.createMap(); assert.equal(client.historyStatus().canUndo, false); assert.equal(client.data.getMap(spare.id), spare);
    client.dispose(); other.dispose();
});

test("invalid input and local policy failure have no edits, notifications or history", () => {
    let calls = 0, client: Client;
    client = new Client({schema: createDataSchema(), data: {validate(write) {
        calls++;
        if (write.key === "bad") throw new Error("policy rejected");
        if (write.key === "reenter") client.data.root.set("oops", 1);
    }}});
    const list = client.data.createList(); client.clearHistory(); let updates = 0; client.subscribe({update: () => updates++});
    client.data.root.entries(); void list.length; const before = client.captureState();
    for (const value of [undefined, NaN, Infinity, {}, [], 1n, () => 1]) assert.throws(() => client.data.root.set("x", value as never), /finite scalar/);
    assert.throws(() => client.data.root.set("bad", 1), /policy rejected/);
    assert.throws(() => client.data.root.set("reenter", 1), /validator mutation/);
    assert.throws(() => list.insert(-1, 3), /index/); assert.throws(() => list.move("absent", 0), /not visible/);
    assert.deepEqual(client.captureState(), before); assert.equal(updates, 0); assert.equal(calls, 2); assert.equal(client.historyStatus().canUndo, false);
    client.dispose();
});

for (const reverse of [false, true]) test(`concurrent empty roots merge keywise and duplicate keys deterministically (${reverse})`, async () => {
    const net = network(), a = net.peer("A"), b = net.peer("B");
    a.data.root.set("left", 1); a.data.root.set("same", "A"); b.data.root.set("right", 2); b.data.root.set("same", "B"); await net.flush(reverse);
    assert.deepEqual(a.data.root.entries(), b.data.root.entries()); assert.equal(a.data.root.size, 3);
    assert.equal(a.data.root.get("left"), 1); assert.equal(a.data.root.get("right"), 2);
    a.data.root.set("same", "later"); await net.flush(); assert.equal(b.data.root.get("same"), "later");
    a.data.root.delete("same"); await net.flush(); assert.equal(b.data.root.has("same"), false);
    a.undo(); await net.flush(); assert.equal(a.data.root.get("same"), "later"); assert.deepEqual(a.data.root.entries(), b.data.root.entries());
    a.undo(); await net.flush(); assert.notEqual(a.data.root.get("same"), "later");
    net.dispose();
});

test("own register undo preserves peer register writes and independent map keys", async () => {
    const net = network(), a = net.peer("A"), b = net.peer("B");
    a.data.root.set("x", 0); await net.flush(); a.clearHistory(); b.clearHistory();
    a.data.root.set("x", 1); await net.flush(); b.data.root.set("x", 2); b.data.root.set("peer", 3); await net.flush();
    a.undo(); await net.flush(); assert.equal(a.data.root.get("x"), 2); assert.equal(a.data.root.get("peer"), 3); assert.deepEqual(a.data.root.entries(), b.data.root.entries());
    a.redo(); await net.flush(); assert.equal(a.data.root.get("x"), 2); net.dispose();
});

test("concurrent list insertion, edits and moves converge with stable IDs", async () => {
    const net = network(), a = net.peer("A"), b = net.peer("B"), listA = a.data.createList(); a.data.root.set("items", listA); await net.flush();
    const listB = b.data.getList(listA.id)!, first = listA.push("first"); await net.flush();
    const x = listA.insert(0, "A"), y = listB.insert(0, "B"); await net.flush(true);
    assert.deepEqual(listA.entries(), listB.entries()); assert.equal(listA.length, 3);
    listA.move(first, 0); listB.set(y, "peer"); await net.flush();
    assert.deepEqual(listA.entries(), listB.entries()); assert.equal(listA.get(y), "peer"); assert.equal(listA.get(x), "A");
    a.undo(); await net.flush(); assert.equal(listA.get(y), "peer"); assert.deepEqual(listA.entries(), listB.entries());
    net.dispose();
});

test("concurrent collection allocation and undo do not hide peer descendants", async () => {
    const net = network(), a = net.peer("A"), b = net.peer("B");
    const mapA = a.data.createMap(), listB = b.data.createList(); a.data.root.set("a", mapA); b.data.root.set("b", listB); await net.flush(true);
    const peerMapA = b.data.getMap(mapA.id)!, peerListB = a.data.getList(listB.id)!;
    peerMapA.set("peer", 9); peerListB.push(10); await net.flush();
    a.undo(); await net.flush(); // Undo this actor's last list entry insertion.
    a.undo(); await net.flush(); // Undo root link, never structural allocation.
    assert.equal(a.data.getMap(mapA.id)!.get("peer"), 9); assert.equal(b.data.getMap(mapA.id)!.get("peer"), 9);
    assert.equal(a.data.getList(listB.id), peerListB); assert.deepEqual(a.data.root.entries().map(([key]) => key), b.data.root.entries().map(([key]) => key)); net.dispose();
});

test("deterministic randomized list mutations match a sequential array oracle", () => {
    const client = new Client({schema: createDataSchema()}), list = client.data.createList(), oracle: Array<{id: string; value: number}> = [];
    let seed = 17; const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    for (let step = 0; step < 150; step++) {
        const op = random(4), index = oracle.length ? random(oracle.length) : 0;
        if (!oracle.length || op === 0) { const at = random(oracle.length + 1), id = list.insert(at, step); oracle.splice(at, 0, {id, value: step}); }
        else if (op === 1) { list.delete(oracle[index].id); oracle.splice(index, 1); }
        else if (op === 2) { list.set(oracle[index].id, step); oracle[index].value = step; }
        else { const at = random(oracle.length), [entry] = oracle.splice(index, 1); list.move(entry.id, at); oracle.splice(at, 0, entry); }
        assert.deepEqual(list.entries(), oracle);
    }
    client.dispose();
});

for (const order of [["A", "B", "C"], ["A", "C", "B"], ["B", "A", "C"], ["B", "C", "A"], ["C", "A", "B"], ["C", "B", "A"]]) test(`three-peer delivery permutation ${order.join("")} preserves collection convergence`, async () => {
    const net = network(), peers = [net.peer("A"), net.peer("B"), net.peer("C")], initial = peers[0].data.createList();
    const first = initial.push("first"), second = initial.push("second"); await net.flush();
    const lists = peers.map(peer => peer.data.getList(initial.id)!);
    for (let at = 0; at < peers.length; at++) {
        peers[at].clearHistory(); peers[at].data.root.set(`key${at}`, at); peers[at].data.root.set("same", at);
        lists[at].insert(1, at); lists[at].set(first, at); lists[at].move(second, at);
    }
    await net.flush(order);
    for (const peer of peers) assert.deepEqual(peer.data.root.entries(), peers[0].data.root.entries());
    for (const list of lists) assert.deepEqual(list.entries(), lists[0].entries());
    assert.equal(lists[0].length, 5); assert.equal(peers[0].data.root.size, 4);
    peers[1].undo(); await net.flush([...order].reverse());
    for (const list of lists) assert.deepEqual(list.entries(), lists[0].entries());
    peers[1].redo(); await net.flush(order);
    for (const list of lists) assert.deepEqual(list.entries(), lists[0].entries());
    net.dispose();
});

test("client actor validation is unchanged and collection IDs do not encode actors", () => {
    for (const actor of ["alice@example.com", "bot:1", "작업자"]) assert.throws(() => new Client({schema: createDataSchema(), actor}), /Invalid local actor/);
    const client = new Client({schema: createDataSchema(), actor: "valid~actor-1"}), map = client.data.createMap();
    assert.match(map.id, /^data:[0-9a-f-]+$/); assert.equal(map.id.includes(client.actor), false);
    assert.throws(() => map.set("invalid", {} as never), /finite scalar/); assert.deepEqual(map.entries(), []); client.dispose();
});
