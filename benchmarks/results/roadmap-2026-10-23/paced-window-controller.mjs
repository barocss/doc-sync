import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const dir = 'benchmarks/results/roadmap-2026-10-23/paced-real-30min';
const pid = 78810;
const started = JSON.parse(readFileSync(`${dir}/started.json`, 'utf8'));
const start = Date.parse(started.startedAt);
const deadline = start + 1_800_000;
while (Date.now() < deadline) await delay(Math.min(30_000, deadline - Date.now()));
if (existsSync(`${dir}/complete.json`)) throw Error('Run already completed; preserve it without stopping a process');
const command = execFileSync('ps', ['-p', String(pid), '-o', 'args='], {encoding: 'utf8'}).trim();
if (!command.startsWith('node benchmarks/stage0/paced.mjs ') || !command.includes(`--out=${dir}`) || command.includes('30min-ticks')) throw Error('PID ownership check failed');
const checkpoints = readFileSync(`${dir}/progress.jsonl`, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const last = checkpoints.at(-1);
const observation = {
    status: 'duration window observed; target cadence not met; full1800round incomplete',
    observedAt: new Date().toISOString(), observedWallMs: Date.now() - start,
    originalStartedAt: started.startedAt, requestedWindowMs: 1_800_000,
    targetRounds: 1800, targetIntervalMs: 1000, targetCadenceMet: false, fullTraceComplete: false,
    convergenceThroughLastCheckpoint: true, lastDurableConvergenceCheckpoint: last,
    completedRoundLowerBound: last.rounds, actualCompletedRoundsAtStop: null,
    lastCheckpointScheduleOverrunMs: last.elapsedMs - last.rounds * 1000,
    timerLatenessSamplesAvailable: false,
    evidenceBoundary: 'Original harness persisted progress only every 60 rounds. Exact in-memory final round and timer-lateness samples cannot be recovered. Checkpoint schedule overrun includes round processing and is not pure tick lateness.',
    stopReason: 'Integration requested a 30-minute wall-clock observation rather than extending the fixed-round trace indefinitely. No additional 30-minute run required.',
    stoppedPid: pid, ownershipCheckedCommand: command,
};
writeFileSync(`${dir}/window-observation.json`, JSON.stringify(observation, null, 2));
writeFileSync(`${dir}/failure.json`, JSON.stringify(observation, null, 2));
process.kill(pid, 'SIGTERM');
console.log(JSON.stringify(observation));
