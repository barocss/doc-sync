import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, MAIN, slotKey, type EditOp, type NodeJSON, type Op, type Schema} from "../src/index.ts";
import {applyEdits} from "../src/crdt/model.ts";
import {WORD_SCHEMA, PRESENTATION_SCHEMA} from "../../../fixtures/product-schemas.ts";

const paragraph = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const options = {caretBefore: "", caretAfter: ""};
function moved(schema: Schema, type: string, text = "HEAD😀") {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [1], content: [{type}]}]);
    doc.edit([{op: "insert", at: [1, 0, 0], content: text}]);
    const line = doc.blocks()[1];
    assert.equal(line.kind, "flow");
    if (line.kind !== "flow") throw new Error("flow expected");
    const [head, required] = doc.blocks(line.body);
    const move: Op = {t: "move", at: {lamport: doc.clock.next().lamport, actor: "B"}, target: head.marker.id, parent: doc.get(line.body)!.id, after: required.marker.id};
    assert.equal(doc.check([move]), null);
    doc.apply(move);
    return {doc, line: line.body, head: head.marker, move, text};
}
function checkInsertion(state: ReturnType<typeof moved>, edits: EditOp[]) {
    const {doc, head, move, text} = state;
    const snapshot = doc.snapshot(), before = doc.toJSON();
    const expected = applyEdits(doc.schema!, before, edits);
    const {ops, normalize} = doc.edit(edits);
    assert.deepEqual(normalize, []);
    assert.deepEqual(doc.toJSON(), expected);
    assert.equal(ops.some(op => op.t === "move" && op.target.actor === head.id.actor && op.target.lamport === head.id.lamport), false);
    assert.deepEqual(doc.placementOf(head.id)?.at, move.t === "move" ? move.at : null);
    assert.equal(doc.sourceBlocks(head.line.key).filter(b => b.kind === "text").flatMap(b => b.kind === "text" ? b.chars.map(c => c.ch) : []).join("").includes(text), true);
    const replica = Doc.fromSnapshot("R", snapshot, doc.schema!);
    assert.equal(replica.check(ops), null);
    ops.forEach(op => replica.apply(op));
    assert.deepEqual(replica.toJSON(), expected);
    assert.deepEqual(Doc.fromSnapshot("A", doc.snapshot(), doc.schema!).toJSON(), expected);
    const history = new History();
    history.record(ops, doc, options);
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), before);
    assert.deepEqual(doc.placementOf(head.id)?.at, move.t === "move" ? move.at : null);
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(doc.placementOf(head.id)?.at, move.t === "move" ? move.at : null);
    return ops;
}
for (const [schema, type] of [[WORD_SCHEMA, "section"], [PRESENTATION_SCHEMA, "slide"]] as const) {
    for (const index of [0, 1, 2]) test(`${type} moved head: canonical child ${index} retains foreign placement and exact history`, () => {
        checkInsertion(moved(schema, type), [{op: "insert", at: [1, index], content: [paragraph("NEW")]}]);
    });
    test(`${type} moved head: canonical nested path reaches the required flow`, () => {
        checkInsertion(moved(schema, type), [{op: "insert", at: [1, 1, 0, 0], content: "NOTE"}]);
    });
    test(`${type} moved head: multiple sequential inserts share one history transaction`, () => {
        checkInsertion(moved(schema, type), [{op: "insert", at: [1, 1], content: [paragraph("ONE")]}, {op: "insert", at: [1, 2], content: [paragraph("TWO")]}]);
    });
}

test("a grouped leading text does not create another default", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph", "list", "box"], default: "paragraph"},
        paragraph: {shape: "text"}, list: {shape: "group", children: ["item"], by: []}, item: {shape: "text"},
        box: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    }};
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [{type: "list", children: [{type: "item", runs: [{text: "A", marks: {}}]}]}, {type: "box"}]}]);
    doc.edit([{op: "move", from: [1], at: [1]}]);
    const before = doc.toJSON(), edits: EditOp[] = [{op: "insert", at: [0, 0, 1], content: "NEW"}];
    const result = doc.edit(edits);
    assert.deepEqual(doc.toJSON(), applyEdits(schema, before, edits));
    assert.equal(result.ops.filter(op => op.t === "node" && op.type === "paragraph").length, 0);
});

