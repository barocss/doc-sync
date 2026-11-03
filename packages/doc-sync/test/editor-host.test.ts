import assert from "node:assert/strict";
import {test} from "node:test";
import {SyncClient} from "../src/sync/client.ts";
import {Doc} from "../src/crdt/doc.ts";
import {InputSession, createSyncClientEditorHost, getSyncClientEditorHostOwner} from "../src/editor/index.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import type {Schema} from "../src/crdt/schema.ts";
import {schemaVersion} from "../src/crdt/schema-version.ts";
import {PROTOCOL_VERSION, DOCUMENT_CAPABILITIES} from "../src/sync/protocol.ts";
import type {ServerEvent, Transport} from "../src/sync/protocol.ts";

const schema: Schema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}};
function setup() {
    let receive: ((event: ServerEvent) => void) | undefined;
    const transport: Transport = {subscribe: (_since, fn) => { receive = fn; return () => {}; }, send: async () => {}, sendPresence: () => {}};
    const client = new SyncClient("A", transport, {schema});
    return {client, host: createSyncClientEditorHost(client), receive: (event: ServerEvent) => receive!(event)};
}
const text = (model: NodeJSON) => model.children?.[0].runs?.map(run => "text" in run ? run.text : "").join("");
const insert = (value: string, at = 0) => [{op: "insert" as const, at: [0, at], content: value}];

test("host caches borrowed models; reads and ordinary edits add no snapshots", () => {
    const {client, host} = setup();
    let snapshots = 0, reads = 0;
    const snapshot = client.doc.snapshot.bind(client.doc), json = client.doc.toJSON.bind(client.doc);
    client.doc.snapshot = () => { snapshots++; return snapshot(); };
    client.doc.toJSON = () => { reads++; return json(); };
    const first = host.model();
    assert.equal(host.model(), first);
    host.stamp(); host.historyStatus(); host.presence(); host.captureAnchor([0, 0]);
    assert.equal(reads, 1);
    host.commit(host.apply(insert("abc")));
    assert.notEqual(host.model(), first);
    assert.equal(snapshots, 0);
    assert.equal(host.historyStatus().canUndo, true);
    host.undo(); host.redo();
    assert.deepEqual(host.model().model, json());
    assert.equal(getSyncClientEditorHostOwner(host), getSyncClientEditorHostOwner(createSyncClientEditorHost(client)));
});

test("generation distinguishes equal-version replacement and draft transitions", () => {
    const {client, host} = setup();
    const first = host.stamp();
    client.doc = Doc.fromSnapshot(client.actor, client.doc.snapshot(), client.schema);
    const second = host.stamp();
    assert.equal(first.revision, second.revision);
    assert.notEqual(first.generation, second.generation);
    const input = new InputSession(client), draft = createSyncClientEditorHost(client, {input});
    const live = draft.stamp(); input.begin(); const editing = draft.stamp(); input.cancel();
    assert.notEqual(live.generation, editing.generation);
    assert.notEqual(editing.generation, draft.stamp().generation);
});

test("composition keeps one fork, reserves live clocks, and commits one undo group", () => {
    const {client, host} = setup();
    let snapshots = 0;
    const snapshot = client.doc.snapshot.bind(client.doc);
    client.doc.snapshot = () => { snapshots++; return snapshot(); };
    const session = host.createSession(); session.begin(); session.begin();
    client.doc.clock.lamport += 100;
    session.reserveClock();
    const first = session.apply(insert("a")); session.commit(first);
    const second = session.apply(insert("b", 1)); session.commit(second);
    assert.deepEqual(client.doc.toJSON().children?.[0].runs, []);
    assert.equal(snapshots, 1);
    const range = session.capture({anchor: [0, 2], focus: [0, 2]});
    assert.ok(range);
    assert.equal(session.resolve(range), null);
    const ops = session.end();
    assert.equal(ops.length, first.length + second.length);
    assert.equal(session.active, false);
    assert.deepEqual(session.resolve(range), {anchor: [0, 2], focus: [0, 2]});
    host.undo(); assert.deepEqual(client.doc.toJSON().children?.[0].runs, []);
    assert.equal(host.historyStatus().canUndo, false);
});

