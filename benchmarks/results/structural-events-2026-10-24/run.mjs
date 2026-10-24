import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync} from 'node:fs';
import {tmpdir, loadavg, cpus, totalmem, platform, arch, release} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2), index = args.indexOf('--out-dir'), root = process.cwd();
const out = resolve(index < 0 ? 'benchmarks/results/structural-events-2026-10-24/abba' : args[index + 1]);
if (existsSync(out)) throw new Error('Use a fresh output directory');
const baseline = 'd46db51b75120539d1f649e4025800b7c96b7506';
const before = mkdtempSync(join(tmpdir(), 'doc-sync-structural-baseline-'));
execFileSync('tar', ['-x', '-C', before], {input: execFileSync('git', ['archive', baseline, 'package.json', 'packages/doc-sync', 'fixtures']), maxBuffer: 32 * 1024 * 1024});
symlinkSync(join(root, 'node_modules'), join(before, 'node_modules'), 'dir');
mkdirSync(join(before, 'benchmarks'));
const harness = 'benchmarks/structural-events.ts';
writeFileSync(join(before, harness), readFileSync(harness, 'utf8').replaceAll('"@barocss/doc-sync/sync"', JSON.stringify(join(before, 'packages/doc-sync/src/sync/index.ts'))).replaceAll('"@barocss/doc-sync"', JSON.stringify(join(before, 'packages/doc-sync/src/index.ts'))));
const paths = execFileSync('rg', ['--files', 'packages/doc-sync/src'], {encoding:'utf8'}).trim().split('\n').sort();
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const hashes = base => [...paths, harness].map(path => ({path, sha256:sha(join(base,path))}));
for (const path of paths) {
    const blob = execFileSync('git', ['show', `${baseline}:${path}`]);
    if (createHash('sha256').update(blob).digest('hex') !== sha(join(before,path))) throw new Error(`Baseline mismatch ${path}`);
}
const sourceHashes = hashes(root), baselineHashes = hashes(before), startedAt = new Date().toISOString(), startedLoad = loadavg(), runs = [];
mkdirSync(out, {recursive:true});
for (const [label, base] of [['before-1',before], ['after-1',root], ['after-2',root], ['before-2',before]]) {
    const start = new Date().toISOString(), load = loadavg();
    const stdout = execFileSync(process.execPath, [join(base,harness),'--samples','30','--label',label,'--out',join(out,`${label}.json`)], {cwd:base, encoding:'utf8', maxBuffer:32*1024*1024});
    writeFileSync(join(out,`${label}.log`), stdout, {flag:'wx'});
    runs.push({label, startedAt:start, endedAt:new Date().toISOString(), startedLoad:load, endedLoad:loadavg()});
    console.log(`${label} PASS`);
}
if (JSON.stringify(hashes(root)) !== JSON.stringify(sourceHashes) || JSON.stringify(hashes(before)) !== JSON.stringify(baselineHashes)) throw new Error('Measured source changed');
writeFileSync(join(out,'metadata.json'), JSON.stringify({baseline, node:process.version, host:{platform:platform(),arch:arch(),release:release(),cpu:cpus()[0].model,logicalCPUs:cpus().length,memoryBytes:totalmem()},startedAt,endedAt:new Date().toISOString(),startedLoad,endedLoad:loadavg(),order:'before/after/after/before; sequential processes',samples:30,warmups:5,diagnosticSamples:2,metric:'synchronous receipt through model-event callback; no network/native conversion/DOM or correctness work in timed interval',adaptation:'Same new harness; only bare imports resolve to archived baseline product; installed dependencies shared. Each process uses its measured tree as cwd.',sourceHashes,baselineHashes,runs},null,2)+'\n',{flag:'wx'});
