import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {Client, clientOwner} from '@barocss/doc-sync/client';
import {LocalClient} from '@barocss/doc-sync/local';
import {bundleClientDemo} from '../client/build.mjs';
import {startClientPreview} from '../client/serve.mjs';
import {CLIENT_SCHEMA, seedEdits, seedEditsForSize, SEED_TEXT, textOf} from '../client/model.js';

test('Client demo local seed has a real local backend, rich text, and no sync runtime state', () => {
    const client = new Client({schema: CLIENT_SCHEMA, actor: 'client-demo-test'});
    try {
        client.edit(seedEdits(), null); client.clearHistory();
        assert.equal(client.mode, 'local'); assert.equal(client.sync, null);
        const owner = clientOwner(client); assert.ok(owner instanceof LocalClient);
        for (const field of ['seq', 'serverSeq', 'outbox', 'transport', 'ackTimer', 'others']) assert.equal(field in owner, false, field);
        assert.equal(textOf(client.model()), `${SEED_TEXT}\nKeep your notes here.`);
        assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
        const run = client.model().children![1].runs![0]; assert.ok('text' in run); assert.equal(run.marks?.bold, true);
    } finally { client.dispose(); }
});

test('Client demo bundles all public client bindings without a caller host factory', async () => {
    const bundle = await bundleClientDemo({write: false});
    const emitted = bundle.proof.emittedInputs.map(({input}) => input);
    for (const name of ['prosemirror', 'slate', 'lexical', 'tiptap']) assert.ok(emitted.some(input => input.includes(`packages/doc-sync-${name}/dist/`)), name);
    assert.ok(emitted.some(input => input.endsWith('/dist/client/index.js')));
    assert.ok(!emitted.some(input => /packages\/doc-sync\/src\//.test(input)));
    const source = await readFile(new URL('../client/main.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /create(?:Local|SyncClient)?EditorHost|HostBinding/);
    for (const binding of ['PmBinding', 'SlateBinding', 'LexicalBinding']) assert.match(source, new RegExp(`new ${binding}\\(peer.client`));
    assert.match(source, /DocSync\.configure\(\{client: peer\.client/);
});

test('Client preview serves both modes with static routes and no document API', async t => {
    const preview = await startClientPreview(); t.after(() => preview.close());
    for (const mode of ['local', 'sync']) {
        const response = await fetch(`${preview.address}/?mode=${mode}`);
        assert.equal(response.status, 200); assert.match(await response.text(), /One Client, four editors/);
        assert.match(response.headers.get('content-security-policy')!, /connect-src 'none'/);
    }
    for (const path of ['/bundle.js', '/style.css', '/metafile.json']) assert.equal((await fetch(preview.address + path)).status, 200);
    assert.equal((await fetch(preview.address + '/events')).status, 404);
    assert.equal((await fetch(preview.address + '/api/docs/test', {method: 'POST', body: '{}'})).status, 405);
});


test('Client demo large fixtures have exact payload size and 100-character paragraphs', () => {
    for (const size of [10000, 100000] as const) {
        const client = new LocalClient({schema: CLIENT_SCHEMA, actor: `size-${size}`});
        try {
            client.edit(seedEditsForSize(size), null);
            const paragraphs = client.model().children!;
            assert.equal(paragraphs.length, size / 100);
            assert.equal(textOf(client.model()).replace(/\n/g, '').length, size);
            for (const paragraph of paragraphs) assert.equal(textOf({type: 'content', children: [paragraph]}).length, 100);
        } finally { client.dispose(); }
    }
    assert.throws(() => seedEditsForSize(123 as 10000), /Unsupported/);
});
