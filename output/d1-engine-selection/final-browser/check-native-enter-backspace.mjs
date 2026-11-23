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
const receipt = {boundary: 'Non-timing native Chrome Enter and Backspace; OS IME NOT_RUN', result: 'RUNNING', session, origin, browser: null, cases: [], osIME: 'NOT_RUN', reconnectScope: 'products.disconnect(name)/connect(name), remote edit while disconnected, exact replay on the same mounted editor'};
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
    const point=evaluate(`(()=>{const p=[...document.querySelectorAll('#${name} .editor p')].find(p=>p.textContent.includes(products.target.text));if(!p)throw Error('Missing target paragraph');window.hostProofTargetOffset=p.textContent.indexOf(products.target.text)+3;p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();return {x:r.left+Math.min(50,r.width/2),y:r.top+r.height/2}})()`);
    run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');run('mouse','up');
    evaluate(`(()=>{const p=[...document.querySelectorAll('#${name} .editor p')].find(p=>p.textContent.includes(products.target.text));const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){const offset=text.textContent.indexOf(products.target.text);if(offset>=0){window.getSelection().setBaseAndExtent(text,offset+3,text,offset+3);document.dispatchEvent(new Event('selectionchange'));return;}}throw Error('Missing target text node')})()`);
    // Native movement makes the DOM selection visible to all three editor implementations.
    run('press', 'ArrowLeft'); run('press', 'ArrowRight');
    await poll(`(()=>{const r=products.range(${JSON.stringify(name)});return r&&JSON.stringify(r.anchor)===JSON.stringify([...products.target.path,hostProofTargetOffset])&&JSON.stringify(r.focus)===JSON.stringify(r.anchor)?r:false})()`, 'native target caret');
};
let firstFailure;
try {
 for (const profile of ['word','notion','presentation']) for (const name of ['Slate','Lexical','ProseMirror']) {
  const doc=`eb-${profile[0]}-${name[0].toLowerCase()}-${Date.now().toString(36)}`;
  const entry={profile,editor:name,doc,result:'RUNNING'};receipt.cases.push(entry);
  run('open',`${origin}/?profile=${profile}&doc=${doc}&engine=typescript`);run('wait','--fn','!!window.products?.ready()');
  receipt.browser??=evaluate('navigator.userAgent');const initial=await converge(),target=evaluate('products.target');
  const parentPath=target.path.slice(0,-1),index=target.path.at(-1),beforeParent=nodeAt(initial.server,parentPath),beforeText=modelText(nodeAt(initial.server,target.path));
  evaluate(`(()=>{window.hostProofKeys=[];document.querySelector('#${name} .editor').addEventListener('keydown',e=>hostProofKeys.push({key:e.key,trusted:e.isTrusted}),true);window.hostProofInput=[];document.querySelector('#${name} .editor').addEventListener('beforeinput',e=>hostProofInput.push({type:e.inputType,data:e.data,trusted:e.isTrusted}));products.clearHistory()})()`);
  await focusTarget(name);entry.engineBefore=evaluate('structuredClone(products.engine)');
  run('press','Enter');const split=await converge(),splitParent=nodeAt(split.server,parentPath);
  assert.equal(splitParent.children.length,beforeParent.children.length+1,'Enter must add one paragraph');
  assert.equal(modelText(splitParent.children[index]),beforeText.slice(0,3));
  assert.equal(modelText(splitParent.children[index+1]),beforeText.slice(3));
  const surrounding=structuredClone(split.server);nodeAt(surrounding,parentPath).children.splice(index,2,structuredClone(beforeParent.children[index]));
  assert.deepEqual(surrounding,initial.server,'Split must preserve surrounding model');
  entry.split={equal:split.equal,pending:split.peers.map(p=>p.pending),left:modelText(splitParent.children[index]),right:modelText(splitParent.children[index+1]),range:evaluate(`products.range('${name}')`)};
  assert.deepEqual(entry.split.range,{anchor:[...parentPath,index+1,0],focus:[...parentPath,index+1,0]});
  run('press','Backspace');const merged=await converge();assert.deepEqual(merged.server,initial.server,'Backspace must restore exact original model');
  entry.merge={equal:merged.equal,pending:merged.peers.map(p=>p.pending),range:evaluate(`products.range('${name}')`)};
  assert.deepEqual(entry.merge.range,{anchor:[...target.path,3],focus:[...target.path,3]});
  entry.input=evaluate('hostProofInput');entry.keys=evaluate('hostProofKeys');assert.ok(entry.keys.some(e=>e.trusted&&e.key==='Enter'));assert.ok(entry.keys.some(e=>e.trusted&&e.key==='Backspace'));
  entry.engine=evaluate('products.engine');assert.equal(entry.engine.selection,'typescript');assert.equal(entry.engine.peers.length,3);
  const own=entry.engine.peers.find(p=>p.name===name),previous=entry.engineBefore.peers.find(p=>p.name===name);
  entry.ownCallDelta=Object.fromEntries(Object.entries(own.calls).map(([k,v])=>[k,v-(previous.calls[k]??0)]).filter(([,v])=>v));
  assert.ok((entry.ownCallDelta.apply??0)+(entry.ownCallDelta['session.applyModelEdits']??0)+(entry.ownCallDelta.applyModelEdits??0)>0);
  assert.ok(entry.ownCallDelta.record>=2);assert.ok(merged.peers.every(p=>p.pending===0));
  entry.errors=evaluate('products.errors');assert.deepEqual(entry.errors,[]);entry.browserErrors=run('errors');assert.deepEqual(entry.browserErrors.errors??[],[]);
  run('screenshot',resolve(output,`${profile}-${name}.png`));entry.result='PASS';
  await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({profile,editor:name,result:'PASS',calls:entry.ownCallDelta}));
 }
 receipt.result='PASS';
} catch(error) {firstFailure=error;receipt.result='FAIL';receipt.firstFailure=String(error.stack??error);if(receipt.cases.at(-1)?.result==='RUNNING')receipt.cases.at(-1).result='FAIL';try{run('screenshot',resolve(output,'first-failure.png'));}catch{}throw error;}
finally {await writeFile(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');try{run('close');}catch(error){if(!firstFailure)throw error;}}
