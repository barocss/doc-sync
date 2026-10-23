import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const [resultDir] = process.argv.slice(2);
if (!resultDir) throw Error('Usage: node load-sampler.mjs <paced result directory>');
do {
    const at = new Date().toISOString();
    const ps = execFileSync('ps', ['-axo', 'pid,pcpu,pmem,etime,comm'], {encoding: 'utf8'});
    const lines = ps.trim().split('\n');
    const entries = lines.slice(1).map(line => line.trim().split(/\s+/));
    entries.sort((a, b) => Number(b[1]) - Number(a[1]));
    appendFileSync(`${resultDir}/load.jsonl`, JSON.stringify({at, totalProcessCpuPercent: entries.reduce((sum, e) => sum + Number(e[1]), 0), topProcesses: entries.slice(0, 15).map(e => ({pid: Number(e[0]), cpuPercent: Number(e[1]), memoryPercent: Number(e[2]), elapsed: e[3], command: e.slice(4).join(' ')}))}) + '\n');
    if (existsSync(`${resultDir}/complete.json`) || existsSync(`${resultDir}/failure.json`)) break;
    await delay(30_000);
} while (true);
