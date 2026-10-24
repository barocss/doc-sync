import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, slotKey, ticketOf, type Schema, type NodeJSON} from "../src/index.ts";

const schema: Schema = {root: "content", marks: ["bold", "italic"], nodes: {
    content: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
    paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph", "box"], default: "paragraph"},
}};
const p = (text: string): NodeJSON => ({type: "paragraph", runs: text ? [{text, marks: {}}] : []});
const box = (...children: NodeJSON[]): NodeJSON => ({type: "box", children});
const root = (...children: NodeJSON[]): NodeJSON => ({type: "content", children});
const seed = (...children: NodeJSON[]) => {const d = new Doc("seed", schema);d.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: children}]);return d;};
const check = (d: Doc, expected: NodeJSON) => {
    assert.deepEqual(d.toJSON(), expected);
    assert.deepEqual(Doc.fromSnapshot("snapshot", d.snapshot(), schema).toJSON(), expected);
    assert.equal(new Set(d.blocks().map(b=>b.marker.key)).size, d.blocks().length, "one logical occurrence per root identity");
};
const automatic = () => {const d = seed(p("lead"), box(p("body")));d.edit([{op: "move", from: [1], at: [0]}]);return d;};

test("editing automatic leading input displays its stored text only once", () => {
    const d = automatic();check(d,root(p(""),box(p("body")),p("lead")));
    const key=d.blocks()[0].marker.key;
    d.edit([{op:"insert",at:[0,0],content:"X"}]);check(d,root(p("X"),box(p("body")),p("lead")));
    assert.equal(d.blocks()[0].marker.key,key);
    d.edit([{op:"insert",at:[0,1],content:"😀한"}]);check(d,root(p("X😀한"),box(p("body")),p("lead")));
});

test("automatic leading input undo and redo preserve one identity and content occurrence", () => {
    const d=automatic(),h=new History(),ops=d.edit([{op:"insert",at:[0,0],content:"X"}]).ops;
    h.record(ops,d,{caretBefore:"",caretAfter:""});
    check(d,root(p("X"),box(p("body")),p("lead")));
    h.undo(d);check(d,root(p(""),box(p("body")),p("lead")));
    h.redo(d);check(d,root(p("X"),box(p("body")),p("lead")));
});

test("moving edited automatic leading input creates a distinct editable replacement", () => {
    const d=automatic();d.edit([{op:"insert",at:[0,0],content:"X"}]);const original=d.blocks()[0].marker.key;
    const ops=d.edit([{op:"move",from:[0],at:[2]}]).ops;assert.equal(d.check(ops),null);
    check(d,root(p(""),box(p("body")),p("lead"),p("X")));
    const replacement=d.blocks()[0].marker.key;assert.notEqual(replacement,original);
    const next=d.edit([{op:"insert",at:[0,0],content:"new"}]).ops;assert.equal(d.check(next),null);
    check(d,root(p("new"),box(p("body")),p("lead"),p("X")));
});

for(const offset of [0,1,3]) test(`split at ${offset} preserves moved and stationary following siblings`,()=>{
    const d=seed(p("abc"),p("def"),p("ghi"));d.edit([{op:"move",from:[2],at:[1]}]);
    const siblings=d.blocks().slice(1).map(b=>[b.marker.key,d.placementOf(b.marker.id)] as const);
    const ops=d.edit([{op:"split",at:[0,offset]}]).ops;assert.equal(d.check(ops),null);
    check(d,root(p("abc".slice(0,offset)),p("abc".slice(offset)),p("ghi"),p("def")));
    for(const [key,placement] of siblings)assert.deepEqual(d.placementOf(d.get(key)!.id),placement,"split must not acquire sibling placement ownership");
});

test("splitting before several moved siblings preserves all their relative positions",()=>{
    const d=seed(...["abc","def","ghi","jkl","mno"].map(p));
    d.edit([{op:"move",from:[4],at:[1]},{op:"move",from:[4],at:[2]},{op:"split",at:[0,1]}]);
    check(d,root(...["a","bc","mno","jkl","def","ghi"].map(p)));
});

test("split undo redo and later remote formatting preserve sibling order and ownership",()=>{
    const d=seed(p("abc"),p("def"),p("ghi"));d.edit([{op:"move",from:[2],at:[1]}]);const h=new History();
    h.record(d.edit([{op:"split",at:[0,1]}]).ops,d,{caretBefore:"",caretAfter:""});
    check(d,root(...["a","bc","ghi","def"].map(p)));
    const remote=Doc.fromSnapshot("remote",d.snapshot(),schema);remote.edit([{op:"update",at:[1,0],length:1,attrs:{bold:true}}]).ops.forEach(op=>d.apply(op));
    h.undo(d);check(d,root({type:"paragraph",runs:[{text:"a",marks:{}},{text:"b",marks:{bold:true}},{text:"c",marks:{}}]},p("ghi"),p("def")));
    h.redo(d);check(d,root(p("a"),{type:"paragraph",runs:[{text:"b",marks:{bold:true}},{text:"c",marks:{}}]},p("ghi"),p("def")));
});

