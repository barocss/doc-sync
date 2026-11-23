import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output=process.env.PARAGRAPH_OBSERVATION_OUT??new URL('../../output/rust-d3-paragraph-2026-11-04/compare-before/old-dist-observations.json',import.meta.url);
if(existsSync(output))throw new Error('Observation output exists; set PARAGRAPH_OBSERVATION_OUT to a new path');
const rows=[];
for(const [name,schema,kind] of [['word',WORD_SCHEMA,'section'],['presentation',PRESENTATION_SCHEMA,'slide']]) {
 for(const scenario of ['empty-container','nested-container']) {
  const d=new Doc('A',schema),pre=d.snapshot();
  const edit={op:'insert',at:[1],content:[{type:kind,children:scenario==='nested-container'?[{type:'paragraph',runs:[{text:'nested'}]}]:[]}]};
  let ops=[],error;try{ops=d.edit([edit]).ops;}catch(e){error=String(e);}
  rows.push({name,scenario,edit,ops,error,check:Doc.fromSnapshot('A',pre,schema).check(ops),model:d.toJSON(),clock:d.clock.lamport});
  if(scenario==='empty-container') {
   const before=d.snapshot(),edit2={op:'insert',at:[1,0],content:[{type:'paragraph',runs:[]}]};
   let ops2=[],error2;try{ops2=d.edit([edit2]).ops;}catch(e){error2=String(e);}
   rows.push({name,scenario:'fresh-explicit-paragraph',edit:edit2,ops:ops2,error:error2,check:Doc.fromSnapshot('A',before,schema).check(ops2),model:d.toJSON(),clock:d.clock.lamport});
  }
 }
}
const path=new URL('../../packages/doc-sync/dist/crdt/edit.js',import.meta.url);
writeFileSync(output,JSON.stringify({status:'DIST_COMPILER_OBSERVATION',editDistSha256:createHash('sha256').update(readFileSync(path)).digest('hex'),rows},null,2));
console.log(rows.map(r=>({name:r.name,scenario:r.scenario,check:r.check,ops:r.ops.length,clock:r.clock})));
