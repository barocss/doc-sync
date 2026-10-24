// Control shapes: many paragraphs, alternating marks and span boundaries.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const [modulePath,workload]=process.argv.slice(2);
assert.ok(['paragraphs100k','alternating20k','links20k'].includes(workload));
const {Doc}=await import(pathToFileURL(resolve(modulePath)));Doc.verifyBlocks=false;
const schema={root:'content',marks:['bold','italic'],markValues:{link:{default:''}},nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text',children:['link']},link:{shape:'span',mark:'link',attr:'url'}}};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const doc=new Doc('writer',schema);
if(workload==='paragraphs100k')doc.edit([{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:Array.from({length:625},()=>({type:'paragraph',runs:[{text:'x'.repeat(160),marks:{}}]}))}]);
else if(workload==='alternating20k'){
 doc.apply({t:'text',id:{lamport:1,actor:'writer'},origin:{lamport:0,actor:'~root'},text:'x'.repeat(20_000)});
 doc.apply({t:'set',at:{lamport:20_001,actor:'formatter'},ids:Array.from({length:10_000},(_,i)=>({lamport:i*2+1,actor:'writer'})),key:'bold',value:true});
}else{
 let origin={lamport:0,actor:'~root'};
 for(let i=0;i<200;i++){
  doc.apply({t:'text',id:{lamport:i*100+1,actor:'writer'},origin,text:'x'.repeat(100),marks:{link:`https://${i%2}.test`,bold:i%3===0}});
  origin={lamport:(i+1)*100,actor:'writer'};
 }
}
const initialModelHash=hash(doc.toJSON()), initialSnapshotHash=hash(doc.snapshot());
const sender=Doc.fromSnapshot('editor',doc.snapshot(),schema),ops=[];
for(let i=0;i<40;i++)ops.push(sender.edit([{op:'insert',at:workload==='paragraphs100k'?[312,80]:[0,10_000],content:'y'}]).ops);
for(let i=0;i<4;i++)global.gc();
const samples=[];
for(let i=0;i<ops.length;i++){
 const start=performance.now();ops[i].forEach(op=>doc.apply(op));const applied=performance.now();doc.toJSON();const end=performance.now();
 if(i>=10)samples.push({applyMs:applied-start,toJSONMs:end-applied,totalMs:end-start});
}
assert.deepEqual(doc.toJSON(),sender.toJSON());
const stats=key=>{const a=samples.map(r=>r[key]).sort((a,b)=>a-b);return {n:a.length,p50:a[14],p95:a[28],max:a.at(-1)};};
console.log(JSON.stringify({workload,node:process.version,initialModelHash,initialSnapshotHash,finalModelHash:hash(doc.toJSON()),wireHash:hash(ops),applyMs:stats('applyMs'),toJSONMs:stats('toJSONMs'),receiveModelMs:stats('totalMs'),samples}));
