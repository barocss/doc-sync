/** Headless Node PM host gate. Run with Node 24; no TS/source loader. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve, join, relative} from 'node:path';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
const args = Object.fromEntries(process.argv.slice(2).map(s => {const [k,...v]=s.replace(/^--/,'').split('='); return [k,v.join('=')||true];}));
const target = resolve(args.target || process.cwd());
const output = resolve(args.output || join(process.cwd(),'output/editor-host-evidence/run.json'));
const mode = args.mode || 'counts';
const reps = Number(args.reps || 8), warmups = Number(args.warmups || 2);
const sizes = String(args.sizes || '10000,100000').split(',').map(Number);
const imp = p => import(pathToFileURL(join(target,p)).href);
const [{Doc,schemaVersion,applyEdits}, {SyncClient,DOCUMENT_CAPABILITIES,PROTOCOL_VERSION}, {InputSession}, {PmBinding}, {buildPmSchema}, convert] = await Promise.all([
 imp('packages/doc-sync-core/dist/index.js'),imp('packages/doc-sync-core/dist/sync/index.js'),imp('packages/doc-sync-core/dist/editor/index.js'),
 imp('packages/doc-sync-prosemirror/dist/binding.js'),imp('packages/doc-sync-prosemirror/dist/schema.js'),imp('packages/doc-sync-prosemirror/dist/convert.js')]);
// Resolve peers from the target binding, then import the ESM entry (require would create a second PM class identity).
const peerRequire = createRequire(join(target,'packages/doc-sync-prosemirror/dist/binding.js'));
const peerPath = name => peerRequire.resolve(name).replace(/\/dist\/index\.cjs$/, '/dist/index.js');
const [{Node:PmNode},{TextSelection},{DecorationSet}] = await Promise.all(['prosemirror-model','prosemirror-state','prosemirror-view'].map(n=>import(pathToFileURL(peerPath(n)).href)));
const schema = {root:'content', marks:['bold','italic'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const info=buildPmSchema(schema);
function semanticHistory(history) { const snapshot=history.snapshot(); for(const key of ['undo','redo'])for(const group of snapshot[key])delete group.at; return snapshot; }
const hash = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
async function fingerprint() {
 const files={};
 async function walk(dir) {for (const ent of (await readdir(join(target,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
 const path=join(dir,ent.name); if(ent.isDirectory()) await walk(path); else if(/\.(?:ts|js|json)$/.test(path)) files[path]=hash(await readFile(join(target,path),'utf8'));
 }}
 for(const dir of ['packages/doc-sync-core/src','packages/doc-sync-core/dist','packages/doc-sync-prosemirror/src','packages/doc-sync-prosemirror/dist']) await walk(dir);
 for(const p of ['package-lock.json','scripts/build-package.mjs','scripts/build-packages.mjs']) files[p]=hash(await readFile(join(target,p),'utf8'));
 return {aggregate:hash(files),files,head:execFileSync('git',['rev-parse','HEAD'],{cwd:target,encoding:'utf8'}).trim()};
}
const before=await fingerprint();
const counters={snapshot:0,fromSnapshot:0,toJSON:0,pmFromJSON:0};
let tracing=false;
for(const [object,key,counter] of [[Doc.prototype,'snapshot','snapshot'],[Doc,'fromSnapshot','fromSnapshot'],[Doc.prototype,'toJSON','toJSON'],[PmNode,'fromJSON','pmFromJSON']]) {
 const original=object[key]; object[key]=function(...values){if(tracing)counters[counter]++; return original.apply(this,values);};
}
function measure(fn) { for(const k in counters)counters[k]=0; tracing=true; const start=performance.now(); try {fn(); return {ms:performance.now()-start,counts:{...counters}};} finally {tracing=false;} }
const fixtures=new Map();
for(const size of sizes) {
 const seed=new Doc('seed',schema), children=Array.from({length:size/100},(_,i)=>({type:'paragraph',runs:[{text:('abcdefghij'.repeat(10)),marks:{}}]}));
 seed.edit([{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:children}]);
 assert.equal(seed.toJSON().children.reduce((n,p)=>n+p.runs[0].text.length,0),size);
 fixtures.set(size,seed.snapshot());
}
function setup(size) {
 let receive; const sent=[];
 const client=new SyncClient('A',{subscribe:(_s,cb)=>{receive=cb;return()=>{};},send:async change=>{sent.push(change);},sendPresence:()=>{}},{schema});
 client.connect(); receive({type:'hello',schemaVersion:schemaVersion(schema),protocol:PROTOCOL_VERSION,capabilities:DOCUMENT_CAPABILITIES,epoch:'host-h0',serverSeq:1,snapshot:fixtures.get(size),presence:[],delSeqs:[]});
 const binding=new PmBinding(client,info); assert.equal(binding.client,client);
 let remoteCoreCounts=null, delivering=false; const pull=binding.pull.bind(binding); binding.pull=(...args)=>{if(delivering&&remoteCoreCounts===null)remoteCoreCounts={...counters};return pull(...args);};
 let seq=1; const generated=[];
 const originalCommit=client.commit.bind(client); client.commit=(ops,record)=>{generated.push(structuredClone(ops));return originalCommit(ops,record);};
 return {client,binding,generated,get remoteCoreCounts(){return remoteCoreCounts;},remote(ops){remoteCoreCounts=null;delivering=true;try{receive({type:'change',envelope:{serverSeq:++seq,change:{actor:'B',seq:seq-1,ops}}});}finally{delivering=false;}},close(){binding.dispose?.();client.disconnect();}};
}
const scenarios=['insert','delete','mark','selection','presence','remote1','remote2','remote8','composition','structure'];
function prepare(f,name,index) {
 const {client,binding}=f, middle=Math.floor(binding.state.doc.childCount/2);
 let pos=1; for(let i=0;i<middle;i++)pos+=binding.state.doc.child(i).nodeSize;
 pos+=3;
 let action,expected=null; const initialModel=client.doc.toJSON();
 const localEdit = name==='insert'?{op:'insert',at:[middle,3],content:'X'}:name==='delete'?{op:'delete',at:[middle,3],count:1}:name==='mark'?{op:'update',at:[middle,3],length:1,attrs:{bold:index%2?null:true}}:name==='composition'?{op:'insert',at:[middle,2],content:'한'}:null;
 if(localEdit)expected=applyEdits(schema,initialModel,[localEdit]);
 if(['selection','presence'].includes(name))expected=initialModel;
 if(name==='insert') action=()=>binding.dispatch(binding.state.tr.insertText('X',pos));
 if(name==='delete') action=()=>binding.dispatch(binding.state.tr.delete(pos,pos+1));
 if(name==='mark') action=()=>binding.dispatch(index%2?binding.state.tr.removeMark(pos,pos+1,info.pm.marks.bold):binding.state.tr.addMark(pos,pos+1,info.pm.marks.bold.create()));
 if(name==='selection') action=()=>binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc,pos+index%2)));
 if(name==='presence') {
 const anchor=client.doc.anchorOf({b:middle,o:2}),focus=client.doc.anchorOf({b:middle,o:5});
 action=()=>{client.others.set('B',{actor:'B',name:`B${index}`,color:'#2563eb',anchor,focus});binding.pull(); for(const plugin of binding.state.plugins){const dec=plugin.props.decorations?.call(plugin,binding.state); if(dec instanceof DecorationSet)dec.find();}};
 }
 if(name.startsWith('remote')||name==='structure') {
 const sender=Doc.fromSnapshot('B',client.doc.snapshot(),schema);
 // The remote clock is deterministic and newer than all previous local changes.
 const edits=name==='structure'?[{op:'split',at:[initialModel.children.length-1,2]}]:Array.from({length:Number(name.slice(6))},(_,i)=>({op:'insert',at:[middle+i,2],content:'R'}));
 const ops=sender.edit(edits).ops; assert.ok(ops.length); expected=sender.toJSON(); action=()=>f.remote(ops);
 }
 if(name==='composition') {
 const input=new InputSession(client); const old=client.pending.length; f.compositionUndo=client.history.snapshot().undo.length;
 action=()=>{input.begin();input.commit(input.doc.edit([{op:'insert',at:[middle,2],content:'한'}]).ops);input.end();binding.pull();};
 f.compositionPending=old;
 }
 return {action,expected};
}
function verify(f,name,prepared,result,oldPending) {
 const {client,binding}=f, model=client.doc.toJSON();
 const pm=PmNode.fromJSON(info.pm,convert.toPmJSON(schema,model)); assert.ok(binding.state.doc.eq(pm),`${name}: PM/core mismatch`);
 if(prepared.expected)assert.deepEqual(model,prepared.expected);
 if(name.startsWith('remote'))assert.equal(f.remoteCoreCounts.toJSON,0,'eligible text receipt: whole model read before PM callback');
 if(['selection','presence'].includes(name)){assert.equal(result.counts.toJSON,0);assert.equal(result.counts.pmFromJSON,0);assert.equal(client.pending.length,oldPending);}
 if(!['composition'].includes(name)){assert.equal(result.counts.snapshot,0,`${name}: full snapshot`);assert.equal(result.counts.fromSnapshot,0,`${name}: restore`);}
 else {assert.equal(result.counts.snapshot,1);assert.equal(result.counts.fromSnapshot,1);assert.equal(client.history.snapshot().undo.length,f.compositionUndo+1,'composition: one history group');}
 if(['insert','delete','mark','composition'].includes(name)){
 assert.equal(client.pending.length,oldPending+1,`${name}: pending count`);assert.equal(client.history.canUndo,true);assert.equal(client.history.canRedo,false);assert.ok(f.generated.at(-1).length);assert.deepEqual(f.generated.at(-1),client.pending.at(-1).ops);
 } else assert.equal(client.pending.length,oldPending);
 assert.equal(client.eventStats.fallbacks,0);
 return {modelHash:hash(model),generatedHash:hash(f.generated),pending:client.pending.length,historyHash:hash(semanticHistory(client.history)),stats:structuredClone(binding.stats),eventStats:structuredClone(client.eventStats),remoteCoreCounts:name.startsWith('remote')?f.remoteCoreCounts:null};
}
const rows=[];
// counts: one verified run. timing: self-control ABBA, 3 pairs (12 blocks), candidate later uses this exact schedule.
const schedule=args.schedule?String(args.schedule).split(','):mode==='timing'?['A','B','B','A','A','B','B','A','A','B','B','A']:['counts'];
for(let block=0;block<schedule.length;block++)for(const size of sizes){
 const f=setup(size);
 try{for(const scenario of scenarios){const samples=[],counts=[];let invariant;
 const iterations=mode==='timing'?warmups+reps:2;
 for(let i=0;i<iterations;i++){
 const prepared=prepare(f,scenario,i), pending=f.client.pending.length;
 const result=measure(prepared.action); invariant=verify(f,scenario,prepared,result,pending);
 if(mode!=='timing'||i>=warmups){samples.push(result.ms);counts.push(result.counts);}
 }
 const sorted=[...samples].sort((a,b)=>a-b), q=p=>sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];
 rows.push({block,label:schedule[block],size,scenario,samples,counts,p50:q(.5),p95:q(.95),max:sorted.at(-1),invariant});
 } }finally{f.close();}
 console.error(`${mode} block=${block} size=${size} complete`);
}
const after=await fingerprint(); assert.equal(after.aggregate,before.aggregate,'target source/dist changed during run');
const dependencies={}; for(const name of ['typescript','esbuild','prosemirror-model','prosemirror-state','prosemirror-view','prosemirror-transform']){
 const req=createRequire(join(target,'package.json'));let path;try{path=(name.startsWith('prosemirror')?peerRequire:req).resolve(name);}catch{} let version=null; if(path){let dir=resolve(path,'..');for(let i=0;i<5;i++){try{const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));if(pkg.name===name){version=pkg.version;break;}}catch{}dir=resolve(dir,'..');}} dependencies[name]={path:path||'UNRESOLVED',version};
}
const report={format:1,mode,target,node:process.version,execPath:process.execPath,date:new Date().toISOString(),boundary:'Node headless PM dispatch; excludes Chrome paint/native input/OS IME',schema,actors:['seed','A','B'],content:'100-character ASCII paragraphs',sizes,reps,warmups,schedule,harnessHash:hash(await readFile(new URL(import.meta.url),'utf8')),before,after,dependencies,rows};
if(mode==='timing'&&schedule.includes('A')&&schedule.includes('B')){
 report.control=scenarios.flatMap(scenario=>sizes.map(size=>{const selected=rows.filter(r=>r.scenario===scenario&&r.size===size),med=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)], a=med(selected.filter(r=>r.label==='A').map(r=>r.p95)),b=med(selected.filter(r=>r.label==='B').map(r=>r.p95));return {scenario,size,aP95:a,bP95:b,noiseMs:Math.abs(a-b),fixedGuardMs:Math.max(a*.1,.25)};}));
}
await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(output);
