import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, MAIN} from "../src/crdt/doc.ts";
import {insertText, setSpan} from "../src/crdt/commands.ts";
import {applyEdits, diffModels} from "../src/crdt/model.ts";
import {keyOf} from "../src/crdt/ticket.ts";
import {SyncClient} from "../src/sync/client.ts";
import {textEventScope} from "../src/sync/model-events.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import type {Op} from "../src/crdt/doc.ts";
import type {ServerEvent} from "../src/sync/protocol.ts";

const setup = (content?: NodeJSON[]) => {
    const seed = new Doc("seed", DEMO_SCHEMA);

    content && seed.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content}]);
    let receive: (event: ServerEvent) => void = () => undefined;
    const client = new SyncClient("receiver", {
        subscribe: (_since, listener) => { receive = listener; return () => undefined; },
        send: async () => undefined,
        sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});

    client.connect();
    receive({type: "hello", serverSeq: 1, snapshot: seed.snapshot(), delSeqs: [], presence: []});
    client.disconnect();

    const sender = Doc.fromSnapshot("sender", seed.snapshot(), DEMO_SCHEMA);
    const read = client.doc.toJSON.bind(client.doc);
    let reads = 0;
    let seq = 1;
    let events: EditOp[] = [];

    client.doc.toJSON = () => { reads += 1; return read(); };
    client.onModelEvents = next => { events = next; };

    const deliver = (ops: Op[], scoped: boolean) => {
        const before = read();
        const reference = Doc.fromSnapshot("reference", client.doc.snapshot(), DEMO_SCHEMA);

        ops.forEach(op => reference.apply(op));

        const after = reference.toJSON();
        const fullEvents = diffModels(DEMO_SCHEMA, before, after);

        assert.deepEqual(applyEdits(DEMO_SCHEMA, before, fullEvents), after);
        reads = 0;
        events = [];
        seq += 1;
        receive({type: "change", envelope: {serverSeq: seq, change: {actor: "sender", seq: seq - 1, ops}}});
        assert.equal(reads, scoped ? 0 : 2, "전체 모델을 읽는 경로가 다르다");
        assert.deepEqual(read(), after);
        assert.deepEqual(applyEdits(DEMO_SCHEMA, before, events), after);
        assert.equal(client.eventStats.fallbacks, 0);

        return events;
    };

    return {client, sender, deliver, reads: () => reads, clearReads: () => { reads = 0; }};
};

const paragraph = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});

test("수신 범위: 큰 문서의 한 문단 삽입·지우기·서식은 전체 모델을 읽지 않고 같은 거울을 만든다", () => {
    const {sender, deliver} = setup(Array.from({length: 100}, (_, i) => paragraph(`${i}:` + "x".repeat(100))));

    for (const edit of [
        {op: "insert", at: [50, 5], content: "한😀글"},
        {op: "delete", at: [50, 3], count: 2},
        {op: "update", at: [50, 0], attrs: {bold: true}, length: 4},
        {op: "update", at: [50, 2], attrs: {link: "https://example.test"}, length: 4},
    ] satisfies EditOp[]) {
        const events = deliver(sender.edit([edit]).ops, true);

        assert.ok(events.length > 0);
        assert.ok(events.every(event => event.at[0] === 50));
    }
});

test("수신 범위: 목록 항목·표 칸·상자 안에서도 원래 모델 경로를 쓴다", () => {
    const cases: Array<{content: NodeJSON[]; path: number[]}> = [
        {content: [paragraph("a"), {type: "list", attrs: {listType: "bullet"}, children: [
            {type: "list-item", runs: [{text: "item", marks: {}}]},
        ]}], path: [1, 0, 2]},
        {content: [paragraph("a"), {type: "table", children: [{type: "table-row", children: [{type: "table-cell",
            children: [{type: "table-cell-body", children: [paragraph("cell")]}]}]}]}], path: [1, 0, 0, 0, 0, 2]},
        {content: [paragraph("a"), {type: "callout", children: [paragraph("body")]}], path: [1, 0, 2]},
    ];

    for (const {content, path} of cases) {
        const {sender, deliver} = setup(content);

        const events = deliver(sender.edit([{op: "insert", at: path, content: "z"}]).ops, true);

        assert.ok(events.every(event => event.at.slice(0, -1).join() === path.slice(0, -1).join()));
    }
});

test("수신 범위: 구조·여러 블록·새 토큰 의존 묶음은 전체 경로를 유지한다", () => {
    const {sender, deliver} = setup([paragraph("abcdef"), paragraph("other")]);

    deliver(sender.edit([{op: "split", at: [0, 3]}]).ops, false);
    deliver(sender.edit([{op: "insert", at: [0, 1], content: "x"}, {op: "insert", at: [2, 1], content: "y"}]).ops, false);
    deliver(sender.edit([{op: "insert", at: [0, 1], content: "x"}, {op: "insert", at: [0, 2], content: "y"}]).ops, false);
    deliver(sender.edit([{op: "update", at: [0], attrs: {type: "quote"}}]).ops, false);
});

