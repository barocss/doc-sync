import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {applyEdits} from '../../packages/doc-sync/dist/crdt/model.js';
import {insertionOracle} from '../runtime-document-group-grid/contract-oracle.mjs';
import {anchorAt,pathAt,blockPath} from '../../packages/doc-sync/dist/crdt/edit.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
import {documents as fixtureDocuments,unsupported} from './fixtures.mjs';
import {batchOracle} from '../runtime-document-batch/oracle.mjs';
import {planRelative,strictNode} from './oracle.mjs';
const corpus=fixtureDocuments;const selected=process.env.TARGETING_LIMIT?corpus.slice(0,Number(process.env.TARGETING_LIMIT)):corpus;const wanted=process.env.TARGETING_NAMES?new Set(process.env.TARGETING_NAMES.split(',')):null;const documents=process.env.TARGETING_FILTER?selected.filter(d=>d.name===process.env.TARGETING_FILTER):wanted?selected.filter(d=>wanted.has(d.name)):selected;assert(!wanted||documents.length===wanted.size,'all named diagnostic profiles exist');assert(documents.length,'TARGETING_FILTER must name an existing descriptor');
const root=fileURLToPath(new URL('../../',import.meta.url));
const outBase=resolve(root,process.env.TARGETING_OUT??'output/rust-d3-targeting-2026-11-05/compare');mkdirSync(outBase,{recursive:true}); const out=resolve(outBase,'run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const sourcePaths=['experiments/runtime-document-batch/oracle.mjs','experiments/runtime-document-group-grid/contract-oracle.mjs','docs/edit-api.md','experiments/runtime-document-schema-contract/fixtures.mjs','experiments/runtime-document-schema-contract/test.mjs','experiments/runtime-document-targeting/README.md','experiments/runtime-document-targeting/compress-traces.py','fixtures/product-schemas.ts','experiments/runtime-document-unused/product-schemas.json','experiments/runtime-document-unused/product-schemas.manifest.json','experiments/runtime-document-unused/export-schemas.mjs','experiments/runtime-document-targeting/fixtures.mjs','experiments/runtime-document-targeting/compare.mjs','experiments/rust-sdk/examples/runtime_targeting_trace.rs',...['rust-sdk','rust-shadow'].flatMap(crate=>[`${crate}/Cargo.toml`,`${crate}/Cargo.lock`,...['src/lib.rs','src/runtime_schema.rs',...(crate==='rust-shadow'?['src/nested.rs','src/history.rs','src/movement.rs','src/paragraph.rs','src/general.rs','src/graphic.rs','src/shapes.rs','src/selection.rs','src/fields.rs','src/required.rs']:[])].map(p=>`${crate}/${p}`)]).map(p=>'experiments/'+p),'packages/doc-sync/dist/crdt/doc.js','packages/doc-sync/dist/crdt/history.js','packages/doc-sync/dist/crdt/schema-version.js'];
sourcePaths.push(...['experiments/rust-sdk/src','experiments/rust-shadow/src','packages/doc-sync/dist/crdt','packages/doc-sync/src/crdt'].flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(?:rs|js|ts)$/.test(p)).map(p=>dir+'/'+p)));
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const sourceDirs=['experiments/runtime-document-targeting','experiments/rust-sdk/src','experiments/rust-shadow/src','experiments/rust-sdk/examples','experiments/rust-shadow/examples','experiments/rust-sdk/tests','experiments/rust-shadow/tests','packages/doc-sync/dist/crdt','packages/doc-sync/src/crdt'];
let frozenBinary=null;const hashes=()=>{const found=new Set(sourcePaths.filter(p=>existsSync(resolve(root,p))));for(const dir of sourceDirs)if(existsSync(resolve(root,dir)))for(const p of readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(rs|js|ts|mjs)$/.test(p)))found.add(dir+'/'+p);if(frozenBinary)found.add(frozenBinary);return Object.fromEntries([...found].sort().map(p=>[p,hash(p)]));};
const runSourceHashes=hashes();writeFileSync(resolve(out,'run-source-hashes.json'),JSON.stringify(runSourceHashes,null,2)+'\n');
const attempts=existsSync(resolve(out,'attempts.json'))?JSON.parse(readFileSync(resolve(out,'attempts.json'),'utf8')):[];const attempt=(name,fn)=>{const before=hashes();writeFileSync(resolve(out,name+'-hashes-before.json'),JSON.stringify(before,null,2)); const tar=spawnSync('/usr/bin/tar',['-czf',resolve(out,name+'-sources.tar.gz'),...Object.keys(before)],{cwd:root,encoding:'utf8'});assert.equal(tar.status,0,tar.stderr);try{assert.deepEqual(before,runSourceHashes,'source changed between run stages: '+name);const result=fn();const after=hashes();assert.deepEqual(after,before,'source changed during '+name);attempts.push({name,status:'PASS',hashesBefore:before,hashesAfter:after});return result;}catch(e){attempts.push({name,status:'FAIL',error:e.stack,hashesBefore:before,hashesAfter:hashes()});throw e;}finally{writeFileSync(resolve(out,'attempts.json'),JSON.stringify(attempts,null,2)+'\n');}};
const input={documents,unsupported};writeFileSync(resolve(out,'fixtures.json'),JSON.stringify(input,null,2)+'\n');
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const plain=n=>(n.units?String.fromCharCode(...n.units):'')+(n.children??[]).map(plain).join('')+(n.runs??[]).map(plain).join('');
const model=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>('text'in r||'units'in r)?{units:r.units??units(r.text),marks:r.marks??{}}:model(r))});
const modelNodeAt=(document,path)=>path.reduce((node,index)=>node?.children?.[index],document);
function matchingModelNodes(document,payload,path=[],out=[]){
 if(document?.type===payload.type&&plain(model(document))===plain(model(payload)))out.push({path,node:document});
 for(let i=0;i<(document?.children??[]).length;i++)matchingModelNodes(document.children[i],payload,[...path,i],out);
 return out;
}
function canonicalStoredTarget(schema,c,expected){
 const shape=schema.nodes[c.model.type].shape;
 if(shape==='group'){
  const member=c.model.children?.[0];assert(member,c.label+' nonempty group has stored member');
  const matches=matchingModelNodes(expected,member);assert.equal(matches.length,1,c.label+' unique first stored member payload in independent canonical model');
  return{...matches[0],shape,reason:'group wrapper has no stored ID; first input member after canonical regroup'};
 }
 const direct=modelNodeAt(expected,c.at);
 if(direct?.type===c.model.type)return{path:c.at,node:direct,shape,reason:'requested canonical model slot'};
 const matches=matchingModelNodes(expected,c.model);assert.equal(matches.length,1,c.label+' unique inserted payload after canonical group split');
 return{...matches[0],shape,reason:'independent canonical model resolves structural group split'};
}
function assertInserted(document,c,ctx,expected,schema){
 if(!['insertParagraph','insertModel'].includes(c.op))return;
 const target=canonicalStoredTarget(schema,c,expected),inserted=modelNodeAt(document,target.path);
 assert(inserted,ctx+' canonical requested insertion target exists');
 assert.deepEqual(model(inserted),model(target.node),ctx+' exact target type/content/canonical attributes at independent expected path');
}
function assertBirthMoves(ops,c,ctx){
 if(c.op!=='insertParagraph')return;
 const raw=ops.map(op=>op.format==='doc-sync-runtime-reference-op-v1'?op.op:op);
 const births=new Set(raw.filter(op=>op.t==='node').map(op=>JSON.stringify(op.id)));
 for(const op of raw)if(op.t==='move')assert(births.has(JSON.stringify(op.target)),ctx+' compiler move targets own new paragraph birth');
}
const unwrap=op=>op?.format==='doc-sync-runtime-reference-op-v1'?op.op:op;
const wire=wrapped=>{const op=unwrap(wrapped);return op.t==='text'?{...Object.fromEntries(Object.entries(op).filter(([k])=>k!=='text')),units:op.units??units(op.text),marks:op.marks??{}}:op.t==='node'?{...op,boundary:op.boundary??'',attrs:op.attrs??{}}:op;};
const pendingWire=p=>p.map(c=>({...c,ops:c.ops.map(wire)}));
const ticketKey=t=>`${t.lamport}@${t.actor}`;
let nextIncarnation=0;function actor(id,schema){return{doc:new Doc(id,schema),history:new History(),pending:[],incarnation:++nextIncarnation,publication:0};}
function checkpoint(p){return JSON.parse(JSON.stringify({actor:p.doc.actor,document:p.doc.snapshot(),history:p.history.snapshot(),pending:p.pending}));}
function storage(p){return{lines:materialLines(p.doc.lines().map(l=>({key:l.key,owner:l.owner?.key??null,slot:l.slot,items:l.items.map(t=>({id:t.id,origin:t.origin,kind:t.kind,born:t.boundary==='root'&&!/^0@~required:/.test(l.key)?p.doc.defaultIn(l.key):t.born,boundary:t.boundary,unit:t.kind==='char'?t.ch.charCodeAt(0):null,visible:!t.compact&&[...t.dels].every(k=>t.cancels.has(k)),dels:[...t.dels].sort(),cancels:[...t.cancels].sort(),attrs:Object.fromEntries(t.attrs)}))})),referencedKeys(p.history.snapshot(),p.pending,p.doc.snapshot().moves??[])).sort((a,b)=>a.key.localeCompare(b.key)),moves:p.doc.snapshot().moves??[]};}
const referencedKeys=(...values)=>{const out=new Set();const scan=v=>{if(typeof v==='string')out.add(v);else if(v&&typeof v==='object'){if(Number.isInteger(v.lamport)&&typeof v.actor==='string')out.add(ticketKey(v));for(const x of Object.values(v))scan(x);}};values.forEach(scan);return out;};
const materialLines=(lines,refs)=>lines.filter(l=>!(/^0@~(?:text|fragment):/.test(l.key)&&l.items.length===1&&Object.keys(l.items[0].attrs).length===0&&l.items[0].dels.length===0&&l.items[0].cancels.length===0&&!refs.has(l.key)));
function nativeStorage(p){return{lines:materialLines(p.state.lines.map(l=>({...l,items:l.items.map(t=>({...t,born:t.boundary==='root'&&/\/(?:rows|cols)$/.test(l.key)?'':t.born,dels:[...t.dels].sort(),cancels:[...t.cancels].sort()}))})),referencedKeys(p.history,p.pending,p.state.moves??[])).sort((a,b)=>a.key.localeCompare(b.key)),moves:p.state.moves??[]};}
function state(p){return{model:p.doc.toJSON(),history:p.history.snapshot(),pending:structuredClone(p.pending),checkpoint:checkpoint(p),clock:p.doc.clock.lamport,status:{canUndo:p.history.canUndo,canRedo:p.history.canRedo},storage:storage(p)};}
function locate(doc,key,line='0@~root'){
 const blocks=doc.blocks(line);
 for(let i=0;i<blocks.length;i++){const b=blocks[i],path=blockPath(doc,line,i);if(!path)continue;
  if(b.marker.key===key)return{path,block:b,line};
  if(b.kind==='text'){const o=b.chars.findIndex(c=>c.key===key);if(o>=0)return{path:[...path,o],block:b,line,char:true};}
  else if(b.kind==='flow'){const found=locate(doc,key,b.body);if(found)return found;}
  else if(b.kind==='grid'){for(let r=0;r<b.rows.length;r++)for(let c=0;c<b.cols.length;c++){const found=locate(doc,key,doc.cellKey(b.marker,b.rows[r],b.cols[c]));if(found)return found;}}
 }
 return null;
}
function locateModelPath(doc,path,line='0@~root'){
 const blocks=doc.blocks(line);
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i],at=blockPath(doc,line,i);if(!at)continue;
  if(JSON.stringify(at)===JSON.stringify(path))return{block,line,path:at};
  if(block.kind==='flow'){const found=locateModelPath(doc,path,block.body);if(found)return found;}
  if(block.kind==='grid')for(const row of block.rows)for(const col of block.cols){const found=locateModelPath(doc,path,doc.cellKey(block.marker,row,col));if(found)return found;}
 }
 return null;
}
function runTS(f){
 const sourceReferences=new WeakMap();
 const resolveReferences=v=>{if(v&&typeof v==='object'&&Object.hasOwn(v,'$ref')){const path=v.at.split('.'),source=v.$ref;assert(['default','enum'].includes(source));let result=path.reduce((o,k)=>o[k],f.schema);if(source==='enum')result=result[v.index];assert(result!==undefined,'invalid schema reference '+JSON.stringify(v));if(result&&typeof result==='object')sourceReferences.set(result,{at:path.slice(0,-1),source,...(source==='enum'?{index:v.index}:{})});return result;}if(Array.isArray(v))return v.map(resolveReferences);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolveReferences(x)]));return v;};
 const provenance=ops=>ops.flatMap((op,operation)=>{const fields=op.t==='set'?[[['value'],op.value]]:Object.entries(op.marks??op.attrs??{}).map(([k,v])=>[[op.t==='text'?'marks':'attrs',k],v]);return fields.flatMap(([path,value])=>value&&typeof value==='object'&&sourceReferences.has(value)?[{operation,path,...sourceReferences.get(value)}]:[]);});
 const peers={A:actor('A',f.schema),B:actor('B',f.schema)},aliases=new Map([['rootHead',{lamport:0,actor:'~root'}]]),changes=new Map(),savedSelections=new Map(),trace=[];let now=0,editAdmission=null,logicalOracle=null,batchResult=null;const bases=new Map(),checkpoints=new Map();const old=Date.now;Date.now=()=>now;
 const key=r=>{if(r==null)return null;const base=aliases.get(typeof r==='string'?r:r.ref);assert(base,'alias '+JSON.stringify(r));return ticketKey({...base,lamport:base.lamport+(r.offset??0)});};
 const target=(p,r)=>{const k=key(r),found=locate(p.doc,k);assert(found,`missing visible ${k} at ${trace.at(-1)?.label}`);return found;};
 const parentPath=(p,r)=>r==null?[]:target(p,r).path;
 const cellPath=(p,c)=>{const g=target(p,c.grid),r=g.block.rows.findIndex(x=>x.key===key(c.row)),col=g.block.cols.findIndex(x=>x.key===key(c.col));assert(r>=0&&col>=0,'cell axes');return [...g.path,r,col];};
 const cellNode=(kind)=>{const cell=f.schema.nodes[f.schema.nodes[kind].children[0]].children[0],body=f.schema.nodes[cell].children[0];return{type:cell,children:[{type:body,children:[]}]};};
 const gridNode=c=>({type:c.kind,attrs:c.attrs??{},children:Array.from({length:c.rows},()=>({type:f.schema.nodes[c.kind].children[0],children:Array.from({length:c.cols},()=>cellNode(c.kind))}))});
 const insertion=(p,c)=>{const path=c.grid?[...cellPath(p,c),0]:parentPath(p,c.parent);if(c.after==null)return[...path,0];const a=target(p,c.after),bpath=a.char?a.path.slice(0,-1):a.path;const group=p.doc.groupOf(a.line,a.block.type);const at=group?bpath.slice(0,-1):bpath;assert.deepEqual(at.slice(0,-1),path,'insertion after must be in parent');return[...path,at.at(-1)+1];};
 function readDeterministicFlowHead(doc,op){
 if(op.t!=='node'||f.schema.nodes[op.type]?.shape!=='flow')return null;
 const line='0@'+ticketKey(op.id)+'/body',clock=doc.clock.lamport,beforeModel=doc.toJSON(),before=doc.snapshot(),existed=before.lines.some(value=>value.key===line);
 assert(doc.get(line),'flow setup/read body head exists');const after=doc.snapshot();
 assert.equal(doc.clock.lamport,clock,'implicit body read consumes no ticket');assert.deepEqual(model(doc.toJSON()),model(beforeModel),'implicit body read changes no model');
 assert.deepEqual({...after,lines:after.lines.filter(value=>value.key!==line)},{...before,lines:before.lines.filter(value=>value.key!==line)},'implicit body read changes no authored snapshot state');
 if(!existed){const head=after.lines.find(value=>value.key===line);assert.equal(head.items.length,1,'only deterministic empty head added');assert.equal(doc.get(line).id.lamport,0,'implicit body read has no authored birth');}
 return{line,clockUnchanged:true,modelUnchanged:true,authoredStateUnchanged:true,headOnly:!existed};
 }
 function validBase(p,name){const base=bases.get(name);assert(base,'base name exists');assert.equal(base.incarnation,p.incarnation,'local foreign-instance base rejected');assert.equal(base.publication,p.publication,'local stale publication base rejected');assert.equal(base.schema,schemaVersion(f.schema),'base schema identity');}
 function author(p,c){if(c.op==='rawDelete'){const ops=[{t:'del',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[p.doc.get(key(c.target)).id]}];assert.equal(p.doc.check(ops),null,c.label+' raw owner tombstone admission');p.doc.emit(ops);p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});editAdmission={route:'Doc.emit raw wire; not Doc.edit compiler'};return ops;}if(c.op==='relative'){
 validBase(p,c.base);const clockBefore=p.doc.clock.lamport,historyBefore=p.history.snapshot();
 logicalOracle=planRelative(p.doc,c.commands,key);
 const staged=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema),stagedChange=staged.edit(logicalOracle.edits,{normalize:true});
 const actual=p.doc.edit(logicalOracle.edits,{normalize:true}),ops=actual.ops;
 assert.deepEqual(ops,stagedChange.ops,c.label+' detached/full live array operations');assert.deepEqual(actual.normalize,stagedChange.normalize,c.label+' returned normalization');
 assert.deepEqual(model(p.doc.toJSON()),model(logicalOracle.expected),c.label+' independent complete relative model');
 logicalOracle.returnedNormalize=actual.normalize;const requestOnly=applyEdits(f.schema,logicalOracle.before,logicalOracle.edits);assert.deepEqual(model(applyEdits(f.schema,requestOnly,actual.normalize)),model(p.doc.toJSON()),c.label+' normalization closes independent request');
 if(ops.length)p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});
 assert.equal(p.history.snapshot().undo.length,historyBefore.undo.length+(ops.length?1:0),c.label+' one relative History group');if(!ops.length)assert.deepEqual(p.history.snapshot(),historyBefore,c.label+' empty relative preserves History');
 const keys=c.commands.map(command=>{const shape=f.schema.nodes[command.model.type]?.shape;if((shape==='group'||shape==='grid')&&!command.model.children?.length)return null;const payload=shape==='group'?command.model.children[0]:command.model,matches=matchingModelNodes(p.doc.toJSON(),payload);assert.equal(matches.length,1,c.label+' unique requested stored payload');return locateModelPath(p.doc,matches[0].path).block.marker.key;});
 c.commands.forEach((command,index)=>{if(command.alias&&keys[index])aliases.set(command.alias,p.doc.get(keys[index]).id);});
 batchResult={keys,change:{ops:structuredClone(ops),caret:null},clockBefore,clockAfter:p.doc.clock.lamport};editAdmission={route:'Doc.edit staged logical compiler',singleRelativeArrayCall:true,commandCount:c.commands.length,strictResolved:logicalOracle.resolved,schemaReferences:provenance(ops)};return ops;
 }if(c.op==='join'){
 const ops=[{t:'set',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[p.doc.get(key(c.target)).id],key:'$join',value:{into:key(c.into),after:key(c.afterMarker)}}];assert.equal(p.doc.check(ops),null);p.doc.emit(ops);p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});editAdmission={route:'Doc.emit raw wire; not Doc.edit compiler'};return ops;
 }if(c.op==='batch'){
 const historyBefore=p.history.snapshot(),clockBefore=p.doc.clock.lamport,before=structuredClone(p.doc.toJSON()),edits=c.commands.map(x=>({op:'insert',at:x.at,content:[x.model]}));
 logicalOracle={before,...batchOracle(f.schema,before,c.commands,c.oracleBoundary)};
 const preflight=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema), staged=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema);
 const stagedChange=staged.edit(edits,{normalize:true});assert.equal(preflight.check(stagedChange.ops),null,c.label+' staged wire');
 const actual=p.doc.edit(edits,{normalize:true});const ops=actual.ops;
 assert.deepEqual(ops,stagedChange.ops,c.label+' staged exact operations');assert.deepEqual(actual.normalize,stagedChange.normalize,c.label+' returned normalize');
 assert.equal(preflight.check(ops),null,c.label+' wire admission');
 assert.deepEqual(model(p.doc.toJSON()),model(logicalOracle.expected),c.label+' independent complete batch model');
 const requestOnly=applyEdits(f.schema,before,edits);assert.deepEqual(model(applyEdits(f.schema,requestOnly,actual.normalize)),model(p.doc.toJSON()),c.label+' returned normalization closure');
 logicalOracle.returnedNormalize=actual.normalize;editAdmission={route:'Doc.edit staged logical compiler',singleArrayCall:true,commandCount:edits.length,stagedCheck:null,actualCheck:null,jsonCheck:preflight.check(JSON.parse(JSON.stringify(ops))),schemaReferences:provenance(ops)};
 if(ops.length)p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});
 assert.equal(p.history.snapshot().undo.length,historyBefore.undo.length+(ops.length?1:0),c.label+' exactly one History record group');if(!ops.length)assert.deepEqual(p.history.snapshot(),historyBefore,c.label+' no-op/clock-only preserves all History and redo');
 const columns=ops.filter(op=>op.t==='node'&&op.type==='col'),rows=ops.filter(op=>op.t==='node'&&f.schema.nodes[op.type]?.shape==='row');let colIndex=0,rowIndex=0,memo=null;
 const keys=c.commands.map(command=>{
  const shape=f.schema.nodes[command.model.type]?.shape;
  if((shape==='group'||shape==='grid')&&!command.model.children?.length)return null;
  if(shape==='cell'){
   const grid=JSON.stringify(command.at.slice(0,-2)),row=command.at.at(-2),column=command.at.at(-1);
   if(memo?.grid===grid&&memo.column===column&&!memo.rows.has(row)){memo.rows.add(row);return memo.key;}
   const key=ticketKey(columns[colIndex++].id);memo={grid,column,rows:new Set([row]),key};return key;
  }
  if(shape==='row')return ticketKey(rows[rowIndex++].id);
  if(shape==='grid'){const marker=ops.find(op=>op.t==='node'&&op.type===command.model.type);assert(marker,c.label+' grid birth');colIndex+=Math.max(0,...command.model.children.map(row=>row.children?.length??0));rowIndex+=command.model.children.length;return ticketKey(marker.id);}
  const payload=shape==='group'?command.model.children[0]:command.model,matches=matchingModelNodes(p.doc.toJSON(),payload);
  assert.equal(matches.length,1,c.label+' unique batch stored member payload');const found=locateModelPath(p.doc,matches[0].path);assert(found,c.label+' batch stored member exists');return found.block.marker.key;
 });
 c.commands.forEach((command,index)=>{if(command.alias&&keys[index])aliases.set(command.alias,p.doc.get(keys[index]).id);});
 batchResult={keys,change:{ops:structuredClone(ops),caret:null},clockBefore,clockAfter:p.doc.clock.lamport};
 return ops;
 }if(c.op==='rawSet'||c.op==='rawMove'||c.op==='rawText'||c.op==='rawNode'){
 const at={lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ops=[c.op==='rawNode'?{t:'node',id:at,origin:c.after==null?(c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'}):p.doc.get(key(c.after)).id,type:c.kind,attrs:c.attrs??{},...(c.right?{boundary:(c.after==null?(c.parent==null?'0@~root':'0@'+key(c.parent)+'/body'):key(c.after))+'|'+key(c.right)}:{})}:c.op==='rawText'?{t:'text',id:at,origin:c.after==null?(c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'}):p.doc.get(key(c.after)).id,text:c.text,marks:c.marks??{}}:c.op==='rawMove'?{t:'move',at,target:p.doc.get(key(c.target)).id,parent:c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'},after:c.after==null?null:p.doc.get(key(c.after)).id}:{t:'set',at,ids:[p.doc.get(key(c.target)).id],key:c.key??'$type',value:c.value}];
 assert.equal(p.doc.check(ops),null,c.label+' raw wire admission');p.doc.emit(ops);
 const eagerFlowBodyRead=c.op==='rawNode'&&f.schema.nodes[c.kind]?.shape==='flow'?readDeterministicFlowHead(p.doc,ops[0]):null;
 p.history.record(ops,p.doc,{caretBefore:c.caretBefore?key(c.caretBefore):'',caretAfter:c.caretAfter?key(c.caretAfter):'',typing:false});
 editAdmission={rawCheck:null,route:'Doc.emit raw wire; not Doc.edit compiler',...(eagerFlowBodyRead?{eagerFlowBodyRead}:{})};return ops;
}const preflight=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema);let edit;
  if(c.op==='insertParagraph'||c.op==='insertModel')edit={op:'insert',at:c.at,content:[c.model]};
  if(c.op==='insertGrid')edit={op:'insert',at:insertion(p,c),content:[gridNode(c)]};
  if(c.op==='insertAxis'){const g=target(p,c.grid),axis=g.block[c.axis];const index=c.after==null?0:axis.findIndex(x=>x.key===key(c.after))+1;edit={op:'insert',at:c.axis==='rows'?[...g.path,index]:[...g.path,0,index],content:c.axis==='rows'?[{type:c.kind,children:[]}]:[cellNode(g.block.type)]};}
  if(c.op==='insertCellBlock'){const parent=[...cellPath(p,c),0],a=c.after==null?null:target(p,c.after);edit={op:'insert',at:[...parent,a?(a.char?a.path.at(-2):a.path.at(-1))+1:0],content:[{type:c.kind,attrs:c.attrs??{},children:[]}]};}
  if(c.op==='insertCellText'){let at;if(c.after==null)at=[...cellPath(p,c),0,0,0];else{const a=target(p,c.after);at=a.char?[...a.path.slice(0,-1),a.path.at(-1)+1]:[...a.path,0];}edit={op:'insert',at,content:[{text:c.text,marks:c.marks??{}}]};}
  if(c.op==='setCell')edit={op:'update',at:cellPath(p,c),attrs:{[c.key]:c.value}};
  if(c.op==='span'){const g=target(p,c.grid).block,r=g.rows.findIndex(x=>x.key===key(c.row)),col=g.cols.findIndex(x=>x.key===key(c.col));const rs=c.endRow==null?1:g.rows.findIndex(x=>x.key===key(c.endRow))-r+1,cs=c.endCol==null?1:g.cols.findIndex(x=>x.key===key(c.endCol))-col+1;edit={op:'update',at:cellPath(p,c),attrs:{rowspan:rs,colspan:cs}};}
  if(c.op==='insertBlock'||c.op==='rejectChild')edit={op:'insert',at:insertion(p,c),content:[{type:c.kind,attrs:c.attrs??{},...(f.schema.nodes[c.kind]?.shape==='flow'?{children:[]}:f.schema.nodes[c.kind]?.shape==='text'?{runs:[]}:{})}]};
  if(c.op==='insertGroupMember'){const member={type:c.kind,attrs:c.attrs??{},runs:[]};edit={op:'insert',at:insertion(p,c),content:[{type:c.group,attrs:c.groupAttrs??{},children:[member]}]};}
  if(c.op==='insertText'||c.op==='insertInline'){let at;if(c.after==null){const head=c.grid?p.doc.cellKey(p.doc.get(key(c.grid)),p.doc.get(key(c.row)),p.doc.get(key(c.col))):c.parent==null?'0@~root':`0@${key(c.parent)}/body`;const bp=blockPath(p.doc,head,0);assert(bp,'default block path');at=[...bp,0];}else{const a=target(p,c.after);at=a.char?[...a.path.slice(0,-1),a.path.at(-1)+1]:[...a.path,0];}
   let content=c.op==='insertInline'?[{type:c.kind,attrs:c.attrs??{}}]:c.inherit?c.text:[{text:c.text,marks:c.marks??{}}];
   edit={op:'insert',at,content};
  }
  if(c.op==='setField')edit={op:'update',at:target(p,c.target).path,attrs:{['$field:'+JSON.stringify([c.key,...c.path])]:structuredClone(c.value)}};
  if(c.op==='formatSpan'){const a=target(p,c.targets[0]),spec=f.schema.nodes[c.kind];edit={op:'update',at:a.path,length:c.targets.length,attrs:{[spec.mark]:c.value}};}
  if(c.op==='setGroup'){const a=target(p,c.target);edit={op:'update',at:a.path.slice(0,-1),attrs:{[c.key]:c.value}};}
  if(c.op==='set'||c.op==='rejectSet')edit={op:'update',at:target(p,c.target).path,attrs:{[c.key==='$type'?'type':c.key]:c.value}};
  if(c.op==='format'){edit={op:'update',at:target(p,c.targets[0]).path,length:c.targets.length,attrs:{[c.key]:c.value}};}
  if(c.op==='delete'){assert.equal(c.targets.length,1);edit={op:'delete',at:target(p,c.targets[0]).path,count:1};}
  if(c.op==='move'||c.op==='rejectParent'){const from=target(p,c.target).path,at=insertion(p,c);if(JSON.stringify(from.slice(0,-1))===JSON.stringify(at.slice(0,-1))&&from.at(-1)<at.at(-1))at[at.length-1]--;edit={op:'move',from,at};}
  assert(edit,'unknown author '+c.op);if(edit.op==='insert'){const before=structuredClone(p.doc.toJSON());logicalOracle={before,...insertionOracle(f.schema,before,edit)};if(c.label==='logical paragraph AFTER movement'&&f.promotionSources){logicalOracle.promotionExpected=f.promotionSources.map(source=>({line:'0@'+key(source.parent)+'/body',boundary:'virtual:'+key(source.after)+'|'+key(source.first),type:f.schema.nodes[p.doc.typeOf(p.doc.get(key(source.parent)))].default})).sort((a,b)=>a.line<b.line?-1:a.line>b.line?1:0).map((source,index)=>({...source,id:{lamport:p.doc.clock.lamport+index+1,actor:p.doc.actor}}));}}const staged=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema),stagedChange=staged.edit([edit],{normalize:true}),stagedOps=stagedChange.ops;assert.equal(preflight.check(stagedOps),null,c.label+' staged TS wire validation'); const actualChange=p.doc.edit([edit],{normalize:true}),ops=actualChange.ops;assert.deepEqual(actualChange.normalize,stagedChange.normalize,c.label+' staged returned normalization consistency');if(logicalOracle){logicalOracle.returnedNormalize=actualChange.normalize;assert.deepEqual(model(applyEdits(f.schema,logicalOracle.requestOnly,actualChange.normalize)),model(p.doc.toJSON()),c.label+' request plus returned normalize closes actual model');}assert.deepEqual(ops,stagedOps,c.label+' staged author consistency');assert.equal(preflight.check(ops),null,c.label+' TS wire validation');editAdmission={route:'Doc.edit staged logical compiler',stagedCheck:null,actualCheck:null,jsonCheck:preflight.check(JSON.parse(JSON.stringify(ops))),schemaReferences:provenance(ops)};if(c.op==='insertGrid'){const rows=ops.filter(o=>o.t==='node'&&o.type===f.schema.nodes[c.kind].children[0]);const cols=ops.filter(o=>o.t==='node'&&o.type==='col');c.rowAliases.forEach((a,i)=>aliases.set(a,rows[i].id));c.colAliases.forEach((a,i)=>aliases.set(a,cols[i].id));}if(logicalOracle)assert.deepEqual(model(p.doc.toJSON()),model(logicalOracle.expected),c.label+' full independent model insertion oracle');assertInserted(p.doc.toJSON(),c,c.label+' TS logical insertion',logicalOracle?.expected,f.schema);assertBirthMoves(ops,c,c.label+' TS logical insertion');p.history.record(ops,p.doc,{caretBefore:c.caretBefore?key(c.caretBefore):'',caretAfter:c.caretAfter?key(c.caretAfter):'',typing:false});return ops;
 }
 function validateRejected(p,c){
 if(c.op==='rejectRelative'){let rejected=false;try{validBase(p,c.base);const plan=planRelative(p.doc,c.commands,key),clone=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema);const ops=clone.edit(plan.edits,{normalize:true}).ops;rejected=typeof p.doc.check(ops)==='string';}catch{rejected=true;}assert(rejected,c.label+' strict relative rejection');editAdmission={route:'strict local base/primary-marker validation; detached TS edit only'};return;}

 if(c.op==='rejectBatch'){
  const clone=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema),edits=c.commands.map(x=>({op:'insert',at:x.at,content:[x.model]}));
  let rejected=false;try{const ops=clone.edit(edits,{normalize:true}).ops;rejected=typeof p.doc.check(ops)==='string';}catch{rejected=true;}
  assert(rejected,c.label+' invalid final command rejected on detached TS clone');editAdmission={route:'clone Doc.edit; no live TS atomicity claim'};return;
 }

  if(c.op==='rejectParagraph'||c.op==='rejectModel'){const staged=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema);let rejected=false;try{const ops=staged.edit([{op:'insert',at:c.at,content:[c.model]}]).ops;rejected=typeof p.doc.check(ops)==='string';}catch{rejected=true;}assert(rejected,c.label+' stage/check fail-closed');editAdmission={route:'clone Doc.edit then original Doc.check; original not mutated'};return;}

  if(c.op==='rejectRawText'||c.op==='rejectMixedBatch'){
   const origin=p.doc.get(key(c.after)).id,first=p.doc.clock.lamport+1;
   const text={t:'text',id:{lamport:first+(c.op==='rejectMixedBatch'?1:0),actor:p.doc.actor},origin,text:c.text};
   const ops=c.op==='rejectMixedBatch'?[{t:'set',at:{lamport:first,actor:p.doc.actor},ids:[p.doc.get(key(c.target)).id],key:c.key??'$type',value:c.value},text]:[text];
   if(c.op==='rejectMixedBatch')assert.equal(p.doc.check([ops[0]]),null,'valid mixed batch prefix');
   assert.equal(typeof p.doc.check(ops),'string',c.label+' raw wire rejects');return;
  }
  // TS Doc.edit intentionally does not promise preflight for Document edits. Stage it, then use the public Doc.check wire validator.
  const d=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema),q={doc:d,history:History.fromSnapshot(p.history.snapshot()),pending:structuredClone(p.pending)};
  if(c.op==='rejectCell'||c.op==='rejectSpan'){const grid=aliases.get(c.grid),row=ticketKey(aliases.get(c.row)),col=ticketKey(aliases.get(c.col));const name=c.op==='rejectSpan'?`$span:${row},${col}`:`$cell:${row},${col}|${c.key}`;const value=c.op==='rejectSpan'?{row:ticketKey(aliases.get(c.endRow)),col:ticketKey(aliases.get(c.endCol))}:c.value;assert.equal(typeof p.doc.check([{t:'set',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[grid],key:name,value}]),'string');return;}
  if(c.op==='rejectRequiredMove'){const op={t:'move',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},target:aliases.get(c.target),parent:{lamport:0,actor:'~root'},after:null};assert.equal(typeof p.doc.check([op]),'string');return;}
  if(c.op==='rejectRequired'){const parent=c.parent==null?'0@~root':`0@${key(c.parent)}/body`,origin={lamport:c.variant??0,actor:`~required:${encodeURIComponent(parent)}:${encodeURIComponent(c.kind)}:${c.ordinal??0}`};const op={t:'text',id:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},origin,text:'x'};assert.equal(typeof p.doc.check([op]),'string');return;}
  if(c.op==='rejectField'){const id=p.doc.get(key(c.target)).id;const op={t:'set',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[id],key:'$field:'+JSON.stringify([c.key,...c.path]),value:c.value};assert.equal(typeof p.doc.check([op]),'string');return;}
  if(c.op==='rejectSet'){const id=p.doc.get(key(c.target)).id;assert.equal(typeof p.doc.check([{t:'set',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[id],key:c.key,value:c.value}]),'string');return;}
  if(c.op==='rejectChild'){const parentType=c.parent==null?f.schema.root:p.doc.typeOf(p.doc.get(key(c.parent)));assert(!f.schema.nodes[parentType].children.includes(c.kind));let rejected=false;try{const ops=author(q,c);rejected=typeof p.doc.check(ops)==='string';}catch{rejected=true;}assert(rejected);return;}
  if(c.op==='rejectParent'){const id=aliases.get(c.target),parent=aliases.get(c.parent);const op={t:'move',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},target:id,parent:{lamport:0,actor:ticketKey(parent)+'/body'},after:null};assert.equal(typeof p.doc.check([op]),'string');return;}
  if(c.op==='rejectOp'){assert.equal(typeof p.doc.check([{t:'node',id:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},origin:{lamport:0,actor:'~root'},type:'unknownType',boundary:''}]),'string');return;}
  if(c.op==='rejectAck'){assert.throws(()=>ack(p,[...p.pending,{ops:[],caret:null}]));return;}
  if(c.op==='rejectCheckpoint'){if(c.kind==='historyVersion')assert.throws(()=>History.fromSnapshot({...p.history.snapshot(),version:2}));else assert.throws(()=>restore({...checkpoint(p),pending:[{ops:[{t:'text',id:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},origin:{lamport:0,actor:'~root'},text:'unsent'}],caret:null}]},f.schema));return;}
 }
 function ack(p,pending=p.pending){assert(pending.every(c=>p.pending.some(own=>JSON.stringify(own)===JSON.stringify(c))),'unknown acknowledgement');p.pending=p.pending.filter(own=>!pending.some(c=>JSON.stringify(own)===JSON.stringify(c)));}
 function restore(cp,schema){assert(cp.pending.every(c=>Array.isArray(c.ops)&&c.ops.length&&(c.caret===null||typeof c.caret==='string')),'invalid pending');const q={doc:Doc.fromSnapshot(cp.actor,cp.document,schema),history:History.fromSnapshot(cp.history),pending:structuredClone(cp.pending),incarnation:++nextIncarnation,publication:0};const before=checkpoint(q);for(const c of q.pending)for(const op of c.ops)q.doc.apply(op);assert.deepEqual(checkpoint(q),before);return q;}
 let active;try{assert.deepEqual(checkSchema(f.schema),[],f.name+' schema valid');for(const command of f.commands){const c=resolveReferences(command);active=c;now=c.time;editAdmission=null;logicalOracle=null;batchResult=null;const p=peers[c.actor];let ops=[],caret=null,selection,readModel;const watched=c.op==='deliver'?peers[c.to]:p,expectationBefore=(c.expectSameClock||c.expectModelChanged||c.expectClockOnly)?{clock:watched.doc.clock.lamport,model:watched.doc.toJSON()}:null;
  if(c.op==='readBase'){const before=checkpoint(p);readModel=p.doc.toJSON();bases.set(c.name,{incarnation:p.incarnation,publication:p.publication,schema:schemaVersion(f.schema)});assert.deepEqual(checkpoint(p),before,c.label+' read preserves complete checkpoint');}
  else if(c.op==='aliasKey'){const i=c.key.indexOf('@');aliases.set(c.alias,{lamport:Number(c.key.slice(0,i)),actor:c.key.slice(i+1)});}
  else if(c.op==='saveCheckpoint')checkpoints.set(c.name,checkpoint(p));
  else if(c.op==='restoreCheckpoint'){const saved=checkpoints.get(c.name);assert(saved,'saved checkpoint');peers[c.actor]=restore(saved,f.schema);}
  else if(c.op==='deliver'){const source=peers[c.from],dest=peers[c.to],list=c.change==='pending'?source.pending:[changes.get(c.change)];assert(list.every(Boolean));for(let n=0;n<(c.repeat??1);n++)for(const change of list){for(const op of change.ops){dest.doc.apply(op);readDeterministicFlowHead(dest.doc,op);}dest.publication++;if(c.self){for(const op of change.ops){source.doc.apply(op);readDeterministicFlowHead(source.doc,op);}source.publication++;}}}
  else if(c.op==='selection'||c.op==='selectionStable'){const anchors=c.range&&{anchor:anchorAt(p.doc,c.range.anchor),focus:anchorAt(p.doc,c.range.focus)};selection={anchors,resolved:anchors&&{anchor:pathAt(p.doc,anchors.anchor),focus:pathAt(p.doc,anchors.focus)}};if(c.op==='selectionStable')savedSelections.set(c.name,anchors);}
  else if(c.op==='resolveSelection'){const anchors=savedSelections.get(c.name);assert(anchors,'selection name');selection={anchors,resolved:{anchor:pathAt(p.doc,anchors.anchor),focus:pathAt(p.doc,anchors.focus)}};}
  else if(c.op==='capture'&&c.readOrder){const before=state(p),snapshot=p.doc.snapshot(),keys=c.readOrder.map(name=>'0@'+key(name)+'/body'),priority=k=>k==='0@~root'?-1:keys.includes(k)?keys.indexOf(k):keys.length;snapshot.lines.sort((a,b)=>priority(a.key)-priority(b.key));p.doc=Doc.fromSnapshot(p.doc.actor,snapshot,f.schema);assert.deepEqual(model(p.doc.toJSON()),model(before.model),c.label+' line-order control preserves canonical model');assert.deepEqual(storage(p),before.storage,c.label+' line-order control preserves raw material state');}
  else if(c.op==='flowHead'){aliases.set(c.alias,c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'});}
  else if(c.op==='required'){const parent=c.parent==null?'0@~root':`0@${key(c.parent)}/body`,head={lamport:0,actor:`~required:${encodeURIComponent(parent)}:${encodeURIComponent(c.kind)}:${c.ordinal}`},kind=f.schema.nodes[c.kind],concrete=kind.shape==='group'?f.schema.nodes[kind.children[0]]:kind; const marker={...head,lamport:concrete.shape==='text'?0:1};aliases.set(c.alias,marker);if(c.headAlias)aliases.set(c.headAlias,head);if(c.rowAlias)aliases.set(c.rowAlias,{...head,lamport:2});if(c.colAlias)aliases.set(c.colAlias,{...head,lamport:3});assert(p.doc.get(ticketKey(marker)),'required deterministic marker');}
  else if(c.op==='checkpoint'){const before=checkpoint(p);peers[c.actor]=restore(before,f.schema);assert.deepEqual(checkpoint(peers[c.actor]),before);}
  else if(c.op==='ack')ack(p);
  else if(c.op.startsWith('reject')){const before=checkpoint(p);validateRejected(p,c);assert.deepEqual(checkpoint(p),before);}
  else if(c.op!=='capture'){if(c.op==='undo'||c.op==='redo'){const travel=p.history[c.op](p.doc);ops=travel.ops;caret=travel.caret??null;}else ops=author(p,c);p.publication++;const change={ops:structuredClone(ops),caret};if(ops.length)p.pending.push(change);if(c.change)changes.set(c.change,change);if(c.alias){const born=ops.find(o=>o.t===(['insertText','insertCellText','rawText'].includes(c.op)?'text':'node')&&(c.op!=='insertParagraph'||o.type==='paragraph'));if(c.op==='insertParagraph'||c.op==='insertModel'){const shape=f.schema.nodes[c.model.type].shape;
 if(shape==='row'||shape==='cell'){const gridPath=shape==='row'?c.at.slice(0,-1):c.at.slice(0,-2),grid=locateModelPath(p.doc,gridPath);assert(grid?.block.kind==='grid',c.label+' axis parent grid');const axis=shape==='row'?grid.block.rows:grid.block.cols,item=axis[c.at.at(-1)];assert(item,c.label+' returned stored axis key');aliases.set(c.alias,item.id);}
 else{const expected=canonicalStoredTarget(f.schema,c,logicalOracle.expected),located=locateModelPath(p.doc,expected.path);assert(located,c.label+' actual model key at '+JSON.stringify(expected.path));aliases.set(c.alias,located.block.marker.id);}
 if(shape==='grid'){const rowType=f.schema.nodes[c.model.type].children[0],rows=ops.filter(op=>op.t==='node'&&op.type===rowType),cols=ops.filter(op=>op.t==='node'&&op.type==='col');(c.rowAliases??[]).forEach((alias,index)=>aliases.set(alias,rows[index].id));(c.colAliases??[]).forEach((alias,index)=>aliases.set(alias,cols[index].id));}}else {assert(born);aliases.set(c.alias,born.id);}}}
  if(c.expectSameClock){assert.equal(watched.doc.clock.lamport,expectationBefore.clock,c.label+' Lamport maximum unchanged');const delivered=changes.get(c.change);const max=Math.max(...delivered.ops.map(op=>op.t==='text'?op.id.lamport+op.text.length-1:(op.at??op.id).lamport));assert(max<expectationBefore.clock,c.label+' delivered ticket strictly below receiver maximum');}if(c.expectModelChanged)assert.notDeepEqual(model(watched.doc.toJSON()),model(expectationBefore.model),c.label+' lower-clock operation changes complete model');if(c.expectClockOnly){assert.equal(ops.length,0,c.label+' emits no operations');assert(watched.doc.clock.lamport>expectationBefore.clock,c.label+' persists clock reservation');}
  trace.push({label:c.label,ops,...(readModel?{readModel}:{}),...(batchResult?{batch:batchResult}:{}),editAdmission,logicalOracle,provenance:provenance(ops),wireAdmission:ops.length?{json:Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema).check(JSON.parse(JSON.stringify(ops)))}:null,... (selection?{selection}:{}),A:state(peers.A),B:state(peers.B)});
 }}catch(e){writeFileSync(resolve(out,'typescript-partial-'+f.name+'.json'),JSON.stringify({active,logicalOracle,trace,actors:{A:state(peers.A),B:state(peers.B)}},null,2));throw e;}finally{Date.now=old;}
 return{name:f.name,identity:schemaVersion(f.schema),trace};
}
function validateReferences(envelope,schema,identity,ctx){
 if(envelope.format!=='doc-sync-runtime-reference-op-v1')return;
 assert.equal(envelope.t,'reference',ctx+' reference wire discriminant');assert(envelope.references.length,ctx+' nonempty bindings');const seen=new Set();
 for(const reference of envelope.references){assert.equal(reference.schema,identity,ctx+' schema reference identity');assert(['default','enum'].includes(reference.source),ctx+' reference source');assert(Array.isArray(reference.at)&&Array.isArray(reference.path),ctx+' reference paths');const payloadPath=JSON.stringify(reference.path);assert(!seen.has(payloadPath),ctx+' unique binding path');seen.add(payloadPath);const descriptor=reference.at.reduce((v,k)=>{assert(v&&Object.hasOwn(v,k),ctx+' reference descriptor exists');return v[k];},schema);assert(!descriptor.fields,ctx+' reference atomic descriptor');let expected;if(reference.source==='enum'){assert(Number.isSafeInteger(reference.index)&&reference.index>=0&&reference.index<descriptor.values.length,ctx+' reference enum index');expected=descriptor.values[reference.index];}else{assert.equal(reference.index,undefined,ctx+' default has no enum index');expected=descriptor.default;}const actual=reference.path.reduce((v,k)=>{assert(v&&Object.hasOwn(v,k),ctx+' reference payload exists');return v[k];},envelope.op);assert.deepEqual(actual,expected,ctx+' reference source payload');}
}
const sortReferences=refs=>refs.toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
let ts,native,failure=null;
try{
 if(!process.env.TARGETING_TS_ONLY){const env={...process.env,CARGO_BUILD_JOBS:'1',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_INCREMENTAL:'0',CARGO_TARGET_DIR:resolve(root,process.env.TARGETING_TARGET??'output/rust-d3-targeting-2026-11-05/native-target')};const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/runtime_targeting_trace');assert(process.env.TARGETING_SKIP_BUILD,'Build native example serially outside comparison; set TARGETING_SKIP_BUILD=1');frozenBinary=relative(root,binary);runSourceHashes[frozenBinary]=hash(frozenBinary);writeFileSync(resolve(out,'run-source-hashes.json'),JSON.stringify(runSourceHashes,null,2)+'\n');}

 attempt('typescript-schema-validation',()=>{const diagnostics=documents.map(spec=>({name:spec.name,nodeCount:Object.keys(spec.schema.nodes).length,problems:checkSchema(spec.schema)}));writeFileSync(resolve(out,'typescript-schema-diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n');for(const d of diagnostics)assert.deepEqual(d.problems,[],d.name+' complete schema valid');});
 ts=attempt('typescript-independent-authoring',()=>({documents:documents.map(runTS)}));writeFileSync(resolve(out,'typescript-trace.json'),JSON.stringify(ts,null,2)+'\n');
 if(!process.env.TARGETING_TS_ONLY){
 const env={...process.env,CARGO_BUILD_JOBS:'1',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_INCREMENTAL:'0',CARGO_TARGET_DIR:resolve(root,process.env.TARGETING_TARGET??'output/rust-d3-targeting-2026-11-05/native-target')};
 const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/runtime_targeting_trace');

 native=process.env.TARGETING_TRACE_REUSE?JSON.parse(readFileSync(resolve(root,process.env.TARGETING_TRACE_REUSE),'utf8')):attempt('native-independent-authoring',()=>{const r=spawnSync(binary,[],{cwd:root,env,input:JSON.stringify(input),encoding:'utf8',maxBuffer:384*1024*1024});writeFileSync(resolve(out,'native.stderr'),r.stderr);writeFileSync(resolve(out,'native.stdout'),r.stdout);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);});writeFileSync(resolve(out,'native-trace.json'),JSON.stringify(native,null,2)+'\n');
 attempt('cross-runtime-exact-comparison',()=>{assert.deepEqual(native.unsupported.map(x=>x.name),input.unsupported.map(x=>x.name));for(let k=0;k<unsupported.length;k++){const spec=unsupported[k],rejected=native.unsupported[k];assert.equal(rejected.rejected,true,rejected.name);assert.equal(rejected.error,`UnsupportedSchema at ${spec.expectedPath}: ${spec.expectedReason}`,rejected.name);assert.equal(checkSchema(spec.schema).length===0,spec.tsValid,spec.name+' TS schema validity');}assert.equal(native.documents.length,ts.documents.length);for(let i=0;i<ts.documents.length;i++){const a=native.documents[i],b=ts.documents[i];assert.equal(a.name,b.name);assert.equal(a.identity,b.identity);assert.equal(a.trace.length,b.trace.length);for(let j=0;j<b.trace.length;j++){const x=a.trace[j],y=b.trace[j],ctx=`${b.name}/${y.label}`;assert.equal(x.label,y.label);if(y.readModel)assert.deepEqual(model(x.readModel),model(y.readModel),ctx+' same read-model snapshot');
 if(y.batch){assert.deepEqual(x.batch.keys,y.batch.keys,ctx+' optional stored identity per batch command');assert.equal(x.batch.clockBefore,y.batch.clockBefore,ctx+' batch reserved clock before');assert.equal(x.batch.clockAfter,y.batch.clockAfter,ctx+' batch reserved clock after');assert.deepEqual(x.batch.change.ops.map(wire),y.batch.change.ops.map(wire),ctx+' aggregate batch operations');assert.equal(x.batch.change.caret,y.batch.change.caret,ctx+' aggregate batch caret');}if(['initial delivery','undo delivery','redo delivery','foreign undo delivery','retry pending twice own and peer','final convergence'].includes(y.label)){assert.deepEqual(x.A.model,x.B.model,ctx+' native convergence');assert.deepEqual(y.A.model,y.B.model,ctx+' TS convergence');}for(const [runtime,row] of [['native',x],['typescript',y]]){if(y.logicalOracle?.promotionExpected){const expected=y.logicalOracle.promotionExpected,raw=row.ops.map(unwrap);assert.deepEqual(raw.slice(0,expected.length).map(op=>({id:op.id,boundary:op.boundary,type:op.type})),expected.map(({line,...op})=>op),ctx+'/'+runtime+' deterministic UTF16 candidate line order and exact promotion IDs');}if(y.logicalOracle)assert.deepEqual(model(row[documents[i].commands[j].actor].model),model(y.logicalOracle.expected),ctx+'/'+runtime+' full independent model insertion oracle');assertBirthMoves(row.ops,documents[i].commands[j],ctx+'/'+runtime);assertInserted(row[documents[i].commands[j].actor].model,documents[i].commands[j],ctx+'/'+runtime,y.logicalOracle?.expected,documents[i].schema);
}
if(documents[i].foreignFieldLabel){
 const start=documents[i].commands.findIndex(c=>c.label===documents[i].foreignFieldFromLabel);
 if(j>=start){const field=b.trace[documents[i].commands.findIndex(c=>c.label===documents[i].foreignFieldLabel)].ops[0];for(const[runtime,row]of[['native',x],['typescript',y]])for(const actor of['A','B']){const storage=runtime==='native'?nativeStorage(row[actor]):row[actor].storage;for(const id of field.ids){const target=storage.lines.flatMap(line=>line.items).find(item=>JSON.stringify(item.id)===JSON.stringify(id));assert.deepEqual(target?.attrs[field.key],{value:field.value,at:field.at},ctx+'/'+runtime+'/'+actor+' retains foreign flow field writer through birth undo/redo');}}}
}
if(documents[i].name==='custom-hidden-deleted-character-axis-synthetic'){
 const deletedAt=documents[i].commands.findIndex(command=>command.op==='rawDelete');
 if(j>=deletedAt){const seed=b.trace[documents[i].commands.findIndex(command=>command.label==='seed stored target paragraph')].ops.find(op=>op.t==='node'&&op.type==='p');assert(seed,ctx+' stored descendant birth');for(const[runtime,row]of[['native',x],['typescript',y]]){const retained=(runtime==='native'?nativeStorage(row.A):row.A.storage).lines.flatMap(line=>line.items).find(item=>ticketKey(item.id)===ticketKey(seed.id));assert(retained,ctx+'/'+runtime+' hidden descendant retained');assert.deepEqual(retained.dels,[],ctx+'/'+runtime+' hidden descendant itself remains alive');assert.deepEqual(retained.cancels,[],ctx+'/'+runtime+' descendant has no manufactured undelete');}}
}
const foreignTextIndex=documents[i].commands.findIndex(command=>command.label==='B foreign UTF16 writer'),foreignDeliveryIndex=documents[i].commands.findIndex(command=>command.label==='deliver foreign UTF16');
if(foreignTextIndex>=0&&j>=foreignDeliveryIndex){
 const birth=b.trace[foreignTextIndex],ids=new Set(birth.ops.filter(op=>op.t==='text').flatMap(op=>Array.from({length:op.text.length},(_,index)=>ticketKey({...op.id,lamport:op.id.lamport+index}))));
 const original=birth.B.storage.lines.flatMap(line=>line.items).filter(item=>ids.has(ticketKey(item.id)));
 assert.deepEqual(original.map(item=>item.unit),units('B😀'),ctx+' independent foreign UTF16 seed');
 for(const[runtime,row]of[['native',x],['typescript',y]])for(const actor of['A','B']){
  const material=runtime==='native'?nativeStorage(row[actor]):row[actor].storage,tokens=material.lines.flatMap(line=>line.items);
  for(const seed of original){const found=tokens.find(item=>ticketKey(item.id)===ticketKey(seed.id));assert(found,ctx+'/'+runtime+'/'+actor+' foreign token identity retained');for(const field of['origin','kind','born','boundary','unit','attrs'])assert.deepEqual(found[field],seed[field],ctx+'/'+runtime+'/'+actor+' foreign token '+field+' retained');}
 }
}
assert.deepEqual(x.selection,y.selection,ctx+' selection anchors/resolved');assert.deepEqual(x.ops.map(wire),y.ops.map(wire),ctx+' typed operations');const expectedReferences=y.provenance;const actualReferences=x.ops.flatMap((o,operation)=>(o.references??[]).map(r=>({operation,path:r.path,pathSource:r.at,source:r.source,...(r.source==='enum'?{index:r.index}:{})})));const direct=['insertText','insertBlock','insertInline','format','formatSpan','set','setCell','insertParagraph','insertModel','batch','relative'].includes(documents[i].commands[j].op);for(const op of x.ops)validateReferences(op,documents[i].schema,b.identity,ctx);for(const actor of ['A','B'])for(const change of x[actor].pending)for(const op of change.ops)validateReferences(op,documents[i].schema,b.identity,ctx+'/'+actor+' pending');if(direct)assert.deepEqual(sortReferences(actualReferences),sortReferences(expectedReferences.map(r=>({operation:r.operation,path:r.path,pathSource:r.pathSource??r.schemaPath??r.at??r.path,source:r.source,...(r.source==='enum'?{index:r.index}:{})}))),ctx+' explicit reference provenance');for(const actor of ['A','B']){assert.deepEqual(model(x[actor].model),model(y[actor].model),ctx+'/'+actor+' model');assert.deepEqual(x[actor].history,y[actor].history,ctx+'/'+actor+' full History');assert.deepEqual({canUndo:x[actor].status.canUndo,canRedo:x[actor].status.canRedo},y[actor].status,ctx+'/'+actor+' history availability');assert.deepEqual(pendingWire(x[actor].pending),pendingWire(y[actor].pending),ctx+'/'+actor+' typed pending');assert.deepEqual(nativeStorage(x[actor]),y[actor].storage,ctx+'/'+actor+' full token storage/registers/deletion ledgers/moves');assert.equal(x[actor].state.clock,y[actor].clock,ctx+'/'+actor+' clock');}}}

});
 }
}catch(e){failure=e.stack;writeFileSync(resolve(out,`failure-${attempts.length}.json`),JSON.stringify({failure,fixtures:'fixtures.json',typescriptTrace:existsSync(resolve(out,'typescript-trace.json'))?'typescript-trace.json':null,nativeTrace:existsSync(resolve(out,'native-trace.json'))?'native-trace.json':null,nativeStdout:existsSync(resolve(out,'native.stdout'))?'native.stdout':null,partials:readdirSync(out).filter(path=>path.startsWith('typescript-partial-'))},null,2)+'\n');console.error(failure);process.exitCode=1;}
const receipt={work_id:'rust-d3-targeting-2026-11-05',artifact_type:'independent-comparison',status:failure?'FAIL':process.env.TARGETING_TS_ONLY?'TS_ONLY':(process.env.TARGETING_LIMIT||process.env.TARGETING_FILTER||process.env.TARGETING_NAMES)?'DIAGNOSTIC_PASS':process.env.TARGETING_TRACE_REUSE?'TRACE_REUSE_DIAGNOSTIC_PASS':'PASS',profileCount:documents.length,schemaCount:new Set(documents.map(f=>schemaVersion(f.schema))).size,semanticActions:documents.reduce((n,f)=>n+f.commands.length,0),negativeSchemaCases:unsupported.length,negativeCases:unsupported.length+documents.reduce((n,f)=>n+f.commands.filter(c=>c.op.startsWith('reject')).length,0),originalProductProfiles:documents.filter(f=>!f.schemaFamily).length,originalProductSchemaCount:new Set(documents.filter(f=>!f.schemaFamily).map(f=>schemaVersion(f.schema))).size,customProfiles:documents.filter(f=>f.schemaFamily==='custom').length,compositionProfiles:documents.filter(f=>f.schemaFamily==='composition').length,generatedProfiles:documents.filter(f=>f.schemaFamily==='generated').length,generatedSchemaCount:new Set(documents.filter(f=>f.schemaFamily==='generated').map(f=>schemaVersion(f.schema))).size,generatedSeeds:documents.filter(f=>f.schemaFamily==='generated').map(f=>f.seed),preexistingMoveProfiles:documents.filter(f=>f.commands.some(c=>c.op==='rawMove')).length,foreignRawTextRetentionProfiles:documents.filter(f=>f.foreignTextSeedLabel).length,undoOrders:[...new Set(documents.map(f=>f.undoOrder))],positiveCorpusSha256:createHash('sha256').update(JSON.stringify(documents)).digest('hex'),scope:'Bounded Q1.3.1 identity-relative stored primary-block and explicit root/stored-flow insertion with opaque local stale-base guard. Independent TS root-reachable strict marker walker and complete-prefix path planning; one live TS Doc.edit array per relative batch. Local publication/incarnation guard semantics are mirrored without comparing native/TS numeric revisions. Complete independent models, exact identities/ops/tickets/clocks/History/pending/material data/writers/selections and own checkpoint. No selection fallback, typed axes/cell wrapper, distributed conditional acceptance, authorization, browser, mobile, performance, WASM or remote qualification.',binaryFrozenBeforeExecution:!process.env.TARGETING_TS_ONLY,sourceHashes:runSourceHashes,typescriptDocumentEdits:ts?.documents.reduce((n,f)=>n+f.trace.filter(step=>step.editAdmission?.route==='Doc.edit staged logical compiler').length,0)??null,typescriptRelativeArrayCalls:ts?.documents.reduce((n,f)=>n+f.trace.filter(step=>step.editAdmission?.singleRelativeArrayCall).length,0)??null,typescriptBatchArrayCalls:ts?.documents.reduce((n,f)=>n+f.trace.filter(step=>step.editAdmission?.singleArrayCall).length,0)??null,typescriptRawWireAuthorings:ts?.documents.reduce((n,f)=>n+f.trace.filter(step=>step.editAdmission?.route==='Doc.emit raw wire; not Doc.edit compiler').length,0)??null,normalizations:['Model text strings become UTF16 units recursively','Absent model attrs/children/runs become empty','Typed Text.text becomes UTF16 units; absent marks/attrs become {}; Node boundary becomes empty','Unwritten head-only derived text/fragment lines omitted only when not referenced','Ordinary flow head born resolves to per-flow default; required source head born remains raw; axis head born empty; line and deletion ledger sets sorted. Token order, attrs and writer tickets exact'],notRun:['Full product authoring parity','Arbitrary regular expressions','Cross-runtime checkpoint wire exchange','Renderer','WASM','network','mobile','performance'],failure,attempts};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,out,semanticActions:receipt.semanticActions}));
