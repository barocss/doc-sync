import {collectFingerprints, runtimeProvenance, hashFile} from '../../rust-shadow-harness/fingerprints.mjs';
// Bounded independent oracle: TypeScript commands author their own operations.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {delimiter, dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Doc} from '../../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../../packages/doc-sync/dist/crdt/history.js';
import * as cmd from '../../../packages/doc-sync/dist/crdt/commands.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = resolve(root, process.env.RUST_SDK_OUT ?? 'output/r4-sdk-evidence');
mkdirSync(out, {recursive:true});
function stableTool(name) {
    const result=spawnSync('rustup',['which','--toolchain','stable',name],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr || `rustup could not resolve stable ${name}`);
    return result.stdout.trim();
}
const rustToolchain={cargo:stableTool('cargo'),rustc:stableTool('rustc'),rustdoc:stableTool('rustdoc')};
const env = {...process.env, PATH:dirname(rustToolchain.cargo) + delimiter + process.env.PATH, RUSTC:rustToolchain.rustc, RUSTDOC:rustToolchain.rustdoc, CARGO_TARGET_DIR:resolve(root,'output/r4-sdk-target')};
const build = spawnSync(rustToolchain.cargo,['build','--offline','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','authoring_trace'], {cwd:root,env,encoding:'utf8'});
assert.equal(build.status,0,build.stderr);
const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/authoring_trace'+(process.platform==='win32'?'.exe':''));
const provenance=runtimeProvenance(Doc,History);
const hashesBefore=collectFingerprints(binary);
const run=spawnSync(binary,[],{cwd:root,env,encoding:'utf8'});
writeFileSync(resolve(out,'sdk-authoring-rust.log'),run.stderr ?? '');
assert.equal(run.status,0,run.stderr);
writeFileSync(resolve(out,'sdk-authoring-rust-trace.json'),run.stdout);
const rust = JSON.parse(run.stdout);
const schema = JSON.parse(readFileSync(resolve(root,'experiments/rust-shadow/schema.json'),'utf8'));
let A = {doc:new Doc('A',schema),history:new History(),pending:[]};
const B = {doc:new Doc('B',schema),history:new History(),pending:[]};
const ts = [];
let now = 0;
const originalNow = Date.now;
Date.now = () => now;
const units = text => Array.from({length:text.length},(_,i)=>text.charCodeAt(i));
const wire = ops => ops.map(op => {
    if(op.t !== 'text') return structuredClone(op);
    const {text,...rest}=op;
    return {...rest,marks:op.marks??{},units:units(text)};
});
const model = n => ({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=> 'text' in r ? {units:units(r.text),marks:r.marks}:model(r))});
const state = p => ({model:model(p.doc.toJSON()),history:{canUndo:p.history.canUndo,canRedo:p.history.canRedo},pending:p.pending.map(wire)});
function capture(label, ops=[]) { ts.push({label,ops:wire(ops),A:state(A),B:state(B)}); }
function record(p,ops,time) {
    now=time;p.history.record(ops,p.doc,{caretBefore:'',caretAfter:'',typing:false});
    if(ops.length) p.pending.push(structuredClone(ops));return ops;
}
function travel(p,action) { const {ops}=p.history[action](p.doc);if(ops.length)p.pending.push(structuredClone(ops));return ops; }
function apply(p,ops) { for(const op of ops)p.doc.apply(op); }
try {
    const ac=record(A,cmd.insertText(A.doc,{b:0,o:0},String.fromCharCode(0xd800,0x61,0xdc00),{italic:true}),1);
    capture('A insert isolated UTF16 explicit italic',ac);
    const bc=record(B,cmd.insertText(B.doc,{b:0,o:0},'B',{}),2);
    capture('B concurrent insert explicit empty marks',bc);
    apply(A,bc);capture('A apply B insert');
    apply(B,ac);capture('B apply A insert');
    const am=record(A,cmd.setMark(A.doc,{b:0,o:1},{b:0,o:2},'bold',true),5);
    capture('A bold first A unit',am);
    apply(B,am);capture('B apply A mark');
    const bm=record(B,cmd.setMark(B.doc,{b:0,o:1},{b:0,o:2},'bold',true),7);
    capture('B same value foreign mark',bm);
    apply(A,bm);capture('A apply B mark');
    capture('A undo fenced mark',travel(A,'undo'));
    const ad=record(A,cmd.deleteRange(A.doc,{b:0,o:2},{b:0,o:3}),10);
    capture('A delete middle A unit',ad);
    const bd=record(B,cmd.deleteRange(B.doc,{b:0,o:2},{b:0,o:3}),11);
    capture('B concurrent delete same unit',bd);
    apply(A,bd);capture('A apply B delete');
    apply(B,ad);capture('B apply A delete');
    const saved=JSON.parse(JSON.stringify({doc:A.doc.snapshot(),history:A.history.snapshot(),pending:A.pending}));
    A={doc:Doc.fromSnapshot('A',saved.doc,schema),history:History.fromSnapshot(saved.history),pending:saved.pending};
    for(let i=0;i<2;i++)for(const ops of A.pending){apply(A,ops);apply(B,ops);}
    capture('A restart and exact pending retry twice to A and B');
    const undo=travel(A,'undo');capture('A undo own deletion foreign remains',undo);
    apply(B,undo);capture('B apply A undelete');
    const redo=travel(A,'redo');capture('A redo own deletion',redo);
    apply(B,redo);capture('B apply A redo');
    const bu=travel(B,'undo');capture('B undo own deletion A remains',bu);
    apply(A,bu);capture('A apply B undelete');
} finally { Date.now=originalNow; }
writeFileSync(resolve(out,'sdk-authoring-typescript-trace.json'),JSON.stringify(ts,null,2)+'\n');
let failure=null;
try { assert.equal(rust.length,20);assert.deepEqual(rust,ts); }
catch(error){failure=error.message;}
const hashesAfter=collectFingerprints(binary);
assert.deepEqual(hashesAfter,hashesBefore,'source, compiled packages, compiler and native binary unchanged during comparison');
const paths=['sdk-authoring-rust-trace.json','sdk-authoring-typescript-trace.json'].map(name=>{
    const absolute=resolve(out,name),local=relative(root,absolute);
    return local==='..'||local.startsWith('..'+sep)||isAbsolute(local)?absolute:local;
});
const hashes={...hashesAfter,...Object.fromEntries(paths.map(path=>[path,hashFile(path)]))};
const receipt={binary,rustToolchain,runtimeProvenance:provenance,hashesBefore,hashesAfter,status:failure?'FAIL':'PASS',actions:20,actorStateComparisons:40,operationBatches:20,scope:'Independent native SDK authoring vs TypeScript Doc/History/commands; explicit marks, UTF16 units, concurrent insert/delete, foreign same-value writer, undo/redo, checkpoint restart and duplicate pending retry; model, exact wire ops, canUndo/canRedo, exact pending operations after each action.',normalizations:['TS text strings to UTF16 units','omitted text birth marks to empty map','omitted model attrs/children/runs to empty containers'],notRun:['adapter','network','production','generic doc.edit compiler','full History snapshot structural equivalence'],hashes,failure};
writeFileSync(resolve(out,'sdk-typescript-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
if(failure){console.error(failure);process.exitCode=1;}else console.log('PASS: 20 SDK-authored actions; 40 actor states; exact wire ops, model UTF16, history availability, pending retry.');
