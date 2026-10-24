import React, {useEffect} from 'react';
import './ime-probe.mjs';
import {tracingEnabled, recordOperation, readOperations, clearOperations} from './operation-probe.mjs';
import {createRoot} from 'react-dom/client';
import {createEditor as createSlateEditor, Editor, Transforms} from 'slate';
import {Slate, Editable, withReact} from 'slate-react';
import {createEditor as createLexicalEditor, $getRoot, $getSelection, $isRangeSelection, $createRangeSelection, $setSelection, $createParagraphNode, $createTextNode, UNDO_COMMAND, REDO_COMMAND, COMMAND_PRIORITY_HIGH, SKIP_DOM_SELECTION_TAG} from 'lexical';
import {registerRichText, HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode} from '@lexical/rich-text';
import {TableNode, TableRowNode, TableCellNode, $createTableNode, $createTableRowNode, $createTableCellNode, $createTableNodeWithDimensions, $insertTableColumnAtNode, $insertTableRowAtNode, registerTablePlugin, registerTableSelectionObserver} from '@lexical/table';
import {createAnnotation, updateAnnotation, deleteAnnotation, getAnnotations} from '@barocss/doc-sync';
import {SyncClient, HttpTransport} from '@barocss/doc-sync/sync';
import {PmBinding, buildPmSchema, fromPmJSON, pmPosToPath, pathToPmPos} from '@barocss/doc-sync/prosemirror';
import {TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap, toggleMark} from 'prosemirror-commands';
import {addColumnAfter, addRowAfter, tableEditing} from 'prosemirror-tables';
import {resetAndWait, createActionGuard} from '../ui/reset.ts';
import {schema, canon, fromSlate, toSlate, fromLexical, editsFor, commitModelEdits} from './model.mjs';
import {InputSession, slateModelPoint, slateNativePoint, lexicalBlocks, lexicalModelPoint, lexicalNativePoint} from './input-session.mjs';
import {SlateBinding, fromSlate as readBoundSlate} from '@barocss/doc-sync/slate';
import {LexicalBinding, buildLexicalSchema, readLexicalModel} from '@barocss/doc-sync/lexical';

const DOC=new URLSearchParams(location.search).get('doc') ?? 'editor-compat-chrome';
const peers=[], failures=[];
let server=null;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const report=error=>{failures.push(String(error?.stack??error));document.querySelector('#errors').textContent=failures.join('\n');console.error(error);};
window.addEventListener('error',event=>{failures.push(event.message);});
window.addEventListener('unhandledrejection',event=>report(event.reason));

