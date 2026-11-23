import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {documents} from './fixtures.mjs';
import {hydrate,identity,slotValue} from './schema.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.FIELDREFS_SCOPE_OUT??'output/rust-d2-fieldrefs-2026-11-04/compare-scope','run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const binary=process.env.FIELDREFS_CORE_BINARY??resolve(root,'output/rust-d2-fieldrefs-2026-11-04/native-target/debug/doc-sync-rust-shadow');
const dirs=['experiments/runtime-document-fieldrefs','experiments/rust-shadow/src','packages/doc-sync/src/crdt','packages/doc-sync/dist/crdt'];const hashes=()=>Object.fromEntries([...dirs.flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(rs|js|ts|mjs)$/.test(p)).map(p=>dir+'/'+p)),relative(root,binary)].sort().map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));const before=hashes();writeFileSync(resolve(out,'hashes-before.json'),JSON.stringify(before,null,2));
const child=spawn(binary,[],{cwd:root,stdio:['pipe','pipe','pipe']}),pending=[],wire=[];let stderr='';child.stderr.on('data',b=>stderr+=b);createInterface({input:child.stdout}).on('line',line=>pending.shift()?.(JSON.parse(line)));
const f=documents[0],dto=f.schema,schema=hydrate(dto),sid=identity(dto),palette=dto.referenceGroups.at(-2).representative,list=dto.referenceGroups.at(-1).representative,source=palette.at,kind=source[1],fieldKey=source[3],target=Object.keys(schema.nodes[kind].attrs).find(k=>k.startsWith('fieldObject')),ticket=n=>({lamport:n,actor:'A'}),json=v=>JSON.parse(JSON.stringify(v));
const ask=async payload=>{const request={replica:'a',schema:sid,...payload};const response=await new Promise((done,reject)=>{pending.push(done);child.stdin.write(JSON.stringify(request)+'\n',e=>{if(e)reject(e);});});wire.push({request,response});return response;};const snapshot=async()=>({state:(await ask({cmd:'state'})).state,checkpoint:(await ask({cmd:'history_export'})).checkpoint});const cases=[];let failure=null;
const wrap=(value=slotValue(schema,palette))=>({t:'reference',format:'doc-sync-runtime-reference-op-v1',op:{t:'set',at:ticket(2),ids:[ticket(1)],key:target,value:json(value)},references:[{schema:sid,...json(palette),path:['value']}]});
async function reject(name,envelope,pattern){const pre=await snapshot(),response=await ask({cmd:'apply',ops:[envelope]});assert.equal(response.ok,false,name);if(pattern)assert.match(response.error,pattern,name);assert.deepEqual(await snapshot(),pre,name+' all material/history/provenance state unchanged');cases.push({name,response,atomic:true});}
try{
 assert.equal((await ask({cmd:'new',actor:'A',runtimeSchema:dto})).ok,true);
 const birth={t:'node',id:ticket(1),origin:{lamport:0,actor:'~root'},type:kind,boundary:''};assert.equal((await ask({cmd:'apply',ops:[birth]})).ok,true);
 const ts=new Doc('A',schema);ts.apply(birth);const raw={...wrap().op,value:slotValue(schema,palette)};assert.equal(ts.check([raw]),null);assert.equal(typeof ts.check(json([raw])),'string');
 assert.equal((await ask({cmd:'apply',ops:[wrap()]})).ok,true);cases.push({name:'nested field leaf source binds atomic target op value',sourceAt:source,targetPath:['value'],sourceTargetDistinct:true});
 for(const [name,edit,pattern] of [
  ['wrong schema',r=>r.schema='sha256:'+('0'.repeat(64)),/schema/],
  ['branch source',r=>r.at=r.at.slice(0,-2),/atomic/],
  ['unknown field source',r=>r.at[r.at.length-1]='absent',/attribute path/],
  ['unsafe field source',r=>r.at[r.at.length-1]='constructor',/field path/],
  ['malformed source edge',r=>r.at[r.at.length-2]='default',/field path/],
  ['source path too deep',r=>r.at=[...r.at,...Array.from({length:65},()=>['fields','x']).flat()],/64 segments|field path/],
  ['wrong target payload path',r=>r.path=['attrs',target],/path/],
  ['typed valuePath wrong object index',r=>r.valuePath=[0],/valuePath|object|path|payload/],
  ['valuePath too deep',r=>r.valuePath=Array(65).fill('a'),/64|bounded|valuePath|path/],
  ['bad enum index',r=>{r.source='enum';r.index=999;},/index/],
 ]){const envelope=wrap();envelope.op.at=ticket(3);edit(envelope.references[0]);await reject(name,envelope,pattern);}
 const mismatch=wrap();mismatch.op.at=ticket(3);mismatch.op.value={wrong:1};await reject('payload mismatch',mismatch,/payload/);
 const noEnvelope={...wrap().op,at:ticket(3)};await reject('JSON enum lacks identity envelope',noEnvelope);
 const fieldOp={t:'set',at:ticket(3),ids:[ticket(1)],key:'$field:'+JSON.stringify([fieldKey,'group','palette']),value:{a:1,b:2}};assert.equal(ts.check([fieldOp]),null);assert.equal(ts.check(json([fieldOp])),null);assert.equal((await ask({cmd:'apply',ops:[fieldOp]})).ok,true);cases.push({name:'field target accepts equal distinct plain JSON enum member',op:fieldOp});
 const fieldEnvelope={...wrap(),op:fieldOp};await reject('symbolic field target is outside extension',fieldEnvelope);
 for(const path of [[fieldKey,'group'],[fieldKey,'absent'],[fieldKey,'constructor'],[fieldKey,...Array(65).fill('x')]])await reject('invalid raw field target '+JSON.stringify(path),{...fieldOp,at:ticket(4),key:'$field:'+JSON.stringify(path)});
 for(const [name,mutate] of [
  ['branch graph endpoint',d=>{d.referenceGroups.at(-2).representative.at=d.referenceGroups.at(-2).representative.at.slice(0,-2);}],
  ['unknown leaf graph endpoint',d=>{d.referenceGroups.at(-2).slots[0].at.push('fields','absent');}],
  ['unsafe leaf graph endpoint',d=>{d.referenceGroups.at(-2).slots[0].at.push('fields','constructor');}],
  ['wrong payload descent type',d=>{d.referenceGroups.at(-2).slots[0].valuePath=[0];}],
  ['branch default descendant is not leaf descriptor',d=>{d.referenceGroups.at(-2).slots[0]={at:source.slice(0,4),source:'default',valuePath:['group','palette']};}],
  ['v2 does not admit new field selectors',d=>{d.format='doc-sync-runtime-schema-shared-v2';}],
 ]){const forged=json(dto);mutate(forged);const pre=await snapshot(),response=await ask({cmd:'new',replica:'bad',schema:forged.format===dto.format?identity(forged):sid,runtimeSchema:forged,actor:'X'});assert.equal(response.ok,false,name);assert.deepEqual(await snapshot(),pre,name+' preserves live original');cases.push({name,response,atomic:true});}
 const saved=(await ask({cmd:'snapshot'})).snapshot;assert.equal(identity(saved.manifest),sid,'DTO graph identity stable');assert.equal((await ask({cmd:'restore',snapshot:json(saved)})).ok,true);cases.push({name:'JSON runtime snapshot retains field source DTO graph and replays'});
 const checkpoint=(await ask({cmd:'history_export'})).checkpoint;assert.equal((await ask({cmd:'history_restore',checkpoint:json(checkpoint)})).ok,true);cases.push({name:'JSON History checkpoint retains field source operation provenance'});
 const pre=await snapshot(),valid=wrap(),bad=wrap();valid.op.at=ticket(5);bad.op.at=ticket(6);bad.references[0].at=bad.references[0].at.slice(0,-2);const batch=await ask({cmd:'apply',ops:[valid,bad]});assert.equal(batch.ok,false);assert.deepEqual(await snapshot(),pre);cases.push({name:'valid field source then invalid branch source rolls whole batch back',response:batch});
 assert.deepEqual(hashes(),before,'probe source/binary changed');
}catch(e){failure=e.stack;process.exitCode=1;}finally{child.stdin.end();}
writeFileSync(resolve(out,'wire.json'),JSON.stringify(wire,null,2));writeFileSync(resolve(out,'native.stderr'),stderr);writeFileSync(resolve(out,'hashes-after.json'),JSON.stringify(hashes(),null,2));writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:failure?'FAIL':'PASS',cases,failure,scope:'Native v3 field leaf-source envelope admission with actual TS raw-vs-JSON validation, full state/History/provenance rollback, source descriptor path distinct from target payload binding path',notRun:['native heap identity','TypeScript symbolic wire interoperability','cross-runtime checkpoints','browser','mobile']},null,2));console.log(JSON.stringify({status:failure?'FAIL':'PASS',out,cases:cases.length}));if(failure)console.error(failure);
