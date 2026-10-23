import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, Editor} from "slate";
import {canonical} from "../src/crdt/model.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {fromSlate, modelPointToSlate, modelRangeToSlate, slatePointToModel, slateRangeToModel, toSlate} from "../src/slate/codec.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {Descendant} from "slate";

const p = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const model = (): NodeJSON => canonical(DEMO_SCHEMA, {type: "content", children: [
    {type: "paragraph", runs: [
        {text: "A😀", marks: {bold: true, italic: true, underline: true, strike: true}},
        {type: "inline-image", attrs: {src: "image.png", width: 240, height: 120}},
        {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "link", marks: {bold: true}}]},
    ]},
    {type: "heading1", runs: [{text: "Title", marks: {}}]},
    {type: "heading2", runs: []}, {type: "quote", runs: []},
    {type: "list", attrs: {listType: "numbered"}, children: [
        {type: "list-item", attrs: {level: 2}, runs: [{text: "item", marks: {}}]},
    ]},
    {type: "callout", attrs: {tone: "warn"}, children: [p("note"), {type: "list", attrs: {listType: "bullet"}, children: [{type: "list-item", runs: []}]}]},
    {type: "table", attrs: {header: true}, children: [{type: "table-row", children: [
        {type: "table-cell", attrs: {colspan: 2, rowspan: 1, backgroundColor: "#aabbcc"}, children: [{type: "table-cell-body", children: [p("left")]}]},
        {type: "table-cell", children: [{type: "table-cell-body", children: [p("hidden")]}]},
    ]}]},
    {type: "image-component", children: [
        {type: "image", runs: [{type: "inline-image", attrs: {src: "photo.png"}}]},
        {type: "caption", children: [{type: "caption-paragraph", runs: [{text: "caption", marks: {}}]}]},
    ]},
    {type: "divider"},
]});

test("Slate codec round-trips all demo schema shapes, attributes, spans, marks and hidden cells", () => {
    const source = model();
    const native = toSlate(DEMO_SCHEMA, source);
    assert.deepEqual(fromSlate(DEMO_SCHEMA, native), source);
    assert.equal(source.children![6].children![0].children![1].attrs!.spanned, true);
    assert.deepEqual(source.children![6].children![0].children![1].children![0].children![0].runs, [{text: "hidden", marks: {}}]);
});

test("Slate codec round-trips arbitrary schema type names", () => {
    const renamed = (type: string) => `custom_${type.replaceAll("-", "_")}`;
    const schema: Schema = {...DEMO_SCHEMA, root: renamed(DEMO_SCHEMA.root), nodes: Object.fromEntries(Object.entries(DEMO_SCHEMA.nodes).map(([type, spec]) => [renamed(type), {
        ...spec,
        ...("children" in spec && spec.children ? {children: spec.children.map(renamed)} : {}),
        ...(spec.shape === "text" && spec.next ? {next: renamed(spec.next)} : {}),
        ...(spec.shape === "flow" ? {default: renamed(spec.default)} : {}),
    }])) as Schema["nodes"]};
    const rename = (item: NodeJSON): NodeJSON => ({...item, type: renamed(item.type),
        ...(item.children ? {children: item.children.map(rename)} : {}),
        ...(item.runs ? {runs: item.runs.map(run => "text" in run ? run : rename(run))} : {}),
    });
    const source = rename(model());
    assert.deepEqual(fromSlate(schema, toSlate(schema, source)), source);
});

test("Slate codec provides safe inline sentinels and survives actual Slate normalization", () => {
    const source = canonical(DEMO_SCHEMA, {type: "content", children: [{type: "paragraph", runs: [
        {type: "inline-image", attrs: {src: "one"}}, {type: "inline-image", attrs: {src: "two"}},
        {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "link", marks: {}}]},
    ]}]});
    const editor = createEditor();
    editor.isInline = node => ["inline", "span"].includes(DEMO_SCHEMA.nodes[(node as unknown as {type: string}).type]?.shape);
    editor.isVoid = node => ["inline", "atom"].includes(DEMO_SCHEMA.nodes[(node as unknown as {type: string}).type]?.shape);
    editor.children = toSlate(DEMO_SCHEMA, source);
    Editor.normalize(editor, {force: true});
    assert.deepEqual(fromSlate(DEMO_SCHEMA, editor.children), source);
    assert.deepEqual(modelPointToSlate(DEMO_SCHEMA, editor.children, [0, 0]), {path: [0, 0], offset: 0});
});

test("Slate selection mapping counts UTF16 leaves, inline positions and flattened spans", () => {
    const native = toSlate(DEMO_SCHEMA, model());
    for (const offset of [0, 1, 3, 4, 5, 8]) {
        const point = modelPointToSlate(DEMO_SCHEMA, native, [0, offset]);
        assert.ok(point, `offset ${offset}`);
        assert.deepEqual(slatePointToModel(DEMO_SCHEMA, native, point), [0, offset]);
    }
    const range = {anchor: [0, 8], focus: [0, 1]};
    assert.deepEqual(slateRangeToModel(DEMO_SCHEMA, native, modelRangeToSlate(DEMO_SCHEMA, native, range)), range);
    assert.equal(modelPointToSlate(DEMO_SCHEMA, native, [0, 999]), null);
    assert.equal(slatePointToModel(DEMO_SCHEMA, native, {path: [0, 0], offset: 999}), null);
    assert.equal(modelPointToSlate(DEMO_SCHEMA, native, [6, 0, 1, 0, 0, 0]), null);
    assert.equal(modelRangeToSlate(DEMO_SCHEMA, native, null), null);
});

test("Slate codec rejects unsupported nodes, marks, children and atom content explicitly", () => {
    assert.throws(() => toSlate(DEMO_SCHEMA, {type: "content", children: [{type: "unknown"}]}), /unknown type/);
    assert.throws(() => toSlate(DEMO_SCHEMA, {type: "content", children: [{type: "paragraph", runs: [{text: "x", marks: {unknown: true}}]}]}), /unsupported mark/);
    assert.throws(() => fromSlate(DEMO_SCHEMA, [{type: "paragraph", children: [{text: "x", unknown: true}]}] as unknown as Descendant[]), /unsupported mark/);
    assert.throws(() => fromSlate(DEMO_SCHEMA, [{type: "divider", children: [{text: "lost"}]}] as unknown as Descendant[]), /cannot contain content/);
    assert.throws(() => fromSlate(DEMO_SCHEMA, [{type: "image", children: [{text: "lost"}]}] as unknown as Descendant[]), /not an allowed child/);
    assert.throws(() => toSlate(DEMO_SCHEMA, {type: "content", children: [{type: "paragraph", attrs: {unknown: 1}, runs: []}]}), /unsupported attribute/);
    assert.throws(() => toSlate(DEMO_SCHEMA, {type: "content", children: [{type: "divider", children: [p("lost")]}]}), /cannot contain content/);
    assert.throws(() => toSlate(DEMO_SCHEMA, {type: "content", attrs: {unknown: 1}, children: [p("text")]}), /root attributes/);
});
