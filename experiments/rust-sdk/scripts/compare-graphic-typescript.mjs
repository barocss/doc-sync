// Independent authoring oracle. Storage heads and wire-op allocation differ:
// this checks normalized models and history availability, not wire compatibility.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Doc} from '../../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../../packages/doc-sync/dist/crdt/history.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=resolve(root,process.env.RUST_GRAPHIC_OUT??'output/rust-graphic-evidence-20261103');mkdirSync(out,{recursive:true});
const bin='/Users/user/.rustup/toolchains/stable-aarch64-apple-darwin/bin';
const env={...process.env,RUSTC:resolve(bin,'rustc'),RUSTDOC:resolve(bin,'rustdoc'),CARGO_TARGET_DIR:resolve(root,'output/rust-graphic-sdk-20261103')};
const build=spawnSync(resolve(bin,'cargo'),['build','--offline','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','graphic_trace'],{cwd:root,env,encoding:'utf8'});assert.equal(build.status,0,build.stderr);
const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/graphic_trace');
const run=spawnSync(binary,[],{cwd:root,env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const rust=JSON.parse(run.stdout);
const schema=JSON.parse(readFileSync(resolve(root,'experiments/rust-shadow/schema-graphic.json'),'utf8'));
let A={doc:new Doc('A',schema),history:new History(),pending:[]};const B={doc:new Doc('B',schema),history:new History(),pending:[]};const ts=[];
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
function model(node){return {type:node.type,attrs:node.attrs??{},children:(node.children??[]).map(model),runs:(node.runs??[]).map(run=>'text'in run?{units:units(run.text),marks:run.marks??{}}:run)};}
const state=p=>({model:model(p.doc.toJSON()),history:{canUndo:p.history.canUndo,canRedo:p.history.canRedo}});
const capture=label=>ts.push({label,A:state(A),B:state(B)});
let now=0;const originalNow=Date.now;Date.now=()=>now;
function edit(p,edits,time){now=time;const {ops}=p.doc.edit(edits);p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});if(ops.length)p.pending.push(structuredClone(ops));return ops;}
function apply(p,ops){for(const op of ops)p.doc.apply(op);}
function travel(p,action){const{ops}=p.history[action](p.doc);if(ops.length)p.pending.push(structuredClone(ops));return ops;}
try{
 capture('empty');edit(A,[{op:'insert',at:[0],content:[{type:'frame',children:[]}]}],1);capture('frame');
 edit(A,[{op:'insert',at:[0,0],content:[{type:'object-group',children:[]}]}],2);capture('group');
 edit(A,[{op:'insert',at:[0,0,0],content:[{type:'label',runs:[]}]}],3);capture('label');
 edit(A,[{op:'insert',at:[0,0,0,0],content:'A😀'}],4);capture('text');for(const c of A.pending)apply(B,c);capture('initial delivery');
 const x=edit(A,[{op:'update',at:[0],attrs:{transform:{x:12}}}],6);capture('A x');const y=edit(B,[{op:'update',at:[0],attrs:{transform:{y:34}}}],7);capture('B y');apply(A,y);apply(B,x);capture('exchange fields');
 const undo=travel(A,'undo');capture('undo x');apply(B,undo);capture('deliver undo');
 const moved=edit(A,[{op:'move',from:[0,0],at:[1]}],11);capture('move group');apply(B,moved);capture('deliver move');
 const text=edit(B,[{op:'insert',at:[1,0,3],content:'peer'}],13);capture('B label edit');apply(A,text);capture('deliver text');
 const deleted=edit(A,[{op:'delete',at:[0],count:1}],15);capture('delete frame');apply(B,deleted);capture('deliver delete');travel(A,'undo');capture('undo delete');travel(A,'redo');capture('redo delete');
 const saved={doc:A.doc.snapshot(),history:A.history.snapshot(),pending:A.pending};A={doc:Doc.fromSnapshot('A',saved.doc,schema),history:History.fromSnapshot(saved.history),pending:saved.pending};for(let n=0;n<2;n++)for(const c of A.pending)apply(A,c);capture('restore exact retry');
}finally{Date.now=originalNow;}
function normalizeRust(s){return {model:normalizeNode(s.model),history:s.history};}function normalizeNode(n){return{type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(normalizeNode),runs:n.runs??[]};}
const normalized=rust.map(r=>({label:r.label,A:normalizeRust(r.A),B:normalizeRust(r.B)}));
writeFileSync(resolve(out,'native-trace.json'),JSON.stringify(rust,null,2)+'\n');writeFileSync(resolve(out,'typescript-trace.json'),JSON.stringify(ts,null,2)+'\n');
let failure=null;try{assert.equal(rust.length,20);assert.deepEqual(normalized,ts);}catch(error){failure=error.message;}
const hashes=Object.fromEntries(['experiments/rust-shadow/schema-graphic.json','experiments/rust-shadow/src/graphic.rs','experiments/rust-shadow/src/movement.rs','experiments/rust-sdk/src/graphic.rs','experiments/rust-sdk/examples/graphic_trace.rs','experiments/rust-sdk/scripts/compare-graphic-typescript.mjs',binary].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const receipt={status:failure?'FAIL':'PASS',actions:20,actorStateComparisons:40,scope:'Independent native GraphicDocument and TypeScript Doc/History authoring: empty canvas/frame/group, label UTF16, concurrent independent fields, selective undo, reparent subtree, concurrent label edit, deletion, undo/redo, snapshot restore, duplicate own pending retry',normalizations:['Remove native stable ID projection fields','Omitted attrs/children/runs become empty containers','TypeScript text strings become UTF16 units'],notRun:['exact wire-op parity','cross-runtime wire exchange','runtime custom GraphicSchema','new TypeScript builtin vector/affine schema','renderer','WASM','browser factory'],hashes,failure};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');if(failure){console.error(failure);process.exitCode=1;}else console.log('PASS: 20 graphic actions; 40 actor model/history comparisons. No wire compatibility claim.');