function makePeer(name,kind) {
  const actor=`${name}-${crypto.randomUUID().slice(0,8)}`;
  const transport=new HttpTransport(DOC,actor);
  const client=new SyncClient(actor,transport,{schema,ackDelay:50});
  const section=document.createElement('section');
  section.id=name;
  section.innerHTML=`<h2>${kind} · ${name}</h2><div class="meta"></div><nav></nav><div class="mount"></div>`;
  document.querySelector('#panes').append(section);
  const peer={name,kind,client,transport,section,pull:()=>{},read:()=>client.doc.toJSON(),local:0,remote:0,ready:Promise.resolve()};
  peer.input=new InputSession(client);
  peer.captureSelection=()=>{
    if(!section.contains(document.activeElement))return peer.savedRange=null;
    const range=peer.readRange?.();
    peer.savedRange=range?.anchor&&range?.focus?peer.input.capture(range):null;
  };
  client.onEvent=event=>{
    if(event.type==='reset'){peer.input.cancel();peer.savedRange=null;peer.resetPending=true;}
    else peer.captureSelection();
  };
  client.onUpdate=()=>{
    peer.input.reserveClock();
    if(peer.resetPending){peer.resetPending=false;peer.pull();}
  };
  let finishTimer;
  section.addEventListener('compositionstart',()=>{clearTimeout(finishTimer);peer.input.begin();},true);
  const finish=()=>{
    clearTimeout(finishTimer);
    finishTimer=setTimeout(()=>{
      if(!peer.input.active)return;
      try{
        // Let each native editor consume compositionend and flush its last update.
        peer.flushInput?.();peer.captureSelection();
        const ops=peer.input.end();
        if(tracingEnabled)recordOperation({name,kind,phase:'composition-commit',wireOps:ops,model:client.doc.toJSON()});
        peer.pull();
      }catch(error){peer.input.cancel();report(error);}
    },0);
  };
  section.addEventListener('compositionend',finish,true);
  section.addEventListener('focusout',event=>{if(!section.contains(event.relatedTarget))finish();},true);
  const action=(label,fn)=>{
    const b=document.createElement('button'); b.textContent=label;
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.addEventListener('click',()=>{try{peer.captureSelection();fn();}catch(error){report(error);}});
    section.querySelector('nav').append(b);
  };
  peer.action=action;
  peer.send=next=>{
    try {
      const doc=peer.input.doc,before=doc.toJSON();
      if(equal(before,next)) return;
      const edits=editsFor(before,next);let tokenEdits;
      const ops=commitModelEdits(doc,before,edits,tracingEnabled?mapped=>{tokenEdits=mapped;}:undefined);
      peer.input.commit(ops);
      if(tracingEnabled)recordOperation({name,kind,phase:'local',native:peer.nativeUpdate,modelBefore:before,modelAfter:doc.toJSON(),modelEdits:edits,tokenEdits,deferred:peer.input.active,wireOps:peer.input.active?[]:ops,stagedOps:peer.input.active?ops:undefined});
      peer.local++;
      if(!peer.input.active&&!equal(client.doc.toJSON(),next)){peer.captureSelection();peer.pull();}
    } catch(error) {report(error);}
  };
  client.onModelEvents=(events,info)=>{
    const nativeBefore=tracingEnabled?peer.rawRead?.():undefined;
    if(info.cause==='reset'){peer.input.cancel();peer.savedRange=null;peer.resetPending=false;}
    peer.input.reserveClock();
    peer.remote++;peer.pull();
    if(tracingEnabled)recordOperation({name,kind,phase:'remote',cause:info.cause,events,deferred:peer.input.active,nativeBefore,nativeAfter:peer.rawRead?.(),model:client.doc.toJSON()});
  };
  action('되돌리기',()=>client.undo());
  action('다시하기',()=>client.redo());
  action('연결 전환',()=>client.online?client.disconnect():client.connect());
  peers.push(peer);
  return peer;
}

const slateLeaf=({attributes,children,leaf})=><span {...attributes} style={{fontWeight:leaf.bold?'bold':undefined,fontStyle:leaf.italic?'italic':undefined,textDecoration:[leaf.underline?'underline':'',leaf.strike?'line-through':''].filter(Boolean).join(' ')}}>{children}</span>;
const slateElement=({attributes,children,element})=>{
  const spec=schema.nodes[element.type],shape=spec?.shape,attrs=element.attrs??{};
  if(shape==='grid')return <table {...attributes}><tbody>{children}</tbody></table>;
  if(shape==='row')return <tr {...attributes}>{children}</tr>;
  if(shape==='cell')return <td {...attributes} colSpan={attrs.colspan??1} rowSpan={attrs.rowspan??1} style={{display:attrs.spanned?'none':undefined,backgroundColor:attrs.backgroundColor||undefined}}>{children}</td>;
  if(shape==='inline')return <span {...attributes} contentEditable={false} style={{display:'inline-block',border:'1px solid #94a3b8',padding:'0 4px'}}>{children}<span aria-label={element.type}>Image</span></span>;
  if(shape==='span')return <span {...attributes} style={{textDecoration:'underline'}}>{children}</span>;
  if(shape==='atom')return <div {...attributes} contentEditable={false}>{children}<hr/></div>;
  const list=shape==='group'&&spec.children.some(type=>schema.nodes[type]?.ui?.list);
  const tag=list?(attrs.listType==='numbered'?'ol':'ul'):shape==='group'?'div':shape==='flow'?'section':spec?.ui?.list?'li':spec?.text===false?'div':({'heading1':'h1','heading2':'h2','quote':'blockquote'})[element.type]??'p';
  return React.createElement(tag,{...attributes,'data-node-type':element.type},children);
};

