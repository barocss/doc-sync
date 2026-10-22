import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import {compileEdits} from "../src/crdt/edit.ts";
import {applyEdits, diffModels} from "../src/crdt/model.ts";
import {SyncClient} from "../src/sync/client.ts";
import {MemoryNet} from "./harness.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import type {GridBlock} from "../src/crdt/doc.ts";

const start = async () => {
    const net = new MemoryNet();
    const client = net.add("A");

    client.connect();
    await net.settle();

    return {net, client};
};

/** 성능 경로에서도 출력은 기존 전체 문서 검산과 같아야 한다. */
const checkedEdit = (client: SyncClient, edits: EditOp[], scoped = true) => {
    const before = client.doc.toJSON();
    const reference = Doc.fromSnapshot(client.actor, client.doc.snapshot(), client.schema);

    const referenceOps = compileEdits(reference, edits);
    const expected = applyEdits(client.schema, before, edits);
    const normalize = JSON.stringify(expected) === JSON.stringify(reference.toJSON()) ? [] : diffModels(client.schema, expected, reference.toJSON());
    let notified = false;

    client.onLocalEdits = (sent, fixes) => {
        notified = true;
        assert.deepEqual(sent, edits);
        assert.deepEqual(applyEdits(client.schema, expected, fixes), reference.toJSON());
    };

    const read = client.doc.toJSON.bind(client.doc);

    if (scoped) {
        client.doc.toJSON = () => { throw new Error("글 블록 편집이 문서 전체를 읽었다"); };
    }

    let result;

    try {
        result = client.doc.edit(edits, {normalize: true});
    } finally {
        client.doc.toJSON = read;
    }

    assert.ok(notified);
    assert.deepEqual(result.ops, referenceOps);
    assert.deepEqual(client.doc.toJSON(), reference.toJSON());
    assert.deepEqual(applyEdits(client.schema, expected, result.normalize), applyEdits(client.schema, expected, normalize));
    client.commit(result.ops);

    return result;
};

test("로컬 구독: 구독자 없는 편집은 전체 모델을 만들지 않고, 구독 추가·해제도 즉시 반영한다", async () => {
    const {net, client} = await start();
    const read = client.doc.toJSON.bind(client.doc);

    client.doc.toJSON = () => { throw new Error("구독자 없는 편집이 문서 전체를 읽었다"); };
    let result;

    try {
        result = client.doc.edit([{op: "insert", at: [0, 0], content: "abc"}]);
    } finally {
        client.doc.toJSON = read;
    }

    client.commit(result.ops);
    checkedEdit(client, [{op: "insert", at: [0, 1], content: "X"}]);
    client.onLocalEdits = null;
    assert.equal(client.doc.editListener, null);
    await net.settle();
    assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON());
});

test("로컬 검산: 본문·목록·표 칸·상자 안 글자 편집은 해당 블록만 비교하고 전체 검산과 같다", async () => {
    const {net, client} = await start();
    const p = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
    const ops = client.doc.edit([
        {op: "insert", at: [0, 0], content: "abcdef"},
        {op: "insert", at: [1], content: [
            {type: "list", attrs: {listType: "bullet"}, children: [{type: "list-item", runs: [{text: "item", marks: {}}]}]},
            {type: "callout", children: [p("box")]},
            {type: "table", children: [{type: "table-row", children: [{type: "table-cell", children: [{type: "table-cell-body", children: [p("cell")]}]}]}]},
        ]},
    ]).ops;

    client.commit(ops);
    await net.settle();

    for (const path of [[0], [1, 0], [2, 0], [3, 0, 0, 0, 0]]) {
        checkedEdit(client, [
            {op: "insert", at: [...path, 1], content: "XY"},
            {op: "delete", at: [...path, 0], count: 1},
            {op: "update", at: [...path, 0], attrs: {bold: true, link: "https://example.com"}, length: 2},
        ]);
        checkedEdit(client, [{op: "insert", at: [...path, 1], content: [{text: "z", marks: {italic: true}}]}]);
    }

    await net.settle();
    assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON());
});

test("로컬 검산: 구조 변경·여러 블록 편집은 기존 전체 검산과 같다", async () => {
    const {net, client} = await start();

    checkedEdit(client, [{op: "insert", at: [0, 0], content: "abcdef"}]);
    checkedEdit(client, [{op: "split", at: [0, 3]}], false);
    checkedEdit(client, [{op: "insert", at: [0, 0], content: "A"}, {op: "insert", at: [1, 0], content: "B"}], false);
    checkedEdit(client, [{op: "merge", at: [1]}], false);
    checkedEdit(client, [{op: "insert", at: [1], content: [{type: "table", children: [{type: "table-row", children: [{type: "table-cell"}]}]}]}], false);

    const grid = client.doc.blocks().find(b => b.kind === "grid") as GridBlock;
    const after = client.doc.blocks().findIndex(b => b.marker === grid.marker) + 1;
    const virtual = client.doc.blocks()[after];

    assert.ok(virtual.kind === "text" && virtual.virtual);
    // 빈 가상 블록은 모델에서 빠진다. 표 칸의 경로에는 영향을 주지 않아야 한다.
    checkedEdit(client, [{op: "insert", at: [1, 0, 0, 0, 0, 0], content: "cell"}]);
    await net.settle();
    assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON());
});

test("로컬 검산: 보정이 생겨도 목록 안의 원래 경로로 돌려준다", async () => {
    const {net, client} = await start();

    client.commit(client.doc.edit([{op: "insert", at: [1], content: [{
        type: "list", attrs: {listType: "bullet"}, children: [{type: "list-item", runs: [{text: "A😀B", marks: {}}]}],
    }]}]).ops);
    await net.settle();

    // 모델 글자와 저장된 UTF-16 토큰 수가 다른 경우의 기존 보정도 그대로 유지한다.
    const result = checkedEdit(client, [{op: "delete", at: [1, 0, 1], count: 1}]);

    assert.ok(result.normalize.length > 0);
    assert.ok(result.normalize.every(edit => edit.at[0] === 1 && edit.at[1] === 0));
    await net.settle();
    assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON());
});

test("로컬 구독: 스냅숏·reset 뒤에도 현재 구독자를 연결하고 normalize 명시 요청을 지킨다", async () => {
    const {net, client} = await start();
    let notices = 0;

    client.onLocalEdits = () => { notices += 1; };
    client.disconnect();
    client.connect();
    await net.settle();
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "a"}]).ops);
    await net.settle();
    net.hub.reset();
    await net.settle();
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "b"}]).ops);
    await net.settle();
    assert.equal(notices, 2);

    client.onLocalEdits = null;
    const read = client.doc.toJSON.bind(client.doc);
    let reads = 0;

    client.doc.toJSON = () => { reads += 1; return read(); };
    client.doc.edit([{op: "insert", at: [0], content: [{type: "divider"}]}], {normalize: true});
    assert.ok(reads >= 2, "명시한 구조 검산이 생략됐다");
});
