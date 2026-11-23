import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {listMissions,recoverMission} from '../../bot/src/runner.ts';
import {listProfiles,loadProfile,profileActor,profileUrl} from '../../bot/src/profiles.ts';

// The browser is a local controller; the existing profile and journal remain the source of identity.
export function durableBots({root,stateDir,model,children}) {
 const active=new Map(),recovering=new Set(),lastAttempt=new Map();
 const key=(profile,doc,id)=>JSON.stringify([profile,doc,id]);
 const validDoc=doc=>typeof doc==='string'&&/^[a-z0-9-]{1,40}$/.test(doc);
 const endpoint=(origin,profile)=>profileUrl(`${origin}/profiles/${profile}`);
 const own=(m,profile,doc,origin)=>m.document===doc && m.url===endpoint(origin,profile) && typeof m.profileId==='string';
 async function records(profile,doc,origin) {
  const [profiles,missions]=await Promise.all([listProfiles(stateDir),listMissions(stateDir)]);
  const jobs=[],history=[];
  for(const bot of profiles){
   const current=active.get(key(profile,doc,bot.id));
   const matching=missions.filter(m=>m.profileId===bot.id&&own(m,profile,doc,origin));
   for(const m of matching.slice(0,20))history.push({bot:bot.id,id:m.id,mission:m.mission,status:m.status,pending:!!m.pending,createdAt:m.createdAt,updatedAt:m.updatedAt,result:m.result??null,error:m.error??null,steps:Array.isArray(m.steps)?m.steps:[]});
   const last=matching[0];
   const unresolved=matching.some(m=>m.pending || m.status==='running'||m.status==='queued'||recovering.has(m.id));
   if(current){jobs.push({...current,blocked:unresolved&&current.status!=='running',recoverable:matching.some(m=>m.recoveryProtocol===1&&(m.pending||m.status==='running'||m.status==='queued'))});continue;}
   if(last)jobs.push({bot:bot.id,name:bot.name,role:bot.role,character:bot.character,actor:last.actor,
    status:unresolved?'interrupted':last.status,result:last.result??null,error:last.error??null,blocked:unresolved,recoverable:matching.some(m=>m.recoveryProtocol===1&&(m.pending||m.status==='running'||m.status==='queued')),missionId:last.id});
  }
  return {enabled:true,durable:true,profiles:profiles.map(({id,name,character,personality,role,color})=>({id,name,character,personality,role,color})),jobs,history};
 }
 async function recover({profile,doc,id,origin}) {
  if(!validDoc(doc)||typeof id!=='string')throw Object.assign(Error('Invalid bot'),{status:400});
  const k=key(profile,doc,id),previous=active.get(k);
  if(previous?.status==='running')return;
  const bot=await loadProfile(stateDir,id);
  const missions=await listMissions(stateDir);
  if(active.get(k)!==previous || previous?.status==='running')return;
  for(const m of missions.filter(m=>m.profileId===id&&own(m,profile,doc,origin))){
   if(m.recoveryProtocol!==1||!(m.pending||m.status==='running'||m.status==='queued')||recovering.has(m.id)||Date.now()-(lastAttempt.get(m.id)??0)<5000)continue;
   recovering.add(m.id);lastAttempt.set(m.id,Date.now());
   if(m.resume?.version===1){
    const claim={bot:id,name:bot.name,role:bot.role,character:bot.character,actor:m.actor,status:'running',result:null,error:null,blocked:false,missionId:m.id};
    active.set(k,claim);
    const args=[join(root,'apps/bot/src/main.ts'),'resume','--id',m.id,'--state-dir',stateDir];if(model)args.push('--model',model);
    const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});children.push(child);
    child.stdout.resume();child.stderr.resume();const timer=setTimeout(()=>child.kill('SIGTERM'),300000);timer.unref();
    child.once('error',()=>{claim.status='interrupted';claim.blocked=true;});
    child.once('close',()=>{clearTimeout(timer);if(active.get(k)===claim)active.delete(k);recovering.delete(m.id);});
   } else void recoverMission(stateDir,m.id).then(()=>{if(active.get(k)===previous)active.delete(k);}).catch(()=>{}).finally(()=>recovering.delete(m.id));
   break;
  }
 }
 async function recoverAll(origin,profiles) {
  const missions=await listMissions(stateDir);
  for(const m of missions){
   if(m.recoveryProtocol!==1||!m.profileId||!(m.pending||m.status==='running'||m.status==='queued'))continue;
   const profile=profiles.find(p=>own(m,p,m.document,origin));
   if(profile)await recover({profile,doc:m.document,id:m.profileId,origin}).catch(()=>{});
  }
 }
 async function launch({profile,doc,id,mission,origin}) {
  if(!validDoc(doc)||typeof id!=='string'||typeof mission!=='string'||!mission.trim()||mission.length>2000)throw Object.assign(Error('Invalid bot mission'),{status:400});
  const k=key(profile,doc,id);
  if(active.get(k)?.status==='running')throw Object.assign(Error('This bot is already working on the document'),{status:409});
  // Claim before any await to serialize concurrent POST requests in this process.
  const claim={bot:id,status:'running'};active.set(k,claim);
  try{
   const bot=await loadProfile(stateDir,id);
   const missions=await listMissions(stateDir);
   if(missions.some(m=>m.profileId===id&&own(m,profile,doc,origin)&&(m.pending||m.status==='running'||m.status==='queued')))throw Object.assign(Error('A previous task requires recovery inspection before another task'),{status:409});
   const url=endpoint(origin,profile),actor=profileActor(bot,url,doc);
   Object.assign(claim,{name:bot.name,role:bot.role,character:bot.character,actor,result:null,error:null,blocked:false});
   const args=[join(root,'apps/bot/src/main.ts'),'run','--url',url,'--doc',doc,'--profile',id,'--mission',mission,'--state-dir',stateDir,'--max-steps','8'];
   if(model)args.push('--model',model);
   const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});children.push(child);
   let output='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-1024*1024)});child.stderr.resume();
   const timer=setTimeout(()=>child.kill('SIGTERM'),300000);timer.unref();
   child.once('error',()=>{claim.status='needs_attention';claim.error='Could not start the bot.';});
   child.once('close',()=>{clearTimeout(timer);try{const result=JSON.parse(output);claim.status=result.status==='completed'?'completed':'needs_attention';claim.result=result.result??null;claim.error=result.error??null;claim.blocked=!!result.pending;claim.missionId=result.id;}catch{claim.status='interrupted';claim.error='The task stopped; inspect its mission and journal before retrying.';claim.blocked=true;}});
   return claim;
  }catch(error){if(active.get(k)===claim)active.delete(k);if(error?.code==='ENOENT')throw Object.assign(Error('Bot profile not found'),{status:404});throw error;}
 }
 return {records,launch,recover,recoverAll};
}
