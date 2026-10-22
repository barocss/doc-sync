import assert from "node:assert/strict";
import {test} from "node:test";
import * as cmd from "../src/crdt/commands.ts";
import {anchorAt, pathAt, pathOfPos, posOfPath} from "../src/crdt/edit.ts";
import {applyEdits} from "../src/crdt/model.ts";
import {MemoryNet, show} from "./harness.ts";
import {visibleLines} from "./fuzz-core.ts";
import type {GridBlock, NodeJSON, Doc} from "../src/crdt/doc.ts";
import type {EditOp} from "../src/crdt/model.ts";
import type {SyncClient} from "../src/sync/client.ts";

/**
 * 편집 API — 모델 연산 다섯 가지(insert · delete · update · split · merge)와 받는 쪽 이벤트.
 * 연산은 모델 경로로 말한다 (에디터의 트리 경로, 숫자 배열과 같은 꼴). 스키마 기반 문서 에디터가 실제로 보내는 연산 묶음 모양을 그대로 넣어 본다.
 */

const start = async (names: string[], text = "abcdefgh") => {
    const net = new MemoryNet();
    const clients = names.map(name => net.add(name));

    clients.forEach(c => c.connect());
    await net.settle();
    text && clients[0].commit(cmd.insertText(clients[0].doc, {b: 0, o: 0}, text));
    await net.settle();

    return {net, clients};
};

const same = (net: MemoryNet, expected: string) => {
    net.clients.forEach(c => assert.equal(show(c), expected, `${c.actor} 의 문서`));
    assert.equal(show({doc: net.hub.doc}), expected, "서버 문서");
};

/** 편집 연산을 보내고, 편집기가 그대로 적용했을 때와 CRDT 모델이 같은지(normalize 가 비었는지)도 돌려준다 */
const edit = (c: SyncClient, edits: EditOp[]) => {
    const before = c.doc.toJSON();
    const {ops, normalize} = c.doc.edit(edits, {normalize: true});

    c.commit(ops);

    // 편집기 쪽: 연산 + normalize 를 적용하면 언제나 CRDT 모델과 같다
    assert.deepEqual(applyEdits(c.schema, applyEdits(c.schema, before, edits), normalize), c.doc.toJSON());

    return {ops, normalize};
};

const p = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});

const emptyCell = {type: "table-cell", children: [{type: "table-cell-body", children: [{type: "paragraph", runs: []}]}]};

// ── 경로 ─────────────────────────────────────────────────────────────────

test("경로: 모든 글자 자리가 모델 경로로 갔다가 같은 자리로 돌아온다 (표 칸·목록·이미지 그릇 안 포함)", async () => {
    const {clients: [a]} = await start(["A"]);
    const doc = a.doc;

    a.commit(cmd.insertBlock(doc, {b: 0, o: 4}, "table", {rows: 2, cols: 2}));
    a.commit(cmd.setBlockType(doc, 2, "list-item", undefined, {listType: "numbered"}));
    a.commit(cmd.insertBlock(doc, {b: 2, o: 2}, "image-component"));
    a.commit(cmd.insertText(doc, {line: doc.cellKey((doc.blocks()[1] as GridBlock).marker, (doc.blocks()[1] as GridBlock).rows[1], (doc.blocks()[1] as GridBlock).cols[0]), b: 0, o: 0}, "칸"));

    let count = 0;

    for (const line of visibleLines(doc)) {
        doc.blocks(line).forEach((block, b) => {
            if (block.kind !== "text") {
                return;
            }

            for (let o = 0; o <= block.chars.length; o += 1) {
                const pos = line === "0@~root" ? {b, o} : {line, b, o};
                const path = pathOfPos(doc, pos);

                if (path) {
                    assert.deepEqual(posOfPath(doc, path), pos, JSON.stringify(path));
                    count += 1;
                }
            }
        });
    }

    assert.ok(count >= 15, `${count} 자리`);
});

// ── 에디터 연산 묶음 모양 ───────────────────────────────────────────────────

test("문서 내용 통째로 바꾸기 꼴: delete [0] 1 → insert [0] [문단 둘] — 문서가 그 둘로 바뀌고 normalize 는 없다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);
    const {normalize} = edit(a, [
        {op: "delete", at: [0], count: 1},
        {op: "insert", at: [0], content: [p("after"), p("more")]},
    ]);

    await net.settle();
    assert.deepEqual(normalize, []);
    same(net, "after|more");
});

test("에디터의 표 넣기 꼴: delete [0] 1 → insert [0] [표] → insert [1] [문단] — 흐름은 글 블록으로 시작하므로 맨 앞 빈 문단이 남는다", async () => {
    const {net, clients: [a]} = await start(["A", "B"], "");
    const table: NodeJSON = {type: "table", children: [{type: "table-row", children: [emptyCell, emptyCell]}]};
    const {normalize} = edit(a, [
        {op: "delete", at: [0], count: 1},
        {op: "insert", at: [0], content: [table]},
        {op: "insert", at: [1], content: [p("")]},
    ]);

    await net.settle();
    // 편집기 모델(같은 정리 규칙)과는 같다. 에디터 자체는 표로 시작할 수 있어, 에디터 어댑터가 맨 앞 빈 문단을 맞춰야 한다
    assert.deepEqual(normalize, []);
    same(net, "|[,]|");
});

