import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schemaVersion} from '@barocss/doc-sync';
import type {Schema} from '@barocss/doc-sync';
import {DocHub} from '@barocss/doc-sync/server';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {DocumentSession} from '../src/session.ts';
import {createServer} from '../src/server.ts';
import {authorizeTool} from '../src/hosted-auth.ts';
const schema:Schema={root:'root',marks:[],nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',attrs:{level:{default:0,min:0,max:2}}}}};
function fixture(){
 let sends=0;const hub=new DocHub({schema});
 const transport={subscribe:(_since:number,onEvent:any)=>{onEvent(hub.hello(0));return ()=>{};},send:async()=>{sends++;},sendPresence:()=>{sends++;},submitConditional:async()=>{sends++;throw Error('not allowed');},getSchema:async()=>({schemaVersion:schemaVersion(schema),schema}),transitionSchema:async()=>{sends++;throw Error('not allowed');}};
 const session=new DocumentSession('preview',transport,schema);return {session,hub,sends:()=>sends};
}
async function ready(){const f=fixture();await f.session.start();const view=await f.session.read();assert.ok(view.revision);return {...f,base:view.revision!};}
test('successful preview uses compiler and preserves live checkpoint/events/transport',async()=>{
 const {session,base,sends}=await ready();try{const before=session.client.captureState(),events=structuredClone(session.client.eventStats),sent=sends();
 const output=await session.previewEdits(base,[{op:'insert',at:[0,0],content:'preview only'}]);assert.ok(JSON.stringify(output.document).includes('preview only'));
 assert.deepEqual(session.client.captureState(),before);assert.deepEqual(session.client.eventStats,events);assert.equal(sends(),sent);assert.equal(session.client.historyStatus().canUndo,false);
 }finally{await session.close();}
});
test('invalid batch, stale base and oversized output leave live state unchanged',async()=>{
 const {session,base}=await ready();try{const before=session.client.captureState();
 for(const edits of [[{op:'insert',at:[0,0],content:'valid'},{op:'update',at:[0],attrs:{level:9}}],[{op:'insert',at:[0,0],content:'x'.repeat(33000)}]] as any[])await assert.rejects(session.previewEdits(base,edits));
 await assert.rejects(session.previewEdits({...base,serverSeq:base.serverSeq+1},[{op:'insert',at:[0,0],content:'x'}]),/base changed/);assert.deepEqual(session.client.captureState(),before);
 session.client.engine.apply([{op:'insert',at:[0,0],content:'x'.repeat(65000)}]);const large=session.client.captureState();await assert.rejects(session.previewEdits(base,[{op:'insert',at:[0,0],content:'y'}]),/output limit/);assert.deepEqual(session.client.captureState(),large);
 }finally{await session.close();}
});
test('pending changes and unverified schema are refused without repair',async()=>{
 const {session,base}=await ready();try{session.client.schemaVerified=false;await assert.rejects(session.previewEdits(base,[{op:'delete',at:[0,0],count:0}]),/settled/);session.client.schemaVerified=true;
 const ops=session.client.engine.apply([{op:'insert',at:[0,0],content:'pending'}]);session.client.commit(ops);const before=session.client.captureState();await assert.rejects(session.previewEdits(base,[{op:'delete',at:[0,0],count:0}]),/settled/);assert.deepEqual(session.client.captureState(),before);
 }finally{session.disconnect();}
});
test('MCP registers bounded read-only preview and hosted read authorization',async()=>{
 const {session,base}=await ready();const server=createServer(session),client=new Client({name:'preview-test',version:'1'});const [c,s]=InMemoryTransport.createLinkedPair();await server.connect(s);await client.connect(c);
 try{assert.ok((await client.listTools()).tools.find(t=>t.name==='preview_edits')?.annotations?.readOnlyHint);
 const result=await client.callTool({name:'preview_edits',arguments:{base,edits:[{op:'insert',at:[0,0],content:'synthetic'}]}});assert.equal(result.isError,undefined);assert.ok(Buffer.byteLength(JSON.stringify(result))<=131072);
 const grant={permissions:['read']} as any;assert.doesNotThrow(()=>authorizeTool(grant,'preview_edits'));assert.throws(()=>authorizeTool(grant,'edit_document'));assert.throws(()=>authorizeTool({permissions:[]} as any,'preview_edits'));
 }finally{await client.close();await server.close();await session.close();}
});

test('structured preview has expected ordered blocks and does not access journal',async()=>{
 const {session,base}=await ready();const before=session.client.captureState();let accesses=0;
 (session as any).journal=new Proxy({}, {get(){accesses++;throw Error('Preview must not access journal');}});
 try{const result=await session.previewEdits(base,[{op:'insert',at:[0],content:[{type:'p',runs:[{text:'First',marks:{}}]},{type:'p',runs:[{text:'Second',marks:{}}]}]}]);
 const texts=result.document.children!.map(n=>(n.runs??[]).map(r=>'text'in r?r.text:'').join(''));
 assert.deepEqual(texts.slice(0,2),['First','Second']);assert.equal(accesses,0);assert.deepEqual(session.client.captureState(),before);
 (session as any).recoveryError='synthetic unknown recovery';await assert.rejects(session.previewEdits(base,[{op:'insert',at:[0,0],content:'x'}]),/settled/);assert.equal(accesses,0);assert.deepEqual(session.client.captureState(),before);
 }finally{(session as any).journal=null;(session as any).recoveryError=null;await session.close();}
});

test('MCP denied preview never reaches session',async()=>{
 const {session,base}=await ready();let deniedCalls=0;const denied=createServer(session,{authorizeTool:()=>{deniedCalls++;throw Error('denied');}}),client=new Client({name:'denied-preview',version:'1'});const [c,s]=InMemoryTransport.createLinkedPair();await denied.connect(s);await client.connect(c);
 try{const before=session.client.captureState();const refusal=await client.callTool({name:'preview_edits',arguments:{base,edits:[{op:'insert',at:[0,0],content:'no'}]}});assert.equal(refusal.isError,true);assert.match(JSON.stringify(refusal.content),/denied/);assert.equal(deniedCalls,1);assert.deepEqual(session.client.captureState(),before);}
 finally{await client.close();await denied.close();await session.close();}
});


test('preview owns output, rejects edit-count boundaries and refuses disconnected replicas',async()=>{
 const {session,base,sends}=await ready();
 try {
  const before=session.client.captureState(),sent=sends();
  const edits=[{op:'update' as const,at:[0],attrs:{level:2}}];
  const result=await session.previewEdits(base,edits);
  assert.equal(result.document.children![0].attrs!.level,2);
  result.document.children![0].attrs!.level=1;
  assert.deepEqual(edits,[{op:'update',at:[0],attrs:{level:2}}]);
  assert.deepEqual(session.client.captureState(),before);
  await assert.rejects(session.previewEdits(base,[]),/input limits/);
  await assert.rejects(session.previewEdits(base,Array.from({length:101},()=>({op:'delete' as const,at:[0,0],count:0}))),/input limits/);
  session.disconnect();const disconnected=session.client.captureState();
  await assert.rejects(session.previewEdits(base,edits),/not connected|settled, schema-verified/);
  assert.deepEqual(session.client.captureState(),disconnected);assert.equal(sends(),sent);
 } finally {await session.close();}
});
