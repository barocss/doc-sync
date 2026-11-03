import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreview,validTextSelection,MAX_PREVIEW_TEXT} from '../spreadsheet/presence.ts';
import {SheetSession} from '../spreadsheet/session.ts';
import {sheetProfile} from '../spreadsheet/profiles.ts';
import {createSpreadsheetServer} from '../spreadsheet/server.mjs';

const select=(start:number,end=start,direction:'forward'|'backward'|'none'='none')=>({start,end,direction});
async function until(check:()=>Promise<boolean>){for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Text presence timeout');}
async function fixture(stable=false){
 const service=createSpreadsheetServer();await new Promise<void>(r=>service.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${(service.server.address() as {port:number}).port}`;
 const session=new SheetSession('alice','text-selection',base,sheetProfile(null,stable?'stable':null));await session.connect();
 const state=async()=>await(await fetch(base+'/api/sheets/text-selection/state')).json();
 const post=async(body:object)=>{const result=await fetch(base+'/api/sheets/text-selection/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({actor:session.actor,meta:session.profile.meta,epoch:session.epoch,token:session.token,...body})});return {status:result.status,data:await result.json()};};
 return {...service,session,state,post,cleanup:async()=>{session.disconnect();await service.close();}};
}

test('UTF-16 preview normalization keeps Korean, emoji, ZWJ, RTL and newline offsets',()=>{
 for(const [text,selection] of [['한글\nאב',select(1,4,'backward')],['a😀b',select(1,3,'forward')],['👩‍💻',select(2,3,'backward')],['각',select(1)],['😀',select(2)]] as const){assert.deepEqual(normalizePreview(text,selection),{text,selection});assert.equal(validTextSelection(text,selection),true);}
 assert.deepEqual(normalizePreview('a😀b',select(2)),{text:'a😀b',selection:select(1)});
 assert.deepEqual(normalizePreview('a😀b',select(-4,99,'backward')),{text:'a😀b',selection:select(0,4,'backward')});
 const text='x'.repeat(MAX_PREVIEW_TEXT-1)+'😀tail';
 assert.deepEqual(normalizePreview(text,select(MAX_PREVIEW_TEXT+2)),{text:'x'.repeat(MAX_PREVIEW_TEXT-1),selection:select(MAX_PREVIEW_TEXT-1)});
 assert.equal(normalizePreview('x'.repeat(MAX_PREVIEW_TEXT-2)+'😀tail').text.length,MAX_PREVIEW_TEXT);
 assert.deepEqual(normalizePreview('legacy'),{text:'legacy'});
});

test('HTTP text selection validation rejects malformed updates before sequence or document mutation',async()=>{
 const f=await fixture();try{
  const range={row:0,column:0,endRow:0,endColumn:0},editing={target:{row:0,column:0},field:'value',text:'한😀글\nאב',composing:true,selection:select(1,3,'backward')};
  assert.equal((await f.post({range,editing,presenceSeq:10})).status,200);
  const before=await f.state();
  for(const selection of [null,[],{},select(-1),select(2),select(0,2),select(3,1),select(0,99),select(.5),select(Number.MAX_SAFE_INTEGER+1),{...select(1),direction:'left'},{...select(1),extra:true},{start:1,end:1}]){
   assert.equal((await f.post({range,editing:{...editing,selection},presenceSeq:11})).status,400,JSON.stringify(selection));
   assert.deepEqual(await f.state(),before);
  }
  assert.equal((await f.post({range,editing:{...editing,extra:true},presenceSeq:11})).status,400);
  assert.equal((await f.post({range,editing:{...editing,selection:select(3)},presenceSeq:11})).status,200);
  assert.deepEqual((await f.state()).presence[0].editing.selection,select(3));
  await f.post({range,editing:null,presenceSeq:12});
  assert.equal((await f.post({range,editing,presenceSeq:11})).data.stale,true);
  const after=await f.state();assert.equal(after.presence[0].editing,undefined);assert.deepEqual(after.log,before.log);assert.deepEqual(after.stats,before.stats);assert.equal(after.serverSeq,0);
 }finally{await f.cleanup();}
});

test('session copies selection and stable IDs; previews leave draft history and undo intact',async()=>{
 const f=await fixture(true);try{
  const a=f.session;a.edit(8,8,{value:'committed'});await until(async()=>a.sheet.stats().pending===0);
  const before=a.sheet.captureState(),target=a.target(2,3),selection=select(1,3,'backward');
  a.preview(target,'value','한😀글',{composing:true,selection});
  selection.start=0;if(typeof target.row!=='number')target.row.offset=99;if(typeof target.column!=='number')target.column.offset=99;
  await until(async()=>!!(await f.state()).presence[0]?.editing);
  const editing=(await f.state()).presence[0].editing;
  assert.deepEqual(editing.selection,select(1,3,'backward'));assert.equal(editing.composing,true);assert.deepEqual(a.resolve(editing.target),{row:2,column:3});
  assert.deepEqual(a.sheet.captureState(),before);assert.equal((await f.state()).serverSeq,1);
  a.preview(editing.target,'value','legacy');await until(async()=>(await f.state()).presence[0]?.editing?.text==='legacy');
  assert.equal((await f.state()).presence[0].editing.selection,undefined);assert.deepEqual(a.sheet.captureState(),before);
  a.clearPreview();await until(async()=>!(await f.state()).presence[0]?.editing);
  assert.deepEqual(a.sheet.captureState(),before);assert.equal(a.undo().length,1);assert.equal(a.sheet.getCell(8,8).value,undefined);
 }finally{await f.cleanup();}
});
