import {collectFingerprints, runtimeProvenance} from '../rust-shadow-harness/fingerprints.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Doc, isAlive} from '../../packages/doc-sync-core/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync-core/dist/crdt/history.js';
import * as cmd from '../../packages/doc-sync-core/dist/crdt/commands.js';
import {MemoryNet} from '../../packages/doc-sync/test/harness.ts';
import type {Op} from '../../packages/doc-sync-core/dist/crdt/doc.js';
import type {Schema} from '../../packages/doc-sync-core/dist/crdt/schema.js';

export const SCHEMA = 'flow-root-paragraph:boolean-marks:bold,italic:v1';
export const schema: Schema = {root:'content',marks:['bold','italic'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const units = (text: string) => Array.from({length:text.length},(_,i)=>text.charCodeAt(i));
export const wire = (ops: Op[]) => ops.map(op => op.t === 'text' ? (({text,...rest})=>({...rest,units:units(text)}))(op) : structuredClone(op));
export const state = (doc: Doc) => ({clock:doc.clock.lamport,items:doc.items.map(item=>({id:item.id,origin:item.origin,kind:item.kind,unit:item.kind==='char'?item.ch.charCodeAt(0):null,visible:isAlive(item),dels:[...item.dels].sort(),cancels:[...item.cancels].sort(),attrs:Object.fromEntries([...item.attrs].sort(([a],[b])=>a<b?-1:a>b?1:0))})),model:{...doc.toJSON(),children:doc.toJSON().children!.map(child=>({...child,runs:child.runs!.map(run=>{assert.ok('text' in run);return {units:units(run.text),marks:run.marks};})}))},counts:{tokens:doc.items.length-1,visible:doc.items.slice(1).filter(isAlive).length,tombstones:doc.items.slice(1).filter(i=>!isAlive(i)).length}});

export class Native {
  binary: string; child: ReturnType<typeof spawn>; queue: Array<{resolve:(x:any)=>void,reject:(e:Error)=>void}>=[]; stderr='';
  constructor(binary:string){this.binary=binary;this.child=spawn(binary,[],{stdio:['pipe','pipe','pipe']});createInterface({input:this.child.stdout!}).on('line',line=>{const pending=this.queue.shift();if(!pending)throw new Error('unsolicited Rust response');try{pending.resolve(JSON.parse(line));}catch(e){pending.reject(e as Error);}});this.child.stderr!.on('data',chunk=>this.stderr+=chunk);this.child.on('exit',code=>{for(const q of this.queue.splice(0))q.reject(new Error(`native exit ${code}: ${this.stderr}`));});}
  async raw(request:any){return await new Promise<any>((resolve,reject)=>{this.queue.push({resolve,reject});this.child.stdin!.write(JSON.stringify(request)+'\n');});}
  async call(request:any){const response=await this.raw({schema:SCHEMA,...request});assert.equal(response.ok,true,JSON.stringify(response));return response;}
  async close(){this.child.stdin!.end();await new Promise<void>(resolve=>this.child.once('exit',()=>resolve()));}
}

const binary=resolve(process.env.RUST_SHADOW_BINARY ?? 'experiments/rust-shadow/target/debug/doc-sync-rust-shadow');
const checkpoints:any[]=[];
let native: Native;
assert.deepEqual(JSON.parse(readFileSync('experiments/rust-shadow/schema.json','utf8')),schema,'native manifest equals authoritative TS schema');
const provenance=runtimeProvenance(Doc,History);
const hashes=()=>collectFingerprints(binary);
const before=hashes();
async function check(label:string,replica:string,doc:Doc){const actual=(await native.call({cmd:'state',replica})).state;assert.deepEqual(actual,state(doc),`${label}: ${replica}`);checkpoints.push({label,replica,state:actual,tokens:actual.counts.tokens,modelSha256:createHash('sha256').update(JSON.stringify(actual.model)).digest('hex')});}
async function apply(replica:string,ops:Op[],doc:Doc,label:string){checkpoints.push({label:label+' input',replica,ops:wire(ops)});await native.call({cmd:'apply',replica,ops:wire(ops)});await check(label,replica,doc);}
async function fresh(replica:string,doc:Doc){await native.call({cmd:'new',replica,actor:doc.actor});await check('empty',replica,doc);}
const pos=(o:number)=>({b:0,o});
const record=(history:History,doc:Doc,ops:Op[])=>{history.record(ops,doc,{caretBefore:'',caretAfter:''});return ops;};

async function deterministic(){
 const a=new Doc('A',schema), b=new Doc('B',schema), ah=new History(),bh=new History(); await fresh('A',a);await fresh('B',b);
 const seed=cmd.insertText(a,pos(0),'한😀abc');await apply('A',seed,a,'UTF16 seed');seed.forEach(op=>b.apply(op));await apply('B',seed,b,'seed delivered');
 const ai=record(ah,a,cmd.insertText(a,pos(1),'A')), bi=record(bh,b,cmd.insertText(b,pos(1),'B'));
 await apply('A',ai,a,'concurrent insertion A');await apply('B',bi,b,'concurrent insertion B');
 bi.forEach(op=>a.apply(op));ai.forEach(op=>b.apply(op));await apply('A',bi,a,'concurrent delivery B');await apply('B',ai,b,'concurrent delivery A');assert.deepEqual(state(a),state(b));
 const ad=record(ah,a,cmd.deleteRange(a,pos(3),pos(5))),bd=record(bh,b,cmd.deleteRange(b,pos(4),pos(6)));
 await apply('A',ad,a,'overlap deletion A');await apply('B',bd,b,'overlap deletion B');
 bd.forEach(op=>a.apply(op));ad.forEach(op=>b.apply(op));await apply('A',bd,a,'overlap delivery B');await apply('B',ad,b,'overlap delivery A');
 let inverse=ah.undo(a).ops;await apply('A',inverse,a,'undo only own deletion');inverse.forEach(op=>b.apply(op));await apply('B',inverse,b,'inverse wire delivered');assert.equal(a.items.filter(i=>i.dels.size===2 && !isAlive(i)).length>0,true);
 const mark=record(ah,a,cmd.setMark(a,pos(0),pos(1),'bold',true));mark.forEach(op=>b.apply(op));await apply('A',mark,a,'bold');await apply('B',mark,b,'bold delivery');
 const foreign=record(bh,b,cmd.setMark(b,pos(0),pos(1),'bold',false));foreign.forEach(op=>a.apply(op));await apply('B',foreign,b,'foreign write');await apply('A',foreign,a,'foreign write delivery');
 inverse=ah.undo(a).ops;assert.deepEqual(inverse,[],'foreign latest write must prevent inverse');await apply('A',inverse,a,'protected foreign write');
 const italic=record(ah,a,cmd.setMark(a,pos(0),pos(1),'italic',true));await apply('A',italic,a,'italic');
 for(let i=0;i<4;i++){await apply('A',ah.undo(a).ops,a,`repeat undo ${i}`);await apply('A',ah.redo(a).ops,a,`repeat redo ${i}`);}
 // Exact duplicate application, in reverse order after all dependencies exist.
 const replay=[...seed,...ai,...bi,...ad,...bd,...mark,...foreign,...italic].reverse();for(const op of replay){a.apply(op);await apply('A',[op],a,'causally valid duplicate reorder');}
 // Fresh actor identifiers stress JS UTF16 ordering, which differs from UTF8 ordering.
 const unicode=[new Doc('😀',schema),new Doc('\uE000',schema)];const uops=unicode.map(d=>cmd.insertText(d,pos(0),d.actor));for(let order=0;order<2;order++){const d=new Doc('U'+order,schema);await fresh(d.actor,d);for(const ops of order?uops.toReversed():uops){ops.forEach(op=>d.apply(op));await apply(d.actor,ops,d,'raw Doc.apply Unicode actor ordering (outside server actor gate)');}}
}

async function deleteFormatUndo(){
 const a=new Doc('deleteA',schema),b=new Doc('deleteB',schema),h=new History();await fresh(a.actor,a);await fresh(b.actor,b);
 const seed=cmd.insertText(a,pos(0),'abcd');seed.forEach(op=>b.apply(op));await apply(a.actor,seed,a,'delete+bold seed');await apply(b.actor,seed,b,'delete+bold seed B');
 const deleted=record(h,a,cmd.deleteRange(a,pos(1),pos(2)));await apply(a.actor,deleted,a,'delete before bold');
 const bold=record(h,a,cmd.setMark(a,pos(0),pos(2),'bold',true));await apply(a.actor,bold,a,'bold after delete');
 for(let i=0;i<3;i++){await apply(a.actor,h.undo(a).ops,a,'delete+bold undo bold');await apply(a.actor,h.undo(a).ops,a,'delete+bold undo delete');await apply(a.actor,h.redo(a).ops,a,'delete+bold redo delete');await apply(a.actor,h.redo(a).ops,a,'delete+bold redo bold');}
 // Independent concurrent deletes: cancelling A must leave B's distinct deletion.
 const other=cmd.deleteRange(b,pos(3),pos(4));other.forEach(op=>a.apply(op));await apply(a.actor,other,a,'independent foreign delete');await apply(b.actor,other,b,'independent delete B');
 // Birth-prefix duplication with another user's insertion in the middle.
 const d=new Doc('partial',schema);await fresh(d.actor,d);const full:Op={t:'text',id:{lamport:1,actor:'birth'},origin:{lamport:0,actor:'~root'},text:'abcd'};const prefix={...full,text:'ab'};d.apply(prefix);await apply(d.actor,[prefix],d,'partial birth');const middle:Op={t:'text',id:{lamport:20,actor:'middle'},origin:{lamport:1,actor:'birth'},text:'X'};d.apply(middle);await apply(d.actor,[middle],d,'foreign insertion inside partial birth');d.apply(full);await apply(d.actor,[full],d,'exact birth suffix replay');
}

async function lwwAndCancelOrdering(){
 const a=new Doc('tieA',schema),b=new Doc('tieB',schema);const seed=cmd.insertText(a,pos(0),'xy');seed.forEach(op=>b.apply(op));const ma=cmd.setMark(a,pos(0),pos(1),'bold',true),mb=cmd.setMark(b,pos(0),pos(1),'bold',false);assert.equal((ma[0] as any).at.lamport,(mb[0] as any).at.lamport);
 for(let order=0;order<2;order++){const d=new Doc('tie'+order,schema);await fresh(d.actor,d);seed.forEach(op=>d.apply(op));await apply(d.actor,seed,d,'equal-ticket LWW seed');for(const ops of order?[mb,ma]:[ma,mb]){ops.forEach(op=>d.apply(op));await apply(d.actor,ops,d,'equal-Lamport LWW delivery');}assert.equal(d.items[1].attrs.get('bold')!.value,false);}
 const h=new History();const deleted=record(h,a,cmd.deleteRange(a,pos(1),pos(2))),inverse=h.undo(a).ops;const d=new Doc('cancelBeforeDelete',schema);await fresh(d.actor,d);seed.forEach(op=>d.apply(op));await apply(d.actor,seed,d,'cancel fixture seed');
 // Direct Doc.apply edge fixture: inverse delivery before the delete is not causal network delivery.
 inverse.forEach(op=>d.apply(op));await apply(d.actor,inverse,d,'raw inverse-before-delete edge');deleted.forEach(op=>d.apply(op));await apply(d.actor,deleted,d,'late delete preserves prior cancellation');assert.equal(isAlive(d.items[2]),true);
}

async function random(seed:number){let rng=seed>>>0;const next=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng;};const docs=[new Doc('rA'+seed,schema),new Doc('rB'+seed,schema)];const histories=docs.map(()=>new History());for(const d of docs)await fresh(d.actor,d);
 for(let step=0;step<60;step++){const actor=next()%2,d=docs[actor],h=histories[actor],length=d.items.slice(1).filter(isAlive).length;let ops:Op[];const action=next()%6;if(!length||action===0){ops=record(h,d,cmd.insertText(d,pos(next()%(length+1)),['a','한','😀'][next()%3]));}else if(action===1){let from=next()%length;ops=record(h,d,cmd.deleteRange(d,pos(from),pos(Math.min(length,from+1+next()%2))));}else if(action===2||action===3){let from=next()%length;ops=record(h,d,cmd.setMark(d,pos(from),pos(Math.min(length,from+1+next()%3)),action===2?'bold':'italic',!!(next()%2)));}else ops=action===4?h.undo(d).ops:h.redo(d).ops;await apply(d.actor,ops,d,`seed ${seed} step ${step}`);const other=docs[1-actor];ops.forEach(op=>other.apply(op));await apply(other.actor,ops,other,`seed ${seed} delivered ${step}`);if(step%7===0){ops.forEach(op=>other.apply(op));await apply(other.actor,ops,other,`seed ${seed} duplicate ${step}`);}assert.deepEqual(state(d),state(other));}
}

async function invalid(){const d=new Doc('invalid',schema);await fresh('invalid',d);const text=cmd.insertText(d,pos(0),'abc');await apply('invalid',text,d,'validation seed');const prior=(await native.call({cmd:'state',replica:'invalid'})).state;
 const cases:any[]=[{ops:[{t:'node',id:{lamport:99,actor:'x'},origin:{lamport:0,actor:'~root'},type:'paragraph'}]},{ops:[{t:'move'}]},{ops:[{t:'gc'}]},{ops:[{t:'text',id:{lamport:10,actor:'x'},origin:{lamport:1,actor:'missing'},units:[97]}]},{ops:[{t:'text',id:{lamport:10,actor:'x'},origin:{lamport:0,actor:'~root'},units:[65536]}]},{ops:[{t:'set',at:{lamport:20,actor:'x'},ids:[{lamport:1,actor:'invalid'}],key:'link',value:'bad'}]},{schema:'unsupported-schema',ops:[]},{ops:[{t:'set',at:{lamport:20,actor:'x'},ids:[{lamport:1,actor:'invalid'}],key:'bold',value:true},{t:'unsupported'}]}];
 for(const request of cases){const response=await native.raw({schema:SCHEMA,cmd:'apply',replica:'invalid',...request});assert.equal(response.ok,false,JSON.stringify(request));assert.deepEqual((await native.call({cmd:'state',replica:'invalid'})).state,prior,'reject must be atomic');checkpoints.push({label:'atomic rejection',request,error:response.error});}
 const snapshot=(await native.call({cmd:'snapshot',replica:'invalid'})).snapshot;for(const bad of [{...snapshot,format:'unsupported'},{...snapshot,schema:'unsupported'}]){const response=await native.raw({schema:SCHEMA,cmd:'restore',replica:'invalid',snapshot:bad});assert.equal(response.ok,false);assert.deepEqual((await native.call({cmd:'state',replica:'invalid'})).state,prior,'restore reject must be atomic');checkpoints.push({label:'atomic snapshot restore rejection',request:bad,state:prior,error:response.error});}}

async function restartPending(){const net=new MemoryNet({clientSchema:schema});const a=net.add('pendingA'),b=net.add('pendingB');a.connect();b.connect();await net.settle();try{await fresh('pending',a.doc);const seed=cmd.insertText(a.doc,pos(0),'base');a.commit(seed,null);await net.settle();await apply('pending',seed,a.doc,'actual SyncClient seed');const baseSnapshot=(await native.call({cmd:'snapshot',replica:'pending'})).snapshot;const baseDoc=Doc.fromSnapshot(a.actor,a.doc.snapshot(),schema);
 const pendingOps=cmd.insertText(a.doc,pos(2),'😀');a.commit(pendingOps);assert.equal(a.pending.length,1);const pending=structuredClone(a.pending[0]);await apply('pending',pendingOps,a.doc,'actual pending before child restart');const snapshot=(await native.call({cmd:'snapshot',replica:'pending'})).snapshot;checkpoints.push({label:'native snapshot before process restart',snapshot,savedPending:pending});
 await native.close();native=new Native(binary);await native.call({cmd:'restore',replica:'pending',actor:a.actor,snapshot});await check('native process restart snapshot restore','pending',a.doc);
 const foreign=cmd.insertText(b.doc,pos(1),'other');b.commit(foreign);await net.settle();assert.deepEqual(a.doc.toJSON(),net.hub.doc.toJSON());assert.deepEqual(b.doc.toJSON(),net.hub.doc.toJSON());assert.equal(a.pending.length,0);
 await native.call({cmd:'apply',replica:'pending',ops:wire(foreign)});await native.call({cmd:'apply',replica:'pending',ops:wire(pending.ops)});await check('exact saved pending duplicate after foreign edits','pending',a.doc);await native.call({cmd:'apply',replica:'pending',ops:wire(pending.ops)});await check('second exact pending duplicate','pending',net.hub.doc);
 checkpoints.push({label:'native base snapshot excludes saved pending',snapshot:baseSnapshot,savedPending:pending});await native.close();native=new Native(binary);await native.call({cmd:'restore',replica:'absentPending',actor:a.actor,snapshot:baseSnapshot});await check('base snapshot restored without pending','absentPending',baseDoc);foreign.forEach(op=>baseDoc.apply(op));await apply('absentPending',foreign,baseDoc,'foreign accepted edits before pending replay');await native.call({cmd:'apply',replica:'absentPending',ops:wire(pending.ops)});await check('restart with absent pending applied after foreign accepted edits','absentPending',net.hub.doc);await native.call({cmd:'apply',replica:'absentPending',ops:wire(pending.ops)});await check('absent pending becomes exact duplicate','absentPending',net.hub.doc);
 }finally{a.disconnect();b.disconnect();}}

try{native=new Native(binary);await deterministic();await deleteFormatUndo();await lwwAndCancelOrdering();for(const seed of [1,42,20261101,0xdecafbad])await random(seed);await invalid();await restartPending();const after=hashes();assert.deepEqual(after,before,'production source and native binary unchanged during execution');writeFileSync(process.env.RUST_SHADOW_RECEIPT ? resolve(process.env.RUST_SHADOW_RECEIPT) : new URL('./receipt.json',import.meta.url),JSON.stringify({status:'PASS',timestamp:new Date().toISOString(),node:process.version,binary,schema:SCHEMA,seeds:[1,42,20261101,0xdecafbad],records:checkpoints.length,stateComparisons:checkpoints.filter(x=>x.state&&x.replica).length,inputBatches:checkpoints.filter(x=>x.ops).length,checkpointDetails:checkpoints,runtimeProvenance:provenance,hashesBefore:before,hashesAfter:after,proof:{reference:'actual production Doc, History, SyncClient and DocHub through MemoryNet',shadow:'independent native Rust CRDT; inputs contain ops, never expected state',history:'TypeScript History creates inverse ops; Rust only applies inverse wire',restart:'native process restore both with and without saved pending; exact pending and duplicate replay after foreign edits',serverRecovery:'NOT_RUN',protectedGC:'NOT_RUN',wasm:'NOT_RUN',browser:'NOT_RUN',unicodeActors:'raw Doc.apply-only comparator fixture; not accepted by production server actor validation'}},null,2)+'\n');console.log(JSON.stringify({status:'PASS',records:checkpoints.length,stateComparisons:checkpoints.filter(x=>x.state&&x.replica).length,seeds:4}));}finally{await native?.close();}
