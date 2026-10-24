import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, $getRoot, $isElementNode, $isTextNode} from "lexical";
import {registerTablePlugin, $isTableNode, $isTableCellNode, $computeTableMapSkipCellCheck, $unmergeCellNode} from "@lexical/table";
import {canonical} from "../src/crdt/model.ts";
import {buildLexicalSchema, $toLexical, $fromLexical, $setLexicalSelection, $lexicalSelection, fromLexicalJSON, $createModelNode, $setModelData} from "../src/lexical/index.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {NodeJSON} from "../src/crdt/model.ts";

const p = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const cell = (text: string): NodeJSON => ({type: "table-cell", children: [{type: "table-cell-body", children: [p(text)]}]});
const info = buildLexicalSchema(DEMO_SCHEMA);
const fixture = (rows: number, cols: number) => canonical(DEMO_SCHEMA, merged(rows, cols));
function merged(rows: number, cols: number): NodeJSON {
    const table: NodeJSON = {type: "table", attrs: {header: true}, children: Array.from({length: 3}, (_, r) => ({type: "table-row", children: Array.from({length: 3}, (_, c) => cell(`${r}:${c}`))}))};
    table.children![0].children![0].attrs = {rowspan: rows, colspan: cols, backgroundColor: "#ff0000"};
    return {type: "content", children: [p("before"), table, p("after")]};
}
for (const [rows, cols] of [[1, 2], [2, 1], [2, 2], [3, 3]]) test(`Lexical table plugin preserves ${rows}x${cols} merge geometry and serialized hidden cells`, () => {
    const model = fixture(rows, cols);
    const editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    const stop = registerTablePlugin(editor);
    try {
        editor.update(() => $toLexical(info, model), {discrete: true});
        assert.deepEqual(editor.getEditorState().read(() => $fromLexical(info)), model);
        assert.deepEqual(fromLexicalJSON(info, editor.getEditorState().toJSON()), model);
        editor.getEditorState().read(() => {
            const table = $getRoot().getChildAtIndex(1); assert.ok($isTableNode(table));
            const [map] = $computeTableMapSkipCellCheck(table, null, null);
            assert.deepEqual(map.map(row => row.length), [3, 3, 3]);
            assert.equal(table.getChildren().reduce((n, row) => n + ($isElementNode(row) ? row.getChildrenSize() : 0), 0), 9 - (rows * cols - 1));
        });
    } finally { stop(); }
});

test("Lexical merged-grid visible cell selection uses full-grid coordinates and rejects hidden content", () => {
    const model = fixture(2, 2);
    const editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    const stop = registerTablePlugin(editor);
    try {
        editor.update(() => {
            $toLexical(info, model);
            const range = {anchor: [1, 1, 2, 0, 0, 1], focus: [1, 1, 2, 0, 0, 3]};
            assert.equal($setLexicalSelection(info, range), true);
            assert.deepEqual($lexicalSelection(info), range);
            const selected = $getRoot().getChildAtIndex(1); assert.ok($isTableNode(selected));
            const row = selected.getChildAtIndex(1); assert.ok($isElementNode(row));
            const nativeCell = row.getFirstChild(); assert.ok($isTableCellNode(nativeCell));
            assert.equal(nativeCell.getTextContent(), "1:2");
            assert.equal($setLexicalSelection(info, {anchor: [1, 1, 1, 0, 0, 0], focus: [1, 1, 1, 0, 0, 0]}), false);
        }, {discrete: true});
        editor.update(() => {
            const table = $getRoot().getChildAtIndex(1); assert.ok($isTableNode(table));
            const row = table.getChildAtIndex(1); assert.ok($isElementNode(row));
            const c = row.getFirstChild(); assert.ok($isElementNode(c));
            const paragraph = c.getFirstChild(); assert.ok($isElementNode(paragraph));
            const text = paragraph.getFirstChild(); assert.ok($isTextNode(text)); text.setTextContent("changed");
        }, {discrete: true});
        const expected = structuredClone(model); expected.children![1].children![1].children![2].children![0].children = [p("changed")];
        assert.deepEqual(editor.getEditorState().read(() => $fromLexical(info)), expected);
    } finally { stop(); }
});

