import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, slotTicket} from "../src/crdt/doc.ts";
import {ROOT, keyOf} from "../src/crdt/ticket.ts";
import {createAnnotation, updateAnnotation, deleteAnnotation, getAnnotations, annotationEndpointKeys, validateAnnotationEndpoint, validateAnnotationAttribute, validateAnnotationAttributes, ANNOTATION_HEAD, ANNOTATION_HEAD_KEY, ANNOTATION_SLOT, ANNOTATION_TYPE} from "../src/crdt/annotations.ts";
import {MemoryNet} from "./harness.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {AnnotationExpansion} from "../src/crdt/annotations.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {Op} from "../src/crdt/doc.ts";

const range = (anchor: number[], focus: number[]) => ({anchor, focus});
const make = (text = "abcdef") => {
    const doc = new Doc("annotations", DEMO_SCHEMA);
    if (text) doc.edit([{op: "insert", at: [0, 0], content: text}]);
    return doc;
};
const only = (doc: Doc) => { const records = getAnnotations(doc); assert.equal(records.length, 1); return records[0]; };
const text = (doc: Doc) => doc.toJSON().children![0].runs!.map(run => "text" in run ? run.text : "").join("");
const selected = (doc: Doc) => {
    const record = only(doc); assert.equal(record.status, "resolved");
    return text(doc).slice(record.range!.anchor.at(-1), record.range!.focus.at(-1));
};

test("annotation pure validation requires exact endpoints, safe JSON, and encoded field keys", () => {
    assert.deepEqual(ANNOTATION_HEAD, slotTicket(ROOT, ANNOTATION_SLOT));
    const endpoint = {left: "1@a", right: "2@a", affinity: "right"};
    assert.equal(validateAnnotationEndpoint(endpoint, () => true), null);
    assert.match(validateAnnotationEndpoint(endpoint, () => false)!, /reference/);
    for (const value of [{...endpoint, extra: true}, {...endpoint, left: "missing"}, {...endpoint, affinity: "auto"}, {...endpoint, right: undefined}, null, []]) assert.ok(validateAnnotationEndpoint(value));
    assert.equal(validateAnnotationAttributes({anchor: endpoint, focus: endpoint, "data:body": {value: {nested: [null, true, 3, "text"]}}}), null);
    assert.ok(validateAnnotationAttributes({anchor: endpoint}));
    for (const key of ["$type", "body", "data:constructor", "data:%63onstructor", "data:%ZZ", "data:"]) assert.ok(validateAnnotationAttribute(key, {value: "bad"}));
    for (const value of [{value: undefined}, {value: NaN}, {value: Infinity}, {value: 1n}, {value: new Date()}, {value: JSON.parse('{"__proto__":{"polluted":true}}')}]) assert.ok(validateAnnotationAttribute("data:body", value));
    const cycle: Record<string, unknown> = {}; cycle.loop = cycle;
    const getter = Object.defineProperty({}, "value", {enumerable: true, get() {throw new Error("Must not evaluate getters");}});
    for (const value of [{value: new Array(2)}, {value: {[Symbol("hidden")]: 1}}, getter]) assert.ok(validateAnnotationAttribute("data:body", value));
    assert.ok(validateAnnotationAttribute("data:body", {value: cycle}));
    assert.equal(validateAnnotationAttribute("data:body", {value: null}), null);
    assert.equal(validateAnnotationAttribute("data:body", null), null);
});

test("annotation create/update/delete use existing operations without changing content", () => {
    const doc = make();
    const before = doc.toJSON();
    const {id, ops} = createAnnotation(doc, range([0, 1], [0, 4]), {body: "Comment", nullable: null});
    assert.deepEqual(ops.map(op => op.t), ["node"]);
    assert.deepEqual(doc.toJSON(), before);
    assert.equal(only(doc).id, id);
    assert.deepEqual(only(doc).range, range([0, 1], [0, 4]));
    assert.deepEqual(only(doc).data, {body: "Comment", nullable: null});
    assert.ok(updateAnnotation(doc, id, {data: {body: "Updated", resolved: true}, removeData: ["nullable"]}).every(op => op.t === "set"));
    assert.deepEqual(only(doc).data, {body: "Updated", resolved: true});
    assert.equal(updateAnnotation(doc, id, {data: {body: "Updated"}}).length, 1);
    assert.deepEqual(updateAnnotation(doc, id, {}), []);
    assert.ok(deleteAnnotation(doc, id).every(op => op.t === "del"));
    assert.deepEqual(getAnnotations(doc), []);
    assert.deepEqual(deleteAnnotation(doc, id), []);
    assert.deepEqual(doc.toJSON(), before);
});

