import {collectFingerprints, runtimeProvenance} from '../rust-shadow-harness/fingerprints.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Doc, isAlive} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {keyOf} from '../../packages/doc-sync/dist/crdt/ticket.js';
import * as cmd from '../../packages/doc-sync/dist/crdt/commands.js';
import {MemoryNet} from '../../packages/doc-sync/test/harness.ts';
import type {Op} from '../../packages/doc-sync/dist/crdt/doc.js';
import type {RecordOptions} from '../../packages/doc-sync/dist/crdt/history.js';
import type {Schema} from '../../packages/doc-sync/dist/crdt/schema.js';

const SCHEMA = 'flow-root-paragraph:boolean-marks:bold,italic:v1';
const schema: Schema = {root:'content',marks:['bold','italic'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const units = (text:string) => Array.from({length:text.length},(_,i)=>text.charCodeAt(i));
const wire = (ops:Op[]) => ops.map(op => op.t==='text' ? (({text,...rest})=>({...rest,units:units(text)}))(op) : structuredClone(op));
// This is the full state contract of the bounded flat native Doc interpreter.
const state = (doc:Doc) => ({clock:doc.clock.lamport,items:doc.items.map(item=>({id:item.id,origin:item.origin,kind:item.kind,unit:item.kind==='char'?item.ch.charCodeAt(0):null,visible:isAlive(item),dels:[...item.dels].sort(),cancels:[...item.cancels].sort(),attrs:Object.fromEntries([...item.attrs].sort(([a],[b])=>a<b?-1:a>b?1:0))})),model:{...doc.toJSON(),children:doc.toJSON().children!.map(child=>({...child,runs:child.runs!.map(run=>{assert.ok('text' in run);return {units:units(run.text),marks:run.marks};})}))},counts:{tokens:doc.items.length-1,visible:doc.items.slice(1).filter(isAlive).length,tombstones:doc.items.slice(1).filter(i=>!isAlive(i)).length}});
const binary=resolve(process.env.RUST_SHADOW_BINARY ?? 'experiments/rust-shadow/target/debug/doc-sync-rust-shadow');
const provenance=runtimeProvenance(Doc,History);
const hashes=()=>collectFingerprints(binary);
const records:any[]=[];
let processNumber=0, now=1_000_000;
const originalNow=Date.now;
Date.now=()=>now;
class Native {
  child:ReturnType<typeof spawn>; queue:Array<{resolve:(x:any)=>void;reject:(e:Error)=>void}>=[]; stderr=''; process=++processNumber;
  constructor(){this.child=spawn(binary,[],{stdio:['pipe','pipe','pipe']});createInterface({input:this.child.stdout!}).on('line',line=>{const pending=this.queue.shift();if(!pending)throw Error('unsolicited native response');try{pending.resolve(JSON.parse(line));}catch(error){pending.reject(error as Error);}});this.child.stderr!.on('data',chunk=>this.stderr+=chunk);this.child.on('exit',code=>{for(const p of this.queue.splice(0))p.reject(Error(`native exit ${code}: ${this.stderr}`));});}
  async raw(request:any){const input={schema:SCHEMA,...request};const response=await new Promise<any>((resolve,reject)=>{this.queue.push({resolve,reject});this.child.stdin!.write(JSON.stringify(input)+'\n');});records.push({process:this.process,request:input,response});return response;}
  async call(request:any){const response=await this.raw(request);assert.equal(response.ok,true,JSON.stringify(response));return response;}
  async close(){if(this.child.exitCode!==null)return;const exited=new Promise<void>(resolve=>this.child.once('exit',()=>resolve()));this.child.stdin!.end();await exited;}
}
let native:Native;
type Pair={name:string;doc:Doc;history:History};
const pos=(o:number)=>({b:0,o});
const standard={caretBefore:'before',caretAfter:'after'};
let comparisons=0, inverseComparisons=0, historyComparisons=0,pinComparisons=0,rejections=0;
const recoveryCases:any[]=[];
async function check(p:Pair,label:string,response?:any){
 const actual=response?.state ?? (await native.call({cmd:'state',replica:p.name})).state;
 assert.deepEqual(actual,state(p.doc),`${label}: full bounded Doc state`);comparisons++;
 const hs=response?.history ? response : await native.call({cmd:'history_state',replica:p.name});
 assert.deepEqual(hs.history,p.history.snapshot(),`${label}: exact shared History graph`);historyComparisons++;
 assert.equal(hs.status.canUndo,p.history.canUndo,`${label}: canUndo`);assert.equal(hs.status.canRedo,p.history.canRedo,`${label}: canRedo`);
 const snapshot=p.history.snapshot();const pins=[...snapshot.undo,...snapshot.redo].flatMap((g:any)=>g.steps.filter((s:any)=>s.type==='existence'&&s.delAt).map((s:any)=>keyOf(s.delAt)));assert.deepEqual(hs.status.pins,pins,label+': exact deletion pin tickets');pinComparisons++;
 records.push({label,replica:p.name,expectedStateSha256:createHash('sha256').update(JSON.stringify(state(p.doc))).digest('hex'),expectedHistorySha256:createHash('sha256').update(JSON.stringify(p.history.snapshot())).digest('hex')});
}
async function fresh(name:string){const p={name,doc:new Doc(name,schema),history:new History()};await native.call({cmd:'new',replica:name,actor:name});await check(p,'empty');return p;}
async function apply(p:Pair,ops:Op[],label:string){for(const op of ops)p.doc.apply(op);await check(p,label,await native.call({cmd:'apply',replica:p.name,ops:wire(ops)}));}
async function local(p:Pair,make:()=>Op[],label:string,options:RecordOptions=standard){now+=10;const ops=make();p.history.record(ops,p.doc,options);const result=await native.call({cmd:'history_record',replica:p.name,ops:wire(ops),options,now});await check(p,label,result);return ops;}
async function inverse(p:Pair,action:'undo'|'redo',label:string){const expected=p.history[action](p.doc);const result=await native.call({cmd:'history_'+action,replica:p.name});assert.deepEqual(result.ops,wire(expected.ops),label+': independently generated inverse ops');assert.equal(result.caret,expected.caret,label+': caret');inverseComparisons++;await check(p,label,result);return expected.ops;}
async function cycle(p:Pair,count:number,label:string){for(let i=0;i<count;i++){await inverse(p,'undo',`${label} undo ${i}`);await inverse(p,'redo',`${label} redo ${i}`);}}
async function seed(p:Pair,text='abcd'){const ops=cmd.insertText(p.doc,pos(0),text);await native.call({cmd:'apply',replica:p.name,ops:wire(ops)});await check(p,'unrecorded seed');return ops;}

async function ownership(){
 const a=await fresh('ownerA'),b=await fresh('ownerB');const birth=await seed(a,'한😀abcd');await apply(b,birth,'common seed');
 const inserted=await local(a,()=>cmd.insertText(a.doc,pos(1),'LOCAL'),'local insertion');
 const other=await local(b,()=>cmd.insertText(b.doc,pos(1),'FOREIGN'),'foreign insertion');await apply(a,other,'foreign insertion delivered');await apply(b,inserted,'local insertion delivered');
 const undone=await inverse(a,'undo','undo retains foreign insertion');assert.ok(JSON.stringify(a.doc.toJSON()).includes('FOREIGN'));assert.ok(!JSON.stringify(a.doc.toJSON()).includes('LOCAL'));await apply(b,undone,'native-comparable inverse delivered');
 await cycle(a,3,'repeat insertion');
 const d=await fresh('deleteA'),e=await fresh('deleteB');const shared=await seed(d);await apply(e,shared,'delete shared seed');
 const mine=await local(d,()=>cmd.deleteRange(d.doc,pos(1),pos(3)),'own overlapping delete');const theirs=await local(e,()=>cmd.deleteRange(e.doc,pos(2),pos(4)),'foreign overlapping delete');await apply(d,theirs,'concurrent delete delivered');await apply(e,mine,'own delete delivered');await inverse(d,'undo','cancel only own delete');assert.equal(d.doc.toJSON().children![0].runs!.map((r:any)=>r.text).join(''),'ab');await cycle(d,3,'overlap cancellation');
 const f=await fresh('formatA');await seed(f);
 await local(f,()=>cmd.setMark(f.doc,pos(0),pos(4),'bold',true),'local whole-range bold');
 const foreign=Doc.fromSnapshot('formatB',f.doc.snapshot(),schema);const edit=cmd.setMark(foreign,pos(1),pos(3),'bold',false);await apply(f,edit,'partial foreign overwrite');
 const op=await inverse(f,'undo','partial inverse excludes foreign targets');assert.equal(op.flatMap((x:any)=>x.ids).length,2);for(let i=2;i<=3;i++)assert.equal(f.doc.items[i].attrs.get('bold')!.value,false);await cycle(f,3,'foreign format ownership');
 // Actor identity alone cannot acquire ownership: an unrecorded write must block undo.
 const g=await fresh('sameActor');await seed(g,'x');await local(g,()=>cmd.setMark(g.doc,pos(0),pos(1),'bold',true),'recorded same actor');const unrecorded=cmd.setMark(g.doc,pos(0),pos(1),'bold',false);await native.call({cmd:'apply',replica:g.name,ops:wire(unrecorded)});await check(g,'same actor unrecorded overwrite');assert.deepEqual(await inverse(g,'undo','same actor ownership guard'),[]);
}

async function sharedAndGrouping(){
 const mixed=await fresh('mixedPrior');await seed(mixed);
 await local(mixed,()=>cmd.setMark(mixed.doc,pos(0),pos(1),'bold',true),'mixed prior true');
 await local(mixed,()=>cmd.setMark(mixed.doc,pos(1),pos(2),'bold',false),'mixed prior false');
 await local(mixed,()=>cmd.setMark(mixed.doc,pos(0),pos(4),'bold',true),'mixed prior one range');
 assert.equal((await inverse(mixed,'undo','inverse groups different prior values')).length,3);await cycle(mixed,2,'mixed prior groups');
 const batch=await fresh('batch');await seed(batch);
 await local(batch,()=>[...cmd.setMark(batch.doc,pos(0),pos(3),'bold',true),...cmd.setMark(batch.doc,pos(0),pos(3),'bold',false)],'two same-key sets in one history record');
 const batchUndo=await inverse(batch,'undo','same-record reverse prior capture');assert.ok(batchUndo.length>0);await cycle(batch,3,'same-record repeated chain');
 const p=await fresh('chain');await seed(p);
 for(const value of [true,false,true,false])await local(p,()=>cmd.setMark(p.doc,pos(0),pos(3),'bold',value),'sequential shared state');
 for(let round=0;round<3;round++){for(let i=0;i<4;i++)await inverse(p,'undo','undo full shared chain');for(let i=0;i<4;i++)await inverse(p,'redo','redo full shared chain');}
 await inverse(p,'undo','branch undo');await local(p,()=>cmd.setMark(p.doc,pos(1),pos(4),'italic',true),'new branch releases redo graph');assert.equal(p.history.canRedo,false);
 await local(p,()=>cmd.deleteRange(p.doc,pos(1),pos(2)),'delete before format');await local(p,()=>cmd.setMark(p.doc,pos(0),pos(2),'bold',true),'format after delete');await inverse(p,'undo','undo format after delete');await inverse(p,'undo','undo delete after format');
 const t=await fresh('typing');
 await local(t,()=>cmd.insertText(t.doc,pos(0),'a'),'typing a',{caretBefore:'0',caretAfter:'1',typing:true});
 await local(t,()=>cmd.insertText(t.doc,pos(1),'b'),'typing contiguous',{caretBefore:'1',caretAfter:'2',typing:true});assert.equal(t.history.snapshot().undo.length,1);
 now+=1490;await local(t,()=>cmd.insertText(t.doc,pos(2),'c'),'typing exact 1500 boundary',{caretBefore:'2',caretAfter:'3',typing:true});assert.equal(t.history.snapshot().undo.length,2);
 await local(t,()=>cmd.insertText(t.doc,pos(3),'d'),'caret discontinuity',{caretBefore:'different',caretAfter:'4',typing:true});assert.equal(t.history.snapshot().undo.length,3);
 await local(t,()=>cmd.insertText(t.doc,pos(4),'e'),'explicit non-typing boundary');await local(t,()=>cmd.insertText(t.doc,pos(5),'f'),'typing after boundary',{caretBefore:'after',caretAfter:'6',typing:true});assert.equal(t.history.snapshot().undo.length,5);
 await inverse(t,'undo','prepare redo');await local(t,()=>[],'empty record retains redo');assert.equal(t.history.canRedo,true);
 await inverse(t,'redo','redo after empty record');
 t.history.clear();await check(t,'clear flushes history',await native.call({cmd:'history_clear',replica:t.name}));assert.deepEqual(await inverse(t,'undo','empty undo after clear'),[]);assert.deepEqual(await inverse(t,'redo','empty redo after clear'),[]);
 const depth=await fresh('depth');await seed(depth,'x');for(let i=0;i<105;i++)await local(depth,()=>cmd.setMark(depth.doc,pos(0),pos(1),'bold',!!(i%2)),'depth eviction '+i);assert.equal(depth.history.snapshot().undo.length,100);for(let i=0;i<101;i++)await inverse(depth,'undo','depth undo '+i);
}

async function randomized(seedValue:number){let rng=seedValue>>>0;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;const peers=[await fresh('randomA'+seedValue),await fresh('randomB'+seedValue)];
 for(let step=0;step<70;step++){const index=next()%2,p=peers[index],q=peers[1-index];const length=p.doc.items.slice(1).filter(isAlive).length;const action=next()%6;let ops:Op[];
 if(!length||action===0){ops=await local(p,()=>cmd.insertText(p.doc,pos(next()%(length+1)),['a','한','😀'][next()%3]),'random insert');}
 else if(action===1){const from=next()%length;ops=await local(p,()=>cmd.deleteRange(p.doc,pos(from),pos(Math.min(length,from+1+next()%2))),'random delete');}
 else if(action<4){const from=next()%length;ops=await local(p,()=>cmd.setMark(p.doc,pos(from),pos(Math.min(length,from+1+next()%3)),action===2?'bold':'italic',!!(next()%2)),'random mark');}
 else ops=await inverse(p,action===4?'undo':'redo','random inverse');
 await apply(q,ops,'random causal delivery');if(step%7===0)await apply(q,ops,'exact duplicate delivery');assert.deepEqual(state(p.doc),state(q.doc),'two TS replicas converge');
 }
}

async function restartPending(){
 const net=new MemoryNet({clientSchema:schema});const a=net.add('pendingA'),b=net.add('pendingB');a.connect();b.connect();await net.settle();
 try{const p=await fresh(a.actor);const base=cmd.insertText(a.doc,pos(0),'base');a.commit(base,null);await net.settle();await apply(p,base,'real SyncClient base');
 const before=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;const tsBefore={doc:p.doc.snapshot(),history:p.history.snapshot()};
 now+=10;const recordedAt=now;const pendingOps=cmd.insertText(a.doc,pos(2),'😀LOCAL');a.commit(pendingOps);assert.equal(a.pending.length,1);const saved=structuredClone(a.pending[0]);
 for(const op of pendingOps)p.doc.apply(op);p.history.record(pendingOps,p.doc,{caretBefore:'',caretAfter:''});await check(p,'real pending recorded',await native.call({cmd:'history_record',replica:p.name,ops:wire(saved.ops),options:{caretBefore:'',caretAfter:''},now}));assert.deepEqual(p.history.snapshot(),a.history.snapshot());
 const after=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;const tsAfter={doc:p.doc.snapshot(),history:p.history.snapshot()};
 const foreign=cmd.insertText(b.doc,pos(1),'FOREIGN');b.commit(foreign);await net.settle();assert.equal(a.pending.length,0);assert.deepEqual(a.doc.toJSON(),net.hub.doc.toJSON());
 for(const [mode,checkpoint,ts] of [['before',before,tsBefore],['after',after,tsAfter]] as const){
  records.push({label:'restart checkpoint '+mode,checkpoint,savedPending:saved,tsDocument:ts.doc,tsHistory:ts.history});await native.close();native=new Native();
  const restored:Pair={name:'restored-'+mode,doc:Doc.fromSnapshot(a.actor,ts.doc,schema),history:History.fromSnapshot(JSON.parse(JSON.stringify(ts.history)))};
  await check(restored,'fresh process restore '+mode,await native.call({cmd:'history_restore',replica:restored.name,checkpoint}));
  // Independently exported native history must also be valid for production TS restoration.
  assert.deepEqual(History.fromSnapshot(checkpoint.history).snapshot(),ts.history);
  await apply(restored,foreign,'foreign accepted before saved pending replay '+mode);
  if(mode==='before'){for(const op of saved.ops)restored.doc.apply(op);restored.history.record(saved.ops,restored.doc,{caretBefore:'',caretAfter:''});await check(restored,'missing pending restored with original history',await native.call({cmd:'history_record',replica:restored.name,ops:wire(saved.ops),options:{caretBefore:'',caretAfter:''},now:recordedAt}));}
  else await apply(restored,saved.ops,'already present pending exact replay');
  await apply(restored,saved.ops,'second exact pending replay');assert.deepEqual(state(restored.doc),state(a.doc));
  await inverse(restored,'undo','restored history undo '+mode);assert.ok(JSON.stringify(restored.doc.toJSON()).includes('FOREIGN'));assert.ok(!JSON.stringify(restored.doc.toJSON()).includes('LOCAL'));await cycle(restored,3,'restored pending history '+mode);
  // Save a partly undone history, restart again, then branch with a new format.
  const partial=(await native.call({cmd:'history_export',replica:restored.name})).checkpoint;const savedTs={doc:restored.doc.snapshot(),history:restored.history.snapshot()};await native.close();native=new Native();restored.doc=Doc.fromSnapshot(a.actor,savedTs.doc,schema);restored.history=History.fromSnapshot(savedTs.history);await check(restored,'partly undone fresh process restore',await native.call({cmd:'history_restore',replica:restored.name,checkpoint:partial}));await local(restored,()=>cmd.setMark(restored.doc,pos(0),pos(1),'italic',true),'new record after partly undone restart');assert.equal(restored.history.canRedo,false);await cycle(restored,2,'new restored format branch');
 }
 }finally{a.disconnect();b.disconnect();}
}

async function duplicateReorder(){const p=await fresh('replay');const birth=await seed(p,'abcd');const a=await local(p,()=>cmd.setMark(p.doc,pos(0),pos(2),'bold',true),'replay mark');const b=await local(p,()=>cmd.deleteRange(p.doc,pos(1),pos(3)),'replay delete');const c=await inverse(p,'undo','replay undo delete');for(const op of [...birth,...a,...b,...c].reverse())await apply(p,[op],'causally valid reverse duplicate replay');await cycle(p,3,'history unaffected by duplicate reorder');}

async function invalidAndPins(){const p=await fresh('invalidHistory');await seed(p);await local(p,()=>cmd.deleteRange(p.doc,pos(1),pos(2)),'pin own delete');await local(p,()=>cmd.deleteRange(p.doc,pos(1),pos(2)),'pin second delete');
 const keys=[...p.history.snapshot().undo].flatMap((g:any)=>g.steps.filter((s:any)=>s.delAt).map((s:any)=>keyOf(s.delAt)));
 for(const sequences of [{},{[keys[0]]:19},{[keys[0]]:19,[keys[1]]:7}]){const result=await native.call({cmd:'history_pin',replica:p.name,sequences});assert.equal(result.pin,p.history.pin(key=>(sequences as Record<string,number>)[key]));pinComparisons++;}
 const checkpoint=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;
 const invalid=structuredClone(checkpoint);invalid.history.version=99;
 const fork=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),schema);const duplicateLocal=cmd.setMark(fork,pos(0),pos(1),'bold',true)[0];
 for(const request of [
  {cmd:'history_restore',replica:p.name,checkpoint:invalid},
  {cmd:'history_record',replica:p.name,ops:[{t:'set',at:{lamport:500,actor:p.doc.actor},ids:[p.doc.items[1].id],key:'bold',value:true},{t:'move'}],options:standard,now},
  {cmd:'history_record',replica:p.name,ops:[],options:{caretBefore:42,caretAfter:''},now},
  {cmd:'history_record',replica:p.name,ops:wire([duplicateLocal,duplicateLocal]),options:standard,now},
 ]){const result=await native.raw(request);assert.equal(result.ok,false,'invalid history request rejected');rejections++;await check(p,'rejection preserves document/history');}
}

