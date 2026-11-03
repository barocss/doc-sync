import assert from "node:assert/strict";
import {test} from "node:test";
import {typescriptEngine, ENGINE_CONTRACT_VERSION} from "../src/engine/index.ts";
import type {DocumentEngine, TypeScriptEngineCheckpoint} from "../src/engine/index.ts";
import {applyEdits, type EditOp} from "../src/crdt/model.ts";
import type {Schema} from "../src/crdt/schema.ts";
import {Doc, type Op} from "../src/crdt/doc.ts";
import {anchorAt} from "../src/crdt/edit.ts";
import {History} from "../src/crdt/history.ts";

const schema = (root = "manuscript", text = "sentence", mark = "emphasis"): Schema => ({root, marks: [mark], nodes: {
    [root]: {shape: "flow", children: [text], default: text}, [text]: {shape: "text"},
}});
const text = (engine: DocumentEngine) => engine.model().children?.map(node => node.runs?.map(run => "text" in run ? run.text : "□").join("")).join("\n");

test("two unrelated schema names compile without a fixed preset and return detached DTOs", () => {
    for (const s of [schema(), schema("notebook", "utterance", "accent")]) {
        const engine = typescriptEngine.create("writer", s);
        const before = engine.model();
        const edits = [{op: "insert" as const, at: [0, 0], content: "hello"}];
        const result = engine.edit(edits);
        assert.deepEqual(applyEdits(s, applyEdits(s, before, edits), result.normalize), engine.model());
        assert.equal(engine.model().type, s.root);
        const root = s.nodes[s.root];
        assert.equal(engine.model().children?.[0].type, root.shape === "flow" ? root.default : "");
        assert.equal(text(engine), "hello");
        assert.equal(engine.identity().contractVersion, ENGINE_CONTRACT_VERSION);
        engine.schema().nodes[s.root] = {shape: "atom"};
        engine.model().children!.length = 0;
        engine.identity().actor = "mutated";
        assert.equal(text(engine), "hello");
        engine.requireCapability("edit");
        for (const cap of ["composition", "events", "gc", "schema-transition"] as const) assert.throws(() => engine.requireCapability(cap), /Unsupported engine capability/);
    }
});

test("UTF-16 offsets preserve surrogate pairs and isolated surrogates through wire/checkpoint/undo", () => {
    const s = schema(), a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    const value = "a😀\ud800x\udfff";
    const inserted = a.edit([{op: "insert", at: [0, 0], content: value}]);
    b.receive("A", inserted.ops);
    assert.equal(text(b), value);
    const range = {anchor: [0, value.length], focus: [0, 1]};
    const savedRange = a.captureSelection(range);
    assert.deepEqual(a.resolveSelection(savedRange), range);
    const removed = a.edit([{op: "delete", at: [0, 2], count: 1}]);
    b.receive("A", removed.ops);
    assert.equal(text(a), "a\ud83d\ud800x\udfff");
    assert.deepEqual(a.model(), b.model());
    const restored = typescriptEngine.restore("A", s, JSON.parse(JSON.stringify(a.checkpoint())) as TypeScriptEngineCheckpoint);
    b.receive("A", restored.undo().ops);
    assert.equal(text(restored), value);
    assert.deepEqual(restored.model(), b.model());
});

test("concurrent actors converge with causal delayed delivery and duplicate retries", () => {
    const s = schema(), a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    const first = a.edit([{op: "insert", at: [0, 0], content: "left"}]).ops;
    const second = b.edit([{op: "insert", at: [0, 0], content: "right"}]).ops;
    const delayed = a.edit([{op: "insert", at: [0, 4], content: "!"}]).ops;
    a.receive("B", second); a.receive("B", second);
    b.receive("A", first); b.receive("A", first); b.receive("A", delayed); b.receive("A", delayed);
    assert.deepEqual(a.model(), b.model());
    const before = a.checkpoint().history;
    a.receive("A", first); a.receive("A", delayed);
    assert.deepEqual(a.checkpoint().history, before);
    assert.deepEqual(a.model(), b.model());
});

