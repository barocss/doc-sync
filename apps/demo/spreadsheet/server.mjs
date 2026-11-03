import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSpreadsheetSchema,spreadsheetSchemaVersion,StructuralSheet} from '@barocss/doc-sync';
import {SparseSheet} from '../../../experiments/sparse-sheet/src/sheet.ts';
import {MAX_PREVIEW_TEXT,presenceIdentity,validTextSelection} from './presence.ts';
export const META = Object.freeze({protocol:'sparse-sheet-demo-v1', policy:'field-lww-fixed-axis-v1', sheetId:'sheet', rows:1048576, columns:16384});
const HERE = fileURLToPath(new URL('.', import.meta.url));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const validActor = a => typeof a === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(a) && a !== 'server';
const STABLE_META={...META,protocol:'sparse-sheet-demo-s2-v1',policy:'stable-axis-lww-v1'};
const stable=meta=>meta.protocol===STABLE_META.protocol;
export function createSpreadsheetServer({maxRooms=8,maxOps=20000,outputDir=process.env.SPREADSHEET_OUTPUT_DIR??'output/spreadsheet-demo'}={}) {
 const rooms=new Map(), streams=new Set();
 function getRoom(id,meta,schema) { if (!rooms.has(id)) { if(rooms.size>=maxRooms) throw Error('Room limit'); rooms.set(id,{meta,schema,epoch:randomUUID(),sheet:new (stable(meta)?StructuralSheet:SparseSheet)({actor:'server',sheetId:META.sheetId,rows:META.rows,columns:META.columns,...(schema?{schema}:{})}),log:[],acceptedTickets:new Set(),actors:new Map(),listeners:new Set(),presence:new Map()}); } return rooms.get(id); }
 const server=createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try {
   if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host??''))return send(403,{error:'Loopback host required'});
   if(req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403,{error:'Same origin required'});
   const url=new URL(req.url,'http://127.0.0.1');
   const match=/^\/api\/sheets\/([\w-]{1,80})\/(join|changes|presence|presence-leave|stream|state)$/.exec(url.pathname);
   if(!match){const files={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/main.js':[resolve(HERE,'../../..',outputDir,'main.js'),'text/javascript']}; const file=files[url.pathname];if(!file||req.method!=='GET')return send(404,{error:'Not found'});res.writeHead(200,{'content-type':file[1]});res.end(await readFile(resolve(HERE,file[0])));return;}
   const [,id,action]=match;
   if(action==='state'&&req.method==='GET'){const r=rooms.get(id);if(!r)return send(404,{error:'Unknown room'});return send(200,{meta:r.meta,epoch:r.epoch,serverSeq:r.log.length,log:r.log,cells:r.sheet.getRange({row:0,column:0,rowCount:stable(r.meta)?r.sheet.rows:META.rows,columnCount:stable(r.meta)?r.sheet.columns:META.columns,limit:20000}),stats:r.sheet.stats(),presence:[...r.presence.values()],storage:'memory'});}
   if(action==='stream'&&req.method==='GET'){
    const r=rooms.get(id),actor=url.searchParams.get('actor'),a=r?.actors.get(actor),since=Number(url.searchParams.get('since'));
    if(!r||!a||a.token!==url.searchParams.get('token')||r.epoch!==url.searchParams.get('epoch')||!Number.isSafeInteger(since)||since<0||since>r.log.length)return send(409,{error:'Stream identity, epoch, or sequence mismatch'});
    if(streams.size>=32)return send(429,{error:'Stream limit'});
    const streamId=randomUUID();a.streamId=streamId;a.presenceGeneration=randomUUID();
    const previousPresence=r.presence.get(actor);if(previousPresence?.editing){const {editing,...selection}=previousPresence;r.presence.set(actor,selection);a.presenceSeq++;for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store',connection:'keep-alive'});streams.add(res);const emit=e=>res.write(`data: ${JSON.stringify(e)}\n\n`);r.listeners.add(emit);
    emit({type:'hello',epoch:r.epoch,meta:r.meta,presenceSeq:a.presenceSeq,presenceGeneration:a.presenceGeneration});for(const entry of r.log.slice(since))emit({type:'change',entry});emit({type:'presence',peers:[...r.presence.values()]});const timer=setInterval(()=>res.write(': ping\n\n'),15000);
    req.on('close',()=>{clearInterval(timer);streams.delete(res);r.listeners.delete(emit);if(a.streamId!==streamId)return;a.streamId=null;a.presenceGeneration=randomUUID();a.presenceSeq++;r.presence.delete(actor);for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});});return;
   }
   if(req.method!=='POST')return send(405,{error:'POST required'});
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,{error:'Body limit'});chunks.push(chunk);}let b;try{b=JSON.parse(Buffer.concat(chunks).toString());}catch{return send(400,{error:'Invalid JSON'});}
   if(!b||!validActor(b.actor))return send(409,{error:'Actor or exact schema metadata mismatch'});
   let r=rooms.get(id);
   if(r){if(!same(b.meta,r.meta))return send(409,{error:'Schema metadata mismatch'});if(action==='join'&&!same(b.schema,r.schema))return send(409,{error:'Schema descriptor mismatch'});}
   else {
    if(action!=='join')return send(409,{error:'Join required'});
    let schema;
    if(b.schema!==undefined){try{schema=createSpreadsheetSchema(b.schema);if(!same(b.meta,{...(stable(b.meta)?STABLE_META:{...META,protocol:'sparse-sheet-demo-v2'}),schemaVersion:spreadsheetSchemaVersion(schema)}))throw Error();}catch{return send(409,{error:'Schema descriptor or identity mismatch'});}}
    else if(!same(b.meta,META)&&!same(b.meta,STABLE_META))return send(409,{error:'Actor or exact schema metadata mismatch'});
    if(b.epoch)return send(409,{error:'Epoch reset; local state must be preserved'});
    r=getRoom(id,b.meta,schema);
   }
   if(action==='join'){
    let a=r.actors.get(b.actor);if(a&&a.token!==b.token)return send(409,{error:'Actor already owned'});
    if(b.epoch&&b.epoch!==r.epoch)return send(409,{error:'Epoch reset; local state must be preserved'});
    if(!a){if(r.actors.size>=16)return send(429,{error:'Actor limit'});a={token:randomUUID(),seq:0,presenceSeq:0,receipts:new Map()};r.actors.set(b.actor,a);}
    a.streamId=null;a.presenceGeneration=randomUUID();if(r.presence.delete(b.actor))for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});
    return send(200,{meta:r.meta,epoch:r.epoch,token:a.token,presenceSeq:a.presenceSeq,presenceGeneration:a.presenceGeneration,serverSeq:r.log.length,log:r.log});
   }
   const a=r.actors.get(b.actor);if(!a||b.token!==a.token||b.epoch!==r.epoch)return send(409,{error:'Identity or epoch mismatch'});
   // Generation-aware sessions cannot publish an old request after close/reconnect.
   // Legacy HTTP-only callers can continue to omit the optional generation.
   if((action==='presence'||action==='presence-leave')&&b.presenceGeneration!==undefined&&b.presenceGeneration!==a.presenceGeneration)return send(200,{stale:true});
   if(action==='presence-leave'){a.presenceGeneration=randomUUID();a.presenceSeq++;r.presence.delete(b.actor);for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});return send(200,{});}
   if(action==='presence') {
    const targetValid=p=>p&&typeof p==='object'&&!Array.isArray(p)&&(stable(r.meta)?r.sheet.rowIndexOf(p.row)>=0&&r.sheet.columnIndexOf(p.column)>=0:Number.isSafeInteger(p.row)&&Number.isSafeInteger(p.column)&&p.row>=0&&p.row<META.rows&&p.column>=0&&p.column<META.columns);
    const p=b.range;
    if(!(b.editing===null&&r.presence.has(b.actor)&&same(p,r.presence.get(b.actor).range))&&(!p||Object.keys(p).length!==4||!targetValid(p)||!targetValid({row:p.endRow,column:p.endColumn})))return send(400,{error:'Invalid range'});
    const identity=presenceIdentity(b.actor),name=b.name??identity.name,color=b.color??identity.color,editing=b.editing;
    if(typeof name!=='string'||name.length<1||name.length>80||/[\x00-\x1f\x7f]/.test(name)||typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color))return send(400,{error:'Invalid presence identity'});
    if(b.presenceSeq!==undefined&&(!Number.isSafeInteger(b.presenceSeq)||b.presenceSeq<1))return send(400,{error:'Invalid presence sequence'});
    const fields=r.schema?.fields??{value:1,formula:1,fill:1,bold:1};
    if(editing!==undefined&&editing!==null&&(!editing||typeof editing!=='object'||Array.isArray(editing)||Object.keys(editing).some(k=>!['target','field','text','composing','selection'].includes(k))||!targetValid(editing.target)||Object.keys(editing.target).length!==2||typeof editing.field!=='string'||!Object.hasOwn(fields,editing.field)||typeof editing.text!=='string'||editing.text.length>MAX_PREVIEW_TEXT||typeof editing.composing!=='boolean'||Object.hasOwn(editing,'selection')&&!validTextSelection(editing.text,editing.selection)))return send(400,{error:'Invalid editing preview'});
    if(b.presenceSeq!==undefined&&b.presenceSeq<=a.presenceSeq)return send(200,{stale:true});
    a.presenceSeq=b.presenceSeq??a.presenceSeq+1;
    r.presence.set(b.actor,{actor:b.actor,name,color,range:p,...(editing?{editing}:{})});
    for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});return send(200,{});
   }

   if(action!=='changes')return send(404,{error:'Not found'});
   if(!Number.isSafeInteger(b.seq)||b.seq<1||!Array.isArray(b.ops)||!b.ops.length||b.ops.length>256)return send(400,{error:'Invalid batch'});
   const previous=a.receipts.get(b.seq);if(previous){if(!same(previous.request,b))return send(409,{error:'Sequence reused with different request'});return send(200,previous.receipt);}
   if(b.seq!==a.seq+1)return send(409,{error:'Actor sequence mismatch'});
   if(b.ops.some(op=>op?.at?.actor!==b.actor))return send(409,{error:'Actor cannot submit another actor ticket'});
   if(r.sheet.stats().retainedOps+b.ops.length>maxOps)return send(429,{error:'Room operation limit'});
   // A new request may contain only fresh identities. Check the whole batch first:
   // receive() alone intentionally treats exact repeated operations as no-ops.
   const tickets=new Set();
   for(const op of b.ops){
    if(!Number.isSafeInteger(op.at?.lamport)||op.at.lamport<1)continue;
    const ticket=JSON.stringify([b.actor,op.at.lamport]);
    if(r.acceptedTickets.has(ticket)||tickets.has(ticket))return send(409,{error:'Ticket already accepted or repeated in batch'});
    tickets.add(ticket);
   }
   // SparseSheet.receive validates every operation and identity before applying any.
   // Its atomic preflight avoids replaying the entire retained journal per batch.
   if(stable(r.meta))r.sheet.receive(b.ops,{requireKnownReferences:true});else r.sheet.receive(b.ops);
   for(const ticket of tickets)r.acceptedTickets.add(ticket);
   const entry={serverSeq:r.log.length+1,actor:b.actor,ops:b.ops};const receipt={serverSeq:entry.serverSeq,seq:b.seq,epoch:r.epoch};
   r.log.push(entry);a.seq=b.seq;a.receipts.set(b.seq,{request:b,receipt});for(const f of r.listeners)f({type:'change',entry});return send(200,receipt);
  }catch(error){if(!res.headersSent)send(400,{error:error.message});else res.destroy();}
 });
 return {server,rooms,close:async()=>{for(const s of streams)s.destroy();await new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()));}};
}
