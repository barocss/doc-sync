import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSpreadsheetServer,META} from '../spreadsheet/server.mjs';
import {SheetSession} from '../spreadsheet/session.ts';
import {sheetProfile,parseFieldInput} from '../spreadsheet/profiles.ts';
import {changedProfileFields} from '../spreadsheet/inspector.ts';
async function fixture(){const service=createSpreadsheetServer();await new Promise<void>(ok=>service.server.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${(service.server.address() as {port:number}).port}`;const post=async(body:unknown,action='join')=>{const response=await fetch(base+'/api/sheets/custom/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};return {...service,base,post};}
async function settle(...peers:SheetSession[]){for(let i=0;i<50;i++){await Promise.all(peers.map(p=>p.flush()));await new Promise(ok=>setTimeout(ok,2));if(peers.every(p=>!p.sheet.stats().pending))return;}throw Error('Pending timeout');}
test('custom task peers validate atomically, merge field edits, retain defaults sparsely, undo and redo',async()=>{
 const f=await fixture();const profile=sheetProfile('tasks'),a=new SheetSession('alice','custom',f.base,profile),b=new SheetSession('bob','custom',f.base,profile);
 try{
  await a.connect();await b.connect();assert.deepEqual(a.sheet.getCell(1048575,16383),{});for(const [field,spec] of Object.entries(profile.fields))assert.equal(a.sheet.getCellValue(1048575,16383,field),spec.default);assert.equal(a.sheet.stats().registers,0);
  const initial=a.sheet.captureState();assert.throws(()=>a.edit(0,0,{title:'valid',progress:101}));assert.deepEqual(a.sheet.captureState(),initial);assert.throws(()=>a.edit(0,0,{value:'unknown'}));
  a.disconnect();b.disconnect();a.edit(3,4,{title:'Task'});b.edit(3,4,{progress:42,archived:true});await a.connect();await b.connect();await settle(a,b);await a.pull();await b.pull();assert.deepEqual(a.sheet.getCell(3,4),{title:'Task',progress:42,archived:true});assert.deepEqual(a.sheet.getCell(3,4),b.sheet.getCell(3,4));
  a.undo();await settle(a);await b.pull();assert.deepEqual(b.sheet.getCell(3,4),{progress:42,archived:true});assert.equal(b.sheet.getCellValue(3,4,'title'),'Untitled');a.redo();await settle(a);await b.pull();assert.equal(b.sheet.getCell(3,4).title,'Task');
  a.edit(1048575,16383,{title:'Far'});await settle(a);assert.equal(a.sheet.stats().registers,4);
 }finally{a.disconnect();b.disconnect();await f.close();}
});
test('custom sensor view parses native input and dirty inspector edits retain peer fields and types',async()=>{
 const f=await fixture();const profile=sheetProfile('sensors'),a=new SheetSession('alice','custom',f.base,profile),b=new SheetSession('bob','custom',f.base,profile);
 try{await a.connect();await b.connect();a.edit(0,0,{reading:parseFieldInput(profile.fields.reading!,'23.5')});await settle(a);await b.pull();const baseline={reading:'23.5',unit:'C'};b.edit(0,0,{reading:30});await settle(b);await a.pull();a.edit(0,0,changedProfileFields(profile.fields,baseline,{...baseline,unit:'F'}));await settle(a);await b.pull();assert.deepEqual(b.sheet.getCell(0,0),{reading:30,unit:'F'});assert.deepEqual(changedProfileFields(profile.fields,baseline,{...baseline}),{});assert.throws(()=>parseFieldInput(profile.fields.reading!,''));assert.throws(()=>a.edit(0,0,{unit:'K'}));assert.throws(()=>a.edit(0,0,{reading:'3'}));assert.throws(()=>a.edit(0,0,{reading:101}));}finally{a.disconnect();b.disconnect();await f.close();}
});
test('descriptor and identity mismatches preserve room, pending edits and exact retry receipts',async()=>{
 const f=await fixture();const tasks=sheetProfile('tasks'),sensors=sheetProfile('sensors'),a=new SheetSession('alice','custom',f.base,tasks),wrong=new SheetSession('bob','custom',f.base,sensors);
 try{
  assert.equal((await f.post({actor:'bad',meta:tasks.meta,schema:sensors.schema})).status,409);assert.equal(f.rooms.size,0);
  await a.connect();const room=f.rooms.get('custom');const before=room.sheet.captureState();const actors=room.actors.size;
  wrong.edit(0,0,{reading:12});const pending=wrong.sheet.captureState();await assert.rejects(wrong.connect());assert.deepEqual(wrong.sheet.captureState(),pending);assert.equal(wrong.sheet.stats().pending,1);assert.deepEqual(room.sheet.captureState(),before);assert.equal(room.actors.size,actors);
  assert.equal((await f.post({actor:'bob',meta:tasks.meta,schema:sensors.schema})).status,409);assert.equal((await f.post({actor:'bob',meta:META})).status,409);assert.equal(room.actors.size,actors);
  a.disconnect();a.edit(0,0,{title:'Accepted'});const body={actor:a.actor,meta:tasks.meta,token:a.token,epoch:a.epoch,seq:1,ops:a.sheet.pendingChanges()};const first=await f.post(body,'changes');assert.equal(first.status,200);assert.deepEqual((await f.post(body,'changes')).data,first.data);assert.equal(room.log.length,1);
  const accepted=room.sheet.captureState();const bad={...body,seq:2,ops:[{...body.ops[0],at:{actor:'alice',lamport:2},field:'progress',value:50},{...body.ops[0],at:{actor:'alice',lamport:3},schemaVersion:sensors.meta.schemaVersion}]};assert.notEqual((await f.post(bad,'changes')).status,200);assert.deepEqual(room.sheet.captureState(),accepted);assert.equal(room.log.length,1);assert.equal(room.actors.get('alice').seq,1);
 }finally{a.disconnect();wrong.disconnect();await f.close();}
});
