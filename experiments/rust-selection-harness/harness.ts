import {collectFingerprints, runtimeProvenance} from '../rust-shadow-harness/fingerprints.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Doc,isAlive} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {anchorAt,pathAt} from '../../packages/doc-sync/dist/crdt/edit.js';
import {InputSession} from '../../packages/doc-sync/dist/editor/index.js';
import * as cmd from '../../packages/doc-sync/dist/crdt/commands.js';
import type {Schema} from '../../packages/doc-sync/dist/crdt/schema.js';
import type {Op} from '../../packages/doc-sync/dist/crdt/doc.js';
import type {SyncClient} from '../../packages/doc-sync/dist/sync/client.js';

const SCHEMA='flow-root-paragraph:boolean-marks:bold,italic:v1';
const schema:Schema={root:'content',marks:['bold','italic'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const units=(text:string)=>Array.from({length:text.length},(_,i)=>text.charCodeAt(i));
const wire=(ops:Op[])=>ops.map(op=>op.t==='text'?(({text,...rest})=>({...rest,units:units(text)}))(op):structuredClone(op));
const state=(doc:Doc)=>({clock:doc.clock.lamport,items:doc.items.map(item=>({id:item.id,origin:item.origin,kind:item.kind,unit:item.kind==='char'?item.ch.charCodeAt(0):null,visible:isAlive(item),dels:[...item.dels].sort(),cancels:[...item.cancels].sort(),attrs:Object.fromEntries([...item.attrs].sort(([a],[b])=>a<b?-1:a>b?1:0))})),model:{...doc.toJSON(),children:doc.toJSON().children!.map(child=>({...child,runs:child.runs!.map(run=>{assert.ok('text'in run);return{units:units(run.text),marks:run.marks};})}))},counts:{tokens:doc.items.length-1,visible:doc.items.slice(1).filter(isAlive).length,tombstones:doc.items.slice(1).filter(i=>!isAlive(i)).length}});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const binary=resolve(process.env.RUST_SHADOW_BINARY ?? 'experiments/rust-shadow/target/debug/doc-sync-rust-shadow');
const provenance=runtimeProvenance(Doc,History);
const hashes=()=>collectFingerprints(binary);
const records:any[]=[];let processes=0,states=0,historyGraphs=0,inverses=0,captures=0,resolutions=0,ranges=0,delayedBatches=0,duplicates=0,now=2_000_000;
const originalNow=Date.now;Date.now=()=>now;
class Native{
 child:ReturnType<typeof spawn>;queue:Array<{resolve:(v:any)=>void;reject:(e:Error)=>void}>=[];stderr='';process=++processes;
 constructor(){this.child=spawn(binary,[],{stdio:['pipe','pipe','pipe']});createInterface({input:this.child.stdout!}).on('line',line=>{const p=this.queue.shift();if(!p)throw Error('unsolicited native response');try{p.resolve(JSON.parse(line));}catch(e){p.reject(e as Error);}});this.child.stderr!.on('data',c=>this.stderr+=c);this.child.on('exit',code=>{for(const p of this.queue.splice(0))p.reject(Error(`native exit ${code}: ${this.stderr}`));});}
 async call(request:any){const input={schema:SCHEMA,...request};const response=await new Promise<any>((resolve,reject)=>{this.queue.push({resolve,reject});this.child.stdin!.write(JSON.stringify(input)+'\n');});records.push({process:this.process,request:input,response});assert.equal(response.ok,true,JSON.stringify(response));return response;}
 async close(){if(this.child.exitCode!==null)return;const done=new Promise<void>(resolve=>this.child.once('exit',()=>resolve()));this.child.stdin!.end();await done;}
}
let native:Native;
type Range={anchor:string;focus:string};
type Pair={name:string;doc:Doc;history:History;saved:Range[]};
const pos=(o:number)=>({b:0,o});
const session=(p:Pair)=>new InputSession({doc:p.doc} as SyncClient);
async function check(p:Pair,label:string,response?:any){const actual=response?.state??(await native.call({cmd:'state',replica:p.name})).state;assert.deepEqual(actual,state(p.doc),label+': full Doc');states++;const h=response?.history?response:await native.call({cmd:'history_state',replica:p.name});assert.deepEqual(h.history,p.history.snapshot(),label+': History graph');historyGraphs++;records.push({label,replica:p.name,expectedStateSha256:digest(state(p.doc)),expectedHistorySha256:digest(p.history.snapshot())});await checkSaved(p,label);}
async function fresh(name:string){const p:Pair={name,doc:new Doc(name,schema),history:new History(),saved:[]};await native.call({cmd:'new',replica:name,actor:name});await check(p,'empty');return p;}
async function capture(p:Pair,offset:number){const expected=anchorAt(p.doc,[0,offset]);const actual=(await native.call({cmd:'anchor_capture',replica:p.name,offset})).anchor;assert.equal(actual,expected,'UTF16 stable token anchor');captures++;return actual as string;}
async function checkSaved(p:Pair,label:string){for(const range of p.saved){const expected=session(p).resolve(range);const a=(await native.call({cmd:'anchor_resolve',replica:p.name,anchor:range.anchor,strict:true})).offset;const f=(await native.call({cmd:'anchor_resolve',replica:p.name,anchor:range.focus,strict:true})).offset;assert.deepEqual(a===null||f===null?null:{anchor:[0,a],focus:[0,f]},expected,label+': independent anchor/focus, including orientation');assert.deepEqual((await native.call({cmd:'selection_resolve',replica:p.name,range})).range,expected,label+': exact product range resolve');resolutions+=2;ranges++;}}
async function saveRanges(p:Pair){const length=p.doc.items.slice(1).filter(isAlive).length;const keys=[];for(let i=0;i<=length;i++)keys.push(await capture(p,i));for(let i=0;i<keys.length;i++){p.saved.push({anchor:keys[i],focus:keys[keys.length-1-i]});p.saved.push({anchor:keys[i],focus:keys[i]});for(const range of [{anchor:[0,i],focus:[0,length-i]},{anchor:[0,i],focus:[0,i]}]){assert.deepEqual((await native.call({cmd:'selection_capture',replica:p.name,range})).range,session(p).capture(range));captures++;}}await checkSaved(p,'capture ranges');}
async function apply(p:Pair,ops:Op[],label:string){for(const op of ops)p.doc.apply(op);await check(p,label,await native.call({cmd:'apply',replica:p.name,ops:wire(ops)}));}
async function local(p:Pair,make:()=>Op[],label:string){now+=10;const ops=make();p.history.record(ops,p.doc,{caretBefore:'anchor-before',caretAfter:'focus-after'});await check(p,label,await native.call({cmd:'history_record',replica:p.name,ops:wire(ops),options:{caretBefore:'anchor-before',caretAfter:'focus-after'},now}));return ops;}
async function inverse(p:Pair,action:'undo'|'redo',label:string){const expected=p.history[action](p.doc);const actual=await native.call({cmd:'history_'+action,replica:p.name});assert.deepEqual(actual.ops,wire(expected.ops),label+': independent native inverse');assert.equal(actual.caret,expected.caret);inverses++;await check(p,label,actual);return expected.ops;}

async function anchorFixtures(){const p=await fresh('anchors');await saveRanges(p);await local(p,()=>cmd.insertText(p.doc,pos(0),'A😀B'),'UTF16 seed with surrogate split point');p.saved=[];await saveRanges(p);
 for(const offset of [0,2,6])await local(p,()=>cmd.insertText(p.doc,pos(Math.min(offset,p.doc.items.slice(1).filter(isAlive).length)),'x'),'insert before/at/after saved endpoints');
 await local(p,()=>cmd.deleteRange(p.doc,pos(1),pos(5)),'delete saved endpoint and predecessor tokens');await inverse(p,'undo','restore deleted anchors');await inverse(p,'redo','delete saved anchors again');
 for(const key of ['missing@actor','end']){assert.equal((await native.call({cmd:'anchor_resolve',replica:p.name,anchor:key})).offset,pathAt(p.doc,key)![1]);assert.equal((await native.call({cmd:'anchor_resolve',replica:p.name,anchor:key,strict:true})).offset,null);resolutions+=2;assert.equal(session(p).resolve({anchor:key,focus:key}),null);}
 for(const range of [null,{anchor:[0,-1],focus:[0,0]},{anchor:[0,999],focus:[0,0]},{anchor:[0,0.5],focus:[0,0]},{anchor:[1,0],focus:[0,0]},{anchor:[0],focus:[0,0]}]){assert.deepEqual((await native.call({cmd:'selection_capture',replica:p.name,range})).range,session(p).capture(range));captures++;}
 for(const range of [null,{anchor:'missing@actor',focus:'0@~root'},{anchor:'0@~root',focus:'end'}]){assert.deepEqual((await native.call({cmd:'selection_resolve',replica:p.name,range})).range,session(p).resolve(range));ranges++;}
 const checkpoint=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;const ts={doc:p.doc.snapshot(),history:p.history.snapshot()};await native.close();native=new Native();p.doc=Doc.fromSnapshot(p.doc.actor,ts.doc,schema);p.history=History.fromSnapshot(ts.history);await check(p,'anchor token keys survive process restart',await native.call({cmd:'history_restore',replica:p.name,checkpoint}));await inverse(p,'undo','post-restart restored anchor undo');await local(p,()=>cmd.insertText(p.doc,pos(0),'restart'),'post-restart remote-relative anchors');}

async function concurrent(seed:number){let rng=seed>>>0;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
 const peers=[await fresh('concurrentA'+seed),await fresh('concurrentB'+seed),await fresh('concurrentC'+seed)];const birth=await local(peers[0],()=>cmd.insertText(peers[0].doc,pos(0),'A😀B한C'),'common concurrent seed');for(const p of peers.slice(1))await apply(p,birth,'common seed delivery');for(const p of peers)await saveRanges(p);
 for(let round=0;round<8;round++){
  // Every actor edits before any actor receives this round's other batches.
  const batches:Op[][]=[];
  for(let i=0;i<3;i++){const p=peers[i],length=p.doc.items.slice(1).filter(isAlive).length;const action=(round+i)%5;
   if(action===0||!length)batches.push(await local(p,()=>cmd.insertText(p.doc,pos(next()%(length+1)),['😀','한','X'][i]),`round ${round} actor ${i} concurrent insert`));
   else if(action===1){const from=next()%length;batches.push(await local(p,()=>cmd.deleteRange(p.doc,pos(from),pos(Math.min(length,from+2))),`round ${round} actor ${i} concurrent delete`));}
   else if(action===2){batches.push(await local(p,()=>cmd.setMark(p.doc,pos(0),pos(length),'bold',!!(round%2)),`round ${round} actor ${i} concurrent mark`));}
   else batches.push(await inverse(p,action===3?'undo':'redo',`round ${round} actor ${i} independent native history`));
  }
  records.push({label:'genuinely concurrent round before delivery',seed,round,batches:wire(batches.flat())});
  for(let target=0;target<3;target++){
   const order=[(target+1)%3,(target+2)%3];if(next()%2)order.reverse();
   for(const source of order){await apply(peers[target],batches[source],`delayed round ${round} from ${source} to ${target}`);delayedBatches++;}
   // Duplicate batches are reordered only after all their birth dependencies exist.
   for(const source of [...order].reverse()){await apply(peers[target],batches[source],`duplicate reordered round ${round} from ${source} to ${target}`);duplicates++;}
  }
  assert.deepEqual(state(peers[0].doc),state(peers[1].doc),'concurrent replicas 0/1 converge');assert.deepEqual(state(peers[1].doc),state(peers[2].doc),'concurrent replicas 1/2 converge');
 }
 // Each actor owns its own history. Other histories must retain their own graph.
 for(let i=0;i<3;i++){const ops=await inverse(peers[i],'undo',`final actor ${i} local undo with foreign edits`);for(let target=0;target<3;target++)if(target!==i)await apply(peers[target],ops,'final native inverse delivery');}
 assert.deepEqual(state(peers[0].doc),state(peers[2].doc));
}

let before:any;
try{before=hashes();native=new Native();await anchorFixtures();for(const seed of [42,20261101])await concurrent(seed);const after=hashes();assert.deepEqual(after,before,'sources and native binary unchanged');writeFileSync(process.env.RUST_SELECTION_RECEIPT ? resolve(process.env.RUST_SELECTION_RECEIPT) : new URL('./receipt.json',import.meta.url),JSON.stringify({status:'PASS',timestamp:new Date().toISOString(),node:process.version,binary,seeds:[42,20261101],stateComparisons:states,historyGraphComparisons:historyGraphs,inverseOpComparisons:inverses,captureComparisons:captures,endpointResolveComparisons:resolutions,rangeComparisons:ranges,delayedBatches,duplicateBatches:duplicates,processes,restartCount:processes-1,runtimeProvenance:provenance,hashesBefore:before,hashesAfter:after,proof:{reference:'production Doc, History, anchorAt/pathAt, InputSession.capture/resolve',native:'independent Rust Doc, History and token anchor capture/resolve',selection:'one implicit paragraph; UTF16 positions including split surrogate; collapsed/reversed anchor-focus pairs; deleted endpoint predecessor; strict missing key rejection; process restore stable keys',delivery:'three actors create each round before any delivery; permuted causally ready batches and reordered duplicate delivery; exact native local inverse ops; full state convergence after each round',inputs:'ops, offsets, anchor keys, native exported checkpoints; no expected positions or TS states sent to child',excluded:'general schemas/nodes/moves, GC, arbitrary noncausal absent-target delivery, live network/server recovery, WASM, browser, performance, production migration'},records})+'\n');console.log(JSON.stringify({status:'PASS',states,historyGraphs,inverses,captures,resolutions,ranges,delayedBatches,duplicates,processes}));}
catch(error){writeFileSync(new URL('./failure.json',import.meta.url),JSON.stringify({status:'FAIL',error:String(error),stack:(error as Error).stack,hashesBefore:before,records})+'\n');throw error;}
finally{Date.now=originalNow;await native?.close();}
