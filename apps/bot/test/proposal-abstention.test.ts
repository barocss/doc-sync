import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,chmod,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runProposalMission,type CreatorOnlyClient} from '../src/proposal-planner.ts';
const target={base:{generation:'g',epoch:'e',serverSeq:1,schemaVersion:'s'},target:{path:[0] as [number],blockId:'b',text:'Unknown date'}};
const abstain={kind:'abstain',reason:'missing_information',explanation:'The date is not supplied.',questions:['What is the date?']};
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'abstain-'));await chmod(dir,0o700);return {dir,options:{missionPath:join(dir,'mission.json'),brief:'Add the confirmed date',path:[0] as [number]}};}
test('abstention is private durable terminal history, never creates or replans on resume',async()=>{
 const {dir,options}=await fixture();let reads=0,plans=0,creates=0;
 const client:CreatorOnlyClient={binding:'b',readTarget:async()=>{reads++;return structuredClone(target);},create:async()=>{creates++;throw Error('must not create');}};
 try{
 const a=await runProposalMission(options,async()=>{plans++;return abstain;},client);
 assert.deepEqual(a,{status:'abstained',reason:abstain.reason,explanation:abstain.explanation,questions:abstain.questions});
 const bytes=await readFile(options.missionPath,'utf8');const stored=JSON.parse(bytes);assert.equal(stored.format,2);assert(!('request' in stored));
 const resumed=await runProposalMission(options,async()=>{throw Error('must not replan');},{...client,readTarget:async()=>{throw Error('must not recapture');}});
 assert.deepEqual(resumed,a);assert.equal(await readFile(options.missionPath,'utf8'),bytes);assert.deepEqual([reads,plans,creates],[1,1,0]);
 for(const altered of [{...options,brief:'different'},{...options,path:[1] as [number]}])await assert.rejects(runProposalMission(altered,async()=>abstain,client));
 await assert.rejects(runProposalMission(options,async()=>abstain,{...client,binding:'other'}));
 stored.request={requestId:'forged'};await writeFile(options.missionPath,JSON.stringify(stored));await assert.rejects(runProposalMission(options,async()=>abstain,client),/Invalid private mission/);assert.equal(creates,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('malformed refusal cannot hide an edit, authority or completion claim',async()=>{
 const {dir,options}=await fixture();let creates=0;const client:CreatorOnlyClient={binding:'b',readTarget:async()=>structuredClone(target),create:async()=>{creates++;throw Error('must not create');}};
 try{for(const bad of [{...abstain,replacement:'invented date'},{...abstain,reason:'completed'},{...abstain,explanation:' '},{...abstain,questions:Array(17).fill('x')},{...abstain,questions:[7]},{...abstain,kind:'refuse'}])await assert.rejects(runProposalMission(options,async()=>bad,client),/Planner output rejected/);
 assert.equal(creates,0);await assert.rejects(readFile(options.missionPath),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('fresh CLI process returns saved abstention with nonzero status and no plan-file read',async()=>{
 const {dir,options}=await fixture();
 const {creatorClient}=await import('../src/proposal-client.ts');
 const {spawnSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const endpoint='http://127.0.0.1:1/mcp/synthetic/route/doc',token='x'.repeat(43);
 try{
 await runProposalMission(options,async()=>abstain,{...creatorClient(endpoint,token),readTarget:async()=>structuredClone(target)});
 const before=await readFile(options.missionPath,'utf8');
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../src/main.ts',import.meta.url)),'proposal-plan','--endpoint',endpoint,'--token-env','SYNTHETIC_CREATOR','--mission-file',options.missionPath,'--brief',options.brief,'--path','[0]','--plan-file',join(dir,'absent-plan.json')],{env:{SYNTHETIC_CREATOR:token},encoding:'utf8',timeout:10000});
 assert.equal(result.status,1,result.stderr);assert.equal(JSON.parse(result.stdout).status,'abstained');assert(!result.stdout.includes(token));assert(!result.stderr.includes(token));assert.equal(await readFile(options.missionPath,'utf8'),before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
