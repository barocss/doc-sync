import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, ROOT, keyOf, type Op, type Schema, type Snapshot} from "../src/index.ts";
import {SyncClient} from "../src/sync/client.ts";
import type {ServerEvent, Transport} from "../src/sync/protocol.ts";
import {DocHub} from "../src/server/hub.ts";
import {createAnnotation, getAnnotations, ANNOTATION_HEAD, ANNOTATION_HEAD_KEY} from "../src/crdt/annotations.ts";
import {encodeFieldKey} from "../src/crdt/fields.ts";
import {textTicket} from "../src/crdt/text-storage.ts";

const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "box", "rule"], default: "paragraph"},
    paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph", "box", "rule"], default: "paragraph"}, rule: {shape: "atom"},
}};
const annotationDoc = () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "Text"}]);
    const created = createAnnotation(doc, {anchor: [0, 0], focus: [0, 4]}, {body: {message: "Safe"}});
    return {doc, created};
};
const annotationItem = (snapshot: Snapshot) => snapshot.lines.find(line => line.key === ANNOTATION_HEAD_KEY)!.items[1];
const metadata = (snapshot: Snapshot, key: string) => annotationItem(snapshot).a!.find(entry => entry[0] === key)!;

for (const mode of ["format-and-capabilities", "format", "annotation-capability"] as const) {
    test(`feature snapshot rejects ${mode} downgrade`, () => {
        const {doc} = annotationDoc(), snapshot = structuredClone(doc.snapshot());
        if (mode !== "annotation-capability") delete snapshot.format;
        if (mode === "format-and-capabilities") delete snapshot.capabilities;
        if (mode === "annotation-capability") snapshot.capabilities = [];
        assert.throws(() => Doc.fromSnapshot("R", snapshot, schema));
    });
}

test("feature snapshot rejects unknown capabilities while accepting its complete original", () => {
    const {doc} = annotationDoc(), original = doc.snapshot();
    const malformed = {...structuredClone(original), capabilities: ["annotations-v1", "future-unimplemented"]};
    assert.throws(() => Doc.fromSnapshot("R", malformed, schema));
    assert.deepEqual(getAnnotations(Doc.fromSnapshot("R", structuredClone(original), schema)), getAnnotations(doc));
});

for (const mode of ["poisoned-data", "missing-endpoint", "extra-endpoint-key", "wrong-head"] as const) {
    test(`snapshot rejects forged annotation ${mode}`, () => {
        const {doc} = annotationDoc(), snapshot = structuredClone(doc.snapshot());
        if (mode === "poisoned-data") annotationItem(snapshot).a!.push(["data:constructor", {value: "Unsafe"}, "999@remote"]);
        if (mode === "missing-endpoint") (metadata(snapshot, "anchor")[1] as {left: string}).left = "999@missing";
        if (mode === "extra-endpoint-key") Object.assign(metadata(snapshot, "anchor")[1] as object, {unexpected: true});
        if (mode === "wrong-head") snapshot.lines.find(line => line.key === ANNOTATION_HEAD_KEY)!.slot = "body";
        assert.throws(() => Doc.fromSnapshot("R", snapshot, schema));
    });
}

const fieldSchema: Schema = {...schema, nodes: {...schema.nodes, paragraph: {shape: "text", attrs: {
    details: {default: {nested: {message: "Default"}}, fields: {nested: {default: {message: "Default"}}}},
}}}};
const fieldDoc = () => {
    const doc = new Doc("A", fieldSchema);
    doc.edit([{op: "update", at: [0], attrs: {details: {nested: {message: "Safe"}}}}]);
    return doc;
};

test("snapshot rejects forged field paths and missing field capability", () => {
    const doc = fieldDoc(), key = encodeFieldKey("details", ["nested"]);
    const malformed = structuredClone(doc.snapshot());
    const entry = malformed.lines[0].items[0].a!.find(value => value[0] === key)!;
    entry[0] = '$field:["details","constructor"]';
    assert.throws(() => Doc.fromSnapshot("R", malformed, fieldSchema));
    const downgraded = structuredClone(doc.snapshot()); downgraded.capabilities = [];
    assert.throws(() => Doc.fromSnapshot("R", downgraded, fieldSchema));
});

