import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc} from "../src/crdt/doc.ts";
import * as cmd from "../src/crdt/commands.ts";
import {applyEdits, diffModels} from "../src/crdt/model.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";
import type {EditOp, NodeJSON} from "../src/crdt/model.ts";
import type {Op} from "../src/crdt/doc.ts";
import type {ServerEvent} from "../src/sync/protocol.ts";

const run = (text: string, marks: Record<string, boolean> = {}) => ({text, marks});
const paragraph = (text: string): NodeJSON => ({type: "paragraph", runs: text ? [run(text)] : []});
const model = (...children: NodeJSON[]): NodeJSON => ({type: "content", children});
const fresh = (doc: Doc) => Doc.fromSnapshot("snapshot-check", doc.snapshot(), DEMO_SCHEMA).toJSON();
const fixture = (children: NodeJSON[]) => {
    const seed = new Doc("seed", DEMO_SCHEMA);
    seed.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: children}]);
    let receive: (event: ServerEvent) => void = () => undefined;
    const client = new SyncClient("receiver", {
        subscribe: (_since, listener) => { receive = listener; return () => undefined; },
        send: async () => undefined, sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});
    client.connect();
    receive({type: "hello", serverSeq: 1, snapshot: seed.snapshot(), delSeqs: [], presence: []});
    client.disconnect();
    const sender = Doc.fromSnapshot("sender", seed.snapshot(), DEMO_SCHEMA);
    const read = client.doc.toJSON.bind(client.doc);
    let reads = 0, seq = 1;
    client.doc.toJSON = () => { reads += 1; return read(); };
    const deliver = (ops: Op[], expected: NodeJSON, scoped = true, probe?: {start(): void; check(): void}) => {
        const before = read(), priorStats = {...client.eventStats};
        const reference = Doc.fromSnapshot("reference", client.doc.snapshot(), DEMO_SCHEMA);
        ops.forEach(op => reference.apply(op));
        assert.deepEqual(reference.toJSON(), expected, "고정 기대 모델: 전체 적용");
        assert.deepEqual(sender.toJSON(), expected, "고정 기대 모델: 송신자");
        const whole = diffModels(DEMO_SCHEMA, before, expected);
        assert.deepEqual(applyEdits(DEMO_SCHEMA, before, whole), expected, "기존 전체 diff");
        const frames: Array<{events: EditOp[]; info: {cause: string; fallback: boolean}}> = [];
        client.onModelEvents = (events, info) => frames.push({events, info});
        reads = 0;
        seq += 1;
        probe?.start();
        receive({type: "change", envelope: {serverSeq: seq, change: {actor: "sender", seq: seq - 1, ops}}});
        probe?.check();
        assert.equal(reads, scoped ? 0 : 2, "전체 모델 읽기 수");
        const changed = JSON.stringify(before) !== JSON.stringify(expected);
        assert.equal(frames.length, changed ? 1 : 0, "Change당 콜백 수");
        const events = frames.flatMap(frame => frame.events);
        for (const frame of frames) assert.deepEqual(frame.info, {cause: "remote", fallback: false});
        assert.deepEqual(applyEdits(DEMO_SCHEMA, before, events), expected, "좁힌 이벤트 거울");
        assert.deepEqual(read(), expected, "실제 수신 모델");
        assert.deepEqual(fresh(client.doc), expected, "새 snapshot 해석");
        assert.deepEqual(client.eventStats, {changes: priorStats.changes + Number(changed),
            events: priorStats.events + events.length, fallbacks: priorStats.fallbacks});
        assert.equal(client.eventStats.fallbacks, 0);
        return events;
    };
    return {sender, client, deliver};
};

for (const count of [2, 8]) for (const kind of ["insert", "delete", "set", "mixed"] as const) {
    test(`여러 블록 수신: ${count}개 독립 문단 ${kind}는 전체 읽기 없이 한 콜백으로 전달한다`, () => {
        const {sender, deliver} = fixture(Array.from({length: count + 1}, () => paragraph("abcdef")));
        const edits: EditOp[] = [];
        for (let b = 0; b < count; b += 1) {
            if (kind === "delete" || kind === "mixed") edits.push({op: "delete", at: [b, 5], count: 1});
            if (kind === "set" || kind === "mixed") edits.push({op: "update", at: [b, 0], length: 1, attrs: {bold: true}});
            if (kind === "insert" || kind === "mixed") edits.push({op: "insert", at: [b, 1], content: "X"});
        }
        const changed: NodeJSON = kind === "set" ? {type: "paragraph", runs: [run("a", {bold: true}), run("bcdef")]} :
            kind === "mixed" ? {type: "paragraph", runs: [run("aX", {bold: true}), run("bcde")]} :
                paragraph(kind === "insert" ? "aXbcdef" : "abcde");
        deliver(sender.edit(edits).ops, model(...Array.from({length: count}, () => changed), paragraph("abcdef")));
    });
}

