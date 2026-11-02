import {agentPresence} from './agent-presence.js';
import {createBotAvatar} from './bot-avatar.js';
import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createEditor as createSlateEditor,Editor,Transforms} from 'slate';
import {Slate,Editable,withReact,ReactEditor} from 'slate-react';
import {createEditor as createLexicalEditor,FORMAT_TEXT_COMMAND,SKIP_DOM_SELECTION_TAG} from 'lexical';
import {registerRichText} from '@lexical/rich-text';
import {registerTablePlugin,registerTableSelectionObserver} from '@lexical/table';
import {EditorView} from 'prosemirror-view';
import {TextSelection} from 'prosemirror-state';
import {baseKeymap,toggleMark} from 'prosemirror-commands';
import {keymap} from 'prosemirror-keymap';
import {tableEditing} from 'prosemirror-tables';
import {Doc,canonical,assertCompatibleSchema} from '@barocss/doc-sync';
import {SyncClient,HttpTransport,LiveRecovery,BrowserRecovery,upgradeOpenEditorSchema,botFace,typescriptClientEngineFactory} from '@barocss/doc-sync/sync';
import {SlateBinding,fromSlate,slateRangeToModel,modelRangeToSlate,toSlate} from '@barocss/doc-sync/slate';
import {LexicalBinding,buildLexicalSchema,readLexicalModel,$lexicalSelection,$setLexicalSelection,LEXICAL_REMOTE_TAG} from '@barocss/doc-sync/lexical';
import {PmBinding,buildPmSchema,fromPmJSON,pmPosToPath,pathToPmPos,toPmJSON} from '@barocss/doc-sync/prosemirror';
import {PRODUCT_SCHEMAS} from '../../../fixtures/product-schemas.ts';
import {TARGETS} from './documents.ts';
import {productLeafCodec} from './leaf.mjs';

