import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {createGraphicServer} from '../graphic/server.mjs';
import {SceneSession} from '../graphic/session.ts';
import {PmBinding} from '../../../packages/doc-sync-prosemirror/dist/binding.js';
import {MemoryNet} from '../../../packages/doc-sync/test/harness.ts';
import {INFO} from '../../../packages/doc-sync/test/pm-fuzz.ts';
const wait=async(check:()=>boolean)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Sync timeout');};
test('Document: repeated presence and optional draft metadata do not create operations or change native selection/history',async()=>{
 const net=new MemoryNet(),a=net.add('A'),b=net.add('B');a.connect();b.connect();await net.settle();
 const sender=new PmBinding(a,INFO),receiver=new PmBinding(b,INFO);
 try{sender.dispatch(sender.state.tr.insertText('abcdefgh',1));await net.settle();a.clearHistory();b.clearHistory();
 const before={doc:b.doc.toJSON(),native:receiver.state.doc.toJSON(),selection:receiver.state.selection.toJSON(),history:b.historyStatus(),seq:net.hub.serverSeq,log:net.hub.log.length,pending:b.pending.length};
 for(let i=0;i<30;i++){net.hub.setPresence({actor:'A',name:'A',color:'#123456',anchor:a.doc.anchorOf({b:0,o:i%7}),focus:a.doc.anchorOf({b:0,o:1}),metadata:{document:{draft:'uncommitted',composition:true}}});net.down();}
 assert.deepEqual({doc:b.doc.toJSON(),native:receiver.state.doc.toJSON(),selection:receiver.state.selection.toJSON(),history:b.historyStatus(),seq:net.hub.serverSeq,log:net.hub.log.length,pending:b.pending.length},before);
 assert.deepEqual(b.others.get('A')?.metadata,{document:{draft:'uncommitted',composition:true}});
 net.hub.leave('A');net.down();assert.equal(b.others.has('A'),false);
 }finally{sender.dispose();receiver.dispose();a.disconnect();b.disconnect();}
});
test('Graphic HTTP/SSE: cursor/selection/optional draft metadata are ephemeral, isolated, and removed on disconnect',async()=>{
 const runtime=createGraphicServer();await new Promise<void>(r=>runtime.server.listen(0,'127.0.0.1',r));const address=runtime.server.address();assert(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
 const a=new SceneSession({actor:'ephemeral-a',transport:new NodeHttpTransport('ephemeral','ephemeral-a',origin)}),b=new SceneSession({actor:'ephemeral-b',transport:new NodeHttpTransport('ephemeral','ephemeral-b',origin)}),other=new SceneSession({actor:'ephemeral-other',transport:new NodeHttpTransport('other','ephemeral-other',origin)});
 const realFetch=globalThis.fetch;let pointerHeld=false,releasePointer:()=>void=()=>{};
 const pointerGate=new Promise<void>(resolve=>{releasePointer=resolve;});
 try{await wait(()=>[a,b,other].every(s=>s.snapshot().ready));const hub=runtime.rooms.get('ephemeral');assert.ok(hub);const id=a.model().find(o=>o.type==='rectangle')!.id;
 const invariant=()=>({model:hub.doc.toJSON(),seq:hub.serverSeq,log:hub.log.length,clients:[a,b].map(s=>({model:s.snapshot().model,history:s.snapshot().history,pending:s.snapshot().pending,revision:s.snapshot().revision}))});const before=invariant();
 // Hold only the pointer request. The select-only packet must be observable first.
 // Both packets still use the production HTTP transport and actual SSE delivery.
 globalThis.fetch=(async(input:any,init?:RequestInit)=>{
  if(String(input)===`${origin}/api/docs/ephemeral/presence`&&typeof init?.body==='string'){
   const graphic=JSON.parse(init.body).metadata?.graphic;
   if(graphic?.cursor?.x===12&&graphic.cursor.y===34){pointerHeld=true;await pointerGate;}
  }
  return realFetch(input,init);
 }) as typeof fetch;
 a.select([id]);a.pointer({x:12,y:34});
 await wait(()=>pointerHeld&&Boolean(b.snapshot().peers.find(p=>p.actor==='ephemeral-a')?.metadata?.graphic));
 assert.deepEqual(b.snapshot().peers.find(p=>p.actor==='ephemeral-a')?.metadata?.graphic,{cursor:null,selectedIds:[id]},'the earlier selection event is not pointer readiness');
 releasePointer();
 await wait(()=>{const graphic=b.snapshot().peers.find(p=>p.actor==='ephemeral-a')?.metadata?.graphic as {cursor?:{x:number;y:number};selectedIds?:string[]}|undefined;return graphic?.cursor?.x===12&&graphic.cursor.y===34&&graphic.selectedIds?.length===1&&graphic.selectedIds[0]===id;});
 assert.deepEqual(b.snapshot().peers.find(p=>p.actor==='ephemeral-a')?.metadata?.graphic,{cursor:{x:12,y:34},selectedIds:[id]});
 globalThis.fetch=realFetch;
 a.client.setPresence({anchor:null,focus:null,metadata:{graphic:{cursor:{x:20,y:40},selectedIds:[id],drag:{id,x:200,y:300},draft:'uncommitted'}}});
 await wait(()=>Boolean((b.snapshot().peers.find(p=>p.actor==='ephemeral-a')?.metadata?.graphic as any)?.drag));
 assert.deepEqual(invariant(),before);assert.equal(other.snapshot().peers.some(p=>p.actor==='ephemeral-a'),false);
 a.disconnect();await wait(()=>!b.snapshot().peers.some(p=>p.actor==='ephemeral-a'));assert.deepEqual(invariant(),before);
 }finally{releasePointer();globalThis.fetch=realFetch;a.dispose();b.dispose();other.dispose();await runtime.close();}
});
