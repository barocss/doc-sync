import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,createElement,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {PresenceOverlay,usePresence} from '../dist/index.js';
test('StrictMode and remount release hook and UI subscriptions without disposing store',async()=>{
  const dom=new JSDOM('<div id="app"></div>',{pretendToBeVisual:true});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const source=createPresenceStore({actor:'react'});let subscriptions=0;
  const store={...source,subscribe(listener){subscriptions++;const stop=source.subscribe(listener);return()=>{subscriptions--;stop();};}};
  function View(){usePresence(store);return createElement(PresenceOverlay,{store,options:{projector:()=>null}});}
  try{for(let i=0;i<2;i++){const root=createRoot(document.querySelector('#app'));await act(async()=>root.render(createElement(StrictMode,null,createElement(View))));assert.equal(subscriptions,2);await act(async()=>root.unmount());assert.equal(subscriptions,0);source.updateLocal({activity:'active'});}}
  finally{dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
