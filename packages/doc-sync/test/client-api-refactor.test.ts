import assert from "node:assert/strict";
import {test} from "node:test";
import {Client, createEditorHost} from "../src/client/index.ts";
import {overrideEditorView} from "../src/client/editor-session.ts";
import {createDataSchema} from "../src/data/index.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {EditorObserver} from "../src/editor/host-contract.ts";
import type {EditOp} from "../src/crdt/model.ts";
import type {Transport} from "../src/sync/protocol.ts";

const schema: Schema = {root: "book", marks: [], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const transport: Transport = {subscribe() { return () => {}; }, async send() {}, sendPresence() {}};
const insert = (content: string, offset = 0): EditOp[] => [{op: "insert", at: [0, offset], content}];

// This helper must not eagerly evaluate optional or future host getters.
test("editor view overrides preserve descriptors and normal method receivers", () => {
    let reads = 0, value = 1;
    const symbol = Symbol("extension");
    const base = {
        get live() { reads++; return value; },
        method() { return this; },
        [symbol]: "optional",
    };
    Object.defineProperty(base, "hidden", {value: 9, enumerable: false});
    const host = overrideEditorView(base, {});
    assert.equal(reads, 0);
    value = 2; assert.equal(host.live, 2); assert.equal(reads, 1);
    assert.equal(host.method(), host);
    assert.equal(host[symbol], "optional");
    assert.deepEqual(Object.getOwnPropertyDescriptor(host, "hidden"), Object.getOwnPropertyDescriptor(base, "hidden"));
    assert.equal(Object.getOwnPropertyDescriptor(host, "live")!.get, Object.getOwnPropertyDescriptor(base, "live")!.get);
});

test("sync dispatch retains observer receivers, removal order and fresh event payloads", () => {
    const client = new Client({schema, actor: "A", transport});
    const source = createEditorHost(client), sibling = createEditorHost(client);
    const seen: (readonly EditOp[])[] = [];
    let own = 0, removed = 0, updates = 0, stopRemoved = () => {};
    source.subscribe({modelEvents() { own++; }});
    const observer: EditorObserver = {
        modelEvents(edits) {
            assert.equal(this, observer);
            seen.push(edits);
            stopRemoved();
            assert.throws(() => source.apply(insert("bad")), /observer/);
        },
        update() { assert.equal(this, observer); updates++; },
    };
    const stop = sibling.subscribe(observer);
    stopRemoved = sibling.subscribe({modelEvents() { removed++; }});
    source.commit(source.apply(insert("a")));
    source.commit(source.apply(insert("b", 1)));
    assert.deepEqual({own, removed, updates}, {own: 0, removed: 0, updates: 2});
    assert.equal(seen.length, 2); assert.notEqual(seen[0], seen[1]);
    stop(); stop();
    const resume = sibling.subscribe(observer);
    source.commit(source.apply(insert("c", 2)));
    assert.equal(seen.length, 3); assert.equal(client.notificationErrors.length, 0);
    resume(); client.disconnect();
});

test("sync wrapped sessions retain detached methods and pending ownership after nested begin", () => {
    const client = new Client({schema, actor: "A", transport});
    const host = createEditorHost(client), sibling = createEditorHost(client);
    const session = host.createSession(), {begin, apply, commit, end} = session;
    begin(); begin(); commit(apply(insert("draft")));
    assert.equal(session.active, true);
    const pending = sibling.apply(insert("peer"));
    assert.throws(() => end(), /pending/); assert.equal(session.active, true);
    sibling.commit(pending); end(); assert.equal(session.active, false);
    assert.equal(client.historyStatus().canUndo, true);
    client.undo();
    assert.deepEqual(client.model().children?.[0].runs, [{text: "peer", marks: {}}]);
    client.disconnect();
});

test("sync fallback payloads isolate registered observers within and across events", () => {
    const client = new Client({schema, actor: "A", transport});
    const source = createEditorHost(client), sibling = createEditorHost(client);
    type Info = Parameters<NonNullable<EditorObserver["modelEvents"]>>[1];
    const payloads: {edits: readonly EditOp[]; info: Info}[] = [];
    const received: {edits: readonly EditOp[]; info: Info}[] = [];
    const order: string[] = [];
    let guards = 0;
    const first: EditorObserver = {modelEvents(edits, info) {
        assert.equal(this, first);
        order.push("first"); payloads.push({edits, info});
        info.cause = "remote"; info.fallback = false;
        // Exercise runtime ownership, even though consumers see a readonly array.
        (edits as EditOp[]).push(...insert("observer mutation"));
        assert.throws(() => source.apply(insert("blocked")), /observer/); guards++;
    }};
    const second: EditorObserver = {modelEvents(edits, info) {
        assert.equal(this, second);
        order.push("second"); payloads.push({edits, info});
        received.push({edits: [...edits], info: {...info}});
        assert.throws(() => source.apply(insert("blocked")), /observer/); guards++;
    }};
    const stopFirst = sibling.subscribe(first), stopSecond = sibling.subscribe(second);
    try {
        source.commit(source.apply(insert("a")));
        // A second successful edit also verifies that the notification guard released.
        source.commit(source.apply(insert("b", 1)));
        assert.deepEqual(order, ["first", "second", "first", "second"]);
        assert.deepEqual(received, [
            {edits: [], info: {cause: "local", fallback: true}},
            {edits: [], info: {cause: "local", fallback: true}},
        ]);
        assert.equal(new Set(payloads.map(value => value.edits)).size, 4);
        assert.equal(new Set(payloads.map(value => value.info)).size, 4);
        assert.equal(guards, 4);
        assert.deepEqual(client.notificationErrors, []);
        assert.deepEqual(client.model().children?.[0].runs, [{text: "ab", marks: {}}]);
    } finally { stopFirst(); stopSecond(); client.disconnect(); }
});

test("lazy data policy retains Client receiver and restores guard after a throw", () => {
    let receiver: unknown, reject = true;
    const client = new Client({schema: createDataSchema(), data: {validate() {
        receiver = this;
        assert.throws(() => client.data.createMap(), /validator mutation/);
        if (reject) throw new Error("denied");
    }}});
    const data = client.data;
    assert.throws(() => data.root.set("key", 1), /denied/);
    assert.equal(receiver, client); assert.equal(client.data, data);
    reject = false; data.root.set("key", 2); assert.equal(data.root.get("key"), 2);
    client.dispose();
});
