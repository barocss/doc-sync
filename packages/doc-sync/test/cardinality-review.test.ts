import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, ROOT, applyEdits, canonical, checkSchema, keyOf, type NodeJSON, type Op, type Schema} from "../src/index.ts";
import {requiredTicket} from "../src/crdt/cardinality.ts";
import {MemoryNet} from "./harness.ts";

const text = (type: string, value = ""): NodeJSON => ({type, runs: value ? [{text: value, marks: {}}] : []});
const schema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "caption", "rule"], default: "paragraph", childRules: {caption: {min: 1, max: 1}, rule: {max: 0}}},
    paragraph: {shape: "text"}, caption: {shape: "text"}, rule: {shape: "atom"},
}};
const gridSchema: Schema = {root: "content", marks: [], nodes: {
    content: {shape: "flow", children: ["paragraph", "table"], default: "paragraph", childRules: {table: {min: 1, max: 1}}},
    paragraph: {shape: "text"}, table: {shape: "grid", children: ["row"]}, row: {shape: "row", children: ["cell"]},
    cell: {shape: "cell", children: ["body"]}, body: {shape: "flow", children: ["paragraph"], default: "paragraph"},
}};

function assertRejectedWithoutMutation(doc: Doc, operations: Op[]): void {
    const before = doc.snapshot();
    assert.equal(typeof doc.check(operations), "string");
    assert.deepEqual(doc.snapshot(), before);
}

test("required token validation rejects nonexistent variants and noncanonical aliases atomically", () => {
    const head = requiredTicket({parent: keyOf(ROOT), type: "caption", ordinal: 0});
    const origins = [1, 2, 3].map(lamport => ({...head, lamport}));
    origins.push({...head, actor: head.actor.replace(/:0$/, ":00")});
    origins.push({...head, actor: head.actor.replace("%40", "@")});
    for (const origin of origins) {
        const doc = new Doc("A", schema);
        assertRejectedWithoutMutation(doc, [{t: "text", id: {lamport: 1, actor: "remote"}, origin, text: "X"}]);
    }
});

test("unread and materialized required grid axes reject text with the same immutable facts", () => {
    const head = requiredTicket({parent: keyOf(ROOT), type: "table", ordinal: 0});
    for (const lamport of [2, 3]) {
        const unread = new Doc("A", gridSchema), materialized = new Doc("B", gridSchema);
        materialized.toJSON();
        const operation: Op = {t: "text", id: {lamport: 1, actor: "remote"}, origin: {...head, lamport}, text: "X"};
        assertRejectedWithoutMutation(unread, [operation]);
        assert.equal(unread.check([operation]), materialized.check([operation]));
    }
});

test("required addresses must name a flow head, not an ordinary content token", () => {
    const doc = new Doc("A", schema);
    doc.edit([{op: "insert", at: [0, 0], content: "A"}]);
    const parent = doc.blocks()[0]; assert.equal(parent.kind, "text");
    if (parent.kind !== "text") return;
    const origin = requiredTicket({parent: parent.chars[0].key, type: "caption", ordinal: 0});
    assertRejectedWithoutMutation(doc, [{t: "text", id: {lamport: 2, actor: "remote"}, origin, text: "X"}]);
});

test("required grid row creation validates equally before and after lazy materialization", () => {
    const head = requiredTicket({parent: keyOf(ROOT), type: "table", ordinal: 0});
    const unread = new Doc("A", gridSchema), materialized = new Doc("B", gridSchema);
    materialized.toJSON();
    const operation: Op = {t: "node", id: {lamport: 4, actor: "remote"}, origin: {...head, lamport: 2}, type: "row"};
    assert.equal(unread.check([operation]), null);
    assert.equal(materialized.check([operation]), null);
    unread.apply(operation); materialized.apply(operation);
    assert.deepEqual(unread.toJSON(), materialized.toJSON());
    assert.equal(unread.toJSON().children![1].children!.length, 2);
});

