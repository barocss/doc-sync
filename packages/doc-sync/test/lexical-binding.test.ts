import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, TextNode, $getRoot, $getSelection, $isRangeSelection, $isElementNode, $isTextNode, INSERT_PARAGRAPH_COMMAND, UNDO_COMMAND, REDO_COMMAND} from "lexical";
import {registerRichText} from "@lexical/rich-text";
import {$isTableNode, $isTableRowNode, $isTableCellNode} from "@lexical/table";
import {buildLexicalSchema, LexicalBinding, readLexicalModel, $setLexicalSelection, $lexicalSelection} from "../src/lexical/index.ts";
import {MemoryNet} from "./harness.ts";
import type {LexicalEditor} from "lexical";
import type {LexicalSchemaInfo} from "../src/lexical/index.ts";

const content = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent());
const type = (editor: LexicalEditor, info: LexicalSchemaInfo, path: number[], value: string) => editor.update(() => {
    assert.equal($setLexicalSelection(info, {anchor: path, focus: path}), true);
    const selection = $getSelection();
    assert.ok($isRangeSelection(selection));
    selection.insertText(value);
}, {discrete: true});
const setup = async (text = "abc") => {
    const net = new MemoryNet();
    const clients = [net.add("lexical-a"), net.add("lexical-b")];
    clients.forEach(client => client.connect());
    await net.settle();
    const info = buildLexicalSchema(net.schema);
    const editors = clients.map(() => createEditor({nodes: info.nodes, onError: error => { throw error; }}));
    const rich = editors.map(editor => registerRichText(editor));
    const bindings = clients.map((client, index) => new LexicalBinding(client, editors[index], info));
    if (text) { type(editors[0], info, [0, 0], text); await net.settle(); }
    return {net, clients, editors, bindings, info, dispose: () => { bindings.forEach(binding => binding.dispose()); rich.forEach(stop => stop()); }};
};
const equal = (state: Awaited<ReturnType<typeof setup>>) => {
    for (let index = 0; index < 2; index++) {
        assert.deepEqual(readLexicalModel(state.editors[index], state.info), state.clients[index].doc.toJSON());
        assert.deepEqual(state.clients[index].doc.toJSON(), state.net.hub.doc.toJSON());
        assert.equal(state.clients[index].pending.length, 0);
    }
};

test("Lexical binding applies actual native edits, receives remotely, and does not echo", async () => {
    const s = await setup();
    let remoteCommits = 0;
    const commit = s.clients[1].commit.bind(s.clients[1]);
    s.clients[1].commit = (...args) => { remoteCommits++; commit(...args); };
    type(s.editors[0], s.info, [0, 1], "😀");
    await s.net.settle();
    assert.equal(content(s.editors[0]), "a😀bc");
    assert.equal(content(s.editors[1]), "a😀bc");
    assert.equal(remoteCommits, 0);
    equal(s); s.dispose();
});

test("Lexical remote insert remaps both token selection ends across native replacement", async () => {
    const s = await setup("abcdef");
    s.editors[1].update(() => { $setLexicalSelection(s.info, {anchor: [0, 2], focus: [0, 5]}); }, {discrete: true});
    type(s.editors[0], s.info, [0, 1], "X");
    await s.net.settle();
    assert.deepEqual(s.editors[1].getEditorState().read(() => $lexicalSelection(s.info)), {anchor: [0, 3], focus: [0, 6]});
    equal(s); s.dispose();
});

test("Lexical native split preserves concurrent tail input", async () => {
    const s = await setup("abcd");
    s.editors[0].update(() => { $setLexicalSelection(s.info, {anchor: [0, 2], focus: [0, 2]}); }, {discrete: true});
    s.editors[0].dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    s.editors[0].update(() => {}, {discrete: true});
    type(s.editors[1], s.info, [0, 3], "X");
    await s.net.settle();
    const model = s.clients[0].doc.toJSON();
    assert.equal(model.children!.length, 2);
    assert.deepEqual(model.children!.map(block => block.runs), [[{text: "ab", marks: {}}], [{text: "cXd", marks: {}}]]);
    equal(s); s.dispose();
});

