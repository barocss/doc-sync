import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import * as cmd from "../src/crdt/commands.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";

const fresh = (doc: Doc): NodeJSON => Doc.fromSnapshot("fresh", doc.snapshot(), DEMO_SCHEMA).toJSON();

test("모델 재사용: 읽은 값을 수정해도 다음 읽기와 문서에 영향을 주지 않는다", () => {
    const doc = new Doc("A", DEMO_SCHEMA);

    cmd.insertText(doc, {b: 0, o: 0}, "abcdef");
    cmd.setMark(doc, {b: 0, o: 0}, {b: 0, o: 2}, "bold", true);
    cmd.setLink(doc, {b: 0, o: 2}, {b: 0, o: 4}, "https://example.com");
    const expected = fresh(doc);
    const result = doc.toJSON();

    for (const run of result.children![0].runs!) {
        if ("text" in run) {
            run.marks.bold = false;
        } else {
            run.attrs!.href = "changed";
            run.runs!.push({text: "changed", marks: {}});
        }
    }

    result.children![0].type = "quote";
    result.children![0].runs![0] = {text: "changed", marks: {}};
    result.children!.push({type: "divider"});
    assert.deepEqual(doc.toJSON(), expected);
    const independent = doc.toJSON();

    assert.notEqual(independent, doc.toJSON());
    cmd.insertText(doc, {b: 0, o: 1}, "X");
    assert.deepEqual(independent, expected);
    assert.deepEqual(doc.toJSON(), fresh(doc));
});

test("모델 재사용: 변경 없는 재읽기에서 토큰과 서식을 다시 읽지 않는다", () => {
    const doc = new Doc("A", DEMO_SCHEMA);

    cmd.insertText(doc, {b: 0, o: 0}, "x".repeat(1000));
    const expected = doc.toJSON();
    const read = doc.marksOf;

    doc.marksOf = () => { throw new Error("변경 없는 글자를 다시 읽었다"); };
    assert.deepEqual(doc.toJSON(), expected);
    doc.marksOf = read;
});

test("모델 재사용: 글자·서식·구조·원격 적용·GC 뒤 새로 연 문서와 같다", () => {
    const doc = new Doc("A", DEMO_SCHEMA);
    const replica = new Doc("B", DEMO_SCHEMA);
    const edits: EditOp[][] = [
        [{op: "insert", at: [0, 0], content: "abcdef"}],
        [{op: "update", at: [0, 1], length: 3, attrs: {bold: true}}],
        [{op: "split", at: [0, 3]}],
        [{op: "merge", at: [1]}],
        [{op: "delete", at: [0, 1], count: 2}],
        [{op: "insert", at: [1], content: [{type: "callout", children: [{type: "paragraph", runs: [{text: "inside", marks: {}}]}]}]}],
        [{op: "insert", at: [1, 0, 2], content: "X"}],
        [{op: "update", at: [1], attrs: {tone: "info"}}],
    ];

    for (const edit of edits) {
        doc.toJSON();
        replica.toJSON();
        doc.edit(edit).ops.forEach(op => replica.apply(op));
        assert.deepEqual(doc.toJSON(), fresh(doc));
        assert.deepEqual(replica.toJSON(), doc.toJSON());
    }
    const before = doc.toJSON();

    doc.compact(Infinity, () => 0);
    assert.deepEqual(doc.toJSON(), before);
    assert.deepEqual(doc.toJSON(), fresh(doc));
});
