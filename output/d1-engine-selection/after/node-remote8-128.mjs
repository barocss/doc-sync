import fs from 'node:fs';import assert from 'node:assert/strict';import {performance,PerformanceObserver} from 'node:perf_hooks';
const [A,B]=await Promise.all([import('./paired-helper-baseline.mjs'),import('./paired-helper-candidate.mjs')]),out='output/d1-engine-selection/after/receive-final-node-remote8-128.json',started=new Date().toISOString(),gc=[];let observer;
const gcSupported=PerformanceObserver.supportedEntryTypes?.includes('gc')??false;if(gcSupported){observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){gc.push({startTime:e.startTime,duration:e.duration,detail:e.detail??null});if(gc.length>2048)gc.shift();}});observer.observe({entryTypes:['gc']});}
const q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*p)-1],blocks=[];const save=()=>fs.writeFileSync(out,JSON.stringify({started,ended:new Date().toISOString(),node:process.version,method:'Sameprocess A/B ABBA;4independent32sampleblocks perversion,2warmups each. Resetfixture atblockboundary; identical original10kprelude insert/delete/mark/selection/presence/remote1/remote2 (10actions/version each) before remote8. Original8/32results preserved. CPUdiagnostic only. GCobserver bounded2048entries; callbackflush onlyafterblock, noyield inserted betweenactions.',gcSupported,blocks,gc},null,2)+'\n');
for(let block=0;block<4;block++){
 const helpers={A,B},fixtures={A:A.setup(10000),B:B.setup(10000)},records={A:[],B:[]};
 try{for(const scenario of ['insert','delete','mark','selection','presence','remote1','remote2','remote8'])for(let index=0;index<(scenario==='remote8'?34:10);index++)for(const label of index%2?['B','A']:['A','B']){
  const h=helpers[label],f=fixtures[label],prepared=h.prepare(f,scenario,index),pending=f.client.pending.length,cpuStart=process.cpuUsage(),actionStart=performance.now(),result=h.measure(prepared.action),actionEnd=performance.now(),cpu=process.cpuUsage(cpuStart),invariant=h.verify(f,scenario,prepared,result,pending);
  if(scenario==='remote8'&&index>=2)records[label].push({index,actionStart,actionEnd,wallMs:result.ms,cpuMs:(cpu.user+cpu.system)/1000,counts:result.counts,invariant});
 }}finally{fixtures.A.close();fixtures.B.close();}
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 for(let i=0;i<32;i++){for(const key of ['modelHash','generatedHash','historyHash'])assert.equal(records.A[i].invariant[key],records.B[i].invariant[key]);assert.deepEqual(records.A[i].counts,records.B[i].counts);}
 for(const label of ['A','B'])for(const row of records[label])row.gcOverlaps=gc.filter(g=>g.startTime<row.actionEnd&&g.startTime+g.duration>row.actionStart);
 const summary=Object.fromEntries(['A','B'].map(label=>[label,Object.fromEntries(['wallMs','cpuMs'].map(k=>[k,{p50:q(records[label].map(r=>r[k]),.5),p95:q(records[label].map(r=>r[k]),.95)}]))]));blocks.push({block,size:10000,scenario:'remote8',records,summary});save();console.log(JSON.stringify({block,summary}));
}
assert.equal((await A.fingerprint()).aggregate,A.before.aggregate);assert.equal((await B.fingerprint()).aggregate,B.before.aggregate);observer?.disconnect();save();
