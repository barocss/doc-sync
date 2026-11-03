/** DOM shaping is the source of truth for UTF-16 caret and selection geometry. */
export type TextCursorSelection={start:number;end:number;direction:'forward'|'backward'|'none'};
export function textInputSelection(control:HTMLInputElement):TextCursorSelection|undefined{
 if(!['text','search','url','tel','password'].includes(control.type))return;
 if(control.selectionStart===null||control.selectionEnd===null)return;
 return {start:control.selectionStart,end:control.selectionEnd,direction:control.selectionDirection??'none'};
}
export function drawTextCursor(host:HTMLElement,text:string,selection:TextCursorSelection,color:string){
 const span=document.createElement('span');span.className='peer-text-run';const node=document.createTextNode(text);span.append(node);host.append(span);
 const start=Math.max(0,Math.min(text.length,selection.start)),end=Math.max(start,Math.min(text.length,selection.end));
 const active=selection.direction==='backward'?start:end;
 host.dataset.start=String(start);host.dataset.end=String(end);host.dataset.active=String(active);host.dataset.direction=selection.direction;host.dataset.text=text;
 const bounds=host.getBoundingClientRect();
 const range=document.createRange();range.setStart(node,active);range.collapse(true);
 let caret=range.getBoundingClientRect();
 // Empty text nodes have no range box. The inline box still supplies the line box.
 const line=span.getBoundingClientRect();
 let x=caret.height?caret.left-bounds.left:line.left-bounds.left;
 const height=caret.height||line.height||parseFloat(getComputedStyle(host).fontSize);
 const top=caret.height?caret.top-bounds.top:line.top-bounds.top;
 const width=host.clientWidth;
 const scroll=Math.max(0,x-width+2);
 span.style.transform=`translateX(${-scroll}px)`;host.dataset.scroll=String(scroll);host.dataset.clipped=String(line.width>width);
 if(end>start){range.setStart(node,start);range.setEnd(node,end);for(const box of range.getClientRects()){
  const mark=document.createElement('i');mark.className='peer-text-highlight';Object.assign(mark.style,{left:`${box.left-bounds.left}px`,top:`${box.top-bounds.top}px`,width:`${box.width}px`,height:`${box.height}px`,backgroundColor:color+'38'});host.append(mark);
 }}
 const cursor=document.createElement('i');cursor.className='peer-text-caret';Object.assign(cursor.style,{left:`${x-scroll}px`,top:`${top}px`,height:`${height}px`,backgroundColor:color});cursor.dataset.offset=String(active);host.append(cursor);
}
