import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
const root=new URL('../../',import.meta.url).pathname,binary=resolve(root,'output/rust-d2-unused-2026-11-04/native-target/debug/examples/runtime_textfalse_trace');
const out=resolve(root,'output/rust-d2-unused-2026-11-04/compare-compiler-boundaries/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const paths=[binary,new URL(import.meta.url).pathname,resolve(root,'fixtures/product-schemas.ts'),resolve(root,'packages/doc-sync/dist/crdt/doc.js')];const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const before=hashes(),results=[];
for(const[name,schema,container]of [['word',WORD_SCHEMA,'section'],['presentation',PRESENTATION_SCHEMA,'slide']]){
 const probes=[{name:'empty branch insertion',edit:{op:'insert',at:[1],content:[{type:container,children:[]}]},command:{op:'insertBlock',kind:container,after:'rootHead'}},{name:'model insertion with nested text',edit:{op:'insert',at:[1],content:[{type:container,children:[{type:'paragraph',runs:[{text:'nested'}]}]}]},command:{op:'insertBlock',kind:container,after:'rootHead'}},{name:'same type compiler update',edit:{op:'update',at:[0],attrs:{type:'paragraph'}},command:{op:'set',target:'rootHead',key:'$type',value:'paragraph'}}];
 for(const p of probes){const d=new Doc('A',schema),pre=d.snapshot();let tsError=null,tsOps=[];try{tsOps=d.edit([p.edit]).ops;}catch(e){tsError=String(e);}const payload={documents:[{name:name+'/'+p.name,schema,commands:[{label:p.name,actor:'A',time:1,...p.command}]}],unsupported:[]};const run=spawnSync(binary,[],{input:JSON.stringify(payload),encoding:'utf8'});let native=null;try{native=JSON.parse(run.stdout);}catch{}const nativeOps=native?.documents?.[0]?.trace?.[0]?.ops??null;results.push({name,probe:p.name,scope:p.name==='model insertion with nested text'?'TS model insertion carries children; native block-insertion command carries no children; different compiler surfaces, no equivalence claim':'Independent compiler surface observation',tsError,tsOps,tsWireProblem:Doc.fromSnapshot('A',pre,schema).check(tsOps),tsModel:d.toJSON(),nativeExit:run.status,nativeStdout:run.stdout,nativeStderr:run.stderr,nativeOps,exactOpsEqual:JSON.stringify(tsOps)===JSON.stringify(nativeOps),classification:'D3_COMPILER_BOUNDARY_NOT_D2_UNUSED_PASS'});}
}
// The direct paragraph insertion into a fresh slide emits a null style write.
{
 const d=new Doc('A',PRESENTATION_SCHEMA);d.edit([{op:'insert',at:[1],content:[{type:'slide',children:[]}]}]);
 const snapshot=d.snapshot();const ops=d.edit([{op:'insert',at:[1,0],content:[{type:'paragraph',runs:[]}]}]).ops;
 const problem=Doc.fromSnapshot('A',snapshot,PRESENTATION_SCHEMA).check(ops);
 assert.equal(typeof problem,'string');
 results.push({name:'presentation',probe:'direct fresh slide paragraph',tsOps:ops,tsWireProblem:problem,classification:'D3_COMPILER_BOUNDARY_NOT_D2_UNUSED_PASS',scope:'TS Doc.edit compiler observation only; main product trace uses an allowed text-box parent.'});
}
assert.deepEqual(hashes(),before);writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2)+'\n');writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:'OBSERVED',observations:results.length,hashesBefore:before,hashesAfter:hashes(),scope:'Known D3 model insertion, empty branch insertion and same-type logical compiler observations, kept separate from D2 schema registry admission. No parity assertion or broad product claim.'},null,2)+'\n');console.log(JSON.stringify({status:'OBSERVED',out,observations:results.length}));
