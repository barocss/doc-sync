import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openCommandWatch,watchCommandBinding} from '../src/watch-command.ts';
const config={url:'http://127.0.0.1:5410',document:'synthetic',mission:'Review synthetic text',maxRuns:2,model:'fixture-model'};
const snapshot=(serverSeq:number)=>({generation:'g',epoch:'e',schemaVersion:'s',serverSeq});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'watch-command-'));await chmod(dir,0o700);return {checkpoint:join(dir,'cursor.json'),cleanup:()=>rm(dir,{recursive:true,force:true})};}
test('CLI selection keeps the old memory mode without checkpoint',async()=>{
 let seq=1,calls=0;const w=await openCommandWatch(config,async()=>snapshot(seq),async()=>{calls++;return {status:'completed'};});await w.poll();seq++;await w.poll();assert.equal(calls,1);await w.close();assert.equal(w.done,true);
});
test('CLI persistent selection restores exact cursor and consumed budget',async()=>{
 const f=await fixture(),c={...config,checkpoint:f.checkpoint};let seq=1;const ranges:unknown[]=[];let w;
 try{const read=async()=>snapshot(seq),review=async(r:unknown)=>{ranges.push(r);return {status:'completed'};};
 w=await openCommandWatch(c,read,review);await w.poll();seq=2;await w.poll();await w.close();
 seq=4;w=await openCommandWatch(c,read,review);await w.poll();assert.deepEqual(ranges,[{from:1,to:2},{from:2,to:4}]);await w.close();
 w=await openCommandWatch(c,read,review);assert.equal(w.done,true);await w.poll();assert.equal(ranges.length,2);
 }finally{await w?.close();await f.cleanup();}
});
test('configuration changes and unknown review outcomes cannot silently restart',async()=>{
 const f=await fixture(),c={...config,checkpoint:f.checkpoint};let seq=1,w,calls=0;
 try{w=await openCommandWatch(c,async()=>snapshot(seq),async()=>{calls++;throw Error('fixture failure');});await w.poll();await w.close();
 for(const patch of [{mission:'other'},{document:'other'},{model:'other'},{url:'http://127.0.0.1:5411'},{maxRuns:3}])await assert.rejects(openCommandWatch({...c,...patch},async()=>snapshot(seq),async()=>({status:'completed'})),/differs/);
 w=await openCommandWatch(c,async()=>snapshot(seq),async()=>{calls++;throw Error('fixture failure');});seq=2;await assert.rejects(w.poll(),/fixture failure/);await w.close();
 await assert.rejects(openCommandWatch(c,async()=>snapshot(seq),async()=>{calls++;return {status:'completed'};}),/inspection/);assert.equal(calls,1);
 }finally{await w?.close();await f.cleanup();}
});
test('graceful close drains an active review and leaves a clean resumable checkpoint',async()=>{
 const f=await fixture(),c={...config,checkpoint:f.checkpoint};let seq=1,w;let release!:()=>void,entered!:()=>void;const wait=new Promise<void>(r=>release=r),start=new Promise<void>(r=>entered=r);
 try{w=await openCommandWatch(c,async()=>snapshot(seq),async()=>{entered();await wait;return {status:'completed'};});await w.poll();seq=2;const poll=w.poll();await start;
 await assert.rejects(openCommandWatch(c,async()=>snapshot(seq),async()=>({status:'completed'})),/active writer/);
 let closed=false;const closing=w.close().then(()=>closed=true);await new Promise(r=>setTimeout(r,10));assert.equal(closed,false);release();await poll;await closing;
 assert.equal(JSON.parse(await readFile(f.checkpoint,'utf8')).phase,'ready');w=await openCommandWatch(c,async()=>snapshot(seq),async()=>{throw Error('must not repeat');});assert.equal(await w.poll(),'unchanged');
 }finally{release();await w?.close();await f.cleanup();}
});
test('persistent binding rejects credential-bearing endpoint forms',()=>{
 for(const url of ['http://user:pass@host/','http://host/?token=fixture','http://host/#secret','file:///tmp/x'])assert.throws(()=>watchCommandBinding({...config,url}),/nonsecret/);
 assert.match(watchCommandBinding(config),/^[a-f0-9]{64}$/);
});

test('an interrupted in-flight checkpoint is not rerun by CLI selection',async()=>{
 const f=await fixture(),c={...config,checkpoint:f.checkpoint};let w;
 try{w=await openCommandWatch(c,async()=>snapshot(1),async()=>({status:'completed'}));await w.poll();await w.close();
 const saved=JSON.parse(await readFile(f.checkpoint,'utf8'));saved.phase='in_flight';saved.used=1;saved.attempt={from:1,captured:snapshot(2)};await writeFile(f.checkpoint,JSON.stringify(saved));
 let calls=0;await assert.rejects(openCommandWatch(c,async()=>snapshot(2),async()=>{calls++;return {status:'completed'};}),/inspection/);assert.equal(calls,0);
 }finally{await w?.close();await f.cleanup();}
});

test('actual CLI SIGTERM releases checkpoint lock and clean restart resumes baseline',async()=>{
 const {createServer}=await import('node:http');const {spawn}=await import('node:child_process');
 const f=await fixture();let requests=0;
 const server=createServer((req,res)=>{requests++;assert.ok(req.url?.endsWith('/recovery-state'));res.setHeader('content-type','application/json');res.end(JSON.stringify(snapshot(1)));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
 const run=()=>new Promise<void>((resolve,reject)=>{
  const child=spawn(process.execPath,['src/main.ts','watch','--url',`http://127.0.0.1:${port}`,'--doc','fixture','--mission','Synthetic only','--interval','5','--max-runs','2','--checkpoint',f.checkpoint],{cwd:new URL('..',import.meta.url).pathname.replace(/test\/$/,''),stdio:['ignore','pipe','pipe']});
  let out='',err='',signalled=false;const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('CLI signal fixture timeout'));},10000);
  child.stdout.on('data',chunk=>{out+=chunk;if(!signalled&&out.includes('"event":"watching"')){signalled=true;child.kill('SIGTERM');}});
  child.stderr.on('data',chunk=>err+=chunk);child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('exit',(code,signal)=>{clearTimeout(timer);if(code===0&&signalled)resolve();else reject(Error(`CLI failed ${code}/${signal}: ${err}`));});
 });
 try{await run();assert.equal(JSON.parse(await readFile(f.checkpoint,'utf8')).phase,'ready');await run();const saved=JSON.parse(await readFile(f.checkpoint,'utf8'));assert.equal(saved.used,0);assert.equal(saved.baseline.serverSeq,1);assert.equal(requests,2);}
 finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await f.cleanup();}
});
