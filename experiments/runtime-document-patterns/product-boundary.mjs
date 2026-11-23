// Admission probes only. Altered descriptors are diagnostics, not product acceptance.
import assert from 'node:assert/strict';
import {PRODUCT_SCHEMAS} from '../../fixtures/product-schemas.ts';
import {DEMO_SCHEMA} from '../../fixtures/demo-schema.ts';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(root,process.env.PATTERNS_PRODUCT_OUT??`output/rust-d2-patterns-2026-11-04/compare-product/run-${new Date().toISOString().replaceAll(':','-')}-${process.pid}`);mkdirSync(out,{recursive:true});
const binaries={before:'output/rust-d2-fieldrefs-2026-11-04/core/current-cli-01',current:'output/rust-d2-patterns-2026-11-04/core/current-cli-01'};
const paths=['experiments/runtime-document-patterns/product-boundary.mjs','fixtures/product-schemas.ts','fixtures/demo-schema.ts','packages/doc-sync/src/crdt/schema.ts','packages/doc-sync/dist/crdt/schema.js','packages/doc-sync/dist/crdt/schema-version.js',...Object.values(binaries)];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
const before=hashes();assert.equal(before[binaries.before],'13dab18a8610bc7aa41116abe3d5a9c477a47d2b729b00311ed94da63c362e8f');
const results=[];
for(const[name,original]of Object.entries({demo:DEMO_SCHEMA,...PRODUCT_SCHEMAS})){
 const noText=structuredClone(original);for(const node of Object.values(noText.nodes))delete node.text;
 const pruned=structuredClone(noText),reachable=new Set(),visit=key=>{if(reachable.has(key))return;reachable.add(key);for(const child of pruned.nodes[key]?.children??[])visit(child);};visit(pruned.root);for(const key of Object.keys(pruned.nodes))if(!reachable.has(key))delete pruned.nodes[key];
 for(const[variant,schema]of [['original',original],['diagnostic-remove-text-false',noText],['diagnostic-remove-text-and-unreachable',pruned]])for(const[stage,binary]of Object.entries(binaries)){
  const input=JSON.stringify({cmd:'new',replica:'a',actor:'A',schema:schemaVersion(schema),runtimeSchema:schema})+'\n';const run=spawnSync(resolve(root,binary),[],{input,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const response=JSON.parse(run.stdout);const stem=`${stage}-${name}-${variant}`;writeFileSync(resolve(out,stem+'-request.jsonl'),input);writeFileSync(resolve(out,stem+'-response.jsonl'),run.stdout);writeFileSync(resolve(out,stem+'-stderr.log'),run.stderr);if(variant==='original'){assert.equal(response.ok,false);assert.match(response.error,stage==='before'?/pattern/:/text=false/);}results.push({name,variant,stage,typescriptProblems:checkSchema(schema),native:response.ok?'COMPILE_PASS':response.error});
 }
}
const after=hashes();assert.deepEqual(after,before);const receipt={status:'PASS',results,hashesBefore:before,hashesAfter:after,scope:'Original demo and three public representative product descriptors compiled before/current. Removing text:false and unused declarations is diagnostic only. No product acceptance or reachability changes.'};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',out,originals:results.filter(x=>x.variant==='original')}));