test("에디터의 표 넣기 꼴(내용 포함): 칸 글·칸 합치기·배경색까지 한 번에 들어간다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);
    const cell = (text: string, attrs?: Record<string, unknown>) => ({
        type: "table-cell",
        ...(attrs ? {attrs} : {}),
        children: [{type: "table-cell-body", children: [p(text)]}],
    });

    edit(a, [
        {
            op: "insert",
            at: [1],
            content: [
                {
                    type: "table",
                    children: [
                        {type: "table-row", children: [cell("넓은 칸", {colspan: 2, backgroundColor: "#dcfce7"}), cell("", {spanned: true})]},
                        {type: "table-row", children: [cell("왼"), cell("오")]},
                    ],
                },
            ],
        },
    ]);
    await net.settle();

    same(net, "abcdefgh|[넓은 칸{1x2},·;왼,오]");
    assert.equal(a.doc.toJSON().children![1].children![0].children![0].attrs?.backgroundColor, "#dcfce7");
});

test("열 넣기: 스키마 기반 문서 에디터처럼 행마다 같은 번호로 칸을 넣으면 열 노드 하나로 접힌다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 3, cols: 2}));
    await net.settle();

    const {ops, normalize} = edit(a, [0, 1, 2].map(r => ({op: "insert" as const, at: [1, r, 1], content: [emptyCell]})));

    await net.settle();
    assert.equal(ops.filter(o => o.t === "node" && o.type === "col").length, 1, "열 노드 하나");
    assert.deepEqual(normalize, []);
    same(net, "abcd|[,,;,,;,,]|efgh");
});

test("열 넣기: 한 행에만 칸을 넣어도 열 하나로 바로잡는다 — 편집기 쪽은 normalize 로 맞춘다", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 2, cols: 2}));
    a.commit(cmd.insertText(a.doc, cellPos(a.doc, 1, 1, 1), "s"));
    await net.settle();

    // 0 행 1 번 자리에만 칸 하나 — 편집기라면 들쭉날쭉한 표
    const {normalize} = edit(a, [{op: "insert", at: [1, 0, 1], content: [cellOf("새")]}]);

    await net.settle();
    assert.ok(normalize.length > 0, "편집기에 알릴 차이가 있다");
    same(net, "abcd|[,새,;,,s]|efgh");
});

test("열 지우기: 행마다 같은 번호의 칸 지우기는 열 지우기 하나", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 2, cols: 3}));
    await net.settle();

    const {ops} = edit(a, [0, 1].map(r => ({op: "delete" as const, at: [1, r, 1], count: 1})));

    await net.settle();
    assert.equal(ops.length, 1);
    assert.equal(ops[0].t, "del");
    same(net, "abcd|[,;,]|efgh");
});

test("update: 블록 종류·목록 묶음 속성·칸 합치기를 모델 경로로", async () => {
    const {net, clients: [a]} = await start(["A", "B"], "ab");

    edit(a, [{op: "split", at: [0, 1]}]);
    edit(a, [{op: "update", at: [0], attrs: {type: "list-item", listType: "numbered"}}]);
    edit(a, [{op: "update", at: [1], attrs: {type: "list-item", listType: "numbered"}}]);
    await net.settle();
    same(net, "1.a|1.b");

    // 목록 노드의 속성을 바꾸면 그 항목 모두가 바뀐다
    edit(a, [{op: "update", at: [0], attrs: {listType: "bullet"}}]);
    await net.settle();
    same(net, "•a|•b");
});

test("merge: 앞 글 블록에 합친다 — 앞이 그림 블록이면 합치지 않는다", async () => {
    const {net, clients: [a]} = await start(["A", "B"], "ab");

    edit(a, [{op: "split", at: [0, 1]}, {op: "merge", at: [1]}]);
    await net.settle();
    same(net, "ab");

    // 이미지 그릇 [1] 안: [image, caption > caption-paragraph] — 캡션을 그림에 합치려 해도 그대로
    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 2}, "image-component"));

    const body = (a.doc.blocks()[1] as {body: string}).body;

    a.commit(cmd.appendBlock(a.doc, body, "caption-paragraph"));
    a.commit(cmd.insertText(a.doc, {line: body, b: 1, o: 0}, "cap"));

    const before = JSON.stringify(a.doc.toJSON());

    edit(a, [{op: "merge", at: [1, 1, 0]}]);
    assert.equal(JSON.stringify(a.doc.toJSON()), before);
});

// ── 링크 ─────────────────────────────────────────────────────────────────