for (const expand of ["none", "start", "end", "both"] as AnnotationExpansion[]) {
    test(`annotation ${expand} boundary affinity has fixed insertion results`, () => {
        const doc = make("abcd");
        createAnnotation(doc, range([0, 1], [0, 3]), {}, {expand});
        doc.edit([{op: "insert", at: [0, 1], content: "L"}]);
        doc.edit([{op: "insert", at: [0, 4], content: "R"}]);
        const start = expand === "start" || expand === "both" ? 1 : 2;
        const end = expand === "end" || expand === "both" ? 5 : 4;
        assert.equal(text(doc), "aLbcRd");
        assert.deepEqual(only(doc).range, range([0, start], [0, end]));
        assert.equal(selected(doc), ({none: "bc", start: "Lbc", end: "bcR", both: "LbcR"})[expand]);
    });
}

test("annotation interior insertions, backward selections, and collapsed points retain explicit affinity", () => {
    const doc = make("abcd");
    createAnnotation(doc, range([0, 3], [0, 1]));
    doc.edit([{op: "insert", at: [0, 2], content: "X"}]);
    assert.deepEqual(only(doc).range, range([0, 4], [0, 1]));
    assert.equal(only(doc).backward, true);
    const point = make("abcd");
    createAnnotation(point, range([0, 2], [0, 2]));
    point.edit([{op: "insert", at: [0, 2], content: "X"}]);
    assert.deepEqual(only(point).range, range([0, 3], [0, 3]));
    const expanding = make("abcd");
    createAnnotation(expanding, range([0, 2], [0, 2]), {}, {expand: "both"});
    expanding.edit([{op: "insert", at: [0, 2], content: "X"}]);
    assert.deepEqual(only(expanding).range, range([0, 2], [0, 3]));
});

test("annotation endpoint deletion collapses safely; split and join follow retained token IDs", () => {
    const doc = make();
    createAnnotation(doc, range([0, 1], [0, 5]));
    doc.edit([{op: "split", at: [0, 3]}]);
    assert.deepEqual(only(doc).range, range([0, 1], [1, 2]));
    doc.edit([{op: "merge", at: [1]}]);
    assert.deepEqual(only(doc).range, range([0, 1], [0, 5]));
    doc.edit([{op: "delete", at: [0, 0], count: 6}]);
    assert.equal(only(doc).status, "resolved");
    assert.deepEqual(only(doc).range, range([0, 0], [0, 0]));
});

test("annotation table endpoints are explicitly hidden and recover after span restoration", () => {
    const doc = make("Top");
    const p = (value: string): NodeJSON => ({type: "paragraph", runs: [{text: value, marks: {}}]});
    const cell = (value: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [p(value)]}]});
    doc.edit([{op: "insert", at: [1], content: [{type: "table", children: [{type: "table-row", children: [cell("AA"), cell("BB")]}]}]}]);
    const original = range([1, 0, 1, 0, 0, 0], [1, 0, 1, 0, 0, 2]);
    createAnnotation(doc, original);
    doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 2, rowspan: 1}}]);
    assert.equal(only(doc).status, "hidden");
    assert.equal(only(doc).range, null);
    doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 1, rowspan: 1}}]);
    assert.equal(only(doc).status, "resolved");
    assert.deepEqual(only(doc).range, original);
});