for (const kind of ["set", "del"] as const) test(`여러 블록 수신: 하나의 ${kind}.ids가 두 문단을 가로지른다`, () => {
    const {sender, deliver} = fixture([paragraph("abc"), paragraph("def")]);
    const ids = [sender.textAt({b: 0, o: 0}).chars[1].id, sender.textAt({b: 1, o: 0}).chars[1].id];
    const op: Op = kind === "set" ? {t: "set", at: sender.clock.next(), ids, key: "italic", value: true} :
        {t: "del", at: sender.clock.next(), ids};
    sender.apply(op);
    deliver([op], kind === "set" ? model({type: "paragraph", runs: [run("a"), run("b", {italic: true}), run("c")]},
        {type: "paragraph", runs: [run("d"), run("e", {italic: true}), run("f")]}) : model(paragraph("ac"), paragraph("df")));
});

test("여러 블록 수신: 반복·겹친 같은 문단 쓰기를 중복 경로 없이 다른 문단과 합친다", () => {
    const {sender, deliver} = fixture([paragraph("abcd"), paragraph("efgh")]);
    const ops = sender.edit([
        {op: "update", at: [0, 0], length: 3, attrs: {bold: true}},
        {op: "update", at: [0, 1], length: 2, attrs: {italic: true}},
        {op: "update", at: [0, 1], length: 2, attrs: {bold: true}},
        {op: "delete", at: [1, 3], count: 1},
    ]).ops;
    const events = deliver(ops, model({type: "paragraph", runs: [run("a", {bold: true}),
        run("bc", {bold: true, italic: true}), run("d")]}, paragraph("efg")));
    assert.equal(events.filter(event => event.op === "update" && event.at[0] === 0 && event.at[1] === 0).length, 1);
});

test("여러 블록 수신: 목록의 두 항목과 상자 안 문단은 원래 중첩 경로를 유지한다", () => {
    const list = (one: string, two: string): NodeJSON => ({type: "list", attrs: {listType: "bullet"}, children: [
        {type: "list-item", attrs: {level: 0}, runs: [run(one)]}, {type: "list-item", attrs: {level: 1}, runs: [run(two)]},
    ]});
    const {sender, deliver} = fixture([paragraph("lead"), list("one", "two"), {type: "callout", attrs: {tone: "info"}, children: [paragraph("body")]}]);
    const ops = sender.edit([{op: "insert", at: [1, 0, 1], content: "X"}, {op: "insert", at: [1, 1, 1], content: "Y"},
        {op: "delete", at: [2, 0, 3], count: 1}]).ops;
    const events = deliver(ops, model(paragraph("lead"), list("oXne", "tYwo"), {type: "callout", attrs: {tone: "info"}, children: [paragraph("bod")]}));
    assert.deepEqual([...new Set(events.map(event => event.at.slice(0, -1).join("/")))].sort(), ["1/0", "1/1", "2/0"]);
});

test("여러 블록 수신: 표의 서로 다른 칸 안 글자를 바꾸고 full-grid 모델을 보존한다", () => {
    const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [paragraph(text)]}]});
    const table = (a: string, b: string): NodeJSON => ({type: "table", attrs: {header: false}, children: [{type: "table-row", children: [cell(a), cell(b)]}]});
    const {sender, deliver} = fixture([paragraph("lead"), table("left", "right")]);
    deliver(sender.edit([{op: "insert", at: [1, 0, 0, 0, 0, 1], content: "X"},
        {op: "delete", at: [1, 0, 1, 0, 0, 4], count: 1}]).ops, model(paragraph("lead"), table("lXeft", "righ")));
});

