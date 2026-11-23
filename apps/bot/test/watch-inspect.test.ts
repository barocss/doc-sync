import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,chmod,readFile,writeFile,stat,rm,symlink,link,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PersistentReviewWatch,inspectWatchCheckpoint} from '../src/persistent-watch.ts';
const snapshot=()=>({generation:'PRIVATE_GENERATION',epoch:'PRIVATE_EPOCH',schemaVersion:'PRIVATE_SCHEMA',serverSeq:4});
const state=()=>({version:1,binding:'a'.repeat(64),maxRuns:3,used:0,phase:'ready',baseline:snapshot()});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'watch-inspect-'));await chmod(dir,0o700);const file=join(dir,'watch.json');return {dir,file};}
async function save(file:string,value:unknown){await writeFile(file,JSON.stringify(value),{mode:0o600});}
async function unchanged(file:string){const before=await readFile(file),s=await stat(file),result=await inspectWatchCheckpoint(file);assert.deepEqual(await readFile(file),before);const after=await stat(file);assert.equal(after.ino,s.ino);assert.equal(after.mtimeMs,s.mtimeMs);return result;}
test('inspection summarizes each stored phase without identity fields or live/restart claims',async()=>{
 const f=await fixture();try{for(const phase of ['ready','in_flight','blocked','stopped']){
  const saved={...state(),phase,used:phase==='ready'?0:1,...(phase==='ready'?{}:{attempt:{from:4,captured:{...snapshot(),serverSeq:7}}})};await save(f.file,saved);
  const result=await unchanged(f.file);assert.deepEqual(result,{phase,used:saved.used,maxRuns:3,remaining:3-saved.used,baselineServerSeq:4,pendingRange:phase==='ready'?null:{from:4,to:7},activity:'not_checked',liveStatus:'not_checked'});
  assert(!JSON.stringify(result).includes('PRIVATE_'));assert(!JSON.stringify(result).includes(saved.binding));
 }
 await save(f.file,{...state(),baseline:null});assert.equal((await unchanged(f.file)).baselineServerSeq,null);
 await save(f.file,{...state(),used:3});assert.equal((await unchanged(f.file)).remaining,0);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('live writer and in-flight callback remain untouched and restart stays blocked',async()=>{
 const f=await fixture(),current=snapshot();let w:PersistentReviewWatch|undefined,release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 const options={file:f.file,binding:state().binding,maxRuns:3};
 try{
  w=await PersistentReviewWatch.open(options,async()=>current,async()=>{entered();await gate;return {status:'cancelled'};});await w.poll();current.serverSeq=7;
  const work=w.poll();const outcome=assert.rejects(work,/inspection/);await started;
  const before=await stat(f.file+'.lock'),names=await readdir(f.dir);assert.equal((await unchanged(f.file)).phase,'in_flight');assert.equal((await stat(f.file+'.lock')).ino,before.ino);assert.deepEqual(await readdir(f.dir),names);
  await assert.rejects(PersistentReviewWatch.open(options,async()=>current,async()=>({status:'completed'})),/active writer/);
  release();await outcome;await w.close();assert.equal((await unchanged(f.file)).phase,'blocked');await assert.rejects(PersistentReviewWatch.open(options,async()=>current,async()=>({status:'completed'})),/inspection/);
 }finally{release();await w?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('missing, malformed, inconsistent and oversized snapshots fail without raw disclosure',async()=>{
 const f=await fixture();try{
  await assert.rejects(inspectWatchCheckpoint(f.file),/No saved/);
  const bad=[{...state(),binding:'PRIVATE_INVALID'},{...state(),maxRuns:0},{...state(),maxRuns:101},{...state(),used:4},{...state(),phase:'in_flight'},{...state(),used:1,baseline:null},{...state(),phase:'ready',used:1,attempt:{from:4,captured:{...snapshot(),serverSeq:7}}}];
  for(const value of bad){await save(f.file,value);await assert.rejects(inspectWatchCheckpoint(f.file),/Invalid private watch checkpoint/);}
  for(const bytes of ['PRIVATE_BAD_JSON','x'.repeat(16385)]){await writeFile(f.file,bytes);await assert.rejects(inspectWatchCheckpoint(f.file),e=>String(e)==='Error: Invalid private watch checkpoint');assert.equal(await readFile(f.file,'utf8'),bytes);}
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('inspection retains private permissions and regular-file link protections',async()=>{
 const f=await fixture();try{
  await save(f.file,state());await chmod(f.file,0o644);await assert.rejects(inspectWatchCheckpoint(f.file));await chmod(f.file,0o600);
  await chmod(f.dir,0o755);await assert.rejects(inspectWatchCheckpoint(f.file));await chmod(f.dir,0o700);
  const sym=join(f.dir,'sym'),hard=join(f.dir,'hard');await symlink(f.file,sym);await assert.rejects(inspectWatchCheckpoint(sym));await link(f.file,hard);await assert.rejects(inspectWatchCheckpoint(hard));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('CLI needs only checkpoint and rejects server/model options without starting work',async()=>{
 const f=await fixture();const run=(args:string[])=>promisify(execFile)(process.execPath,['src/main.ts','watch-inspect',...args],{cwd:new URL('..',import.meta.url).pathname,env:{PATH:'',HOME:f.dir},timeout:10000});
 try{
  await save(f.file,state());const before=await readFile(f.file);assert.equal(JSON.parse((await run(['--checkpoint',f.file])).stdout).phase,'ready');assert.deepEqual(await readFile(f.file),before);assert.deepEqual(await readdir(f.dir),['watch.json']);
  for(const args of [[],['--checkpoint',f.file,'--url','http://127.0.0.1:1'],['--checkpoint',f.file,'--model','no-model']])await assert.rejects(run(args),e=>(e as any).code===1);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
