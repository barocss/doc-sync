import {StructuralSheet} from '@barocss/doc-sync';
import type {StructuralSheetOp} from '@barocss/doc-sync';
import {SparseSheet} from '../../../experiments/sparse-sheet/src/sheet.ts';
import type {SparseCellPatch,SparseSheetOp} from '../../../experiments/sparse-sheet/src/sheet.ts';
import {normalizePreview,presenceIdentity} from './presence.ts';
import type {PresenceEditing,PresenceTarget,PresenceTextSelection} from './presence.ts';
import {DEFAULT_META,sheetProfile} from './profiles.ts';
import type {SheetProfile} from './profiles.ts';
const copyAxis=(id:PresenceTarget['row'])=>typeof id==='number'?id:{...id};

export const META=DEFAULT_META;
type Entry={serverSeq:number;actor:string;ops:(SparseSheetOp|StructuralSheetOp)[]};
export class SheetSession {
 readonly sheet:SparseSheet|StructuralSheet; epoch=''; token=''; serverSeq=0; seq=0; connected=false; blocked=''; hold=false; peers:any[]=[];
 private stream:EventSource|null=null; private busy=false; private request:any=null; private inbox:Entry[]=[];
 onChange=()=>{}; metrics={clientEditMs:0,convergenceMs:0};private editedAt=0;
 readonly name:string;readonly color:string;
 private presenceIdle:Promise<void>|null=null;private presenceDone:(()=>void)|null=null;
 private presenceGeneration='';private presenceSeq=0;private presenceRange:any=null;private editing:PresenceEditing|undefined;private presenceTimer:ReturnType<typeof setTimeout>|null=null;private presenceBusy=false;private presenceDirty=false;private lastPresenceAt=0;
 readonly actor:string;readonly room:string;readonly base:string;readonly profile:SheetProfile;
 constructor(actor:string,room:string,base='',profile:SheetProfile=sheetProfile(null)){this.actor=actor;this.name=presenceIdentity(actor).name;this.color=presenceIdentity(actor).color;this.room=room;this.base=base;this.profile=profile;this.sheet=new (this.stable?StructuralSheet:SparseSheet)({actor,sheetId:META.sheetId,rows:META.rows,columns:META.columns,...(profile.schema?{schema:profile.schema}:{})});}
 get stable(){return this.profile.meta.protocol==='sparse-sheet-demo-s2-v1';}
 get rows(){return this.stable?(this.sheet as StructuralSheet).rows:META.rows;}
 get columns(){return this.stable?(this.sheet as StructuralSheet).columns:META.columns;}
 target(row:number,column:number){return this.stable?{row:(this.sheet as StructuralSheet).rowIdAt(row),column:(this.sheet as StructuralSheet).columnIdAt(column)}:{row,column};}
 resolve(target:any){if(!this.stable)return target;const sheet=this.sheet as StructuralSheet;return {row:sheet.rowIndexOf(target.row),column:sheet.columnIndexOf(target.column)};}
 editTarget(target:any,patch:SparseCellPatch){const position=this.resolve(target);if(position.row<0||position.column<0)throw Error('Cell was deleted; draft kept');if(this.stable){const t=performance.now();(this.sheet as StructuralSheet).setCellById(target.row,target.column,patch);this.editedAt=t;this.metrics.clientEditMs=performance.now()-t;this.onChange();void this.flush();}else this.edit(position.row,position.column,patch);}
 structure(axis:'row'|'column',action:'insert'|'delete'|'move',index:number,count=1,destination=0){if(!this.stable)throw Error('Stable axes required');const sheet=this.sheet as StructuralSheet;if(axis==='row'){if(action==='insert')sheet.insertRows(index,count);else if(action==='delete')sheet.deleteRows(index,count);else sheet.moveRows(index,count,destination);}else{if(action==='insert')sheet.insertColumns(index,count);else if(action==='delete')sheet.deleteColumns(index,count);else sheet.moveColumns(index,count,destination);}this.onChange();void this.flush();}
 projectRange(range:any){if(!this.stable)return range;const start=this.resolve({row:range.row,column:range.column}),end=this.resolve({row:range.endRow,column:range.endColumn});return [start.row,start.column,end.row,end.column].some(n=>n<0)?null:{...start,endRow:end.row,endColumn:end.column};}
 private url(action:string){return `${this.base}/api/sheets/${this.room}/${action}`;}
 private async post(action:string,body:object){const response=await fetch(this.url(action),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{status:response.status});return data;}
 async connect(){
  if(this.blocked)throw Error(this.blocked);
  try{const data=await this.post('join',{actor:this.actor,meta:this.profile.meta,...(this.profile.schema?{schema:this.profile.schema}:{}),token:this.token||undefined,epoch:this.epoch||undefined});
   if(JSON.stringify(data.meta)!==JSON.stringify(this.profile.meta)||this.epoch&&data.epoch!==this.epoch)throw Error('Epoch or schema changed');
   this.epoch=data.epoch;this.token=data.token;this.presenceGeneration=data.presenceGeneration;this.presenceSeq=Math.max(this.presenceSeq,data.presenceSeq??0);this.editing=undefined;for(const entry of data.log)this.accept(entry);this.connected=true;
   if(typeof EventSource!=='undefined'){const q=new URLSearchParams({actor:this.actor,token:this.token,epoch:this.epoch,since:String(this.serverSeq)});const stream=new EventSource(this.url('stream')+'?'+q);this.stream=stream;stream.onmessage=e=>{if(this.stream!==stream)return;const event=JSON.parse(e.data);if(event.type==='hello'){this.presenceGeneration=event.presenceGeneration;this.presenceSeq=Math.max(this.presenceSeq,event.presenceSeq??0);this.clearPreview();}if(event.type==='change')this.accept(event.entry);if(event.type==='presence'){this.peers=event.peers;this.onChange();}};stream.onerror=()=>{if(this.stream!==stream)return;this.connected=false;this.onChange();};stream.onopen=()=>{if(this.stream!==stream)return;this.connected=true;void this.flush();this.onChange();};}
   await this.flush();this.onChange();
  }catch(e){if((e as {status?:number}).status===409||/Epoch or schema/.test(String(e)))this.blocked=String(e);this.connected=false;this.onChange();throw e;}
 }
 disconnect(){this.editing=undefined;if(this.connected)void this.post('presence-leave',{actor:this.actor,meta:this.profile.meta,token:this.token,epoch:this.epoch,presenceGeneration:this.presenceGeneration}).catch(()=>{});if(this.presenceTimer)clearTimeout(this.presenceTimer);this.presenceTimer=null;this.presenceDirty=false;this.presenceDone?.();this.presenceDone=null;this.presenceIdle=null;this.stream?.close();this.stream=null;this.connected=false;this.onChange();}
 private accept(entry:Entry){if(entry.serverSeq<=this.serverSeq)return;if(this.hold){if(this.inbox.length>=512){this.disconnect();this.blocked='Inbound queue limit; local state preserved';}else if(!this.inbox.some(e=>e.serverSeq===entry.serverSeq))this.inbox.push(entry);return;}if(entry.serverSeq!==this.serverSeq+1){this.blocked='Server sequence gap; local state preserved';this.disconnect();return;}this.sheet.receive(entry.ops as any);this.serverSeq=entry.serverSeq;this.metrics.convergenceMs=this.editedAt?performance.now()-this.editedAt:0;this.onChange();}
 setHold(value:boolean){this.hold=value;if(!value){const entries=this.inbox.splice(0).sort((a,b)=>a.serverSeq-b.serverSeq);for(const entry of entries)this.accept(entry);}this.onChange();}
 edit(row:number,column:number,patch:SparseCellPatch){const t=performance.now();this.sheet.setCell(row,column,patch);this.editedAt=t;this.metrics.clientEditMs=performance.now()-t;this.onChange();void this.flush();}
 undo(){const ops=this.sheet.undo();this.onChange();void this.flush();return ops;}
 redo(){const ops=this.sheet.redo();this.onChange();void this.flush();return ops;}
 async presence(range:{row:number;column:number;endRow:number;endColumn:number}){
  this.presenceRange=this.stable?{...this.target(range.row,range.column),endRow:this.target(range.endRow,range.endColumn).row,endColumn:this.target(range.endRow,range.endColumn).column}:{...range};
  this.queuePresence();await this.presenceIdle;
 }
 preview(target:PresenceTarget,field:string,text:string,{composing=false,selection}:{composing?:boolean;selection?:PresenceTextSelection}={}){
  if(!Object.hasOwn(this.profile.fields,field))return;

  this.editing={target:{row:copyAxis(target.row),column:copyAxis(target.column)},field,...normalizePreview(text,selection),composing};
  if(!this.presenceRange||!this.projectRange(this.presenceRange))this.presenceRange={row:copyAxis(target.row),column:copyAxis(target.column),endRow:copyAxis(target.row),endColumn:copyAxis(target.column)};
  this.queuePresence();
 }
 clearPreview(){this.editing=undefined;this.queuePresence(true);}
 private queuePresence(immediate=false){
  if(!this.connected||!this.presenceRange)return;
  if(!this.presenceIdle)this.presenceIdle=new Promise<void>(done=>{this.presenceDone=done;});
  this.presenceDirty=true;
  if(this.presenceTimer){clearTimeout(this.presenceTimer);this.presenceTimer=null;}
  if(this.presenceBusy)return;
  const delay=immediate?0:Math.max(0,50-(performance.now()-this.lastPresenceAt));
  if(delay)this.presenceTimer=setTimeout(()=>{this.presenceTimer=null;void this.sendPresence();},delay);
  else void this.sendPresence();
 }
 private async sendPresence(){
  if(this.presenceBusy||!this.presenceDirty||!this.connected)return;
  this.presenceBusy=true;this.presenceDirty=false;this.lastPresenceAt=performance.now();
  const body={actor:this.actor,meta:this.profile.meta,token:this.token,epoch:this.epoch,presenceGeneration:this.presenceGeneration,presenceSeq:++this.presenceSeq,name:this.name,color:this.color,range:this.presenceRange,editing:this.editing??null};
  try{await this.post('presence',body);}catch{/* Presence must not block local editing. */}
  finally{this.presenceBusy=false;if(this.presenceDirty&&this.connected)this.queuePresence(!this.editing);else{this.presenceDone?.();this.presenceDone=null;this.presenceIdle=null;}}
 }

