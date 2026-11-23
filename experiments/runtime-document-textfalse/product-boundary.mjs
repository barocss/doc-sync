// Original descriptors are preserved. Removing unreachable nodes is diagnostic only.
import assert from 'node:assert/strict';
import {PRODUCT_SCHEMAS} from '../../fixtures/product-schemas.ts';
import {DEMO_SCHEMA} from '../../fixtures/demo-schema.ts';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=new URL('../../',import.meta.url).pathname;
const out=resolve(root,'output/rust-d2-textfalse-2026-11-04/compare-product/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const binaries={before:'output/rust-d2-patterns-2026-11-04/core/current-cli-01',current:process.env.TEXTFALSE_PRODUCT_BINARY??'output/rust-d2-textfalse-2026-11-04/native-target/debug/doc-sync-rust-shadow'};
const paths=[new URL(import.meta.url).pathname,...['fixtures/product-schemas.ts','fixtures/demo-schema.ts','packages/doc-sync/dist/crdt/schema.js','packages/doc-sync/dist/crdt/schema-version.js',...Object.values(binaries)].map(p=>resolve(root,p))];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));const before=hashes();assert.equal(before[resolve(root,binaries.before)],'d63f9745ea50ee616f47b169e6f9e6015c3e90262ce08fded9cfa83ecbabb7a0');
let failure=null;const results=[];
try{for(const[name,original]of Object.entries({demo:DEMO_SCHEMA,...PRODUCT_SCHEMAS})){
 const pruned=structuredClone(original),reachable=new Set(),visit=k=>{if(reachable.has(k))return;reachable.add(k);for(const c of pruned.nodes[k]?.children??[])visit(c);};visit(pruned.root);for(const k of Object.keys(pruned.nodes))if(!reachable.has(k))delete pruned.nodes[k];
 for(const[variant,schema]of [['original',original],['diagnostic-prune-unused',pruned]])for(const[stage,binary]of Object.entries(binaries)){
 const input=JSON.stringify({cmd:'new',replica:'a',actor:'A',schema:schemaVersion(schema),runtimeSchema:schema})+'\n',run=spawnSync(resolve(root,binary),[],{input,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const response=JSON.parse(run.stdout);const stem=stage+'-'+name+'-'+variant;writeFileSync(resolve(out,stem+'-request.jsonl'),input);writeFileSync(resolve(out,stem+'-response.jsonl'),run.stdout);
 if(stage==='before'){assert.equal(response.ok,false);assert.match(response.error,/text=false/);}else if(variant==='diagnostic-prune-unused'||['demo','notion'].includes(name))assert.equal(response.ok,true,name+' '+response.error);else {assert.equal(response.ok,false);assert.match(response.error,/unused|reachable/);}
 results.push({name,variant,stage,typescriptProblems:checkSchema(schema),native:response.ok?'COMPILE_PASS':response.error});
 }}assert.deepEqual(hashes(),before);}catch(e){failure=e.stack;console.error(failure);process.exitCode=1;}
writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:failure?'FAIL':'PASS',results,hashesBefore:before,hashesAfter:hashes(),failure,scope:'Original demo/notion/word/presentation descriptor compile only. Pruned unused declarations are diagnostics. No claim of full product authoring parity.'},null,2)+'\n');console.log(JSON.stringify({status:failure?'FAIL':'PASS',out,originals:results.filter(x=>x.variant==='original')}));
