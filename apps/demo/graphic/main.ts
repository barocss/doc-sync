import {SceneSession} from './session.ts';
import {GraphicCanvas} from './canvas.ts';
import type {CanvasObject} from './canvas.ts';

const input=(name:string,label:string,value:unknown,type='text')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${escape(value)}" ${type==='number'?'step="any"':''}></label>`;

const GRAPHIC_TRANSFORM_FIELDS = Object.freeze(['x','y','rotation','scale']);
const GRAPHIC_DIMENSION_FIELDS = Object.freeze(['width','height']);

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const params=new URLSearchParams(location.search),doc=params.get('doc')??'canvas',requested=params.get('size')??'sample';
const provision=await fetch('/api/graphic/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({doc,count:requested==='sample'?'sample':Number(requested)})});
if(!provision.ok)throw new Error(`Cannot open graphic document (${provision.status})`);
const suffix=crypto.randomUUID();
const sessions=[new SceneSession({doc,actor:`graphic-a-${suffix}`, profile:{name:'Peer A',color:'#2463eb'}}),new SceneSession({doc,actor:`graphic-b-${suffix}`, profile:{name:'Peer B',color:'#cf6a39'}})];
let active=0,initialized=false,inspectorKey='',layersKey='',feedbackTimer:ReturnType<typeof setTimeout>;
const errors:string[]=[];
function report(error:unknown){const message=error instanceof Error?error.message:String(error);errors.push(message);$('#feedback').textContent=message;$('#feedback').classList.add('visible');clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>$('#feedback').classList.remove('visible'),6500);}
function safe(action:()=>unknown){try{return action();}catch(error){report(error);}}
const canvases=sessions.map((session,index)=>new GraphicCanvas($(`#canvas-${index?'b':'a'}`),{
  select(id){active=index;safe(()=>session.select(id?[id]:[]));refresh();},
  move(id,x,y){safe(()=>session.moveWorld(id,x,y));},
  pointer(point){safe(()=>session.pointer(point));},error:report,
}));
function objects(index=active){return sessions[index].model() as CanvasObject[];}
function selection(index=active){return sessions[index].snapshot().selectedIds as string[];}
function current(){return objects().find(object=>object.id===selection()[0]);}
function activate(index:number){active=index;inspectorKey='';refresh();}
function depths(list:CanvasObject[]){const byId=new Map(list.map(object=>[object.id,object])),result=new Map<string,number>();const depth=(id:string,seen=new Set<string>()):number=>{if(result.has(id))return result.get(id)!;if(seen.has(id))return 0;seen.add(id);const parent=byId.get(id)?.parentId,n=parent?depth(parent,seen)+1:0;result.set(id,n);return n;};for(const object of list)depth(object.id);return result;}
function refresh(){
  if(!initialized)return;
  sessions.forEach((session,index)=>{const snapshot=session.snapshot();canvases[index].update(snapshot.objects as CanvasObject[],snapshot.selectedIds,snapshot.peers);const suffix=index?'b':'a';const status=$(`#status-${suffix}`);status.textContent=snapshot.held?'Incoming held':snapshot.online?'Connected':'Offline';status.classList.toggle('online',snapshot.online);$(`#peer-${suffix}`).classList.toggle('active',index===active);$(`[data-connect="${index}"]`).textContent=snapshot.online?'Disconnect':'Reconnect';$(`[data-hold="${index}"]`).setAttribute('aria-pressed',String(snapshot.held));const chosen=snapshot.objects.find(object=>object.id===snapshot.selectedIds[0]);$(`#selection-${suffix}`).textContent=chosen?String(chosen.name||chosen.type):'No selection';});
  $('#active-name').textContent=`Peer ${active?'B':'A'}`;
  const list=objects(),query=$<HTMLInputElement>('#search').value.toLowerCase();$('#object-count').textContent=String(list.length);
  const nextLayersKey=JSON.stringify([active,list.map(object=>[object.id,object.parentId,object.name,object.locked]),query,selection()]);
  if(layersKey!==nextLayersKey){layersKey=nextLayersKey;const layerDepth=depths(list);$('#layer-list').innerHTML=list.filter(object=>!query||`${object.name} ${object.id}`.toLowerCase().includes(query)).map(object=>`<button class="layer-row ${selection().includes(object.id)?'selected':''}" role="treeitem" aria-selected="${selection().includes(object.id)}" data-id="${escape(object.id)}" title="${escape(object.id)}" style="padding-left:${12+(layerDepth.get(object.id)??0)*13}px"><span class="kind">${({rectangle:'▭',ellipse:'○',label:'T',frame:'▣','object-group':'⊞'}as Record<string,string>)[object.type]??'·'}</span><span class="name">${escape(object.name||object.type)}</span>${object.locked?'<span class="lock">Locked</span>':''}</button>`).join('');}
  $('#undo').toggleAttribute('disabled',!sessions[active].snapshot().history.canUndo);$('#redo').toggleAttribute('disabled',!sessions[active].snapshot().history.canRedo);$('#delete').toggleAttribute('disabled',!current());
  const states=sessions.map(session=>session.snapshot());$('#sync-state').textContent=states.every(state=>state.online)?states.some(state=>state.held)?'Incoming changes are paused':'Both peers connected to the same document':'Offline changes remain in the local client';
  renderInspector();
}
function renderInspector(){
  const object=current(),key=`${active}:${object?.id??''}`;
  if(key===inspectorKey&&$('#inspector-content').contains(document.activeElement))return;
  const signature=object?JSON.stringify(object):'';
  if(key===inspectorKey&&$('#inspector-content').dataset.signature===signature)return;
  inspectorKey=key;$('#inspector-content').dataset.signature=signature;
  if(!object){$('#inspector-content').innerHTML='<div class="empty"><span>↖</span>Select an object<br><small>Inspect its properties here.</small></div>';return;}

  const t=object.transform,s=object.size??{width:160,height:70};
  $('#inspector-content').innerHTML=`<form id="properties"><div class="section-label">${escape(object.type)}</div>${input('name','Name',object.name??'')}<div class="object-id" title="Stable object ID">${escape(object.id)}</div><div class="section-label">Geometry</div><div class="field-row">${input('x','X',t.x,'number')}${input('y','Y',t.y,'number')}${input('width','Width',s.width,'number')}${input('height','Height',s.height,'number')}${input('rotation','Rotation °',t.rotation,'number')}${input('scale','Scale',t.scale,'number')}</div><div class="section-label">Appearance</div><div class="field-row">${input('fill','Fill',object.fill??'#dbe7ff','color')}${input('opacity','Opacity',object.opacity??1,'number')}</div>${object.type==='label'?`<label class="field">Text<textarea name="text">${escape(object.text??'')}</textarea></label>`:''}<button class="primary" type="submit">Apply changes</button><p class="help">Only changed fields are applied.</p></form><div class="section-label">Structure</div><label class="field">Parent<select id="parent"><option value="">Canvas root</option>${objects().filter(item=>item.id!==object.id&&(item.type==='frame'||item.type==='object-group')).map(item=>`<option value="${escape(item.id)}" ${object.parentId===item.id?'selected':''}>${escape(item.name||item.type)} · ${escape(item.id.slice(-8))}</option>`).join('')}</select></label><div class="stack-order"><button id="backward">Move back</button><button id="forward">Move forward</button></div><button class="danger" id="inspector-delete">Delete object</button>`;
  const form=$<HTMLFormElement>('#properties'),base=new FormData(form),baseText=object.text;
  form.addEventListener('submit',event=>{event.preventDefault();safe(()=>{
    const fresh=objects().find(item=>item.id===object.id);if(!fresh)throw new Error('This object was deleted. Select another object.');
    const values=new FormData(form),attrs:Record<string,unknown>={},transform:Record<string,number>={},size:Record<string,number>={};
    for(const[name,value]of values){if(value===base.get(name))continue;if(GRAPHIC_TRANSFORM_FIELDS.includes(name))transform[name]=Number(value);else if(GRAPHIC_DIMENSION_FIELDS.includes(name))size[name]=Number(value);else if(name==='opacity')attrs[name]=Number(value);else attrs[name]=String(value);}
    if('text'in attrs&&fresh.text!==baseText)throw new Error('The text changed in the other peer. Select the object again to load its latest text.');
    if(Object.keys(transform).length)attrs.transform=transform;if(Object.keys(size).length)attrs.size=size;
    if(Object.keys(attrs).length)sessions[active].update(object.id,attrs,'text'in attrs?baseText:undefined);
    inspectorKey='';form.querySelector<HTMLElement>('button')?.blur();refresh();
  });});
  $('#parent').addEventListener('change',event=>safe(()=>sessions[active].reparent(object.id,(event.target as HTMLSelectElement).value||null)));
  $('#inspector-delete').addEventListener('click',()=>safe(()=>sessions[active].delete(object.id)));
  const reorder=(delta:number)=>safe(()=>{const siblings=objects().filter(item=>item.parentId===object.parentId);sessions[active].reorder(object.id,Math.max(0,Math.min(siblings.length-1,siblings.findIndex(item=>item.id===object.id)+delta)));});
  $('#backward').addEventListener('click',()=>reorder(-1));$('#forward').addEventListener('click',()=>reorder(1));
}
$('#search').addEventListener('input',refresh);
$('#layer-list').addEventListener('click',event=>{const row=(event.target as HTMLElement).closest<HTMLElement>('[data-id]');if(row)safe(()=>sessions[active].select([row.dataset.id!]));});
$('#create-tools').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-create]');if(!button)return;safe(()=>{const id=sessions[active].create(button.dataset.create as any,{name:button.dataset.create==='object-group'?'Group':button.dataset.create,transform:{x:65+objects().length%7*24,y:80+objects().length%7*24,rotation:0,scale:1},size:{width:button.dataset.create==='frame'?320:160,height:button.dataset.create==='frame'?230:90},...(button.dataset.create==='label'?{text:'New label'}:{})});sessions[active].select([id]);});});
$('#undo').addEventListener('click',()=>safe(()=>sessions[active].undo()));$('#redo').addEventListener('click',()=>safe(()=>sessions[active].redo()));$('#delete').addEventListener('click',()=>safe(()=>selection().forEach(id=>sessions[active].delete(id))));
document.querySelectorAll<HTMLElement>('[data-active]').forEach(button=>button.addEventListener('click',()=>activate(Number(button.dataset.active))));
document.querySelectorAll<HTMLElement>('[data-connect]').forEach(button=>button.addEventListener('click',()=>safe(()=>{const session=sessions[Number(button.dataset.connect)];session.snapshot().online?session.disconnect():session.connect();})));
document.querySelectorAll<HTMLElement>('[data-hold]').forEach(button=>button.addEventListener('click',()=>safe(()=>{const session=sessions[Number(button.dataset.hold)];session.hold(!session.snapshot().held);})));
window.addEventListener('keydown',event=>{if((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();safe(()=>event.shiftKey?sessions[active].redo():sessions[active].undo());}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();safe(()=>selection().forEach(id=>sessions[active].delete(id)));}});
const subscriptions=sessions.map(session=>session.subscribe(refresh));
const api={ready:false,sessions,canvases,snapshot:()=>({ready:api.ready,active,views:sessions.map((session,index)=>({...session.snapshot(),render:canvases[index].snapshot()})),errors:[...errors]}),screenPoint:(view:number,id:string)=>canvases[view].screenPoint(id),actions:{select:(view:number,id:string)=>{activate(view);sessions[view].select([id]);},update:(view:number,id:string,attrs:Record<string,unknown>)=>sessions[view].update(id,attrs),create:(view:number,type:any,attrs:Record<string,unknown>={},parentId:string|null=null)=>sessions[view].create(type,attrs,parentId),hold:(view:number,value:boolean)=>sessions[view].hold(value),disconnect:(view:number)=>sessions[view].disconnect(),connect:(view:number)=>sessions[view].connect(),reparent:(view:number,id:string,parentId:string|null)=>sessions[view].reparent(id,parentId),undo:(view:number)=>sessions[view].undo(),redo:(view:number)=>sessions[view].redo(),lookup:(view:number,id:string)=>sessions[view].lookup(id)}};
(window as any).__graphicDemo=api;
Promise.all(canvases.map(canvas=>canvas.init())).then(()=>{initialized=true;api.ready=true;refresh();}).catch(report);
window.addEventListener('beforeunload',()=>{subscriptions.forEach(unsubscribe=>unsubscribe());canvases.forEach(canvas=>canvas.dispose());sessions.forEach(session=>session.dispose());});
