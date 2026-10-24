// Receive/model comparison with preserved ID metadata. Fresh-process JS heap/RSS and core timings. Run with Node 22 and --expose-gc.
// The before module must be an immutable source copy, not a flag in the new code.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const [modulePath, workload = 'plain100k'] = process.argv.slice(2);
const {Doc} = await import(pathToFileURL(resolve(modulePath)));
const schema = {root:'content',marks:['bold','italic'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text',children:[]}}};
Doc.verifyBlocks = false;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const collect = () => { for(let i=0;i<4;i++)global.gc(); return process.memoryUsage(); };
const size = workload.includes('1m') ? 1_000_000 : 100_000;
const initial = collect();
let doc;
const start = performance.now();
function seed() {
 const d = new Doc('writer',schema);
 let origin = {lamport:0,actor:'~root'};
 const step = workload === 'sparse100k' ? 1 : workload === 'actors100k' || workload === 'marked100k' ? 1000 : size;
 for(let offset=0;offset<size;offset+=step){
  const actor = workload==='actors100k' ? `actor-${offset/step}` : 'writer';
  const id={lamport:workload==='sparse100k'?offset*2+1:offset+1,actor};
  const text='abcdef0123'.repeat(Math.ceil(step/10)).slice(0,step);
  d.apply({t:'text',id,origin,text,...(workload==='marked100k'?{marks:{bold:true}}:{})});
  origin={lamport:id.lamport+step-1,actor};
 }
 return d;
}
doc=seed();
const createMs=performance.now()-start;
let compactMs=null;
if(workload==='compacted100k'){
 const t=performance.now();
 doc.apply({t:'del',at:{lamport:size+1,actor:'deleter'},ids:Array.from({length:size},(_,i)=>({lamport:i+1,actor:'writer'}))});
 assert.equal(doc.compact(1,()=>1),size-1);
 compactMs=performance.now()-t;
}
const cold=collect();
let t=performance.now();
const modelHash=hash(doc.toJSON());
const modelMs=performance.now()-t;
const warm=collect();
const items=doc.items.length;
const index={logicalIDs:doc.byKey.size,ranges:doc.byKey.rangeCount??null,dense:doc.byKey.denseCount??null,sparse:doc.byKey.sparseCount??null};
// All expected contents and wire bytes are checked outside edit timing.
if(workload!=='compacted100k') assert.equal(doc.toJSON().children[0].runs.map(r=>r.text).join('').length,size);
const edits=[],receives=[],lookups=[];
for(let round=0;round<(size===1_000_000?40:110);round++){
 t=performance.now();
 for(let i=0;i<1000;i++){
  const n=(Math.imul(i+round,7919)>>>0)%size;
  const actor=workload==='actors100k'?`actor-${Math.floor(n/1000)}`:'writer';
  const key=`${workload==='sparse100k'?n*2+1:n+1}@${actor}`;
  assert.ok(doc.get(key));
 }
 if(round>=10)lookups.push((performance.now()-t)/1000);
 if(workload==='compacted100k')continue;
 t=performance.now();
 const op=doc.edit([{op:'insert',at:[0,Math.floor(size/2)],content:'x'}]).ops;
 const elapsed=performance.now()-t;
 // Apply the same change to a receiver whose baseline state is reconstructed later.
 if(round>=10)edits.push(elapsed);
 receives.push(op);
}
// A separate seeded receiver checks each operation, including warmups.
const receiver=seed(); collect(); const receive=[],applySamples=[],modelSamples=[];
for(let i=0;i<receives.length;i++){
 t=performance.now();receives[i].forEach(op=>receiver.apply(op));const applied=performance.now();receiver.toJSON();const modeled=performance.now();
 if(i>=10){receive.push(modeled-t);applySamples.push(applied-t);modelSamples.push(modeled-applied);}
}
if(workload!=='compacted100k')assert.deepEqual(receiver.toJSON(),doc.toJSON());
const snapshotStart=performance.now();
let snapshot=doc.snapshot();
const snapshotMs=performance.now()-snapshotStart;
const snapshotHash=hash(snapshot), snapshotBytes=JSON.stringify(snapshot).length;
const restoreStart=performance.now();
const restored=Doc.fromSnapshot('reader',snapshot,schema);
const restoreMs=performance.now()-restoreStart;
assert.deepEqual(restored.toJSON(),doc.toJSON());
assert.equal(hash(restored.snapshot()),snapshotHash);
const stats=values=>{const xs=values.slice();if(!xs.length)return null;xs.sort((a,b)=>a-b);return {n:xs.length,p50:xs[Math.ceil(xs.length*.5)-1],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
console.log(JSON.stringify({workload,size,node:process.version,initial,cold,warm,heapCold:cold.heapUsed-initial.heapUsed,heapWarm:warm.heapUsed-initial.heapUsed,rssCold:cold.rss,rssWarm:warm.rss,items,index,modelHash,snapshotHash,snapshotBytes,createMs,modelMs,compactMs,snapshotMs,restoreMs,editMs:stats(edits),receiveModelMs:stats(receive),applyMs:stats(applySamples),toJSONMs:stats(modelSamples),lookupMs:stats(lookups),samples:{editMs:edits,applyMs:applySamples,toJSONMs:modelSamples,receiveModelMs:receive,lookupMs:lookups},maxRSSKiB:process.resourceUsage().maxRSS}));
