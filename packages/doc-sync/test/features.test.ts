import * as cmd from "../src/crdt/commands.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {MemoryNet, show, showMarks} from "./harness.ts";
import type {SyncClient} from "../src/sync/client.ts";

/**
 * 서식 · 리스트 · 되돌리기 다듬기 · GC · 서버 원자성.
 * "동시"는 settle() 전까지 서로 모르는 편집이다.
 */

const start = async (names: string[], text = "abcdefgh") => {
    const net = new MemoryNet();
    const clients = names.map(name => net.add(name));

    clients.forEach(c => c.connect());
    await net.settle();
    clients[0].commit(cmd.insertText(clients[0].doc, {b: 0, o: 0}, text));
    await net.settle();

    return {net, clients};
};

const same = (net: MemoryNet, render: (c: {doc: SyncClient["doc"]}) => string, expected: string) => {
    net.clients.forEach(c => assert.equal(render(c), expected, `${c.actor} 의 문서`));
    assert.equal(render({doc: net.hub.doc}), expected, "서버 문서");
};

// ── 서식 ─────────────────────────────────────────────────────────────────

test("서식: 굵게 하는 사이 남이 범위 안에 넣은 글자는 굵어지지 않는다 (본 글자만 바뀐다)", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 4}, "bold", true));
    b.commit(cmd.insertText(b.doc, {b: 0, o: 2}, "X"));
    await net.settle();

    same(net, showMarks, "**ab**X**cd**efgh");
});

test("서식: 굵은 글 끝에서 이어 치면 굵게 이어진다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 4}, "bold", true));
    a.commit(cmd.insertText(a.doc, {b: 0, o: 4}, "!"));
    await net.settle();

    same(net, showMarks, "**abcd!**efgh");
});

test("서식: 같은 글자를 동시에 켜고 끄면 나중 이름표가 이긴다 — 모두 같은 값으로", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 8}, "italic", true));
    b.commit(cmd.setMark(b.doc, {b: 0, o: 2}, {b: 0, o: 6}, "italic", false));
    await net.settle();

    // 둘의 이름표 lamport 가 같으면 참여자 이름이 큰 쪽(B)이 이긴다
    same(net, showMarks, "_ab_cdef_gh_");
});

// ── 목록 ─────────────────────────────────────────────────────────────────
//
// 스키마의 목록은 list → list-item 이다. 저장은 평평하다 — list-item 은 본문 줄의 text 블록이고, 모델을 계산할 때
// 이어진 항목끼리(listType 이 같은 것끼리) list 하나로 묶는다.

const toList = (c: SyncClient, b: number, listType: string) => c.commit(cmd.setBlockType(c.doc, b, "list-item", undefined, {listType}));

test("목록: 글머리 항목에서 친 Enter 는 같은 수준의 항목으로 이어진다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    toList(a, 0, "bullet");
    a.commit(cmd.setNumberAttr(a.doc, 0, "level", 1));
    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    await net.settle();

    same(net, show, " •abcd| •efgh");
});

test("목록: 같은 항목의 수준을 동시에 바꾸면 한 값으로 모인다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    toList(a, 0, "numbered");
    await net.settle();
    a.commit(cmd.setNumberAttr(a.doc, 0, "level", 2));
    b.commit(cmd.setNumberAttr(b.doc, 0, "level", 1));
    await net.settle();

    same(net, show, " 1.abcdefgh");
});

test("목록: 모델에서는 이어진 항목이 list 하나로 묶이고, 종류가 바뀌는 곳에서 목록이 나뉜다", async () => {
    const {net, clients: [a]} = await start(["A"], "abc");

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 1}));
    a.commit(cmd.splitBlock(a.doc, {b: 1, o: 1}));
    toList(a, 0, "bullet");
    toList(a, 1, "bullet");
    toList(a, 2, "numbered");
    await net.settle();

    assert.deepEqual(a.doc.toJSON().children, [
        {
            type: "list",
            attrs: {listType: "bullet"},
            children: [
                {type: "list-item", attrs: {level: 0}, runs: [{text: "a", marks: {}}]},
                {type: "list-item", attrs: {level: 0}, runs: [{text: "b", marks: {}}]},
            ],
        },
        {type: "list", attrs: {listType: "numbered"}, children: [{type: "list-item", attrs: {level: 0}, runs: [{text: "c", marks: {}}]}]},
    ]);
});

test("목록: 항목을 목록에서 빼는 것은 종류 바꾸기 하나라, 그 사이 남이 그 항목에 친 글이 그대로 남는다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"], "ab");

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 1}));
    toList(a, 0, "bullet");
    toList(a, 1, "bullet");
    await net.settle();
    same(net, show, "•a|•b");

    // A 는 둘째 항목을 문단으로 빼고, 그 사이 B 는 그 항목에 글을 더한다
    a.commit(cmd.setBlockType(a.doc, 1, "paragraph"));
    b.commit(cmd.insertText(b.doc, {b: 1, o: 1}, "++"));
    await net.settle();

    same(net, show, "•a|b++");
});

// ── 되돌리기 다듬기 ──────────────────────────────────────────────────────

/** 편집기처럼 커서를 따라가며 한 글자씩 친다 */
const typeChars = (c: SyncClient, b: number, o: number, text: string) => {
    for (const [i, ch] of [...text].entries()) {
        const pos = {b, o: o + i};
        const caretBefore = c.doc.anchorOf(pos);
        const ops = cmd.insertText(c.doc, pos, ch);

        c.commit(ops, {caretBefore, caretAfter: c.doc.anchorOf({b, o: o + i + 1}), typing: true});
    }
};

