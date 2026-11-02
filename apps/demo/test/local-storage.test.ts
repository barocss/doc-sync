import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from '@barocss/doc-sync-core/client';
import {saveLocal, openLocal, forgetLocal} from '../client/local-storage.mjs';
import {CLIENT_SCHEMA, seedEdits, textOf} from '../client/model.js';

function memoryStorage() {
    let bytes: string | null = null;
    let blocked = false;
    return {
        getItem: (_key: string) => bytes,
        setItem: (_key: string, value: string) => { if (blocked) throw Error('Quota exceeded'); bytes = value; },
        removeItem: (_key: string) => { if (blocked) throw Error('Storage denied'); bytes = null; },
        block: () => { blocked = true; },
    };
}
const restore = (state: unknown) => Client.fromState(state, {schema: CLIENT_SCHEMA});
const comparable = (state: ReturnType<Client['captureState']>) => ({...state, engine: {...state.engine, revision: 0}});

test('application storage restores exact local state, shared history and anchored selection', () => {
    const storage = memoryStorage(), client = new Client({schema: CLIENT_SCHEMA, actor: 'saved-demo'});
    const clients = [client];
    try {
        client.edit(seedEdits(), null); client.clearHistory();
        const original = textOf(client.model());
        client.edit([{op: 'insert', at: [0, 0], content: 'A😀한글'}]);
        const selected = {anchor: [0, 1], focus: [0, 3]};
        const bytes = saveLocal(storage, 'test', client, {ProseMirror: client.captureSelection(selected)});
        const saved = openLocal(storage, 'test', restore)!; clients.push(saved.client);
        assert.equal(saved.client.actor, client.actor);
        assert.deepEqual(comparable(saved.client.captureState()), comparable(client.captureState()));
        assert.deepEqual(saved.selections.ProseMirror, selected);
        assert.equal(storage.getItem('test'), bytes);
        saved.client.undo(); assert.equal(textOf(saved.client.model()), original);
        // Save while redo is available. Opening must preserve that redo stack.
        saveLocal(storage, 'test', saved.client);
        const redo = openLocal(storage, 'test', restore)!; clients.push(redo.client);
        assert.deepEqual(redo.client.historyStatus(), {canUndo: false, canRedo: true});
        redo.client.redo(); assert.equal(textOf(redo.client.model()), 'A😀한글' + original);
        forgetLocal(storage, 'test'); assert.equal(openLocal(storage, 'test', restore), null);
        assert.equal(textOf(client.model()), 'A😀한글' + original);
    } finally { clients.forEach(client => client.dispose()); }
});

test('failed saves and failed opens preserve current client and existing saved bytes', () => {
    const storage = memoryStorage(), client = new Client({schema: CLIENT_SCHEMA, actor: 'storage-failure'});
    try {
        client.edit(seedEdits(), null); client.clearHistory();
        const bytes = saveLocal(storage, 'test', client);
        storage.block();
        client.edit([{op: 'insert', at: [0, 0], content: 'unsaved '}]);
        const current = client.captureState();
        assert.throws(() => saveLocal(storage, 'test', client), /Quota/);
        assert.throws(() => forgetLocal(storage, 'test'), /denied/);
        assert.equal(storage.getItem('test'), bytes);
        for (const invalid of ['{', '{}', JSON.stringify({...JSON.parse(bytes), state: {...JSON.parse(bytes).state, schemaVersion: 'wrong'}})]) {
            assert.throws(() => openLocal({...storage, getItem: () => invalid}, 'test', restore));
            assert.deepEqual(client.captureState(), current);
            assert.equal(storage.getItem('test'), bytes);
        }
        assert.throws(() => openLocal({...storage, getItem: () => { throw Error('Storage denied'); }}, 'test', restore), /denied/);
        assert.deepEqual(client.captureState(), current);
    } finally { client.dispose(); }
});

test('invalid saved view metadata disposes the candidate without changing the saved bytes', () => {
    const storage = memoryStorage(), client = new Client({schema: CLIENT_SCHEMA, actor: 'bad-selection'});
    try {
        client.edit(seedEdits(), null);
        const bytes = saveLocal(storage, 'test', client);
        const malformed = JSON.stringify({...JSON.parse(bytes), selections: {Unknown: null}});
        let candidate: Client | undefined;
        assert.throws(() => openLocal({...storage, getItem: () => malformed}, 'test', state => candidate = restore(state)), /Invalid saved view/);
        assert.throws(() => candidate!.captureState(), /disposed/i);
        assert.equal(storage.getItem('test'), bytes);
    } finally { client.dispose(); }
});