const query=new URLSearchParams(location.search),recoveryEnabled=query.get('recovery')==='1',profile=query.get('profile')??'word',size=query.get('size')==='large'?'large':'sample';
if(!Object.hasOwn(PRODUCT_SCHEMAS,profile))throw new Error('Unknown product profile');
const engineChoice=query.get('engine');
if(engineChoice!==null&&engineChoice!=='typescript')throw new Error('Unknown production engine');
const engineDiagnostics=[];
function selectedEngineFactory(name){
 const calls=Object.create(null),entry={name,factory:typescriptClientEngineFactory.engine,calls,identity:null};engineDiagnostics.push(entry);
 const track=(value,prefix='')=>new Proxy(value,{get(target,key){const member=Reflect.get(target,key,target);if(typeof member!=='function')return member;return (...args)=>{const method=prefix+String(key);calls[method]=(calls[method]??0)+1;const result=member.apply(target,args);return key==='createSession'?track(result,'session.'):result;};}});
 return {engine:typescriptClientEngineFactory.engine,contractVersion:typescriptClientEngineFactory.contractVersion,create(actor,schema){calls.create=(calls.create??0)+1;const selected=typescriptClientEngineFactory.create(actor,schema);entry.identity=selected.identity();return track(selected);}};
}
let schema=PRODUCT_SCHEMAS[profile];const target=TARGETS[profile],doc=query.get('doc')??`${profile}-${Date.now().toString(36)}`,base=`/profiles/${profile}`;
if(recoveryEnabled&&!query.has('doc')){query.set('doc',doc);history.replaceState(null,'',`${location.pathname}?${query}`);}
const durablePeers=new Map();
// The local bot demo is opt-in. Task execution stays on the local server.
const botSection=document.querySelector('#bot-demo'),botForm=document.querySelector('#bot-task'),botMessage=document.querySelector('#bot-task-status'),botButton=botForm.querySelector('button'),botSelect=document.querySelector('#bot-persona'),botActivity=document.querySelector('#bot-activity');
const botUrl=`/test/bot?profile=${encodeURIComponent(profile)}&doc=${encodeURIComponent(doc)}`;
let botJobs=[],botHistory=[],localBotProfiles=null;
function renderBotJobs(){
 const selected=botJobs.find(job=>job.bot===botSelect.value);
 botButton.disabled=!ready||peers.some(peer=>!peer.client.synchronized)||!botSelect.value||selected?.status==='running'||!!selected?.blocked;
 botActivity.replaceChildren();
 for(const job of botJobs){const item=document.createElement('span');item.className='bot-task-item';item.dataset.bot=job.bot;item.dataset.status=job.status;item.tabIndex=0;item.setAttribute('role','img');const label=`${job.name} · ${job.status==='running'?'working':job.status==='completed'?'done':'needs attention'}`;item.setAttribute('aria-label',label);item.title=job.result??job.error??label;const character=job.character??{mori:'fox',nuri:'owl',bori:'cat',tobi:'robot'}[job.bot];if(character)item.append(createBotAvatar(character,job.status==='running'?'thinking':job.status==='completed'?'happy':'concerned'));botActivity.append(item);}
 if(localBotProfiles?.length===0)botMessage.textContent='No local bot profiles found · Create a profile with the bot CLI';
 else if(selected?.blocked)botMessage.textContent='Recovery inspection required · Do not repeat this task until its journal is resolved';
 else if(selected)botMessage.textContent=selected.status==='running'?`${selected.name} is working · You can keep editing`:selected.status==='completed'?`Done · ${selected.result??'Task completed'}`:`Needs attention · ${selected.error??'Inspect the task'}`;
 else botMessage.textContent='Local demo · Uses your Codex account · Reviewers do not edit';
 const history=document.querySelector('#bot-history');history.hidden=!localBotProfiles;
 const list=document.querySelector('#bot-history-list');list.replaceChildren();
 const entries=botHistory.filter(entry=>entry.bot===botSelect.value);
 if(!entries.length){const item=document.createElement('li');item.textContent='No saved tasks for this bot and document.';list.append(item);}
 for(const entry of entries){const item=document.createElement('li');const title=document.createElement('strong');title.textContent=entry.mission;item.append(title);
  const info=document.createElement('div');info.textContent=`${entry.status} (last saved) · ${entry.createdAt} · ${entry.id}${entry.pending?' · Pending edit: outcome requires inspection':''}`;item.append(info);
  for(const line of [...entry.steps,entry.result,entry.error].filter(Boolean)){const detail=document.createElement('div');detail.textContent=line;item.append(detail);}list.append(item);}
}
async function refreshBot(){try{const response=await fetch(botUrl);if(!response.ok)return;const data=await response.json();botSection.hidden=false;botJobs=data.jobs??[];botHistory=data.history??[];if(data.durable){const next=data.profiles??[];if(JSON.stringify(localBotProfiles)!==JSON.stringify(next)){const previous=botSelect.value;botSelect.replaceChildren();for(const bot of next){const option=document.createElement('option');option.value=bot.id;option.textContent=`${bot.name} · ${bot.role}`;botSelect.append(option);}if(next.some(bot=>bot.id===previous))botSelect.value=previous;localBotProfiles=next;}for(const job of botJobs)if(job.blocked&&job.recoverable)void fetch('/test/bot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,doc,bot:job.bot,action:'recover'})}).catch(()=>{});}renderBotJobs();}catch{/* Demo server may have stopped. */}}
botSelect.addEventListener('change',renderBotJobs);
botForm.addEventListener('submit',async event=>{event.preventDefault();if(!ready||peers.some(peer=>!peer.client.synchronized))return;botButton.disabled=true;botMessage.textContent='Starting bot…';try{const response=await fetch('/test/bot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,doc,bot:botSelect.value,mission:document.querySelector('#bot-mission').value})});if(!response.ok){const data=await response.json();throw Error(data.error??'Unable to start');}await refreshBot();}catch(error){botMessage.textContent=`Could not start · ${error.message}`;botButton.disabled=false;}});
if(query.get('bot')==='1'){refreshBot();setInterval(refreshBot,2000);}
const botQuery=(query.get('bot')==='1'?'&bot=1':'')+(recoveryEnabled?'&recovery=1':'')+(engineChoice?'&engine=typescript':'');
const peers=[],errors=[],records=[];let active=null,ready=false;
const report=error=>{errors.push(String(error.stack??error));document.querySelector('#errors').textContent=errors.join('\n');};
window.addEventListener('error',event=>report(event.error??event.message));window.addEventListener('unhandledrejection',event=>report(event.reason));
for(const name of Object.keys(PRODUCT_SCHEMAS)){
 const link=document.createElement('a');link.className='choice';link.href=`/?profile=${name}&size=${size}${botQuery}`;link.textContent={word:'Word-style',notion:'Notion-style',presentation:'Presentation'}[name];if(name===profile)link.setAttribute('aria-current','page');document.querySelector('#profiles').append(link);
}
const large=document.createElement('a');large.className='choice';large.href=`/?profile=${profile}&size=${size==='large'?'sample':'large'}${botQuery}`;large.textContent=size==='large'?'Open rich sample':'Open 100k text payload';document.querySelector('#profiles').append(large);
const check=document.createElement('button');check.textContent='Check convergence';check.onclick=async()=>{const s=await snapshot();document.querySelector('#proof').textContent=JSON.stringify({equal:s.equal,profile,size,peers:s.peers.map(({name,seq,pending})=>({name,seq,pending})),errors},null,2);};document.querySelector('#profiles').append(check);
const current=()=>active&&!active.complete?active:null;
function findText(peer){return [...peer.element.querySelectorAll('p')].find(node=>node.textContent.startsWith(target.text));}
function observe(peer){
 const observer=new MutationObserver(()=>{
  peer.presence?.schedule();
  const record=current();if(!record||!record.inputAt||record.dom[peer.name])return;
  if(findText(peer)?.textContent!==record.expected)return;
  record.dom[peer.name]={at:performance.now()};
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(findText(peer)?.textContent!==record.expected){record.error='DOM changed before rendering opportunity';return;}
   record.dom[peer.name].raf2=performance.now();
   if(peers.every(peer=>record.dom[peer.name]?.raf2)){record.complete=true;record.endedAt=performance.now();}
  }));
 });observer.observe(peer.element,{subtree:true,childList:true,characterData:true});peer.cleanup.push(()=>observer.disconnect());
 peer.element.addEventListener('beforeinput',event=>{const record=current();if(record?.source===peer.name&&!record.inputAt){record.inputAt=performance.now();record.input={type:event.inputType,data:event.data,trusted:event.isTrusted};}},true);
}
function makePeer(name){
 const section=document.createElement('section');section.className='panel';section.id=name;section.innerHTML=`<div class="panel-head"><h2>${name}</h2><div class="bot-roster" aria-label="Active bots"></div></div><div class="meta">Connecting</div><div class="tools"></div><div class="mount"></div>`;document.querySelector('#panes').append(section);
 const durable=durablePeers.get(name),actor=durable?.actor??`${name}-${crypto.randomUUID().slice(0,8)}`,transport=new HttpTransport(doc,actor,base),peer={name,actor,section,cleanup:[],durable};
 const send=transport.send.bind(transport);transport.send=async message=>{const record=current();if(record&&message.kind==='change'&&name===record.source)record.sendStart=performance.now();try{return await send(message);}finally{if(record&&message.kind==='change'&&name===record.source)record.sendEnd=performance.now();}};
 const subscribe=transport.subscribe.bind(transport);transport.subscribe=(since,handler,epoch,schemaVersion)=>subscribe(since,event=>{
  const record=current(),timed=record&&event.type==='change'&&event.envelope.change?.actor===peers.find(peer=>peer.name===record.source)?.actor;
  if(timed)record.receive[name]={start:performance.now()};handler(event);if(timed)record.receive[name].end=performance.now();
 },epoch,schemaVersion);
 const client=new SyncClient(actor,transport,{schema,ackDelay:50,...(engineChoice?{engineFactory:selectedEngineFactory(name)}:{}),...(durable?{beforeSend:durable.persist}:{})});peer.client=client;peer.transport=transport;
 if(recoveryEnabled){peer.recovery=new LiveRecovery(client,transport,{onProof:durable.saveProof});durable.bind(client,peer.recovery);durable.onFailure=error=>{peer.recoveryStopped=true;peer.section.inert=true;peer.recoveryStatus=error.message;renderPeerStatus(peer);};peer.section.inert=true;peer.recoveryStatus='Preparing recovery protection';peer.recoveryStopped=false;}
 const commit=client.commit.bind(client);client.commit=(ops,record)=>{const measurement=current();if(measurement?.source===name)measurement.commitStart=performance.now();const result=commit(ops,record);if(measurement?.source===name)measurement.commitEnd=performance.now();return result;};
 let presenceSignature='';
 client.onUpdate=()=>{if(recoveryEnabled)scheduleRecovery(peer);renderPeerStatus(peer);const next=JSON.stringify([client.online,[...client.others.values()]]);if(next!==presenceSignature){if(peer.view)peer.view.updateState(peer.view.state);const roster=section.querySelector('.bot-roster');roster.replaceChildren();if(client.online)for(const p of client.others.values()){const face=botFace(p.character,p.expression);if(!face)continue;const chip=document.createElement('span');chip.className='bot-chip';chip.dataset.actor=p.actor;chip.dataset.character=p.character;chip.dataset.expression=p.expression;const mode=p.anchor?(p.focus&&p.focus!==p.anchor?"selection":"caret"):"document";const activity=p.activity||p.expression;chip.dataset.mode=mode;chip.dataset.activity=activity;chip.dataset.tooltip=`${p.name} · ${activity} · ${mode}`;chip.tabIndex=0;chip.setAttribute('role','img');chip.setAttribute('aria-label',`${p.name}, ${activity}, ${mode}`);chip.append(createBotAvatar(p.character,p.expression));roster.append(chip);}}presenceSignature=next;peer.presence?.schedule();};
 const button=(label,fn)=>{const element=document.createElement('button');element.textContent=label;element.onmousedown=event=>event.preventDefault();element.onclick=()=>{try{fn();}catch(error){report(error);}};section.querySelector('.tools').append(element);};
 peer.button=button;peers.push(peer);return peer;
}
function renderPeerStatus(peer){
 const client=peer.client;
 if(peer.recovery?.protected&&client.synchronized&&!peer.recoveryBusy&&!peer.recoveryStopped)peer.recoveryStatus='Protected';
 peer.section.querySelector('.meta').textContent=`${client.online?'Online':'Offline'} · pending ${client.pending.length} · revision ${client.serverSeq}${peer.recoveryStatus?` · ${peer.recoveryStatus}`:''}`;
}
function scheduleRecovery(peer){
 if(peer.durable?.stopped){peer.recoveryStopped=true;peer.section.inert=true;peer.recoveryStatus='Recovery stopped: inspect durable storage';return;}
 if(upgrading||peer.recoveryStopped||peer.recoveryBusy||!peer.recovery?.protected||peer.client.online||!peer.client.connectionError)return;
 clearTimeout(peer.recoveryTimer);
 peer.recoveryBusy=true;peer.section.inert=true;peer.recoveryStatus='Recovering pending edits';renderPeerStatus(peer);
 void peer.recovery.recover().then(()=>{if(!peer.recoveryStopped)peer.recoveryStatus='Reconnecting';}).catch(error=>{
  if(peer.recoveryStopped)return;
  peer.recoveryStatus=`Recovery waiting: ${String(error.message??error)}`;
  if(/generation, schema or history changed|protection is unavailable/i.test(peer.recoveryStatus)){peer.recoveryStopped=true;peer.recoveryStatus=`Recovery stopped: ${String(error.message??error)}`;}
 }).finally(()=>{
  peer.recoveryBusy=false;
  // Keep unsupported recovery states read-only so that local pending edits and history remain available for inspection.
  peer.section.inert=peer.recoveryStopped;
  renderPeerStatus(peer);
  if(!peer.recoveryStopped&&!peer.client.online&&peer.client.connectionError)peer.recoveryTimer=setTimeout(()=>scheduleRecovery(peer),1500);
 });
}
async function protectPeer(peer){
 if(peer.recoveryRestored==='retired'){peer.recoveryStopped=true;peer.recoveryStatus='Recovery retired';peer.section.inert=true;renderPeerStatus(peer);return;}
 if(peer.recoveryRestored==='restored'){peer.recoveryStatus='Protected after reload';peer.section.inert=false;renderPeerStatus(peer);return;}
 const limit=Date.now()+10000;
 while(!peer.client.synchronized){if(Date.now()>limit)throw Error(`${peer.name}: connection timed out`);await new Promise(resolve=>setTimeout(resolve,25));}
 try{await peer.recovery.establish();peer.recoveryStatus='Protected';peer.section.inert=false;}
 catch(error){peer.recoveryStatus=`Recovery protection failed: ${String(error.message??error)}`;throw error;}
 finally{renderPeerStatus(peer);}
}
const leaf=({attributes,children,leaf})=><span {...attributes} style={{fontWeight:leaf.bold?'bold':undefined,fontStyle:leaf.italic?'italic':undefined,textDecoration:[leaf.underline?'underline':'',leaf.strike?'line-through':''].join(' '),color:leaf.color||undefined}}>{children}</span>;
const element=({attributes,children,element})=>{
 const spec=schema.nodes[element.type],shape=spec.shape,attrs=element.attrs??{},props={...attributes,'data-node-type':element.type};
 if(shape==='grid')return <table {...props}><tbody>{children}</tbody></table>;
 if(shape==='row')return <tr {...props}>{children}</tr>;
 if(shape==='cell')return <td {...props} colSpan={attrs.colspan??1} rowSpan={attrs.rowspan??1} style={{display:attrs.spanned?'none':undefined}}>{children}</td>;
 if(shape==='atom'||shape==='inline')return React.createElement(shape==='inline'?'span':'div',{...props,contentEditable:false},children,attrs.label??attrs.alt??element.type);
 if(shape==='span')return <span {...props}>{children}</span>;
 const tag=shape==='text'?({'heading1':'h1','heading2':'h2','title':'h2','quote':'blockquote'})[element.type]??(spec.text===false?'div':'p'):shape==='group'?'div':'section';
 return React.createElement(tag,props,children);
};
function slate(peer=makePeer('Slate')){
 const editor=withReact(createSlateEditor());peer.editor=editor;
 const binding=new SlateBinding(peer.client,editor,{element:peer.section,groupTyping:false,onError:report});peer.binding=binding;
 peer.read=()=>fromSlate(schema,editor.children);peer.range=()=>slateRangeToModel(schema,editor.children,editor.selection);
 let mounted;peer.ready=new Promise(resolve=>mounted=resolve);
 function App(){useEffect(()=>{mounted();},[]);return <Slate editor={editor} initialValue={binding.initialValue}><Editable className="editor" role="textbox" aria-label="Slate" renderElement={element} renderLeaf={leaf} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?binding.redo():binding.undo();}}}/></Slate>;}
 const root=createRoot(peer.section.querySelector('.mount'));root.render(<App/>);peer.cleanup.push(()=>{binding.dispose();root.unmount();});
 peer.button('Bold',()=>Editor.addMark(editor,'bold',!Editor.marks(editor)?.bold));return peer;
}
function lexical(peer=makePeer('Lexical')){
 const element=document.createElement('div');element.className='editor';element.contentEditable='true';element.setAttribute('role','textbox');element.setAttribute('aria-label','Lexical');peer.section.querySelector('.mount').append(element);peer.element=element;
 const info=buildLexicalSchema(schema,{paragraph:'paragraph',table:'table',codecs:[productLeafCodec]}),editor=createLexicalEditor({namespace:`product-${profile}`,nodes:info.nodes,onError:report});editor.setRootElement(element);
 const rich=registerRichText(editor),table=registerTablePlugin(editor),selection=registerTableSelectionObserver(editor,true);
 const binding=new LexicalBinding(peer.client,editor,{info,groupTyping:false,onError:report});peer.binding=binding;peer.editor=editor;
 peer.read=()=>readLexicalModel(editor,info);peer.range=()=>editor.getEditorState().read(()=>$lexicalSelection(info));peer.ready=Promise.resolve();
 const key=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();event.shiftKey?binding.redo():binding.undo();}};element.addEventListener('keydown',key,true);
 peer.cleanup.push(()=>{binding.dispose();rich();table();selection();element.removeEventListener('keydown',key,true);editor.setRootElement(null);});peer.button('Bold',()=>editor.dispatchCommand(FORMAT_TEXT_COMMAND,'bold'));return peer;
}
function pmInfo(next){
 const hints={};
 for(const [type,spec] of Object.entries(next.nodes)){
  if(['flow','text'].includes(spec.shape))hints[type]=()=>[spec.shape==='flow'?'section':({'heading1':'h1','heading2':'h2','title':'h2','quote':'blockquote'})[type]??(spec.text===false?'div':'p'),{'data-node-type':type},0];
  if(['atom','inline'].includes(spec.shape))hints[type]=node=>[spec.shape==='inline'?'span':'div',{'data-node-type':type,contenteditable:'false'},String(node.attrs.label??node.attrs.alt??type)];
 }
 return buildPmSchema(next,hints);
}
function pm(peer=makePeer('ProseMirror')){
 const info=pmInfo(schema),binding=new PmBinding(peer.client,info,[keymap({'Mod-z':()=>{binding.undo();return true;},'Shift-Mod-z':()=>{binding.redo();return true;},'Mod-y':()=>{binding.redo();return true;}}),keymap(baseKeymap),tableEditing()]);
 const view=new EditorView(peer.section.querySelector('.mount'),{state:binding.state,dispatchTransaction:tr=>binding.dispatch(tr),attributes:{class:'editor ProseMirror',role:'textbox','aria-label':'ProseMirror'}});binding.view=view;binding.onChange=()=>view.updateState(binding.state);
 peer.binding=binding;peer.view=view;peer.element=view.dom;peer.read=()=>canonical(schema,fromPmJSON(info,schema,view.state.doc.toJSON(),peer.client.doc.toJSON()));peer.range=()=>view.state.selection instanceof TextSelection?{anchor:pmPosToPath(schema,view.state.doc,view.state.selection.anchor,peer.client.doc.toJSON()),focus:pmPosToPath(schema,view.state.doc,view.state.selection.head,peer.client.doc.toJSON())}:null;peer.ready=Promise.resolve();
 peer.cleanup.push(()=>view.destroy());peer.button('Bold',()=>{toggleMark(info.pm.marks.bold)(view.state,view.dispatch,view);view.focus();});return peer;
}
function installPresence(peer){
 if(peer.name==='ProseMirror')return;
 const layer=agentPresence(peer,()=>schema);peer.presence=layer;
 peer.cleanup.push(()=>{layer.dispose();if(peer.presence===layer)peer.presence=null;});
}
function editorHost(peer){
 let captured=null,focused=false;
 return {
  pause(){
   if((peer.name==='Slate'&&peer.binding.composing)||(peer.name==='Lexical'&&peer.binding.input.active)||(peer.name==='ProseMirror'&&peer.view.composing))throw new Error(`${peer.name}: finish composition before changing schema`);
   captured=peer.range();focused=peer.element.contains(document.activeElement);
   if((peer.name==='ProseMirror'&&!(peer.view.state.selection instanceof TextSelection))||(focused&&!captured))throw new Error(`${peer.name}: unsupported selection cannot be restored`);
   peer.section.inert=true;
  },
  selection(){return captured;},
  prepare(next,model){
   if(peer.name==='Slate')toSlate(next,model);
   else if(peer.name==='Lexical')buildLexicalSchema(next,{paragraph:'paragraph',table:'table',codecs:[productLeafCodec]});
   else {const info=pmInfo(next);info.pm.nodeFromJSON(toPmJSON(next,model));}
  },
  detach(){for(const cleanup of peer.cleanup.splice(0).reverse())cleanup();peer.section.querySelector('.tools').replaceChildren();peer.section.querySelector('.mount').replaceChildren();peer.element=null;},
  async install(_prepared,range){
   if(peer.name==='Slate')slate(peer);else if(peer.name==='Lexical')lexical(peer);else pm(peer);
   await peer.ready;peer.element??=peer.section.querySelector('.editor');
   if(!peer.element)throw new Error(`${peer.name}: editor did not mount`);
   if(range){
    if(peer.name==='Slate'){const value=modelRangeToSlate(schema,peer.editor.children,range);if(!value)throw new Error('Slate selection cannot be restored');Transforms.select(peer.editor,value);}
    else if(peer.name==='Lexical'){let ok=false;peer.editor.update(()=>{ok=$setLexicalSelection(peer.binding.info,range);},{discrete:true,tag:[LEXICAL_REMOTE_TAG,SKIP_DOM_SELECTION_TAG]});if(!ok)throw new Error('Lexical selection cannot be restored');}
    else {const model=peer.client.doc.toJSON(),doc=peer.binding.state.doc;const anchor=pathToPmPos(schema,doc,range.anchor,model),focus=pathToPmPos(schema,doc,range.focus,model);peer.binding.state=peer.binding.state.apply(peer.binding.state.tr.setSelection(TextSelection.create(doc,anchor,focus)));peer.view.updateState(peer.binding.state);}
   }
   installPresence(peer);observe(peer);peer.button('Undo',()=>peer.binding.undo());peer.button('Redo',()=>peer.binding.redo());
  },
  resume(){
   peer.section.inert=false;
   if(focused&&peer.name==='Slate'){
    const range=peer.editor.selection;
    ReactEditor.focus(peer.editor);
    if(range){
     const anchor=ReactEditor.toDOMPoint(peer.editor,range.anchor),focus=ReactEditor.toDOMPoint(peer.editor,range.focus);
     peer.element.ownerDocument.getSelection()?.setBaseAndExtent(...anchor,...focus);
    }
   }else if(focused&&peer.name==='Lexical'){
    const range=peer.range();peer.element.focus();
    if(range)peer.editor.update(()=>{$setLexicalSelection(peer.binding.info,range);},{discrete:true,tag:LEXICAL_REMOTE_TAG});
   }else if(focused)peer.view.focus();
  },
 };
}
let upgrading=false;
async function upgradeEditors(next){
 if(recoveryEnabled)throw new Error('Open a separate document to change schema while durable recovery is enabled');
 if(upgrading)throw new Error('Schema transition already in progress');
 if(peers.some(peer=>peer.recoveryBusy||peer.client.pending.length))throw new Error('Resolve pending edits and recovery before changing schema');
 upgrading=true;
 try{
  for(const peer of peers){
   assertCompatibleSchema(peer.client.schema,next);
   if(peer.client.conditionalPending)throw new Error('Resolve the conditional edit before changing schema');
   if((peer.name==='Slate'&&peer.binding.composing)||(peer.name==='Lexical'&&peer.binding.input.active)||(peer.name==='ProseMirror'&&peer.view.composing))throw new Error(`${peer.name}: finish composition before changing schema`);
   if((peer.name==='ProseMirror'&&!(peer.view.state.selection instanceof TextSelection))||(peer.element.contains(document.activeElement)&&!peer.range()))throw new Error(`${peer.name}: unsupported selection cannot be restored`);
   const preview=Doc.fromSnapshot(peer.client.actor,peer.client.doc.snapshot(),next).toJSON();
   editorHost(peer).prepare(next,preview);
  }
  if(recoveryEnabled)for(const peer of peers){peer.recoveryStopped=true;clearTimeout(peer.recoveryTimer);peer.recoveryStatus='Recovery stopped after schema transition';renderPeerStatus(peer);}
  schema=structuredClone(next);const results=await Promise.allSettled(peers.map(peer=>upgradeOpenEditorSchema(peer.client,schema,editorHost(peer))));
  const failures=results.flatMap((result,index)=>result.status==='rejected'?[`${peers[index].name}: ${String(result.reason)}`]:[]);
  if(failures.length)throw new Error(`Schema transition did not complete: ${failures.join('; ')}`);
 }
 finally{upgrading=false;}
}
const upgradeStatus=document.createElement('span');upgradeStatus.setAttribute('role','status');
const upgradeButton=document.createElement('button');upgradeButton.textContent='Load server schema';upgradeButton.onmousedown=event=>event.preventDefault();upgradeButton.onclick=async()=>{upgradeStatus.textContent='Loading schema';try{const response=await fetch(`${base}/api/docs/${doc}/schema`);if(!response.ok)throw new Error(await response.text());const result=await response.json();if(!result.schema)throw new Error('Server schema unavailable');await upgradeEditors(result.schema);upgradeStatus.textContent='Schema loaded';}catch(error){upgradeStatus.textContent=`Schema transition failed: ${String(error.message??error)}`;}};document.querySelector('#profiles').append(upgradeButton,upgradeStatus);
async function snapshot(){
 const response=await fetch(`${base}/api/docs/${doc}/state`);if(!response.ok)throw new Error(await response.text());const server=await response.json();
 const rows=peers.map(peer=>({name:peer.name,online:peer.client.online,pending:peer.client.pending.length,seq:peer.client.serverSeq,fallbacks:peer.client.eventStats.fallbacks,model:peer.client.engine.model(),native:peer.read()}));
 const expected=JSON.stringify(server.model);return {profile,size,doc,ready,errors:[...errors],equal:!errors.length&&rows.every(row=>row.online&&!row.pending&&JSON.stringify(row.model)===expected&&JSON.stringify(row.native)===expected),server:server.model,peers:rows};
}
window.products={profile,size,doc,target,errors,engine:{selection:engineChoice??'default',peers:engineDiagnostics},retire:async name=>{const peer=peers.find(peer=>peer.name===name);if(!peer?.durable)throw new Error('Durable recovery is not enabled');peer.recoveryStopped=true;peer.section.inert=true;await peer.durable.retire();peer.recoveryStatus='Recovery retired';renderPeerStatus(peer);},recoveryRecords:()=>peers.map(peer=>({name:peer.name,record:peer.durable?.record??null})),ready:()=>ready,snapshot,status:()=>peers.map(peer=>({name:peer.name,online:peer.client.online,pending:peer.client.pending.length,seq:peer.client.serverSeq,recovery:peer.recoveryStatus??null})),range:name=>peers.find(peer=>peer.name===name).range(),schema:()=>structuredClone(schema),upgradeStatus:()=>upgradeStatus.textContent,upgrading:()=>upgrading,upgrade:upgradeEditors,disconnect:name=>peers.find(peer=>peer.name===name).client.disconnect(),connect:name=>peers.find(peer=>peer.name===name).client.connect(),clearHistory:()=>peers.forEach(peer=>peer.client.clearHistory()),edit:(name,edits)=>{const peer=peers.find(peer=>peer.name===name);peer.client.commit(peer.client.engine.apply(edits));if(name==='Slate')peer.binding.sync();else if(name==='Lexical')peer.binding.pull();else peer.binding.pull();},
 arm:(source,expected)=>{if(current())throw new Error('Previous measurement is incomplete');active={source,expected,armedAt:performance.now(),inputAt:null,receive:{},dom:{},complete:false};records.push(active);return records.length-1;},measurement:()=>active,records:()=>records,clearMeasurements:()=>{active=null;records.length=0;}};