test("pause and conditional gates stop draft edits and end before mutation", async () => {
    const {client, host} = setup();
    const input = new InputSession(client), session = createSyncClientEditorHost(client, {input}).createSession();
    session.begin(); session.commit(session.apply(insert("x")));
    const draft = input.doc;
    const release = client.pauseLocalMutations(), before = client.doc.toJSON();
    assert.throws(() => host.apply(insert("x")), /paused/);
    assert.throws(() => session.apply(insert("x")), /paused/);
    assert.throws(() => session.commit([]), /paused/);
    assert.throws(() => session.end(), /paused/);
    const blocked = host.createSession(), clock = client.doc.clock.lamport;
    assert.throws(() => blocked.begin(), /paused/);
    assert.equal(blocked.active, false);
    const pending = structuredClone(client.pending), history = client.history.snapshot();
    client.doc.clock.lamport = clock + 100;
    assert.doesNotThrow(() => session.reserveClock());
    assert.equal(client.doc.clock.lamport, clock + 100);
    // The draft must receive the live maximum even though local edits stay blocked.
    assert.equal(draft.clock.lamport, clock + 100);
    assert.deepEqual(client.pending, pending);
    assert.deepEqual(client.history.snapshot(), history);
    assert.throws(() => session.apply(insert("blocked")), /paused/);
    assert.deepEqual(client.doc.toJSON(), before);
    release(); session.end();
    const fresh = setup(); fresh.client.connect();
    fresh.receive({type: "hello", protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, epoch: "e", schemaVersion: schemaVersion(schema), serverSeq: 0, snapshot: fresh.client.doc.snapshot(), delSeqs: [], presence: []});
    const next = fresh.host.createSession(); next.begin();
    await fresh.client.conditionalEdit({epoch: "e", serverSeq: 0, schemaVersion: schemaVersion(schema)}, insert("z"), async () => { throw new Error("offline"); });
    assert.equal(fresh.client.conditionalPending, true);
    const conditional = fresh.client.doc.toJSON();
    assert.throws(() => next.apply(insert("q")), /conditional/);
    assert.throws(() => next.end(), /conditional/);
    assert.throws(() => fresh.host.createSession().begin(), /conditional/);
    assert.deepEqual(fresh.client.doc.toJSON(), conditional);
    fresh.client.disconnect();
});

test("anchor policies retain deleted caret positions and reject invalid strict ranges", () => {
    const {host} = setup();
    host.commit(host.apply(insert("abc")));
    const key = host.captureAnchor([0, 2])!;
    host.commit(host.apply([{op: "delete", at: [0, 1], count: 1}]));
    assert.deepEqual(host.locateAnchor(key, "retained"), [0, 1]);
    const session = host.createSession();
    assert.equal(session.capture({anchor: [0, 999], focus: [0, 0]}), null);
    assert.equal(session.capture({anchor: [0, -1], focus: [0, 0]}), null);
    assert.equal(host.locateAnchor("missing", "visible"), null);
    assert.equal(host.deleteRange([999, 0], [0, 0]), null);
});

test("observers preserve app hooks, multiple consumers, and replacement hooks on disposal", () => {
    const {client, host, receive} = setup(), log: string[] = [];
    client.onUpdate = () => log.push("app");
    const offA = host.subscribe({update: () => log.push("A")});
    const offB = host.subscribe({update: () => log.push("B")});
    client.onUpdate!(); assert.deepEqual(log, ["app", "A", "B"]);
    offA(); offA(); log.length = 0;
    client.onUpdate!(); assert.deepEqual(log, ["app", "B"]);
    const replacement = () => log.push("replacement"); client.onUpdate = replacement;
    offB(); assert.equal(client.onUpdate, replacement);
    const events: string[] = [];
    const off = host.subscribe({beforeEvent: event => events.push(event.type), update: () => events.push("update")});
    client.connect();
    receive({type: "hello", protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, epoch: "e", schemaVersion: schemaVersion(schema), serverSeq: 0, snapshot: client.doc.snapshot(), delSeqs: [], presence: []});
    events.length = 0; receive({type: "presence", presence: {actor: "B", name: "B", color: "red", anchor: null, focus: null}});
    assert.equal(events[0], "presence");
    assert.equal([...host.presence()][0].actor, "B");
    off(); client.disconnect();
});

test("remote receipt stays live while composition keeps its original draft", () => {
    const {client, host, receive} = setup(); client.connect();
    receive({type: "hello", protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, epoch: "e", schemaVersion: schemaVersion(schema), serverSeq: 0, snapshot: client.doc.snapshot(), delSeqs: [], presence: []});
    const remote = Doc.fromSnapshot("B", client.doc.snapshot(), schema);
    const session = host.createSession(); session.begin();
    session.commit(session.apply(insert("local")));
    receive({type: "change", envelope: {serverSeq: 1, change: {actor: "B", seq: 1, ops: remote.edit(insert("remote")).ops}}});
    assert.equal(text(session.model().model), "local");
    assert.equal(text(host.model().model), "remote");
    const ops = session.end(); remote.emit(ops);
    assert.deepEqual(host.model().model, remote.toJSON());
    client.disconnect();
});

test("model-diff edits map codepoint offsets without changing direct UTF-16 edits", () => {
    const {host} = setup(); host.commit(host.apply(insert("😀a")));
    host.commit(host.applyModelEdits(host.model().model, [{op: "insert", at: [0, 1], content: "!"}]));
    assert.equal(text(host.model().model), "😀!a");
    host.commit(host.apply([{op: "insert", at: [0, 2], content: "?"}]));
    assert.equal(text(host.model().model), "😀?!a");
});

