import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, applyEdits} from "../src/index.ts";
import {modelEventWindow} from "../src/sync/model-events.ts";
import {SyncClient, DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "../src/sync/index.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {EditOp, NodeJSON, Op} from "../src/index.ts";
import type {ServerEvent} from "../src/sync/index.ts";

const p = (text: string, type = "paragraph"): NodeJSON => ({type, runs: text ? [{text, marks: {}}] : []});
const box = (...children: NodeJSON[]): NodeJSON => ({type: "callout", children});
const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [p(text)]}]});
const table = (): NodeJSON => ({type: "table", children: [0, 1].map(i => ({type: "table-row", children: [cell(`cell${i}a`), cell(`cell${i}b`)]}))});
const list = (): NodeJSON => ({type: "list", attrs: {listType: "bullet"}, children: [{type: "list-item", runs: [{text: "item", marks: {}}]}]});
const content = () => [...Array.from({length: 12}, (_, i) => p(`p${i}:abcdef😀`)), box(p("inside"), p("second")), table(), p("tail")];
function seed(children = content(), schema = DEMO_SCHEMA) {
    const doc = new Doc("seed", schema);
    doc.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: children}]);
    return doc;
}
function receiver(initial: Doc) {
    const schema = initial.schema!;
    let receive!: (event: ServerEvent) => void;
    const client = new SyncClient("receiver", {subscribe: (_since, listener) => {receive = listener; return () => undefined;}, send: async () => undefined, sendPresence: () => undefined}, {schema});
    client.connect();
    receive({type: "hello", epoch: "structural-window", protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, serverSeq: 1, snapshot: initial.snapshot(), delSeqs: [], presence: []});
    let seq = 1, mirror = client.doc.toJSON();
    const deliver = (ops: Op[], expected: NodeJSON, windowed?: boolean) => {
        const before = client.doc.toJSON(), reference = Doc.fromSnapshot("reference", client.doc.snapshot(), schema);
        assert.equal(reference.check(ops), null);
        ops.forEach(op => reference.apply(op));
        assert.deepEqual(reference.toJSON(), expected, "full CRDT interpretation matches expected model");
        if (windowed !== undefined) assert.equal(!!modelEventWindow(schema, before, expected), windowed);
        let events: EditOp[] = [], callbacks = 0;
        client.onModelEvents = (next, info) => {assert.deepEqual(info, {cause: "remote", fallback: false}); events = next; callbacks += 1; mirror = applyEdits(schema, mirror, next);};
        seq += 1;
        receive({type: "change", envelope: {serverSeq: seq, change: {actor: "remote", seq, ops}}});
        assert.equal(callbacks, Number(JSON.stringify(before) !== JSON.stringify(expected)));
        assert.deepEqual(mirror, expected, "full-document event application");
        assert.deepEqual(client.doc.toJSON(), expected);
        assert.deepEqual(Doc.fromSnapshot("restored", client.doc.snapshot(), schema).toJSON(), expected);
        assert.equal(client.eventStats.fallbacks, 0);
        return events;
    };
    return {client, deliver};
}

const cases: Array<{name: string; edits: EditOp[]; windowed: boolean}> = [
    {name: "root split", edits: [{op: "split", at: [6, 5]}], windowed: true},
    {name: "root join", edits: [{op: "merge", at: [6]}], windowed: true},
    {name: "first paragraph split", edits: [{op: "split", at: [0, 0]}], windowed: true},
    {name: "last paragraph split", edits: [{op: "split", at: [14, 4]}], windowed: true},
    {name: "block type", edits: [{op: "update", at: [6], attrs: {type: "quote"}}], windowed: true},
    {name: "nested split", edits: [{op: "split", at: [12, 0, 3]}], windowed: true},
    {name: "cell split", edits: [{op: "split", at: [13, 0, 0, 0, 0, 3]}], windowed: true},
    {name: "table row", edits: [{op: "insert", at: [13, 1], content: [{type: "table-row", children: [cell("new-a"), cell("new-b")]}]}], windowed: true},
    {name: "table span", edits: [{op: "update", at: [13, 0, 0], attrs: {rowspan: 1, colspan: 2}}], windowed: true},
    {name: "node insertion", edits: [{op: "insert", at: [6], content: [p("new")]}], windowed: true},
    {name: "node deletion", edits: [{op: "delete", at: [6], count: 1}], windowed: true},
    {name: "adjacent movement", edits: [{op: "move", from: [6], at: [5]}], windowed: true},
    {name: "wide movement", edits: [{op: "move", from: [10], at: [2]}], windowed: false},
    {name: "distant batch", edits: [{op: "split", at: [1, 3]}, {op: "split", at: [11, 3]}], windowed: false},
    {name: "root group insertion", edits: [{op: "insert", at: [6], content: [list()]}], windowed: false},
];
for (const scene of cases) test(`structural window: ${scene.name} retains complete model events`, () => {
    const initial = seed(), before = initial.toJSON(), {client, deliver} = receiver(initial);
    try {deliver(initial.edit(scene.edits).ops, applyEdits(DEMO_SCHEMA, before, scene.edits), scene.windowed);}
    finally {client.disconnect();}
});

