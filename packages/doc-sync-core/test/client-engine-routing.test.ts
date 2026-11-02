import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {EditOp} from "../src/crdt/model.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DocHub} from "../src/server/hub.ts";
import type {ServerEvent, Transport} from "../src/sync/protocol.ts";
import {InputSession, createSyncClientEditorHost} from "../src/editor/index.ts";
import {typescriptClientEngineFactory} from "../src/engine/index.ts";
import type {ClientEngine, ClientEngineFactory} from "../src/engine/client-contract.ts";

const schema: Schema = {root: "book", marks: ["bold"], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const insert = (content: string, offset = 0): EditOp[] => [{op: "insert", at: [0, offset], content}];
function tracker(portable = false) {
    const calls: string[] = [], engines: ClientEngine[] = [];
    const wrap = <T extends object>(target: T, prefix: string): T => new Proxy(target, {get(value, key) {
        if (portable && String(key).includes("TypeScript") || portable && String(key).startsWith("typescript")) return undefined;
        const member = Reflect.get(value, key, value);
        if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
            calls.push(`${prefix}${String(key)}`);
            const result = member.apply(value, args);
            return key === "createSession" ? wrap(result, "session.") : result;
        };
    }});
    const factory: ClientEngineFactory = {...typescriptClientEngineFactory, create(actor, s) {
        calls.push("create"); const engine = wrap(typescriptClientEngineFactory.create(actor, s), ""); engines.push(engine); return engine;
    }};
    return {factory, calls, engines, count: (name: string) => calls.filter(call => call === name).length};
}
function setup(options: {portable?: boolean; connect?: boolean} = {}) {
    const tracked = tracker(options.portable), hub = new DocHub({schema});
    let handler: ((event: ServerEvent) => void) | undefined;
    const outbound: unknown[] = [];
    const transport: Transport = {
        subscribe: (since, receive, epoch) => { handler = receive; receive(hub.hello(since, epoch)); return hub.listen(receive); },
        send: async message => { outbound.push(message); if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence: () => {},
    };
    const client = new SyncClient("A", transport, {schema, engineFactory: tracked.factory, ackDelay: 0});
    if (options.connect) client.connect();
    return {...tracked, client, hub, outbound, transport, receive: (event: ServerEvent) => handler!(event), host: createSyncClientEditorHost(client)};
}

test("selected engine routes live host editing anchors history and record exactly once", () => {
    const s = setup({portable: true}), engine = s.engines[0];
    assert.throws(() => s.client.doc, /TypeScript|compatib|document/i);
    s.calls.length = 0;
    s.host.commit(s.host.apply(insert("a😀b")));
    assert.equal(s.count("apply"), 1); assert.equal(s.count("record"), 1);
    assert.deepEqual(s.host.model().model, engine.model()); assert.ok(s.count("model"));
    const anchor = s.host.captureAnchor([0, 3]); assert.ok(anchor);
    assert.deepEqual(s.host.locateAnchor(anchor, "retained"), [0, 3]);
    assert.ok(s.count("captureAnchor")); assert.ok(s.count("locateAnchor"));
    s.host.undo(); assert.equal(s.host.historyStatus().canUndo, false);
    s.host.redo(); assert.equal(s.count("undo"), 1); assert.equal(s.count("redo"), 1);
    assert.equal(s.count("record"), 1, "undo and redo must not record their emitted operations again");
    s.client.clearHistory(); assert.equal(s.count("clearHistory"), 1);
});

test("selected session keeps one fork and publishes one history group around remote receipt", () => {
    const s = setup({connect: true}), peer = Doc.fromSnapshot("B", s.hub.doc.snapshot(), schema);
    const session = s.host.createSession(); s.calls.length = 0;
    session.begin(); session.begin();
    session.commit(session.apply(insert("한"))); session.commit(session.apply(insert("글", 1)));
    const draft = session.model().model;
    s.hub.submit({actor: "B", seq: 1, ops: peer.edit(insert("R")).ops});
    assert.deepEqual(session.model().model, draft); assert.ok(s.count("receive"));
    assert.equal(s.count("session.apply"), 2); assert.equal(s.count("session.collect"), 2);
    session.reserveClock(); session.end();
    assert.equal(s.count("session.publish"), 1); assert.equal(s.count("record"), 1);
    assert.deepEqual(s.host.model().model, s.hub.doc.toJSON());
    s.host.undo(); assert.equal(s.host.historyStatus().canUndo, false);
    assert.deepEqual(s.host.model().model.children?.[0].runs, [{text: "R", marks: {}}]);
    session.begin(); session.commit(session.apply(insert("discard"))); session.cancel();
    assert.ok(s.count("session.cancel")); s.client.disconnect();
});

test("selected guards and invalid edits preserve clock pending history and revision", () => {
    const s = setup(); s.host.commit(s.host.apply(insert("seed")));
    const state = () => ({checkpoint: s.client.checkpoint(), stamp: s.host.stamp(), clock: s.client.doc.clock.lamport});
    let before = state();
    assert.throws(() => s.host.apply([...insert("valid"), ...[{op: "insert", at: [99, 0], content: "bad"} as EditOp]]));
    assert.deepEqual(state(), before);
    const originalGuard = s.client.doc.editGuard;
    s.client.doc.editGuard = () => { throw new Error("custom guard"); };
    assert.throws(() => s.host.apply(insert("blocked")), /custom guard/); assert.deepEqual(state(), before);
    s.client.doc.editGuard = originalGuard;
    const release = s.client.pauseLocalMutations(); before = state();
    assert.throws(() => s.host.apply(insert("paused")), /paused/);
    const session = s.host.createSession(); assert.throws(() => session.begin(), /paused/); assert.equal(session.active, false);
    assert.throws(() => s.host.undo(), /paused/); assert.deepEqual(state(), before); release();
    s.client.doc.clock.lamport = Number.MAX_SAFE_INTEGER; before = state();
    assert.throws(() => s.host.apply(insert("x")), /clock|safe|lamport|exhaust|range/i); assert.deepEqual(state(), before);
});

test("selected checkpoint snapshot GC and schema routes retain authoritative state", async () => {
    const s = setup({connect: true}); s.calls.length = 0;
    s.host.commit(s.host.apply(insert("abc"))); s.host.commit(s.host.apply([{op: "delete", at: [0, 1], count: 1}]));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(s.count("historyPin"));
    s.client.clearHistory(); await new Promise(resolve => setTimeout(resolve, 0));
    s.hub.gc(); assert.ok(s.count("compact"));
    const saved = s.client.checkpoint(); assert.ok(s.count("checkpoint")); s.client.disconnect();
    const restored = new SyncClient("A", s.transport, {schema, engineFactory: s.factory, ackDelay: 0});
    restored.restoreCheckpoint(saved, s.hub.epoch);
    assert.ok(s.count("prepareCheckpoint")); assert.ok(s.count("installCheckpoint"));
    restored.connect(); assert.ok(s.count("prepareSnapshot")); assert.ok(s.count("installPrepared"));
    assert.deepEqual(createSyncClientEditorHost(restored).model().model, s.hub.doc.toJSON());
    const next = {...structuredClone(schema), marks: [...schema.marks, "italic"]}; restored.upgradeSchema(next);
    assert.ok(s.count("upgradeSchema")); assert.deepEqual(restored.schema, next);
    restored.disconnect();
});

test("default TS compatibility retains Doc InputSession identity and snapshot allocation limits", () => {
    const transport: Transport = {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}};
    const client = new SyncClient("legacy", transport, {schema}), doc = client.doc;
    assert.ok(doc instanceof Doc); assert.equal(client.doc, doc);
    const input = new InputSession(client), host = createSyncClientEditorHost(client, {input});
    assert.equal(input.client, client); assert.equal(input.doc, doc);
    let snapshots = 0; const snapshot = doc.snapshot.bind(doc); doc.snapshot = () => { snapshots++; return snapshot(); };
    host.model(); host.commit(host.apply(insert("abc"))); host.model(); host.undo(); host.redo();
    assert.equal(snapshots, 0);
    input.begin(); input.begin(); assert.equal(snapshots, 1); assert.equal(input.doc, input.doc); input.cancel();
    assert.equal(input.doc, doc);
});

