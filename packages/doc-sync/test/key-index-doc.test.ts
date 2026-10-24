import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import type {Item, Op} from "../src/crdt/doc.ts";
import * as cmd from "../src/crdt/commands.ts";
import {DEMO_SCHEMA as schema} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";

// Independent Map oracle: rebuild every logical alias, not only representative IDs.
const useMap = (doc: Doc): Doc => {
    const index = Object.assign(new Map<string, Item>(), {compact() {}});
    for (const line of doc.lines()) for (const item of line.items) for (let i = 0; i < item.span; i++) index.set(`${item.id.lamport + i}@${item.id.actor}`, item);
    (doc as unknown as {byKey: Map<string, Item>}).byKey = index;
    return doc;
};
const equal = (a: Doc, b: Doc) => {
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.deepEqual(a.snapshot(), b.snapshot());
    for (const line of a.lines()) for (const item of line.items) for (let i = 0; i < item.span; i++) {
        const key = `${item.id.lamport + i}@${item.id.actor}`;
        assert.equal(a.get(key)?.key, b.get(key)?.key, key);
        assert.deepEqual(a.posAfter(key), b.posAfter(key), key);
    }
};

test("range index preserves Map results through concurrent delivery, duplicate replay and UTF-16", () => {
    const a = new Doc("seed", schema), b = useMap(new Doc("seed", schema));
    const apply = (ops: Op[]) => { ops.forEach(op => { a.apply(op); b.apply(op); }); equal(a, b); };
    apply([{t:"text", id:{lamport:1,actor:"seed"}, origin:{lamport:0,actor:"~root"}, text:"a😀한글".repeat(70)}]);
    for (let round = 0; round < 40; round++) {
        const left = Doc.fromSnapshot("A", a.snapshot(), schema), right = Doc.fromSnapshot("B", a.snapshot(), schema);
        const opsA = cmd.insertText(left, {b:0,o:round}, "α😀", {});
        const opsB = cmd.insertText(right, {b:0,o:round}, "β한", {});
        apply(round % 2 ? [...opsB,...opsA] : [...opsA,...opsB]);
        apply([...opsA,...opsB]);
        const edits = round % 3 === 0 ? cmd.setMark(leftFrom(a), {b:0,o:round}, {b:0,o:round+4}, "bold", true)
            : cmd.deleteRange(leftFrom(a), {b:0,o:round}, {b:0,o:round+1});
        apply(edits);
    }
});
const leftFrom = (doc: Doc) => Doc.fromSnapshot("C", doc.snapshot(), schema);

test("compacted aliases keep their exact origin on partial replay and snapshot restore", () => {
    const a = new Doc("seed", schema), b = useMap(new Doc("seed", schema));
    const text: Op = {t:"text",id:{lamport:1,actor:"seed"},origin:{lamport:0,actor:"~root"},text:"x".repeat(800)};
    for (const doc of [a,b]) {
        doc.apply(text);
        doc.apply({t:"del",at:{lamport:801,actor:"D"},ids:Array.from({length:800},(_,i)=>({lamport:i+1,actor:"seed"}))});
        assert.equal(doc.compact(1,()=>1),799);
    }
    equal(a,b);
    // A delayed operation refers to an interior alias, not the representative key.
    const delayed: Op = {t:"text",id:{lamport:900,actor:"late"},origin:{lamport:512,actor:"seed"},text:"kept😀"};
    for (const doc of [a,b]) doc.apply(delayed);
    equal(a,b);
    assert.equal(a.get("900@late")!.origin,"512@seed");
    const restored = Doc.fromSnapshot("restored", a.snapshot(), schema);
    const mapRestored = useMap(Doc.fromSnapshot("restored", b.snapshot(), schema));
    equal(restored,mapRestored);
    assert.equal(restored.get("900@late")!.origin,"512@seed");
    // The first two IDs already exist, the tail is new.
    const partial: Op = {t:"text",id:{lamport:904,actor:"late"},origin:{lamport:903,actor:"late"},text:"😀tail"};
    for (const doc of [restored,mapRestored]) doc.apply(partial);
    equal(restored,mapRestored);
});

for (const map of [false,true]) test(`range index history preserves foreign formatting, deletion and redo (${map ? "Map oracle" : "ranges"})`, async () => {
    const net = new MemoryNet(), a=net.add("A"), b=net.add("B");
    if (map) [net.hub.doc,a.doc,b.doc].forEach(useMap);
    try {
        a.connect();b.connect();await net.settle();
        a.commit(cmd.insertText(a.doc,{b:0,o:0},"abc",{}),null);await net.settle();
        a.clearHistory();b.clearHistory();
        const del=cmd.deleteRange(a.doc,{b:0,o:2},{b:0,o:3});
        const mark=cmd.setMark(b.doc,{b:0,o:2},{b:0,o:3},"bold",true);
        a.commit(del);b.commit(mark);await net.settle();
        a.undo();await net.settle();
        assert.deepEqual(a.doc.toJSON().children![0].runs,[{text:"ab",marks:{}},{text:"c",marks:{bold:true}}]);
        b.undo();await net.settle();
        assert.deepEqual(a.doc.toJSON().children![0].runs,[{text:"abc",marks:{}}]);
        b.redo();a.redo();await net.settle();
        assert.deepEqual(a.doc.toJSON().children![0].runs,[{text:"ab",marks:{}}]);
        equal(a.doc,b.doc);
    } finally {a.disconnect();b.disconnect();}
});
