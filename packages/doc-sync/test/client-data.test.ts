import assert from "node:assert/strict";
import {test} from "node:test";
import {Client, clientOwner} from "../src/client/index.ts";
import {LocalClient} from "../src/local/client.ts";
import {createDataSchema, SharedList, SharedMap} from "../src/data/index.ts";
import * as dataExports from "../src/data/index.ts";
import type {Schema} from "../src/crdt/schema.ts";

const schema = createDataSchema;

test("client.data attaches once without changing backend, model, history or notifications", () => {
    const client = new Client({schema: schema(), actor: "data-owner"});
    const owner = clientOwner(client), before = client.captureState(); let updates = 0;
    const stop = client.subscribe({update() { updates++; }});
    assert.ok(owner instanceof LocalClient);
    assert.equal(client.data, client.data);
    assert.equal(clientOwner(client), owner);
    assert.deepEqual(client.captureState(), before);
    assert.equal(updates, 0); assert.equal(client.sync, null);
    assert.equal(client.data.root, client.data.getMap("$root"));
    assert.deepEqual(Object.keys(dataExports).sort(), ["SharedList", "SharedMap", "createDataSchema"]);
    for (const key of ["client", "connect", "undo", "dispose", "captureState"]) assert.equal(key in client.data, false);
    stop(); client.dispose();
});

test("same-client namespace references retain identity and foreign references fail", () => {
    const client = new Client({schema: schema()}), other = new Client({schema: schema()});
    const map = client.data.createMap(), list = client.data.createList();
    client.data.root.set("map", map); map.set("list", list); list.push(map);
    assert.ok(map instanceof SharedMap); assert.ok(list instanceof SharedList);
    assert.equal(client.data.getMap(map.id), map); assert.equal(client.data.getList(list.id), list);
    assert.equal(client.data.root.get("map"), map); assert.equal(list.at(0)?.value, map);
    assert.throws(() => map.set("foreign", other.data.root), /another client/);
    client.dispose(); other.dispose();
});

test("Client history and capture/restore retain data handles and optional local policy", () => {
    const client = new Client({schema: schema()}), list = client.data.createList();
    client.data.root.set("list", list); const entry = list.push("first");
    list.set(entry, "second"); client.undo(); assert.equal(list.get(entry), "first");
    const saved = client.captureState();
    const restored = Client.fromState(saved, {schema: schema(), data: {validate(write) {
        if (write.value === "blocked") throw new Error("blocked local write");
    }}});
    const copy = restored.data.getList(list.id)!;
    assert.equal(restored.data.root.get("list"), copy); restored.redo(); assert.equal(copy.get(entry), "second");
    assert.throws(() => copy.set(entry, "blocked"), /blocked local write/);
    assert.equal(copy.get(entry), "second");
    const noPolicy = Client.fromState(saved, {schema: schema()});
    noPolicy.data.getList(list.id)!.set(entry, "blocked");
    assert.equal(noPolicy.data.getList(list.id)!.get(entry), "blocked");
    assert.equal(saved.format, "doc-sync-local-state-v1");
    client.dispose(); restored.dispose(); noPolicy.dispose();
});

test("local data validators block Client mutations but allow reads", () => {
    let action = () => {};
    const client = new Client({schema: schema(), data: {validate() {
        assert.equal(client.data.root.get("stable"), 1); client.model(); client.historyStatus();
        action();
    }}});
    // Raw edits are the advanced schema API and are outside the data policy.
    client.edit([{op: "insert", at: [0], content: [{type: "entry", attrs: {
        id: `data:${crypto.randomUUID()}`, key: "stable", value: {scalar: 1},
    }}]}]);
    const list = client.data.createList(); client.clearHistory(); const before = client.captureState(); let updates = 0;
    client.subscribe({update() { updates++; }});
    for (const mutate of [
        () => client.data.root.set("nested", 2), () => client.data.createMap(), () => list.push(2),
        () => client.edit([]), () => client.undo(), () => client.redo(), () => client.clearHistory(),
        () => client.connect(), () => client.disconnect(), () => client.dispose(),
    ]) {
        action = mutate;
        assert.throws(() => client.data.root.set("outer", 3), /validator mutation/);
        assert.deepEqual(client.captureState(), before);
    }
    assert.equal(updates, 0); action = () => {}; client.data.root.set("allowed", true);
    assert.equal(client.data.root.get("allowed"), true); client.dispose();
});

test("data attachment rejects document, graphic and modified data schemas without edits", () => {
    const document: Schema = {root: "book", marks: [], nodes: {
        book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"},
    }};
    const graphic: Schema = {domain: "graphic", root: "canvas", marks: [], nodes: {canvas: {shape: "container", children: []}}};
    const modified = schema(); modified.nodes.entry.ui = {label: "changed"};
    for (const value of [document, graphic, modified]) {
        const client = new Client({schema: value}), before = client.captureState();
        assert.throws(() => client.data, /requires createDataSchema/);
        assert.throws(() => client.data, /requires createDataSchema/);
        assert.deepEqual(client.captureState(), before); client.dispose();
    }
});
