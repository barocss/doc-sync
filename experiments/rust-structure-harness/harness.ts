import {collectFingerprints, runtimeProvenance} from '../rust-shadow-harness/fingerprints.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Doc, isAlive} from '../../packages/doc-sync-core/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync-core/dist/crdt/history.js';
import {InputSession} from '../../packages/doc-sync-core/dist/editor/index.js';
import {anchorAt,pathAt} from '../../packages/doc-sync-core/dist/crdt/edit.js';
import type {SyncClient} from '../../packages/doc-sync-core/dist/sync/client.js';
import {keyOf} from '../../packages/doc-sync-core/dist/crdt/ticket.js';
import * as cmd from '../../packages/doc-sync-core/dist/crdt/commands.js';
import {MemoryNet} from '../../packages/doc-sync/test/harness.ts';
import type {Op} from '../../packages/doc-sync-core/dist/crdt/doc.js';
import type {RecordOptions} from '../../packages/doc-sync-core/dist/crdt/history.js';
import type {Schema} from '../../packages/doc-sync-core/dist/crdt/schema.js';

const SCHEMA = 'flow-root-paragraph:boolean-marks:bold,italic:v1';
const schema: Schema = {root:'content',marks:['bold','italic'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const units = (text:string) => Array.from({length:text.length},(_,i)=>text.charCodeAt(i));
const wire = (ops:Op[]) => ops.map(op => op.t==='text' ? (({text,...rest})=>({...rest,units:units(text)}))(op) : structuredClone(op));
// This is the full state contract of the bounded paragraph-flow native Doc interpreter.
const state = (doc:Doc) => ({clock:doc.clock.lamport,items:doc.items.map(item=>({id:item.id,origin:item.origin,kind:item.kind,born:item.born,boundary:item.boundary,unit:item.kind==='char'?item.ch.charCodeAt(0):null,visible:isAlive(item),dels:[...item.dels].sort(),cancels:[...item.cancels].sort(),attrs:Object.fromEntries([...item.attrs].sort(([a],[b])=>a<b?-1:a>b?1:0))})),model:{...doc.toJSON(),children:doc.toJSON().children!.map(child=>({...child,runs:child.runs!.map(run=>{assert.ok('text' in run);return {units:units(run.text),marks:run.marks};})}))},blocks:doc.blocks().map(block=>{assert.equal(block.kind,'text');const b=block as import('../../packages/doc-sync-core/dist/crdt/doc.js').TextBlock;return {kind:b.kind,marker:b.marker.key,type:b.type,attrs:b.attrs,aliases:b.aliases.map(x=>x.key),virtual:b.virtual,chars:b.chars.map(x=>x.key),textUnits:units(b.text)};}),counts:{tokens:doc.items.length-1,visible:doc.items.slice(1).filter(isAlive).length,tombstones:doc.items.slice(1).filter(i=>!isAlive(i)).length}});
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
 await checkSelections(p,label);records.push({label,replica:p.name,expectedStateSha256:createHash('sha256').update(JSON.stringify(state(p.doc))).digest('hex'),expectedHistorySha256:createHash('sha256').update(JSON.stringify(p.history.snapshot())).digest('hex')});
}
async function fresh(name:string){const p={name,doc:new Doc(name,schema),history:new History()};await native.call({cmd:'new',replica:name,actor:name,capabilities:['paragraph-markers-v1']});await check(p,'empty');return p;}
async function apply(p:Pair,ops:Op[],label:string){for(const op of ops)p.doc.apply(op);await check(p,label,await native.call({cmd:'apply',replica:p.name,ops:wire(ops)}));}
async function local(p:Pair,make:()=>Op[],label:string,options:RecordOptions=standard){now+=10;const ops=make();p.history.record(ops,p.doc,options);const result=await native.call({cmd:'history_record',replica:p.name,ops:wire(ops),options,now});await check(p,label,result);return ops;}
async function inverse(p:Pair,action:'undo'|'redo',label:string){const expected=p.history[action](p.doc);const result=await native.call({cmd:'history_'+action,replica:p.name});assert.deepEqual(result.ops,wire(expected.ops),label+': independently generated inverse ops');assert.equal(result.caret,expected.caret,label+': caret');inverseComparisons++;await check(p,label,result);return expected.ops;}
async function cycle(p:Pair,count:number,label:string){for(let i=0;i<count;i++){await inverse(p,'undo',`${label} undo ${i}`);await inverse(p,'redo',`${label} redo ${i}`);}}
async function seed(p:Pair,text='abcd'){const ops=cmd.insertText(p.doc,pos(0),text);await native.call({cmd:'apply',replica:p.name,ops:wire(ops)});await check(p,'unrecorded seed');return ops;}

type SavedRange={anchor:string;focus:string};
const selections=new Map<string,SavedRange[]>();let captureComparisons=0,rangeComparisons=0,endpointComparisons=0,restarts=0;
const randomSeeds=[42,20261101];let randomRounds=0,randomDelayedBatches=0,randomDuplicateBatches=0;
const session=(p:Pair)=>new InputSession({doc:p.doc} as SyncClient);
const text=(p:Pair)=>p.doc.toJSON().children!.map((child:any)=>child.runs.map((run:any)=>run.text).join(''));
async function checkSelections(p:Pair,label:string){for(const range of selections.get(p.name)??[]){const expected=session(p).resolve(range);assert.deepEqual((await native.call({cmd:'selection_resolve',replica:p.name,range})).range,expected,label+': multi-block anchor/focus resolve');rangeComparisons++;for(const key of [range.anchor,range.focus]){const expected=pathAt(p.doc,key)!;const actual=await native.call({cmd:'anchor_resolve',replica:p.name,anchor:key,strict:true});assert.equal(actual.paragraph,expected[0]);assert.equal(actual.offset,expected[1]);endpointComparisons++;}}}
async function captureSelections(p:Pair){const points:Array<{path:number[];key:string}>=[];for(const [b,block] of p.doc.blocks().entries()){assert.equal(block.kind,'text');for(let o=0;o<=(block as any).chars.length;o++){const key=anchorAt(p.doc,[b,o])!;const actual=await native.call({cmd:'anchor_capture',replica:p.name,paragraph:b,offset:o});assert.equal(actual.anchor,key);captureComparisons++;points.push({path:[b,o],key});}}
 const saved:SavedRange[]=[];for(let i=0;i<points.length;i++){const range={anchor:points[i].path,focus:points[points.length-1-i].path};const expected=session(p).capture(range)!;assert.deepEqual((await native.call({cmd:'selection_capture',replica:p.name,range})).range,expected);captureComparisons++;saved.push(expected);saved.push({anchor:expected.anchor,focus:expected.anchor});}selections.set(p.name,saved);await checkSelections(p,'captured structural selection');}
async function deliverAll(peers:Pair[],source:Pair,ops:Op[],label:string){for(const p of peers)if(p!==source)await apply(p,ops,label);}
async function same(peers:Pair[],label:string){for(const p of peers.slice(1))assert.deepEqual(state(p.doc),state(peers[0].doc),label);}

async function sequential(){const p=await fresh('structureSequential');await seed(p,'A😀B한C');await captureSelections(p);
 const split=await local(p,()=>cmd.splitBlock(p.doc,{b:0,o:2}),'split between UTF16 surrogate halves');assert.equal(split.length,1);assert.equal(split[0].t,'node');assert.deepEqual(text(p),['A\ud83d','\ude00B한C']);await captureSelections(p);
 await cycle(p,3,'authored paragraph node existence');
 await local(p,()=>cmd.insertText(p.doc,{b:1,o:1},'second'),'second paragraph insert');
 await local(p,()=>cmd.setMark(p.doc,{b:0,o:0},{b:1,o:2},'bold',true),'multi-paragraph mark');await inverse(p,'undo','multi-paragraph mark undo');await inverse(p,'redo','multi-paragraph mark redo');
 await local(p,()=>cmd.backspace(p.doc,{b:1,o:0}).ops,'backspace merges paragraphs');assert.equal(text(p).length,1);await cycle(p,2,'merge marker cancellation');
 await inverse(p,'undo','restore split before forward merge');await local(p,()=>cmd.deleteForward(p.doc,{b:0,o:(p.doc.blocks()[0] as any).chars.length}),'Delete at end merges next paragraph');assert.equal(text(p).length,1);await inverse(p,'undo','restore forward merge');
 await local(p,()=>p.doc.edit([{op:'merge',at:[1]}]).ops,'actual model merge compiler');await inverse(p,'undo','actual model merge undo');
 const edge=await fresh('structureEdges');await seed(edge,'xy');await local(edge,()=>cmd.splitBlock(edge.doc,{b:0,o:0}),'Enter at start');assert.deepEqual(text(edge),['','xy']);await local(edge,()=>cmd.splitBlock(edge.doc,{b:1,o:2}),'Enter at end');assert.deepEqual(text(edge),['','xy','']);await captureSelections(edge);await cycle(edge,2,'empty final paragraph');
}

async function aliases(order:number){const peers=[await fresh('alias'+order+'A'),await fresh('alias'+order+'B'),await fresh('alias'+order+'C')];const birth=await seed(peers[0],'abcd');await deliverAll(peers,peers[0],birth,'alias shared seed');
 const splits:Op[][]=[];for(const p of peers)splits.push(await local(p,()=>cmd.splitBlock(p.doc,{b:0,o:2}),'genuinely concurrent same-boundary Enter'));
 for(let i=0;i<3;i++){const permutation=order?[2,1,0]:[0,1,2];for(const j of permutation)if(i!==j)await apply(peers[i],splits[j],'permuted concurrent Enter delivery');for(const j of [...permutation].reverse())await apply(peers[i],splits[j],'duplicate concurrent Enter delivery');}
 await same(peers,'same-boundary Enter converges');for(const p of peers){assert.deepEqual(text(p),['ab','cd'],'three concurrent Enters create exactly one extra paragraph');assert.equal((p.doc.blocks()[1] as any).aliases.length,2);await captureSelections(p);}
 const primary=(peers[0].doc.blocks()[1] as any).marker.key;const owner=peers.find(p=>splits[peers.indexOf(p)].some((op:any)=>keyOf(op.id)===primary))!;const undo=await inverse(owner,'undo','delete primary promotes live alias');await deliverAll(peers,owner,undo,'primary deletion delivered');await same(peers,'alias re-election converges');for(const p of peers){assert.equal(p.doc.blocks().length,2);assert.notEqual((p.doc.blocks()[1] as any).marker.key,primary);}
 for(const p of peers)if(p!==owner){const ops=await inverse(p,'undo','undo remaining own alias');await deliverAll(peers,p,ops,'alias undo delivered');}
 for(const p of peers)assert.deepEqual(text(p),['abcd']);
 for(const p of [...peers].reverse()){const ops=await inverse(p,'redo','reverse actor redo restores boundary');await deliverAll(peers,p,ops,'alias redo delivered');}
 await same(peers,'reverse actor redo converges');const mergeOwner=peers[0];const merged=await local(mergeOwner,()=>cmd.backspace(mergeOwner.doc,{b:1,o:0}).ops,'merge deletes primary and every live alias');assert.equal((merged[0] as any).ids.length,3);await deliverAll(peers,mergeOwner,merged,'merge all alias markers delivered');for(const p of peers)assert.deepEqual(text(p),['abcd']);
 const restored=await inverse(mergeOwner,'undo','undo merge restores alias identities');await deliverAll(peers,mergeOwner,restored,'merge cancellation delivered');await same(peers,'alias identities preserved');for(const p of peers){assert.deepEqual(text(p),['ab','cd']);assert.equal((p.doc.blocks()[1] as any).aliases.length,2);}
}

async function foreignMerge(){const a=await fresh('foreignMergeA'),b=await fresh('foreignMergeB');const birth=await seed(a,'abcd');await apply(b,birth,'foreign merge seed');const split=await local(a,()=>cmd.splitBlock(a.doc,{b:0,o:2}),'shared authored split');await apply(b,split,'shared split delivered');await captureSelections(a);await captureSelections(b);
 const merge=await local(a,()=>cmd.backspace(a.doc,{b:1,o:0}).ops,'local merge before foreign receive');const insertion=await local(b,()=>cmd.insertText(b.doc,{b:1,o:1},'FOREIGN'),'foreign insert in pre-merge second paragraph');await apply(a,insertion,'foreign insert crosses local merge');await apply(b,merge,'merge crosses foreign insert');await same([a,b],'merge foreign insert convergence');assert.deepEqual(text(a),['abcFOREIGNd']);const undo=await inverse(a,'undo','undo merge retains foreign insertion');await apply(b,undo,'merge undo delivered');await same([a,b],'merge undo convergence');assert.deepEqual(text(a),['ab','cFOREIGNd']);await cycle(a,3,'repeat foreign-aware merge');}

async function separatedAliases(){const a=await fresh('separatedA'),b=await fresh('separatedB');const seedOps=await seed(a,'abcd');await apply(b,seedOps,'separated aliases seed');const sa=await local(a,()=>cmd.splitBlock(a.doc,{b:0,o:2}),'first concurrent split');const sb=await local(b,()=>cmd.splitBlock(b.doc,{b:0,o:2}),'second concurrent split');await apply(a,sb,'second alias delivered');await apply(b,sa,'first alias delivered');
 const primary=(b.doc.blocks()[1] as any).marker.key;assert.equal(primary,keyOf((sb[0] as any).id));const between=await local(b,()=>cmd.splitBlock(b.doc,{b:1,o:0}),'different-boundary marker physically between primary and alias');await apply(a,between,'separated alias split delivered');await same([a,b],'separated alias projection convergence');assert.deepEqual(text(a),['ab','','cd'],'alias must not reset current block to its primary');await captureSelections(a);await captureSelections(b);
 for(const action of ['undo','redo','undo','redo'] as const){const ops=await inverse(b,action,'separated alias inner split '+action);await apply(a,ops,'separated alias inverse delivered');await same([a,b],'separated alias inverse converges');}
}

async function structuralRestart(){for(const kind of ['split','merge'] as const){const net=new MemoryNet({clientSchema:schema});const a=net.add('structurePending'+kind+'A'),b=net.add('structurePending'+kind+'B');a.connect();b.connect();await net.settle();try{const p=await fresh(a.actor);const birth=cmd.insertText(a.doc,pos(0),'abcd');a.commit(birth,null);await net.settle();await apply(p,birth,'structural pending base');
 const edit=async(label:string,make:(d:Doc)=>Op[])=>await local(p,()=>{const expected=make(p.doc),actual=make(a.doc);assert.deepEqual(wire(expected),wire(actual));a.commit(actual,standard);return expected;},label);
 if(kind==='merge'){await edit('accepted split before pending merge',d=>cmd.splitBlock(d,{b:0,o:2}));await net.settle();}
 await edit('real pending '+kind,d=>kind==='split'?cmd.splitBlock(d,{b:0,o:2}):cmd.backspace(d,{b:1,o:0}).ops);assert.equal(a.pending.length,1);const pending=structuredClone(a.pending[0]);await captureSelections(p);const checkpoint=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;const ts={doc:p.doc.snapshot(),history:p.history.snapshot()};
 const foreign=cmd.insertText(b.doc,kind==='split'?{b:0,o:3}:{b:1,o:1},'FOREIGN');b.commit(foreign);await net.settle();assert.equal(a.pending.length,0);assert.deepEqual(a.doc.toJSON(),net.hub.doc.toJSON());records.push({label:'structural joint checkpoint '+kind,checkpoint,pending});
 await native.close();native=new Native();restarts++;p.doc=Doc.fromSnapshot(a.actor,ts.doc,schema);p.history=History.fromSnapshot(ts.history);await check(p,'fresh process structural joint restore',await native.call({cmd:'history_restore',replica:p.name,checkpoint}));await apply(p,foreign,'foreign insertion after structural restart');const history=p.history.snapshot();await apply(p,pending.ops,'exact original structural pending replay');await apply(p,pending.ops,'exact structural pending duplicate');assert.deepEqual(p.history.snapshot(),history);assert.deepEqual(state(p.doc),state(a.doc));
 for(const action of ['undo','redo','undo','redo'] as const){await inverse(p,action,'post-restart structural '+action);assert.ok(text(p).join('').includes('FOREIGN'));}recoveryCases.push({kind,pending:wire(pending.ops),foreign:wire(foreign),checkpointBoundary:'after original pending',historyUnchangedByReplay:true,foreignPreserved:true});
 }finally{a.disconnect();b.disconnect();}}}

async function randomStructure(seedValue:number){let rng=seedValue>>>0;const next=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;const peers=[await fresh('structureRandomA'+seedValue),await fresh('structureRandomB'+seedValue),await fresh('structureRandomC'+seedValue)];const initial=await seed(peers[0],'ab😀한cd');await deliverAll(peers,peers[0],initial,'random structure seed');for(const p of peers)await captureSelections(p);
 for(let round=0;round<10;round++){const batches:Op[][]=[];
  for(let actor=0;actor<3;actor++){const p=peers[actor],blocks=p.doc.blocks() as import('../../packages/doc-sync-core/dist/crdt/doc.js').TextBlock[];const action=next()%6,b=next()%blocks.length,length=blocks[b].chars.length;const label=`structural seed ${seedValue} round ${round} actor ${actor}`;let ops:Op[];
   if(action===0)ops=await local(p,()=>cmd.splitBlock(p.doc,{b,o:next()%(length+1)}),label+' split');
   else if(action===1&&blocks.length>1)ops=await local(p,()=>cmd.backspace(p.doc,{b:1+next()%(blocks.length-1),o:0}).ops,label+' merge');
   else if(action===2||action===1)ops=await local(p,()=>cmd.insertText(p.doc,{b,o:next()%(length+1)},['x','한','😀'][next()%3]),label+' insert');
   else if(action===3)ops=await local(p,()=>cmd.setMark(p.doc,{b:0,o:0},{b:blocks.length-1,o:blocks.at(-1)!.chars.length},next()%2?'bold':'italic',!!(next()%2)),label+' mark');
   else ops=await inverse(p,action===4?'undo':'redo',label+' history');batches.push(ops);
  }
  records.push({label:'structural concurrent round before any delivery',seed:seedValue,round,batches:batches.map(wire)});
  for(let target=0;target<3;target++){const order=[(target+1)%3,(target+2)%3];if(next()%2)order.reverse();for(const source of order){await apply(peers[target],batches[source],`seed ${seedValue} delayed ${round} ${source}->${target}`);randomDelayedBatches++;}for(const source of [...order].reverse()){await apply(peers[target],batches[source],`seed ${seedValue} duplicate ${round} ${source}->${target}`);randomDuplicateBatches++;}}
  await same(peers,`structural seed ${seedValue} round ${round} converges`);randomRounds++;if(round===3||round===7)for(const p of peers)await captureSelections(p);
 }
}

async function rejectionFixtures(){const p=await fresh('structureReject');await seed(p);await local(p,()=>cmd.splitBlock(p.doc,{b:0,o:1}),'rejection fixture authored marker');await local(p,()=>cmd.setMark(p.doc,{b:0,o:0},{b:0,o:1},'bold',true),'rejection fixture char mark');const before=(await native.call({cmd:'history_export',replica:p.name})).checkpoint;const invalid=structuredClone(before);invalid.document.capabilities=['unknown'];
 const forged=structuredClone(before),step=forged.history.undo.flatMap((group:any)=>group.steps).find((step:any)=>step.type==='set'),target=step.targets[0],oldSlot=target.slot;target.id=(p.doc.blocks()[1] as any).marker.id;target.slot=JSON.stringify([keyOf(target.id),'bold']);for(const entry of forged.history.currentSets)if(entry[0]===oldSlot)entry[0]=target.slot;
 for(const request of [
 {cmd:'apply',replica:p.name,ops:[{t:'node',id:{lamport:10,actor:'x'},origin:{lamport:0,actor:'~root'},type:'table',boundary:'0@~root|1@structureReject'}]},
 {cmd:'apply',replica:p.name,ops:[{t:'move'}]},
 {cmd:'apply',replica:p.name,ops:[{t:'set',at:{lamport:10,actor:'x'},ids:[p.doc.items[1].id],key:'$join',value:null}]},
 {cmd:'history_restore',replica:p.name,checkpoint:invalid},
 {cmd:'history_restore',replica:p.name,checkpoint:forged},
 ]){assert.equal((await native.raw(request)).ok,false);rejections++;await check(p,'structural reject preserves state/history');}}

let before:any;
try{before=hashes();native=new Native();await sequential();await aliases(0);await aliases(1);await separatedAliases();await foreignMerge();await structuralRestart();for(const seed of randomSeeds)await randomStructure(seed);await rejectionFixtures();const after=hashes();assert.deepEqual(after,before,'all sources and binary unchanged');writeFileSync(process.env.RUST_STRUCTURE_RECEIPT?resolve(process.env.RUST_STRUCTURE_RECEIPT):new URL('./structure.json',import.meta.url),JSON.stringify({status:'PASS',timestamp:new Date().toISOString(),node:process.version,binary,capability:'paragraph-markers-v1',randomSeeds,randomRounds,randomDelayedBatches,randomDuplicateBatches,stateComparisons:comparisons,historyGraphComparisons:historyComparisons,inverseOpComparisons:inverseComparisons,caretComparisons:inverseComparisons,pinComparisons,rejections,captureComparisons,rangeComparisons,endpointComparisons,processes:processNumber,restarts,recoveryCases,runtimeProvenance:provenance,hashesBefore:before,hashesAfter:after,proof:{reference:'actual production Doc/History, cmds.splitBlock/backspace/deleteForward, Doc.edit merge, InputSession capture/resolve, actual SyncClient.pending and DocHub',native:'independent Rust node birth/alias projection, History inverse generation, multi-paragraph anchor resolution',inputs:'ops, options, time, selection keys/positions and native-owned checkpoint; no expected states or inverse outputs sent to child',state:'all tokens immutable born/boundary, type register+ticket, attributes, tombstones/cancels, full blocks+aliases+character IDs, model UTF16 runs, clocks/counts, exact shared history graph',delivery:'three truly concurrent same-boundary Enters; both delivery orders, duplicate replay, primary alias re-election, reverse undo/redo; physically separated aliases preserve current block; foreign insertion across merge',recovery:'real pending split and merge; native joint checkpoint after original ops; fresh process, foreign edit, exact pending replay twice, unchanged history, later independent undo/redo',boundary:'only legacy paragraph node markers; no authored type updates/general attrs/moves/$join/GC/schema transitions; no generic rejection parity or whole R4 acceptance',wasm:'NOT_RUN',browser:'NOT_RUN',serverRecovery:'NOT_RUN',productionSwitch:'NOT_RUN'},records})+'\n');console.log(JSON.stringify({status:'PASS',states:comparisons,historyGraphs:historyComparisons,inverses:inverseComparisons,captureComparisons,rangeComparisons,endpointComparisons,rejections,restarts}));}
catch(error){writeFileSync(new URL('./failure.json',import.meta.url),JSON.stringify({status:'FAIL',error:String(error),stack:(error as Error).stack,hashesBefore:before,records})+'\n');throw error;}
finally{Date.now=originalNow;await native?.close();}
