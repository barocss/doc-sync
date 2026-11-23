import assert from "node:assert/strict";
import {test} from "node:test";
import {LocalClient, LocalEditorHost, createLocalEditorHost} from "../src/local/index.ts";
import type {EditorHost} from "../src/editor/host-contract.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import type {Schema} from "../src/crdt/schema.ts";

const schema: Schema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}};
const insert = (content: string, at = 0) => [{op: "insert" as const, at: [0, at], content}];
const text = (model: NodeJSON) => model.children?.[0].runs?.map(run => "text" in run ? run.text : "").join("");
function setup() {
    const client = new LocalClient({schema, actor: "local"});
    const host: EditorHost = createLocalEditorHost(client);
    return {client, host};
}

test("local host caches borrowed models and exposes offline single-user status", () => {
    const {client, host} = setup();
    assert.ok(host instanceof LocalEditorHost);
    assert.equal(host.actor, client.actor);
    assert.equal(host.schema, client.schema);
    assert.deepEqual(host.schema, schema);
    assert.deepEqual(host.status(), {online: false, synchronized: false});
    assert.deepEqual([...host.presence()], []);
    host.setPresence({name: "local", color: "red", anchor: null, focus: null});
    let reads = 0;
    const model = client.model.bind(client);
    client.model = () => { reads++; return model(); };
    const first = host.model();
    assert.equal(host.model(), first);
    host.stamp(); host.historyStatus(); host.captureAnchor([0, 0]);
    assert.equal(reads, 1);
    host.commit(host.apply(insert("abc")));
    assert.notEqual(host.model(), first);
    assert.equal(host.model(), host.model());
    assert.equal(reads, 2);
    assert.equal(text(host.model().model), "abc");
});

test("self edits avoid native echo while external edits and history reach every host", () => {
    const {client, host} = setup(), other = createLocalEditorHost(client);
    const first: string[] = [], second: string[] = [];
    const off = host.subscribe({modelEvents: (_edits, info) => first.push(info.cause), update: () => first.push("update")});
    const offOther = other.subscribe({modelEvents: (_edits, info) => second.push(info.cause)});
    host.commit(host.apply(insert("a")));
    assert.deepEqual(first, []);
    assert.deepEqual(second, ["local"]);
    client.edit(insert("b", 1));
    assert.deepEqual(first, ["local", "update"]);
    assert.equal(text(host.model().model), "ab");
    host.undo(); host.redo();
    assert.deepEqual(first, ["local", "update", "undo", "update", "redo", "update"]);
    off(); off(); offOther();
    client.edit(insert("c", 2));
    assert.equal(first.length, 6);
});

test("native transaction aggregates preserve one history record and caret anchors", () => {
    const {host} = setup();
    const before = host.captureAnchor([0, 0]);
    const ops = [...host.apply(insert("😀")), ...host.apply(insert("a", 2))];
    const after = host.captureAnchor([0, 3]);
    assert.ok(before); assert.ok(after);
    host.commit(ops, {caretBefore: before, caretAfter: after, typing: false});
    assert.equal(text(host.model().model), "😀a");
    assert.equal(host.undo(), before);
    assert.equal(text(host.model().model), "");
    assert.equal(host.historyStatus().canUndo, false);
    assert.equal(host.redo(), after);
    assert.equal(text(host.model().model), "😀a");
    host.commit(host.applyModelEdits(host.model().model, insert("!", 1)));
    assert.equal(text(host.model().model), "😀!a");
    const deleted = host.deleteRange([0, 2], [0, 3]);
    assert.ok(deleted); host.commit(deleted);
    assert.equal(text(host.model().model), "😀a");
    assert.equal(host.deleteRange([999, 0], [0, 0]), null);
});

test("empty native transactions leave history and observers unchanged", () => {
    const {host} = setup();
    let updates = 0;
    const off = host.subscribe({update: () => updates++});
    const first = host.model();
    host.commit([]);
    host.commit(host.apply([]));
    assert.equal(host.model(), first);
    assert.deepEqual(host.historyStatus(), {canUndo: false, canRedo: false});
    assert.equal(updates, 0);
    off();
});

test("composition publishes exact draft operations once and suppresses self echo", () => {
    const {client, host} = setup(), session = host.createSession();
    const causes: string[] = [];
    const off = host.subscribe({modelEvents: (_events, info) => causes.push(info.cause)});
    const live = session.model();
    session.begin(); session.begin();
    assert.notEqual(session.stamp().generation, live.stamp.generation);
    const first = session.apply(insert("a")); session.commit(first);
    const second = session.apply(insert("b", 1)); session.commit(second);
    assert.equal(text(host.model().model), "");
    assert.equal(text(session.model().model), "ab");
    assert.equal(session.model(), session.model());
    const range = session.capture({anchor: [0, 2], focus: [0, 2]});
    assert.ok(range);
    assert.equal(session.resolve(range), null);
    const published = session.end();
    assert.deepEqual(published, [...first, ...second]);
    assert.equal(session.active, false);
    assert.deepEqual(session.end(), []);
    assert.deepEqual(causes, []);
    assert.deepEqual(session.resolve(range), {anchor: [0, 2], focus: [0, 2]});
    host.undo();
    assert.equal(text(client.model()), "");
    assert.equal(host.historyStatus().canUndo, false);
    assert.deepEqual(causes, ["undo"]);
    off();
});

test("cancel discards composition while external edits and selection anchors stay live", () => {
    const {client, host} = setup(), session = host.createSession();
    client.edit(insert("abc"));
    const anchor = host.captureAnchor([0, 2]); assert.ok(anchor);
    const previous = session.stamp(); session.begin();
    const draft = session.stamp();
    session.commit(session.apply(insert("discard")));
    client.edit(insert("x", 3)); session.reserveClock();
    assert.equal(text(host.model().model), "abcx");
    assert.equal(text(session.model().model), "discardabc");
    session.cancel();
    assert.equal(session.active, false);
    assert.notEqual(draft.generation, previous.generation);
    assert.notEqual(session.stamp().generation, draft.generation);
    assert.equal(text(session.model().model), "abcx");
    host.commit(host.apply([{op: "delete", at: [0, 1], count: 1}]));
    assert.deepEqual(host.locateAnchor(anchor, "retained"), [0, 1]);
    assert.equal(host.locateAnchor("missing", "visible"), null);
    assert.equal(session.capture({anchor: [0, 999], focus: [0, 0]}), null);
});
