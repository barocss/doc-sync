import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {History} from "../src/crdt/history.ts";
import {typescriptClientEngineFactory} from "../src/engine/index.ts";
import type {TypeScriptClientCompatibility} from "../src/engine/client-contract.ts";
import type {Schema} from "../src/crdt/schema.ts";

const schema: Schema = {root: "doc", marks: ["bold"], markValues: {payload: {default: null}}, nodes: {
    doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"},
}};
const record = {caretBefore: "", caretAfter: ""};

test("session formatting publication records live prior values once", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0, 0], content: [{text: "ab", marks: {bold: true}}]}]);
    const before = engine.model(), session = engine.createSession();
    session.begin();
    session.collect(session.apply([{op: "update", at: [0, 0], length: 1, attrs: {bold: false}}]), record);
    const published = session.publish()!;
    engine.record(published.ops, published.record);
    assert.equal(engine.historyStatus().canUndo, true);
    engine.undo(); assert.deepEqual(engine.model(), before);
    assert.equal(engine.historyStatus().canUndo, false);
});

test("checkpoint metadata validation does not inspect attribute JSON as ticket metadata", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0, 0], content: "ab"}]);
    for (const payload of [{lamport: Number.MAX_SAFE_INTEGER, actor: "user-data"}, {type: "existence", ids: ["plain-data"]}]) {
        const ops = engine.apply([{op: "update", at: [0, 0], length: 1, attrs: {payload}}]);
        engine.record(ops, record);
        const before = engine.model(), state = engine.prepareCheckpoint(engine.checkpoint());
        engine.installCheckpoint(state); assert.deepEqual(engine.model(), before);
    }
});

test("near-exhausted history failure preserves document clock and undo graph", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    const ops = engine.apply([{op: "insert", at: [0, 0], content: "ab"}]); engine.record(ops, record);
    (engine as unknown as TypeScriptClientCompatibility).typescriptDocument().clock.lamport = Number.MAX_SAFE_INTEGER;
    const before = engine.checkpoint(), stamp = engine.stamp();
    assert.throws(() => engine.undo(), /clock|safe|range|exhaust/i);
    assert.deepEqual(engine.checkpoint(), before); assert.deepEqual(engine.stamp(), stamp);
});

test("invalid text paths on fresh required storage leave retained state unchanged", () => {
    const required: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p", "box"], default: "p", childRules: {box: {min: 1, max: 1}}},
        p: {shape: "text"}, box: {shape: "flow", children: ["p"], default: "p"},
    }};
    const engine = typescriptClientEngineFactory.create("A", required), before = engine.checkpoint(), stamp = engine.stamp();
    assert.throws(() => engine.apply([{op: "insert", at: [99, 0], content: "invalid"}]));
    assert.deepEqual(engine.checkpoint(), before); assert.deepEqual(engine.stamp(), stamp);
});

test("invalid anchors on fresh required storage do not create retained lines", () => {
    const required: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p", "box"], default: "p", childRules: {box: {min: 1}}},
        p: {shape: "text"}, box: {shape: "flow", children: ["p"], default: "p"},
    }};
    const engine = typescriptClientEngineFactory.create("A", required), before = engine.checkpoint();
    assert.equal(engine.captureAnchor([99, 0]), null); assert.deepEqual(engine.checkpoint(), before);
});

test("physical text editing reuses stored paths without document-wide inventory or projection", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument();
    doc.lines = () => { throw new Error("Unexpected whole-document line inventory"); };
    doc.withReadProjection = () => { throw new Error("Unexpected whole-document read projection"); };
    engine.apply([{op: "insert", at: [0, 0], content: [{text: "a😀", marks: {bold: true}}]}]);
    engine.apply([{op: "delete", at: [0, 0], count: 1}]);
    assert.equal(engine.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join(""), "😀");
});

test("relayed batches and checkpointed redo retain foreign target identities", () => {
    const peer = typescriptClientEngineFactory.create("B", schema), engine = typescriptClientEngineFactory.create("A", schema);
    const ops = peer.apply([{op: "insert", at: [0, 0], content: "foreign"}]);
    engine.receive("relay", ops); assert.deepEqual(engine.model(), peer.model());
    const deleted = engine.apply([{op: "delete", at: [0, 0], count: 1}]); engine.record(deleted, record);
    engine.undo(); const before = engine.model(), state = engine.prepareCheckpoint(engine.checkpoint());
    engine.installCheckpoint(state); assert.deepEqual(engine.model(), before); engine.redo();
    assert.equal(engine.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join(""), "oreign");
});