test("structural window: root child-count rules retain whole comparison", () => {
    const schema = structuredClone(DEMO_SCHEMA);
    if (schema.nodes.content.shape === "flow") schema.nodes.content.childRules = {paragraph: {min: 2}};
    const doc = seed(content(), schema), before = doc.toJSON(), {client, deliver} = receiver(doc);
    const edits: EditOp[] = [{op: "split", at: [6, 5]}];
    try {deliver(doc.edit(edits).ops, applyEdits(schema, before, edits), false);}
    finally {client.disconnect();}
});

test("structural window: nested required-child projection remains inside the compared subtree", () => {
    const schema = structuredClone(DEMO_SCHEMA);
    if (schema.nodes.callout.shape === "flow") schema.nodes.callout.childRules = {paragraph: {min: 2, max: 2}};
    const doc = seed(content(), schema), before = doc.toJSON(), {client, deliver} = receiver(doc);
    const edits: EditOp[] = [{op: "split", at: [12, 0, 3]}];
    try {deliver(doc.edit(edits).ops, applyEdits(schema, before, edits), true);}
    finally {client.disconnect();}
});

test("structural window: nested groups keep their complete parent normalization", () => {
    const children = content(); children[12] = box(list());
    const doc = seed(children), before = doc.toJSON(), {client, deliver} = receiver(doc);
    const edits: EditOp[] = [{op: "split", at: [12, 0, 0, 2]}];
    try {deliver(doc.edit(edits).ops, applyEdits(DEMO_SCHEMA, before, edits), true);}
    finally {client.disconnect();}
});

for (const duplicate of [false, true]) test(`structural window: sparse root groups and repeated paragraphs preserve paths (${duplicate})`, () => {
    const children = Array.from({length: 20}, (_, i) => p(duplicate ? "same" : `text${i}`));
    children[2] = list(); children[17] = list();
    const doc = seed(children), before = doc.toJSON(), {client, deliver} = receiver(doc);
    const edits: EditOp[] = [{op: "split", at: [10, 2]}, {op: "update", at: [11], attrs: {type: "quote"}}];
    try {deliver(doc.edit(edits).ops, applyEdits(DEMO_SCHEMA, before, edits), true);}
    finally {client.disconnect();}
});

test("structural window: small trees and changes at group boundaries retain the full path", () => {
    const small = seed([p("abc"), p("def")]);
    assert.equal(modelEventWindow(DEMO_SCHEMA, small.toJSON(), applyEdits(DEMO_SCHEMA, small.toJSON(), [{op: "split", at: [0, 1]}])), null);
    const children = content(); children[5] = list();
    const doc = seed(children), before = doc.toJSON();
    const after = applyEdits(DEMO_SCHEMA, before, [{op: "split", at: [6, 2]}]);
    assert.equal(modelEventWindow(DEMO_SCHEMA, before, after), null);
});

for (const reverse of [false, true]) test(`structural window: concurrent Enter/delete/format and split undo preserve remote intent (${reverse})`, () => {
    const initial = seed(Array.from({length: 16}, () => p("abcdef"))), {client, deliver} = receiver(initial);
    const a = Doc.fromSnapshot("A", initial.snapshot(), DEMO_SCHEMA), b = Doc.fromSnapshot("B", initial.snapshot(), DEMO_SCHEMA), history = new History();
    const split = a.edit([{op: "split", at: [6, 3]}]).ops; history.record(split, a, {caretBefore: "", caretAfter: ""});
    const other = b.edit([{op: "delete", at: [6, 2], count: 1}, {op: "update", at: [6, 2], length: 1, attrs: {bold: true}}]).ops;
    const merged: NodeJSON = {type: "paragraph", runs: [{text: "ab", marks: {}}, {text: "d", marks: {bold: true}}, {text: "ef", marks: {}}]};
    const tail: NodeJSON = {type: "paragraph", runs: [{text: "d", marks: {bold: true}}, {text: "ef", marks: {}}]};
    const expected = {type: "content", children: [...Array.from({length: 6}, () => p("abcdef")), p("ab"), tail, ...Array.from({length: 9}, () => p("abcdef"))]};
    try {
        if (reverse) {deliver(other, {type: "content", children: initial.toJSON().children!.map((n, i) => i === 6 ? merged : n)}, true); deliver(split, expected, true);}
        else {deliver(split, applyEdits(DEMO_SCHEMA, initial.toJSON(), [{op: "split", at: [6, 3]}]), true); deliver(other, expected, true);}
        other.forEach(op => a.apply(op)); split.forEach(op => b.apply(op));
        const undo = history.undo(a).ops;
        deliver(undo, {type: "content", children: initial.toJSON().children!.map((n, i) => i === 6 ? merged : n)}, true);
        deliver(history.redo(a).ops, expected, true);
    } finally {client.disconnect();}
});

