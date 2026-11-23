import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {applyEdits} from '../../packages/doc-sync/dist/crdt/model.js';
import {anchorAt,pathAt,blockPath} from '../../packages/doc-sync/dist/crdt/edit.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
import {documents as fixtureDocuments,unsupported} from './fixtures.mjs';
assert(!process.env.MOVED_GROUP||process.env.MOVED_GROUP==='promotion','known diagnostic group');const corpus=process.env.MOVED_GROUP==='promotion'?fixtureDocuments.filter(f=>f.promotionPair):fixtureDocuments;const selected=process.env.MOVED_LIMIT?corpus.slice(0,Number(process.env.MOVED_LIMIT)):corpus;const documents=process.env.MOVED_FILTER?selected.filter(d=>d.name===process.env.MOVED_FILTER):selected;assert(documents.length,'MOVED_FILTER must name an existing descriptor');
const root=fileURLToPath(new URL('../../',import.meta.url));
const outBase=resolve(root,process.env.MOVED_OUT??'output/rust-d3-moved-2026-11-04/compare');mkdirSync(outBase,{recursive:true}); const out=resolve(outBase,'run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const sourcePaths=['experiments/runtime-document-moved/README.md','experiments/runtime-document-moved/compress-traces.py','fixtures/product-schemas.ts','experiments/runtime-document-unused/product-schemas.json','experiments/runtime-document-unused/product-schemas.manifest.json','experiments/runtime-document-unused/export-schemas.mjs','experiments/runtime-document-moved/fixtures.mjs','experiments/runtime-document-moved/compare.mjs','experiments/rust-sdk/examples/runtime_moved_trace.rs',...['rust-sdk','rust-shadow'].flatMap(crate=>[`${crate}/Cargo.toml`,`${crate}/Cargo.lock`,...['src/lib.rs','src/runtime_schema.rs',...(crate==='rust-shadow'?['src/nested.rs','src/history.rs','src/movement.rs','src/paragraph.rs','src/general.rs','src/graphic.rs','src/shapes.rs','src/selection.rs','src/fields.rs','src/required.rs']:[])].map(p=>`${crate}/${p}`)]).map(p=>'experiments/'+p),'packages/doc-sync/dist/crdt/doc.js','packages/doc-sync/dist/crdt/history.js','packages/doc-sync/dist/crdt/schema-version.js'];
sourcePaths.push(...['experiments/rust-sdk/src','experiments/rust-shadow/src','packages/doc-sync/dist/crdt','packages/doc-sync/src/crdt'].flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(?:rs|js|ts)$/.test(p)).map(p=>dir+'/'+p)));
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const sourceDirs=['experiments/runtime-document-moved','experiments/rust-sdk/src','experiments/rust-shadow/src','experiments/rust-sdk/examples','experiments/rust-shadow/examples','experiments/rust-sdk/tests','experiments/rust-shadow/tests','packages/doc-sync/dist/crdt','packages/doc-sync/src/crdt'];
let frozenBinary=null;const hashes=()=>{const found=new Set(sourcePaths.filter(p=>existsSync(resolve(root,p))));for(const dir of sourceDirs)if(existsSync(resolve(root,dir)))for(const p of readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(rs|js|ts|mjs)$/.test(p)))found.add(dir+'/'+p);if(frozenBinary)found.add(frozenBinary);return Object.fromEntries([...found].sort().map(p=>[p,hash(p)]));};
const runSourceHashes=hashes();writeFileSync(resolve(out,'run-source-hashes.json'),JSON.stringify(runSourceHashes,null,2)+'\n');
const attempts=existsSync(resolve(out,'attempts.json'))?JSON.parse(readFileSync(resolve(out,'attempts.json'),'utf8')):[];const attempt=(name,fn)=>{const before=hashes();writeFileSync(resolve(out,name+'-hashes-before.json'),JSON.stringify(before,null,2)); const tar=spawnSync('/usr/bin/tar',['-czf',resolve(out,name+'-sources.tar.gz'),...Object.keys(before)],{cwd:root,encoding:'utf8'});assert.equal(tar.status,0,tar.stderr);try{assert.deepEqual(before,runSourceHashes,'source changed between run stages: '+name);const result=fn();const after=hashes();assert.deepEqual(after,before,'source changed during '+name);attempts.push({name,status:'PASS',hashesBefore:before,hashesAfter:after});return result;}catch(e){attempts.push({name,status:'FAIL',error:e.stack,hashesBefore:before,hashesAfter:hashes()});throw e;}finally{writeFileSync(resolve(out,'attempts.json'),JSON.stringify(attempts,null,2)+'\n');}};
const input={documents,unsupported};writeFileSync(resolve(out,'fixtures.json'),JSON.stringify(input,null,2)+'\n');
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const plain=n=>(n.units?String.fromCharCode(...n.units):'')+(n.children??[]).map(plain).join('')+(n.runs??[]).map(plain).join('');
const model=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>('text'in r||'units'in r)?{units:r.units??units(r.text),marks:r.marks??{}}:model(r))});
function assertInserted(document,c,ctx){
 if(!['insertParagraph','insertModel'].includes(c.op))return;
 const inserted=c.at.reduce((node,index)=>node?.children?.[index],document);
 assert(inserted,ctx+' requested model insertion slot exists');
 assert.equal(inserted.type,c.model.type,ctx+' requested slot type');
 assert.equal(plain(model(inserted)),plain(model(c.model)),ctx+' inserted content visible at requested slot');
 for(const[key,value]of Object.entries(c.model.attrs??{}))assert.deepEqual(inserted.attrs?.[key],value,ctx+' supplied attribute '+key);
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
function actor(id,schema){return{doc:new Doc(id,schema),history:new History(),pending:[]};}
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
function runTS(f){
 const sourceReferences=new WeakMap();
 const resolveReferences=v=>{if(v&&typeof v==='object'&&Object.hasOwn(v,'$ref')){const path=v.at.split('.'),source=v.$ref;assert(['default','enum'].includes(source));let result=path.reduce((o,k)=>o[k],f.schema);if(source==='enum')result=result[v.index];assert(result!==undefined,'invalid schema reference '+JSON.stringify(v));if(result&&typeof result==='object')sourceReferences.set(result,{at:path.slice(0,-1),source,...(source==='enum'?{index:v.index}:{})});return result;}if(Array.isArray(v))return v.map(resolveReferences);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolveReferences(x)]));return v;};
 const provenance=ops=>ops.flatMap((op,operation)=>{const fields=op.t==='set'?[[['value'],op.value]]:Object.entries(op.marks??op.attrs??{}).map(([k,v])=>[[op.t==='text'?'marks':'attrs',k],v]);return fields.flatMap(([path,value])=>value&&typeof value==='object'&&sourceReferences.has(value)?[{operation,path,...sourceReferences.get(value)}]:[]);});
 const peers={A:actor('A',f.schema),B:actor('B',f.schema)},aliases=new Map([['rootHead',{lamport:0,actor:'~root'}]]),changes=new Map(),savedSelections=new Map(),trace=[];let now=0,editAdmission=null,logicalOracle=null;const old=Date.now;Date.now=()=>now;
 const key=r=>{if(r==null)return null;const base=aliases.get(typeof r==='string'?r:r.ref);assert(base,'alias '+JSON.stringify(r));return ticketKey({...base,lamport:base.lamport+(r.offset??0)});};
 const target=(p,r)=>{const k=key(r),found=locate(p.doc,k);assert(found,`missing visible ${k} at ${trace.at(-1)?.label}`);return found;};
 const parentPath=(p,r)=>r==null?[]:target(p,r).path;
 const cellPath=(p,c)=>{const g=target(p,c.grid),r=g.block.rows.findIndex(x=>x.key===key(c.row)),col=g.block.cols.findIndex(x=>x.key===key(c.col));assert(r>=0&&col>=0,'cell axes');return [...g.path,r,col];};
 const cellNode=(kind)=>{const cell=f.schema.nodes[f.schema.nodes[kind].children[0]].children[0],body=f.schema.nodes[cell].children[0];return{type:cell,children:[{type:body,children:[]}]};};
 const gridNode=c=>({type:c.kind,attrs:c.attrs??{},children:Array.from({length:c.rows},()=>({type:f.schema.nodes[c.kind].children[0],children:Array.from({length:c.cols},()=>cellNode(c.kind))}))});
 const insertion=(p,c)=>{const path=c.grid?[...cellPath(p,c),0]:parentPath(p,c.parent);if(c.after==null)return[...path,0];const a=target(p,c.after),bpath=a.char?a.path.slice(0,-1):a.path;const group=p.doc.groupOf(a.line,a.block.type);const at=group?bpath.slice(0,-1):bpath;assert.deepEqual(at.slice(0,-1),path,'insertion after must be in parent');return[...path,at.at(-1)+1];};
 function author(p,c){if(c.op==='rawSet'||c.op==='rawMove'||c.op==='rawText'||c.op==='rawNode'){
 const at={lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ops=[c.op==='rawNode'?{t:'node',id:at,origin:c.after==null?(c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'}):p.doc.get(key(c.after)).id,type:c.kind,attrs:c.attrs??{},...(c.right?{boundary:(c.after==null?(c.parent==null?'0@~root':'0@'+key(c.parent)+'/body'):key(c.after))+'|'+key(c.right)}:{})}:c.op==='rawText'?{t:'text',id:at,origin:c.after==null?(c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'}):p.doc.get(key(c.after)).id,text:c.text,marks:c.marks??{}}:c.op==='rawMove'?{t:'move',at,target:p.doc.get(key(c.target)).id,parent:c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'},after:c.after==null?null:p.doc.get(key(c.after)).id}:{t:'set',at,ids:[p.doc.get(key(c.target)).id],key:c.key??'$type',value:c.value}];
 assert.equal(p.doc.check(ops),null,c.label+' raw wire admission');p.doc.emit(ops);
 p.history.record(ops,p.doc,{caretBefore:c.caretBefore?key(c.caretBefore):'',caretAfter:c.caretAfter?key(c.caretAfter):'',typing:false});
 editAdmission={rawCheck:null,route:'Doc.emit raw wire; not Doc.edit compiler'};return ops;
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
  assert(edit,'unknown author '+c.op);if(edit.op==='insert'){const before=structuredClone(p.doc.toJSON());logicalOracle={method:'applyEdits(schema,preCanonicalModel,sameLogicalInsert)',before,expected:applyEdits(f.schema,before,[edit])};if(c.label==='logical paragraph AFTER movement'&&f.promotionSources){logicalOracle.promotionExpected=f.promotionSources.map(source=>({line:'0@'+key(source.parent)+'/body',boundary:'virtual:'+key(source.after)+'|'+key(source.first),type:f.schema.nodes[p.doc.typeOf(p.doc.get(key(source.parent)))].default})).sort((a,b)=>a.line<b.line?-1:a.line>b.line?1:0).map((source,index)=>({...source,id:{lamport:p.doc.clock.lamport+index+1,actor:p.doc.actor}}));}}const staged=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema), stagedOps=staged.edit([edit]).ops;assert.equal(preflight.check(stagedOps),null,c.label+' staged TS wire validation'); const ops=p.doc.edit([edit]).ops;assert.deepEqual(ops,stagedOps,c.label+' staged author consistency');assert.equal(preflight.check(ops),null,c.label+' TS wire validation');editAdmission={route:'Doc.edit staged logical compiler',stagedCheck:null,actualCheck:null,jsonCheck:preflight.check(JSON.parse(JSON.stringify(ops))),schemaReferences:provenance(ops)};if(c.op==='insertGrid'){const rows=ops.filter(o=>o.t==='node'&&o.type===f.schema.nodes[c.kind].children[0]);const cols=ops.filter(o=>o.t==='node'&&o.type==='col');c.rowAliases.forEach((a,i)=>aliases.set(a,rows[i].id));c.colAliases.forEach((a,i)=>aliases.set(a,cols[i].id));}if(logicalOracle)assert.deepEqual(model(p.doc.toJSON()),model(logicalOracle.expected),c.label+' full independent model insertion oracle');assertInserted(p.doc.toJSON(),c,c.label+' TS logical insertion');assertBirthMoves(ops,c,c.label+' TS logical insertion');p.history.record(ops,p.doc,{caretBefore:c.caretBefore?key(c.caretBefore):'',caretAfter:c.caretAfter?key(c.caretAfter):'',typing:false});return ops;
 }
 function validateRejected(p,c){
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
 function restore(cp,schema){assert(cp.pending.every(c=>Array.isArray(c.ops)&&c.ops.length&&(c.caret===null||typeof c.caret==='string')),'invalid pending');const q={doc:Doc.fromSnapshot(cp.actor,cp.document,schema),history:History.fromSnapshot(cp.history),pending:structuredClone(cp.pending)};const before=checkpoint(q);for(const c of q.pending)for(const op of c.ops)q.doc.apply(op);assert.deepEqual(checkpoint(q),before);return q;}
 let active;try{assert.deepEqual(checkSchema(f.schema),[],f.name+' schema valid');for(const command of f.commands){const c=resolveReferences(command);active=c;now=c.time;editAdmission=null;logicalOracle=null;const p=peers[c.actor];let ops=[],caret=null,selection;
  if(c.op==='deliver'){const source=peers[c.from],dest=peers[c.to],list=c.change==='pending'?source.pending:[changes.get(c.change)];assert(list.every(Boolean));for(let n=0;n<(c.repeat??1);n++)for(const change of list){for(const op of change.ops)dest.doc.apply(op);if(c.self)for(const op of change.ops)source.doc.apply(op);}}
  else if(c.op==='selection'||c.op==='selectionStable'){const anchors=c.range&&{anchor:anchorAt(p.doc,c.range.anchor),focus:anchorAt(p.doc,c.range.focus)};selection={anchors,resolved:anchors&&{anchor:pathAt(p.doc,anchors.anchor),focus:pathAt(p.doc,anchors.focus)}};if(c.op==='selectionStable')savedSelections.set(c.name,anchors);}
  else if(c.op==='resolveSelection'){const anchors=savedSelections.get(c.name);assert(anchors,'selection name');selection={anchors,resolved:{anchor:pathAt(p.doc,anchors.anchor),focus:pathAt(p.doc,anchors.focus)}};}
  else if(c.op==='capture'&&c.readOrder){const before=state(p),snapshot=p.doc.snapshot(),keys=c.readOrder.map(name=>'0@'+key(name)+'/body'),priority=k=>k==='0@~root'?-1:keys.includes(k)?keys.indexOf(k):keys.length;snapshot.lines.sort((a,b)=>priority(a.key)-priority(b.key));p.doc=Doc.fromSnapshot(p.doc.actor,snapshot,f.schema);assert.deepEqual(model(p.doc.toJSON()),model(before.model),c.label+' line-order control preserves canonical model');assert.deepEqual(storage(p),before.storage,c.label+' line-order control preserves raw material state');}
  else if(c.op==='flowHead'){aliases.set(c.alias,c.parent==null?{lamport:0,actor:'~root'}:{lamport:0,actor:key(c.parent)+'/body'});}
  else if(c.op==='required'){const parent=c.parent==null?'0@~root':`0@${key(c.parent)}/body`,head={lamport:0,actor:`~required:${encodeURIComponent(parent)}:${encodeURIComponent(c.kind)}:${c.ordinal}`},kind=f.schema.nodes[c.kind],concrete=kind.shape==='group'?f.schema.nodes[kind.children[0]]:kind; const marker={...head,lamport:concrete.shape==='text'?0:1};aliases.set(c.alias,marker);if(c.headAlias)aliases.set(c.headAlias,head);if(c.rowAlias)aliases.set(c.rowAlias,{...head,lamport:2});if(c.colAlias)aliases.set(c.colAlias,{...head,lamport:3});assert(p.doc.get(ticketKey(marker)),'required deterministic marker');}
  else if(c.op==='checkpoint'){const before=checkpoint(p);peers[c.actor]=restore(before,f.schema);assert.deepEqual(checkpoint(peers[c.actor]),before);}
  else if(c.op==='ack')ack(p);
  else if(c.op.startsWith('reject')){const before=checkpoint(p);validateRejected(p,c);assert.deepEqual(checkpoint(p),before);}
  else if(c.op!=='capture'){if(c.op==='undo'||c.op==='redo'){const travel=p.history[c.op](p.doc);ops=travel.ops;caret=travel.caret??null;}else ops=author(p,c);const change={ops:structuredClone(ops),caret};if(ops.length)p.pending.push(change);if(c.change)changes.set(c.change,change);if(c.alias){const born=ops.find(o=>o.t===(['insertText','insertCellText','rawText'].includes(c.op)?'text':'node')&&(c.op!=='insertParagraph'||o.type==='paragraph'));if(c.op==='insertParagraph'){const position=c.at.slice(),index=position.pop();const line=position.length?target(p,c.parent).block.body:'0@~root';const block=p.doc.blocks(line)[index];assert(block,c.label+' inserted block alias');aliases.set(c.alias,block.marker.id);}else {assert(born);aliases.set(c.alias,born.id);}}}
  trace.push({label:c.label,ops,editAdmission,logicalOracle,provenance:provenance(ops),wireAdmission:ops.length?{json:Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema).check(JSON.parse(JSON.stringify(ops)))}:null,... (selection?{selection}:{}),A:state(peers.A),B:state(peers.B)});
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
 if(!process.env.MOVED_TS_ONLY){const env={...process.env,CARGO_BUILD_JOBS:'1',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_INCREMENTAL:'0',CARGO_TARGET_DIR:resolve(root,process.env.MOVED_TARGET??'output/rust-d3-moved-2026-11-04/native-target')};const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/runtime_moved_trace');if(!process.env.MOVED_SKIP_BUILD)attempt('native-build',()=>{const r=spawnSync('/opt/homebrew/bin/cargo',['build','--offline','--locked','-j1','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','runtime_moved_trace'],{cwd:root,env,encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'build.stderr'),r.stderr);assert.equal(r.status,0,r.stderr);});frozenBinary=relative(root,binary);runSourceHashes[frozenBinary]=hash(frozenBinary);writeFileSync(resolve(out,'run-source-hashes.json'),JSON.stringify(runSourceHashes,null,2)+'\n');}

 attempt('typescript-negative-schema-validation',()=>{const diagnostics=unsupported.map(spec=>({...spec,problems:checkSchema(spec.schema)}));writeFileSync(resolve(out,'typescript-schema-diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n');for(const d of diagnostics){assert.equal(d.problems.length===0,d.tsValid,d.name+' TS schema validity');assert(d.problems.length<=1,d.name+' isolate one schema failure');}});
 ts=attempt('typescript-preserved-authoring-integrity',()=>JSON.parse(readFileSync(process.env.MOVED_TS_TRACE_REUSE,'utf8')));
 if(!process.env.MOVED_TS_ONLY){
 const env={...process.env,CARGO_BUILD_JOBS:'1',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_INCREMENTAL:'0',CARGO_TARGET_DIR:resolve(root,process.env.MOVED_TARGET??'output/rust-d3-moved-2026-11-04/native-target')};
 const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/runtime_moved_trace');

 native=attempt('native-preserved-authoring-integrity',()=>JSON.parse(readFileSync(process.env.MOVED_TRACE_REUSE,'utf8')));
 attempt('cross-runtime-exact-comparison',()=>{assert.deepEqual(native.unsupported.map(x=>x.name),input.unsupported.map(x=>x.name));for(let k=0;k<unsupported.length;k++){const spec=unsupported[k],rejected=native.unsupported[k];assert.equal(rejected.rejected,true,rejected.name);assert.equal(rejected.error,`UnsupportedSchema at ${spec.expectedPath}: ${spec.expectedReason}`,rejected.name);assert.equal(checkSchema(spec.schema).length===0,spec.tsValid,spec.name+' TS schema validity');}assert.equal(native.documents.length,ts.documents.length);for(let i=0;i<ts.documents.length;i++){const a=native.documents[i],b=ts.documents[i];assert.equal(a.name,b.name);assert.equal(a.identity,b.identity);assert.equal(a.trace.length,b.trace.length);for(let j=0;j<b.trace.length;j++){const x=a.trace[j],y=b.trace[j],ctx=`${b.name}/${y.label}`;assert.equal(x.label,y.label);if(['initial delivery','undo delivery','redo delivery','foreign undo delivery','retry pending twice own and peer','final convergence'].includes(y.label)){assert.deepEqual(x.A.model,x.B.model,ctx+' native convergence');assert.deepEqual(y.A.model,y.B.model,ctx+' TS convergence');}for(const [runtime,row] of [['native',x],['typescript',y]]){if(y.logicalOracle?.promotionExpected){const expected=y.logicalOracle.promotionExpected,raw=row.ops.map(unwrap);assert.deepEqual(raw.slice(0,expected.length).map(op=>({id:op.id,boundary:op.boundary,type:op.type})),expected.map(({line,...op})=>op),ctx+'/'+runtime+' deterministic UTF16 candidate line order and exact promotion IDs');}if(y.logicalOracle)assert.deepEqual(model(row[documents[i].commands[j].actor].model),model(y.logicalOracle.expected),ctx+'/'+runtime+' full independent model insertion oracle');assertBirthMoves(row.ops,documents[i].commands[j],ctx+'/'+runtime);assertInserted(row[documents[i].commands[j].actor].model,documents[i].commands[j],ctx+'/'+runtime);
 if(['undo nested style preserves peer','redo nested style after checkpoint','undo fences nested foreign style writer'].includes(y.label))assert(plain(model(row.A.model)).includes('N😀'),ctx+'/'+runtime+' retained nested peer chars');
 if(documents[i].commands.some(c=>c.label==='B concurrent UTF16 writer')&&['undo local format preserves peer','redo local format after checkpoint','undo fences foreign format writer','final convergence'].includes(y.label))assert(plain(model(row.A.model)).includes('B😀'),ctx+'/'+runtime+' retained foreign chars');
}if(documents[i].arrivalWriterLabel){
 const start=documents[i].commands.findIndex(c=>c.label===documents[i].arrivalFromLabel);
 if(j>=start){
  const seed=b.trace[documents[i].commands.findIndex(c=>c.label===documents[i].arrivalWriterLabel)].ops[0];
  const deleted=documents[i].arrivalDeleteLabel?b.trace[documents[i].commands.findIndex(c=>c.label===documents[i].arrivalDeleteLabel)].ops.find(op=>op.t==='del'):null;
  for(const[runtime,row]of[['native',x],['typescript',y]])for(const actor of['A','B']){
   const storage=runtime==='native'?nativeStorage(row[actor]):row[actor].storage;
   assert.deepEqual(storage.moves.find(move=>JSON.stringify(move.at)===JSON.stringify(seed.at)),seed,ctx+'/'+runtime+'/'+actor+' retains exact B stale-predecessor placement record by stamp');
   const address=runtime==='native'?row[actor].state.placements[ticketKey(seed.target)]:Doc.fromSnapshot(actor,row[actor].checkpoint.document,documents[i].schema).placementOf(seed.target);
   const placement=address&&{at:address.at,parent:typeof address.parent==='string'?address.parent:ticketKey(address.parent),after:address.after==null?null:typeof address.after==='string'?address.after:ticketKey(address.after)};
   assert.deepEqual(placement,{at:seed.at,parent:ticketKey(seed.parent),after:seed.after==null?null:ticketKey(seed.after)},ctx+'/'+runtime+'/'+actor+' authoritative winning predecessor placement retains B writer');
   if(deleted)for(const id of deleted.ids){const item=storage.lines.flatMap(line=>line.items).find(item=>JSON.stringify(item.id)===JSON.stringify(id));assert(item,ctx+' B deleted predecessor target retained');assert(item.dels.includes(ticketKey(deleted.at))&&!item.cancels.includes(ticketKey(deleted.at)),ctx+'/'+runtime+'/'+actor+' A undo/redo preserves B predecessor deletion');}
  }
 }
}
if(documents[i].foreignFieldLabel){
 const start=documents[i].commands.findIndex(c=>c.label===documents[i].foreignFieldFromLabel);
 if(j>=start){const field=b.trace[documents[i].commands.findIndex(c=>c.label===documents[i].foreignFieldLabel)].ops[0];for(const[runtime,row]of[['native',x],['typescript',y]])for(const actor of['A','B']){const storage=runtime==='native'?nativeStorage(row[actor]):row[actor].storage;for(const id of field.ids){const target=storage.lines.flatMap(line=>line.items).find(item=>JSON.stringify(item.id)===JSON.stringify(id));assert.deepEqual(target?.attrs[field.key],{value:field.value,at:field.at},ctx+'/'+runtime+'/'+actor+' retains foreign flow field writer through birth undo/redo');}}}
}
if(documents[i].foreignTextSeedLabel){
 const seedIndex=documents[i].commands.findIndex(c=>c.label===documents[i].foreignTextSeedLabel),start=documents[i].commands.findIndex(c=>c.label===documents[i].foreignTextFromLabel);
 if(j>=start){
  const seed=b.trace[seedIndex].ops[0],first=seed.id.lamport;
  assert.equal(seed.text,'B😀',ctx+' independent foreign text seed');
  const originals=b.trace[seedIndex].B.storage.lines.flatMap(line=>line.items).filter(item=>item.kind==='char'&&item.id.actor===seed.id.actor&&item.id.lamport>=first&&item.id.lamport<first+3);
  assert.deepEqual(originals.map(item=>item.unit),units('B😀'),ctx+' foreign UTF16 seed units');
  for(const[runtime,row]of[['native',x],['typescript',y]])for(const actor of['A','B']){
   const storage=runtime==='native'?nativeStorage(row[actor]):row[actor].storage,tokens=storage.lines.flatMap(line=>line.items);
   for(const original of originals)assert.deepEqual(tokens.find(item=>JSON.stringify(item.id)===JSON.stringify(original.id)),original,ctx+'/'+runtime+'/'+actor+' foreign raw text retained through insertion undo/redo');
  }
 }
}
if(documents[i].headWriterFrom){
 const start=documents[i].commands.findIndex(c=>c.label===documents[i].headWriterFrom);
 if(j>=start){
  const authorIndex=documents[i].commands.findIndex(c=>c.label==='B concurrent old default head writer');
  const expectedMove=b.trace[authorIndex].ops[0];
  const seedIndex=documents[i].commands.findIndex(c=>c.label==='seed original head UTF16 content');
  const seedText=b.trace[seedIndex].ops[0],first=seedText.id.lamport;
  assert.equal(seedText.text,'HEAD😀',ctx+' independent original head text seed');
  const seedTokens=b.trace[seedIndex].A.storage.lines.flatMap(line=>line.items).filter(item=>item.id.actor===seedText.id.actor&&item.id.lamport>=first&&item.id.lamport<first+6);
  assert.deepEqual(seedTokens.map(item=>item.unit),units('HEAD😀'),ctx+' six original head UTF16 units');
  assert(expectedMove?.t==='move'&&expectedMove.after,ctx+' original B head writer after required sibling exists');
  const paragraphIndex=documents[i].commands.findIndex(c=>c.label==='A real paragraph end insertion');
  const paragraphClock=Math.max(...b.trace[paragraphIndex].ops.map(op=>(op.at??op.id)?.lamport??0));
  assert(expectedMove.at.lamport<paragraphClock,ctx+' B head writer predates final A paragraph compiler clock');
  for(const[runtime,row]of[['native',x],['typescript',y]]){
   const moves=runtime==='native'?row.A.state.moves:row.A.storage.moves;
   const retained=moves.find(move=>JSON.stringify(move.target)===JSON.stringify(expectedMove.target));
   assert.deepEqual(retained,expectedMove,ctx+'/'+runtime+' preserves original lower-clock B head move');
   const storage=runtime==='native'?nativeStorage(row.A):row.A.storage;
   const tokens=storage.lines.flatMap(line=>line.items);
   for(const original of seedTokens)assert.deepEqual(tokens.find(item=>JSON.stringify(item.id)===JSON.stringify(original.id)),original,ctx+'/'+runtime+' retains original raw head text ID/unit/register/deletion state');
   if(y.label==='undo paragraph retains old head writer'){
    const seed=b.trace[authorIndex].B.model;
    assert.deepEqual(model(row.A.model),model(seed),ctx+'/'+runtime+' exact pre-paragraph model after undo');
   }
  }
 }
}
assert.deepEqual(x.selection,y.selection,ctx+' selection anchors/resolved');assert.deepEqual(x.ops.map(wire),y.ops.map(wire),ctx+' typed operations');const expectedReferences=y.provenance;const actualReferences=x.ops.flatMap((o,operation)=>(o.references??[]).map(r=>({operation,path:r.path,pathSource:r.at,source:r.source,...(r.source==='enum'?{index:r.index}:{})})));const direct=['insertText','insertBlock','insertInline','format','formatSpan','set','setCell','insertParagraph','insertModel'].includes(documents[i].commands[j].op);for(const op of x.ops)validateReferences(op,documents[i].schema,b.identity,ctx);for(const actor of ['A','B'])for(const change of x[actor].pending)for(const op of change.ops)validateReferences(op,documents[i].schema,b.identity,ctx+'/'+actor+' pending');if(direct)assert.deepEqual(sortReferences(actualReferences),sortReferences(expectedReferences.map(r=>({operation:r.operation,path:r.path,pathSource:r.pathSource??r.schemaPath??r.at??r.path,source:r.source,...(r.source==='enum'?{index:r.index}:{})}))),ctx+' explicit reference provenance');for(const actor of ['A','B']){assert.deepEqual(model(x[actor].model),model(y[actor].model),ctx+'/'+actor+' model');assert.deepEqual(x[actor].history,y[actor].history,ctx+'/'+actor+' full History');assert.deepEqual({canUndo:x[actor].status.canUndo,canRedo:x[actor].status.canRedo},y[actor].status,ctx+'/'+actor+' history availability');assert.deepEqual(pendingWire(x[actor].pending),pendingWire(y[actor].pending),ctx+'/'+actor+' typed pending');assert.deepEqual(nativeStorage(x[actor]),y[actor].storage,ctx+'/'+actor+' full token storage/registers/deletion ledgers/moves');assert.equal(x[actor].state.clock,y[actor].clock,ctx+'/'+actor+' clock');}}}
const pairs=new Map();documents.forEach((f,index)=>{if(f.promotionPair){const list=pairs.get(f.promotionPair)??[];list.push(index);pairs.set(f.promotionPair,list);}});
for(const[name,indices]of pairs){if(indices.length===1&&process.env.MOVED_FILTER)continue;assert.equal(indices.length,2,name+' paired read orders');for(const[runtime,all]of[['typescript',ts.documents],['native',native.documents]]){const selected=indices.map(index=>all[index].trace.find(row=>row.label==='logical paragraph AFTER movement'));assert.deepEqual(selected[0].ops.map(wire),selected[1].ops.map(wire),name+'/'+runtime+' same exact compiler operations under opposite lazy line map orders');}}
});
 }
}catch(e){failure=e.stack;writeFileSync(resolve(out,`failure-${attempts.length}.json`),JSON.stringify({failure,fixtures:'fixtures.json',typescriptTrace:existsSync(resolve(out,'typescript-trace.json'))?'typescript-trace.json':null,nativeTrace:existsSync(resolve(out,'native-trace.json'))?'native-trace.json':null,nativeStdout:existsSync(resolve(out,'native.stdout'))?'native.stdout':null,partials:readdirSync(out).filter(path=>path.startsWith('typescript-partial-'))},null,2)+'\n');console.error(failure);process.exitCode=1;}
const receipt={work_id:'rust-d3-moved-2026-11-04',artifact_type:'guarded-authoring-trace-recomparison',status:failure?'FAIL':process.env.MOVED_TS_ONLY?'TS_ONLY':(process.env.MOVED_LIMIT||process.env.MOVED_GROUP)?'DIAGNOSTIC_PASS':process.env.MOVED_TRACE_REUSE?'TRACE_RECOMPARISON_PASS':'PASS',profileCount:documents.length,schemaCount:new Set(documents.map(f=>schemaVersion(f.schema))).size,semanticActions:documents.reduce((n,f)=>n+f.commands.length,0),negativeSchemaCases:unsupported.length,negativeCases:unsupported.length+documents.reduce((n,f)=>n+f.commands.filter(c=>c.op.startsWith('reject')).length,0),existingMovementProfiles:documents.length,foreignRawTextRetentionProfiles:documents.filter(f=>f.foreignTextSeedLabel).length,undoOrders:[...new Set(documents.map(f=>f.undoOrder))],positiveCorpusSha256:createHash('sha256').update(JSON.stringify(documents)).digest('hex'),scope:'Original unpruned Word23/Presentation27. Model-path paragraph insertion after existing movement history: root reorder, undone/redone move, moved default/required projections, cross-flow source/anchor, moved parent, cycle-suppressed placement winner. Full independent applyEdits model oracle plus requested slot/content/attrs; exact operations/tickets, full History/pending/storage/writers/clocks, cross-actor text/field/move, both undo orders, own checkpoint/retry/selection. Negative TS document compiles are staged then checked without mutating the original; no direct Doc.edit atomicity claim.',binaryFrozenBeforeExecution:!process.env.MOVED_TS_ONLY,sourceHashes:runSourceHashes,typescriptDocumentEdits:ts?.documents.reduce((n,f)=>n+f.trace.filter(step=>step.editAdmission?.route==='Doc.edit staged logical compiler').length,0)??null,typescriptRawWireAuthorings:ts?.documents.reduce((n,f)=>n+f.trace.filter(step=>step.editAdmission?.route==='Doc.emit raw wire; not Doc.edit compiler').length,0)??null,normalizations:['Model text strings become UTF16 units recursively','Absent model attrs/children/runs become empty','Typed Text.text becomes UTF16 units; absent marks/attrs become {}; Node boundary becomes empty','Unwritten head-only derived text/fragment lines omitted only when not referenced','Ordinary flow head born resolves to per-flow default; required source head born remains raw; axis head born empty; line and deletion ledger sets sorted. Token order, attrs and writer tickets exact'],notRun:['Full product authoring parity','Arbitrary regular expressions','Cross-runtime checkpoint wire exchange','Renderer','WASM','network','mobile','performance'],failure,attempts};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,out,semanticActions:receipt.semanticActions}));
