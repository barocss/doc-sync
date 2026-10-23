import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {stats} from './engines.mjs';

export function commonScripts(makeTrace) {
    return [
        {name: 'typing-10000', ops: Array.from({length: 10000}, (_, o) => ({t: 'ins', b: 0, o, s: 'x'})), final: ['x'.repeat(10000)]},
        {name: 'paste-100000', ops: [{t: 'ins', b: 0, o: 0, s: 'x'.repeat(100000)}], final: ['x'.repeat(100000)]},
        {name: 'mixed-10000chars', ...makeTrace(10000, 1)},
        // Exactly 10,000 edits, with deletion history, before snapshot opening.
        {name: 'open-after-10000edits', ops: [
            ...Array.from({length: 6000}, (_, o) => ({t: 'ins', b: 0, o, s: 'x'})),
            ...Array.from({length: 2000}, () => ({t: 'del', b: 0, o: 0, n: 1})),
            ...Array.from({length: 2000}, (_, i) => ({t: 'ins', b: 0, o: 4000 + i, s: 'y'})),
        ], final: ['x'.repeat(4000) + 'y'.repeat(2000)]},
    ];
}

export function measureSerial(engine, script, loadSamples = 5) {
    const local = [], remote = [], read = [];
    const a = engine.create('A'), b = engine.create('B');
    let wireBytes = 0, wireSupported = true;
    for (const op of script.ops) {
        let t = performance.now(); const payload = a.local(op); local.push(performance.now() - t);
        const bytes = engine.bytes(payload);
        if (bytes === null) wireSupported = false; else wireBytes += bytes;
        t = performance.now(); b.remote(payload); remote.push(performance.now() - t);
    }
    assert.deepEqual(a.paragraphs(), script.final, `${engine.name} local ${script.name}`);
    assert.deepEqual(b.paragraphs(), script.final, `${engine.name} remote ${script.name}`);
    for (let i = 0; i < 5; i++) { const t = performance.now(); a.paragraphs(); read.push(performance.now() - t); }
    let t = performance.now(); const saved = a.encode(); const saveMs = performance.now() - t;
    const opens = [], loads = [], models = [], heapDeltas = [];
    for (let i = 0; i < loadSamples; i++) {
        globalThis.gc?.(); globalThis.gc?.(); const before = process.memoryUsage().heapUsed;
        t = performance.now(); const loaded = engine.load(`load${i}`, saved); const loadedAt = performance.now();
        const actual = loaded.paragraphs(); const modeledAt = performance.now();
        globalThis.gc?.(); globalThis.gc?.(); heapDeltas.push(process.memoryUsage().heapUsed - before);
        assert.deepEqual(actual, script.final, `${engine.name} loaded ${script.name}`);
        loads.push(loadedAt - t); models.push(modeledAt - loadedAt); opens.push(modeledAt - t);
    }
    return {engine: engine.name, workload: script.name, correct: true, edits: script.ops.length,
        chars: script.final.reduce((sum, text) => sum + text.length, 0), paragraphs: script.final.length,
        localMs: stats(local), remoteApplyMs: stats(remote), modelReadMs: stats(read),
        wireBytes: wireSupported ? wireBytes : null, snapshot: {bytes: engine.bytes(saved), saveMs},
        loadMs: stats(loads), firstModelMs: stats(models), openIncludingModelMs: stats(opens),
        retainedLoadHeapDeltaBytes: stats(heapDeltas), heapNote: 'Approximate process heap delta; loaded document plus first model; GC retained snapshots/adapters differ; no product RAM claim'};
}