test("selected engine model result reaches host and unsupported factories fail before connect", () => {
    let connects = 0;
    const transport: Transport = {subscribe: () => { connects++; return () => {}; }, send: async () => {}, sendPresence: () => {}};
    const selected = tracker();
    const factory: ClientEngineFactory = {...selected.factory, create(actor, s) {
        const engine = selected.factory.create(actor, s);
        return new Proxy(engine, {get(target, key) {
            if (key === "model") return () => ({...target.model(), attrs: {selectedModel: "D1"}});
            const member = Reflect.get(target, key, target); return typeof member === "function" ? member.bind(target) : member;
        }});
    }};
    const client = new SyncClient("model-route", transport, {schema, engineFactory: factory});
    assert.equal(createSyncClientEditorHost(client).model().model.attrs?.selectedModel, "D1");
    const unsupported = {...factory, create: () => ({identity: () => ({engine: "unsupported", contractVersion: 1, actor: "A", schemaVersion: "", capabilities: []})})} as unknown as ClientEngineFactory;
    assert.throws(() => new SyncClient("A", transport, {schema, engineFactory: unsupported}));
    assert.equal(connects, 0);
});

test("selected invalid receive snapshot checkpoint and foreign handles preserve coupled state", () => {
    const s = setup(), engine = s.engines[0], peer = new Doc("B", schema);
    s.host.commit(s.host.apply(insert("local")));
    const before = s.client.checkpoint(), stamp = s.host.stamp();
    const valid = peer.edit(insert("remote")).ops;
    assert.throws(() => engine.receive("B", [...valid, {t: "text", id: {actor: "B", lamport: 99}, origin: {actor: "missing", lamport: 42}, text: "bad"}]));
    assert.deepEqual(s.client.checkpoint(), before); assert.deepEqual(s.host.stamp(), stamp);
    const badSnapshot = structuredClone(engine.snapshot()); badSnapshot.lamport = NaN;
    assert.throws(() => engine.prepareSnapshot(badSnapshot));
    const badCheckpoint = structuredClone(engine.checkpoint()); badCheckpoint.identity.actor = "other";
    assert.throws(() => engine.prepareCheckpoint(badCheckpoint));
    const other = typescriptClientEngineFactory.create("A", schema), foreign = other.prepareSnapshot(other.snapshot());
    assert.throws(() => engine.installPrepared(foreign));
    assert.deepEqual(s.client.checkpoint(), before); assert.deepEqual(s.host.stamp(), stamp);
});

