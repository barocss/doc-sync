import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, MAIN, slotKey, ticketOf, type Schema, type Op, type Ticket, commands} from "../src/index.ts";

const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "box", "rule"], default: "paragraph"},
    paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph", "box", "rule"], default: "paragraph", attrs: {name: {default: ""}}}, rule: {shape: "atom"},
}};
const paragraph = (text: string) => ({type: "paragraph", runs: [{text, marks: {}}]});
const box = (name: string) => ({type: "box", attrs: {name}, children: [paragraph(name)]});
function setup() {
    const doc = new Doc("seed", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("root"), box("a"), box("b")]}]);
    const [a, b] = doc.blocks().filter(block => block.kind === "flow").map(block => block.marker.id);
    return {doc, a, b};
}
function move(doc: Doc, target: Ticket, parent = MAIN, after: Ticket | null = null): Op[] {
    const op: Op = {t: "move", at: doc.clock.next(), target, parent: ticketOf(parent), after};
    assert.equal(doc.check([op]), null);
    return doc.emit([op]);
}
const rootNames = (doc: Doc) => doc.toJSON().children!.filter(node => node.type === "box").map(node => node.attrs!.name);

test("move reorders a structured object without copying its identity or contents", () => {
    const {doc, a, b} = setup();
    const tokens = doc.items.map(item => item.key);
    const sourceLine = doc.get(`${a.lamport}@${a.actor}`)!.line;
    move(doc, b, MAIN, doc.get(MAIN)!.id);
    assert.deepEqual(rootNames(doc), ["b", "a"]);
    assert.deepEqual(doc.items.map(item => item.key), tokens);
    assert.equal(doc.get(`${a.lamport}@${a.actor}`)!.line, sourceLine);
    assert.equal(doc.snapshot().moves!.length, 1);
});

test("cross-parent move keeps the body editable through old token origins", () => {
    const {doc, a, b} = setup();
    const body = slotKey(b, "body"); doc.get(body);
    const childKey = slotKey(a, "body");
    const endpoint = doc.get(childKey)!.key;
    move(doc, a, body, doc.get(body)!.id);
    doc.edit([{op: "insert", at: [1, 1, 0, 1], content: "!"}]);
    assert.equal(doc.get(endpoint)!.line.key, childKey);
    assert.equal(doc.visible(childKey), true);
    assert.equal(rootNames(doc).length, 1);
    const run = doc.toJSON().children![1].children![1].children![0].runs![0];
    assert.ok("text" in run); assert.equal(run.text, "a!");
});

test("concurrent same-object moves converge in both receipt orders", () => {
    const {doc, a, b} = setup(), snapshot = doc.snapshot();
    const x = Doc.fromSnapshot("X", snapshot, schema), y = Doc.fromSnapshot("Y", snapshot, schema);
    x.get(slotKey(b, "body")); y.get(slotKey(b, "body"));
    const left = move(x, a, slotKey(b, "body")), right = move(y, a, MAIN, b);
    left.forEach(op => y.apply(op)); right.forEach(op => x.apply(op));
    assert.deepEqual(x.toJSON(), y.toJSON());
    assert.equal(rootNames(x).filter(name => name === "a").length, 1);
});

test("concurrent parent cycles converge without dropping either movement record", () => {
    const {doc, a, b} = setup(), snapshot = doc.snapshot();
    const x = Doc.fromSnapshot("X", snapshot, schema), y = Doc.fromSnapshot("Y", snapshot, schema);
    const left = move(x, a, slotKey(b, "body")), right = move(y, b, slotKey(a, "body"));
    left.forEach(op => y.apply(op)); right.forEach(op => x.apply(op));
    assert.deepEqual(x.toJSON(), y.toJSON());
    assert.equal(rootNames(x).length, 1);
    assert.equal(x.snapshot().moves!.length, 2);
});

test("deletion controls visibility independently of movement and undo restores content", () => {
    const {doc, a, b} = setup();
    move(doc, a, slotKey(b, "body"));
    const deletion: Op = {t: "del", at: doc.clock.next(), ids: [a]}; doc.apply(deletion);
    assert.equal(doc.visible(slotKey(a, "body")), false);
    move(doc, a, MAIN, b);
    assert.deepEqual(rootNames(doc), ["b"]);
    doc.apply({t: "undel", at: doc.clock.next(), cancels: [deletion.at], ids: [a]});
    assert.deepEqual(rootNames(doc), ["b", "a"]);
});