test("Lexical undo/redo commands use CRDT history and preserve another actor's text", async () => {
    const s = await setup("");
    type(s.editors[0], s.info, [0, 0], "A"); await s.net.settle();
    type(s.editors[1], s.info, [0, 1], "B"); await s.net.settle();
    s.editors[0].dispatchCommand(UNDO_COMMAND, undefined); await s.net.settle();
    assert.equal(content(s.editors[0]), "B");
    s.editors[0].dispatchCommand(REDO_COMMAND, undefined); await s.net.settle();
    assert.equal(content(s.editors[0]), "AB");
    equal(s); s.dispose();
});

test("Lexical composition stages original token edits while receiving remote changes", async () => {
    const s = await setup();
    s.clients[0].clearHistory();
    s.bindings[0].beginComposition();
    type(s.editors[0], s.info, [0, 2], "Y");
    assert.equal(content(s.editors[0]), "abYc");
    assert.equal(s.clients[0].pending.length, 0);
    const firstRun = s.clients[0].doc.toJSON().children![0].runs![0];
    assert.equal("text" in firstRun ? firstRun.text : null, "abc");
    type(s.editors[1], s.info, [0, 1], "X"); await s.net.settle();
    assert.equal(content(s.editors[0]), "abYc");
    assert.equal(s.bindings[0].input.active, true);
    const committed = s.bindings[0].endComposition();
    assert.ok(committed.length);
    await s.net.settle();
    assert.equal(content(s.editors[0]), "aXbYc");
    s.bindings[0].undo(); await s.net.settle();
    assert.equal(content(s.editors[0]), "aXbc");
    s.bindings[0].redo(); await s.net.settle();
    assert.equal(content(s.editors[0]), "aXbYc");
    equal(s); s.dispose();
});

test("Lexical composition cancellation and empty reset discard drafts", async () => {
    const s = await setup("");
    s.bindings[0].beginComposition();
    type(s.editors[0], s.info, [0, 0], "Draft");
    s.bindings[0].cancelComposition();
    assert.equal(content(s.editors[0]), "");
    assert.equal(s.clients[0].pending.length, 0);
    s.bindings[0].beginComposition();
    type(s.editors[0], s.info, [0, 0], "Stale");
    s.net.hub.reset(); s.net.down(); await s.net.settle();
    assert.equal(s.bindings[0].input.active, false);
    assert.equal(content(s.editors[0]), "");
    assert.deepEqual(s.bindings[0].endComposition(), []);
    type(s.editors[0], s.info, [0, 0], "New"); await s.net.settle();
    assert.equal(content(s.editors[1]), "New");
    equal(s); s.dispose();
});

test("Lexical disposal removes only owned registrations and preserves application callbacks", async () => {
    const s = await setup();
    const client = s.clients[0];
    s.bindings[0].dispose();
    let updates = 0;
    const callback = () => updates++;
    client.onUpdate = callback;
    const binding = new LexicalBinding(client, s.editors[0], s.info);
    binding.dispose(); binding.dispose();
    assert.equal(client.onUpdate, callback);
    const previous = client.doc.toJSON();
    type(s.editors[0], s.info, [0, 0], "Detached");
    assert.deepEqual(client.doc.toJSON(), previous);
    assert.equal(updates, 0);
    type(s.editors[1], s.info, [0, 0], "Remote"); await s.net.settle();
    assert.equal(content(s.editors[0]), "Detachedabc");
    assert.equal(updates > 0, true);
    s.dispose();
});


test("Lexical same-boundary concurrent Enter creates one visible split", async () => {
    const s = await setup("abcd");
    for (const editor of s.editors) {
        editor.update(() => { $setLexicalSelection(s.info, {anchor: [0, 2], focus: [0, 2]}); }, {discrete: true});
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
        editor.update(() => {}, {discrete: true});
    }
    await s.net.settle();
    assert.deepEqual(s.clients[0].doc.toJSON().children!.map(block => block.runs), [[{text: "ab", marks: {}}], [{text: "cd", marks: {}}]]);
    equal(s); s.dispose();
});

test("Lexical initial pull creates an editable empty paragraph and rejects missing registrations", async () => {
    const s = await setup("");
    assert.equal(s.editors[0].getEditorState().read(() => $getRoot().getChildrenSize()), 1);
    assert.throws(() => new LexicalBinding(s.clients[0], createEditor()), /Register buildLexicalSchema/);
    s.dispose();
});

