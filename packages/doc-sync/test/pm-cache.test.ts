import assert from "node:assert/strict";
import {test} from "node:test";
import {Node as PmNode} from "prosemirror-model";
import {TextSelection} from "prosemirror-state";
import {DecorationSet} from "prosemirror-view";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import * as cmd from "../src/crdt/commands.ts";
import {Doc} from "../src/crdt/doc.ts";
import {canonical} from "../src/crdt/model.ts";
import {PmBinding} from "../src/pm/binding.ts";
import {fromPmJSON, toPmJSON} from "../src/pm/convert.ts";
import {SyncClient} from "../src/sync/client.ts";
import {INFO} from "./pm-fuzz.ts";
import type {ServerEvent} from "../src/sync/protocol.ts";

const snapshotDoc = (text: string): Doc => {
    const seed = new Doc("seed", DEMO_SCHEMA);
    cmd.insertText(seed, {b: 0, o: 0}, text);
    return Doc.fromSnapshot("A", seed.snapshot(), DEMO_SCHEMA);
};

const setup = (text = "abcdefgh") => {
    let receive!: (event: ServerEvent) => void;
    const client = new SyncClient("A", {
        subscribe: (_since, listener) => { receive = listener; return () => undefined; },
        send: async () => undefined,
        sendPresence: () => undefined,
    }, {schema: DEMO_SCHEMA});
    client.doc = snapshotDoc(text);
    const read = client.doc.toJSON.bind(client.doc);
    let reads = 0;
    client.doc.toJSON = () => { reads += 1; return read(); };
    const binding = new PmBinding(client, INFO);
    return {client, binding, receive: (event: ServerEvent) => receive(event), reads: () => reads};
};

const sameModel = (binding: PmBinding): void => {
    const model = binding.client.doc.toJSON();
    const expected = PmNode.fromJSON(INFO.pm, toPmJSON(DEMO_SCHEMA, model));
    assert.ok(binding.state.doc.eq(expected));
    assert.deepEqual(canonical(DEMO_SCHEMA, fromPmJSON(INFO, DEMO_SCHEMA, binding.state.doc.toJSON(), model)), model);
};

const decorations = (binding: PmBinding) => binding.state.plugins.flatMap(plugin => {
    const result = plugin.props.decorations?.call(plugin, binding.state);
    return result instanceof DecorationSet ? result.find() : [];
});

test("PM 재사용: selection·presence 갱신은 모델 읽기와 PM 변환을 반복하지 않는다", () => {
    const original = PmNode.fromJSON;
    let conversions = 0;
    PmNode.fromJSON = (...args: Parameters<typeof PmNode.fromJSON>) => {
        conversions += 1;
        return original(...args);
    };
    try {
        const {client, binding, reads} = setup();
        client.connect();
        let selections = 0;
        let changes = 0;
        binding.onSelection = () => { selections += 1; };
        binding.onChange = () => { changes += 1; };
        const initialReads = reads();
        const initialConversions = conversions;
        const initialDoc = binding.state.doc;

        for (let i = 0; i < 4; i += 1) {
            binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, 3, 7)));
            client.others.set("B", {actor: "B", name: `Peer ${i}`, color: "#2563eb",
                anchor: client.doc.anchorOf({b: 0, o: 6}), focus: client.doc.anchorOf({b: 0, o: 2})});
            const shown = decorations(binding);
            assert.deepEqual(shown.filter(d => d.spec.kind === "selection").map(d => [d.from, d.to]), [[3, 7]]);
            assert.deepEqual(shown.filter(d => d.spec.kind === "caret").map(d => d.from), [7]);
            binding.pull();
            assert.equal(binding.state.selection.anchor, 3);
            assert.equal(binding.state.selection.head, 7);
        }
        assert.equal(reads(), initialReads);
        assert.equal(conversions, initialConversions);
        assert.equal(binding.state.doc, initialDoc);
        assert.equal(selections, 8, "selection callbacks remain active");
        assert.equal(changes, 8, "change callbacks remain active");
        client.disconnect();
    } finally {
        PmNode.fromJSON = original;
    }
});