test("public production factory owns and freezes its schema input", () => {
    const input = structuredClone(schema), engine = typescriptClientEngineFactory.create("A", input), before = engine.identity();
    input.nodes.p = {shape: "atom"}; input.nodes.extra = {shape: "text"};
    assert.deepEqual(engine.identity(), before); assert.equal(engine.schema().nodes.p.shape, "text");
    assert.equal(Object.isFrozen(engine.schema()), true); assert.equal(Object.isFrozen(engine.schema().nodes), true);
});

test("single validated text mark updates add no document snapshots on a 100k document", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0, 0], content: "a".repeat(100_000)}]);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument();
    let snapshots = 0; const snapshot = doc.snapshot.bind(doc); doc.snapshot = () => { snapshots++; return snapshot(); };
    engine.setEditHooks({guard: null, listener: () => {}});
    const ops = engine.apply([{op: "update", at: [0, 49_999], length: 2, attrs: {bold: true, payload: "tag"}}]);
    engine.record(ops, record); engine.undo(); engine.redo();
    assert.equal(snapshots, 0); assert.equal(ops.length, 2);
    assert.equal(engine.model().children?.[0].runs?.some(run => "text" in run && run.marks.bold === true && run.marks.payload === "tag"), true);
});

test("mark clock preflight preserves live state when a later attribute exhausts allocation", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0, 0], content: "ab"}]);
    (engine as unknown as TypeScriptClientCompatibility).typescriptDocument().clock.lamport = Number.MAX_SAFE_INTEGER - 1;
    const before = engine.checkpoint(), stamp = engine.stamp();
    assert.throws(() => engine.apply([{op: "update", at: [0, 0], length: 1, attrs: {bold: true, payload: "tag"}}]), /clock|safe|range|exhaust/i);
    assert.deepEqual(engine.checkpoint(), before); assert.deepEqual(engine.stamp(), stamp);
});

test("single physical text input and strict anchor capture each scan the parent layout once", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0], content: ["a", "b", "c"].map(text => ({type: "p", runs: [{text, marks: {}}]}))}]);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument();
    const blocks = engine.model().children!.length; let visited = 0;
    const groupOf = doc.groupOf.bind(doc); doc.groupOf = (...args) => { visited++; return groupOf(...args); };
    engine.apply([{op: "insert", at: [blocks - 1, 0], content: "x"}]);
    assert.equal(visited, blocks);
    visited = 0; assert.ok(engine.captureAnchor([blocks - 1, 1])); assert.equal(visited, blocks);
});

test("path memo invalidates when a nested custom guard changes the document", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0], content: ["first", "second"].map(text => ({type: "p", runs: [{text, marks: {}}]}))}]);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument();
    const expected = doc.constructor as typeof import("../src/crdt/doc.ts").Doc;
    const baseline = expected.fromSnapshot("A", doc.snapshot(), doc.schema);
    for (const target of [doc, baseline]) {
        let entered = false;
        target.editGuard = () => {
            if (entered) return; entered = true;
            target.edit([{op: "insert", at: [0], content: [{type: "p", runs: [{text: "guard", marks: {}}]}]}]);
        };
    }
    engine.apply([{op: "insert", at: [1, 0], content: "x"}]);
    baseline.edit([{op: "insert", at: [1, 0], content: "x"}]);
    assert.deepEqual(engine.model(), baseline.toJSON());
});

test("plain-root split and merge preserve wire history and foreign formatting without snapshots", () => {
    const engine = typescriptClientEngineFactory.create("A", schema);
    engine.apply([{op: "insert", at: [0], content: ["a😀b", "tail"].map(text => ({type: "p", runs: [{text, marks: {}}]}))}]);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument();
    const baseline = Doc.fromSnapshot("A", doc.snapshot(), doc.schema), history = new History();
    let snapshots = 0; const snapshot = doc.snapshot.bind(doc); doc.snapshot = () => { snapshots++; return snapshot(); };
    for (const edits of [[{op: "split" as const, at: [0, 3]}], [{op: "merge" as const, at: [1]}]]) {
        const actual = engine.apply(edits), expected = baseline.edit(edits).ops;
        assert.deepEqual(actual, expected); engine.record(actual, record); history.record(expected, baseline, record);
        assert.deepEqual(engine.model(), baseline.toJSON());
    }
    assert.equal(snapshots, 0);
    const peer = Doc.fromSnapshot("B", snapshot(), doc.schema);
    const remote = peer.edit([{op: "update", at: [0, 0], length: 1, attrs: {bold: true}}]).ops;
    engine.receive("relay", remote); remote.forEach(op => baseline.apply(op));
    for (const action of ["undo", "undo", "redo", "redo"] as const) {
        assert.deepEqual(engine[action](), history[action](baseline)); assert.deepEqual(engine.model(), baseline.toJSON());
    }
});

