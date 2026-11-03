// Isolated public preload fixture. Each invocation starts a fresh module graph.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const scenario = process.argv[2];
let engineLoaded = false;
registerHooks({resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (result.url.endsWith('/engine/typescript-client.ts')) engineLoaded = true;
    return result;
}});
const {DocHub} = await import('../../src/server/index.ts');
const {createDataSchema} = await import('../../src/data/schema.ts');
const hub = new DocHub({schema: createDataSchema()});
const Doc = hub.doc.constructor;
assert.equal(engineLoaded, false, 'server/schema must expose Doc before client engine loads');
let flag = false, gets = 0, calls = 0;
const seen = [];
const sentinel = new Error('preloaded original sentinel');
const toJSON = Object.getOwnPropertyDescriptor(Doc.prototype, 'toJSON');
const isReceiver = value => value?.constructor === Doc;
function projected(...args) {
    assert.ok(isReceiver(this), 'original method receiver');
    calls++; seen.push("call:toJSON");
    if (flag && scenario.endsWith('throw')) throw sentinel;
    const model = Reflect.apply(toJSON.value, this, args);
    if (!flag || scenario === 'stock') return model;
    const scalar = scenario.endsWith('malformed') ? {invalid: true} : 'visible';
    return {...model, children: model.children.map((node, i) => i === 1 ? {...node, attrs: {...node.attrs, value: {scalar}}} : node)};
}
if (scenario.startsWith('doc-')) {
    // Accessor descriptors cannot also contain value/writable.
    if (scenario.startsWith('doc-getter-')) Object.defineProperty(Doc.prototype, 'toJSON', {
        configurable: toJSON.configurable, enumerable: toJSON.enumerable,
        get() {gets++; seen.push("get:toJSON"); assert.ok(isReceiver(this), 'getter receiver'); return projected;},
    });
    else Object.defineProperty(Doc.prototype, 'toJSON', {...toJSON, value: projected});
}
const {Client, clientOwner} = await import('../../src/client/index.ts');
const id = n => `data:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const seed = [1, 2].map((n, i) => ({type: 'entry', attrs: {id: id(n), key: i ? 'unrelated' : 'target', value: {scalar: 'old'}}}));
function seeded() {
    const client = new Client({actor: 'preload', schema: createDataSchema()});
    client.edit([{op: 'insert', at: [0], content: seed}], null);
    return client;
}
const source = seeded();
const state = source.captureState(); source.dispose();
const candidate = Client.fromState(state, {schema: createDataSchema()});
const legacy = Client.fromState(state, {schema: createDataSchema()});
clientOwner(legacy); // Supported compatibility escape forces the full-refresh oracle.
try {
    for (const client of [candidate, legacy]) {
        flag = false;
        const root = client.data.root;
        assert.equal(root.get('target'), 'old'); assert.equal(root.get('unrelated'), 'old');
        root.set('target', 'new');
        flag = true; calls = 0; gets = 0; seen.length = 0;
        if (scenario.endsWith('throw')) {
            assert.throws(() => root.get('target'), error => error === sentinel);
            assert.equal(calls, 1);
            assert.equal(gets, scenario.startsWith('doc-getter-') ? 1 : 0);
            assert.throws(() => root.get('unrelated'), error => error === sentinel);
            assert.equal(calls, 2, 'failed projection must not publish partial cache');
        } else if (scenario.endsWith('malformed')) {
            assert.throws(() => root.get('target'), {message: 'Data: invalid encoded scalar'});
            assert.equal(calls, 1);
            assert.equal(gets, scenario.startsWith('doc-getter-') ? 1 : 0);
            assert.throws(() => root.get('unrelated'), {message: 'Data: invalid encoded scalar'});
            assert.equal(calls, 1, 'engine model read must not be doubled');
        } else {
            assert.equal(root.get('target'), 'new');
            assert.equal(root.get('unrelated'), scenario === 'stock' ? 'old' : 'visible');
            assert.equal(calls, scenario === 'stock' ? 0 : 1);
            assert.equal(gets, scenario.startsWith('doc-getter-') ? 1 : 0);
        }
        const oneRead = scenario.startsWith('doc-getter-') ? ['get:toJSON', 'call:toJSON'] : ['call:toJSON'];
        assert.deepEqual(seen, scenario === 'stock' ? [] : scenario.endsWith('throw') ? [...oneRead, ...oneRead] : oneRead);
    }
} finally {
    candidate.dispose(); legacy.dispose();
    Object.defineProperty(Doc.prototype, 'toJSON', toJSON);
}
console.log(JSON.stringify({scenario, pass: true}));
