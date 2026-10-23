import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadEngines} from './engines.mjs';
import {commonScripts, makeTableEngines, measureSerial, measureTable} from './workloads.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
if (!args.baseline || !args.out) throw Error('Required --baseline=<immutable source root> --out=<new result directory> [--yorkie=<SDK entry>]');
if (existsSync(args.out)) throw Error('Output directory already exists; use a new directory to preserve evidence');
mkdirSync(args.out, {recursive: true});
const engines = (await loadEngines(args.baseline, args.yorkie)).filter(engine => !args.engines || args.engines.split(',').includes(engine.name));
if (!engines.length) throw Error('No selected engine is available');
const {makeTrace} = await import(pathToFileURL(`${args.baseline}/benchmarks/trace.ts`).href);
const availableWorkloads = new Set([...commonScripts(makeTrace).map(script => script.name), 'table-50x10']);
if (args.workloads && args.workloads.split(',').some(name => !availableWorkloads.has(name))) throw Error('Unknown workload');
const metadata = {startedAt: new Date().toISOString(), node: process.version, baseline: args.baseline, gcExposed: !!globalThis.gc, yorkie: args.yorkie ?? null, scope: 'single-process CRDT+wrapper, no browser/network/service/auth; sequential trace semantics checked against independent string model; concurrent ordering checked within each engine'};
writeFileSync(`${args.out}/started.json`, JSON.stringify(metadata, null, 2));
const rows = [];
try {
    for (const script of commonScripts(makeTrace).filter(script => !args.workloads || args.workloads.split(',').includes(script.name))) for (const engine of engines) {
        const row = measureSerial(engine, script, Number(args.loads ?? 5)); rows.push(row);
        writeFileSync(`${args.out}/${script.name}-${engine.name}.json`, JSON.stringify(row, null, 2));
        console.log(`${engine.name} ${script.name}: local p95=${row.localMs.p95.toFixed(3)}ms remote p95=${row.remoteApplyMs.p95.toFixed(3)}ms open p95=${row.openIncludingModelMs.p95.toFixed(3)}ms`);
    }
    const tables = !args.workloads || args.workloads.split(',').includes('table-50x10') ? await makeTableEngines(args.baseline, engines) : {engines: []};
    for (const engine of tables.engines) {
        if (!engines.some(selected => selected.name === engine.name)) continue;
        const row = measureTable(engine, tables.initial); rows.push(row);
        writeFileSync(`${args.out}/table-50x10-${engine.name}.json`, JSON.stringify(row, null, 2));
        console.log(`${engine.name} table-50x10: local p95=${row.localMs.p95.toFixed(3)}ms remote p95=${row.remoteApplyMs.p95.toFixed(3)}ms`);
    }
    writeFileSync(`${args.out}/complete.json`, JSON.stringify({...metadata, completedAt: new Date().toISOString(), correct: true, rows}, null, 2));
} catch (error) {
    writeFileSync(`${args.out}/failure.json`, JSON.stringify({...metadata, failedAt: new Date().toISOString(), error: String(error), stack: error.stack}, null, 2));
    throw error;
}
