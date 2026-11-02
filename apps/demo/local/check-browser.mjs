// Run against the isolated LocalClient preview. This opens and closes its own Chrome session.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const url = option('--url');
if (!url || !/^https?:\/\/[^/]+/.test(url)) throw Error('Usage: node apps/demo/local/check-browser.mjs --url http://127.0.0.1:PORT --output output/local-demo/RUN');
const session = `docsync-local-${process.pid}-${Date.now().toString(36)}`;
const output = resolve(option('--output') ?? `output/local-demo/${session}`);
await mkdir(output, {recursive: true});
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const receipt = {result:'RUNNING', session, url, chrome, startedAt:new Date().toISOString(), cases:[], commands:[], osIME:'NOT_RUN', physicalRenderLatency:'NOT_RUN', scope:'Actual Google Chrome, trusted native editor input and selection, local memory only; no backend or collaboration claim.'};
const run = (...args) => {
    const entry = {args, at:new Date().toISOString()}; receipt.commands.push(entry);
    try {
        const parsed = JSON.parse(execFileSync('agent-browser', ['--session',session,'--executable-path',chrome,'--json',...args], {encoding:'utf8', timeout:45000, maxBuffer:12_000_000}));
        entry.success = parsed.success;
        if (!parsed.success) throw Error(JSON.stringify(parsed));
        return parsed.data;
    } catch(error) { entry.error=String(error); throw error; }
};
const evaluate = code => run('eval','-b',Buffer.from(code).toString('base64')).result;
const poll = async (code,label) => {
    const deadline=Date.now()+15000;
    while(Date.now()<deadline) { const result=evaluate(code); if(result) return result; await new Promise(done=>setTimeout(done,60)); }
    throw Error(`Timed out: ${label}`);
};
const snapshot = () => evaluate('__localDemo.snapshot()');
const settle = () => poll(`(()=>{const s=__localDemo.snapshot();return s.peers.every(p=>JSON.stringify(p.model)===JSON.stringify(p.native)&&p.text===p.nativeText)?s:false})()`, 'native/client equality');
const peer = (state,name) => {const value=state.peers.find(p=>p.name===name);assert.ok(value,`Missing ${name}`);return value;};
const editorSelector = name => `[role="textbox"][aria-label="${name}"]`;
const button = (name,label) => {
    evaluate(`(()=>{document.querySelectorAll('[data-local-proof-button]').forEach(b=>b.removeAttribute('data-local-proof-button'));const p=document.querySelector('[data-editor="'+${JSON.stringify(name)}+'"]');const b=[...p.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.dataset.localProofButton='yes'})()`);
    run('click','[data-local-proof-button="yes"]');
};
const unchangedOthers = (before,after,name) => {
    for (const other of before.peers.filter(p=>p.name!==name)) { const current=peer(after,other.name); assert.deepEqual(current.model,other.model,`Cross-pane content change in ${other.name}`); assert.deepEqual(current.history,other.history,`Cross-pane history change in ${other.name}`); }
};
const healthy = state => {assert.deepEqual(state.errors??[],[]);for(const p of state.peers)assert.deepEqual(p.notificationErrors??[],[],`${p.name} swallowed notification error`);};
const positionStart = name => {run('click',editorSelector(name));for(let i=0;i<5;i++)run('press','ArrowUp');run('press','Home');};
const domSelection = name => evaluate(`(()=>{const s=getSelection(),e=document.querySelector(${JSON.stringify(editorSelector(name))});const offset=(node,n)=>{if(!node||!e.contains(node))return null;const r=document.createRange();r.selectNodeContents(e);r.setEnd(node,n);return r.toString().length};return {text:s.toString(),anchor:{offset:s.anchorOffset,nodeText:s.anchorNode?.textContent,global:offset(s.anchorNode,s.anchorOffset)},focus:{offset:s.focusOffset,nodeText:s.focusNode?.textContent,global:offset(s.focusNode,s.focusOffset)}}})()`);
const installProbe = () => evaluate(`(()=>{
    window.__localProof={events:[],networkAttempts:[],errors:[]};
    for(const type of ['beforeinput','input','keydown','selectionchange'])document.addEventListener(type,e=>{const target=e.target.closest?.('[data-editor]');__localProof.events.push({type,inputType:e.inputType??null,data:e.data??null,key:e.key??null,trusted:e.isTrusted,pane:target?.dataset.editor??document.activeElement?.closest?.('[data-editor]')?.dataset.editor??null});},true);
    window.addEventListener('error',e=>__localProof.errors.push(String(e.error??e.message)));
    window.addEventListener('unhandledrejection',e=>__localProof.errors.push(String(e.reason)));
    const blocked=(kind,args)=>{__localProof.networkAttempts.push({kind,url:String(args[0]??'')});throw Error('Document network disabled: '+kind)};
    window.fetch=(...args)=>{try{blocked('fetch',args)}catch(e){return Promise.reject(e)}};
    XMLHttpRequest.prototype.open=function(...args){blocked('xhr',[args[1]])};
    for(const kind of ['WebSocket','EventSource'])window[kind]=function(...args){blocked(kind,args)};
    navigator.sendBeacon=(...args)=>blocked('beacon',args);
    return true;
})()`);
let failed;
try {
    receipt.servedArtifacts={};
    for(const filename of ['bundle.js','metafile.json','bundle-proof.json']) {
        const response=await fetch(new URL(filename,url));assert.ok(response.ok,`Missing static artifact ${filename}`);const bytes=Buffer.from(await response.arrayBuffer());
        receipt.servedArtifacts[filename]={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
        await writeFile(resolve(output,filename),bytes);
    }
    run('open',url);run('wait','--fn','!!window.__localDemo?.ready');
    receipt.browser=evaluate('({userAgent:navigator.userAgent,platform:navigator.platform})');
    receipt.initial=await settle();healthy(receipt.initial);
    assert.deepEqual(receipt.initial.peers.map(p=>p.name).sort(),['Lexical','ProseMirror','Slate']);
    receipt.initialRequests=run('network','requests');
    installProbe();run('set','offline','on');receipt.networkDisabledAfterMount=true;
    for(const name of ['ProseMirror','Slate','Lexical']) {
        const entry={name,result:'RUNNING'};receipt.cases.push(entry);
        button(name,'Reset'); const initial=await settle();const base=peer(initial,name).text;
        positionStart(name);run('keyboard','inserttext','A😀한글');
        const typed=await settle();entry.typed=peer(typed,name);assert.equal(entry.typed.text,'A😀한글'+base);unchangedOthers(initial,typed,name);healthy(typed);
        button(name,'Undo');const undone=await settle();assert.equal(peer(undone,name).text,base);unchangedOthers(initial,undone,name);
        button(name,'Redo');const redone=await settle();assert.equal(peer(redone,name).text,'A😀한글'+base);unchangedOthers(initial,redone,name);entry.toolbarHistory='PASS';
        // Keyboard undo/redo must reach the editor, rather than an application helper.
        run('click',editorSelector(name));run('press','Meta+z');const keyboardUndo=await settle();assert.equal(peer(keyboardUndo,name).text,base);
        run('press','Meta+Shift+z');const keyboardRedo=await settle();assert.equal(peer(keyboardRedo,name).text,'A😀한글'+base);entry.keyboardHistory='PASS';
        positionStart(name);run('press','Shift+ArrowRight');
        entry.forward=peer(await settle(),name).selection;
        assert.ok(entry.forward&&entry.forward.anchor.at(-1)<entry.forward.focus.at(-1),'Expected forward native selection');
        run('press','ArrowRight');run('press','Shift+ArrowLeft');
        entry.backward=peer(await settle(),name).selection;
        assert.ok(entry.backward&&entry.backward.anchor.at(-1)>entry.backward.focus.at(-1),'Expected backward native selection');
        run('press','ArrowLeft');
        entry.collapsed=peer(await settle(),name).selection;assert.deepEqual(entry.collapsed.anchor,entry.collapsed.focus);
        // Delete one ASCII character through native key input, then restore via undo.
        positionStart(name);run('press','Delete');const deleted=await settle();assert.equal(peer(deleted,name).text,'😀한글'+base);unchangedOthers(initial,deleted,name);entry.delete='PASS';
        button(name,'Undo');assert.equal(peer(await settle(),name).text,'A😀한글'+base);
        entry.externalSelections=[];
        for(const direction of ['forward','backward']) {
            positionStart(name);run('press','ArrowRight');run('press','Shift+ArrowRight');
            if(direction==='backward'){run('press','ArrowRight');run('press','Shift+ArrowLeft');}
            const beforeExternal=peer(await settle(),name),selected=beforeExternal.selection,domBefore=domSelection(name);
            assert.ok(domBefore.text.length>0,'Native DOM selection missing before external edit');
            button(name,'Insert prefix');const external=await settle();entry.external=peer(external,name);
            const domAfter=domSelection(name);entry.externalSelections.push({direction,before:selected,after:entry.external.selection,domBefore,domAfter});
            assert.equal(entry.external.text,'Local '+beforeExternal.text);assert.deepEqual(entry.external.selection,{anchor:[...selected.anchor.slice(0,-1),selected.anchor.at(-1)+6],focus:[...selected.focus.slice(0,-1),selected.focus.at(-1)+6]});
            assert.equal(domAfter.text,domBefore.text,'External edit lost DOM selected text');assert.equal(domAfter.anchor.global,domBefore.anchor.global+6);assert.equal(domAfter.focus.global,domBefore.focus.global+6);
            unchangedOthers(initial,external,name);healthy(external);
        }
        run('screenshot',resolve(output,`${name}.png`));
        if(evaluate('typeof __localDemo.remount === "function"')) {
            evaluate(`__localDemo.remount(${JSON.stringify(name)})`);
            const remounted=await settle();assert.deepEqual(peer(remounted,name).model,entry.external.model);assert.deepEqual(peer(remounted,name).history,entry.external.history);unchangedOthers(initial,remounted,name);healthy(remounted);entry.remount='PASS';
        } else entry.remount='NOT_RUN';
        button(name,'Reset');const reset=await settle();assert.equal(peer(reset,name).text,base);assert.deepEqual(peer(reset,name).history,peer(receipt.initial,name).history);healthy(reset);entry.reset='PASS';
        const events=evaluate(`__localProof.events.filter(e=>e.pane===${JSON.stringify(name)})`);entry.events=events;
        assert.ok(events.some(e=>e.trusted&&e.type==='beforeinput'&&e.inputType==='insertText'),'No trusted insertText');
        assert.ok(events.some(e=>e.trusted&&e.type==='keydown'&&e.key==='Delete'),'No trusted delete key');
        assert.ok(events.some(e=>e.trusted&&e.type==='keydown'&&e.key.toLowerCase()==='z'),'No trusted undo/redo key');
        entry.result='PASS';await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    }
    receipt.probe=evaluate('__localProof');assert.deepEqual(receipt.probe.networkAttempts,[]);assert.deepEqual(receipt.probe.errors,[]);
    receipt.requestsAfterEdits=run('network','requests');
    receipt.documentRequests=(receipt.requestsAfterEdits.requests??[]).filter(request=>request.method!=='GET'||new URL(request.url).origin!==new URL(url).origin||!['/','/style.css','/bundle.js','/favicon.ico'].includes(new URL(request.url).pathname));
    assert.deepEqual(receipt.documentRequests,[],'Unexpected document endpoint request');
    // Refresh must create new, seeded LocalClients. The browser needs static assets again.
    positionStart('ProseMirror');run('keyboard','inserttext','temporary');assert.ok(peer(await settle(),'ProseMirror').text.startsWith('temporary'));
    run('set','offline','off');run('reload');run('wait','--fn','!!window.__localDemo?.ready');
    const refreshed=await settle();healthy(refreshed);
    for(const p of refreshed.peers){assert.deepEqual(p.model,peer(receipt.initial,p.name).model,'Refresh persisted local edits');assert.deepEqual(p.history,peer(receipt.initial,p.name).history,'Refresh retained local history');}
    receipt.refresh={result:'PASS',state:refreshed};
    run('screenshot',resolve(output,'refreshed.png'));
    run('set','viewport','390','844');run('screenshot',resolve(output,'mobile-smoke.png'));
    receipt.mobileSmoke={viewport:[390,844],horizontalOverflow:evaluate('document.documentElement.scrollWidth>innerWidth'),scope:'Screenshot and horizontal overflow smoke only'};assert.equal(receipt.mobileSmoke.horizontalOverflow,false);
    run('set','viewport','1280','900');
    const beforeSyntheticLifecycle=refreshed;
    evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}))');
    const afterSyntheticLifecycle=await settle();healthy(afterSyntheticLifecycle);
    for(const p of afterSyntheticLifecycle.peers)assert.deepEqual(p.model,peer(beforeSyntheticLifecycle,p.name).model);
    positionStart('ProseMirror');run('keyboard','inserttext','after-persisted-pagehide');assert.ok(peer(await settle(),'ProseMirror').text.startsWith('after-persisted-pagehide'));
    run('press','Meta+z');const lifecycleUndone=await settle();healthy(lifecycleUndone);assert.deepEqual(peer(lifecycleUndone,'ProseMirror').model,peer(refreshed,'ProseMirror').model);
    receipt.persistedPagehide={result:'PASS',scope:'Synthetic persisted:true PageTransitionEvent branch only; actual BFCache navigation NOT_RUN'};
    receipt.remount={result:receipt.cases.every(c=>c.remount==='PASS')?'PASS':'NOT_RUN'};
    receipt.console=run('console');receipt.pageErrors=run('errors');assert.deepEqual(receipt.pageErrors.errors??[],[]);
    receipt.consoleErrors=(receipt.console.messages??receipt.console.logs??[]).filter(entry=>['error','warn','warning'].includes(entry.type??entry.level));assert.deepEqual(receipt.consoleErrors,[]);
    const loaded=evaluate('performance.getEntriesByType("resource").map(r=>({name:r.name,initiatorType:r.initiatorType}))');receipt.loadedResources=loaded;
    assert.ok(loaded.every(r=>new URL(r.name).origin===new URL(url).origin),'Unexpected nonlocal asset request');
    assert.ok(loaded.every(r=>!['fetch','xmlhttprequest','beacon'].includes(r.initiatorType)),'Unexpected document network request');
    run('screenshot',resolve(output,'persisted-pagehide.png'));
    // Inspect the exact served esbuild manifest saved before browser launch.
    const metafilePath=resolve(output,'metafile.json');
    const meta=JSON.parse(await readFile(metafilePath,'utf8'));
    const inputs=[...new Set(Object.values(meta.outputs??{}).flatMap(o=>Object.entries(o.inputs??{}).filter(([,v])=>v.bytesInOutput>0).map(([p])=>p)))];
    receipt.bundle={metafile:metafilePath,inputs,transportInputs:inputs.filter(p=>/transport|sync-client|websocket|node-http|\/sync\/client\.|doc-sync-core\/dist\/server\//i.test(p)),scope:'Contributing emitted modules only; unused barrel imports have zero output bytes.'};
    assert.deepEqual(receipt.bundle.transportInputs,[],'Transport implementation included in local bundle');
    receipt.result='PASS';
} catch(error) {
    failed=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);
    const active=receipt.cases.find(c=>c.result==='RUNNING');if(active)active.result='FAIL';
    try {receipt.failureState=snapshot();receipt.failureProbe=evaluate('window.__localProof');receipt.pageErrors=run('errors');receipt.console=run('console');run('screenshot',resolve(output,'first-failure.png'));}catch(captureError){receipt.captureError=String(captureError)}
} finally {
    try{run('close');receipt.cleanup='PASS'}catch(error){receipt.cleanup=String(error);if(!failed){failed=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error)}}
    receipt.finishedAt=new Date().toISOString();await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
}
console.log(JSON.stringify({result:receipt.result,output,firstFailure:receipt.firstFailure??null}));
if(failed)throw failed;
