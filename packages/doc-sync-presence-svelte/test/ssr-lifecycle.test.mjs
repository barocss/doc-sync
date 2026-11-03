import test from 'node:test';
import assert from 'node:assert/strict';
import {render} from 'svelte/server';
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {PresenceOverlay,presenceReadable} from '../dist/server/index.js';
test('server component import and render do not subscribe or need DOM globals',()=>{
  const store=createPresenceStore({actor:'server'});store.subscribe=()=>{throw Error('SSR subscribed');};
  assert.match(render(PresenceOverlay,{props:{store,options:{projector:()=>null}}}).body,/data-doc-sync-presence="svelte"/);
});
test('readable shares one subscription and refreshes after last reader remount',()=>{
  const source=createPresenceStore({actor:'svelte'});let count=0,latest;
  const store={...source,subscribe(listener){count++;const stop=source.subscribe(listener);return()=>{count--;stop();};}};
  const readable=presenceReadable(store),a=readable.subscribe(value=>latest=value),b=readable.subscribe(()=>{});
  assert.equal(count,1);source.updateLocal({activity:'active'});assert.equal(latest[0].activity,'active');a();assert.equal(count,1);b();assert.equal(count,0);
  source.updateLocal({activity:'idle'});const c=readable.subscribe(value=>latest=value);assert.equal(latest[0].activity,'idle');c();assert.equal(count,0);
});
