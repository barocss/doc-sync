import assert from 'node:assert/strict';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {loadEngines, stats} from './engines.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
if (!args.before || !args.after || !args.out || existsSync(args.out)) throw Error('Provide --before, --after and a new --out directory');
mkdirSync(args.out, {recursive: true});
const before = (await loadEngines(args.before))[0], after = (await loadEngines(args.after))[0];
const rows = [];
for (const chars of [1000, 5000, 10000]) {
    const samples = {before: [], after: []};
    for (let repeat = 0; repeat < 3; repeat++) for (const [name, engine] of repeat % 2 ? [['after', after], ['before', before]] : [['before', before], ['after', after]]) {
        const a = engine.create(`paste${repeat}`), b = engine.create(`remote${repeat}`);
        const text = 'x'.repeat(chars);
        const t = performance.now(), payload = a.local({t: 'ins', b: 0, o: 0, s: text});
        samples[name].push(performance.now() - t);
        b.remote(payload); assert.deepEqual(a.paragraphs(), [text]); assert.deepEqual(b.paragraphs(), [text]);
        assert.deepEqual(engine.load('snapshot', a.encode()).paragraphs(), [text]);
    }
    rows.push({chars, correct: true, beforeLocalMs: stats(samples.before), afterLocalMs: stats(samples.after), p50Ratio: stats(samples.before).p50 / stats(samples.after).p50, samples});
}
const result = {at: new Date().toISOString(), node: process.version, beforeBaseline: args.before, afterBaseline: args.after, correct: true, repeats: 3, notes: 'Fresh documents; alternating before/after; tiny sample count; wrapper includes JSON payload. 100k before timed out in separate harness and has no numeric speedup ratio.', rows};
writeFileSync(`${args.out}/complete.json`, JSON.stringify(result, null, 2));
for (const row of rows) console.log(`${row.chars}: before p50 ${row.beforeLocalMs.p50.toFixed(3)}ms after ${row.afterLocalMs.p50.toFixed(3)}ms ratio ${row.p50Ratio.toFixed(2)}x`);
