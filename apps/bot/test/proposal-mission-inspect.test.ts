import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,chmod,rm,readFile,writeFile,stat,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runProposalMission,inspectProposalMission} from '../src/proposal-planner.ts';
const target={base:{generation:'g',epoch:'e',serverSeq:1,schemaVersion:'s'},target:{path:[0] as [number],blockId:'PRIVATE_BLOCK',text:'PRIVATE_SOURCE'}};
const plan=()=>({start:0,end:14,replacement:'PRIVATE_REPLACEMENT',explanation:'PRIVATE_EXPLANATION',assumptions:['PRIVATE_ASSUMPTION'],questions:['PRIVATE_QUESTION'],checks:[]});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'inspect-proposal-'));await chmod(dir,0o700);return {dir,options:{missionPath:join(dir,'mission.json'),brief:'PRIVATE_BRIEF',path:[0] as [number]},client:{binding:'PRIVATE_BINDING',readTarget:async()=>structuredClone(target),create:async(r:any)=>({id:'a'.repeat(64),requestId:r.requestId})}};}
async function unchanged(file:string,run:()=>Promise<unknown>){const before=await readFile(file),metadata=await stat(file);const result=await run();assert.deepEqual(await readFile(file),before);const after=await stat(file);assert.equal(after.mtimeMs,metadata.mtimeMs);assert.equal(after.ino,metadata.ino);return result;}
test('all saved states have narrow read-only summaries without private content or live claims',async()=>{
 for(const state of ['planning','unknown','created','abstained']){
  const f=await fixture();try{
   const planner=async()=>{if(state==='planning')throw Error('not known');if(state==='abstained')return {kind:'abstain',reason:'missing_information',explanation:'PRIVATE_EXPLANATION',questions:['PRIVATE_QUESTION']};return plan();};
   const result=await runProposalMission({...f.options,recordPlanningAttempt:state==='planning'},planner,{...f.client,create:async(r:any)=>{if(state==='unknown')throw Error('lost');return f.client.create(r);}});
   const summary=await unchanged(f.options.missionPath,()=>inspectProposalMission(f.options.missionPath)) as Awaited<ReturnType<typeof inspectProposalMission>>;
   assert.equal(summary.activity,'not_checked');assert.equal(summary.liveStatus,'not_checked');assert(!JSON.stringify(summary).includes('PRIVATE_'));
   assert.equal(summary.status,{planning:'planning_unresolved',unknown:'proposal_unconfirmed',created:'proposal_recorded',abstained:'abstained'}[state]);
   if(summary.status==='proposal_recorded'){assert.equal(summary.proposalId,'a'.repeat(64));assert.equal(result.status,'created');}
   if(summary.status==='abstained'){assert.equal(summary.reason,'missing_information');assert.equal(summary.questionCount,1);}
  }finally{await rm(f.dir,{recursive:true,force:true});}
 }
});
test('inspection does not remove a lock or claim an in-flight planner has failed',async()=>{
 const f=await fixture();let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 try{
  const pending=runProposalMission({...f.options,recordPlanningAttempt:true},async()=>{entered();await gate;return plan();},f.client);await started;
  const before=await stat(f.options.missionPath+'.lock');const summary=await inspectProposalMission(f.options.missionPath);
  assert.equal(summary.status,'planning_unresolved');assert.equal(summary.activity,'not_checked');assert.equal((await stat(f.options.missionPath+'.lock')).ino,before.ino);
  release();assert.equal((await pending).status,'created');assert.equal((await inspectProposalMission(f.options.missionPath)).status,'proposal_recorded');
 }finally{release?.();await rm(f.dir,{recursive:true,force:true});}
});
test('missing, malformed and unknown versions fail closed without writes or content disclosure',async()=>{
 const f=await fixture();try{
  await assert.rejects(inspectProposalMission(f.options.missionPath),/No saved proposal mission/);
  for(const bytes of ['PRIVATE_MALFORMED',JSON.stringify({format:99,private:'PRIVATE_SECRET'})]){await writeFile(f.options.missionPath,bytes,{mode:0o600});const before=await readFile(f.options.missionPath);await assert.rejects(inspectProposalMission(f.options.missionPath),e=>/Invalid private mission/.test(String(e))&&!String(e).includes('PRIVATE_'));assert.deepEqual(await readFile(f.options.missionPath),before);}
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('private parent/file requirements, symlink and hardlink protections are retained',async()=>{
 const f=await fixture();try{
  await runProposalMission(f.options,async()=>plan(),f.client);await chmod(f.options.missionPath,0o644);await assert.rejects(inspectProposalMission(f.options.missionPath));await chmod(f.options.missionPath,0o600);
  await chmod(f.dir,0o755);await assert.rejects(inspectProposalMission(f.options.missionPath),/private/);await chmod(f.dir,0o700);
  const symbolic=join(f.dir,'symbolic');await symlink(f.options.missionPath,symbolic);await assert.rejects(inspectProposalMission(symbolic));
  const hard=join(f.dir,'hard');await link(f.options.missionPath,hard);await assert.rejects(inspectProposalMission(hard));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('CLI inspection needs only a file; endpoint/credential options are refused before any server path',async()=>{
 const f=await fixture();const run=(args:string[])=>promisify(execFile)(process.execPath,['src/main.ts','proposal-mission-inspect',...args],{cwd:new URL('..',import.meta.url).pathname.replace(/test\/$/,''),timeout:10000,env:{PATH:'',HOME:f.dir}});
 try{
  await runProposalMission({...f.options,recordPlanningAttempt:true},async()=>{throw Error('uncertain');},f.client);
  const output=await unchanged(f.options.missionPath,()=>run(['--mission-file',f.options.missionPath])) as {stdout:string};assert.equal(JSON.parse(output.stdout).status,'planning_unresolved');assert(!output.stdout.includes('PRIVATE_'));
  for(const args of [[],['--mission-file',f.options.missionPath,'--endpoint','http://127.0.0.1:1'],['--mission-file',f.options.missionPath,'--token-env','DO_NOT_READ']])await assert.rejects(run(args),e=>(e as any).code===1);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