test("annotation overlaps remain independent and snapshots preserve all metadata", () => {
    const doc = make();
    const a = createAnnotation(doc, range([0, 1], [0, 4]), {body: "First"});
    const b = createAnnotation(doc, range([0, 2], [0, 5]), {body: "Second"});
    assert.notEqual(a.id, b.id);
    const restored = Doc.fromSnapshot("restored", JSON.parse(JSON.stringify(doc.snapshot())), DEMO_SCHEMA);
    assert.deepEqual(getAnnotations(restored), getAnnotations(doc));
    assert.deepEqual(restored.toJSON(), doc.toJSON());
    updateAnnotation(restored, a.id, {range: range([0, 0], [0, 2]), expand: "both"});
    assert.deepEqual(getAnnotations(restored).find(record => record.id === b.id)!.data, {body: "Second"});
});

const connected = async () => {
    const net = new MemoryNet();
    const a = net.add("A"), b = net.add("B");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "abcdef"}]).ops); await net.settle();
    const created = createAnnotation(a.doc, range([0, 1], [0, 4]), {body: "Original"});
    a.commit(created.ops); await net.settle();
    a.clearHistory(); b.clearHistory();
    return {net, a, b, id: created.id};
};

test("annotation two-peer independent fields and same-field LWW converge without content events", async () => {
    const {net, a, b, id} = await connected();
    let modelEvents = 0;
    a.onModelEvents = () => modelEvents++;
    b.onModelEvents = () => modelEvents++;
    a.commit(updateAnnotation(a.doc, id, {data: {status: "open", body: "from A"}}));
    b.commit(updateAnnotation(b.doc, id, {data: {color: "blue", body: "from B"}}));
    await net.settle();
    assert.deepEqual(only(a.doc).data, {body: "from B", status: "open", color: "blue"});
    assert.deepEqual(getAnnotations(a.doc), getAnnotations(b.doc));
    assert.deepEqual(getAnnotations(a.doc), getAnnotations(net.hub.doc));
    assert.equal(modelEvents, 0);
    assert.equal(text(a.doc), "abcdef");
    assert.equal(a.pending.length, 0); assert.equal(b.pending.length, 0);
});

test("annotation delete undo restores another actor's concurrent metadata write", async () => {
    const {net, a, b, id} = await connected();
    a.commit(deleteAnnotation(a.doc, id));
    b.commit(updateAnnotation(b.doc, id, {data: {body: "Remote survives"}}));
    await net.settle();
    assert.deepEqual(getAnnotations(a.doc), []);
    a.undo(); await net.settle();
    assert.equal(only(a.doc).data.body, "Remote survives");
    assert.deepEqual(getAnnotations(a.doc), getAnnotations(b.doc));
    a.redo(); await net.settle();
    assert.deepEqual(getAnnotations(a.doc), []);
    a.undo(); await net.settle();
    assert.equal(only(a.doc).data.body, "Remote survives");
});

test("annotation data undo preserves a later remote write to the same field", async () => {
    const {net, a, b, id} = await connected();
    a.commit(updateAnnotation(a.doc, id, {data: {body: "Local"}})); await net.settle();
    b.commit(updateAnnotation(b.doc, id, {data: {body: "Later remote"}})); await net.settle();
    a.undo(); await net.settle();
    assert.equal(only(a.doc).data.body, "Later remote");
    a.redo(); await net.settle();
    assert.equal(only(a.doc).data.body, "Later remote");
});

test("annotation live endpoints pin deleted tokens against GC and deletion releases pins", () => {
    const doc = make();
    const {id} = createAnnotation(doc, range([0, 1], [0, 4]));
    const pinned = annotationEndpointKeys(doc);
    assert.equal(pinned.size, 4);
    doc.edit([{op: "delete", at: [0, 0], count: 6}]);
    doc.compact(1000, () => 1);
    for (const key of pinned) assert.equal(doc.get(key)!.compact, false);
    assert.equal(only(doc).status, "resolved");
    deleteAnnotation(doc, id);
    assert.equal(annotationEndpointKeys(doc).size, 0);
    doc.compact(1000, () => 1);
    for (const key of pinned) assert.equal(doc.get(key)!.compact, true);
});

