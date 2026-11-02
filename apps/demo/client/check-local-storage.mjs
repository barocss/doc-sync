// Owned Google Chrome session and unique localStorage key. No shared browser cleanup.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const url = option('--url');
if (!url) throw Error('Usage: node apps/demo/client/check-local-storage.mjs --url http://127.0.0.1:PORT --output OUTPUT');
const output = resolve(option('--output') ?? `output/local-persistence/chrome-${Date.now()}`);
await mkdir(output, {recursive: true});
const session = `local-persistence-${process.pid}-${Date.now()}`;
const key = `doc-sync-proof:${session}`;
const compositionOnly = process.argv.includes('--composition-only');
const receipt = {result: 'RUNNING', session, key, url, startedAt: new Date().toISOString(), cases: [], commands: [], scope: 'Trusted Chrome input, manual browser save/open, refresh, shared undo/redo and failure preservation. No OS crash or power-loss proof.'};
const run = (...args) => {
    const record = {args}; receipt.commands.push(record);
    const response = JSON.parse(execFileSync('agent-browser', ['--session', session, '--executable-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--json', ...args], {encoding: 'utf8', timeout: 45000, maxBuffer: 5000000}));
    record.success = response.success;
    if (!response.success) throw Error(JSON.stringify(response));
    return response.data;
};
const evaluate = code => run('eval', '-b', Buffer.from(code).toString('base64')).result;
const snapshot = () => evaluate('__clientDemo.snapshot()');
const settle = () => {
    const deadline = Date.now() + 15000;
    let state;
    while (Date.now() < deadline) {
        const probe = evaluate(`(()=>{const d=window.__clientDemo;let state,error;try{state=d?.snapshot()}catch(e){error=String(e)}return {ready:d?.ready,busy:d?.busy,status:d?.persistence,documentReady:document.readyState,visibility:document.visibilityState,errors:document.querySelector('#errors')?.textContent,views:[...document.querySelectorAll('[data-editor]')].map(p=>({name:p.dataset.editor,html:p.querySelector('.mount').innerHTML.slice(0,500)})),state,error}})()`);
        receipt.lastProbe = probe;
        writeFileSync(resolve(output, 'progress.json'), JSON.stringify(receipt, null, 2));
        state = probe.state;
        if (state?.ready && !state.busy && state.peers.every(p=>JSON.stringify(p.model)===JSON.stringify(p.native))) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60);
    }
    assert.ok(state?.ready && !state.busy && state.peers.every(p=>JSON.stringify(p.model)===JSON.stringify(p.native)), 'Native/model equality and ready timeout; see lastProbe'); assert.deepEqual(state.errors, []); assert.deepEqual(state.counters, {hubs: 0, subscriptions: 0, sends: 0, presence: 0});
    for (const peer of state.peers) { assert.deepEqual(peer.model, state.peers[0].model); assert.deepEqual(peer.notifications, []); }
    return state;
};
const open = query => { run('open', `${url}/?${query}&storageKey=${encodeURIComponent(key)}`); return settle(); };
const bytes = () => evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
const click = selector => {
    evaluate(`(()=>{window.__storageClick=null;const b=document.querySelector(${JSON.stringify(selector)});b.scrollIntoView({block:'center'});b.addEventListener('click',e=>window.__storageClick={trusted:e.isTrusted,id:b.id},{once:true});})()`);
    run('click', selector);
    assert.deepEqual(evaluate('__storageClick'), {trusted:true,id:selector.slice(1)});
    return settle();
};
const check = (name, action) => { action(); receipt.cases.push({name, result: 'PASS'}); };
let failure;
try {
    const initial = open('mode=local&persist=1'); const base = initial.peers[0].text;
    if (compositionOnly) {
        receipt.scope = 'Synthetic Slate empty-draft browser composition guard only; not OS IME. Owned session and dedicated storage key.';
        check('empty Slate composition rejects save/open without changing live or saved state, then resumes', () => {
            evaluate('__clientDemo.insertPrefix("ProseMirror")'); const saved = settle(); click('#save-local');
            const savedBytes = bytes(); assert.ok(savedBytes);
            evaluate('__clientDemo.insertPrefix("ProseMirror")'); const live = settle();
            assert.notDeepEqual(live.peers[0].model, saved.peers[0].model);
            receipt.compositionStart = evaluate(`(()=>{const element=document.querySelector('[data-editor="Slate"] [aria-label="Slate"]');const event=new CompositionEvent('compositionstart',{bubbles:true,data:''});element.dispatchEvent(event);return {trusted:event.isTrusted,data:event.data};})()`);
            assert.deepEqual(receipt.compositionStart, {trusted:false,data:''});
            for (const selector of ['#open-local', '#save-local']) {
                const blocked = click(selector);
                assert.match(evaluate('__clientDemo.persistence.status'), /composition/i);
                for (const peer of blocked.peers) {assert.deepEqual(peer.model,live.peers[0].model);assert.deepEqual(peer.history,live.peers[0].history);assert.equal(peer.actor,live.peers[0].actor);}
                assert.equal(bytes(),savedBytes);
                receipt[selector === '#open-local' ? 'blockedOpen' : 'blockedSave'] = {state:blocked,status:evaluate('__clientDemo.persistence.status'),savedBytes:bytes()};
            }
            receipt.compositionEnd = evaluate(`(()=>{const element=document.querySelector('[data-editor="Slate"] [aria-label="Slate"]');const event=new CompositionEvent('compositionend',{bubbles:true,data:''});element.dispatchEvent(event);return {trusted:event.isTrusted,data:event.data};})()`);
            settle(); click('#save-local'); assert.match(evaluate('__clientDemo.persistence.status'), /^Saved/);
            const resumedBytes = bytes(); assert.notEqual(resumedBytes,savedBytes);
            evaluate('__clientDemo.insertPrefix("ProseMirror")'); settle();
            const opened = click('#open-local'); assert.match(evaluate('__clientDemo.persistence.status'), /^Opened/);
            assert.deepEqual(opened.peers[0].model,live.peers[0].model);assert.equal(bytes(),resumedBytes);
            receipt.resumed = {state:opened,savedBytes:resumedBytes};
        });
    } else {
    check('trusted input, save, refresh, shared undo and redo', () => {
        run('click', '[data-editor="ProseMirror"] [aria-label="ProseMirror"]');
        for (let i = 0; i < 5; i++) run('press', 'ArrowUp'); run('press', 'Home');
        evaluate('__clientDemo.select("ProseMirror", {anchor:[0,0],focus:[0,0]})');
        evaluate(`window.__persistenceInput=[];document.addEventListener('beforeinput', e=>__persistenceInput.push({trusted:e.isTrusted,type:e.inputType}))`);
        run('keyboard', 'inserttext', 'saved😀한글 ');
        assert.ok(evaluate('__persistenceInput.some(e=>e.trusted&&e.type==="insertText")'));
        const typed = settle(); assert.equal(typed.peers[0].text, 'saved😀한글 ' + base);
        click('#save-local'); const saved = bytes(); assert.ok(saved);
        receipt.beforeReload = {state: snapshot(), bytes: saved};
        writeFileSync(resolve(output, 'progress.json'), JSON.stringify(receipt, null, 2));
        run('reload'); const restored = settle();
        receipt.hiddenStartup = {visibility:evaluate('document.visibilityState'), state:restored};
        assert.equal(receipt.hiddenStartup.visibility, 'hidden', 'Hidden-tab startup must be checked before activation');
        run('tab', '0');
        assert.equal(restored.peers[0].text, typed.peers[0].text);
        assert.equal(restored.peers[0].actor, typed.peers[0].actor);
        evaluate('__clientDemo.undo("Slate")'); assert.equal(settle().peers[0].text, base);
        click('#save-local');
        run('reload'); run('tab', '0'); const redo = settle(); assert.equal(redo.peers[0].history.canRedo, true);
        evaluate('__clientDemo.redo("Lexical")'); assert.equal(settle().peers[0].text, typed.peers[0].text);
        click('#save-local'); receipt.saved = snapshot();
    });
    check('all four native views remain editable after save and reload', () => {
        const names = ['ProseMirror', 'Slate', 'Lexical', 'Tiptap'];
        receipt.nativeRoundtrips = [];
        for (const [index, name] of names.entries()) {
            const before = settle().peers[0].text;
            const selector = `[data-editor="${name}"] [aria-label="${name}"]`;
            evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
            run('click', selector);
            evaluate(`__clientDemo.select(${JSON.stringify(name)}, {anchor:[0,0],focus:[0,0]})`);
            evaluate(`window.__persistenceInput=[];document.addEventListener('beforeinput', e=>__persistenceInput.push({trusted:e.isTrusted,type:e.inputType}))`);
            const prefix = `${name}😀 `;
            run('keyboard', 'inserttext', prefix);
            assert.ok(evaluate('__persistenceInput.some(e=>e.trusted&&e.type==="insertText")'));
            const typed = settle(); assert.equal(typed.peers[0].text, prefix + before);
            click('#save-local'); run('reload'); run('tab', '0');
            const loaded = settle(); assert.equal(loaded.peers[0].text, typed.peers[0].text);
            const other = names[(index + 1) % names.length];
            evaluate(`__clientDemo.undo(${JSON.stringify(other)})`); assert.equal(settle().peers[0].text, before);
            evaluate(`__clientDemo.redo(${JSON.stringify(other)})`); assert.equal(settle().peers[0].text, typed.peers[0].text);
            receipt.nativeRoundtrips.push({name,historyView:other,result:'PASS'});
        }
        click('#save-local'); receipt.saved = snapshot();
    });
    check('manual open replaces unsaved edits and restores selections', () => {
        evaluate('__clientDemo.select("ProseMirror", {anchor:[0,1],focus:[0,3]})'); settle(); click('#save-local');
        evaluate('__clientDemo.insertPrefix("Slate")'); settle(); click('#open-local');
        const opened = settle(); assert.equal(opened.peers[0].text, receipt.saved.peers[0].text);
        assert.deepEqual(opened.peers[0].selection, {anchor:[0,1],focus:[0,3]});
    });
    check('quota failure preserves prior saved bytes and live edits', () => {
        const before = bytes(); evaluate('__clientDemo.insertPrefix("Slate")'); const live = settle();
        evaluate('window.__originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(){throw new DOMException("Quota exceeded", "QuotaExceededError")}');
        click('#save-local'); assert.equal(bytes(), before); assert.equal(snapshot().peers[0].text, live.peers[0].text);
        assert.match(evaluate('__clientDemo.persistence.status'), /failed/i);
        evaluate('Storage.prototype.setItem = window.__originalSetItem');
    });
    check('malformed and schema-mismatched opens retain live client and saved bytes', () => {
        const valid = bytes(), live = settle();
        for (const invalid of ['{', JSON.stringify({...JSON.parse(valid), state: {...JSON.parse(valid).state, schemaVersion: 'wrong'}})]) {
            evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(invalid)})`);
            click('#open-local'); assert.equal(bytes(), invalid); assert.deepEqual(snapshot().peers[0].model, live.peers[0].model);
            assert.match(evaluate('__clientDemo.persistence.status'), /failed/i);
        }
        evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(valid)})`);
    });
    check('mount failure rolls back to the previous client', () => {
        const live = settle(), saved = bytes();
        evaluate(`(()=>{const mount=document.querySelector('[data-editor="Slate"] .mount');const original=mount.replaceChildren;let calls=0;mount.replaceChildren=function(...args){if(++calls===2){mount.replaceChildren=original;throw Error('Injected mount failure')}return original.apply(this,args)};})()`);
        click('#open-local'); const rolledBack = settle();
        assert.deepEqual(rolledBack.peers[0].model, live.peers[0].model); assert.deepEqual(rolledBack.peers[0].history, live.peers[0].history); assert.equal(bytes(), saved);
    });
    check('forget keeps the open document and refresh restores the sample', () => {
        const live = settle(); click('#forget-local'); assert.equal(bytes(), null); assert.deepEqual(snapshot().peers[0].model, live.peers[0].model);
        run('reload'); run('tab', '0'); assert.equal(settle().peers[0].text, base);
    });
    check('default local route remains ephemeral', () => {
        open('mode=local'); evaluate('__clientDemo.insertPrefix("ProseMirror")'); settle(); run('reload'); run('tab', '0'); assert.equal(settle().peers[0].text, base);
        assert.equal(evaluate('__clientDemo.persistence.enabled'), false);
    });
    // Disabled routes must not change the dedicated key. Sync uses its own counters.
    for (const query of ['mode=local&api=legacy&persist=1', 'mode=sync&persist=1']) {
        run('open', `${url}/?${query}&storageKey=${encodeURIComponent(key)}`); run('wait', '--fn', '!!window.__clientDemo?.ready&&!__clientDemo.busy');
        assert.equal(evaluate('__clientDemo.persistence.enabled'), false); assert.match(evaluate('__clientDemo.persistence.status'), /disabled/i); assert.equal(bytes(), null);
        assert.equal(evaluate('[...document.querySelectorAll("#local-storage button")].every(b=>b.hidden)'), true);
        receipt.cases.push({name: `${query}: storage disabled`, result: 'PASS'});
    }
    }
    run('screenshot', resolve(output, compositionOnly ? 'synthetic-composition-guard.png' : 'disabled-sync.png'));
    assert.deepEqual(run('errors').errors ?? [], []); receipt.result = 'PASS';
} catch (error) { failure = error; receipt.result = 'FAIL'; receipt.firstFailure = String(error.stack ?? error); try { receipt.failureState = snapshot(); } catch (captureError) { receipt.captureError=String(captureError); } try { run('screenshot', resolve(output, 'failure.png')); } catch {} }
finally {
    try { evaluate(`localStorage.removeItem(${JSON.stringify(key)})`); run('close'); receipt.cleanup = 'PASS (owned key and session only)'; } catch (error) { receipt.cleanup = String(error); failure ??= error; receipt.result = 'FAIL'; }
    receipt.finishedAt = new Date().toISOString(); await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify({result: receipt.result, output, firstFailure: receipt.firstFailure ?? null}));
if (failure) throw failure;
