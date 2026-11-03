import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor as createSlateEditor, Transforms} from "slate";
import {createEditor as createLexicalEditor, $getSelection, $isRangeSelection} from "lexical";
import {registerRichText} from "@lexical/rich-text";
import {TextSelection} from "prosemirror-state";
import {LocalClient, createLocalEditorHost} from "../../doc-sync/dist/local/index.js";
import {PmHostBinding, buildPmSchema} from "../../doc-sync-prosemirror/dist/index.js";
import {SlateHostBinding, fromSlate} from "../../doc-sync-slate/dist/index.js";
import {LexicalHostBinding, buildLexicalSchema, readLexicalModel, $setLexicalSelection} from "../../doc-sync-lexical/dist/index.js";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const settle = async () => { for (let n = 0; n < 4; n++) await new Promise<void>(resolve => setTimeout(resolve, 0)); };
const expectedText = (text: string) => ({type: "content", children: [{type: "paragraph", runs: text ? [{text, marks: {}}] : []}]});
function setup() {
    const client = new LocalClient({schema: DEMO_SCHEMA, actor: "native-local"});
    const host = createLocalEditorHost(client);
    return {client, host};
}

test("local PM native dispatch, external edit, selection and history preserve exact model", t => {
    const {client, host} = setup(), binding = new PmHostBinding(host, buildPmSchema(DEMO_SCHEMA));
    t.after(() => binding.dispose());
    assert.equal(binding.host, host);
    binding.dispatch(binding.state.tr.insertText("A😀B", 1));
    assert.deepEqual(client.model(), expectedText("A😀B"));
    assert.equal(binding.state.doc.textContent, "A😀B", "native commit must not echo itself");
    binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, 4)));
    const stamp = host.stamp();
    client.edit([{op: "insert", at: [0, 0], content: "R"}]);
    assert.ok(host.stamp().revision > stamp.revision);
    assert.equal(binding.state.doc.textContent, "RA😀B", "external client edit reaches mounted binding");
    assert.equal(binding.state.selection.head, 5, "external insert preserves token selection");
    binding.undo(); assert.equal(binding.state.doc.textContent, "A😀B");
    binding.redo(); assert.equal(binding.state.doc.textContent, "RA😀B");
    assert.deepEqual(client.model(), expectedText("RA😀B"));
});

test("local PM combined transaction commits multiple applies once without self echo", t => {
    const {client, host} = setup(), binding = new PmHostBinding(host, buildPmSchema(DEMO_SCHEMA));
    t.after(() => binding.dispose());
    let events = 0;
    const stop = client.subscribe({modelEvents: () => {events++;}}); t.after(stop);
    binding.dispatch(binding.state.tr.insertText("ab", 1).insertText("cd", 3));
    assert.deepEqual(client.model(), expectedText("abcd"));
    assert.equal(binding.state.doc.textContent, "abcd");
    assert.equal(binding.stats.remote, 0, "own commit cannot pull back into native state");
    const stamp = host.stamp();
    assert.deepEqual(host.apply([]), []); host.commit([]);
    assert.deepEqual(host.stamp(), stamp);
    client.edit([{op: "insert", at: [0, 4], content: "!"}]);
    assert.equal(binding.state.doc.textContent, "abcd!");
    assert.ok(events > 0, "external edit emits model events");
    binding.undo(); assert.equal(binding.state.doc.textContent, "abcd");
    binding.undo(); assert.equal(binding.state.doc.textContent, "", "combined transaction has one history record");
});

test("local Slate composition publishes once and retains external edit", async t => {
    const {client, host} = setup(), editor = createSlateEditor(), binding = new SlateHostBinding(host, editor);
    t.after(() => binding.dispose()); await settle();
    Transforms.select(editor, {path: [0, 0], offset: 0}); binding.beginComposition();
    Transforms.insertText(editor, "한"); await settle();
    Transforms.insertText(editor, "글"); await settle();
    assert.deepEqual(client.model(), expectedText(""), "composition draft remains private");
    client.edit([{op: "insert", at: [0, 0], content: "R"}]); await settle();
    binding.endComposition(); await settle();
    const published = client.model();
    assert.deepEqual(fromSlate(DEMO_SCHEMA, editor.children), published);
    assert.equal(published.children![0].runs!.map(run => "text" in run ? run.text : "").join("").replace("R", ""), "한글");
    assert.ok(editor.selection, "native selection survives publication");
    binding.undo(); await settle(); assert.deepEqual(client.model(), expectedText("R"), "one undo removes the full composition only");
    binding.redo(); await settle(); assert.deepEqual(client.model(), published);
    assert.deepEqual(fromSlate(DEMO_SCHEMA, editor.children), published);
});

test("local Lexical composition publishes once and retains external edit", async t => {
    const {client, host} = setup(), info = buildLexicalSchema(DEMO_SCHEMA);
    const editor = createLexicalEditor({nodes: info.nodes, onError: error => {throw error;}});
    const stop = registerRichText(editor), binding = new LexicalHostBinding(host, editor, info);
    t.after(() => {binding.dispose(); stop();});
    binding.beginComposition();
    const type = (offset: number, content: string) => editor.update(() => {
        assert.ok($setLexicalSelection(info, {anchor: [0, offset], focus: [0, offset]}));
        const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.insertText(content);
    }, {discrete: true});
    type(0, "한"); type(1, "글");
    assert.deepEqual(client.model(), expectedText(""), "composition draft remains private");
    client.edit([{op: "insert", at: [0, 0], content: "R"}]); await settle();
    binding.endComposition(); await settle();
    const published = client.model();
    assert.deepEqual(readLexicalModel(editor, info), published);
    assert.equal(published.children![0].runs!.map(run => "text" in run ? run.text : "").join("").replace("R", ""), "한글");
    editor.getEditorState().read(() => assert.ok($isRangeSelection($getSelection()), "native selection survives publication"));
    binding.undo(); await settle(); assert.deepEqual(client.model(), expectedText("R"), "one undo removes the full composition only");
    binding.redo(); await settle(); assert.deepEqual(client.model(), published);
    assert.deepEqual(readLexicalModel(editor, info), published);
});

for (const [label, anchor, head] of [["forward", 1, 2], ["backward", 2, 1], ["caret", 2, 2]] as const) {
    test(`local PM retains ${label} token selection when the same prefix is inserted twice`, t => {
        const {client, host} = setup();
        client.edit([{op: "insert", at: [0, 0], content: "Local A😀B"}], null);
        const binding = new PmHostBinding(host, buildPmSchema(DEMO_SCHEMA));
        t.after(() => { binding.dispose(); client.dispose(); });
        binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, anchor + 1, head + 1)));
        assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
        client.edit([{op: "insert", at: [0, 0], content: "Local "}]);
        assert.deepEqual(client.model(), expectedText("Local Local A😀B"));
        assert.equal(binding.state.doc.textContent, "Local Local A😀B");
        assert.equal(binding.state.selection.anchor, anchor + 7);
        assert.equal(binding.state.selection.head, head + 7);
        binding.undo();
        assert.deepEqual(client.model(), expectedText("Local A😀B"));
        assert.equal(binding.state.doc.textContent, "Local A😀B");
        assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: true}, "selection restoration creates no history record");
        binding.redo();
        assert.deepEqual(client.model(), expectedText("Local Local A😀B"));
        assert.equal(binding.state.doc.textContent, "Local Local A😀B");
        assert.deepEqual(client.notificationErrors, []);
    });
}
