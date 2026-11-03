import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {PresenceOverlay} from '../dist/index.js';
test('server rendering does not need DOM globals or subscribe',()=>{
  const store=createPresenceStore({actor:'server'});
  store.subscribe=()=>{throw Error('SSR subscribed');};
  assert.match(renderToString(createElement(PresenceOverlay,{store,options:{projector:()=>null}})),/data-doc-sync-presence="react"/);
});
