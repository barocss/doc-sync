import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LocalClient} from '@barocss/doc-sync-core/local';
import {bundleLocalDemo} from '../local/build.mjs';
import {startLocalPreview} from '../local/serve.mjs';
import {LOCAL_SCHEMA, seedEdits, SEED_TEXT, textOf} from '../local/model.js';

test('local demo seed has independent documents, rich marks and empty history', () => {
    const clients = ['one', 'two', 'three'].map(actor => new LocalClient({schema: LOCAL_SCHEMA, actor}));
    try {
        for (const client of clients) { client.edit(seedEdits(), null); client.clearHistory(); }
        const initial = structuredClone(clients[0].model());
        assert.equal(textOf(initial), `${SEED_TEXT}\nKeep your notes here.`);
        const richRun = initial.children![1].runs![0];
        assert.ok('text' in richRun); assert.equal(richRun.marks?.bold, true);
        for (const client of clients) assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
        clients[0].edit([{op: 'insert', at: [0, 0], content: 'Local '}]);
        assert.notDeepEqual(clients[0].model(), initial);
        for (const client of clients.slice(1)) assert.deepEqual(client.model(), initial);
        clients[0].undo(); assert.deepEqual(clients[0].model(), initial);
        clients[0].redo(); assert.match(textOf(clients[0].model()), /^Local /);
    } finally { clients.forEach(client => client.dispose()); }
});

test('browser bundle uses public built local entry and emits no sync client, transport or document server', async () => {
    const bundle = await bundleLocalDemo();
    assert.deepEqual(bundle.proof.forbidden, []);
    const emitted = bundle.proof.emittedInputs.map(({input}) => input);
    assert.ok(emitted.some(input => input.endsWith('/dist/local/client.js')));
    for (const framework of ['prosemirror', 'slate', 'lexical']) assert.ok(emitted.some(input => input.includes(`packages/doc-sync-${framework}/dist/host-binding.js`)));
    assert.ok(!emitted.some(input => /packages\/doc-sync-core\/src\//.test(input)));
    const code = bundle.outputFiles.find(output => output.path.endsWith('bundle.js'))!.text;
    assert.doesNotMatch(code, /new (?:SyncClient|HttpTransport|WebSocket|EventSource)\(/);
});

test('loopback preview serves only fixed assets and rejects document operations', async t => {
    const preview = await startLocalPreview(); t.after(() => preview.close());
    assert.match(preview.address, /^http:\/\/127\.0\.0\.1:/);
    const page = await fetch(preview.address);
    assert.equal(page.status, 200); assert.match(await page.text(), /Local document editors/);
    assert.match(page.headers.get('content-security-policy')!, /connect-src 'none'/);
    for (const path of ['/bundle.js', '/bundle.js.map', '/style.css', '/metafile.json', '/bundle-proof.json']) {
        const response = await fetch(preview.address + path); assert.equal(response.status, 200, path);
    }
    for (const path of ['/api/docs/test/state', '/events', '/test/seed', '/..%2Fpackage.json']) {
        assert.equal((await fetch(preview.address + path)).status, 404, path);
        assert.equal((await fetch(preview.address + path, {method: 'POST', body: '{}'})).status, 405, path);
    }
    const head = await fetch(preview.address + '/bundle.js', {method: 'HEAD'}); assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
