import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseTextProtection,checkTextPreservation,assertTextPreservationState} from '../src/text-preservation.ts';
import type {Schema} from '@barocss/doc-sync';
const revision={epoch:'e',serverSeq:1,schemaVersion:'s'},paths=[[2]],schema:Schema={root:'root',marks:['bold'],nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const response=(text='Keep 😀',id='4@A',rev=revision)=>({revision:rev,sessionOnline:true,pending:0,conditionalPending:false,recoveryRequired:false,children:[{path:[2],blockId:id,node:{type:'p',runs:[{text,marks:{}}]}}]});
test('exact original text survives serialization, empty content and marks/run boundary changes',async()=>{
 for(const text of ['', 'Keep 😀','x'.repeat(8192)]){
  const initial=await checkTextPreservation(async()=>response(text),paths,revision,schema),saved=JSON.parse(JSON.stringify(initial));assertTextPreservationState({planningPath:[1],protectedText:paths,textPreservation:saved});
  const rev={...revision,serverSeq:2},next=response(text,'4@A',rev);next.children[0].node.runs=[{text:text.slice(0,2),marks:{bold:true}},{text:text.slice(2),marks:{}}] as any;
  const before=JSON.stringify(next);assert.deepEqual(await checkTextPreservation(async()=>next,paths,rev,schema,saved),initial);assert.equal(JSON.stringify(next),before);
 }
});
test('changed text, identity, placement, type and schema fail without recapturing',async()=>{
 const initial=await checkTextPreservation(async()=>response(),paths,revision,schema),before=JSON.stringify(initial);
 for(const next of [response('Changed'),response('Keep 😀','7@peer'),{...response(),children:[]},{...response(),children:[{...response().children[0],path:[3]}]}])await assert.rejects(checkTextPreservation(async()=>next,paths,revision,schema,initial));
 for(const rev of [{...revision,epoch:'new'},{...revision,schemaVersion:'new'}])await assert.rejects(checkTextPreservation(async()=>response('Keep 😀','4@A',rev),paths,rev,schema,initial));
 const typed=response();typed.children[0].node.type='q';await assert.rejects(checkTextPreservation(async()=>typed,paths,revision,{...schema,nodes:{...schema.nodes,q:{shape:'text'}}},initial));assert.equal(JSON.stringify(initial),before);
});
test('inline/span content and oversized text are not silently flattened',async()=>{
 for(const runs of [[{type:'image'}],[{type:'link',runs:[{text:'Keep 😀'}]}],[{text:'x'.repeat(8193)}]]){const next=response();next.children[0].node.runs=runs as any;await assert.rejects(checkTextPreservation(async()=>next,paths,revision,schema));}
});
test('configuration and saved captures reject missing, duplicate, overlapping and malformed evidence',async()=>{
 for(const bad of [[],[[1]],[[2],[2]],Array(17).fill([2]),[[2,-1]]])assert.throws(()=>parseTextProtection(bad,[1]));assert.throws(()=>parseTextProtection(paths));
 const copy=parseTextProtection(paths,[1]);copy[0][0]=9;assert.equal(paths[0][0],2);
 const initial=await checkTextPreservation(async()=>response(),paths,revision,schema);
 for(const state of [{planningPath:[1],protectedText:paths},{planningPath:[1],textPreservation:initial},{planningPath:[1],protectedText:paths,textPreservation:[]},{planningPath:[1],protectedText:paths,textPreservation:{0:initial[0],length:1}},{planningPath:[1],protectedText:paths,textPreservation:[{...initial[0],extra:true}]},{planningPath:[1],protectedText:paths,textPreservation:[{...initial[0],text:undefined}]},{planningPath:[1],protectedText:paths,textPreservation:[{...initial[0],binding:{...initial[0].binding,blockId:'0@synthetic'}}]}])assert.throws(()=>assertTextPreservationState(state as any));
});

test('invalid CLI text protection fails before state creation or planner invocation',async()=>{
 const {mkdtemp,readdir,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{promisify}=await import('node:util'),{execFile}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'text-protection-cli-'));
 try{for(const args of [[],['--planning-path','[1]']]){
  await assert.rejects(promisify(execFile)(process.execPath,['src/main.ts','run','--url','http://127.0.0.1:1','--doc','test','--mission','test','--state-dir',dir,'--protect-text','[[1]]',...args],{cwd:new URL('..',import.meta.url).pathname,env:{PATH:'',HOME:dir},timeout:10000}),e=>(e as any).code===1&&/Protected text/.test((e as any).stderr));
  assert.deepEqual(await readdir(dir),[]);
 }}finally{await rm(dir,{recursive:true,force:true});}
});
