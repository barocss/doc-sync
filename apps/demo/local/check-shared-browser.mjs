// Trusted input proof for the four views of one in-memory LocalClient.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const option = name => {const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const target=option('--url');
if(!target||!/^https?:\/\/[^/]+/.test(target))throw Error('Usage: node apps/demo/local/check-shared-browser.mjs --url http://127.0.0.1:PORT --output output/custom-shared/RUN');
const url=new URL(target);url.searchParams.set('mode','shared');
const session=`docsync-shared-${process.pid}-${Date.now().toString(36)}`;
const output=resolve(option('--output')??`output/custom-shared/${session}`);
await mkdir(output,{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const names=['Custom','ProseMirror','Slate','Lexical'];
const receipt={result:'RUNNING',session,url:String(url),chrome,startedAt:new Date().toISOString(),cases:[],commands:[],osIME:'NOT_RUN',physicalRenderLatency:'NOT_RUN',composition:'NOT_RUN',scope:'Actual Google Chrome trusted native input. Four views share one LocalClient. Selection is per view. Local memory only; no backend or collaboration claim.'};
const run=(...args)=>{const entry={args,at:new Date().toISOString()};receipt.commands.push(entry);try{const result=JSON.parse(execFileSync('agent-browser',['--session',session,'--executable-path',chrome,'--json',...args],{encoding:'utf8',timeout:45000,maxBuffer:12_000_000}));entry.success=result.success;if(!result.success)throw Error(JSON.stringify(result));return result.data;}catch(error){entry.error=String(error);throw error;}};
const evaluate=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const snapshot=()=>evaluate('__localDemo.snapshot()');
const peer=(state,name)=>{const p=state.peers.find(p=>p.name===name);assert.ok(p,`Missing ${name}`);return p;};
const healthy=state=>{assert.deepEqual(state.errors??[],[]);for(const p of state.peers)assert.deepEqual(p.notificationErrors??[],[],`${p.name} notification errors`);};
const settle=async()=>{const deadline=Date.now()+15000;let state;while(Date.now()<deadline){if(evaluate('__localDemo.busy')){await new Promise(done=>setTimeout(done,60));continue;}state=snapshot();healthy(state);if(!state.busy&&state.peers.length===4&&state.peers.every(p=>JSON.stringify(p.model)===JSON.stringify(p.native)&&p.text===p.nativeText&&JSON.stringify(p.model)===JSON.stringify(state.peers[0].model)&&JSON.stringify(p.history)===JSON.stringify(state.peers[0].history)))return state;await new Promise(done=>setTimeout(done,60));}throw Error('Timed out: shared client/native equality '+JSON.stringify(state));};
const selector=name=>`[aria-label="${name}"]${name === 'Custom' ? '' : '[role="textbox"]'}`;
const click=target=>{evaluate(`document.querySelector(${JSON.stringify(target)}).scrollIntoView({block:'center'})`);evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))');run('click',target);};
const button=(name,label)=>{if(label==='Reset'){click('#reset-shared');return;}const token=`${name}-${label}-${receipt.commands.length}`;evaluate(`(()=>{document.querySelectorAll('[data-shared-proof-button]').forEach(b=>b.removeAttribute('data-shared-proof-button'));const p=document.querySelector('[data-editor="'+${JSON.stringify(name)}+'"]'),b=[...p.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.dataset.sharedProofButton=${JSON.stringify(token)}})()`);click(`[data-shared-proof-button="${token}"]`);const event=evaluate(`__sharedProof.events.filter(e=>e.type==='click').at(-1)`);assert.equal(event.pane,name,'Trusted toolbar click hit wrong pane');assert.equal(event.label,label,'Trusted toolbar click hit wrong button');};
const start=name=>{click(selector(name));for(let i=0;i<8;i++)run('press','ArrowUp');run('press','Home');};
const dom=name=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector(name))}),s=getSelection();if(e.tagName==='TEXTAREA')return {start:e.selectionStart,end:e.selectionEnd,direction:e.selectionDirection,text:e.value.slice(e.selectionStart,e.selectionEnd),active:document.activeElement?.getAttribute('aria-label')};const offset=(n,o)=>{if(!n||!e.contains(n))return null;const r=document.createRange();r.selectNodeContents(e);r.setEnd(n,o);return r.toString().length};return {anchor:offset(s.anchorNode,s.anchorOffset),focus:offset(s.focusNode,s.focusOffset),text:s.toString(),active:document.activeElement?.getAttribute('aria-label')}})()`);
const textIs=(state,text)=>{for(const name of names)assert.equal(peer(state,name).text,text,`${name} shared text`);};
const exact=(state,model)=>{for(const name of names)assert.deepEqual(peer(state,name).model,model,`${name} exact shared model`);};
const record=async(label,action)=>{const entry={name:label,result:'RUNNING'};receipt.cases.push(entry);await action(entry);entry.result='PASS';await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');};
const probe=()=>evaluate(`(()=>{window.__sharedProof={events:[],networkAttempts:[],errors:[]};for(const type of ['beforeinput','input','keydown','selectionchange','mousedown','click'])document.addEventListener(type,e=>{const pane=e.target.closest?.('[data-editor]')??document.activeElement?.closest?.('[data-editor]');__sharedProof.events.push({type,label:e.target.textContent?.trim()??null,inputType:e.inputType??null,data:e.data??null,key:e.key??null,trusted:e.isTrusted,pane:pane?.dataset.editor??null});},true);window.addEventListener('error',e=>__sharedProof.errors.push(String(e.error??e.message)));window.addEventListener('unhandledrejection',e=>__sharedProof.errors.push(String(e.reason)));const blocked=(kind,args)=>{__sharedProof.networkAttempts.push({kind,url:String(args[0]??'')});throw Error('Document network disabled: '+kind)};window.fetch=(...a)=>{try{blocked('fetch',a)}catch(e){return Promise.reject(e)}};XMLHttpRequest.prototype.open=function(...a){blocked('xhr',[a[1]])};for(const kind of ['WebSocket','EventSource'])window[kind]=function(...a){blocked(kind,a)};navigator.sendBeacon=(...a)=>blocked('beacon',a);return true})()`);
let failed;
try{
    receipt.source={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),checkerSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')};
    receipt.servedArtifacts={};
    for(const filename of ['bundle.js','metafile.json','bundle-proof.json']){const response=await fetch(new URL(filename,url));assert.ok(response.ok,`Missing ${filename}`);const bytes=Buffer.from(await response.arrayBuffer());receipt.servedArtifacts[filename]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};await writeFile(resolve(output,filename),bytes);}
    receipt.servedBundleProof=JSON.parse(await readFile(resolve(output,'bundle-proof.json'),'utf8'));assert.deepEqual(receipt.servedBundleProof.forbidden,[]);
    const meta=JSON.parse(await readFile(resolve(output,'metafile.json'),'utf8'));
    const inputs=[...new Set(Object.values(meta.outputs??{}).flatMap(o=>Object.entries(o.inputs??{}).filter(([,v])=>v.bytesInOutput>0).map(([path])=>path)))];
    receipt.bundle={inputs,forbidden:inputs.filter(p=>/transport|sync-client|websocket|node-http|\/sync\/client\.|doc-sync-core\/dist\/server\//i.test(p)),scope:'Emitted contributing modules; unused barrel inputs allowed.'};assert.deepEqual(receipt.bundle.forbidden,[]);
    run('open',String(url));run('wait','--fn','!!window.__localDemo?.ready');run('snapshot','-i');
    receipt.browser=evaluate('({userAgent:navigator.userAgent,platform:navigator.platform})');
    receipt.initial=await settle();assert.equal(receipt.initial.sameClient,true);assert.equal(receipt.initial.clientCount,1);assert.equal(receipt.initial.hostCount,4);assert.deepEqual(receipt.initial.peers.map(p=>p.name).sort(),[...names].sort());
    receipt.initialRequests=run('network','requests');probe();run('set','offline','on');receipt.networkDisabledAfterMount=true;
    for(const name of names)await record(`${name} native input and cross-view history`,async entry=>{
        button(name,'Reset');const base=await settle(),text=peer(base,name).text;entry.before=base;
        start(name);run('keyboard','inserttext','A😀한글');const typed=await settle();textIs(typed,'A😀한글'+text);entry.typed=typed;
        const other=names[(names.indexOf(name)+1)%4],third=names[(names.indexOf(name)+2)%4];
        button(other,'Undo');exact(await settle(),peer(base,name).model);
        button(third,'Redo');exact(await settle(),peer(typed,name).model);
        click(selector(other));run('press','Meta+z');exact(await settle(),peer(base,name).model);
        click(selector(third));run('press','Meta+Shift+z');exact(await settle(),peer(typed,name).model);
        start(name);run('press','Delete');textIs(await settle(),'😀한글'+text);button(other,'Undo');exact(await settle(),peer(typed,name).model);
        entry.events=evaluate(`__sharedProof.events.filter(e=>e.pane===${JSON.stringify(name)})`);
        assert.ok(entry.events.some(e=>e.trusted&&e.type==='beforeinput'&&e.inputType==='insertText'),'Missing trusted insertText');
        assert.ok(entry.events.some(e=>e.trusted&&e.type==='keydown'&&e.key==='Delete'),'Missing trusted Delete');
        entry.after=await settle();
    });
    await record('Custom per-view stable selection after another native view edits',async entry=>{
        entry.selections=[];
        for(const direction of ['forward','backward','caret']){
            button('Custom','Reset');const base=await settle();start('Custom');for(let i=0;i<5;i++)run('press','ArrowRight');
            if(direction!=='caret')run('press',direction==='forward'?'Shift+ArrowRight':'Shift+ArrowLeft');
            const before=await settle(),beforeDOM=dom('Custom'),old=peer(before,'Custom').selection;
            start('ProseMirror');run('keyboard','inserttext','XY');const after=await settle(),afterDOM=dom('Custom');
            textIs(after,'XY'+peer(base,'Custom').text);assert.equal(afterDOM.active,'ProseMirror','Custom stole native focus');
            assert.equal(afterDOM.start,beforeDOM.start+2);assert.equal(afterDOM.end,beforeDOM.end+2);if(direction!=='caret')assert.equal(afterDOM.direction,beforeDOM.direction);else assert.equal(afterDOM.start,afterDOM.end);assert.equal(afterDOM.text,beforeDOM.text);
            assert.deepEqual(peer(after,'Custom').selection,{anchor:[...old.anchor.slice(0,-1),old.anchor.at(-1)+2],focus:[...old.focus.slice(0,-1),old.focus.at(-1)+2]});
            entry.selections.push({direction,before:old,after:peer(after,'Custom').selection,beforeDOM,afterDOM});
        }
    });
    for(const name of names)await record(`${name} active selection and identical toolbar prefixes`,async entry=>{
        button(name,'Reset');entry.selections=[];
        for(const direction of ['forward','backward']){
            start(name);run('press','ArrowRight');run('press','Shift+ArrowRight');if(direction==='backward'){run('press','ArrowRight');run('press','Shift+ArrowLeft');}
            const before=await settle(),selection=peer(before,name).selection,beforeDOM=dom(name);assert.ok(beforeDOM.text.length>0);
            button(name,'Insert prefix');const once=await settle(),onceDOM=dom(name);assert.equal(onceDOM.active,name);assert.equal(onceDOM.text,beforeDOM.text);
            button(name,'Insert prefix');const twice=await settle(),afterDOM=dom(name);textIs(twice,'Local Local '+peer(before,name).text);assert.equal(afterDOM.active,name);assert.equal(afterDOM.text,beforeDOM.text);
            assert.deepEqual(peer(twice,name).selection,{anchor:[...selection.anchor.slice(0,-1),selection.anchor.at(-1)+12],focus:[...selection.focus.slice(0,-1),selection.focus.at(-1)+12]});
            entry.selections.push({direction,before:selection,after:peer(twice,name).selection,beforeDOM,onceDOM,afterDOM});
            button(names[(names.indexOf(name)+1)%4],'Undo');exact(await settle(),peer(once,name).model);
            button(names[(names.indexOf(name)+2)%4],'Redo');exact(await settle(),peer(twice,name).model);
        }
    });
    for(const name of names)await record(`${name} native split join and cross-paragraph delete`,async entry=>{
        button(name,'Reset');const base=await settle();start(name);run('press','ArrowRight');run('press','Enter');const split=await settle();textIs(split,peer(base,name).text.slice(0,1)+'\n'+peer(base,name).text.slice(1));entry.split=split;
        run('press','Backspace');exact(await settle(),peer(base,name).model);
        button('Custom','Reset');start(name);run('press','ArrowRight');run('press','Shift+End');run('press','Shift+ArrowRight');entry.crossSelection=dom(name);assert.ok(entry.crossSelection.text.length>0);
        run('press','Backspace');const deleted=await settle();textIs(deleted,peer(base,name).text.slice(0,1)+peer(base,name).text.split('\n').slice(1).join('\n'));entry.deleted=deleted;
        button('Slate','Undo');exact(await settle(),peer(base,name).model);button('Lexical','Redo');exact(await settle(),peer(deleted,name).model);
    });
    await record('remount retains shared content and history; reset clears history',async entry=>{
        const before=await settle();for(const name of names){evaluate(`__localDemo.remount(${JSON.stringify(name)})`);const after=await settle();exact(after,peer(before,name).model);for(const p of after.peers)assert.deepEqual(p.history,peer(before,name).history);}
        button('Custom','Reset');const reset=await settle();exact(reset,peer(receipt.initial,'Custom').model);for(const p of reset.peers)assert.deepEqual(p.history,peer(receipt.initial,'Custom').history);entry.reset=reset;
        run('screenshot',resolve(output,'shared-reset.png'));
    });
    receipt.probe=evaluate('__sharedProof');assert.deepEqual(receipt.probe.networkAttempts,[]);assert.deepEqual(receipt.probe.errors,[]);
    receipt.requestsAfterEdits=run('network','requests');receipt.documentRequests=(receipt.requestsAfterEdits.requests??[]).filter(r=>r.method!=='GET'||new URL(r.url).origin!==url.origin||!['/','/style.css','/bundle.js','/favicon.ico'].includes(new URL(r.url).pathname));assert.deepEqual(receipt.documentRequests,[]);
    receipt.loadedResources=evaluate('performance.getEntriesByType("resource").map(r=>({name:r.name,initiatorType:r.initiatorType}))');assert.ok(receipt.loadedResources.every(r=>new URL(r.name).origin===url.origin&&!['fetch','xmlhttprequest','beacon'].includes(r.initiatorType)));
    receipt.console=run('console');receipt.pageErrors=run('errors');assert.deepEqual(receipt.pageErrors.errors??[],[]);receipt.consoleErrors=(receipt.console.messages??receipt.console.logs??[]).filter(e=>['error','warn','warning'].includes(e.type??e.level));assert.deepEqual(receipt.consoleErrors,[]);
    await record('refresh clears memory',async entry=>{start('Custom');run('keyboard','inserttext','temporary');await settle();run('set','offline','off');run('reload');run('wait','--fn','!!window.__localDemo?.ready');const state=await settle();exact(state,peer(receipt.initial,'Custom').model);for(const p of state.peers)assert.deepEqual(p.history,peer(receipt.initial,'Custom').history);entry.state=state;run('screenshot',resolve(output,'shared-refreshed.png'));});
    run('set','viewport','390','844');run('screenshot',resolve(output,'shared-mobile-smoke.png'));receipt.mobileSmoke={viewport:[390,844],horizontalOverflow:evaluate('document.documentElement.scrollWidth>innerWidth'),scope:'Screenshot and overflow only'};assert.equal(receipt.mobileSmoke.horizontalOverflow,false);
    receipt.result='PASS';
}catch(error){failed=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);const active=receipt.cases.find(c=>c.result==='RUNNING');if(active)active.result='FAIL';try{receipt.failureState=snapshot();receipt.failureProbe=evaluate('window.__sharedProof');receipt.pageErrors=run('errors');receipt.console=run('console');run('screenshot',resolve(output,'first-failure.png'));}catch(captureError){receipt.captureError=String(captureError);}}
finally{try{run('close');receipt.cleanup='PASS';}catch(error){receipt.cleanup=String(error);if(!failed){failed=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);}}receipt.finishedAt=new Date().toISOString();await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify({result:receipt.result,output,firstFailure:receipt.firstFailure??null}));if(failed)throw failed;