test("여러 블록 수신: 기존 inline과 링크·Unicode가 있는 문단의 글자만 좁힌다", () => {
    const image: NonNullable<NodeJSON["runs"]>[number] = {type: "inline-image", attrs: {src: "https://example.test/x.png", width: 160, height: 90}};
    const linked: NonNullable<NodeJSON["runs"]>[number] = {type: "inline-hyperlink", attrs: {url: "https://example.test"}, runs: [run("link")]};
    const {sender, deliver} = fixture([{type: "paragraph", runs: [run("가😀"), image, run("나")]}, {type: "paragraph", runs: [linked, run("끝")]}]);
    deliver(sender.edit([{op: "insert", at: [0, 0], content: "한"}, {op: "insert", at: [1, 5], content: "글"}]).ops,
        model({type: "paragraph", runs: [run("한가😀"), image, run("나")]}, {type: "paragraph", runs: [linked, run("끝글")]}));
});

for (const partial of [false, true]) test(`여러 블록 수신: ${partial ? "일부" : "전체"} LWW no-op은 값과 쓰기 소유권을 유지한다`, () => {
    const {sender, client, deliver} = fixture([paragraph("ab"), paragraph("cd")]);
    const ids = [sender.textAt({b: 0, o: 0}).chars[0].id, sender.textAt({b: 1, o: 0}).chars[0].id];
    const winner: Op = {t: "set", at: sender.clock.next(), ids: partial ? [ids[0]] : ids, key: "bold", value: false};
    sender.apply(winner);
    const marked = (text: string): NodeJSON => ({type: "paragraph", runs: [run(text[0], {bold: true}), run(text[1])]});
    deliver([winner], model(paragraph("ab"), paragraph("cd")));
    const older: Op = {t: "set", at: {...winner.at, actor: "aaa"}, ids, key: "bold", value: true};
    sender.apply(older);
    deliver([older], model(paragraph("ab"), partial ? marked("cd") : paragraph("cd")));
    assert.deepEqual(client.doc.setTicket(ids[0], "bold"), winner.at);
    assert.deepEqual(client.doc.setTicket(ids[1], "bold"), partial ? older.at : winner.at);
});

test("여러 블록 수신: 마지막 연산이 구조를 바꾸면 앞의 안전한 글자도 전체 경로로 처리한다", () => {
    const {sender, deliver} = fixture([paragraph("abc"), paragraph("def")]);
    deliver(sender.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "insert", at: [1, 1], content: "Y"},
        {op: "split", at: [1, 3]}]).ops, model(paragraph("aXbc"), paragraph("dYe"), paragraph("f")), false);
});

test("여러 블록 수신: 빈 문단의 살아 있는 표지를 origin으로 쓸 수 있다", () => {
    const {sender, deliver} = fixture([paragraph(""), paragraph("other")]);
    deliver(sender.edit([{op: "insert", at: [0, 0], content: "X"}, {op: "insert", at: [1, 1], content: "Y"}]).ops,
        model(paragraph("X"), paragraph("oYther")));
});

for (const dependency of ["old-clock", "new-token"] as const) test(`여러 블록 수신: ${dependency} 하나가 있으면 전체 경로를 유지한다`, () => {
    const {sender, deliver} = fixture([paragraph("abc"), paragraph("def")]);
    if (dependency === "new-token") {
        deliver(sender.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "insert", at: [1, 1], content: "Y"},
            {op: "insert", at: [0, 2], content: "Z"}]).ops, model(paragraph("aXZbc"), paragraph("dYef")), false);
    } else {
        const old = Doc.fromSnapshot("old", sender.snapshot(), DEMO_SCHEMA);
        const delayed = old.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "insert", at: [1, 1], content: "Y"}]).ops;
        deliver(sender.edit([{op: "update", at: [0, 0], length: 1, attrs: {bold: true}}]).ops,
            model({type: "paragraph", runs: [run("a", {bold: true}), run("bc")]}, paragraph("def")));
        delayed.forEach(op => sender.apply(op));
        deliver(delayed, model({type: "paragraph", runs: [run("a", {bold: true}), run("Xbc")]}, paragraph("dYef")), false);
    }
});

