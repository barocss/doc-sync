import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, MAIN, commands, schemaVersion} from "../src/index.ts";
import {applyEdits, diffModels} from "../src/crdt/model.ts";
import {textEventScopes} from "../src/sync/model-events.ts";
import {blockPath, posOfPath} from "../src/crdt/edit.ts";
import {SyncClient, DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "../src/sync/index.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";
import type {Schema, NodeJSON, EditOp, Op} from "../src/index.ts";
import type {ServerEvent} from "../src/sync/index.ts";

const schema: Schema = {root: "content", marks: ["bold", "italic"], nodes: {
    content: {shape: "flow", children: ["paragraph", "box", "rule", "caption", "list"], default: "paragraph"},
    paragraph: {shape: "text"}, caption: {shape: "text"}, rule: {shape: "atom"},
    box: {shape: "flow", children: ["paragraph", "caption", "box"], default: "paragraph"},
    list: {shape: "group", children: ["item"], by: []}, item: {shape: "text"},
}};
const p = (text: string, type = "paragraph"): NodeJSON => ({type, runs: text ? [{text, marks: {}}] : []});
const box = (...children: NodeJSON[]): NodeJSON => ({type: "box", children});
const root = (...children: NodeJSON[]): NodeJSON => ({type: "content", children});
const requiredSchema = (type = "caption"): Schema => {
    const copy = structuredClone(schema), spec = copy.nodes.content;
    if (spec.shape === "flow") spec.childRules = {[type]: {min: 1, max: 1}};
    return copy;
};
const seed = (children: NodeJSON[], source = schema) => {
    const doc = new Doc("seed", source);
    doc.edit([{op: "delete", at: [0], count: 1}, {op: "insert", at: [0], content: children}]);
    return doc;
};
const fixture = (initial: Doc) => {
    const source = initial.schema!;
    let receive!: (event: ServerEvent) => void;
    const client = new SyncClient("receiver", {subscribe: (_since, callback) => {receive = callback; return () => undefined;}, send: async () => undefined, sendPresence: () => undefined}, {schema: source});
    client.connect();
    receive({type: "hello", schemaVersion: schemaVersion(source), protocol: PROTOCOL_VERSION, capabilities: DOCUMENT_CAPABILITIES, epoch: "logical-test", serverSeq: 1, snapshot: initial.snapshot(), presence: [], delSeqs: []});
    const sender = Doc.fromSnapshot("sender", initial.snapshot(), source), read = client.doc.toJSON.bind(client.doc);
    let reads = 0, sequence = 1;
    client.doc.toJSON = () => {reads += 1; return read();};
    const deliver = (ops: Op[], expected: NodeJSON, scoped = true) => {
        const before = read(), reference = Doc.fromSnapshot("reference", client.doc.snapshot(), source);
        assert.equal(reference.check(ops), null);
        ops.forEach(op => reference.apply(op));
        assert.deepEqual(reference.toJSON(), expected, "full application matches fixed expectation");
        assert.deepEqual(sender.toJSON(), expected, "sender matches fixed expectation");
        assert.deepEqual(applyEdits(source, before, diffModels(source, before, expected)), expected);
        const frames: EditOp[][] = [];
        client.onModelEvents = (edits, info) => {assert.deepEqual(info, {cause: "remote", fallback: false}); frames.push(edits);};
        reads = 0; sequence += 1;
        receive({type: "change", envelope: {serverSeq: sequence, change: {actor: "sender", seq: sequence - 1, ops}}});
        assert.equal(reads, scoped ? 0 : 2, "whole-model reads during receipt");
        assert.equal(frames.length, Number(JSON.stringify(before) !== JSON.stringify(expected)), "one callback per visible change");
        assert.deepEqual(applyEdits(source, before, frames.flat()), expected, "model-event mirror");
        assert.deepEqual(read(), expected, "live receiver");
        assert.deepEqual(Doc.fromSnapshot("snapshot", client.doc.snapshot(), source).toJSON(), expected, "fresh snapshot interpretation");
        assert.equal(client.eventStats.fallbacks, 0);
        return frames.flat();
    };
    return {sender, client, deliver};
};

for (const mode of ["moved", "required", "both"] as const) for (const operation of ["insert", "delete", "format"] as const) {
    test(`${mode} logical paragraphs scope ${operation} at stable paths`, () => {
        const source = mode === "moved" ? schema : requiredSchema();
        const doc = seed([p("abc"), p("def"), p("ghi")], source);
        if (mode !== "required") doc.edit([{op: "move", from: [2], at: [0]}]);
        const texts = mode === "required" ? ["abc", "def", "ghi"] : ["ghi", "abc", "def"];
        const {sender, client, deliver} = fixture(doc);
        try {
            const edit: EditOp = operation === "insert" ? {op: "insert", at: [0, 1], content: "😀"} : operation === "delete" ? {op: "delete", at: [0, 0], count: 3} : {op: "update", at: [0, 1], length: 1, attrs: {bold: true}};
            const changed = operation === "insert" ? p(texts[0][0] + "😀" + texts[0].slice(1)) : operation === "delete" ? p("") : {type: "paragraph", runs: [{text: texts[0][0], marks: {}}, {text: texts[0][1], marks: {bold: true}}, {text: texts[0][2], marks: {}}]};
            deliver(sender.edit([edit]).ops, root(changed, p(texts[1]), p(texts[2]), ...(mode === "moved" ? [] : [p("", "caption")])));
        } finally {client.disconnect();}
    });
}

for (const count of [2, 8, 9]) test(`${count} moved paragraphs retain the bounded scope limit`, () => {
    const doc = seed(Array.from({length: count}, () => p("abc")));
    doc.edit([{op: "move", from: [count - 1], at: [0]}]);
    const {sender, client, deliver} = fixture(doc);
    try {deliver(sender.edit(Array.from({length: count}, (_, i) => ({op: "insert", at: [i, 1], content: "X"}))).ops, root(...Array.from({length: count}, () => p("aXbc"))), count <= 8);}
    finally {client.disconnect();}
});

test("a moved paragraph remains scoped after its birth container is deleted", () => {
    const doc = seed([p("lead"), box(p("born")), box(p("target"))]);
    doc.edit([{op: "move", from: [1, 0], at: [2, 1]}, {op: "delete", at: [1], count: 1}]);
    assert.deepEqual(doc.toJSON(), root(p("lead"), box(p("target"), p("born"))));
    const {sender, client, deliver} = fixture(doc);
    try {const events = deliver(sender.edit([{op: "insert", at: [1, 1, 2], content: "X"}]).ops, root(p("lead"), box(p("target"), p("boXrn")))); assert.deepEqual(events[0].at.slice(0, -1), [1, 1]);}
    finally {client.disconnect();}
});

test("a moved container's text follows its current nested path", () => {
    const doc = seed([p("lead"), box(p("inside")), box(p("target"))]);
    doc.edit([{op: "move", from: [1], at: [2, 1]}]);
    const {sender, client, deliver} = fixture(doc);
    try {deliver(sender.edit([{op: "insert", at: [1, 1, 0, 2], content: "X"}]).ops, root(p("lead"), box(p("target"), box(p("inXside")))));}
    finally {client.disconnect();}
});

test("joined physical paragraphs use one logical text scope", () => {
    const doc = seed([p("abc"), p("def"), p("ghi")]);
    doc.edit([{op: "move", from: [2], at: [1]}, {op: "merge", at: [2]}]);
    assert.deepEqual(doc.toJSON(), root(p("abc"), p("ghidef")));
    const {sender, client, deliver} = fixture(doc);
    try {deliver(sender.edit([{op: "update", at: [1, 2], length: 3, attrs: {bold: true}}]).ops, root(p("abc"), {type: "paragraph", runs: [{text: "gh", marks: {}}, {text: "ide", marks: {bold: true}}, {text: "f", marks: {}}]}));}
    finally {client.disconnect();}
});

for (const grouped of [false, true]) test(`required ${grouped ? "group" : "text"} identities remain scoped when emptied`, () => {
    const source = requiredSchema(grouped ? "list" : "caption"), doc = new Doc("seed", source);
    const path = grouped ? [1, 0, 0] : [1, 0];
    const wrap = (text: string) => grouped ? {type: "list", children: [p(text, "item")]} : p(text, "caption");
    const {sender, client, deliver} = fixture(doc);
    try {
        deliver(sender.edit([{op: "insert", at: path, content: "abc"}]).ops, root(p(""), wrap("abc")));
        deliver(sender.edit([{op: "delete", at: path, count: 3}]).ops, root(p(""), wrap("")));
        const logical = sender.blocks().findIndex(b => b.type === (grouped ? "item" : "caption"));
        const stored = sender.blocks()[logical].marker.line.key;
        assert.deepEqual(blockPath(sender, MAIN, logical), grouped ? [1, 0] : [1]);
        assert.deepEqual(blockPath(sender, stored, 0), grouped ? [1, 0] : [1]);
        assert.deepEqual(posOfPath(sender, path)?.b, logical);
    } finally {client.disconnect();}
});

test("edits to retained cardinality overflow stay on the full path and emit no visible change", () => {
    const source = requiredSchema(), doc = seed([p("lead"), p("one", "caption"), p("two", "caption")], source);
    const hidden = doc.sourceBlocks().find(b => b.kind === "text" && b.text === "two")!;
    const {sender, client, deliver} = fixture(doc);
    try {
        const origin = sender.get(hidden.marker.key)!, op: Op = {t: "text", id: sender.clock.next(), origin: origin.id, text: "X"};
        sender.apply(op); deliver([op], root(p("lead"), p("one", "caption")), false);
        assert.equal(sender.overflow()[0].runs?.[0] && "text" in sender.overflow()[0].runs![0] ? (sender.overflow()[0].runs![0] as {text: string}).text : "", "Xtwo");
    } finally {client.disconnect();}
});

for (const type of ["move", "split", "new-origin", "old-clock"] as const) test(`mixed or uncertain ${type} operations retain full comparison`, () => {
    const doc = seed([p("abc"), p("def"), p("ghi")]);doc.edit([{op: "move", from: [2], at: [1]}]);
    const {sender, client, deliver} = fixture(doc);
    try {
        if (type === "move") deliver(sender.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "move", from: [2], at: [0]}]).ops, root(p("def"), p("aXbc"), p("ghi")), false);
        if (type === "split") deliver(sender.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "split", at: [2, 2]}]).ops, root(p("aXbc"), p("ghi"), p("de"), p("f")), false);
        if (type === "new-origin") deliver(sender.edit([{op: "insert", at: [0, 1], content: "X"}, {op: "insert", at: [0, 2], content: "Y"}]).ops, root(p("aXYbc"), p("ghi"), p("def")), false);
        if (type === "old-clock") {
            const delayed = Doc.fromSnapshot("old", sender.snapshot(), schema).edit([{op: "insert", at: [0, 1], content: "X"}]).ops;
            const newer = sender.edit([{op: "update", at: [2, 0], length: 1, attrs: {bold: true}}]).ops;
            deliver(newer, root(p("abc"), p("ghi"), {type: "paragraph", runs: [{text: "d", marks: {bold: true}}, {text: "ef", marks: {}}]}));
            delayed.forEach(op => sender.apply(op));deliver(delayed, root(p("aXbc"), p("ghi"), {type: "paragraph", runs: [{text: "d", marks: {bold: true}}, {text: "ef", marks: {}}]}), false);
        }
    } finally {client.disconnect();}
});

