// Bounded Node diagnostic. Run with Node >=22.18; each case uses a fresh GC-enabled child.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {cpus, platform, arch, release} from 'node:os';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {StructuralSheet} from '@barocss/doc-sync';

const filename = fileURLToPath(import.meta.url), root = resolve(dirname(filename), '..');
const quantiles = samples => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {samples: samples.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], rawMs: samples};
};
const measure = (count, action) => {
    const samples = [];
    for (let index = 0; index < count; index++) { const start = performance.now(); action(index); samples.push(performance.now() - start); }
    return quantiles(samples);
};

if (process.argv[2] === '--case') {
    assert.equal(typeof globalThis.gc, 'function');
    const extent = Number(process.argv[3]), historyActions = Number(process.argv[4]);
    // Warm constructor code before the two heap readings. The retained object is the measured sheet.
    new StructuralSheet({actor: 'warm', sheetId: 'warm', rows: 8, columns: 8}).stats();
    globalThis.gc();
    const heapBeforeBytes = process.memoryUsage().heapUsed;
    const start = performance.now();
    const sheet = new StructuralSheet({actor: 'bench', sheetId: 's2', rows: extent, columns: extent});
    const constructMs = performance.now() - start;
    globalThis.gc();
    const heapAfterBytes = process.memoryUsage().heapUsed;
    const initialStats = sheet.stats();
    assert.equal(initialStats.rowRuns, 1); assert.equal(initialStats.columnRuns, 1);
    assert.equal(initialStats.retainedOps, 0); assert.equal(initialStats.registers, 0);
    const structural = measure(historyActions, index => {
        // Retain a mix of row/column insert, move, and delete history without expanding the extent.
        const axis = index % 2 ? 'Columns' : 'Rows';
        if (index % 3 === 0) sheet[`insert${axis}`](3, 1);
        else if (index % 3 === 1) sheet[`move${axis}`](2, 1, 5);
        else sheet[`delete${axis}`](3, 1);
    });
    const beforeEditsStats = sheet.stats();
    // Point edit warmup and samples deliberately retain their operations and history.
    for (let index = 0; index < 20; index++) sheet.setCell(10, 10, {value: `warm-${index}`});
    const pointEdit = measure(100, index => sheet.setCell(10, 10, {value: index}));
    let state;
    const capture = measure(10, () => { state = sheet.captureState(); });
    const stateJson = JSON.stringify(state);
    let replayed;
    const replay = measure(3, () => { replayed = StructuralSheet.fromState(state); });
    assert.deepEqual(replayed.captureState(), state);
    assert.equal(replayed.getCell(10, 10).value, 99);
    console.log(JSON.stringify({extent, historyActions, constructMs, initialStats,
        initialHeap: {heapBeforeBytes, heapAfterBytes, actualGcDeltaBytes: heapAfterBytes - heapBeforeBytes},
        structural: historyActions ? structural : null, beforeEditsStats, pointEdit, capture, replay,
        snapshotJsonBytes: Buffer.byteLength(stateJson), finalStats: sheet.stats()}));
} else {
    const cases = [];
    for (const extent of [1_000, 1_000_000, 1_000_000_000]) for (const history of [0, 25, 100]) {
        const child = spawnSync(process.execPath, ['--expose-gc', filename, '--case', String(extent), String(history)],
            {cwd: root, encoding: 'utf8', timeout: 60_000});
        if (child.status !== 0 || child.error) throw new Error(`Case ${extent}/${history}: ${child.error ?? child.stderr}`);
        const result = JSON.parse(child.stdout); cases.push(result);
        console.log(JSON.stringify({extent, history, rowRuns: result.initialStats.rowRuns, columnRuns: result.initialStats.columnRuns,
            heapDeltaBytes: result.initialHeap.actualGcDeltaBytes, pointP50Ms: result.pointEdit.p50Ms, pointP95Ms: result.pointEdit.p95Ms,
            captureP50Ms: result.capture.p50Ms, replayP50Ms: result.replay.p50Ms}));
    }
    const files = ['packages/doc-sync/src/spreadsheet/axis.ts', 'packages/doc-sync/src/spreadsheet/structural-sheet.ts',
        'packages/doc-sync/src/spreadsheet/sheet.ts', 'packages/doc-sync/src/spreadsheet/schema.ts',
        'packages/doc-sync/src/spreadsheet/index.ts', 'packages/doc-sync/dist/index.js',
        'packages/doc-sync/dist/spreadsheet/axis.js', 'packages/doc-sync/dist/spreadsheet/structural-sheet.js',
        'packages/doc-sync/test/spreadsheet-structural-properties.test.ts', 'benchmarks/spreadsheet-s2.mjs'];
    const receipt = {format: 'spreadsheet-s2-node-diagnostic-v1', createdAt: new Date().toISOString(),
        environment: {node: process.version, executable: process.execPath, platform: platform(), arch: arch(), osRelease: release(), cpu: cpus()[0]?.model},
        head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
        sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])),
        method: {api: 'public built @barocss/doc-sync root export', cases: 'fresh --expose-gc process for each extent/history pair',
            pointWarmup: 20, pointSamples: 100, captureSamples: 10, replaySamples: 3,
            replayInput: 'in-memory captured state; JSON parse is excluded',
            note: 'Single bounded diagnostic, no production budget claim. Initial heap is actual post-GC heapUsed delta; JIT and GC noise can make it negative. No per-slot heap estimate. Point samples retain cell history. Capture and replay include that history.'}, cases};
    const output = resolve(root, 'output/spreadsheet-s2-node-performance-20261103');
    mkdirSync(output, {recursive: true}); writeFileSync(resolve(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`Receipt: ${resolve(output, 'receipt.json')}`);
}