for (const order of [["A", "B"], ["B", "A"]]) test("여러 블록 수신: 실제 서버 수락 " + order.join("") + "에서 다른 사용자의 같은 값 쓰기와 undo/redo를 보존한다", async () => {
    const net = new MemoryNet();
    const a = net.add("A"), b = net.add("B"), observer = net.add("observer");
    const peers = {A: a, B: b};
    try {
        net.clients.forEach(c => c.connect());
        await net.settle();
        a.commit(a.doc.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: [paragraph("ab"), paragraph("cd")]}]).ops);
        await net.settle();
        net.clients.forEach(c => c.clearHistory());
        const ids = [a.doc.textAt({b: 0, o: 0}).chars[0].id, a.doc.textAt({b: 1, o: 0}).chars[0].id];
        const writes = Object.fromEntries(Object.entries(peers).map(([actor, c]) => [actor, c.doc.edit([
            {op: "update", at: [0, 0], length: 1, attrs: {bold: true}},
            {op: "update", at: [1, 0], length: 1, attrs: {bold: true}},
        ]).ops]));
        let mirror = observer.doc.toJSON();
        let callbacks = 0;
        observer.onModelEvents = (events, info) => {
            callbacks += 1;
            assert.deepEqual(info, {cause: "remote", fallback: false});
            mirror = applyEdits(DEMO_SCHEMA, mirror, events);
        };
        const since = net.hub.serverSeq;
        order.forEach(actor => peers[actor as "A" | "B"].commit(writes[actor]));
        await net.settle();
        assert.deepEqual(net.hub.log.slice(since).flatMap(e => e.change ? [e.change.actor] : []), order);
        const expected = model({type: "paragraph", runs: [run("a", {bold: true}), run("b")]},
            {type: "paragraph", runs: [run("c", {bold: true}), run("d")]});
        assert.equal(callbacks, 1, "같은 값의 두 번째 쓰기는 모델 콜백을 만들지 않는다");
        const check = () => {
            for (const doc of [net.hub.doc, ...net.clients.map(c => c.doc)]) {
                assert.deepEqual(doc.toJSON(), expected);
                assert.deepEqual(fresh(doc), expected);
                ids.forEach((id, index) => assert.deepEqual(doc.setTicket(id, "bold"), (writes.B[index] as Extract<Op, {t: "set"}>).at));
            }
            assert.deepEqual(mirror, expected);
            net.clients.forEach(c => { assert.equal(c.pending.length, 0); assert.equal(c.eventStats.fallbacks, 0); });
        };
        check();
        a.undo(); await net.settle(); check();
        a.redo(); await net.settle(); check();
        assert.equal(callbacks, 1);
    } finally { net.clients.forEach(c => c.disconnect()); }
});

for (const barrier of ["empty-target", "inline-target"] as const) test(`여러 블록 수신: 마지막 ${barrier}도 안전한 두 블록을 전체 경로로 돌린다`, () => {
    const image = {type: "inline-image", attrs: {src: "https://example.test/x.png", width: 160, height: 90}};
    const {sender, deliver} = fixture([{type: "paragraph", runs: [run("a"), image, run("b")]}, paragraph("cd")]);
    const ops = sender.edit([{op: "insert", at: [0, 0], content: "X"}, {op: "insert", at: [1, 0], content: "Y"}]).ops;
    const inline = sender.textAt({b: 0, o: 0}).chars.find(item => item.kind === "node")!;
    const op: Op = {t: "set", at: sender.clock.next(), ids: barrier === "empty-target" ? [] : [inline.id],
        key: barrier === "empty-target" ? "bold" : "width", value: barrier === "empty-target" ? true : 320};
    sender.apply(op);
    deliver([...ops, op], model({type: "paragraph", runs: [run("Xa"),
        {...image, attrs: {...image.attrs, width: barrier === "inline-target" ? 320 : 160}}, run("b")]}, paragraph("Ycd")), false);
});

test("여러 블록 수신: 마지막 숨은 표 칸 변경은 보이는 문단도 전체 경로로 돌린다", () => {
    const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [paragraph(text)]}]});
    const {sender, client, deliver} = fixture([paragraph("lead"), {type: "table", attrs: {header: false},
        children: [{type: "table-row", children: [cell("left"), cell("hidden")]}]}]);
    const grid = sender.blocks().find(block => block.kind === "grid")!;
    assert.equal(grid.kind, "grid");
    if (grid.kind !== "grid") throw new Error("표 필요");
    const merge = cmd.setSpan(sender, grid, 0, 0, 1, 2);
    const merged = model(paragraph("lead"), {type: "table", attrs: {header: false}, children: [{type: "table-row", children: [
        {...cell("left"), attrs: {colspan: 2, rowspan: 1}}, {...cell("hidden"), attrs: {spanned: true}},
    ]}]});
    deliver(merge, merged, false);
    const line = sender.cellKey(grid.marker, grid.rows[0], grid.cols[1]);
    assert.equal(client.doc.visible(line), false);
    const ops = [...sender.edit([{op: "insert", at: [0, 1], content: "X"}]).ops,
        ...cmd.insertText(sender, {line, b: 0, o: 0}, "Y")];
    deliver(ops, model(paragraph("lXead"), {type: "table", attrs: {header: false}, children: [{type: "table-row", children: [
        {...cell("left"), attrs: {colspan: 2, rowspan: 1}}, {...cell("Yhidden"), attrs: {spanned: true}},
    ]}]}), false);
});

