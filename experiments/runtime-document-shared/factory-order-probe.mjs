// Native selected handles vs an independent direct JavaScript sharing graph.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {FORMAT,hydrate,identity,aliases,slotValue,normalized} from './schema.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.SHARED_FACTORY_OUT??'output/rust-d2-shared-2026-11-04/factory-order','run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const target=resolve(root,process.env.SHARED_FACTORY_TARGET??'output/rust-d2-shared-2026-11-04/factory-target'),binary=process.env.SHARED_FACTORY_BINARY??resolve(target,'debug/examples/runtime_shared_factory_trace');
const dirs=['experiments/runtime-document-shared','experiments/rust-shadow/src','experiments/rust-shadow/tests','experiments/rust-sdk/src','experiments/rust-sdk/tests','experiments/rust-sdk/examples','packages/doc-sync/src/crdt','packages/doc-sync/dist/crdt'];
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex'),hashes=(bin=false)=>{const paths=dirs.flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(rs|mjs|js|ts)$/.test(p)).map(p=>dir+'/'+p));if(bin)paths.push(relative(root,binary));return Object.fromEntries([...new Set(paths)].sort().map(p=>[p,hash(p)]));};
const archive=(name,h)=>{writeFileSync(resolve(out,name+'-hashes.json'),JSON.stringify(h,null,2));assert.equal(spawnSync('/usr/bin/tar',['-czf',resolve(out,name+'-sources.tar.gz'),...Object.keys(h)],{cwd:root}).status,0);};
const slot=(at,source='default',index)=>({at,source,...(source==='enum'?{index}:{})});
function fixture(array,enumOnly){
 const shared=array?[{b:2,a:1},['x',{d:4,c:3}]]:{b:2,a:1},other=array?[{z:9}]:{z:9},reorder=()=>array?[{a:1,b:2},['x',{c:3,d:4}]]:{a:1,b:2};
 const paintDefault=structuredClone(other),attrDefault=structuredClone(other),paint={default:enumOnly?paintDefault:shared,values:[shared,reorder(),paintDefault]},payload={default:attrDefault,values:[reorder(),shared,attrDefault]};
 const direct={domain:'document',root:'doc',marks:[],markValues:{paint},nodes:{doc:{shape:'flow',children:['p','atom'],default:'p'},p:{shape:'text'},atom:{shape:'atom',attrs:{payload}}}};
 const slots=[slot(['markValues','paint'],'enum',0),slot(['nodes','atom','attrs','payload'],'enum',1)];if(!enumOnly)slots.push(slot(['markValues','paint']));
 const manifest=JSON.parse(JSON.stringify(direct));manifest.markValues.paint.values[0]=reorder();if(!enumOnly)manifest.markValues.paint.default=reorder();
 // The representative is deliberately not the first sorted descriptor/slot.
 const defaultGroups=[{representative:slot(['nodes','atom','attrs','payload']),slots:[slot(['nodes','atom','attrs','payload']),slot(['nodes','atom','attrs','payload'],'enum',2)]}];if(enumOnly)defaultGroups.push({representative:slot(['markValues','paint']),slots:[slot(['markValues','paint']),slot(['markValues','paint'],'enum',2)]});const dto={format:FORMAT,manifest,referenceGroups:[{representative:slots[1],slots},...defaultGroups]};
 return{name:(array?'nested-array':'object')+(enumOnly?'-enum-only':'-default-enum'),direct,dto,slots};
}
const fixtures=[fixture(false,false),fixture(false,true),fixture(true,false),fixture(true,true)],input={schemas:fixtures.map(f=>f.dto)},before=hashes();archive('prebuild',before);writeFileSync(resolve(out,'input.json'),JSON.stringify(input,null,2));
let failure=null,native=null,frozen=null;const rows=[];
try{
 if(!process.env.SHARED_FACTORY_BINARY){const build=spawnSync('/opt/homebrew/bin/cargo',['build','--offline','--locked','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','runtime_shared_factory_trace'],{cwd:root,env:{...process.env,CARGO_TARGET_DIR:target},encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'build.stderr'),build.stderr);assert.equal(build.status,0,build.stderr);}
 assert.deepEqual(hashes(),before,'source changed during build');frozen=hashes(true);archive('frozen',frozen);
 const r=spawnSync(binary,[],{cwd:root,input:JSON.stringify(input),encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'native.stdout'),r.stdout);writeFileSync(resolve(out,'native.stderr'),r.stderr);assert.equal(r.status,0,r.stderr);native=JSON.parse(r.stdout);
 for(let i=0;i<fixtures.length;i++){
  const f=fixtures[i],x=native.schemas[i],rehydrated=hydrate(f.dto);assert.equal(x.identity,identity(f.dto));assert.equal(JSON.stringify(x.descriptor.manifest),JSON.stringify(f.dto.manifest));assert.deepEqual(normalized(x.descriptor),normalized(f.dto));assert.deepEqual(checkSchema(f.direct),[]);assert.deepEqual(checkSchema(rehydrated),[]);
  const paths=[];for(const g of f.dto.referenceGroups)for(const s of g.slots)if(!paths.some(p=>JSON.stringify(p)===JSON.stringify(s.at)))paths.push(s.at);
  let n=0;for(const at of paths){const d=at.reduce((v,k)=>v[k],f.direct);for(const index of [null,...d.values.map((_,i)=>i)]){
   const source=index===null?'default':'enum',s=slot(at,source,index),actual=x.factories[n++],value=slotValue(f.direct,s),hydratedValue=slotValue(rehydrated,s),expectedJson=JSON.stringify(value),hydratedJson=JSON.stringify(hydratedValue),nativeJson=JSON.stringify(actual.value),expectedReference={schema:x.identity,...s,path:['value']};
   assert.deepEqual(actual.reference,expectedReference,'selected original source and index');assert.equal(hydratedJson,expectedJson,'direct and DTO actual JS object order');assert.equal(nativeJson,expectedJson,'native representative and unlinked payload order');assert.deepEqual(aliases(rehydrated,at,hydratedValue),aliases(f.direct,at,value),'complete shared class');
   const directDoc=new Doc('A',f.direct),doc=new Doc('A',rehydrated),pre=new Doc('A',rehydrated),edit=at[0]==='markValues'?{op:'insert',at:[0,0],content:[{text:'X',marks:{paint:hydratedValue}}]}:{op:'insert',at:[1],content:[{type:'atom',attrs:{payload:hydratedValue}}]},ops=doc.edit([edit]).ops;assert.equal(pre.check(ops),null,'actual TS Doc.edit staged admission');const directEdit=at[0]==='markValues'?{op:'insert',at:[0,0],content:[{text:'X',marks:{paint:value}}]}:{op:'insert',at:[1],content:[{type:'atom',attrs:{payload:value}}]},directOps=directDoc.edit([directEdit]).ops;assert.equal(new Doc('A',f.direct).check(directOps),null);assert.equal(JSON.stringify(doc.toJSON()),JSON.stringify(directDoc.toJSON()),'direct graph and hydrated material model order');assert.equal(JSON.stringify(ops),JSON.stringify(directOps),'direct graph and hydrated raw operation payload order');rows.push({fixture:f.name,selected:s,expectedJson,hydratedJson,nativeJson,reference:actual.reference,actualTypeScriptCheck:null,directModel:directDoc.toJSON(),hydratedModel:doc.toJSON(),ops,identityClass:aliases(rehydrated,at,hydratedValue)});
  }}assert.equal(n,x.factories.length);
  for(const s of f.slots)assert.equal(slotValue(rehydrated,s),slotValue(rehydrated,f.dto.referenceGroups[0].representative));
 }
 assert.deepEqual(hashes(true),frozen,'whole probe immutable source and binary');
}catch(e){failure=e.stack;process.exitCode=1;writeFileSync(resolve(out,'raw-failure.json'),JSON.stringify({failure,input,native,rows},null,2));}
const receipt={status:failure?'FAIL':'PASS',scope:'Independent direct shared JavaScript graph, DTO hydrate and SDK selected factories; cross-attribute defaults/enums, enum-only groups, explicit representative, exact JSON.stringify order, equal unlinked order, actual staged TS Doc.edit/Doc.check',schemas:fixtures.length,factories:rows.length,sourceHashes:before,frozenHashes:frozen,rows,failure};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,out,factories:rows.length}));