function mountSlateLegacy(name) {
  const peer=makePeer(name,'Slate');
  const editor=withReact(createSlateEditor());
  let remote=false;
  const initialValue=toSlate(peer.client.doc.toJSON());
  const read=()=>fromSlate(editor.children);
  peer.read=read;
  peer.readRange=()=>editor.selection?{anchor:slateModelPoint(editor.children,editor.selection.anchor),focus:slateModelPoint(editor.children,editor.selection.focus)}:null;
  peer.flushInput=()=>peer.send(read());
  peer.rawRead=()=>structuredClone(editor.children);
  peer.pull=()=>{
    if(peer.input.active)return;
    const next=toSlate(peer.client.doc.toJSON());
    if(equal(read(),peer.client.doc.toJSON()))return;
    remote=true;
    const saved=peer.input.resolve(peer.savedRange);
    Editor.withoutNormalizing(editor,()=>{
      Transforms.deselect(editor);
      for(let i=editor.children.length-1;i>=0;i--) Transforms.removeNodes(editor,{at:[i]});
      Transforms.insertNodes(editor,next,{at:[0]});
      const anchor=slateNativePoint(editor.children,saved?.anchor),focus=slateNativePoint(editor.children,saved?.focus);
      if(anchor&&focus)Transforms.select(editor,{anchor,focus});
    });
    queueMicrotask(()=>{remote=false;});
  };
  const onChange=()=>{if(!remote){if(tracingEnabled)peer.nativeUpdate={operations:structuredClone(editor.operations),after:structuredClone(editor.children)};peer.send(read());}};
  let mounted;
  peer.ready=new Promise(resolve=>{mounted=resolve;});
  function Ready(){useEffect(()=>{mounted();},[]);return null;}
  createRoot(peer.section.querySelector('.mount')).render(
    <Slate editor={editor} initialValue={initialValue} onChange={onChange}>
      <Ready/>
      <Editable className="editor" aria-label={name} renderElement={slateElement} renderLeaf={slateLeaf}
        onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();peer.captureSelection();event.shiftKey?peer.client.redo():peer.client.undo();}}}/>
    </Slate>
  );
  const paragraph=()=>({type:'paragraph',children:[{text:''}]});
  const cell=()=>({type:'table-cell',children:[{type:'table-cell-body',children:[paragraph()]}]});
  peer.action('표 2×3',()=>{
    Transforms.insertNodes(editor,{type:'table',attrs:{header:false},children:Array.from({length:2},()=>({type:'table-row',children:Array.from({length:3},cell)}))},{at:[editor.children.length]});
  });
  peer.action('열 추가',()=>{
    const i=editor.children.findIndex(n=>n.type==='table');
    if(i<0)throw new Error('먼저 표를 넣으십시오');
    Editor.withoutNormalizing(editor,()=>editor.children[i].children.forEach((row,r)=>Transforms.insertNodes(editor,cell(),{at:[i,r,row.children.length]})));
  });
  peer.action('행 추가',()=>{
    const i=editor.children.findIndex(n=>n.type==='table');
    const table=editor.children[i];
    if(!table)throw new Error('먼저 표를 넣으십시오');
    Transforms.insertNodes(editor,{type:'table-row',children:Array.from({length:table.children[0].children.length},cell)},{at:[i,table.children.length]});
  });
  peer.action('굵게',()=>Editor.addMark(editor,'bold',!Editor.marks(editor)?.bold));
}