test("annotation invalid reserved operations are rejected atomically", () => {
    const doc = make();
    const {id} = createAnnotation(doc, range([0, 1], [0, 3]));
    const item = doc.get(id)!;
    const endpoint = only(doc).anchor;
    const invalid: Op[][] = [
        [{t: "node", id: doc.clock.next(), origin: ROOT, type: ANNOTATION_TYPE, attrs: {anchor: endpoint, focus: endpoint}}],
        [{t: "text", id: doc.clock.next(), origin: ANNOTATION_HEAD, text: "not content"}],
        [{t: "del", at: doc.clock.next(), ids: [ANNOTATION_HEAD]}],
        [{t: "set", at: doc.clock.next(), ids: [item.id], key: "$type", value: "paragraph"}],
        [{t: "set", at: doc.clock.next(), ids: [item.id], key: "anchor", value: {...endpoint, left: "999999@missing"}}],
        [{t: "set", at: doc.clock.next(), ids: [item.id], key: "data:constructor", value: {value: "poison"}}],
        [{t: "node", id: doc.clock.next(), origin: ANNOTATION_HEAD, type: "paragraph"}],
    ];
    const before = doc.snapshot();
    for (const ops of invalid) { assert.ok(doc.check(ops)); assert.deepEqual(doc.snapshot(), before); }
    assert.throws(() => createAnnotation(doc, range([0, 99], [0, 100])), /exact text position/);
    assert.throws(() => updateAnnotation(doc, id, {data: JSON.parse('{"__proto__":"bad"}')}), /data key/);
    assert.equal(ANNOTATION_HEAD_KEY, keyOf(ANNOTATION_HEAD));
});


test("annotation content-owner moves retain endpoint IDs and follow the new model paths", () => {
    const schema: Schema = {root: "content", marks: [], nodes: {
        content: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
        paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
    }};
    const doc = new Doc("moves", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "Top"}]);
    const p = (value: string): NodeJSON => ({type: "paragraph", runs: [{text: value, marks: {}}]});
    doc.edit([{op: "insert", at: [1], content: [{type: "box", children: [p("Inside")]}, {type: "box", children: [p("Other")]}]}]);
    createAnnotation(doc, range([1, 0, 1], [1, 0, 5]), {body: "Moves with text"});
    const original = only(doc);
    const boxes = doc.blocks().filter(block => block.kind === "flow");
    const target = boxes[0].marker.id, parent = slotTicket(boxes[1].marker.id, "body");
    const op: Op = {t: "move", at: doc.clock.next(), target, parent, after: parent};
    assert.equal(doc.check([op]), null); doc.emit([op]);
    assert.deepEqual(only(doc).range, range([1, 1, 0, 1], [1, 1, 0, 5]));
    assert.deepEqual(only(doc).anchor, original.anchor);
    assert.deepEqual(only(doc).focus, original.focus);
    const restored = Doc.fromSnapshot("restored", JSON.parse(JSON.stringify(doc.snapshot())), schema);
    assert.deepEqual(getAnnotations(restored), getAnnotations(doc));
});

test("annotation cross-slot endpoints return metadata without a guessed range", () => {
    const doc = make("Top");
    doc.edit([{op: "insert", at: [1], content: [{type: "callout", children: [{type: "paragraph", runs: [{text: "Inside", marks: {}}]}]}]}]);
    createAnnotation(doc, range([0, 1], [1, 0, 3]), {body: "Different flows"});
    assert.equal(only(doc).status, "cross-slot");
    assert.equal(only(doc).range, null);
    assert.deepEqual(only(doc).data, {body: "Different flows"});
});

test("annotation reader reports missing and compacted tokens without position fallback", () => {
    for (const status of ["missing", "compacted"] as const) {
        const doc = make();
        createAnnotation(doc, range([0, 1], [0, 3]), {body: "Retained metadata"});
        const key = only(doc).anchor.right!;
        const get = doc.get.bind(doc), posAfter = doc.posAfter.bind(doc);
        // Inject a storage failure at the read boundary. Normal live annotations pin these tokens.
        doc.get = request => {
            const item = get(request);
            return request === key ? status === "missing" ? undefined : item && {...item, compact: true} : item;
        };
        doc.posAfter = request => {assert.notEqual(request, key); return posAfter(request);};
        assert.equal(only(doc).status, status);
        assert.equal(only(doc).range, null);
        assert.deepEqual(only(doc).data, {body: "Retained metadata"});
    }
});

