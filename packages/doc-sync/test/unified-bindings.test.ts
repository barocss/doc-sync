import assert from "node:assert/strict";
import {test} from "node:test";
import {TextSelection} from "prosemirror-state";
import {createEditor as createSlateEditor, Transforms} from "slate";
import {createEditor as createLexicalEditor, $getSelection, $isRangeSelection} from "lexical";
import {registerRichText} from "@lexical/rich-text";
import {Client} from "../../doc-sync-core/dist/client/index.js";
import type {BindingClient} from "../../doc-sync-core/dist/client/index.js";
import {LocalClient} from "../../doc-sync-core/dist/local/index.js";
import {DocHub} from "../../doc-sync-core/dist/server/index.js";
import type {Transport} from "../../doc-sync-core/dist/sync/index.js";
import {PmBinding, buildPmSchema} from "../../doc-sync-prosemirror/dist/index.js";
import {SlateBinding, fromSlate, slateRangeToModel} from "../../doc-sync-slate/dist/index.js";
import {LexicalBinding, buildLexicalSchema, readLexicalModel, $setLexicalSelection, $lexicalSelection} from "../../doc-sync-lexical/dist/index.js";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const settle = async () => { for (let n = 0; n < 4; n++) await new Promise<void>(resolve => setTimeout(resolve, 0)); };
const text = (client: Client | LocalClient) => client.model().children?.[0].runs?.map(run => "text" in run ? run.text : "").join("");
type View = {binding: {client: BindingClient; host: object; undo(): void; redo(): void; dispose(): void}; text(): string; select(offset: number): void; selection(): number; type(content: string): void};
function view(kind: "PM" | "Slate" | "Lexical", client: Client | LocalClient): View {
    if (kind === "PM") {
        const binding = new PmBinding(client, buildPmSchema(client.schema));
        return {binding, text: () => binding.state.doc.textContent,
            select: offset => binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, offset + 1))),
            selection: () => binding.state.selection.head - 1,
            type: content => binding.dispatch(binding.state.tr.insertText(content))};
    }
    if (kind === "Slate") {
        const editor = createSlateEditor(), binding = new SlateBinding(client, editor, {groupTyping: false});
        return {binding, text: () => fromSlate(client.schema, editor.children).children?.[0].runs?.map(run => "text" in run ? run.text : "").join("") ?? "",
            select: offset => Transforms.select(editor, {path: [0, 0], offset}),
            selection: () => slateRangeToModel(client.schema, editor.children, editor.selection)?.focus[1] ?? -1,
            type: content => Transforms.insertText(editor, content)};
    }
    const info = buildLexicalSchema(client.schema), editor = createLexicalEditor({nodes: info.nodes, onError: error => { throw error; }});
    const stop = registerRichText(editor), binding = new LexicalBinding(client, editor, {info, groupTyping: false});
    const dispose = binding.dispose.bind(binding); binding.dispose = () => { dispose(); stop(); };
    assert.equal(binding.input, binding.session);
    return {binding, text: () => readLexicalModel(editor, info).children?.[0].runs?.map(run => "text" in run ? run.text : "").join("") ?? "",
        select: offset => editor.update(() => { $setLexicalSelection(info, {anchor: [0, offset], focus: [0, offset]}); }, {discrete: true}),
        selection: () => editor.getEditorState().read(() => $lexicalSelection(info)?.focus[1] ?? -1, {editor}),
        type: content => editor.update(() => { const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.insertText(content); }, {discrete: true})};
}

for (const mode of ["memory", "transport", "legacy-local"] as const) {
    for (const kind of ["PM", "Slate", "Lexical"] as const) test(`${kind} accepts ${mode} client directly and keeps shared views, selection and one history action`, async t => {
        const hub = new DocHub({schema: DEMO_SCHEMA});
        let sends = 0;
        const transport: Transport = {
            subscribe(since, receive, epoch) { receive(hub.hello(since, epoch)); return hub.listen(receive); },
            async send(message) { if (message.kind === "change") { sends++; hub.submit(message.change); } else hub.ack(message.ack); },
            sendPresence() {},
        };
        const client = mode === "legacy-local" ? new LocalClient({schema: DEMO_SCHEMA})
            : new Client({schema: DEMO_SCHEMA, ...(mode === "transport" ? {transport, actor: `${kind}-unified`, syncOptions: {ackDelay: 0}} : {})});
        t.after(() => { client.clearHistory(); client.dispose(); });
        if (mode === "transport") { (client as Client).connect(); await settle(); }
        client.edit([{op: "insert", at: [0, 0], content: "AB"}]); await settle();
        const first = view(kind, client), second = view(kind, client);
        t.after(() => { first.binding.dispose(); second.binding.dispose(); });
        await settle();
        assert.equal(first.binding.client, client); assert.equal(second.binding.client, client);
        assert.notEqual(first.binding.host, second.binding.host);
        first.select(1); await settle();
        client.edit([{op: "insert", at: [0, 0], content: "X"}]); await settle();
        assert.equal(first.text(), "XAB"); assert.equal(second.text(), "XAB"); assert.equal(first.selection(), 2);
        const before = sends;
        first.type("!"); await settle();
        assert.equal(text(client), "XA!B"); assert.equal(first.text(), "XA!B"); assert.equal(second.text(), "XA!B");
        if (mode === "transport") assert.equal(sends - before, 1);
        first.binding.undo(); await settle(); assert.equal(first.text(), "XAB"); assert.equal(second.text(), "XAB");
        second.binding.redo(); await settle(); assert.equal(first.text(), "XA!B"); assert.equal(second.text(), "XA!B");
        first.binding.undo(); await settle();
        first.binding.undo(); await settle(); assert.equal(first.text(), "AB"); assert.equal(second.text(), "AB");
        first.binding.undo(); await settle(); assert.equal(first.text(), ""); assert.equal(second.text(), "");
        assert.equal(client.historyStatus().canUndo, false);
        if (mode === "transport") assert.deepEqual(client.model(), hub.doc.toJSON());
    });
}
