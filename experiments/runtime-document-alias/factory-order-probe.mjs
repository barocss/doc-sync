// Actual JavaScript object order vs independently selected native schema handles.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {FORMAT,hydrate,identity,aliases} from './schema.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.ALIAS_FACTORY_OUT??'output/rust-d2-alias-2026-11-04/factory-order','run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const target=resolve(root,process.env.ALIAS_FACTORY_TARGET??'output/rust-d2-alias-2026-11-04/factory-order-target'),binary=process.env.ALIAS_FACTORY_BINARY??resolve(target,'debug/examples/runtime_alias_factory_trace');
const dirs=['experiments/runtime-document-alias','experiments/rust-shadow/src','experiments/rust-shadow/tests','experiments/rust-sdk/src','experiments/rust-sdk/tests','experiments/rust-sdk/examples','packages/doc-sync/src/crdt','packages/doc-sync/dist/crdt'];
const sha=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const hashes=(withBinary=false)=>{const paths=new Set(['experiments/rust-shadow/Cargo.toml','experiments/rust-shadow/Cargo.lock','experiments/rust-sdk/Cargo.toml','experiments/rust-sdk/Cargo.lock','experiments/runtime-document-composite/fixtures.mjs']);for(const dir of dirs)for(const p of readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(rs|ts|js|mjs)$/.test(p)))paths.add(dir+'/'+p);if(withBinary)paths.add(relative(root,binary));return Object.fromEntries([...paths].sort().map(p=>[p,sha(p)]));};
const archive=(name,h)=>{writeFileSync(resolve(out,name+'-hashes.json'),JSON.stringify(h,null,2)+'\n');const r=spawnSync('/usr/bin/tar',['-czf',resolve(out,name+'-sources.tar.gz'),...Object.keys(h)],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
function fixture(array,multi){
 const payload=()=>array?[{a:1,b:2},['x',{c:3,d:4}]]:{a:1,b:2},reordered=()=>array?[{b:2,a:1},['x',{d:4,c:3}]]:{b:2,a:1};
 const spec=()=>{const def=payload();return{default:def,values:[def,reordered(),multi?def:reordered()]};};
 // The direct schema is constructed with actual shared references, before a DTO exists.
 const direct={domain:'document',root:'doc',marks:[],markValues:{paint:spec()},nodes:{doc:{shape:'flow',children:['p','atom'],default:'p'},p:{shape:'text'},atom:{shape:'atom',attrs:{payload:spec()}}}};
 const at=[['markValues','paint'],['nodes','atom','attrs','payload']],manifest=JSON.parse(JSON.stringify(direct)),defaultReferences=[];
 for(const path of at){const d=path.reduce((v,k)=>v[k],manifest);d.values[0]=reordered();defaultReferences.push({at:path,enumIndex:0});if(multi){d.values[2]=reordered();defaultReferences.push({at:path,enumIndex:2});}}
 return{name:(array?'nested-array':'object')+(multi?'-multi-edge':'-single-edge'),direct,dto:{format:FORMAT,manifest,defaultReferences},at,array,multi};
}
const fixtures=[fixture(false,false),fixture(false,true),fixture(true,false),fixture(true,true)],input={schemas:fixtures.map(f=>f.dto)};
const before=hashes();archive('before-build',before);writeFileSync(resolve(out,'input.json'),JSON.stringify(input,null,2)+'\n');
let failure=null,native=null,frozen=null;const rows=[];
try{
 if(!process.env.ALIAS_FACTORY_BINARY){const r=spawnSync('/opt/homebrew/bin/cargo',['build','--offline','--locked','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','runtime_alias_factory_trace'],{cwd:root,env:{...process.env,CARGO_TARGET_DIR:target},encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'build.stdout'),r.stdout);writeFileSync(resolve(out,'build.stderr'),r.stderr);assert.equal(r.status,0,r.stderr);}
 assert.deepEqual(hashes(),before,'sources unchanged during factory build');frozen=hashes(true);archive('frozen',frozen);
 const r=spawnSync(binary,[],{cwd:root,input:JSON.stringify(input),encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'native.stdout'),r.stdout);writeFileSync(resolve(out,'native.stderr'),r.stderr);assert.equal(r.status,0,r.stderr);native=JSON.parse(r.stdout);assert.equal(native.schemas.length,fixtures.length);
 for(let i=0;i<fixtures.length;i++){
  const f=fixtures[i],x=native.schemas[i],rehydrated=hydrate(f.dto);assert.equal(x.identity,identity(f.dto),f.name+' graph identity');assert.equal(JSON.stringify(x.descriptor),JSON.stringify(f.dto),f.name+' descriptor keeps raw manifest order and graph');assert.deepEqual(checkSchema(f.direct),[]);assert.deepEqual(checkSchema(rehydrated),[]);assert.equal(x.factories.length,8,f.name+' complete factories');
  let n=0;for(const at of f.at){const direct=at.reduce((v,k)=>v[k],f.direct),hydrated=at.reduce((v,k)=>v[k],rehydrated);for(const index of [null,0,1,2]){
   const actual=x.factories[n++],value=index===null?direct.default:direct.values[index],hydratedValue=index===null?hydrated.default:hydrated.values[index],source=index===null?'default':'enum',expectedReference={schema:x.identity,at,source,...(index===null?{}:{index}),path:['value']};
   assert.deepEqual({at:actual.at,source:actual.source,...(actual.index===undefined?{}:{index:actual.index})},{at,source,...(index===null?{}:{index})},f.name+' complete selected factory');assert.deepEqual(actual.reference,expectedReference,f.name+' selected metadata is preserved');
   const expectedJson=JSON.stringify(value),hydratedJson=JSON.stringify(hydratedValue),nativeJson=JSON.stringify(actual.value);assert.equal(hydratedJson,expectedJson,f.name+' direct and rehydrated actual JS order');assert.equal(nativeJson,expectedJson,f.name+'/'+at.join('.')+'/'+source+':'+index+' exact factory object order');
   assert.equal(value===direct.default,index===null||index===0||f.multi&&index===2,'actual direct alias class');assert.equal(hydratedValue===hydrated.default,index===null||index===0||f.multi&&index===2,'actual rehydrated alias class');
   // Use the actual shared value in a TypeScript edit and check its authored op.
   const d=new Doc('A',rehydrated),pre=Doc.fromSnapshot('A',d.snapshot(),rehydrated),edit=at[0]==='markValues'?{op:'insert',at:[0,0],content:[{text:'X',marks:{paint:hydratedValue}}]}:{op:'insert',at:[1],content:[{type:'atom',attrs:{payload:hydratedValue}}]},ops=d.edit([edit]).ops;assert.equal(pre.check(ops),null,'actual TypeScript factory value admitted');
   rows.push({fixture:f.name,at,source,...(index===null?{}:{index}),expectedJson,hydratedJson,nativeJson,reference:actual.reference,identityClass:aliases(rehydrated,at,hydratedValue),actualTypeScriptCheck:null,authoredOps:ops});
  }}
 }
 assert.deepEqual(hashes(true),frozen,'sources and final binary unchanged for whole factory probe');
}catch(e){failure=e.stack;process.exitCode=1;writeFileSync(resolve(out,'raw-failure.json'),JSON.stringify({failure,input,native,rows},null,2)+'\n');}
const receipt={status:failure?'FAIL':'PASS',scope:'Independent native SDK SchemaValue factories vs direct shared-reference TypeScript schema and rehydrated DTO; exact JSON.stringify property order, object/nested-array defaults, single/multiple alias edges, equal unlinked enum slots, selected source/index metadata, actual TS Doc.edit/Doc.check',schemas:fixtures.length,factories:rows.length,sourceHashesBefore:before,frozenHashes:frozen,rows,notRun:['Actual TypeScript server envelope interoperability','Network','Renderer','WASM','Mobile','Process crash recovery'],failure};writeFileSync(resolve(out,'after-hashes.json'),JSON.stringify(hashes(!!frozen),null,2)+'\n');writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,out,schemas:receipt.schemas,factories:receipt.factories}));
