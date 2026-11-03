import {execFileSync} from 'node:child_process';
import {get} from 'node:http';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const base=process.env.SPREADSHEET_URL??'http://127.0.0.1:5446';
const out=resolve(process.env.SPREADSHEET_PROOF_DIR??'output/spreadsheet-live-presence-demo/proof');mkdirSync(out,{recursive:true});
const session='spreadsheet-live-proof-'+process.pid;let room='proof-'+randomUUID();
const checks=[],events=[];
function cli(...args){const start=Date.now();const raw=execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:90000,maxBuffer:32*1024*1024,env:{...process.env,AGENT_BROWSER_EXECUTABLE_PATH:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',AGENT_BROWSER_DEFAULT_TIMEOUT:'60000'}});const result=JSON.parse(raw);events.push({command:args[0],arguments:args[0]==='eval'?['<read or explicitly scoped setup>']:args.slice(1),wallMs:Date.now()-start});if(result.success===false)throw Error(JSON.stringify(result));return result.data;}
function ev(source){const data=cli('eval','-b',Buffer.from(source).toString('base64'));return data?.result??data;}
const snap=()=>ev('__spreadsheetDemo.snapshot()');
const wait=source=>cli('wait','--fn',source);
function check(name,fn){fn();checks.push({name,status:'PASS'});console.log('PASS',name);}
const selector=(peer,part)=>`[data-peer="${peer}"] ${part}`;
function click(peer,part){cli('snapshot','-i');cli('click',selector(peer,part));}
function fill(peer,part,value){cli('snapshot','-i');cli('fill',selector(peer,part),String(value));}
function settled(){wait(`(()=>{const api=__spreadsheetDemo;const s=api.sessions;return s.every(p=>p.connected&&!p.blocked&&p.sheet.stats().pending===0)&&s[0].serverSeq===s[1].serverSeq})()`);const peers=snap();assert.deepEqual(peers[0].cells,peers[1].cells);}
function point(peer,row,column){return ev(`__spreadsheetDemo.cellScreenPoint(${peer},${row},${column})`);}
function cellClick(peer,row,column){const p=point(peer,row,column);cli('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));cli('mouse','down');cli('mouse','up');}
function nativeEdit(peer,row,column,text){cellClick(peer,row,column);cli('press','Enter');wait(`!!__spreadsheetDemo.views[${peer}].table.editorManager.editingEditor`);cli('keyboard','type',text);cli('press','Enter');settled();}
function jump(peer,address){fill(peer,'.jump',address);click(peer,'[data-action="jump"]');}
function cell(peer,row,column){return ev(`__spreadsheetDemo.sessions[${peer}].sheet.getCell(${row},${column})`);}
async function oracle(){const response=await fetch(`${base}/api/sheets/${room}/state`,{headers:{connection:'close'}});assert.equal(response.status,200);const state=await response.json();const peers=snap();for(const peer of peers)assert.deepEqual(state.cells,peer.cells);return state;}
const report={started:new Date().toISOString(),base,room,session,checks,scope:'Desktop Chrome only. Native drafts use trusted pointer and keyboard input. IME events are simulated, not real OS IME proof. Structural edits and exact committed baselines use explicitly scoped application actions.'};
const model=()=>ev('JSON.stringify(__spreadsheetDemo.sessions.map(s=>({state:s.sheet.captureState(),seq:s.seq,serverSeq:s.serverSeq})))');
const rendered=(peer,row=0,column=0)=>ev(`__spreadsheetDemo.views[${peer}].table.getCellValue(${column+1},${row+1})`);
function startDraft(row=0,column=0){cellClick(0,row,column);cli('press','Enter');wait('!!__spreadsheetDemo.views[0].table.editorManager.editingEditor');}
function preview(text,row=0,column=0){
 const expected=JSON.stringify(text),cell=`__spreadsheetDemo.views[1].table.getCellValue(${column+1},${row+1})`;
 const started=Date.now();let actual;
 for(let attempt=1;attempt<=30&&Date.now()-started<10000;attempt++){
  // A screenshot asks Chrome to produce a frame. Read VTable only after that
  // request, so headless rAF work can run between remote updates and the check.
  cli('screenshot',resolve(out,'frame-drive.png'));
  actual=ev(cell);
  if(JSON.stringify(actual)===expected){events.push({command:'preview-frame-drive',expected,actual,attempts:attempt,wallMs:Date.now()-started});return;}
 }
 const diagnostics=ev(`(()=>{const s=__spreadsheetDemo.sessions[1],v=__spreadsheetDemo.views[1],p=s.peers.find(x=>x.editing);return {peer:p,records:v.table.records,cell:v.table.getCellValue(${column+1},${row+1}),scene:v.table.scenegraph.getCell(${column+1},${row+1})?.attribute,cache:s.presence?.cache??s.presenceCache,editor:document.querySelector('[data-peer="1"] .grid')?.innerHTML}})()`);
 events.push({command:'preview-frame-drive-failed',expected,actual,attempts:30,wallMs:Date.now()-started,diagnostics});
 assert.equal(actual,text,`remote preview did not render after bounded Chrome frame requests: ${JSON.stringify(diagnostics)}`);
}
function frameUntil(source,description){
 const started=Date.now();let value;
 for(let attempt=1;attempt<=30&&Date.now()-started<10000;attempt++){
  cli('screenshot',resolve(out,'frame-drive.png'));
  value=ev(source);
  if(description(value)){events.push({command:'view-frame-drive',attempts:attempt,wallMs:Date.now()-started,value});return value;}
 }
 events.push({command:'view-frame-drive-failed',attempts:30,wallMs:Date.now()-started,value});
 return value;
}
const server=()=>new Promise((resolve,reject)=>{const request=get(`${base}/api/sheets/${room}/state`,{agent:false,headers:{connection:'close'}},response=>{let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>{try{assert.equal(response.statusCode,200);resolve(JSON.parse(body));}catch(error){reject(error);}});});request.on('error',reject);});
function open(query=''){if(query)room='proof-'+randomUUID();cli('open',`${base}/?room=${room}${query}`);cli('set','viewport','1720','1080');wait('window.__spreadsheetDemo?.sessions.every(p=>p.connected&&!p.blocked)');settled();}
try{
 const served=await fetch(base+'/main.js');assert.equal(served.status,200);report.servedBundleSHA256=createHash('sha256').update(new Uint8Array(await served.arrayBuffer())).digest('hex');assert.equal(report.servedBundleSHA256,createHash('sha256').update(readFileSync(resolve(process.env.SPREADSHEET_OUTPUT_DIR??'output/spreadsheet-live-presence-demo','main.js'))).digest('hex'));
 open();ev('__spreadsheetDemo.actions.edit(0,0,0,{value:"saved"})');settled();
 startDraft();const baseline=model(),before=await server();cli('press','Home');cli('press','Shift+End');cli('keyboard','type','LIVE draft');preview('LIVE draft');
 check('trusted native typing is visible on peer before Enter and leaves both committed states unchanged',()=>{assert.equal(model(),baseline);assert.equal(cell(1,0,0).value,'saved');assert.equal(ev('__spreadsheetDemo.views[0].table.editorManager.editingEditor.getValue()'),'LIVE draft');});assert.deepEqual((await server()).log,before.log);
 report.live=ev('({peer:__spreadsheetDemo.sessions[1].peers.find(p=>p.editing),style:__spreadsheetDemo.views[1].table.getCellStyle(1,1),scene:__spreadsheetDemo.views[1].table.scenegraph.getCell(1,1).attribute})');cli('screenshot',resolve(out,'live-native-desktop.png'));
 ev('__spreadsheetDemo.views[1].table.startEditCell(1,1)');check('opening a remote preview starts from the local committed value',()=>assert.equal(ev('__spreadsheetDemo.views[1].table.editorManager.editingEditor.getValue()'),'saved'));ev('__spreadsheetDemo.views[1].table.editorManager.cancelEdit()');click(0,'.grid input[data-presence-editor]');
 cli('press','Escape');preview('saved');check('Escape clears preview and changes no model clock pending or History',()=>assert.equal(model(),baseline));
 startDraft();cli('press','Home');cli('press','Shift+End');cli('press','Backspace');preview('');check('empty draft remains visible as an empty cell without committing',()=>{assert.equal(rendered(1),'');assert.equal(cell(1,0,0).value,'saved');});cli('press','Escape');preview('saved');
 startDraft();cli('press','Home');cli('press','Shift+End');cli('keyboard','type','committed once');preview('committed once');const count=(await server()).log.length;cli('press','Enter');settled();wait('!__spreadsheetDemo.sessions[1].peers.some(p=>p.editing)');check('Enter commits one action and removes preview',()=>assert.equal(cell(1,0,0).value,'committed once'));assert.equal((await server()).log.length,count+1);
 click(0,'[data-action="undo"]');settled();assert.equal(cell(1,0,0).value,'saved');click(0,'[data-action="redo"]');settled();check('one undo and redo restore the committed edit',()=>assert.equal(cell(1,0,0).value,'committed once'));
 cellClick(0,0,0);const inspectorBaseline=model();fill(0,'[name="formula"]','=LIVE(A1)');preview('=LIVE(A1)');check('trusted inspector formula draft is visible before Apply without changing committed state',()=>assert.equal(model(),inspectorBaseline));click(0,'.jump');preview('committed once');check('inspector blur clears remote preview and retains local dirty draft',()=>assert.equal(ev(`document.querySelector('[data-peer="0"] [name=formula]').value`),'=LIVE(A1)'));click(0,'[name="formula"]');cli('press','Escape');assert.equal(ev(`document.querySelector('[data-peer="0"] [name=formula]').value`),'');fill(0,'[name="value"]','inspector LIVE');preview('inspector LIVE');cli('press','Escape');preview('committed once');check('inspector Escape clears preview and restores committed form values without History',()=>assert.equal(model(),inspectorBaseline));
 cellClick(0,2,1);cli('press','Shift+ArrowDown');cellClick(1,4,3);cli('press','Shift+ArrowDown');wait(`(()=>{const s=__spreadsheetDemo.sessions;return s[1].peers.some(p=>p.name==='Alice'&&p.range?.row===2&&p.range?.column===1&&p.range?.endRow===3&&p.range?.endColumn===1)&&s[0].peers.some(p=>p.name==='Bob'&&p.range?.row===4&&p.range?.column===3&&p.range?.endRow===5&&p.range?.endColumn===3)})()`);
 report.colors=frameUntil('(()=>{const v=__spreadsheetDemo.views;return {identities:__spreadsheetDemo.sessions.map(s=>({name:s.name,color:s.color})),aliceRemote:v[1].table.getCellStyle(2,3),aliceScene:v[1].table.scenegraph.getCell(2,3).attribute.fill,bobRemote:v[0].table.getCellStyle(4,5),bobScene:v[0].table.scenegraph.getCell(4,5).attribute.fill,own:v.map(v=>v.table.theme.selectionStyle)}})()',x=>x?.aliceRemote?.bgColor==='#eaf2ff'&&x.aliceScene==='#eaf2ff'&&x?.bobRemote?.bgColor==='#fff0f1'&&x.bobScene==='#fff0f1');
 check('Alice blue and Bob red selection have distinct actual VTable styles and scene fills',()=>{assert.deepEqual(report.colors.identities,[{name:'Alice',color:'#3975c5'},{name:'Bob',color:'#d64b55'}]);assert.equal(report.colors.aliceRemote.bgColor,'#eaf2ff');assert.equal(report.colors.aliceScene,'#eaf2ff');assert.equal(report.colors.bobRemote.bgColor,'#fff0f1');assert.equal(report.colors.bobScene,'#fff0f1');});cli('screenshot',resolve(out,'per-user-selection-desktop.png'));
 startDraft(1,0);const imeBaseline=model();ev(`(()=>{const e=__spreadsheetDemo.views[0].table.editorManager.editingEditor.getInputElement();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));e.value='ㅎ';e.dispatchEvent(new InputEvent('input',{bubbles:true,data:'ㅎ',isComposing:true}));})()`);preview('ㅎ',1,0);cli('press','Enter');check('simulated composition Enter does not commit or close draft',()=>{assert.equal(model(),imeBaseline);assert.equal(ev('!!__spreadsheetDemo.views[0].table.editorManager.editingEditor'),true);});ev(`(()=>{const e=__spreadsheetDemo.views[0].table.editorManager.editingEditor.getInputElement();e.value='한글';e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한글'}));})()`);preview('한글',1,0);cli('press','Escape');preview('',1,0);report.ime={status:'PASS',method:'Simulated composition events; real OS IME NOT_RUN'};
 startDraft();cli('press','Home');cli('press','Shift+End');cli('keyboard','type','disconnect draft');preview('disconnect draft');ev('__spreadsheetDemo.actions.disconnect(0)');preview('committed once');check('disconnect clears the remote draft and restores committed cell',()=>assert.equal(cell(1,0,0).value,'committed once'));cli('press','Escape');
 open('&axes=stable');ev('__spreadsheetDemo.actions.edit(0,3,1,{value:"stable saved"})');settled();startDraft(3,1);const target=ev('__spreadsheetDemo.sessions[0].target(3,1)');cli('press','Home');cli('press','Shift+End');cli('keyboard','type','stable LIVE');preview('stable LIVE',3,1);
 ev('__spreadsheetDemo.actions.structure(1,"row","move",3,1,6)');settled();const moved=ev(`__spreadsheetDemo.sessions[1].resolve(${JSON.stringify(target)})`);preview('stable LIVE',moved.row,moved.column);check('stable preview follows captured row IDs after remote move',()=>{assert.notEqual(moved.row,3);assert.equal(cell(1,moved.row,moved.column).value,'stable saved');assert.equal(ev('__spreadsheetDemo.views[0].table.editorManager.editingEditor.getValue()'),'stable LIVE');});
 ev(`__spreadsheetDemo.actions.structure(1,"row","delete",${moved.row},1)`);settled();const deletedPreviewHidden=frameUntil('!__spreadsheetDemo.views[1].table.records.some(r=>Object.values(r).includes("stable LIVE"))',x=>x===true);assert.equal(deletedPreviewHidden,true,'deleted stable target preview remains in the remote table after bounded Chrome frame requests');const deletedBaseline=model();cli('press','Enter');check('deleted stable target preview is hidden and Enter writes no neighbor',()=>{assert.equal(model(),deletedBaseline);assert.equal(ev('!!__spreadsheetDemo.views[0].table.editorManager.editingEditor'),true);});cli('press','Escape');
 open('&profile=sensors&axes=stable');ev('__spreadsheetDemo.actions.edit(0,0,0,{reading:12})');settled();startDraft();const numericBaseline=model();cli('press','Home');cli('press','Shift+End');cli('keyboard','type','-');preview('-');cli('press','Enter');check('incomplete numeric preview is visible but invalid Enter retains draft without commit',()=>{assert.equal(model(),numericBaseline);assert.equal(ev('__spreadsheetDemo.views[0].table.editorManager.editingEditor.getValue()'),'-');assert.equal(cell(1,0,0).reading,12);});cli('press','Escape');preview(12);
 report.pageErrors=cli('errors');assert.deepEqual(report.pageErrors.errors??report.pageErrors,[]);report.console=cli('console');const logs=report.console.messages??report.console;assert.deepEqual(logs.filter(x=>x.type==='error'||x.level==='error'),[]);check('desktop browser errors and console errors are zero',()=>{});report.mobile={status:'NOT_RUN',reason:'User prohibited mobile testing'};report.status='PASS';
}catch(error){report.status='FAIL';report.firstFailure=error.stack;console.error(error.stack);process.exitCode=1;try{report.failure=snap();report.pageErrors=cli('errors');cli('screenshot',resolve(out,'failure.png'));}catch{}}
finally{report.finished=new Date().toISOString();report.events=events;report.sources={};for(const path of ['apps/demo/spreadsheet/main.ts','apps/demo/spreadsheet/session.ts','apps/demo/spreadsheet/presence.ts','apps/demo/spreadsheet/server.mjs','apps/demo/spreadsheet/style.css','apps/demo/spreadsheet/check-live-presence-browser.mjs',resolve(process.env.SPREADSHEET_OUTPUT_DIR??'output/spreadsheet-live-presence-demo','main.js')])try{report.sources[path]=createHash('sha256').update(readFileSync(path)).digest('hex');}catch{}writeFileSync(resolve(out,'functional.json'),JSON.stringify(report,null,2));try{cli('close');}catch{}}
