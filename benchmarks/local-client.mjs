/** Offline, headless real PM host comparison. Never connects a transport. Node 24. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve, join} from 'node:path';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const [k,...v]=s.replace(/^--/,'').split('=');return [k,v.join('=')||true];}));
if(args.compare){
 const paths=String(args.compare).split(',').map(path=>resolve(path)),reports=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
 assert.ok(reports.length>=2,'compare needs baseline and candidate report paths');
 const baseline=reports[0],rows=[];
 for(let n=1;n<reports.length;n++){const candidate=reports[n];
  assert.deepEqual(candidate.sizes,baseline.sizes);assert.equal(candidate.harnessHash,baseline.harnessHash,'same benchmark required');
  for(const size of baseline.sizes)for(const scenario of [...new Set(baseline.rows.map(r=>r.scenario))]){
   const select=r=>r.rows.filter(row=>row.size===size&&row.scenario===scenario),a=select(baseline),b=select(candidate);
   const samples=rows=>rows.flatMap(row=>row.samples).sort((x,y)=>x-y),q=(s,p)=>s[Math.min(s.length-1,Math.ceil(p*s.length)-1)],as=samples(a),bs=samples(b);
   assert.equal(b[0].invariants[0].modelHash,a[0].invariants[0].modelHash,`${scenario}: model parity`);
   if(scenario!=='external')assert.equal(b[0].invariants[0].generatedHash,a[0].invariants[0].generatedHash,`${scenario}: generated operation parity`);
   if(['insert','delete','mark','selection'].includes(scenario))for(const key of ['snapshot','fromSnapshot','toJSON','pmFromJSON'])assert.ok(b.every(row=>row.counts.every(count=>count[key]<=Math.max(...a.flatMap(row=>row.counts.map(count=>count[key]))))),`${scenario}: extra ${key}`);
   const a50=q(as,.5),b50=q(bs,.5),a95=q(as,.95),b95=q(bs,.95);
   rows.push({candidate:paths[n],size,scenario,baselineP50:a50,candidateP50:b50,baselineP95:a95,candidateP95:b95,medianBudgetMs:Math.max(a50*.10,.1),p95BudgetMs:Math.max(a95*.15,.2),timingStatus:baseline.mode!=='timing'||candidate.mode!=='timing'?'NOT_RUN':b50-a50>Math.max(a50*.10,.1)||b95-a95>Math.max(a95*.15,.2)?'INVESTIGATE':'PASS'});
  }
 }
 const output=resolve(args.output||'output/local-client/comparison.json');await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify({format:1,inputs:paths,rows},null,2)+'\n');console.log(output);process.exit(0);
}
const target=resolve(args.target||process.cwd()), backend=args.backend||'sync', mode=args.mode||'counts';
const sizes=String(args.sizes||'10000,100000').split(',').map(Number), reps=Number(args.reps||10),warmups=Number(args.warmups||3);
const output=resolve(args.output||`output/local-client/${backend}-${mode}.json`);
const schema={root:'content',marks:['bold'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const imp=p=>import(pathToFileURL(join(target,p)).href);
const [{Doc,applyEdits},{SyncClient},{createSyncClientEditorHost},{PmHostBinding,buildPmSchema,fromPmJSON}]=await Promise.all([
 imp('packages/doc-sync-core/dist/index.js'),imp('packages/doc-sync-core/dist/sync/index.js'),imp('packages/doc-sync-core/dist/editor/index.js'),imp('packages/doc-sync-prosemirror/dist/index.js')]);
const local=backend==='local'?await imp('packages/doc-sync-core/dist/local/index.js'):null;
const req=createRequire(join(target,'packages/doc-sync-prosemirror/dist/index.js'));
const peer=name=>import(pathToFileURL(req.resolve(name).replace(/\/dist\/index\.cjs$/,'/dist/index.js')).href);
const [{Node:PmNode},{TextSelection}]=await Promise.all([peer('prosemirror-model'),peer('prosemirror-state')]);
const info=buildPmSchema(schema),counters={snapshot:0,fromSnapshot:0,toJSON:0,pmFromJSON:0};let tracing=false;
for(const [obj,key,count]of [[Doc.prototype,'snapshot','snapshot'],[Doc,'fromSnapshot','fromSnapshot'],[Doc.prototype,'toJSON','toJSON'],[PmNode,'fromJSON','pmFromJSON']]){const original=obj[key];obj[key]=function(...values){if(tracing)counters[count]++;return original.apply(this,values);};}
async function fingerprint(){const files={};async function walk(path){for(const e of (await readdir(join(target,path),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(path,e.name);if(e.isDirectory())await walk(p);else files[p]=hash(await readFile(join(target,p),'utf8'));}}for(const pkg of ['doc-sync-core','doc-sync-prosemirror'])await walk(`packages/${pkg}/dist`);return {aggregate:hash(files),files};}
const before=await fingerprint();
function setup(size){const transportCalls={subscribe:0,send:0,presence:0};const client=local?new local.LocalClient({schema,actor:'A'}):new SyncClient('A',{subscribe(){transportCalls.subscribe++;return()=>{};},async send(){transportCalls.send++;},sendPresence(){transportCalls.presence++;}},{schema});
 const host=local?local.createLocalEditorHost(client):createSyncClientEditorHost(client);
 const seed=[{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:Array.from({length:size/100},()=>({type:'paragraph',runs:[{text:'abcdefghij'.repeat(10),marks:{}}]}))}];
 host.commit(host.apply(seed));client.clearHistory();
 const binding=new PmHostBinding(host,info),generated=[];const commit=host.commit.bind(host);host.commit=(ops,record)=>{generated.push(structuredClone(ops));return commit(ops,record);};
 return {client,host,binding,generated,transportCalls,close(){binding.dispose();if(!local)client.disconnect();}};
}
const scenarios=['insert','delete','mark','selection','composition','external','undo','redo'];
function prepare(f,scenario,index){const {host,binding,client}=f;const middle=Math.floor(binding.state.doc.childCount/2);let pos=4;for(let i=0;i<middle;i++)pos+=binding.state.doc.child(i).nodeSize;
 const initial=host.model().model;const edits={insert:{op:'insert',at:[middle,3],content:'X'},delete:{op:'delete',at:[middle,3],count:1},mark:{op:'update',at:[middle,3],length:1,attrs:{bold:true}},composition:{op:'insert',at:[middle,3],content:'한글'},external:{op:'insert',at:[middle,3],content:'E'}};
 let expected=edits[scenario]?applyEdits(schema,initial,[edits[scenario]]):initial,action;
 if(scenario==='insert')action=()=>binding.dispatch(binding.state.tr.insertText('X',pos));
 if(scenario==='delete')action=()=>binding.dispatch(binding.state.tr.delete(pos,pos+1));
 if(scenario==='mark')action=()=>binding.dispatch(binding.state.tr.addMark(pos,pos+1,info.pm.marks.bold.create()));
 if(scenario==='selection')action=()=>binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc,pos+index%2)));
 if(scenario==='external')action=()=>{if(local)client.edit([edits.external]);else{host.commit(host.apply([edits.external]));binding.pull();}};
 if(scenario==='composition'){const session=host.createSession();action=()=>{session.begin();session.commit(session.apply([{op:'insert',at:[middle,3],content:'한'}]));session.commit(session.apply([{op:'insert',at:[middle,4],content:'글'}]));session.end();binding.pull();};}
 if(scenario==='undo'||scenario==='redo'){binding.dispatch(binding.state.tr.insertText('U',pos));const inserted=host.model().model;if(scenario==='undo')action=()=>binding.undo();else{binding.undo();expected=inserted;action=()=>binding.redo();}}
 return {action,expected};
}
const rows=[],blocks=Number(args.blocks||1);
for(let block=0;block<blocks;block++)for(const size of sizes)for(const scenario of scenarios){const samples=[],counts=[],invariants=[];for(let i=0;i<(mode==='timing'?warmups+reps:1);i++){const f=setup(size);try{const {action,expected}=prepare(f,scenario,i);for(const k in counters)counters[k]=0;tracing=true;const start=performance.now();try{action();}finally{tracing=false;}const ms=performance.now()-start,observed={...counters};
 const model=f.host.model().model;assert.deepEqual(model,expected,`${backend}/${scenario}: fixed semantic oracle`);assert.deepEqual(fromPmJSON(info,schema,f.binding.state.doc.toJSON()),expected,`${backend}/${scenario}: native projection`);assert.deepEqual(f.transportCalls,{subscribe:0,send:0,presence:0});
 if(['insert','delete','mark','selection','external','undo','redo'].includes(scenario)){assert.equal(observed.snapshot,0,`${scenario}: snapshot`);assert.equal(observed.fromSnapshot,0,`${scenario}: restore`);}

 if(mode!=='timing'||i>=warmups){samples.push(ms);counts.push(observed);invariants.push({modelHash:hash(model),generatedHash:hash(f.generated),generation:f.host.stamp().generation,revision:f.host.stamp().revision,history:f.host.historyStatus(),nativeStats:{...f.binding.stats},transportCalls:f.transportCalls});}
 }finally{f.close();}await new Promise(resolve=>setImmediate(resolve));}
 const sorted=[...samples].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];rows.push({block,size,scenario,samples,counts,p50:q(.5),p95:q(.95),invariants});console.error(`${backend}/${mode} block=${block} size=${size} ${scenario}`);}
const after=await fingerprint();assert.equal(before.aggregate,after.aggregate,'dist changed during measurement');
const report={format:1,target,backend,mode,node:process.version,execPath:process.execPath,date:new Date().toISOString(),boundary:'Real PM native headless transactions; excludes browser paint and OS IME. External SyncClient application includes explicit pull; LocalClient notifies automatically.',budget:{ordinarySnapshots:0,ordinaryNativeFromJSON:"no increase over paired SyncClient baseline",median:{relative:.10,absoluteMs:.1},p95:{relative:.15,absoluteMs:.2},rule:'Investigate regression above max(relative baseline, absolute); no timing claim from counts mode.'},sizes,reps,warmups,blocks,harnessHash:hash(await readFile(new URL(import.meta.url),'utf8')),before,after,rows};
await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(output);
