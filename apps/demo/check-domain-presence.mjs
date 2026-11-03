// Desktop-only Chrome proof. Both origins must be isolated test servers.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Client} from '@barocss/doc-sync/client';
import {anchorAt} from '@barocss/doc-sync';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {PRODUCT_SCHEMAS} from '../../fixtures/product-schemas.ts';
const [graphic,document,outArg]=process.argv.slice(2);if(!outArg)throw Error('Expected graphic-origin document-origin output-dir');
const out=resolve(outArg);await mkdir(out,{recursive:true});const session=`domain-ephemeral-${process.pid}`,doc=`ephemeral-${Date.now()}`,checks=[];
const receipt={status:'RUNNING',graphic,document,doc,checks,osIME:'NOT_RUN',mobile:'NOT_RUN',sharedDraftRendering:'NOT_IMPLEMENTED',sharedDragPreview:'NOT_IMPLEMENTED'};
const cli=(...args)=>{const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--executable-path','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--json',...args],{encoding:'utf8',timeout:35000,maxBuffer:15e6}));if(!r.success)throw Error(JSON.stringify(r));return r.data;};
const ev=source=>cli('eval','-b',Buffer.from(source).toString('base64')).result;
const wait=async(source)=>{for(let i=0;i<60;i++){if(ev(source))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out '+source);};
const pass=name=>{checks.push({name,status:'PASS'});console.log('PASS',name);};
const g=()=>ev('__graphicDemo.snapshot()');
const server=async()=>await(await fetch(`${graphic}/api/docs/${doc}/state`)).json();
let external;
try{
 cli('open',`${graphic}/?doc=${doc}`);cli('set','viewport','1720','1080');cli('snapshot','-i');cli('screenshot',resolve(out,'graphic-ready.png'));await wait('window.__graphicDemo?.ready&&__graphicDemo.snapshot().views.every(v=>v.ready&&!v.pending)');
 const initial=g(),target=initial.views[0].objects.find(o=>o.type==='rectangle'&&!o.locked),id=target.id;
 const before=await server();ev(`__graphicDemo.actions.select(0,${JSON.stringify(id)})`);await wait(`__graphicDemo.snapshot().views[1].peers.some(p=>p.metadata?.graphic?.selectedIds?.includes(${JSON.stringify(id)}))`);
 let p=ev(`__graphicDemo.screenPoint(0,${JSON.stringify(id)})`);cli('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));cli('mouse','down');cli('mouse','move',String(Math.round(p.x+36)),String(Math.round(p.y+22)));cli('screenshot',resolve(out,'graphic-drag-local.png'));
 let preview=g();const local=preview.views[0].render.objects.find(o=>o.id===id),remote=preview.views[1].render.objects.find(o=>o.id===id);assert.notDeepEqual(local.displayTransform,initial.views[0].render.objects.find(o=>o.id===id).displayTransform);assert.deepEqual(remote.transform,target.transform);assert.deepEqual(preview.views.map(v=>v.model),initial.views.map(v=>v.model));assert.deepEqual(preview.views.map(v=>v.history),initial.views.map(v=>v.history));assert(preview.views.every(v=>v.pending===0));assert.deepEqual(await server(),before);assert(preview.views[1].render.peerOverlayCount>=1);pass('Graphic native drag preview stays local; remote cursor/selection render; document/history/log sequence unchanged');
 ev("document.querySelector('#canvas-a canvas').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}))");cli('mouse','up');let cancelled=g();assert.deepEqual(cancelled.views[0].render.objects.find(o=>o.id===id).displayTransform,initial.views[0].render.objects.find(o=>o.id===id).displayTransform);assert.deepEqual(await server(),before);pass('Graphic pointercancel restores display and creates no document operation');
 p=ev(`__graphicDemo.screenPoint(0,${JSON.stringify(id)})`);cli('mouse','move',String(Math.round(p.x)),String(Math.round(p.y)));cli('mouse','down');cli('mouse','move',String(Math.round(p.x+30)),String(Math.round(p.y+18)));cli('mouse','up');await wait('__graphicDemo.snapshot().views.every(v=>!v.pending)&&JSON.stringify(__graphicDemo.snapshot().views[0].model)===JSON.stringify(__graphicDemo.snapshot().views[1].model)');assert.equal((await server()).serverSeq,before.serverSeq+1);assert.notDeepEqual(g().views[1].objects.find(o=>o.id===id).transform,target.transform);pass('Graphic pointerup commits exactly one accepted change and reaches peer');
 ev('__graphicDemo.actions.disconnect(0)');await wait('__graphicDemo.snapshot().views[1].peers.length===0');assert.equal(g().views[1].render.peerOverlayCount,0);pass('Graphic disconnect clears peer overlays');
 receipt.graphicFinal=g();
 cli('open',`${document}/?profile=word&doc=${doc}`);cli('snapshot','-i');cli('screenshot',resolve(out,'document-ready.png'));await wait('window.products?.ready()&&products.status().every(p=>p.online&&!p.pending)');
 const documentBefore=ev('products.snapshot()');
 external=new Client({actor:'external-presence',schema:PRODUCT_SCHEMAS.word,transport:new NodeHttpTransport(doc,'external-presence',document+'/profiles/word')});external.connect();for(let i=0;i<200&&!external.synchronized;i++)await new Promise(r=>setTimeout(r,10));assert(external.synchronized);
 const stateBefore=await(await fetch(`${document}/profiles/word/api/docs/${doc}/state`)).json();
 external.setPresence({anchor:anchorAt(external.sync.doc,[1,0,6]),focus:anchorAt(external.sync.doc,[1,0,2]),metadata:{document:{draft:'uncommitted'}}});
 await wait("['Slate','Lexical','ProseMirror'].every(n=>{const r=document.getElementById(n);return r.querySelector('[data-actor=external-presence].agent-presence-caret,[data-actor=external-presence].pm-remote-caret')&&r.querySelector('[data-actor=external-presence].agent-presence-selection,[data-actor=external-presence].pm-remote-selection')})");cli('screenshot',resolve(out,'document-range.png'));
 const documentAfter=ev('products.snapshot()');assert.deepEqual(documentAfter,documentBefore);assert.deepEqual(await(await fetch(`${document}/profiles/word/api/docs/${doc}/state`)).json(),stateBefore);pass('Document PM/Slate/Lexical remote caret and range render without changing native/model/pending/server state');
 external.setPresence({anchor:anchorAt(external.sync.doc,[1,0,4]),focus:null});await wait("['Slate','Lexical','ProseMirror'].every(n=>{const r=document.getElementById(n);return r.querySelector('[data-actor=external-presence].agent-presence-caret,[data-actor=external-presence].pm-remote-caret')&&!r.querySelector('[data-actor=external-presence].agent-presence-selection,[data-actor=external-presence].pm-remote-selection')})");pass('Document collapsed presence renders caret and removes range in all three bindings');external.disconnect();await wait("!document.querySelector('[data-actor=external-presence].agent-presence-caret,[data-actor=external-presence].pm-remote-caret')");pass('Document disconnect removes remote carets');receipt.documentFinal=ev('products.snapshot()');receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.firstFailure=error.stack;console.error(error.stack);try{cli('screenshot',resolve(out,'failure.png'));receipt.failure=ev('window.__graphicDemo?.snapshot()??window.products?.snapshot()');}catch{}process.exitCode=1;}finally{external?.dispose();await writeFile(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2));try{cli('close');}catch{}}
