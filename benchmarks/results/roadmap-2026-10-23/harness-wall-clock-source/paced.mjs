import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, appendFileSync, existsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {loadEngines, stats} from './engines.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const durationMs = Number(args.duration ?? 1_800_000);
const intervalMs = Number(args.interval ?? 1000);
assert(Number.isFinite(durationMs) && durationMs >= intervalMs && Number.isFinite(intervalMs) && intervalMs >= 10);
if (!args.baseline || !args.out || existsSync(args.out)) throw Error('Provide --baseline and a new --out directory');
mkdirSync(args.out, {recursive: true});
const engines = (await loadEngines(args.baseline, args.yorkie)).filter(engine => !args.engines || args.engines.split(',').includes(engine.name));
assert(engines.length > 0, 'No selected engine is available');
const runs = engines.map(engine => ({engine, peers: Array.from({length: 4}, (_, i) => engine.create(`peer${i}`)), local: [], remote: [], read: [], checks: 0}));
const startedAt = new Date().toISOString();
const start = performance.now();
const rounds = Math.floor(durationMs / intervalMs);
const deadline = start + durationMs;
const receipt = {startedAt, durationMs, intervalMs, rounds, targetRounds: rounds, peers: 4, accelerated: durationMs < 1_800_000 || intervalMs < 1000, standardRoadmapCadence: durationMs === 1_800_000 && intervalMs === 1000, scheduler: 'wall-clock window; first tick at 0ms; do not begin a round at or after deadline; finish an in-flight atomic round', gc: 'no explicit GC; Yorkie GC disabled; insertion-only workload; no service/lease/transport', workload: 'four concurrent single-character end inserts each interval; same prior view; deliver actor order after all four local edits', engines: engines.map(e => e.name)};
writeFileSync(`${args.out}/started.json`, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
const lateness = [];
let missedIntervals = 0;
let actualRounds = 0;
let lastRoundCompletedElapsedMs = 0;
try {
    for (let round = 0; round < rounds; round++) {
        if (performance.now() >= deadline) break;
        const target = start + round * intervalMs;
        await delay(Math.max(0, target - performance.now()));
        if (performance.now() >= deadline) break;
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
        actualRounds++;
        lastRoundCompletedElapsedMs = performance.now() - start;
        appendFileSync(`${args.out}/ticks.jsonl`, JSON.stringify({round: round + 1, scheduledElapsedMs: round * intervalMs, actualStartElapsedMs: tickAt - start, latenessMs: lateMs, completedElapsedMs: lastRoundCompletedElapsedMs}) + '\n');
        if ((round + 1) % 60 === 0 || round + 1 === rounds) {
            const progress = {rounds: round + 1, elapsedMs: performance.now() - start, at: new Date().toISOString(), heapUsed: process.memoryUsage().heapUsed};
            appendFileSync(`${args.out}/progress.jsonl`, JSON.stringify(progress) + '\n');
            console.log(JSON.stringify(progress));
        }
    }
    while (performance.now() < deadline) await delay(Math.max(1, Math.ceil(deadline - performance.now())));
    const elapsedMs = performance.now() - start;
    const rows = runs.map(run => {
        const texts = run.peers.map(peer => peer.paragraphs()[0]);
        for (const text of texts) for (const letter of 'ABCD') assert.equal(text.split(letter).length - 1, actualRounds);
        return {engine: run.engine.name, correct: true, convergenceChecks: run.checks, operations: actualRounds * 4, finalChars: texts[0].length, localMs: stats(run.local), remoteApplyMs: stats(run.remote), modelReadMs: stats(run.read)};
    });
    const fullTraceComplete = actualRounds === rounds;
    const targetCadenceMet = fullTraceComplete && missedIntervals === 0 && lastRoundCompletedElapsedMs <= durationMs;
    const result = {...receipt, completedAt: new Date().toISOString(), elapsedMs, actualRounds, lastRoundCompletedElapsedMs, windowOvershootMs: Math.max(0, elapsedMs - durationMs), missedIntervals, schedulingLatenessMs: stats(lateness), durationWindowObserved: elapsedMs >= durationMs, fullTraceComplete, targetCadenceMet, converged: true, passed: targetCadenceMet, rows};
    if (targetCadenceMet) writeFileSync(`${args.out}/complete.json`, JSON.stringify(result, null, 2));
    else {
        writeFileSync(`${args.out}/window-observation.json`, JSON.stringify(result, null, 2));
        writeFileSync(`${args.out}/failure.json`, JSON.stringify({...result, status: 'duration window observed; target cadence not met'}, null, 2));
        process.exitCode = 2;
    }
} catch (error) {
    writeFileSync(`${args.out}/failure.json`, JSON.stringify({...receipt, failedAt: new Date().toISOString(), elapsedMs: performance.now() - start, error: String(error), stack: error.stack}, null, 2));
    throw error;
}