test("annotation birth can reference earlier content tokens in the same synced Change", async () => {
    const net = new MemoryNet();
    const a = net.add("A"), b = net.add("B");
    a.connect(); b.connect(); await net.settle();
    const content = a.doc.edit([{op: "insert", at: [0, 0], content: "Fresh text"}]).ops;
    const annotation = createAnnotation(a.doc, range([0, 0], [0, 5]), {body: "Same Change"});
    a.commit([...content, ...annotation.ops]); await net.settle();
    assert.equal(a.pending.length, 0);
    assert.equal(text(b.doc), "Fresh text");
    assert.deepEqual(only(b.doc).range, range([0, 0], [0, 5]));
    assert.deepEqual(getAnnotations(a.doc), getAnnotations(net.hub.doc));
});

test("annotation concurrent updates converge in either receipt order and duplicate delivery", () => {
    const seed = make();
    const {id} = createAnnotation(seed, range([0, 1], [0, 4]), {body: "Original"});
    const snapshot = seed.snapshot();
    const a = Doc.fromSnapshot("A", snapshot, DEMO_SCHEMA), b = Doc.fromSnapshot("B", snapshot, DEMO_SCHEMA);
    const left = updateAnnotation(a, id, {range: range([0, 2], [0, 5]), data: {body: "A", status: "open"}});
    const right = updateAnnotation(b, id, {data: {body: "B", color: "blue"}});
    const results = [];
    for (const operations of [[...left, ...right], [...right, ...left]]) {
        const replica = Doc.fromSnapshot("R", snapshot, DEMO_SCHEMA);
        assert.equal(replica.check(operations), null);
        for (const op of operations) {replica.apply(op); replica.apply(op);}
        assert.deepEqual(only(replica).range, range([0, 2], [0, 5]));
        // Equal Lamport values use actor B as the deterministic winner.
        assert.deepEqual(only(replica).data, {body: "B", status: "open", color: "blue"});
        results.push(getAnnotations(replica));
    }
    assert.deepEqual(results[0], results[1]);
});


test("annotation offsets count UTF-16 tokens, flattened spans, and one inline token", () => {
    const doc = make("A😀BC");
    doc.edit([{op: "insert", at: [0, 3], content: [{type: "inline-image", attrs: {src: "", width: 16, height: 16}}]}]);
    doc.edit([{op: "update", at: [0, 0], length: 1, attrs: {link: "https://example.com"}}]);
    createAnnotation(doc, range([0, 1], [0, 4]));
    assert.deepEqual(only(doc).range, range([0, 1], [0, 4]));
    doc.edit([{op: "insert", at: [0, 3], content: "X"}]);
    assert.deepEqual(only(doc).range, range([0, 1], [0, 5]));
});

test("annotation end affinity resolves before a structured block without a virtual-path fallback", () => {
    const doc = make("Top");
    doc.edit([{op: "insert", at: [1], content: [{type: "divider"}]}]);
    createAnnotation(doc, range([0, 1], [0, 3]), {}, {expand: "end"});
    assert.deepEqual(only(doc).range, range([0, 1], [0, 3]));
    doc.edit([{op: "insert", at: [0, 3], content: "!"}]);
    assert.deepEqual(only(doc).range, range([0, 1], [0, 4]));
});

const paragraphMoveDoc = () => {
    const doc = make("Top");
    const paragraph = (value: string): NodeJSON => ({type: "paragraph", runs: [{text: value, marks: {}}]});
    doc.edit([{op: "insert", at: [1], content: [paragraph("abcdef"), {type: "callout", children: [paragraph("Inside")]}]}]);
    return doc;
};