for (const order of [["A", "B"], ["B", "A"]]) test(`moved and required documents preserve remote same-value format ownership: ${order.join("")}`, async () => {
    const net = new MemoryNet({clientSchema: requiredSchema()}), a = net.add("A"), b = net.add("B"), observer = net.add("observer");
    try {
        net.clients.forEach(c => c.connect());await net.settle();
        a.commit(a.doc.edit([{op: "insert", at: [0, 0], content: "abc"}, {op: "insert", at: [1], content: [p("def")]}]).ops);await net.settle();
        a.commit(a.doc.edit([{op: "move", from: [1], at: [0]}]).ops);await net.settle();net.clients.forEach(c => c.clearHistory());
        const peers = {A: a, B: b}, ops = Object.fromEntries(Object.entries(peers).map(([actor,c]) => [actor,c.doc.edit([{op: "update", at: [0, 0], length: 1, attrs: {bold: true}}]).ops]));
        let mirror = observer.doc.toJSON();observer.onModelEvents = edits => {mirror = applyEdits(net.schema, mirror, edits);};
        order.forEach(actor => peers[actor as "A" | "B"].commit(ops[actor]));await net.settle();
        const expected = root({type: "paragraph", runs: [{text: "d", marks: {bold: true}}, {text: "ef", marks: {}}]}, p("abc"), p("", "caption"));
        assert.deepEqual(mirror, expected);
        const loser = a; // Equal Lamport writes are ordered by actor: B owns the current value.
        loser.undo();await net.settle();assert.deepEqual(mirror, expected);
        loser.redo();await net.settle();assert.deepEqual(mirror, expected);
        b.undo();await net.settle();assert.deepEqual(mirror, root(p("def"), p("abc"), p("", "caption")));
        b.redo();await net.settle();assert.deepEqual(mirror, expected);
        for (const doc of [net.hub.doc,...net.clients.map(c=>c.doc)]) assert.deepEqual(doc.toJSON(), expected);
    } finally {net.clients.forEach(c=>c.disconnect());}
});