test("conflicting annotation and content birth IDs reject before any server mutation", () => {
    const hub = new DocHub({schema});
    const id = {lamport: 1, actor: "remote"}, endpoint = {left: keyOf(ROOT), right: null, affinity: "left"};
    const operations: Op[] = [
        {t: "node", id, origin: ANNOTATION_HEAD, type: "$annotation", attrs: {anchor: endpoint, focus: endpoint}},
        {t: "node", id, origin: ROOT, type: "box"},
        {t: "text", id: {lamport: 2, actor: "remote"}, origin: {lamport: 0, actor: "1@remote/body"}, text: "X"},
    ];
    const before = hub.doc.snapshot();
    assert.equal(typeof hub.doc.check(operations), "string");
    assert.throws(() => hub.submit({actor: "remote", seq: 1, ops: operations}));
    assert.deepEqual(hub.doc.snapshot(), before);
    assert.equal(hub.serverSeq, 0);
    assert.deepEqual(getAnnotations(hub.doc), []);
});

test("conflicting text and object birth IDs cannot fabricate a child-slot origin", () => {
    const hub = new DocHub({schema});
    const id = {lamport: 1, actor: "remote"};
    const operations: Op[] = [
        {t: "text", id, origin: ROOT, text: "A"},
        {t: "node", id, origin: ROOT, type: "box"},
        {t: "text", id: {lamport: 2, actor: "remote"}, origin: {lamport: 0, actor: "1@remote/body"}, text: "X"},
    ];
    const before = hub.doc.snapshot();
    assert.throws(() => hub.submit({actor: "remote", seq: 1, ops: operations}));
    assert.deepEqual(hub.doc.snapshot(), before); assert.equal(hub.serverSeq, 0);
});

test("mutating returned annotation operations cannot mutate live metadata", () => {
    const {doc, created} = annotationDoc(), before = getAnnotations(doc);
    const operation = created.ops[0]; assert.equal(operation.t, "node");
    if (operation.t !== "node") return;
    ((operation.attrs!["data:body"] as {value: {message: string}}).value).message = "Changed outside operations";
    (operation.attrs!.anchor as {left: string}).left = "999@missing";
    assert.deepEqual(getAnnotations(doc), before);
});

test("mutating snapshot output or retained snapshot input cannot mutate documents", () => {
    const {doc} = annotationDoc(), before = getAnnotations(doc);
    const output = doc.snapshot();
    (metadata(output, "data:body")[1] as {value: {message: string}}).value.message = "Changed output";
    assert.deepEqual(getAnnotations(doc), before);
    const input = structuredClone(doc.snapshot()), restored = Doc.fromSnapshot("R", input, schema);
    (metadata(input, "data:body")[1] as {value: {message: string}}).value.message = "Changed input";
    assert.deepEqual(getAnnotations(restored), before);
});

test("mutating nested JSON attributes cannot corrupt cached document models", () => {
    const doc = fieldDoc(), before = structuredClone(doc.toJSON()), model = doc.toJSON();
    (model.children![0].attrs!.details as {nested: {message: string}}).nested.message = "Changed model";
    assert.deepEqual(doc.toJSON(), before);
    const restored = Doc.fromSnapshot("R", doc.snapshot(), fieldSchema);
    assert.deepEqual(restored.toJSON(), before);
});

test("logical join validation rejects accessor metadata without evaluating getters", () => {
    const doc = new Doc("A", schema);
    let getterReads = 0;
    const value = Object.defineProperty({after: keyOf(ROOT)}, "into", {enumerable: true, get() {getterReads++; return keyOf(ROOT);}});
    const before = doc.snapshot();
    assert.equal(typeof doc.check([{t: "set", at: {lamport: 1, actor: "remote"}, ids: [ROOT], key: "$join", value}]), "string");
    assert.equal(getterReads, 0);
    assert.deepEqual(doc.snapshot(), before);
});

