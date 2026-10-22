import assert from "node:assert/strict";
import {test} from "node:test";
import {splitBlock} from "prosemirror-commands";
import {TextSelection} from "prosemirror-state";
import {addColumnAfter} from "prosemirror-tables";
import {PmBinding} from "../src/pm/binding.ts";
import {MemoryNet, show} from "./harness.ts";
import {INFO, runPmSeed} from "./pm-fuzz.ts";
import type {Command} from "prosemirror-state";

/**
 * ProseMirror 연동 — 진짜 ProseMirror 편집기 상태와 명령으로 편집하고, 그 Step 이 CRDT 로 가고, 남의 변경이 ProseMirror 로 온다.
 */

const pm = INFO.pm;

const start = async (names: string[], text = "abcdefgh") => {
    const net = new MemoryNet();
    const clients = names.map(name => net.add(name));

    clients.forEach(c => c.connect());
    await net.settle();

    const bindings = clients.map(c => new PmBinding(c, INFO));

    text && bindings[0].dispatch(bindings[0].state.tr.insertText(text, 1));
    await net.settle();

    return {net, clients, bindings};
};

/** 커서를 옮기고 명령 */
const at = (b: PmBinding, pos: number, command: Command) => {
    b.dispatch(b.state.tr.setSelection(TextSelection.create(b.state.doc, pos)));
    command(b.state, b.dispatch);
};

const typeAt = (b: PmBinding, pos: number, text: string) => b.dispatch(b.state.tr.setSelection(TextSelection.create(b.state.doc, pos)).insertText(text));

/** 모든 편집기와 서버가 같은 문서인가 */
const same = (net: MemoryNet, bindings: PmBinding[], expected: string) => {
    bindings.forEach(b => {
        assert.equal(show(b.client), expected, `${b.client.actor} 의 CRDT 문서`);
        assert.ok(b.state.doc.eq(bindings[0].state.doc), `${b.client.actor} 의 ProseMirror 문서`);
    });
    assert.equal(show({doc: net.hub.doc}), expected, "서버 문서");
};

test("ProseMirror: 같은 자리에서 둘이 동시에 Enter(splitBlock) 를 치고 각자 글자를 치면 새 줄은 하나, 두 글자가 그 줄에", async () => {
    const {net, bindings: [a, b]} = await start(["A", "B"]);

    // "abcd|efgh" — ProseMirror 위치: 문단 시작 1 + 4
    at(a, 5, splitBlock);
    typeAt(a, a.state.selection.head, "A");
    at(b, 5, splitBlock);
    typeAt(b, b.state.selection.head, "B");
    await net.settle();

    const result = show(a.client);

    assert.ok(result === "abcd|ABefgh" || result === "abcd|BAefgh", result);
    same(net, [a, b], result);
});

test("ProseMirror: Enter 의 뜻이 남는다 — A 가 나누는 사이 B 가 뒷부분에 친 글자가 그대로 남는다 (지웠다 다시 넣지 않는다)", async () => {
    const {net, bindings: [a, b]} = await start(["A", "B"]);

    at(a, 5, splitBlock);
    typeAt(b, 7, "X");
    await net.settle();

    same(net, [a, b], "abcd|efXgh");
    // A 의 Enter 는 split 하나로 갔다 — diff 로 옮겼다면 뒷글 지우기+넣기가 된다
    assert.equal(a.stats.steps.split, 1);
    assert.equal(a.stats.steps.diff ?? 0, 0);
});

test("ProseMirror: prosemirror-tables 의 열 넣기(addColumnAfter)는 행마다 칸 넣기로 오고, CRDT 에서는 열 노드 하나", async () => {
    const {net, clients: [ca], bindings: [a, b]} = await start(["A", "B"], "");
    const cell = () => pm.nodes.table_cell.create(null, pm.nodes.paragraph.create());
    const table = pm.nodes.table.create(null, [pm.nodes.table_row.create(null, [cell(), cell()]), pm.nodes.table_row.create(null, [cell(), cell()])]);

    a.dispatch(a.state.tr.replaceWith(0, a.state.doc.content.size, [pm.nodes.paragraph.create(), table, pm.nodes.paragraph.create()]));
    await net.settle();

    const sent: string[] = [];
    const commit = ca.commit.bind(ca);

    ca.commit = (ops, record) => {
        ops.forEach(o => o.t === "node" && sent.push(o.type));
        commit(ops, record);
    };

    // 첫 칸 안에 커서를 두고 열 넣기
    let cellPos = 0;

    a.state.doc.descendants((node, pos) => {
        !cellPos && node.type.spec.tableRole === "cell" && (cellPos = pos);

        return !cellPos;
    });
    at(a, cellPos + 2, addColumnAfter);
    await net.settle();

    assert.deepEqual(
        sent.filter(t => t === "col"),
        ["col"],
    );
    same(net, [a, b], "|[,,;,,]|");
});

test("ProseMirror: 되돌리기는 내 편집만 — A 가 되돌려도 B 가 친 글자는 남는다", async () => {
    const {net, bindings: [a, b]} = await start(["A", "B"]);

    typeAt(a, 3, "1");
    await net.settle();
    typeAt(b, 8, "2");
    await net.settle();
    a.undo();
    await net.settle();

    same(net, [a, b], "abcdef2gh");
});

test("ProseMirror: 서식·링크 mark 가 CRDT 서식으로 가고, 모델에서는 inline-hyperlink 로 묶인다", async () => {
    const {net, bindings: [a, b]} = await start(["A", "B"]);

    a.dispatch(a.state.tr.addMark(1, 4, pm.marks.bold.create()));
    a.dispatch(a.state.tr.addMark(3, 6, pm.marks.link.create({value: "https://example.com"})));
    await net.settle();

    assert.deepEqual(b.client.doc.toJSON().children![0].runs, [
        {text: "ab", marks: {bold: true}},
        {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "c", marks: {bold: true}}, {text: "de", marks: {}}]},
        {text: "fgh", marks: {}},
    ]);
    assert.ok(b.state.doc.eq(a.state.doc));
    same(net, [a, b], "abcdefgh");
});

const SEEDS = Number(process.env.PM_SEEDS ?? 100);

for (const peers of [2, 3]) {
    test(`ProseMirror 무작위 ${SEEDS} 대본 · 참여자 ${peers} — 모든 편집기·CRDT·서버가 같은 문서`, async t => {
        const failures: string[] = [];
        const steps: Record<string, number> = {};
        let pushedBack = 0;

        for (let seed = 1; seed <= SEEDS; seed += 1) {
            try {
                const result = await runPmSeed(seed, peers);

                result.same || failures.push(`씨앗 ${seed}\n${result.detail}`);
                result.bindings.forEach(b => {
                    Object.entries(b.stats.steps).forEach(([k, v]) => (steps[k] = (steps[k] ?? 0) + v));
                    pushedBack += b.stats.pushedBack;
                });
            } catch (error) {
                failures.push(`씨앗 ${seed} 오류: ${(error as Error).stack}`);
            }
        }

        const total = Object.values(steps).reduce((a, b) => a + b, 0);

        t.diagnostic(`Step ${total}개 — ${Object.entries(steps).map(([k, v]) => `${k} ${v}`).join(" · ")} · CRDT 규칙으로 편집기를 맞춘 것 ${pushedBack}번`);
        assert.equal(failures.length, 0, `${failures.length} 개 실패\n${failures.slice(0, 2).join("\n\n")}`);
    });
}