test("move history is conditional on exact current placement ownership", () => {
    const {doc, a, b} = setup(), history = new History();
    const operations = move(doc, b, MAIN, doc.get(MAIN)!.id);
    history.record(operations, doc, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(rootNames(doc), ["b", "a"]);
    history.undo(doc); assert.deepEqual(rootNames(doc), ["a", "b"]);
    history.redo(doc); assert.deepEqual(rootNames(doc), ["b", "a"]);
    move(doc, b, MAIN, a);
    assert.deepEqual(history.undo(doc).ops, []);
    assert.deepEqual(rootNames(doc), ["a", "b"]);
});

test("movement snapshots retain logs, reject unknown capabilities, and survive ordinary GC", () => {
    const {doc, a, b} = setup(); move(doc, a, slotKey(b, "body"));
    doc.compact(Infinity, () => 0);
    const snapshot = doc.snapshot(), restored = Doc.fromSnapshot("R", snapshot, schema);
    assert.deepEqual(restored.toJSON(), doc.toJSON());
    assert.equal(restored.snapshot().moves!.length, 1);
    assert.throws(() => Doc.fromSnapshot("R", {...snapshot, capabilities: ["unknown"]}, schema), /Unsupported/);
});

test("move validates immutable target types and placement-anchor membership", () => {
    const {doc, a, b} = setup();
    const op: Op = {t: "move", at: doc.clock.next(), target: a, parent: ticketOf(slotKey(b, "body")), after: a};
    assert.match(doc.check([op])!, /anchor/);
    assert.equal(doc.check(doc.edit([{op: "move", from: [0], at: [1]}]).ops), null);
});

const textOf = (node: {runs?: import("../src/index.ts").Run[]}) => (node.runs ?? []).map(run => "text" in run ? run.text : "").join("");
test("paragraph cross-parent movement preserves tokens and supports split, join, and resplit", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("abc"), paragraph("DEF"), box("inside")]}]);
    const original = doc.blocks()[1]; assert.equal(original.kind, "text");
    const tokens = original.kind === "text" ? original.chars.map(item => [item.key, item.line.key]) : [];
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["inside", "DEF"]);
    doc.edit([{op: "split", at: [1, 1, 1]}]);
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["inside", "D", "EF"]);
    doc.edit([{op: "merge", at: [1, 2]}]);
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["inside", "DEF"]);
    doc.edit([{op: "split", at: [1, 1, 2]}]);
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["inside", "DE", "F"]);
    for (const [key, line] of tokens) assert.equal(doc.get(key)!.line.key, line);
    assert.deepEqual(Doc.fromSnapshot("B", doc.snapshot(), schema).toJSON(), doc.toJSON());
});

test("root paragraph moves independently from its flow and leaves stable editable default storage", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("root"), box("inside")]}]);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    assert.equal(textOf(doc.toJSON().children![1].children![1]), "root");
    const fallback = doc.blocks()[0].marker.key;
    doc.edit([{op: "insert", at: [0, 0], content: "new"}]);
    assert.equal(textOf(doc.toJSON().children![0]), "new");
    assert.equal(textOf(doc.toJSON().children![1].children![1]), "root");
    assert.equal(doc.blocks()[0].marker.key, fallback);
});

test("same-parent paragraph reorder keeps insertion/deletion/formatting at the moved tokens", () => {
    const doc = new Doc("A", {...schema, marks: ["bold"]});
    doc.edit([{op: "insert", at: [0], content: [paragraph("one"), paragraph("two"), paragraph("three")]}]);
    const target = doc.blocks()[2].marker;
    doc.edit([{op: "move", from: [2], at: [0]}]);
    assert.deepEqual(doc.toJSON().children!.slice(0, 3).map(textOf), ["three", "one", "two"]);
    doc.edit([{op: "insert", at: [0, 1], content: "!"}, {op: "delete", at: [0, 2], count: 1}, {op: "update", at: [0, 0], length: 1, attrs: {bold: true}}]);
    assert.equal(textOf(doc.toJSON().children![0]), "t!ree");
    assert.equal(doc.blocks()[0].marker, target);
    assert.deepEqual(doc.toJSON().children![0].runs![0], {text: "t", marks: {bold: true}});
});