const longTasks=[];
if(PerformanceObserver.supportedEntryTypes.includes('longtask')){const observer=new PerformanceObserver(list=>{if(active)for(const entry of list.getEntries())longTasks.push({start:entry.startTime,duration:entry.duration});});observer.observe({type:'longtask'});window.products.longTasks=()=>longTasks;}
try{
 if(recoveryEnabled)for(const name of ['Slate','Lexical','ProseMirror'])durablePeers.set(name,await BrowserRecovery.open({server:new URL(base,location.href).href,document:doc,slot:name}));
 // A stored replica must be proved before a seed request can alter server state.
 if(![...durablePeers.values()].some(session=>session.record.proof)){
  const response=await fetch('/test/seed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile,doc,size})});if(!response.ok)throw new Error(await response.text());
 }
 const all=['Slate','Lexical','ProseMirror'].map(makePeer);
 if(recoveryEnabled)for(const peer of all){peer.recoveryRestored=await peer.durable.restore();}
 slate(all[0]);lexical(all[1]);pm(all[2]);await Promise.all(all.map(peer=>peer.ready));
 for(const peer of all){peer.element??=peer.section.querySelector('.editor');installPresence(peer);observe(peer);peer.button('Undo',()=>peer.binding.undo());peer.button('Redo',()=>peer.binding.redo());if(peer.durable)peer.button('Retire recovery',()=>{void window.products.retire(peer.name).catch(report);});if(peer.recoveryRestored!=='retired')peer.client.connect();}
 if(recoveryEnabled)await Promise.all(all.map(protectPeer));
 ready=true;document.querySelector('#status').textContent=`${profile} · ${size==='large'?'100,000 generated UTF-16 units + rich sample':'rich sample'} · ${doc}`;
}catch(error){for(const peer of peers){peer.recoveryStopped=true;peer.section.inert=true;try{peer.client.disconnect();}catch{}peer.recoveryStatus=`Recovery stopped: ${String(error.message??error)}`;renderPeerStatus(peer);}report(error);}
window.addEventListener('pagehide',()=>{for(const peer of peers){peer.recoveryStopped=true;if(peer.durable)peer.section.inert=true;clearTimeout(peer.recoveryTimer);peer.recovery?.dispose();try{peer.client.disconnect();}catch{}peer.durable?.close();for(const cleanup of peer.cleanup)cleanup();}});
