import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DocHub} from '../../doc-sync/dist/server/hub.js';
import {Doc} from '../../doc-sync/dist/crdt/doc.js';
import {BrowserRecovery, LiveRecovery, SyncClient, type BrowserRecoveryLocks, type LiveRecoveryTransport, type Transport} from '../../doc-sync/dist/sync/index.js';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';

class MemoryStorage {
    values = new Map<string, string>();
    fail = false;
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { if (this.fail) throw new Error('quota'); this.values.set(key, value); }
}
class Locks implements BrowserRecoveryLocks {
    held = new Set<string>();
    async request<T>(key: string, _options: {mode:'exclusive';ifAvailable:true}, callback: (lock: unknown | null) => Promise<T>): Promise<T> {
        if (this.held.has(key)) return callback(null);
        this.held.add(key);
        try { return await callback({name:key}); } finally { this.held.delete(key); }
    }
}
const identity = {server:'https://demo.example/profiles/word',document:'stable-doc',slot:'Slate'};
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const insert = (client: SyncClient, text: string) => client.commit(client.doc.edit([{op:'insert',at:[0,0],content:text}]).ops);

function setup(hub: DocHub, session: BrowserRecovery, dropChanges = false) {
    const actor = session.actor;
    const messages: string[] = [];
    const network: Transport = {
        subscribe: (since, listener, epoch) => {
            listener(hub.hello(since, epoch));
            return hub.listen(event => { if (!dropChanges || event.type !== 'change') listener(event); });
        },
        send: async message => { messages.push(message.kind); if (message.kind === 'change') hub.submit(message.change); else hub.ack(message.ack); },
        sendPresence: () => {},
    };
    const transport: LiveRecoveryTransport = {
        getRecoveryState: async () => ({generation:hub.generation,epoch:hub.epoch,serverSeq:hub.serverSeq,schemaVersion:hub.schemaVersion,reservationEra:hub.recoveryEra}),
        reserveRecovery: async (generation,id,pin,existing) => hub.reserveRecovery(generation,actor,id,pin,existing),
        getChangeReceipt: async (generation,change) => hub.findChangeReceipt(generation,change),
        recoverChange: async (generation,id,version,change) => { assert.equal(hub.submitRecovery(generation,id,version,change).status,'accepted'); },
        releaseRecovery: async (generation,id) => { assert.equal(hub.releaseRecovery(generation,actor,id).status,'released'); },
    };
    const client = new SyncClient(actor,network,{schema:DEMO_SCHEMA,beforeSend:session.persist});
    const recovery = new LiveRecovery(client,transport,{onProof:session.saveProof});
    session.bind(client,recovery);
    return {client,recovery,transport,messages};
}
function server() { const hub = new DocHub({schema:DEMO_SCHEMA,generation:crypto.randomUUID()}); hub.onRecoveryPin = () => {}; return hub; }

test('same browser slot keeps actor identity and excludes a duplicate tab', async () => {
    const storage = new MemoryStorage(), locks = new Locks();
    const first = await BrowserRecovery.open(identity,{storage,locks});
    await assert.rejects(BrowserRecovery.open(identity,{storage,locks}),/already open/);
    const actor = first.actor;
    first.close(); await tick();
    const second = await BrowserRecovery.open(identity,{storage,locks});
    assert.equal(second.actor,actor);
    second.close();
});

test('quota failure before outgoing change stops transport and retains previous durable checkpoint', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    const session = await BrowserRecovery.open(identity,{storage,locks});
    const {client,recovery,messages} = setup(hub,session);
    client.connect(); await recovery.establish(); await tick();
    const saved = storage.getItem(session.key), sent = messages.length;
    storage.fail = true;
    assert.throws(() => insert(client,'unsaved'),/storage failed/);
    await tick();
    assert.equal(messages.length,sent);
    assert.equal(hub.serverSeq,0);
    assert.equal(client.online,false);
    assert.equal(storage.getItem(session.key),saved);
    assert.equal(client.pending.length,1);
    session.close();
});

test('reload restores exact offline pending changes and undo/redo history', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    let session = await BrowserRecovery.open(identity,{storage,locks});
    let current = setup(hub,session);
    current.client.connect(); await current.recovery.establish(); await tick();
    current.client.disconnect(); insert(current.client,'offline');
    const checkpoint = session.record.checkpoint!;
    assert.equal(checkpoint.pending.length,1);
    assert.equal(checkpoint.history.undo.length > 0,true);
    const actor = session.actor;
    session.close(); await tick();
    hub.epoch = crypto.randomUUID();
    session = await BrowserRecovery.open(identity,{storage,locks}); current = setup(hub,session);
    assert.equal(session.actor,actor);
    assert.equal(await session.restore(),'restored'); await tick();
    assert.equal(current.client.pending.length,0);
    assert.equal(current.client.history.canUndo,true);
    assert.deepEqual(current.client.doc.toJSON(),hub.doc.toJSON());
    current.client.undo(); await tick();
    assert.equal(current.client.history.canRedo,true);
    assert.equal(JSON.stringify(hub.doc.toJSON()).includes('offline'),false);
    current.client.disconnect();session.close();
});

test('reload after server acceptance before local acknowledgement does not duplicate the change', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    let session = await BrowserRecovery.open(identity,{storage,locks});
    const first = setup(hub,session,true);
    first.client.connect(); await first.recovery.establish(); await tick();
    insert(first.client,'accepted'); await tick();
    assert.equal(hub.serverSeq,1);
    assert.equal(session.record.checkpoint!.pending.length,1);
    first.client.disconnect(); session.close(); await tick();
    session = await BrowserRecovery.open(identity,{storage,locks});
    const second = setup(hub,session);
    await session.restore(); await tick();
    assert.equal(hub.serverSeq,1);
    assert.equal(second.client.pending.length,0);
    assert.equal(second.client.history.canUndo,true);
    assert.deepEqual(second.client.doc.toJSON(),hub.doc.toJSON());
    second.client.disconnect(); session.close();
});

