import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {anchorAt,pathAt,blockPath} from '../../packages/doc-sync/dist/crdt/edit.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
import {documents,unsupported} from './fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(root,process.env.SHAPES_OUT??'output/rust-d2-shapes-2026-11-04/compare');mkdirSync(out,{recursive:true});
const sourcePaths=['experiments/runtime-document-shapes/fixtures.mjs','experiments/runtime-document-shapes/compare.mjs','experiments/rust-sdk/examples/runtime_shapes_trace.rs',...['rust-sdk','rust-shadow'].flatMap(crate=>[`${crate}/Cargo.toml`,`${crate}/Cargo.lock`,...['src/lib.rs','src/runtime_schema.rs',...(crate==='rust-shadow'?['src/nested.rs','src/history.rs','src/movement.rs','src/paragraph.rs','src/general.rs','src/graphic.rs','src/shapes.rs','src/selection.rs']:[])].map(p=>`${crate}/${p}`)]).map(p=>'experiments/'+p),'packages/doc-sync/dist/crdt/doc.js','packages/doc-sync/dist/crdt/history.js','packages/doc-sync/dist/crdt/schema-version.js'];
sourcePaths.push(...['experiments/rust-sdk/src','experiments/rust-shadow/src','packages/doc-sync/dist/crdt','packages/doc-sync/src/crdt'].flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(?:rs|js|ts)$/.test(p)).map(p=>dir+'/'+p)));
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const hashes=()=>Object.fromEntries(sourcePaths.filter(p=>existsSync(resolve(root,p))).map(p=>[p,hash(p)]));
const attempts=existsSync(resolve(out,'attempts.json'))?JSON.parse(readFileSync(resolve(out,'attempts.json'),'utf8')):[];const attempt=(name,fn)=>{const before=hashes();try{const result=fn();const after=hashes();assert.deepEqual(after,before,'source changed during '+name);attempts.push({name,status:'PASS',hashesBefore:before,hashesAfter:after});return result;}catch(e){attempts.push({name,status:'FAIL',error:e.stack,hashesBefore:before,hashesAfter:hashes()});throw e;}finally{writeFileSync(resolve(out,'attempts.json'),JSON.stringify(attempts,null,2)+'\n');}};
const input={documents,unsupported};writeFileSync(resolve(out,'fixtures.json'),JSON.stringify(input,null,2)+'\n');
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const model=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>('text'in r||'units'in r)?{units:r.units??units(r.text),marks:r.marks??{}}:model(r))});
const wire=op=>op.t==='text'?{...Object.fromEntries(Object.entries(op).filter(([k])=>k!=='text')),units:op.units??units(op.text),marks:op.marks??{}}:op.t==='node'?{...op,boundary:op.boundary??'',attrs:op.attrs??{}}:op;
const pendingWire=p=>p.map(c=>({...c,ops:c.ops.map(wire)}));
const ticketKey=t=>`${t.lamport}@${t.actor}`;
function actor(id,schema){return{doc:new Doc(id,schema),history:new History(),pending:[]};}
function checkpoint(p){return JSON.parse(JSON.stringify({actor:p.doc.actor,document:p.doc.snapshot(),history:p.history.snapshot(),pending:p.pending}));}
function storage(p){return{lines:materialLines(p.doc.lines().map(l=>({key:l.key,owner:l.owner?.key??null,slot:l.slot,items:l.items.map(t=>({id:t.id,origin:t.origin,kind:t.kind,born:t.boundary==='root'?p.doc.defaultIn(l.key):t.born,boundary:t.boundary,unit:t.kind==='char'?t.ch.charCodeAt(0):null,visible:!t.compact&&[...t.dels].every(k=>t.cancels.has(k)),dels:[...t.dels].sort(),cancels:[...t.cancels].sort(),attrs:Object.fromEntries(t.attrs)}))})),referencedKeys(p.history.snapshot(),p.pending,p.doc.snapshot().moves??[])).sort((a,b)=>a.key.localeCompare(b.key)),moves:p.doc.snapshot().moves??[]};}
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
 const peers={A:actor('A',f.schema),B:actor('B',f.schema)},aliases=new Map([['rootHead',{lamport:0,actor:'~root'}]]),changes=new Map(),savedSelections=new Map(),trace=[];let now=0;const old=Date.now;Date.now=()=>now;
 const key=r=>{if(r==null)return null;const base=aliases.get(typeof r==='string'?r:r.ref);assert(base,'alias '+JSON.stringify(r));return ticketKey({...base,lamport:base.lamport+(r.offset??0)});};
 const target=(p,r)=>{const k=key(r),found=locate(p.doc,k);assert(found,`missing visible ${k} at ${trace.at(-1)?.label}`);return found;};
 const parentPath=(p,r)=>r==null?[]:target(p,r).path;
 const cellPath=(p,c)=>{const g=target(p,c.grid),r=g.block.rows.findIndex(x=>x.key===key(c.row)),col=g.block.cols.findIndex(x=>x.key===key(c.col));assert(r>=0&&col>=0,'cell axes');return [...g.path,r,col];};
 const cellNode=(kind)=>{const cell=f.schema.nodes[f.schema.nodes[kind].children[0]].children[0],body=f.schema.nodes[cell].children[0];return{type:cell,children:[{type:body,children:[]}]};};
 const gridNode=c=>({type:c.kind,attrs:c.attrs??{},children:Array.from({length:c.rows},()=>({type:f.schema.nodes[c.kind].children[0],children:Array.from({length:c.cols},()=>cellNode(c.kind))}))});
 const insertion=(p,c)=>{const path=c.grid?[...cellPath(p,c),0]:parentPath(p,c.parent);if(c.after==null)return[...path,0];const a=target(p,c.after),bpath=a.char?a.path.slice(0,-1):a.path;const group=p.doc.groupOf(a.line,a.block.type);const at=group?bpath.slice(0,-1):bpath;assert.deepEqual(at.slice(0,-1),path,'insertion after must be in parent');return[...path,at.at(-1)+1];};
 function author(p,c){const preflight=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema);let edit;
  if(c.op==='insertGrid')edit={op:'insert',at:insertion(p,c),content:[gridNode(c)]};
  if(c.op==='insertAxis'){const g=target(p,c.grid),axis=g.block[c.axis];const index=c.after==null?0:axis.findIndex(x=>x.key===key(c.after))+1;edit={op:'insert',at:c.axis==='rows'?[...g.path,index]:[...g.path,0,index],content:c.axis==='rows'?[{type:c.kind,children:[]}]:[cellNode(g.block.type)]};}
  if(c.op==='insertCellBlock'){const parent=[...cellPath(p,c),0],a=c.after==null?null:target(p,c.after);edit={op:'insert',at:[...parent,a?(a.char?a.path.at(-2):a.path.at(-1))+1:0],content:[{type:c.kind,attrs:c.attrs??{},children:[]}]};}
  if(c.op==='insertCellText'){let at;if(c.after==null)at=[...cellPath(p,c),0,0,0];else{const a=target(p,c.after);at=a.char?[...a.path.slice(0,-1),a.path.at(-1)+1]:[...a.path,0];}edit={op:'insert',at,content:c.text,...(Object.keys(c.marks??{}).length?{marks:c.marks}:{})};}
  if(c.op==='setCell')edit={op:'update',at:cellPath(p,c),attrs:{[c.key]:c.value}};
  if(c.op==='span'){const g=target(p,c.grid).block,r=g.rows.findIndex(x=>x.key===key(c.row)),col=g.cols.findIndex(x=>x.key===key(c.col));const rs=c.endRow==null?1:g.rows.findIndex(x=>x.key===key(c.endRow))-r+1,cs=c.endCol==null?1:g.cols.findIndex(x=>x.key===key(c.endCol))-col+1;edit={op:'update',at:cellPath(p,c),attrs:{rowspan:rs,colspan:cs}};}
  if(c.op==='insertBlock'||c.op==='rejectChild')edit={op:'insert',at:insertion(p,c),content:[{type:c.kind,attrs:c.attrs??{},...(f.schema.nodes[c.kind]?.shape==='flow'?{children:[]}:f.schema.nodes[c.kind]?.shape==='text'?{runs:[]}:{})}]};
  if(c.op==='insertGroupMember'){const member={type:c.kind,attrs:c.attrs??{},runs:[]};edit={op:'insert',at:insertion(p,c),content:[{type:c.group,attrs:c.groupAttrs??{},children:[member]}]};}
  if(c.op==='insertText'||c.op==='insertInline'){let at;if(c.after==null){const head=c.grid?p.doc.cellKey(p.doc.get(key(c.grid)),p.doc.get(key(c.row)),p.doc.get(key(c.col))):c.parent==null?'0@~root':`0@${key(c.parent)}/body`;const bp=blockPath(p.doc,head,0);assert(bp,'default block path');at=[...bp,0];}else{const a=target(p,c.after);at=a.char?[...a.path.slice(0,-1),a.path.at(-1)+1]:[...a.path,0];}
   let content=c.op==='insertInline'?[{type:c.kind,attrs:c.attrs??{}}]:c.inherit?c.text:[{text:c.text,marks:c.marks??{}}];
   edit={op:'insert',at,content};
  }
  if(c.op==='formatSpan'){const a=target(p,c.targets[0]),spec=f.schema.nodes[c.kind];edit={op:'update',at:a.path,length:c.targets.length,attrs:{[spec.mark]:c.value}};}
  if(c.op==='setGroup'){const a=target(p,c.target);edit={op:'update',at:a.path.slice(0,-1),attrs:{[c.key]:c.value}};}
  if(c.op==='set'||c.op==='rejectSet')edit={op:'update',at:target(p,c.target).path,attrs:{[c.key==='$type'?'type':c.key]:c.value}};
  if(c.op==='format'){edit={op:'update',at:target(p,c.targets[0]).path,length:c.targets.length,attrs:{[c.key]:c.value}};}
  if(c.op==='delete'){assert.equal(c.targets.length,1);edit={op:'delete',at:target(p,c.targets[0]).path,count:1};}
  if(c.op==='move'||c.op==='rejectParent')edit={op:'move',from:target(p,c.target).path,at:insertion(p,c)};
  assert(edit,'unknown author '+c.op);const ops=p.doc.edit([edit]).ops;assert.equal(preflight.check(ops),null,c.label+' TS wire validation');if(c.op==='insertGrid'){const rows=ops.filter(o=>o.t==='node'&&o.type===f.schema.nodes[c.kind].children[0]);const cols=ops.filter(o=>o.t==='node'&&o.type==='col');c.rowAliases.forEach((a,i)=>aliases.set(a,rows[i].id));c.colAliases.forEach((a,i)=>aliases.set(a,cols[i].id));}p.history.record(ops,p.doc,{caretBefore:c.caretBefore?key(c.caretBefore):'',caretAfter:c.caretAfter?key(c.caretAfter):'',typing:false});return ops;
 }
 function validateRejected(p,c){
  // TS Doc.edit intentionally does not promise preflight for Document edits. Stage it, then use the public Doc.check wire validator.
  const d=Doc.fromSnapshot(p.doc.actor,p.doc.snapshot(),f.schema),q={doc:d,history:History.fromSnapshot(p.history.snapshot()),pending:structuredClone(p.pending)};
  if(c.op==='rejectCell'||c.op==='rejectSpan'){const grid=aliases.get(c.grid),row=ticketKey(aliases.get(c.row)),col=ticketKey(aliases.get(c.col));const name=c.op==='rejectSpan'?`$span:${row},${col}`:`$cell:${row},${col}|${c.key}`;const value=c.op==='rejectSpan'?{row:ticketKey(aliases.get(c.endRow)),col:ticketKey(aliases.get(c.endCol))}:c.value;assert.equal(typeof p.doc.check([{t:'set',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[grid],key:name,value}]),'string');return;}
  if(c.op==='rejectSet'){const id=p.doc.get(key(c.target)).id;assert.equal(typeof p.doc.check([{t:'set',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},ids:[id],key:c.key,value:c.value}]),'string');return;}
  if(c.op==='rejectChild'){const parentType=c.parent==null?f.schema.root:p.doc.typeOf(p.doc.get(key(c.parent)));assert(!f.schema.nodes[parentType].children.includes(c.kind));let rejected=false;try{const ops=author(q,c);rejected=typeof p.doc.check(ops)==='string';}catch{rejected=true;}assert(rejected);return;}
  if(c.op==='rejectParent'){const id=aliases.get(c.target),parent=aliases.get(c.parent);const op={t:'move',at:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},target:id,parent:{lamport:0,actor:ticketKey(parent)+'/body'},after:null};assert.equal(typeof p.doc.check([op]),'string');return;}
  if(c.op==='rejectOp'){assert.equal(typeof p.doc.check([{t:'node',id:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},origin:{lamport:0,actor:'~root'},type:'unknownType',boundary:''}]),'string');return;}
  if(c.op==='rejectAck'){assert.throws(()=>ack(p,[...p.pending,{ops:[],caret:null}]));return;}
  if(c.op==='rejectCheckpoint'){if(c.kind==='historyVersion')assert.throws(()=>History.fromSnapshot({...p.history.snapshot(),version:2}));else assert.throws(()=>restore({...checkpoint(p),pending:[{ops:[{t:'text',id:{lamport:p.doc.clock.lamport+1,actor:p.doc.actor},origin:{lamport:0,actor:'~root'},text:'unsent'}],caret:null}]},f.schema));return;}
 }
 function ack(p,pending=p.pending){assert(pending.every(c=>p.pending.some(own=>JSON.stringify(own)===JSON.stringify(c))),'unknown acknowledgement');p.pending=p.pending.filter(own=>!pending.some(c=>JSON.stringify(own)===JSON.stringify(c)));}
 function restore(cp,schema){assert(cp.pending.every(c=>Array.isArray(c.ops)&&c.ops.length&&(c.caret===null||typeof c.caret==='string')),'invalid pending');const q={doc:Doc.fromSnapshot(cp.actor,cp.document,schema),history:History.fromSnapshot(cp.history),pending:structuredClone(cp.pending)};const before=checkpoint(q);for(const c of q.pending)for(const op of c.ops)q.doc.apply(op);assert.deepEqual(checkpoint(q),before);return q;}
 try{for(const c of f.commands){now=c.time;const p=peers[c.actor];let ops=[],caret=null,selection;
  if(c.op==='deliver'){const source=peers[c.from],dest=peers[c.to],list=c.change==='pending'?source.pending:[changes.get(c.change)];assert(list.every(Boolean));for(let n=0;n<(c.repeat??1);n++)for(const change of list){for(const op of change.ops)dest.doc.apply(op);if(c.self)for(const op of change.ops)source.doc.apply(op);}}
  else if(c.op==='selection'||c.op==='selectionStable'){const anchors=c.range&&{anchor:anchorAt(p.doc,c.range.anchor),focus:anchorAt(p.doc,c.range.focus)};selection={anchors,resolved:anchors&&{anchor:pathAt(p.doc,anchors.anchor),focus:pathAt(p.doc,anchors.focus)}};if(c.op==='selectionStable')savedSelections.set(c.name,anchors);}
  else if(c.op==='resolveSelection'){const anchors=savedSelections.get(c.name);assert(anchors,'selection name');selection={anchors,resolved:{anchor:pathAt(p.doc,anchors.anchor),focus:pathAt(p.doc,anchors.focus)}};}
  else if(c.op==='checkpoint'){const before=checkpoint(p);peers[c.actor]=restore(before,f.schema);assert.deepEqual(checkpoint(peers[c.actor]),before);}
  else if(c.op==='ack')ack(p);
  else if(c.op.startsWith('reject')){const before=checkpoint(p);validateRejected(p,c);assert.deepEqual(checkpoint(p),before);}
  else if(c.op!=='capture'){if(c.op==='undo'||c.op==='redo'){const travel=p.history[c.op](p.doc);ops=travel.ops;caret=travel.caret??null;}else ops=author(p,c);const change={ops:structuredClone(ops),caret};if(ops.length)p.pending.push(change);if(c.change)changes.set(c.change,change);if(c.alias){const born=ops.find(o=>o.t===(['insertText','insertCellText'].includes(c.op)?'text':'node'));assert(born);aliases.set(c.alias,born.id);}}
  trace.push({label:c.label,ops,...(selection?{selection}:{}),A:state(peers.A),B:state(peers.B)});
 }}finally{Date.now=old;}
 return{name:f.name,identity:schemaVersion(f.schema),trace};
}
let ts,native,failure=null;
try{
 ts=attempt('typescript-independent-authoring',()=>({documents:documents.map(runTS)}));writeFileSync(resolve(out,'typescript-trace.json'),JSON.stringify(ts,null,2)+'\n');
 if(!process.env.SHAPES_TS_ONLY){
 const env={...process.env,CARGO_TARGET_DIR:resolve(root,process.env.SHAPES_TARGET??'output/rust-d2-shapes-2026-11-04/compare-target')};
 const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/runtime_shapes_trace');
 attempt('native-build',()=>{const r=spawnSync('/opt/homebrew/bin/cargo',['build','--offline','--locked','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','runtime_shapes_trace'],{cwd:root,env,encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'build.stderr'),r.stderr);assert.equal(r.status,0,r.stderr);});
 sourcePaths.push(relative(root,binary));
 native=process.env.SHAPES_TRACE_REUSE?JSON.parse(readFileSync(resolve(out,'native-trace.json'),'utf8')):attempt('native-independent-authoring',()=>{const r=spawnSync(binary,[],{cwd:root,env,input:JSON.stringify(input),encoding:'utf8',maxBuffer:128*1024*1024});writeFileSync(resolve(out,'native.stderr'),r.stderr);writeFileSync(resolve(out,'native.stdout'),r.stdout);assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);});writeFileSync(resolve(out,'native-trace.json'),JSON.stringify(native,null,2)+'\n');
 attempt('cross-runtime-exact-comparison',()=>{assert.deepEqual(native.unsupported.map(x=>x.name),input.unsupported.map(x=>x.name));for(let k=0;k<unsupported.length;k++){const spec=unsupported[k],rejected=native.unsupported[k];assert.equal(rejected.rejected,!spec.expectedSupported,rejected.name);if(spec.expectedSupported)assert.equal(rejected.error,null,rejected.name+' explicit schema admission');else assert.equal(rejected.error,`UnsupportedSchema at ${spec.expectedPath}: ${spec.expectedReason}`,rejected.name);assert.equal(checkSchema(spec.schema).length===0,spec.tsValid,spec.name+' TS schema validity');}assert.equal(native.documents.length,ts.documents.length);for(let i=0;i<ts.documents.length;i++){const a=native.documents[i],b=ts.documents[i];assert.equal(a.name,b.name);assert.equal(a.identity,b.identity);assert.equal(a.trace.length,b.trace.length);for(let j=0;j<b.trace.length;j++){const x=a.trace[j],y=b.trace[j],ctx=`${b.name}/${y.label}`;assert.equal(x.label,y.label);if(['inline B delivery','attr B delivery','format B delivery','delete B delivery','pending duplicate delivery'].includes(y.label)){assert.deepEqual(x.A.model,x.B.model,ctx+' native convergence');assert.deepEqual(y.A.model,y.B.model,ctx+' TS convergence');}assert.deepEqual(x.selection,y.selection,ctx+' selection anchors/resolved');assert.deepEqual(x.ops.map(wire),y.ops.map(wire),ctx+' typed operations');for(const actor of ['A','B']){assert.deepEqual(model(x[actor].model),model(y[actor].model),ctx+'/'+actor+' model');assert.deepEqual(x[actor].history,y[actor].history,ctx+'/'+actor+' full History');assert.deepEqual({canUndo:x[actor].status.canUndo,canRedo:x[actor].status.canRedo},y[actor].status,ctx+'/'+actor+' history availability');assert.deepEqual(pendingWire(x[actor].pending),pendingWire(y[actor].pending),ctx+'/'+actor+' typed pending');assert.deepEqual(nativeStorage(x[actor]),y[actor].storage,ctx+'/'+actor+' full token storage/registers/deletion ledgers/moves');assert.equal(x[actor].state.clock,y[actor].clock,ctx+'/'+actor+' clock');}}}});
 }
}catch(e){failure=e.stack;writeFileSync(resolve(out,`failure-${attempts.length}.json`),JSON.stringify({failure,fixtures:input,ts,native,nativeStdout:existsSync(resolve(out,'native.stdout'))?readFileSync(resolve(out,'native.stdout'),'utf8'):null},null,2)+'\n');console.error(failure);process.exitCode=1;}
const receipt={work_id:'rust-d2-shapes-2026-11-04',artifact_type:'independent-comparison',status:failure?'FAIL':process.env.SHAPES_TS_ONLY?'TS_ONLY':process.env.SHAPES_TRACE_REUSE?'TRACE_REUSE_DIAGNOSTIC_PASS':'PASS',schemaCount:documents.length,semanticActions:documents.reduce((n,f)=>n+f.commands.length,0),negativeCases:unsupported.filter(x=>!x.expectedSupported).length,admittedSchemaCases:unsupported.filter(x=>x.expectedSupported).length,negativeAssertions:unsupported.map(({name,expectedSupported,expectedPath,expectedReason,tsValid})=>({name,expectedSupported:!!expectedSupported,expectedPath,expectedReason,tsValid})),positiveCorpusSha256:createHash('sha256').update(JSON.stringify(documents)).digest('hex'),scope:'Two renamed runtime schemas containing multiple group, inline and span types. Native SDK semantic authoring compared to TypeScript Doc.edit + History. Exact operation IDs, history, pending/caret, material storage, clock and UTF16 stable selection are compared. Each runtime restores its own checkpoint.',normalizations:['Model text strings become UTF16 units recursively, including span runs','Absent model attrs/children/runs become empty','Typed Text.text becomes UTF16 units; absent marks/attrs become {}; Node boundary becomes empty','Unwritten head-only derived text/fragment lines omitted only when not referenced','Flow head born resolves to per-flow default; axis head born empty; line and deletion ledger sets sorted. Token order, attrs and writer tickets exact'],observedD3Gap:resolve(out,'observed-empty-head-mismatch.json'),diagnosticClassification:resolve(out,'diagnostic-classification.json'),notRun:['Schema text:false, cardinality, arbitrary computed attrs, derived stored attrs and structured value marks','Cross-runtime checkpoint wire exchange','D3 model-position insertion after move or empty tail','Renderer','WASM','network','mobile'],failure,attempts};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');writeFileSync(resolve(out,`receipt-${attempts.length}.json`),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,out,semanticActions:receipt.semanticActions}));
