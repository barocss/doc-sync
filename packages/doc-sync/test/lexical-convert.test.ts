import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, $getRoot, $createTextNode, $createParagraphNode, $createLineBreakNode, $isLineBreakNode, $isElementNode, $isTextNode} from "lexical";
import {$createTableNodeWithDimensions, $isTableNode, $isTableRowNode, $isTableCellNode} from "@lexical/table";
import {canonical} from "../src/crdt/model.ts";
import {buildLexicalSchema, $toLexical, $fromLexical, toLexicalJSON, fromLexicalJSON, $setLexicalSelection, $lexicalSelection, $modelData, $setModelData} from "../src/lexical/index.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {NodeJSON} from "../src/crdt/model.ts";

const p = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const cell = (text: string, attrs?: Record<string, unknown>): NodeJSON => ({type: "table-cell", ...(attrs ? {attrs} : {}), children: [{type: "table-cell-body", children: [p(text)]}]});
const info = buildLexicalSchema(DEMO_SCHEMA);
const editor = () => createEditor({nodes: info.nodes, onError: error => { throw error; }});
const fixture = canonical(DEMO_SCHEMA, {type: "content", children: [
    {type: "paragraph", runs: [
        {text: "Bold", marks: {bold: true, italic: true, underline: true, strike: true}},
        {type: "inline-hyperlink", attrs: {url: "https://example.test"}, runs: [{text: "link", marks: {bold: true}}]},
        {type: "inline-image", attrs: {src: "https://example.test/a.png", width: 80, height: 90}},
    ]},
    {type: "heading1", runs: [{text: "Heading", marks: {}}]},
    {type: "heading2", runs: [{text: "Subheading", marks: {}}]},
    {type: "quote", runs: [{text: "Quote", marks: {}}]},
    {type: "list", attrs: {listType: "numbered"}, children: [
        {type: "list-item", attrs: {level: 2}, runs: [{text: "Item", marks: {bold: true}}]},
    ]},
    {type: "table", attrs: {header: true}, children: [
        {type: "table-row", children: [cell("A", {colspan: 2, rowspan: 2, backgroundColor: "#ff0000"}), cell("B", {spanned: true})]},
        {type: "table-row", children: [cell("C", {spanned: true}), cell("D", {spanned: true})]},
    ]},
    {type: "image-component", children: [
        {type: "image", runs: [{type: "inline-image", attrs: {src: "https://example.test/photo.png", width: 320, height: 180}}]},
        {type: "caption", children: [{type: "caption-paragraph", runs: [{text: "Caption", marks: {italic: true}}]}]},
    ]},
    {type: "callout", attrs: {tone: "warn"}, children: [p("Nested")]},
    {type: "divider"},
]});

test("Lexical full demo schema roundtrip preserves every model node, mark, attribute, and hidden cell", () => {
    const json = toLexicalJSON(info, fixture);
    assert.deepEqual(fromLexicalJSON(info, json), fixture);
    assert.ok(JSON.stringify(json).includes('"doc-sync-element"'));
    assert.ok(JSON.stringify(json).includes('"doc-sync-leaf"'));
    assert.ok(JSON.stringify(json).includes('"spanned":true'));
    const e = editor();
    e.update(() => $toLexical(info, fixture), {discrete: true});
    e.getEditorState().read(() => {
        const table = $getRoot().getChildren().find($isTableNode)!;
        const row = table.getFirstChild();
        assert.ok($isTableRowNode(row));
        const a = row.getFirstChild();
        assert.ok($isTableCellNode(a));
        assert.equal(a.getColSpan(), 2);
        assert.equal(a.getRowSpan(), 2);
        assert.equal(a.getBackgroundColor(), "#ff0000");
        assert.equal(a.getHeaderStyles(), 1);
    });
});

test("Lexical schema mappings support renamed types and native text/table creation", () => {
    const renamed = {root: "body", marks: ["bold"], nodes: {
        body: {shape: "flow", children: ["note"], default: "note"},
        note: {shape: "text", attrs: {tone: {default: "plain", values: ["plain", "loud"]}}},
    }} as const;
    const mapped = buildLexicalSchema(renamed);
    const model = canonical(renamed, {type: "body", children: [{type: "note", attrs: {tone: "loud"}, runs: [{text: "Hello", marks: {bold: true}}]}]});
    assert.deepEqual(fromLexicalJSON(mapped, toLexicalJSON(mapped, model)), model);
    const e = editor();
    e.update(() => {
        $getRoot().append($createParagraphNode().append($createTextNode("Native")), $createTableNodeWithDimensions(2, 2, false));
    }, {discrete: true});
    const actual = e.getEditorState().read(() => $fromLexical(info));
    assert.equal(actual.children![0].runs![0] && "text" in actual.children![0].runs![0] ? actual.children![0].runs![0].text : null, "Native");
    assert.equal(actual.children![1].type, "table");
    assert.equal(actual.children![1].children!.length, 2);
});

