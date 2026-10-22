import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Doc} from '@barocss/doc-sync';
import {schema} from '../model.mjs';
import {remoteEdit} from '../remote-edit.mjs';

const withBackend=async(handler,check)=>{
  const server=createServer(handler);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{return await check(`http://127.0.0.1:${server.address().port}`);}
  finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
};
const hello=doc=>JSON.stringify({type:'hello',serverSeq:7,snapshot:doc.snapshot(),delSeqs:[],presence:[]});

test('remote edit reads SSE comments and unrelated frames, then submits a separate actor',async()=>{
  const doc=new Doc('seed',schema);
  doc.edit([{op:'insert',at:[0,0],content:'base'}]);
  let submitted;
  await withBackend(async(req,res)=>{
    if(req.url.endsWith('/stream?since=0')){
      res.writeHead(200,{'content-type':'text/event-stream'});
      res.write(': keepalive\r\n\r\ndata: {"type":"presence"}\r\n\r\n');
      const frame=`data: ${hello(doc)}\r\n\r\n`;
      res.write(frame.slice(0,15));
      res.end(frame.slice(15));
    }else{
      let body='';for await(const chunk of req)body+=chunk;
      submitted=JSON.parse(body);
      submitted.ops.forEach(op=>doc.apply(op));
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({serverSeq:8}));
    }
  },async backend=>{
    const result=await remoteEdit(backend,{doc:'probe-test',edits:[{op:'insert',at:[0,0],content:'X'}]});
    assert.match(result.actor,/^remote-/);
    assert.equal(submitted.actor,result.actor);
    assert.equal(submitted.seq,1);
    assert.equal(result.serverSeq,8);
    assert.equal(result.model.children[0].runs[0].text,'Xbase');
    assert.deepEqual(doc.toJSON(),result.model);
  });
});

test('remote edit with no operations does not submit a change',async()=>{
  const doc=new Doc('seed',schema);
  let requests=0;
  await withBackend((req,res)=>{
    requests++;
    res.writeHead(200,{'content-type':'text/event-stream'});
    res.end(`data: ${hello(doc)}\n\n`);
  },async backend=>{
    const result=await remoteEdit(backend,{doc:'probe-test',edits:[]});
    assert.equal(result.serverSeq,7);
    assert.equal(requests,1);
    assert.deepEqual(result.model,doc.toJSON());
  });
});

test('remote edit rejects invalid document names and edit containers before fetching',async()=>{
  for(const doc of [undefined,null,12,'../other','A','a'.repeat(41)]){
    await assert.rejects(remoteEdit('http://invalid.test',{doc,edits:[]}),/invalid test document/);
  }
  await assert.rejects(remoteEdit('http://invalid.test',{doc:'valid',edits:{}}),/invalid test edits/);
});

test('remote edit rejects HTTP errors, missing hello and malformed SSE data',async()=>{
  for(const [status,body,error] of [
    [503,'unavailable',/remote snapshot HTTP 503/],
    [200,': keepalive\n\n',/missing hello/],
    [200,'data: invalid\n\n',/Unexpected token/],
  ]){
    await withBackend((req,res)=>{res.writeHead(status);res.end(body);},backend=>
      assert.rejects(remoteEdit(backend,{doc:'probe-test',edits:[]}),error));
  }
});

test('remote edit reports rejected change submission',async()=>{
  const doc=new Doc('seed',schema);
  await withBackend((req,res)=>{
    if(req.url.endsWith('/stream?since=0'))res.end(`data: ${hello(doc)}\n\n`);
    else{res.writeHead(409);res.end('rejected');}
  },backend=>assert.rejects(remoteEdit(backend,{doc:'probe-test',edits:[{op:'insert',at:[0,0],content:'X'}]}),/remote edit HTTP 409: rejected/));
});