function mountLexicalLegacy(name) {
  const peer=makePeer(name,'Lexical');
  const element=document.createElement('div');
  element.className='editor';element.contentEditable='true';element.setAttribute('role','textbox');element.setAttribute('aria-label',name);
  peer.section.querySelector('.mount').append(element);
  const editor=createLexicalEditor({namespace:name,nodes:[HeadingNode,QuoteNode,TableNode,TableRowNode,TableCellNode],onError:report});
  editor.setRootElement(element);
  registerRichText(editor);registerTablePlugin(editor);registerTableSelectionObserver(editor,true);
  editor.registerCommand(UNDO_COMMAND,()=>{peer.client.undo();return true;},COMMAND_PRIORITY_HIGH);
  editor.registerCommand(REDO_COMMAND,()=>{peer.client.redo();return true;},COMMAND_PRIORITY_HIGH);
  element.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();peer.captureSelection();event.shiftKey?peer.client.redo():peer.client.undo();}},true);
  const build=item=>{
    if(['paragraph','heading1','heading2','quote'].includes(item.type)){
      const block=item.type==='paragraph'?$createParagraphNode():item.type==='quote'?$createQuoteNode():$createHeadingNode(item.type==='heading1'?'h1':'h2');
      for(const run of item.runs??[]){
        if(!('text'in run))throw new Error(`시험 범위 밖 inline: ${run.type}`);
        const text=$createTextNode(run.text);
        for(const key of ['bold','italic','underline','strike'])if(run.marks[key])text.toggleFormat(key==='strike'?'strikethrough':key);
        block.append(text);
      }
      return block;
    }
    if(item.type==='table')return $createTableNode().append(...item.children.map(build));
    if(item.type==='table-row')return $createTableRowNode().append(...item.children.map(build));
    if(item.type==='table-cell')return $createTableCellNode(0).append(...item.children[0].children.map(build));
    throw new Error(`시험 범위 밖 node: ${item.type}`);
  };
  peer.read=()=>fromLexical(editor.getEditorState().toJSON());
  peer.readRange=()=>editor.getEditorState().read(()=>{
    const s=$getSelection(),blocks=lexicalBlocks($getRoot());
    return $isRangeSelection(s)?{anchor:lexicalModelPoint(blocks,s.anchor),focus:lexicalModelPoint(blocks,s.focus)}:null;
  });
  peer.flushInput=()=>peer.send(peer.read());
  peer.rawRead=()=>editor.getEditorState().toJSON();
  peer.pull=()=>{
    if(peer.input.active)return;
    const model=peer.client.doc.toJSON();
    if(equal(peer.read(),model))return;
    const saved=peer.input.resolve(peer.savedRange),focused=element===document.activeElement;
    editor.update(()=>{
      $getRoot().clear().append(...model.children.map(build));
      const blocks=lexicalBlocks($getRoot()),anchor=lexicalNativePoint(blocks,saved?.anchor),focus=lexicalNativePoint(blocks,saved?.focus);
      if(anchor&&focus){const range=$createRangeSelection();range.anchor.set(anchor.key,anchor.offset,anchor.type);range.focus.set(focus.key,focus.offset,focus.type);$setSelection(range);}
    },{tag:focused?['doc-sync-remote']:['doc-sync-remote',SKIP_DOM_SELECTION_TAG],discrete:true});
  };
  editor.update(()=>{$getRoot().append($createParagraphNode());},{tag:'doc-sync-remote',discrete:true});
  editor.registerUpdateListener(({editorState,prevEditorState,tags,dirtyElements,dirtyLeaves})=>{
    if(tags.has('doc-sync-remote')||(!dirtyElements.size&&!dirtyLeaves.size))return;
    if(tracingEnabled)peer.nativeUpdate={before:prevEditorState.toJSON(),after:editorState.toJSON(),dirtyElements:[...dirtyElements],dirtyLeaves:[...dirtyLeaves],tags:[...tags]};
    peer.send(fromLexical(editorState.toJSON()));
  });
  peer.action('표 2×3',()=>editor.update(()=>{$getRoot().append($createTableNodeWithDimensions(2,3,false));},{discrete:true}));
  const table=()=>$getRoot().getChildren().find(n=>n.getType()==='table');
  peer.action('열 추가',()=>editor.update(()=>{
    const t=table();if(!t)throw new Error('먼저 표를 넣으십시오');
    $insertTableColumnAtNode(t.getFirstChild().getLastChild(),true,false);
  },{discrete:true}));
  peer.action('행 추가',()=>editor.update(()=>{
    const t=table();if(!t)throw new Error('먼저 표를 넣으십시오');
    $insertTableRowAtNode(t.getLastChild().getFirstChild(),true);
  },{discrete:true}));
}


