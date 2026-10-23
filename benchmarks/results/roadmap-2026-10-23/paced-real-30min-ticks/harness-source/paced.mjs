import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, appendFileSync, existsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {loadEngines, stats} from './engines.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const durationMs = Number(args.duration ?? 1_800_000);
const intervalMs = Number(args.interval ?? 1000);
assert(durationMs > 0 && intervalMs >= 10);
if (!args.baseline || !args.out || existsSync(args.out)) throw Error('Provide --baseline and a new --out directory');
mkdirSync(args.out, {recursive: true});
const engines = await loadEngines(args.baseline, args.yorkie);
const runs = engines.map(engine => ({engine, peers: Array.from({length: 4}, (_, i) => engine.create(`peer${i}`)), local: [], remote: [], read: [], checks: 0}));
const startedAt = new Date().toISOString();
const start = performance.now();
const rounds = Math.floor(durationMs / intervalMs);
const receipt = {startedAt, durationMs, intervalMs, rounds, peers: 4, accelerated: durationMs !== 1_800_000, gc: 'no explicit GC; Yorkie GC disabled; insertion-only workload; no service/lease/transport', workload: 'four concurrent single-character end inserts each second; same prior view; deliver actor order after all four local edits', engines: engines.map(e => e.name)};
writeFileSync(`${args.out}/started.json`, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
const lateness = [];
let missedIntervals = 0;
try {
    for (let round = 0; round < rounds; round++) {
        const target = start + (round + 1) * intervalMs;
        await delay(Math.max(0, target - performance.now()));
        const tickAt = performance.now();
        const lateMs = Math.max(0, tickAt - target);
        lateness.push(lateMs);
        if (lateMs >= intervalMs) missedIntervals++;
        for (const run of runs) {
            const pending = run.peers.map((peer, i) => {
                const t = performance.now();
                const offset = peer.paragraphs()[0].length;
                run.read.push(performance.now() - t);
                const begin = performance.now();
                const payload = peer.local({t: 'ins', b: 0, o: offset, s: 'ABCD'[i]});
                run.local.push(performance.now() - begin);
                return payload;
            });
            pending.forEach((payload, actor) => run.peers.forEach((peer, targetPeer) => {
                if (actor === targetPeer) return;
                const begin = performance.now(); peer.remote(payload); run.remote.push(performance.now() - begin);
            }));
            const models = run.peers.map(peer => peer.paragraphs());
            models.slice(1).forEach(model => assert.deepEqual(model, models[0], `${run.engine.name} round ${round}`));
            assert.equal(models[0][0].length, (round + 1) * 4);
            run.checks++;
        }
        appendFileSync(`${args.out}/ticks.jsonl`, JSON.stringify({round: round + 1, scheduledElapsedMs: (round + 1) * intervalMs, actualStartElapsedMs: tickAt - start, latenessMs: lateMs, completedElapsedMs: performance.now() - start}) + '\n');
        if ((round + 1) % 60 === 0 || round + 1 === rounds) {
            const progress = {rounds: round + 1, elapsedMs: performance.now() - start, at: new Date().toISOString(), heapUsed: process.memoryUsage().heapUsed};
            appendFileSync(`${args.out}/progress.jsonl`, JSON.stringify(progress) + '\n');
            console.log(JSON.stringify(progress));
        }
    }
    const elapsedMs = performance.now() - start;
    const rows = runs.map(run => {
        const texts = run.peers.map(peer => peer.paragraphs()[0]);
        for (const text of texts) for (const letter of 'ABCD') assert.equal(text.split(letter).length - 1, rounds);
        return {engine: run.engine.name, correct: true, convergenceChecks: run.checks, operations: rounds * 4, finalChars: texts[0].length, localMs: stats(run.local), remoteApplyMs: stats(run.remote), modelReadMs: stats(run.read)};
    });
    writeFileSync(`${args.out}/complete.json`, JSON.stringify({...receipt, completedAt: new Date().toISOString(), elapsedMs, actualRounds: rounds, missedIntervals, schedulingLatenessMs: stats(lateness), correct: true, rows}, null, 2));
} catch (error) {
    writeFileSync(`${args.out}/failure.json`, JSON.stringify({...receipt, failedAt: new Date().toISOString(), elapsedMs: performance.now() - start, error: String(error), stack: error.stack}, null, 2));
    throw error;
}
