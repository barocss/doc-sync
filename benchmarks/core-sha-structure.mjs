import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,realpathSync,statSync,existsSync,accessSync,constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const options={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--baseline-root','--output','--inherited-source','--scale','--trials'].includes(key)||!value||value.startsWith('--')||key in options)throw new Error(`Invalid or duplicate option: ${key}`);options[key]=value;}
for(const key of ['--baseline-root','--output'])if(!options[key])throw new Error(`Required option: ${key}`);
const scale=Number(options['--scale']??1),trials=Number(options['--trials']??9);
if(!Number.isFinite(scale)||scale<=0||scale>1)throw new Error('Scale must be greater than 0 and at most 1');
if(!/^[1-9]\d*$/.test(options['--trials']??'9')||!Number.isSafeInteger(trials))throw new Error('Trials must be a positive safe integer');
const baselineRoot=realpathSync(resolve(options['--baseline-root']));
const currentRoot=fileURLToPath(new URL('../',import.meta.url));
if(baselineRoot===realpathSync(currentRoot))throw new Error('Baseline must be an external archive, not this checkout');
const baselineSource=join(baselineRoot,'packages/doc-sync/src/crdt/schema-version.ts');
const currentSource=join(currentRoot,'packages/doc-sync/src/crdt/schema-version.ts');
const inheritedSource=options['--inherited-source']?realpathSync(resolve(options['--inherited-source'])):baselineSource;
for(const path of [baselineSource,currentSource,inheritedSource])if(!statSync(path).isFile())throw new Error(`Missing source: ${path}`);
const output=resolve(options['--output']);
if(existsSync(output))throw new Error(`Refusing to overwrite output: ${output}`);
if(!statSync(dirname(output)).isDirectory())throw new Error('Output parent must be a directory');
accessSync(dirname(output),constants.W_OK);
const {sha256,schemaVersion}=await import(pathToFileURL(currentSource).href);
const {sha256:beforeHash,schemaVersion:beforeSchema}=await import(pathToFileURL(baselineSource).href);
const {sha256:inheritedHash,schemaVersion:inheritedSchema}=await import(pathToFileURL(inheritedSource).href);
const fileHash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const closureHashes=root=>Object.fromEntries(readdirSync(root,{recursive:true}).filter(path=>path.endsWith('.ts')).sort().map(path=>[path,fileHash(join(root,path))]));
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const schema = {root: 'doc', nodes: {doc: {shape: 'flow', children: ['p'], default: 'p'}, p: {shape: 'text', ui: {label: '한글🙂'.repeat(64)}}}, marks: []};
const canonicalSchema = `{"marks":[],"nodes":{"doc":{"children":["p"],"default":"p","shape":"flow"},"p":{"shape":"text","ui":{"label":${JSON.stringify(schema.nodes.p.ui.label)}}}},"root":"doc"}`;
const workloads = [
    {name: 'sha-short-64-bytes', text: 'a'.repeat(64), count: Math.max(1,Math.floor(16000*scale))},
    {name: 'sha-unicode-8192-bytes', text: '한글🙂ab'.repeat(683), count: Math.max(1,Math.floor(1000*scale))},
    {name: 'sha-multiblock-1MiB', text: 'a'.repeat(1024 * 1024), count: Math.max(1,Math.floor(12*scale))},
    {name: 'schema-identity', count: Math.max(1,Math.floor(4000*scale))},
];
let sink = 0;
function time(fn, input, count) {
    const start = performance.now();
    for (let index = 0; index < count; index++) sink ^= fn(input).charCodeAt(index % 64);
    return performance.now() - start;
}
const results = [];
for (const workload of workloads) {
    const isSchema = workload.text === undefined;
    const old = isSchema ? beforeSchema : beforeHash, current = isSchema ? schemaVersion : sha256;
    const input = isSchema ? schema : workload.text;
    const expected = isSchema ? `sha256:${digest(canonicalSchema)}` : digest(input);
    assert.equal(old(input), expected);
    assert.equal(current(input), expected);
    time(old, input, Math.min(1000, workload.count));
    time(current, input, Math.min(1000, workload.count));
    const before = [], after = [], inherited = [];
    const inheritedFn = isSchema ? inheritedSchema : inheritedHash;
    assert.equal(inheritedFn(input), expected);
    time(inheritedFn, input, Math.min(1000, workload.count));
    for (let trial = 0; trial < trials; trial++) {
        if (trial % 2) { after.push(time(current, input, workload.count)); before.push(time(old, input, workload.count)); }
        else { before.push(time(old, input, workload.count)); after.push(time(current, input, workload.count)); }
        inherited.push(time(inheritedFn, input, workload.count));
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const beforeMs = median(before), afterMs = median(after);
    results.push({name: workload.name, utf8Bytes: isSchema ? Buffer.byteLength(canonicalSchema) : Buffer.byteLength(input), iterations: workload.count, correctness: 'PASS', beforeMs, afterMs, ratioAfterBefore: afterMs / beforeMs, inheritedStartMs: median(inherited), ratioAfterInheritedStart: afterMs / median(inherited), inheritedSamplesMs: inherited, beforeSamplesMs: before, afterSamplesMs: after});
}
const report={node:process.version,baseline:'ec962 (caller-provided external source archive)',baselineCommit:'ec9622571a04a7d7ea3f967bb3e6423b17ce5194',cli:{argv:process.argv.slice(2),execArgv:process.execArgv,nodeOptions:process.env.NODE_OPTIONS??null,options,scale,trials,baselineRoot,output,inheritedSource},inheritedOrigin:options['--inherited-source']?'Explicit caller-provided inherited source; its dependency imports remain unchanged.':'Baseline archive reused for inherited control; not the prior worker-start snapshot.',methodology:`same-process direct source; warm-up; ${trials} alternating paired trials; medians; Node crypto oracle outside timed loops; no GC forcing; baseline includes pre-existing K64 hoist difference; inherited control runs after each pair`,sourceHashes:{[baselineSource]:fileHash(baselineSource),[currentSource]:fileHash(currentSource),[inheritedSource]:fileHash(inheritedSource),benchmark:fileHash(fileURLToPath(import.meta.url))},sourceClosureHashes:{baseline:closureHashes(join(baselineRoot,'packages/doc-sync/src')),current:closureHashes(join(currentRoot,'packages/doc-sync/src'))},results,sink};
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
