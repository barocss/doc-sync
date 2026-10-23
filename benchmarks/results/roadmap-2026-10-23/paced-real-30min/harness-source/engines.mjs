import {pathToFileURL} from 'node:url';

/** The source root is an immutable copy, never the mutable checkout. */
export async function loadEngines(baseline, yorkieEntry) {
    const {ours, yjs} = await import(pathToFileURL(`${baseline}/benchmarks/engines.ts`).href);
    const engines = [ours, yjs];
    if (!yorkieEntry) return engines;
    const imported = await import(pathToFileURL(yorkieEntry).href);
    const sdk = imported.default;
    const seed = new sdk.Document('stage0');
    seed.setActor('000000000000000000000001');
    seed.update(root => { root.t = new sdk.Tree({type: 'doc', children: [{type: 'p', children: []}]}); });
    const start = sdk.converter.toChangePack(seed.createChangePack());
    start.checkpoint.clientSeq = 0;
    let actor = 100;
    const createDoc = () => {
        const doc = new sdk.Document('stage0');
        doc.setActor((actor++).toString(16).padStart(24, '0'));
        return doc;
    };
    const wrap = doc => ({
        doc,
        local(op) {
            doc.update(root => {
                const t = root.t;
                if (op.t === 'ins') t.editByPath([op.b, op.o], [op.b, op.o], {type: 'text', value: op.s});
                else if (op.t === 'del') t.editByPath([op.b, op.o], [op.b, op.o + op.n]);
                else if (op.t === 'split') t.splitByPath([op.b, op.o]);
                else t.mergeByPath([op.b]);
            });
            const pack = sdk.converter.toChangePack(doc.createChangePack());
            // The harness acts as an in-memory relay: acknowledge this actor,
            // then send only its new change. No Yorkie service is involved.
            const ack = {...pack, changes: []};
            doc.applyChangePack(sdk.converter.fromChangePack(ack));
            pack.checkpoint = {...pack.checkpoint, clientSeq: 0};
            return pack;
        },
        remote(pack) { doc.applyChangePack(sdk.converter.fromChangePack(pack)); },
        paragraphs() {
            const tree = JSON.parse(doc.getRoot().t.toJSON());
            const text = n => n.value ?? (n.children ?? []).map(text).join('');
            return tree.children.map(text);
        },
        encode() {
            return {snapshot: sdk.converter.snapshotToBytes(doc.getRootObject(), new Map()), vector: doc.getVersionVector()};
        },
    });
    engines.push({
        name: 'yorkie-tree',
        version: '0.7.25',
        create() { const doc = createDoc(); doc.applyChangePack(sdk.converter.fromChangePack(start)); return wrap(doc); },
        load(_actor, saved) { const doc = createDoc(); doc.applySnapshot(1n, saved.vector, saved.snapshot); return wrap(doc); },
        // Exact snapshot bytes. Change-pack wire bytes are intentionally not
        // estimated: protobuf framing is not available through this wrapper.
        bytes(payload) { return payload.snapshot?.byteLength ?? null; },
    });
    return engines;
}

export function stats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return {count: values.length, p50: at(.5), p95: at(.95), max: at(1), total: values.reduce((a, b) => a + b, 0)};
}
