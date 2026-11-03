import {validateSpreadsheetFieldValue} from '@barocss/doc-sync';
import {ListTable,register} from '@visactor/vtable';
import {InputEditor,ValidateEnum} from '@visactor/vtable-editors';
import {SheetSession,META} from './session.ts';
import {drawTextCursor,textInputSelection} from './text-cursor-layout.ts';
import {selectionOutline,selectionLanes} from './selection-geometry.ts';
import type {CellRange} from './selection-geometry.ts';
import {changedInspectorFields,changedProfileFields} from './inspector.ts';
import type {InspectorDraft,FieldDraft} from './inspector.ts';
import {sheetProfile,parseFieldInput} from './profiles.ts';
import type {SparseCellPatch} from '../../../experiments/sparse-sheet/src/sheet.ts';
const columnName=(n:number)=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const address=(row:number,column:number)=>columnName(column)+(row+1);
function parseAddress(text:string,rows=META.rows,columns=META.columns){const m=/^([A-Z]+)([1-9]\d*)$/.exec(text.trim().toUpperCase());if(!m)throw Error('Use a cell address such as A1 or XFD1048576');let col=0;for(const c of m[1]!)col=col*26+c.charCodeAt(0)-64;const row=Number(m[2])-1;if(row>=rows||col>columns)throw Error('Address outside sheet');return {row,column:col-1};}
const params=new URLSearchParams(location.search);
const profile=sheetProfile(params.get('profile'),params.get('axes'));
const room=params.get('room')??(params.get('axes')==='stable'?'stable-'+profile.id:profile.id==='default'?'studio':profile.id);
const suffix=crypto.randomUUID();
const sessions=[new SheetSession('alice-'+suffix,room,'',profile),new SheetSession('bob-'+suffix,room,'',profile)];
const views=sessions.map((session,i)=>{
 const section=document.createElement('section');section.className='peer';section.dataset.peer=String(i);
 section.innerHTML=`<div class="peer-head"><span class="avatar ${i?'bob':''}">${i?'B':'A'}</span><div><h2>${i?'Bob':'Alice'}</h2><div class="status" role="status">Connecting…</div></div><div class="connection"><button data-action="connection">Disconnect</button><label><input type="checkbox" data-action="hold"> Hold inbound</label></div></div><div class="tools"><button data-action="undo" title="Undo this actor's edit">↶ Undo</button><button data-action="redo">↷ Redo</button><label>Window <input class="jump" value="A1" aria-label="Window start"></label><button data-action="jump">Go</button><span class="viewport">100 × 26 window</span></div><form class="inspector"><output class="address">A1</output><label>Value<input name="value" aria-label="Cell value" autocomplete="off"></label><label>Formula text<input name="formula" aria-label="Formula text" placeholder="Stored text only" autocomplete="off"></label><label>Fill<input name="fill" type="color" value="#ffffff" aria-label="Cell fill"></label><label class="bold"><input name="bold" type="checkbox"> Bold</label><button type="submit">Apply</button></form><div class="grid" aria-label="${i?'Bob':'Alice'} spreadsheet canvas"></div><div class="presence">No remote selection</div><div class="metrics"></div>`;
 if(profile.schema){
  const form=section.querySelector('.inspector')!;
  form.replaceChildren();const output=document.createElement('output');output.className='address';form.append(output);
  for(const [name,spec] of Object.entries(profile.fields)){
   const label=document.createElement('label');label.append(name);
   const control=spec.values?document.createElement('select'):document.createElement('input');control.name=name;control.setAttribute('aria-label',name);
   if(control instanceof HTMLSelectElement)for(const value of spec.values!){const option=document.createElement('option');option.value=String(value);option.textContent=String(value);control.append(option);}
   else {control.type=spec.type==='boolean'?'checkbox':spec.type==='number'?'number':'text';if(spec.type==='number'){control.step='any';if(spec.min!==undefined)control.min=String(spec.min);if(spec.max!==undefined)control.max=String(spec.max);}if(spec.maxLength!==undefined)control.maxLength=spec.maxLength;}
   label.append(control);form.append(label);
  }
  const apply=document.createElement('button');apply.type='submit';apply.textContent='Apply';form.append(apply);
 }
 document.querySelector('#peers')!.append(section);
 const container=section.querySelector('.grid') as HTMLElement;
 let origin={row:0,column:0},selected={row:0,column:0},renderCPU=0,renderQueued=false,suppressGridEdits=false;
 let composing=false;let nativeCleanup=()=>{};
 let baseline:FieldDraft={},selectedTarget=session.target(0,0),nativeTarget:any=null;let projectedExtent='';let restoringSelection=false;let selectionTargets=[{start:selectedTarget,end:selectedTarget}];
 if(session.stable){const tools=document.createElement('div');tools.className='tools axis-tools';tools.innerHTML='<select aria-label="Axis"><option value="row">Row</option><option value="column">Column</option></select><button data-structure="insert">Insert</button><button data-structure="delete">Delete</button><input type="number" min="1" value="1" aria-label="Move destination"><button data-structure="move">Move to</button>';section.querySelector('.tools')!.after(tools);tools.querySelectorAll('[data-structure]').forEach(button=>button.addEventListener('click',()=>{try{const axis=(tools.querySelector('select') as HTMLSelectElement).value as 'row'|'column';const position=session.resolve(selectedTarget);session.structure(axis,(button as HTMLElement).dataset.structure as 'insert'|'delete'|'move',position[axis],1,Number((tools.querySelector('input') as HTMLInputElement).value)-1);}catch(error){section.querySelector('.status')!.textContent=String(error);}}));}

 const input=(name:string)=>section.querySelector(`[name=${name}]`) as HTMLInputElement;
 type ProjectedPeer={actor:string;name:string;color:string;range:any;editing:any;position:any};
 let projectedPeers:ProjectedPeer[]=[];
 const previews=new Map<string,ProjectedPeer>();
 const safeColor=(color:unknown)=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)?color:'#3975c5';
 const cachePresence=()=>{previews.clear();projectedPeers=session.peers.filter(p=>p.actor!==session.actor).sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:0).map(p=>({...p,color:safeColor(p.color),range:p.range?session.projectRange(p.range):null,position:p.editing?session.resolve(p.editing.target):null}));for(const p of projectedPeers)if(p.editing&&p.position?.row>=0&&p.position?.column>=0)previews.set(`${p.position.row}:${p.position.column}`,p);};
 const records=()=>Array.from({length:Math.min(100,session.rows-origin.row)},(_,r)=>Object.fromEntries(Array.from({length:Math.min(26,session.columns-origin.column)},(_,c)=>{const row=origin.row+r,column=origin.column+c,preview=previews.get(`${row}:${column}`);return [String(c),preview?(preview.editing.field===profile.primary||preview.editing.field==='formula'?preview.editing.text:`${preview.editing.field}: ${preview.editing.text}`):session.sheet.getCellValue(row,column,profile.primary)??''];})));
 const projectedStyles=new Map<string,string>();
 const cellStyle=(row:number,column:number)=>{
  const cell=row>=0&&column>=0&&row<session.rows&&column<session.columns?session.sheet.getCell(row,column):{};
  const remote=projectedPeers.find(p=>p.range&&row>=Math.min(p.range.row,p.range.endRow)&&row<=Math.max(p.range.row,p.range.endRow)&&column>=Math.min(p.range.column,p.range.endColumn)&&column<=Math.max(p.range.column,p.range.endColumn));
  return {bgColor:!profile.schema&&typeof cell.fill==='string'?cell.fill:remote?(remote.color==='#3975c5'?'#eaf2ff':remote.color==='#d64b55'?'#fff0f1':remote.color+'18'):'#fff',fontWeight:!profile.schema&&cell.bold===true?'bold':'normal',color:'#273345',fontStyle:'normal',borderColor:'#e5e9ef',borderLineWidth:1};
 };
 const editorName='presence-input-'+i;
 const editor=new InputEditor();
 const end=editor.onEnd.bind(editor);editor.onEnd=()=>{nativeCleanup();nativeCleanup=()=>{};composing=false;session.clearPreview();end();queueMicrotask(()=>{if(!manager()?.editingEditor)nativeTarget=null;refresh();});};
 const start=editor.onStart.bind(editor);editor.onStart=context=>{
  nativeCleanup();nativeCleanup=()=>{};
  nativeTarget=session.target(origin.row+context.row-1,origin.column+context.col-1);const target={...nativeTarget};start({...context,value:String(session.sheet.getCellValue(origin.row+context.row-1,origin.column+context.col-1,profile.primary)??'')});
  const element=editor.getInputElement();element.style.borderColor=safeColor(session.color);element.dataset.presenceEditor='true';const style=cellStyle(origin.row+context.row-1,origin.column+context.col-1);Object.assign(element.style,{fontFamily:'Arial',fontSize:'13px',fontWeight:style.fontWeight,fontStyle:style.fontStyle,color:style.color,lineHeight:'normal'});
  const tablePadding=table.getCellStyle(context.col,context.row).padding;
  const padding=Array.isArray(tablePadding)?tablePadding:[tablePadding];
  const leftPadding=padding[3]??padding[1]??padding[0]??0,rightPadding=padding[1]??padding[0]??0;
  const cellRect=table.getCellRelativeRect(context.col,context.row),gridRect=container.getBoundingClientRect(),inputRect=element.getBoundingClientRect(),inputStyle=getComputedStyle(element);
  // InputEditor expands the cell by one pixel; compensate using actual bounds.
  const left=gridRect.left+cellRect.left+leftPadding-inputRect.left-parseFloat(inputStyle.borderLeftWidth);
  const right=inputRect.right-parseFloat(inputStyle.borderRightWidth)-(gridRect.left+cellRect.right-rightPadding);
  if(Number.isFinite(left)&&Number.isFinite(right)){element.style.paddingLeft=`${Math.max(0,left)}px`;element.style.paddingRight=`${Math.max(0,right)}px`;}

  let active=true;
  const publish=()=>{if(active&&document.activeElement===element)session.preview(target,profile.primary,element.value,{composing,selection:textInputSelection(element)});};
  const compositionStart=()=>{composing=true;publish();};const compositionEnd=()=>{composing=false;publish();};
  const keydown=(event:KeyboardEvent)=>{if(event.isComposing||composing||event.keyCode===229){if(event.key==='Enter')event.stopPropagation();return;}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();manager().cancelEdit();refresh();}};
  element.addEventListener('input',publish);element.addEventListener('compositionstart',compositionStart);element.addEventListener('compositionend',compositionEnd);element.addEventListener('keydown',keydown,true);
  for(const event of ['select','keyup','pointerup'])element.addEventListener(event,publish);
  document.addEventListener('selectionchange',publish);
  publish();queueMicrotask(publish);
  nativeCleanup=()=>{active=false;for(const event of ['select','keyup','pointerup'])element.removeEventListener(event,publish);document.removeEventListener('selectionchange',publish);element.removeEventListener('input',publish);element.removeEventListener('compositionstart',compositionStart);element.removeEventListener('compositionend',compositionEnd);element.removeEventListener('keydown',keydown,true);};
 };
 editor.validateValue=value=>{if(composing)return ValidateEnum.invalidateNotExit;const position=nativeTarget&&session.resolve(nativeTarget);if(position&&(position.row<0||position.column<0)){section.querySelector('.status')!.textContent='Cell was deleted; draft kept';return ValidateEnum.invalidateNotExit;}try{const parsed=parseFieldInput(profile.fields[profile.primary]!,String(value??''));if(profile.schema&&!validateSpreadsheetFieldValue(profile.schema,profile.primary,parsed))throw Error('Value does not match the field constraints');return ValidateEnum.validateExit;}catch(error){section.querySelector('.status')!.textContent=String(error);return ValidateEnum.invalidateNotExit;}};
 register.editor(editorName,editor);
 const columns=()=>Array.from({length:Math.min(26,session.columns-origin.column)},(_,c)=>({field:String(c),title:columnName(origin.column+c),width:100,editor:editorName,style:(args:any)=>cellStyle(origin.row+args.row-1,origin.column+args.col-1)}));
 const table=new ListTable(container,{records:records(),columns:columns(),defaultRowHeight:28,defaultHeaderRowHeight:30,rowSeriesNumber:{width:56,title:'#',format:(_col:number,row:number)=>String(origin.row+row)},editCellTrigger:'doubleclick',keyboardOptions:{editCellOnEnter:true,editCellOnKeydown:true},select:{disableSelect:false},theme:{defaultStyle:{fontFamily:'Arial',fontSize:13,borderColor:'#e5e9ef'},headerStyle:{bgColor:'#f6f8fa',color:'#657083',fontSize:12,fontWeight:'normal'},rowHeaderStyle:{bgColor:'#f6f8fa'},selectionStyle:{cellBorderColor:safeColor(session.color),cellBorderLineWidth:2}}} as any);
 // Keep remote outlines independent of VTable's shared cell borders.
 const svgNS='http://www.w3.org/2000/svg';
 const overlay=document.createElementNS(svgNS,'svg');overlay.classList.add('peer-selection-overlay');overlay.setAttribute('aria-hidden','true');
 const clipId='peer-selection-clip-'+i+'-'+suffix;
 const defs=document.createElementNS(svgNS,'defs'),clip=document.createElementNS(svgNS,'clipPath'),clipRect=document.createElementNS(svgNS,'rect');clip.id=clipId;clip.append(clipRect);defs.append(clip);overlay.append(defs);
 const textOverlay=document.createElement('div');textOverlay.className='peer-text-overlay';textOverlay.setAttribute('aria-hidden','true');container.append(textOverlay);
 const outlines=document.createElementNS(svgNS,'g');outlines.setAttribute('clip-path',`url(#${clipId})`);overlay.append(outlines);container.append(overlay);
 function drawPeerSelections(){
  const header=table.getCellRelativeRect(0,0),draw=table.getDrawRange();
  const left=Math.max(draw.left,header.right),top=Math.max(draw.top,header.bottom);
  clipRect.setAttribute('x',String(left));clipRect.setAttribute('y',String(top));clipRect.setAttribute('width',String(Math.max(0,draw.right-left)));clipRect.setAttribute('height',String(Math.max(0,draw.bottom-top)));
  const window={...origin,rows:Math.min(100,session.rows-origin.row),columns:Math.min(26,session.columns-origin.column)};
  const paths:SVGPathElement[]=[],entries:{actor:string;color:string;range:CellRange}[]=[];
  for(const peer of projectedPeers){
   const ranges=peer.range?[peer.range]:[];
   const position=peer.position;
   if(peer.editing&&position?.row>=0&&position?.column>=0&&(!peer.range||position.row<Math.min(peer.range.row,peer.range.endRow)||position.row>Math.max(peer.range.row,peer.range.endRow)||position.column<Math.min(peer.range.column,peer.range.endColumn)||position.column>Math.max(peer.range.column,peer.range.endColumn)))ranges.push({...position,endRow:position.row,endColumn:position.column});
   for(const range of ranges)entries.push({actor:peer.actor,color:peer.color,range});
  }
  const lanes=selectionLanes(entries);
  entries.forEach((entry,index)=>{const lane=lanes[index]!;const d=selectionOutline(entry.range,window,(col,row)=>table.getCellRelativeRect(col,row),lane.inset);if(!d)return;
   const path=document.createElementNS(svgNS,'path');path.setAttribute('d',d);path.setAttribute('stroke',entry.color);path.dataset.actor=entry.actor;path.dataset.range=lane.rangeKey;path.dataset.index=String(lane.index);path.dataset.inset=String(lane.inset);path.setAttribute('stroke-width','2');path.setAttribute('fill','none');
   if(lane.dashArray){path.setAttribute('stroke-dasharray',lane.dashArray);path.setAttribute('stroke-dashoffset',String(lane.dashOffset));}paths.push(path);
  });
  outlines.replaceChildren(...paths);
  textOverlay.replaceChildren();
  Object.assign(textOverlay.style,{left:`${left}px`,top:`${top}px`,width:`${Math.max(0,draw.right-left)}px`,height:`${Math.max(0,draw.bottom-top)}px`});
  for(const peer of previews.values()){
   const editing=peer.editing,selection=editing?.selection,position=peer.position;
   if(!selection||!position||position.row<origin.row||position.row>=origin.row+window.rows||position.column<origin.column||position.column>=origin.column+window.columns)continue;
   if(nativeTarget&&manager()?.editingEditor){const local=session.resolve(nativeTarget);if(local.row===position.row&&local.column===position.column)continue;}
   const col=position.column-origin.column+1,row=position.row-origin.row+1,rect=table.getCellRelativeRect(col,row);
   if(rect.right<=left||rect.left>=draw.right||rect.bottom<=top||rect.top>=draw.bottom)continue;
   const style=table.getCellStyle(col,row),rawPadding=style.padding??[10,16,10,16],padding=Array.isArray(rawPadding)?rawPadding:[rawPadding];
   const pl=padding[3]??padding[1]??padding[0]??0,pr=padding[1]??padding[0]??0;
   const cell=document.createElement('div');cell.className='peer-text-cell';cell.dataset.actor=peer.actor;cell.dataset.target=JSON.stringify(editing.target);cell.dataset.row=String(position.row);cell.dataset.column=String(position.column);cell.dataset.field=editing.field;
   Object.assign(cell.style,{left:`${rect.left-left+1}px`,top:`${rect.top-top+1}px`,width:`${Math.max(0,rect.right-rect.left-2)}px`,height:`${Math.max(0,rect.bottom-rect.top-2)}px`,backgroundColor:String(style.bgColor??'#fff'),paddingLeft:`${Math.max(0,pl-1)}px`,paddingRight:`${Math.max(0,pr-1)}px`,fontFamily:String(style.fontFamily??'Arial'),fontSize:`${style.fontSize??13}px`,fontWeight:String(style.fontWeight??'normal'),fontStyle:String(style.fontStyle??'normal'),color:String(style.color??'#273345')});
   const viewport=document.createElement('div');viewport.className='peer-text-viewport';cell.append(viewport);textOverlay.append(cell);
   const prefix=editing.field===profile.primary||editing.field==='formula'?'':`${editing.field}: `;viewport.dataset.prefix=prefix;viewport.dataset.previewText=editing.text;viewport.dataset.rawStart=String(selection.start);viewport.dataset.rawEnd=String(selection.end);
   drawTextCursor(viewport,prefix+editing.text,{...selection,start:selection.start+prefix.length,end:selection.end+prefix.length},peer.color);
  }
 }
 let outlineQueued=false;
 const schedulePeerSelections=()=>{if(outlineQueued)return;outlineQueued=true;requestAnimationFrame(()=>{outlineQueued=false;drawPeerSelections();});};
 table.on('scroll',schedulePeerSelections);table.on('after_render',schedulePeerSelections);
 new ResizeObserver(schedulePeerSelections).observe(container);
 const readDraft=():FieldDraft=>Object.fromEntries(Object.entries(profile.fields).map(([name,spec])=>[name,spec.type==='boolean'?input(name).checked:input(name).value]));
 const manager=()=> (table as any).editorManager;

 function inspect(force=false){if(!force&&(section.querySelector('.inspector')?.contains(document.activeElement)||JSON.stringify(readDraft())!==JSON.stringify(baseline)))return;const position=session.resolve(selectedTarget);if(position.row<0||position.column<0)return;selected=position;const cell=session.sheet.getCell(selected.row,selected.column);section.querySelector('.address')!.textContent=address(selected.row,selected.column);for(const [name,spec] of Object.entries(profile.fields)){const value=cell[name]??spec.default;if(spec.type==='boolean')input(name).checked=!!value;else input(name).value=String(value??'');}baseline=readDraft();}
 function refresh(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;const t=performance.now();cachePresence();const editor=manager();const current=editor?.editingEditor?editor.editCell:null;const extent=`${session.rows}:${session.columns}`;if(session.stable&&extent!==projectedExtent&&!current){origin.row=Math.max(0,Math.min(origin.row,session.rows-1));origin.column=Math.max(0,Math.min(origin.column,session.columns-1));suppressGridEdits=true;try{table.updateOption({...table.options,columns:columns(),records:records()});projectedStyles.clear();projectedExtent=extent;}finally{suppressGridEdits=false;}}const data=records();table.clearCellStyleCache();suppressGridEdits=true;try{for(let r=0;r<data.length;r++)for(let c=0;c<Math.min(26,session.columns-origin.column);c++){if(current?.row===r+1&&current?.col===c+1)continue;const next=data[r]![String(c)];const style=JSON.stringify(cellStyle(origin.row+r,origin.column+c));const key=`${r}:${c}`;if(projectedStyles.get(key)!==style){table.scenegraph.updateCellContent(c+1,r+1);projectedStyles.set(key,style);}if(table.getCellValue(c+1,r+1)!==next)table.changeCellValue(c+1,r+1,next as string|number,false,false);}}finally{suppressGridEdits=false;}if(session.stable&&!current){const ranges=selectionTargets.map(range=>({start:session.resolve(range.start),end:session.resolve(range.end)})).filter(range=>[range.start,range.end].every(p=>p.row>=origin.row&&p.row<origin.row+Math.min(100,session.rows-origin.row)&&p.column>=origin.column&&p.column<origin.column+Math.min(26,session.columns-origin.column))).map(range=>({start:{col:range.start.column-origin.column+1,row:range.start.row-origin.row+1},end:{col:range.end.column-origin.column+1,row:range.end.row-origin.row+1}}));if(JSON.stringify(table.getSelectedCellRanges().map(({start,end})=>({start,end})))!==JSON.stringify(ranges)){restoringSelection=true;try{table.clearSelected();if(ranges.length)table.selectCells(ranges);}finally{restoringSelection=false;}}}table.render();drawPeerSelections();renderCPU=performance.now()-t;inspect();const state=session.summary();if(session.stable){document.querySelector('.extent')!.textContent=`${session.rows.toLocaleString('en-US')} rows × ${session.columns.toLocaleString('en-US')} columns`;section.querySelector('.viewport')!.textContent=`${Math.min(100,session.rows-origin.row)} × ${Math.min(26,session.columns-origin.column)} window`;}section.querySelector('.status')!.textContent=state.blocked?'Blocked: '+state.blocked:session.stable&&nativeTarget&&manager()?.editingEditor&&(session.resolve(nativeTarget).row<0||session.resolve(nativeTarget).column<0)?'Cell was deleted; draft kept':state.connected?`Connected · server ${state.serverSeq}`:'Offline · edits stay in memory';section.querySelector('[data-action=connection]')!.textContent=session.connected?'Disconnect':'Reconnect';section.querySelector('.presence')!.textContent=projectedPeers.filter(p=>p.range).map(p=>`${p.name} selects ${address(p.range.row,p.range.column)}:${address(p.range.endRow,p.range.endColumn)}`).join(' · ')||'No remote selection';section.querySelector('.metrics')!.textContent=`${state.stats.registers} sparse fields · ${state.stats.retainedOps} retained ops · ${state.pending} pending · ${state.inbound} held · edit ${state.metrics.clientEditMs.toFixed(2)} ms · render CPU ${renderCPU.toFixed(1)} ms`;});}
 table.on('change_cell_value',((e:any)=>{if(!suppressGridEdits&&e.row>=1&&e.col>=1){try{session.editTarget(nativeTarget??session.target(origin.row+e.row-1,origin.column+e.col-1),{[profile.primary]:parseFieldInput(profile.fields[profile.primary]!,String(e.changedValue??e.value??''))});session.clearPreview();nativeTarget=null;refresh();}catch(error){section.querySelector('.status')!.textContent=String(error);refresh();}}}) as any);
 table.on('selected_cell',((e:any)=>{if(restoringSelection||suppressGridEdits||e.row<1||e.col<1)return;session.clearPreview();selected={row:origin.row+e.row-1,column:origin.column+e.col-1};selectedTarget=session.target(selected.row,selected.column);selectionTargets=(e.ranges?.length?e.ranges:[{start:{row:e.row,col:e.col},end:{row:e.row,col:e.col}}]).map((range:any)=>({start:session.target(origin.row+Math.max(1,range.start.row)-1,origin.column+Math.max(1,range.start.col)-1),end:session.target(origin.row+range.end.row-1,origin.column+range.end.col-1)}));inspect(true);const range=e.ranges?.at(-1);void session.presence({row:range?origin.row+Math.max(1,range.start.row)-1:selected.row,column:range?origin.column+Math.max(1,range.start.col)-1:selected.column,endRow:range?origin.row+range.end.row-1:selected.row,endColumn:range?origin.column+range.end.col-1:selected.column});}) as any);
 section.querySelector('.inspector')!.addEventListener('submit',e=>{e.preventDefault();if(inspectorComposing)return;const draft=readDraft();try{const patch=profile.schema?changedProfileFields(profile.fields,baseline,draft):changedInspectorFields(baseline as unknown as InspectorDraft,draft as unknown as InspectorDraft);if(Object.keys(patch).length){session.editTarget(selectedTarget,patch);baseline=draft;}session.clearPreview();}catch(error){section.querySelector('.status')!.textContent=String(error);}});
 const inspector=section.querySelector('.inspector')!;
 let inspectorComposing=false;
 const publishInspector=(control:HTMLInputElement|HTMLSelectElement)=>{const field=control.name;if(!profile.fields[field]||document.activeElement!==control)return;const text=control instanceof HTMLInputElement&&control.type==='checkbox'?String(control.checked):control.value;session.preview(selectedTarget,field,text,{composing:inspectorComposing,selection:control instanceof HTMLInputElement?textInputSelection(control):undefined});};
 inspector.addEventListener('input',e=>publishInspector(e.target as HTMLInputElement));
 inspector.addEventListener('compositionstart',e=>{inspectorComposing=true;publishInspector(e.target as HTMLInputElement);});
 inspector.addEventListener('compositionend',e=>{inspectorComposing=false;publishInspector(e.target as HTMLInputElement);});
 for(const name of ['focusin','select','keyup','pointerup'])inspector.addEventListener(name,e=>publishInspector(e.target as HTMLInputElement));
 document.addEventListener('selectionchange',()=>{const control=document.activeElement;if(control instanceof HTMLInputElement&&inspector.contains(control))publishInspector(control);});
 inspector.addEventListener('focusout',()=>{queueMicrotask(()=>{if(!inspector.contains(document.activeElement))session.clearPreview();});});
 inspector.addEventListener('keydown',e=>{if((e as KeyboardEvent).key==='Escape'){session.clearPreview();inspect(true);(e.target as HTMLElement).blur();}});
 container.addEventListener('mousemove',e=>{const rect=container.getBoundingClientRect(),cell=table.getCellAtRelativePosition(e.clientX-rect.left,e.clientY-rect.top);const preview=previews.get(`${origin.row+cell.row-1}:${origin.column+cell.col-1}`);container.title=preview?`${preview.name} · LIVE · ${preview.editing.field}${preview.editing.composing?' · composing':''}`:'';});
 const jump=(text:string)=>{origin=parseAddress(text,session.rows,session.columns);selected={...origin};selectedTarget=session.target(selected.row,selected.column);selectionTargets=[{start:selectedTarget,end:selectedTarget}];projectedStyles.clear();suppressGridEdits=true;try{table.updateOption({...table.options,columns:columns(),records:records()});}finally{suppressGridEdits=false;}(section.querySelector('.jump') as HTMLInputElement).value=address(origin.row,origin.column);section.querySelector('.viewport')!.textContent=`${Math.min(100,session.rows-origin.row)} × ${Math.min(26,session.columns-origin.column)} window`;inspect(true);refresh();};
 section.querySelector('[data-action=jump]')!.addEventListener('click',()=>{try{jump((section.querySelector('.jump') as HTMLInputElement).value);}catch(e){section.querySelector('.status')!.textContent=String(e);}});
 section.querySelector('[data-action=undo]')!.addEventListener('click',()=>session.undo());section.querySelector('[data-action=redo]')!.addEventListener('click',()=>session.redo());
 section.querySelector('[data-action=hold]')!.addEventListener('change',e=>session.setHold((e.target as HTMLInputElement).checked));
 section.querySelector('[data-action=connection]')!.addEventListener('click',()=>{if(session.connected)session.disconnect();else void session.connect().catch(()=>{});});
 session.onChange=refresh;inspect();
 return {session,table,jump,select:(row:number,column:number)=>{selected={row,column};selectedTarget=session.target(row,column);selectionTargets=[{start:selectedTarget,end:selectedTarget}];inspect(true);void session.presence({row,column,endRow:row,endColumn:column});},snapshot:()=>({...session.snapshot(),viewport:{...origin,rows:Math.min(100,session.rows-origin.row),columns:Math.min(26,session.columns-origin.column)},renderCPU}),cellScreenPoint:(row:number,column:number)=>{const rect=table.getCellRelativeRect(column-origin.column+1,row-origin.row+1);const base=container.getBoundingClientRect();return {x:base.left+(rect.left+rect.right)/2,y:base.top+(rect.top+rect.bottom)/2};}};
});
const ready=Promise.all(sessions.map(s=>s.connect())).then(()=>true);
(window as any).__spreadsheetDemo={ready,profile:profile.id,sessions,views,snapshot:()=>views.map(v=>v.snapshot()),actions:{structure:(peer:number,axis:'row'|'column',action:'insert'|'delete'|'move',index:number,count=1,destination=0)=>sessions[peer]!.structure(axis,action,index,count,destination),edit:(peer:number,row:number,column:number,patch:SparseCellPatch)=>sessions[peer]!.edit(row,column,patch),jump:(peer:number,cell:string)=>views[peer]!.jump(cell),select:(peer:number,row:number,column:number)=>views[peer]!.select(row,column),hold:(peer:number,value:boolean)=>sessions[peer]!.setHold(value),undo:(peer:number)=>sessions[peer]!.undo(),redo:(peer:number)=>sessions[peer]!.redo(),disconnect:(peer:number)=>sessions[peer]!.disconnect(),reconnect:(peer:number)=>sessions[peer]!.connect()},cellScreenPoint:(peer:number,row:number,column:number)=>views[peer]!.cellScreenPoint(row,column)};