test("invalid canonical child and traversal paths do not emit incidental defaults", () => {
    for (const at of [[1, 99], [1, 99, 0], [1, 0, 0, 0]]) {
        const {doc} = moved(PRESENTATION_SCHEMA, "slide");
        doc.toJSON();
        const before = doc.snapshot();
        assert.throws(() => doc.edit([{op: "insert", at, content: [paragraph("NO")]}]));
        assert.deepEqual(doc.snapshot(), before);
    }
});

test("a max-zero default is not materialized while traversing its parent", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph", "box"], default: "paragraph", childRules: {paragraph: {max: 0}, box: {min: 0, max: 1}}},
        paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    }};
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [{type: "box"}]}]);
    doc.edit([{op: "move", from: [0], at: [0]}]);
    const before = doc.toJSON(), edits: EditOp[] = [{op: "insert", at: [0, 0, 0], content: "INSIDE"}];
    const result = doc.edit(edits);
    assert.deepEqual(doc.toJSON(), applyEdits(schema, before, edits));
    assert.equal(result.ops.some(op => op.t === "node"), false);
});

test("a written automatic leading text keeps its identity and foreign content", () => {
    const state = moved(WORD_SCHEMA, "section");
    const automatic = state.doc.blocks(state.line)[0].marker;
    const foreign: Op = {t: "text", id: {lamport: state.doc.clock.next().lamport, actor: "B"}, origin: automatic.id, text: "FOREIGN😀"};
    assert.equal(state.doc.check([foreign]), null);
    state.doc.apply(foreign);
    const ops = checkInsertion(state, [{op: "insert", at: [1, 0], content: [paragraph("NEW")]}]);
    assert.equal(ops.filter(op => op.t === "node" && op.type === "paragraph").length, 1);
    assert.equal(state.doc.blocks(state.line).some(block => block.marker.key === automatic.key), true);
});

test("source virtual promotion uses UTF-16 line order despite reversed lazy reads", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
        box: {shape: "flow", children: ["paragraph", "rule"], default: "paragraph"},
        paragraph: {shape: "text"}, rule: {shape: "atom"},
    }};
    const setup = (reverse: boolean) => {
        const doc = new Doc("A", schema);
        const first = {lamport: 1, actor: "A"}, second = {lamport: 2, actor: "A"};
        doc.emit([{t: "node", id: first, origin: doc.get(MAIN)!.id, type: "box"}, {t: "node", id: second, origin: first, type: "box"}]);
        const bodies = [slotKey(first, "body"), slotKey(second, "body")];
        for (const line of reverse ? bodies.slice().reverse() : bodies) doc.get(line);
        // Two eligible virtual paragraphs per line also exercise stable local order.
        for (const [index, line] of bodies.entries()) {
            const atom = doc.clock.next(), text = doc.clock.next();
            const atom2 = {lamport: text.lamport + 2, actor: "A"}, text2 = {lamport: atom2.lamport + 1, actor: "A"};
            doc.emit([
                {t: "node", id: atom, origin: doc.get(line)!.id, type: "rule"},
                {t: "text", id: text, origin: atom, text: `${index}a`},
                {t: "node", id: atom2, origin: {lamport: text.lamport + 1, actor: "A"}, type: "rule"},
                {t: "text", id: text2, origin: atom2, text: `${index}b`},
            ]);
        }
        const eligible = doc.lines().flatMap(line => doc.sourceBlocks(line.key).filter(block => block.kind === "text" && block.virtual && block.chars.length).map(block => ({line: line.key, block})));
        assert.deepEqual([...new Set(eligible.map(item => item.line))], reverse ? bodies.slice().reverse() : bodies);
        return {doc, eligible};
    };
    const results = [false, true].map(reverse => {
        const {doc, eligible} = setup(reverse), before = doc.toJSON(), snapshot = doc.snapshot();
        const expected = eligible.slice().sort((a, b) => a.line < b.line ? -1 : a.line > b.line ? 1 : 0);
        const firstTicket = doc.clock.lamport + 1;
        const ops = doc.edit([{op: "move", from: [1], at: [2]}]).ops;
        const promoted = ops.filter((op): op is Extract<Op, {t: "node"}> => op.t === "node" && !!op.boundary?.startsWith("virtual:"));
        assert.equal(promoted.length, 4);
        assert.deepEqual(promoted, expected.map(({block}, index) => ({t: "node", id: {lamport: firstTicket + index, actor: "A"}, origin: block.marker.id, type: block.type, boundary: `virtual:${block.marker.key}|${block.kind === "text" ? block.chars[0].key : ""}`})));
        const after = doc.toJSON(), replica = Doc.fromSnapshot("R", snapshot, schema);
        assert.equal(replica.check(ops), null);
        ops.forEach(op => replica.apply(op));
        assert.deepEqual(replica.toJSON(), after);
        const history = new History();
        history.record(ops, doc, options);
        history.undo(doc);
        assert.deepEqual(doc.toJSON(), before);
        history.redo(doc);
        assert.deepEqual(doc.toJSON(), after);
        return {ops, after};
    });
    assert.deepEqual(results[0], results[1]);
});

