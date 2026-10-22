import * as cmd from "../src/crdt/commands.ts";
import assert from "node:assert/strict";
import {test} from "node:test";
import {MemoryNet, show} from "./harness.ts";
import type {GridBlock, Doc} from "../src/crdt/doc.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {SyncClient} from "../src/sync/client.ts";

/**
 * 표와 스키마 주입.
 * 표는 행 줄 × 열 줄이고, 칸은 (행, 열) 교차마다 하나씩 있는 흐름 줄이다. 칸을 행·열의 "번호"가 아니라 "이름표"로
 * 가리키므로, 동시에 행과 열을 더하거나 지워도 칸이 엇갈리지 않는다.
 * 표기: `[a,b;c,d]` = 2×2 표 (행은 `;`, 칸은 `,`, 칸 안 블록은 `/`).
 */

const start = async (names: string[], text = "abcdefgh", options: ConstructorParameters<typeof MemoryNet>[0] = {}) => {
    const net = new MemoryNet(options);
    const clients = names.map(name => net.add(name));

    clients.forEach(c => c.connect());
    await net.settle();
    clients[0].commit(cmd.insertText(clients[0].doc, {b: 0, o: 0}, text));
    await net.settle();

    return {net, clients};
};

const same = (net: MemoryNet, expected: string) => {
    net.clients.forEach(c => assert.equal(show(c), expected, `${c.actor} 의 문서`));
    assert.equal(show({doc: net.hub.doc}), expected, "서버 문서");
};

const gridAt = (doc: Doc, b: number): GridBlock => doc.blocks()[b] as GridBlock;

/** 본문 b 번 블록인 표의 (r, c) 칸 맨 앞 */
const cell = (doc: Doc, b: number, r: number, c: number, o = 0) => {
    const grid = gridAt(doc, b);

    return {line: doc.cellKey(grid.marker, grid.rows[r], grid.cols[c]), b: 0, o};
};

/** "abcd|efgh" 가운데 2×2 표를 넣고 칸마다 글자를 채운 문서 */
const withTable = async (names: string[]) => {
    const ctx = await start(names);
    const [a] = ctx.clients;

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 2, cols: 2}));
    ["p", "q", "r", "s"].forEach((ch, i) => a.commit(cmd.insertText(a.doc, cell(a.doc, 1, Math.floor(i / 2), i % 2), ch)));
    await ctx.net.settle();
    same(ctx.net, "abcd|[p,q;r,s]|efgh");

    return ctx;
};

test("표 넣기: 커서 자리에서 블록을 나누고 그 사이에 고른 크기의 빈 표가 들어간다 (크기는 스키마가 아니라 넣는 쪽이 정한다)", async () => {
    const {net, clients: [a]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 2, cols: 3}));
    await net.settle();

    same(net, "abcd|[,,;,,]|efgh");
});

test("표: 한 사람은 행을, 한 사람은 열을 동시에 더하면 새 칸까지 모두 생긴다 (3×3, 엇갈림 없음)", async () => {
    const {net, clients: [a, b, c]} = await withTable(["A", "B", "C"]);

    a.commit(cmd.insertAxis(a.doc, gridAt(a.doc, 1), "rows", 2));
    b.commit(cmd.insertAxis(b.doc, gridAt(b.doc, 1), "cols", 1));
    await net.settle();
    same(net, "abcd|[p,,q;r,,s;,,]|efgh");

    // 두 사람이 서로 모르고 만든 행과 열이 만나는 칸에도 바로 쓸 수 있다
    c.commit(cmd.insertText(c.doc, cell(c.doc, 1, 2, 1), "X"));
    await net.settle();
    same(net, "abcd|[p,,q;r,,s;,X,]|efgh");
});

test("표: 열을 지우는 사이 남이 그 열의 칸에 쓰면 열은 사라지고, 열 지우기를 되돌리면 그 글까지 돌아온다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.deleteAxis(a.doc, gridAt(a.doc, 1), "cols", 1), {caretBefore: "", caretAfter: ""});
    b.commit(cmd.insertText(b.doc, cell(b.doc, 1, 0, 1, 1), "!"));
    await net.settle();
    same(net, "abcd|[p;r]|efgh");

    a.undo();
    await net.settle();
    same(net, "abcd|[p,q!;r,s]|efgh");
});

