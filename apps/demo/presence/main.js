import {createElement,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {createApp,h} from 'vue';
import {createComponent} from 'solid-js';
import {render as renderSolid} from 'solid-js/web';
import {PresenceOverlay as SolidPresence} from '@barocss/doc-sync-presence-solid';
import {mount as mountSvelte,unmount as unmountSvelte} from 'svelte';
import {Client} from '@barocss/doc-sync/client';
import {DocHub} from '@barocss/doc-sync/server';
import {createPresenceStore,connectClientPresence} from '@barocss/doc-sync/presence';
import {mountPresence,createPresenceProjector} from '@barocss/doc-sync-presence-ui';
import {PresenceOverlay as ReactPresence} from '@barocss/doc-sync-presence-react';
import {PresenceOverlay as VuePresence} from '@barocss/doc-sync-presence-vue';
import {PresenceOverlay as SveltePresence} from '@barocss/doc-sync-presence-svelte';
import {EditorView} from 'prosemirror-view';
import {TextSelection} from 'prosemirror-state';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap} from 'prosemirror-commands';
import {PmBinding,buildPmSchema,pmPosToPath,pathToPmPos} from '@barocss/doc-sync-prosemirror';
import {CLIENT_SCHEMA,seedEdits,textOf} from '../client/model.js';

