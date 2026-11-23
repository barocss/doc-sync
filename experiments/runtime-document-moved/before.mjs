import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const root=new URL('../../',import.meta.url).pathname;
const base=resolve(root,'output/rust-d3-moved-2026-11-04');
const pin=JSON.parse(readFileSync(resolve(base,'before-pins.json')));
const binary=resolve(root,pin.binary),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(sha(binary),pin.sha256);
const out=resolve(base,'compare-before/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const rows=[];
for(const[name,schema]of[['word',WORD_SCHEMA],['presentation',PRESENTATION_SCHEMA]]){
 const commands=[{label:'physical seed paragraph',actor:'A',op:'insertBlock',kind:'paragraph',after:'rootHead',alias:'seed',time:1},{label:'actual old head reorder before compilation',actor:'A',op:'rawMove',target:'rootHead',parent:null,after:'seed',time:2}];
 const prefix=spawnSync(binary,[],{input:JSON.stringify({documents:[{name,schema,commands}],unsupported:[]}),encoding:'utf8'});assert.equal(prefix.status,0,prefix.stderr);
 const insertion={label:'model paragraph AFTER movement history',actor:'A',op:'insertParagraph',at:[1],model:{type:'paragraph',runs:[{text:'AFTER😀'}]},time:3};
 const full=spawnSync(binary,[],{input:JSON.stringify({documents:[{name,schema,commands:[...commands,insertion]}],unsupported:[]}),encoding:'utf8'});
 assert.notEqual(full.status,0);assert.match(full.stderr,/model insertion after movement is unsupported/);
 rows.push({name,nodeCount:Object.keys(schema.nodes).length,commands:[...commands,insertion],prefix:JSON.parse(prefix.stdout),afterMovement:{exit:full.status,stdout:full.stdout,stderr:full.stderr},classification:'PINNED_OLD_SDK_BLANKET_REJECTION_AFTER_MOVE'});
}
assert.equal(sha(binary),pin.sha256);
writeFileSync(resolve(out,'results.json'),JSON.stringify(rows,null,2)+'\n');
writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:'OBSERVED_OLD_REJECTION',binary:pin,binaryUnchanged:true,scope:'Old paragraph SDK/adapter, original unpruned Word23 and Presentation27. A valid recorded Move occurs before the model insertion call. This does not rewrite the older compile-before-foreign-move corpus.',rows:rows.length},null,2)+'\n');
console.log(JSON.stringify({status:'OBSERVED_OLD_REJECTION',out}));
