// Bounded local workload: 3 native browser editor peers and 15 scripted MCP participants.
import assert from 'node:assert/strict';
import {spawn, execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const run=promisify(execFile), root=resolve(import.meta.dirname,'..'), output=resolve(process.env.AI15_OUTPUT??'output/validation/ai-15-editors-20261028');
const cli=process.env.PLAYWRIGHT_CLI;
if(!cli)throw Error('Set PLAYWRIGHT_CLI to the Playwright CLI wrapper path');
await mkdir(output,{recursive:true});
const session=`ai15-${Date.now()}`, doc=`ai15-${Date.now().toString(36)}`, env=Object.fromEntries(Object.entries(process.env).filter(([,v])=>v!==undefined));
const agents=[], errors=[], calls=[], results={doc,session,start:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},groups:{Slate:[],Lexical:[],ProseMirror:[]}};
let child, control, browserStarted=false;
const log=async(name,text)=>writeFile(join(output,name),text);
const execCli=async(...args)=>{
 const result=await run(cli,[`-s=${session}`,...args],{cwd:root,env,maxBuffer:10*1024*1024,timeout:90000});
 if(result.stdout.includes('### Error'))throw Error(result.stdout);
 return result.stdout;
};
const parse=output=>{const m=/### Result\r?\n([^\n]+)/.exec(output);if(!m)throw Error(`No structured browser result: ${output.slice(0,1000)}`);return JSON.parse(m[1]);};
const script=async(name,source)=>{const path=join(output,`${name}.js`);await writeFile(path,source);return path;};
const call=async(agent,name,args={})=>agent.client.callTool({name,arguments:args});
const read=async agent=>{const r=await call(agent,'read_document');assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;};
const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;do{if(await fn())return;await new Promise(r=>setTimeout(r,50));}while(Date.now()<end);throw Error(`Timed out: ${label}`);};
const text=model=>(model.children[1].children[0].runs??[]).map(r=>r.text??'').join('');
const measure=async(agent,revision,token)=>{const at=performance.now();const r=await call(agent,'edit_document',{base:revision,edits:[{op:'insert',at:[1,0,0],content:token}]});const elapsed=performance.now()-at;const message=r.content?.[0]?.text??'';const outcome=r.isError?'rejected':r.structuredContent?.status;calls.push({actor:agent.actor,token,outcome,ms:elapsed,message:r.isError?message:undefined});return {outcome,message};};
const start=async()=>{
 child=spawn(process.execPath,['apps/demo/products/start.mjs'],{cwd:root,env:{...env,PRODUCT_PORT:'0',PRODUCT_BUNDLE:join(output,'bundle.js')},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>{out+=b});child.stderr.on('data',b=>{err+=b});
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`server timeout ${err}`)),30000);child.once('exit',c=>reject(Error(`server exit ${c}: ${err}`)));child.stdout.on('data',()=>{for(const line of out.split('\n')){try{let j=JSON.parse(line);if(j.url){clearTimeout(timer);resolve(j.url);return;}}catch{}}});});
 results.server=JSON.parse(out.trim().split('\n').find(x=>x.startsWith('{')));return base;
};
try{
 const base=await start();const open=await execCli('open',`${base}/?profile=word&doc=${doc}`,'--browser=chrome');browserStarted=true;await log('browser-open.log',open);
 const init=await script('browser-init',`async page=>{await page.waitForFunction(()=>window.products?.ready()&&window.products.status().every(p=>p.online&&!p.pending),null,{timeout:30000});const s=await page.evaluate(async()=>await window.products.snapshot());if(!s.equal)throw Error('Initial models differ');return {browser:page.context().browser().version(),target:await page.evaluate(()=>window.products.target),status:await page.evaluate(()=>window.products.status())};}`);
 results.browserInit=parse(await execCli('run-code','--filename',init));
 assert.deepEqual(results.browserInit.target.path,[1,0]);
 const mcp=join(root,'apps/mcp/src/main.ts'), schema=join(root,'apps/demo/products/word-schema.mjs');
 const launch=performance.now();
 await Promise.all(Object.keys(results.groups).flatMap((group,g)=>Array.from({length:5},async(_,i)=>{
  const actor=`editor${g}-agent${i}`,token=`{A${g}${i}}`,client=new Client({name:actor,version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[mcp],stderr:'pipe',env:{...env,DOC_SYNC_URL:`${base}/profiles/word`,DOC_SYNC_DOCUMENT:doc,DOC_SYNC_ACTOR:actor,DOC_SYNC_SCHEMA:schema,DOC_SYNC_JOURNAL:'off'}});
  const p={group,actor,token,client,transport};agents.push(p);results.groups[group].push(actor);transport.stderr?.on('data',b=>errors.push(`${actor}: ${b}`));await client.connect(transport);
 })));
 results.startupMs=performance.now()-launch;assert.equal(agents.length,15);
 const agentViews=await Promise.all(agents.map(read));const baseSeq=agentViews[0].revision.serverSeq;assert.ok(agentViews.every(v=>v.revision.serverSeq===baseSeq&&text(v.document)==='Opening text'));
 const pidList=agents.map(a=>a.transport.pid);assert.ok(pidList.every(Boolean));const ps=await run('ps',['-o','rss=','-p',pidList.join(',')]);const rss=ps.stdout.trim().split(/\s+/).map(Number);assert.equal(rss.length,15);results.agentMemory={sampling:'one ps sample after all clients connect, process RSS in KiB; shared pages may be counted multiple times',sumKiB:rss.reduce((a,b)=>a+b,0),minKiB:Math.min(...rss),maxKiB:Math.max(...rss),processes:rss.length};
 let triggered,release;const barrier=new Promise(r=>triggered=r);control=createServer((req,res)=>{if(req.url!=='/barrier'){res.writeHead(404);return res.end();}res.setHeader('access-control-allow-origin','*');release=()=>{res.writeHead(200);res.end('go')};triggered();});control.listen(0,'127.0.0.1');await once(control,'listening');
 const browserWave=await script('browser-wave',`async page=>{const first=page.locator('#Slate .editor p').filter({hasText:'Opening text'}).first();await first.click();await first.evaluate(n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t,last;while(t=w.nextNode())last=t;window.getSelection().setBaseAndExtent(last,last.length,last,last.length);document.dispatchEvent(new Event('selectionchange'))});await fetch('http://127.0.0.1:${control.address().port}/barrier');const start=Date.now(),inputs=[];const editorOpsStartedWallMs=Date.now();await page.evaluate(()=>{for(const [name,marker] of [['Slate','{E0}'],['Lexical','{E1}'],['ProseMirror','{E2}']])window.products.edit(name,[{op:'insert',at:[1,0,0],content:marker}]);});const editorOpsFinishedWallMs=Date.now();for(const [name,marker] of [['Slate','{U0}'],['Lexical','{U1}'],['ProseMirror','{U2}']]){{const p=page.locator('#'+name+' .editor p').filter({hasText:'Opening text'}).first();await p.click();await p.evaluate(n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t,last;while(t=w.nextNode())last=t;window.getSelection().setBaseAndExtent(last,last.length,last,last.length);document.dispatchEvent(new Event('selectionchange'))})}const at=Date.now();await page.keyboard.insertText(marker);inputs.push({name,marker,startedWallMs:at,finishedWallMs:Date.now(),inputMs:Date.now()-at})}return {inputs,editorOpsStartedWallMs,editorOpsFinishedWallMs,startedWallMs:start,finishedWallMs:Date.now(),elapsedMs:Date.now()-start};}`);
 const browserPromise=execCli('run-code','--filename',browserWave).then(output=>({output}),error=>({error}));await barrier;const waveStart=performance.now();results.waveStartedWallMs=Date.now();const wavePromise=Promise.all(agents.map((a,i)=>measure(a,agentViews[i].revision,a.token)));release();const wave=await wavePromise;results.waveFinishedWallMs=Date.now();results.firstWaveMs=performance.now()-waveStart;const browserResult=await browserPromise;if(browserResult.error)throw browserResult.error;results.userInputs=parse(browserResult.output);results.firstWave={confirmed:wave.filter(x=>x.outcome==='confirmed').length,rejected:wave.filter(x=>x.outcome==='rejected').length,other:wave.filter(x=>!['confirmed','rejected'].includes(x.outcome))};
 assert.equal(results.firstWave.other.length,0,JSON.stringify(results.firstWave));assert.equal(results.firstWave.confirmed+results.firstWave.rejected,15);
 // Resolve only definite stale rejections, after rereading the actual latest revision.
 for(let i=0;i<agents.length;i++)if(wave[i].outcome==='rejected'){
  let done=false;for(let n=0;n<15&&!done;n++){
   assert.match(wave[i].message,/changed|stale|revision|base/i,`Unexpected rejection: ${wave[i].message}`);
   const v=await read(agents[i]);const retry=await measure(agents[i],v.revision,agents[i].token);
   if(retry.outcome==='confirmed')done=true;else if(retry.outcome==='rejected')wave[i]=retry;else throw Error(`Unconfirmed edit: ${retry.outcome}`);
  }assert.ok(done,`${agents[i].actor} did not confirm`);
 }
 const stateUrl=`${base}/profiles/word/api/docs/${doc}/state`;
 const verify=async(label)=>{let states;await until(async()=>{const response=await fetch(stateUrl);const state=await response.json();const vs=await Promise.all(agents.map(read));states={state,vs};return vs.every(v=>!v.pending&&!v.conditionalPending&&JSON.stringify(v.document)===JSON.stringify(state.model));},`${label}: MCP/server convergence`);return states;};
 const snapshotScript=await script('browser-snapshot',`async page=>{let s;const end=Date.now()+30000;while(Date.now()<end){s=await page.evaluate(async()=>await window.products.snapshot());if(s.equal)return {equal:s.equal,status:await page.evaluate(()=>window.products.status()),text:s.server.children[1].children[0].runs.map(r=>r.text??'').join(''),errors:s.errors};await page.waitForTimeout(100)}throw Error(JSON.stringify(s));}`);
 let state=await verify('wave');results.afterWave=parse(await execCli('run-code','--filename',snapshotScript));const alltext=text(state.state.model);for(const marker of [...agents.map(a=>a.token),'{E0}','{E1}','{E2}','{U0}','{U1}','{U2}'])assert.equal(alltext.split(marker).length-1,1,`Missing or duplicate ${marker}`);
 const offline=await script('browser-offline',`async page=>{await page.context().setOffline(true);const p=page.locator('#Slate .editor p').filter({hasText:'Opening text'}).first();await p.click();await p.evaluate(n=>{const w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let t,last;while(t=w.nextNode())last=t;window.getSelection().setBaseAndExtent(last,last.length,last,last.length);document.dispatchEvent(new Event('selectionchange'))});await page.keyboard.insertText('{OFF}');await page.waitForTimeout(500);const status=await page.evaluate(()=>window.products.status());if(!status.some(p=>p.name==='Slate'&&p.pending>0))throw Error('No offline pending user edit');return {status};}`);
 results.offline=parse(await execCli('run-code','--filename',offline));
 const fresh=await read(agents[0]);const rec=await measure(agents[0],fresh.revision,'{REC}');assert.equal(rec.outcome,'confirmed');
 const online=await script('browser-online',`async page=>{await page.context().setOffline(false);return {online:true};}`);await execCli('run-code','--filename',online);
 await verify('reconnect');results.afterReconnect=parse(await execCli('run-code','--filename',snapshotScript));assert.ok(results.afterReconnect.text.includes('{OFF}')&&results.afterReconnect.text.includes('{REC}'));
 const undo=await call(agents[0],'undo');assert.equal(undo.structuredContent?.status,'confirmed',JSON.stringify(undo));await verify('undo');const afterUndo=parse(await execCli('run-code','--filename',snapshotScript));assert.ok(!afterUndo.text.includes('{REC}')&&afterUndo.text.includes('{OFF}'));
 const redo=await call(agents[0],'redo');assert.equal(redo.structuredContent?.status,'confirmed',JSON.stringify(redo));await verify('redo');results.afterRedo=parse(await execCli('run-code','--filename',snapshotScript));assert.ok(results.afterRedo.text.includes('{REC}')&&results.afterRedo.text.includes('{OFF}'));
 results.calls=calls;results.finished=new Date().toISOString();results.scope='Single local Word sample, one browser with three editor peers; 15 scripted MCP processes, journals disabled, finite workload. Input automation is not OS IME or actual users.';
 await writeFile(join(output,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({status:'passed',firstWave:results.firstWave,firstWaveMs:results.firstWaveMs,calls:calls.length,memory:results.agentMemory,output:join(output,'result.json')}));
}catch(error){await writeFile(join(output,'failure.json'),JSON.stringify({message:error.stack,results,errors,calls},null,2));throw error;}
finally{
 await Promise.allSettled(agents.map(a=>a.client.close()));if(control)await new Promise(r=>control.close(r));
 if(browserStarted)await execCli('close').catch(()=>{});
 if(child&&child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit.catch(()=>{});}
}