test('unavailable server and replaced generation preserve stored checkpoint and send no changes', async () => {
    for (const unavailable of [true,false]) {
        const storage = new MemoryStorage(), locks = new Locks(), hub = server();
        let session = await BrowserRecovery.open(identity,{storage,locks});
        const first = setup(hub,session);
        first.client.connect(); await first.recovery.establish(); first.client.disconnect(); insert(first.client,'retained');
        session.close(); await tick();
        const raw = [...storage.values.values()][0];
        session = await BrowserRecovery.open(identity,{storage,locks});
        const second = setup(hub,session);
        if (unavailable) second.transport.getRecoveryState = async () => { throw new Error('server unavailable'); };
        else hub.generation = crypto.randomUUID();
        await assert.rejects(session.restore());
        assert.equal(storage.getItem(session.key),raw);
        assert.equal(second.client.online,false);
        assert.equal(second.messages.length,0);
        session.close();
    }
});

test('corrupt stored identity and unavailable storage fail before creating a client', async () => {
    const storage = new MemoryStorage(), locks = new Locks();
    const first = await BrowserRecovery.open(identity,{storage,locks});
    const key = first.key, record = first.record;
    first.close(); await tick();
    storage.values.set(key,JSON.stringify({...record,identity:{...identity,document:'wrong'}}));
    const raw = storage.getItem(key);
    await assert.rejects(BrowserRecovery.open(identity,{storage,locks}),/identity or state/);
    assert.equal(storage.getItem(key),raw);
    storage.values.delete(key);storage.fail = true;
    await assert.rejects(BrowserRecovery.open(identity,{storage,locks}),/storage failed/);
});

test('durable release intent survives a lost release reply and reloads without discarded history', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    let session = await BrowserRecovery.open(identity,{storage,locks});
    const first = setup(hub,session);
    first.client.connect();await first.recovery.establish();insert(first.client,'settled');await tick();
    const release = first.transport.releaseRecovery;
    first.transport.releaseRecovery = async (...args) => { await release(...args); throw new Error('release reply lost'); };
    await assert.rejects(session.retire(),/release reply lost/);
    assert.equal(session.record.release?.releasePending,true);
    assert.equal(session.record.checkpoint!.history.undo.length,0);
    const proof = session.record.proof;
    assert.equal(hub.recoveryCompactionState().active.length,0);
    session.close();await tick();
    session = await BrowserRecovery.open(identity,{storage,locks});
    const second = setup(hub,session);
    assert.equal(await session.restore(),'retired');
    assert.equal(second.client.history.canUndo,false);
    assert.equal(second.client.history.canRedo,false);
    assert.equal(second.client.online,false);
    assert.equal(session.record.retired,true);
    assert.deepEqual(session.record.proof,proof);
    session.close();
});

test('failed proof persistence creates no unreachable durable reservation', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    const session = await BrowserRecovery.open(identity,{storage,locks});
    const {client,recovery} = setup(hub,session);
    client.connect();await tick();storage.fail = true;
    await assert.rejects(recovery.establish(),/storage failed/);
    assert.equal(hub.recoveryCompactionState().active.length,0);
    // establish does not notify the client, so the owner must close the paused editor explicitly.
    storage.fail = false;
    try { client.disconnect(); } catch { /* The failed session stays closed. */ }
    session.close();
});

test('failed remote checkpoint does not acknowledge the unpersisted server revision', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    const session = await BrowserRecovery.open(identity,{storage,locks});
    const {client,recovery,messages} = setup(hub,session);
    client.connect();await recovery.establish();await tick();
    const saved = storage.getItem(session.key), sent = messages.length;
    storage.fail = true;
    const remote = new Doc('remote',DEMO_SCHEMA);
    try { hub.submit({actor:'remote',seq:1,ops:remote.edit([{op:'insert',at:[0,0],content:'remote'}]).ops}); }
    catch (error) { assert.match(String(error),/storage failed/); }
    await tick();
    assert.equal(client.online,false);
    assert.equal(messages.length,sent);
    assert.equal(storage.getItem(session.key),saved);
    session.close();
});

test('durable browser clients refuse conditional requests before the conditional sender runs', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    const session = await BrowserRecovery.open(identity,{storage,locks});
    const {client,recovery} = setup(hub,session);
    client.connect();await recovery.establish();await tick();
    const raw = storage.getItem(session.key);
    let sent = 0;
    await assert.rejects(client.conditionalEdit({epoch:client.epoch!,serverSeq:client.serverSeq,schemaVersion:hub.schemaVersion},
        [{op:'insert',at:[0,0],content:'conditional'}],async () => { sent += 1;return {status:'accepted',serverSeq:1}; }),/own recovery evidence/);
    assert.equal(sent,0);
    assert.equal(storage.getItem(session.key),raw);
    assert.equal(client.online,false);
    session.close();
});

test('closing the actor lock also fences stale page callbacks from local editing', async () => {
    const storage = new MemoryStorage(), locks = new Locks(), hub = server();
    const session = await BrowserRecovery.open(identity,{storage,locks});
    const {client,recovery} = setup(hub,session);
    client.connect();await recovery.establish();client.disconnect();session.close();
    assert.throws(() => insert(client,'stale page'),/paused/);
    await tick();
    const next = await BrowserRecovery.open(identity,{storage,locks});
    assert.equal(next.actor,session.actor);
    next.close();
});