test("own edit/undo/redo echoes are idempotent before and after a coupled restore", () => {
    const s = schema(), a = typescriptEngine.create("A", s);
    const inserted = a.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops;
    for (const action of [() => inserted, () => a.undo().ops, () => a.redo().ops]) {
        const ops = action();
        const before = a.checkpoint();
        a.receive("A", ops); a.receive("A", ops);
        assert.deepEqual(a.model(), typescriptEngine.restore("A", s, before).model());
        assert.deepEqual(a.checkpoint().history, before.history);
    }
    const restored = typescriptEngine.restore("A", s, a.checkpoint());
    restored.receive("A", inserted);
    const next = restored.edit([{op: "insert", at: [0, 3], content: "d"}]).ops;
    const oldIds = inserted.filter(op => "id" in op).map(op => (op as Extract<Op, {t: "text"}>).id.lamport);
    assert.ok(next.filter(op => "id" in op).every(op => (op as Extract<Op, {t: "text"}>).id.lamport > Math.max(...oldIds)));
    assert.equal(text(restored), "abcd");
});

test("foreign same-value formatting fences local undo and redo", () => {
    const s = schema(), a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    b.receive("A", a.edit([{op: "insert", at: [0, 0], content: "ab"}], null).ops);
    b.receive("A", a.edit([{op: "update", at: [0, 0], length: 2, attrs: {emphasis: true}}]).ops);
    a.receive("B", b.edit([{op: "update", at: [0, 1], length: 1, attrs: {emphasis: true}}]).ops);
    const restored = typescriptEngine.restore("A", s, a.checkpoint());
    for (const action of ["undo", "redo", "undo"] as const) {
        assert.deepEqual(restored[action]().ops, a[action]().ops);
        assert.deepEqual(restored.model(), a.model());
    }
    assert.deepEqual(a.model().children?.[0].runs, [{text: "a", marks: {}}, {text: "b", marks: {emphasis: true}}]);
});

test("undo cancels only local deletion; foreign deletion remains and pin uses value pairs", () => {
    const s = schema(), a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    b.receive("A", a.edit([{op: "insert", at: [0, 0], content: "abc"}], null).ops);
    const local = a.edit([{op: "delete", at: [0, 1], count: 1}]).ops;
    const remote = b.edit([{op: "delete", at: [0, 1], count: 1}]).ops;
    a.receive("B", remote);
    const del = local.find(op => op.t === "del");
    assert.ok(del && del.t === "del");
    assert.equal(a.historyPin([[`${del.at.lamport}@${del.at.actor}`, 7]]), 7);
    a.undo();
    assert.equal(text(a), "ac");
    a.clearHistory();
    assert.deepEqual(a.historyStatus(), {canUndo: false, canRedo: false});
    assert.equal(a.historyPin([]), null);
});

test("anchors reject invalid paths and return null for hidden nested content", () => {
    const s: Schema = {root: "book", marks: [], nodes: {
        book: {shape: "flow", children: ["line", "box"], default: "line"}, line: {shape: "text"},
        box: {shape: "flow", children: ["line"], default: "line"},
    }};
    const a = typescriptEngine.create("A", s);
    a.edit([{op: "insert", at: [0], content: [{type: "box", children: [{type: "line", runs: [{text: "inner", marks: {}}]}]}]}]);
    const anchor = a.captureAnchor([1, 0, 3]) ?? a.captureAnchor([0, 0, 3]);
    assert.ok(anchor);
    assert.ok(a.resolveAnchor(anchor));
    assert.equal(a.captureAnchor([0, 999]), null);
    assert.equal(a.captureAnchor([-1, 0]), null);
    assert.equal(a.resolveAnchor("missing"), null);
    const index = a.model().children!.findIndex(node => node.type === "box");
    a.edit([{op: "delete", at: [index], count: 1}]);
    assert.equal(a.resolveAnchor(anchor), null);
});

test("invalid edit/wire batches leave document history clock and revision unchanged", () => {
    const s = schema(), a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    a.edit([{op: "insert", at: [0, 0], content: "local"}]);
    const before = a.checkpoint();
    assert.throws(() => a.edit([{op: "insert", at: [0, 0], content: "staged"}, {op: "insert", at: [99, 0], content: "bad"}]));
    assert.deepEqual(a.checkpoint(), before);
    const valid = b.edit([{op: "insert", at: [0, 0], content: "remote"}]).ops;
    assert.throws(() => a.receive("B", [...valid, {t: "text", id: {actor: "B", lamport: 99}, origin: {actor: "absent", lamport: 42}, text: "bad"}]));
    assert.deepEqual(a.checkpoint(), before);
    assert.throws(() => a.receive("C", valid), /writer/);
    assert.deepEqual(a.checkpoint(), before);
});