test("PM 재사용: apply·서식·GC 뒤 갱신하고 모델과 선택을 유지한다", () => {
    const {client, binding, reads} = setup();
    binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, 4, 6)));
    const beforeReads = reads();
    cmd.insertText(client.doc, {b: 0, o: 0}, "XY");
    binding.pull();
    assert.equal(reads(), beforeReads + 1);
    assert.equal(binding.state.doc.textContent, "XYabcdefgh");
    assert.equal(binding.state.selection.anchor, 6);
    assert.equal(binding.state.selection.head, 8);
    sameModel(binding);

    cmd.setMark(client.doc, {b: 0, o: 2}, {b: 0, o: 5}, "bold", true);
    binding.pull();
    assert.ok(binding.state.doc.rangeHasMark(3, 6, INFO.pm.marks.bold));
    sameModel(binding);
    cmd.deleteRange(client.doc, {b: 0, o: 0}, {b: 0, o: 2});
    binding.pull();
    const beforeGc = binding.state.doc;
    const beforeGcReads = reads();
    client.doc.compact(Infinity, () => 0);
    binding.pull();
    assert.equal(reads(), beforeGcReads + 1);
    assert.equal(binding.state.doc, beforeGc, "GC does not change visible PM content");
    sameModel(binding);
});

test("PM 재사용: 같은 version의 Doc 교체와 동적 IME 문서 교체를 구분한다", () => {
    const {client} = setup("real");
    let current = client.doc;
    const facade = Object.create(client) as SyncClient;
    Object.defineProperty(facade, "doc", {get: () => current});
    const binding = new PmBinding(facade, INFO);
    const original = current;
    assert.equal(original.version, 0);
    current = snapshotDoc("draft");
    assert.equal(current.version, original.version);
    binding.pull();
    assert.equal(binding.state.doc.textContent, "draft");
    sameModel(binding);
    current = original;
    binding.pull();
    assert.equal(binding.state.doc.textContent, "real");
    sameModel(binding);
});

test("PM 재사용: snapshot과 reset은 version 0이어도 새 내용을 반영한다", () => {
    const {client, binding, receive} = setup("before");
    client.connect();
    try {
        assert.equal(client.doc.version, 0);
        receive({type: "hello", epoch: "fixture", protocol: 2, capabilities: ["placement-v1", "fields-v1", "annotations-v1", "cardinality-v1"], serverSeq: 0, snapshot: snapshotDoc("snapshot").snapshot(), delSeqs: [], presence: []});
        assert.equal(client.doc.version, 0);
        assert.equal(binding.state.doc.textContent, "snapshot");
        sameModel(binding);
        receive({type: "reset"});
        assert.equal(client.doc.version, 0);
        assert.equal(binding.state.doc.textContent, "");
        sameModel(binding);
    } finally {
        client.disconnect();
    }
});

test("PM 재사용: 한 transaction의 여러 Step과 동기 콜백 재진입도 새 version을 읽는다", () => {
    const {client, binding} = setup("abcd");
    let reentered = 0;
    client.onUpdate = () => { binding.pull(); reentered += 1; };
    binding.dispatch(binding.state.tr.insertText("X", 2).insertText("Y", 5).addMark(1, 3, INFO.pm.marks.bold.create()));
    assert.equal(binding.state.doc.textContent, "aXbcYd");
    assert.equal(reentered, 1);
    sameModel(binding);
    const snapshot = client.doc.toJSON();
    const external = client.doc.toJSON();
    external.children![0].runs = [];
    binding.pull();
    assert.equal(binding.state.doc.textContent, "aXbcYd");
    assert.deepEqual(client.doc.toJSON(), snapshot);
});

test("PM 재사용: 표 속성 diff가 숨은 칸 참조와 이전 모델을 변이하지 않는다", () => {
    const {client, binding} = setup("base");
    cmd.insertBlock(client.doc, {b: 0, o: 4}, "table", {rows: 1, cols: 2});
    const grid = client.doc.blocks().find(block => block.kind === "grid")!;
    assert.equal(grid.kind, "grid");
    if (grid.kind !== "grid") throw new Error("missing grid");
    const left = client.doc.cellKey(grid.marker, grid.rows[0], grid.cols[0]);
    const right = client.doc.cellKey(grid.marker, grid.rows[0], grid.cols[1]);
    cmd.insertText(client.doc, {line: left, b: 0, o: 0}, "left");
    cmd.insertText(client.doc, {line: right, b: 0, o: 0}, "hidden");
    cmd.setSpan(client.doc, grid, 0, 0, 1, 2);
    binding.pull();
    const previous = client.doc.toJSON();
    const serialized = JSON.stringify(previous);
    let tablePosition = -1;
    binding.state.doc.descendants((node, pos) => {
        if (node.type.name === "table") tablePosition = pos;
    });
    assert.ok(tablePosition >= 0);
    const table = binding.state.doc.nodeAt(tablePosition)!;
    binding.dispatch(binding.state.tr.setNodeMarkup(tablePosition, undefined, {...table.attrs, header: true}));
    assert.equal(JSON.stringify(previous), serialized);
    assert.ok(JSON.stringify(client.doc.toJSON()).includes("hidden"));
    assert.equal(client.doc.blocks().find(block => block.kind === "grid")!.attrs.header, true);
    sameModel(binding);
});
