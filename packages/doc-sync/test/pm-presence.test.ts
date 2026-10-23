import assert from "node:assert/strict";
import {test} from "node:test";
import {AllSelection, TextSelection} from "prosemirror-state";
import {DecorationSet} from "prosemirror-view";
import {PmBinding} from "../src/pm/binding.ts";
import {anchorAt} from "../src/crdt/edit.ts";
import * as cmd from "../src/crdt/commands.ts";
import {MemoryNet} from "./harness.ts";
import {INFO} from "./pm-fuzz.ts";
import type {Presence} from "../src/sync/protocol.ts";
import type {GridBlock} from "../src/crdt/doc.ts";

const start = async () => {
    const net = new MemoryNet();
    const a = net.add("A");
    const b = net.add("B");

    a.connect();
    b.connect();
    await net.settle();
    const sender = new PmBinding(a, INFO);
    const receiver = new PmBinding(b, INFO);

    sender.dispatch(sender.state.tr.insertText("abcdefgh", 1));
    await net.settle();
    return {net, sender, receiver};
};
const decorations = (binding: PmBinding) => binding.state.plugins.flatMap(plugin => {
    const source = plugin.props.decorations?.call(plugin, binding.state);

    return source instanceof DecorationSet ? source.find() : [];
});
const ranges = (binding: PmBinding) => decorations(binding).filter(d => d.spec.kind === "selection").map(d => [d.from, d.to, d.spec.actor]);
const carets = (binding: PmBinding) => decorations(binding).filter(d => d.spec.kind === "caret").map(d => d.from);
const presence = (sender: PmBinding, head: number, anchor: number | null, actor = "A"): Presence => ({
    actor, name: actor, color: "#2563eb",
    anchor: anchorAt(sender.client.doc, [0, head - 1]),
    focus: anchor === null ? null : anchorAt(sender.client.doc, [0, anchor - 1]),
});

test("PM presence: 전방·역방향과 collapsed, presence-only 갱신은 문서를 바꾸지 않는다", async () => {
    const {net, sender, receiver} = await start();
    const before = receiver.state.doc;

    for (const [head, anchor] of [[7, 3], [3, 7]]) {
        net.hub.setPresence(presence(sender, head, anchor));
        net.down();
        assert.deepEqual(ranges(receiver), [[3, 7, "A"]]);
        assert.deepEqual(carets(receiver), [head]);
    }
    for (const focus of [null, 4]) {
        net.hub.setPresence(presence(sender, 4, focus));
        net.down();
        assert.deepEqual(ranges(receiver), []);
        assert.deepEqual(carets(receiver), [4]);
    }
    assert.equal(receiver.state.doc, before);
});

test("PM presence: 여러 문단 범위와 보내는 head/focus 방향을 유지한다", async () => {
    const {net, sender, receiver} = await start();
    const p = INFO.pm.nodes.paragraph;

    sender.dispatch(sender.state.tr.replaceWith(0, sender.state.doc.content.size, [p.create(null, INFO.pm.text("abcd")), p.create(null, INFO.pm.text("efgh"))]));
    await net.settle();
    sender.onSelection = (anchor, focus) => net.hub.setPresence({actor: "A", name: "A", color: "#2563eb", anchor, focus});
    for (const [anchor, head] of [[2, 9], [9, 2]]) {
        sender.dispatch(sender.state.tr.setSelection(TextSelection.create(sender.state.doc, anchor, head)));
        net.down();
        assert.deepEqual(ranges(receiver), [[2, 9, "A"]]);
        assert.deepEqual(carets(receiver), [head]);
    }
    sender.dispatch(sender.state.tr.setSelection(new AllSelection(sender.state.doc)));
    net.down();
    assert.deepEqual(ranges(receiver), [[1, 11, "A"]]);
    assert.deepEqual(carets(receiver), [11]);
});

test("PM presence: 기존 토큰 끝점은 삽입과 삭제 뒤 현재 위치로 다시 풀린다", async () => {
    const {net, sender, receiver} = await start();

    net.hub.setPresence(presence(sender, 7, 3));
    net.down();
    sender.dispatch(sender.state.tr.insertText("XY", 1));
    await net.settle();
    assert.deepEqual(ranges(receiver), [[5, 9, "A"]]);
    sender.dispatch(sender.state.tr.delete(4, 5));
    await net.settle();
    assert.deepEqual(ranges(receiver), [[4, 8, "A"]]);
    assert.deepEqual(carets(receiver), [8]);
});