test("checkpoint metadata, graph and document coupling failures are atomic", () => {
    const s = schema(), a = typescriptEngine.create("A", s);
    a.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    a.edit([{op: "update", at: [0, 0], length: 1, attrs: {emphasis: true}}]);
    const good = a.checkpoint();
    const mutations: Array<(cp: TypeScriptEngineCheckpoint) => void> = [
        cp => {cp.identity.actor = "B";}, cp => {cp.identity.engine = "wasm";},
        cp => {cp.identity.contractVersion = 2 as 1;}, cp => {cp.identity.schemaVersion = "wrong";},
        cp => {cp.identity.capabilities = [];}, cp => {cp.history.version = 2 as 1;},
        cp => {cp.history.currentSets = [["x", 9999]];},
        cp => {cp.document = typescriptEngine.create("A", s).checkpoint().document;},
        cp => {cp.document.lamport = 0;},
    ];
    for (const mutate of mutations) {
        const bad = structuredClone(good); mutate(bad);
        assert.throws(() => a.restore(bad));
        assert.deepEqual(a.checkpoint(), good);
    }
    assert.throws(() => typescriptEngine.restore("A", schema("different", "other"), good));
    const restored = typescriptEngine.restore("A", s, good);
    good.document.lines.length = 0;
    assert.equal(text(restored), "abc");
});

test("table edits return nonempty normalization for one-row column insertion", () => {
    const s: Schema = {root: "volume", marks: [], nodes: {
        volume: {shape: "flow", children: ["verse", "matrix"], default: "verse"}, verse: {shape: "text"},
        matrix: {shape: "grid", children: ["band"]}, band: {shape: "row", children: ["entry"]},
        entry: {shape: "cell", children: ["contents"]}, contents: {shape: "flow", children: ["verse"], default: "verse"},
    }};
    const cell = (value: string) => ({type: "entry", children: [{type: "contents", children: [{type: "verse", runs: [{text: value, marks: {}}]}]}]});
    const a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    b.receive("A", a.edit([{op: "insert", at: [0], content: [{type: "matrix", children: [
        {type: "band", children: [cell("a"), cell("b")]}, {type: "band", children: [cell("c"), cell("d")]},
    ]}]}]).ops);
    const index = a.model().children!.findIndex(node => node.type === "matrix");
    const before = a.model();
    const edits = [{op: "insert" as const, at: [index, 0, 1], content: [cell("new")]}];
    const result = a.edit(edits);
    assert.ok(result.normalize.length > 0);
    assert.deepEqual(applyEdits(s, applyEdits(s, before, edits), result.normalize), a.model());
    b.receive("A", result.ops);
    assert.deepEqual(a.model(), b.model());
    const restored = typescriptEngine.restore("A", s, a.checkpoint());
    assert.deepEqual(restored.undo().ops, a.undo().ops);
    assert.deepEqual(restored.model(), a.model());
});

test("backward selection follows remote insert and survives checkpoint restore", () => {
    const s = schema(), a = typescriptEngine.create("A", s), b = typescriptEngine.create("B", s);
    b.receive("A", a.edit([{op: "insert", at: [0, 0], content: "abcd"}]).ops);
    const selection = a.captureSelection({anchor: [0, 4], focus: [0, 2]});
    assert.ok(selection);
    a.receive("B", b.edit([{op: "insert", at: [0, 1], content: "XX"}]).ops);
    assert.deepEqual(a.resolveSelection(selection), {anchor: [0, 6], focus: [0, 4]});
    const restored = typescriptEngine.restore("A", s, a.checkpoint());
    assert.deepEqual(restored.resolveSelection(selection), a.resolveSelection(selection));
});