test("Lexical native Enter preserves schema attribute inheritance", async () => {
    const schema = {root: "body", marks: [], nodes: {
        body: {shape: "flow", children: ["note"], default: "note"},
        note: {shape: "text", attrs: {level: {default: 0, inherit: true}, transient: {default: ""}}},
    }} as const;
    const net = new MemoryNet({clientSchema: schema});
    const client = net.add("inherit"); client.connect(); await net.settle();
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "AB"}, {op: "update", at: [0], attrs: {level: 2, transient: "first"}}]).ops);
    await net.settle();
    const mapped = buildLexicalSchema(schema);
    const e = createEditor({nodes: mapped.nodes, onError: error => { throw error; }});
    const rich = registerRichText(e), binding = new LexicalBinding(client, e, mapped);
    e.update(() => { $setLexicalSelection(mapped, {anchor: [0, 1], focus: [0, 1]}); }, {discrete: true});
    e.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    e.update(() => {}, {discrete: true}); await net.settle();
    assert.deepEqual(client.doc.toJSON().children!.map(node => node.attrs), [{level: 2, transient: "first"}, {level: 2, transient: ""}]);
    assert.deepEqual(readLexicalModel(e, mapped), client.doc.toJSON());
    binding.undo(); await net.settle();
    assert.equal(content(e), "AB");
    binding.dispose(); rich();
});

test("Lexical native span restoration preserves hidden cells and refreshes their model metadata", async () => {
    const s = await setup("");
    const p = (text: string) => ({type: "paragraph", runs: [{text, marks: {}}]});
    const cell = (text: string, attrs: Record<string, unknown> = {}) => ({type: "table-cell", attrs, children: [{type: "table-cell-body", children: [p(text)]}]});
    s.clients[0].commit(s.clients[0].doc.edit([{op: "insert", at: [1], content: [{type: "table", attrs: {header: true}, children: [
        {type: "table-row", children: [cell("A", {colspan: 2, rowspan: 2, backgroundColor: "#ff0000"}), cell("B", {spanned: true})]},
        {type: "table-row", children: [cell("C", {spanned: true}), cell("D", {spanned: true})]},
    ]}]}]).ops);
    await s.net.settle();
    s.editors[0].update(() => {
        const table = $getRoot().getChildren().find($isTableNode)!;
        const row = table.getFirstChild(); assert.ok($isTableRowNode(row));
        const a = row.getFirstChild(); assert.ok($isTableCellNode(a));
        a.setColSpan(1); a.setRowSpan(1); a.setBackgroundColor("#00ff00");
    }, {discrete: true});
    await s.net.settle();
    const table = s.clients[0].doc.toJSON().children![1];
    assert.equal(table.attrs?.header, true);
    const cells = table.children!.flatMap(row => row.children!);
    assert.deepEqual(cells.map(cell => cell.children![0].children![0].runs), ["A", "B", "C", "D"].map(text => [{text, marks: {}}]));
    assert.equal(cells[0].attrs?.backgroundColor, "#00ff00");
    assert.ok(cells.every(cell => !cell.attrs?.spanned));
    s.editors[0].update(() => { assert.equal($setLexicalSelection(s.info, {anchor: [1, 0, 1, 0, 0, 1], focus: [1, 0, 1, 0, 0, 1]}), true); }, {discrete: true});
    equal(s); s.dispose();
});

test("Lexical contiguous native typing is one undo group with exact start and end carets", async () => {
    const s = await setup("");
    type(s.editors[0], s.info, [0, 0], "a");
    type(s.editors[0], s.info, [0, 1], "b");
    type(s.editors[0], s.info, [0, 2], "c");
    await s.net.settle();
    s.bindings[0].undo(); await s.net.settle();
    assert.equal(content(s.editors[0]), "");
    assert.deepEqual(s.editors[0].getEditorState().read(() => $lexicalSelection(s.info)), {anchor: [0, 0], focus: [0, 0]});
    s.bindings[0].redo(); await s.net.settle();
    assert.equal(content(s.editors[0]), "abc");
    assert.deepEqual(s.editors[0].getEditorState().read(() => $lexicalSelection(s.info)), {anchor: [0, 3], focus: [0, 3]});
    equal(s); s.dispose();
});

