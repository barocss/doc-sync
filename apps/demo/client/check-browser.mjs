// Trusted Google Chrome proof for the unified Client demo. Each run owns its session.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const option = name => {const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]};
const url=option('--url');
if(!url) throw Error('Usage: node apps/demo/client/check-browser.mjs --url http://127.0.0.1:PORT --output output/unified-client-delivery/chrome-RUN');
const api=option('--api')??'unified';
const output=resolve(option('--output')??`output/unified-client-delivery/chrome-${Date.now()}`);
await mkdir(output,{recursive:true});
const session=`unified-client-${process.pid}-${Date.now().toString(36)}`;
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const receipt={result:'RUNNING',session,url,chrome,startedAt:new Date().toISOString(),commands:[],modes:[],osIME:'NOT_RUN',physicalDisplayLatency:'NOT_RUN',performance:'NOT_RUN',filters:{api,mode:option('--mode')??'both',skipBindings:process.argv.includes('--skip-bindings'),skipHistory:process.argv.includes('--skip-history')},scope:'Trusted native editor input in Google Chrome. Sync uses queued in-page transport; no HTTP document server claim.'};
const save=()=>writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
const run=(...args)=>{const e={args,at:new Date().toISOString()};receipt.commands.push(e);try{const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--executable-path',chrome,'--json',...args],{encoding:'utf8',timeout:45000,maxBuffer:15000000}));e.success=r.success;if(!r.success)throw Error(JSON.stringify(r));return r.data}catch(error){e.error=String(error);throw error}};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const poll=async(code,label)=>{const until=Date.now()+15000;while(Date.now()<until){const r=evaluate(code);if(r)return r;await new Promise(r=>setTimeout(r,80))}throw Error(`Timed out: ${label}`)};
const snap=()=>evaluate('__clientDemo.snapshot()');
const settle=async()=>{const state=await poll(`(()=>{const s=__clientDemo.snapshot();return s.ready&&!s.busy&&s.peers.every(p=>JSON.stringify(p.model)===JSON.stringify(p.native)&&p.text===p.nativeText&&(!p.online||p.pending===0))?s:false})()`,'native model equality and ACK');healthy(state);return state};
const peer=(s,n)=>{const p=s.peers.find(p=>p.name===n);assert.ok(p,`Missing ${n}`);return p};
const names=['ProseMirror','Slate','Lexical','Tiptap'];
const selector=n=>`[data-editor="${n}"] [aria-label="${n}"]`;
const healthy=s=>{assert.deepEqual(s.errors,[]);for(const p of s.peers)assert.deepEqual(p.notifications??[],[],`${p.name} notifications`)};
const converged=s=>{healthy(s);for(const p of s.peers)assert.deepEqual(p.model,s.peers[0].model,`${p.name} diverged`)};
function button(name,label){
 const token=`b${receipt.commands.length}`;
 evaluate(`(()=>{document.querySelectorAll('[data-client-proof-button]').forEach(b=>b.removeAttribute('data-client-proof-button'));const p=${name?`document.querySelector('[data-editor="${name}"]')`:'document'};const b=${name?`[...p.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`:`document.querySelector('#reset')`};if(!b)throw Error('Missing toolbar');b.dataset.clientProofButton=${JSON.stringify(token)};b.scrollIntoView({block:'center'});})()`);
 run('click',`[data-client-proof-button="${token}"]`);
 const click=evaluate('__clientProof.clicks.at(-1)');
 assert.equal(click?.trusted,true,'Missing trusted toolbar click');assert.equal(click?.pane,name??null,'Wrong toolbar pane');assert.equal(click?.label,label,'Wrong toolbar label');
}
const start=name=>{evaluate(`document.querySelector(${JSON.stringify(selector(name))}).scrollIntoView({block:'center'})`);run('click',selector(name));for(let i=0;i<5;i++)run('press','ArrowUp');run('press','Home')};
const domSelection=name=>evaluate(`(()=>{const s=getSelection(),e=document.querySelector(${JSON.stringify(selector(name))});const at=(n,o)=>{if(!n||!e.contains(n))return null;const r=document.createRange();r.selectNodeContents(e);r.setEnd(n,o);return r.toString().length};return {text:s.toString(),anchor:at(s.anchorNode,s.anchorOffset),focus:at(s.focusNode,s.focusOffset)}})()`);
const probe=()=>evaluate(`(()=>{
 window.__clientProof={events:[],clicks:[],networkAttempts:[],errors:[]};
 for(const type of ['beforeinput','input','keydown'])document.addEventListener(type,e=>__clientProof.events.push({type,inputType:e.inputType??null,key:e.key??null,data:e.data??null,trusted:e.isTrusted,pane:e.target.closest?.('[data-editor]')?.dataset.editor??null}),true);
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(b)__clientProof.clicks.push({trusted:e.isTrusted,pane:b.closest('[data-editor]')?.dataset.editor??null,label:b.textContent.trim()})},true);
 window.addEventListener('error',e=>__clientProof.errors.push(String(e.error??e.message)));window.addEventListener('unhandledrejection',e=>__clientProof.errors.push(String(e.reason)));
 const blocked=(kind,url)=>{__clientProof.networkAttempts.push({kind,url:String(url)});throw Error('Network disabled: '+kind)};
 window.fetch=(...a)=>{try{blocked('fetch',a[0])}catch(e){return Promise.reject(e)}};XMLHttpRequest.prototype.open=function(...a){blocked('xhr',a[1])};for(const kind of ['WebSocket','EventSource'])window[kind]=function(...a){blocked(kind,a[0])};navigator.sendBeacon=(...a)=>blocked('beacon',a[0]);return true;
})()`);
let failure;
try{
 receipt.servedArtifacts={};
 for(const filename of ['bundle.js','metafile.json','bundle-proof.json']){const r=await fetch(new URL(filename,url));assert.ok(r.ok,`Missing ${filename}`);const bytes=Buffer.from(await r.arrayBuffer());await writeFile(resolve(output,filename),bytes);receipt.servedArtifacts[filename]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}}
 for(const mode of (option('--mode')?[option('--mode')]:['local','sync'])){
  const m={mode,result:'RUNNING',cases:[]};receipt.modes.push(m);const target=new URL(url);target.searchParams.set('mode',mode);target.searchParams.set('api',api);
  run('set','offline','off');run('open',target.href);run('wait','--fn','!!window.__clientDemo?.ready&&!window.__clientDemo?.busy');
  m.initial=await settle();healthy(m.initial);converged(m.initial);assert.deepEqual(m.initial.peers.map(p=>p.name),names);assert.equal(m.initial.mode,mode);assert.equal(m.initial.api,api);assert.equal(m.initial.size,'sample');assert.equal(m.initial.peers[0].model.children.length,2);assert.match(JSON.stringify(m.initial.peers[0].model),/bold/);assert.equal(m.initial.clientCount,mode==='local'?1:4);assert.equal(new Set(m.initial.peers.map(p=>p.actor)).size,mode==='local'?1:4);
  m.browser=evaluate('({userAgent:navigator.userAgent,platform:navigator.platform})');assert.match(m.browser.userAgent,/Chrome\/156\./);
  if(mode==='local')for(const p of m.initial.peers){assert.equal(p.syncNull,true);assert.equal(p.mode,'local');assert.equal(p.localBackendIsLocal,true);assert.deepEqual(p.backendFields.filter(k=>['seq','serverSeq','outbox','transport','ackTimer','others'].includes(k)),[])}
  m.initialRequests=run('network','requests');probe();run('set','offline','on');m.networkDisabledAfterAssets=true;
  for(const name of (process.argv.includes('--skip-bindings')?[]:names)){
   const c={name,result:'RUNNING'};m.cases.push(c);button(null,'Reset document');const initial=await settle();const base=peer(initial,name).text;
   start(name);run('keyboard','inserttext','A😀한글');const typed=await settle();converged(typed);assert.equal(peer(typed,name).text,'A😀한글'+base);c.typed=peer(typed,name);
   button(name,'Undo');assert.equal(peer(await settle(),name).text,base);button(name,'Redo');assert.equal(peer(await settle(),name).text,'A😀한글'+base);c.toolbarHistory='PASS';
   start(name);run('press','Meta+z');assert.equal(peer(await settle(),name).text,base);run('press','Meta+Shift+z');assert.equal(peer(await settle(),name).text,'A😀한글'+base);c.keyboardHistory='PASS';
   start(name);run('press','Shift+ArrowRight');c.forward=peer(await settle(),name).selection;assert.ok(c.forward.anchor.at(-1)<c.forward.focus.at(-1));run('press','ArrowRight');run('press','Shift+ArrowLeft');c.backward=peer(await settle(),name).selection;assert.ok(c.backward.anchor.at(-1)>c.backward.focus.at(-1));run('press','ArrowLeft');c.caret=peer(await settle(),name).selection;assert.deepEqual(c.caret.anchor,c.caret.focus);
   start(name);run('press','Delete');assert.equal(peer(await settle(),name).text,'😀한글'+base);button(name,'Undo');assert.equal(peer(await settle(),name).text,'A😀한글'+base);c.delete='PASS';
   c.externalRanges=[];
   for(const direction of ['forward','backward','caret']){
    start(name);run('press','ArrowRight');run('press','Shift+ArrowRight');if(direction==='backward'){run('press','ArrowRight');run('press','Shift+ArrowLeft')}if(direction==='caret')run('press','ArrowLeft');
    const before=peer(await settle(),name),domBefore=domSelection(name);if(direction!=='caret')assert.ok(domBefore.text.length);
    button(name,'Insert prefix');const after=await settle(),p=peer(after,name),domAfter=domSelection(name);converged(after);assert.equal(p.text,'x'+before.text);for(const edge of ['anchor','focus']){assert.deepEqual(p.selection[edge],[...before.selection[edge].slice(0,-1),before.selection[edge].at(-1)+1]);assert.equal(domAfter[edge],domBefore[edge]+1)}assert.equal(domAfter.text,domBefore.text);c.externalRanges.push({direction,before:before.selection,after:p.selection,domBefore,domAfter});
   }
   const beforeRemount=await settle();button(name,'Remount');const afterRemount=await settle();assert.deepEqual(peer(afterRemount,name).model,peer(beforeRemount,name).model);assert.deepEqual(peer(afterRemount,name).history,peer(beforeRemount,name).history);c.remount='PASS';
   button(null,'Reset document');const reset=await settle();converged(reset);assert.equal(peer(reset,name).text,base);assert.deepEqual(peer(reset,name).history,peer(m.initial,name).history);c.reset='PASS';
   c.events=evaluate(`__clientProof.events.filter(e=>e.pane===${JSON.stringify(name)})`);assert.ok(c.events.some(e=>e.trusted&&e.type==='beforeinput'&&e.inputType==='insertText'));assert.ok(c.events.some(e=>e.trusted&&e.key==='Delete'));assert.ok(c.events.some(e=>e.trusted&&e.key?.toLowerCase()==='z'));c.result='PASS';await save();
  }
  if(!process.argv.includes('--skip-history')){
  button(null,'Reset document');await settle();start('ProseMirror');m.historySelectionA=await settle();run('keyboard','inserttext','actorA ');m.historyActorA=await settle();start('Slate');m.historySelectionB=await settle();run('keyboard','inserttext','actorB ');m.historyActorB=await settle();button('ProseMirror','Undo');const histories=await settle();converged(histories);assert.ok(histories.peers[0].text.startsWith(mode==='local'?'actorA ':'actorB '));assert.ok(!histories.peers[0].text.includes(mode==='local'?'actorB ':'actorA '));m.historyOwnership={result:'PASS',state:histories};
  }
  if(mode==='sync'){
   button(null,'Reset document');const base=(await settle()).peers[0].text;button('ProseMirror','Disconnect / Reconnect');let disconnected=await settle();assert.equal(peer(disconnected,'ProseMirror').online,false);start('ProseMirror');run('keyboard','inserttext','offline ');const offline=await settle();assert.ok(peer(offline,'ProseMirror').pending>0);start('Slate');run('keyboard','inserttext','foreign ');await settle();button('ProseMirror','Disconnect / Reconnect');const reconnected=await settle();converged(reconnected);for(const p of reconnected.peers){assert.equal(p.pending,0);assert.equal(p.online,true);assert.equal(p.synchronized,true);assert.equal(p.text.split('offline ').length,2);assert.equal(p.text.split('foreign ').length,2);assert.ok(p.text.endsWith(base))}m.offlineReconnect={result:'PASS',offline,reconnected};
  }
  m.final=await settle();healthy(m.final);if(mode==='local')assert.deepEqual(m.final.counters,{hubs:0,subscriptions:0,sends:0,presence:0});else for(const key of ['hubs','subscriptions','sends'])assert.ok(m.final.counters[key]>0);
  m.probe=evaluate('__clientProof');assert.deepEqual(m.probe.networkAttempts,[]);assert.deepEqual(m.probe.errors,[]);m.requestsAfterEdits=run('network','requests');m.resources=evaluate('performance.getEntriesByType("resource").map(r=>({name:r.name,initiatorType:r.initiatorType}))');assert.ok(m.resources.every(r=>new URL(r.name).origin===new URL(url).origin));assert.ok(m.resources.every(r=>!['fetch','xmlhttprequest','beacon'].includes(r.initiatorType)));m.pageErrors=run('errors');m.console=run('console');assert.deepEqual(m.pageErrors.errors??[],[]);assert.deepEqual((m.console.messages??m.console.logs??[]).filter(e=>['error','warn','warning'].includes(e.type??e.level)),[]);run('screenshot',resolve(output,`${mode}-desktop.png`));
  run('set','viewport','390','844');run('screenshot',resolve(output,`${mode}-mobile.png`));m.mobile={horizontalOverflow:evaluate('document.documentElement.scrollWidth>innerWidth'),scope:'Screenshot and horizontal overflow smoke only'};assert.equal(m.mobile.horizontalOverflow,false);run('set','viewport','1280','900');
  run('set','offline','off');run('reload');run('wait','--fn','!!window.__clientDemo?.ready');m.refreshed=await settle();for(const p of m.refreshed.peers){assert.deepEqual(p.model,peer(m.initial,p.name).model);assert.deepEqual(p.history,peer(m.initial,p.name).history)}m.refresh='PASS';m.result='PASS';await save();
 }
 receipt.console=run('console');receipt.pageErrors=run('errors');assert.deepEqual(receipt.pageErrors.errors??[],[]);receipt.consoleErrors=(receipt.console.messages??receipt.console.logs??[]).filter(e=>['error','warn','warning'].includes(e.type??e.level));assert.deepEqual(receipt.consoleErrors,[]);receipt.result='PASS';
}catch(error){failure=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);for(const m of receipt.modes)if(m.result==='RUNNING'){m.result='FAIL';const c=m.cases.find(c=>c.result==='RUNNING');if(c)c.result='FAIL'}try{receipt.failureState=snap();receipt.failureProbe=evaluate('window.__clientProof');receipt.console=run('console');receipt.pageErrors=run('errors');run('screenshot',resolve(output,'first-failure.png'))}catch(e){receipt.captureError=String(e)}}finally{try{run('close');receipt.cleanup='PASS'}catch(e){receipt.cleanup=String(e);receipt.result='FAIL';failure??=e}receipt.finishedAt=new Date().toISOString();await save()}
console.log(JSON.stringify({result:receipt.result,output,firstFailure:receipt.firstFailure??null}));if(failure)throw failure;
