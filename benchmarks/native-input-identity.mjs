import {corePackageName, corePackagePath} from './core-package.mjs';
/** Native Slate/Lexical splice cost, independently imported checkout distributions. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const [k,...v]=arg.replace(/^--/,'').split('=');return [k,v.join('=')||true]}));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const quantile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
if(args.compare){
 const paths=String(args.compare).split(',').map(p=>resolve(p)),[before,after]=await Promise.all(paths.map(async p=>JSON.parse(await readFile(p,'utf8'))));assert.equal(paths.length,2);assert.equal(before.result,'PASS');assert.equal(after.result,'PASS');assert.equal(before.harnessHash,after.harnessHash);assert.deepEqual(before.sizes,after.sizes);assert.equal(before.node,after.node);const timingEnabled=before.mode==='timing'&&after.mode==='timing';
 const rows=before.rows.map(a=>{const b=after.rows.find(r=>r.editor===a.editor&&r.size===a.size&&r.scenario===a.scenario);assert.ok(b);assert.equal(a.modelHash,b.modelHash);assert.deepEqual(a.history,b.history);const p50a=quantile(a.samples.map(s=>s.ms),.5),p50b=quantile(b.samples.map(s=>s.ms),.5),p95a=quantile(a.samples.map(s=>s.ms),.95),p95b=quantile(b.samples.map(s=>s.ms),.95);const countIncreases=a.scenario==='replace_marks'?['snapshot','fromSnapshot','toJSON'].filter(key=>Math.max(...b.samples.map(s=>s.counts[key]))>Math.max(...a.samples.map(s=>s.counts[key]))):[];const timingStatus=!timingEnabled?'NOT_RUN':p50b-p50a>Math.max(p50a*.10,.1)||p95b-p95a>Math.max(p95a*.15,.2)?'INVESTIGATE':'PASS';return {editor:a.editor,size:a.size,scenario:a.scenario,timingStatus,countStatus:countIncreases.length?'INVESTIGATE':'PASS',countIncreases,baselineMedian:p50a,candidateMedian:p50b,baselineP95:p95a,candidateP95:p95b,medianBudget:Math.max(p50a*.10,.1),p95Budget:Math.max(p95a*.15,.2),status:timingStatus==='INVESTIGATE'||countIncreases.length?'INVESTIGATE':'PASS',beforeCounts:a.samples.map(s=>s.counts),afterCounts:b.samples.map(s=>s.counts)}});
 const output=resolve(args.output||'output/unified-client-delivery/native-identity/comparison.json');await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify({result:rows.some(r=>r.status==='INVESTIGATE')?'INVESTIGATE':'PASS',paths,harnessHash:before.harnessHash,boundary:before.boundary,rows},null,2)+'\n');console.log(output);process.exit(0);
}
assert.equal(Number(process.versions.node.split('.')[0]),24,'Use Node 24 for the paired measurements');
const target=resolve(args.target||process.cwd()),output=resolve(args.output||'output/unified-client-delivery/native-identity/current.json');
const mode=args.mode||'timing';assert.ok(['counts','timing'].includes(mode));const sizes=[10000,100000],warmups=mode==='timing'?2:0,repetitions=mode==='timing'?8:1;
const imp=path=>import(pathToFileURL(join(target,path)).href);
const [{Doc,applyEdits,canonical},{SyncClient},slateBinding,lexicalBinding]=await Promise.all([imp(`${corePackagePath(target)}/dist/index.js`),imp(`${corePackagePath(target)}/dist/sync/index.js`),imp('packages/doc-sync-slate/dist/index.js'),imp('packages/doc-sync-lexical/dist/index.js')]);
const requireSlate=createRequire(join(target,'packages/doc-sync-slate/dist/index.js')),requireLexical=createRequire(join(target,'packages/doc-sync-lexical/dist/index.js'));
const slate= requireSlate('slate');
// Lexical's require and import conditions may hold separate active-editor globals.
// Resolve the import entry with the target checkout's module resolution conditions.
const lexicalPath=requireLexical.resolve('lexical');
const lexical=await import(pathToFileURL(lexicalPath).href);
const richPath=requireLexical.resolve('@lexical/rich-text');
const {registerRichText}=await import(pathToFileURL(richPath).href);
const schema={root:'content',marks:['bold'],nodes:{content:{shape:'flow',children:['paragraph'],default:'paragraph'},paragraph:{shape:'text'}}};
const counters={snapshot:0,fromSnapshot:0,toJSON:0};let tracing=false;
for(const [object,key]of [[Doc.prototype,'snapshot'],[Doc,'fromSnapshot'],[Doc.prototype,'toJSON']]){const original=object[key];object[key]=function(...values){if(tracing)counters[key]++;return original.apply(this,values)}}
async function fingerprint(){const files={};async function walk(path){for(const entry of (await readdir(join(target,path),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(path,entry.name);if(entry.isDirectory())await walk(p);else files[p]=hash(await readFile(join(target,p)))}}for(const name of [corePackageName(target),'doc-sync-slate','doc-sync-lexical'])await walk(`packages/${name}/dist`);return {aggregate:hash(files),files}}
const flush=async()=>{await Promise.resolve();await Promise.resolve()};
function setup(size,name){
 const transportCalls={subscribe:0,send:0,presence:0},transport={subscribe(){transportCalls.subscribe++;return()=>{}},async send(){transportCalls.send++},sendPresence(){transportCalls.presence++}};
 const client=new SyncClient('native-A',transport,{schema});
 const content=Array.from({length:size/100},()=>({type:'paragraph',runs:[{text:'abcdefghij',marks:{bold:true}},{text:'abcdefghij'.repeat(9),marks:{}}]}));
 client.commit(client.doc.edit([{op:'delete',at:[0],count:1},{op:'insert',at:[0],content}]).ops);client.clearHistory();const generated=[],commit=client.commit.bind(client);client.commit=(ops,...options)=>{generated.push(structuredClone(ops));return commit(ops,...options)};
 const errors=[];let editor,binding,read,select,change,dispose;
 if(name==='Slate'){
  editor=slate.createEditor();binding=new slateBinding.SlateBinding(client,editor,{groupTyping:false,onError:e=>errors.push(String(e))});read=()=>slateBinding.fromSlate(schema,editor.children);
  select=range=>{const native=slateBinding.modelRangeToSlate(schema,editor.children,range);assert.ok(native);slate.Transforms.select(editor,native)};
  change=(scenario,text)=>{if(scenario==='delete')slate.Transforms.delete(editor);else slate.Transforms.insertText(editor,text)};dispose=()=>binding.dispose();
 }else{
  const info=lexicalBinding.buildLexicalSchema(schema);editor=lexical.createEditor({nodes:info.nodes,onError:e=>errors.push(String(e))});const stop=registerRichText(editor);binding=new lexicalBinding.LexicalBinding(client,editor,{info,groupTyping:false,onError:e=>errors.push(String(e))});read=()=>lexicalBinding.readLexicalModel(editor,info);
  select=range=>editor.update(()=>{assert.ok(lexicalBinding.$setLexicalSelection(info,range));const selection=lexical.$getSelection();assert.ok(lexical.$isRangeSelection(selection));const anchor=selection.anchor.getNode();assert.ok(lexical.$isTextNode(anchor));selection.setFormat(anchor.getFormat())},{discrete:true});
  change=(scenario,text)=>editor.update(()=>{const selection=lexical.$getSelection();assert.ok(lexical.$isRangeSelection(selection));selection.insertText(scenario==='delete'?'':text)},{discrete:true});dispose=()=>{binding.dispose();stop()};
 }
 return {client,binding,read,select,change,transportCalls,errors,dispose,generated};
}
const report={result:'RUNNING',mode,target,node:process.version,execPath:process.execPath,sizes,warmups,repetitions,rows:[],harnessHash:hash(await readFile(new URL(import.meta.url))),boundary:'Real native Slate Transforms and headless Lexical selections over raw disconnected SyncClient. No browser, DOM, transport delivery, OS IME or physical display claim. Tests insertion semantics and one history group; foreign-actor ownership is qualified separately by browser regression proof.',codecConversions:'NOT_INSTRUMENTED: replacing exported ESM codec bindings does not intercept their internal imports; Doc snapshot/fromSnapshot/toJSON counts are direct instrumentation.',budget:{median:{relative:.10,absoluteMs:.1},p95:{relative:.15,absoluteMs:.2},rule:'INVESTIGATE when candidate exceeds baseline by max(relative, absolute). No threshold override flags.'}};
let failed;
try{
 report.before=await fingerprint();
 for(const name of ['Slate','Lexical'])for(const size of sizes)for(const scenario of ['insert_text','plain_prefix','delete','replace_marks']){
  const row={editor:name,size,scenario,samples:[],warmupSamples:[]};report.rows.push(row);
  for(let index=-warmups;index<repetitions;index++){
   const f=setup(size,name);try{
    await flush();const initial=canonical(schema,f.client.doc.toJSON());
    const start=scenario==='plain_prefix'?0:3,end=['delete','replace_marks'].includes(scenario)?6:start,text=scenario==='plain_prefix'?'abc':scenario==='replace_marks'?'XYZ':'X';
    f.select({anchor:[0,start],focus:[0,end]});await flush();f.client.clearHistory();
    const edits=[];if(end>start)edits.push({op:'delete',at:[0,start],count:end-start});if(scenario!=='delete')edits.push({op:'insert',at:[0,start],content:[{text,marks:{bold:true}}]});const expected=canonical(schema,applyEdits(schema,initial,edits));
    f.generated.length=0;for(const key in counters)counters[key]=0;tracing=true;const began=performance.now();try{f.change(scenario,text);await flush()}finally{tracing=false}const ms=performance.now()-began,counts={...counters};
    report.activeSample={editor:name,size,scenario,index,ms,counts,generated:structuredClone(f.generated)};const model=canonical(schema,f.client.doc.toJSON());assert.deepEqual(model,expected,`${name}/${scenario}: fixed model oracle`);assert.deepEqual(canonical(schema,f.read()),expected,`${name}/${scenario}: native projection`);assert.deepEqual(f.errors,[]);assert.deepEqual(f.transportCalls,{subscribe:0,send:0,presence:0});assert.deepEqual(f.client.historyStatus(),{canUndo:true,canRedo:false});if(scenario!=='replace_marks'){assert.equal(counts.snapshot,0);assert.equal(counts.fromSnapshot,0)}
    const sample={index,ms,counts,generated:structuredClone(f.generated),generatedHash:hash(f.generated),operationCount:f.generated.flat().length,modelHash:hash(model),history:{...f.client.historyStatus()}};(index<0?row.warmupSamples:row.samples).push(sample);row.modelHash=sample.modelHash;row.history=sample.history;
    f.binding.undo();await flush();assert.deepEqual(canonical(schema,f.client.doc.toJSON()),initial,`${name}/${scenario}: one undo`);assert.deepEqual(f.client.historyStatus(),{canUndo:false,canRedo:true});assert.deepEqual(canonical(schema,f.read()),initial);
    f.binding.redo();await flush();assert.deepEqual(canonical(schema,f.client.doc.toJSON()),expected);assert.deepEqual(canonical(schema,f.read()),expected);assert.deepEqual(f.client.historyStatus(),{canUndo:true,canRedo:false});
   }finally{f.dispose();f.client.disconnect()}await new Promise(r=>setImmediate(r));
  }
  row.median=quantile(row.samples.map(s=>s.ms),.5);row.p95=quantile(row.samples.map(s=>s.ms),.95);console.error(`${name}/${size}/${scenario}`);
 }
 report.after=await fingerprint();assert.equal(report.before.aggregate,report.after.aggregate,'Target distribution changed during measurement');report.result='PASS';
}catch(error){failed=error;report.result='FAIL';report.firstFailure=String(error.stack??error)}finally{report.finishedAt=new Date().toISOString();await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({result:report.result,output,firstFailure:report.firstFailure??null}));if(failed)throw failed;
