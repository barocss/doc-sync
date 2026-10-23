import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import * as cmd from "../src/crdt/commands.ts";
import {Doc, isAlive} from "../src/crdt/doc.ts";
import {runsToUnits} from "../src/crdt/model.ts";
import {keyOf} from "../src/crdt/ticket.ts";
import type {Op} from "../src/crdt/doc.ts";

const apply = (doc: Doc, ops: Op[]): void => ops.forEach(op => doc.apply(op));
const clone = (doc: Doc, actor: string): Doc => Doc.fromSnapshot(actor, JSON.parse(JSON.stringify(doc.snapshot())), DEMO_SCHEMA);
const base = (): Doc => {
    const doc = new Doc("seed", DEMO_SCHEMA);
    cmd.insertText(doc, {b: 0, o: 0}, "abcdef");
    return doc;
};

test("성질: 독립 동시 편집은 전달 순서를 바꿔도 같은 모델과 토큰 순서로 모인다", () => {
    for (let seed = 0; seed < 32; seed += 1) {
        const initial = base();
        const a = clone(initial, "A");
        const b = clone(initial, "B");
        const editsA = cmd.insertText(a, {b: 0, o: seed % 7}, "A");
        const editsB = seed % 2
            ? cmd.insertText(b, {b: 0, o: (seed * 3) % 7}, "B")
            : cmd.deleteRange(b, {b: 0, o: 1}, {b: 0, o: 3});
        const left = clone(initial, "left");
        const right = clone(initial, "right");
        apply(left, [...editsA, ...editsB]);
        apply(right, [...editsB, ...editsA]);
        assert.deepEqual(left.toJSON(), right.toJSON(), `seed ${seed}`);
        assert.deepEqual(left.lines().map(line => line.items.map(item => item.key)), right.lines().map(line => line.items.map(item => item.key)));
    }
});

test("성질: 다섯 wire 연산의 중복 전달은 모델과 저장 상태를 바꾸지 않는다", () => {
    const source = base();
    const text = cmd.insertText(source, {b: 0, o: 3}, "xy");
    const node = cmd.splitBlock(source, {b: 0, o: 4});
    const mark = cmd.setMark(source, {b: 0, o: 0}, {b: 0, o: 1}, "bold", true);
    const deletion = cmd.deleteRange(source, {b: 0, o: 0}, {b: 0, o: 1});
    const del = deletion.find((op): op is Extract<Op, {t: "del"}> => op.t === "del")!;
    const undel: Op = {t: "undel", at: source.clock.next(), cancels: [del.at], ids: del.ids};
    source.apply(undel);
    const ops = [...text, ...node, ...mark, ...deletion, undel];
    assert.deepEqual(new Set(ops.map(op => op.t)), new Set(["text", "node", "set", "del", "undel"]));
    const snapshot = source.snapshot();
    const model = source.toJSON();
    apply(source, ops);
    apply(source, ops);
    assert.deepEqual(source.snapshot(), snapshot);
    assert.deepEqual(source.toJSON(), model);
});

test("성질: 인과 의존 연산의 지연은 허용하지만 선행 토큰 없이 적용하지 않는다", () => {
    const initial = base();
    const a = clone(initial, "A");
    const b = clone(initial, "B");
    const first = cmd.insertText(a, {b: 0, o: 2}, "X");
    const dependent = cmd.insertText(a, {b: 0, o: 3}, "Y");
    const independent = cmd.insertText(b, {b: 0, o: 5}, "Z");
    const delayed = clone(initial, "delayed");
    assert.ok(delayed.check(dependent), "없는 기준을 가진 변경은 서버 검사에서 거절한다");
    apply(delayed, independent);
    apply(delayed, first);
    assert.equal(delayed.check(dependent), null);
    apply(delayed, dependent);
    const ordered = clone(initial, "ordered");
    apply(ordered, [...first, ...dependent, ...independent]);
    assert.deepEqual(delayed.toJSON(), ordered.toJSON());
});

test("성질: 안정된 묘비 GC는 모델을 보존하고 옛 이름표와 스냅숏 왕복을 유지한다", () => {
    for (let length = 3; length <= 12; length += 1) {
        const doc = new Doc("A", DEMO_SCHEMA);
        cmd.insertText(doc, {b: 0, o: 0}, "x".repeat(length));
        const block = doc.blocks()[0];
        const ids = block.kind === "text" ? block.chars.map(item => item.id) : [];
        cmd.deleteRange(doc, {b: 0, o: 0}, {b: 0, o: length - 1});
        const before = doc.toJSON();
        assert.ok(doc.compact(1, () => 1) > 0);
        assert.deepEqual(doc.toJSON(), before);
        ids.forEach(id => assert.ok(doc.get(keyOf(id)), "압축 뒤에도 옛 ID를 찾는다"));
        assert.deepEqual(clone(doc, "copy").toJSON(), before);
    }
});

test("성질: 모델은 지운 토큰과 내부 묘비 장부를 노출하지 않는다", () => {
    const doc = base();
    cmd.deleteRange(doc, {b: 0, o: 1}, {b: 0, o: 5});
    assert.ok(doc.items.some(item => !isAlive(item)));
    const expected = {type: "content", children: [{type: "paragraph", runs: [{text: "af", marks: {}}]}]};
    assert.deepEqual(doc.toJSON(), expected);
    doc.compact(Infinity, () => 0);
    assert.deepEqual(doc.toJSON(), expected);
});

test("문자 단위 경계: 저장 ID는 UTF-16, 모델 Unit은 code point이다", () => {
    const doc = new Doc("A", DEMO_SCHEMA);
    cmd.insertText(doc, {b: 0, o: 0}, "가😀");
    assert.equal(doc.items.filter(item => item.kind === "char").length, 3);
    const runs = doc.toJSON().children![0].runs!;
    assert.equal(runsToUnits(DEMO_SCHEMA, runs).length, 2);
    assert.equal((runs[0] as {text: string}).text, "가😀");
});
