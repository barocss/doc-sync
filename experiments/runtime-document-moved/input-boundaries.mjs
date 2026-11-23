import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const root=new URL('../../',import.meta.url).pathname;
const binary=resolve(root,'output/rust-d3-moved-2026-11-04/native-target/debug/examples/runtime_moved_trace');
const out=resolve(root,'output/rust-d3-moved-2026-11-04/compare-input-boundaries/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const paths=[binary,new URL(import.meta.url).pathname,resolve(root,'fixtures/product-schemas.ts'),resolve(root,'packages/doc-sync/dist/crdt/edit.js')];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const before=hashes(),rows=[];
for(const[name,schema,kind]of[['word',WORD_SCHEMA,'section'],['presentation',PRESENTATION_SCHEMA,'slide']]){
 const d=new Doc('A',schema);d.edit([{op:'insert',at:[1],content:[{type:kind,children:[]}]}]);
 const pre=d.snapshot(),model={type:'paragraph',attrs:{style:{align:'bad',spacing:1,indent:0}},runs:[]};
 const ops=d.edit([{op:'insert',at:[1,0],content:[model]}]).ops;
 assert.equal(Doc.fromSnapshot('A',pre,schema).check(ops),null);
 const commands=[{label:'empty container',actor:'A',op:'insertBlock',kind,after:'rootHead',time:1},{label:'native strict input rejection',actor:'A',op:'rejectParagraph',at:[1,0],model,time:2}];
 const run=spawnSync(binary,[],{input:JSON.stringify({documents:[{name,schema,commands}],unsupported:[]}),encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);const native=JSON.parse(run.stdout).documents[0];
 assert.deepEqual(native.trace[1].A,native.trace[0].A);
 rows.push({name,inputModel:model,typescript:{route:'actual Doc.edit supplied attr normalization',ops,wireAdmission:null,model:d.toJSON()},native:{route:'SDK strict malformed attribute rejection before mutation',checkpointUnchanged:true,trace:native.trace}});
}
assert.deepEqual(hashes(),before);
writeFileSync(resolve(out,'results.json'),JSON.stringify(rows,null,2)+'\n');
writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:'OBSERVED_INPUT_BOUNDARY',hashesBefore:before,hashesAfter:hashes(),scope:'Existing TS Doc.edit normalizes invalid supplied attrs while native SDK rejects them before mutation. Different accepted input surfaces; no logical invalid-input equivalence claim. Raw invalid field wire rejection is tested in the main comparison.'},null,2)+'\n');
console.log(JSON.stringify({status:'OBSERVED_INPUT_BOUNDARY',out}));
