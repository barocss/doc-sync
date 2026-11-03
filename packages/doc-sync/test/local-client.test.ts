import assert from "node:assert/strict";
import {test} from "node:test";
import {LocalClient} from "../src/local/client.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {EditOp} from "../src/crdt/model.ts";
import {applyEdits} from "../src/crdt/model.ts";
import {Doc} from "../src/crdt/doc.ts";
const schema: Schema = {root: "book", marks: ["bold"], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const insert = (content: string, offset = 0): EditOp[] => [{op: "insert", at: [0, offset], content}];
const text = (client: LocalClient) => client.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join("");

test("memory-only convenience edits record exactly one history action", () => {
    const client = new LocalClient({schema});
    assert.match(client.actor, /^[\w~-]+$/);
    client.edit(insert("hello"));
    assert.equal(text(client), "hello");
    assert.deepEqual(client.historyStatus(), {canUndo: true, canRedo: false});
    client.undo(); assert.equal(text(client), ""); assert.equal(client.historyStatus().canUndo, false);
    client.redo(); assert.equal(text(client), "hello");
    assert.equal("transport" in client, false); assert.equal("others" in client, false);
});

test("aggregate commits accept actual operations once and reject partial, copied and reordered batches", () => {
    const client = new LocalClient({schema, actor: "A"});
    const a = client.apply(insert("a")), b = client.apply(insert("b", 1));
    assert.throws(() => client.commit(a));
    assert.throws(() => client.commit(structuredClone([...a, ...b])));
    assert.throws(() => client.commit([...b, ...a]));
    assert.throws(() => client.undo());
    assert.throws(() => client.edit(insert("x")));
    assert.equal(client.historyStatus().canUndo, false);
    const aggregate = [...a, ...b]; client.commit(aggregate);
    assert.throws(() => client.commit(aggregate));
    client.undo(); assert.equal(text(client), ""); assert.equal(client.historyStatus().canUndo, false);
    client.apply([]); client.edit(insert("z")); assert.equal(text(client), "z");
});

test("ordered model events reproduce text and structure, with isolated errors and rejected reentry", () => {
    const client = new LocalClient({schema, actor: "A"});
    let model = structuredClone(client.model()), updates = 0, rejected = 0;
    client.subscribe({modelEvents: () => { throw new Error("observer"); }, update: () => { throw new Error("observer"); }});
    client.subscribe({modelEvents(edits) {
        model = applyEdits(schema, model, [...edits]);
        try { client.edit(insert("bad")); } catch { rejected++; }
    }, update() { updates++; assert.deepEqual(model, client.model()); }});
    client.edit(insert("A😀한B"));
    client.edit([{op: "split", at: [0, 3]}]);
    client.edit([{op: "merge", at: [1]}]);
    client.undo(); client.redo();
    assert.equal(updates, 5); assert.equal(rejected, 5);
});

test("selection preserves UTF-16 offsets and backward direction across edits", () => {
    const client = new LocalClient({schema, actor: "A"}); client.edit(insert("A😀한B"));
    const range = {anchor: [0, 4], focus: [0, 1]};
    const selection = client.captureSelection(range); assert.ok(selection);
    assert.deepEqual(client.resolveSelection(selection), range);
    client.edit(insert("x"));
    assert.deepEqual(client.resolveSelection(selection), {anchor: [0, 5], focus: [0, 2]});
    assert.equal(client.captureSelection({anchor: [0, 100], focus: [0, 0]}), null);
});

test("origin filters self events; ordinary text input does not copy the full document", () => {
    const client = new LocalClient({schema, actor: "A"}), origin = {};
    client.edit(insert("large enough"));
    let localUpdates = 0, externalUpdates = 0;
    client.subscribe({modelEvents() {}, update() { localUpdates++; }}, {origin});
    client.subscribe({modelEvents() {}, update() { externalUpdates++; }});
    const original = Doc.prototype.toJSON; let calls = 0;
    Doc.prototype.toJSON = function () { calls++; return original.call(this); };
    try {
        const ops = client.apply(insert("x"), origin); client.commit([...ops], undefined, origin);
        assert.equal(calls, 0);
    } finally { Doc.prototype.toJSON = original; }
    assert.equal(localUpdates, 0); assert.equal(externalUpdates, 1);
    client.undo(); assert.equal(localUpdates, 1); assert.equal(externalUpdates, 2);
});

test("composition publishes retained operations once and cancel preserves intervening live edits", () => {
    const client = new LocalClient({schema, actor: "A"}); client.edit(insert("base")); client.clearHistory();
    const input = client.createSession(); input.begin();
    const a = input.apply(insert("한", 4)); input.commit([...a]);
    const b = input.apply(insert("글", 5)); input.commit(b);
    assert.equal(text(client), "base");
    const ops = input.end(); assert.ok(ops.length);
    assert.equal(text(client), "base한글"); assert.throws(() => client.commit(ops));
    client.undo(); assert.equal(text(client), "base"); assert.equal(client.historyStatus().canUndo, false);
    input.begin(); input.commit(input.apply(insert("cancel", 4)));
    client.edit(insert("live")); input.cancel(); assert.equal(text(client), "livebase");
});

test("invalid actors fail before editing and disposal clears active sessions and callbacks", () => {
    for (const actor of ["", "a b", "A@B", "한글", "~root", "a/b"]) assert.throws(() => new LocalClient({schema, actor}));
    const client = new LocalClient({schema, actor: "safe_1-~"});
    let count = 0; const stop = client.subscribe({update() { count++; }});
    const input = client.createSession(); input.begin(); input.commit(input.apply(insert("draft")));
    client.dispose(); client.dispose(); stop();
    // Editor teardown can cancel its session after the owning client is gone.
    assert.doesNotThrow(() => input.cancel()); assert.doesNotThrow(() => input.cancel());
    assert.throws(() => client.model()); assert.throws(() => input.end()); assert.equal(count, 0);
});

test("normalization events reproduce the model after deleting the final block", () => {
    const client = new LocalClient({schema, actor: "A"}); client.edit(insert("keep"));
    let model = structuredClone(client.model());
    client.subscribe({modelEvents(edits) { model = applyEdits(schema, model, [...edits]); }});
    client.edit([{op: "delete", at: [0], count: 1}]);
    assert.deepEqual(model, client.model());
    assert.equal(client.model().children?.[0].type, "line");
    client.undo(); assert.deepEqual(model, client.model()); assert.equal(text(client), "keep");
});

test("without observers text edits and history actions do not build models or snapshots", () => {
    const client = new LocalClient({schema, actor: "A"}); client.edit(insert("ready"));
    const originalModel = Doc.prototype.toJSON, originalSnapshot = Doc.prototype.snapshot;
    let models = 0, snapshots = 0;
    Doc.prototype.toJSON = function () { models++; return originalModel.call(this); };
    Doc.prototype.snapshot = function () { snapshots++; return originalSnapshot.call(this); };
    try { client.edit(insert("x")); client.undo(); client.redo(); }
    finally { Doc.prototype.toJSON = originalModel; Doc.prototype.snapshot = originalSnapshot; }
    assert.equal(models, 0); assert.equal(snapshots, 0);
});

test("draft allocations reserve the live clock before collection", () => {
    const client = new LocalClient({schema, actor: "A"}), input = client.createSession();
    input.begin(); const draft = input.apply(insert("draft"));
    client.edit(insert("live"));
    input.commit(draft); input.end();
    assert.match(text(client)!, /draft/); assert.match(text(client)!, /live/);
    client.undo(); assert.equal(text(client), "live");
});

test("notification errors are bounded messages and reporter failures do not stop fanout", () => {
    let reports = 0, updates = 0;
    const client = new LocalClient({schema, actor: "A", onNotificationError() { reports++; throw new Error("reporter"); }});
    client.subscribe({modelEvents() { throw new Error("model"); }, update() { throw new Error("update"); }});
    client.subscribe({update() { updates++; }});
    for (let i = 0; i < 30; i++) client.edit(insert("x"));
    assert.equal(updates, 30); assert.equal(reports, 60); assert.equal(client.notificationErrors.length, 100);
    assert.deepEqual(client.notificationErrors.at(-1), {phase: "onNotificationError", cause: "local", message: "reporter"});
    assert.equal(text(client)?.length, 30);
});

test("self-only structural input does not build an event model", () => {
    const client = new LocalClient({schema, actor: "A"}), origin = {};
    client.edit(insert("split")); client.subscribe({modelEvents() {}}, {origin});
    const original = Doc.prototype.toJSON; let copies = 0;
    Doc.prototype.toJSON = function () { copies++; return original.call(this); };
    try { const ops = client.apply([{op: "split", at: [0, 2]}], origin); client.commit(ops, undefined, origin); }
    finally { Doc.prototype.toJSON = original; }
    assert.equal(copies, 0);
});

test("composition null records apply without adding undo history", () => {
    const client = new LocalClient({schema, actor: "A"}), input = client.createSession();
    input.begin(); input.commit(input.apply(insert("A")), null); input.commit(input.apply(insert("B", 1)), null);
    input.end(); assert.equal(text(client), "AB");
    assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
    assert.equal(client.undo(), null); assert.equal(text(client), "AB");
});

test("mixed composition records only selected published operations as one history action", () => {
    const client = new LocalClient({schema, actor: "A"}), input = client.createSession();
    input.begin(); input.commit(input.apply(insert("A")), null);
    input.commit(input.apply(insert("B", 1)), {caretBefore: "before-B", caretAfter: "after-B", typing: true});
    input.end(); assert.equal(text(client), "AB");
    assert.equal(client.undo(), "before-B"); assert.equal(text(client), "A");
    assert.equal(client.historyStatus().canUndo, false);
    assert.equal(client.redo(), "after-B"); assert.equal(text(client), "AB");
});
