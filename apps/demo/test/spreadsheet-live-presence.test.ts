import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpreadsheetServer} from '../spreadsheet/server.mjs';
import {SheetSession} from '../spreadsheet/session.ts';
import {sheetProfile} from '../spreadsheet/profiles.ts';
const delay=()=>new Promise(r=>setTimeout(r,10));
async function until(check:()=>boolean|Promise<boolean>){for(let i=0;i<150;i++){if(await check())return;await delay();}throw Error('Presence timeout');}
async function fixture(stable=false){const service=createSpreadsheetServer();await new Promise<void>(r=>service.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(service.server.address() as {port:number}).port}`;const a=new SheetSession('alice','live',base,sheetProfile(null,stable?'stable':null)),b=new SheetSession('bob','live',base,sheetProfile(null,stable?'stable':null));await a.connect();await b.connect();const state=async()=>await(await fetch(base+'/api/sheets/live/state')).json();const post=async(body:object)=>{const response=await fetch(base+'/api/sheets/live/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:a.actor,meta:a.profile.meta,epoch:a.epoch,token:a.token,...body})});return {status:response.status,data:await response.json()};};return {...service,base,a,b,state,post,cleanup:async()=>{a.disconnect();b.disconnect();await service.close();}};}
async function stream(f:Awaited<ReturnType<typeof fixture>>,session:SheetSession){const response=await fetch(`${f.base}/api/sheets/live/stream?`+new URLSearchParams({actor:session.actor,epoch:session.epoch,token:session.token,since:String(session.serverSeq)}));const reader=response.body!.getReader();let buffer='';return {close:()=>reader.cancel(),async next(type:string){for(;;){const split=buffer.indexOf('\n\n');if(split>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);if(frame.startsWith('data: ')){const event=JSON.parse(frame.slice(6));if(event.type===type)return event;}continue;}const result=await reader.read();if(result.done)throw Error('SSE ended');buffer+=new TextDecoder().decode(result.value);}}};}
test('HTTP/SSE previews before commit leave sheet, clock, pending and undo untouched',async()=>{const f=await fixture();const s=await stream(f,f.b);try{await s.next('hello');await s.next('presence');const before=f.a.sheet.captureState();await f.a.presence({row:2,column:3,endRow:4,endColumn:5});f.a.preview(f.a.target(2,3),'value','입력 중',{composing:true});await until(async()=>!!(await f.state()).presence[0]?.editing);let event;do{event=await s.next('presence');}while(!event.peers[0]?.editing);assert.equal(event.peers[0].editing.text,'입력 중');assert.equal(event.peers[0].editing.composing,true);assert.deepEqual(f.a.sheet.captureState(),before);const state=await f.state();assert.equal(state.serverSeq,0);assert.equal(state.stats.retainedOps,0);assert.equal(f.a.sheet.stats().pending,0);assert.equal(f.a.undo().length,0);assert.notEqual(f.a.color,f.b.color);assert.equal(event.peers[0].color,f.a.color);f.a.clearPreview();await until(async()=>!(await f.state()).presence[0]?.editing);assert.equal((await f.state()).log.length,0);}finally{await s.close();await f.cleanup();}});
test('presence validation is atomic and old sequence cannot revive a cancelled draft',async()=>{const f=await fixture();try{const range={row:0,column:0,endRow:0,endColumn:0},editing={target:{row:0,column:0},field:'value',text:'draft',composing:false};assert.equal((await f.post({range,editing,presenceSeq:20})).status,200);const before=(await f.state()).presence;for(const patch of [{color:'red'},{name:'x'.repeat(81)},{editing:{...editing,text:'x'.repeat(8193)}},{editing:{...editing,field:'unknown'}},{editing:{...editing,composing:'yes'}},{presenceSeq:1.1},{range:{...range,endRow:-1}}]){assert.equal((await f.post({range,editing,presenceSeq:21,...patch})).status,400);assert.deepEqual((await f.state()).presence,before);}await f.post({range,editing:null,presenceSeq:22});assert.equal((await f.post({range,editing,presenceSeq:21})).data.stale,true);assert.equal((await f.state()).presence[0].editing,undefined);assert.equal((await f.state()).log.length,0);}finally{await f.cleanup();}});
test('stable targets follow axis moves and resolve deleted targets without writing cells',async()=>{const f=await fixture(true);try{const target=f.a.target(2,3);f.a.preview(target,'value','draft');await until(async()=>!!(await f.state()).presence[0]?.editing);f.b.structure('row','move',2,1,6);await until(()=>f.b.sheet.stats().pending===0);await f.a.pull();const moved=f.a.resolve(target);assert.notEqual(moved.row,2);assert.equal(f.a.sheet.getCell(moved.row,moved.column).value,undefined);f.b.structure('row','delete',moved.row);await until(()=>f.b.sheet.stats().pending===0);await f.a.pull();assert.equal(f.a.resolve(target).row,-1);f.a.clearPreview();await until(async()=>!(await f.state()).presence[0]?.editing);assert.equal((await f.state()).log.length,2);assert.equal((await f.state()).cells.length,0);}finally{await f.cleanup();}});
test('latest coalesced text wins and clear survives a delayed preview response',async()=>{const f=await fixture();const realFetch=globalThis.fetch;let release:()=>void=()=>{};let calls=0;const gate=new Promise<void>(r=>{release=r;});try{globalThis.fetch=(async(input:any,init?:RequestInit)=>{if(String(input).endsWith('/presence')){calls++;if(calls===1)await gate;}return realFetch(input,init);}) as typeof fetch;const target=f.a.target(0,0);f.a.preview(target,'value','first');for(let i=0;i<100;i++)f.a.preview(target,'value',String(i));assert.equal(calls,1);release();await until(async()=> (await f.state()).presence[0]?.editing?.text==='99');assert.ok(calls<=2);f.a.preview(target,'value','will cancel');f.a.clearPreview();await until(async()=>!(await f.state()).presence[0]?.editing);assert.equal(f.a.sheet.stats().pending,0);}finally{release();globalThis.fetch=realFetch;await f.cleanup();}});
test('SSE disconnect clears preview and stale stream close preserves newer stream',async()=>{const f=await fixture();const first=await stream(f,f.a);let second:Awaited<ReturnType<typeof stream>>|undefined;try{await first.next('hello');await f.post({presenceSeq:5,range:{row:0,column:0,endRow:0,endColumn:0},editing:{target:{row:0,column:0},field:'value',text:'old before reconnect',composing:false}});second=await stream(f,f.a);await second.next('hello');assert.equal((await f.state()).presence[0].editing,undefined);await f.post({presenceSeq:10,range:{row:0,column:0,endRow:0,endColumn:0},editing:{target:{row:0,column:0},field:'value',text:'draft',composing:false}});await first.close();await delay();assert.equal((await f.state()).presence[0].editing.text,'draft');await second.close();await until(async()=>!(await f.state()).presence.length);assert.equal((await f.post({presenceSeq:10,range:{row:0,column:0,endRow:0,endColumn:0},editing:{target:{row:0,column:0},field:'value',text:'late',composing:false}})).data.stale,true);}finally{await first.close().catch(()=>{});await second?.close().catch(()=>{});await f.cleanup();}});

test('HTTP-only session disconnect fences a delayed preview and reconnect accepts new state',async()=>{
 const f=await fixture(),realFetch=globalThis.fetch;
 let release:()=>void=()=>{},held=false,settled=false;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 try{
  const before=f.a.sheet.captureState();
  globalThis.fetch=(async(input:any,init?:RequestInit)=>{
   if(String(input).endsWith('/presence')&&!held){held=true;await gate;const response=await realFetch(input,init);settled=true;return response;}
   return realFetch(input,init);
  }) as typeof fetch;
  f.a.preview(f.a.target(0,0),'value','old draft');assert.equal(held,true);
  f.a.disconnect();
  await until(()=>f.rooms.get('live').actors.get('alice').presenceSeq>0);
  release();await until(()=>settled);
  assert.deepEqual((await f.state()).presence,[]);
  await f.a.connect();f.a.preview(f.a.target(1,1),'value','new draft');
  await until(async()=>(await f.state()).presence[0]?.editing?.text==='new draft');
  assert.deepEqual(f.a.sheet.captureState(),before);assert.equal((await f.state()).serverSeq,0);
 }finally{release();globalThis.fetch=realFetch;await f.cleanup();}
});

test('SSE generation rejects late preview and leave across disconnect, replacement and HTTP-only reconnect',async()=>{
 const f=await fixture(),first=await stream(f,f.a);
 let second:Awaited<ReturnType<typeof stream>>|undefined;
 const range={row:0,column:0,endRow:0,endColumn:0};
 const editing={target:{row:0,column:0},field:'value',text:'delayed old draft',composing:false};
 const leave=async(presenceGeneration:string)=>{
  const response=await fetch(f.base+'/api/sheets/live/presence-leave',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:f.a.actor,meta:f.a.profile.meta,token:f.a.token,epoch:f.a.epoch,presenceGeneration})});
  return response.json();
 };
 try{
  const oldGeneration=(await first.next('hello')).presenceGeneration;
  await first.close();await until(()=>!f.rooms.get('live').actors.get('alice').streamId);
  assert.deepEqual((await f.post({presenceGeneration:oldGeneration,presenceSeq:50,range,editing})).data,{stale:true});
  assert.deepEqual(await leave(oldGeneration),{stale:true});assert.deepEqual((await f.state()).presence,[]);
  second=await stream(f,f.a);const currentGeneration=(await second.next('hello')).presenceGeneration;
  assert.equal((await f.post({presenceGeneration:currentGeneration,presenceSeq:51,range,editing:{...editing,text:'current draft'}})).status,200);
  assert.deepEqual((await f.post({presenceGeneration:oldGeneration,presenceSeq:100,range,editing})).data,{stale:true});
  assert.deepEqual(await leave(oldGeneration),{stale:true});assert.equal((await f.state()).presence[0].editing.text,'current draft');
  // A join retires the old SSE owner. Its delayed close cannot revoke an HTTP-only session.
  await f.a.connect();await second.close();await delay();
  f.a.preview(f.a.target(1,1),'value','HTTP reconnect');
  await until(async()=>(await f.state()).presence[0]?.editing?.text==='HTTP reconnect');
  assert.equal((await f.state()).serverSeq,0);assert.equal(f.a.sheet.stats().pending,0);
 }finally{await first.close().catch(()=>{});await second?.close().catch(()=>{});await f.cleanup();}
});
