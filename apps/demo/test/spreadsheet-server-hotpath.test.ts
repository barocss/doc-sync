import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SparseSheet} from '../../../experiments/sparse-sheet/src/sheet.ts';
import {createSpreadsheetServer,META} from '../spreadsheet/server.mjs';

test('HTTP accept and atomic rejection at 1k/10k use no full-state capture or replay',async()=>{
 const originalCapture=SparseSheet.prototype.captureState,originalRestore=SparseSheet.fromState;
 let captures=0,replays=0;
 SparseSheet.prototype.captureState=function(){captures++;return originalCapture.call(this);};
 SparseSheet.fromState=function(state:unknown){replays++;return originalRestore.call(this,state);};
 const service=createSpreadsheetServer();
 await new Promise<void>(ok=>service.server.listen(0,'127.0.0.1',ok));
 const port=(service.server.address() as {port:number}).port;
 const post=async(room:string,action:string,body:unknown)=>{const response=await fetch(`http://127.0.0.1:${port}/api/sheets/${room}/${action}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const state=async(room:string)=>await(await fetch(`http://127.0.0.1:${port}/api/sheets/${room}/state`)).json();
 try{
  for(const count of [1000,10000]){
   const room='size-'+count;const joined=await post(room,'join',{actor:'alice',meta:META});
   const credentials={actor:'alice',meta:META,token:joined.data.token,epoch:joined.data.epoch};let seq=0;
   const op=(lamport:number,row:number,value:string)=>({at:{actor:'alice',lamport},sheetId:'sheet',row,column:0,field:'value',value});
   for(let offset=0;offset<count;offset+=256){const ops=Array.from({length:Math.min(256,count-offset)},(_,i)=>op(offset+i+1,offset+i,'seed'));assert.equal((await post(room,'changes',{...credentials,seq:++seq,ops})).status,200);}
   assert.equal((await state(room)).stats.retainedOps,count);
   const next=op(count+1,0,'winning value');const request={...credentials,seq:++seq,ops:[next]};const accepted=await post(room,'changes',request);assert.equal(accepted.status,200);
   const acceptedState=await state(room);
   const fresh=op(count+2,1,'must remain absent');
   // A known identity with a fresh suffix must reject the whole new request,
   // whether the old identity is repeated exactly or carries conflicting data.
   for(const ops of [[next,fresh],[{...next,value:'collision'},fresh],[fresh,next],[fresh,{...next,value:'collision'}],[fresh,{...fresh,value:'batch collision'}],[fresh,{...op(count+3,2,'invalid'),row:META.rows}],[fresh,{...op(count+3,2,'invalid'),value:{bad:true}}],[fresh,{...op(count+3,2,'invalid'),at:{actor:'alice',lamport:0}}]]){
    assert.notEqual((await post(room,'changes',{...credentials,seq:seq+1,ops})).status,200);
    assert.deepEqual(await state(room),acceptedState);
    assert.equal(service.rooms.get(room).acceptedTickets.size,count+1);
   }
   const retry=await post(room,'changes',request);assert.equal(retry.status,200);assert.deepEqual(retry.data,accepted.data);assert.deepEqual(await state(room),acceptedState);
   // Malformed batches did not consume their fresh prefix's identity or sequence.
   assert.equal((await post(room,'changes',{...credentials,seq:++seq,ops:[fresh]})).status,200);
   // A fresh lower ticket is accepted and retained even if it loses the register.
   const low=op(count+3,3,'first at another cell');assert.equal((await post(room,'changes',{...credentials,seq:++seq,ops:[low]})).status,200);
   const higher=op(count+5,3,'higher');assert.equal((await post(room,'changes',{...credentials,seq:++seq,ops:[higher]})).status,200);
   const losing=op(count+4,3,'lower');assert.equal((await post(room,'changes',{...credentials,seq:++seq,ops:[losing]})).status,200);
   const final=await state(room);assert.equal(final.cells.find((c:any)=>c.row===3).cell.value,'higher');
   for(const prior of [higher,losing]){assert.equal((await post(room,'changes',{...credentials,seq:seq+1,ops:[op(count+6,4,'fresh suffix'),prior]})).status,409);assert.deepEqual(await state(room),final);}
   assert.equal(service.rooms.get(room).acceptedTickets.size,final.stats.retainedOps);
  }
  assert.equal(captures,0);assert.equal(replays,0);
 }finally{SparseSheet.prototype.captureState=originalCapture;SparseSheet.fromState=originalRestore;await service.close();}
});