export async function makeTableEngines(baseline, engines, rows = 50, cols = 10) {
    const {Doc} = await import(pathToFileURL(`${baseline}/packages/doc-sync/src/index.ts`).href);
    const {DEMO_SCHEMA} = await import(pathToFileURL(`${baseline}/fixtures/demo-schema.ts`).href);
    const Y = await import('yjs');
    const text = 'cell-abcdefghijklmn';
    const cells = Array.from({length: rows}, () => Array.from({length: cols}, () => text));
    const model = {type: 'table', children: cells.map(row => ({type: 'table-row', children: row.map(s => ({type: 'table-cell', children: [{type: 'table-cell-body', children: [{type: 'paragraph', runs: [{text: s, marks: {}}]}]}]}))}))};
    const seed = new Doc('table-seed', DEMO_SCHEMA);
    seed.edit([{op: 'insert', at: [1], content: [model]}]);
    const snapshot = seed.snapshot();
    const ours = {
        name: 'ours',
        create(actor) {
            const doc = Doc.fromSnapshot(actor, snapshot, DEMO_SCHEMA);
            return {doc,
                local({r, c, o, s, n}) { return JSON.stringify(doc.edit([s === undefined ? {op: 'delete', at: [1, r, c, 0, 0, o], count: n} : {op: 'insert', at: [1, r, c, 0, 0, o], content: s}]).ops); },
                remote(payload) { for (const op of JSON.parse(payload)) doc.apply(op); },
                read() { return doc.toJSON().children[1].children.map(row => row.children.map(cell => (cell.children[0].children[0].runs ?? []).map(run => run.text ?? '').join(''))); },
            };
        },
    };
    const element = (type, children) => { const node = new Y.XmlElement(type); node.insert(0, children); return node; };
    const initial = new Y.Doc(); initial.clientID = 1;
    initial.getXmlFragment('table').insert(0, [element('table', cells.map(row => element('row', row.map(s => element('cell', [new Y.XmlText(s)])))))]);
    const initialUpdate = Y.encodeStateAsUpdate(initial);
    const yjs = {name: 'yjs', create() {
        const doc = new Y.Doc(); Y.applyUpdate(doc, initialUpdate); const root = doc.getXmlFragment('table'); let last;
        doc.on('update', (update, origin) => { if (origin !== 'remote') last = update; });
        return {doc,
            local({r, c, o, s, n}) { last = new Uint8Array(); const txt = root.get(0).get(r).get(c).get(0); doc.transact(() => s === undefined ? txt.delete(o, n) : txt.insert(o, s)); return last; },
            remote(payload) { Y.applyUpdate(doc, payload, 'remote'); },
            read() { return root.get(0).toArray().map(row => row.toArray().map(cell => cell.get(0).toString())); },
        };
    }};
    const result = [ours, yjs];
    const yorkie = engines.find(e => e.name === 'yorkie-tree');
    if (yorkie) {
        const base = yorkie.create('table-base');
        const init = base.mutate(root => { root.t = new yorkie.sdk.Tree({type: 'table', children: cells.map(row => ({type: 'row', children: row.map(s => ({type: 'cell', children: [{type: 'p', children: [{type: 'text', value: s}]}]}))}))}); });
        result.push({name: 'yorkie-tree', create(actor) {
            const peer = yorkie.create(actor); peer.remote(init);
            return {...peer,
                local({r, c, o, s, n}) { return peer.mutate(root => root.t.editByPath([r, c, 0, o], [r, c, 0, s === undefined ? o + n : o], s === undefined ? undefined : {type: 'text', value: s})); },
                read() { const node = JSON.parse(peer.doc.getRoot().t.toJSON()); const value = n => n.value ?? (n.children ?? []).map(value).join(''); return node.children.map(row => row.children.map(value)); },
            };
        }});
    }
    return {engines: result, initial: cells};
}

export function measureTable(engine, initial, rounds = 250) {
    const peers = Array.from({length: 4}, (_, i) => engine.create(`table${i}`));
    const local = [], remote = [], read = [];
    const expected = initial.map(row => [...row]);
    for (let round = 0; round < rounds; round++) {
        const pending = peers.map((peer, actor) => {
            const r = (round * 4 + actor) % initial.length, c = Math.floor((round * 4 + actor) / initial.length) % initial[0].length;
            const value = 'ABCD'[actor];
            expected[r][c] = value + expected[r][c];
            const t = performance.now(); const payload = peer.local({r, c, o: 0, s: value}); local.push(performance.now() - t); return payload;
        });
        pending.forEach((payload, actor) => peers.forEach((peer, target) => { if (actor !== target) { const t = performance.now(); peer.remote(payload); remote.push(performance.now() - t); } }));
        if (round % 25 === 0 || round + 1 === rounds) peers.forEach(peer => { const t = performance.now(); const model = peer.read(); read.push(performance.now() - t); assert.deepEqual(model, expected, `${engine.name} table round ${round}`); });
    }
    // Same-cell concurrent insert and overlapping delete: compare all four
    // replicas inside each engine, without demanding identical tie-break order
    // or deletion intent across engines.
    const inserts = peers.map((peer, actor) => peer.local({r: 0, c: 0, o: 0, s: 'WXYZ'[actor]}));
    inserts.forEach((p, actor) => peers.forEach((peer, target) => { if (target !== actor) peer.remote(p); }));
    const beforeDelete = peers[0].read(); peers.slice(1).forEach(peer => assert.deepEqual(peer.read(), beforeDelete));
    const deletions = peers.map(peer => peer.local({r: 0, c: 0, o: 1, n: 2}));
    deletions.forEach((p, actor) => peers.forEach((peer, target) => { if (target !== actor) peer.remote(p); }));
    const final = peers[0].read(); peers.slice(1).forEach(peer => assert.deepEqual(peer.read(), final));
    assert.equal(final[0][0].length, beforeDelete[0][0].length - 2, 'overlapping deletion deletes the same two original tokens once');
    return {engine: engine.name, workload: 'table-50x10', correct: true, rows: initial.length, cols: initial[0].length, concurrentRounds: rounds, timedEdits: rounds * 4, localMs: stats(local), remoteApplyMs: stats(remote), modelReadMs: stats(read), sameCellConcurrentInsert: true, overlappingDelete: true, structuralPolicyScope: 'fixed grid text only; row/column edits and cell merge semantics are not compared'};
}