const errors=[],counters={subscriptions:0,uiSubscriptions:0,sends:0,presence:0};
function report(error){errors.push(String(error?.stack??error));const output=document.querySelector('#errors');output.hidden=false;output.textContent=errors.join('\n');}
window.addEventListener('error',event=>report(event.error??event.message));
window.addEventListener('unhandledrejection',event=>report(event.reason));
const hub=new DocHub({schema:CLIENT_SCHEMA});
const seed=new Client({schema:CLIENT_SCHEMA,actor:'seed'});
const seedOps=seed.edit(seedEdits());hub.submit({actor:'seed',seq:1,ops:seedOps});seed.dispose();
function transport(actor){return {
  subscribe(since,receive,epoch){counters.subscriptions++;let active=true;const deliver=event=>queueMicrotask(()=>{if(active)receive(event);});const hello=hub.hello(since,epoch);deliver(hello);if(hello.type==='hello'&&!hello.snapshot&&since>0)hub.since(since).forEach(envelope=>deliver({type:'change',envelope}));hub.connect(actor,hello.type==='hello'&&hello.snapshot?hub.serverSeq:since);const stop=hub.listen(deliver);return()=>{active=false;counters.subscriptions--;stop();hub.disconnect(actor);hub.dropPresence(actor);};},
  async send(message){counters.sends++;await Promise.resolve();if(message.kind==='change')hub.submit(message.change);else hub.ack(message.ack);},
  sendPresence(value){counters.presence++;hub.setPresence(value);},
};}
const clients=['author','observer','assistant'].map(actor=>new Client({schema:CLIENT_SCHEMA,actor,profile:{name:actor==='author'?'Mina':actor==='assistant'?'Orbit':'Observer',kind:actor==='assistant'?'bot':'human'},transport:transport(actor)}));
const [author,observer,assistant]=clients;
const authorStore=createPresenceStore({actor:author.actor,profile:author.profile});
const store=createPresenceStore({actor:observer.actor,profile:observer.profile});
const botStore=createPresenceStore({actor:assistant.actor,profile:assistant.profile});
const bridges=[connectClientPresence(authorStore,author,{initialPresence:{anchor:null,focus:null}}),connectClientPresence(store,observer,{initialPresence:{anchor:null,focus:null}}),connectClientPresence(botStore,assistant,{initialPresence:{anchor:null,focus:null}})];
const uiStore={...store,subscribe(listener){counters.uiSubscriptions++;const stop=store.subscribe(listener);let active=true;return()=>{if(!active)return;active=false;counters.uiSubscriptions--;stop();};}};
const surfaces=[];let mounted=false,hiddenTarget=false,currentTarget=null,draftText='',draftComposing=false,draftRange={start:0,end:0,direction:'none'};
const input=document.querySelector('#draft-input');
const settle=()=>new Promise(resolve=>setTimeout(resolve,80));
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Presence demo did not synchronize');}
function documentTarget(anchor=2,focus=anchor){const a=author.captureAnchor([0,anchor]),f=author.captureAnchor([0,focus]);if(!a||!f)throw Error('Document anchor unavailable');return {kind:'document',anchor:a,focus:f};}
function targetFor(kind){if(kind==='graphic')return {kind,objectIds:['shape-blue'],pointer:{x:30,y:20}};if(kind==='spreadsheet')return {kind,sheetId:'sheet-main',rowId:'row-1',columnId:'col-b'};return documentTarget();}
function publishDraft(){authorStore.updateLocal({cursor:currentTarget,selection:currentTarget,draft:draftText?{target:currentTarget,text:draftText,selection:draftRange,composing:draftComposing}:null});}
function project(surface){return createPresenceProjector({
  document(target,context){
    if(hiddenTarget)return null;
    const anchor=author.locateAnchor(target.anchor),focus=author.locateAnchor(target.focus??target.anchor);
    if(!anchor||!focus)return null;
    try {
      const a=pathToPmPos(CLIENT_SCHEMA,surface.view.state.doc,anchor,author.model()),f=pathToPmPos(CLIENT_SCHEMA,surface.view.state.doc,focus,author.model());
      if(a===null||f===null)return null;
      if(context.role==='cursor'||context.role==='draft'||a===f){
        const caret=surface.view.coordsAtPos(context.role==='cursor'?f:a);
        if(context.role==='draft'){
          const box=surface.view.dom.getBoundingClientRect();
          return {rects:[{x:caret.left,y:caret.top,width:Math.max(1,box.right-caret.left),height:Math.max(caret.bottom-caret.top,box.bottom-caret.top)}]};
        }
        return {rects:[{x:caret.left,y:caret.top,width:1,height:caret.bottom-caret.top}]};
      }
      const left=surface.view.domAtPos(Math.min(a,f)),right=surface.view.domAtPos(Math.max(a,f)),range=document.createRange();
      range.setStart(left.node,left.offset);range.setEnd(right.node,right.offset);
      return {rects:[...range.getClientRects()].map(rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height}))};
    }catch{return null;}
  },
  graphic(target,context){
    if(hiddenTarget||!target.objectIds.includes('shape-blue'))return null;
    const rect=surface.host.querySelector('[data-object-id="shape-blue"]').getBoundingClientRect();
    if(context.role==='cursor'&&target.pointer)return {rects:[{x:rect.x+target.pointer.x,y:rect.y+target.pointer.y,width:1,height:18}]};
    return {rects:[{x:rect.x,y:rect.y,width:rect.width,height:rect.height}]};
  },
  spreadsheet(target){if(hiddenTarget||target.sheetId!=='sheet-main'||target.rowId!=='row-1'||target.columnId!=='col-b')return null;const rect=surface.host.querySelector('[data-cell="row-1:col-b"]').getBoundingClientRect();return {rects:[{x:rect.x,y:rect.y,width:rect.width,height:rect.height}]};},
});}
async function unmountOverlays(){if(!mounted)return;mounted=false;for(const surface of surfaces){await surface.cleanup?.();surface.cleanup=null;surface.mount.replaceChildren();}await settle();}
async function mountOverlays(){if(mounted)return;mounted=true;for(const surface of surfaces){const options={projector:project(surface)};if(surface.name==='dom'){const ui=mountPresence(surface.mount,uiStore,options);surface.cleanup=()=>ui.dispose();}else if(surface.name==='react'){const root=createRoot(surface.mount);root.render(createElement(StrictMode,null,createElement(ReactPresence,{store:uiStore,options,style:{position:'absolute',inset:0}})));surface.cleanup=()=>root.unmount();}else if(surface.name==='vue'){const app=createApp({render:()=>h(VuePresence,{store:uiStore,options,style:{position:'absolute',inset:0}})});app.mount(surface.mount);surface.cleanup=()=>app.unmount();}else if(surface.name==='solid'){surface.cleanup=renderSolid(()=>createComponent(SolidPresence,{store:uiStore,options,style:{position:'absolute',inset:0}}),surface.mount);}else{const component=mountSvelte(SveltePresence,{target:surface.mount,props:{store:uiStore,options,style:'position:absolute;inset:0'}});surface.cleanup=()=>unmountSvelte(component);}}await settle();}
function makeSurfaces(){for(const name of ['dom','react','vue','svelte','solid']){const article=document.createElement('article');article.dataset.framework=name;article.innerHTML=`<h2>${name==='dom'?'DOM':name[0].toUpperCase()+name.slice(1)}</h2><div class="overlay-host"><div class="editor-host"></div><div class="fixture"><div class="fixture-label">GRAPHIC FIXTURE</div><div class="graphic-object" data-object-id="shape-blue"></div></div><div class="fixture"><div class="fixture-label">SHEET FIXTURE</div><div class="sheet"><div class="cell">A1</div><div class="cell" data-cell="row-1:col-b">B1</div><div class="cell">C1</div></div></div><div class="framework-mount"></div></div>`;document.querySelector('#surfaces').append(article);const host=article.querySelector('.overlay-host'),mount=article.querySelector('.framework-mount');const binding=new PmBinding(author,buildPmSchema(CLIENT_SCHEMA,{paragraph:()=>['p',0],heading:()=>['h2',0]}),[keymap(baseKeymap)]);const surface={name,host,mount,binding,view:null,cleanup:null};const view=new EditorView(article.querySelector('.editor-host'),{state:binding.state,dispatchTransaction(tr){binding.dispatch(tr);if(tr.selectionSet){const a=pmPosToPath(CLIENT_SCHEMA,binding.state.doc,binding.state.selection.anchor,author.model()),f=pmPosToPath(CLIENT_SCHEMA,binding.state.doc,binding.state.selection.head,author.model());const anchor=author.captureAnchor(a),focus=author.captureAnchor(f);if(anchor&&focus){currentTarget={kind:'document',anchor,focus};publishDraft();}}},attributes:{'aria-label':`${name} editor`,role:'textbox',spellcheck:'false'}});surface.view=view;binding.view=view;binding.onChange=()=>view.updateState(binding.state);surfaces.push(surface);}}
function snapshot(){return {ready:api.ready,text:textOf(author.model()),model:author.model(),history:author.historyStatus(),serverSeq:hub.serverSeq,states:store.getSnapshot(),online:author.online,mounted,errors:[...errors],counters:{...counters},clients:clients.map(client=>({actor:client.actor,online:client.online,synchronized:client.synchronized,text:textOf(client.model())})),surfaceTexts:surfaces.map(surface=>({name:surface.name,text:surface.view.state.doc.textContent})),draft:{text:draftText,composing:draftComposing,selection:draftRange},target:currentTarget};}
const actions={
  async draft(text,composing=false){draftText=text;draftComposing=composing;draftRange={start:text.length,end:text.length,direction:'none'};input.value=text;publishDraft();await settle();return snapshot();},
  async draftSelection(start,end,direction='forward'){draftRange={start,end,direction};input.setSelectionRange(start,end,direction);publishDraft();await settle();return snapshot();},
  async confirm(){if(draftComposing)throw Error('Finish composition before confirming');if(!draftText)return snapshot();if(currentTarget.kind!=='document')throw Error('Fixture targets cannot change document content');const path=author.locateAnchor(currentTarget.anchor);if(!path)throw Error('Draft target is missing');author.edit([{op:'insert',at:path,content:draftText}]);await until(()=>author.synchronized);await actions.cancel();return snapshot();},
  async cancel(){draftText='';draftComposing=false;draftRange={start:0,end:0,direction:'none'};input.value='';publishDraft();await settle();return snapshot();},
  async selection(anchor,focus=anchor){currentTarget=documentTarget(anchor,focus);const view=surfaces[0].view;const a=pathToPmPos(CLIENT_SCHEMA,view.state.doc,[0,anchor],author.model()),f=pathToPmPos(CLIENT_SCHEMA,view.state.doc,[0,focus],author.model());surfaces[0].binding.dispatch(surfaces[0].binding.state.tr.setSelection(TextSelection.create(view.state.doc,a,f)));publishDraft();await settle();return snapshot();},
  async target(kind){currentTarget=targetFor(kind);publishDraft();await settle();return snapshot();},
  async disconnect(){author.disconnect();document.querySelector('#connection').textContent='Disconnected';await settle();return snapshot();},
  async reconnect(){author.connect();await until(()=>author.synchronized);draftText='';draftComposing=false;draftRange={start:0,end:0,direction:'none'};input.value='';publishDraft();document.querySelector('#connection').textContent='Connected';await settle();return snapshot();},
  async unmount(){await unmountOverlays();return snapshot();},async mount(){await mountOverlays();return snapshot();},
  async undo(){author.undo();await until(()=>author.synchronized);await settle();return snapshot();},async redo(){author.redo();await until(()=>author.synchronized);await settle();return snapshot();},
  async removeTarget(value=true){hiddenTarget=value;await unmountOverlays();await mountOverlays();return snapshot();},
  async peerEdit(text='Peer '){assistant.edit([{op:'insert',at:[1,0],content:text}]);await until(()=>assistant.synchronized&&author.synchronized);await settle();return snapshot();},
};
const api={version:'presence-components-v1',ready:false,snapshot,actions};window.__presenceDemo=api;
input.addEventListener('input',event=>void actions.draft(input.value,event.isComposing).catch(report));
input.addEventListener('compositionstart',()=>{draftComposing=true;publishDraft();});
input.addEventListener('compositionend',()=>void actions.draft(input.value,false).catch(report));
input.addEventListener('select',()=>{draftRange={start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};publishDraft();});
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>{const name=button.dataset.action;if(name.startsWith('target-'))void actions.target(name.slice(7)).catch(report);else void actions[name]().catch(report);});
async function boot(){clients.forEach(client=>client.connect());await until(()=>clients.every(client=>client.synchronized));makeSurfaces();author.clearHistory();assistant.clearHistory();currentTarget=documentTarget(2,7);authorStore.updateLocal({cursor:currentTarget,selection:currentTarget,activity:'active'});botStore.updateLocal({cursor:documentTarget(10),activity:'active'});await mountOverlays();await settle();api.ready=true;}
boot().catch(report);
