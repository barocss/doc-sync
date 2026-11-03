import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPresenceStore} from '@barocss/doc-sync/presence';
test('provider replacement and remount release old subscriptions',async()=>{
  const dom=new JSDOM('<div id="app"></div>',{pretendToBeVisual:true});
  for(const key of ['window','document','Element','SVGElement','HTMLElement'])globalThis[key]=key==='window'?dom.window:key==='document'?dom.window.document:dom.window[key];
  const {createApp,h,shallowRef,nextTick}=await import('vue');
  const {PresenceProvider,PresenceOverlay,usePresence}=await import('../dist/index.js');
  const tracked=actor=>{const source=createPresenceStore({actor});let count=0;return {source,count:()=>count,store:{...source,subscribe(fn){count++;const stop=source.subscribe(fn);return()=>{count--;stop();};}}};};
  const a=tracked('a'),b=tracked('b');
  try{for(let i=0;i<2;i++){const current=shallowRef(a.store);const Child={setup(){usePresence();return()=>h(PresenceOverlay,{options:{projector:()=>null}});}};const app=createApp({render:()=>h(PresenceProvider,{store:current.value},()=>h(Child))});app.mount(document.querySelector('#app'));await nextTick();assert.equal(a.count(),2);current.value=b.store;await nextTick();assert.equal(a.count(),0);assert.equal(b.count(),2);app.unmount();assert.equal(a.count()+b.count(),0);a.source.updateLocal({activity:'active'});}}
  finally{dom.window.close();for(const key of ['window','document','Element','SVGElement','HTMLElement'])delete globalThis[key];}
});