// The default consumers use package exports. ?legacy=1 retains the previous
// compatibility adapters for bounded before/after checks.
function makeBoundPeer(name, kind) {
  const actor=`${name}-${crypto.randomUUID().slice(0,8)}`;
  const transport=new HttpTransport(DOC,actor);
  const client=new SyncClient(actor,transport,{schema,ackDelay:50});
  const section=document.createElement('section');
  section.id=name;
  section.innerHTML=`<h2>${kind} · ${name}</h2><div class="meta"></div><nav></nav><div class="mount"></div>`;
  document.querySelector('#panes').append(section);
  const peer={name,kind,client,transport,section,local:0,remote:0,ready:Promise.resolve(),pull:()=>{},read:()=>client.doc.toJSON(),captureSelection:()=>{}};
  peer.action=(label,run)=>{
    const button=document.createElement('button');button.textContent=label;
    button.addEventListener('mousedown',event=>event.preventDefault());
    button.addEventListener('click',()=>{try{run();}catch(error){report(error);}});
    section.querySelector('nav').append(button);
  };
  client.onModelEvents=(events,info)=>{
    peer.remote++;
    if(tracingEnabled)recordOperation({name,kind,phase:'remote',cause:info.cause,events,model:client.doc.toJSON()});
  };
  peer.action('되돌리기',()=>peer.binding.undo());
  peer.action('다시하기',()=>peer.binding.redo());
  peer.action('연결 전환',()=>client.online?client.disconnect():client.connect());
  peers.push(peer);return peer;
}

function mountSlate(name) {
  const peer=makeBoundPeer(name,'Slate');
  const editor=withReact(createSlateEditor());
  const binding=new SlateBinding(peer.client,editor,{groupTyping:false,element:peer.section,onError:report});
  peer.binding=binding;peer.pull=()=>binding.sync();
  peer.read=()=>readBoundSlate(schema,editor.children);
  let ready;
  peer.ready=new Promise(resolve=>{ready=resolve;});
  const EditorApp=()=>{
    useEffect(()=>{ready();return()=>binding.dispose();},[]);
    return <Slate editor={editor} initialValue={binding.initialValue} onChange={()=>{
      if(!editor.operations.some(op=>op.type!=='set_selection'))return;
      peer.local++;
      if(tracingEnabled)recordOperation({name,kind:'Slate',phase:'local',native:{operations:structuredClone(editor.operations),after:structuredClone(editor.children)},modelAfter:peer.client.doc.toJSON(),deferred:binding.composing,wireOps:peer.client.pending.at(-1)?.ops??[]});
    }}>
      <Editable className="editor" aria-label={name} renderElement={slateElement} renderLeaf={slateLeaf}
        onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?binding.redo():binding.undo();}}}/>
    </Slate>;
  };
  const root=createRoot(peer.section.querySelector('.mount'));root.render(<EditorApp/>);
  peer.dispose=()=>{binding.dispose();root.unmount();};
  const paragraph=()=>({type:'paragraph',children:[{text:''}]});
  const cell=()=>({type:'table-cell',children:[{type:'table-cell-body',children:[paragraph()]}]});
  peer.action('표 2×3',()=>Transforms.insertNodes(editor,{type:'table',attrs:{header:false},children:Array.from({length:2},()=>({type:'table-row',children:Array.from({length:3},cell)}))},{at:[editor.children.length]}));
  peer.action('열 추가',()=>{
    const i=editor.children.findIndex(node=>node.type==='table');if(i<0)throw new Error('먼저 표를 넣으십시오');
    Editor.withoutNormalizing(editor,()=>editor.children[i].children.forEach((row,r)=>Transforms.insertNodes(editor,cell(),{at:[i,r,row.children.length]})));
  });
  peer.action('행 추가',()=>{
    const i=editor.children.findIndex(node=>node.type==='table'),table=editor.children[i];if(!table)throw new Error('먼저 표를 넣으십시오');
    Transforms.insertNodes(editor,{type:'table-row',children:Array.from({length:table.children[0].children.length},cell)},{at:[i,table.children.length]});
  });
  peer.action('굵게',()=>Editor.addMark(editor,'bold',!Editor.marks(editor)?.bold));
}

