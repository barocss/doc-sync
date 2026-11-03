import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LocalClient, createLocalEditorHost} from '@barocss/doc-sync/local';
import {bundleLocalDemo} from '../local/build.mjs';
import {startLocalPreview} from '../local/serve.mjs';
import {LOCAL_SCHEMA, SHARED_SCHEMA, seedEdits, sharedSeedEdits, SEED_TEXT, textOf} from '../local/model.js';

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

test('shared plain-text seed supports separate host origins, one history, and full document replacement', () => {
    let client = new LocalClient({schema: SHARED_SCHEMA, actor: 'shared-test'});
    const initialize = () => { client.edit(sharedSeedEdits(), null); client.clearHistory(); };
    initialize();
    let hosts = Array.from({length: 4}, () => createLocalEditorHost(client));
    let releases: (() => void)[] = [];
    try {
        const seed = structuredClone(client.model());
        assert.equal(textOf(seed), `${SEED_TEXT}\nKeep your notes here.`);
        assert.deepEqual(SHARED_SCHEMA.marks, []);
        for (const paragraph of seed.children!) {
            assert.equal(paragraph.type, 'paragraph');
            for (const run of paragraph.runs!) {
                assert.ok('text' in run);
                assert.ok(!run.marks || Object.keys(run.marks).length === 0);
            }
        }
        const updates = [0, 0, 0, 0];
        releases = hosts.map((host, index) => host.subscribe({modelEvents() { updates[index]++; }}));
        const ops = hosts[0].apply([{op: 'insert', at: [1, 4], content: ' shared'}]); hosts[0].commit(ops);
        assert.equal(updates[0], 0); // Native author already applied its edit.
        assert.ok(updates.slice(1).every(count => count > 0));
        assert.ok(hosts.every(host => host.historyStatus().canUndo));
        hosts[3].undo(); assert.deepEqual(client.model(), seed);
        hosts[2].redo(); assert.match(textOf(client.model()), /Keep shared/);
        // Reset releases all old views before disposal; all new hosts borrow one fresh client.
        releases.forEach(release => release()); releases = []; client.dispose();
        client = new LocalClient({schema: SHARED_SCHEMA, actor: 'shared-test'}); initialize();
        hosts = Array.from({length: 4}, () => createLocalEditorHost(client));
        assert.ok(hosts.every(host => host.client === client));
        assert.deepEqual(client.model(), seed);
        assert.deepEqual(client.historyStatus(), {canUndo: false, canRedo: false});
    } finally { releases.forEach(release => release()); client.dispose(); }
});

test('browser bundle uses public built local entry and emits no sync client, transport or document server', async () => {
    const bundle = await bundleLocalDemo();
    assert.deepEqual(bundle.proof.forbidden, []);
    const emitted = bundle.proof.emittedInputs.map(({input}) => input);
    assert.ok(emitted.some(input => input.endsWith('/dist/local/client.js')));
    for (const framework of ['prosemirror', 'slate', 'lexical']) assert.ok(emitted.some(input => input.includes(`packages/doc-sync-${framework}/dist/host-binding.js`)));
    assert.ok(!emitted.some(input => /packages\/doc-sync\/src\//.test(input)));
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