test("표: 표를 지우는 사이 남이 칸에 쓰면 표는 사라지고, 되돌리면 그 글까지 돌아온다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.deleteBlock(a.doc, 1), {caretBefore: "", caretAfter: ""});
    b.commit(cmd.insertText(b.doc, cell(b.doc, 1, 1, 0, 1), "?"));
    await net.settle();
    same(net, "abcd|efgh");

    a.undo();
    await net.settle();
    same(net, "abcd|[p,q;r?,s]|efgh");
});

test("표: 두 사람이 남은 두 행을 하나씩 동시에 지우면 표가 통째로 사라진다 — 모두 같은 문서", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.deleteAxis(a.doc, gridAt(a.doc, 1), "rows", 0));
    b.commit(cmd.deleteAxis(b.doc, gridAt(b.doc, 1), "rows", 1));
    await net.settle();

    same(net, "abcd|efgh");
});

test("표: 칸 안에서도 같은 자리 동시 Enter 는 새 줄 하나", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.insertText(a.doc, cell(a.doc, 1, 0, 0, 1), "x"));
    await net.settle();
    a.commit(cmd.splitBlock(a.doc, cell(a.doc, 1, 0, 0, 1)));
    b.commit(cmd.splitBlock(b.doc, cell(b.doc, 1, 0, 0, 1)));
    await net.settle();

    same(net, "abcd|[p/x,q;r,s]|efgh");
});

test("표: 같은 자리에 동시에 넣은 표 둘은 둘 다 남고, 모두 같은 순서", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 1, cols: 1}));
    a.commit(cmd.insertText(a.doc, cell(a.doc, 1, 0, 0), "A"));
    b.commit(cmd.insertBlock(b.doc, {b: 0, o: 4}, "table", {rows: 1, cols: 2}));
    b.commit(cmd.insertText(b.doc, cell(b.doc, 1, 0, 0), "B"));
    await net.settle();

    const result = show(a);

    assert.match(result, /^abcd\|\[(A|B,)\]\|.*\|efgh$/);
    assert.ok(result.includes("[A]") && result.includes("[B,]"), result);
    same(net, result);
});

test("표: 내가 있던 열을 남이 지우면 커서는 옆 칸으로 나온다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);
    const caret = b.doc.anchorOf(cell(b.doc, 1, 1, 1, 1));

    a.commit(cmd.deleteAxis(a.doc, gridAt(a.doc, 1), "cols", 1));
    await net.settle();

    assert.deepEqual(b.doc.posAfter(caret), cell(b.doc, 1, 1, 0));
});

test("구분선: 블록 맨 앞 Backspace 는 앞의 구분선을 지운다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 8}, "divider"));
    await net.settle();
    same(net, "abcdefgh|---|");

    b.commit(cmd.backspace(b.doc, {b: 2, o: 0}).ops);
    await net.settle();
    same(net, "abcdefgh|");
});

test("빈 자리: 표·구분선 뒤의 표지가 없어지면 그 뒤에 빈 자리가 생겨 커서를 둘 곳이 남고, 종류를 바꾸면 표지가 새로 생긴다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 8}, "divider"));
    await net.settle();

    // 구분선 뒤 표지만 지우는 연산 (편집기는 이렇게 보내지 않지만, 동시편집에서는 이런 모양이 생길 수 있다)
    const marker = a.doc.blocks()[2].marker;
    const del = {t: "del" as const, at: a.doc.clock.next(), ids: [marker.id]};

    a.doc.apply(del);
    a.commit([del]);
    await net.settle();
    assert.equal(a.doc.blocks().length, 3);
    const after = a.doc.blocks()[2];

    assert.ok(after.kind === "text" && after.virtual);

    b.commit(cmd.insertText(b.doc, {b: 2, o: 0}, "T"));
    await net.settle();
    same(net, "abcdefgh|---|T");

    a.commit(cmd.setBlockType(a.doc, 2, "heading1"));
    await net.settle();
    same(net, "abcdefgh|---|#T");
});

// ── 스키마 ─────────────────────────────────────────────────────────────

