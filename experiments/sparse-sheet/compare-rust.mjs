// Independent fixed command traces: neither implementation receives expected operations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, delimiter, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {SparseSheet} from './src/sheet.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(root,process.env.RUST_SHEET_OUT??'output/rust-sheet-proof-20261103');
mkdirSync(out,{recursive:true});
function stableTool(name) {
    const result=spawnSync('rustup',['which','--toolchain','stable',name],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);return result.stdout.trim();
}
const rustToolchain=Object.fromEntries(['cargo','rustc','rustdoc'].map(name=>[name,stableTool(name)]));
const env={...process.env,PATH:dirname(rustToolchain.cargo)+delimiter+process.env.PATH,RUSTC:rustToolchain.rustc,RUSTDOC:rustToolchain.rustdoc,
    CARGO_TARGET_DIR:resolve(root,'output/rust-sheet-sdk-20261103')};
const build=spawnSync(rustToolchain.cargo,['build','--offline','--manifest-path','experiments/rust-sdk/Cargo.toml','--example','sparse_sheet_trace'],{cwd:root,env,encoding:'utf8'});
assert.equal(build.status,0,build.stderr);
const binary=resolve(env.CARGO_TARGET_DIR,'debug/examples/sparse_sheet_trace');
const sources=['experiments/sparse-sheet/src/sheet.ts','experiments/sparse-sheet/compare-rust.mjs','experiments/rust-sdk/src/sparse_sheet.rs',
    'experiments/rust-sdk/examples/sparse_sheet_trace.rs','experiments/rust-sdk/tests/sparse_sheet.rs','experiments/rust-sdk/src/lib.rs',
    'experiments/rust-sdk/Cargo.toml','experiments/rust-sdk/Cargo.lock','packages/doc-sync/dist/index.js','packages/doc-sync/dist/crdt/ticket.js',binary];
const fingerprints=()=>Object.fromEntries(sources.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const hashesBefore=fingerprints();
const run=spawnSync(binary,[],{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});
assert.equal(run.status,0,run.stderr);
writeFileSync(resolve(out,'rust-trace.json'),run.stdout);writeFileSync(resolve(out,'rust-trace.log'),run.stderr??'');
const rust=JSON.parse(run.stdout);
let A=new SparseSheet({actor:'A',sheetId:'trace-sheet',rows:1_000_000_000,columns:1_000_000});
const B=new SparseSheet({actor:'B',sheetId:'trace-sheet',rows:1_000_000_000,columns:1_000_000});
const ts=[];
function state(s) {
    const checkpoint=s.captureState();
    return {model:s.getRange({row:0,column:0,rowCount:1_000_000_000,columnCount:1_000_000,limit:100}),stats:s.stats(),pending:s.pendingChanges(),
        history:{undo:checkpoint.checkpoint.undo,redo:checkpoint.checkpoint.redo},checkpoint};
}
function capture(label,ops=[]) {ts.push({label,ops,A:state(A),B:state(B)});}
capture('empty implicit axes');
const firstA=A.setCell(7,9,{value:'A',fill:'#fff'});capture('A concurrent first write',firstA);
const firstB=B.setCell(7,9,{value:'B',bold:true});capture('B concurrent first write',firstB);
A.receive(firstB);capture('A receives B first write');
B.receive(firstA);capture('B receives A first write');
const one=A.setCell(7,9,{value:1});capture('A value one',one);
const two=A.setCell(7,9,{value:2});capture('A value two',two);
B.receive([...two,...one,...firstA,...two]);capture('B shuffled duplicate delivery');
const format=B.setCell(7,9,{numberFormat:'0.00'});capture('B independent format',format);
A.receive(format);capture('A receives independent format');
for(const [label,action] of [['A undo two','undo'],['A undo one','undo'],['A redo one','redo'],['A redo two','redo']])capture(label,A[action]());
const pending=A.pendingChanges();B.receive(pending);capture('B receives history operations');
const same=B.setCell(7,9,{value:2});capture('B same value writer',same);
A.receive(same);capture('A receives same value writer');
capture('A undo fenced value',A.undo());
const clear=A.setCell(7,9,{value:null,formula:null,fill:null,bold:null,numberFormat:null});capture('A clears all fields',clear);
B.receive([...clear,...pending.toReversed(),...clear]);capture('B clear before old writes');
capture('A undo clear',A.undo());
A=SparseSheet.fromState(JSON.parse(JSON.stringify(A.captureState())));capture('A coupled restart with redo');
capture('A redo clear after restart',A.redo());
const formula=A.setCell(999_999_999,999_999,{value:7,formula:'=A1+1',bold:false});capture('A far static formula string',formula);
A.acknowledge(A.pendingChanges().slice(0,2));capture('A exact pending prefix acknowledgement');
A=SparseSheet.fromState(JSON.parse(JSON.stringify(A.captureState())));
const retry=A.pendingChanges();for(let i=0;i<2;i++){A.receive(retry.toReversed());B.receive(retry.toReversed());}
capture('A restart and duplicate shuffled pending retry twice');
const undo=A.undo();capture('A undo far write after restart',undo);
B.receive(undo);capture('B receives far undo');
const redo=A.redo();capture('A redo far write',redo);
B.receive(redo);capture('B receives far redo');
A.acknowledge(A.pendingChanges());capture('A acknowledges remaining pending');
writeFileSync(resolve(out,'typescript-trace.json'),JSON.stringify(ts,null,2)+'\n');
let failure=null;
try {assert.equal(rust.length,31);assert.deepEqual(rust,ts);}catch(error){failure=error.message;}
const hashesAfter=fingerprints();assert.deepEqual(hashesAfter,hashesBefore,'source/runtime/binary changed during differential run');
const receipt={status:failure?'FAIL':'PASS',actions:ts.length,actorStateComparisons:2*ts.length,rustToolchain,binary,
    scope:'Independent Rust and TypeScript sparse fixed-axis authoring; exact authored operations, sparse range models, per-field LWW, full linked undo/redo state, pending queues, journals and replay-validated checkpoints after each action.',
    cases:['implicit huge extent','concurrent first writes same and distinct fields','ASCII actor tie order','sequential undo/redo','peer same-value writer fence',
        'null-clear tombstones','shuffled duplicate delivery','losing operation retention','coupled restart with redo','exact pending prefix acknowledgement','duplicate pending retry twice'],
    notRun:['public Client integration','transport/network','wire protocol compatibility','row/column structural edits','interval axes','formula evaluation','browser UI','WASM'],
    hashesBefore,hashesAfter,traceHashes:Object.fromEntries(['rust-trace.json','typescript-trace.json'].map(name=>[name,createHash('sha256').update(readFileSync(resolve(out,name))).digest('hex')])),failure};
writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
if(failure){console.error(failure);process.exitCode=1;}else console.log(`PASS: ${ts.length} independent sparse-sheet authoring actions; ${2*ts.length} full actor states, exact ops/history/pending/checkpoints.`);
