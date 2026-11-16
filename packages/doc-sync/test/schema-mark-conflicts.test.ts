import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc,checkSchema,schemaVersion,canonMarks,markOrder,diagnoseMarkNameConflicts,type Schema} from '../src/index.ts';
const base=():Schema=>({root:'r',marks:['bold'],markValues:{tone:{default:'plain',values:['plain','red']}},nodes:{r:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}});
test('boolean/value conflict rejects before use without selecting a winner',()=>{
 const s=base();s.marks=['bold','tone'];const before=JSON.stringify(s);assert.deepEqual(diagnoseMarkNameConflicts(s),[{code:'mark_kind_conflict',path:['marks','1'],message:'Mark name is declared as both boolean and value mark'}]);assert.ok(checkSchema(s).length);assert.throws(()=>new Doc('legacy',s));assert.throws(()=>new Doc('explicit',{...s,domain:'document'}));assert.throws(()=>schemaVersion(s));assert.equal(JSON.stringify(s),before);
});
test('own punctuation/special-name conflicts use array-position paths',()=>{
 for(const name of ['a.dot','constructor','__proto__']){const s=base();s.marks=[name];s.markValues=JSON.parse(JSON.stringify({[name]:{default:''}}));assert.deepEqual(diagnoseMarkNameConflicts(s)[0].path,['marks','0']);assert.throws(()=>schemaVersion(s));}
});
test('disjoint marks preserve ordering, canonical values and fingerprints',()=>{
 const s=base(),before=JSON.stringify(s),version=schemaVersion(s);assert.deepEqual(diagnoseMarkNameConflicts(s),[]);assert.deepEqual(checkSchema(s),[]);assert.doesNotThrow(()=>new Doc('a',s));assert.deepEqual(markOrder(s),['bold','tone']);assert.deepEqual(canonMarks(s,{bold:true,tone:'red'}),{bold:true,tone:'red'});assert.equal(schemaVersion(s),version);assert.equal(JSON.stringify(s),before);
});
test('conflicting schema transition leaves live state unchanged',async()=>{
 const {DocHub}=await import('../dist/server/hub.js');const s=base(),hub=new DocHub({schema:s}),next=base();next.marks=['bold','tone'];const snapshot=hub.doc.snapshot(),version=hub.schemaVersion,seq=hub.serverSeq;assert.throws(()=>hub.transitionSchema(next,{epoch:hub.epoch,serverSeq:seq,schemaVersion:version!}));assert.deepEqual(hub.doc.snapshot(),snapshot);assert.equal(hub.schemaVersion,version);assert.equal(hub.serverSeq,seq);
});
test('repeated conflicting declarations remain explicit and valid mixed marks pass operation checking',()=>{
 const s=base();s.marks=['tone','tone'];assert.deepEqual(diagnoseMarkNameConflicts(s).map(d=>d.path),[['marks','0'],['marks','1']]);
 const valid=base(),writer=new Doc('writer',valid),receiver=new Doc('receiver',valid);const ops=writer.edit([{op:'insert',at:[0,0],content:[{text:'x',marks:{bold:true,tone:'red'}}]}]).ops;assert.equal(receiver.check(ops),null);
});
