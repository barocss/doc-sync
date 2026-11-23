import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc} from '../dist/crdt/doc.js';
import {MemoryNet} from './harness.ts';
import type {AttrSpec,Schema} from '../src/crdt/schema.ts';
const cases:Array<{name:string;spec:AttrSpec;valid:unknown;invalid:unknown}>=[
 {name:'atomic-enum',spec:{default:'a',values:['a','b']},valid:'b',invalid:'c'},
 {name:'numeric-range',spec:{default:0,min:0,max:10},valid:7,invalid:11},
 {name:'atomic-pattern',spec:{default:'AA',pattern:'^[A-Z]{2}$'},valid:'BB',invalid:'bad'},
 {name:'nested-leaf',spec:{default:{n:0},fields:{n:{default:0,min:0,max:10}}},valid:{n:7},invalid:{n:11}},
];
for(const row of cases)for(const reverse of [false,true])test(`${row.name}: update/peer text, ${reverse?'peer':'local'} first, reject/undo/redo/reconnect`,async()=>{
 const schema:Schema={root:'root',marks:[],nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',attrs:{value:row.spec}}}};
 const net=new MemoryNet({schema,clientSchema:schema}),a=net.add('local'),b=net.add('peer');a.connect();b.connect();await net.settle();
 try{
  a.commit(a.engine.apply([{op:'insert',at:[0,0],content:'seed'}]));await net.settle();a.clearHistory();b.clearHistory();
  const local=a.engine.apply([{op:'update',at:[0],attrs:{value:row.valid}}]);
  const peer=b.engine.apply([{op:'insert',at:[0,4],content:'!'}]);
  if(reverse){b.commit(peer);a.commit(local);}else{a.commit(local);b.commit(peer);}await net.settle();
  const verify=(value:unknown)=>{for(const doc of [a.doc,b.doc,net.hub.doc]){const p=doc.toJSON().children![0];assert.deepEqual(p.attrs!.value,value);assert.equal(p.runs!.map(r=>'text'in r?r.text:'').join(''),'seed!');}assert.equal(a.pending.length,0);assert.equal(b.pending.length,0);};
  verify(row.valid);
  a.undo();await net.settle();verify(row.spec.default);
  a.redo();await net.settle();verify(row.valid);
  if(row.name==='nested-leaf'){
   const before=a.doc.snapshot(),pending=structuredClone(a.pending),history=a.history.snapshot(),events=structuredClone(a.eventStats);
   assert.throws(()=>a.engine.apply([{op:'insert',at:[0,0],content:'MUST_ROLL_BACK'},{op:'update',at:[0],attrs:{value:row.invalid}}]));
   assert.deepEqual(a.doc.snapshot(),before);assert.deepEqual(a.pending,pending);assert.deepEqual(a.history.snapshot(),history);assert.deepEqual(a.eventStats,events);
  }else{
   // Local raw Doc can store invalid atomic values; the server rejects them.
   const candidate=Doc.fromSnapshot('invalid',a.doc.snapshot(),schema);
   const invalid=candidate.edit([{op:'update',at:[0],attrs:{value:row.invalid}}]).ops;
   assert.ok(invalid.some(op=>op.t==='set'&&op.value===row.invalid));
   assert.deepEqual(candidate.toJSON().children![0].attrs!.value,row.spec.default);
   const server=net.hub.doc.snapshot(),seq=net.hub.serverSeq,pending=structuredClone(a.pending),history=a.history.snapshot(),events=structuredClone(a.eventStats);
   assert.throws(()=>net.hub.submit({actor:'invalid',seq:1,ops:invalid}));
   assert.deepEqual(net.hub.doc.snapshot(),server);assert.equal(net.hub.serverSeq,seq);assert.deepEqual(a.pending,pending);assert.deepEqual(a.history.snapshot(),history);assert.deepEqual(a.eventStats,events);verify(row.valid);

  }
  a.disconnect();a.connect();await net.settle();verify(row.valid);
 }finally{a.disconnect();b.disconnect();}
});
