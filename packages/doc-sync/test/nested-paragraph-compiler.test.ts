import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, History, type NodeJSON, type Op, type Schema} from "../src/index.ts";
import {textTicket} from "../src/crdt/text-storage.ts";
import {WORD_SCHEMA, PRESENTATION_SCHEMA} from "../../../fixtures/product-schemas.ts";

const options = {caretBefore: "", caretAfter: ""};
const paragraph = (text: string, attrs?: Record<string, unknown>): NodeJSON => ({type: "paragraph", ...(attrs ? {attrs} : {}), runs: [{text, marks: {}}]});
const ticket = (lamport: number, actor = "A") => ({lamport, actor});
const fieldKeys = ["align", "spacing", "indent"].map(name => `$field:${JSON.stringify(["style", name])}`);
function checkedEdit(doc: Doc, edits: Parameters<Doc["edit"]>[0]): Op[] {
    const before = doc.snapshot();
    const ops = doc.edit(edits).ops;
    const replica = Doc.fromSnapshot("replica", before, doc.schema!);
    assert.equal(replica.check(ops), null, "the entire batch validates against its pre-edit snapshot");
    ops.forEach(op => replica.apply(op));
    assert.deepEqual(replica.toJSON(), doc.toJSON());
    assert.deepEqual(Doc.fromSnapshot("restored", doc.snapshot(), doc.schema!).toJSON(), doc.toJSON());
    return ops;
}

for (const [schema, type, firstLeaf, textAt] of [
    [WORD_SCHEMA, "section", 3, 6], [PRESENTATION_SCHEMA, "slide", 4, 7],
] as const) test(`${type} insertion compiles nested paragraph defaults as leaf resets with stable tickets`, () => {
    const doc = new Doc("A", schema);
    const ops = checkedEdit(doc, [{op: "insert", at: [1], content: [{type, children: [paragraph("x")]}]}]);
    const head = ticket(0, "1@A/body");
    const expected: Op[] = [{t: "node", id: ticket(1), origin: ticket(0, "~root"), type}];
    if (type === "slide") expected.push({t: "set", at: ticket(2), ids: [head], key: "$type", value: "paragraph"});
    expected.push(...fieldKeys.map((key, index): Op => ({t: "set", at: ticket(firstLeaf + index), ids: [head], key, value: null})),
        {t: "text", id: ticket(textAt), origin: head, text: "x"});
    assert.deepEqual(ops, expected);
    const after = doc.toJSON(), history = new History();
    history.record(ops, doc, options);
    history.undo(doc);
    assert.equal(doc.toJSON().children!.some(node => node.type === type), false);
    history.redo(doc);
    assert.deepEqual(doc.toJSON(), after);
});

for (const [schema, type] of [[WORD_SCHEMA, "section"], [PRESENTATION_SCHEMA, "slide"]] as const) {
    for (const style of [undefined, null, {align: "center"}]) test(`${type} direct first-child paragraph insertion accepts style ${JSON.stringify(style)}`, () => {
        const doc = new Doc("A", schema);
        checkedEdit(doc, [{op: "insert", at: [1], content: [{type}]}]);
        const ops = checkedEdit(doc, [{op: "insert", at: [1, 0], content: [paragraph("new", style === undefined ? undefined : {style})]}]);
        assert.equal(ops.some(op => op.t === "set" && op.key === "style" || op.t === "node" && Object.hasOwn(op.attrs ?? {}, "style")), false);
        const inserted = doc.toJSON().children!.find(node => node.type === type)!.children!.find(node => node.runs?.some(run => "text" in run && run.text === "new"))!;
        assert.deepEqual(inserted.attrs?.style, {align: style && typeof style === "object" ? "center" : "left", spacing: 1, indent: 0});
    });
}

