import assert from "node:assert/strict";
import {test} from "node:test";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {Doc} from "../src/crdt/doc.ts";
import {DocHub} from "../src/server/hub.ts";
import {SyncClient} from "../src/sync/client.ts";
import * as cmd from "../src/crdt/commands.ts";
import type {Op} from "../src/crdt/doc.ts";
import type {ServerEvent, Transport} from "../src/sync/protocol.ts";

Doc.verifyBlocks = true;

test("문자 재전송: 스냅숏에 이미 있는 연산은 토큰과 블록 캐시를 바꾸지 않는다", () => {
    const original = new Doc("A", DEMO_SCHEMA);
    const ops = cmd.insertText(original, {b: 0, o: 0}, "한글😀");

    for (const warm of [false, true]) {
        const doc = Doc.fromSnapshot("B", original.snapshot(), DEMO_SCHEMA);
        const snapshot = doc.snapshot();
        const items = [...doc.items];

        if (warm) doc.toJSON();
        ops.forEach(op => doc.apply(op));
        ops.forEach(op => doc.apply(op));
        assert.deepEqual(doc.snapshot(), snapshot);
        assert.deepEqual(doc.toJSON(), original.toJSON());
        assert.equal(doc.items.length, items.length);
        items.forEach((item, i) => assert.equal(doc.items[i], item));
    }
});

test("문자 재전송: 일부만 중복된 문자열은 새 뒷부분만 넣고 사이에 낀 남의 글을 유지한다", () => {
    const text: Op = {t: "text", id: {lamport: 1, actor: "A"}, origin: {lamport: 0, actor: "~root"}, text: "abcd"};
    const interleaved: Op = {t: "text", id: {lamport: 20, actor: "B"}, origin: {lamport: 1, actor: "A"}, text: "X"};
    const doc = new Doc("C", DEMO_SCHEMA);
    const expected = new Doc("D", DEMO_SCHEMA);

    doc.apply({...text, text: "ab"});
    doc.apply(interleaved);
    doc.toJSON();
    doc.apply(text);
    expected.apply(text);
    expected.apply(interleaved);
    assert.deepEqual(doc.toJSON(), expected.toJSON());
    assert.equal(doc.blocks()[0].kind, "text");
    assert.equal(doc.clock.lamport, expected.clock.lamport);
});

test("문자 재전송: GC로 묶은 토큰의 원래 연산을 다시 받아도 압축과 삭제를 유지한다", () => {
    const doc = new Doc("A", DEMO_SCHEMA);
    const ops = cmd.insertText(doc, {b: 0, o: 0}, "abcdef");

    cmd.deleteRange(doc, {b: 0, o: 0}, {b: 0, o: 6});
    assert.ok(doc.compact(Infinity, () => 0) > 0);
    const snapshot = doc.snapshot();
    const model = doc.toJSON();

    ops.forEach(op => doc.apply(op));
    assert.deepEqual(doc.snapshot(), snapshot);
    assert.deepEqual(doc.toJSON(), model);
});

test("seq0 재연결: 스냅숏에 포함된 pending 입력을 다시 적용하고 확인받아도 오류 없이 수렴한다", async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    let receive: ((event: ServerEvent) => void) | undefined;
    const transport: Transport = {
        subscribe: (_since, handler) => { receive = handler; return () => { receive = undefined; }; },
        send: async message => { if (message.kind === "change") hub.submit(message.change); },
        sendPresence: () => undefined,
    };
    const client = new SyncClient("offline", transport, {schema: DEMO_SCHEMA});
    let notifications = 0;

    client.onModelEvents = () => { notifications += 1; };
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "한글😀"}]).ops);
    const change = client.pending[0];
    const envelope = hub.submit(change)!;

    client.connect();
    try {
        const hello = hub.hello(0);
        receive!(hello);
        assert.equal(client.pending.length, 0, "스냅숏의 수신 확인만으로 pending을 정리한다");
        receive!({type: "change", envelope});
        assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
        assert.equal(client.serverSeq, hub.serverSeq);
        assert.equal(client.pending.length, 0);
        assert.equal(notifications, 0, "중복 입력은 새 모델 변경이 아니다");
        await Promise.resolve();
    } finally {
        client.disconnect();
    }
});

test("스냅숏 수신 확인: 받은 변경만 지우고 아직 안 받은 pending 변경은 다시 얹는다", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    let receive!: (event: ServerEvent) => void;
    const transport: Transport = {
        subscribe: (_since, handler) => { receive = handler; return () => undefined; },
        send: async () => undefined,
        sendPresence: () => undefined,
    };
    const client = new SyncClient("offline", transport, {schema: DEMO_SCHEMA});

    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "A"}]).ops);
    client.commit(client.doc.edit([{op: "insert", at: [0, 1], content: "B"}]).ops);
    hub.submit(client.pending[0]);
    const unsent = client.pending[1];
    const hello = hub.hello(0);

    client.connect();
    try {
        receive(hello);
        assert.deepEqual(client.pending, [unsent]);
        assert.equal((client.doc.toJSON().children![0].runs![0] as {text: string}).text, "AB");
        receive({type: "change", envelope: hub.submit(unsent)!});
        assert.equal(client.pending.length, 0);
        assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
    } finally {
        client.disconnect();
    }
});

test("이전 hello 형식: 수신 번호가 없어도 중복 연산을 허용하고 뒤늦은 내 echo를 확인한다", () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    let receive!: (event: ServerEvent) => void;
    const transport: Transport = {
        subscribe: (_since, handler) => { receive = handler; return () => undefined; },
        send: async () => undefined,
        sendPresence: () => undefined,
    };
    const client = new SyncClient("offline", transport, {schema: DEMO_SCHEMA});

    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "legacy"}]).ops);
    const envelope = hub.submit(client.pending[0])!;
    const hello = hub.hello(0);

    assert.equal(hello.type, "hello");
    if (hello.type !== "hello") throw new Error("hello가 아니다");
    delete hello.clientSeqs;
    client.connect();
    try {
        receive(hello);
        assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
        receive({type: "change", envelope});
        assert.equal(client.pending.length, 0);
    } finally {
        client.disconnect();
    }
});