test("two required groups have separate stable model paths, editable fallback tokens, and snapshots", () => {
    const grouped: Schema = {root: "content", marks: [], nodes: {
        content: {shape: "flow", children: ["paragraph", "group"], default: "paragraph", childRules: {group: {min: 2, max: 2}}},
        paragraph: {shape: "text"}, group: {shape: "group", children: ["caption"], by: []}, caption: {shape: "text"},
    }};
    assert.deepEqual(checkSchema(grouped), []);
    const a = new Doc("A", grouped), b = new Doc("B", grouped);
    const expected: NodeJSON = {type: "content", children: [text("paragraph"), {type: "group", children: [text("caption")]}, {type: "group", children: [text("caption")]}]};
    assert.deepEqual(a.toJSON(), expected);
    assert.deepEqual(canonical(grouped, expected), expected);
    const keys = a.blocks().slice(1).map(block => block.marker.key);
    assert.equal(new Set(keys).size, 2);
    const first = a.edit([{op: "insert", at: [1, 0, 0], content: "First"}]).ops;
    const second = a.edit([{op: "insert", at: [2, 0, 0], content: "Second"}]).ops;
    assert.equal(b.check([...first, ...second]), null);
    [...first, ...second].forEach(operation => b.apply(operation));
    const edited = {type: "content", children: [text("paragraph"), {type: "group", children: [text("caption", "First")]}, {type: "group", children: [text("caption", "Second")]}]};
    assert.deepEqual(a.toJSON(), edited); assert.deepEqual(b.toJSON(), edited);
    assert.deepEqual(a.blocks().slice(1).map(block => block.marker.key), keys);
    assert.deepEqual(Doc.fromSnapshot("R", a.snapshot(), grouped).toJSON(), edited);
});

test("required fallback type changes reject before mutation in local and wire APIs", () => {
    const doc = new Doc("A", schema);
    doc.toJSON();
    const marker = doc.blocks()[1].marker.id, before = doc.snapshot();
    assert.throws(() => doc.edit([{op: "update", at: [1], attrs: {type: "paragraph"}}]));
    assert.deepEqual(doc.snapshot(), before);
    assertRejectedWithoutMutation(doc, [{t: "set", at: doc.clock.next(), ids: [marker], key: "$type", value: "paragraph"}]);
    assert.deepEqual(doc.toJSON(), {type: "content", children: [text("paragraph"), text("caption")]});
});

for (const shape of ["atom", "flow", "grid"] as const) {
    test(`deleting a required ${shape} fallback preserves its editable identity and current attributes`, () => {
        const constrained = structuredClone(gridSchema);
        constrained.nodes.content = {shape: "flow", children: ["paragraph", "required"], default: "paragraph", childRules: {required: {min: 1, max: 1}}};
        const attrs = {label: {default: ""}};
        constrained.nodes.required = shape === "atom" ? {shape, attrs} : shape === "flow" ? {shape, attrs, children: ["paragraph"], default: "paragraph"} : {shape, attrs, children: ["row"]};
        const doc = new Doc("A", constrained);
        doc.toJSON();
        doc.edit([{op: "update", at: [1], attrs: {label: "Keep attribute"}}]);
        if (shape !== "atom") doc.edit([{op: "insert", at: shape === "flow" ? [1, 0, 0] : [1, 0, 0, 0, 0, 0], content: "Clear content"}]);
        const key = doc.blocks()[1].marker.key;
        doc.edit([{op: "delete", at: [1], count: 1}]);
        assert.equal(doc.blocks()[1]?.marker.key, key);
        assert.equal(doc.toJSON().children![1].attrs!.label, "Keep attribute");
        const serialized = JSON.stringify(doc.toJSON().children![1]);
        assert.equal(serialized.includes("Clear content"), false);
        doc.edit([{op: "update", at: [1], attrs: {label: "Still editable"}}]);
        assert.equal(doc.toJSON().children![1].attrs!.label, "Still editable");
        if (shape !== "atom") {
            doc.edit([{op: "insert", at: shape === "flow" ? [1, 0, 0] : [1, 0, 0, 0, 0, 0], content: "Again"}]);
            assert.ok(JSON.stringify(doc.toJSON().children![1]).includes("Again"));
        }
    });
}

