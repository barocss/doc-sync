import test from 'node:test';
import assert from 'node:assert/strict';
import {createComponent} from 'solid-js';
import {renderToString} from 'solid-js/web';
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {PresenceProvider,PresenceOverlay,createPresence,AvatarStack,CursorLayer,SelectionLayer,DraftPreview} from '../dist/index.js';
test('SSR renders real Solid components without DOM or subscriptions',()=>{
  const store=createPresenceStore({actor:'server'});
  store.subscribe=()=>{throw Error('SSR subscribed');};
  const html=renderToString(()=>createComponent(PresenceProvider,{store,get children(){
    assert.deepEqual(createPresence()(),store.getSnapshot());
    return [PresenceOverlay,AvatarStack,CursorLayer,SelectionLayer,DraftPreview].map(Component=>createComponent(Component,{options:{projector:()=>null}}));
  }}));
  assert.equal((html.match(/data-doc-sync-presence="solid"/g)||[]).length,5);
});