function mountLexical(name) {
  const peer=makeBoundPeer(name,'Lexical');
  const element=document.createElement('div');element.className='editor';element.contentEditable='true';
  element.setAttribute('role','textbox');element.setAttribute('aria-label',name);peer.section.querySelector('.mount').append(element);
  const info=buildLexicalSchema(schema);
  const editor=createLexicalEditor({namespace:name,nodes:info.nodes,onError:report});
  editor.setRootElement(element);
  const removeRichText=registerRichText(editor),removeTable=registerTablePlugin(editor),removeSelection=registerTableSelectionObserver(editor,true);
  const binding=new LexicalBinding(peer.client,editor,{groupTyping:false,info,onError:report});
  const commit=peer.client.commit;let localOps=[];
  const captureCommit=function(ops,record){if(record!==null&&ops.length)localOps.push(...ops);return commit.call(this,ops,record);};
  peer.client.commit=captureCommit;
  peer.binding=binding;peer.pull=()=>binding.pull();peer.read=()=>readLexicalModel(editor,info);
  const keydown=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();event.shiftKey?binding.redo():binding.undo();}};
  element.addEventListener('keydown',keydown,true);
  const removeUpdate=editor.registerUpdateListener(({editorState,prevEditorState,tags,dirtyElements,dirtyLeaves})=>{
    if((tags.has('doc-sync-remote')&&!localOps.length)||(!dirtyElements.size&&!dirtyLeaves.size))return;
    const wireOps=localOps;localOps=[];peer.local++;
    if(tracingEnabled)recordOperation({name,kind:'Lexical',phase:'local',native:{before:prevEditorState.toJSON(),after:editorState.toJSON(),tags:[...tags]},modelAfter:peer.client.doc.toJSON(),deferred:binding.input.active,wireOps});
  });
  peer.dispose=()=>{if(peer.client.commit===captureCommit)peer.client.commit=commit;binding.dispose();removeUpdate();removeRichText();removeTable();removeSelection();element.removeEventListener('keydown',keydown,true);editor.setRootElement(null);};
  peer.action('표 2×3',()=>editor.update(()=>{$getRoot().append($createTableNodeWithDimensions(2,3,false));},{discrete:true}));
  const table=()=>$getRoot().getChildren().find(node=>node.getType()==='table');
  peer.action('열 추가',()=>editor.update(()=>{const node=table();if(!node)throw new Error('먼저 표를 넣으십시오');$insertTableColumnAtNode(node.getFirstChild().getLastChild(),true,false);},{discrete:true}));
  peer.action('행 추가',()=>editor.update(()=>{const node=table();if(!node)throw new Error('먼저 표를 넣으십시오');$insertTableRowAtNode(node.getLastChild().getFirstChild(),true);},{discrete:true}));
}