async function recoveryMatrix(){for(const kind of ['delete','format','undo','redo'] as const){
 const net=new MemoryNet({clientSchema:schema});const a=net.add('matrix'+kind+'A'),b=net.add('matrix'+kind+'B');a.connect();b.connect();await net.settle();
 try{const p=await fresh(a.actor);const birth=cmd.insertText(a.doc,pos(0),'abcdef');a.commit(birth,null);await net.settle();await apply(p,birth,kind+' matrix common base');
 const edit=async(mark:boolean,label:string)=>await local(p,()=>{const ours=mark?cmd.setMark(p.doc,pos(0),pos(4),'bold',true):cmd.deleteRange(p.doc,pos(1),pos(3));const actual=mark?cmd.setMark(a.doc,pos(0),pos(4),'bold',true):cmd.deleteRange(a.doc,pos(1),pos(3));assert.deepEqual(wire(ours),wire(actual),'same real local builder operations');a.commit(actual,standard);return ours;},label);
 if(kind==='undo'||kind==='redo'){await edit(false,kind+' accepted original delete');await net.settle();}
 if(kind==='redo'){a.undo();const ops=await inverse(p,'undo','redo matrix accepted undo');assert.deepEqual(wire(a.pending.at(-1)!.ops),wire(ops),'real client undo equals independently generated Rust ops');await net.settle();}
 if(kind==='delete'||kind==='format')await edit(kind==='format',kind+' matrix pending local edit');
 else{a[kind]();const ops=await inverse(p,kind,kind+' matrix pending inverse');assert.deepEqual(wire(a.pending.at(-1)!.ops),wire(ops),'real pending inverse equals native-generated operation array');}
 assert.equal(a.pending.length,1,'actual local pending retained before network acknowledgment');const pending=structuredClone(a.pending[0]);assert.deepEqual(state(p.doc),state(a.doc));assert.deepEqual(p.history.snapshot(),a.history.snapshot());
 const checkpoint=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;const ts={document:p.doc.snapshot(),history:p.history.snapshot()};records.push({label:kind+' matrix original pending checkpoint',checkpoint,pending});
 // Generate a real other-user edit before this pending operation is acknowledged.
 const foreign=kind==='format'?cmd.setMark(b.doc,pos(1),pos(3),'bold',false):cmd.deleteRange(b.doc,pos(2),pos(4));b.commit(foreign);await net.settle();assert.equal(a.pending.length,0);assert.deepEqual(a.doc.toJSON(),net.hub.doc.toJSON());
 await native.close();native=new Native();p.doc=Doc.fromSnapshot(a.actor,ts.document,schema);p.history=History.fromSnapshot(ts.history);await check(p,kind+' matrix process restart',await native.call({cmd:'history_restore',replica:p.name,checkpoint}));
 await apply(p,foreign,kind+' matrix foreign edit after restore');const retained=p.history.snapshot();await apply(p,pending.ops,kind+' matrix exact pending replay');await apply(p,pending.ops,kind+' matrix exact pending duplicate');assert.deepEqual(p.history.snapshot(),retained,'replay cannot record history twice');assert.deepEqual(state(p.doc),state(a.doc));
 const foreignIds=foreign.flatMap(op=>op.t==='del'||op.t==='set'?op.ids:[]);
 const preserve=()=>{for(const id of foreignIds){const item=p.doc.items.find(item=>item.id.actor===id.actor&&item.id.lamport===id.lamport)!;if(kind==='format'){const expected=foreign.find(op=>op.t==='set') as Extract<Op,{t:'set'}>;assert.deepEqual(item.attrs.get('bold')!.at,expected.at,'foreign latest format ticket preserved');assert.equal(item.attrs.get('bold')!.value,false);}else assert.equal(isAlive(item),false,'foreign deletion remains effective');}};
 preserve();for(const action of ['undo','redo','undo','redo'] as const){await inverse(p,action,kind+' matrix later '+action);preserve();}
 const sequenceMap=Object.fromEntries(foreign.filter(op=>op.t==='del').map(op=>[keyOf(op.at),11]));for(const group of [...p.history.snapshot().undo,...p.history.snapshot().redo] as any[])for(const step of group.steps)if(step.delAt)sequenceMap[keyOf(step.delAt)]=23;
 assert.equal((await native.call({cmd:'history_pin',replica:p.name,sequences:sequenceMap})).pin,p.history.pin(key=>sequenceMap[key]));pinComparisons++;
 recoveryCases.push({kind,checkpointBoundary:'after original pending generated; acknowledged-or-lost-response ambiguity',pending:wire(pending.ops),foreign:wire(foreign),restart:'fresh process',replay:'exact original ops applied twice, no new history record',laterActions:['undo','redo','undo','redo'],foreignPreserved:true,pins:'PASS'});
 }finally{a.disconnect();b.disconnect();}
}}

