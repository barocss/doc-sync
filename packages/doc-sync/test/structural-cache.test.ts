import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, slotKey} from "../src/crdt/doc.ts";
import * as cmd from "../src/crdt/commands.ts";
import {applyEdits} from "../src/crdt/model.ts";
import {DEMO_SCHEMA as schema} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import type {GridBlock, Op} from "../src/crdt/doc.ts";

const p = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const fixture = () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: [p("lead"), p("abcdef"), p("tail"),
        {type: "callout", children: [p("inside"), p("second")]},
        {type: "table", children: Array.from({length: 2}, (_, r) => ({type: "table-row", children: Array.from({length: 2}, (_, c) => ({type: "table-cell", children: [{type: "table-cell-body", children: [p(`cell${r}${c}`)]}]}))}))}]}]);
    doc.toJSON();
    return doc;
};
const gridOf = (doc: Doc) => doc.blocks().find(b => b.kind === "grid") as GridBlock;
const cold = (doc: Doc) => Doc.fromSnapshot("cold", doc.snapshot(), schema);
const equivalent = (doc: Doc) => {
    const reference = cold(doc);
    assert.deepEqual(doc.toJSON(), reference.toJSON(), "캐시 없는 snapshot 모델과 같다");
    for (const line of doc.lines()) {
        assert.equal(doc.visible(line.key), reference.visible(line.key), `가시성 ${line.key}`);
        for (const item of line.items) assert.deepEqual(doc.posAfter(item.key), reference.posAfter(item.key), `위치 ${item.key}`);
    }
};

for (const scope of ["root", "callout", "cell"] as const) test(`구조 캐시: ${scope} 나누기·합치기는 다른 문단을 다시 읽지 않는다`, () => {
    const doc = fixture();
    const at = scope === "root" ? [1, 3] : scope === "callout" ? [3, 0, 3] : [4, 0, 0, 0, 0, 3];
    const merged = scope === "root" ? [2] : scope === "callout" ? [3, 1] : [4, 0, 0, 0, 1];
    const untouched = doc.blocks()[0];
    for (const edit of [{op: "split", at}, {op: "merge", at: merged}] as EditOp[]) {
        const expected = applyEdits(schema, doc.toJSON(), [edit]);
        // 컴파일이 읽는 모델은 제외하고 원격 적용과 출력만 계측한다.
        const sender = cold(doc);
        const ops = sender.edit([edit]).ops;
        let reads = 0;
        const marks = doc.marksOf;
        doc.marksOf = item => { reads += 1; return marks.call(doc, item); };
        ops.forEach(op => doc.apply(op));
        assert.deepEqual(doc.toJSON(), expected);
        doc.marksOf = marks;
        assert.ok(reads <= 6, `바뀐 문단만 읽는다: ${reads}`);
        assert.equal(doc.blocks()[0], untouched);
        equivalent(doc);
    }
});

for (const axis of ["rows", "cols"] as const) test(`구조 캐시: 표 ${axis} 넣기·삭제·복원은 부모 블록과 칸 가시성을 갱신한다`, () => {
    const doc = fixture();
    let grid = gridOf(doc);
    const survivor = doc.cellKey(grid.marker, grid.rows[0], grid.cols[0]);
    const removed = doc.cellKey(grid.marker, grid.rows[1], grid.cols[1]);
    doc.visible(survivor);
    doc.visible(removed);
    const lead = doc.blocks()[0];
    const ops = cmd.deleteAxis(doc, grid, axis, 1);
    assert.equal(doc.visible(removed), false);
    assert.equal(doc.visible(survivor), true);
    equivalent(doc);
    for (const op of ops) if (op.t === "del") doc.apply({t: "undel", at: doc.clock.next(), ids: op.ids, cancels: [op.at]});
    assert.equal(doc.visible(removed), true);
    equivalent(doc);
    grid = gridOf(doc);
    cmd.insertAxis(doc, grid, axis, 1);
    assert.equal((axis === "rows" ? gridOf(doc).rows : gridOf(doc).cols).length, 3);
    assert.equal(doc.blocks()[0], lead);
    equivalent(doc);
});

test("구조 캐시: 합친 칸의 숨은 글과 서식은 나누기 뒤 나타난다", () => {
    const doc = fixture();
    let grid = gridOf(doc);
    const hidden = doc.cellKey(grid.marker, grid.rows[0], grid.cols[1]);
    assert.equal(doc.visible(hidden), true);
    cmd.setSpan(doc, grid, 0, 0, 1, 2);
    assert.equal(doc.visible(hidden), false);
    cmd.setMark(doc, {line: hidden, b: 0, o: 0}, {line: hidden, b: 0, o: 4}, "bold", true);
    cmd.splitBlock(doc, {line: hidden, b: 0, o: 4});
    equivalent(doc);
    grid = gridOf(doc);
    cmd.setSpan(doc, grid, 0, 0, 1, 1);
    assert.equal(doc.visible(hidden), true);
    assert.deepEqual(doc.toJSON().children![4].children![0].children![1].children![0].children![0].runs, [{text: "cell", marks: {bold: true}}]);
    equivalent(doc);
});

test("구조 캐시: 부모 삭제 중 자식 편집과 부모 복원을 반영한다", () => {
    const doc = fixture();
    const callout = doc.blocks().find(b => b.kind === "flow")!;
    const body = slotKey(callout.marker.key, "body");
    assert.equal(doc.visible(body), true);
    const sender = cold(doc);
    const remote = [...cmd.splitBlock(sender, {line: body, b: 0, o: 3}), ...cmd.insertText(sender, {line: body, b: 1, o: 0}, "X")];
    const deletion: Op = {t: "del", at: doc.clock.next(), ids: [callout.marker.id]};
    doc.apply(deletion);
    assert.equal(doc.visible(body), false);
    doc.toJSON();
    remote.forEach(op => doc.apply(op));
    doc.apply({t: "undel", at: doc.clock.next(), ids: deletion.ids, cancels: [deletion.at]});
    assert.equal(doc.visible(body), true);
    assert.deepEqual(doc.toJSON().children![3].children!.map(n => n.runs), [[{text: "ins", marks: {}}], [{text: "Xide", marks: {}}], [{text: "second", marks: {}}]]);
    equivalent(doc);
});

