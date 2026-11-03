import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createComponent,createSignal,createRoot} from 'solid-js';
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {PresenceProvider,PresenceOverlay,createPresence,AvatarStack} from '../dist/index.js';
const tracked=actor=>{const source=createPresenceStore({actor});let count=0;return {source,count:()=>count,store:{...source,subscribe(fn){count++;const stop=source.subscribe(fn);return()=>{count--;stop();};}}};};
test('reactive provider replacement updates snapshots and releases old subscriptions on remount',async()=>{
  const dom=new JSDOM('<div id="app"></div>',{pretendToBeVisual:true});
  for(const key of ['window','document','Element','HTMLElement','Node'])globalThis[key]=key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key];
  const {render}=await import('solid-js/web');
  const a=tracked('a'),b=tracked('b');
  try{for(let round=0;round<2;round++){
    const [current,setCurrent]=createSignal(a.store);let states;
    const dispose=render(()=>createComponent(PresenceProvider,{get store(){return current();},get children(){states=createPresence();return createComponent(PresenceOverlay,{options:{projector:()=>null}});}}),document.querySelector('#app'));
    assert.equal(a.count(),2);assert.equal(b.count(),0);
    a.source.updateLocal({activity:'active'});assert.deepEqual(states(),a.source.getSnapshot());
    setCurrent(b.store);assert.equal(a.count(),0);assert.equal(b.count(),2);assert.deepEqual(states(),b.source.getSnapshot());
    const previous=states();a.source.updateLocal({activity:'idle'});assert.equal(states(),previous);
    b.source.updateLocal({activity:'active'});assert.deepEqual(states(),b.source.getSnapshot());
    assert.equal(document.querySelectorAll('[data-doc-sync-presence="solid"]').length,1);
    dispose();assert.equal(a.count()+b.count(),0);assert.equal(document.querySelector('#app').childNodes.length,0);
  }
    const [options,setOptions]=createSignal({projector:()=>null});
    a.source.updateLocal({activity:'active'});
    const dispose=render(()=>createComponent(AvatarStack,{store:a.store,get options(){return options();}}),document.querySelector('#app'));
    assert.equal(a.count(),1);
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(document.querySelectorAll('[data-presence-primitive="AvatarStack"]').length,1);
    setOptions({projector:()=>null,maxAvatars:0});
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(document.querySelectorAll('[data-presence-primitive="AvatarStack"]').length,0);
    assert.equal(a.count(),1);dispose();assert.equal(a.count(),0);
  }finally{dom.window.close();for(const key of ['window','document','Element','HTMLElement','Node'])delete globalThis[key];}
});
test('explicit accessor replacement is owner scoped',()=>{
  const a=tracked('a'),b=tracked('b');let setCurrent,states,dispose;
  createRoot(stop=>{dispose=stop;const [source,set]=createSignal(a.store);setCurrent=set;states=createPresence(source);});
  assert.equal(a.count(),1);setCurrent(b.store);assert.equal(a.count(),0);assert.equal(b.count(),1);
  assert.deepEqual(states(),b.source.getSnapshot());dispose();assert.equal(b.count(),0);
  assert.throws(()=>createPresence(a.store),/Solid owner/);
});
