import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor as createSlateEditor} from "slate";
import {createEditor as createLexicalEditor, $getRoot} from "lexical";
import {registerRichText} from "@lexical/rich-text";
import {SlateBinding, fromSlate} from "../src/slate/index.ts";
import {LexicalBinding, buildLexicalSchema, readLexicalModel} from "../src/lexical/index.ts";
import {PRODUCT_MODELS} from "../../../fixtures/product-documents.ts";
import {PRODUCT_SCHEMAS} from "../../../fixtures/product-schemas.ts";
import {MemoryNet, tick} from "./harness.ts";

const targets = {word: [1, 0], notion: [5, 0], presentation: [2, 1, 0]};
for (const profile of ["word", "notion", "presentation"] as const) {
    for (const engine of ["Slate", "Lexical"] as const) test(`${engine} ${profile}: remote projection retains unchanged blocks through text, ack, insert and delete`, async () => {
        const schema = PRODUCT_SCHEMAS[profile], net = new MemoryNet({clientSchema: schema});
        const a = net.add("native"), b = net.add("remote");
        a.connect(); b.connect(); await net.settle();
        const seed = PRODUCT_MODELS[profile];
        b.commit(b.doc.edit([{op: "delete", at: [0], count: b.doc.toJSON().children!.length}, {op: "insert", at: [0], content: structuredClone(seed.children!)}]).ops);
        await net.settle();
        const errors: Error[] = [];
        const slate = createSlateEditor(), info = buildLexicalSchema(schema), lexical = createLexicalEditor({nodes: info.nodes, onError: error => { throw error; }});
        const stop = registerRichText(lexical);
        const binding = engine === "Slate" ? new SlateBinding(a, slate, {onError: error => errors.push(error)}) : new LexicalBinding(a, lexical, {info, onError: error => errors.push(error)});
        const identities = () => engine === "Slate" ? [...slate.children] : lexical.getEditorState().read(() => $getRoot().getChildren().map(node => node.getKey()));
        const equal = () => {
            assert.deepEqual(engine === "Slate" ? fromSlate(schema, slate.children) : readLexicalModel(lexical, info), a.doc.toJSON());
            assert.deepEqual(a.doc.toJSON(), b.doc.toJSON());
            assert.deepEqual(a.doc.toJSON(), net.hub.doc.toJSON());
            assert.deepEqual(errors, []);
            assert.equal(a.eventStats.fallbacks, 0);
        };
        try {
            const before = identities(), target = targets[profile];
            b.commit(b.doc.edit([{op: "insert", at: [...target, 1], content: "😀"}, {op: "update", at: [...target, 0], length: 1, attrs: {bold: true}}]).ops);
            await net.settle(); await tick(); equal();
            const after = identities();
            const block = target.reduce((node, index) => node.children![index], a.doc.toJSON());
            assert.equal((block.runs![0] as {marks: {bold?: boolean}}).marks.bold, true);
            for (let index = 0; index < before.length; index++) if (index !== target[0]) assert.equal(after[index], before[index]);
            if (binding instanceof SlateBinding) { binding.sync(); binding.sync(); } else { binding.pull(); binding.pull(); }
            assert.deepEqual(identities(), after);
            const last = structuredClone(a.doc.toJSON().children!.at(-1)!);
            b.commit(b.doc.edit([{op: "insert", at: [after.length], content: [last]}]).ops);
            await net.settle(); equal();
            for (let index = 0; index < after.length; index++) assert.equal(identities()[index], after[index]);
            b.commit(b.doc.edit([{op: "delete", at: [after.length], count: 1}]).ops);
            await net.settle(); equal();
            assert.deepEqual(identities(), after);
        } finally {
            if (binding instanceof SlateBinding) binding.destroy(); else binding.dispose();
            stop(); a.disconnect(); b.disconnect();
        }
    });
}
