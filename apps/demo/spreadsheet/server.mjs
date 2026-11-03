import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSpreadsheetSchema,spreadsheetSchemaVersion} from '@barocss/doc-sync';
import {SparseSheet} from '../../../experiments/sparse-sheet/src/sheet.ts';
export const META = Object.freeze({protocol:'sparse-sheet-demo-v1', policy:'field-lww-fixed-axis-v1', sheetId:'sheet', rows:1048576, columns:16384});
const HERE = fileURLToPath(new URL('.', import.meta.url));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const validActor = a => typeof a === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(a) && a !== 'server';
export function createSpreadsheetServer({maxRooms=8,maxOps=20000}={}) {
 const rooms=new Map(), streams=new Set();
 function getRoom(id,meta,schema) { if (!rooms.has(id)) { if(rooms.size>=maxRooms) throw Error('Room limit'); rooms.set(id,{meta,schema,epoch:randomUUID(),sheet:new SparseSheet({actor:'server',sheetId:META.sheetId,rows:META.rows,columns:META.columns,...(schema?{schema}:{})}),log:[],acceptedTickets:new Set(),actors:new Map(),listeners:new Set(),presence:new Map()}); } return rooms.get(id); }
 const server=createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try {
   if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host??''))return send(403,{error:'Loopback host required'});
   if(req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403,{error:'Same origin required'});
   const url=new URL(req.url,'http://127.0.0.1');
   const match=/^\/api\/sheets\/([\w-]{1,80})\/(join|changes|presence|stream|state)$/.exec(url.pathname);
   if(!match){const files={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/main.js':['../../../output/spreadsheet-demo/main.js','text/javascript']}; const file=files[url.pathname];if(!file||req.method!=='GET')return send(404,{error:'Not found'});res.writeHead(200,{'content-type':file[1]});res.end(await readFile(resolve(HERE,file[0])));return;}
   const [,id,action]=match;
   if(action==='state'&&req.method==='GET'){const r=rooms.get(id);if(!r)return send(404,{error:'Unknown room'});return send(200,{meta:r.meta,epoch:r.epoch,serverSeq:r.log.length,log:r.log,cells:r.sheet.getRange({row:0,column:0,rowCount:META.rows,columnCount:META.columns,limit:20000}),stats:r.sheet.stats(),presence:[...r.presence.values()],storage:'memory'});}
   if(action==='stream'&&req.method==='GET'){
    const r=rooms.get(id),actor=url.searchParams.get('actor'),a=r?.actors.get(actor),since=Number(url.searchParams.get('since'));
    if(!r||!a||a.token!==url.searchParams.get('token')||r.epoch!==url.searchParams.get('epoch')||!Number.isSafeInteger(since)||since<0||since>r.log.length)return send(409,{error:'Stream identity, epoch, or sequence mismatch'});
    if(streams.size>=32)return send(429,{error:'Stream limit'});
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store',connection:'keep-alive'});streams.add(res);const emit=e=>res.write(`data: ${JSON.stringify(e)}\n\n`);r.listeners.add(emit);
    emit({type:'hello',epoch:r.epoch,meta:r.meta});for(const entry of r.log.slice(since))emit({type:'change',entry});emit({type:'presence',peers:[...r.presence.values()]});const timer=setInterval(()=>res.write(': ping\n\n'),15000);
    req.on('close',()=>{clearInterval(timer);streams.delete(res);r.listeners.delete(emit);r.presence.delete(actor);for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});});return;
   }
   if(req.method!=='POST')return send(405,{error:'POST required'});
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,{error:'Body limit'});chunks.push(chunk);}let b;try{b=JSON.parse(Buffer.concat(chunks).toString());}catch{return send(400,{error:'Invalid JSON'});}
   if(!b||!validActor(b.actor))return send(409,{error:'Actor or exact schema metadata mismatch'});
   let r=rooms.get(id);
   if(r){if(!same(b.meta,r.meta))return send(409,{error:'Schema metadata mismatch'});if(action==='join'&&!same(b.schema,r.schema))return send(409,{error:'Schema descriptor mismatch'});}
   else {
    if(action!=='join')return send(409,{error:'Join required'});
    let schema;
    if(b.schema!==undefined){try{schema=createSpreadsheetSchema(b.schema);if(!same(b.meta,{...META,protocol:'sparse-sheet-demo-v2',schemaVersion:spreadsheetSchemaVersion(schema)}))throw Error();}catch{return send(409,{error:'Schema descriptor or identity mismatch'});}}
    else if(!same(b.meta,META))return send(409,{error:'Actor or exact schema metadata mismatch'});
    if(b.epoch)return send(409,{error:'Epoch reset; local state must be preserved'});
    r=getRoom(id,b.meta,schema);
   }
   if(action==='join'){
    let a=r.actors.get(b.actor);if(a&&a.token!==b.token)return send(409,{error:'Actor already owned'});
    if(b.epoch&&b.epoch!==r.epoch)return send(409,{error:'Epoch reset; local state must be preserved'});
    if(!a){if(r.actors.size>=16)return send(429,{error:'Actor limit'});a={token:randomUUID(),seq:0,receipts:new Map()};r.actors.set(b.actor,a);}
    return send(200,{meta:r.meta,epoch:r.epoch,token:a.token,serverSeq:r.log.length,log:r.log});
   }
   const a=r.actors.get(b.actor);if(!a||b.token!==a.token||b.epoch!==r.epoch)return send(409,{error:'Identity or epoch mismatch'});
   if(action==='presence') {const p=b.range;if(!p||!['row','column','endRow','endColumn'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)||p.row>=META.rows||p.endRow>=META.rows||p.column>=META.columns||p.endColumn>=META.columns)return send(400,{error:'Invalid range'});r.presence.set(b.actor,{actor:b.actor,range:p});for(const f of r.listeners)f({type:'presence',peers:[...r.presence.values()]});return send(200,{});}
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
   r.sheet.receive(b.ops);
   for(const ticket of tickets)r.acceptedTickets.add(ticket);
   const entry={serverSeq:r.log.length+1,actor:b.actor,ops:b.ops};const receipt={serverSeq:entry.serverSeq,seq:b.seq,epoch:r.epoch};
   r.log.push(entry);a.seq=b.seq;a.receipts.set(b.seq,{request:b,receipt});for(const f of r.listeners)f({type:'change',entry});return send(200,receipt);
  }catch(error){if(!res.headersSent)send(400,{error:error.message});else res.destroy();}
 });
 return {server,rooms,close:async()=>{for(const s of streams)s.destroy();await new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()));}};
}