for (const order of [0, 1]) test(`Lexical merged binding preserves concurrent hidden edits and history, receipt order ${order}`, async () => {
    const {MemoryNet} = await import("./harness.ts");
    const {LexicalBinding, readLexicalModel} = await import("../src/lexical/index.ts");
    const {registerRichText} = await import("@lexical/rich-text");
    const net = new MemoryNet(), a = net.add("merge"), b = net.add("hidden");
    a.connect(); b.connect(); await net.settle();
    a.commit(a.doc.edit([{op: "insert", at: [1], content: [merged(1, 1).children![1]]}]).ops); await net.settle(); a.clearHistory(); b.clearHistory();
    const editors = [a, b].map(() => createEditor({nodes: info.nodes, onError: error => { throw error; }}));
    const stops = editors.flatMap(editor => [registerTablePlugin(editor), registerRichText(editor)]);
    const bindings = [a, b].map((client, i) => new LexicalBinding(client, editors[i], info));
    const check = () => {
        for (const [i, client] of [a, b].entries()) {
            assert.deepEqual(readLexicalModel(editors[i], info), net.hub.doc.toJSON());
            assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON());
            assert.equal(client.pending.length, 0);
            assert.equal(client.eventStats.fallbacks, 0);
        }
    };
    const merge = () => a.commit(a.doc.edit([{op: "update", at: [1, 0, 0], attrs: {rowspan: 2, colspan: 2}}]).ops);
    const foreign = () => b.commit(b.doc.edit([{op: "insert", at: [1, 1, 1, 0, 0, 1], content: "X"}, {op: "update", at: [1, 1, 1, 0, 0, 0], length: 1, attrs: {bold: true}}]).ops);
    try {
        if (order) { foreign(); merge(); } else { merge(); foreign(); }
        await net.settle(); check();
        const hidden = structuredClone(a.doc.toJSON().children![1].children![1].children![1].children![0]);
        assert.ok(a.doc.toJSON().children![1].children![1].children![1].attrs?.spanned);
        bindings[0].undo(); await net.settle(); check();
        assert.deepEqual(a.doc.toJSON().children![1].children![1].children![1].children![0], hidden);
        bindings[0].redo(); await net.settle(); check();
        // A remote edit to already hidden text refreshes serialized NodeState.
        b.commit(b.doc.edit([{op: "insert", at: [1, 1, 1, 0, 0, 0], content: "Y"}]).ops); await net.settle(); check();
        const json = editors[0].getEditorState().toJSON();
        assert.deepEqual(fromLexicalJSON(info, json), a.doc.toJSON());
        // Native unmerge creates blank cells; retained payload restores their text.
        editors[0].update(() => {
            const table = $getRoot().getChildAtIndex(1); assert.ok($isTableNode(table));
            const row = table.getFirstChild(); assert.ok($isElementNode(row));
            const master = row.getFirstChild(); assert.ok($isTableCellNode(master));
            $unmergeCellNode(master);
        }, {discrete: true});
        await net.settle(); check();
        assert.equal(a.doc.toJSON().children![1].children![1].children![1].attrs?.spanned, undefined);
        assert.deepEqual(a.doc.toJSON().children![1].children![1].children![1].children![0].children![0].runs, [{text: "Y", marks: {}}, {text: "1", marks: {bold: true}}, {text: "X:1", marks: {}}]);
    } finally { bindings.forEach(binding => binding.dispose()); stops.forEach(stop => stop()); }
});

test("PM reference roundtrip preserves hidden cell attributes, rich content, and output isolation", async () => {
    const {buildPmSchema, fromPmJSON, toPmJSON} = await import("../src/pm/index.ts");
    const schema = structuredClone(DEMO_SCHEMA);
    schema.nodes["table-cell"].attrs!.metadata = {default: {label: ""}, fields: {label: {default: ""}}};
    const mapped = buildPmSchema(schema), model = fixture(2, 2);
    const hidden = model.children![1].children![1].children![1];
    hidden.attrs = {...hidden.attrs, backgroundColor: "#00ff00", metadata: {label: "retained"}};
    hidden.children![0].children = [{type: "paragraph", runs: [{text: "hidden", marks: {bold: true}}, {type: "inline-hyperlink", attrs: {url: "https://example.test"}, runs: [{text: "link", marks: {italic: true}}]}]}];
    const expected = canonical(schema, model);
    const json = mapped.pm.nodeFromJSON(toPmJSON(schema, expected)).toJSON();
    const result = fromPmJSON(mapped, schema, json, expected);
    assert.deepEqual(canonical(schema, result), expected);
    (result.children![1].children![1].children![1].attrs!.metadata as {label: string}).label = "mutated";
    assert.deepEqual(expected.children![1].children![1].children![1].attrs!.metadata, {label: "retained"});
    result.children![1].children![1].children![1].children![0].children![0].runs = [];
    assert.equal(expected.children![1].children![1].children![1].children![0].children![0].runs!.length, 2);
});

for (const axis of ["row", "column"] as const) test(`Lexical native ${axis} insertion before a merge remaps retained hidden cells`, async () => {
    const {$insertTableRowAtNode, $insertTableColumnAtNode} = await import("@lexical/table");
    const model = fixture(2, 2); model.children![1].attrs = {header: false};
    const editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    const stop = registerTablePlugin(editor);
    try {
        editor.update(() => $toLexical(info, model), {discrete: true});
        editor.update(() => {
            const table = $getRoot().getChildAtIndex(1); assert.ok($isTableNode(table));
            const row = table.getFirstChild(); assert.ok($isElementNode(row));
            const master = row.getFirstChild(); assert.ok($isTableCellNode(master));
            if (axis === "row") $insertTableRowAtNode(master, false);
            else $insertTableColumnAtNode(master, false, false);
        }, {discrete: true});
        const actual = editor.getEditorState().read(() => $fromLexical(info));
        const table = actual.children![1], hidden = table.children![axis === "row" ? 2 : 1].children![axis === "column" ? 2 : 1];
        assert.ok(hidden.attrs?.spanned);
        assert.deepEqual(hidden.children![0].children![0].runs, [{text: "1:1", marks: {}}]);
        assert.deepEqual(fromLexicalJSON(info, editor.getEditorState().toJSON()), actual);
        assert.deepEqual(table.children!.map(row => row.children!.length), axis === "row" ? [3, 3, 3, 3] : [4, 4, 4]);
    } finally { stop(); }
});


test("Lexical reads legacy serialized full grids without losing covered content", () => {
    const model = fixture(2, 2), editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    editor.update(() => {
        $toLexical(info, model);
        const table = $getRoot().getChildAtIndex(1); assert.ok($isTableNode(table));
        $setModelData(table, {type: "table", shape: "grid", attrs: {header: true}});
        table.clear().append(...model.children![1].children!.map(row => $createModelNode(info, row)));
        const first = table.getFirstChild(); assert.ok($isElementNode(first));
        first.getChildren().forEach(cell => { assert.ok($isTableCellNode(cell)); cell.setHeaderStyles(1); });
    }, {discrete: true});
    assert.deepEqual(fromLexicalJSON(info, editor.getEditorState().toJSON()), model);
});