test("여러 블록 수신: 마지막 가상 블록 변경은 보이는 문단도 전체 경로로 돌린다", () => {
    const {sender, deliver} = fixture([paragraph("lead"), {type: "table", children: [{type: "table-row", children: [{type: "table-cell"}]}]}]);
    const virtual = sender.blocks().at(-1)!;
    assert.ok(virtual.kind === "text" && virtual.virtual);
    const ops = [...sender.edit([{op: "insert", at: [0, 1], content: "X"}]).ops,
        ...cmd.insertText(sender, {b: sender.blocks().length - 1, o: 0}, "tail")];
    deliver(ops, model(paragraph("lXead"), {type: "table", attrs: {header: false}, children: [{type: "table-row", children: [
        {type: "table-cell", children: [{type: "table-cell-body", children: [paragraph("")]}]},
    ]}]}, paragraph("tail")), false);
});

test("여러 블록 수신: 32개 문단 전체 서식은 전체 경로로 돌리고 반복 소속 검색은 제한한다", t => {
    const count = 32, width = 160;
    const {sender, client, deliver} = fixture(Array.from({length: count}, () => paragraph("x".repeat(width))));
    let includesCalls = 0;
    for (const block of client.doc.blocks()) {
        if (block.kind !== "text") continue;
        const chars = block.chars;
        const includes = chars.includes;
        Object.defineProperty(chars, "includes", {configurable: true, value: function (...args: Parameters<typeof includes>) {
            includesCalls += 1;
            return includes.apply(chars, args);
        }});
    }
    const ids = sender.blocks().flatMap(block => block.kind === "text" ? block.chars.map(item => item.id) : []);
    assert.equal(ids.length, count * width);
    const op: Op = {t: "set", at: sender.clock.next(), ids, key: "bold", value: true};
    sender.apply(op);
    const expected = model(...Array.from({length: count}, () => ({type: "paragraph", runs: [run("x".repeat(width), {bold: true})]})));
    deliver([op], expected, false, {
        start: () => { includesCalls = 0; },
        check: () => assert.ok(includesCalls <= 2 * ids.length,
            `블록 소속 검색 ${includesCalls}회가 대상 ${ids.length}개의 두 배를 넘었다`),
    });
    t.diagnostic(`수신 구간 소속 검색 ${includesCalls}회, 대상 ${ids.length}개, 상한 ${2 * ids.length}회`);
});

test("여러 블록 수신: 두 블록을 찾은 뒤 흡수된 alias 표지 origin도 전체 경로로 처리한다", () => {
    const {sender, client, deliver} = fixture([paragraph("abcd"), paragraph("other")]);
    const concurrent = Doc.fromSnapshot("concurrent", sender.snapshot(), DEMO_SCHEMA);
    const second = concurrent.edit([{op: "split", at: [0, 2]}]).ops;
    deliver(sender.edit([{op: "split", at: [0, 2]}]).ops, model(paragraph("ab"), paragraph("cd"), paragraph("other")), false);
    second.forEach(op => sender.apply(op));
    deliver(second, model(paragraph("ab"), paragraph("cd"), paragraph("other")), false);
    const block = client.doc.blocks().find(block => block.kind === "text" && block.aliases.length > 0)!;
    assert.ok(block.kind === "text" && block.aliases.length > 0);
    if (block.kind !== "text") throw new Error("흡수된 표지 필요");
    const ops = sender.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "insert", at: [2, 1], content: "Y"}]).ops;
    const aliasText: Op = {t: "text", id: sender.clock.next(), origin: block.aliases[0].id, text: "Z"};
    sender.apply(aliasText);
    deliver([...ops, aliasText], model(paragraph("aXb"), paragraph("Zcd"), paragraph("oYther")), false);
});


test("여러 블록 수신: 아홉 번째 독립 문단은 앞의 여덟 문단도 전체 경로로 돌린다", () => {
    const {sender, deliver} = fixture(Array.from({length: 9}, () => paragraph("abc")));
    const ops = sender.edit(Array.from({length: 9}, (_, b) => ({op: "insert" as const, at: [b, 1], content: "X"}))).ops;
    deliver(ops, model(...Array.from({length: 9}, () => paragraph("aXbc"))), false);
});
