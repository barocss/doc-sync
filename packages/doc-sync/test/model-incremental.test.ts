import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import * as cmd from "../src/crdt/commands.ts";
import {MemoryNet, show} from "./harness.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {GridBlock, Op} from "../src/crdt/doc.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";

const paragraph = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const fresh = (doc: Doc) => Doc.fromSnapshot("fresh", doc.snapshot(), DEMO_SCHEMA).toJSON();
const seed = (children: NodeJSON[]) => {
    const doc = new Doc("A", DEMO_SCHEMA);
    doc.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: children}]);
    doc.toJSON();
    return doc;
};

test("문단 모델: 10만 자에서 한 문단을 바꿔도 나머지 글자와 서식을 다시 읽지 않는다", () => {
    const doc = seed(Array.from({length: 625}, () => paragraph("x".repeat(160))));
    const prior = doc.toJSON();
    const read = doc.marksOf.bind(doc);
    let reads = 0;
    doc.marksOf = item => { reads += 1; return read(item); };
    cmd.insertText(doc, {b: 300, o: 80}, "가");
    reads = 0;
    const result = doc.toJSON();
    assert.equal(reads, 161, "바뀐 문단의 161개 토큰만 읽는다");
    assert.deepEqual(result, fresh(doc));
    assert.deepEqual(prior.children![300], paragraph("x".repeat(160)));
    result.children![299].runs!.push({text: "mutated", marks: {}});
    assert.deepEqual(doc.toJSON(), fresh(doc), "재사용한 문단도 반환 모델과 공유하지 않는다");
});

test("문단 모델: 같은 Block의 LWW 서식 쓰기·취소·중복은 캐시를 갱신한다", () => {
    const doc = seed([paragraph("abcdef"), paragraph("unchanged")]);
    const block = doc.textAt({b: 0, o: 0});
    const target = block.chars[2].id;
    const set: Op = {t: "set", at: doc.clock.next(), ids: [target], key: "bold", value: true};
    doc.apply(set);
    assert.equal(doc.textAt({b: 0, o: 0}), block, "서식 쓰기는 Block 객체를 교체하지 않는다");
    assert.deepEqual(doc.toJSON(), fresh(doc));
    assert.deepEqual(doc.toJSON().children![0].runs, [
        {text: "ab", marks: {}}, {text: "c", marks: {bold: true}}, {text: "def", marks: {}},
    ]);
    for (const op of [set, {...set, at: {actor: "old", lamport: 1}, value: false},
        {...set, at: doc.clock.next(), value: false}]) {
        doc.apply(op);
        assert.deepEqual(doc.toJSON(), fresh(doc));
    }
});

test("문단 모델: 목록 묶음·링크·인라인·상자의 정규화는 새 snapshot 해석과 같다", () => {
    const doc = seed([paragraph("lead"), {type: "list", attrs: {listType: "numbered"}, children: [
        {type: "list-item", runs: [{text: "one", marks: {}}]},
        {type: "list-item", runs: [{text: "two", marks: {}}]},
    ]}, {type: "callout", children: [paragraph("body")] }]);
    const edits: EditOp[] = [
        {op: "insert", at: [1, 1, 1], content: "가😀"},
        {op: "update", at: [1, 0, 0], length: 2, attrs: {link: "https://example.test"}},
        {op: "insert", at: [2, 0, 2], content: [{type: "inline-image", attrs: {src: "https://example.test/x.png"}}]},
        {op: "update", at: [2], attrs: {tone: "info"}},
        {op: "update", at: [1], attrs: {listType: "bullet"}},
        {op: "delete", at: [1, 0, 0], count: 1},
    ];
    for (const edit of edits) {
        doc.edit([edit]);
        assert.deepEqual(doc.toJSON(), fresh(doc));
    }
});

test("문단 모델: 숨은 표 칸의 글·서식과 합치기·행열 변경을 보존한다", () => {
    const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [paragraph(text)]}]});
    const doc = seed([paragraph("lead"), {type: "table", children: [{type: "table-row", children: [cell("left"), cell("hidden")]}]}]);
    const grid = () => doc.blocks().find(b => b.kind === "grid") as GridBlock;
    cmd.setSpan(doc, grid(), 0, 0, 1, 2);
    assert.deepEqual(doc.toJSON(), fresh(doc));
    const g = grid();
    const line = doc.cellKey(g.marker, g.rows[0], g.cols[1]);
    for (const change of [
        () => cmd.insertText(doc, {line, b: 0, o: 2}, "Z"),
        () => cmd.setMark(doc, {line, b: 0, o: 0}, {line, b: 0, o: 3}, "italic", true),
        () => cmd.setSpan(doc, grid(), 0, 0, 1, 1),
        () => cmd.insertAxis(doc, grid(), "rows", 1),
        () => cmd.insertAxis(doc, grid(), "cols", 1),
        () => cmd.deleteAxis(doc, grid(), "cols", 1),
    ]) {
        change();
        assert.deepEqual(doc.toJSON(), fresh(doc));
    }
    assert.equal(doc.textAt({line, b: 0, o: 0}).text, "hiZdden");
});

test("문단 모델: 지우기·되살리기·큰 text·GC 뒤에도 새 해석과 같다", () => {
    const doc = seed([paragraph("가😀tail"), paragraph("other")]);
    const deletion = cmd.deleteRange(doc, {b: 0, o: 0}, {b: 0, o: 3})[0] as Extract<Op, {t: "del"}>;
    assert.deepEqual(doc.toJSON(), fresh(doc));
    doc.apply({t: "undel", at: doc.clock.next(), ids: deletion.ids, cancels: [deletion.at]});
    assert.deepEqual(doc.toJSON(), fresh(doc));
    cmd.insertText(doc, {b: 0, o: 3}, "x".repeat(257));
    assert.deepEqual(doc.toJSON(), fresh(doc));
    cmd.deleteRange(doc, {b: 0, o: 3}, {b: 0, o: 260});
    const expected = doc.toJSON();
    doc.compact(Infinity, () => 0);
    assert.deepEqual(doc.toJSON(), expected);
    assert.deepEqual(doc.toJSON(), fresh(doc));
});

test("문단 모델: 캐시를 읽은 뒤 동시 Enter·원격 서식·참여자 undo를 해도 수렴한다", async () => {
    const net = new MemoryNet();
    const a = net.add("A"), b = net.add("B");
    a.connect(); b.connect(); await net.settle();
    a.commit(cmd.insertText(a.doc, {b: 0, o: 0}, "abcdefgh")); await net.settle();
    for (const c of [a, b]) {
        c.doc.toJSON();
        c.commit(cmd.splitBlock(c.doc, {b: 0, o: 4}));
        c.doc.toJSON();
        c.commit(cmd.insertText(c.doc, {b: 1, o: 0}, c.actor));
        c.doc.toJSON();
    }
    await net.settle();
    assert.equal(show(a), "abcd|BAefgh");
    a.commit(cmd.setMark(a.doc, {b: 1, o: 0}, {b: 1, o: 2}, "bold", true));
    await net.settle();
    b.doc.toJSON(); b.undo(); await net.settle();
    b.redo(); await net.settle();
    for (const c of [a, b]) {
        assert.deepEqual(c.doc.toJSON(), net.hub.doc.toJSON());
        assert.deepEqual(c.doc.toJSON(), fresh(c.doc));
        assert.equal(c.pending.length, 0);
        c.disconnect();
    }
});
