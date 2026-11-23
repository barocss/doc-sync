import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const started=new Date().toISOString();
const [A,B]=await Promise.all([import('./paired-helper-baseline.mjs'),import('./paired-helper-candidate.mjs')]);
const scenarios=['insert','delete','mark','selection','presence','remote1','remote2','remote8','composition','structure'];
const q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1];
const rows=[];
const save=()=>fs.writeFileSync('output/d1-engine-selection/after/node-interleaved.json',JSON.stringify({format:1,started,ended:new Date().toISOString(),method:'Same Node process, same scenario/size; action order A B B A repeated. Two warmups plus eight samples per version. Wall uses original harness measure(). process.cpuUsage(user+system)/1000 per action is diagnostic only; original wall budget unchanged. Semantic verification outside timed interval.',node:process.version,baselineFingerprint:A.before,candidateFingerprint:B.before,rows},null,2)+'\n');
for(const size of [10000,100000]){
 const fixtures={A:A.setup(size),B:B.setup(size)},helpers={A,B};
 try{
 for(const scenario of scenarios){
  const records={A:[],B:[]};
  for(let index=0;index<10;index++)for(const label of index%2?['B','A']:['A','B']){
   const h=helpers[label],f=fixtures[label],prepared=h.prepare(f,scenario,index),pending=f.client.pending.length;
   const cpuStart=process.cpuUsage(),wallStart=performance.now();const result=h.measure(prepared.action);const cpu=process.cpuUsage(cpuStart),wallOuter=performance.now()-wallStart;
   const invariant=h.verify(f,scenario,prepared,result,pending);
   if(index>=2)records[label].push({index,wallMs:result.ms,cpuMs:(cpu.user+cpu.system)/1000,wallOuterMs:wallOuter,counts:result.counts,invariant});
  }
  const summary=Object.fromEntries(['A','B'].map(label=>[label,Object.fromEntries(['wallMs','cpuMs'].map(metric=>[metric,{p50:q(records[label].map(r=>r[metric]),.5),p95:q(records[label].map(r=>r[metric]),.95)}]))]));
  for(let i=0;i<8;i++){for(const key of ['modelHash','generatedHash','historyHash'])assert.equal(records.A[i].invariant[key],records.B[i].invariant[key]);assert.deepEqual(records.A[i].counts,records.B[i].counts);}
  rows.push({size,scenario,summary,records});save();console.log(JSON.stringify({size,scenario,summary}));
 }
 }finally{fixtures.A.close();fixtures.B.close();}
}
assert.equal((await A.fingerprint()).aggregate,A.before.aggregate);assert.equal((await B.fingerprint()).aggregate,B.before.aggregate);save();