test("nested required text uses its logical container path", () => {
    const source = structuredClone(schema), spec = source.nodes.box;
    if (spec.shape === "flow") spec.childRules = {caption: {min: 1}};
    const doc = seed([p("lead"), box(p("body"))], source);
    const {sender, client, deliver} = fixture(doc);
    try {deliver(sender.edit([{op: "insert", at: [1, 1, 0], content: "required"}]).ops, root(p("lead"), box(p("body"), p("required", "caption"))));}
    finally {client.disconnect();}
});

test("same-boundary concurrent Enter remains absorbed before a scoped fresh insertion", () => {
    const doc = seed([p("abcd"), p("other")], requiredSchema());
    const {sender, client, deliver} = fixture(doc), other = Doc.fromSnapshot("other", sender.snapshot(), sender.schema!);
    const concurrent = other.edit([{op: "split", at: [0, 2]}]).ops;
    try {
        deliver(sender.edit([{op: "split", at: [0, 2]}]).ops, root(p("ab"), p("cd"), p("other"), p("", "caption")), false);
        concurrent.forEach(op => sender.apply(op));
        deliver(concurrent, root(p("ab"), p("cd"), p("other"), p("", "caption")), false);
        deliver(sender.edit([{op: "insert", at: [1, 1], content: "X"}]).ops, root(p("ab"), p("cXd"), p("other"), p("", "caption")));
    } finally {client.disconnect();}
});