test("selected conditional preview and acceptance use engine preparation compile and one record", async () => {
    const s = setup({connect: true}); s.calls.length = 0;
    const result = await s.client.conditionalEdit({epoch: s.hub.epoch, serverSeq: s.hub.serverSeq, schemaVersion: s.hub.schemaVersion},
        insert("conditional"), async (base, change) => ({status: "accepted", serverSeq: s.hub.submitConditional(change, base).serverSeq}));
    assert.equal(result.status, "accepted"); assert.ok(s.count("prepareSnapshot")); assert.ok(s.count("compilePrepared"));
    assert.ok(s.count("apply")); assert.equal(s.count("record"), 1);
    assert.deepEqual(s.host.model().model, s.hub.doc.toJSON()); s.client.disconnect();
});

test("selected unresolved conditional fences live and draft mutation without consuming state", async () => {
    const s = setup({connect: true}), session = s.host.createSession(); session.begin();
    session.commit(session.apply(insert("draft")));
    const reply = await s.client.conditionalEdit({epoch: s.hub.epoch, serverSeq: s.hub.serverSeq, schemaVersion: s.hub.schemaVersion},
        insert("uncertain"), async () => { throw new Error("response lost"); });
    assert.equal(reply.status, "unconfirmed");
    const state = () => ({checkpoint: s.client.engine.checkpoint(), pending: structuredClone(s.client.pending), serverSeq: s.client.serverSeq});
    const before = state(), draft = session.model().model, stamp = session.stamp();
    assert.throws(() => s.host.apply(insert("blocked")), /conditional/);
    assert.throws(() => session.apply(insert("blocked")), /conditional/);
    assert.throws(() => session.commit([]), /conditional/);
    assert.throws(() => session.end(), /conditional/);
    assert.throws(() => s.host.createSession().begin(), /conditional/);
    assert.throws(() => s.host.undo(), /conditional/);
    assert.deepEqual(state(), before); assert.deepEqual(session.model().model, draft); assert.deepEqual(session.stamp(), stamp);
    assert.doesNotThrow(() => session.reserveClock()); s.client.disconnect(); session.cancel();
});

test("client disposal reaches selected engine and cancels its active session", () => {
    const s = setup(), session = s.host.createSession(); session.begin(); session.commit(session.apply(insert("draft")));
    s.calls.length = 0; s.client.dispose();
    assert.equal(s.count("dispose"), 1); assert.equal(session.active, false);
    assert.throws(() => s.host.apply(insert("after disposal")), /disposed/i);
});

test("selected TS live typing adds zero snapshots and composition creates one snapshot", () => {
    const s = setup(), doc = s.client.doc; let snapshots = 0;
    const snapshot = doc.snapshot.bind(doc); doc.snapshot = () => { snapshots++; return snapshot(); };
    s.calls.length = 0;
    s.host.model(); s.host.commit(s.host.apply(insert("😀"))); s.host.commit(s.host.apply(insert("x", 2))); s.host.model();
    assert.equal(s.count("apply"), 2); assert.equal(snapshots, 0);
    const session = s.host.createSession(); session.begin(); session.begin();
    assert.equal(snapshots, 1); session.commit(session.apply(insert("한", 3))); session.end();
    assert.equal(snapshots, 1); assert.deepEqual(s.host.model().model.children?.[0].runs, [{text: "😀x한", marks: {}}]);
});