test("derived trailing text storage rejects character and cross-parent object references", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "A"}, {op: "insert", at: [1], content: [{type: "box", children: [{type: "paragraph", runs: []}, {type: "rule"}]}]}]);
    const paragraph = doc.blocks()[0]; assert.equal(paragraph.kind, "text");
    const box = doc.blocks().find(block => block.kind === "flow")!;
    const nestedRule = box.kind === "flow" ? doc.blocks(box.body).find(block => block.kind === "atom")! : null;
    if (paragraph.kind !== "text" || !nestedRule) return;
    for (const after of [paragraph.chars[0].key, nestedRule.marker.key]) {
        const origin = textTicket({parent: keyOf(ROOT), after});
        const before = doc.snapshot();
        assert.equal(typeof doc.check([{t: "text", id: {lamport: 100, actor: "remote"}, origin, text: "X"}]), "string");
        assert.deepEqual(doc.snapshot(), before);
    }
});


test("invalid snapshot hello preserves pending changes and disconnects without partial handshake state", () => {
    let receive!: (event: ServerEvent) => void;
    const transport: Transport = {subscribe: (_since, handler) => {receive = handler; return () => {};}, send: async () => {}, sendPresence: () => {}};
    const client = new SyncClient("A", transport, {schema});
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "Offline work"}]).ops);
    const doc = client.doc, pending = structuredClone(client.pending), history = client.history;
    client.connect();
    const event = new DocHub({schema}).hello(0); assert.equal(event.type, "hello");
    if (event.type !== "hello") return;
    event.clientSeqs = [["A", 1]];
    event.snapshot!.capabilities = ["future-unimplemented"];
    assert.doesNotThrow(() => receive(event));
    assert.equal(client.online, false);
    assert.ok(client.connectionError);
    assert.equal(client.doc, doc); assert.equal(client.history, history);
    assert.equal(client.epoch, undefined); assert.equal(client.serverSeq, 0);
    assert.deepEqual(client.pending, pending);
    client.disconnect();
});

test("accepted nested payloads do not share ownership with the caller's submitted Change", () => {
    const seed = new Doc("A", schema);
    seed.edit([{op: "insert", at: [0, 0], content: "Text"}]);
    const hub = new DocHub({schema}); hub.doc = Doc.fromSnapshot("server", seed.snapshot(), schema);
    const {ops} = createAnnotation(seed, {anchor: [0, 0], focus: [0, 4]}, {body: {message: "Safe"}});
    const change = {actor: "A", seq: 1, ops: structuredClone(ops)};
    hub.submit(change);
    const before = getAnnotations(hub.doc), saved = structuredClone(hub.log);
    const operation = change.ops[0]; assert.equal(operation.t, "node");
    if (operation.t !== "node") return;
    (operation.attrs!["data:body"] as {value: {message: string}}).value.message = "Changed caller payload";
    assert.deepEqual(getAnnotations(hub.doc), before);
    assert.deepEqual(hub.log, saved);
});

test("a text run's later token ID cannot be reused as an object in the same Change", () => {
    const hub = new DocHub({schema});
    const operations: Op[] = [
        {t: "text", id: {lamport: 1, actor: "remote"}, origin: ROOT, text: "AB"},
        {t: "node", id: {lamport: 2, actor: "remote"}, origin: ROOT, type: "box"},
        {t: "text", id: {lamport: 3, actor: "remote"}, origin: {lamport: 0, actor: "2@remote/body"}, text: "X"},
    ];
    const before = hub.doc.snapshot();
    assert.throws(() => hub.submit({actor: "remote", seq: 1, ops: operations}));
    assert.deepEqual(hub.doc.snapshot(), before); assert.equal(hub.serverSeq, 0);
});

test("snapshot movement output cannot mutate retained placement records", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [1], content: [{type: "rule"}]}]);
    doc.edit([{op: "move", from: [1], at: [0]}]);
    const before = structuredClone(doc.snapshot().moves), output = doc.snapshot();
    output.moves![0].parent.actor = "missing";
    assert.deepEqual(doc.snapshot().moves, before);
});

