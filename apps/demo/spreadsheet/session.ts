import {SparseSheet} from '../../../experiments/sparse-sheet/src/sheet.ts';
import type {SparseCellPatch,SparseSheetOp} from '../../../experiments/sparse-sheet/src/sheet.ts';
import {DEFAULT_META,sheetProfile} from './profiles.ts';
import type {SheetProfile} from './profiles.ts';
export const META=DEFAULT_META;
type Entry={serverSeq:number;actor:string;ops:SparseSheetOp[]};
export class SheetSession {
 readonly sheet:SparseSheet; epoch=''; token=''; serverSeq=0; seq=0; connected=false; blocked=''; hold=false; peers:any[]=[];
 private stream:EventSource|null=null; private busy=false; private request:any=null; private inbox:Entry[]=[];
 onChange=()=>{}; metrics={clientEditMs:0,convergenceMs:0};private editedAt=0;
 readonly actor:string;readonly room:string;readonly base:string;readonly profile:SheetProfile;
 constructor(actor:string,room:string,base='',profile:SheetProfile=sheetProfile(null)){this.actor=actor;this.room=room;this.base=base;this.profile=profile;this.sheet=new SparseSheet({actor,sheetId:META.sheetId,rows:META.rows,columns:META.columns,...(profile.schema?{schema:profile.schema}:{})});}
 private url(action:string){return `${this.base}/api/sheets/${this.room}/${action}`;}
 private async post(action:string,body:object){const response=await fetch(this.url(action),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{status:response.status});return data;}
 async connect(){
  if(this.blocked)throw Error(this.blocked);
  try{const data=await this.post('join',{actor:this.actor,meta:this.profile.meta,...(this.profile.schema?{schema:this.profile.schema}:{}),token:this.token||undefined,epoch:this.epoch||undefined});
   if(JSON.stringify(data.meta)!==JSON.stringify(this.profile.meta)||this.epoch&&data.epoch!==this.epoch)throw Error('Epoch or schema changed');
   this.epoch=data.epoch;this.token=data.token;for(const entry of data.log)this.accept(entry);this.connected=true;
   if(typeof EventSource!=='undefined'){const q=new URLSearchParams({actor:this.actor,token:this.token,epoch:this.epoch,since:String(this.serverSeq)});this.stream=new EventSource(this.url('stream')+'?'+q);this.stream.onmessage=e=>{const event=JSON.parse(e.data);if(event.type==='change')this.accept(event.entry);if(event.type==='presence'){this.peers=event.peers;this.onChange();}};this.stream.onerror=()=>{this.connected=false;this.onChange();};this.stream.onopen=()=>{this.connected=true;void this.flush();this.onChange();};}
   await this.flush();this.onChange();
  }catch(e){if((e as {status?:number}).status===409||/Epoch or schema/.test(String(e)))this.blocked=String(e);this.connected=false;this.onChange();throw e;}
 }
 disconnect(){this.stream?.close();this.stream=null;this.connected=false;this.onChange();}
 private accept(entry:Entry){if(entry.serverSeq<=this.serverSeq)return;if(this.hold){if(this.inbox.length>=512){this.disconnect();this.blocked='Inbound queue limit; local state preserved';}else if(!this.inbox.some(e=>e.serverSeq===entry.serverSeq))this.inbox.push(entry);return;}if(entry.serverSeq!==this.serverSeq+1){this.blocked='Server sequence gap; local state preserved';this.disconnect();return;}this.sheet.receive(entry.ops);this.serverSeq=entry.serverSeq;this.metrics.convergenceMs=this.editedAt?performance.now()-this.editedAt:0;this.onChange();}
 setHold(value:boolean){this.hold=value;if(!value){const entries=this.inbox.splice(0).sort((a,b)=>a.serverSeq-b.serverSeq);for(const entry of entries)this.accept(entry);}this.onChange();}
 edit(row:number,column:number,patch:SparseCellPatch){const t=performance.now();this.sheet.setCell(row,column,patch);this.editedAt=t;this.metrics.clientEditMs=performance.now()-t;this.onChange();void this.flush();}
 undo(){const ops=this.sheet.undo();this.onChange();void this.flush();return ops;}
 redo(){const ops=this.sheet.redo();this.onChange();void this.flush();return ops;}
 async presence(range:{row:number;column:number;endRow:number;endColumn:number}){if(this.connected)await this.post('presence',{actor:this.actor,meta:this.profile.meta,token:this.token,epoch:this.epoch,range});}
 async pull(){const response=await fetch(this.url('state'));const data=await response.json();if(data.epoch!==this.epoch){this.blocked='Epoch changed; local state preserved';this.disconnect();throw Error(this.blocked);}for(const entry of data.log)this.accept(entry);return data;}
 async flush(){if(this.busy||!this.connected||this.blocked)return;this.busy=true;try{while(this.connected&&!this.blocked){if(!this.request){const ops=this.sheet.pendingChanges().slice(0,256);if(!ops.length)break;this.request={actor:this.actor,meta:this.profile.meta,token:this.token,epoch:this.epoch,seq:this.seq+1,ops};}const receipt=await this.post('changes',this.request);if(receipt.epoch!==this.epoch||receipt.seq!==this.request.seq)throw Error('Invalid acceptance receipt');this.sheet.acknowledge(this.request.ops);this.seq=this.request.seq;this.request=null;this.onChange();}}catch(e){if((e as {status?:number}).status===409)this.blocked=String(e);this.connected=false;this.stream?.close();this.onChange();}finally{this.busy=false;}}
 summary(){const stats=this.sheet.stats();return {actor:this.actor,connected:this.connected,blocked:this.blocked,serverSeq:this.serverSeq,seq:this.seq,hold:this.hold,inbound:this.inbox.length,pending:stats.pending,stats,peers:this.peers,metrics:this.metrics};}
 snapshot(){return {...this.summary(),cells:this.sheet.getRange({row:0,column:0,rowCount:META.rows,columnCount:META.columns,limit:20000})};}
}
