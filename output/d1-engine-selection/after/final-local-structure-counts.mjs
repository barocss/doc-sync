import fs from 'node:fs';import assert from 'node:assert/strict';
const started=new Date().toISOString(),[A,B]=await Promise.all([import('./local-structure-helper-baseline.mjs'),import('./local-structure-helper-candidate.mjs')]);
const rows=[];for(const size of [10000,100000]){
 const fixtures={A:A.setup(size),B:B.setup(size)},helpers={A,B};
 try{for(let iteration=0;iteration<2;iteration++)for(const scenario of ['native-pm-local-split','native-pm-local-join']){
  const versions={};for(const label of ['A','B']){
   const h=helpers[label],f=fixtures[label],middle=Math.floor((f.binding.state.doc.childCount-(scenario.endsWith('join')?1:0))/2),before=f.client.doc.toJSON();
   let pos=1;for(let i=0;i<middle;i++)pos+=f.binding.state.doc.child(i).nodeSize;pos+=3;
   const split=scenario.endsWith('split'),edits=split?[{op:'split',at:[middle,3]}]:[{op:'merge',at:[middle+1]}];
   const action=()=>f.binding.dispatch(split?f.binding.state.tr.split(pos):f.binding.state.tr.join(pos+1));
   const expected=h.applyEdits(h.schema,before,edits),pending=f.client.pending.length,result=h.measure(action);
   const invariant=h.verify(f,'insert',{expected},result,pending);versions[label]={counts:result.counts,invariant};
  }
  const semantic={};for(const key of ['modelHash','generatedHash','historyHash']){semantic[key]=versions.A.invariant[key]===versions.B.invariant[key];assert.ok(semantic[key]);}
  rows.push({size,iteration,scenario,versions,semantic,countsEqual:JSON.stringify(versions.A.counts)===JSON.stringify(versions.B.counts)});
 }}finally{fixtures.A.close();fixtures.B.close();}
}
const afterA=await A.fingerprint(),afterB=await B.fingerprint();const report={result:rows.every(r=>r.countsEqual)?'PASS':'FAIL',started,ended:new Date().toISOString(),boundary:'Additional counts-only real ProseMirror tr.split/tr.join scenarios; NOT original20 benchmark. All semantic/history/pending/binding/native model assertions retained. Snapshot/fromSnapshot count hard-gate comparison reported rather than thrown, to expose complex-edit preflight costs. Final candidate dist/source frozen for this counts gate. No timing conclusion.',originalBenchmarkUntouched:true,baselineSourceUnchanged:A.before.aggregate===afterA.aggregate,candidateSourceUnchanged:B.before.aggregate===afterB.aggregate,baselineFingerprint:A.before,candidateFingerprint:B.before,rows};fs.writeFileSync('output/d1-engine-selection/after/final-local-structure-counts.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,candidateSourceUnchanged:report.candidateSourceUnchanged,rows:rows.map(r=>({size:r.size,scenario:r.scenario,iteration:r.iteration,before:r.versions.A.counts,after:r.versions.B.counts,semantic:r.semantic}))},null,2));
