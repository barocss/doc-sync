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
import {SyncClient,HttpTransport,upgradeOpenEditorSchema} from '@barocss/doc-sync/sync';
import {SlateBinding,fromSlate,slateRangeToModel,modelRangeToSlate,toSlate} from '@barocss/doc-sync/slate';
import {LexicalBinding,buildLexicalSchema,readLexicalModel,$lexicalSelection,$setLexicalSelection,LEXICAL_REMOTE_TAG} from '@barocss/doc-sync/lexical';
import {PmBinding,buildPmSchema,fromPmJSON,pmPosToPath,pathToPmPos,toPmJSON} from '@barocss/doc-sync/prosemirror';
import {PRODUCT_SCHEMAS} from '../../../fixtures/product-schemas.ts';
import {TARGETS} from './documents.ts';
import {productLeafCodec} from './leaf.mjs';

const query=new URLSearchParams(location.search),profile=query.get('profile')??'word',size=query.get('size')==='large'?'large':'sample';
if(!Object.hasOwn(PRODUCT_SCHEMAS,profile))throw new Error('Unknown product profile');
let schema=PRODUCT_SCHEMAS[profile];const target=TARGETS[profile],doc=query.get('doc')??`${profile}-${Date.now().toString(36)}`,base=`/profiles/${profile}`;
const peers=[],errors=[],records=[];let active=null,ready=false;
const report=error=>{errors.push(String(error.stack??error));document.querySelector('#errors').textContent=errors.join('\n');};
window.addEventListener('error',event=>report(event.error??event.message));window.addEventListener('unhandledrejection',event=>report(event.reason));
for(const name of Object.keys(PRODUCT_SCHEMAS)){
 const link=document.createElement('a');link.className='choice';link.href=`/?profile=${name}&size=${size}`;link.textContent={word:'Word-style',notion:'Notion-style',presentation:'Presentation'}[name];if(name===profile)link.setAttribute('aria-current','page');document.querySelector('#profiles').append(link);
}
const large=document.createElement('a');large.className='choice';large.href=`/?profile=${profile}&size=${size==='large'?'sample':'large'}`;large.textContent=size==='large'?'Open rich sample':'Open 100k text payload';document.querySelector('#profiles').append(large);
const check=document.createElement('button');check.textContent='Check convergence';check.onclick=async()=>{const s=await snapshot();document.querySelector('#proof').textContent=JSON.stringify({equal:s.equal,profile,size,peers:s.peers.map(({name,seq,pending})=>({name,seq,pending})),errors},null,2);};document.querySelector('#profiles').append(check);
const current=()=>active&&!active.complete?active:null;
function findText(peer){return [...peer.element.querySelectorAll('p')].find(node=>node.textContent.startsWith(target.text));}
function observe(peer){
 const observer=new MutationObserver(()=>{
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
 const section=document.createElement('section');section.className='panel';section.id=name;section.innerHTML=`<h2>${name}</h2><div class="meta">Connecting</div><div class="tools"></div><div class="mount"></div>`;document.querySelector('#panes').append(section);
 const actor=`${name}-${crypto.randomUUID().slice(0,8)}`,transport=new HttpTransport(doc,actor,base),peer={name,actor,section,cleanup:[]};
 const send=transport.send.bind(transport);transport.send=async message=>{const record=current();if(record&&message.kind==='change'&&name===record.source)record.sendStart=performance.now();try{return await send(message);}finally{if(record&&message.kind==='change'&&name===record.source)record.sendEnd=performance.now();}};
 const subscribe=transport.subscribe.bind(transport);transport.subscribe=(since,handler,epoch,schemaVersion)=>subscribe(since,event=>{
  const record=current(),timed=record&&event.type==='change'&&event.envelope.change?.actor===peers.find(peer=>peer.name===record.source)?.actor;
  if(timed)record.receive[name]={start:performance.now()};handler(event);if(timed)record.receive[name].end=performance.now();
 },epoch,schemaVersion);
 const client=new SyncClient(actor,transport,{schema,ackDelay:50});peer.client=client;peer.transport=transport;
 const commit=client.commit.bind(client);client.commit=(ops,record)=>{const measurement=current();if(measurement?.source===name)measurement.commitStart=performance.now();const result=commit(ops,record);if(measurement?.source===name)measurement.commitEnd=performance.now();return result;};
 client.onUpdate=()=>{section.querySelector('.meta').textContent=`${client.online?'Online':'Offline'} · pending ${client.pending.length} · revision ${client.serverSeq}`;};
 const button=(label,fn)=>{const element=document.createElement('button');element.textContent=label;element.onmousedown=event=>event.preventDefault();element.onclick=()=>{try{fn();}catch(error){report(error);}};section.querySelector('.tools').append(element);};
 peer.button=button;peers.push(peer);return peer;
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
   observe(peer);peer.button('Undo',()=>peer.binding.undo());peer.button('Redo',()=>peer.binding.redo());
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
 if(upgrading)throw new Error('Schema transition already in progress');
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
 const rows=peers.map(peer=>({name:peer.name,online:peer.client.online,pending:peer.client.pending.length,seq:peer.client.serverSeq,fallbacks:peer.client.eventStats.fallbacks,model:peer.client.doc.toJSON(),native:peer.read()}));
 const expected=JSON.stringify(server.model);return {profile,size,doc,ready,errors:[...errors],equal:!errors.length&&rows.every(row=>row.online&&!row.pending&&JSON.stringify(row.model)===expected&&JSON.stringify(row.native)===expected),server:server.model,peers:rows};
}
window.products={profile,size,doc,target,errors,ready:()=>ready,snapshot,status:()=>peers.map(peer=>({name:peer.name,online:peer.client.online,pending:peer.client.pending.length,seq:peer.client.serverSeq})),range:name=>peers.find(peer=>peer.name===name).range(),schema:()=>structuredClone(schema),upgradeStatus:()=>upgradeStatus.textContent,upgrading:()=>upgrading,upgrade:upgradeEditors,disconnect:name=>peers.find(peer=>peer.name===name).client.disconnect(),clearHistory:()=>peers.forEach(peer=>peer.client.clearHistory()),edit:(name,edits)=>{const peer=peers.find(peer=>peer.name===name);peer.client.commit(peer.client.doc.edit(edits).ops);if(name==='Slate')peer.binding.sync();else if(name==='Lexical')peer.binding.pull();else peer.binding.pull();},
 arm:(source,expected)=>{if(current())throw new Error('Previous measurement is incomplete');active={source,expected,armedAt:performance.now(),inputAt:null,receive:{},dom:{},complete:false};records.push(active);return records.length-1;},measurement:()=>active,records:()=>records,clearMeasurements:()=>{active=null;records.length=0;}};
const longTasks=[];
if(PerformanceObserver.supportedEntryTypes.includes('longtask')){const observer=new PerformanceObserver(list=>{if(active)for(const entry of list.getEntries())longTasks.push({start:entry.startTime,duration:entry.duration});});observer.observe({type:'longtask'});window.products.longTasks=()=>longTasks;}
try{
 const response=await fetch('/test/seed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile,doc,size})});if(!response.ok)throw new Error(await response.text());
 const all=[slate(),lexical(),pm()];await Promise.all(all.map(peer=>peer.ready));
 for(const peer of all){peer.element??=peer.section.querySelector('.editor');observe(peer);peer.button('Undo',()=>peer.binding.undo());peer.button('Redo',()=>peer.binding.redo());peer.client.connect();}
 ready=true;document.querySelector('#status').textContent=`${profile} · ${size==='large'?'100,000 generated UTF-16 units + rich sample':'rich sample'} · ${doc}`;
}catch(error){report(error);}
window.addEventListener('pagehide',()=>{for(const peer of peers){peer.client.disconnect();for(const cleanup of peer.cleanup)cleanup();}});