test("Lexical custom boolean/value marks and block attributes survive JSON and native text edits", () => {
    const schema = {root: "body", marks: ["bold", "custom"], markValues: {color: {default: "", inherit: true}}, nodes: {
        body: {shape: "flow", children: ["note"], default: "note", attrs: {label: {default: ""}}},
        note: {shape: "text", attrs: {level: {default: 0}}},
    }} as const;
    const mapped = buildLexicalSchema(schema);
    const model = canonical(schema, {type: "body", attrs: {label: "Document"}, children: [{type: "note", attrs: {level: 3}, runs: [
        {text: "A", marks: {custom: true, color: "red"}}, {text: "B", marks: {color: "blue"}},
    ]}]});
    assert.deepEqual(fromLexicalJSON(mapped, toLexicalJSON(mapped, model)), model);
    const e = createEditor({nodes: mapped.nodes, onError: error => { throw error; }});
    e.update(() => $toLexical(mapped, model), {discrete: true});
    e.update(() => {
        const first = $getRoot().getFirstChild();
        assert.ok($isElementNode(first));
        const text = first.getFirstChild();
        assert.ok($isTextNode(text));
        text.setTextContent("AX");
    }, {discrete: true});
    const after = e.getEditorState().read(() => $fromLexical(mapped));
    assert.equal(after.attrs, undefined);
    assert.deepEqual(after.children![0].attrs, {level: 3});
    assert.deepEqual(after.children![0].runs, [{text: "AX", marks: {custom: true, color: "red"}}, {text: "B", marks: {color: "blue"}}]);
});

test("Lexical selection maps nested spans, inline nodes, UTF16, and table bodies", () => {
    const e = editor();
    const model = canonical(DEMO_SCHEMA, {type: "content", children: [
        {type: "paragraph", runs: [{text: "A😀", marks: {}}, {type: "inline-hyperlink", attrs: {url: "https://example.test"}, runs: [{text: "BC", marks: {}}]}, {type: "inline-image", attrs: {src: "https://example.test/a"}}]},
        {type: "table", children: [{type: "table-row", children: [cell("Cell")]}]},
    ]});
    e.update(() => {
        $toLexical(info, model);
        const range = {anchor: [0, 4], focus: [1, 0, 0, 0, 0, 2]};
        assert.equal($setLexicalSelection(info, range), true);
        assert.deepEqual($lexicalSelection(info), range);
    }, {discrete: true});
});

test("Lexical rejects unknown native nodes, CSS styles, unsupported formats, and bad mappings", () => {
    assert.throws(() => buildLexicalSchema(DEMO_SCHEMA, {paragraph: "divider"}), /requires text shape/);
    assert.throws(() => toLexicalJSON(info, {type: "content", attrs: {label: "unsupported"}, children: [p("X")]}), /Root attributes/);
    const json = toLexicalJSON(info, {type: "content", children: [p("X")]});
    json.root.children[0].type = "not-registered";
    assert.throws(() => fromLexicalJSON(info, json), /not-registered/);
    const e = editor();
    e.update(() => $getRoot().append($createParagraphNode().append($createTextNode("X").setStyle("color:red"))), {discrete: true});
    assert.throws(() => e.getEditorState().read(() => $fromLexical(info)), /CSS text styles/);
    e.update(() => {
        $getRoot().clear().append($createParagraphNode().append($createTextNode("X").toggleFormat("code")));
    }, {discrete: true});
    assert.throws(() => e.getEditorState().read(() => $fromLexical(info)), /Unsupported native text format: code/);
});

test("Lexical codecs extend native inline content without flattening its attributes", () => {
    const schema = {root: "body", marks: [], nodes: {
        body: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text", children: ["break"]},
        break: {shape: "inline", attrs: {label: {default: ""}}},
    }} as const;
    const mapped = buildLexicalSchema(schema, {codecs: [{
        toLexical: model => !("text" in model) && model.type === "break"
            ? $setModelData($createLineBreakNode(), {type: "break", shape: "inline", attrs: model.attrs}) : null,
        fromLexical: node => $isLineBreakNode(node) ? {type: "break", attrs: $modelData(node)?.attrs} : null,
    }]});
    const model = canonical(schema, {type: "body", children: [{type: "paragraph", runs: [{text: "A", marks: {}}, {type: "break", attrs: {label: "kept"}}, {text: "B", marks: {}}]}]});
    assert.deepEqual(fromLexicalJSON(mapped, toLexicalJSON(mapped, model)), model);
});