test("스키마 검사: 칸 안에는 표를 넣지 못한다 — 편집 함수는 연산을 만들지 않고, 서버는 손으로 만든 연산을 거절한다", async () => {
    const {net, clients: [a]} = await withTable(["A"]);
    const inCell = cell(a.doc, 1, 0, 0);

    assert.deepEqual(cmd.insertBlock(a.doc, inCell, "table"), []);

    const left = a.doc.leftOf(inCell);

    assert.throws(
        () => net.hub.submit({actor: "Z", seq: 1, ops: [{t: "node", id: {lamport: 999, actor: "Z"}, origin: left.id, type: "table"}]}),
        /여기에는 "table" 를 넣을 수 없다/,
    );
    assert.throws(
        () =>
            net.hub.submit({
                actor: "Z",
                seq: 1,
                ops: [{t: "set", at: {lamport: 999, actor: "Z"}, ids: [left.id], key: "$type", value: "heading1"}],
            }),
        /종류를 "heading1" 로 바꿀 수 없다/,
    );
});

/** 할 일 목록 편집기의 스키마 — CRDT 코드는 하나도 바꾸지 않는다 */
const TODO_SCHEMA: Schema = {
    root: "list",
    marks: ["bold"],
    nodes: {
        list: {shape: "flow", children: ["title", "todo"], default: "title"},
        title: {shape: "text", next: "todo"},
        todo: {shape: "text", attrs: {done: {default: false, values: [true, false]}, due: {default: ""}}},
    },
};

test("스키마 주입: 할 일 목록 스키마를 넣으면 같은 CRDT 가 그 문서를 다룬다 (속성 동시 변경은 나중 쪽)", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"], "장보기", {clientSchema: TODO_SCHEMA});

    a.commit(cmd.splitBlock(a.doc, {b: 0, o: 3}));
    a.commit(cmd.insertText(a.doc, {b: 1, o: 0}, "우유"));
    await net.settle();
    assert.equal(a.doc.blocks()[1].type, "todo", "제목 끝 Enter 는 스키마의 next 로");

    a.commit(cmd.setAttr(a.doc, 1, "done", true));
    b.commit(cmd.setAttr(b.doc, 1, "due", "금요일"));
    await net.settle();

    for (const doc of [a.doc, b.doc, net.hub.doc]) {
        assert.deepEqual(doc.toJSON(), {
            type: "list",
            children: [
                {type: "title", runs: [{text: "장보기", marks: {}}]},
                {type: "todo", attrs: {done: true, due: "금요일"}, runs: [{text: "우유", marks: {}}]},
            ],
        });
    }

    // 이 스키마에는 표가 없다
    assert.deepEqual(cmd.insertBlock(a.doc, {b: 1, o: 0}, "table"), []);
});

test("스키마 없는 서버: 순서 매기기·적용·GC 만 하는 서버로도 참여자들은 같은 문서로 모이고, 늦게 온 참여자도 같은 것을 받는다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"], "abcdefgh", {schema: null});

    assert.equal(net.hub.doc.schema, null);
    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 4}, "table", {rows: 1, cols: 2}));
    b.commit(cmd.splitBlock(b.doc, {b: 0, o: 2}));
    await net.settle();
    a.commit(cmd.insertText(a.doc, cell(a.doc, 2, 0, 1), "Y"));
    b.commit(cmd.deleteAxis(b.doc, gridAt(b.doc, 2), "cols", 0));
    await net.settle();

    const late = net.add("L") as SyncClient;

    late.connect();
    await net.settle();

    assert.equal(show(a), "ab|cd|[Y]|efgh");
    assert.equal(show(b), show(a));
    assert.equal(show(late), show(a));
    assert.throws(() => net.hub.doc.toJSON(), /스키마 없이/);
});

test("GC: 지운 열을 압축한 뒤에도 늦게 온 참여자가 같은 표를 받고 이어서 편집한다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.deleteAxis(a.doc, gridAt(a.doc, 1), "cols", 0), null);
    a.commit(cmd.insertText(a.doc, cell(a.doc, 1, 0, 0, 1), "z"), null);
    await net.settle();
    assert.ok(net.hub.gc(), "GC 가 일어나야 한다");
    await net.settle();
    assert.ok(net.hub.doc.lines().some(l => l.items.some(i => i.compact && i.kind === "node")), "지운 열이 압축됐다");

    const late = net.add("L");

    late.connect();
    await net.settle();
    late.commit(cmd.insertAxis(late.doc, gridAt(late.doc, 1), "cols", 0));
    b.commit(cmd.insertText(b.doc, cell(b.doc, 1, 1, 0, 1), "w"));
    await net.settle();

    same(net, "abcd|[,qz;,sw]|efgh");
});