test("automatic leading input is excluded before reading or applying a scope", () => {
    const doc = seed([p("lead"), box(p("body"))]);
    doc.edit([{op: "move", from: [1], at: [0]}]);
    assert.deepEqual(doc.toJSON(), root(p(""), box(p("body")), p("lead")));
    const {sender, client} = fixture(doc);
    try {
        const origin = sender.leftOf({b: 0, o: 0}), op: Op = {t: "text", id: sender.clock.next(), origin: origin.id, text: "X"};
        assert.equal(textEventScopes(client.doc, [op]), null);
        assert.deepEqual(client.doc.toJSON(), doc.toJSON());
    } finally {client.disconnect();}
});

for (const moved of [false, true]) test(`covered-cell text remains full-grid data with ${moved ? "movement" : "required rules"}`, () => {
    const source = structuredClone(DEMO_SCHEMA), spec = source.nodes.content;
    if (spec.shape === "flow") spec.childRules = {paragraph: {min: 1}};
    const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [p(text)]}]});
    const table: NodeJSON = {type: "table", attrs: {header: false}, children: [{type: "table-row", children: [cell("left"), cell("hidden")]}]};
    const doc = seed([p("lead"), table, p("tail")], source);
    if (moved) doc.edit([{op: "move", from: [2], at: [0]}]);
    const grid = doc.blocks().find(b => b.kind === "grid")!;assert.ok(grid.kind === "grid");
    commands.setSpan(doc, grid, 0, 0, 1, 2);
    const expected = doc.toJSON(), line = doc.cellKey(grid.marker, grid.rows[0], grid.cols[1]);
    const {sender, client, deliver} = fixture(doc);
    try {
        assert.equal(client.doc.visible(line), false);
        const hidden = sender.blocks(line)[0];assert.ok(hidden.kind === "text");
        const op: Op = {t: "text", id: sender.clock.next(), origin: hidden.marker.id, text: "X"};sender.apply(op);
        const t = expected.children!.find(node=>node.type === "table")!;
        t.children![0].children![1].children![0].children![0].runs = [{text: "Xhidden", marks: {}}];
        deliver([op], expected, false);
    } finally {client.disconnect();}
});

for (const constrained of [false, true]) test(`deterministic mixed text and move histories match whole-model events (${constrained ? "required" : "ordinary"})`, () => {
    const source = constrained ? requiredSchema() : schema, doc = seed([p("abc"), p("def"), p("ghi")], source);
    doc.edit([{op: "move", from: [2], at: [0]}]);
    const {sender, client, deliver} = fixture(doc);
    let random = 173;
    try {
        for (let round = 0; round < 100; round += 1) {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            const index = random % 3, node = sender.toJSON().children![index], width = (node.runs ?? []).reduce((n,r)=>n+("text" in r ? r.text.length : 1),0);
            const move = round % 7 === 0;
            const edit: EditOp = move ? {op: "move", from: [0], at: [2]} : !width || round % 3 === 0 ? {op: "insert", at: [index, width], content: round % 2 ? "한" : "😀"} : round % 3 === 1 ? {op: "update", at: [index, 0], length: width, attrs: {bold: round % 2 === 0}} : {op: "delete", at: [index, 0], count: width};
            const ops = sender.edit([edit]).ops;
            deliver(ops, sender.toJSON(), !move);
        }
    } finally {client.disconnect();}
});
