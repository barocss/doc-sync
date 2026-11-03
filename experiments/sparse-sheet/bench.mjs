import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {SparseSheet} from './src/sheet.ts';

if (typeof globalThis.gc !== 'function') throw new Error('Run with node --expose-gc');
const output = fileURLToPath(new URL('../../output/sparse-sheet-proof/', import.meta.url));
mkdirSync(output, {recursive: true});
const time = (fn) => {
    const start = performance.now();
    const result = fn();
    return {result, ms: performance.now() - start};
};
const heap = () => {
    globalThis.gc();
    return process.memoryUsage().heapUsed;
};
const scenarios = [
    {name: 'small-extent-tiny-writes', rows: 100, columns: 100, touched: 4},
    {name: 'huge-extent-tiny-writes', rows: 1_000_000_000, columns: 1_000_000, touched: 4},
    {name: 'huge-extent-1000-cells', rows: 1_000_000_000, columns: 1_000_000, touched: 1000},
    {name: 'huge-extent-10000-cells', rows: 1_000_000_000, columns: 1_000_000, touched: 10000},
];

function measure({name, rows, columns, touched}) {
    const baselineHeap = heap();
    const created = time(() => new SparseSheet({actor: 'bench', sheetId: name, rows, columns}));
    const sheet = created.result;
    const emptyState = sheet.captureState();
    const emptyCaptureBytes = Buffer.byteLength(JSON.stringify(emptyState));
    assert.equal(sheet.stats().registers, 0);
    assert.equal(sheet.stats().retainedOps, 0);
    const emptyHeapDeltaBytes = heap() - baselineHeap;
    const coordinates = [];
    const writes = time(() => {
        for (let index = 0; index < touched; index++) {
            const row = index === 0 ? rows - 1 : index - 1;
            const column = index === 0 ? columns - 1 : index % columns;
            coordinates.push({row, column});
            sheet.setCell(row, column, {value: index});
        }
    });
    const touchedHeapDeltaBytes = heap() - baselineHeap;
    const captured = time(() => sheet.captureState());
    const captureBytes = Buffer.byteLength(JSON.stringify(captured.result));
    const hot = time(() => {
        let checksum = 0;
        for (let index = 0; index < 10000; index++) {
            const coordinate = coordinates[index % touched];
            checksum += sheet.getCell(coordinate.row, coordinate.column).value;
        }
        return checksum;
    });
    let expectedChecksum = 0;
    for (let index = 0; index < 10000; index++) expectedChecksum += index % touched;
    assert.equal(hot.result, expectedChecksum);
    const range = time(() => sheet.getRange({row: 0, column: 0, rowCount: rows, columnCount: columns, limit: touched}));
    assert.equal(range.result.length, touched);
    const byCoordinate = new Map(range.result.map(({row, column, cell}) => [`${row}:${column}`, cell.value]));
    for (let index = 0; index < touched; index++) {
        const {row, column} = coordinates[index];
        assert.equal(byCoordinate.get(`${row}:${column}`), index);
    }
    assert.equal(sheet.stats().registers, touched);
    const restarted = SparseSheet.fromState(JSON.parse(JSON.stringify(captured.result)));
    assert.deepEqual(restarted.getRange({row: 0, column: 0, rowCount: rows, columnCount: columns, limit: touched}), range.result);
    const peer = new SparseSheet({actor: 'peer', sheetId: name, rows, columns});
    peer.receive(sheet.pendingChanges());
    peer.receive(sheet.pendingChanges());
    assert.deepEqual(peer.getRange({row: 0, column: 0, rowCount: rows, columnCount: columns, limit: touched}), range.result);
    return {name, rows, columns, touched, createMs: created.ms, emptyHeapDeltaBytes, emptyCaptureBytes,
        writeMs: writes.ms, touchedHeapDeltaBytes, captureMs: captured.ms, captureBytes,
        getCell10000Ms: hot.ms, getCellChecksum: hot.result, getRangeMs: range.ms, rangeEntries: range.result.length,
        stats: sheet.stats(), correctness: 'PASS'};
}

const report = {
    scope: 'Isolated sparse-sheet experiment; excludes formula evaluation, browser rendering, transport, and Excel compatibility.',
    node: process.version, generatedAt: new Date().toISOString(),
    system: {platform: os.platform(), release: os.release(), architecture: os.arch(), cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem()},
    sha256: Object.fromEntries(['src/sheet.ts', 'bench.mjs', 'test/sheet.test.ts'].map(path => [path,
        createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex')])),
    measurement: 'One sample per scenario. Heap deltas use explicit GC and may be noisy or negative. Times are observations without performance pass thresholds.',
    scenarios: scenarios.map(measure),
};
writeFileSync(new URL('../../output/sparse-sheet-proof/benchmark.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