for (const max of [0, 1, 3]) for (const tone of ["", "foreign"]) test(`grouped default insertion preserves group counts and by attrs (max ${max}, tone ${tone})`, () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph", "list", "box"], default: "item", childRules: {list: {max}, box: {max: 0}}},
        list: {shape: "group", children: ["item"], by: ["tone"]},
        item: {shape: "text", attrs: {tone: {default: ""}}}, paragraph: {shape: "text"},
        box: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    }};
    const make = () => {
        const doc = new Doc("A", schema), head = doc.get(MAIN)!;
        const text = doc.clock.next();
        doc.emit([{t: "text", id: text, origin: head.id, text: "KEEP"}]);
        if (tone) doc.emit([{t: "set", at: doc.clock.next(), ids: [head.id], key: "tone", value: tone}]);
        const box = doc.clock.next();
        doc.emit([{t: "node", id: box, origin: {lamport: text.lamport + 3, actor: "A"}, type: "box"}]);
        doc.apply({t: "move", at: {lamport: doc.clock.next().lamport, actor: "B"}, target: box, parent: head.id, after: null});
        return doc;
    };
    const count = make().toJSON().children!.length;
    for (let index = 0; index <= count; index++) {
        const doc = make(), before = doc.toJSON(), snapshot = doc.snapshot();
        if (max === 3 && !tone) assert.equal(before.children![0].children!.length, 2, "automatic default and authored item share one group");
        const edits: EditOp[] = [{op: "insert", at: [index], content: [paragraph("NEW")]}];
        const expected = applyEdits(schema, before, edits), {ops, normalize} = doc.edit(edits);
        assert.deepEqual(normalize, []);
        assert.deepEqual(doc.toJSON(), expected);
        const original = doc.sourceBlocks()[0];
        assert.equal(original.kind === "text" && original.text, "KEEP");
        if (max === 0) assert.equal(ops.some(op => op.t === "node" && op.type === "item"), false);
        const replica = Doc.fromSnapshot("R", snapshot, schema);
        assert.equal(replica.check(ops), null);
        ops.forEach(op => replica.apply(op));
        assert.deepEqual(replica.toJSON(), expected);
        const history = new History();
        history.record(ops, doc, options);
        history.undo(doc);
        assert.deepEqual(doc.toJSON(), before);
        history.redo(doc);
        assert.deepEqual(doc.toJSON(), expected);
    }
});

