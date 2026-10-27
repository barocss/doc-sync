import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {createHash} from 'node:crypto';

// Run a frozen before source and a frozen after source with the same fixture.
const repo = resolve(import.meta.dirname, '..');
const source = resolve(process.env.BENCH_SOURCE_ROOT ?? repo);
const output = resolve(process.env.BENCH_OUTPUT ?? join(repo, 'benchmarks/results/cold-recovery-2026-10-27/run.json'));
const samples = Number(process.env.BENCH_SAMPLES ?? 12);
const warmups = Number(process.env.BENCH_WARMUPS ?? 2);
const count = Number(process.env.BENCH_RECORDS ?? 30000);
const {Doc, schemaVersion} = await import(pathToFileURL(join(source, 'packages/doc-sync/src/index.ts')));
const {DEMO_SCHEMA} = await import(pathToFileURL(join(source, 'fixtures/demo-schema.ts')));
const {PROTOCOL_VERSION} = await import(pathToFileURL(join(source, 'packages/doc-sync/src/sync/protocol.ts')));
const version = schemaVersion(DEMO_SCHEMA);
const generation = '00000000-0000-4000-8000-000000000001';
const model = new Doc('fixture', DEMO_SCHEMA);
const lines = [JSON.stringify({format:'doc-sync-log-v1', generation, initialSchemaVersion:version})];
for (let i=0;i<count;i++) {
    if (i===count-1) lines.push(JSON.stringify({recoveryPin:{actor:'keeper',reservationId:'legacy-keeper',pin:count}}));
    const edit = i===0 ? {op:'insert',at:[0,0],content:'xy'} : i===count-1 ? {op:'delete',at:[0,1],count:1} :
        {op:'update',at:[0,0],length:1,attrs:{bold:!!(i%2)}};
    const {ops} = model.edit([edit]);
    assert.ok(ops.length, `fixture operation ${i} must not be empty`);
    const change = {actor:'fixture',seq:i+1,ops};
    lines.push(JSON.stringify({change,...(i===0 ? {conditionalBase:{epoch:'fixture-epoch',serverSeq:0,schemaVersion:version}} : {})}));
}
const receipt = {generation,base:{epoch:'fixture-epoch',serverSeq:0,schemaVersion:version},change:JSON.parse(lines[1]).change};
const fixture = `${lines.join('\n')}\n`;
const fixtureBytes = Buffer.byteLength(fixture);
const warm = new Doc('writer', DEMO_SCHEMA);
const first = {actor:'writer',seq:1,ops:warm.edit([{op:'insert',at:[0,0],content:'w'}]).ops};
const second = {actor:'writer',seq:2,ops:warm.edit([{op:'insert',at:[0,1],content:'z'}]).ops};
const percentile = (values,p) => [...values].sort((a,b)=>a-b)[Math.ceil(p*values.length)-1];
const summarize = values => ({min:Math.min(...values),median:percentile(values,.5),p95:percentile(values,.95),max:Math.max(...values)});
async function treeHash(path) {
    const hash=createHash('sha256');
    async function walk(dir,relative='') {
        for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
            const next=join(relative,entry.name), full=join(dir,entry.name);
            if(entry.isDirectory()) await walk(full,next);
            else if(entry.isFile()) {hash.update(next); hash.update(await readFile(full));}
        }
    }
    await walk(path); return hash.digest('hex');
}
async function deadline(promise, name, ms=120000) {
    let timer;
    return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`timeout: ${name}`)),ms);})]).finally(()=>clearTimeout(timer));
}
async function server(data) {
    const env={...process.env,PORT:'0',DATA_DIR:data,RECOVERY_COMPACT_THRESHOLD:'10000'};
    for (const key of ['NO_SCHEMA','DOC_PROFILE','DOC_SYNC_TEST_COMPACTION_GATE','DOC_SYNC_TEST_RECEIPT_GATE','DOC_SYNC_TEST_COLD_GATE_DOC','DOC_SYNC_TEST_FSYNC_GATE_DOC','DOC_SYNC_TEST_FSYNC_GATE_STAGE','DOC_SYNC_TEST_RESET_GATE_DOC']) delete env[key];
    const child=spawn(process.execPath,[join(source,'apps/demo/server.ts')],{env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr=''; child.stderr.on('data',v=>stderr+=String(v));
    const origin=await deadline(new Promise((ok,fail)=>{
        child.once('error',fail); child.once('exit',code=>fail(new Error(`server exited ${code}: ${stderr}`)));
        child.stdout.on('data',v=>{stdout+=String(v); const m=/http:\/\/localhost:(\d+)/.exec(stdout); if(m) ok(`http://127.0.0.1:${m[1]}`);});
    }),'server start');
    return {child,origin};
}
async function stop(child) {
    if(child.exitCode!==null||child.signalCode!==null)return;
    const exited=once(child,'exit'); child.kill('SIGTERM'); await deadline(exited,'server stop');
}
async function request(origin,doc,path,body,headers={}) {
    const response=await fetch(`${origin}/api/docs/${doc}/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-doc-sync-protocol':String(PROTOCOL_VERSION),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json(); assert.equal(response.status,200,JSON.stringify(value)); return value;
}
const dir=await mkdtemp(join(tmpdir(),'doc-sync-cold-log-bench-'));
const results=[];
try {
    for(let i=-warmups;i<samples;i++) {
        const data=join(dir,`run-${i}`); await mkdir(data); const log=join(data,'cold.jsonl'); await writeFile(log,fixture);
        let s=await server(data);
        try {
            // Prime a different document, then request a not-yet-loaded large log.
            const warmState=await request(s.origin,'warm','state');
            assert.equal(warmState.serverSeq,0);
            const coldStart=performance.now();
            const coldTask=request(s.origin,'cold','state').then(value=>({elapsed:performance.now()-coldStart,value}));
            await new Promise(resolve=>setTimeout(resolve,1));
            const otherStart=performance.now();
            const otherTask=request(s.origin,'warm','changes',first,{'x-doc-sync-epoch':warmState.epoch,'x-doc-sync-schema':version}).then(value=>({elapsed:performance.now()-otherStart,value}));
            const [cold,other]=await deadline(Promise.all([coldTask,otherTask]),'cold load and other document append');
            assert.equal(cold.value.serverSeq,count); assert.ok(other.value.serverSeq);
            assert.match(JSON.stringify(cold.value.model),/x/);
            const durableReceipt=await request(s.origin,'cold','receipt',receipt);
            assert.equal(durableReceipt.status,'accepted');
            const pin=await request(s.origin,'cold','recovery-lease',{generation,actor:'keeper',reservationId:'legacy-keeper',pin:null,requireExisting:true});
            assert.equal(pin.status,'protected'); assert.equal(pin.pin,count);
            const gc=await request(s.origin,'cold','gc',{});
            assert.ok(gc.lastGc<count,'active recovery pin must protect the final deletion');
            // Measure one independent warm append/fsync, with a warm read 1ms later.
            const appendStart=performance.now();
            const appendTask=request(s.origin,'warm','changes',second,{'x-doc-sync-epoch':warmState.epoch,'x-doc-sync-schema':version}).then(value=>({elapsed:performance.now()-appendStart,value}));
            await new Promise(resolve=>setTimeout(resolve,1));
            const readStart=performance.now();
            const readTask=request(s.origin,'warm','state').then(value=>({elapsed:performance.now()-readStart,value}));
            const [append,read]=await deadline(Promise.all([appendTask,readTask]),'warm append and read');
            assert.ok(append.value.serverSeq); assert.ok(read.value.serverSeq>=1);
            const beforeStop=await request(s.origin,'warm','state');
            assert.equal(beforeStop.serverSeq,2); assert.match(JSON.stringify(beforeStop.model),/wz/);
            const bytes=(await stat(log)).size;
            await stop(s.child); s=await server(data);
            const after=await request(s.origin,'cold','state'); assert.equal(after.serverSeq,count); assert.match(JSON.stringify(after.model),/x/);
            assert.equal((await request(s.origin,'cold','receipt',receipt)).status,'accepted');
            assert.equal((await request(s.origin,'cold','recovery-lease',{generation,actor:'keeper',reservationId:'legacy-keeper',pin:null,requireExisting:true})).status,'protected');
            const warmAfter=await request(s.origin,'warm','state'); assert.equal(warmAfter.serverSeq,2); assert.match(JSON.stringify(warmAfter.model),/wz/);
            if(i>=0) results.push({coldOpenMs:cold.elapsed,otherDocumentAppendMs:other.elapsed,otherStartOffsetMs:otherStart-coldStart,
                otherFinishedBeforeCold:otherStart-coldStart+other.elapsed<cold.elapsed,warmAppendMs:append.elapsed,warmReadMs:read.elapsed,
                warmReadStartOffsetMs:readStart-appendStart,warmReadFinishedBeforeAppend:readStart-appendStart+read.elapsed<append.elapsed,logBytes:bytes});
        } finally { await stop(s.child); }
    }
    await mkdir(resolve(output,'..'),{recursive:true});
    const workerPath=join(source,'apps/demo/recovery-compaction-worker.ts');
    const workerBytes=await readFile(workerPath).catch(error=>{if(error.code==='ENOENT') return null; throw error;});
    const value={source,sourceSha256:createHash('sha256').update(await readFile(join(source,'apps/demo/server.ts'))).digest('hex'),workerSha256:workerBytes?createHash('sha256').update(workerBytes).digest('hex'):null,
        coreTreeSha256:await treeHash(join(source,'packages/doc-sync/src')),fixturesTreeSha256:await treeHash(join(source,'fixtures')),fixtureSha256:createHash('sha256').update(fixture).digest('hex'),
        benchmarkSha256:createHash('sha256').update(await readFile(import.meta.filename)).digest('hex'),node:process.version,platform:`${os.type()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model,loadAverage:os.loadavg(),count,samples,warmups,fixtureBytes,
        method:'warm doc state first; cold doc GET state followed ~1ms later by independent warm doc append; then warm append followed ~1ms later by warm state; times are client HTTP response durations',
        coldOpenMs:summarize(results.map(x=>x.coldOpenMs)),otherDocumentAppendMs:summarize(results.map(x=>x.otherDocumentAppendMs)),warmAppendMs:summarize(results.map(x=>x.warmAppendMs)),warmReadMs:summarize(results.map(x=>x.warmReadMs)),runs:results};
    await writeFile(output,`${JSON.stringify(value,null,2)}\n`); console.log(JSON.stringify(value,null,2));
} finally { await rm(dir,{recursive:true,force:true}); }
