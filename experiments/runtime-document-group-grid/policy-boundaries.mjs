import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {applyEdits} from '../../packages/doc-sync/dist/crdt/model.js';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const root=new URL('../../',import.meta.url).pathname,base=resolve(root,'output/rust-d3-group-grid-2026-11-04');
const binary=resolve(base,'native-target/debug/examples/runtime_group_grid_trace');
const out=resolve(base,'compare-policy-boundaries/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const paths=[binary,new URL(import.meta.url).pathname,resolve(root,'fixtures/product-schemas.ts'),...['doc','edit','model'].map(n=>resolve(root,'packages/doc-sync/dist/crdt/'+n+'.js'))];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const before=hashes(),rows=[];
for(const[name,schema,container,group]of[['word-empty-list',WORD_SCHEMA,'section',true],['word-empty-table',WORD_SCHEMA,'section',false],['presentation-empty-table',PRESENTATION_SCHEMA,'slide',false],['presentation-textbox-empty-list',PRESENTATION_SCHEMA,'slide',true]]){
 const commands=[{label:'seed container',actor:'A',op:'insertModel',at:[1],model:{type:container,children:[]},alias:'container',time:1}];
 if(name.includes('textbox'))commands.push({label:'seed textbox',actor:'A',op:'insertModel',at:[1,1],model:{type:'text-box',children:[]},alias:'textbox',time:2});
 const at=name.includes('textbox')?[1,1,0]:[1,1],model={type:group?'list':'table',children:[]},edit={op:'insert',at,content:[model]};
 const d=new Doc('A',schema);for(const c of commands)d.edit([{op:'insert',at:c.at,content:[c.model]}]);
 const pre=d.snapshot(),canonicalBefore=d.toJSON(),expected=applyEdits(schema,canonicalBefore,[edit]);let ops=[],error=null;try{ops=d.edit([edit]).ops;}catch(e){error=String(e);}
 const reject={label:'native rejects empty keyless model before mutation',actor:'A',op:'rejectModel',at,model,time:commands.length+1};
 const run=spawnSync(binary,[],{input:JSON.stringify({documents:[{name,schema,commands:[...commands,reject]}],unsupported:[]}),encoding:'utf8'});assert.equal(run.status,0,run.stderr);const native=JSON.parse(run.stdout).documents[0];
 assert.deepEqual(native.trace.at(-1).A,native.trace.at(-2).A,name+' native full checkpoint state unchanged');
 rows.push({name,at,model,typescript:{route:'actual Doc.edit; empty normalization is observed separately',error,ops,wireProblem:Doc.fromSnapshot('A',pre,schema).check(ops),canonicalBefore,expected,canonicalAfter:d.toJSON(),clockBefore:pre.lamport,clockAfter:d.clock.lamport},native:{route:'SDK rejectModel: atomic rejection, no synthetic returned key',fullStateUnchanged:true,trace:native.trace}});
}
assert.deepEqual(hashes(),before);writeFileSync(resolve(out,'results.json'),JSON.stringify(rows,null,2)+'\n');writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:'OBSERVED_POLICY_BOUNDARY',cases:rows.length,hashesBefore:before,hashesAfter:hashes(),scope:'Empty group/grid inputs: actual TS normalization/drop behavior versus native atomic rejection because (Key,Change) cannot identify a stored result. Different accepted input policy; no empty-input logical equivalence claim.'},null,2)+'\n');console.log(JSON.stringify({status:'OBSERVED_POLICY_BOUNDARY',out}));
