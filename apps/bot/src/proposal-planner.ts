import {previewReplacement} from "../../mcp/src/proposal-preview.ts";
import {constants} from 'node:fs';
import {open, lstat, rename, unlink} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export type ProposalBase = {generation:string;epoch:string;serverSeq:number;schemaVersion:string};
export type CreatorTarget = {base:ProposalBase;target:{path:[number];blockId:string;text:string}};
export type PlannedProposalRequest = {requestId:string;base:ProposalBase;change:{kind:'replace_text';path:[number];blockId:string;start:number;end:number;replacement:string};explanation:string;assumptions:string[];questions:string[];checks:{reference:string;status:'unchecked'}[];briefDigest:string};
/** Implementations must prove a stable authorized stored/plain root target. No owner methods. */
export type CreatorOnlyClient = {binding:string;readTarget(path:[number]):Promise<CreatorTarget>;create(request:PlannedProposalRequest):Promise<{id:string;requestId:string}>};
export type ProposalPlanner = (input:{brief:string;target:CreatorTarget})=>Promise<unknown>;
export type ProposalMissionOptions = {missionPath:string;brief:string;path:[number]};
export type ProposalAbstention = {kind:'abstain';reason:'missing_information'|'unsupported'|'uncertain';explanation:string;questions:string[]};
type AbstainedMission = {format:2;binding:string;brief:string;target:CreatorTarget;abstention:ProposalAbstention};
type EditMission = {format:1;binding:string;brief:string;target:CreatorTarget;request:PlannedProposalRequest;created?:{id:string;requestId:string}};
type Mission = EditMission | AbstainedMission;
const MAX=262144, hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=():never=>{throw Error('Invalid bounded proposal mission');};
function object(v:unknown):Record<string,any>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)fail();return v as Record<string,any>;}
function keys(v:unknown,names:string[]){const o=object(v);if(Object.keys(o).sort().join(',')!==[...names].sort().join(','))fail();return o;}
function str(v:unknown,max:number,min=0):asserts v is string{if(typeof v!=='string'||v.length<min||v.length>max)fail();}
function path(v:unknown):asserts v is [number]{if(!Array.isArray(v)||v.length!==1||!Number.isSafeInteger(v[0])||v[0]<0)fail();}
function target(v:unknown):asserts v is CreatorTarget{
 const x=keys(v,['base','target']),b=keys(x.base,['generation','epoch','serverSeq','schemaVersion']),t=keys(x.target,['path','blockId','text']);
 for(const key of ['generation','epoch','schemaVersion'])str(b[key],256,1);
 if(!Number.isSafeInteger(b.serverSeq)||b.serverSeq<0)fail();path(t.path);str(t.blockId,256,1);str(t.text,16384);
}
function output(v:unknown,text:string){
 const o=keys(v,['start','end','replacement','explanation','assumptions','questions','checks']);
 if(!Number.isSafeInteger(o.start)||!Number.isSafeInteger(o.end)||o.start<0||o.end<o.start||o.end>text.length||o.end-o.start>4096)fail();
 // UTF-16 offsets must not split a surrogate pair.
 for(const i of [o.start,o.end])if(i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1]!)&&/[\uDC00-\uDFFF]/.test(text[i]!))fail();
 str(o.replacement,4096);
 previewReplacement(text,{kind:'replace_text',path:[0],blockId:'validation-only',start:o.start,end:o.end,replacement:o.replacement});
 str(o.explanation,4000,1);if(o.replacement===text.slice(o.start,o.end))fail();
 for(const field of ['assumptions','questions']){if(!Array.isArray(o[field])||o[field].length>16)fail();for(const s of o[field])str(s,1000);}
 if(!Array.isArray(o.checks)||o.checks.length>16)fail();for(const c of o.checks){keys(c,['reference','status']);str(c.reference,256,1);if(c.status!=='unchecked')fail();}
 return o as {start:number;end:number;replacement:string;explanation:string;assumptions:string[];questions:string[];checks:{reference:string;status:'unchecked'}[]};
}
function abstention(v:unknown):ProposalAbstention{
 const o=keys(v,['kind','reason','explanation','questions']);
 if(o.kind!=='abstain'||!['missing_information','unsupported','uncertain'].includes(o.reason))fail();
 str(o.explanation,4000,1);if(!o.explanation.trim())fail();
 if(!Array.isArray(o.questions)||o.questions.length>16)fail();for(const q of o.questions)str(q,1000);
 return o as ProposalAbstention;
}
/** Shared local decision gate; provider formatting never grants authority. Returns owned data. */
export function validateProposalDecision(value:unknown,text:string):ReturnType<typeof output>|ProposalAbstention {
 str(text,16384);
 try {
  const decision=bounded(value);
  return decision && typeof decision==='object' && (decision as {kind?:unknown}).kind==='abstain'
   ? abstention(decision) : output(decision,text);
 } catch { throw Error('Planner output rejected'); }
}
function bounded<T>(v:T):T{const s=JSON.stringify(v);if(Buffer.byteLength(s)>MAX)fail();return JSON.parse(s);}
function validateMission(value:unknown):Mission{
 const m=object(value);
 if(m.format===2){keys(m,['format','binding','brief','target','abstention']);str(m.binding,1024,1);str(m.brief,8000,1);target(m.target);abstention(m.abstention);return bounded(m) as AbstainedMission;}
 keys(m,m.created===undefined?['format','binding','brief','target','request']:['format','binding','brief','target','request','created']);
 if(m.format!==1)fail();str(m.binding,1024,1);str(m.brief,8000,1);target(m.target);
 const r=keys(m.request,['requestId','base','change','explanation','assumptions','questions','checks','briefDigest']);
 if(typeof r.requestId!=='string'||!/^[-a-f0-9]{36}$/.test(r.requestId)||r.briefDigest!==hash(m.brief)||JSON.stringify(r.base)!==JSON.stringify(m.target.base))fail();
 const c=keys(r.change,['kind','path','blockId','start','end','replacement']);if(c.kind!=='replace_text'||JSON.stringify(c.path)!==JSON.stringify(m.target.target.path)||c.blockId!==m.target.target.blockId)fail();
 output({start:c.start,end:c.end,replacement:c.replacement,explanation:r.explanation,assumptions:r.assumptions,questions:r.questions,checks:r.checks},m.target.target.text);
 if(m.created!==undefined){keys(m.created,['id','requestId']);if(!/^[a-f0-9]{64}$/.test(m.created.id)||m.created.requestId!==r.requestId)fail();}
 return bounded(m) as Mission;
}
async function read(file:string):Promise<Mission|null>{
 let f;try{f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw Error('Mission file unavailable');}
 try{const s=await f.stat();if(!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o600||s.uid!==process.getuid!()||s.size>MAX)fail();const data=Buffer.alloc(MAX+1);let n=0;while(n<data.length){const r=await f.read(data,n,data.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}if(n>MAX)fail();return validateMission(JSON.parse(data.subarray(0,n).toString()));}catch{throw Error('Invalid private mission file');}finally{await f.close();}
}
async function write(file:string,value:Mission){
 const temp=`${file}.${randomUUID()}.tmp`;const f=await open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
 try{await f.writeFile(JSON.stringify(bounded(value)));await f.sync();}finally{await f.close();}
 try{await rename(temp,file);const d=await open(dirname(file),constants.O_RDONLY);try{await d.sync();}finally{await d.close();}}finally{await unlink(temp).catch(()=>{});}
}
/** Opt-in creator path. The injected planner receives data only, never credentials/client methods. */
export async function runProposalMission(options:ProposalMissionOptions,planner:ProposalPlanner,client:CreatorOnlyClient):Promise<{status:'created';id:string;requestId:string}|{status:'unknown';requestId:string}|{status:'abstained';reason:ProposalAbstention['reason'];explanation:string;questions:string[]}>{
 str(options.brief,8000,1);path(options.path);str(client.binding,1024,1);
 if(!process.getuid)throw Error('Private missions require ownership checks');
 const file=resolve(options.missionPath),dir=await lstat(dirname(file));
 if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid()||(dir.mode&0o777)!==0o700)throw Error('Mission directory must be private and owned (0700)');
 let lock;try{lock=await open(`${file}.lock`,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);}catch{throw Error('Mission locked; inspect any previous attempt before recovery');}
 try{
  let mission=await read(file);
  if(mission){if(mission.binding!==client.binding||mission.brief!==options.brief||JSON.stringify(mission.target.target.path)!==JSON.stringify(options.path))fail();}
  else{
   let captured:CreatorTarget,planned:unknown;
   try{captured=bounded(await client.readTarget([...options.path]));target(captured);if(JSON.stringify(captured.target.path)!==JSON.stringify(options.path))fail();planned=await planner(bounded({brief:options.brief,target:captured}));}catch{throw Error('Authorized target read or planning failed');}
   if(planned && typeof planned==='object' && (planned as {kind?:unknown}).kind==='abstain'){
    let a:ProposalAbstention;try{a=abstention(bounded(planned));}catch{throw Error('Planner output rejected');}
    mission={format:2,binding:client.binding,brief:options.brief,target:captured,abstention:a};
    validateMission(mission);await write(file,mission);
    return {status:'abstained',reason:a.reason,explanation:a.explanation,questions:[...a.questions]};
   }
   let p:ReturnType<typeof output>;try{p=output(bounded(planned),captured.target.text);}catch{throw Error('Planner output rejected');}
   mission={format:1,binding:client.binding,brief:options.brief,target:captured,request:{requestId:randomUUID(),base:captured.base,change:{kind:'replace_text',path:captured.target.path,blockId:captured.target.blockId,start:p.start,end:p.end,replacement:p.replacement},explanation:p.explanation,assumptions:p.assumptions,questions:p.questions,checks:p.checks,briefDigest:hash(options.brief)}};
   validateMission(mission);await write(file,mission); // durable intent BEFORE any network create
  }
  if(mission.format===2){const a=mission.abstention;return {status:'abstained',reason:a.reason,explanation:a.explanation,questions:[...a.questions]};}
  if(mission.created)return {status:'created',...mission.created};
  let result;try{result=await client.create(bounded(mission.request));keys(result,['id','requestId']);if(!/^[a-f0-9]{64}$/.test(result.id)||result.requestId!==mission.request.requestId)fail();}catch{return {status:'unknown',requestId:mission.request.requestId};}
  mission.created=result;await write(file,mission);return {status:'created',...result};
 }finally{await lock.close();await unlink(`${file}.lock`);}
}
