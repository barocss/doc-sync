// Source-only local edit profile. No dist build. CPU profile starts after seed.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Session} from 'node:inspector/promises';
import {writeFileSync,readFileSync,readdirSync,realpathSync,statSync,existsSync,accessSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const options={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--baseline-root','--output','--n','--samples','--profile'].includes(key)||!value||value.startsWith('--')||key in options)throw new Error(`Invalid or duplicate option: ${key}`);options[key]=value;}
if(!options['--output'])throw new Error('Required option: --output');
if(process.env.CORE_BEFORE==='1')throw new Error('CORE_BEFORE requires a hidden source hook; use --baseline-root instead');
const positive=value=>{if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))throw new Error(`Expected positive integer: ${value}`);return Number(value);};
const n=positive(options['--n']??process.env.CORE_N??'10000'),count=positive(options['--samples']??process.env.CORE_SAMPLES??'5');
const profileSetting=options['--profile']??process.env.CORE_PROFILE??'1';
if(!['0','1'].includes(profileSetting))throw new Error('Profile must be 0 or 1');
const baselineSetting=options['--baseline-root']??process.env.CORE_BASELINE_ROOT;
const baselineRoot=baselineSetting?realpathSync(resolve(baselineSetting)):null;
const currentRoot=fileURLToPath(new URL('../',import.meta.url));
if(baselineRoot===realpathSync(currentRoot))throw new Error('Baseline must be an external archive, not this checkout');
const sourceRoot=join(baselineRoot??currentRoot,'packages/doc-sync/src');
for(const path of ['client/index.ts','data/schema.ts','crdt/doc.ts','crdt/history.ts'])if(!statSync(join(sourceRoot,path)).isFile())throw new Error(`Missing source: ${path}`);
const output=resolve(options['--output']);
const profileOutput=output.endsWith('.json')?output.replace(/\.json$/,'.cpuprofile'):output+'.cpuprofile';
for(const path of [output,...(profileSetting==='1'?[profileOutput]:[])]){if(existsSync(path))throw new Error(`Refusing to overwrite output: ${path}`);if(!statSync(dirname(path)).isDirectory())throw new Error('Output parent must be a directory');accessSync(dirname(path),constants.W_OK);}
const {Client}=await import(pathToFileURL(join(sourceRoot,'client/index.ts')).href);
const {createDataSchema}=await import(pathToFileURL(join(sourceRoot,'data/schema.ts')).href);
const {Doc}=await import(pathToFileURL(join(sourceRoot,'crdt/doc.ts')).href);
const {History}=await import(pathToFileURL(join(sourceRoot,'crdt/history.ts')).href);
const sources=readdirSync(sourceRoot,{recursive:true}).filter(path=>path.endsWith('.ts')).sort();
const hash=createHash('sha256');
for(const path of sources){if(path==='crdt/doc.ts')continue;hash.update(path+'\0');hash.update(readFileSync(join(sourceRoot,path)));}
const fileHash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHashes={doc:fileHash(join(sourceRoot,'crdt/doc.ts')),otherSourceClosure:hash.digest('hex'),benchmark:fileHash(fileURLToPath(import.meta.url)),files:Object.fromEntries(sources.map(path=>[path,fileHash(join(sourceRoot,path))]))};
const id=n=>`data:00000000-0000-4000-8000-${n.toString(16).padStart(12,'0')}`;
const empty=new Client({schema:createDataSchema(),actor:'core-perf'}),state=empty.captureState();empty.dispose();
let clock=0;
const token=(type,dataId,after,attrs={})=>{const key=`${++clock}@core-perf`;return{i:key,o:after,k:'n',b:type,a:[['$type',type,key],['id',dataId,key],...Object.entries(attrs).map(([name,value])=>[name,value,key])]};};
const head=key=>({i:key,o:null,k:'n',y:'root'});
const listToken=token('list',id(1),'0@~root'),mapToken=token('map',id(2),listToken.i);
const line=(parent,offset,isMap)=>{const key=`0@${parent.i}/body`,items=[head(key)];for(let i=0;i<n;i++)items.push(token('entry',id(offset+i),items.at(-1).i,{...(isMap?{key:`key-${i}`}:{ }),value:{scalar:i}}));return {key,owner:parent.i,slot:'body',items};};
state.engine.document={format:2,capabilities:[],lines:[{key:'0@~root',owner:null,slot:'',items:[head('0@~root'),listToken,mapToken]},line(listToken,10,false),line(mapToken,10+n,true)]};state.engine.document.lamport=clock;state.engine.revision=clock;
const client=Client.fromState(state,{schema:createDataSchema()});
const timings={};let measured=false;
function wrap(target,key,label){const original=target[key];target[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(measured){const metric=timings[label]??={count:0,ms:0};metric.count++;metric.ms+=performance.now()-start;}}};}
for(const method of ['snapshot','edit','toJSON','check','projectVisibleBlock'])wrap(Doc.prototype,method,`Doc.${method}`);
wrap(Doc,'fromSnapshot','Doc.fromSnapshot');wrap(History,'fromSnapshot','History.fromSnapshot');wrap(History.prototype,'snapshot','History.snapshot');
const access=client.data,list=access.getList(id(1)),map=access.getMap(id(2));assert.equal(list.at(n-1).value,n-1);assert.equal(map.size,n);
client.edit([{op:'update',at:[0,0],attrs:{value:{scalar:-1}}}],null);assert.equal(list.at(0).value,-1);
const profile=profileSetting==='0'?null:new Session();
if(profile){profile.connect();await profile.post('Profiler.enable');await profile.post('Profiler.setSamplingInterval',{interval:500});await profile.post('Profiler.start');}
const samples=[];
for(let i=0;i<count;i++){globalThis.gc?.();measured=true;let start=performance.now();client.edit([{op:'update',at:[0,0],attrs:{value:{scalar:i}}}],null);const editMs=performance.now()-start;start=performance.now();const first=list.at(0),size=map.size;const readMs=performance.now()-start;measured=false;assert.deepEqual(first,{id:id(10),value:i});assert.equal(size,n);samples.push({editMs,readMs,totalMs:editMs+readMs});console.log(JSON.stringify(samples.at(-1)));}
let cpuTop=[];
if(profile){
const {profile:cpu}=await profile.post('Profiler.stop');profile.disconnect();writeFileSync(profileOutput,JSON.stringify(cpu),{flag:'wx'});
const nodes=new Map(cpu.nodes.map(node=>[node.id,node]));const self=new Map();for(let i=0;i<cpu.samples.length;i++){const key=cpu.samples[i];self.set(key,(self.get(key)??0)+cpu.timeDeltas[i]);}
cpuTop=[...self].map(([key,us])=>{const node=nodes.get(key);return{function:node.callFrame.functionName,file:node.callFrame.url,line:node.callFrame.lineNumber+1,selfMs:us/1000};}).sort((a,b)=>b.selfMs-a.selfMs).slice(0,35);
}
// Independent full collection oracle, outside all measured intervals.
assert.deepEqual(list.entries(),Array.from({length:n},(_,i)=>({id:id(10+i),value:i===0?count-1:i})));
assert.deepEqual(map.entries(),Array.from({length:n},(_,i)=>[`key-${i}`,i]).sort(([a],[b])=>a<b?-1:a>b?1:0));
const report={sourceHashes,cli:{argv:process.argv.slice(2),execArgv:process.execArgv,nodeOptions:process.env.NODE_OPTIONS??null,options,n,count,profile:profileSetting,baselineRoot,sourceRoot,output,profileOutput:profile?profileOutput:null,env:{CORE_N:process.env.CORE_N??null,CORE_SAMPLES:process.env.CORE_SAMPLES??null,CORE_PROFILE:process.env.CORE_PROFILE??null,CORE_BASELINE_ROOT:process.env.CORE_BASELINE_ROOT??null}},baselineCommit:baselineRoot?'ec9622571a04a7d7ea3f967bb3e6423b17ce5194':null,baselineProvenance:baselineRoot?'Caller-provided external git archive; source hashes record exact bytes. Entire archived Client/Doc/History closure measured.':'Current checkout source closure measured.',oracle:'Every final List ID/value and sorted Map key/value checked against seed formula; per-sample first ID/value and Map size also checked.',node:process.version,n,totalRecords:n*2,samples,timings,cpuTop,scope:`${baselineRoot?'Archived baseline':'Current source'} Client. Inclusive method durations overlap. Seed and warmup excluded. CPU includes between-sample explicit GC. No network/browser/process-recovery measurement.`};writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));client.dispose();
