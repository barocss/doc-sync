/** Deterministic local watcher qualification; no model, provider, persistence or writes. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ReviewWatch,type WatchState} from '../src/watch.ts';
const initial=():WatchState=>({generation:'g',epoch:'e',schemaVersion:'s',serverSeq:1});
function gate(){let release!:()=>void;const wait=new Promise<void>(r=>release=r);return {wait,release};}
for(const shared of [true,false])for(const field of ['generation','epoch','schemaVersion'] as const)test(`completion rejects ${field} drift during paused review (${shared?'shared':'fresh'} read object)`,async()=>{
 const state=initial(),entered=gate(),resume=gate();let calls=0,reads=0;
 const watch=new ReviewWatch(async()=>{reads++;return shared?state:{...state};},async range=>{calls++;assert.deepEqual(range,{from:1,to:2});entered.release();await resume.wait;return {status:'completed'};},4);
 assert.equal(await watch.poll(),'baseline');state.serverSeq=2;const active=watch.poll();await entered.wait;state[field]='changed';resume.release();
 await assert.rejects(active,/changed/);assert.equal(reads,3);assert.equal(calls,1);assert.equal(watch.done,true);assert.equal(await watch.poll(),'stopped');
});
for(const value of [1,-1,NaN,Infinity,2.5])test(`completion rejects backward or invalid sequence ${String(value)}`,async()=>{
 const state=initial();let calls=0;
 const watch=new ReviewWatch(async()=>({...state}),async()=>{calls++;state.serverSeq=value;return {status:'completed'};},3);
 await watch.poll();state.serverSeq=2;await assert.rejects(watch.poll());assert.equal(watch.done,true);assert.equal(calls,1);assert.equal(await watch.poll(),'stopped');
});
for(const field of ['generation','epoch','schemaVersion'] as const)test(`completion rejects unavailable ${field}`,async()=>{
 const state=initial();const watch=new ReviewWatch(async()=>({...state}),async()=>{state[field]='';return {status:'completed'};},3);
 await watch.poll();state.serverSeq=2;await assert.rejects(watch.poll());assert.equal(watch.done,true);
});
for(const shared of [true,false])test(`later sequence remains queued for next review (${shared?'shared':'fresh'} read object)`,async()=>{
 const state=initial(),ranges:Array<{from:number;to:number}>=[];let reads=0;
 const watch=new ReviewWatch(async()=>{reads++;return shared?state:{...state};},async range=>{ranges.push({...range});if(ranges.length===1)state.serverSeq=5;return {status:'completed'};},4);
 assert.equal(await watch.poll(),'baseline');assert.equal(reads,1);state.serverSeq=2;assert.equal(await watch.poll(),'reviewed');assert.deepEqual(ranges,[{from:1,to:2}]);
 assert.equal(await watch.poll(),'reviewed');assert.deepEqual(ranges,[{from:1,to:2},{from:2,to:5}]);assert.equal(await watch.poll(),'unchanged');assert.equal(ranges.length,2);
});
test('stop during review returns stopped and skips completion read or new review',async()=>{
 const state=initial(),entered=gate(),resume=gate();let reads=0,calls=0;
 const watch=new ReviewWatch(async()=>{reads++;return {...state};},async()=>{calls++;entered.release();await resume.wait;return {status:'completed'};},4);
 await watch.poll();state.serverSeq=2;const active=watch.poll();await entered.wait;watch.stop();state.serverSeq=3;resume.release();assert.equal(await active,'stopped');assert.equal(reads,2);assert.equal(calls,1);assert.equal(await watch.poll(),'stopped');assert.equal(reads,2);
});
test('stop during completion read returns stopped rather than reviewed',async()=>{
 const state=initial(),entered=gate(),resume=gate();let reads=0,calls=0;
 const watch=new ReviewWatch(async()=>{if(++reads===3){entered.release();await resume.wait;}return {...state};},async()=>{calls++;return {status:'completed'};},4);
 await watch.poll();state.serverSeq=2;const active=watch.poll();await entered.wait;watch.stop();resume.release();assert.equal(await active,'stopped');assert.equal(calls,1);assert.equal(await watch.poll(),'stopped');assert.equal(reads,3);
});
test('completion read failure stops watcher without retrying reviewer',async()=>{
 const state=initial();let reads=0,calls=0;
 const watch=new ReviewWatch(async()=>{if(++reads===3)throw Error('Synthetic read failure');return {...state};},async()=>{calls++;return {status:'completed'};},4);
 await watch.poll();state.serverSeq=2;await assert.rejects(watch.poll(),/Synthetic read failure/);assert.equal(watch.done,true);assert.equal(await watch.poll(),'stopped');assert.equal(calls,1);assert.equal(reads,3);
});
