import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const base=process.env.SPREADSHEET_URL??'http://127.0.0.1:5422';
const out=resolve(process.env.SPREADSHEET_PROOF_DIR??'output/spreadsheet-stable-proof');mkdirSync(out,{recursive:true});
const session='spreadsheet-stable-proof-'+process.pid,room='proof-'+randomUUID();
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
const report={started:new Date().toISOString(),base,room,session,checks,scope:'Trusted native Escape after remote row move; same final S2 bundle'};
try{
 const bundle=resolve(process.env.SPREADSHEET_OUTPUT_DIR,'main.js');report.bundleSHA256=createHash('sha256').update(new Uint8Array(await(await fetch(base+'/main.js')).arrayBuffer())).digest('hex');assert.equal(report.bundleSHA256,createHash('sha256').update(readFileSync(bundle)).digest('hex'));
 cli('open',base+'/?axes=stable&room='+room);cli('set','viewport','1720','1080');wait('window.__spreadsheetDemo?.sessions.every(p=>p.connected&&!p.blocked)');settled();
 nativeEdit(0,3,2,'Cancel original');cellClick(0,3,2);cli('press','Enter');wait('!!__spreadsheetDemo.views[0].table.editorManager.editingEditor');cli('press','Home');cli('press','Shift+End');cli('keyboard','type','Uncommitted draft');ev('__spreadsheetDemo.actions.structure(1,"row","move",3,1,5)');settled();check('remote move retains active native draft',()=>assert.equal(ev('__spreadsheetDemo.views[0].table.editorManager.editingEditor.getValue()'),'Uncommitted draft'));cli('press','Escape');cli('screenshot',resolve(out,'cancel-frame.png'));wait('!__spreadsheetDemo.views[0].table.editorManager.editingEditor&&__spreadsheetDemo.views[0].table.getSelectedCellRanges()[0]?.start.row===6');
 check('Escape restores native border to moved stable ID',()=>assert.deepEqual(ev('__spreadsheetDemo.views[0].table.getSelectedCellRanges().map(({start,end})=>({start,end}))'),[{start:{row:6,col:3},end:{row:6,col:3}}]));check('Escape inspector address matches moved stable ID',()=>assert.equal(ev(`document.querySelector('[data-peer="0"] .address').textContent`),'C6'));check('Escape discards draft without changing moved cell',()=>assert.equal(cell(1,5,2).value,'Cancel original'));report.final=snap();report.pageErrors=cli('errors');check('no browser page errors',()=>assert.deepEqual(report.pageErrors?.errors??[],[]));report.console=cli('console');check('no browser console errors',()=>assert.deepEqual((report.console?.messages??[]).filter(l=>l.type==='error'||l.level==='error'),[]));cli('screenshot',resolve(out,'cancel-desktop.png'));report.status='PASS';
}catch(error){report.status='FAIL';report.firstFailure=error.stack;process.exitCode=1;console.error(error.stack);try{cli('screenshot',resolve(out,'failure.png'));}catch{}}
finally{report.finished=new Date().toISOString();report.events=events;report.sources={};for(const path of ['apps/demo/spreadsheet/main.ts','apps/demo/spreadsheet/check-stable-cancel-browser.mjs',resolve(process.env.SPREADSHEET_OUTPUT_DIR,'main.js')])report.sources[path]=createHash('sha256').update(readFileSync(path)).digest('hex');writeFileSync(resolve(out,'functional.json'),JSON.stringify(report,null,2));try{cli('close');}catch{}}
