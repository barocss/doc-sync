import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {createEditor as createSlateEditor, Editor, Transforms} from 'slate';
import {Slate, Editable, withReact} from 'slate-react';
import {createEditor as createLexicalEditor, $getRoot, $createParagraphNode, $createTextNode, UNDO_COMMAND, REDO_COMMAND, COMMAND_PRIORITY_HIGH, SKIP_DOM_SELECTION_TAG} from 'lexical';
import {registerRichText, HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode} from '@lexical/rich-text';
import {TableNode, TableRowNode, TableCellNode, $createTableNode, $createTableRowNode, $createTableCellNode, $createTableNodeWithDimensions, $insertTableColumnAtNode, $insertTableRowAtNode, registerTablePlugin, registerTableSelectionObserver} from '@lexical/table';
import {SyncClient, HttpTransport} from '@barocss/doc-sync/sync';
import {PmBinding, buildPmSchema, fromPmJSON} from '@barocss/doc-sync/prosemirror';
import {EditorView} from 'prosemirror-view';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap, toggleMark} from 'prosemirror-commands';
import {addColumnAfter, addRowAfter, tableEditing} from 'prosemirror-tables';
import {resetAndWait, createActionGuard} from '../ui/reset.ts';
import {schema, canon, fromSlate, toSlate, fromLexical, editsFor, commitModelEdits, safeSlateRange} from './model.mjs';

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
  const action=(label,fn)=>{
    const b=document.createElement('button'); b.textContent=label;
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.addEventListener('click',()=>{try{fn();}catch(error){report(error);}});
    section.querySelector('nav').append(b);
  };
  peer.action=action;
  peer.send=next=>{
    try {
      const before=client.doc.toJSON();
      if(equal(before,next)) return;
      const ops=commitModelEdits(client.doc,before,editsFor(before,next));
      client.commit(ops);
      peer.local++;
      if(!equal(client.doc.toJSON(),next)) peer.pull();
    } catch(error) {report(error);}
  };
  client.onModelEvents=()=>{peer.remote++;peer.pull();};
  action('되돌리기',()=>client.undo());
  action('다시하기',()=>client.redo());
  action('연결 전환',()=>client.online?client.disconnect():client.connect());
  peers.push(peer);
  return peer;
}

const slateLeaf=({attributes,children,leaf})=><span {...attributes} style={{fontWeight:leaf.bold?'bold':undefined,fontStyle:leaf.italic?'italic':undefined,textDecoration:[leaf.underline?'underline':'',leaf.strike?'line-through':''].filter(Boolean).join(' ')}}>{children}</span>;
const slateElement=({attributes,children,element})=>{
  const tag=({'heading1':'h1','heading2':'h2','quote':'blockquote','table':'table','table-row':'tr','table-cell':'td','table-cell-body':'div'})[element.type]??'p';
  return tag==='table'?<table {...attributes}><tbody>{children}</tbody></table>:React.createElement(tag,attributes,children);
};

function mountSlate(name) {
  const peer=makePeer(name,'Slate');
  const editor=withReact(createSlateEditor());
  let remote=false;
  const initialValue=toSlate(peer.client.doc.toJSON());
  const read=()=>fromSlate(editor.children);
  peer.read=read;
  peer.pull=()=>{
    const next=toSlate(peer.client.doc.toJSON());
    if(equal(read(),peer.client.doc.toJSON()))return;
    remote=true;
    const previous=editor.selection?structuredClone(editor.selection):null;
    Editor.withoutNormalizing(editor,()=>{
      Transforms.deselect(editor);
      for(let i=editor.children.length-1;i>=0;i--) Transforms.removeNodes(editor,{at:[i]});
      Transforms.insertNodes(editor,next,{at:[0]});
      const range=safeSlateRange(editor.children,previous);
      if(range)Transforms.select(editor,range);
    });
    queueMicrotask(()=>{remote=false;});
  };
  const onChange=()=>{if(!remote)peer.send(read());};
  let mounted;
  peer.ready=new Promise(resolve=>{mounted=resolve;});
  function Ready(){useEffect(()=>{mounted();},[]);return null;}
  createRoot(peer.section.querySelector('.mount')).render(
    <Slate editor={editor} initialValue={initialValue} onChange={onChange}>
      <Ready/>
      <Editable className="editor" aria-label={name} renderElement={slateElement} renderLeaf={slateLeaf}
        onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?peer.client.redo():peer.client.undo();}}}/>
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

function mountLexical(name) {
  const peer=makePeer(name,'Lexical');
  const element=document.createElement('div');
  element.className='editor';element.contentEditable='true';element.setAttribute('role','textbox');element.setAttribute('aria-label',name);
  peer.section.querySelector('.mount').append(element);
  const editor=createLexicalEditor({namespace:name,nodes:[HeadingNode,QuoteNode,TableNode,TableRowNode,TableCellNode],onError:report});
  editor.setRootElement(element);
  registerRichText(editor);registerTablePlugin(editor);registerTableSelectionObserver(editor,true);
  editor.registerCommand(UNDO_COMMAND,()=>{peer.client.undo();return true;},COMMAND_PRIORITY_HIGH);
  editor.registerCommand(REDO_COMMAND,()=>{peer.client.redo();return true;},COMMAND_PRIORITY_HIGH);
  element.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();event.shiftKey?peer.client.redo():peer.client.undo();}},true);
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
  peer.pull=()=>{
    const model=peer.client.doc.toJSON();
    if(equal(peer.read(),model))return;
    editor.update(()=>{$getRoot().clear().append(...model.children.map(build));},{tag:['doc-sync-remote',SKIP_DOM_SELECTION_TAG],discrete:true});
  };
  editor.update(()=>{$getRoot().append($createParagraphNode());},{tag:'doc-sync-remote',discrete:true});
  editor.registerUpdateListener(({editorState,tags,dirtyElements,dirtyLeaves})=>{
    if(tags.has('doc-sync-remote')||(!dirtyElements.size&&!dirtyLeaves.size))return;
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

function mountProseMirror(name) {
  const peer=makePeer(name,'ProseMirror');
  const info=buildPmSchema(schema,{
    paragraph:()=>['p',0],heading1:()=>['h1',0],heading2:()=>['h2',0],quote:()=>['blockquote',0],
  });
  const binding=new PmBinding(peer.client,info,[keymap({
    'Mod-z':()=>{binding.undo();return true;},'Mod-y':()=>{binding.redo();return true;},
    'Shift-Mod-z':()=>{binding.redo();return true;},'Mod-b':toggleMark(info.pm.marks.bold),'Mod-i':toggleMark(info.pm.marks.italic),
  }),keymap(baseKeymap),tableEditing()]);
  const view=new EditorView(peer.section.querySelector('.mount'),{
    state:binding.state,dispatchTransaction:tr=>{if(tr.docChanged)peer.local++;binding.dispatch(tr);},
    attributes:{class:'editor ProseMirror','aria-label':name,role:'textbox'},
  });
  binding.view=view;
  binding.onChange=()=>view.updateState(binding.state);
  const receive=peer.client.onModelEvents;
  peer.client.onModelEvents=(events,info)=>{peer.remote++;receive(events,info);};
  peer.read=()=>canon(fromPmJSON(info,schema,view.state.doc.toJSON()));
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

mountSlate('slate-a');mountSlate('slate-b');mountLexical('lexical-a');mountLexical('lexical-b');mountProseMirror('pm-a');
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
window.addEventListener('pagehide',()=>peers.forEach(p=>{p.client.disconnect();p.transport.leave();}));
window.compat={snapshot};
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