test("move coordinates read destination parents before source removal", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("source"), box("target")]}]);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["target", "source"]);
    doc.edit([{op: "move", from: [1, 1], at: [2]}]);
    assert.equal(textOf(doc.toJSON().children![2]), "source");
});

test("concurrent Enter at a moved paragraph boundary still creates one absorbed line", () => {
    const doc = new Doc("S", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("abcd"), box("target")]}]);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    const a = Doc.fromSnapshot("A", doc.snapshot(), schema), b = Doc.fromSnapshot("B", doc.snapshot(), schema);
    const left = a.edit([{op: "split", at: [1, 1, 2]}]).ops;
    const right = b.edit([{op: "split", at: [1, 1, 2]}]).ops;
    assert.equal(a.check(right), null); assert.equal(b.check(left), null);
    left.forEach(op => b.apply(op)); right.forEach(op => a.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.deepEqual(a.toJSON().children![1].children!.map(textOf), ["target", "ab", "cd"]);
});

test("consecutive move undo and redo share restored placement ownership", () => {
    const {doc, a, b} = setup(), history = new History();
    for (const after of [b, doc.get(MAIN)!.id]) {
        const ops = move(doc, a, MAIN, after); history.record(ops, doc, {caretBefore: "", caretAfter: ""});
    }
    history.undo(doc); assert.deepEqual(rootNames(doc), ["b", "a"]);
    history.undo(doc); assert.deepEqual(rootNames(doc), ["a", "b"]);
    history.redo(doc); assert.deepEqual(rootNames(doc), ["b", "a"]);
    history.redo(doc); assert.deepEqual(rootNames(doc), ["a", "b"]);
});

test("new blocks inserted after movement retain their placement and validate as one Change", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("root"), box("target")]}]);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    const before = doc.snapshot();
    const ops = doc.edit([{op: "insert", at: [1, 0], content: [paragraph("first"), paragraph("second")]}, {op: "insert", at: [1, 3], content: [paragraph("middle")]}]).ops;
    const peer = Doc.fromSnapshot("B", before, schema);
    assert.equal(peer.check(ops), null); ops.forEach(op => peer.apply(op));
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["first", "second", "target", "middle", "root"]);
    assert.deepEqual(peer.toJSON(), doc.toJSON());
});

test("deleting a moved root paragraph retains its physical head and supports own undo", () => {
    const doc = new Doc("A", schema), history = new History();
    doc.edit([{op: "insert", at: [0], content: [paragraph("root"), box("target")]}]);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    const ops = doc.edit([{op: "delete", at: [1, 1], count: 1}]).ops;
    assert.equal(doc.check(ops), null); history.record(ops, doc, {caretBefore: "", caretAfter: ""});
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["target"]);
    history.undo(doc); assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["target", "root"]);
});

test("deleted moved paragraphs do not leak concurrent inserts into their old physical neighbors", () => {
    const seed = new Doc("S", schema);
    seed.edit([{op: "insert", at: [0], content: [paragraph("old"), paragraph("moved"), box("target")]}]);
    seed.edit([{op: "move", from: [1], at: [2, 1]}]);
    const a = Doc.fromSnapshot("A", seed.snapshot(), schema), b = Doc.fromSnapshot("B", seed.snapshot(), schema);
    const deletion = a.edit([{op: "delete", at: [1, 1], count: 1}]).ops;
    const insertion = b.edit([{op: "insert", at: [1, 1, 2], content: "!"}]).ops;
    assert.equal(a.check(insertion), null); assert.equal(b.check(deletion), null);
    insertion.forEach(op => a.apply(op)); deletion.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.equal(textOf(a.toJSON().children![0]), "old");
    assert.deepEqual(a.toJSON().children![1].children!.map(textOf), ["target"]);
});

