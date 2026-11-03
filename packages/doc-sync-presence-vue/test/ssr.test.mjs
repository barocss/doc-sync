import test from 'node:test';
import assert from 'node:assert/strict';
import {createSSRApp,h} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {PresenceOverlay,usePresence} from '../dist/index.js';
test('server render and composable do not subscribe or need DOM globals',async()=>{
  const store=createPresenceStore({actor:'server'});store.subscribe=()=>{throw Error('SSR subscribed');};
  const app=createSSRApp({setup(){usePresence(store);return()=>h(PresenceOverlay,{store,options:{projector:()=>null}});}});
  assert.match(await renderToString(app),/data-doc-sync-presence="vue"/);
});