test("selected TypeScript client preserves legacy Korean and emoji actor identities", () => {
    const transport: Transport = {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}};
    for (const actor of ["한글참여자", "writer😀"]) {
        const baseline = new Doc(actor, schema), edits = insert("가😀");
        const expected = baseline.edit(edits).ops;
        const tracked = tracker(), client = new SyncClient(actor, transport, {schema, engineFactory: tracked.factory});
        const host = createSyncClientEditorHost(client), actual = host.apply(edits); host.commit(actual);
        assert.deepEqual(actual, expected); assert.deepEqual(host.model().model, baseline.toJSON());
        assert.equal(client.engine.identity().actor, actor); assert.equal(tracked.count("apply"), 1);
        const restored = Doc.fromSnapshot(actor, baseline.snapshot(), schema);
        const prepared = client.engine.prepareSnapshot(client.engine.snapshot()); client.engine.installPrepared(prepared);
        assert.deepEqual(client.engine.model(), restored.toJSON());
        assert.equal(client.engine.check(actual), baseline.check(expected));
    }
});

test("constructor capability rejection disposes created engine before any transport subscription", () => {
    const tracked = tracker(); let subscriptions = 0;
    const factory: ClientEngineFactory = {...tracked.factory, create(actor, s) {
        const engine = tracked.factory.create(actor, s);
        return new Proxy(engine, {get(target, key) {
            if (key === "requireCapabilities") return () => { throw new Error("unsupported required capability"); };
            const member = Reflect.get(target, key, target); return typeof member === "function" ? member.bind(target) : member;
        }});
    }};
    const transport: Transport = {subscribe: () => { subscriptions++; return () => {}; }, send: async () => {}, sendPresence: () => {}};
    assert.throws(() => new SyncClient("reject", transport, {schema, engineFactory: factory}), /unsupported required capability/);
    assert.equal(tracked.count("dispose"), 1); assert.equal(subscriptions, 0);
});

for (const protectedState of ["pending", "unresolved", "protected-history"] as const) {
    test(`client disposal preserves ${protectedState} state for recovery`, async () => {
        const s = setup({connect: protectedState !== "pending"});
        if (protectedState === "pending") s.host.commit(s.host.apply(insert("unsent")));
        if (protectedState === "protected-history") {
            s.host.commit(s.host.apply(insert("retained undo")));
            await new Promise(resolve => setTimeout(resolve, 0));
            assert.equal(s.client.pending.length, 0); s.client.protectRecoveryHistory();
        }
        if (protectedState === "unresolved") await s.client.conditionalEdit(
            {epoch: s.hub.epoch, serverSeq: s.hub.serverSeq, schemaVersion: s.hub.schemaVersion}, insert("uncertain"),
            async () => { throw new Error("reply lost"); });
        const before = s.client.engine.checkpoint(), pending = structuredClone(s.client.pending); s.calls.length = 0;
        assert.throws(() => s.client.dispose(), /pending|conditional|protect|recovery|unsent|unconfirmed/i);
        assert.equal(s.count("dispose"), 0); assert.deepEqual(s.client.engine.checkpoint(), before); assert.deepEqual(s.client.pending, pending);
        s.client.disconnect();
    });
}

for (const structure of ["split", "move"] as const) {
    test(`selected ordinary Unicode typing after ${structure} keeps snapshot count zero`, () => {
        const s = setup(); s.host.commit(s.host.apply(insert("😀abcd")));
        s.host.commit(s.host.apply([{op: "split", at: [0, 2]}]));
        if (structure === "move") s.host.commit(s.host.apply([{op: "move", from: [1], at: [0]}]));
        const before = s.host.model().model, doc = s.client.doc; let snapshots = 0;
        const snapshot = doc.snapshot.bind(doc); doc.snapshot = () => { snapshots++; return snapshot(); };
        const expected = structuredClone(before), first = expected.children![0];
        const old = first.runs!.map(run => "text" in run ? run.text : "").join("");
        first.runs = [{text: `한${old}`, marks: {}}];
        s.host.commit(s.host.apply(insert("한"))); assert.deepEqual(s.host.model().model, expected);
        assert.equal(snapshots, 0);
    });
}