test("snapshot cannot retype a fixed required fallback through its type register", () => {
    const constrained: Schema = {...schema, nodes: {...schema.nodes,
        content: {shape: "flow", children: ["paragraph", "caption"], default: "paragraph", childRules: {caption: {min: 1, max: 1}}}, caption: {shape: "text"},
    }};
    const doc = new Doc("A", constrained); doc.toJSON();
    const snapshot = doc.snapshot(), required = snapshot.lines.find(line => line.key.includes("@~required:"))!;
    required.items[0].a = [["$type", "paragraph", "1@remote"]];
    assert.throws(() => Doc.fromSnapshot("R", snapshot, constrained));
});

test("snapshot annotation IDs cannot alias existing content token IDs", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "Text"}]);
    createAnnotation(doc, {anchor: [0, 2], focus: [0, 3]}, {body: "Independent IDs"});
    const original = doc.snapshot();
    assert.deepEqual(getAnnotations(Doc.fromSnapshot("R", structuredClone(original), schema)), getAnnotations(doc));
    const forged = structuredClone(original); annotationItem(forged).i = "1@A";
    assert.throws(() => Doc.fromSnapshot("R", forged, schema));
});

test("movement wire identities reject fractional and unsafe Lamport numbers before clock mutation", () => {
    for (const lamport of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
        const hub = new DocHub({schema});
        hub.doc.edit([{op: "insert", at: [1], content: [{type: "rule"}]}]);
        const target = hub.doc.blocks().find(block => block.kind === "atom")!.marker.id;
        const operation: Op = {t: "move", at: {lamport, actor: "remote"}, target, parent: ROOT, after: null};
        const before = hub.doc.snapshot();
        assert.equal(typeof hub.doc.check([operation]), "string");
        assert.throws(() => hub.submit({actor: "remote", seq: 1, ops: [operation]}));
        assert.deepEqual(hub.doc.snapshot(), before); assert.equal(hub.serverSeq, 0);
    }
});

test("feature snapshots reject unsafe document clocks and metadata write tickets", () => {
    const {doc} = annotationDoc();
    for (const lamport of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
        const clock = doc.snapshot(); clock.lamport = lamport;
        assert.throws(() => Doc.fromSnapshot("R", clock, schema));
        const register = doc.snapshot(); metadata(register, "data:body")[2] = `${lamport}@remote`;
        assert.throws(() => Doc.fromSnapshot("R", register, schema));
    }
});

test("Hub object input cannot turn rejected join accessors into accepted data during cloning", () => {
    const hub = new DocHub({schema});
    let getterReads = 0;
    const value = Object.defineProperty({after: keyOf(ROOT)}, "into", {enumerable: true, get() {getterReads++; return keyOf(ROOT);}});
    const operations: Op[] = [{t: "set", at: {lamport: 1, actor: "remote"}, ids: [ROOT], key: "$join", value}];
    const before = hub.doc.snapshot();
    assert.throws(() => hub.submit({actor: "remote", seq: 1, ops: operations}));
    assert.equal(getterReads, 0); assert.equal(hub.serverSeq, 0);
    assert.deepEqual(hub.doc.snapshot(), before);
});

test("snapshot object input rejects annotation accessors before copying their values", () => {
    const {doc} = annotationDoc(), snapshot = doc.snapshot();
    let getterReads = 0;
    metadata(snapshot, "data:body")[1] = Object.defineProperty({}, "value", {enumerable: true, get() {getterReads++; return "Safe";}});
    assert.throws(() => Doc.fromSnapshot("R", snapshot, schema));
    assert.equal(getterReads, 0);
});

test("valid annotation JSON object keys retain their contract through snapshot validation", () => {
    const doc = new Doc("A", schema);
    createAnnotation(doc, {anchor: [0, 0], focus: [0, 0]}, {body: {$kind: "comment", nested: {"$ref": "local-reference"}}});
    assert.deepEqual(getAnnotations(Doc.fromSnapshot("R", doc.snapshot(), schema)), getAnnotations(doc));
});
