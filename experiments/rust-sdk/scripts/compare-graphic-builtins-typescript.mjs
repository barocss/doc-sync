// Independent built-in graphic authoring. References are normalized by the
// captured native marker IDs because ticket allocation and storage slots differ.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Doc} from '../../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../../packages/doc-sync/dist/crdt/history.js';
import {createGraphicSchema,graphicInsert,graphicUpdate,graphicMove,graphicDelete,findGraphicObject,graphicObjectAt} from '../../../packages/doc-sync/dist/graphic/index.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=resolve(root,process.env.RUST_GRAPHIC_BUILTIN_OUT??'output/rust-graphic-builtins-evidence-20261103');mkdirSync(out,{recursive:true});
const fixture=JSON.parse(readFileSync(resolve(root,'experiments/rust-shadow/schema-graphic-builtins.json'),'utf8'));assert.deepEqual(fixture,createGraphicSchema(),'native builtin manifest must match final TypeScript builtin schema');
const bin='/Users/user/.rustup/toolchains/stable-aarch64-apple-darwin/bin';const env={...process.env,RUSTC:resolve(bin,'rustc'),RUSTDOC:resolve(bin,'rustdoc'),CARGO_TARGET_DIR:resolve(root,'output/rust-graphic-sdk-20261103')};
const build=spawnSync(resolve(bin,'cargo'),['build','--offline','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','graphic_builtin_trace'],{cwd:root,env,encoding:'utf8'});assert.equal(build.status,0,build.stderr);const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/graphic_builtin_trace');
const sources=['experiments/rust-shadow/schema-graphic-builtins.json','experiments/rust-shadow/src/graphic.rs','experiments/rust-shadow/src/lib.rs','experiments/rust-shadow/src/general.rs','experiments/rust-shadow/src/history.rs','experiments/rust-shadow/src/movement.rs','experiments/rust-shadow/src/nested.rs','experiments/rust-sdk/src/graphic.rs','experiments/rust-sdk/examples/graphic_builtin_trace.rs','experiments/rust-sdk/scripts/compare-graphic-builtins-typescript.mjs','packages/doc-sync/src/graphic/schema.ts','packages/doc-sync/src/graphic/helpers.ts','packages/doc-sync/dist/graphic/schema.js','packages/doc-sync/dist/graphic/helpers.js','packages/doc-sync/dist/crdt/doc.js','packages/doc-sync/dist/crdt/history.js',binary];
const fingerprints=()=>Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));const before=fingerprints();
const run=spawnSync(binary,[],{cwd:root,env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const rust=JSON.parse(run.stdout);
let A={doc:new Doc('A',fixture),history:new History(),pending:[]};const B={doc:new Doc('B',fixture),history:new History(),pending:[]};const ts=[];const ids={};
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
function model(n){return {type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>'text'in r?{units:units(r.text),marks:r.marks??{}}:r)};}
const state=p=>({model:model(p.doc.toJSON()),history:{canUndo:p.history.canUndo,canRedo:p.history.canRedo}});const capture=label=>ts.push({label,A:state(A),B:state(B)});
let now=0;const originalNow=Date.now;Date.now=()=>now;
function edit(p,edits,time=0){now=time;const{ops}=p.doc.edit(edits);p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});if(ops.length)p.pending.push(structuredClone(ops));return ops;}
function apply(p,ops){for(const op of ops)p.doc.apply(op);}
function travel(p,action){const{ops}=p.history[action](p.doc);if(ops.length)p.pending.push(structuredClone(ops));return ops;}
function add(name,type,parent,attrs={}){const parentId=parent?ids[parent]:null;edit(A,[graphicInsert(A.doc,parentId,0,{type,attrs,...(fixture.nodes[type].shape==='container'?{children:[]}:{})})]);const parentPath=parentId?findGraphicObject(A.doc,parentId).path:[];ids[name]=graphicObjectAt(A.doc,[...parentPath,0]).id;capture(name);}
function update(p,name,type,attrs,time){return edit(p,[graphicUpdate(p.doc,ids[name],type,attrs)],time);}
try{
 capture('empty');add('path','path',null,{name:'Vector',closed:true});add('vertex1','vertex','path',{x:10});add('vertex2','vertex','path',{y:20});add('segment','segment','path',{from:ids.vertex1,to:ids.vertex2,kind:'cubic'});add('paint','paint','path',{kind:'linear-gradient',start:{x:2}});add('stop','gradient-stop','paint',{offset:0.25,color:'#11223344'});
 add('component','component',null,{name:'Component',transform:{a:-2,c:0.5}});add('rectangle','rectangle','component',{cornerRadius:8});add('instance','instance',null,{componentId:ids.component});add('override','instance-override','instance',{targetId:ids.rectangle,assignment:{property:'opacity',value:0.5}});add('frame','frame',null,{layout:{mode:'horizontal',gap:12}});add('boolean','boolean',null,{operation:'subtract'});add('source','source-ref','boolean',{targetId:ids.path});add('label','label','frame',{fontSize:24});
 edit(A,[{op:'insert',at:[...findGraphicObject(A.doc,ids.label).path,0],content:[{text:String.fromCharCode(0xD800,65,0xDC00),marks:{bold:true}}]}],1);capture('text');for(const c of A.pending)apply(B,c);capture('initial delivery');
 const x=update(A,'vertex1','vertex',{x:30},2);capture('A vertex x');const y=update(B,'vertex1','vertex',{y:40},2);capture('B vertex y');apply(A,y);apply(B,x);capture('exchange vertex');
 const hx=update(A,'vertex1','vertex',{handleOut:{x:7}},3);capture('A handle x');const hy=update(B,'vertex1','vertex',{handleOut:{y:8}},3);capture('B handle y');apply(A,hy);apply(B,hx);capture('exchange handle');
 const color=update(A,'stop','gradient-stop',{color:'#55667788'},4);capture('A stop color');const offset=update(B,'stop','gradient-stop',{offset:0.75},4);capture('B stop offset');apply(A,offset);apply(B,color);capture('exchange gradient');
 const undo=travel(A,'undo');capture('undo color');apply(B,undo);capture('deliver undo');const moved=edit(A,[graphicMove(A.doc,ids.component,ids.frame,0)],5);capture('move component');apply(B,moved);capture('deliver move');
 const deleted=edit(A,[graphicDelete(A.doc,ids.component)],6);capture('delete component');apply(B,deleted);capture('deliver delete');const restored=travel(A,'undo');capture('undo delete');apply(B,restored);capture('deliver restore');
 const saved={doc:A.doc.snapshot(),history:A.history.snapshot(),pending:A.pending};A={doc:Doc.fromSnapshot('A',saved.doc,fixture),history:History.fromSnapshot(saved.history),pending:saved.pending};for(let n=0;n<2;n++)for(const c of A.pending)apply(A,c);capture('restart exact retry');
}finally{Date.now=originalNow;}
function references(value,known){if(typeof value==='string'){const name=Object.keys(known).find(name=>known[name]===value);return name?'$id:'+name:value;}if(Array.isArray(value))return value.map(v=>references(v,known));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,references(v,known)]));return value;}
function normalizeNode(n,known){return{type:n.type,attrs:references(n.attrs??{},known),children:(n.children??[]).map(n=>normalizeNode(n,known)),runs:n.runs??[]};}
const normalize=(trace,known)=>trace.map(r=>({label:r.label,A:{model:normalizeNode(r.A.model,known),history:r.A.history},B:{model:normalizeNode(r.B.model,known),history:r.B.history}}));
const nativeNormalized=normalize(rust.trace,rust.ids),tsNormalized=normalize(ts,ids);let failure=null;try{assert.equal(rust.trace.length,35);assert.deepEqual(nativeNormalized,tsNormalized);}catch(error){failure=error.message;}
const after=fingerprints();assert.deepEqual(after,before,'source and binaries changed during comparison');writeFileSync(resolve(out,'native-trace.json'),JSON.stringify(rust,null,2)+'\n');writeFileSync(resolve(out,'typescript-trace.json'),JSON.stringify({ids,trace:ts},null,2)+'\n');
const receipt={status:failure?'FAIL':'PASS',actions:35,actorStateComparisons:70,manifestExactMatch:true,scope:'Independent native Builtins GraphicDocument vs TypeScript builtin helpers/Doc/History authoring: stored path vertices/cubic segment refs, gradient paint/stop, affine component, rectangle, instance/atomic assignment override, boolean/source refs, label UTF16 with bold, concurrent vertex/handle/gradient edits, selective undo, target move/delete/undo, checkpoint/pending retry',normalizations:['Native projection stable ID fields removed','Reference strings mapped by independently captured CRDT marker IDs','Omitted attrs/children/runs become empty containers','TypeScript text becomes UTF16 units'],notRun:['exact wire parity','cross-runtime wire exchange','renderer','layout engine','Boolean geometry solver','WASM','browser factory','runtime custom schemas','large-scene performance','GC'],hashesBefore:before,hashesAfter:after,failure};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');if(failure){console.error(failure);process.exitCode=1;}else console.log('PASS: 35 builtin graphic actions; 70 actor model/history states; exact builtin manifest. No wire compatibility claim.');