// ── 이미지 ─────────────────────────────────────────────────────────────

test("이미지: image-component > image > inline-image 로 들어가고, 그림 크기를 동시에 바꾸면 나중 쪽으로 모인다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);
    const ops = cmd.insertBlock(a.doc, {b: 0, o: 4}, "image-component");
    const box = a.doc.blocks()[1];

    assert.equal(box.kind, "flow");
    ops.push(...cmd.insertInline(a.doc, {line: (box as {body: string}).body, b: 0, o: 0}, "inline-image", {src: "cat.png"}));
    a.commit(ops);
    await net.settle();
    same(net, "abcd|{🖼}|efgh");

    const imageOf = (doc: Doc) => {
        const block = doc.blocks()[1] as {body: string};

        return (doc.blocks(block.body)[0] as {chars: Array<ReturnType<Doc["leftOf"]>>}).chars[0];
    };

    a.commit(cmd.setItemAttr(a.doc, imageOf(a.doc), "width", 320));
    b.commit(cmd.setItemAttr(b.doc, imageOf(b.doc), "width", 240));
    await net.settle();

    const model = a.doc.toJSON().children![1];
    const run = model.children![0].runs![0] as {type: string; attrs: {src: string; width: number; height: number}};

    assert.equal(model.type, "image-component");
    assert.equal(model.children![0].type, "image");
    assert.equal(run.type, "inline-image");
    assert.equal(run.attrs.src, "cat.png");
    assert.ok([240, 320].includes(run.attrs.width), "둘 중 나중 이름표의 값");
    assert.deepEqual(b.doc.toJSON(), a.doc.toJSON());
    assert.deepEqual(net.hub.doc.toJSON(), a.doc.toJSON());
});

test("이미지: image 블록은 글자를 받지 않는다 (편집 함수가 막는다). 서버 검사는 줄 단위라, 글자를 받는 블록이 하나도 없는 줄(표의 행 줄)에 넣은 글자를 거절한다", async () => {
    const {net, clients: [a]} = await withTable(["A"]);

    a.commit(cmd.insertBlock(a.doc, {b: 0, o: 0}, "image-component"));
    await net.settle();

    const body = (a.doc.blocks()[1] as {body: string}).body;

    assert.deepEqual(cmd.insertText(a.doc, {line: body, b: 0, o: 0}, "x"), []);
    assert.deepEqual(cmd.splitBlock(a.doc, {line: body, b: 0, o: 0}), []);

    const grid = gridAt(a.doc, 3);

    assert.throws(
        () => net.hub.submit({actor: "Z", seq: 1, ops: [{t: "text", id: {lamport: 999, actor: "Z"}, origin: grid.rows[0].id, text: "x"}]}),
        /행·열 줄에는 글자를 넣을 수 없다/,
    );
});

test("글 안 그림: 문단에 넣은 inline-image 는 글자 한 자리를 차지하고, 서식은 그림을 건너뛴다", async () => {
    const {net, clients: [a, b]} = await start(["A", "B"]);

    a.commit(cmd.insertInline(a.doc, {b: 0, o: 2}, "inline-image", {src: "dot.png", width: 16, height: 16}));
    b.commit(cmd.insertText(b.doc, {b: 0, o: 4}, "!"));
    await net.settle();
    same(net, "ab🖼cd!efgh");

    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 5}, "bold", true));
    await net.settle();

    assert.deepEqual(a.doc.toJSON().children![0].runs, [
        {text: "ab", marks: {bold: true}},
        {type: "inline-image", attrs: {src: "dot.png", width: 16, height: 16}},
        {text: "cd", marks: {bold: true}},
        {text: "!efgh", marks: {}},
    ]);
});

test("표 모델: table > table-row > table-cell > table-cell-body > 블록, 칸 안에 목록·이미지도 들어간다", async () => {
    const {net, clients: [a]} = await withTable(["A"]);
    const inCell = cell(a.doc, 1, 0, 0, 1);

    a.commit(cmd.setBlockType(a.doc, 0, "list-item", inCell.line, {listType: "numbered"}));
    a.commit(cmd.insertBlock(a.doc, cell(a.doc, 1, 1, 1, 1), "image-component"));
    await net.settle();

    const table = a.doc.toJSON().children![1];
    const firstCell = table.children![0].children![0];

    assert.equal(table.type, "table");
    assert.equal(table.children![0].type, "table-row");
    assert.equal(firstCell.type, "table-cell");
    assert.equal(firstCell.children![0].type, "table-cell-body");
    assert.deepEqual(firstCell.children![0].children, [
        {type: "list", attrs: {listType: "numbered"}, children: [{type: "list-item", attrs: {level: 0}, runs: [{text: "p", marks: {}}]}]},
    ]);
    assert.deepEqual(
        table.children![1].children![1].children![0].children!.map(n => n.type),
        ["paragraph", "image-component", "paragraph"],
    );
});