test("annotation paragraph movement follows exact paths through split, merge, and resplit", () => {
    const doc = paragraphMoveDoc();
    createAnnotation(doc, range([1, 1], [1, 5]));
    const original = only(doc);
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 1, 5]));
    doc.edit([{op: "split", at: [1, 1, 3]}]);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 2, 2]));
    doc.edit([{op: "merge", at: [1, 2]}]);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 1, 5]));
    doc.edit([{op: "split", at: [1, 1, 2]}]);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 2, 3]));
    assert.deepEqual(only(doc).anchor, original.anchor); assert.deepEqual(only(doc).focus, original.focus);
    assert.deepEqual(getAnnotations(Doc.fromSnapshot("R", doc.snapshot(), DEMO_SCHEMA)), getAnnotations(doc));
});

test("annotation deleted paragraph endpoints retain their logical location after a move", () => {
    const doc = paragraphMoveDoc();
    createAnnotation(doc, range([1, 1], [1, 5]));
    const original = only(doc), deletedKey = original.anchor.right!;
    doc.edit([{op: "delete", at: [1, 1], count: 1}]);
    assert.deepEqual(only(doc).range, range([1, 1], [1, 4]));
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    assert.equal(only(doc).status, "resolved");
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 1, 4]));
    assert.equal(doc.tokenLocation(deletedKey)!.visible, true);
    assert.deepEqual(only(doc).anchor, original.anchor); assert.deepEqual(only(doc).focus, original.focus);
    doc.compact(1000, () => 1);
    assert.equal(doc.get(deletedKey)!.compact, false);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 1, 4]));
});

test("annotation root paragraph endpoints move independently from replacement root text", () => {
    const doc = make("Top");
    doc.edit([{op: "insert", at: [1], content: [{type: "callout", children: [{type: "paragraph", runs: [{text: "Inside", marks: {}}]}]}]}]);
    createAnnotation(doc, range([0, 1], [0, 2]));
    const original = only(doc);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 1, 2]));
    doc.edit([{op: "insert", at: [0, 0], content: "New root"}]);
    assert.deepEqual(only(doc).range, range([1, 1, 1], [1, 1, 2]));
    assert.deepEqual(only(doc).anchor, original.anchor); assert.deepEqual(only(doc).focus, original.focus);
});

test("whole-paragraph annotations use affinity when adjacent boundary tokens move to different flows", () => {
    const doc = paragraphMoveDoc();
    createAnnotation(doc, range([1, 0], [1, 6]), {body: "Whole paragraph"});
    const original = only(doc);
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    assert.equal(only(doc).status, "resolved");
    assert.deepEqual(only(doc).range, range([1, 1, 0], [1, 1, 6]));
    assert.notEqual(doc.tokenLocation(original.focus.left)!.line, doc.tokenLocation(original.focus.right!)!.line);
    assert.deepEqual(only(doc).anchor, original.anchor); assert.deepEqual(only(doc).focus, original.focus);
});

test("a null right boundary follows its owning paragraph end after movement and later sibling insertion", () => {
    const doc = make("Top");
    doc.edit([{op: "insert", at: [1], content: [{type: "callout", children: [{type: "paragraph", runs: [{text: "Inside", marks: {}}]}]}, {type: "paragraph", runs: [{text: "Last", marks: {}}]}]}]);
    createAnnotation(doc, range([2, 0], [2, 4]), {}, {expand: "end"});
    assert.equal(only(doc).focus.right, null);
    doc.edit([{op: "move", from: [2], at: [1, 0]}]);
    assert.deepEqual(only(doc).range, range([1, 0, 0], [1, 0, 4]));
    doc.edit([{op: "insert", at: [1, 0, 4], content: "!"}]);
    assert.deepEqual(only(doc).range, range([1, 0, 0], [1, 0, 5]));
    doc.edit([{op: "insert", at: [1, 1], content: [{type: "paragraph", runs: [{text: "Later sibling", marks: {}}]}]}]);
    assert.deepEqual(only(doc).range, range([1, 0, 0], [1, 0, 5]));
    const sibling = doc.toJSON().children![1].children![2];
    assert.equal(sibling.runs![0] && "text" in sibling.runs![0] ? sibling.runs![0].text : "", "Inside");
});
