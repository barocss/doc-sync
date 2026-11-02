// Paired current-code legacy/unified control. Run only after functional checks pass.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const option=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1]};
const url=option('--url');if(!url)throw Error('Usage: node apps/demo/client/check-performance.mjs --url URL --output OUTPUT');
const output=resolve(option('--output')??`output/unified-client-delivery/chrome-performance-${Date.now()}`);await mkdir(output,{recursive:true});
const session=`unified-performance-${process.pid}-${Date.now().toString(36)}`,chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const receipt={result:'RUNNING',session,url,chrome,startedAt:new Date().toISOString(),warmups:2,samples:8,budget:{domMedian:{relative:.10,absoluteMs:1},domP95:{relative:.15,absoluteMs:2},rule:'INVESTIGATE when candidate DOM latency exceeds baseline by max(relative, absolute) in any mode/size/source/target cell. RAF2 median and p95 are raw rendering-opportunity observations and have no strict performance gate.'},observations:[],commands:[],selectionSetup:'Outside timing: trusted first-block click, then __clientDemo.select([0,0]) with logical and native DOM caret assertions. Full functional proof separately uses native keyboard selection.',physicalDisplayLatency:'NOT_RUN',osIME:'NOT_RUN',scope:'Current-code legacy versus unified Client, native trusted beforeinput to DOM equality and two requestAnimationFrame callbacks. These callbacks indicate a rendering opportunity; they do not measure physical display.'};
const save=()=>writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
const run=(...args)=>{const entry={args,at:new Date().toISOString()};receipt.commands.push(entry);const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--executable-path',chrome,'--json',...args],{encoding:'utf8',timeout:120000,maxBuffer:15000000}));assert.equal(r.success,true,JSON.stringify(r));return r.data};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const poll=async(code,label)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){const value=evaluate(code);if(value)return value;await new Promise(r=>setTimeout(r,25))}throw Error(`Timed out: ${label}`)};
const settle=()=>poll(`(()=>{const s=__clientDemo.snapshot();return s.ready&&!s.busy&&s.peers.every(p=>p.text===p.nativeText&&JSON.stringify(p.model)===JSON.stringify(p.native)&&(!p.online||p.pending===0))?s:false})()`,'native models and ACK');
const names=['ProseMirror','Slate','Lexical','Tiptap'];let failure;
try{
 receipt.servedArtifacts={};for(const filename of ['bundle.js','metafile.json','bundle-proof.json']){const response=await fetch(new URL(filename,url));assert.ok(response.ok);const bytes=Buffer.from(await response.arrayBuffer());await writeFile(resolve(output,filename),bytes);receipt.servedArtifacts[filename]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}}
 let group=0;
 for(const mode of ['local','sync'])for(const size of [10000,100000]){
  const order=group++%2?['unified','legacy']:['legacy','unified'];
  for(const api of order){
   const target=new URL(url);target.searchParams.set('mode',mode);target.searchParams.set('size',String(size));target.searchParams.set('api',api);
   run('set','offline','off');run('open',target.href);run('wait','--fn','!!window.__clientDemo?.ready&&!window.__clientDemo?.busy');const initial=await settle();assert.equal(initial.payloadCharacters,size);assert.equal(initial.api,api);assert.equal(initial.mode,mode);assert.deepEqual(initial.errors,[]);receipt.browser=evaluate('navigator.userAgent');assert.match(receipt.browser,/Chrome\/156\./);receipt.routes??=[];receipt.routes.push({mode,size,api,nativeFirstBlocks:evaluate(`[...document.querySelectorAll('[data-editor]')].map(p=>({name:p.dataset.editor,root:p.querySelector('[contenteditable="true"]')?.tagName,first:p.querySelector('[contenteditable="true"]')?.firstElementChild?.tagName}))`)});run('set','offline','on');
   for(const source of names)for(let index=-2;index<8;index++){
    const baseline=await settle(),text=baseline.peers[0].text;const selector=`[data-editor="${source}"] [contenteditable="true"] > :first-child`;
    evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);run('click',selector);evaluate(`__clientDemo.select(${JSON.stringify(source)},{anchor:[0,0],focus:[0,0]})`);const positioned=evaluate('__clientDemo.snapshot()').peers.find(p=>p.name===source).selection;assert.deepEqual(positioned.anchor,[0,0]);assert.deepEqual(positioned.focus,[0,0]);const domCaret=evaluate(`(()=>{const e=document.querySelector('[data-editor="${source}"] [contenteditable="true"]'),s=getSelection();const at=(n,o)=>{if(!e.contains(n))return null;const r=document.createRange();r.selectNodeContents(e);r.setEnd(n,o);return r.toString().length};return {anchor:at(s.anchorNode,s.anchorOffset),focus:at(s.focusNode,s.focusOffset)}})()`);assert.deepEqual(domCaret,{anchor:0,focus:0});
    evaluate(`__clientDemo.measure(${JSON.stringify(source)},${JSON.stringify('x'+text)})`);
    run('keyboard','inserttext','x');
    // Do not call snapshot/model conversion in the timing interval.
    const measurement=await poll(`__clientDemo.measurement?.status==='complete'?__clientDemo.measurement:false`,'DOM equality and two animation frames');
    assert.equal(measurement.inputType,'insertText');assert.equal(measurement.source,source);
    const observation={mode,size,api,source,index,warmup:index<0,measurement,peers:measurement.peers.map(p=>({name:p.name,inputToDOM:p.peerDomAt-measurement.inputAt,inputToRaf2:p.raf2-measurement.inputAt}))};receipt.observations.push(observation);
    for(const p of observation.peers){assert.ok(p.inputToDOM>=0);assert.ok(p.inputToRaf2>=p.inputToDOM)}
    const after=await settle();for(const p of after.peers){assert.equal(p.text,'x'+text);assert.deepEqual(p.notifications,[])}assert.deepEqual(after.errors,[]);
    run('press','Meta+z');const restored=await settle();for(const p of restored.peers)assert.equal(p.text,text);await save();
   }
  }
 }
 const quantile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(q*sorted.length)-1]};
 receipt.summary=[];
 for(const mode of ['local','sync'])for(const size of [10000,100000])for(const api of ['legacy','unified'])for(const source of names)for(const target of names){const values=receipt.observations.filter(o=>!o.warmup&&o.mode===mode&&o.size===size&&o.api===api&&o.source===source).map(o=>o.peers.find(p=>p.name===target));assert.equal(values.length,8);receipt.summary.push({mode,size,api,source,target,n:8,domMedian:quantile(values.map(p=>p.inputToDOM),0.5),domP95:quantile(values.map(p=>p.inputToDOM),0.95),raf2Median:quantile(values.map(p=>p.inputToRaf2),0.5),raf2P95:quantile(values.map(p=>p.inputToRaf2),0.95)})}
 receipt.console=run('console');receipt.pageErrors=run('errors');assert.deepEqual(receipt.pageErrors.errors??[],[]);assert.deepEqual((receipt.console.messages??receipt.console.logs??[]).filter(e=>['error','warn','warning'].includes(e.type??e.level)),[]);receipt.comparisons=[];for(const mode of ['local','sync'])for(const size of [10000,100000])for(const source of names)for(const target of names){const select=api=>receipt.summary.find(r=>r.mode===mode&&r.size===size&&r.api===api&&r.source===source&&r.target===target),a=select('legacy'),b=select('unified'),medianBudget=Math.max(a.domMedian*.10,1),p95Budget=Math.max(a.domP95*.15,2);receipt.comparisons.push({mode,size,source,target,baselineDOMMedian:a.domMedian,candidateDOMMedian:b.domMedian,baselineDOMP95:a.domP95,candidateDOMP95:b.domP95,medianBudget,p95Budget,medianCrossing:b.domMedian-a.domMedian>medianBudget,p95Crossing:b.domP95-a.domP95>p95Budget,status:b.domMedian-a.domMedian>medianBudget||b.domP95-a.domP95>p95Budget?'INVESTIGATE':'PASS'})}receipt.result=receipt.comparisons.some(r=>r.status==='INVESTIGATE')?'INVESTIGATE':'PASS';
}catch(error){failure=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);try{receipt.failureState=evaluate('__clientDemo.snapshot()');receipt.pageErrors=run('errors');receipt.console=run('console');run('screenshot',resolve(output,'first-failure.png'))}catch(e){receipt.captureError=String(e)}}finally{try{run('close');receipt.cleanup='PASS'}catch(e){failure??=e;receipt.result='FAIL';receipt.cleanup=String(e)}receipt.finishedAt=new Date().toISOString();await save()}
console.log(JSON.stringify({result:receipt.result,output,firstFailure:receipt.firstFailure??null}));if(failure)throw failure;if(receipt.result==='INVESTIGATE')process.exitCode=2;