function mountProseMirror(name) {
  const peer=makePeer(name,'ProseMirror');
  const info=buildPmSchema(schema,{
    paragraph:()=>['p',0],heading1:()=>['h1',0],heading2:()=>['h2',0],quote:()=>['blockquote',0],
  });
  const binding=new PmBinding(peer.input.bindingClient(),info,[keymap({
    'Mod-z':()=>{binding.undo();return true;},'Mod-y':()=>{binding.redo();return true;},
    'Shift-Mod-z':()=>{binding.redo();return true;},'Mod-b':toggleMark(info.pm.marks.bold),'Mod-i':toggleMark(info.pm.marks.italic),
  }),keymap(baseKeymap),tableEditing()]);
  const view=new EditorView(peer.section.querySelector('.mount'),{
    state:binding.state,dispatchTransaction:tr=>{
      const trace=tracingEnabled&&tr.docChanged;
      const before=trace?peer.input.doc.toJSON():undefined;
      const nativeBefore=trace?binding.state.doc.toJSON():undefined;
      const previousSeq=trace?peer.client.pending.at(-1)?.seq:undefined;
      if(tr.docChanged)peer.local++;
      binding.dispatch(tr);
      if(trace){
        const pending=peer.client.pending.at(-1);
        recordOperation({name,kind:'ProseMirror',phase:'local',native:{before:nativeBefore,steps:tr.steps.map(step=>step.toJSON()),after:binding.state.doc.toJSON()},modelBefore:before,modelAfter:peer.input.doc.toJSON(),deferred:peer.input.active,wireOps:pending?.seq!==previousSeq?pending?.ops??[]:[],bindingStats:structuredClone(binding.stats)});
      }
    },
    attributes:{class:'editor ProseMirror','aria-label':name,role:'textbox'},
  });
  binding.view=view;
  binding.onChange=()=>view.updateState(binding.state);
  peer.readRange=()=>view.state.selection instanceof TextSelection?{anchor:pmPosToPath(schema,view.state.doc,view.state.selection.anchor,peer.input.doc.toJSON()),focus:pmPosToPath(schema,view.state.doc,view.state.selection.head,peer.input.doc.toJSON())}:null;
  peer.pull=()=>{
    if(peer.input.active)return;
    const saved=peer.input.resolve(peer.savedRange);
    binding.pull();
    if(saved&&view.hasFocus()){
      const model=peer.client.doc.toJSON(),anchor=pathToPmPos(schema,view.state.doc,saved.anchor,model),focus=pathToPmPos(schema,view.state.doc,saved.focus,model);
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,anchor,focus)));
    }
  };
  peer.client.onModelEvents=(events,detail)=>{
    const nativeBefore=tracingEnabled?view.state.doc.toJSON():undefined;
    if(detail.cause==='reset'){peer.input.cancel();peer.savedRange=null;peer.resetPending=false;}
    peer.input.reserveClock();
    peer.remote++;peer.pull();
    if(tracingEnabled)recordOperation({name,kind:'ProseMirror',phase:'remote',cause:detail.cause,events,deferred:peer.input.active,nativeBefore,nativeAfter:view.state.doc.toJSON(),model:peer.client.doc.toJSON()});
  };
  peer.read=()=>canon(fromPmJSON(info,schema,view.state.doc.toJSON(),peer.input.doc.toJSON()));
  const run=command=>{command(view.state,view.dispatch,view);view.focus();};
  peer.action('표 2×3',()=>run((state,dispatch)=>{
    const cell=()=>info.pm.nodes.table_cell.create(null,info.pm.nodes.paragraph.create());
    const row=()=>info.pm.nodes.table_row.create(null,[cell(),cell(),cell()]);
    dispatch(state.tr.insert(state.doc.content.size,info.pm.nodes.table.create(null,[row(),row()])));
    return true;
  }));
  peer.action('열 추가',()=>run(addColumnAfter));
  peer.action('행 추가',()=>run(addRowAfter));
}

