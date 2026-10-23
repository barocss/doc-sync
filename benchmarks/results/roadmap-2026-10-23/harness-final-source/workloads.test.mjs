import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
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
