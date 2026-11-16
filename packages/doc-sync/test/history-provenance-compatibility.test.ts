import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typescriptClientEngineFactory as factory} from '../src/engine/typescript-client.ts';
import {History} from '../src/crdt/history.ts';
import {SyncClient} from '../src/sync/client.ts';
import type {Transport} from '../src/sync/protocol.ts';
import type {Schema} from '../src/crdt/schema.ts';
const schema:Schema={root:'root',marks:[],nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const record={caretBefore:'',caretAfter:''};
const transport:Transport={subscribe:()=>()=>{},send:async()=>{},sendPresence:()=>{}};
for(const owner of ['A','B'])test(`v1 ${owner==='A'?'local':'foreign'} target redo loses origin but remains restorable`,()=>{
 const a=factory.create('A',schema),writer=owner==='A'?a:factory.create('B',schema);
 const insert=writer.apply([{op:'insert',at:[0,0],content:'abc'}]);
 if(writer!==a)a.receive('B',insert);
 const deletion=a.apply([{op:'delete',at:[0,0],count:1}]);a.record(deletion,record);
 const original=(a.checkpoint().history as any).undo[0].steps[0].delAt;
 assert.equal(original.actor,'A');a.undo();
 const saved=a.checkpoint(),step=(saved.history as any).redo[0].steps[0];
 assert.equal(step.delAt,null);assert.equal(step.ids[0].actor,owner);
 assert.deepEqual(Object.keys(step).sort(),['delAt','ids','type']);
 a.installCheckpoint(a.prepareCheckpoint(saved));a.redo();
 const repeated=(a.checkpoint().history as any).undo[0].steps[0].delAt;
 assert.notDeepEqual(repeated,original);assert.equal(repeated.actor,'A');
 a.undo();assert.equal(a.model().children![0].runs!.map(r=>'text'in r?r.text:'').join(''),'abc');
});
for(const pending of [false,true])for(const format of [1,2])test(`current sync format ${format}, pending=${pending} rejects restore without replacing active state`,()=>{
 const client=new SyncClient('A',transport,{schema});
 const ops=client.engine.apply([{op:'insert',at:[0,0],content:'keep'}]);if(pending)client.commit(ops,record);else client.engine.record(ops,record);
 assert.equal(client.pending.length,pending?1:0);
 const error=pending?/disconnected, settled client/:/history snapshot/;
 const before=client.captureState(),events=structuredClone(client.eventStats);
 if(format===1){const candidate=client.checkpoint();(candidate.history as any).version=2;assert.throws(()=>client.restoreCheckpoint(candidate,'new-epoch'),error);}
 else {const candidate=client.captureState();(candidate.engine.history as any).version=2;assert.throws(()=>client.restoreState(candidate,'new-epoch'),error);}
 assert.deepEqual(client.captureState(),before);assert.deepEqual(client.eventStats,events);
 assert.equal(client.pending.length,before.pending.length);
});


test('v1 cannot safely carry required provenance as an extension field',()=>{
 const a=factory.create('A',schema),ops=a.apply([{op:'insert',at:[0,0],content:'abc'}]);a.record(ops,record);
 const saved=a.checkpoint().history as any;
 saved.undo[0].steps[0].origin={kind:'insert',ticket:{actor:'A',lamport:123}};
 const bytes=JSON.stringify(saved),restored=History.fromSnapshot(saved).snapshot() as any;
 assert.equal(JSON.stringify(saved),bytes);
 assert.equal(restored.undo[0].steps[0].origin,undefined);
 // Current v1 reader discards the extension. V2 must use a new top-level version.
 assert.equal(restored.version,1);
});

test('a refused future version leaves serialized legacy source recoverable',()=>{
 const a=factory.create('A',schema),ops=a.apply([{op:'insert',at:[0,0],content:'abc'}]);a.record(ops,record);
 const original=JSON.stringify(a.checkpoint()),candidate=JSON.parse(original);candidate.history.version=2;
 assert.throws(()=>a.prepareCheckpoint(candidate),/history snapshot/);
 const fallback=JSON.parse(original);a.installCheckpoint(a.prepareCheckpoint(fallback));
 assert.equal(JSON.stringify(fallback),original);
 assert.deepEqual(a.checkpoint().document,fallback.document);
 assert.deepEqual(a.checkpoint().history,fallback.history);
 assert.equal(a.historyStatus().canUndo,true);
});