test("group move preserves each constituent identity and ordered contents in one validated batch", () => {
    const grouped: Schema = {root: "content", marks: [], nodes: {
        content: {shape: "flow", children: ["paragraph", "list", "box"], default: "paragraph"}, paragraph: {shape: "text"},
        list: {shape: "group", children: ["item"], by: []}, item: {shape: "text"},
        box: {shape: "flow", children: ["paragraph", "list"], default: "paragraph"},
    }};
    const doc = new Doc("A", grouped);
    doc.edit([{op: "insert", at: [0], content: [paragraph("root"), {type: "list", children: [{type: "item", runs: [{text: "one", marks: {}}]}, {type: "item", runs: [{text: "two", marks: {}}]}]}, {type: "box", children: [paragraph("target")]}]}]);
    const ids = doc.blocks().filter(block => block.type === "item").map(block => block.marker.key), before = doc.snapshot();
    const ops = doc.edit([{op: "move", from: [1], at: [2, 1]}]).ops;
    const peer = Doc.fromSnapshot("B", before, grouped);
    assert.equal(peer.check(ops), null); ops.forEach(op => peer.apply(op));
    assert.deepEqual(doc.toJSON().children![1].children![1].children!.map(textOf), ["one", "two"]);
    assert.deepEqual(peer.toJSON(), doc.toJSON());
    for (const key of ids) assert.ok(doc.get(key));
});

test("structured movement keeps populated source virtual text separate from destination trailing input", () => {
    const doc = new Doc("A", schema);
    const atom = doc.clock.next(), text = doc.clock.next(), container = {lamport: text.lamport + 1, actor: "A"};
    doc.emit([{t: "node", id: atom, origin: doc.get(MAIN)!.id, type: "rule"}, {t: "text", id: text, origin: atom, text: "v"}, {t: "node", id: container, origin: text, type: "box"}]);
    const body = slotKey(container, "body"); doc.get(body);
    move(doc, atom, body, doc.get(body)!.id);
    assert.equal(textOf(doc.toJSON().children![1]), "v");
    assert.deepEqual(doc.toJSON().children![2].children!.map(node => node.type), ["paragraph", "rule"]);
    const ops = commands.insertText(doc, {line: body, b: 2, o: 0}, "destination");
    assert.equal(doc.check(ops), null);
    assert.equal(textOf(doc.toJSON().children![1]), "v");
    assert.equal(textOf(doc.toJSON().children![2].children![2]), "destination");
});

test("legacy virtual text gets a stable identity and moves, splits at start, joins, and undoes without copying", () => {
    const doc = new Doc("A", schema), history = new History();
    const atom = doc.clock.next(), text = doc.clock.next(), container = {lamport: text.lamport + 1, actor: "A"};
    doc.emit([{t: "node", id: atom, origin: doc.get(MAIN)!.id, type: "rule"}, {t: "text", id: text, origin: atom, text: "v"}, {t: "node", id: container, origin: text, type: "box"}]);
    const before = doc.snapshot(), original = doc.get(`${text.lamport}@A`)!;
    const ops = doc.edit([{op: "move", from: [2], at: [3, 1]}]).ops;
    const peer = Doc.fromSnapshot("B", before, schema); assert.equal(peer.check(ops), null); ops.forEach(op => peer.apply(op));
    assert.deepEqual(peer.toJSON(), doc.toJSON());
    history.record(ops, doc, {caretBefore: "", caretAfter: ""});
    assert.equal(textOf(doc.toJSON().children![2].children![1]), "v");
    history.undo(doc); assert.equal(textOf(doc.toJSON().children![2]), "v"); history.redo(doc);
    const split = doc.edit([{op: "split", at: [2, 1, 0]}]).ops;
    assert.equal(doc.check(split), null);
    assert.deepEqual(doc.toJSON().children![2].children!.map(textOf), ["", "", "v"]);
    const join = doc.edit([{op: "merge", at: [2, 2]}]).ops; assert.equal(doc.check(join), null);
    assert.equal(textOf(doc.toJSON().children![2].children![1]), "v");
    assert.equal(doc.get(original.key), original); assert.equal(original.line.key, MAIN);
});

test("pasting blocks inside a moved paragraph keeps its prefix and tail in the logical flow", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0], content: [paragraph("root"), box("target")]}]);
    doc.edit([{op: "move", from: [0], at: [1, 1]}]);
    const snapshot = doc.snapshot();
    const ops = doc.edit([{op: "insert", at: [1, 1, 2], content: [paragraph("pasted")]}]).ops;
    const peer = Doc.fromSnapshot("B", snapshot, schema); assert.equal(peer.check(ops), null); ops.forEach(op => peer.apply(op));
    assert.deepEqual(doc.toJSON().children![1].children!.map(textOf), ["target", "ro", "pasted", "ot"]);
    assert.deepEqual(doc.toJSON(), peer.toJSON());
});
