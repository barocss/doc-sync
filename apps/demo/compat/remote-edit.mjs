import {randomUUID} from 'node:crypto';
import {Doc} from '@barocss/doc-sync';
import {PROTOCOL_VERSION} from '@barocss/doc-sync/sync';
import {schema} from './model.mjs';

/** A separate CRDT actor, through the real HTTP protocol, without moving browser focus. */
export async function remoteEdit(backend,{doc,edits}){
  if(typeof doc!=='string'||!/^[a-z0-9-]{1,40}$/.test(doc))throw new Error('invalid test document');
  if(!Array.isArray(edits))throw new Error('invalid test edits');
  const signal=AbortSignal.timeout(10000);
  const actor=`remote-${randomUUID().slice(0,8)}`;
  const response=await fetch(`${backend}/api/docs/${doc}/stream?since=0&protocol=${PROTOCOL_VERSION}`,{signal});
  if(!response.ok)throw new Error(`remote snapshot HTTP ${response.status}`);
  const reader=response.body.getReader();
  const decoder=new TextDecoder();let buffer='',hello;
  try{
    while(!hello){
      const chunk=await reader.read();if(chunk.done)throw new Error('missing hello');
      buffer=(buffer+decoder.decode(chunk.value,{stream:true})).replace(/\r\n/g,'\n');
      let end;
      while((end=buffer.indexOf('\n\n'))>=0){
        const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
        const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!data)continue;
        const event=JSON.parse(data);
        if(event.type==='hello'&&event.snapshot){hello=event;break;}
      }
    }
  }finally{await reader.cancel();}
  const replica=Doc.fromSnapshot(actor,hello.snapshot,schema);
  const ops=replica.edit(edits).ops;
  if(!ops.length)return {actor,serverSeq:hello.serverSeq,model:replica.toJSON()};
  const sent=await fetch(`${backend}/api/docs/${doc}/changes`,{method:'POST',headers:{'content-type':'application/json','x-doc-sync-protocol':String(PROTOCOL_VERSION),'x-doc-sync-epoch':hello.epoch},body:JSON.stringify({actor,seq:1,ops}),signal});
  if(!sent.ok)throw new Error(`remote edit HTTP ${sent.status}: ${await sent.text()}`);
  return {actor,...await sent.json(),model:replica.toJSON()};
}
