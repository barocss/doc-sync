import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typescriptClientEngineFactory as factory} from '../src/engine/typescript-client.ts';
import {LocalClient} from '../src/local/client.ts';
import {SyncClient} from '../src/sync/client.ts';
import type {Transport} from '../src/sync/protocol.ts';
import type {Schema} from '../src/crdt/schema.ts';
const schema:Schema={root:'root',marks:[],markValues:{payload:{default:null}},nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}};
const record={caretBefore:'',caretAfter:''};
const transport:Transport={subscribe:()=>()=>{},send:async()=>{},sendPresence:()=>{}};
function fixture(){
 const a=factory.create('A',schema),b=factory.create('B',schema);
 const ops=b.apply([{op:'insert',at:[0,0],content:'HUMAN'}]);b.record(ops,record);a.receive('B',ops);
 return {a,b};
}
test('production checkpoint refuses foreign insertion history before handle/install',()=>{
 const {a,b}=fixture(),before=a.checkpoint(),stamp=a.stamp(),mixed=a.checkpoint();mixed.history=b.checkpoint().history;
 assert.throws(()=>a.prepareCheckpoint(mixed),/history belongs to another actor/);
 assert.deepEqual(a.checkpoint(),before);assert.deepEqual(a.stamp(),stamp);assert.equal(a.historyStatus().canUndo,false);
 assert.equal(a.model().children![0].runs!.map(run=>'text' in run?run.text:'').join(''),'HUMAN');
});
test('missing History target and future saved allocation fail without changing live state',()=>{
 const a=factory.create('A',schema),ops=a.apply([{op:'insert',at:[0,0],content:'own'}]);a.record(ops,record);
 const before=a.checkpoint();
 for(const kind of ['missing','clock']){
  const bad=structuredClone(before) as any;
  if(kind==='missing')bad.history.undo[0].steps[0].ids[0]={lamport:0,actor:'absent'};
  else bad.document.lamport=0;
  assert.throws(()=>a.prepareCheckpoint(bad));assert.deepEqual(a.checkpoint(),before);
 }
});
test('foreign targets remain valid for locally authored delete and restored redo',()=>{
 const {a}=fixture();const ops=a.apply([{op:'delete',at:[0,0],count:1}]);a.record(ops,record);a.undo();
 const saved=a.checkpoint();a.installCheckpoint(a.prepareCheckpoint(saved));a.redo();
 assert.equal(a.model().children![0].runs!.map(run=>'text' in run?run.text:'').join(''),'UMAN');a.undo();assert.equal(a.model().children![0].runs!.map(run=>'text' in run?run.text:'').join(''),'HUMAN');
});
for(const format of [1,2])test(`SyncClient format ${format} rejects foreign History without metadata mutation`,()=>{
 const {a,b}=fixture();const source=new SyncClient('A',transport,{schema});
 source.engine.installCheckpoint(source.engine.prepareCheckpoint(a.checkpoint()));
 const target=new SyncClient('A',transport,{schema}),before=target.captureState(),events=structuredClone(target.eventStats);
 if(format===1){const saved=source.checkpoint();saved.history=b.checkpoint().history as any;assert.throws(()=>target.restoreCheckpoint(saved,'epoch'),/history belongs/);}
 else {const saved=source.captureState();saved.engine.history=b.checkpoint().history;assert.throws(()=>target.restoreState(saved,'epoch'),/history belongs/);}
 assert.deepEqual(target.captureState(),before);assert.deepEqual(target.eventStats,events);assert.equal(target.pending.length,0);
});


test('LocalClient restore shares stack-aware foreign-target redo validation',()=>{
 const {a}=fixture();const ops=a.apply([{op:'delete',at:[0,0],count:1}]);a.record(ops,record);a.undo();
 const engine=a.checkpoint();const local=LocalClient.fromState({format:'doc-sync-local-state-v1',actor:'A',schemaVersion:engine.identity.schemaVersion,engine},{schema});
 try{local.redo();assert.equal(local.model().children![0].runs!.map(run=>'text' in run?run.text:'').join(''),'UMAN');local.undo();assert.equal(local.model().children![0].runs!.map(run=>'text' in run?run.text:'').join(''),'HUMAN');}finally{local.dispose();}
});