const legacy=new URLSearchParams(location.search).get('legacy')==='1';
(legacy?mountSlateLegacy:mountSlate)('slate-a');(legacy?mountSlateLegacy:mountSlate)('slate-b');
(legacy?mountLexicalLegacy:mountLexical)('lexical-a');(legacy?mountLexicalLegacy:mountLexical)('lexical-b');mountProseMirror('pm-a');
const snapshot=()=>({doc:DOC,server,failures:[...failures],peers:peers.map(p=>({name:p.name,kind:p.kind,online:p.client.online,pending:p.client.pending.length,seq:p.client.serverSeq,local:p.local,remote:p.remote,fallbacks:p.client.eventStats.fallbacks,model:p.client.doc.toJSON(),nativeModel:p.read()}))});
const guard=createActionGuard();
document.querySelector('#reset').onclick=()=>guard(async()=>{
  peers.forEach(p=>p.client.connect());
  await resetAndWait(peers.map(p=>p.client),async()=>{const r=await fetch(`/api/docs/${DOC}/reset`,{method:'POST'});if(!r.ok)throw new Error(`reset HTTP ${r.status}`);});
  peers.forEach(p=>p.pull());
}).catch(report);
document.querySelector('#disconnect').onclick=()=>peers.forEach(p=>p.client.disconnect());
document.querySelector('#connect').onclick=()=>peers.forEach(p=>p.client.connect());
await Promise.all(peers.map(p=>p.ready));
peers.forEach(p=>p.client.connect());
window.addEventListener('pagehide',()=>peers.forEach(p=>{p.dispose?.();p.client.disconnect();p.transport.leave();}));
window.compat={snapshot,trace:readOperations,clearTrace:clearOperations,
  edit:(name,edits)=>{const peer=peers.find(p=>p.name===name);if(!peer)throw new Error('Unknown peer');peer.client.commit(peer.client.doc.edit(edits).ops);peer.pull();},
  annotations:()=>peers.map(peer=>({name:peer.name,records:getAnnotations(peer.client.doc)})),
  annotate:(name,range,data,options)=>{const peer=peers.find(p=>p.name===name);if(!peer)throw new Error('Unknown peer');const result=createAnnotation(peer.client.doc,range,data,options);peer.client.commit(result.ops);return result.id;},
  updateAnnotation:(name,id,patch)=>{const peer=peers.find(p=>p.name===name);if(!peer)throw new Error('Unknown peer');peer.client.commit(updateAnnotation(peer.client.doc,id,patch));},
  deleteAnnotation:(name,id)=>{const peer=peers.find(p=>p.name===name);if(!peer)throw new Error('Unknown peer');peer.client.commit(deleteAnnotation(peer.client.doc,id));},
};
setInterval(async()=>{
  try {
    const state=await(await fetch(`/api/docs/${DOC}/state`)).json();
    server={model:state.model,seq:state.serverSeq};
    const snap=snapshot();
    const same=!failures.length&&snap.peers.every(p=>p.online&&!p.pending&&equal(p.model,state.model)&&equal(p.nativeModel,state.model));
    const status=document.querySelector('#status');status.className=same?'ok':'';
    status.textContent=same?`모두 같은 문서 ✓ · Slate 2 + Lexical 2 + ProseMirror 1 + 서버 · #${state.serverSeq}`:'동기화 중 또는 연결 끊김';
    peers.forEach(p=>p.section.querySelector('.meta').textContent=`${p.client.online?'연결됨':'끊김'} · seq ${p.client.serverSeq} · 보낼 것 ${p.client.pending.length} · 로컬 ${p.local} · 원격 ${p.remote}`);
    document.querySelector('#proof').textContent=JSON.stringify({serverSeq:state.serverSeq,failures:failures.length,peers:snap.peers.map(({name,online,pending,seq,local,remote,fallbacks})=>({name,online,pending,seq,local,remote,fallbacks}))},null,2);
  }catch(error){report(error);}
},300);