// ── 캡션 ───────────────────────────────────────────────────────────────

/** "abcd|efgh" 가운데 그림 + 빈 캡션을 넣은 문서 */
const withImage = async (names: string[]) => {
    const ctx = await start(names);
    const [a] = ctx.clients;
    const ops = cmd.insertBlock(a.doc, {b: 0, o: 4}, "image-component");
    const body = (a.doc.blocks()[1] as {body: string}).body;

    ops.push(...cmd.insertInline(a.doc, {line: body, b: 0, o: 0}, "inline-image", {src: "cat.png"}));
    ops.push(...cmd.appendBlock(a.doc, body, "caption-paragraph"));
    a.commit(ops);
    await ctx.net.settle();

    return {...ctx, body: (doc: Doc) => (doc.blocks()[1] as {body: string}).body};
};

test("캡션: image-component > [image > inline-image, caption > caption-paragraph] 로 보이고, 두 사람이 동시에 캡션을 써도 모인다", async () => {
    const {net, clients: [a, b], body} = await withImage(["A", "B"]);

    a.commit(cmd.insertText(a.doc, {line: body(a.doc), b: 1, o: 0}, "고양이"));
    b.commit(cmd.insertText(b.doc, {line: body(b.doc), b: 1, o: 0}, "사진: "));
    await net.settle();

    const model = a.doc.toJSON().children![1];

    assert.equal(model.type, "image-component");
    assert.deepEqual(
        model.children!.map(n => n.type),
        ["image", "caption"],
    );
    assert.equal(model.children![0].runs![0] && "type" in model.children![0].runs![0] ? model.children![0].runs![0].type : "", "inline-image");
    assert.equal(model.children![1].children![0].type, "caption-paragraph");

    const caption = (model.children![1].children![0].runs![0] as {text: string}).text;

    assert.ok(caption === "고양이사진: " || caption === "사진: 고양이", caption);
    assert.deepEqual(b.doc.toJSON(), a.doc.toJSON());
    assert.deepEqual(net.hub.doc.toJSON(), a.doc.toJSON());
});

test("캡션: 맨 앞 Backspace·그림부터 캡션까지 지우기·그림 끝 Delete 로도 캡션이 그림 블록에 합쳐지지 않는다", async () => {
    const {net, clients: [a], body} = await withImage(["A"]);

    a.commit(cmd.insertText(a.doc, {line: body(a.doc), b: 1, o: 0}, "cap"));
    a.commit(cmd.backspace(a.doc, {line: body(a.doc), b: 1, o: 0}).ops);
    a.commit(cmd.deleteForward(a.doc, {line: body(a.doc), b: 0, o: 1}));
    await net.settle();
    assert.equal(show(a), "abcd|{🖼|cap}|efgh");

    // 그림 끝에서 캡션 둘째 글자까지 지우면 글만 지워지고 캡션 블록은 남는다
    a.commit(cmd.deleteRange(a.doc, {line: body(a.doc), b: 0, o: 1}, {line: body(a.doc), b: 1, o: 2}));
    await net.settle();
    assert.equal(show(a), "abcd|{🖼|p}|efgh");
    assert.equal(a.doc.toJSON().children![1].children![1].type, "caption");
});

test("캡션: 캡션 끝 Enter 는 캡션 줄을 하나 더 만들고, 둘 다 caption 하나에 묶인다", async () => {
    const {net, clients: [a], body} = await withImage(["A"]);

    a.commit(cmd.insertText(a.doc, {line: body(a.doc), b: 1, o: 0}, "한 줄"));
    a.commit(cmd.splitBlock(a.doc, {line: body(a.doc), b: 1, o: 3}));
    a.commit(cmd.insertText(a.doc, {line: body(a.doc), b: 2, o: 0}, "두 줄"));
    await net.settle();

    const caption = a.doc.toJSON().children![1].children![1];

    assert.equal(caption.type, "caption");
    assert.deepEqual(
        caption.children!.map(n => [n.type, (n.runs![0] as {text: string}).text]),
        [
            ["caption-paragraph", "한 줄"],
            ["caption-paragraph", "두 줄"],
        ],
    );
});

