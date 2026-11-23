import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReviewWatch} from '../src/watch.ts';
import {PersistentReviewWatch} from '../src/persistent-watch.ts';
import {openCommandWatch} from '../src/watch-command.ts';
const initial=()=>({generation:'g',epoch:'e',schemaVersion:'s',serverSeq:1});
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);return {promise,release};}
function canceled(signal:AbortSignal):Promise<never>{return new Promise((_,reject)=>{if(signal.aborted)reject(Error('cancelled'));else signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});}
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'watch-cancellation-'));await chmod(dir,0o700);return {dir,options:{file:join(dir,'watch.json'),binding:'a'.repeat(64),maxRuns:3}};}
test('in-memory stop signals in-flight reviewer and does not report a canceled review completed',async()=>{
 const state=initial(),entered=gate();let signal:AbortSignal|undefined,calls=0;
 const watch=new ReviewWatch(async()=>state,async(_range,s)=>{signal=s;calls++;entered.release();return canceled(s);},3);
 await watch.poll();state.serverSeq=2;const active=watch.poll();await entered.promise;watch.stop();assert(signal?.aborted);assert.equal(await active,'stopped');assert.equal(await watch.poll(),'stopped');assert.equal(calls,1);
});
test('in-memory stop aborts a pending read before any reviewer starts',async()=>{
 const entered=gate();let calls=0;
 const watch=new ReviewWatch(async signal=>{entered.release();return canceled(signal);},async()=>{calls++;return {status:'completed'};},3);
 const poll=watch.poll();await entered.promise;watch.stop();assert.equal(await poll,'stopped');assert.equal(calls,0);
});
test('persistent cancellation retains consumed budget, captured attempt and old cursor across close',async()=>{
 const f=await fixture(),state=initial(),entered=gate();let watch:PersistentReviewWatch|undefined,calls=0,signal:AbortSignal|undefined;
 try{
  watch=await PersistentReviewWatch.open(f.options,async()=>state,async(_r,s)=>{calls++;signal=s;entered.release();return canceled(s);});
  await watch.poll();state.serverSeq=2;const poll=watch.poll();await entered.promise;const stop=watch.stop();assert(signal?.aborted);assert.equal(await poll,'stopped');await stop;await watch.close();
  const saved=JSON.parse(await readFile(f.options.file,'utf8'));assert.equal(saved.phase,'stopped');assert.equal(saved.used,1);assert.equal(saved.baseline.serverSeq,1);assert.equal(saved.attempt.captured.serverSeq,2);
  await assert.rejects(PersistentReviewWatch.open(f.options,async()=>state,async()=>{calls++;return {status:'completed'};}),/inspection/);assert.equal(calls,1);
 }finally{await watch?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('stop during completion read preserves uncertainty instead of advancing the review cursor',async()=>{
 const f=await fixture(),state=initial(),entered=gate();let watch:PersistentReviewWatch|undefined,reads=0;
 try{
  watch=await PersistentReviewWatch.open(f.options,async signal=>{if(++reads===3){entered.release();return canceled(signal);}return state;},async()=>({status:'completed'}));
  await watch.poll();state.serverSeq=2;const poll=watch.poll();await entered.promise;const stop=watch.stop();assert.equal(await poll,'stopped');await stop;await watch.close();
  const saved=JSON.parse(await readFile(f.options.file,'utf8'));assert.equal(saved.baseline.serverSeq,1);assert.equal(saved.phase,'stopped');assert.equal(saved.used,1);
 }finally{await watch?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('non-cooperative reviewer is drained while lock remains held; late success is not committed',async()=>{
 const f=await fixture(),state=initial(),entered=gate(),release=gate();let watch:PersistentReviewWatch|undefined;
 try{
  watch=await PersistentReviewWatch.open(f.options,async()=>state,async(_range,signal)=>{entered.release();await release.promise;assert(signal.aborted);return {status:'completed'};});await watch.poll();state.serverSeq=2;
  const poll=watch.poll();await entered.promise;let stopped=false,closed=false;const stopping=watch.stop().then(()=>stopped=true),closing=watch.close().then(()=>closed=true);
  await new Promise(r=>setTimeout(r,10));assert.equal(stopped,false);assert.equal(closed,false);
  await assert.rejects(PersistentReviewWatch.open(f.options,async()=>state,async()=>({status:'completed'})),/active writer/);
  release.release();assert.equal(await poll,'stopped');await stopping;await closing;
  const saved=JSON.parse(await readFile(f.options.file,'utf8'));assert.equal(saved.phase,'stopped');assert.equal(saved.baseline.serverSeq,1);
 }finally{release.release();await watch?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('command factory exposes explicit cancellation for both watch variants without invoking CLI/model',async()=>{
 for(const persistent of [false,true]){
  const f=await fixture(),state=initial(),entered=gate();let signal:AbortSignal|undefined;
  const watch=await openCommandWatch({url:'http://127.0.0.1:5410',document:'synthetic',mission:'review',maxRuns:3,...(persistent?{checkpoint:f.options.file}:{})},async()=>state,async(_range,s)=>{signal=s;entered.release();return canceled(s);});
  try{await watch.poll();state.serverSeq=2;const poll=watch.poll();await entered.promise;await watch.stop();assert(signal?.aborted);assert.equal(await poll,'stopped');assert.equal(watch.done,true);}finally{await watch.close();await rm(f.dir,{recursive:true,force:true});}
 }
});
test('stop after final verified cursor save starts drains the commit and reports reviewed',async()=>{
 const f=await fixture(),state=initial(),committing=gate(),release=gate();let watch:PersistentReviewWatch|undefined;
 try{
  watch=await PersistentReviewWatch.open(f.options,async()=>state,async()=>({status:'completed'}));await watch.poll();
  const persist=(watch as any).persist.bind(watch);(watch as any).persist=async(next:any)=>{if(next.phase==='ready'&&next.baseline?.serverSeq===2){committing.release();await release.promise;}return persist(next);};
  state.serverSeq=2;const poll=watch.poll();await committing.promise;const stop=watch.stop();release.release();assert.equal(await poll,'reviewed');await stop;await watch.close();
  const saved=JSON.parse(await readFile(f.options.file,'utf8'));assert.equal(saved.phase,'stopped');assert.equal(saved.baseline.serverSeq,2);assert.equal(saved.used,1);assert.equal(saved.attempt,undefined);
  await assert.rejects(PersistentReviewWatch.open(f.options,async()=>state,async()=>({status:'completed'})),/inspection/);
 }finally{release.release();await watch?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('synchronous callback close cannot release the writer lock before its own read settles',async()=>{
 const f=await fixture(),entered=gate(),release=gate();let watch:PersistentReviewWatch|undefined,closed=false,closing:Promise<void>|undefined;
 try{
  watch=await PersistentReviewWatch.open(f.options,async()=>{closing=watch!.close().then(()=>{closed=true;});entered.release();await release.promise;return initial();},async()=>({status:'completed'}));
  const poll=watch.poll();await entered.promise;await new Promise(r=>setTimeout(r,10));assert.equal(closed,false);
  await assert.rejects(PersistentReviewWatch.open(f.options,async()=>initial(),async()=>({status:'completed'})),/active writer/);
  release.release();assert.equal(await poll,'baseline');await closing;assert.equal(closed,true);
 }finally{release.release();await watch?.close();await rm(f.dir,{recursive:true,force:true});}
});
test('stop before deferred poll begins does not start a new callback',async()=>{
 const f=await fixture();let watch:PersistentReviewWatch|undefined,reads=0,reviews=0;
 try{watch=await PersistentReviewWatch.open(f.options,async()=>{reads++;return initial();},async()=>{reviews++;return {status:'completed'};});const poll=watch.poll(),stop=watch.stop();assert.equal(await poll,'stopped');await stop;await watch.close();assert.equal(reads,0);assert.equal(reviews,0);const saved=JSON.parse(await readFile(f.options.file,'utf8'));assert.equal(saved.phase,'stopped');assert.equal(saved.used,0);assert.equal(saved.baseline,null);}finally{await watch?.close();await rm(f.dir,{recursive:true,force:true});}
});
