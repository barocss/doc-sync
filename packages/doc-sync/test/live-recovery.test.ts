import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Doc} from '../../doc-sync/dist/crdt/doc.js';
import {DocHub} from '../../doc-sync/dist/server/hub.js';
import {SyncClient, LiveRecovery, type LiveRecoveryTransport, type Transport} from '../../doc-sync/dist/sync/index.js';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';

function setup() {
    const hub = new DocHub({schema: DEMO_SCHEMA, generation: crypto.randomUUID()});
    hub.onRecoveryPin = () => {};
    const network: Transport = {
        subscribe: (since, listener, epoch) => { listener(hub.hello(since, epoch)); return hub.listen(listener); },
        send: async message => { if (message.kind === 'change') hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence: () => {},
    };
    const transport: LiveRecoveryTransport = {
        getRecoveryState: async () => ({generation:hub.generation, epoch:hub.epoch, serverSeq:hub.serverSeq, schemaVersion:hub.schemaVersion, reservationEra:hub.recoveryEra}),
        reserveRecovery: async (generation, id, pin, existing) => hub.reserveRecovery(generation, 'a', id, pin, existing),
        getChangeReceipt: async (generation, change) => hub.findChangeReceipt(generation, change),
        recoverChange: async (generation, id, version, change) => { assert.equal(hub.submitRecovery(generation, id, version, change).status, 'accepted'); },
        releaseRecovery: async (generation, id) => { assert.equal(hub.releaseRecovery(generation, 'a', id).status, 'released'); },
    };
    const client = new SyncClient('a', network, {schema:DEMO_SCHEMA});
    client.connect();
    const recovery = new LiveRecovery(client, transport);
    return {hub, client, transport, recovery};
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const insert = (client: SyncClient, content: string) => client.commit(client.doc.edit([{op:'insert', at:[0,0], content}]).ops);

test('protected restart preserves acknowledged undo and redo history with concurrent remote edits', async () => {
    for (const redo of [false, true]) {
        const {hub, client, recovery} = setup();
        await recovery.establish(); insert(client, 'local'); await tick();
        if (redo) { client.undo(); await tick(); }
        assert.equal(client.pending.length, 0);
        const history = client.history, before = history.snapshot();
        client.disconnect(); hub.epoch = crypto.randomUUID();
        const remote = new Doc('b', DEMO_SCHEMA);
        hub.submit({actor:'b', seq:1, ops:remote.edit([{op:'insert',at:[0,0],content:'remote'}]).ops});
        client.connect();
        assert.equal(client.online, false);
        assert.match(client.connectionError!.message, /protected history/);
        assert.equal(client.history, history); assert.deepEqual(history.snapshot(), before);
        await recovery.recover(); await tick();
        assert.equal(client.synchronized, true); assert.equal(client.history, history);
        assert.equal(redo ? history.canRedo : history.canUndo, true);
        if (redo) client.redo(); else client.undo();
        await tick();
        assert.match(JSON.stringify(client.doc.toJSON()), /remote/);
        assert.equal(JSON.stringify(client.doc.toJSON()).includes('local'), redo);
        assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
        client.disconnect();
    }
});

test('ambiguous establish reply retries the same reservation without a second pin', async () => {
    const {hub, client, transport, recovery} = setup();
    const reserve = transport.reserveRecovery, ids: string[] = [];
    transport.reserveRecovery = async (...args) => {
        ids.push(args[1]); const result = await reserve(...args);
        if (ids.length === 1) throw new Error('reply lost');
        return result;
    };
    await assert.rejects(recovery.establish(), /reply lost/);
    assert.equal(recovery.protected, false);
    await recovery.establish();
    assert.equal(recovery.protected, true); assert.deepEqual(ids, [ids[0], ids[0]]);
    assert.equal(hub.recoveryCompactionState().active.length, 1);
    recovery.dispose();
    client.disconnect();
});

test('dispose during final recovery metadata prevents reconnect and preserves local checkpoint', async () => {
    const {hub, client, transport, recovery} = setup();
    await recovery.establish(); client.disconnect(); insert(client, 'pending');
    hub.epoch = crypto.randomUUID();
    const before = client.checkpoint(), oldEpoch = client.epoch;
    const get = transport.getRecoveryState; let calls = 0, finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    transport.getRecoveryState = async () => { if (++calls === 2) await gate; return get(); };
    const recovering = recovery.recover();
    while (calls < 2) await tick();
    recovery.dispose(); finish();
    await assert.rejects(recovering, /disposed/);
    assert.equal(client.online, false); assert.equal(client.epoch, oldEpoch);
    assert.deepEqual(client.checkpoint(), before);
    assert.equal(hub.recoveryCompactionState().active.length, 1);
});

test('local edits during async proof stop reconnect and retry safely without duplicate changes', async () => {
    const {hub, client, transport, recovery} = setup();
    await recovery.establish(); client.disconnect(); insert(client, 'first');
    hub.epoch = crypto.randomUUID();
    const get = transport.getRecoveryState; let calls = 0;
    transport.getRecoveryState = async () => { const result = await get(); if (++calls === 2) insert(client, 'second'); return result; };
    await assert.rejects(recovery.recover(), /Local recovery state changed/);
    assert.equal(client.online, false); assert.equal(client.pending.length, 2);
    transport.getRecoveryState = get;
    await recovery.recover(); await tick();
    assert.equal(client.pending.length, 0); assert.deepEqual(client.doc.toJSON(), hub.doc.toJSON());
    assert.equal(hub.serverSeq, 2); client.disconnect();
});

test('invalid generation, absent reservation, and forged receipt leave local state intact', async () => {
    for (const failure of ['generation', 'reservation', 'receipt'] as const) {
        const {hub, client, transport, recovery} = setup();
        await recovery.establish(); client.disconnect(); insert(client, 'pending');
        const before = client.checkpoint(), epoch = client.epoch;
        if (failure === 'generation') hub.generation = crypto.randomUUID();
        if (failure === 'reservation') transport.reserveRecovery = async () => ({status:'unsafe'});
        if (failure === 'receipt') transport.getChangeReceipt = async () => ({status:'accepted',generation:'wrong',serverSeq:1});
        await assert.rejects(recovery.recover());
        assert.equal(client.online, false); assert.equal(client.epoch, epoch); assert.deepEqual(client.checkpoint(), before);
    }
});


test('true generation reset preserves protected acknowledged history and refuses recovery', async () => {
    const {hub, client, recovery} = setup();
    await recovery.establish(); insert(client, 'acknowledged'); await tick();
    const before = client.checkpoint(), history = client.history;
    hub.reset(crypto.randomUUID());
    assert.equal(client.online, false); assert.equal(client.pending.length, 0);
    assert.equal(client.history, history); assert.deepEqual(client.checkpoint(), before);
    await assert.rejects(recovery.recover(), /generation, schema or history changed/);
    assert.deepEqual(client.checkpoint(), before);
});

test('establish fails closed when local editing races the reservation reply', async () => {
    const {hub, client, transport, recovery} = setup();
    const reserve = transport.reserveRecovery;
    transport.reserveRecovery = async (...args) => { const result = await reserve(...args); insert(client, 'raced'); return result; };
    await assert.rejects(recovery.establish(), /Local state changed/);
    assert.equal(recovery.protected, false);
    assert.equal(client.history.canUndo, true);
    assert.equal(hub.recoveryCompactionState().active.length, 1, 'do not drop the floor under raced history');
    client.disconnect();
});

test('retirement persists empty history before release and preserves other participants pins', async () => {
    const {hub, client, transport, recovery} = setup();
    await recovery.establish(); insert(client, 'kept'); await tick();
    const own = recovery.proof!;
    hub.reserveRecovery(hub.generation!, 'b', `r${hub.recoveryEra}~${crypto.randomUUID()}`, 1);
    let saved = false, cleared = false;
    const release = transport.releaseRecovery;
    transport.releaseRecovery = async (...args) => {
        assert.equal(saved, true); assert.equal(client.online, false); assert.equal(client.history.canUndo, false);
        await release(...args);
    };
    await recovery.retire(record => {
        assert.equal(client.history.canUndo, true, 'retain live history until persistence succeeds');
        assert.equal(record.releasePending, true); assert.equal(record.client.pending.length, 0);
        assert.equal(record.client.history.undo.length, 0);
        saved = true;
    }, () => { cleared = true; });
    assert.equal(cleared, true); assert.equal(recovery.protected, false); assert.equal(recovery.proof, null);
    assert.equal(client.online, false); assert.equal(client.pending.length, 0);
    assert.match(JSON.stringify(client.doc.toJSON()), /kept/);
    const remaining = hub.recoveryCompactionState().active;
    assert.equal(remaining.length, 1); assert.notEqual(remaining[0].reservationId, own.id);
});

test('failed release intent write preserves history and never releases the reservation', async () => {
    const {hub, client, recovery} = setup();
    await recovery.establish(); insert(client, 'settled'); await tick();
    const before = client.checkpoint(), history = client.history;
    await assert.rejects(recovery.retire(() => { throw new Error('disk full'); }, () => {}), /disk full/);
    assert.equal(client.history, history); assert.deepEqual(client.checkpoint(), before);
    assert.equal(recovery.protected, true); assert.equal(hub.recoveryCompactionState().active.length, 1);
    insert(client, 'still available'); assert.equal(client.pending.length, 1);
});

test('retirement blocks every local mutation while the durable intent is being saved', async () => {
    const {client, recovery} = setup();
    await recovery.establish(); insert(client, 'settled'); await tick();
    let resume!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const retiring = recovery.retire(async () => { entered(); await gate; }, () => {});
    await started;
    const before = client.checkpoint();
    assert.throws(() => insert(client, 'raced'), /paused/);
    assert.throws(() => client.commit([]), /paused/);
    assert.throws(() => client.undo(), /paused/);
    assert.throws(() => client.redo(), /paused/);
    assert.throws(() => client.clearHistory(), /paused/);
    assert.throws(() => client.connect(), /paused/);
    assert.deepEqual(client.checkpoint(), before);
    resume(); await retiring;
    client.connect(); assert.equal(client.synchronized, true); client.disconnect();
});

test('lost release reply keeps the same durable release retryable after reload', async () => {
    const {hub, client, transport, recovery} = setup();
    await recovery.establish(); insert(client, 'settled'); await tick();
    let stored: import('../../doc-sync/dist/sync/live-recovery.js').LiveRecoveryRelease | undefined;
    const release = transport.releaseRecovery, ids: string[] = [];
    transport.releaseRecovery = async (...args) => {
        ids.push(args[1]); await release(...args);
        if (ids.length === 1) throw new Error('release reply lost');
    };
    await assert.rejects(recovery.retire(record => { stored = record; }, () => { stored = undefined; }), /release reply lost/);
    assert.ok(stored); assert.equal(recovery.releasePending, true);
    assert.equal(hub.recoveryCompactionState().active.length, 0);
    assert.throws(() => insert(client, 'blocked'), /paused/);
    const fresh = new SyncClient('a', {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}}, {schema:DEMO_SCHEMA});
    const loaded = new LiveRecovery(fresh, transport);
    await loaded.finishRetirement(stored, () => { stored = undefined; });
    assert.deepEqual(ids, [ids[0], ids[0]]); assert.equal(stored, undefined);
    assert.equal(loaded.protected, false); assert.equal(fresh.history.canUndo, false);
    assert.equal(fresh.pending.length, 0); assert.equal(fresh.checkpoint().seq, client.checkpoint().seq);
    assert.deepEqual(fresh.doc.toJSON(), hub.doc.toJSON());
});

test('pending edits refuse retirement without discarding local history or releasing its pin', async () => {
    const {hub, client, recovery} = setup();
    await recovery.establish(); client.disconnect(); insert(client, 'unconfirmed');
    const before = client.checkpoint();
    await assert.rejects(recovery.retire(() => assert.fail('must not save'), () => {}), /without pending/);
    assert.deepEqual(client.checkpoint(), before); assert.equal(hub.recoveryCompactionState().active.length, 1);
});

test('stored proof restores pending changes and undo through exact recovery', async () => {
    const {hub, client, transport, recovery} = setup();
    await recovery.establish(); client.disconnect(); insert(client, 'offline');
    const stored = client.checkpoint(), proof = recovery.proof!;
    hub.epoch = crypto.randomUUID();
    const fresh = new SyncClient('a', {
        subscribe: (since, listener, epoch) => { listener(hub.hello(since, epoch)); return hub.listen(listener); },
        send: async message => { if (message.kind === 'change') hub.submit(message.change); else hub.ack(message.ack); }, sendPresence: () => {},
    }, {schema:DEMO_SCHEMA});
    const loaded = new LiveRecovery(fresh, transport);
    await loaded.restore(stored, proof);
    assert.equal(fresh.online, false); assert.equal(fresh.history.canUndo, true);
    await loaded.recover(); await tick();
    assert.equal(fresh.pending.length, 0); assert.equal(fresh.history.canUndo, true);
    fresh.undo(); await tick(); assert.deepEqual(fresh.doc.toJSON(), hub.doc.toJSON());
    fresh.disconnect();
});

test('checkpoint hooks save offline edits and stop sends when persistence fails', async () => {
    const hub = new DocHub({schema:DEMO_SCHEMA}); let sends = 0, fail = false, saved = 0;
    const client = new SyncClient('a', {
        subscribe: (since, listener, epoch) => { listener(hub.hello(since, epoch)); return hub.listen(listener); },
        send: async message => { sends++; if (message.kind === 'change') hub.submit(message.change); else hub.ack(message.ack); }, sendPresence: () => {},
    }, {schema:DEMO_SCHEMA, beforeSend: () => { if (fail) throw new Error('checkpoint failed'); }});
    client.onCheckpoint = () => { saved++; if (fail) throw new Error('checkpoint failed'); };
    client.connect(); await tick(); client.disconnect();
    const priorSaved = saved; insert(client, 'offline');
    assert.ok(saved > priorSaved); assert.equal(client.pending.length, 1);
    const priorSends = sends; fail = true;
    client.connect();
    await tick();
    assert.equal(sends, priorSends); assert.equal(client.online, false);
    assert.equal(client.pending.length, 1); assert.match(client.connectionError!.message, /checkpoint failed/);
    assert.throws(() => insert(client, 'blocked after failed save'), /paused/);
});

test('dispose after durable retirement save retains the edit freeze and release intent', async () => {
    const {hub, client, recovery} = setup();
    await recovery.establish(); insert(client, 'settled'); await tick();
    let finish!: () => void, stored: import('../../doc-sync/dist/sync/live-recovery.js').LiveRecoveryRelease | null = null;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const retiring = recovery.retire(async record => { stored = record; await gate; }, () => {});
    while (!stored) await tick();
    recovery.dispose(); finish();
    await assert.rejects(retiring, /disposed/);
    assert.equal(recovery.releasePending, true); assert.equal(hub.recoveryCompactionState().active.length, 1);
    assert.throws(() => insert(client, 'blocked'), /paused/);
    assert.throws(() => client.connect(), /paused/);
    assert.equal(client.history.canUndo, true);
});

test('checkpoint persistence rejects unsupported conditional requests before their direct send', async () => {
    const {client} = setup();
    client.onCheckpoint = () => { client.checkpoint(); };
    let sent = 0;
    await assert.rejects(client.conditionalEdit({epoch:client.epoch!, serverSeq:client.serverSeq, schemaVersion:client.checkpoint().schemaVersion},
        [{op:'insert',at:[0,0],content:'conditional'}], async () => { sent++; return {status:'accepted',serverSeq:1}; }), /own recovery evidence/);
    assert.equal(sent, 0); assert.equal(client.online, false); assert.equal(client.conditionalPending, true);
    assert.throws(() => insert(client, 'blocked'), /unresolved|paused/);
});

test('an empty protected client refuses a live generation reset and a changed-epoch hello', async () => {
    for (const reset of [false, true]) {
        const {hub, client, recovery} = setup();
        await recovery.establish();
        const before = client.checkpoint(), epoch = client.epoch;
        if (reset) hub.reset(crypto.randomUUID());
        else { client.disconnect(); hub.epoch = crypto.randomUUID(); client.connect(); }
        assert.equal(client.online, false); assert.equal(client.epoch, epoch);
        assert.deepEqual(client.checkpoint(), before);
        if (reset) await assert.rejects(recovery.recover(), /generation, schema or history changed/);
        else { await recovery.recover(); await tick(); assert.equal(client.synchronized, true); client.disconnect(); }
    }
});
