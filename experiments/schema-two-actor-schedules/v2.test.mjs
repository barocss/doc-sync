import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateV2,validateV2,replayV2,serializeV2,deserializeV2,reduceV2,kinds} from './v2.mjs';
for(const seed of [0,1,7,65535])test(`v2 seed ${seed}: explicit actions and independent checkpoints for all round kinds`,async()=>{
 const f=generateV2(seed),before=serializeV2(f);const result=await replayV2(f);
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(await replayV2(deserializeV2(before)),result);assert.equal(serializeV2(f),before);
});
for(const kind of kinds)test(`v2 reducer preserves ${kind} causal round and failure class`,async()=>{
 const f=generateV2();const oracle=async candidate=>{
   const actual=await replayV2(candidate);assert.equal(actual.ok,true,JSON.stringify(actual));
   return candidate.rounds.some(r=>r.kind===kind)?{ok:false,failureClass:`injected-${kind}`}:{ok:false,failureClass:'different'};
 };
 const result=await reduceV2(f,oracle);assert.equal(result.fixture.rounds.length,1);assert.equal(result.fixture.rounds[0].kind,kind);
 assert.equal(result.result.failureClass,`injected-${kind}`);assert.deepEqual((await reduceV2(deserializeV2(serializeV2(result.fixture)),oracle)).fixture,result.fixture);
});
test('v2 rejects orphan guard, changed expected model, duplicate actors and malformed late batch before execution',()=>{
 for(const mutate of [f=>f.rounds.find(r=>r.kind==='peer-move').actions.shift(),f=>f.rounds[0].actions.find(a=>a.type==='check').model.children.pop(),f=>f.rounds[0].order=['A','A'],f=>f.rounds[10].actions[0].edits.pop()]){const f=generateV2();mutate(f);assert.throws(()=>validateV2(f));}
});
test('v2 successful corpus stays unchanged by reduction',async()=>{const f=generateV2();assert.deepEqual((await reduceV2(f)).fixture,f);});
