// Observe source field-leaf identity separately from target field structural rules.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {DocHub} from '../../packages/doc-sync/dist/server/hub.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {FORMAT,hydrate,identity,slotValue,aliases} from './schema.mjs';
import {documents} from './fixtures.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.FIELDREFS_IDENTITY_OUT??'output/rust-d2-fieldrefs-2026-11-04/compare-identity','run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const hash=v=>createHash('sha256').update(v).digest('hex'),json=v=>JSON.parse(JSON.stringify(v)),dirs=['experiments/runtime-document-fieldrefs','packages/doc-sync/src/crdt','packages/doc-sync/dist/crdt','packages/doc-sync/src/server','packages/doc-sync/dist/server'];
const hashes=()=>Object.fromEntries(dirs.flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(mjs|ts|js)$/.test(p)).map(p=>[dir+'/'+p,hash(readFileSync(resolve(root,dir,p)))])));const before=hashes();writeFileSync(resolve(out,'hashes-before.json'),JSON.stringify(before,null,2));
const rows=[],graphs=[];let failure=null;
try{
 for(const f of documents){const schema=hydrate(f.schema);assert.deepEqual(checkSchema(schema),[]);for(const g of f.schema.referenceGroups)for(const slot of g.slots)assert.equal(slotValue(schema,slot),slotValue(schema,g.representative));graphs.push({name:f.name,identity:identity(f.schema),groups:f.schema.referenceGroups.length,branchDefaultOrder:JSON.stringify(schema.nodes[f.schema.referenceGroups.at(-2).representative.at[1]].attrs[f.schema.referenceGroups.at(-2).representative.at[3]].default.group.palette),leafDefaultOrder:JSON.stringify(slotValue(schema,f.schema.referenceGroups.at(-2).representative)),fieldClasses:f.schema.referenceGroups.slice(-2).map(g=>aliases(schema,g.representative.at,slotValue(schema,g.representative)))});}
 for(const array of [false,true])for(const ownership of ['sourceSchema','hubOwnedSchema'])for(const target of ['field','atomic'])for(const cloned of [false,true])for(const selected of ['default','enum']){
  const a=array?[{b:2,a:1}]:{b:2,a:1},b=array?[{z:9}]:{z:9},at=['nodes','source','attrs','meta','fields','nested','fields','leaf'],slot=(at,source='default',index=0)=>({at,source,...(source==='enum'?{index}:{})});
  const leaf={default:json(a),values:[json(a),json(b)]};
  const nested={default:{leaf:json(a)},fields:{leaf}};
  const meta={default:{nested:{leaf:json(a)}},fields:{nested}};
  const sinkField={default:{leaf:null},fields:{leaf:{default:null,values:[json(a),json(b)]}}};
  const manifest={root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p','source','sink'],default:'p'},p:{shape:'text'},source:{shape:'atom',attrs:{meta}},sink:{shape:'atom',attrs:{atomic:{default:null,values:[json(a),json(b)]},field:sinkField}}}};
  const dto={format:FORMAT,manifest,referenceGroups:[
   {representative:slot(at),slots:[slot(at),slot(at,'enum',0),slot(['nodes','sink','attrs','atomic'],'enum',0)]},
   {representative:slot(at,'enum',1),slots:[slot(at,'enum',1),slot(['nodes','sink','attrs','atomic'],'enum',1)]}
  ]};
  const sourceSchema=hydrate(dto),hub=new DocHub({schema:sourceSchema}),schema=ownership==='sourceSchema'?sourceSchema:hub.doc.schema,doc=new Doc('A',schema);assert.deepEqual(checkSchema(schema),[]);
  const seed=doc.edit([{op:'insert',at:[1],content:[{type:'sink'}]}]).ops;hub.submit({actor:'A',seq:1,ops:seed});const descriptor=at.reduce((v,k)=>v[k],schema),value=selected==='default'?descriptor.default:descriptor.values[1],actual=cloned?json(value):value,pre=Doc.fromSnapshot('A',doc.snapshot(),schema),ops=doc.edit([{op:'update',at:[1],attrs:{[target]:target==='field'?{leaf:actual}:actual}}]).ops;
  const raw=pre.check(ops),wire=pre.check(json(ops));assert.equal(raw===null,target==='field'||!cloned);assert.equal(wire===null,target==='field');
  const saved={snapshot:json(hub.doc.snapshot()),seq:hub.serverSeq};let accepted=false,error=null;try{hub.submit({actor:'A',seq:2,ops});accepted=true;}catch(e){error=e.message;assert.equal(hub.serverSeq,saved.seq);assert.deepEqual(hub.doc.snapshot(),saved.snapshot);}
  assert.equal(accepted,target==='field');if(target==='field'){assert(ops.every(o=>o.t==='set'&&o.key==='$field:["field","leaf"]'));assert.notEqual(ops[0].value,actual,'field operations clone composite payload');}
  rows.push({array,ownership,target,cloned,selected,sourceAt:at,opKey:ops[0]?.key,raw,wire,accepted,error,rejectionAtomic:!accepted,fieldValueStructural:target==='field'});
 }
 assert.deepEqual(hashes(),before,'source changed during identity probe');
}catch(e){failure=e.stack;process.exitCode=1;}
writeFileSync(resolve(out,'hashes-after.json'),JSON.stringify(hashes(),null,2));writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:failure?'FAIL':'PASS',rows,graphs,failure,scope:'Actual TypeScript Doc.check and actual DocHub.submit; field leaf object/array structural membership vs identity-sensitive atomic target; source/hub schema ownership and JSON clone boundary',notRun:['native symbolic envelope to TypeScript interoperability','native heap identity','cross-runtime checkpoints','browser','mobile']},null,2));console.log(JSON.stringify({status:failure?'FAIL':'PASS',out,rows:rows.length}));if(failure)console.error(failure);