test("pending text retype expands fields using the target schema and preserves foreign leaf ownership through history", () => {
    const schema: Schema = {root: "body", marks: [], nodes: {
        body: {shape: "flow", children: ["title", "paragraph"], default: "title"},
        title: {shape: "text", attrs: {style: {default: "plain"}}},
        paragraph: {shape: "text", attrs: {style: {default: {align: "left", indent: 0}, fields: {align: {default: "left"}, indent: {default: 0}}}}},
    }};
    const a = new Doc("A", schema), history = new History();
    const ops = checkedEdit(a, [{op: "insert", at: [0], content: [paragraph("x", {style: {align: "center"}})]}]);
    history.record(ops, a, options);
    assert.deepEqual(ops.filter((op): op is Extract<Op, {t: "set"}> => op.t === "set" && op.key.startsWith("$field:")).map(op => op.value), ["center"]);
    const b = Doc.fromSnapshot("B", a.snapshot(), schema);
    const foreign = checkedEdit(b, [{op: "update", at: [0], attrs: {style: {align: "right"}}}]);
    foreign.forEach(op => a.apply(op));
    history.undo(a);
    history.redo(a);
    assert.equal(a.toJSON().children![0].attrs?.style && (a.toJSON().children![0].attrs!.style as {align: string}).align, "right");
});

test("pre-edit validation rejects the former coarse field reset without changing the document", () => {
    const doc = new Doc("A", PRESENTATION_SCHEMA);
    const before = doc.snapshot();
    const bad: Op[] = [
        {t: "node", id: ticket(1), origin: ticket(0, "~root"), type: "slide"},
        {t: "set", at: ticket(2), ids: [ticket(0, "1@A/body")], key: "$type", value: "paragraph"},
        {t: "set", at: ticket(3), ids: [ticket(0, "1@A/body")], key: "style", value: null},
    ];
    assert.ok(doc.check(bad));
    assert.deepEqual(doc.snapshot(), before);
});

for (const [schema, type, indices] of [[WORD_SCHEMA, "section", [2, 3]], [PRESENTATION_SCHEMA, "slide", [2]]] as const) {
    for (const index of indices) test(`${type} paragraph insertion after a required sibling at ${index} retains rich content and history`, () => {
        const doc = new Doc("A", schema), history = new History();
        checkedEdit(doc, [{op: "insert", at: [1], content: [{type}]}]);
        const before = doc.toJSON();
        const model: NodeJSON = {type: "paragraph", attrs: {style: {align: "right", spacing: 1.5, indent: 2}}, runs: [{text: "P😀tail", marks: {bold: true}}]};
        const ops = checkedEdit(doc, [{op: "insert", at: [1, index], content: [model]}]);
        const children = doc.toJSON().children![1].children!;
        assert.equal(children.length, before.children![1].children!.length + 1);
        assert.deepEqual(children[index], model);
        const after = doc.toJSON();
        history.record(ops, doc, options);
        history.undo(doc);
        assert.deepEqual(doc.toJSON(), before);
        history.redo(doc);
        assert.deepEqual(doc.toJSON(), after);
    });
}


test("automatic text storage rejects required private-line anchors and forgeries", () => {
    const doc = new Doc("A", WORD_SCHEMA);
    checkedEdit(doc, [{op: "insert", at: [1], content: [{type: "section"}, {type: "section"}]}]);
    const sections = doc.blocks().filter(block => block.kind === "flow");
    const first = sections[0], second = sections[1];
    assert.equal(first.kind, "flow"); assert.equal(second.kind, "flow");
    if (first.kind !== "flow" || second.kind !== "flow") throw new Error("Missing sections");
    const footer = doc.blocks(first.body).at(-1)!;
    const make = (parent: string, after: string): Op[] => [{t: "text", id: doc.clock.next(), origin: textTicket({parent, after}), text: "x"}];
    assert.ok(doc.check(make(first.body, footer.marker.key)), "private required storage is not a physical parent anchor");
    const before = doc.snapshot();
    assert.ok(doc.check(make(second.body, footer.marker.key)), "an anchor from another section must fail");
    assert.ok(doc.check(make(first.body, footer.marker.key.replace(/:0$/, ":999"))), "an undeclared required ordinal must fail");
    assert.ok(doc.check(make(first.body, footer.marker.key.replace(/footer/, "missing"))), "an undeclared required type must fail");
    // Clock allocation above is local authoring; validation itself must not materialize storage.
    const validationState = doc.snapshot();
    assert.ok(doc.check(make(second.body, footer.marker.key)));
    assert.deepEqual(doc.snapshot().lines, validationState.lines);
    assert.deepEqual(before.lines, validationState.lines);
});


