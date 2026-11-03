// Standalone source-only DOCUMENT control. No owner bridge, method patches, or builds.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {cpus, loadavg, platform, release, arch} from 'node:os';
import {resolve, join, dirname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const usage = `Usage: /Users/user/.nvm/versions/node/v24.22.1/bin/node benchmarks/doc-trace-control.mjs
  --source-root PATH --label NAME --output NEW.json
  [--chars 100000] [--samples 7] [--warmup 2] [--mode smoke|timing]
Timing requires exactly 100000 UTF16 units; defaults are 7 samples and 2 warmups.
Smoke requires --chars 512..2000 --samples <=3 --warmup <=3 (defaults: 1000, 3, 2).
Each sample restores two replicas from one fixed baseline. One complete Doc.edit
batch replaces 8 middle ASCII units with Hangul/emoji text; remote loops over its
plain wire operations. First post-edit local/remote toJSON reads are separate.
No normalization listener, History, engine, Data owner, private bridge claim,
prototype/global instrumentation, allocation estimate, or speed claim.
Baseline is the real post-refactor-baseline directory, NOT an ec962 checkout.
Run one source per process. Root must schedule final ABBA timing after source freeze.
Errors: unknown/duplicate options, missing paths, wrong Node/flags, existing output,
source imports outside selected src, changed source/driver, or oracle failure reject
results. Runtime failures write a new FAIL receipt; outputs are never overwritten.`;
if (process.argv.length === 3 && process.argv[2] === '--help') { console.log(usage); process.exit(0); }
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
    const [key, value] = process.argv.slice(i, i + 2);
    assert(['--source-root', '--label', '--output', '--chars', '--samples', '--warmup', '--mode'].includes(key) && value && !value.startsWith('--') && !(key in args), `Invalid option: ${key}\n${usage}`);
    args[key] = value;
}
for (const key of ['--source-root', '--label', '--output']) assert(args[key], `Required: ${key}\n${usage}`);
const integer = (value, min, max) => { assert(/^\d+$/.test(value) && Number.isSafeInteger(+value) && +value >= min && +value <= max, `Invalid integer: ${value}`); return +value; };
const mode = args['--mode'] ?? 'smoke';
assert(['smoke', 'timing'].includes(mode), 'Invalid mode');
const chars = integer(args['--chars'] ?? (mode === 'timing' ? '100000' : '1000'), 512, 100000);
const samples = integer(args['--samples'] ?? (mode === 'timing' ? '7' : '3'), 1, 15);
const warmup = integer(args['--warmup'] ?? '2', 0, 5);
assert(mode !== 'timing' || chars === 100000, 'Timing requires 100000 UTF16 units');
assert(mode !== 'smoke' || chars <= 2000 && samples <= 3 && warmup <= 3, 'Smoke must stay small');
const pinnedNode = '/Users/user/.nvm/versions/node/v24.22.1/bin/node';
assert.equal(process.version, 'v24.22.1', 'Use pinned Node v24.22.1');
assert.equal(realpathSync(process.execPath), realpathSync(pinnedNode), 'Use pinned Node executable');
assert(process.execArgv.length === 0 && !process.env.NODE_OPTIONS, 'Strip-only run requires no execArgv/NODE_OPTIONS');
const driverPath = realpathSync(fileURLToPath(import.meta.url)), workspace = dirname(dirname(driverPath));
const output = resolve(args['--output']);
assert(output.endsWith('.json'), 'Output must be JSON');
assert.equal(realpathSync(dirname(output)), realpathSync(join(workspace, 'output/data-cache-2026-11-04')), 'Output must use owned evidence directory');
assert(output.split(sep).at(-1).startsWith('doc-trace-control.'), 'Use owned doc-trace-control.* output name');
assert(!existsSync(output), 'Refusing to overwrite output');
const root = realpathSync(resolve(args['--source-root'])), source = realpathSync(join(root, 'packages/doc-sync/src'));
const prescribedBefore = realpathSync(join(workspace, 'output/refactor-2026-11-03/post-refactor-baseline'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(JSON.stringify(value));
const files = () => Object.fromEntries(readdirSync(source, {recursive: true}).filter(p => p.endsWith('.ts')).sort().map(p => [p, sha(readFileSync(join(source, p)))]));
const sourceFiles = files(), driverSHA = sha(readFileSync(driverPath));
const loaded = new Set();
const environment = () => ({loadavg: loadavg(), cpuUsage: process.cpuUsage(), resourceUsage: process.resourceUsage()});
const report = {
    status: 'RUNNING', label: args['--label'], mode, timingEvidence: mode === 'timing',
    sourceRootRealpath: root, sourceDirectoryRealpath: source, prescribedBeforeRealpath: prescribedBefore,
    sourceRole: root === prescribedBefore ? 'post-refactor-baseline snapshot' : 'selected current/candidate source; label is not provenance',
    sourceFiles, sourceClosureSHA: digest(sourceFiles), driverPath, benchmarkSHA: driverSHA,
    charsUTF16: chars, samples, warmup, node: process.version, executable: process.execPath,
    execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null, argv: process.argv.slice(2),
    host: {platform: platform(), release: release(), arch: arch(), cpus: cpus().map(({model, speed}) => ({model, speed}))},
    process: {pid: process.pid, startedUTC: new Date().toISOString(), start: environment(), isolation: 'single source process; other host activity is not controlled'},
    trace: 'DISABLED by construction: direct Doc only; no private bridge import/claim, no point owner, no engine or Client',
    instrumentation: 'NONE: no Doc/Engine prototype changes or global intrinsic changes',
    timer: 'performance.now; full public Doc.edit default compiler path; remote loop over plain returned operations; separate first local/remote toJSON after operation. No asserts, schema creation, restore, seed, serialization, hashes, or reference oracle in intervals. Compiler-internal reads/costs remain in Doc.edit.',
    limits: 'Cold read means first toJSON after the measured operation, not empty CPU caches or forced cache invalidation. No normalization listener or History. No allocation/retained-heap claims. Raw totals and medians only; no performance acceptance or speed claim.',
    runs: [],
};
try {
    registerHooks({resolve(specifier, context, next) {
        const result = next(specifier, context);
        if (result.url.startsWith('file:')) {
            const path = realpathSync(fileURLToPath(result.url));
            assert(path.startsWith(source + sep) && path.endsWith('.ts'), `Import outside selected source: ${path}`);
            loaded.add(path.slice(source.length + 1));
        } else assert(result.url.startsWith('node:'), `Non-source dependency: ${result.url}`);
        return result;
    }});
    const {Doc} = await import(pathToFileURL(join(source, 'crdt/doc.ts')).href);
    const {checkSchema} = await import(pathToFileURL(join(source, 'crdt/schema.ts')).href);
    // Structurally a DocumentSchema, validated by selected source; no production helper oracle.
    const schema = {domain: 'document', root: 'doc', nodes: {doc: {shape: 'flow', children: ['p'], default: 'p'}, p: {shape: 'text'}}, marks: []};
    assert.deepEqual(checkSchema(schema), []);
    const actor = 'doc-trace-control-fixed', seedActor = 'doc-trace-seed-fixed';
    const ticket = (lamport, who = actor) => ({lamport, actor: who});
    const key = t => `${t.lamport}@${t.actor}`;
    const rootTicket = ticket(0, '~root');
    // 12 UTF16 units per pattern; slice only an ASCII-padded prefix if necessary.
    const pattern = 'ab가🙂cd한글XYZ';
    let text = pattern.repeat(Math.ceil(chars / pattern.length)).slice(0, chars);
    if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1) + 'a';
    assert.equal(text.length, chars);
    const model = value => ({type: 'doc', children: [{type: 'p', runs: [{text: value, marks: {}}]}]});
    const seedDoc = new Doc(seedActor, schema);
    // One bulk edit, not N inserts. All seeding is outside measured intervals.
    const seeded = seedDoc.edit([{op: 'insert', at: [0, 0], content: text}]);
    assert.deepEqual(seeded.ops, [{t: 'text', id: ticket(1, seedActor), origin: rootTicket, text}]);
    assert.deepEqual(seedDoc.toJSON(), model(text));
    const baseline = seedDoc.snapshot();
    // Independent token reference: no Doc helpers, canonicalizer or operation replay.
    const tokens = Array.from({length: chars}, (_, i) => ({id: ticket(i + 1, seedActor), origin: i ? ticket(i, seedActor) : rootTicket, ch: text[i], dels: []}));
    function snapshotOf(list, lamport) {
        const items = [{i: key(rootTicket), o: null, k: 'n', y: 'root'}];
        let previous = rootTicket;
        for (const token of list) {
            const item = {};
            if (previous.actor !== token.id.actor || previous.lamport + 1 !== token.id.lamport) item.i = key(token.id);
            if (token.origin.actor !== token.id.actor || token.origin.lamport !== token.id.lamport - 1) item.o = key(token.origin);
            item.c = token.ch;
            if (token.dels.length) item.d = token.dels;
            items.push(item); previous = token.id;
        }
        return {lamport, lines: [{key: key(rootTicket), owner: null, slot: '', items}]};
    }
    assert.deepEqual(baseline, snapshotOf(tokens, chars), 'Independent exact seed snapshot');
    const edits = [], expectedOps = [];
    let expectedText = text, clock = chars;
    // Eight disjoint ASCII replacements near the middle. UTF16 offsets never split emoji.
    for (let i = 0; i < 8; i++) {
        const offset = expectedText.indexOf('a', Math.floor(chars / 2) + i * 24);
        assert(offset >= 0, 'Fixture too short for bounded workload');
        const payload = `편집🙂${i}`;
        const visible = tokens.filter(t => !t.dels.length);
        const target = visible[offset], origin = offset ? visible[offset - 1].id : rootTicket;
        const inserted = Array.from({length: payload.length}, (_, j) => ({id: ticket(clock + j + 1), origin: j ? ticket(clock + j) : origin, ch: payload[j], dels: []}));
        expectedOps.push({t: 'text', id: ticket(clock + 1), origin, text: payload});
        clock += payload.length;
        const deletion = ticket(++clock);
        expectedOps.push({t: 'del', at: deletion, ids: [target.id]});
        tokens.splice(tokens.indexOf(target), 0, ...inserted);
        target.dels.push(key(deletion));
        edits.push({op: 'insert', at: [0, offset], content: payload}, {op: 'delete', at: [0, offset + payload.length], count: 1});
        expectedText = expectedText.slice(0, offset) + payload + expectedText.slice(offset + 1);
    }
    const expectedModel = model(expectedText), expectedSnapshot = snapshotOf(tokens, clock);
    Object.assign(report, {actor, seedActor, schema, schemaSHA: digest(schema), fixtureSHA: digest(baseline), seedTextSHA: sha(text), workloadSHA: digest(edits), edits,
        expectedOperationSHA: digest(expectedOps), expectedModelSHA: digest(expectedModel), expectedSnapshotSHA: digest(expectedSnapshot),
        expectedFinal: {clock, textLengthUTF16: expectedText.length, lineCount: 1, storedItems: tokens.length + 1, liveChars: expectedText.length, deletedChars: 8},
        batch: {editCount: edits.length, wireOperations: expectedOps.length, replacementCount: 8}, warmupHashes: []});
    for (let i = 0; i < warmup + samples; i++) {
        const local = Doc.fromSnapshot(actor, baseline, schema), remote = Doc.fromSnapshot(actor, baseline, schema);
        // Neither fixture is read before the interval. Shared IDs, tickets and actor are exact.
        const begin = performance.now();
        const result = local.edit(edits);
        const editEnd = performance.now();
        const localModel = local.toJSON();
        const localReadEnd = performance.now();
        // Detach wire DTOs outside intervals: no private emitted object identity reaches remote.
        const wire = JSON.parse(JSON.stringify(result.ops));
        const remoteBegin = performance.now();
        for (const op of wire) remote.apply(op);
        const remoteEnd = performance.now();
        const remoteModel = remote.toJSON();
        const remoteReadEnd = performance.now();
        assert.deepEqual(result.normalize, []);
        assert.deepEqual(result.ops, expectedOps, 'Independent exact operation/clock oracle');
        assert.deepEqual(localModel, expectedModel); assert.deepEqual(remoteModel, expectedModel);
        const localSnapshot = local.snapshot(), remoteSnapshot = remote.snapshot();
        assert.deepEqual(localSnapshot, expectedSnapshot, 'Independent full local token/line/clock oracle');
        assert.deepEqual(remoteSnapshot, expectedSnapshot, 'Independent full remote token/line/clock oracle');
        assert.deepEqual(localSnapshot, remoteSnapshot, 'Replica convergence');
        const hashes = {operations: digest(wire), model: digest(localModel), snapshot: digest(localSnapshot)};
        if (i < warmup) report.warmupHashes.push(hashes);
        else report.runs.push({sample: i - warmup + 1, localEditMs: editEnd - begin, localColdToJSONMs: localReadEnd - editEnd,
            remoteApplyMs: remoteEnd - remoteBegin, remoteColdToJSONMs: remoteReadEnd - remoteEnd,
            localEditAndReadMs: localReadEnd - begin, remoteApplyAndReadMs: remoteReadEnd - remoteBegin, hashes,
            sizes: report.expectedFinal});
    }
    const metrics = ['localEditMs', 'localColdToJSONMs', 'remoteApplyMs', 'remoteColdToJSONMs', 'localEditAndReadMs', 'remoteApplyAndReadMs'];
    report.mediansMs = Object.fromEntries(metrics.map(metric => {
        const values = report.runs.map(row => row[metric]).sort((a, b) => a - b), mid = Math.floor(values.length / 2);
        return [metric, values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2];
    }));
    report.sourceFilesAtEnd = files(); report.sourceClosureSHAAtEnd = digest(report.sourceFilesAtEnd);
    assert.deepEqual(report.sourceFilesAtEnd, sourceFiles, 'Source changed during run; result rejected');
    assert.equal(sha(readFileSync(driverPath)), driverSHA, 'Driver changed during run; result rejected');
    report.sourceUnchangedAtEnd = true;
    report.oracle = {schema: 'PASS', utf16TextAndModel: 'PASS', exactOperations: 'PASS', exactSnapshotLinesTokensClock: 'PASS', replicaConvergence: 'PASS', undoRedo: 'NOT_RUN: no History in this direct Doc control'};
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.error = {name: error.name, message: error.message, stack: error.stack};
    try { report.sourceFilesAtEnd = files(); report.sourceClosureSHAAtEnd = digest(report.sourceFilesAtEnd); report.sourceUnchangedAtEnd = digest(sourceFiles) === report.sourceClosureSHAAtEnd; } catch (e) { report.sourceEndError = e.message; }
    process.exitCode = 1;
} finally {
    report.loadedSourceFiles = [...loaded].sort(); report.process.end = environment(); report.process.endedUTC = new Date().toISOString();
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({status: report.status, output, sourceClosureSHA: report.sourceClosureSHA, error: report.error?.message}));
}
