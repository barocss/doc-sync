import assert from 'node:assert/strict';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=new URL('../../',import.meta.url).pathname;
const out=resolve(root,'output/rust-d3-moved-2026-11-04/compare-regression-unused-product/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const binaries={before:'output/rust-d2-textfalse-2026-11-04/native-target/debug/doc-sync-rust-shadow',current:process.env.UNUSED_PRODUCT_BINARY??'output/rust-d2-unused-2026-11-04/native-target/debug/doc-sync-rust-shadow'};
const paths=[new URL(import.meta.url).pathname,resolve(root,'fixtures/product-schemas.ts'),...Object.values(binaries).map(p=>resolve(root,p))];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
let failure=null,before;const results=[];
try{before=hashes();assert.equal(before[resolve(root,binaries.before)],'760870d05debe9c10fcaad4683a4b3fd01edbcd129095bb3bbf7fddcb364c0b0');for(const[name,schema]of Object.entries({word:WORD_SCHEMA,presentation:PRESENTATION_SCHEMA})){assert.deepEqual(checkSchema(schema),[]);assert(Object.hasOwn(schema.nodes,name==='word'?'divider':'heading1'));for(const[stage,binary]of Object.entries(binaries)){const request={cmd:'new',replica:'a',actor:'A',schema:schemaVersion(schema),runtimeSchema:schema},r=spawnSync(resolve(root,binary),[],{input:JSON.stringify(request)+'\n',encoding:'utf8'});assert.equal(r.status,0,r.stderr);const response=JSON.parse(r.stdout);assert.equal(response.ok,stage==='current',name+'/'+stage);if(stage==='before')assert.match(response.error,/unused|reachable/);writeFileSync(resolve(out,stage+'-'+name+'-request.json'),JSON.stringify(request,null,2)+'\n');writeFileSync(resolve(out,stage+'-'+name+'-response.json'),JSON.stringify(response,null,2)+'\n');results.push({name,stage,identity:schemaVersion(schema),nodeCount:Object.keys(schema.nodes).length,response});}}assert.deepEqual(hashes(),before);}catch(e){failure=e.stack;console.error(failure);process.exitCode=1;}
writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:failure?'FAIL':'PASS',results,hashesBefore:before,hashesAfter:hashes(),failure,scope:'Exact original unpruned Word and Presentation compile admission only; previous text:false binary frozen by SHA. Full product authoring parity is not claimed.'},null,2)+'\n');console.log(JSON.stringify({status:failure?'FAIL':'PASS',out}));
