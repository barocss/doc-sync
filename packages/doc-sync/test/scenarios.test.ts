import * as cmd from "../src/crdt/commands.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {MemoryNet, show} from "./harness.ts";

/**
 * 공통 시나리오 S1~S9.
 *
 * "동시"는 서로의 편집을 아직 받지 못한 채 친다는 뜻이다. MemoryNet 은 settle() 전까지 아무것도 전하지 않으므로,
 * settle 없이 이어서 친 편집들은 모두 서로 모르는 동시 편집이다.
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

const assertConverged = (net: MemoryNet, expected: string) => {
    net.clients.forEach(c => assert.equal(show(c), expected, `${c.actor} 의 문서`));
    assert.equal(show({doc: net.hub.doc}), expected, "서버 문서");
};

test("S1 둘이 같은 자리에서 동시에 Enter → 새 줄은 하나", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    b.commit(cmd.splitBlock(b.doc, {b: 0, o: 4}));
    await net.settle();

    assertConverged(net, "abcd|efgh");
});

test("S2 S1 뒤 각자 새 줄 맨 앞에 글자 → 둘 다 같은 새 줄에", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    b.commit(cmd.splitBlock(b.doc, {b: 0, o: 4}));
    a.commit(cmd.insertText(a.doc, {b: 1, o: 0}, "A"));
    b.commit(cmd.insertText(b.doc, {b: 1, o: 0}, "B"));
    await net.settle();

    assertConverged(net, "abcd|BAefgh");
});

test("S3 혼자 문단 끝에서 Enter 두 번 → 빈 줄 둘", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 8}));
    a.commit(cmd.splitBlock(a.doc, {b: 1, o: 0}));
    await net.settle();

    assertConverged(net, "abcdefgh||");
});

test("S4 둘이 문단 끝에서 동시에 Enter → 빈 줄 하나", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 8}));
    b.commit(cmd.splitBlock(b.doc, {b: 0, o: 8}));
    await net.settle();

    assertConverged(net, "abcdefgh|");
});

test("S5a 넷이 같은 자리에서 동시에 Enter 후 각자 글자 (전부 따로) → 한 줄에 넷", async () => {
    const {net, clients} = await start(["A", "B", "C", "D"]);

    clients.forEach(c => c.commit(cmd.splitBlock(c.doc, {b: 0, o: 4})));
    clients.forEach(c => c.commit(cmd.insertText(c.doc, {b: 1, o: 0}, c.actor)));
    await net.settle();

    assertConverged(net, "abcd|DCBAefgh");
});

test("S5b 넷이 동시에 Enter, Enter 만 먼저 퍼진 뒤 각자 글자 → 한 줄에 넷", async () => {
    const {net, clients} = await start(["A", "B", "C", "D"]);

    clients.forEach(c => c.commit(cmd.splitBlock(c.doc, {b: 0, o: 4})));
    await net.settle();
    clients.forEach(c => c.commit(cmd.insertText(c.doc, {b: 1, o: 0}, c.actor)));
    await net.settle();

    assertConverged(net, "abcd|DCBAefgh");
});

test("S5c 한 사람씩 보고 친 Enter 는 각자 따로 줄", async () => {
    const {net, clients} = await start(["A", "B", "C", "D"]);

    for (const c of clients) {
        c.commit(cmd.splitBlock(c.doc, {b: 0, o: 4}));
        c.commit(cmd.insertText(c.doc, {b: 1, o: 0}, c.actor));
        await net.settle();
    }

    assertConverged(net, "abcd|D|C|B|Aefgh");
});

test("S6 A 는 he|llo 에서 Enter, B 는 동시에 뒤쪽에 X", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"], "hello");

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 2}));
    b.commit(cmd.insertText(b.doc, {b: 0, o: 4}, "X"));
    await net.settle();

    assertConverged(net, "he|llXo");
});

test("S7 S1 뒤 두 문단을 걸치는 범위 삭제, 그 사이 남이 넣은 글자는 남는다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    b.commit(cmd.splitBlock(b.doc, {b: 0, o: 4}));
    await net.settle();
    a.commit(cmd.deleteRange(a.doc, {b: 0, o: 2}, {b: 1, o: 2}));
    b.commit(cmd.insertText(b.doc, {b: 1, o: 1}, "Z"));
    await net.settle();

    assertConverged(net, "abZgh");
});

test("S8 A 가 Enter 후 되돌리기, 그 사이 B 가 그 줄에 친 글자는 남는다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    await net.settle();
    b.commit(cmd.insertText(b.doc, {b: 1, o: 0}, "Y"));
    a.undo();
    await net.settle();

    assertConverged(net, "abcdYefgh");
});

test("S9 내 되돌리기는 내가 한 삭제만 취소한다 (보지 못한 남의 삭제는 남는다)", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    b.commit(cmd.deleteRange(b.doc, {b: 0, o: 3}, {b: 0, o: 4}));
    a.commit(cmd.deleteRange(a.doc, {b: 0, o: 3}, {b: 0, o: 8}));
    b.undo();
    await net.settle();

    assertConverged(net, "abc");
});

test("문단 종류는 마지막 쓰기가 이긴다 — 동시에 바꿔도 한 값으로 모인다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setBlockType(a.doc, 0, "heading1"));
    b.commit(cmd.setBlockType(b.doc, 0, "quote"));
    await net.settle();

    assertConverged(net, ">abcdefgh");
});

test("끊긴 동안 친 것은 다시 이어질 때 합쳐진다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    b.disconnect();
    b.commit(cmd.insertText(b.doc, {b: 0, o: 8}, "!"));
    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    await net.settle();
    assert.equal(show(b), "abcdefgh!", "끊긴 B 는 아직 A 의 Enter 를 모른다");

    b.connect();
    await net.settle();
    assertConverged(net, "abcd|efgh!");
});

test("나중에 들어온 참여자는 스냅숏을 받고 같은 문서를 본다", async () => {
    const {net, clients: [a]} = await start(["A"]);

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 4}));
    await net.settle();

    const late = net.add("Z");

    late.connect();
    await net.settle();
    assertConverged(net, "abcd|efgh");
});