for (const [schema, type, index] of [[WORD_SCHEMA, "section", 3], [PRESENTATION_SCHEMA, "slide", 2]] as const) test(`${type} insertion preserves a concurrent foreign placement of the original head through history`, () => {
    const a = new Doc("A", schema), history = new History();
    const initial = {...paragraph("original"), type: type === "slide" ? "title" : "paragraph"};
    checkedEdit(a, [{op: "insert", at: [1], content: [{type, children: [initial]}]}]);
    const b = Doc.fromSnapshot("B", a.snapshot(), schema);
    const section = a.blocks()[1];
    assert.equal(section.kind, "flow");
    if (section.kind !== "flow") throw new Error("Missing section");
    const original = a.blocks(section.body)[0].marker.id;
    const inserted = checkedEdit(a, [{op: "insert", at: [1, index], content: [paragraph("inserted", {style: {align: "right"}}), paragraph("second", {style: {indent: 2}})]}]);
    assert.equal(inserted.some(op => op.t === "move" && JSON.stringify(op.target) === JSON.stringify(original)), false);
    history.record(inserted, a, options);
    const moved = checkedEdit(b, [{op: "move", from: [1, 0], at: [1, index - 1]}]);
    const foreign = moved.find((op): op is Extract<Op, {t: "move"}> => op.t === "move" && JSON.stringify(op.target) === JSON.stringify(original))!;
    assert.ok(foreign);
    assert.equal(a.check(moved), null); moved.forEach(op => a.apply(op));
    assert.equal(b.check(inserted), null); inserted.forEach(op => b.apply(op));
    const assertSame = () => {
        assert.deepEqual(a.toJSON(), b.toJSON());
        for (const doc of [a, b]) assert.deepEqual(doc.placementOf(original)?.at, foreign.at);
    };
    assertSame();
    const undo = history.undo(a).ops;
    assert.equal(b.check(undo), null); undo.forEach(op => b.apply(op)); assertSame();
    assert.equal(JSON.stringify(a.toJSON()).includes("inserted"), false);
    const redo = history.redo(a).ops;
    assert.equal(b.check(redo), null); redo.forEach(op => b.apply(op)); assertSame();
    assert.equal(JSON.stringify(a.toJSON()).includes("inserted"), true);
});

test("unsupported nontext insertion after a required sibling fails before authored operations", () => {
    const doc = new Doc("A", WORD_SCHEMA);
    checkedEdit(doc, [{op: "insert", at: [1], content: [{type: "section"}]}]);
    const before = doc.snapshot();
    assert.throws(() => doc.edit([{op: "insert", at: [1, 3], content: [{type: "page-break"}]}]), /requires a text block/);
    assert.deepEqual(doc.snapshot(), before);
});


for (const [schema, type, index] of [[WORD_SCHEMA, "section", 3], [PRESENTATION_SCHEMA, "slide", 2]] as const) {
    test(`${type} required end insertion preserves both paragraphs and independent placements through history`, () => {
        const doc = new Doc("A", schema), history = new History();
        checkedEdit(doc, [{op: "insert", at: [1], content: [{type}]}]);
        const before = doc.toJSON();
        const content = [paragraph("first", {style: {align: "right", spacing: 1, indent: 0}}), paragraph("second😀", {style: {align: "left", spacing: 1.5, indent: 2}})];
        const ops = checkedEdit(doc, [{op: "insert", at: [1, index], content}]);
        assert.deepEqual(doc.toJSON().children![1].children!.slice(index), content);
        const placements = ops.filter((op): op is Extract<Op, {t: "move"}> => op.t === "move");
        assert.equal(placements.length, 2);
        assert.notDeepEqual(placements[0].target, placements[1].target);
        assert.deepEqual(placements[1].after, placements[0].at);
        const after = doc.toJSON(); history.record(ops, doc, options);
        history.undo(doc); assert.deepEqual(doc.toJSON(), before);
        history.redo(doc); assert.deepEqual(doc.toJSON(), after);
    });
}
