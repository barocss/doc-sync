import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const base=process.env.SPREADSHEET_URL??'http://127.0.0.1:5422';
const out=resolve(process.env.SPREADSHEET_PROOF_DIR??'output/spreadsheet-browser-proof/final');mkdirSync(out,{recursive:true});
const session='spreadsheet-proof-'+process.pid,room='proof-'+randomUUID();
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
const report={started:new Date().toISOString(),base,room,session,checks,scope:'Trusted native VTable pointer/keyboard edits, inspector input edits, toolbar controls and HTTP/SSE proof. Application actions are used only for labeled concurrency setup, remote updates during drafts and exact numeric/null values. Render/style observations do not measure GPU completion or physical paint.'};
try{
 const served=await fetch(base+'/main.js',{headers:{connection:'close'}});assert.equal(served.status,200);report.servedBundleSHA256=createHash('sha256').update(new Uint8Array(await served.arrayBuffer())).digest('hex');check('served bundle matches current build',()=>assert.equal(report.servedBundleSHA256,createHash('sha256').update(readFileSync('output/spreadsheet-demo/main.js')).digest('hex')));
 cli('open',`${base}/?room=${room}`);cli('set','viewport','1720','1080');wait('window.__spreadsheetDemo?.sessions.every(p=>p.connected&&!p.blocked)');settled();report.initial=snap();
 check('two independent CRDT actors and live sessions',()=>{assert.notEqual(report.initial[0].actor,report.initial[1].actor);assert.equal(ev('__spreadsheetDemo.sessions[0]!==__spreadsheetDemo.sessions[1]&&__spreadsheetDemo.sessions[0].sheet!==__spreadsheetDemo.sessions[1].sheet'),true);assert(report.initial.every(p=>p.connected&&p.stats.retainedOps===0));});
 nativeEdit(0,0,0,'Trusted native A1');
 check('trusted VTable editor commits through CRDT to peer and both grid projections',()=>{for(let i=0;i<2;i++){assert.equal(cell(i,0,0).value,'Trusted native A1');assert.equal(ev(`__spreadsheetDemo.views[${i}].table.getCellValue(1,1)`),'Trusted native A1');}});
 // Instrument only the active application update path. Explicit debug/oracle reads
 // run after restoration and remain outside this assertion's scope.
 report.activeRefreshRangeReads=ev(`(async()=>{const api=__spreadsheetDemo;const originals=api.sessions.map(s=>s.sheet.getRange);let calls=0;api.sessions.forEach(s=>{const original=s.sheet.getRange;s.sheet.getRange=function(...args){calls++;return original.apply(this,args);};});try{api.actions.edit(0,0,0,{value:"Trusted native A1"});const started=performance.now();while(api.sessions[0].sheet.stats().pending||api.sessions[1].sheet.stats().retainedOps!==api.sessions[0].sheet.stats().retainedOps){if(performance.now()-started>10000)throw Error("Range-read probe convergence timeout");await new Promise(r=>setTimeout(r,5));}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return calls;}finally{api.sessions.forEach((s,i)=>{s.sheet.getRange=originals[i];});}})()`);
 check('active edit and remote refresh perform zero whole-sheet range reads',()=>assert.equal(report.activeRefreshRangeReads,0));
 // Draft isolation: precise numeric setup and peer changes use application actions.
 ev('__spreadsheetDemo.actions.edit(0,1,1,{value:42,formula:"=6*7",fill:"#ffffff",bold:false})');settled();cellClick(0,1,1);fill(0,'[name="formula"]','local draft formula');
 ev('__spreadsheetDemo.actions.edit(1,1,1,{fill:"#ff0000",bold:true})');settled();
 check('remote update preserves focused inspector draft',()=>assert.equal(ev(`document.querySelector('[data-peer="0"] [name=formula]').value`),'local draft formula'));
 click(0,'button[type="submit"]');settled();
 check('inspector dirty-only apply preserves remote fields and numeric value type',()=>{for(let i=0;i<2;i++){assert.deepEqual(cell(i,1,1),{value:42,formula:'local draft formula',fill:'#ff0000',bold:true});assert.equal(ev(`__spreadsheetDemo.views[${i}].table.scenegraph.getCell(2,2).attribute.fill`),'#ff0000');}});
 // Active native editor must keep its text when a remote operation arrives.
 cellClick(0,2,0);cli('press','Enter');cli('keyboard','type','kept native draft');ev('__spreadsheetDemo.actions.edit(1,2,0,{value:"peer during native edit"})');wait('__spreadsheetDemo.sessions[0].sheet.getCell(2,0).value==="peer during native edit"');
 check('remote update preserves active native draft',()=>assert.equal(ev('__spreadsheetDemo.views[0].table.editorManager.editingEditor.getValue()'),'kept native draft'));cli('press','Enter');settled();check('preserved native draft commits and converges',()=>assert.equal(cell(1,2,0).value,'kept native draft'));
 click(0,'[data-action="hold"]');click(1,'[data-action="hold"]');
 ev('__spreadsheetDemo.actions.edit(0,8,2,{value:"concurrent-A",fill:"#d5e8ff"});__spreadsheetDemo.actions.edit(1,8,2,{value:"concurrent-B",bold:true})');
 wait('__spreadsheetDemo.sessions.every(s=>s.sheet.stats().pending===0)');const concurrentTickets=ev('__spreadsheetDemo.sessions.map(s=>s.sheet.captureState().checkpoint.retainedOps.filter(op=>op.row===8&&op.column===2&&op.field==="value").at(-1))');
 const winner=[...concurrentTickets].sort((a,b)=>a.at.lamport-b.at.lamport||(a.at.actor<b.at.actor?-1:a.at.actor>b.at.actor?1:0)).at(-1).value;
 click(0,'[data-action="hold"]');click(1,'[data-action="hold"]');settled();
 check('held-inbound same-empty-cell conflict resolves by ticket; independent fields merge',()=>{for(let i=0;i<2;i++)assert.deepEqual(cell(i,8,2),{value:winner,fill:'#d5e8ff',bold:true});});
 // Controlled history setup; undo/redo uses actual toolbar clicks.
 ev('__spreadsheetDemo.actions.edit(0,10,0,{value:"first"});__spreadsheetDemo.actions.edit(0,10,0,{value:"second"})');settled();click(0,'[data-action="undo"]');settled();assert.equal(cell(1,10,0).value,'first');click(0,'[data-action="undo"]');settled();assert.equal(cell(1,10,0).value,undefined);click(0,'[data-action="redo"]');settled();assert.equal(cell(1,10,0).value,'first');click(0,'[data-action="redo"]');settled();
 check('own two-step undo and redo restore exact fields',()=>assert.equal(cell(1,10,0).value,'second'));
 ev('__spreadsheetDemo.actions.edit(1,10,0,{value:"second"})');settled();const beforeFence=ev('__spreadsheetDemo.sessions[0].sheet.stats().retainedOps');click(0,'[data-action="undo"]');settled();
 check('observed peer same-value ticket fences undo',()=>{assert.equal(cell(0,10,0).value,'second');assert.equal(ev('__spreadsheetDemo.sessions[0].sheet.stats().retainedOps'),beforeFence);});
 // Native Shift selection and actual VTable style/scenegraph observations.
 cellClick(0,3,1);cli('press','Shift+ArrowDown');cli('press','Shift+ArrowDown');cli('press','Shift+ArrowRight');cli('press','Shift+ArrowRight');wait('__spreadsheetDemo.sessions[1].peers.some(p=>p.actor===__spreadsheetDemo.sessions[0].actor&&Math.abs(p.range.endRow-p.range.row)===2&&Math.abs(p.range.endColumn-p.range.column)===2)');
 report.selection=ev('(()=>{const api=__spreadsheetDemo,p=api.sessions[1].peers.find(p=>p.actor===api.sessions[0].actor);const t=api.views[1].table;return{presence:p,gridStyle:t.getCellStyle(2,4),sceneFill:t.scenegraph.getCell(2,4).attribute.fill}})()');
 check('native rectangular selection reaches remote presence and grid shading',()=>{assert.equal(report.selection.presence.range.row,3);assert.equal(report.selection.presence.range.column,1);assert.equal(report.selection.gridStyle.bgColor,'#eaf2ff');assert.equal(report.selection.sceneFill,'#eaf2ff');});
 cli('screenshot',resolve(out,'rectangular-presence.png'));
 jump(0,'XFD1048576');jump(1,'XFD1048576');nativeEdit(0,1048575,16383,'far native');
 check('UI jump and native far-cell edit retain exact fixed coordinates in bounded window',()=>{const s=snap();assert(s.every(p=>p.viewport.row===1048575&&p.viewport.column===16383&&p.viewport.rows===1&&p.viewport.columns===1));assert.equal(cell(1,1048575,16383).value,'far native');assert.equal(ev('__spreadsheetDemo.views[1].table.getCellValue(1,1)'),'far native');});
 ev('__spreadsheetDemo.actions.edit(0,1048575,16383,{value:null})');settled();check('cleared far-cell field disappears from model and grid',()=>{assert.deepEqual(cell(1,1048575,16383),{});assert.equal(ev('__spreadsheetDemo.views[1].table.getCellValue(1,1)'),'');});
 jump(0,'A1');jump(1,'A1');cellClick(0,0,0);click(0,'[data-action="connection"]');fill(0,'[name="value"]','offline A1');click(0,'button[type="submit"]');ev('__spreadsheetDemo.actions.edit(1,0,0,{bold:true})');wait('__spreadsheetDemo.sessions[1].sheet.stats().pending===0');check('offline inspector edit stays pending in its independent actor',()=>{const s=snap();assert.equal(s[0].connected,false);assert(s[0].pending>0);assert.equal(s[0].cells.find(c=>c.row===0&&c.column===0).cell.value,'offline A1');});click(0,'[data-action="connection"]');settled();check('reconnect preserves offline edit and live peer field',()=>{for(let i=0;i<2;i++)assert.deepEqual(cell(i,0,0),{value:'offline A1',bold:true});});
 report.server=await oracle();check('independent Node HTTP oracle equals both sparse models',()=>assert(report.server.serverSeq>0));
 report.network=cli('network','requests');check('distinct actors submit HTTP changes and receive independent SSE streams',()=>{const requests=report.network.requests;for(const peer of report.initial){assert(requests.some(r=>r.method==='POST'&&r.url.endsWith('/changes')&&r.status===200&&JSON.parse(r.postData).actor===peer.actor));assert(requests.some(r=>r.resourceType==='EventSource'&&r.status===200&&new URL(r.url).searchParams.get('actor')===peer.actor));}assert.equal(requests.some(r=>r.url.endsWith('/state')),false);});report.console=cli('console');report.pageErrors=cli('errors');
 const errors=report.pageErrors?.errors??report.pageErrors??[];check('no browser page errors',()=>assert.deepEqual(errors,[]));
 const logs=report.console?.messages??report.console??[];check('no browser console errors',()=>assert.deepEqual(Array.isArray(logs)?logs.filter(log=>log.type==='error'||log.level==='error'):logs,[]));
 cli('screenshot',resolve(out,'desktop.png'));cli('set','viewport','390','844');wait('innerWidth===390');check('mobile 390px has no horizontal overflow',()=>assert.equal(ev('document.documentElement.scrollWidth>innerWidth'),false));cli('screenshot',resolve(out,'mobile.png'));report.final=snap();report.status='PASS';
}catch(error){report.status='FAIL';report.firstFailure=error.stack;console.error(error.stack);process.exitCode=1;try{report.failure=snap();report.pageErrors=cli('errors');cli('screenshot',resolve(out,'failure.png'));}catch{}}
finally{report.finished=new Date().toISOString();report.events=events;report.sources={};for(const path of ['apps/demo/spreadsheet/main.ts','apps/demo/spreadsheet/session.ts','apps/demo/spreadsheet/server.mjs','apps/demo/spreadsheet/inspector.ts','apps/demo/spreadsheet/style.css','apps/demo/spreadsheet/check-browser.mjs','output/spreadsheet-demo/main.js','output/spreadsheet-demo/metafile.json','output/spreadsheet-demo/build-proof.json'])try{report.sources[path]=createHash('sha256').update(readFileSync(path)).digest('hex');}catch{}writeFileSync(resolve(out,'functional.json'),JSON.stringify(report,null,2));try{cli('close');}catch{}}
