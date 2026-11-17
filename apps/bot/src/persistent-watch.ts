import {constants} from 'node:fs';
import {open,lstat,rename,unlink,realpath} from 'node:fs/promises';
import {dirname,basename,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openWriterLock} from '../../mcp/src/kernel-lock.ts';
import type {WatchState,WatchRead,WatchReview} from './watch.ts';
type Snapshot={generation:string;epoch:string;schemaVersion:string;serverSeq:number};
type State={version:1;binding:string;maxRuns:number;used:number;phase:'ready'|'in_flight'|'blocked'|'stopped';baseline:Snapshot|null;attempt?:{from:number;captured:Snapshot}};
export type PersistentWatchOptions={file:string;binding:string;maxRuns:number};
const MAX=16384;
function snapshot(value:WatchState):Snapshot{
 const s={generation:value.generation,epoch:value.epoch,schemaVersion:value.schemaVersion,serverSeq:value.serverSeq};
 if(![s.generation,s.epoch,s.schemaVersion].every(v=>typeof v==='string'&&v.length>0&&v.length<=512)||!Number.isSafeInteger(s.serverSeq)||s.serverSeq<0)throw Error('Watch state unavailable');
 return s as Snapshot;
}
function compatible(current:Snapshot,previous:Snapshot){if(current.generation!==previous.generation||current.epoch!==previous.epoch||current.schemaVersion!==previous.schemaVersion||current.serverSeq<previous.serverSeq)throw Error('Watch identity or sequence changed; inspection required');}
function exact(value:unknown,keys:string[]):asserts value is Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(','))throw Error('Invalid watch checkpoint');}
function parse(value:unknown,options:PersistentWatchOptions):State{
 exact(value,['version','binding','maxRuns','used','phase','baseline',...(Object.hasOwn(value as object,'attempt')?['attempt']:[])]);
 if(value.version!==1||value.binding!==options.binding||value.maxRuns!==options.maxRuns||!Number.isSafeInteger(value.used)||value.used<0||value.used>value.maxRuns||!['ready','in_flight','blocked','stopped'].includes(value.phase))throw Error('Watch checkpoint identity or state differs');
 if(value.baseline!==null){exact(value.baseline,['generation','epoch','schemaVersion','serverSeq']);snapshot(value.baseline as WatchState);}
 if(value.attempt!==undefined){exact(value.attempt,['from','captured']);exact(value.attempt.captured,['generation','epoch','schemaVersion','serverSeq']);const captured=snapshot(value.attempt.captured as WatchState);if(!value.baseline||value.used<1||value.attempt.from!==value.baseline.serverSeq||captured.serverSeq<=value.attempt.from)throw Error('Invalid watch attempt');compatible(captured,value.baseline);}
 if((value.phase==='in_flight'&&!value.attempt)||(value.phase==='ready'&&value.attempt)||(!value.baseline&&value.used!==0))throw Error('Invalid watch checkpoint phase');
 return value as State;
}
async function load(file:string,options:PersistentWatchOptions):Promise<State|null>{
 let f;try{f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
 try{const s=await f.stat();if(!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o600||s.uid!==process.getuid!()||s.size>MAX)throw Error('Watch checkpoint must be private owned bounded regular file');const bytes=Buffer.alloc(MAX+1);let size=0;while(size<bytes.length){const r=await f.read(bytes,size,bytes.length-size,null);if(!r.bytesRead)break;size+=r.bytesRead;}if(size>MAX)throw Error('Watch checkpoint exceeds limit');return parse(JSON.parse(bytes.subarray(0,size).toString()),options);}finally{await f.close();}
}
/** API only. Binding is a caller-supplied identity hash, not proof of model isolation.
 * Local supported kernel locks only; never repair or resume an unfinished review.
 */
export class PersistentReviewWatch{
 private readonly cancellation=new AbortController();
 private active:Promise<any>|null=null;private stopping=false;private closing=false;private closed=false;private failed=false;private stopWork:Promise<void>|null=null;private closeWork:Promise<void>|null=null;
 private file:string;private lock:Awaited<ReturnType<typeof open>>;private state:State;private read:WatchRead;private review:WatchReview;
 private constructor(file:string,lock:Awaited<ReturnType<typeof open>>,state:State,read:WatchRead,review:WatchReview){this.file=file;this.lock=lock;this.state=state;this.read=read;this.review=review;}
 static async open(options:PersistentWatchOptions,read:WatchRead,review:WatchReview):Promise<PersistentReviewWatch>{
  if(!process.getuid||!Number.isSafeInteger(options.maxRuns)||options.maxRuns<1||options.maxRuns>100||!/^[a-f0-9]{64}$/.test(options.binding))throw Error('Invalid persistent watch options');
  const requested=resolve(options.file),parent=dirname(requested),s=await lstat(parent);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o777)!==0o700||s.uid!==process.getuid())throw Error('Watch parent must be private owned directory (0700)');
  const file=join(await realpath(parent),basename(requested)),lock=await openWriterLock(file+'.lock');
  try{if((await lock.stat()).uid!==process.getuid())throw Error('Foreign watch lock');const saved=await load(file,options);if(saved&&saved.phase!=='ready')throw Error('Watch is stopped or unfinished; explicit inspection required');const state=saved??{version:1,binding:options.binding,maxRuns:options.maxRuns,used:0,phase:'ready',baseline:null};const watch=new PersistentReviewWatch(file,lock,state,read,review);if(!saved)await watch.persist(state);return watch;}catch(error){await lock.close();throw error;}
 }
 get done(){return this.closing||this.closed||this.stopping||this.failed||this.state.phase!=='ready'||this.state.used>=this.state.maxRuns;}
 private async persist(state:State){
  const bytes=JSON.stringify(state);if(Buffer.byteLength(bytes)>MAX)throw Error('Watch checkpoint exceeds limit');const temp=this.file+'.'+randomUUID()+'.tmp';const f=await open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);
  try{await f.writeFile(bytes);await f.sync();await f.close();await rename(temp,this.file);const d=await open(dirname(this.file),constants.O_RDONLY);try{await d.sync();}finally{await d.close();}this.state=state;}finally{await f.close().catch(()=>{});await unlink(temp).catch(()=>{});}
 }
 private async stopState(){await this.persist({...this.state,phase:'stopped'});}
 /** Stop is durable when awaited. Do not await it from inside this watch's own callback. */
 stop():Promise<void>{this.stopping=true;this.cancellation.abort();if(this.closed||this.closing)return Promise.reject(Error('Watch is closing'));if(!this.stopWork){this.stopWork=(async()=>{await this.active?.catch(()=>{});try{await this.stopState();}catch(e){this.failed=true;throw e;}})();}return this.stopWork;}
 poll():Promise<'baseline'|'unchanged'|'reviewed'|'stopped'>{
  if(this.closing||this.closed||this.failed||this.stopping||this.state.used>=this.state.maxRuns)return Promise.resolve('stopped');if(this.active)return Promise.reject(Error('Watch poll already active'));if(this.state.phase!=='ready')return Promise.reject(Error('Watch requires inspection'));
  const work=Promise.resolve().then(()=>this.run());this.active=work;void work.finally(()=>{if(this.active===work)this.active=null;}).catch(()=>{});return work;
 }
 private async run():Promise<'baseline'|'unchanged'|'reviewed'|'stopped'>{
  try{
   if(this.stopping){await this.stopState();return 'stopped';}
   const observed=await this.read(this.cancellation.signal);if(this.stopping){await this.stopState();return 'stopped';}const captured=snapshot(observed);
   if(!this.state.baseline){await this.persist({...this.state,baseline:captured});return this.stopping?'stopped':'baseline';}
   compatible(captured,this.state.baseline);if(captured.serverSeq===this.state.baseline.serverSeq)return 'unchanged';
   const attempt={from:this.state.baseline.serverSeq,captured};await this.persist({...this.state,used:this.state.used+1,phase:'in_flight',attempt});
   if(this.stopping){await this.stopState();return 'stopped';}
   const outcome=await this.review({from:attempt.from,to:captured.serverSeq},this.cancellation.signal);if(this.stopping){await this.stopState();return 'stopped';}if(outcome.status!=='completed')throw Error('Review requires inspection');
   const after=await this.read(this.cancellation.signal);if(this.stopping){await this.stopState();return 'stopped';}compatible(snapshot(after),captured);
   // Commit boundary: once this final persist starts, a later stop drains it rather than rolling it back.
   const {attempt:_,...state}=this.state;await this.persist({...state,phase:'ready',baseline:captured});return 'reviewed';
  }catch(error){this.failed=true;if(this.stopping){await this.stopState();return 'stopped';}await this.persist({...this.state,phase:'blocked'}).catch(()=>{});throw error;}
 }
 /** Drain callbacks/persistence before releasing lock. Do not await from own callback. */
 close():Promise<void>{if(!this.closeWork){this.closing=true;this.closeWork=(async()=>{await this.active?.catch(()=>{});await this.stopWork?.catch(()=>{});await this.lock.close();this.closed=true;})();}return this.closeWork;}
}