for (const [schema, nestedType] of [[WORD_SCHEMA, "section"], [PRESENTATION_SCHEMA, "slide"]] as const) {
    for (const across of [false, true]) test(`${schema.root} append after ${across ? "cross-flow" : "same-flow"} move undo/redo keeps the moved source boundary separate`, () => {
        const doc = new Doc("A", schema), moveHistory = new History();
        doc.edit([{op: "insert", at: [0, 0], content: "ROOT😀"}]);
        if (across) doc.edit([{op: "insert", at: [1], content: [{type: nestedType}]}]);
        const start = across ? 2 : 1;
        doc.edit([{op: "insert", at: [start], content: [paragraph("ONE")]}, {op: "insert", at: [start + 1], content: [paragraph("TWO")]}]);
        const moved = doc.blocks()[start + 1].marker;
        const destination = across ? doc.blocks()[1] : null;
        if (destination && destination.kind !== "flow") throw new Error("nested flow expected");
        const parent = destination?.kind === "flow" ? doc.get(destination.body)! : doc.get(MAIN)!;
        const after = destination?.kind === "flow" ? doc.blocks(destination.body)[0].marker.id : null;
        const movement: Op = {t: "move", at: doc.clock.next(), target: moved.id, parent: parent.id, after};
        doc.emit([movement]);
        moveHistory.record([movement], doc, options);
        moveHistory.undo(doc);
        moveHistory.redo(doc);
        const originalPlacement = doc.placementOf(moved.id), before = doc.toJSON(), snapshot = doc.snapshot();
        const edits: EditOp[] = [{op: "insert", at: [before.children!.length], content: [{type: "paragraph", attrs: {style: {align: "center", spacing: 2, indent: 1}}, runs: [{text: "NEW😀", marks: {italic: true}}]}]}];
        const expected = applyEdits(schema, before, edits), result = doc.edit(edits);
        assert.deepEqual(result.normalize, []);
        assert.deepEqual(doc.toJSON(), expected);
        assert.deepEqual(doc.placementOf(moved.id), originalPlacement);
        const replica = Doc.fromSnapshot("R", snapshot, schema);
        assert.equal(replica.check(result.ops), null);
        result.ops.forEach(op => replica.apply(op));
        assert.deepEqual(replica.toJSON(), expected);
        const history = new History();
        history.record(result.ops, doc, options);
        const restored = Doc.fromSnapshot("A", doc.snapshot(), schema), restoredHistory = History.fromSnapshot(history.snapshot());
        for (const [copy, ownHistory] of [[doc, history], [restored, restoredHistory]] as const) {
            ownHistory.undo(copy);
            assert.deepEqual(copy.toJSON(), before);
            ownHistory.redo(copy);
            assert.deepEqual(copy.toJSON(), expected);
            assert.deepEqual(copy.placementOf(moved.id), originalPlacement);
        }
    });
}

test("concurrent appends after a moved-away birth coalesce in one new paragraph and retain the moved paragraph", () => {
    const seed = new Doc("seed", WORD_SCHEMA);
    seed.edit([{op: "insert", at: [0, 0], content: "ROOT"}, {op: "insert", at: [1], content: [paragraph("ONE")]}, {op: "insert", at: [2], content: [paragraph("TWO")]}]);
    const moved = seed.blocks()[2].marker;
    seed.emit([{t: "move", at: {lamport: seed.clock.next().lamport, actor: "foreign"}, target: moved.id, parent: seed.get(MAIN)!.id, after: null}]);
    const snapshot = seed.snapshot(), placement = seed.placementOf(moved.id);
    const a = Doc.fromSnapshot("A", snapshot, WORD_SCHEMA), b = Doc.fromSnapshot("B", snapshot, WORD_SCHEMA);
    const left = a.edit([{op: "insert", at: [3], content: [paragraph("L")]}]).ops;
    const right = b.edit([{op: "insert", at: [3], content: [paragraph("R")]}]).ops;
    const birth = (ops: Op[]) => ops.find((op): op is Extract<Op, {t: "node"}> => op.t === "node" && op.type === "paragraph")!;
    assert.equal(birth(left).boundary, birth(right).boundary, "same logical gap has one shared boundary");
    right.forEach(op => a.apply(op)); left.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    const after = a.toJSON(), text = (node: NodeJSON) => (node.runs ?? []).map(run => "text" in run ? run.text : "").join("");
    assert.deepEqual(after.children!.slice(0, 3).map(text), ["TWO", "ROOT", "ONE"]);
    assert.equal(after.children!.length, 4);
    assert.equal([...text(after.children![3])].sort().join(""), "LR");
    for (const reverse of [false, true]) {
        const replica = Doc.fromSnapshot("replica", snapshot, WORD_SCHEMA);
        for (const batch of reverse ? [right, left] : [left, right]) {
            assert.equal(replica.check(batch), null);
            batch.forEach(op => replica.apply(op));
        }
        assert.deepEqual(replica.toJSON(), after);
        assert.deepEqual(replica.placementOf(moved.id), placement);
    }
});

