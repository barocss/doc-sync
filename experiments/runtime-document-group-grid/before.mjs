import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
import {list,table} from './fixtures.mjs';
const root=new URL('../../',import.meta.url).pathname,base=resolve(root,'output/rust-d3-group-grid-2026-11-04');
const pin=JSON.parse(readFileSync(resolve(base,'before-pins.json'))),binary=resolve(root,pin.binary),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');assert.equal(sha(binary),pin.sha256);
const out=resolve(base,'compare-before/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const rows=[];
for(const[name,schema,container,model,at]of[
 ['word-list-model',WORD_SCHEMA,'section',list,[1,0]],
 ['word-table-model',WORD_SCHEMA,'section',table,[1,1]],
 ['presentation-table-model',PRESENTATION_SCHEMA,'slide',table,[1,1]],
]){
 const commands=[{label:'seed original container',actor:'A',op:'insertModel',at:[1],model:{type:container,children:[]},alias:'container',time:1}];
 const prefix=spawnSync(binary,[],{input:JSON.stringify({documents:[{name,schema,commands}],unsupported:[]}),encoding:'utf8'});assert.equal(prefix.status,0,prefix.stderr);
 const command={label:'nonempty group or grid model on old SDK',actor:'A',op:'insertModel',at,model,time:2};
 const run=spawnSync(binary,[],{input:JSON.stringify({documents:[{name,schema,commands:[...commands,command]}],unsupported:[]}),encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/model insertion supports text and flow nodes|unsupported|group|grid/i);
 rows.push({name,nodeCount:Object.keys(schema.nodes).length,commands:[...commands,command],prefix:JSON.parse(prefix.stdout),rejection:{exit:run.status,stdout:run.stdout,stderr:run.stderr},classification:'PINNED_OLD_MODEL_SHAPE_REJECTION'});
}
assert.equal(sha(binary),pin.sha256);writeFileSync(resolve(out,'results.json'),JSON.stringify(rows,null,2)+'\n');writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:'OBSERVED_OLD_REJECTION',binary:pin,binaryUnchanged:true,cases:rows.length,scope:'Pinned moved SDK/adapter, original unpruned Word23 and Presentation27, nonempty schema-valid group/grid models. Separate from empty-policy and invalid parent placement boundaries.'},null,2)+'\n');console.log(JSON.stringify({status:'OBSERVED_OLD_REJECTION',out}));