for(const reverse of [false,true]) test(`concurrent same-boundary splits after movement converge once (${reverse})`,()=>{
    const d=seed(p("abc"),p("def"),p("ghi"));d.edit([{op:"move",from:[2],at:[1]}]);
    const a=Doc.fromSnapshot("A",d.snapshot(),schema),b=Doc.fromSnapshot("B",d.snapshot(),schema);
    const x=a.edit([{op:"split",at:[0,1]}]).ops,y=b.edit([{op:"split",at:[0,1]}]).ops;
    for(const batch of reverse?[y,x]:[x,y]){assert.equal(d.check(batch),null);batch.forEach(op=>d.apply(op));}
    y.forEach(op=>a.apply(op));x.forEach(op=>b.apply(op));
    for(const peer of [d,a,b])check(peer,root(...["a","bc","ghi","def"].map(p)));
});

test("splitting populated automatic leading input keeps both halves before the moved block",()=>{
    const d=automatic();d.edit([{op:"insert",at:[0,0],content:"abc"},{op:"split",at:[0,1]}]);
    check(d,root(p("a"),p("bc"),box(p("body")),p("lead")));
});

test("automatic input can move across parents while its replacement stays editable",()=>{
    const d=automatic();d.edit([{op:"insert",at:[0,0],content:"X"},{op:"move",from:[0],at:[1,1]}]);
    check(d,root(p(""),box(p("body"),p("X")),p("lead")));
    const ops=d.edit([{op:"insert",at:[0,0],content:"abc"},{op:"split",at:[0,1]}]).ops;assert.equal(d.check(ops),null);
    check(d,root(p("a"),p("bc"),box(p("body"),p("X")),p("lead")));
});


test("later explicit paragraph movement can precede an edited automatic paragraph", () => {
    const d = automatic();
    d.edit([{op: "insert", at: [0, 0], content: "X"}, {op: "move", from: [2], at: [0]}]);
    check(d, root(p("lead"), p("X"), box(p("body"))));
});

test("later structured movement creates a new gap without displaying old automatic text twice", () => {
    const d = automatic();
    d.edit([{op: "insert", at: [0, 0], content: "X"}, {op: "move", from: [1], at: [0]}]);
    check(d, root(p(""), box(p("body")), p("X"), p("lead")));
    const ops = d.edit([{op: "insert", at: [0, 0], content: "new"}]).ops;
    assert.equal(d.check(ops), null);
    check(d, root(p("new"), box(p("body")), p("X"), p("lead")));
});

for (const reverse of [false, true]) test(`automatic input merges concurrent input and formatting (${reverse})`, () => {
    const d = automatic();
    d.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    const a = Doc.fromSnapshot("A", d.snapshot(), schema), b = Doc.fromSnapshot("B", d.snapshot(), schema);
    const x = a.edit([{op: "insert", at: [0, 1], content: "X"}]).ops;
    const y = b.edit([{op: "update", at: [0, 1], length: 1, attrs: {bold: true}}]).ops;
    for (const batch of reverse ? [y, x] : [x, y]) {assert.equal(d.check(batch), null); batch.forEach(op => d.apply(op));}
    y.forEach(op => a.apply(op)); x.forEach(op => b.apply(op));
    const expected = root({type: "paragraph", runs: [{text: "aX", marks: {}}, {text: "b", marks: {bold: true}}, {text: "c", marks: {}}]}, box(p("body")), p("lead"));
    for (const peer of [d, a, b]) check(peer, expected);
});

test("automatic gap ordering survives deletion compaction and snapshot restoration", () => {
    const d = automatic();
    d.edit([{op: "insert", at: [0, 0], content: "abc"}, {op: "delete", at: [0, 0], count: 2}, {op: "split", at: [0, 1]}]);
    const expected = root(p("c"), p(""), box(p("body")), p("lead"));
    check(d, expected);
    assert.ok(d.compact(Infinity, () => 0) > 0, "deleted characters must actually compact");
    check(d, expected);
});


test("private automatic anchors are accepted only in their immutable owning flow", () => {
    const d = automatic();
    d.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    const anchor = d.blocks()[0].marker.id, target = d.blocks()[2].marker.id;
    const container = d.blocks()[1].marker.key;
    assert.match(d.check([{t: "move", at: d.clock.next(), target, parent: ticketOf(slotKey(container, "body")), after: anchor}])!, /another flow/);
    const ops = d.edit([{op: "split", at: [0, 1]}]).ops;
    assert.equal(d.check(ops), null);
    check(d, root(p("a"), p("bc"), box(p("body")), p("lead")));
});
