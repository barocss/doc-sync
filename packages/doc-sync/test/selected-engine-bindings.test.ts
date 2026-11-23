import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor as createSlateEditor, Transforms} from "slate";
import {createEditor as createLexicalEditor, $getSelection, $isRangeSelection} from "lexical";
import {registerRichText} from "@lexical/rich-text";
import {PmBinding, buildPmSchema} from "../../doc-sync-prosemirror/dist/index.js";
import {SlateBinding, fromSlate} from "../../doc-sync-slate/dist/index.js";
import {LexicalBinding, buildLexicalSchema, readLexicalModel, $setLexicalSelection} from "../../doc-sync-lexical/dist/index.js";
import {typescriptClientEngineFactory} from "../../doc-sync-core/dist/engine/index.js";
import type {ClientEngineFactory} from "../../doc-sync-core/dist/engine/index.js";
import {SyncClient} from "../../doc-sync-core/dist/sync/index.js";
import {DocHub} from "../../doc-sync-core/dist/server/index.js";
import {Doc} from "../../doc-sync-core/dist/crdt/doc.js";
import type {Transport} from "../../doc-sync-core/dist/sync/index.js";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

/** Hide concrete TS access so a host cannot silently bypass the selected port. */
function setup() {
    const calls: string[] = [], hub = new DocHub({schema: DEMO_SCHEMA});
    const wrap = <T extends object>(target: T, prefix = ""): T => new Proxy(target, {get(value, key) {
        if (String(key).startsWith("typescript") || String(key).includes("TypeScript")) return undefined;
        const member = Reflect.get(value, key, value);
        if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
            calls.push(`${prefix}${String(key)}`); const result = member.apply(value, args);
            return key === "createSession" ? wrap(result, "session.") : result;
        };
    }});
    const factory: ClientEngineFactory = {...typescriptClientEngineFactory, create(actor, schema) {
        calls.push("create"); return wrap(typescriptClientEngineFactory.create(actor, schema));
    }};
    const transport: Transport = {
        subscribe: (since, receive, epoch) => { receive(hub.hello(since, epoch)); return hub.listen(receive); },
        send: async message => { if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); }, sendPresence: () => {},
    };
    const client = new SyncClient("native-selected", transport, {schema: DEMO_SCHEMA, engineFactory: factory, ackDelay: 0});
    client.connect();
    const count = (name: string) => calls.filter(call => call === name).length;
    const remote = () => {
        const doc = Doc.fromSnapshot("peer", hub.doc.snapshot(), DEMO_SCHEMA);
        hub.submit({actor: "peer", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "R"}]).ops});
    };
    return {client, hub, calls, count, remote};
}
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise<void>(resolve => setTimeout(resolve, 0)); };

test("real PM native transactions use selected portable engine for edits receive and history", async t => {
    const s = setup(), binding = new PmBinding(s.client, buildPmSchema(DEMO_SCHEMA));
    t.after(() => { binding.dispose(); s.client.disconnect(); });
    assert.equal(binding.client, s.client); assert.throws(() => s.client.doc, /TypeScript|compatib|document/i);
    s.calls.length = 0;
    binding.dispatch(binding.state.tr.insertText("A😀B", 1)); await settle();
    assert.ok(s.count("apply") + s.count("applyModelEdits") > 0); assert.equal(s.count("record"), 1);
    assert.equal(binding.state.doc.textContent, "A😀B");
    s.remote(); await settle(); assert.ok(s.count("receive")); assert.equal(binding.state.doc.textContent, "RA😀B");
    binding.undo(); await settle(); assert.ok(s.count("undo")); assert.equal(binding.state.doc.textContent, "R");
    binding.redo(); await settle(); assert.ok(s.count("redo")); assert.equal(binding.state.doc.textContent, "RA😀B");
    assert.equal(s.count("record"), 1); assert.deepEqual(s.client.engine.model(), s.hub.doc.toJSON());
});

test("real Slate composition uses selected session and retains concurrent remote edit", async t => {
    const s = setup(), editor = createSlateEditor(), binding = new SlateBinding(s.client, editor);
    t.after(() => { binding.dispose(); s.client.disconnect(); }); await settle();
    assert.equal(binding.client, s.client); s.calls.length = 0;
    Transforms.select(editor, {path: [0, 0], offset: 0}); binding.beginComposition();
    Transforms.insertText(editor, "한"); await settle(); Transforms.insertText(editor, "글"); await settle();
    assert.ok(s.count("session.applyModelEdits") + s.count("session.apply") > 0);
    assert.equal(s.count("record"), 0); s.remote(); await settle(); assert.ok(s.count("receive"));
    binding.endComposition(); await settle(); assert.equal(s.count("session.publish"), 1); assert.equal(s.count("record"), 1);
    assert.deepEqual(fromSlate(DEMO_SCHEMA, editor.children), s.hub.doc.toJSON());
    binding.undo(); await settle(); assert.ok(s.count("undo"));
    binding.redo(); await settle(); assert.ok(s.count("redo")); assert.deepEqual(fromSlate(DEMO_SCHEMA, editor.children), s.hub.doc.toJSON());
});

test("real Lexical composition uses selected session and retains concurrent remote edit", async t => {
    const s = setup(), info = buildLexicalSchema(DEMO_SCHEMA), editor = createLexicalEditor({nodes: info.nodes, onError: error => { throw error; }});
    const stop = registerRichText(editor), binding = new LexicalBinding(s.client, editor, info);
    t.after(() => { binding.dispose(); stop(); s.client.disconnect(); });
    assert.equal(binding.client, s.client); s.calls.length = 0; binding.beginComposition();
    const type = (offset: number, content: string) => editor.update(() => {
        assert.ok($setLexicalSelection(info, {anchor: [0, offset], focus: [0, offset]}));
        const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.insertText(content);
    }, {discrete: true});
    type(0, "한"); type(1, "글");
    assert.ok(s.count("session.applyModelEdits") + s.count("session.apply") > 0); assert.equal(s.count("record"), 0);
    s.remote(); await settle(); assert.ok(s.count("receive")); binding.endComposition(); await settle();
    assert.equal(s.count("session.publish"), 1); assert.equal(s.count("record"), 1);
    assert.deepEqual(readLexicalModel(editor, info), s.hub.doc.toJSON());
    binding.undo(); await settle(); assert.ok(s.count("undo")); binding.redo(); await settle(); assert.ok(s.count("redo"));
    assert.deepEqual(readLexicalModel(editor, info), s.hub.doc.toJSON());
});