test("structural move/split history remains coupled across repeated undo and redo", () => {
    const s: Schema = {root: "book", marks: [], nodes: {
        book: {shape: "flow", children: ["line", "box"], default: "line"}, line: {shape: "text"},
        box: {shape: "flow", children: ["line", "box"], default: "line"},
    }};
    const a = typescriptEngine.create("A", s);
    const p = (value: string) => ({type: "line", runs: [{text: value, marks: {}}]});
    a.edit([{op: "insert", at: [0], content: [p("abc"), p("DEFG"), {type: "box", children: [p("inside")]}]}], null);
    a.edit([{op: "move", from: [1], at: [2, 1]}]);
    a.edit([{op: "split", at: [1, 1, 2]}]);
    a.edit([{op: "move", from: [1, 2], at: [1]}]);
    a.undo();
    const restored = typescriptEngine.restore("A", s, a.checkpoint());
    for (const action of ["undo", "undo", "redo", "redo", "redo", "undo", "undo"] as const) {
        assert.deepEqual(restored[action]().ops, a[action]().ops);
        assert.deepEqual(restored.model(), a.model());
        assert.deepEqual(restored.historyStatus(), a.historyStatus());
        assert.deepEqual(restored.checkpoint().history, a.checkpoint().history);
    }
});

test("invalid schema and non-JSON DTO inputs reject without changing live state", () => {
    assert.throws(() => typescriptEngine.create("A", {root: "missing", marks: [], nodes: {}}), /Invalid schema/);
    assert.throws(() => typescriptEngine.create("bad actor", schema()), /actor/);
    const a = typescriptEngine.create("A", schema()), before = a.checkpoint();
    const sparse = new Array(1) as Op[];
    assert.throws(() => a.receive("B", sparse), /dense/);
    const bad: EditOp[] = [{op: "update", at: [0, 0], attrs: {emphasis: NaN}, length: 0}];
    assert.throws(() => a.edit([...bad]), /JSON/);
    assert.deepEqual(a.checkpoint(), before);
});

test("shared and distinct object span values match the real Doc compiler and checkpoint continuation", () => {
    const s: Schema = {root: "root", marks: [], markValues: {link: {default: null}}, nodes: {
        root: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text", children: ["hyperlink"]}, hyperlink: {shape: "span", mark: "link", attr: "target"},
    }};
    for (const shared of [true, false]) {
        const value = {url: "same"};
        const edits: EditOp[] = [{op: "insert", at: [0, 0], content: [
            {text: "a", marks: {link: value}}, {text: "b", marks: {link: shared ? value : {url: "same"}}},
        ]}];
        const doc = new Doc("A", s), engine = typescriptEngine.create("A", s);
        assert.deepEqual(engine.edit(edits), doc.edit(edits, {normalize: true}));
        assert.deepEqual(engine.model(), doc.toJSON());
        for (const offset of [0, 1, 2]) assert.equal(engine.captureAnchor([0, offset]), anchorAt(doc, [0, offset]));
        const restored = typescriptEngine.restore("A", s, engine.checkpoint());
        const directRestored = Doc.fromSnapshot("A", doc.snapshot(), s);
        const continuation: EditOp[] = [{op: "insert", at: [0, 2], content: "c"}];
        assert.deepEqual(restored.edit(continuation), directRestored.edit(continuation, {normalize: true}));
        assert.deepEqual(restored.model(), directRestored.toJSON());
        const model = restored.model(), run = model.children![0].runs![0];
        if (!("text" in run)) (run.attrs!.target as {url: string}).url = "mutated";
        assert.deepEqual(restored.model(), directRestored.toJSON());
    }
});

test("negative-zero DTOs and undo match the existing Doc/History JSON semantics", () => {
    const s: Schema = {root: "r", marks: [], nodes: {
        r: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text", attrs: {n: {default: 1}}},
    }};
    const engine = typescriptEngine.create("A", s), doc = new Doc("A", s), history = new History();
    for (const n of [-0, 2]) {
        const edits: EditOp[] = [{op: "update", at: [0], attrs: {n}}];
        const result = doc.edit(edits, {normalize: true});
        history.record(result.ops, doc, {caretBefore: "", caretAfter: ""});
        assert.deepEqual(engine.edit(edits), result);
        assert.deepEqual(engine.model(), doc.toJSON());
        assert.equal(Object.is(engine.model().children![0].attrs!.n, -0), Object.is(n, -0));
    }
    assert.deepEqual(engine.undo(), history.undo(doc));
    assert.equal(Object.is(engine.model().children![0].attrs!.n, -0), Object.is(doc.toJSON().children![0].attrs!.n, -0));
    assert.deepEqual(engine.model(), doc.toJSON());
    assert.deepEqual(engine.redo(), history.redo(doc));
    assert.deepEqual(engine.model(), doc.toJSON());
});
