import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, commands as cmd} from "@barocss/doc-sync";
import type {GridBlock, Pos} from "@barocss/doc-sync";
import type {Presence} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {rangeContains, resolvePresence} from "../ui/presence.ts";

const create = () => {
    const doc = new Doc("A", DEMO_SCHEMA);

    cmd.insertText(doc, {b: 0, o: 0}, "abcdefgh");
    return doc;
};
const presence = (doc: Doc, head: Pos, focus: Pos | null): Presence => ({
    actor: "A", name: "A", color: "#2563eb", anchor: doc.anchorOf(head), focus: focus && doc.anchorOf(focus),
});

test("데모 presence: 전방·역방향과 collapsed, 문자 범위의 끝은 제외한다", () => {
    const doc = create();

    for (const [head, focus] of [[6, 2], [2, 6]]) {
        const resolved = resolvePresence(doc, presence(doc, {b: 0, o: head}, {b: 0, o: focus}))!;

        assert.deepEqual(resolved.range, [{b: 0, o: 2}, {b: 0, o: 6}]);
        assert.equal(rangeContains(resolved.range, {b: 0, o: 2}), true);
        assert.equal(rangeContains(resolved.range, {b: 0, o: 6}), false);
        assert.equal(rangeContains(resolved.range, {line: "other", b: 0, o: 3}), false);
    }
    for (const focus of [null, {b: 0, o: 3}]) {
        assert.equal(resolvePresence(doc, presence(doc, {b: 0, o: 3}, focus))!.range, null);
    }
});

test("데모 presence: 같은 줄의 여러 문단과 삭제된 토큰 위치를 다시 푼다", () => {
    const doc = create();

    cmd.splitBlock(doc, {b: 0, o: 4});
    const p = presence(doc, {b: 1, o: 3}, {b: 0, o: 2});
    const range = resolvePresence(doc, p)!.range;

    assert.equal(rangeContains(range, {b: 0, o: 3}), true);
    assert.equal(rangeContains(range, {b: 1, o: 2}), true);
    cmd.insertText(doc, {b: 0, o: 0}, "X");
    assert.deepEqual(resolvePresence(doc, p)!.range, [{b: 0, o: 3}, {b: 1, o: 3}]);
    cmd.deleteRange(doc, {b: 0, o: 2}, {b: 0, o: 3});
    assert.deepEqual(resolvePresence(doc, p)!.range, [{b: 0, o: 2}, {b: 1, o: 3}]);
});

test("데모 presence: 없는 끝점은 문서 처음으로 바꾸지 않는다", () => {
    const doc = create();
    const p = presence(doc, {b: 0, o: 6}, {b: 0, o: 2});

    assert.equal(resolvePresence(doc, {...p, anchor: "missing"}), null);
    assert.equal(resolvePresence(doc, {...p, focus: "missing"})!.range, null);
});

test("데모 presence: 다른 칸과 숨은 칸의 범위를 옆 칸에 칠하지 않는다", () => {
    const doc = create();

    cmd.insertBlock(doc, {b: 0, o: 4}, "table", {rows: 1, cols: 2});
    const grid = doc.blocks()[1] as GridBlock;
    const lines = grid.cols.map(col => doc.cellKey(grid.marker, grid.rows[0], col));

    lines.forEach(line => cmd.insertText(doc, {line, b: 0, o: 0}, "cell"));
    const p = presence(doc, {line: lines[0], b: 0, o: 3}, {line: lines[1], b: 0, o: 1});

    assert.equal(resolvePresence(doc, p)!.range, null);
    const hidden = presence(doc, {line: lines[1], b: 0, o: 3}, {line: lines[1], b: 0, o: 1});

    cmd.deleteAxis(doc, doc.blocks()[1] as GridBlock, "cols", 1);
    assert.equal(resolvePresence(doc, hidden), null);
    assert.equal(resolvePresence(doc, p)!.range, null);
});

test("demo presence follows moved paragraph tokens after the birth container is hidden", () => {
    const doc = create();
    doc.edit([{op: "insert", at: [1], content: [{type: "callout", children: [{type: "paragraph", runs: [{text: "inside", marks: {}}]}]}]}]);
    const flow = doc.blocks().find(block => block.kind === "flow")!;
    assert.equal(flow.kind, "flow");
    if (flow.kind !== "flow") throw new Error("flow expected");
    const remote = presence(doc, {line: flow.body, b: 0, o: 5}, {line: flow.body, b: 0, o: 1});
    doc.edit([{op: "move", from: [1, 0], at: [1]}]);
    const oldContainer = doc.toJSON().children!.findIndex(node => node.type === "callout");
    doc.edit([{op: "delete", at: [oldContainer], count: 1}]);
    assert.equal(doc.visible(flow.body), false);
    const resolved = resolvePresence(doc, remote)!;
    assert.ok(resolved);
    assert.deepEqual(resolved.range!.map(point => [point.line ?? "0@~root", point.b, point.o]), [["0@~root", 1, 1], ["0@~root", 1, 5]]);
});