test("a reset observer can cancel a draft before the live document is replaced", () => {
    const {client, host, receive} = setup(); client.connect();
    receive({type: "hello", protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, epoch: "e", schemaVersion: schemaVersion(schema), serverSeq: 0, snapshot: client.doc.snapshot(), delSeqs: [], presence: []});
    const input = new InputSession(client), draft = createSyncClientEditorHost(client, {input});
    const before = draft.stamp(); input.begin(); draft.commit(draft.apply(insert("discard")));
    const off = host.subscribe({beforeEvent: event => { if (event.type === "reset") input.cancel(); }});
    receive({type: "reset", epoch: "next"});
    assert.equal(input.active, false);
    assert.notEqual(draft.stamp().generation, before.generation);
    assert.deepEqual(draft.model().model.children?.[0].runs, []);
    off(); client.disconnect();
});

test("post-mutation fanout reports failures after every observer sees the accepted state", () => {
    const {client, host} = setup(), log: string[] = [];
    const appError = new Error("app"), observerError = new Error("observer");
    const app = () => { log.push("app"); throw appError; };
    client.onModelEvents = app;
    const offA = host.subscribe({modelEvents: () => { log.push("A"); throw observerError; }});
    const offB = host.subscribe({modelEvents: () => log.push("B")});
    assert.throws(() => client.onModelEvents!([], {cause: "remote", fallback: false}), error => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [appError, observerError]);
        assert.equal(error.cause, appError);
        return true;
    });
    assert.deepEqual(log, ["app", "A", "B"]);
    offA(); log.length = 0;
    assert.throws(() => client.onModelEvents!([], {cause: "remote", fallback: false}), error => error === appError);
    assert.deepEqual(log, ["app", "B"]);
    offB(); assert.equal(client.onModelEvents, app);
});

test("beforeEvent errors retain fail-closed ordering", () => {
    const {client, host} = setup(), error = new Error("reject event");
    client.onEvent = () => { throw error; };
    let seen = false;
    const off = host.subscribe({beforeEvent: () => { seen = true; }});
    assert.throws(() => client.onEvent!({type: "reset"}), value => value === error);
    assert.equal(seen, false);
    off();
});

test("host live editing preserves direct custom guard invocation counts", () => {
    const direct = setup(), adapted = setup();
    let directCount = 0, adaptedCount = 0;
    const directGuard = direct.client.doc.editGuard, adaptedGuard = adapted.client.doc.editGuard;
    direct.client.doc.editGuard = () => { directCount++; directGuard?.(); };
    adapted.client.doc.editGuard = () => { adaptedCount++; adaptedGuard?.(); };
    direct.client.commit(direct.client.doc.edit(insert("abc")).ops);
    adapted.host.commit(adapted.host.apply(insert("abc")));
    assert.equal(adaptedCount, directCount);
    assert.deepEqual(adapted.client.doc.toJSON(), direct.client.doc.toJSON());
    const directInput = new InputSession(direct.client), session = adapted.host.createSession();
    directInput.begin(); session.begin();
    directInput.commit(directInput.doc.edit(insert("x")).ops);
    session.commit(session.apply(insert("x")));
    // Draft editing must additionally check the live document's custom guard.
    assert.equal(adaptedCount, directCount + 1);
    directCount = 0; adaptedCount = 0;
    directInput.end(); session.end();
    assert.equal(adaptedCount, directCount);
    assert.deepEqual(adapted.client.doc.toJSON(), direct.client.doc.toJSON());
});

test("legacy document-only clients retain selection lookup without an engine", () => {
    const doc = new Doc("legacy", schema);
    doc.edit(insert("abc"));
    const input = new InputSession({doc} as SyncClient);
    const range = input.capture({anchor: [0, 1], focus: [0, 2]});
    assert.ok(range);
    assert.deepEqual(input.resolve(range), {anchor: [0, 1], focus: [0, 2]});
    assert.equal(input.resolve({anchor: "missing", focus: "missing"}), null);
});

test("legacy inherited client facades read their dynamic document identity", () => {
    const {client} = setup();
    const make = (value: string) => {
        const doc = new Doc("seed", schema); doc.edit(insert(value));
        return Doc.fromSnapshot(client.actor, doc.snapshot(), schema);
    };
    let current = make("live");
    const facade = Object.create(client) as SyncClient;
    Object.defineProperty(facade, "doc", {get: () => current});
    const host = createSyncClientEditorHost(facade), first = host.model();
    current = make("draft");
    assert.equal(first.stamp.revision, current.version);
    assert.equal(text(host.model().model), "draft");
    assert.notEqual(host.stamp().generation, first.stamp.generation);
});
