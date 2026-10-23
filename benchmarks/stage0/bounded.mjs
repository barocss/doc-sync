import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync, openSync, closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
if (!args.out || !args.baseline || existsSync(args.out)) throw Error('Provide --baseline and a new --out directory');
mkdirSync(args.out, {recursive: true});
const workloads = (args.workloads ?? 'typing-10000,paste-100000,mixed-10000chars,open-after-10000edits,table-50x10').split(',');
const engines = (args.engines ?? 'ours,yjs,yorkie-tree').split(',');
const timeoutMs = Number(args.timeout ?? 120000);
const rows = [];
for (const workload of workloads) for (const engine of engines) {
    const name = `${workload}-${engine}`, out = `${args.out}/${name}`;
    const startedAt = new Date().toISOString(), begin = performance.now();
    const log = openSync(`${args.out}/${name}.log`, 'wx');
    const command = [
        '--expose-gc', fileURLToPath(new URL('./run.mjs', import.meta.url)),
        `--baseline=${args.baseline}`, `--out=${out}`, `--engines=${engine}`, `--workloads=${workload}`,
        ...(args.yorkie ? [`--yorkie=${args.yorkie}`] : []),
    ];
    const child = spawn(process.execPath, command, {stdio: ['ignore', log, log]});
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    const result = await new Promise(resolve => {
        child.on('error', error => resolve({error: String(error)}));
        child.on('exit', (code, signal) => resolve({code, signal}));
    });
    clearTimeout(timer); closeSync(log);
    const row = {workload, engine, startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - begin, timeoutMs, timedOut, complete: existsSync(`${out}/complete.json`), ...result};
    writeFileSync(`${args.out}/${name}-receipt.json`, JSON.stringify(row, null, 2)); rows.push(row); console.log(JSON.stringify(row));
}
writeFileSync(`${args.out}/complete.json`, JSON.stringify({completedAt: new Date().toISOString(), allCasesPassed: rows.every(row => row.complete && row.code === 0 && !row.timedOut), cases: rows}, null, 2));