test("Lexical undo/redo restores exact token caret after a remote prefix insertion", async () => {
    const s = await setup("seed");
    s.clients[0].clearHistory();
    type(s.editors[0], s.info, [0, 2], "a");
    type(s.editors[0], s.info, [0, 3], "b");
    await s.net.settle();
    type(s.editors[1], s.info, [0, 0], "X"); await s.net.settle();
    assert.equal(content(s.editors[0]), "Xseabed");
    s.bindings[0].undo(); await s.net.settle();
    assert.equal(content(s.editors[0]), "Xseed");
    assert.deepEqual(s.editors[0].getEditorState().read(() => $lexicalSelection(s.info)), {anchor: [0, 3], focus: [0, 3]});
    s.bindings[0].redo(); await s.net.settle();
    assert.equal(content(s.editors[0]), "Xseabed");
    assert.deepEqual(s.editors[0].getEditorState().read(() => $lexicalSelection(s.info)), {anchor: [0, 5], focus: [0, 5]});
    equal(s); s.dispose();
});

test("Lexical editor ownership and failed-constructor cleanup preserve existing listeners", async () => {
    const s = await setup();
    assert.throws(() => new LexicalBinding(s.clients[0], s.editors[0], s.info), /already owns/);
    s.bindings[0].dispose();
    const register = s.editors[0].registerRootListener.bind(s.editors[0]);
    s.editors[0].registerRootListener = () => { throw new Error("fixture registration failure"); };
    const update = s.clients[0].onUpdate, model = s.clients[0].onModelEvents, event = s.clients[0].onEvent;
    assert.throws(() => new LexicalBinding(s.clients[0], s.editors[0], s.info), /fixture registration failure/);
    assert.equal(s.clients[0].onUpdate, update);
    assert.equal(s.clients[0].onModelEvents, model);
    assert.equal(s.clients[0].onEvent, event);
    s.editors[0].registerRootListener = register;
    const binding = new LexicalBinding(s.clients[0], s.editors[0], s.info);
    binding.dispose();
    const previous = s.clients[0].doc.toJSON();
    type(s.editors[0], s.info, [0, 0], "No listener");
    assert.deepEqual(s.clients[0].doc.toJSON(), previous);
    s.dispose();
});

for (const throwing of [false, true]) test(`Lexical recovers rejected native input before ${throwing ? "throwing" : "returning from"} its error callback`, async () => {
    const s = await setup();
    s.bindings[0].dispose();
    const errors: string[] = [];
    const nativeErrors: string[] = [];
    s.editors[0] = createEditor({nodes: s.info.nodes, onError: error => { nativeErrors.push(error.message); }});
    const binding = new LexicalBinding(s.clients[0], s.editors[0], {
        info: s.info,
        onError: error => {
            errors.push(error.message);
            assert.equal(binding.input.active, false);
            assert.deepEqual(readLexicalModel(s.editors[0], s.info), s.clients[0].doc.toJSON());
            assert.equal(s.clients[0].pending.length, 0);
            if (throwing) throw error;
        },
    });
    let commits = 0;
    const commit = s.clients[0].commit.bind(s.clients[0]);
    s.clients[0].commit = (...args) => { commits++; commit(...args); };
    try {
        binding.beginComposition();
        type(s.editors[0], s.info, [0, 1], "draft");
        const invalid = () => s.editors[0].update(() => {
            const text = $getRoot().getFirstDescendant();
            assert.ok($isTextNode(text));
            text.setStyle("color: red");
        }, {discrete: true});
        if (throwing) assert.throws(invalid, /Native CSS text styles/); else invalid();
        assert.deepEqual(errors, ["Native CSS text styles require an explicit Lexical codec"]);
        assert.deepEqual(nativeErrors, []);
        assert.equal(binding.input.active, false);
        assert.equal(content(s.editors[0]), "abc");
        assert.deepEqual(readLexicalModel(s.editors[0], s.info), s.clients[0].doc.toJSON());
        assert.equal(s.clients[0].pending.length, 0);
        assert.equal(commits, 0);
        type(s.editors[1], s.info, [0, 1], "X");
        await s.net.settle();
        assert.equal(content(s.editors[0]), "aXbc");
        assert.equal(commits, 0);
        type(s.editors[0], s.info, [0, 4], "Y");
        await s.net.settle();
        assert.equal(content(s.editors[0]), "aXbcY");
        assert.equal(commits, 1);
        equal(s);
    } finally { binding.dispose(); s.dispose(); }
});