test("repeated move-away and recreate advances the observed physical fence without merging old text", () => {
    const doc = new Doc("A", WORD_SCHEMA);
    doc.edit([{op: "insert", at: [0, 0], content: "ROOT"}, {op: "insert", at: [1], content: [paragraph("ONE")]}, {op: "insert", at: [2], content: [paragraph("TWO")]}]);
    let previous = doc.blocks()[2].marker;
    doc.emit([{t: "move", at: {lamport: doc.clock.next().lamport, actor: "B"}, target: previous.id, parent: doc.get(MAIN)!.id, after: null}]);
    const boundaries = new Set<string>();
    const placements = new Map([[previous.key, doc.placementOf(previous.id)]]);
    for (const name of ["NEW1", "NEW2", "NEW3"]) {
        const before = doc.toJSON(), edits: EditOp[] = [{op: "insert", at: [before.children!.length], content: [paragraph(name)]}];
        const expected = applyEdits(WORD_SCHEMA, before, edits), result = doc.edit(edits);
        assert.deepEqual(doc.toJSON(), expected);
        const birth = result.ops.find((op): op is Extract<Op, {t: "node"}> => op.t === "node" && op.type === "paragraph")!;
        assert.equal(birth.boundary?.endsWith(`|${previous.key}`), true, "the next birth fences against the most recent physical class");
        assert.equal(boundaries.has(birth.boundary!), false);
        boundaries.add(birth.boundary!);
        const history = new History();
        history.record(result.ops, doc, options);
        history.undo(doc);
        assert.deepEqual(doc.toJSON(), before);
        history.redo(doc);
        assert.deepEqual(doc.toJSON(), expected);
        for (const [key, placement] of placements) assert.deepEqual(doc.placementOf(doc.get(key)!.id), placement);
        previous = doc.get(`${birth.id.lamport}@${birth.id.actor}`)!;
        doc.emit([{t: "move", at: {lamport: doc.clock.next().lamport, actor: "B"}, target: previous.id, parent: doc.get(MAIN)!.id, after: null}]);
        placements.set(previous.key, doc.placementOf(previous.id));
    }
    assert.equal(boundaries.size, 3);
});

for (const [schema, type] of [[WORD_SCHEMA, "section"], [PRESENTATION_SCHEMA, "slide"]] as const) test(`${type} append after an incoming moved predecessor keeps its stationary source successor separate`, () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "ROOT"}, {op: "insert", at: [1], content: [{type}]}, {op: "insert", at: [2], content: [paragraph("ONE")]}, {op: "insert", at: [3], content: [paragraph("TWO")]}]);
    const holder = doc.blocks()[1];
    if (holder.kind !== "flow") throw new Error("flow expected");
    const moved = doc.blocks()[2].marker, stationary = doc.blocks()[3].marker;
    doc.emit([{t: "move", at: {lamport: doc.clock.next().lamport, actor: "B"}, target: moved.id, parent: doc.get(holder.body)!.id, after: doc.blocks(holder.body).at(-1)!.marker.id}]);
    const placement = doc.placementOf(moved.id), stationaryPlacement = doc.placementOf(stationary.id);
    const before = doc.toJSON(), snapshot = doc.snapshot(), index = before.children![1].children!.length;
    const edits: EditOp[] = [{op: "insert", at: [1, index], content: [paragraph("NEW😀")]}];
    const expected = applyEdits(schema, before, edits), result = doc.edit(edits);
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(doc.placementOf(moved.id), placement);
    assert.deepEqual(doc.placementOf(stationary.id)?.at, stationaryPlacement?.at, "the stationary birth writer is unchanged");
    assert.equal(result.ops.some(op => op.t === "move" && op.target.lamport === stationary.id.lamport && op.target.actor === stationary.id.actor), false);
    const replica = Doc.fromSnapshot("R", snapshot, schema);
    assert.equal(replica.check(result.ops), null);
    result.ops.forEach(op => replica.apply(op));
    assert.deepEqual(replica.toJSON(), expected);
    const history = new History();
    history.record(result.ops, doc, options);
    history.undo(doc);
    assert.deepEqual(doc.toJSON(), before);
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), expected);
});
