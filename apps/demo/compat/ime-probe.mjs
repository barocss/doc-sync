// Observation only. Do not dispatch composition events or alter editor selections here.
const events=[];
const composing=new Set();
for(const type of ['compositionstart','compositionupdate','compositionend','beforeinput','input']){
  document.addEventListener(type,event=>{
    const editor=event.target.closest?.('.editor');
    if(!editor)return;
    const name=editor.getAttribute('aria-label');
    if(type==='compositionstart')composing.add(name);
    if(type==='compositionend')composing.delete(name);
    events.push({type,name,data:event.data??null,inputType:event.inputType??null,isComposing:event.isComposing??null,isTrusted:event.isTrusted,at:performance.now()});
    if(events.length>500)events.shift();
  },true);
}
const point=(node,offset)=>{
  const element=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;
  const editor=element?.closest('.editor');
  const paragraph=element?.closest('p');
  if(!editor||!paragraph)return null;
  const range=document.createRange();range.selectNodeContents(paragraph);
  try{range.setEnd(node,offset);}catch{return null;}
  return {editor:editor.getAttribute('aria-label'),paragraph:[...editor.querySelectorAll('p')].indexOf(paragraph),offset:range.toString().length};
};
window.imeProbe={
  clear(){events.length=0;composing.clear();},
  read(){const selection=window.getSelection();return{events:[...events],composing:[...composing],selection:{anchor:point(selection?.anchorNode,selection?.anchorOffset),focus:point(selection?.focusNode,selection?.focusOffset),text:selection?.toString()??'',collapsed:selection?.isCollapsed??true},active:document.activeElement?.getAttribute('aria-label')??null};},
};