test("plain-root next type and inherited scalar attrs split with one remaining ticket", () => {
    const styled: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["heading", "p"], default: "heading"},
        heading: {shape: "text", next: "p", attrs: {level: {default: 0, min: 0, max: 4, inherit: true}}},
        p: {shape: "text", attrs: {level: {default: 0, min: 0, max: 4, inherit: true}}},
    }};
    const engine = typescriptClientEngineFactory.create("A", styled);
    engine.apply([{op: "update", at: [0], attrs: {level: 2}}, {op: "insert", at: [0, 0], content: "x"}]);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument(); doc.clock.lamport = Number.MAX_SAFE_INTEGER - 1;
    const baseline = Doc.fromSnapshot("A", doc.snapshot(), doc.schema); let snapshots = 0;
    const snapshot = doc.snapshot.bind(doc); doc.snapshot = () => { snapshots++; return snapshot(); };
    const edits = [{op: "split" as const, at: [0, 1]}];
    assert.deepEqual(engine.apply(edits), baseline.edit(edits).ops); assert.deepEqual(engine.model(), baseline.toJSON());
    assert.equal(engine.allocationFloor(), Number.MAX_SAFE_INTEGER); assert.equal(snapshots, 0);
    assert.equal(engine.model().children?.[1].type, "p"); assert.equal(engine.model().children?.[1].attrs?.level, 2);
});

test("initial guard clock changes are validated before any mark or split allocation", () => {
    for (const action of ["mark", "split"] as const) {
        const engine = typescriptClientEngineFactory.create("A", schema);
        engine.apply([{op: "insert", at: [0, 0], content: "ab"}]);
        const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument(), before = engine.checkpoint(), stamp = engine.stamp();
        doc.editGuard = () => { doc.clock.lamport = action === "mark" ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER; };
        const edits = action === "mark" ? [{op: "update" as const, at: [0, 0], length: 1, attrs: {bold: true, payload: "tag"}}] : [{op: "split" as const, at: [0, 1]}];
        assert.throws(() => engine.apply(edits), /clock|safe|range|exhaust/i);
        assert.deepEqual(engine.stamp(), stamp); assert.deepEqual(engine.snapshot().lines, (before.document as ReturnType<Doc["snapshot"]>).lines);
        assert.deepEqual(engine.checkpoint().history, before.history);
        assert.equal(doc.clock.lamport, action === "mark" ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER);
    }
});

test("inherited nested fields retain detached split proof and fail atomically with one ticket", () => {
    const fields: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p"], default: "p"},
        p: {shape: "text", attrs: {data: {default: {value: ""}, fields: {value: {default: ""}}, inherit: true}}},
    }};
    const engine = typescriptClientEngineFactory.create("A", fields);
    engine.apply([{op: "update", at: [0], attrs: {data: {value: "retained"}}}, {op: "insert", at: [0, 0], content: "ab"}]);
    const doc = (engine as unknown as TypeScriptClientCompatibility).typescriptDocument(); doc.clock.lamport = Number.MAX_SAFE_INTEGER - 1;
    const before = engine.checkpoint(), stamp = engine.stamp();
    assert.throws(() => engine.apply([{op: "split", at: [0, 1]}]), /clock|safe|range|exhaust/i);
    assert.deepEqual(engine.checkpoint(), before); assert.deepEqual(engine.stamp(), stamp);
});

test("100k text with two marks keeps baseline-compatible snapshot preparation", () => {
    const rich: Schema = {...schema, marks: ["bold", "italic"]};
    const seed = new Doc("seed", rich);
    seed.edit([{op: "insert", at: [0, 0], content: [{text: "ab".repeat(50_000), marks: {bold: true, italic: true}}]}]);
    const snapshot = seed.snapshot(), baseline = Doc.fromSnapshot("A", snapshot, rich);
    const engine = typescriptClientEngineFactory.create("A", rich), prepared = engine.prepareSnapshot(snapshot);
    engine.installPrepared(prepared); assert.deepEqual(engine.snapshot(), baseline.snapshot()); assert.deepEqual(engine.model(), baseline.toJSON());
});