let before:any;
try{assert.deepEqual(JSON.parse(readFileSync('experiments/rust-shadow/schema.json','utf8')),schema);before=hashes();native=new Native();await ownership();await sharedAndGrouping();for(const s of [1,42,20261101,0xdecafbad])await randomized(s);await duplicateReorder();await invalidAndPins();await restartPending();await recoveryMatrix();const after=hashes();assert.deepEqual(after,before,'source and binary hashes unchanged during run');writeFileSync(process.env.RUST_HISTORY_RECEIPT ? resolve(process.env.RUST_HISTORY_RECEIPT) : new URL('./receipt.json',import.meta.url),JSON.stringify({status:'PASS',timestamp:new Date().toISOString(),node:process.version,binary,processes:processNumber,stateComparisons:comparisons,historyGraphComparisons:historyComparisons,inverseOpComparisons:inverseComparisons,caretComparisons:inverseComparisons,flagComparisons:historyComparisons*2,pinComparisons,rejections,restartCount:processNumber-1,recoveryCases,seeds:[1,42,20261101,0xdecafbad],runtimeProvenance:provenance,hashesBefore:before,hashesAfter:after,proof:{reference:'actual production TypeScript Doc, History, SyncClient and DocHub',native:'independent Rust History generates inverse ops from locally captured priors',inputs:'wire ops, options, deterministic time, native-owned exported checkpoint only; no expected TS states sent to child',states:'full declared flat Doc state and exact HistorySnapshot shared graph',flush:'History.clear; production History has no separate flush API',pending:'actual SyncClient.pending original ops; native export before/after pending, fresh processes, foreign insertion, replay and duplicate replay, independent undo/redo',reorder:'reverse duplicate operations after causal dependencies exist; fresh causally reordered multi-actor delivery NOT_RUN',selectionAnchors:'NOT_RUN',serverRecovery:'NOT_RUN',protectedGC:'NOT_RUN',nodesMovesSchemas:'NOT_RUN',wasm:'NOT_RUN',browser:'NOT_RUN',productionSwitch:'NOT_RUN',pendingInverseBeforeCheckpoint:'NOT_SUPPORTED_BY_THIS_SLICE: inverse History transition must be saved after generation; do not regenerate tickets for exact retry',rejectionBoundary:'Native rejects unsupported history requests atomically; generic rejection parity with raw TS History is NOT_ESTABLISHED. Clock exhaustion and repeated identical JS object references within one local batch are excluded; remote exact wire duplicate application is tested.'},records})+'\n');console.log(JSON.stringify({status:'PASS',stateComparisons:comparisons,historyGraphComparisons:historyComparisons,inverseOpComparisons:inverseComparisons,processes:processNumber}));}
catch(error){writeFileSync(new URL('./failure.json',import.meta.url),JSON.stringify({status:'FAIL',error:String(error),stack:(error as Error).stack,hashesBefore:before,records})+'\n');throw error;}
finally{Date.now=originalNow;await native?.close();}