test("되돌리기: 이어 친 글자는 한 번에 되돌아가고, 커서는 치기 전 자리로", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);
    const before = a.doc.anchorOf({b: 0, o: 8});

    typeChars(a, 0, 8, "XYZ");
    assert.equal(show(a), "abcdefghXYZ");

    const caret = a.undo();

    await net.settle();
    same(net, show, "abcdefgh");
    assert.equal(caret, before, "커서는 치기 전 자리");
    a.redo();
    await net.settle();
    same(net, show, "abcdefghXYZ");
});

test("되돌리기: 문단 종류를 되돌릴 때 그 사이 남이 바꾼 값은 덮어쓰지 않는다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setBlockType(a.doc, 0, "heading1"));
    await net.settle();
    b.commit(cmd.setBlockType(b.doc, 0, "quote"));
    await net.settle();
    a.undo();
    await net.settle();

    same(net, show, ">abcdefgh");
});

test("되돌리기: 서식을 되돌릴 때 그 사이 남이 다시 바꾼 글자는 그대로 둔다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 4}, "bold", true));
    await net.settle();
    b.commit(cmd.setMark(b.doc, {b: 0, o: 2}, {b: 0, o: 4}, "bold", true));
    await net.settle();
    a.undo();
    await net.settle();

    same(net, showMarks, "ab**cd**efgh");
});

// ── GC ───────────────────────────────────────────────────────────────────

const compacted = (c: {doc: SyncClient["doc"]}) => c.doc.items.filter(i => i.compact).reduce((n, i) => n + i.span, 0);

test("GC: 되돌릴 수 있는 지우기는 압축하지 않는다 — 되돌리면 그대로 살아난다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.deleteRange(a.doc, {b: 0, o: 2}, {b: 0, o: 4}));
    await net.settle();
    assert.equal(net.hub.gc(), null, "A 의 되돌리기가 핀으로 막는다");
    a.undo();
    await net.settle();

    same(net, show, "abcdefgh");
});

test("GC: 끊긴 참여자가 받을 때까지 기다리고, 받은 뒤에 모두 같은 자리에서 압축한다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    b.disconnect();
    // A 가 친 것을 되돌린 뒤 새로 쳐서 다시하기 줄을 비운다 — 이제 'XY' 묘비를 되살릴 사람이 없다
    a.commit(cmd.insertText(a.doc, {b: 0, o: 8}, "XY"));
    a.undo();
    a.commit(cmd.insertText(a.doc, {b: 0, o: 8}, "Z"));
    await net.settle();
    assert.equal(net.hub.gc(), null, "끊긴 B 가 'XY' 를 아직 못 받았다");

    b.connect();
    await net.settle();
    assert.ok(net.hub.gc(), "B 가 받았으니 압축한다");
    await net.settle();

    same(net, show, "abcdefghZ");
    net.clients.forEach(c => assert.equal(compacted(c), 2, `${c.actor} 도 같은 묘비 둘을 압축했다`));
    assert.equal(compacted({doc: net.hub.doc}), 2);
});

test("GC: 연달아 친 글자의 묘비는 토큰 하나로 합쳐진다", async () => {
    const {net, clients: [a]} = await start(["A", "B"], "0123456789");
    const tokens = () => net.hub.doc.items.length;
    const before = tokens();

    a.commit(cmd.deleteRange(a.doc, {b: 0, o: 2}, {b: 0, o: 8}));
    a.commit(cmd.insertText(a.doc, {b: 0, o: 2}, "-"));
    // 새 편집이 쌓여도 지우기는 되돌리기 줄에 남아 있다 → 핀. 되돌리기 줄을 넘칠 만큼 쳐서 밀어낸다
    for (let i = 0; i < 100; i += 1) {
        a.commit(cmd.insertText(a.doc, {b: 0, o: 3 + i}, "."));
    }

    await net.settle();
    assert.ok(net.hub.gc());
    await net.settle();

    assert.equal(tokens(), before + 1 + 100 - 5, "지운 여섯 글자가 묶음 하나로");
    same(net, show, `01-${".".repeat(100)}89`);
});

test("GC 뒤에 들어온 참여자도 같은 문서를 받고, 이어서 편집할 수 있다", async () => {
    const {net, clients: [a]} = await start(["A"]);

    a.commit(cmd.insertText(a.doc, {b: 0, o: 8}, "XY"));
    a.undo();
    a.commit(cmd.insertText(a.doc, {b: 0, o: 8}, "Z"));
    await net.settle();
    assert.ok(net.hub.gc());

    const late = net.add("L");

    late.connect();
    await net.settle();
    late.commit(cmd.splitBlock(late.doc, {b: 0, o: 4}));
    await net.settle();

    same(net, show, "abcd|efghZ");
});

// ── 서버 원자성 ──────────────────────────────────────────────────────────

test("서버: 변경 안의 한 연산이라도 적용할 수 없으면 변경 전체를 거절하고 문서는 그대로다", () => {
    const net = new MemoryNet();
    const before = JSON.stringify(net.hub.doc.toJSON());

    assert.throws(() =>
        net.hub.submit({
            actor: "Q",
            seq: 1,
            ops: [
                {t: "text", id: {lamport: 1, actor: "Q"}, origin: {lamport: 0, actor: "~root"}, text: "ok"},
                {t: "text", id: {lamport: 5, actor: "Q"}, origin: {lamport: 99, actor: "nobody"}, text: "bad"},
            ],
        }),
    );
    assert.equal(JSON.stringify(net.hub.doc.toJSON()), before);
    assert.equal(net.hub.serverSeq, 0);
});
