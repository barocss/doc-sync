import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typescriptClientEngineFactory as factory} from '../src/engine/typescript-client.ts';
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
for(const format of [1,2])test(`current sync format ${format} rejects future history without replacing active state`,()=>{
 const client=new SyncClient('A',transport,{schema});
 const ops=client.engine.apply([{op:'insert',at:[0,0],content:'keep'}]);client.engine.record(ops,record);
 const before=client.captureState(),events=structuredClone(client.eventStats);
 if(format===1){const candidate=client.checkpoint();(candidate.history as any).version=2;assert.throws(()=>client.restoreCheckpoint(candidate,'new-epoch'),/history snapshot/);}
 else {const candidate=client.captureState();(candidate.engine.history as any).version=2;assert.throws(()=>client.restoreState(candidate,'new-epoch'),/history snapshot/);}
 assert.deepEqual(client.captureState(),before);assert.deepEqual(client.eventStats,events);
 assert.equal(client.pending.length,before.pending.length);
});
