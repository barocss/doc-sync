import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {checkSchema,acceptsText} from '../../packages/doc-sync/dist/crdt/schema.js';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
const root=new URL('../../',import.meta.url).pathname;
const binary=resolve(root,process.env.TEXTFALSE_ORACLE_BINARY??'output/rust-d2-textfalse-2026-11-04/native-target/debug/doc-sync-rust-shadow');
const out=resolve(root,'output/rust-d3-targeting-2026-11-05/compare-regression-textfalse-oracle/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const paths=[binary,new URL(import.meta.url).pathname,resolve(root,'packages/doc-sync/dist/crdt/doc.js'),resolve(root,'packages/doc-sync/dist/crdt/schema.js')];const hashes=()=>Object.fromEntries(paths.map(p=>[p,hash(p)]));
const t=(lamport,actor='A')=>({lamport,actor}),head=t(0,'~root');
const node=(id,origin,type)=>({t:'node',id:t(id),origin,type,boundary:origin.lamport+'@'+origin.actor+'|end'});
const text=(id,origin)=>({t:'text',id:t(id),origin,text:'x'});
const set=(id,target,value)=>({t:'set',at:t(id),ids:[target],key:'$type',value});
const flowSchema=(mode='mixed',group=false)=>({root:'doc',marks:[],nodes:{doc:{shape:'flow',children:group?['group']:['off','on'],default:'off'},off:{shape:'text',text:false,next:'on'},on:{shape:'text',...(mode==='false'?{text:false}:mode==='true'?{text:true}:{})},...(group?{group:{shape:'group',children:['off','on'],by:[]}}:{})}});
const cases=[];const add=(name,schema,setup,ops,accepted)=>cases.push({name,schema,setup,ops,accepted});
for(const group of [false,true])for(const mode of ['mixed','true','false']){
 const s=flowSchema(mode,group),prefix=(group?'group/':'flow/')+mode;
 add(prefix+'/false default',s,[],[text(1,head)],mode!=='false');
 add(prefix+'/false marker',s,[node(1,head,'off')],[text(2,t(1))],mode!=='false');
 add(prefix+'/type change',s,[node(1,head,'on'),set(2,t(1),'off')],[text(3,t(1))],mode!=='false');
 add(prefix+'/mixed raw batch',s,[node(1,head,'off')],[set(2,t(1),'on'),text(3,t(1))],mode!=='false');
}
const normalized=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(normalized),runs:(n.runs??[]).map(r=>'text'in r||'units'in r?{units:r.units??Array.from({length:r.text.length},(_,i)=>r.text.charCodeAt(i)),marks:r.marks??{}}:normalized(r))});
const wire=op=>op.t==='text'?{...Object.fromEntries(Object.entries(op).filter(([k])=>k!=='text')),units:Array.from({length:op.text.length},(_,i)=>op.text.charCodeAt(i)),marks:{}}:op.t==='node'?{...op,attrs:{}}:op;
let failure=null;const results=[],logical=[],flagBoundary=[];let before;
try{
 before=hashes();
 for(const c of cases){
  assert.deepEqual(checkSchema(c.schema),[]);const d=new Doc('A',c.schema);assert.equal(d.check(c.setup),null);c.setup.forEach(o=>d.apply(o));const snapshot=d.snapshot();const problem=d.check(c.ops);assert.equal(problem===null,c.accepted,c.name);assert.deepEqual(d.snapshot(),snapshot,c.name+' check pure');if(c.accepted)c.ops.forEach(o=>d.apply(o));
  const requests=[{cmd:'new',actor:'A',runtimeSchema:c.schema},{cmd:'apply',ops:c.setup.map(wire)},{cmd:'snapshot'},{cmd:'apply',ops:c.ops.map(wire)},{cmd:'snapshot'}].map(r=>({...r,replica:'r',schema:schemaVersion(c.schema)}));
  const run=spawnSync(binary,[],{input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n',encoding:'utf8'});assert.equal(run.status,0,run.stderr);const responses=run.stdout.trim().split('\n').map(JSON.parse);assert.equal(responses[0].ok,true,c.name+JSON.stringify(responses[0]));assert.equal(responses[1].ok,true,c.name);assert.equal(responses[3].ok,c.accepted,c.name);if(!c.accepted)assert.deepEqual(responses[4].snapshot,responses[2].snapshot,c.name+' native failed batch atomic');else assert.deepEqual(normalized(responses[3].state.model),normalized(d.toJSON()),c.name+' exact model');
  results.push({name:c.name,acceptsText:acceptsText(c.schema,c.schema.nodes.doc),tsProblem:problem,expectedAccepted:c.accepted,requests,responses,model:d.toJSON()});
 }
 // Source-bound logical compiler observations. These are TypeScript outcomes only.
 for(const mode of ['mixed','false'])for(const action of ['insert','split']){
  const schema=flowSchema(mode),d=new Doc('A',schema),snap=d.snapshot();let error=null,ops=[];try{ops=d.edit([{op:action,at:[0,0],...(action==='insert'?{content:'x'}:{})}]).ops;}catch(e){error=String(e);}const check=Doc.fromSnapshot('A',snap,schema).check(ops);logical.push({name:mode+'/'+action,error,ops,check,model:d.toJSON(),scope:'TypeScript logical compiler observation only'});
  if(action==='split')assert.equal(ops.length,0,'takesText false blocks Enter');else {assert.equal(error,null);assert.equal(check===null,mode==='mixed');}
 }
 // A normal end-of-block split uses next even when next is text:false.
 {const schema=flowSchema(),d=new Doc('A',schema);d.emit([set(1,head,'on')]);schema.nodes.on.next='off';const q=new Doc('A',schema);q.emit([set(1,head,'on')]);const before=q.snapshot(),ops=q.edit([{op:'split',at:[0,0]}]).ops;assert.equal(Doc.fromSnapshot('A',before,schema).check(ops),null);assert(ops.some(o=>o.t==='node'&&o.type==='off'));logical.push({name:'normal split next false',ops,model:q.toJSON(),scope:'TypeScript logical compiler observation only'});}
 for(const value of [null,0,1,'false',[],{}]){
  const schema=flowSchema();schema.nodes.off.text=value;const tsProblems=checkSchema(schema),request={cmd:'new',replica:'r',actor:'A',runtimeSchema:schema,schema:schemaVersion(schema)},run=spawnSync(binary,[],{input:JSON.stringify(request)+'\n',encoding:'utf8'});assert.equal(run.status,0);const response=JSON.parse(run.stdout);assert.equal(response.ok,false);assert.match(response.error,/text/);flagBoundary.push({value,tsProblems,native:response,boundary:'outside typed TextSpec boolean contract; native stricter JSON validation'});
 }
 assert.deepEqual(hashes(),before);
}catch(e){failure=e.stack;console.error(failure);process.exitCode=1;}
writeFileSync(resolve(out,'results.json'),JSON.stringify({results,logical,flagBoundary},null,2)+'\n');writeFileSync(resolve(out,'receipt.json'),JSON.stringify({status:failure?'FAIL':'PASS',wireCases:results.length,logicalCases:logical.length,invalidFlagBoundaryCases:flagBoundary.length,hashesBefore:before,hashesAfter:hashes(),failure,boundaries:['Logical insert on text:false emits chars; all-false Doc.check rejects those operations','Enter on text:false emits no ops; default and next are retained descriptors','Native rejects malformed text flag JSON outside TypeScript TextSpec boolean contract; no TS parity claim','Graphic container type changes are outside this bounded document comparison']},null,2)+'\n');console.log(JSON.stringify({status:failure?'FAIL':'PASS',out,wireCases:results.length,logicalCases:logical.length}));
