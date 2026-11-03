import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEditor, $getSelection, $isRangeSelection} from 'lexical';
import {registerRichText} from '@lexical/rich-text';
import {Client} from '@barocss/doc-sync/client';
import {LexicalBinding, buildLexicalSchema, readLexicalModel, $setLexicalSelection, $lexicalSelection} from '../../doc-sync-lexical/dist/index.js';
import {PmBinding, buildPmSchema} from '../../doc-sync-prosemirror/dist/index.js';
import {MemoryNet} from './harness.ts';
import type {Transport} from '@barocss/doc-sync/sync';

for (const unified of [false, true]) for (const bold of [false, true]) for (const replace of [false, true]) test(`Lexical ${unified ? 'Client' : 'SyncClient'} ${bold ? 'bold' : 'plain'} ${replace ? 'range replacement' : 'prefix'} retains foreign identities under undo`, async t => {
    const net = new MemoryNet();
    const raw = [net.add('intent-pm'), net.add('intent-lexical')];
    const clients = unified ? raw.map(client => new Client({schema: net.schema, actor: client.actor, transport: Reflect.get(client, 'transport') as Transport, syncOptions: {ackDelay: 0}})) : raw;
    clients.forEach(client => client.connect()); await net.settle();
    const backends = clients.map(client => client instanceof Client ? client.sync! : client);
    backends[0].commit(backends[0].engine.apply([{op: 'insert', at: [0, 0], content: 'Edit this document.'}, ...(bold ? [{op: 'update' as const, at: [0, 0], length: 19, attrs: {bold: true}}] : [])]), null);
    await net.settle();
    const pm = new PmBinding(clients[0], buildPmSchema(net.schema));
    const info = buildLexicalSchema(net.schema);
    const editor = createEditor({nodes: info.nodes, onError: error => { throw error; }});
    const stop = registerRichText(editor), lexical = new LexicalBinding(clients[1], editor, {info, groupTyping: false});
    t.after(() => { pm.dispose(); lexical.dispose(); stop(); clients.forEach(client => client.disconnect()); });
    const prefixA = 'actor😀A ', prefixB = 'actor😀B ';
    const seedAnchor = backends[0].engine.captureAnchor([0, 1]);
    pm.dispatch(pm.state.tr.insertText(prefixA, 1)); await net.settle();
    editor.update(() => { $setLexicalSelection(info, {anchor: [0, 0], focus: [0, replace ? prefixA.length : 0]}); }, {discrete: true});
    editor.update(() => {
        const selection = $getSelection(); assert.ok($isRangeSelection(selection)); selection.setFormat(bold ? 1 : 0); selection.insertText(prefixB);
    }, {discrete: true}); await net.settle();
    const text = () => pm.state.doc.textContent;
    const equal = () => {
        assert.deepEqual(readLexicalModel(editor, info), backends[1].engine.model());
        for (const backend of backends) { assert.deepEqual(backend.engine.model(), net.hub.doc.toJSON()); assert.equal(backend.pending.length, 0); }
    };
    const combined = `${prefixB}${replace ? '' : prefixA}Edit this document.`;
    assert.equal(text(), combined); equal();
    const run = readLexicalModel(editor, info).children![0].runs![0]; assert.ok('text' in run);
    assert.equal(!!run.marks.bold, bold);
    lexical.undo(); await net.settle(); assert.equal(text(), `${prefixA}Edit this document.`); equal();
    lexical.redo(); await net.settle(); assert.equal(text(), combined); equal();
    assert.deepEqual(editor.getEditorState().read(() => $lexicalSelection(info)), {anchor: [0, prefixB.length], focus: [0, prefixB.length]});
    pm.undo(); await net.settle();
    assert.equal(text(), `${prefixB}Edit this document.`); equal();
    assert.deepEqual(backends[0].engine.locateAnchor(seedAnchor!, "visible"), [0, prefixB.length + 1]);
    const preserved = readLexicalModel(editor, info).children![0].runs![0]; assert.ok('text' in preserved); assert.equal(!!preserved.marks.bold, bold);
});
