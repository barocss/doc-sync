// Source-only, single-lane public Data benchmark. Never builds or rewrites source.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {cpus, loadavg, platform, release, arch} from 'node:os';
import {resolve, join, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const usage = `Usage: node benchmarks/data-point-cache.mjs --source-root PATH --label NAME --output NEW.json [--records 2000|20000] [--samples 7] [--warmup 2] [--mode smoke|counts|timing] [--expect-root-clones 0|1]
Smoke accepts 6–200 entries. Counts accepts 6–20000 entries. Timing accepts 2000 or 20000 total entries.
Counts instruments ONLY global structuredClone(data-root); no Client/Doc/History method changes.
Counts reports observations by default. Use --expect-root-clones to assert an explicit expectation; source paths never imply eligibility.
Labels are descriptive only, never a HEAD baseline or eligibility assertion. Source before:
output/refactor-2026-11-03/post-refactor-baseline. Text control is DISABLED.
Timing is for root's later reviewed ABBA runs; this driver makes no speed or heap claim.`;
if (process.argv.length === 3 && process.argv[2] === '--help') { console.log(usage); process.exit(0); }
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const [key, value] = process.argv.slice(i, i + 2);
    assert(['--source-root', '--label', '--output', '--records', '--samples', '--warmup', '--mode', '--expect-root-clones'].includes(key) && value && !value.startsWith('--') && !(key in args), `Invalid option: ${key}\n${usage}`);
    args[key] = value;
}
for (const key of ['--source-root', '--label', '--output']) assert(args[key], `Required: ${key}`);
const integer = (v, min, max) => { assert(/^\d+$/.test(v) && Number.isSafeInteger(+v) && +v >= min && +v <= max, `Invalid integer ${v}`); return +v; };
const mode = args['--mode'] ?? 'smoke';
assert(['smoke', 'counts', 'timing'].includes(mode), 'Invalid mode');
assert(!('--expect-root-clones' in args) || mode === 'counts', '--expect-root-clones requires counts mode');
const expectedRootClones = args['--expect-root-clones'] === undefined ? null : integer(args['--expect-root-clones'], 0, 1);
const records = integer(args['--records'] ?? (mode === 'timing' ? '2000' : '20'), 6, 20000);
const samples = integer(args['--samples'] ?? (mode === 'timing' ? '7' : '1'), 1, 30), warmup = integer(args['--warmup'] ?? (mode === 'timing' ? '2' : '1'), 0, 10);
assert(mode !== 'timing' || [2000, 20000].includes(records), 'Timing requires 2000 or 20000 entries');
assert(mode !== 'smoke' || (records <= 200 && samples <= 3 && warmup <= 3), 'Smoke must stay small (<=200 entries, <=3 samples/warmups)');
assert(mode !== 'counts' || (samples === 1 && warmup <= 1), 'Counts requires one sample and at most one warmup');
assert.equal(process.version, 'v24.22.1', 'Use pinned Node v24.22.1');
const root = realpathSync(resolve(args['--source-root'])), source = realpathSync(join(root, 'packages/doc-sync/src'));
const output = resolve(args['--output']);
assert(!existsSync(output), 'Refusing to overwrite output');
assert(!output.startsWith(source + sep), 'No output in source');
assert(!output.split(sep).includes('dist'), 'No dist writes');
assert(process.execArgv.length === 0 && !process.env.NODE_OPTIONS, 'Stock strip-only source run requires no execArgv/NODE_OPTIONS');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const driverPath = realpathSync(fileURLToPath(import.meta.url)), driverSHA = sha(readFileSync(driverPath));
const historicalBeforePath = resolve(driverPath, '../../output/refactor-2026-11-03/post-refactor-baseline');
assert(output.endsWith('.json'), 'Use a new JSON output');
assert(!output.startsWith(join(root, 'packages') + sep) && !output.startsWith(join(root, 'benchmarks') + sep), 'No output in code');
const files = () => Object.fromEntries(readdirSync(source, {recursive: true}).filter(p => p.endsWith('.ts')).sort().map(p => [p, sha(readFileSync(join(source, p)))]));
const sourceFiles = files(), closureSHA = sha(JSON.stringify(sourceFiles));
const loaded = new Set();
registerHooks({resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (result.url.startsWith('file:')) {
        const path = realpathSync(fileURLToPath(result.url));
        assert(path.startsWith(source + sep) && path.endsWith('.ts'), `Import outside selected source closure: ${path}`);
        loaded.add(path.slice(source.length + 1));
    } else assert(result.url.startsWith('node:'), `Non-source dependency: ${result.url}`);
    return result;
}});
const {Client} = await import(pathToFileURL(join(source, 'client/index.ts')).href);
const {createDataSchema} = await import(pathToFileURL(join(source, 'data/schema.ts')).href);
const actor = 'data-point-cache-fixed';
const id = i => `data:00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
const sizes = [Math.floor(records / 3), Math.floor(records / 3), records - 2 * Math.floor(records / 3)];
const rows = [], lineRows = [[], [], []];
let nextID = 10;
for (let group = 0; group < 3; group++) for (let i = 0; i < sizes[group]; i++) {
    const row = {id: id(nextID++), key: `key-${i}`, value: i, path: group === 0 ? [i] : [sizes[0] + group - 1, i]};
    rows.push(row); lineRows[group].push(row);
}
const empty = new Client({schema: createDataSchema(), actor});
const state = empty.captureState(); empty.dispose();
let clock = 0;
const head = key => ({i: key, o: null, k: 'n', y: 'root'});
function atom(type, attrs, after) {
    const ticket = `${++clock}@${actor}`;
    return {i: ticket, o: after, k: 'n', b: type, a: [['$type', type, ticket], ...Object.entries(attrs).map(([k, v]) => [k, v, ticket])]};
}
const rootItems = [head('0@~root')];
const append = (items, row) => items.push(atom('entry', {id: row.id, key: row.key, value: {scalar: row.value}}, items.at(-1).i));
for (const row of lineRows[0]) append(rootItems, row);
const map = atom('map', {id: id(1)}, rootItems.at(-1).i); rootItems.push(map);
const list = atom('list', {id: id(2)}, rootItems.at(-1).i); rootItems.push(list);
const lines = [{key: '0@~root', owner: null, slot: '', items: rootItems}];
for (const [parent, group] of [[map, 1], [list, 2]]) {
    const key = `0@${parent.i}/body`, items = [head(key)];
    for (const row of lineRows[group]) append(items, row);
    lines.push({key, owner: parent.i, slot: 'body', items});
}
state.engine.document = {format: 2, capabilities: [], lines, lamport: clock};
state.engine.revision = clock;
const fixtureSHA = sha(JSON.stringify(state));
function fixture() {
    const client = Client.fromState(state, {schema: createDataSchema()});
    const handles = [client.data.root, client.data.getMap(id(1)), client.data.getList(id(2))];
    assert(handles.every(Boolean));
    // Only normal public reads warm the cache. No raw owner compatibility escape.
    handles[0].get('key-0'); handles[1].get('key-0'); handles[2].get(lineRows[2][0].id);
    return {client, handles};
}
const targets = lineRows.map(group => group[Math.floor(group.length / 2)]);
function point(f, group) {
    const h = f.handles[group], row = targets[group];
    return {set: value => group === 2 ? h.set(row.id, value) : h.set(row.key, value),
        raw: value => f.client.edit([{op: 'update', at: row.path, attrs: {value: {scalar: value}}}]),
        get: () => group === 2 ? h.get(row.id) : h.get(row.key),
        entry: () => group === 2 ? h.entry(row.id) : h.candidates(row.key).at(-1)};
}
function frozen(value) {
    if (!value || typeof value !== 'object') return;
    assert(Object.isFrozen(value)); for (const v of Object.values(value)) frozen(v);
}
function oracle(f, expected) {
    // Full arrays and full public model, independent of the cache decoder.
    const modelRows = lineRows.map((group, g) => group.map(row => ({type: 'entry', attrs: {id: row.id, key: row.key, value: expected.has(row.id) ? expected.get(row.id) : {scalar: row.value}}})));
    assert.deepEqual(f.client.model(), {type: 'data', children: [...modelRows[0], {type: 'map', attrs: {id: id(1)}, children: modelRows[1]}, {type: 'list', attrs: {id: id(2)}, children: modelRows[2]}]});
    for (let g = 0; g < 3; g++) {
        const decoded = row => {
            const encoded = expected.get(row.id) ?? {scalar: row.value};
            return 'scalar' in encoded ? encoded.scalar : f.handles[encoded.reference === '$root' ? 0 : encoded.reference === id(1) ? 1 : 2];
        };
        const entries = g === 2 ? lineRows[g].map(row => ({id: row.id, value: decoded(row)})) : lineRows[g].map(row => [row.key, decoded(row)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        assert.deepEqual(f.handles[g].entries(), entries);
    }
}
function comparableState(client) {
    const s = client.captureState();
    // Only wall-clock History group timestamps are nondeterministic; preserve all steps/tickets.
    for (const side of ['undo', 'redo']) for (const group of s.engine.history[side]) group.at = 0;
    return s;
}
function same(a, b) {
    assert.deepEqual(a.client.model(), b.client.model());
    assert.deepEqual(a.client.snapshot(), b.client.snapshot());
    assert.deepEqual(a.client.historyStatus(), b.client.historyStatus());
    assert.deepEqual(comparableState(a.client), comparableState(b.client));
}
let counting = false, roots = 0;
const originalClone = globalThis.structuredClone;
if (mode === 'counts') globalThis.structuredClone = function(value, options) {
    if (counting && value?.type === 'data' && Array.isArray(value.children)) roots++;
    return originalClone(value, options);
};
const environment = () => ({loadavg: loadavg(), cpuUsage: process.cpuUsage(), resourceUsage: process.resourceUsage()});
const startEnvironment = environment(), scenarios = [];
try {
    for (let group = 0; group < 3; group++) {
        const eligible = fixture(), control = fixture(), p = point(eligible, group), c = point(control, group);
        const expected = new Map(), old = p.entry(), held = structuredClone(old);
        frozen(old); oracle(eligible, expected); oracle(control, expected);
        const runs = [], controlRuns = [], counts = [];
        const total = warmup + samples;
        for (let i = 0; i < total; i++) {
            const value = 1000 + i;
            roots = 0; counting = mode === 'counts' && i >= warmup;
            const start = performance.now(); p.set(value); const setEnd = performance.now();
            const setClones = roots;
            const got = p.get(); const end = performance.now();
            const clones = roots; counting = false;
            assert.equal(got, value); // Never inside either measured interval.
            if (i >= warmup) {
                runs.push({setMs: setEnd - start, nextReadMs: end - setEnd, totalMs: end - start});
                counts.push({setterRootClones: setClones, nextReadRootClones: clones - setClones, totalRootClones: clones});
            }
        }
        // Same fixture, actor, operations, sample flags, normal History. Raw edit is a
        // separately bounded fallback control, never the claimed optimized workload.
        const controlSamples = Math.min(samples, 3);
        for (let i = 0; i < total; i++) {
            roots = 0; counting = mode === 'counts' && i >= warmup && i < warmup + controlSamples;
            const start = performance.now(); c.raw(1000 + i); const setEnd = performance.now();
            const got = c.get(); const end = performance.now(); const clones = roots; counting = false;
            assert.equal(got, 1000 + i);
            if (i >= warmup && i < warmup + controlSamples) controlRuns.push({setMs: setEnd - start, nextReadMs: end - setEnd, totalMs: end - start, rootClones: mode === 'counts' ? clones : null});
        }
        expected.set(targets[group].id, {scalar: 1000 + total - 1});
        oracle(eligible, expected); oracle(control, expected); same(eligible, control);
        assert(eligible.client.historyStatus().canUndo);
        assert.deepEqual(old, held); frozen(old);
        const checkpoint = eligible.client.model();
        eligible.client.undo(); control.client.undo(); same(eligible, control);
        expected.set(targets[group].id, {scalar: total === 1 ? targets[group].value : 1000 + total - 2}); oracle(eligible, expected);
        assert(eligible.client.historyStatus().canRedo);
        eligible.client.redo(); control.client.redo(); same(eligible, control); assert.deepEqual(eligible.client.model(), checkpoint);
        // Repeated setters with NO intervening reads. Setter is not forced eager.
        for (const value of [2001, 2002, 2003]) {p.set(value); c.raw(value);}
        assert.equal(p.get(), 2003); assert.equal(c.get(), 2003); same(eligible, control);
        // References and negative zero are semantic checks outside measurement.
        p.set(-0); c.raw(-0); assert(Object.is(p.get(), -0)); assert(Object.is(c.get(), -0)); same(eligible, control);
        for (const target of [0, 1, 2]) {
            p.set(eligible.handles[target]);
            const reference = target === 0 ? '$root' : id(target);
            control.client.edit([{op: 'update', at: targets[group].path, attrs: {value: {reference, kind: target === 2 ? 'list' : 'map'}}}]);
            assert.equal(p.get(), eligible.handles[target]); same(eligible, control);
        }
        expected.set(targets[group].id, {reference: id(2), kind: 'list'});
        oracle(eligible, expected); oracle(control, expected);
        assert.deepEqual(old, held); frozen(old);
        if (mode === 'counts') {
            for (const row of counts) {
                assert.equal(row.setterRootClones, 0, 'Setter must not eagerly clone the root model');
                if (expectedRootClones !== null) assert.equal(row.nextReadRootClones, expectedRootClones, `Projection proof failed: caller expected ${expectedRootClones} root clone(s)`);
            }
            assert(counts.every(row => row.nextReadRootClones === counts[0].nextReadRootClones), 'Unstable projection eligibility');
            assert(controlRuns.every(row => row.rootClones === 1), 'Raw control must prove full refresh');
        }
        scenarios.push({name: ['existing-root-map-overwrite', 'existing-nested-map-overwrite', 'existing-list-item-set'][group], target: targets[group], history: 'normal record path',
            timing: mode === 'timing' ? runs : null, rawEditReadControlTiming: mode === 'timing' ? controlRuns.map(({rootClones, ...r}) => r) : null,
            controlSamples, counts: mode === 'counts' ? counts : null,
            projection: mode === 'counts' ? `observed next-read root clones: ${counts[0].nextReadRootClones}` : 'NOT_MEASURED: use separate counts mode',
            oracle: {fullArraysIDsOrderValues: 'PASS', publicModel: 'PASS', snapshotAndHistoryControl: 'PASS', undoRedo: 'PASS', heldFrozenEntry: 'PASS', repeatedSetsNoRead: 'PASS', referencesAndNegativeZero: 'PASS'}});
        eligible.client.dispose(); control.client.dispose();
    }
} finally { counting = false; globalThis.structuredClone = originalClone; }
assert.deepEqual(files(), sourceFiles, 'Source changed during run; result rejected');
assert.equal(sha(readFileSync(driverPath)), driverSHA, 'Driver changed during run');
const report = {label: args['--label'], mode, sourceRootRealpath: root, sourceDirectoryRealpath: source, driverPath, driverSHA, closureSHA, sourceFiles,
    loadedSourceFiles: [...loaded].sort(), historicalBeforePath, expectedRootClonesInCounts: expectedRootClones, sourceUnchangedAtEnd: true, fixtureSHA, actor, records, entryCounts: {rootMap: sizes[0], nestedMap: sizes[1], list: sizes[2]}, samples, warmup,
    node: process.version, executable: process.execPath, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null,
    os: {platform: platform(), release: release(), arch: arch(), cpus: cpus().map(({model, speed}) => ({model, speed}))},
    process: {pid: process.pid, scope: 'single lane; no isolation from other host processes', start: startEnvironment, end: environment()}, argv: process.argv.slice(2),
    seed: 'One linear fixed valid checkpoint; public Client.fromState; fixed actor, IDs, tickets, keys (including list entries), finite tagged scalars; no random/Date provenance',
    timer: 'performance.now; complete public setter then next public point read; assertions, seed, import, warmup, snapshots, History comparisons, full arrays outside intervals; setter is not forced eager',
    instrumentation: mode === 'counts' ? 'ONLY global structuredClone ROOT NodeJSON counter; no method overrides; NOT timing evidence' : 'NONE; stock methods and global structuredClone',
    historyComparison: 'Full captured checkpoint comparison; ONLY undo/redo group wall-clock at normalized to zero. All tickets, step order and values retained.',
    text100kControl: 'DISABLED; no general Doc no-regression evidence here', scope: 'SOURCE ONLY; no build/dist/browser/mobile/heap-allocation/speed/release claim. Labels do not imply HEAD baseline. Independent exact-byte High review and root ABBA remain required.', scenarios};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, mode, records, driverSHA, closureSHA, fixtureSHA, oracle: 'PASS', projection: scenarios.map(s => s.projection)}));