test("schema validation rejects required cycles through a grid cell body", () => {
    const recursive = structuredClone(gridSchema);
    recursive.nodes.body = {shape: "flow", children: ["paragraph", "table"], default: "paragraph", childRules: {table: {min: 1}}};
    assert.ok(checkSchema(recursive).some(problem => /cycle/i.test(problem)));
});

test("schema validation rejects required spans and empty required groups before projection", () => {
    const span: Schema = {root: "content", marks: [], markValues: {link: {default: ""}}, nodes: {
        content: {shape: "flow", children: ["paragraph", "span"], default: "paragraph", childRules: {span: {min: 1}}},
        paragraph: {shape: "text"}, span: {shape: "span", mark: "link", attr: "url"},
    }};
    assert.ok(checkSchema(span).length > 0);
    const emptyGroup: Schema = {root: "content", marks: [], nodes: {
        content: {shape: "flow", children: ["paragraph", "group"], default: "paragraph", childRules: {group: {min: 1}}},
        paragraph: {shape: "text"}, group: {shape: "group", children: [], by: []},
    }};
    assert.ok(checkSchema(emptyGroup).length > 0);
});

test("required fallback edits, overflow promotion, and history preserve local and remote model mirrors", async () => {
    const net = new MemoryNet({clientSchema: schema});
    const a = net.add("A"), b = net.add("B");
    a.connect(); b.connect(); await net.settle();
    const mirrors = new Map([[a, a.doc.toJSON()], [b, b.doc.toJSON()]]);
    let remoteEvents = 0;
    for (const client of [a, b]) {
        client.onLocalEdits = (edits, normalize) => {
            const next = applyEdits(schema, applyEdits(schema, mirrors.get(client)!, edits), normalize);
            assert.deepEqual(next, client.doc.toJSON()); mirrors.set(client, next);
        };
        client.onModelEvents = edits => {
            const next = applyEdits(schema, mirrors.get(client)!, edits);
            assert.deepEqual(next, client.doc.toJSON()); mirrors.set(client, next); remoteEvents++;
        };
    }
    a.commit(a.doc.edit([{op: "insert", at: [1, 0], content: "fallback"}]).ops); await net.settle();
    const deletion = a.doc.edit([{op: "delete", at: [1, 0], count: 1}]).ops;
    assert.equal(a.doc.check(deletion), null);
    a.commit(deletion); await net.settle();
    assert.deepEqual(a.doc.toJSON(), b.doc.toJSON());
    a.undo(); await net.settle();
    assert.deepEqual(a.doc.toJSON(), {type: "content", children: [text("paragraph"), text("caption", "fallback")]});
    b.commit(b.doc.edit([{op: "insert", at: [1], content: [text("caption", "one"), text("caption", "two")]}]).ops); await net.settle();
    a.commit(a.doc.edit([{op: "delete", at: [1], count: 1}]).ops); await net.settle();
    a.undo(); await net.settle(); a.redo(); await net.settle();
    b.commit(b.doc.edit([{op: "insert", at: [1], content: [{type: "rule"}]}]).ops); await net.settle();
    assert.deepEqual(a.doc.toJSON(), {type: "content", children: [text("paragraph"), text("caption", "two")]});
    assert.deepEqual(a.doc.toJSON(), b.doc.toJSON());
    assert.deepEqual(mirrors.get(a), a.doc.toJSON()); assert.deepEqual(mirrors.get(b), b.doc.toJSON());
    assert.deepEqual(a.doc.overflow().map(node => node.type).sort(), ["caption", "rule"]);
    assert.ok(remoteEvents >= 5);
});

test("malformed child rules return schema problems without throwing", () => {
    for (const rule of [null, []]) {
        const malformed = structuredClone(schema);
        (malformed.nodes.content as {childRules: Record<string, unknown>}).childRules = {caption: rule};
        let problems: string[] = [];
        assert.doesNotThrow(() => {problems = checkSchema(malformed);});
        assert.ok(problems.length > 0);
    }
});
