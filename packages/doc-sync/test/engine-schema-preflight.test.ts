import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MemoryNet} from './harness.ts';
import type {Schema} from '../src/crdt/schema.ts';
const schema:Schema={root:'root',marks:['bold'],markValues:{tone:{default:'a',values:['a','b']}},nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',attrs:{choice:{default:'a',values:['a','b']},n:{default:0,min:0,max:10},label:{default:'AA',pattern:'^[A-Z]{2}$'}}}}};
for(const row of [
 {name:'atomic enum',at:[0],attrs:{choice:'invalid'}},
 {name:'numeric bound',at:[0],attrs:{n:99}},
 {name:'pattern',at:[0],attrs:{label:'invalid'}},
 {name:'value mark',at:[0,0],length:1,attrs:{tone:'invalid'}},
 {name:'boolean mark',at:[0,0],length:1,attrs:{bold:'invalid'}},
])for(const mixed of [false,true])test(`${row.name}, ${mixed?'late mixed batch':'single update'}: fail before live mutation`,async()=>{
 const net=new MemoryNet({schema,clientSchema:schema}),a=net.add('local'),b=net.add('peer');a.connect();b.connect();await net.settle();
 try{
  a.commit(a.engine.apply([{op:'insert',at:[0,0],content:'seed'}]));await net.settle();a.clearHistory();b.clearHistory();
  // A valid local pending edit and peer change already exist. Rejection must not discard either.
  a.disconnect();a.commit(a.engine.apply([{op:'insert',at:[0,4],content:'L'}]));
  b.commit(b.engine.apply([{op:'insert',at:[0,0],content:'P'}]));await net.settle();
  const before=a.engine.checkpoint(),stamp=a.engine.stamp(),pending=structuredClone(a.pending),history=a.history.snapshot(),events=structuredClone(a.eventStats);
  const update={op:'update' as const,at:row.at,attrs:row.attrs,...('length'in row?{length:row.length}:{})};
  assert.throws(()=>a.engine.apply(mixed?[{op:'insert',at:[0,0],content:'MUST_NOT_APPLY'},update]:[update]),/Invalid compiled edit batch/);
  assert.deepEqual(a.engine.checkpoint(),before);assert.deepEqual(a.engine.stamp(),stamp);assert.deepEqual(a.pending,pending);assert.deepEqual(a.history.snapshot(),history);assert.deepEqual(a.eventStats,events);
  a.connect();await net.settle();assert.deepEqual(a.doc.toJSON(),b.doc.toJSON());assert.deepEqual(a.doc.toJSON(),net.hub.doc.toJSON());
  assert.equal(a.doc.toJSON().children![0].runs!.map(r=>'text'in r?r.text:'').join(''),'PseedL');
  a.commit(a.engine.apply([{op:'update',at:[0],attrs:{n:7,label:'BB'}},{op:'update',at:[0,0],length:1,attrs:{tone:'b',bold:true}}]));await net.settle();
  assert.equal(a.doc.toJSON().children![0].attrs!.n,7);assert.deepEqual(a.doc.toJSON(),b.doc.toJSON());
  a.undo();await net.settle();assert.equal(a.doc.toJSON().children![0].attrs!.n,0);
  a.redo();await net.settle();assert.equal(a.doc.toJSON().children![0].attrs!.n,7);
 }finally{a.disconnect();b.disconnect();}
});


test('valid detached batch creates then updates new storage before wire delivery',async()=>{
 const net=new MemoryNet({schema,clientSchema:schema}),a=net.add('a'),b=net.add('b');a.connect();b.connect();await net.settle();
 try{
  a.commit(a.engine.apply([{op:'insert',at:[0],content:[{type:'p',runs:[{text:'new',marks:{}}]}]},{op:'update',at:[0],attrs:{n:8}}]));await net.settle();
  assert.equal(a.doc.toJSON().children![0].attrs!.n,8);assert.deepEqual(a.doc.toJSON(),b.doc.toJSON());assert.deepEqual(a.doc.toJSON(),net.hub.doc.toJSON());
 }finally{a.disconnect();b.disconnect();}
});
