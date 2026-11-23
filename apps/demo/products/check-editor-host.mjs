// Requires an isolated product server built from the candidate source.
// node apps/demo/products/check-editor-host.mjs <origin> [output-dir]
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin = process.argv[2];
if (!origin) throw new Error('Expected <origin> [output-dir]');
const output = resolve(process.argv[3] ?? 'output/editor-host-browser');
await mkdir(output, {recursive: true});
const session = `editor-host-${process.pid}-${Date.now().toString(36)}`;
const receipt = {result: 'RUNNING', session, origin, browser: null, cases: [], osIME: 'NOT_RUN', reconnectScope: 'products.disconnect(name)/connect(name), remote edit while disconnected, exact replay on the same mounted editor'};
const run = (...args) => {
    const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {encoding: 'utf8', timeout: 45000, maxBuffer: 10_000_000}));
    if (!result.success) throw new Error(JSON.stringify(result));
    return result.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const poll = async (predicate, label) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const value = evaluate(predicate);
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 75));
    }
    throw new Error(`Timed out: ${label}`);
};
const converge = () => poll('(async()=>{const s=await products.snapshot();return s.equal?s:false})()', 'native/client/server convergence');
const modelText = model => (model.runs ?? []).map(run => run.text ?? '').join('');
const nodeAt = (model, path) => path.reduce((node, index) => node.children[index], model);
const remote = async (profile, doc, path, text) => {
    const response = await fetch(new URL('/test/remote', origin), {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({profile, doc, edits: [{op: 'insert', at: [...path, 0], content: text}]})});
    if (!response.ok) throw new Error(`Remote edit ${response.status}: ${await response.text()}`);
    return response.json();
};
const tool = (name, label) => {
    evaluate(`(()=>{const button=[...document.querySelectorAll('#${name} .tools button')].find(b=>b.textContent===${JSON.stringify(label)});if(!button)throw Error('Missing toolbar button');button.dataset.hostProofButton='active'})()`);
    run('click', '[data-host-proof-button="active"]');
    evaluate("document.querySelector('[data-host-proof-button]')?.removeAttribute('data-host-proof-button')");
};
const focusTarget = async name => {
    const point=evaluate(`(()=>{const p=[...document.querySelectorAll('#${name} .editor p')].find(p=>p.textContent.includes(products.target.text));if(!p)throw Error('Missing target paragraph');window.hostProofTargetOffset=p.textContent.indexOf(products.target.text)+products.target.text.length;p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();return {x:r.left+Math.min(50,r.width/2),y:r.top+r.height/2}})()`);
    run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');run('mouse','up');
    evaluate(`(()=>{const p=[...document.querySelectorAll('#${name} .editor p')].find(p=>p.textContent.includes(products.target.text));const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){const offset=text.textContent.indexOf(products.target.text);if(offset>=0){window.getSelection().setBaseAndExtent(text,offset+products.target.text.length,text,offset+products.target.text.length);document.dispatchEvent(new Event('selectionchange'));return;}}throw Error('Missing target text node')})()`);
    // Native movement makes the DOM selection visible to all three editor implementations.
    run('press', 'ArrowLeft'); run('press', 'ArrowRight');
    await poll(`(()=>{const r=products.range(${JSON.stringify(name)});return r&&JSON.stringify(r.anchor)===JSON.stringify([...products.target.path,hostProofTargetOffset])&&JSON.stringify(r.focus)===JSON.stringify(r.anchor)?r:false})()`, 'native target caret');
};
let firstFailure;
try {
    for (const profile of ['word', 'notion', 'presentation']) for (const name of ['Slate', 'Lexical', 'ProseMirror']) {
        const doc = `h1-${profile.slice(0,2)}-${name[0].toLowerCase()}-${Date.now().toString(36)}`;
        const entry = {profile, editor: name, doc, result: 'RUNNING'};
        receipt.cases.push(entry);
        run('open', `${origin}/?profile=${profile}&doc=${doc}`);
        run('wait', '--fn', '!!window.products?.ready()');
        receipt.browser ??= evaluate('navigator.userAgent');
        const initial = await converge();
        const target = evaluate('products.target');
        const before = modelText(nodeAt(initial.server, target.path));
        evaluate(`(()=>{window.hostProofInput=[];const root=document.querySelector('#${name} .editor');root.addEventListener('beforeinput',event=>hostProofInput.push({type:event.inputType,data:event.data,trusted:event.isTrusted}));products.clearHistory()})()`);
        await focusTarget(name);
        const own = `${name[0]}😀한글`;
        run('keyboard', 'inserttext', own);
        const typed = await converge();
        const expectedOwn = before.slice(0,target.text.length) + own + before.slice(target.text.length);
        assert.equal(modelText(nodeAt(typed.server,target.path)), expectedOwn);
        entry.input = evaluate('hostProofInput');
        assert.ok(entry.input.some(event => event.trusted && event.type === 'insertText'), 'No trusted native text input');
        const foreign = '[foreign]';
        await remote(profile,doc,target.path,foreign);
        const received = await converge();
        assert.equal(modelText(nodeAt(received.server,target.path)), foreign+expectedOwn);
        tool(name,'Undo');
        const undone = await converge();
        entry.undo = modelText(nodeAt(undone.server,target.path));
        assert.equal(entry.undo,foreign+before,'One actor-owned undo must remove the whole native insert and preserve foreign text');
        tool(name,'Redo');
        const redone = await converge();
        entry.redo = modelText(nodeAt(redone.server,target.path));
        assert.equal(entry.redo,foreign+expectedOwn,'One redo must restore the whole native insert');
        await focusTarget(name);
        run('press','Shift+ArrowRight');run('press','Shift+ArrowRight');
        entry.forward=evaluate(`({range:products.range('${name}'),dom:window.getSelection().toString()})`);
        assert.ok(entry.forward.dom.length>0);
        assert.ok(entry.forward.range.anchor.at(-1)<entry.forward.range.focus.at(-1));
        run('press','ArrowRight');
        run('press','Shift+ArrowLeft');run('press','Shift+ArrowLeft');
        entry.backward=evaluate(`({range:products.range('${name}'),dom:window.getSelection().toString()})`);
        assert.ok(entry.backward.dom.length>0);
        assert.ok(entry.backward.range.anchor.at(-1)>entry.backward.range.focus.at(-1));
        const textBeforeOffline=foreign+expectedOwn;
        evaluate(`(()=>{window.hostProofMounted=document.querySelector('#${name} .editor');products.disconnect('${name}')})()`);
        const offlineMarker='[replay]';
        await remote(profile,doc,target.path,offlineMarker);
        entry.offline=await poll(`(async()=>{const s=await products.snapshot();const text=model=>products.target.path.reduce((n,i)=>n.children[i],model).runs.map(r=>r.text??'').join('');return s.peers.filter(p=>p.name!=='${name}').every(p=>text(p.model).startsWith('[replay]')&&text(p.native).startsWith('[replay]'))?s:false})()`, 'foreign receipt on the other connected peers');
        const disconnected=entry.offline.peers.find(peer=>peer.name===name);
        assert.equal(disconnected.online,false);
        assert.equal(modelText(nodeAt(disconnected.model,target.path)),textBeforeOffline);
        assert.equal(modelText(nodeAt(disconnected.native,target.path)),textBeforeOffline);
        evaluate(`products.connect('${name}')`);
        const replayed=await converge();
        assert.equal(modelText(nodeAt(replayed.server,target.path)),offlineMarker+textBeforeOffline);
        const sameMounted=evaluate(`hostProofMounted===document.querySelector('#${name} .editor')`);
        assert.equal(sameMounted,true);
        entry.offline={selectedOnline:disconnected.online,selectedNative:modelText(nodeAt(disconnected.native,target.path)),othersReceived:true};
        entry.reconnect={sameMounted,equal:replayed.equal,pending:replayed.peers.map(peer=>peer.pending),seq:replayed.peers.map(peer=>peer.seq)};
        entry.errors=evaluate('products.errors');assert.deepEqual(entry.errors,[]);
        entry.browserErrors=run('errors');assert.deepEqual(entry.browserErrors.errors??[],[]);
        run('screenshot',resolve(output,`${profile}-${name}.png`));
        entry.result='PASS';
        await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
        console.log(JSON.stringify({profile,editor:name,result:'PASS'}));
    }
    receipt.result='PASS';
} catch(error) {
    firstFailure=error;
    receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);
    const active=receipt.cases.at(-1);if(active?.result==='RUNNING')active.result='FAIL';
    try{run('screenshot',resolve(output,'first-failure.png'));}catch{}
    throw error;
} finally {
    await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    try{run('close');}catch(error){if(!firstFailure)throw error;}
}
