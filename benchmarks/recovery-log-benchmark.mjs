import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';

// Run two separate, otherwise identical processes with BASELINE_ROOT and the
// live workspace. All fixture files and child servers are local to this run.
const repo = resolve(import.meta.dirname, '..');
const source = resolve(process.env.BENCH_SOURCE_ROOT ?? repo);
const output = resolve(process.env.BENCH_OUTPUT ?? join(repo, 'benchmarks/results/recovery-log-2026-10-27/run.json'));
const samples = Number(process.env.BENCH_SAMPLES ?? 12);
const warmups = Number(process.env.BENCH_WARMUPS ?? 2);
const count = Number(process.env.BENCH_RECORDS ?? 30000);
const {Doc, schemaVersion} = await import(pathToFileURL(join(source, 'packages/doc-sync/src/index.ts')));
const {DEMO_SCHEMA} = await import(pathToFileURL(join(source, 'fixtures/demo-schema.ts')));
const {PROTOCOL_VERSION} = await import(pathToFileURL(join(source, 'packages/doc-sync/src/sync/protocol.ts')));
const version = schemaVersion(DEMO_SCHEMA), generation = process.env.BENCH_GENERATION ?? '00000000-0000-4000-8000-000000000001';
const model = new Doc('fixture', DEMO_SCHEMA);
const lines = [JSON.stringify({format:'doc-sync-log-v1', generation, initialSchemaVersion:version})];
for (let i=0;i<count;i++) {
    const edit = i===0 ? {op:'insert',at:[0,0],content:'x'} : {op:'update',at:[0,0],length:1,attrs:{bold:!!(i%2)}};
    const {ops} = model.edit([edit]);
    assert.ok(ops.length, `fixture operation ${i} must not be empty`);
    const change = {actor:'fixture',seq:i+1,ops};
    lines.push(JSON.stringify({change,...(i===0 ? {conditionalBase:{epoch:'fixture-epoch',serverSeq:0,schemaVersion:version}} : {})}));
}
const receipt = {generation,base:{epoch:'fixture-epoch',serverSeq:0,schemaVersion:version},change:JSON.parse(lines[1]).change};
// One retained independent reservation is already in the log; the next reserve
// is the triggering event under threshold 2.
lines.push(JSON.stringify({recoveryPin:{actor:'keeper',reservationId:'legacy-keeper',pin:count+1}}));
const fixture = `${lines.join('\n')}\n`;
const fixtureBytes = Buffer.byteLength(fixture);
const human = Doc.fromSnapshot('human',model.snapshot(),DEMO_SCHEMA);
const humanChange = {actor:'human',seq:1,ops:human.edit([{op:'insert',at:[0,1],content:'H'}]).ops};
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
    const env = {...process.env, PORT:'0', DATA_DIR:data, RECOVERY_COMPACT_THRESHOLD:'2'};
    delete env.NO_SCHEMA; delete env.DOC_PROFILE;
    delete env.DOC_SYNC_TEST_COMPACTION_GATE; delete env.DOC_SYNC_TEST_RECEIPT_GATE;
    const child = spawn(process.execPath,[join(source,'apps/demo/server.ts')],{env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stderr.on('data',v=>stderr+=String(v));
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
async function request(origin,path,body,headers={}) {
    const response=await fetch(`${origin}/api/docs/bench/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-doc-sync-protocol':String(PROTOCOL_VERSION),...headers},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();
    assert.equal(response.status,200,JSON.stringify(value));
    return value;
}
const dir=await mkdtemp(join(tmpdir(),'doc-sync-recovery-log-bench-'));
const results=[];
try {
    for(let i=-warmups;i<samples;i++) {
        const data=join(dir,`run-${i}`); await mkdir(data); const log=join(data,'bench.jsonl'); await writeFile(log,fixture);
        let s=await server(data);
        try {
            const state=await request(s.origin,'state');
            assert.equal(state.serverSeq,count);
            const sourceState=await request(s.origin,'recovery-state');
            const reserve={generation,actor:'probe',reservationId:`r${sourceState.reservationEra}~${randomUUID()}`,pin:null};
            const start=performance.now();
            const trigger=request(s.origin,'recovery-lease',reserve).then(value=>({elapsed:performance.now()-start,value}));
            // This approximates an unrelated request arriving while compaction is
            // running; it does not prove exact server queue entry time.
            await new Promise(resolve=>setTimeout(resolve,1));
            const editStart=performance.now();
            const edit=request(s.origin,'changes',humanChange,{'x-doc-sync-epoch':state.epoch,'x-doc-sync-schema':version}).then(value=>({elapsed:performance.now()-editStart,value}));
            const [compaction,other]=await deadline(Promise.all([trigger,edit]),'concurrent requests');
            assert.equal(compaction.value.status,'protected'); assert.ok(other.value.serverSeq);
            let polls=0, observed;
            const waitStart=performance.now();
            do {
                observed=await request(s.origin,'recovery-state'); polls++;
                if(observed.reservationEra>sourceState.reservationEra) break;
                if(performance.now()-waitStart>30000) throw new Error('compaction did not finish after concurrent edit');
                await new Promise(resolve=>setTimeout(resolve,10));
            } while(true);
            const completionMs=performance.now()-start;
            // Measure an exact receipt independently, then launch an unrelated
            // read shortly afterwards to expose event-loop queueing.
            const receiptStart=performance.now();
            const receiptTask=request(s.origin,'receipt',receipt).then(value=>({elapsed:performance.now()-receiptStart,value}));
            await new Promise(resolve=>setTimeout(resolve,1));
            const stateStart=performance.now();
            const stateTask=request(s.origin,'state').then(value=>({elapsed:performance.now()-stateStart,value}));
            const [receiptResult,stateResult]=await deadline(Promise.all([receiptTask,stateTask]),'receipt and unrelated read');
            const verify=stateResult.value;
            assert.equal(verify.serverSeq,count+1);
            assert.match(JSON.stringify(verify.model),/xH/);
            assert.equal(receiptResult.value.status,'accepted');
            const keeper=await request(s.origin,'recovery-lease',{generation,actor:'keeper',reservationId:'legacy-keeper',pin:null,requireExisting:true});
            assert.equal(keeper.status,'protected'); assert.equal(keeper.pin,count+1);
            const bytes=(await stat(log)).size;
            await stop(s.child);
            s=await server(data);
            const after=await request(s.origin,'state');
            assert.equal(after.serverSeq,count+1); assert.match(JSON.stringify(after.model),/xH/);
            assert.equal((await request(s.origin,'receipt',receipt)).status,'accepted');
            assert.equal((await request(s.origin,'recovery-lease',{generation,actor:'keeper',reservationId:'legacy-keeper',pin:null,requireExisting:true})).status,'protected');
            if(i>=0) results.push({compactionMs:compaction.elapsed,completionMs,completionPolls:polls,unrelatedEditMs:other.elapsed,
                editStartOffsetMs:editStart-start, editFinishedBeforeTriggerResponse:editStart-start+other.elapsed<compaction.elapsed,
                receiptMs:receiptResult.elapsed,unrelatedReadMs:stateResult.elapsed,readStartOffsetMs:stateStart-receiptStart,
                readFinishedBeforeReceipt:stateStart-receiptStart+stateResult.elapsed<receiptResult.elapsed,logBytes:bytes});
        } finally { await stop(s.child); }
    }
    await mkdir(resolve(output,'..'),{recursive:true});
    const workerPath=join(source,'apps/demo/recovery-compaction-worker.ts');
    const workerBytes=await readFile(workerPath).catch(error=>{if(error.code==='ENOENT') return null; throw error;});
    const value={source,sourceSha256:createHash('sha256').update(await readFile(join(source,'apps/demo/server.ts'))).digest('hex'),workerSha256:workerBytes ? createHash('sha256').update(workerBytes).digest('hex') : null,coreTreeSha256:await treeHash(join(source,'packages/doc-sync/src')),fixturesTreeSha256:await treeHash(join(source,'fixtures')),fixtureGeneration:generation,fixtureSha256:createHash('sha256').update(fixture).digest('hex'),benchmarkSha256:createHash('sha256').update(await readFile(import.meta.filename)).digest('hex'),node:process.version,platform:`${os.type()} ${os.release()} ${os.arch()}`,cpu:os.cpus()[0]?.model,loadAverage:os.loadavg(),count,samples,warmups,fixtureBytes,method:'threshold 2; separate change starts 1 ms after compaction trigger; observe era after both responses; then exact receipt and state read starts 1 ms later',compactionMs:summarize(results.map(x=>x.compactionMs)),completionMs:summarize(results.map(x=>x.completionMs)),unrelatedEditMs:summarize(results.map(x=>x.unrelatedEditMs)),receiptMs:summarize(results.map(x=>x.receiptMs)),unrelatedReadMs:summarize(results.map(x=>x.unrelatedReadMs)),runs:results};
    await writeFile(output,`${JSON.stringify(value,null,2)}\n`); console.log(JSON.stringify(value,null,2));
} finally { await rm(dir,{recursive:true,force:true}); }