for (const reverse of [false, true]) test(`structural window: concurrent same-boundary splits still make one break (${reverse})`, () => {
    const initial = seed(), {client, deliver} = receiver(initial);
    const a = Doc.fromSnapshot("A", initial.snapshot(), DEMO_SCHEMA), b = Doc.fromSnapshot("B", initial.snapshot(), DEMO_SCHEMA);
    const x = a.edit([{op: "split", at: [6, 4]}]).ops, y = b.edit([{op: "split", at: [6, 4]}]).ops;
    const expected = applyEdits(DEMO_SCHEMA, initial.toJSON(), [{op: "split", at: [6, 4]}]);
    try {for (const ops of reverse ? [y, x] : [x, y]) deliver(ops, expected);}
    finally {client.disconnect();}
});

test("structural window: callback payload mutation cannot alter retained document models", () => {
    const initial = seed(), {client, deliver} = receiver(initial), before = initial.toJSON();
    const edits: EditOp[] = [{op: "insert", at: [6], content: [p("new")]}], expected = applyEdits(DEMO_SCHEMA, before, edits);
    try {
        const events = deliver(initial.edit(edits).ops, expected, true);
        for (const event of events) if (event.op === "insert" && Array.isArray(event.content)) event.content.splice(0, event.content.length);
        assert.deepEqual(client.doc.toJSON(), expected);
        deliver(initial.edit([{op: "split", at: [7, 4]}]).ops, applyEdits(DEMO_SCHEMA, expected, [{op: "split", at: [7, 4]}]), true);
    } finally {client.disconnect();}
});

for (const span of [6, 7]) test(`structural window: ${span + 2} nodes including guards respect the size limit`, () => {
    const doc = seed(Array.from({length: 20}, (_, i) => p(`text${i}`))), before = doc.toJSON(), {client, deliver} = receiver(doc);
    const edits: EditOp[] = [{op: "update", at: [5], attrs: {type: "quote"}}, {op: "update", at: [5 + span - 1], attrs: {type: "quote"}}];
    try {deliver(doc.edit(edits).ops, applyEdits(DEMO_SCHEMA, before, edits), span === 6);}
    finally {client.disconnect();}
});

for (const duplicate of [false, true]) test(`structural window: 100 deterministic mixed structural rounds preserve the full mirror (${duplicate})`, () => {
    const doc = seed(Array.from({length: 18}, (_, i) => p(duplicate ? "abcdef" : `p${i}:abcdef`))), {client, deliver} = receiver(doc);
    try {
        for (let round = 0; round < 100; round += 1) {
            const before = doc.toJSON(), children = before.children!, index = 3 + round % (children.length - 5);
            const text = children[index].runs!.map(run => "text" in run ? run.text : "").join("");
            let edit: EditOp;
            switch (round % 6) {
                case 0: edit = {op: "split", at: [index, Math.min(2, text.length)]}; break;
                case 1: edit = {op: "merge", at: [index]}; break;
                case 2: edit = {op: "update", at: [index], attrs: {type: children[index].type === "quote" ? "paragraph" : "quote"}}; break;
                case 3: edit = {op: "insert", at: [index], content: [p(duplicate ? "abcdef" : `new${round}`)]}; break;
                case 4: edit = {op: "delete", at: [index], count: 1}; break;
                default: edit = {op: "move", from: [index], at: [index + 1]}; break;
            }
            deliver(doc.edit([edit]).ops, applyEdits(DEMO_SCHEMA, before, [edit]));
        }
    } finally {client.disconnect();}
});

test("structural window: automatic leading replacements keep later text paths after repeated movement", () => {
    const doc = seed(), {client, deliver} = receiver(doc);
    try {
        for (const edit of [
            {op: "move", from: [12], at: [0]},
            {op: "insert", at: [0, 0], content: "a"},
            {op: "move", from: [1], at: [0]},
            {op: "insert", at: [2, 1], content: "b"},
            {op: "delete", at: [2, 0], count: 1},
            {op: "split", at: [2, 1]},
        ] satisfies EditOp[]) {
            const before = doc.toJSON();
            deliver(doc.edit([edit]).ops, applyEdits(DEMO_SCHEMA, before, [edit]));
        }
        const children = client.doc.toJSON().children!;
        assert.deepEqual(children.slice(2, 4), [p("b"), p("")]);
        assert.deepEqual(children[4], p("p0:abcdef😀"));
    } finally {client.disconnect();}
});
