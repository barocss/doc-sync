import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,chmod,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runProposalMission} from '../src/proposal-planner.ts';

for(const outcome of ['created','abstained'] as const)test(`concurrent same-mission contender cannot plan or create while first ${outcome} decision is pending`,{timeout:5000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proposal-concurrency-'));await chmod(dir,0o700);
 const options={missionPath:join(dir,'mission.json'),brief:'Clarify synthetic text',path:[0] as [number],recordPlanningAttempt:true};
 let reads=0,plans=0,creates=0,entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(r=>entered=r),barrier=new Promise<void>(r=>release=r);
 const client={binding:'synthetic-creator',readTarget:async()=>{reads++;return {base:{generation:'g',epoch:'e',serverSeq:1,schemaVersion:'s'},target:{path:[0] as [number],blockId:'b',text:'hello'}};},create:async(request:any)=>{creates++;return {id:'a'.repeat(64),requestId:request.requestId};}};
 const decision=outcome==='created'?{start:0,end:5,replacement:'world',explanation:'Clarify',assumptions:[],questions:[],checks:[]}:{kind:'abstain',reason:'uncertain',explanation:'Need detail',questions:[]};
 const planner=async()=>{plans++;entered();await barrier;return decision;};
 let first:ReturnType<typeof runProposalMission>|undefined;
 try{
  first=runProposalMission(options,planner,client);await Promise.race([started,first.then(()=>{throw Error('mission completed before planner barrier');})]);
  const attempt=await readFile(options.missionPath,'utf8');assert.equal(JSON.parse(attempt).format,3);
  await assert.rejects(runProposalMission(options,planner,client),/Mission locked/);
  assert.equal(await readFile(options.missionPath,'utf8'),attempt);
  assert.deepEqual({reads,plans,creates},{reads:1,plans:1,creates:0});
  release();const result=await first;assert.equal(result.status,outcome);
  // A new invocation after lock release reuses the terminal record, not a new plan.
  assert.deepEqual(await runProposalMission(options,planner,client),result);
  assert.deepEqual({reads,plans,creates},{reads:1,plans:1,creates:outcome==='created'?1:0});
 }finally{release();await first?.catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