test("링크: 글자마다의 값 서식으로 저장하고, 모델에서는 inline-hyperlink 하나로 묶어 보인다. 링크 끝에서 이어 치면 링크가 아니다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setLink(a.doc, {b: 0, o: 2}, {b: 0, o: 5}, "https://example.com"));
    a.commit(cmd.setMark(a.doc, {b: 0, o: 3}, {b: 0, o: 4}, "bold", true));
    await net.settle();
    b.commit(cmd.insertText(b.doc, {b: 0, o: 5}, "!"));
    await net.settle();

    const runs = a.doc.toJSON().children![0].runs;

    assert.deepEqual(runs, [
        {text: "ab", marks: {}},
        {
            type: "inline-hyperlink",
            attrs: {url: "https://example.com"},
            runs: [
                {text: "c", marks: {}},
                {text: "d", marks: {bold: true}},
                {text: "e", marks: {}},
            ],
        },
        {text: "!fgh", marks: {}},
    ]);
    assert.deepEqual(b.doc.toJSON(), a.doc.toJSON());
});

test("링크: 같은 글자에 동시에 다른 주소를 걸면 나중 쪽으로 모이고, 주소 꼴이 틀리면 서버가 거절한다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.setLink(a.doc, {b: 0, o: 0}, {b: 0, o: 4}, "https://a.example"));
    b.commit(cmd.setLink(b.doc, {b: 0, o: 0}, {b: 0, o: 4}, "https://b.example"));
    await net.settle();

    assert.deepEqual(b.doc.toJSON(), a.doc.toJSON());
    assert.throws(
        () =>
            net.hub.submit({
                actor: "Z",
                seq: 1,
                ops: [{t: "set", at: {lamport: 999, actor: "Z"}, ids: [a.doc.leftOf({b: 0, o: 1}).id], key: "link", value: "javascript:alert(1)"}],
            }),
        /서식/,
    );
});

// ── 받는 쪽 이벤트 ───────────────────────────────────────────────────────

test("받는 쪽 이벤트: B 의 편집기 거울은 A 의 편집(글·Enter·목록·표·칸 합치기·되돌리기)을 이벤트로만 받아도 늘 같다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);
    let mirror = b.doc.toJSON();
    const seen: string[] = [];

    b.onModelEvents = (events, info) => {
        assert.equal(info.fallback, false);
        mirror = applyEdits(b.schema, mirror, events);
        seen.push(...events.map(e => e.op));
    };

    a.commit(cmd.insertText(a.doc, {b: 0, o: 4}, "XY"), {caretBefore: "", caretAfter: ""});
    await net.settle();
    assert.deepEqual(mirror, b.doc.toJSON());

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 2}));
    a.commit(cmd.setBlockType(a.doc, 1, "list-item", undefined, {listType: "bullet"}));
    a.commit(cmd.insertBlock(a.doc, {b: 1, o: 3}, "table", {rows: 2, cols: 2}));
    await net.settle();
    assert.deepEqual(mirror, b.doc.toJSON());

    const grid = a.doc.blocks().find(x => x.kind === "grid") as GridBlock;

    a.commit(cmd.setSpan(a.doc, grid, 0, 0, 2, 2));
    a.commit(cmd.insertAxis(a.doc, a.doc.blocks().find(x => x.kind === "grid") as GridBlock, "cols", 2));
    a.undo();
    await net.settle();
    assert.deepEqual(mirror, b.doc.toJSON());

    // 글자 하나는 글자 하나로 온다 (문서 통째가 아니라)
    assert.equal(seen[0], "insert");
    assert.equal(b.eventStats.fallbacks, 0);
});

// ── 선택 ─────────────────────────────────────────────────────────────────

test("선택: 시작·끝을 토큰에 붙여 두면, 남이 앞에 글을 넣고 블록을 나눠도 같은 글자를 감싼다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);
    // A 가 "cdef" 를 선택 — 모델 경로 [0, 2] ~ [0, 6]
    const startKey = anchorAt(a.doc, [0, 2])!;
    const endKey = anchorAt(a.doc, [0, 6])!;

    b.commit(cmd.insertText(b.doc, {b: 0, o: 0}, "123"));
    b.commit(cmd.splitBlock(b.doc, {b: 0, o: 2}));
    await net.settle();
    same(net, "12|3abcdefgh");

    const startPath = pathAt(a.doc, startKey)!;
    const endPath = pathAt(a.doc, endKey)!;

    assert.deepEqual(startPath, [1, 3]);
    assert.deepEqual(endPath, [1, 7]);

    const text = (a.doc.toJSON().children![1].runs![0] as {text: string}).text;

    assert.equal(text.slice(startPath[1], endPath[1]), "cdef");
});

// ── 도우미 ───────────────────────────────────────────────────────────────

function cellOf(text: string): NodeJSON {
    return {type: "table-cell", children: [{type: "table-cell-body", children: [p(text)]}]};
}

function cellPos(doc: Doc, b: number, r: number, c: number) {
    const grid = doc.blocks()[b] as GridBlock;

    return {line: doc.cellKey(grid.marker, grid.rows[r], grid.cols[c]), b: 0, o: 0};
}