for (const kind of ["mark", "inline"] as const) test(`구조 캐시: 재계산 대기 중 ${kind} 속성 쓰기는 이전 모델을 폐기한다`, () => {
    const doc = fixture();
    if (kind === "inline") cmd.insertInline(doc, {b: 2, o: 2}, "inline-image");
    doc.toJSON();
    const sender = cold(doc);
    const split = sender.edit([{op: "split", at: [1, 3]}]).ops;
    split.forEach(op => doc.apply(op));
    const target = sender.textAt({b: 3, o: 0}).chars[kind === "mark" ? 0 : 2];
    const op: Op = {t: "set", at: doc.clock.next(), ids: [target.id], key: kind === "mark" ? "bold" : "width", value: kind === "mark" ? true : 320};
    doc.apply(op);
    equivalent(doc);
    if (kind === "mark") assert.deepEqual(doc.toJSON().children![3].runs![0], {text: "t", marks: {bold: true}});
    else {
        const image = doc.toJSON().children![3].runs![1];
        assert.ok("type" in image);
        assert.equal(image.attrs!.width, 320);
    }
});

test("구조 캐시: 구조 대기 중 큰 삽입·글자 삭제·복원과 GC를 검산한다", () => {
    const doc = fixture();
    const sender = cold(doc);
    const ops = sender.edit([{op: "split", at: [1, 3]}, {op: "insert", at: [3, 1], content: "z".repeat(300)}, {op: "delete", at: [0, 1], count: 2}]).ops;
    ops.forEach(op => doc.apply(op));
    equivalent(doc);
    for (const op of ops) if (op.t === "del") doc.apply({t: "undel", at: doc.clock.next(), ids: op.ids, cancels: [op.at]});
    equivalent(doc);
    const before = doc.toJSON();
    doc.compact(Infinity, () => 0);
    assert.deepEqual(doc.toJSON(), before);
    equivalent(doc);
});

test("구조 캐시: 노드 중복과 낮은 Ticket 쓰기는 기존 문단 모델을 유지한다", () => {
    const doc = fixture();
    const sender = cold(doc);
    const ops = sender.edit([{op: "split", at: [1, 3]}]).ops;
    ops.forEach(op => doc.apply(op));
    const before = doc.toJSON();
    const blocks = doc.blocks();
    ops.forEach(op => doc.apply(op));
    const marker = blocks[1].marker;
    doc.apply({t: "set", at: {lamport: 0, actor: "old"}, ids: [marker.id], key: "$type", value: "quote"});
    assert.equal(doc.blocks(), blocks);
    assert.deepEqual(doc.toJSON(), before);
    equivalent(doc);
});

test("구조 캐시: 같은 경계 동시 Enter의 대표 삭제·복원은 한 줄 흡수를 유지한다", () => {
    const seed = new Doc("seed", schema);
    cmd.insertText(seed, {b: 0, o: 0}, "abcdef");
    const a = Doc.fromSnapshot("A", seed.snapshot(), schema);
    const b = Doc.fromSnapshot("B", seed.snapshot(), schema);
    const aops = cmd.splitBlock(a, {b: 0, o: 3});
    const bops = cmd.splitBlock(b, {b: 0, o: 3});
    a.toJSON(); b.toJSON();
    bops.forEach(op => a.apply(op)); aops.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), {type: "content", children: [p("abc"), p("def")]});
    assert.deepEqual(a.toJSON(), b.toJSON());
    const representative = a.textAt({b: 1, o: 0}).marker;
    const del: Op = {t: "del", at: a.clock.next(), ids: [representative.id]};
    for (const doc of [a, b]) { doc.apply(del); equivalent(doc); }
    assert.deepEqual(a.toJSON(), {type: "content", children: [p("abc"), p("def")]});
    const undo: Op = {t: "undel", at: a.clock.next(), ids: del.ids, cancels: [del.at]};
    for (const doc of [a, b]) { doc.apply(undo); equivalent(doc); }
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.equal(a.textAt({b: 1, o: 0}).aliases.length, 1);
});

test("구조 캐시: 구조 undo/redo를 해도 다른 사용자의 글자와 서식을 보존한다", async () => {
    const net = new MemoryNet();
    const a = net.add("A"), b = net.add("B");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "abcdef"}]).ops); await net.settle();
    a.commit(a.doc.edit([{op: "split", at: [0, 3]}]).ops); await net.settle();
    b.commit(b.doc.edit([{op: "insert", at: [1, 1], content: "X"}, {op: "update", at: [1, 0], length: 1, attrs: {bold: true}}]).ops); await net.settle();
    for (const action of ["undo", "redo", "undo", "redo"] as const) {
        a[action](); await net.settle();
        assert.deepEqual(a.doc.toJSON(), b.doc.toJSON());
        assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
        const children = action === "undo" ? [{type: "paragraph", runs: [{text: "abc", marks: {}}, {text: "d", marks: {bold: true}}, {text: "Xef", marks: {}}]}] : [p("abc"), {type: "paragraph", runs: [{text: "d", marks: {bold: true}}, {text: "Xef", marks: {}}]}];
        assert.deepEqual(a.doc.toJSON(), {type: "content", children});
        equivalent(a.doc); equivalent(b.doc);
    }
});
