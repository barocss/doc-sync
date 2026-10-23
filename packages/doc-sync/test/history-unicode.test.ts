import assert from "node:assert/strict";
import {test} from "node:test";
import * as cmd from "../src/crdt/commands.ts";
import {MemoryNet, show} from "./harness.ts";

const setup = async (text: string) => {
    const net = new MemoryNet();
    const a = net.add("A");
    const b = net.add("B");
    a.connect();
    b.connect();
    await net.settle();
    a.commit(cmd.insertText(a.doc, {b: 0, o: 0}, text));
    await net.settle();
    return {net, a, b};
};

const same = (net: MemoryNet, text: string): void => {
    for (const client of net.clients) {
        assert.equal(show(client), text, client.actor);
        assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON());
    }
    assert.equal(show({doc: net.hub.doc}), text, "server");
};

for (const text of ["A😀B", "😀🧪🚀", "가😀나𐐀다", "e\u0301👩‍💻"]) {
    test(`Unicode 삽입 undo/redo: 모든 UTF-16 토큰을 함께 되돌린다 (${text})`, async () => {
        const {net, a, b} = await setup(text);
        try {
            a.undo();
            await net.settle();
            same(net, "");
            a.redo();
            await net.settle();
            same(net, text);
            a.undo();
            await net.settle();
            same(net, "");
        } finally {
            a.disconnect();
            b.disconnect();
        }
    });
}

test("Unicode 삽입 undo/redo: 다른 actor의 emoji 삭제를 취소하지 않는다", async () => {
    const {net, a, b} = await setup("A😀B");
    try {
        b.commit(cmd.deleteRange(b.doc, {b: 0, o: 1}, {b: 0, o: 3}));
        await net.settle();
        same(net, "AB");
        a.undo();
        await net.settle();
        same(net, "");
        a.redo();
        await net.settle();
        same(net, "AB");
        b.undo();
        await net.settle();
        same(net, "A😀B");
    } finally {
        a.disconnect();
        b.disconnect();
    }
});

test("Unicode 삽입 undo/redo: 사이에 들어온 다른 actor의 글을 유지한다", async () => {
    const {net, a, b} = await setup("A😀B");
    try {
        b.commit(cmd.insertText(b.doc, {b: 0, o: 3}, "원격🧪"));
        await net.settle();
        same(net, "A😀원격🧪B");
        a.undo();
        await net.settle();
        same(net, "원격🧪");
        a.redo();
        await net.settle();
        same(net, "A😀원격🧪B");
    } finally {
        a.disconnect();
        b.disconnect();
    }
});

test("Unicode 동시 삭제 undo: 자기 삭제만 취소하고 다른 actor의 삭제는 유지한다", async () => {
    const {net, a, b} = await setup("A😀B");
    try {
        a.commit(cmd.deleteRange(a.doc, {b: 0, o: 1}, {b: 0, o: 3}));
        b.commit(cmd.deleteRange(b.doc, {b: 0, o: 1}, {b: 0, o: 3}));
        await net.settle();
        same(net, "AB");
        a.undo();
        await net.settle();
        same(net, "AB");
        b.undo();
        await net.settle();
        same(net, "A😀B");
    } finally {
        a.disconnect();
        b.disconnect();
    }
});
