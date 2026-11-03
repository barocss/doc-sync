import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor, Transforms} from "slate";
import {Client} from "../../doc-sync/dist/client/index.js";
import {SyncClient} from "../../doc-sync/dist/sync/index.js";
import type {Transport} from "../../doc-sync/dist/sync/index.js";
import {DocHub} from "../../doc-sync/dist/server/index.js";
import {PmBinding, buildPmSchema} from "../../doc-sync-prosemirror/dist/index.js";
import {SlateBinding, fromSlate, slateRangeToModel} from "../../doc-sync-slate/dist/index.js";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise<void>(resolve => setTimeout(resolve, 0)); };

for (const api of ["legacy", "unified"] as const) for (const marked of [false, true]) for (const replacement of [false, true]) test(`${api} Slate preserves repeated-prefix native token ownership${marked ? " with marks" : ""}${replacement ? " during replacement" : ""}`, async () => {
    const hub = new DocHub({schema: DEMO_SCHEMA});
    const transport = (): Transport => ({
        subscribe(since, receive, epoch) { receive(hub.hello(since, epoch)); return hub.listen(receive); },
        async send(message) { if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence() {},
    });
    const a = api === "unified" ? new Client({schema: DEMO_SCHEMA, actor: "actor-A", transport: transport()}) : new SyncClient("actor-A", transport(), {schema: DEMO_SCHEMA});
    const b = api === "unified" ? new Client({schema: DEMO_SCHEMA, actor: "actor-B", transport: transport()}) : new SyncClient("actor-B", transport(), {schema: DEMO_SCHEMA});
    a.connect(); b.connect(); await settle();
    const pm = new PmBinding(a, buildPmSchema(DEMO_SCHEMA)), editor = createEditor(), slate = new SlateBinding(b, editor, {groupTyping: false});
    const model = () => api === "unified" ? (a as Client).model() : (a as SyncClient).doc.toJSON();
    const equal = (expected: string) => {
        assert.equal(pm.state.doc.textContent, expected);
        assert.deepEqual(fromSlate(DEMO_SCHEMA, editor.children), model());
        assert.deepEqual(model(), hub.doc.toJSON());
    };
    try {
        pm.dispatch(pm.state.tr.insertText("😀Edit this document.", 1)); await settle(); a.clearHistory();
        pm.dispatch(pm.state.tr.insertText("actor😀A ", 3)); await settle();
        Transforms.select(editor, replacement ? {anchor: {path: [0, 0], offset: 2}, focus: {path: [0, 0], offset: 11}} : {path: [0, 0], offset: 2});
        if (marked) editor.addMark("bold", true);
        editor.insertText("actor😀B "); await settle();
        const inserted = model().children![0].runs!.find(run => "text" in run && run.text.includes("actor😀B "));
        assert.ok(inserted && "text" in inserted);
        assert.deepEqual(inserted.marks, marked ? {bold: true} : {});
        equal(replacement ? "😀actor😀B Edit this document." : "😀actor😀B actor😀A Edit this document.");
        pm.undo(); await settle(); equal("😀actor😀B Edit this document.");
        assert.deepEqual(slateRangeToModel(DEMO_SCHEMA, editor.children, editor.selection)?.focus, [0, 11]);
        slate.undo(); await settle(); equal("😀Edit this document.");
        slate.redo(); await settle(); equal("😀actor😀B Edit this document.");
        pm.redo(); await settle(); equal(replacement ? "😀actor😀B Edit this document." : "😀actor😀B actor😀A Edit this document.");
    } finally { pm.dispose(); slate.dispose(); a.disconnect(); b.disconnect(); }
});
