import assert from "node:assert/strict";
import {test} from "node:test";
import {createPresenceStore, connectClientPresence, PRESENCE_METADATA_KEY} from "../src/presence/index.ts";
import {Client, createEditorHost} from "../src/client/index.ts";
import {DocHub} from "../src/server/hub.ts";
import type {PresenceState} from "../src/presence/index.ts";
import type {Presence, Transport} from "../src/sync/protocol.ts";
import type {Schema} from "../src/crdt/schema.ts";
const cursor = {kind: "document", anchor: "token:A:1"} as const;
const remote = (actor = "B", updatedAt = 1): PresenceState => ({actor, cursor, updatedAt});

test("presence snapshots are stable immutable validated bounded copies", () => {
    let now = 1;
    const store = createPresenceStore({actor: "A", now: () => now, maxActors: 2});
    const empty = store.getSnapshot(); assert.equal(empty, store.getSnapshot());
    let calls = 0; const stop = store.subscribe(() => calls++);
    const ids = ["shape"];
    store.updateLocal({cursor: {kind: "graphic", objectIds: ids, pointer: {x: 1.5, y: -3}}});
    ids.push("other");
    const first = store.getSnapshot();
    assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first[0]));
    assert.deepEqual(first[0].cursor, {kind: "graphic", objectIds: ["shape"], pointer: {x: 1.5, y: -3}});
    assert.throws(() => (first as PresenceState[]).push(remote()));
    store.receive(remote()); assert.throws(() => store.receive(remote("C")), /limit/);
    const before = store.getSnapshot();
    for (const value of [
        {...remote(), actor: ""}, {...remote(), updatedAt: NaN}, {...remote(), cursor: {...cursor, extra: 1}},
        {...remote(), cursor: {kind: "graphic", objectIds: [], pointer: {x: Infinity, y: 0}}},
        {...remote(), draft: {target: cursor, text: "x", composing: true, selection: {start: 0, end: 2, direction: "none"}}},
        {...remote(), draft: {target: cursor, text: "x".repeat(4097), composing: true}},
    ]) { assert.throws(() => store.receive(value as PresenceState)); assert.equal(store.getSnapshot(), before); }
    assert.equal(calls, 2);
    stop(); stop(); now++; store.updateLocal({cursor: null}); assert.equal(calls, 2);
    assert.equal(store.getSnapshot()[0].cursor, undefined);
    store.clearLocal(); assert.deepEqual(store.getSnapshot().map(state => state.actor), ["B"]);
    store.dispose(); assert.deepEqual(store.getSnapshot(), []); store.dispose();
    assert.throws(() => store.updateLocal({activity: "active"}), /disposed/);
    assert.throws(() => store.subscribe(() => {}), /disposed/);
});

test("expiry uses receipt time and requires no timers; listener errors and disposal are isolated", () => {
    let now = 10, calls = 0;
    const store = createPresenceStore({actor: "A", ttlMs: 20, now: () => now});
    store.subscribe(() => { throw new Error("bad observer"); }); store.subscribe(() => calls++);
    store.updateLocal({activity: "idle"}); store.receive(remote("B", 1e12));
    now = 29; store.expire(); assert.equal(store.getSnapshot().length, 2);
    now = 30; store.expire(); assert.deepEqual(store.getSnapshot().map(s => s.actor), ["A"]);
    assert.equal(calls, 3); store.dispose(); assert.equal(calls, 4);
    assert.equal(store.getSnapshot().length, 0);
});

test("spreadsheet UTF16 drafts retain IME composition without document changes", () => {
    const store = createPresenceStore({actor: "A", now: () => 1});
    const target = {kind: "spreadsheet", sheetId: "sheet", rowId: "row-stable", columnId: "col-stable"} as const;
    store.updateLocal({selection: target, draft: {target, text: "가😀", composing: true, selection: {start: 1, end: 3, direction: "backward"}}});
    assert.equal(store.getSnapshot()[0].draft?.composing, true);
    assert.equal(store.getSnapshot()[0].draft?.selection?.end, 3);
    store.updateLocal({draft: null}); assert.equal(store.getSnapshot()[0].draft, undefined); store.dispose();
});

