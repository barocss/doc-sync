import {pathAt} from '@barocss/doc-sync';
import {botFace} from '@barocss/doc-sync/sync';
import {modelPointToSlate} from '@barocss/doc-sync/slate';
import {$lexicalPoint} from '@barocss/doc-sync/lexical';
import {ReactEditor} from 'slate-react';
import {createBotAvatar} from './bot-avatar.js';

// Paint outside the native editor: presence must never change its document or selection.
export function agentPresence(peer, schema) {
 const layer=document.createElement('div');layer.className='agent-presence-layer';layer.setAttribute('aria-hidden','true');peer.section.append(layer);
 let frame=0,editorElement=peer.element;
 const endpoint=key=>{
  const doc=peer.client.doc,item=key&&doc.get(key);if(!item||!doc.tokenLocation(key)?.visible)return null;
  const path=pathAt(doc,key);return path?{path,line:doc.tokenLocation(key).line}:null;
 };
 const point=path=>{
  if(peer.name==='Slate'){
   const native=modelPointToSlate(schema(),peer.editor.children,path);return native?ReactEditor.toDOMPoint(peer.editor,native):null;
  }
  const native=peer.editor.getEditorState().read(()=>$lexicalPoint(peer.binding.info,path));
  if(!native||native.type!=='text')return null;
  const element=peer.editor.getElementByKey(native.key);if(!element)return null;
  const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node,remaining=native.offset;
  while(node=walker.nextNode()){if(remaining<=node.length)return [node,remaining];remaining-=node.length;}
  return null;
 };
 const render=()=>{
  frame=0;layer.replaceChildren();if(!peer.client.online)return;
  const panel=peer.section.getBoundingClientRect(),viewport=peer.element.getBoundingClientRect();
  const add=(rect,kind,p)=>{
   const left=Math.max(rect.left,viewport.left),right=Math.min(rect.right,viewport.right),top=Math.max(rect.top,viewport.top),bottom=Math.min(rect.bottom,viewport.bottom);
   if(bottom<=top||(kind==='selection'&&right<=left)||rect.left<viewport.left||rect.left>viewport.right)return;
   const part=document.createElement('span');part.className=`agent-presence-${kind}`;part.dataset.actor=p.actor;part.dataset.name=p.name;part.dataset.activity=p.activity||"";part.style.left=`${left-panel.left}px`;part.style.top=`${top-panel.top}px`;part.style.height=`${bottom-top}px`;part.style.setProperty('--agent-color',/^#[0-9a-f]{6}$/i.test(p.color)?p.color:'#7c3aed');
   if(kind==='selection')part.style.width=`${right-left}px`;else {const label=document.createElement('span'),face=botFace(p.character,p.expression);if(face){part.dataset.character=p.character;part.dataset.expression=p.expression;label.className='agent-presence-character';label.append(createBotAvatar(p.character,p.expression));}else label.textContent=p.name;part.append(label);}
   layer.append(part);
  };
  for(const p of peer.client.others.values())try{
   const a=endpoint(p.anchor),f=endpoint(p.focus);if(!a)continue;
   const active=point(a.path);if(!active)continue;
   const caret=document.createRange();caret.setStart(...active);caret.collapse(true);const caretRect=caret.getBoundingClientRect();if(caretRect.height)add(caretRect,'caret',p);
   if(!f||a.line!==f.line)continue;const other=point(f.path);if(!other)continue;
   const left=document.createRange(),right=document.createRange();left.setStart(...active);left.collapse(true);right.setStart(...other);right.collapse(true);
   if(left.compareBoundaryPoints(Range.START_TO_START,right)>0){left.setEnd(...active);left.setStart(...other);}else left.setEnd(...other);
   for(const rect of left.getClientRects())add(rect,'selection',p);
  }catch{/* An unresolved native position must not invent a cursor. */}
 };
 const schedule=()=>{if(!peer.client.others.size&&!layer.childElementCount)return;if(!frame)frame=requestAnimationFrame(render);};
 const scroll=()=>schedule();editorElement.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',scroll);
 return {schedule,dispose(){if(frame)cancelAnimationFrame(frame);editorElement.removeEventListener('scroll',scroll);window.removeEventListener('resize',scroll);layer.remove();}};
}