test("수신 범위: 중복 삽입·죽은 origin·되살리기는 전체 경로를 유지한다", () => {
    const {sender, deliver} = setup([paragraph("abcd")]);
    const insertion = sender.edit([{op: "insert", at: [0, 2], content: "x"}]).ops;

    deliver(insertion, true);
    deliver(insertion, false);
    const deleted = sender.get(keyOf((insertion[0] as Extract<Op, {t: "text"}>).id))!;
    const deletion = sender.edit([{op: "delete", at: [0, 2], count: 1}]).ops;

    deliver(deletion, true);
    const behind: Op = {t: "text", id: sender.clock.next(), origin: deleted.id, text: "z"};

    sender.apply(behind);
    deliver([behind], false);
    const undo: Op = {t: "undel", at: sender.clock.next(), cancels: [(deletion[0] as Extract<Op, {t: "del"}>).at], ids: [deleted.id]};

    sender.apply(undo);
    deliver([undo], false);
});

test("수신 범위: 동시 Enter 뒤에 늦게 온 글자는 원래 전체 경로로 경계 너머 삽입을 처리한다", () => {
    const {client, sender, deliver} = setup([paragraph("ab")]);
    const old = Doc.fromSnapshot("old", sender.snapshot(), DEMO_SCHEMA);
    const delayed = old.edit([{op: "insert", at: [0, 1], content: "z"}]).ops;

    deliver(sender.edit([{op: "split", at: [0, 1]}]).ops, false);
    assert.ok((delayed[0] as Extract<Op, {t: "text"}>).id.lamport <= client.doc.clock.lamport);
    deliver(delayed, false);
});

test("수신 범위: 표 뒤 빈 가상 블록은 좁히지 않는다", () => {
    const {client, sender, deliver} = setup([paragraph("a"), {type: "table", children: [{type: "table-row", children: [{type: "table-cell"}]}]}]);
    const virtual = sender.blocks().at(-1)!;

    assert.equal(virtual.kind, "text");
    assert.ok(virtual.kind === "text" && virtual.virtual);
    deliver(insertText(sender, {b: sender.blocks().length - 1, o: 0}, "tail"), false);
    const marker = client.doc.blocks(MAIN)[0].marker;
    const structural: Op = {t: "set", at: client.doc.clock.next(), ids: [marker.id], key: "$type", value: "quote"};

    assert.equal(textEventScope(client.doc, [structural]), null);
});

test("수신 범위: 합친 표의 숨은 칸 편집은 전체 경로로 기존 full-grid 이벤트를 유지한다", () => {
    const {client, sender, deliver} = setup([paragraph("a"), {type: "table", children: [{type: "table-row", children: [
        {type: "table-cell"}, {type: "table-cell"},
    ]}]}]);
    const grid = sender.blocks().find(b => b.kind === "grid")!;

    assert.ok(grid.kind === "grid");
    deliver(setSpan(sender, grid, 0, 0, 1, 2), false);
    const line = sender.cellKey(grid.marker, grid.rows[0], grid.cols[1]);

    assert.equal(client.doc.visible(line), false);
    const events = deliver(insertText(sender, {line, b: 0, o: 0}, "hidden"), false);

    assert.ok(events.length > 0);
    const hidden = client.doc.toJSON().children![1].children![0].children![1];

    assert.equal(hidden.attrs!.spanned, true);
    assert.ok(JSON.stringify(hidden).includes("hidden"));
});

test("수신 범위: 같은 경계의 동시 Enter를 흡수한 뒤 최신 글자를 넣어도 문단 수와 경로가 같다", () => {
    const {sender, client, deliver} = setup([paragraph("abcd")]);
    const concurrent = Doc.fromSnapshot("concurrent", sender.snapshot(), DEMO_SCHEMA);
    const second = concurrent.edit([{op: "split", at: [0, 2]}]).ops;

    deliver(sender.edit([{op: "split", at: [0, 2]}]).ops, false);
    second.forEach(op => sender.apply(op));
    deliver(second, false);
    assert.equal(client.doc.toJSON().children!.length, 2);
    deliver(sender.edit([{op: "insert", at: [1, 0], content: "Z"}]).ops, true);
    assert.equal(client.doc.toJSON().children!.length, 2);
});

test("수신 범위: undo와 redo는 기존 전체 비교와 이벤트 계약을 유지한다", () => {
    const {client, reads, clearReads} = setup([paragraph("abcd")]);
    let mirror = client.doc.toJSON();

    client.onModelEvents = events => { mirror = applyEdits(DEMO_SCHEMA, mirror, events); };
    const edits: EditOp[] = [{op: "insert", at: [0, 2], content: "x"}];

    client.commit(client.doc.edit(edits).ops);
    mirror = applyEdits(DEMO_SCHEMA, mirror, edits);
    for (const action of [() => client.undo(), () => client.redo()]) {
        clearReads();
        action();
        assert.equal(reads(), 2);
        assert.deepEqual(client.doc.toJSON(), mirror);
    }
});