// ── 칸 합치기 (colspan · rowspan) ─────────────────────────────────────────
//
// 합치기는 표 노드의 속성 `$span:왼쪽위행,왼쪽위열` = {끝 행, 끝 열} (이름표). 모델은 스키마 기반 문서 에디터처럼 full grid 로 낸다 —
// 왼쪽 위 칸에 colspan·rowspan, 가려진 칸에 spanned. 표기: `p{1x2}` = 1행 2열을 합친 칸, `·` = 가려진 칸.

test("칸 합치기: 왼쪽 위 칸에 colspan·rowspan, 가려진 칸에 spanned — 모델은 모든 행에 모든 칸이 있다", async () => {
    const {net, clients: [a]} = await withTable(["A", "B"]);

    a.commit(cmd.setSpan(a.doc, gridAt(a.doc, 1), 0, 0, 1, 2));
    await net.settle();
    same(net, "abcd|[p{1x2},·;r,s]|efgh");

    const row = a.doc.toJSON().children![1].children![0];

    assert.deepEqual(row.children!.map(c => c.attrs), [{colspan: 2, rowspan: 1}, {spanned: true}]);
});

test("칸 합치기: 합치는 사이 남이 그 사이에 열을 넣으면 새 열도 덮인다 (끝을 이름표로 적으므로)", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.setSpan(a.doc, gridAt(a.doc, 1), 0, 0, 1, 2));
    b.commit(cmd.insertAxis(b.doc, gridAt(b.doc, 1), "cols", 1));
    await net.settle();

    same(net, "abcd|[p{1x3},·,·;r,,s]|efgh");
});

test("칸 합치기: 끝 열을 지우면 줄어들고, 왼쪽 위 칸의 열을 지우면 합치기가 없어져 가렸던 칸이 다시 보인다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.insertAxis(a.doc, gridAt(a.doc, 1), "cols", 2));
    await net.settle();
    a.commit(cmd.setSpan(a.doc, gridAt(a.doc, 1), 0, 0, 2, 3));
    await net.settle();
    same(net, "abcd|[p{2x3},·,·;·,·,·]|efgh");

    b.commit(cmd.deleteAxis(b.doc, gridAt(b.doc, 1), "cols", 2));
    await net.settle();
    same(net, "abcd|[p{2x2},·;·,·]|efgh");

    b.commit(cmd.deleteAxis(b.doc, gridAt(b.doc, 1), "cols", 0));
    await net.settle();
    same(net, "abcd|[q;s]|efgh");
});

test("칸 합치기: 겹치는 두 합치기를 동시에 하면 나중 것 하나만 남는다 — 모두 같은 문서", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.setSpan(a.doc, gridAt(a.doc, 1), 0, 0, 1, 2));
    b.commit(cmd.setSpan(b.doc, gridAt(b.doc, 1), 0, 1, 2, 1));
    await net.settle();

    const result = show(a);

    assert.ok(result === "abcd|[p{1x2},·;r,s]|efgh" || result === "abcd|[p,q{2x1};r,·]|efgh", result);
    same(net, result);
});

test("칸 합치기: 덮인 칸의 글은 지워지지 않고 가려질 뿐이라, 나누면 다시 보인다. 덮인 칸에 있던 커서는 왼쪽 위 칸으로", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);
    const caret = b.doc.anchorOf(cell(b.doc, 1, 1, 1, 1));

    a.commit(cmd.setSpan(a.doc, gridAt(a.doc, 1), 0, 0, 2, 2));
    b.commit(cmd.insertText(b.doc, cell(b.doc, 1, 1, 1, 1), "!"));
    await net.settle();
    same(net, "abcd|[p{2x2},·;·,·]|efgh");
    assert.deepEqual(b.doc.posAfter(caret), cell(b.doc, 1, 0, 0));

    a.commit(cmd.setSpan(a.doc, gridAt(a.doc, 1), 0, 0, 1, 1));
    await net.settle();
    same(net, "abcd|[p,q;r,s!]|efgh");
});

