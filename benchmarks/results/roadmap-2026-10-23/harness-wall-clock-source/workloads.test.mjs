import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEngines} from './engines.mjs';
import {commonScripts, makeTableEngines, measureSerial, measureTable} from './workloads.mjs';
import {makeTrace} from '../trace.ts';

const baseline = process.env.STAGE0_BASELINE ?? fileURLToPath(new URL('../../', import.meta.url));
const engines = await loadEngines(baseline, process.env.STAGE0_YORKIE);

test('opening script has exactly 10000 edits and independently computed final text', () => {
    const script = commonScripts(makeTrace).find(s => s.name === 'open-after-10000edits');
    assert.equal(script.ops.length, 10000);
    let text = '';
    for (const op of script.ops) {
        text = op.t === 'ins' ? text.slice(0, op.o) + op.s + text.slice(op.o) : text.slice(0, op.o) + text.slice(op.o + op.n);
    }
    assert.deepEqual(script.final, [text]);
});

for (const engine of engines) {
    test(`${engine.name}: common Hangul, split, merge, delete, remote and snapshot oracle`, () => {
        const script = {name: 'small-semantic-fixture', ops: [
            {t: 'ins', b: 0, o: 0, s: '한글ab'},
            {t: 'split', b: 0, o: 2},
            {t: 'ins', b: 1, o: 1, s: '끝'},
            {t: 'del', b: 0, o: 0, n: 1},
            {t: 'merge', b: 1},
        ], final: ['글a끝b']};
        assert.equal(measureSerial(engine, script, 1).correct, true);
    });
}

const table = await makeTableEngines(baseline, engines, 3, 2);
for (const engine of table.engines) test(`${engine.name}: four peers in table, same-cell insertion, overlapping deletion`, () => {
    assert.equal(measureTable(engine, table.initial, 3).correct, true);
});

test('paced CLI closes the wall-clock window under overload without claiming a full trace pass', () => {
    // Controlled timer fixture only. Its costs are not a CRDT benchmark.
    const temp = mkdtempSync(join(tmpdir(), 'doc-sync-paced-deadline-'));
    try {
        mkdirSync(join(temp, 'benchmarks'));
        writeFileSync(join(temp, 'package.json'), '{"type":"module"}');
        writeFileSync(join(temp, 'benchmarks/engines.ts'), `
            const engine = {name: 'ours', create() {
                let letters = '';
                return {
                    local(op) { const end = performance.now() + 25; while (performance.now() < end) {} letters += op.s; return op.s; },
                    remote(s) { letters += s; },
                    paragraphs() { return [[...letters].sort().join('')]; },
                };
            }};
            export const ours = engine;
            export const yjs = {...engine, name: 'yjs'};
        `);
        const out = join(temp, 'result');
        const child = spawnSync(process.execPath, [fileURLToPath(new URL('./paced.mjs', import.meta.url)), `--baseline=${temp}`, `--out=${out}`, '--duration=50', '--interval=10', '--engines=ours'], {encoding: 'utf8', timeout: 5000});
        assert.equal(child.status, 2, child.stderr);
        assert.equal(existsSync(join(out, 'complete.json')), false);
        const result = JSON.parse(readFileSync(join(out, 'window-observation.json'), 'utf8'));
        assert.equal(result.durationWindowObserved, true);
        assert.equal(result.fullTraceComplete, false);
        assert.equal(result.targetCadenceMet, false);
        assert.equal(result.actualRounds, 1);
        assert.equal(result.rounds, 5);
        assert.equal(result.converged, true);
        assert.ok(result.lastRoundCompletedElapsedMs > 50);
        assert.equal(readFileSync(join(out, 'ticks.jsonl'), 'utf8').trim().split('\n').length, 1);
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
});
