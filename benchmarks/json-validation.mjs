// Whole-source JSON validation experiment. No builds, source rewriting, or hidden imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, realpathSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const [key, value] = process.argv.slice(i, i + 2);
    assert(['--source-root', '--label', '--output', '--mode', '--records', '--samples', '--warmup', '--iterations'].includes(key) && value && !value.startsWith('--') && !(key in args), `Invalid option: ${key}`);
    args[key] = value;
}
for (const key of ['--source-root', '--label', '--output']) assert(args[key], `Required: ${key}`);
const positive = (value) => { assert(/^[1-9]\d*$/.test(value) && Number.isSafeInteger(+value)); return +value; };
const mode = args['--mode'] ?? 'timing';
assert(['timing', 'counts', 'smoke'].includes(mode));
const records = positive(args['--records'] ?? '20000');
assert(records % 2 === 0 && records <= 20000, 'Even record count, maximum 20000; no 100k probe');
const n = records / 2, samples = positive(args['--samples'] ?? '7'), warmup = positive(args['--warmup'] ?? '2'), iterations = positive(args['--iterations'] ?? '10000');
assert(samples <= 30 && warmup <= 10 && iterations <= 100000, 'Bounded experiment limits');
const root = realpathSync(resolve(args['--source-root'])), source = join(root, 'packages/doc-sync/src');
const output = resolve(args['--output']);
assert(!existsSync(output), 'Refusing to overwrite output');
assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Use Node 24');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const driverHash = sha(readFileSync(fileURLToPath(import.meta.url)));
const files = () => Object.fromEntries(readdirSync(source, {recursive: true}).filter(p => p.endsWith('.ts')).sort().map(p => [p, sha(readFileSync(join(source, p)))]));
const sourceFiles = files(), closureHash = sha(JSON.stringify(sourceFiles));
const load = path => import(pathToFileURL(join(source, path)).href);
const {Client} = await load('client/index.ts');
const {createDataSchema} = await load('data/schema.ts');
const {annotationJsonOk} = await load('crdt/annotations.ts');
const {Doc} = await load('crdt/doc.ts');
const {History} = await load('crdt/history.ts');
const counters = {}, restore = [];
let counting = false;
function count(target, key, label) {
    const original = target[key];
    target[key] = function (...values) { if (counting) counters[label] = (counters[label] ?? 0) + 1; return original.apply(this, values); };
    restore.push(() => { target[key] = original; });
}
if (mode === 'counts') {
    for (const key of ['snapshot', 'edit', 'toJSON', 'check', 'projectVisibleBlock']) count(Doc.prototype, key, `Doc.${key}`);
    count(Doc, 'fromSnapshot', 'Doc.fromSnapshot'); count(History, 'fromSnapshot', 'History.fromSnapshot'); count(History.prototype, 'snapshot', 'History.snapshot');
    count(Object, 'getOwnPropertyDescriptors', 'Object.getOwnPropertyDescriptors'); count(Reflect, 'ownKeys', 'Reflect.ownKeys');
}
// Stable Node JSON reference values. No function under test constructs the oracle.
let random = 0x13579bdf;
const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
const matrix = [
    ['null', null], ['boolean', true], ['finite-number', 123.5], ['string', 'fixed-한글'],
    ['atomic-object', {scalar: 73}], ['atomic-array', [null, true, 4, 'fixed']],
    ['nested-json', {values: Array.from({length: 16}, () => ({key: next(), value: [next(), null, false]}))}],
];
for (const [, value] of matrix) assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
const micro = [];
for (const [name, value] of matrix) {
    assert.equal(annotationJsonOk(value), true);
    for (let i = 0; i < Math.min(iterations, 1000); i++) annotationJsonOk(value);
    const raw = [], beforeCounts = {...counters};
    counting = mode === 'counts';
    for (let s = 0; s < samples; s++) {
        let accepted = 0;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) accepted += Number(annotationJsonOk(value));
        const ms = performance.now() - start;
        assert.equal(accepted, iterations);
        raw.push(ms);
    }
    counting = false;
    const validationCounts = mode === 'counts' ? Object.fromEntries(Object.entries(counters).map(([key, value]) => [key, value - (beforeCounts[key] ?? 0)])) : null;
    micro.push({name, callsPerSample: iterations, rawMs: mode === 'counts' ? null : raw, validationCounts});
}
for (const key of Object.keys(counters)) delete counters[key];
const id = i => `data:00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
const empty = new Client({schema: createDataSchema(), actor: 'json-validation-fixed'});
const state = empty.captureState(); empty.dispose();
let clock = 0;
const token = (type, dataId, after, attrs = {}) => { const key = `${++clock}@json-validation-fixed`; return {i: key, o: after, k: 'n', b: type, a: [['$type', type, key], ['id', dataId, key], ...Object.entries(attrs).map(([k, v]) => [k, v, key])]}; };
const head = key => ({i: key, o: null, k: 'n', y: 'root'});
const listToken = token('list', id(1), '0@~root'), mapToken = token('map', id(2), listToken.i);
const line = (parent, offset, isMap) => {
    const key = `0@${parent.i}/body`, items = [head(key)];
    for (let i = 0; i < n; i++) items.push(token('entry', id(offset + i), items.at(-1).i, {...(isMap ? {key: `key-${i}`} : {}), value: {scalar: i}}));
    return {key, owner: parent.i, slot: 'body', items};
};
state.engine.document = {format: 2, capabilities: [], lines: [{key: '0@~root', owner: null, slot: '', items: [head('0@~root'), listToken, mapToken]}, line(listToken, 10, false), line(mapToken, 10 + n, true)]};
state.engine.document.lamport = clock; state.engine.revision = clock;
const seedHash = sha(JSON.stringify(state));
const client = Client.fromState(state, {schema: createDataSchema()});
const list = client.data.getList(id(1)), map = client.data.getMap(id(2));
const expectedList = JSON.parse(JSON.stringify(Array.from({length: n}, (_, i) => ({id: id(10 + i), value: i}))));
const expectedMap = JSON.parse(JSON.stringify(Array.from({length: n}, (_, i) => [`key-${i}`, i]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
const oracle = value => {
    expectedList[0].value = value;
    assert.deepEqual(list.entries(), expectedList);
    assert.deepEqual(map.entries(), expectedMap);
    assert.equal(client.historyStatus().canUndo, false);
};
oracle(0);
const rawSamples = [];
for (let s = -warmup; s < samples; s++) {
    globalThis.gc?.();
    counting = mode === 'counts' && s >= 0;
    const start = performance.now();
    client.edit([{op: 'update', at: [0, 0], attrs: {value: {scalar: s}}}], null);
    const edited = performance.now();
    const first = list.at(0), size = map.size;
    const end = performance.now();
    counting = false;
    assert.deepEqual(first, {id: id(10), value: s}); assert.equal(size, n);
    if (s >= 0) rawSamples.push({editMs: edited - start, readMs: end - edited, totalMs: end - start});
}
// Full IDs/values checked after timing. No extra snapshot is used for this oracle.
oracle(samples - 1);
client.dispose();
for (const undo of restore.reverse()) undo();
assert.deepEqual(files(), sourceFiles, 'Source changed during experiment');
const report = {
    label: args['--label'], mode, startedFrom: root, sourceRoot: source, sourceFiles, closureHash, driverHash, seedHash,
    node: process.version, executable: process.execPath, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null,
    argv: process.argv.slice(2), records, listRecords: n, mapRecords: n, samples, warmup, history: 'noHistory: Client.edit(..., null); empty history retained/cloned by engine',
    micro, rawSamples: mode === 'counts' ? null : rawSamples, counters: mode === 'counts' ? counters : null,
    oracle: 'PASS: Node JSON fixed seed; all final List IDs/values and sorted Map keys/values; per-sample first ID/value + Map size; canUndo=false',
    scope: 'Whole selected source TS closure, no dist. Timings exclude seed/import/warmup/GC/oracle. Micro precedes E2E identically. Count mode is not timing evidence. Counts are inclusive nested calls, not exclusive validator cost. Descriptor counts cover all callers, not only validJSON. Existing O(N) document cloning/validation/read remains. No browser, history recovery, security qualification, or 100k text timing claim.',
    finishedAt: new Date().toISOString(),
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, mode, records, driverHash, closureHash, seedHash, oracle: 'PASS'}));
