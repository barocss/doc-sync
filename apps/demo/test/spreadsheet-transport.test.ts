import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpreadsheetServer,META} from '../spreadsheet/server.mjs';
import {SheetSession} from '../spreadsheet/session.ts';
async function fixture(){const service=createSpreadsheetServer();await new Promise<void>(ok=>service.server.listen(0,'127.0.0.1',ok));const address=service.server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;const post=async(action:string,b:unknown)=>{const r=await fetch(base+'/api/sheets/test/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};const state=async()=>await(await fetch(base+'/api/sheets/test/state')).json();return {...service,base,post,state};}
async function settle(...peers:SheetSession[]){for(let i=0;i<30;i++){await Promise.all(peers.map(p=>p.flush()));await new Promise(ok=>setTimeout(ok,5));if(peers.every(p=>!p.sheet.stats().pending))return;}throw Error('Pending timeout');}
test('real HTTP independent peers converge, preserve fields, fence undo, repeat history, reconnect pending',async()=>{
 const f=await fixture();const a=new SheetSession('alice','test',f.base),b=new SheetSession('bob','test',f.base);
 try{await a.connect();await b.connect();a.disconnect();b.disconnect();a.edit(8,2,{value:'left',fill:'#ff0000'});b.edit(8,2,{value:'right',bold:true});await a.connect();await b.connect();await settle(a,b);await a.pull();await b.pull();assert.deepEqual(a.sheet.getCell(8,2),b.sheet.getCell(8,2));assert.equal(a.sheet.getCell(8,2).fill,'#ff0000');assert.equal(a.sheet.getCell(8,2).bold,true);
 a.edit(2,2,{value:'same'});await settle(a);await b.pull();b.edit(2,2,{value:'same'});await settle(b);await a.pull();assert.equal(a.undo().length,0);assert.equal(a.sheet.getCell(2,2).value,'same');
 a.edit(4,4,{value:'first'});a.edit(4,4,{value:'second'});await settle(a);a.undo();assert.equal(a.sheet.getCell(4,4).value,'first');a.undo();assert.equal(a.sheet.getCell(4,4).value,undefined);a.redo();a.redo();assert.equal(a.sheet.getCell(4,4).value,'second');await settle(a);await b.pull();assert.deepEqual(a.sheet.getCell(4,4),b.sheet.getCell(4,4));
 a.disconnect();a.edit(1048575,16383,{value:'far'});assert.equal(a.sheet.stats().pending,1);await a.connect();await settle(a);await b.pull();assert.equal(b.sheet.getCell(1048575,16383).value,'far');assert.equal((await f.state()).cells.find((c:any)=>c.row===1048575).cell.value,'far');
 }finally{a.disconnect();b.disconnect();await f.close();}
});
test('schema, batch, actor, sequence and ticket checks are atomic; retry returns exact original receipt',async()=>{
 const f=await fixture();try{const join=await f.post('join',{actor:'alice',meta:META});const body={actor:'alice',meta:META,token:join.data.token,epoch:join.data.epoch,seq:1,ops:[{at:{actor:'alice',lamport:1},sheetId:'sheet',row:0,column:0,field:'value',value:'ok'}]};
 for(const invalid of [{...body,meta:{...META,rows:1}},{...body,seq:2},{...body,ops:[{...body.ops[0],at:{actor:'bob',lamport:1}}]},{...body,ops:[...body.ops,{...body.ops[0],at:{actor:'alice',lamport:2},row:META.rows}]},{...body,ops:[...body.ops,{...body.ops[0],value:'collision'}]}]){assert.notEqual((await f.post('changes',invalid)).status,200);assert.equal((await f.state()).serverSeq,0);}
 const first=await f.post('changes',body);assert.equal(first.status,200);assert.deepEqual((await f.post('changes',body)).data,first.data);assert.equal((await f.state()).serverSeq,1);assert.equal((await f.post('changes',{...body,ops:[{...body.ops[0],value:'changed'}]})).status,409);assert.equal((await f.post('changes',{...body,seq:2})).status,409);assert.equal((await f.state()).stats.retainedOps,1);
 const stream=await fetch(f.base+`/api/sheets/test/stream?actor=alice&token=${join.data.token}&epoch=${join.data.epoch}&since=0`);const reader=stream.body!.getReader();const event=await reader.read();assert.match(new TextDecoder().decode(event.value),/hello/);await reader.cancel();
 }finally{await f.close();}
});
test('epoch reset blocks reconnect and keeps the complete local pending state',async()=>{const f=await fixture();const a=new SheetSession('alice','test',f.base);try{await a.connect();a.disconnect();a.edit(0,0,{value:'unsent'});const before=a.sheet.captureState();f.rooms.clear();await assert.rejects(a.connect());assert.deepEqual(a.sheet.captureState(),before);assert.equal(a.sheet.stats().pending,1);assert.ok(a.blocked);}finally{a.disconnect();await f.close();}});
test('lost acceptance response retries the exact request before a newer pending suffix',async()=>{
 const f=await fixture();const a=new SheetSession('alice','test',f.base);const realFetch=globalThis.fetch;let lost=false;const requests:string[]=[];
 try{await a.connect();globalThis.fetch=(async(input:any,init?:RequestInit)=>{if(String(input).endsWith('/changes')){requests.push(String(init?.body));const response=await realFetch(input,init);if(!lost){lost=true;await response.text();throw TypeError('Simulated lost acceptance response');}return response;}return realFetch(input,init);}) as typeof fetch;
 a.edit(0,0,{value:'accepted but response lost'});await new Promise(ok=>setTimeout(ok,20));assert.equal(a.connected,false);assert.equal(a.sheet.stats().pending,1);assert.equal((await f.state()).serverSeq,1);
 a.edit(0,1,{value:'new pending suffix'});await a.connect();await settle(a);assert.equal(requests[0],requests[1]);assert.equal(JSON.parse(requests[2]!).seq,2);assert.equal((await f.state()).serverSeq,2);assert.equal(a.sheet.stats().pending,0);
 }finally{globalThis.fetch=realFetch;a.disconnect();await f.close();}
});
test('SSE emits live accepted changes and range presence; closing a stream expires presence',async()=>{
 const f=await fixture();let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{const joined=await f.post('join',{actor:'alice',meta:META});const credentials={actor:'alice',meta:META,token:joined.data.token,epoch:joined.data.epoch};
 const controller=new AbortController();const response=await fetch(f.base+`/api/sheets/test/stream?actor=alice&token=${credentials.token}&epoch=${credentials.epoch}&since=0`,{signal:controller.signal});reader=response.body!.getReader();let buffer='';
 async function nextEvent(type:string){const deadline=Date.now()+2000;while(Date.now()<deadline){const separator=buffer.indexOf('\n\n');if(separator>=0){const frame=buffer.slice(0,separator);buffer=buffer.slice(separator+2);if(frame.startsWith('data: ')){const value=JSON.parse(frame.slice(6));if(value.type===type)return value;}continue;}const result=await Promise.race([reader!.read(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('SSE timeout')),2000))]);if(result.done)throw Error('SSE ended');buffer+=new TextDecoder().decode(result.value);}throw Error('SSE event missing');}
 assert.equal((await nextEvent('hello')).epoch,credentials.epoch);await nextEvent('presence');
 const range={row:2,column:3,endRow:5,endColumn:7};assert.equal((await f.post('presence',{...credentials,range})).status,200);assert.deepEqual((await nextEvent('presence')).peers[0].range,range);
 const op={at:{actor:'alice',lamport:1},sheetId:'sheet',row:5,column:7,field:'value',value:'through SSE'};await f.post('changes',{...credentials,seq:1,ops:[op]});assert.deepEqual((await nextEvent('change')).entry.ops,[op]);
 await reader.cancel();controller.abort();for(let i=0;i<30&&(await f.state()).presence.length;i++)await new Promise(ok=>setTimeout(ok,5));assert.deepEqual((await f.state()).presence,[]);
 }finally{await reader?.cancel().catch(()=>{});await f.close();}
});
