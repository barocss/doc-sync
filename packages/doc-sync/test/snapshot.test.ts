import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import * as cmd from "../src/crdt/commands.ts";
import {Doc} from "../src/crdt/doc.ts";
import {keyOf} from "../src/crdt/ticket.ts";
import type {Op} from "../src/crdt/doc.ts";

Doc.verifyBlocks = true;

/** 받은 쪽에 연산을 그대로 적용한다 (서버 없이 — 두 참여자가 차례로 편집하므로 인과 순서가 지켜진다) */
const send = (list: Op[], to: Doc): void => list.forEach(op => to.apply(op));

/** 두 참여자가 번갈아 치고, 지우고, 서식을 입히고, 표를 넣은 문서 — 스냅숏이 적지 않고 넘기는 경우(이어 친 글자)와 적는 경우가 섞인다 */
const sample = (): Doc => {
    const a = new Doc("A", DEMO_SCHEMA);
    const b = new Doc("B", DEMO_SCHEMA);

    send(cmd.insertText(a, {b: 0, o: 0}, "안녕하세요 반갑습니다"), b);
    send(cmd.insertText(b, {b: 0, o: 5}, " 여러분"), a);
    send(cmd.splitBlock(a, {b: 0, o: 9}), b);
    send(cmd.setMark(a, {b: 0, o: 0}, {b: 0, o: 2}, "bold", true), b);
    send(cmd.deleteRange(b, {b: 0, o: 2}, {b: 0, o: 6}), a);
    send(cmd.insertBlock(a, {b: 1, o: 0}, "table", {rows: 2, cols: 2}), b);
    send(cmd.insertText(a, {b: 3, o: 2}, "끝"), b);

    return a;
};

/** 토큰마다 이름표·기준·종류·글자·장부를 비교할 수 있는 꼴로 */
const tokens = (doc: Doc) =>
    doc.lines().map(line => ({
        key: line.key,
        owner: line.owner?.key ?? null,
        items: line.items.map(i => [keyOf(i.id), i.key, i.origin, i.kind, i.ch, i.born, i.boundary, [...i.attrs].map(([k, v]) => [k, v.value, keyOf(v.at)]), [...i.dels], [...i.cancels], i.compact, i.span]),
    }));

test("스냅숏 → 불러오기 → 스냅숏 — 토큰·모델·다시 쓴 스냅숏이 모두 같다", () => {
    // Given: 여러 참여자의 편집이 섞인 문서
    const doc = sample();

    // When: 저장했다가 불러온다
    const snapshot = JSON.parse(JSON.stringify(doc.snapshot()));
    const loaded = Doc.fromSnapshot("C", snapshot, DEMO_SCHEMA);

    // Then: 토큰 하나하나와 모델과 다시 쓴 스냅숏이 같다
    assert.deepEqual(tokens(loaded), tokens(doc));
    assert.deepEqual(loaded.toJSON(), doc.toJSON());
    assert.deepEqual(loaded.snapshot(), doc.snapshot());
});

test("GC 로 묘비가 묶인 뒤에도 스냅숏 왕복이 같다 — 묶인 길이만큼 이름표를 건너뛴다", () => {
    // Given: 이어 친 글자 여러 개를 지우고 압축해 묶음(span > 1)을 만든다
    const doc = sample();

    cmd.deleteRange(doc, {b: 0, o: 0}, {b: 0, o: 4});

    const removed = doc.compact(Infinity, () => 0);
    const spans = doc.lines().flatMap(l => l.items).filter(i => i.span > 1);

    assert.ok(removed > 0 && spans.length > 0, "묶인 묘비가 생기지 않았다 — 시험이 의미 없다");

    // When
    const loaded = Doc.fromSnapshot("C", JSON.parse(JSON.stringify(doc.snapshot())), DEMO_SCHEMA);

    // Then: 묶음 안의 모든 이름표로도 같은 토큰을 찾는다
    assert.deepEqual(tokens(loaded), tokens(doc));
    assert.deepEqual(loaded.toJSON(), doc.toJSON());
    spans.forEach(span => {
        for (let i = 0; i < span.span; i += 1) {
            assert.equal(loaded.get(keyOf({lamport: span.id.lamport + i, actor: span.id.actor}))?.key, span.key);
        }
    });
});

test("스냅숏은 이어 친 글자의 이름표와 기준을 적지 않는다", () => {
    // Given
    const doc = new Doc("A", DEMO_SCHEMA);

    cmd.insertText(doc, {b: 0, o: 0}, "abcdef");

    // When
    const items = doc.snapshot().lines[0].items;

    // Then: 머리와 첫 글자만 이름표를 적고, 나머지 다섯 글자는 글자만
    assert.deepEqual(items.slice(2), ["b", "c", "d", "e", "f"].map(c => ({c})));
});