const schema: Schema = {root: "book", marks: [], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
function setup(hub: DocHub, actor: string) {
    const sent: Presence[] = [];
    const transport: Transport = {
        subscribe(since, receive, epoch) { receive(hub.hello(since, epoch)); return hub.listen(receive); },
        async send(message) { if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence(value) { sent.push(value); hub.setPresence(value); },
    };
    const client = new Client({actor, schema, transport, profile: {name: actor, metadata: {profileField: "kept"}}});
    client.connect();
    return {client, sent};
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const text = (client: Client) => client.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join("");

test("client bridge preserves normal editor anchors/metadata, selective history, clear and reconnect", async () => {
    const hub = new DocHub({schema});
    const a = setup(hub, "A"), b = setup(hub, "B");
    const sa = createPresenceStore({actor: "A", now: () => 100}), sb = createPresenceStore({actor: "B", now: () => 100});
    const original = a.client.sync!.setPresence;
    const ca = connectClientPresence(sa, a.client, {intervalMs: 0}), cb = connectClientPresence(sb, b.client.sync!, {intervalMs: 0});
    assert.throws(() => connectClientPresence(sa, a.client), /already/);
    a.client.setPresence({anchor: "first", focus: "first", metadata: {editorField: "one"}});
    sa.updateLocal({draft: {target: cursor, text: "조합", composing: true}});
    assert.equal(sb.getSnapshot().find(s => s.actor === "A")?.draft?.composing, true);
    const host = createEditorHost(a.client);
    host.setPresence({anchor: "latest", focus: "latest-focus", metadata: {editorField: "two"}});
    sa.updateLocal({activity: "active"});
    assert.equal(a.sent.at(-1)?.anchor, "latest"); assert.equal(a.sent.at(-1)?.focus, "latest-focus");
    assert.equal(a.sent.at(-1)?.metadata?.editorField, "two");
    assert.ok(a.sent.at(-1)?.metadata?.[PRESENCE_METADATA_KEY]);
    // Presence never creates history. Two users retain their own undo records.
    assert.deepEqual(a.client.historyStatus(), {canUndo: false, canRedo: false});
    a.client.edit([{op: "insert", at: [0, 0], content: "a"}]); await flush();
    b.client.edit([{op: "insert", at: [0, 1], content: "b"}]); await flush();
    assert.equal(text(a.client), "ab");
    assert.equal(sa.getSnapshot().find(s => s.actor === "A")?.draft?.composing, true);
    a.client.undo(); await flush(); assert.equal(text(a.client), "b"); assert.equal(text(b.client), "b");
    sa.updateLocal({draft: null});
    a.client.redo(); await flush(); assert.equal(text(a.client), "ab");
    b.client.undo(); await flush(); assert.equal(text(a.client), "a");
    b.client.redo(); await flush(); assert.equal(text(a.client), "ab");
    const model = JSON.stringify(a.client.model()); const history = a.client.historyStatus();
    sa.clearLocal(); assert.equal((a.sent.at(-1)?.metadata?.[PRESENCE_METADATA_KEY] as any)?.state, null);
    assert.equal(sb.getSnapshot().some(s => s.actor === "A"), false);
    assert.equal(JSON.stringify(a.client.model()), model); assert.deepEqual(a.client.historyStatus(), history);
    sa.updateLocal({cursor});
    const beforeReconnect = a.sent.length;
    a.client.disconnect(); hub.dropPresence("A"); a.client.connect(); await flush();
    assert.ok(a.sent.length > beforeReconnect);
    assert.ok(sb.getSnapshot().find(s => s.actor === "A")?.cursor);
    host.setPresence({anchor: "reconnected", focus: null, metadata: {editorField: "three"}});
    sa.updateLocal({cursor}); assert.equal(a.sent.at(-1)?.anchor, "reconnected");
    ca.dispose(); ca.dispose(); assert.equal(a.client.sync!.setPresence, original);
    assert.equal(a.sent.at(-1)?.metadata?.editorField, "three"); assert.equal((a.sent.at(-1)?.metadata?.[PRESENCE_METADATA_KEY] as any)?.state, null);
    cb.dispose(); sa.dispose(); sb.dispose(); a.client.disconnect(); b.client.disconnect();
});

test("bridge does not overwrite a newer method owner on dispose", () => {
    const hub = new DocHub({schema}), a = setup(hub, "A");
    const store = createPresenceStore({actor: "A"}), connection = connectClientPresence(store, a.client);
    const newer = () => {}; a.client.sync!.setPresence = newer;
    connection.dispose(); assert.equal(a.client.sync!.setPresence, newer);
    store.dispose(); a.client.disconnect();
});


test("bridge rejects malformed metadata and performs no model reads; disposal clears subscribers", () => {
    const hub = new DocHub({schema}), a = setup(hub, "A");
    const store = createPresenceStore({actor: "A"});
    const raw = a.client.sync!, priorModel = raw.engine.model;
    raw.engine.model = () => { throw new Error("Presence must not materialize model"); };
    const connection = connectClientPresence(store, a.client);
    hub.setPresence({actor: "B", name: "B", color: "red", anchor: null, focus: null, metadata: {[PRESENCE_METADATA_KEY]: {version: 1, session: "peer-session", seq: 1, state: {...remote("B"), draft: {text: "invalid"}}} as never}});
    assert.equal(store.getSnapshot().length, 0);
    hub.setPresence({actor: "B", name: "B", color: "red", anchor: null, focus: null, metadata: {[PRESENCE_METADATA_KEY]: {version: 1, session: "peer-session", seq: 2, state: remote("B")} as never}});
    assert.equal(store.getSnapshot().length, 1);
    hub.dropPresence("B"); assert.equal(store.getSnapshot().length, 0);
    store.updateLocal({cursor});
    connection.dispose(); const sent = a.sent.length;
    store.updateLocal({activity: "idle"}); assert.equal(a.sent.length, sent);
    hub.setPresence({actor: "C", name: "C", color: "red", anchor: null, focus: null, metadata: {[PRESENCE_METADATA_KEY]: {version: 1, session: "peer-session", seq: 3, state: remote("C")} as never}});
    assert.deepEqual(store.getSnapshot().map(s => s.actor), ["A"]);
    raw.engine.model = priorModel; store.dispose(); a.client.disconnect();
});

test("range targets, fields, and UTF16 selection validate without splitting surrogate pairs", () => {
    const store = createPresenceStore({actor: "A"});
    const target = {kind: "spreadsheet", sheetId: "s", rowId: "r1", columnId: "c1", endRowId: "r2", endColumnId: "c2"} as const;
    store.updateLocal({selection: target, draft: {target, field: "formula", text: "😀é", composing: true, selection: {start: 2, end: 3, direction: "forward"}}});
    assert.equal(store.getSnapshot()[0].draft?.field, "formula");
    const before = store.getSnapshot();
    assert.throws(() => store.updateLocal({selection: {...target, endColumnId: undefined}}));
    assert.throws(() => store.updateLocal({draft: {target, text: "😀", composing: false, selection: {start: 1, end: 2, direction: "none"}}}));
    assert.equal(store.getSnapshot(), before); store.dispose();
});

test("bridge defers initial publication, retains default metadata, and clears stale draft on reconnect", () => {
    const hub = new DocHub({schema}), a = setup(hub, "A");
    a.client.setPresence({anchor: "existing", focus: "existing"});
    const store = createPresenceStore({actor: "A", profile: {name: "A"}});
    const before = a.sent.length;
    const connection = connectClientPresence(store, a.client, {intervalMs: 0});
    assert.equal(a.sent.length, before); assert.equal(a.sent.at(-1)?.anchor, "existing");
    a.client.setPresence({anchor: "current", focus: "current"});
    assert.equal(a.sent.at(-1)?.metadata?.profileField, "kept");
    store.updateLocal({draft: {target: cursor, text: "한", composing: true}});
    a.client.disconnect(); hub.dropPresence("A"); a.client.connect();
    assert.equal(store.getSnapshot()[0].draft, undefined);
    assert.equal(a.sent.at(-1)?.anchor, "current");
    connection.dispose(); store.dispose(); a.client.disconnect();
});

test("bridge throttles feature bursts, sends clears immediately and cancels trailing work on dispose", async () => {
    const hub = new DocHub({schema}), a = setup(hub, "A");
    const store = createPresenceStore({actor: "A"});
    const connection = connectClientPresence(store, a.client, {intervalMs: 20, initialPresence: {anchor: "initial", focus: null}});
    store.updateLocal({cursor}); const first = a.sent.length;
    for (let i = 0; i < 20; i++) store.updateLocal({cursor: {kind: "graphic", objectIds: [], pointer: {x: i, y: 0}}});
    assert.equal(a.sent.length, first);
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(a.sent.length, first + 1);
    store.updateLocal({cursor: null}); assert.equal(a.sent.length, first + 2);
    store.updateLocal({cursor}); connection.dispose(); const disposedCount = a.sent.length;
    await new Promise(resolve => setTimeout(resolve, 35)); assert.equal(a.sent.length, disposedCount);
    store.dispose(); a.client.disconnect();
});

test("full metadata envelope is validated atomically; errors remain inspectable", () => {
    const hub = new DocHub({schema}), a = setup(hub, "A");
    const store = createPresenceStore({actor: "A"});
    let errors = 0;
    const connection = connectClientPresence(store, a.client, {intervalMs: 0, initialPresence: {anchor: null, focus: null, metadata: {large: "x".repeat(15000)}}, onError() { errors++; }});
    const before = a.sent.length;
    store.updateLocal({draft: {target: cursor, text: "x".repeat(3000), composing: true}});
    assert.equal(a.sent.length, before); assert.match(connection.lastError?.message ?? "", /limits/); assert.equal(errors, 1);
    assert.throws(() => connection.setPresence({anchor: "bad", focus: null, metadata: {large: "x".repeat(17000)}}), /limits/);
    store.clearLocal(); assert.equal(connection.lastError, null);
    let nested: any = "value"; for (let i = 0; i < 6; i++) nested = {child: nested};
    store.updateLocal({profile: {metadata: {data: nested}}});
    assert.equal(connection.lastError, null);
    connection.dispose(); store.dispose(); a.client.disconnect();
});

test("receiver retains sequence tombstones across leave and retires observed prior sessions", () => {
    const hub = new DocHub({schema}), a = setup(hub, "A");
    const store = createPresenceStore({actor: "A"}), connection = connectClientPresence(store, a.client);
    const send = (session: string, seq: number, state: PresenceState | null) => hub.setPresence({actor: "B", name: "B", color: "red", anchor: null, focus: null, metadata: {[PRESENCE_METADATA_KEY]: {version: 1, session, seq, state} as never}});
    send("old", 2, remote()); assert.equal(store.getSnapshot().length, 1);
    send("old", 3, null); assert.equal(store.getSnapshot().length, 0);
    hub.dropPresence("B"); send("old", 2, remote()); assert.equal(store.getSnapshot().length, 0);
    send("new", 1, {...remote(), activity: "idle"}); assert.equal(store.getSnapshot()[0]?.activity, "idle");
    send("old", 999, {...remote(), activity: "active"}); assert.equal(store.getSnapshot()[0]?.activity, "idle");
    send("new", 2, null); assert.equal(store.getSnapshot().length, 0);
    connection.dispose(); store.dispose(); a.client.disconnect();
});

test("new identical presence packets refresh receipt expiry and restore an expired peer without accepting replay", () => {
    let now = 0;
    const hub = new DocHub({schema}), a = setup(hub, "A");
    const store = createPresenceStore({actor: "A", ttlMs: 20, now: () => now});
    const connection = connectClientPresence(store, a.client);
    const send = (seq: number) => hub.setPresence({actor: "B", name: "B", color: "red", anchor: null, focus: null, metadata: {[PRESENCE_METADATA_KEY]: {version: 1, session: "same", seq, state: remote()} as never}});
    try {
        send(1);
        const first = store.getSnapshot();
        now = 10; send(2);
        assert.equal(store.getSnapshot(), first);
        now = 21; store.expire();
        assert.deepEqual(store.getSnapshot().map(state => state.actor), ["B"]);
        now = 25; send(1); send(2);
        now = 30; store.expire();
        assert.deepEqual(store.getSnapshot(), []);
        now = 31; send(3);
        assert.deepEqual(store.getSnapshot(), first);
        now = 40; send(2);
        now = 50; store.expire();
        assert.deepEqual(store.getSnapshot().map(state => state.actor), ["B"]);
        now = 51; store.expire();
        assert.deepEqual(store.getSnapshot(), []);
        now = 52; send(3);
        assert.deepEqual(store.getSnapshot(), []);
        now = 53; send(4);
        assert.deepEqual(store.getSnapshot(), first);
    } finally { connection.dispose(); store.dispose(); a.client.disconnect(); a.client.dispose(); }
});

test("detached store methods isolate clocks, subscriptions and disposal between instances", () => {
    const clockReceivers: unknown[] = [];
    const a = createPresenceStore({actor: "A", now: function (this: void) { clockReceivers.push(this); return 10; }});
    const b = createPresenceStore({actor: "B", now: () => 20});
    const {getSnapshot, subscribe, updateLocal, receive, expire, dispose} = a;
    const {getSnapshot: getB, updateLocal: updateB} = b;
    let calls = 0;
    const stop = subscribe(() => calls++);
    updateLocal({activity: "active"}); updateB({activity: "idle"});
    const held = getSnapshot();
    receive(remote("C"));
    assert.deepEqual(getSnapshot().map(s => s.actor), ["A", "C"]);
    assert.deepEqual(held.map(s => s.actor), ["A"]);
    assert.equal(getB()[0].updatedAt, 20);
    assert.ok(clockReceivers.length > 0);
    assert.ok(clockReceivers.every(receiver => receiver === undefined), "clock must be called without a receiver");
    expire(30010);
    assert.deepEqual(getSnapshot().map(s => s.actor), ["A"]);
    dispose(); stop(); stop();
    assert.equal(calls, 4);
    assert.deepEqual(getSnapshot(), []);
    assert.throws(() => updateLocal({activity: "away"}), /disposed/);
    updateB({activity: "active"});
    assert.equal(getB()[0].activity, "active");
    b.dispose();
});
