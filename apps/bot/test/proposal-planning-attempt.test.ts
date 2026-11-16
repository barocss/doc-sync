import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,chmod,rm,readFile,unlink,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {runProposalMission,type CreatorTarget} from '../src/proposal-planner.ts';
import {openAIProposalPlanner} from '../src/openai-proposal-planner.ts';
const captured:CreatorTarget={base:{generation:'g',epoch:'e',serverSeq:1,schemaVersion:'s'},target:{path:[0],blockId:'block',text:'hello'}};
const plan=()=>({start:0,end:5,replacement:'world',explanation:'Clarify',assumptions:[],questions:[],checks:[]});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'planning-attempt-'));await chmod(dir,0o700);let reads=0,creates=0;return {dir,options:{missionPath:join(dir,'mission.json'),brief:'Clarify',path:[0] as [number],recordPlanningAttempt:true},client:{binding:'b',readTarget:async()=>{reads++;return structuredClone(captured);},create:async(r:any)=>{creates++;return {id:'a'.repeat(64),requestId:r.requestId};}},counts:()=>({reads,creates})};}
test('attempt is durably recorded before planner; failure is blocked on every resume including flag removal',async()=>{
 const f=await fixture();let calls=0;
 try{
  const first=await runProposalMission(f.options,async()=>{calls++;const saved=JSON.parse(await readFile(f.options.missionPath,'utf8'));assert.equal(saved.format,3);assert.deepEqual(saved.target,captured);assert.match(saved.attemptId,/^[-a-f0-9]{36}$/);throw Error('SECRET diagnostic');},f.client);
  assert.equal(first.status,'planning_unknown');
  for(const flag of [true,false,undefined])assert.deepEqual(await runProposalMission({...f.options,recordPlanningAttempt:flag},async()=>{calls++;return plan();},f.client),first);
  assert.equal(calls,1);assert.deepEqual(f.counts(),{reads:1,creates:0});assert(!JSON.stringify(first).includes('SECRET'));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('invalid decisions retain the attempt without creating proposals or accepting a second planner',async()=>{
 for(const invalid of [{...plan(),approve:true},{...plan(),replacement:'hello'},{kind:'abstain',reason:'unknown',explanation:'x',questions:[]}]){
  const f=await fixture();try{const first=await runProposalMission(f.options,async()=>invalid,f.client);assert.equal(first.status,'planning_unknown');assert.deepEqual(await runProposalMission(f.options,async()=>plan(),f.client),first);assert.deepEqual(f.counts(),{reads:1,creates:0});}finally{await rm(f.dir,{recursive:true,force:true});}
 }
});
test('successful planning replaces the attempt with exact durable proposal and recovers unknown creation',async()=>{
 const f=await fixture();let calls=0;const requests:unknown[]=[];
 const client={...f.client,create:async(r:any)=>{requests.push(r);const saved=JSON.parse(await readFile(f.options.missionPath,'utf8'));assert.equal(saved.format,1);assert.deepEqual(saved.request,r);if(requests.length===1)throw Error('lost');return {id:'a'.repeat(64),requestId:r.requestId};}};
 try{const planner=async()=>{calls++;return plan();};assert.equal((await runProposalMission(f.options,planner,client)).status,'unknown');assert.equal((await runProposalMission(f.options,planner,client)).status,'created');assert.equal(calls,1);assert.deepEqual(requests[0],requests[1]);}finally{await rm(f.dir,{recursive:true,force:true});}
});
test('successful abstention replaces attempt and remains terminal without another call',async()=>{
 const f=await fixture();let calls=0;
 try{const planner=async()=>{calls++;return {kind:'abstain',reason:'uncertain',explanation:'Clarify.',questions:[]};};const first=await runProposalMission(f.options,planner,f.client);assert.equal(first.status,'abstained');assert.equal(JSON.parse(await readFile(f.options.missionPath,'utf8')).format,2);assert.deepEqual(await runProposalMission(f.options,planner,f.client),first);assert.equal(calls,1);assert.equal(f.counts().creates,0);}finally{await rm(f.dir,{recursive:true,force:true});}
});
test('pending attempt remains bound to original brief, client and target; corrupt records fail closed',async()=>{
 const f=await fixture();let calls=0;const planner=async()=>{calls++;throw Error('failed');};
 try{
  await runProposalMission(f.options,planner,f.client);
  for(const options of [{...f.options,brief:'other'},{...f.options,path:[1] as [number]}])await assert.rejects(runProposalMission(options,planner,f.client));
  await assert.rejects(runProposalMission(f.options,planner,{...f.client,binding:'other'}));
  const saved=JSON.parse(await readFile(f.options.missionPath,'utf8'));saved.attemptId='corrupt';await writeFile(f.options.missionPath,JSON.stringify(saved));
  await assert.rejects(runProposalMission(f.options,planner,f.client),/Invalid private mission/);assert.equal(calls,1);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('target read failure and checkpoint write failure happen before any planner invocation',async()=>{
 const f=await fixture();let calls=0;
 try{await assert.rejects(runProposalMission(f.options,async()=>{calls++;return plan();},{...f.client,readTarget:async()=>{throw Error('read failed');}}));await assert.rejects(readFile(f.options.missionPath),/ENOENT/);
  await assert.rejects(runProposalMission(f.options,async()=>{calls++;return plan();},{...f.client,readTarget:async()=>{await mkdir(f.options.missionPath);return structuredClone(captured);}}));
  // Invalid flag is rejected before reads/planning, not treated as truthy opt-in.
  await assert.rejects(runProposalMission({...f.options,recordPlanningAttempt:'yes' as any},async()=>{calls++;return plan();},f.client));assert.equal(calls,0);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('fresh provider planner instance cannot repeat a timed-out attempt',async()=>{
 const f=await fixture();let calls=0;
 const newPlanner=()=>openAIProposalPlanner({apiKey:'synthetic_key_not_real',model:'test-model',timeoutMs:10},async()=>{calls++;return new Promise(()=>{});});
 try{const first=await runProposalMission(f.options,newPlanner(),f.client);assert.equal(first.status,'planning_unknown');assert.deepEqual(await runProposalMission(f.options,newPlanner(),f.client),first);assert.equal(calls,1);assert.equal(f.counts().creates,0);}finally{await rm(f.dir,{recursive:true,force:true});}
});
test('real process exit leaves attempt and lock; after verified dead-owner cleanup resume does not call planner',async()=>{
 const f=await fixture();
 const script=`import {runProposalMission} from ${JSON.stringify(new URL('../src/proposal-planner.ts',import.meta.url).href)};await runProposalMission(${JSON.stringify(f.options)},async()=>{process.exit(23);},{binding:'b',readTarget:async()=>(${JSON.stringify(captured)}),create:async()=>{throw Error('must not create')}});`;
 try{
  const code=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'ignore'});child.once('error',reject);child.once('exit',resolve);});assert.equal(code,23);
  assert.equal(JSON.parse(await readFile(f.options.missionPath,'utf8')).format,3);
  await assert.rejects(runProposalMission(f.options,async()=>plan(),f.client),/locked/);
  // Test has observed child exit; this is explicit operator cleanup, not product auto-unlocking.
  await unlink(f.options.missionPath+'.lock');let calls=0;
  assert.equal((await runProposalMission(f.options,async()=>{calls++;return plan();},f.client)).status,'planning_unknown');assert.equal(calls,0);assert.equal(f.counts().reads,0);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
