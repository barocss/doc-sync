import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MemoryNet} from './harness.ts';
import {preflightSchemaTransition} from '../src/crdt/schema-version.ts';

test('preview preserves live pending edits, history, document and server revision for every verdict',async()=>{
 const net=new MemoryNet(),client=net.add('preview');client.connect();await net.settle();
 try{
  client.disconnect();client.commit(client.doc.edit([{op:'insert',at:[0,0],content:'pending'}]).ops);
  const before=net.hub.getSchema()!;const compatible=structuredClone(before);compatible.marks=[...compatible.marks,'new-mark'];
  const incompatible=structuredClone(before);incompatible.nodes.paragraph.ui={label:'changed'};
  const invalid=structuredClone(before);invalid.root='missing';
  const snapshot=client.doc.snapshot(),pending=structuredClone(client.pending),history=client.history,historyState=client.history.snapshot(),server=net.hub.doc.snapshot(),seq=net.hub.serverSeq,version=net.hub.schemaVersion;
  assert.ok(pending.length>0);
  for(const [next,status] of [[compatible,'compatible'],[incompatible,'incompatible'],[invalid,'invalid']] as const){
   assert.equal(preflightSchemaTransition(before,next).status,status);
   assert.deepEqual(client.doc.snapshot(),snapshot);assert.deepEqual(client.pending,pending);assert.equal(client.history,history);assert.deepEqual(client.history.snapshot(),historyState);assert.deepEqual(net.hub.doc.snapshot(),server);assert.equal(net.hub.serverSeq,seq);assert.equal(net.hub.schemaVersion,version);
  }
 }finally{client.disconnect();}
});
