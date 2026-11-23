// Preserve the model-position insertion gap after a nested grid moves.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {documents} from './fixtures.mjs';
const root=resolve(new URL('../../',import.meta.url).pathname),out=resolve(root,'output/rust-d2-grid-2026-11-04/d3-postmove');mkdirSync(out,{recursive:true});
const paths=['experiments/runtime-document-grid/d3-probe.mjs','experiments/runtime-document-grid/fixtures.mjs','experiments/rust-sdk/examples/runtime_grid_trace.rs',...['experiments/rust-sdk/src','experiments/rust-shadow/src','packages/doc-sync/dist/crdt'].flatMap(dir=>readdirSync(resolve(root,dir),{recursive:true}).filter(p=>/\.(?:rs|js)$/.test(p)).map(p=>dir+'/'+p))];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));const before=hashes();
const trace=JSON.parse(readFileSync(resolve(root,'output/rust-d2-grid-2026-11-04/compare/typescript-trace.json'),'utf8'));
const f=documents[0],index=f.commands.findIndex(c=>c.label==='grid move redo delivery'),step=trace.documents[0].trace[index],d=Doc.fromSnapshot('A',step.A.checkpoint.document,f.schema),h=History.fromSnapshot(step.A.history),gridType=f.commands.find(c=>c.alias==='deepGrid').kind,grid=d.toJSON().children.findIndex(n=>n.type===gridType);assert(grid>=0);
const atom=Object.entries(f.schema.nodes).find(([,n])=>n.shape==='atom')[0],edit={op:'insert',at:[grid+1],content:[{type:atom}]};const old=Date.now;Date.now=()=>f.commands[index].time+1;const ops=d.edit([edit]).ops;h.record(ops,d,{caretBefore:'',caretAfter:'',typing:false});Date.now=old;assert(ops.length>0);
const command={label:'D3 insert after moved grid',actor:'A',op:'insertBlock',parent:null,after:'deepGrid',kind:atom,attrs:{},time:f.commands[index].time+1};const input={documents:[{...f,commands:[...f.commands.slice(0,index+1),command]}],unsupported:[]};writeFileSync(resolve(out,'native-input.json'),JSON.stringify(input,null,2)+'\n');
const r=spawnSync(resolve(root,'output/rust-d2-grid-2026-11-04/compare-target/debug/examples/runtime_grid_trace'),[],{input:JSON.stringify(input),encoding:'utf8',maxBuffer:128*1024*1024});writeFileSync(resolve(out,'native.stderr'),r.stderr);writeFileSync(resolve(out,'native.stdout'),r.stdout);assert.notEqual(r.status,0);assert.match(r.stderr,/document anchor is outside source flow/);assert.deepEqual(hashes(),before);
const receipt={status:'OBSERVED_D3_GAP',schema:f.name,label:command.label,typescript:{status:'AUTHORED',edit,ops,history:h.snapshot(),model:d.toJSON()},native:{status:'REJECTED',exitCode:r.status,error:r.stderr},explanation:'TS compiles a model insertion position after the moved grid. Native insert_block_in uses a physical source-flow anchor; the moved grid remains born in its nested source sequence. The SDK rejects that root-flow physical anchor. This existing D3 model-position compiler gap remains open.',hashesBefore:before,hashesAfter:hashes()};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,out}));