test("PM presence: 없는 활성 끝은 숨기고 없는 반대 끝은 caret만 남긴다", async () => {
    const {net, sender, receiver} = await start();
    const valid = presence(sender, 7, 3);

    net.hub.setPresence({...valid, anchor: "missing@actor"});
    net.down();
    assert.deepEqual(decorations(receiver), []);
    net.hub.setPresence({...valid, focus: "missing@actor"});
    net.down();
    assert.deepEqual(ranges(receiver), []);
    assert.deepEqual(carets(receiver), [7]);
});

test("PM presence: 삭제되거나 합쳐져 숨은 칸의 범위는 이웃 칸으로 옮기지 않는다", async () => {
    for (const hide of ["delete", "cover"]) {
        const {net, sender, receiver} = await start();
        const pm = INFO.pm;
        const cell = (text: string) => pm.nodes.table_cell.create(null, pm.nodes.paragraph.create(null, pm.text(text)));
        const table = pm.nodes.table.create(null, pm.nodes.table_row.create(null, [cell("left"), cell("right")]));

        sender.dispatch(sender.state.tr.replaceWith(0, sender.state.doc.content.size, [pm.nodes.paragraph.create(), table, pm.nodes.paragraph.create()]));
        await net.settle();
        const doc = sender.client.doc;
        const grid = doc.blocks()[1] as GridBlock;
        const left = doc.cellKey(grid.marker, grid.rows[0], grid.cols[0]);
        const right = doc.cellKey(grid.marker, grid.rows[0], grid.cols[1]);
        const p: Presence = {
            actor: "A", name: "A", color: "#2563eb",
            anchor: doc.anchorOf({line: right, b: 0, o: 3}),
            focus: doc.anchorOf({line: right, b: 0, o: 1}),
        };

        net.hub.setPresence(p);
        net.down();
        assert.equal(ranges(receiver).length, 1);
        sender.client.commit(hide === "delete" ? cmd.deleteAxis(doc, grid, "cols", 1) : cmd.setSpan(doc, grid, 0, 0, 1, 2));
        await net.settle();
        assert.equal(receiver.client.doc.visible(right), false, hide);
        assert.deepEqual(decorations(receiver), [], hide);
        net.hub.setPresence({...p, anchor: doc.anchorOf({line: left, b: 0, o: 2})});
        net.down();
        assert.deepEqual(ranges(receiver), [], hide);
        assert.equal(carets(receiver).length, 1, hide);
    }
});

test("PM presence: 겹친 사용자별 범위, leave, 로컬 연결 종료", async () => {
    const {net, sender, receiver} = await start();

    net.hub.setPresence(presence(sender, 7, 3));
    net.hub.setPresence({...presence(sender, 8, 4, "C"), color: "#db2777"});
    net.down();
    assert.deepEqual(ranges(receiver), [[3, 7, "A"], [4, 8, "C"]]);
    net.hub.leave("A");
    net.down();
    assert.deepEqual(ranges(receiver), [[4, 8, "C"]]);
    receiver.client.disconnect();
    assert.deepEqual(decorations(receiver), []);
});

test("PM presence follows moved text after its original container is deleted", async () => {
    const {net, sender, receiver} = await start();
    const doc = sender.client.doc;
    sender.client.commit(doc.edit([{op: "insert", at: [1], content: [{type: "callout", children: [{type: "paragraph", runs: [{text: "inside", marks: {}}]}]}]}]).ops);
    await net.settle();
    const p: Presence = {actor: "moved", name: "Moved", color: "#2563eb", anchor: anchorAt(doc, [1, 0, 5]), focus: anchorAt(doc, [1, 0, 1])};
    sender.client.commit(doc.edit([{op: "move", from: [1, 0], at: [1]}]).ops);
    await net.settle();
    sender.client.commit(doc.edit([{op: "delete", at: [doc.toJSON().children!.findIndex(node => node.type === "callout")], count: 1}]).ops);
    await net.settle();
    net.hub.setPresence(p); net.down();
    assert.deepEqual(ranges(receiver), [[12, 16, "moved"]]);
    assert.deepEqual(carets(receiver), [16]);
});
