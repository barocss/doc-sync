import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {insertText} from "../src/crdt/commands.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {Op} from "../src/crdt/doc.ts";

/** 같은 text op를 한 code unit씩 적용한 결과와 비교한다. ID와 origin은 그대로다. */
const applyOneByOne = (doc: Doc, op: Extract<Op, {t: "text"}>): void => {
    for (let i = 0; i < op.text.length; i += 1) {
        doc.apply({...op, id: {actor: op.id.actor, lamport: op.id.lamport + i},
            origin: i ? {actor: op.id.actor, lamport: op.id.lamport + i - 1} : op.origin, text: op.text[i]});
    }
};

for (const size of [256, 257, 1000]) {
    test(`큰 문자열 ${size}: 캐시가 있을 때도 분할 적용과 모델·토큰·스냅숏이 같다`, () => {
        const seed = new Doc("seed", DEMO_SCHEMA);
        insertText(seed, {b: 0, o: 0}, "prefix-tail");
        const large = Doc.fromSnapshot("local", seed.snapshot(), DEMO_SCHEMA);
        const reference = Doc.fromSnapshot("reference", seed.snapshot(), DEMO_SCHEMA);
        const before = large.blocks();
        const tail = large.textAt({b: 0, o: 0}).chars.at(-1)!.key;

        assert.equal(large.posAfter(tail).o, 11);
        const content = "가😀".repeat(Math.ceil(size / 3)).slice(0, size);
        const op = insertText(large, {b: 0, o: 7}, content)[0] as Extract<Op, {t: "text"}>;

        reference.blocks();
        applyOneByOne(reference, op);
        assert.deepEqual(large.toJSON(), reference.toJSON());
        assert.deepEqual(large.snapshot(), reference.snapshot());
        assert.equal(large.posAfter(tail).o, 11 + size, "삽입 전 위치 캐시를 재사용하지 않는다");
        assert.equal(before[0].kind === "text" && before[0].text, "prefix-tail", "이미 반환한 블록은 바뀌지 않는다");
        const stable = large.toJSON();

        large.apply(op);
        assert.deepEqual(large.toJSON(), stable, "큰 text의 재전송은 멱등이다");
        assert.deepEqual(large.snapshot(), reference.snapshot());
    });
}

test("큰 문자열: 10만 자 단일 붙여넣기는 원격 적용과 스냅숏 왕복을 유지한다", () => {
    const doc = new Doc("local", DEMO_SCHEMA);
    const remote = new Doc("remote", DEMO_SCHEMA);
    const old = doc.blocks();

    remote.blocks();
    const ops = insertText(doc, {b: 0, o: 0}, "x".repeat(100000));

    ops.forEach(op => remote.apply(op));
    assert.deepEqual(doc.toJSON(), remote.toJSON());
    assert.deepEqual(Doc.fromSnapshot("copy", doc.snapshot(), DEMO_SCHEMA).toJSON(), doc.toJSON());
    assert.equal(old[0].kind === "text" && old[0].text, "");
});
