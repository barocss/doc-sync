import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ReviewWatch, type WatchState} from '../src/watch.ts';

const initial = (): WatchState => ({generation:'g', epoch:'e', schemaVersion:'s', serverSeq:1});
test('review watcher baselines, coalesces changes, and stops at its budget', async () => {
 let state=initial(); const calls: Array<{from:number;to:number}>=[];
 const watch=new ReviewWatch(async()=>({...state}),async range=>{calls.push(range);return {status:'completed'};},2);
 assert.equal(await watch.poll(),'baseline'); assert.equal(await watch.poll(),'unchanged');
 state.serverSeq=4; assert.equal(await watch.poll(),'reviewed'); assert.deepEqual(calls,[{from:1,to:4}]);
 assert.equal(await watch.poll(),'unchanged'); state.serverSeq=5; await watch.poll();
 assert.equal(watch.done,true); state.serverSeq=6; assert.equal(await watch.poll(),'stopped'); assert.equal(calls.length,2);
});
test('watcher fails closed when document identity changes or a review is uncertain',async()=>{
 for (const field of ['generation','epoch','schemaVersion'] as const) {
  let state=initial(), calls=0; const watch=new ReviewWatch(async()=>state,async()=>{calls++;return {status:'completed'};},2);
  await watch.poll(); state={...state,[field]:'different',serverSeq:2};
  await assert.rejects(watch.poll(),/changed/); assert.equal(watch.done,true); assert.equal(calls,0);
 }
 let state=initial(); const watch=new ReviewWatch(async()=>state,async()=>({status:'needs_attention'}),2);
 await watch.poll(); state={...state,serverSeq:2}; await assert.rejects(watch.poll(),/needs attention/); assert.equal(watch.done,true);
});
test('review polls cannot overlap and stop prevents a new review',async()=>{
 let release!:()=>void; const blocked=new Promise<void>(resolve=>{release=resolve;}); let state=initial(), calls=0;
 const watch=new ReviewWatch(async()=>{await blocked;return state;},async()=>{calls++;return {status:'completed'};},2);
 const first=watch.poll(); await assert.rejects(watch.poll(),/already in progress/); watch.stop(); release();
 assert.equal(await first,'stopped'); state.serverSeq=2; assert.equal(await watch.poll(),'stopped'); assert.equal(calls,0);
});