test("칸 합치기 검사: 다른 표의 행을 가리키는 합치기는 서버가 거절한다", async () => {
    const {net, clients: [a]} = await withTable(["A"]);

    a.commit(cmd.insertBlock(a.doc, {b: 2, o: 0}, "table", {rows: 1, cols: 1}));
    await net.settle();

    const first = gridAt(a.doc, 1);
    const other = gridAt(a.doc, 3);

    assert.throws(
        () =>
            net.hub.submit({
                actor: "Z",
                seq: 1,
                ops: [{t: "set", at: {lamport: 999, actor: "Z"}, ids: [first.marker.id], key: `$span:${other.rows[0].key},${first.cols[0].key}`, value: null}],
            }),
        /칸 합치기가 이 표의 행·열을 가리키지 않는다/,
    );
});

// ── 칸 배경색 ───────────────────────────────────────────────────────────
//
// 칸에는 토큰이 없어서 칸 속성은 표 노드에 `$cell:행,열|이름` 으로 적는다 (LWW). 모델에서는 table-cell 의 attrs 로 나온다.

const bgOf = (doc: Doc, r: number, c: number): unknown => doc.toJSON().children![1].children![r].children![c].attrs?.backgroundColor;

test("칸 배경색: table-cell 의 backgroundColor 로 나오고, 같은 칸을 동시에 칠하면 나중 쪽으로 모인다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.setCellAttr(a.doc, gridAt(a.doc, 1), 0, 1, "backgroundColor", "#fef3c7"));
    b.commit(cmd.setCellAttr(b.doc, gridAt(b.doc, 1), 0, 1, "backgroundColor", "#dbeafe"));
    await net.settle();

    const color = bgOf(a.doc, 0, 1);

    assert.ok(color === "#fef3c7" || color === "#dbeafe", String(color));
    assert.equal(bgOf(b.doc, 0, 1), color);
    assert.equal(bgOf(net.hub.doc, 0, 1), color);
    assert.equal(bgOf(a.doc, 0, 0), undefined, "다른 칸은 그대로");
});

test("칸 배경색: 색은 행·열 이름표에 붙어 있어 앞에 행·열을 넣어도 같은 칸에 남고, 열을 지웠다 되돌리면 색도 돌아온다", async () => {
    const {net, clients: [a, b]} = await withTable(["A", "B"]);

    a.commit(cmd.setCellAttr(a.doc, gridAt(a.doc, 1), 1, 1, "backgroundColor", "#dcfce7"));
    b.commit(cmd.insertAxis(b.doc, gridAt(b.doc, 1), "rows", 0));
    b.commit(cmd.insertAxis(b.doc, gridAt(b.doc, 1), "cols", 0));
    await net.settle();
    assert.equal(bgOf(a.doc, 2, 2), "#dcfce7", "'s' 칸이 (2,2) 로 밀려도 색은 그 칸에");

    a.commit(cmd.deleteAxis(a.doc, gridAt(a.doc, 1), "cols", 2), {caretBefore: "", caretAfter: ""});
    await net.settle();
    assert.equal(show(a), "abcd|[,;,p;,r]|efgh");
    a.undo();
    await net.settle();
    assert.equal(bgOf(b.doc, 2, 2), "#dcfce7");
});

test("칸 배경색 검사: 색 꼴이 틀리거나 계산되는 속성(colspan)을 직접 쓰면 편집 함수는 만들지 않고 서버는 거절한다", async () => {
    const {net, clients: [a]} = await withTable(["A"]);
    const grid = gridAt(a.doc, 1);

    assert.deepEqual(cmd.setCellAttr(a.doc, grid, 0, 0, "backgroundColor", "red"), []);
    assert.deepEqual(cmd.setCellAttr(a.doc, grid, 0, 0, "colspan", 2), []);

    const op = (key: string, value: unknown) => ({
        actor: "Z",
        seq: 1,
        ops: [{t: "set" as const, at: {lamport: 999, actor: "Z"}, ids: [grid.marker.id], key, value}],
    });

    assert.throws(() => net.hub.submit(op(`$cell:${grid.rows[0].key},${grid.cols[0].key}|backgroundColor`, "red")), /칸 속성/);
    assert.throws(() => net.hub.submit(op(`$cell:${grid.rows[0].key},${grid.cols[0].key}|colspan`, 2)), /칸 속성/);
});