test("Lexical native sibling reorder preserves token identity and remote edits through undo", async () => {
    const s = await setup("abc");
    const [a, b] = s.clients;
    try {
        a.commit(a.doc.edit([{op: "insert", at: [1], content: [{type: "paragraph", runs: [{text: "second", marks: {}}]}]}]).ops);
        await s.net.settle(); a.clearHistory();
        const textIds = a.doc.lines().flatMap(line => line.items.filter(item => item.kind === "char").map(item => item.key)).sort();
        s.editors[0].update(() => {
            const root = $getRoot();
            root.getFirstChild()!.insertBefore(root.getLastChild()!);
        }, {discrete: true});
        assert.ok(a.pending[0].ops.some(op => op.t === "move"));
        assert.equal(a.pending[0].ops.some(op => op.t === "text" || op.t === "del"), false);
        await s.net.settle(); equal(s);
        const texts = () => a.doc.toJSON().children!.map(node => (node.runs ?? []).map(run => "text" in run ? run.text : "").join(""));
        assert.deepEqual(texts(), ["second", "abc"]);
        assert.deepEqual(a.doc.lines().flatMap(line => line.items.filter(item => item.kind === "char").map(item => item.key)).sort(), textIds);
        b.commit(b.doc.edit([{op: "insert", at: [0, 1], content: "X"}]).ops); await s.net.settle();
        s.bindings[0].undo(); await s.net.settle(); equal(s);
        assert.deepEqual(texts(), ["abc", "sXecond"]);
        s.bindings[0].redo(); await s.net.settle(); equal(s);
        assert.deepEqual(texts(), ["sXecond", "abc"]);
    } finally { s.dispose(); s.clients.forEach(client => client.disconnect()); }
});

test("Lexical native reparent retains content tokens inside nested flows", async () => {
    const s = await setup("root");
    const [a] = s.clients;
    try {
        const box = (value: string) => ({type: "callout", children: [{type: "paragraph", runs: [{text: value, marks: {}}]}]});
        a.commit(a.doc.edit([{op: "insert", at: [1], content: [box("left"), box("right")]}]).ops);
        await s.net.settle(); a.clearHistory();
        const textIds = a.doc.lines().flatMap(line => line.items.filter(item => item.kind === "char").map(item => item.key)).sort();
        const positions = a.doc.toJSON().children!.flatMap((node, index) => node.type === "callout" ? [index] : []);
        s.editors[0].update(() => {
            const source = $getRoot().getChildAtIndex(positions[0]), target = $getRoot().getChildAtIndex(positions[1]);
            assert.ok($isElementNode(source) && $isElementNode(target));
            target.append(source.getFirstChild()!);
        }, {discrete: true});
        assert.ok(a.pending[0].ops.some(op => op.t === "move"));
        assert.equal(a.pending[0].ops.some(op => op.t === "text" || op.t === "del"), false);
        await s.net.settle(); equal(s);
        const model = a.doc.toJSON();
        const boxes = model.children!.filter(node => node.type === "callout");
        assert.deepEqual(boxes[0].children![0].runs, []);
        assert.deepEqual(boxes[1].children!.map(node => node.runs), [[{text: "right", marks: {}}], [{text: "left", marks: {}}]]);
        assert.deepEqual(a.doc.lines().flatMap(line => line.items.filter(item => item.kind === "char").map(item => item.key)).sort(), textIds);
        s.bindings[0].undo(); await s.net.settle(); equal(s);
        assert.deepEqual(a.doc.toJSON().children!.filter(node => node.type === "callout")[0].children![0].runs, [{text: "left", marks: {}}]);
    } finally { s.dispose(); s.clients.forEach(client => client.disconnect()); }
});


test("Lexical projection cache uses actual readback after an application transform", async () => {
    const s = await setup();
    let rewrite = true;
    const stop = s.editors[1].registerNodeTransform(TextNode, node => {
        if (rewrite && node.getTextContent().includes("X")) {
            rewrite = false;
            node.setTextContent(node.getTextContent() + "!");
        }
    });
    try {
        type(s.editors[0], s.info, [0, 1], "X");
        await s.net.settle();
        assert.equal(rewrite, false);
        assert.equal(content(s.editors[1]), "aXbc");
        equal(s);
    } finally { stop(); s.dispose(); }
});