 async pull(){const response=await fetch(this.url('state'));const data=await response.json();if(data.epoch!==this.epoch){this.blocked='Epoch changed; local state preserved';this.disconnect();throw Error(this.blocked);}for(const entry of data.log)this.accept(entry);return data;}
 async flush(){if(this.busy||!this.connected||this.blocked)return;this.busy=true;try{while(this.connected&&!this.blocked){if(!this.request){const ops=this.sheet.pendingChanges().slice(0,256);if(!ops.length)break;this.request={actor:this.actor,meta:this.profile.meta,token:this.token,epoch:this.epoch,seq:this.seq+1,ops};}const receipt=await this.post('changes',this.request);if(receipt.epoch!==this.epoch||receipt.seq!==this.request.seq)throw Error('Invalid acceptance receipt');this.sheet.acknowledge(this.request.ops as any);this.seq=this.request.seq;this.request=null;this.onChange();}}catch(e){if((e as {status?:number}).status===409)this.blocked=String(e);this.connected=false;this.stream?.close();this.onChange();}finally{this.busy=false;}}
 summary(){const stats=this.sheet.stats();return {actor:this.actor,connected:this.connected,blocked:this.blocked,serverSeq:this.serverSeq,seq:this.seq,hold:this.hold,inbound:this.inbox.length,pending:stats.pending,stats,peers:this.peers,metrics:this.metrics};}
 snapshot(){return {...this.summary(),cells:this.sheet.getRange({row:0,column:0,rowCount:this.rows,columnCount:this.columns,limit:20000})};}
}
