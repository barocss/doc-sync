import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readProposalPlan} from '../src/proposal-plan-input.ts';
import {creatorClient} from '../src/proposal-client.ts';
const invalid=[Uint8Array.of(0xc3,0x28),Uint8Array.of(0x80),Uint8Array.of(0xf0,0x9f),Uint8Array.of(0xc0,0xaf)];
const jsonBytes=(value:Uint8Array)=>Buffer.concat([Buffer.from('{"text":"'),value,Buffer.from('"}')]);
test('prepared plan rejects malformed UTF-8 instead of changing JSON strings',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proposal-utf8-'));await chmod(dir,0o700);const file=join(dir,'plan.json');
 try{
  for(const bytes of invalid){await writeFile(file,jsonBytes(bytes),{mode:0o600});await assert.rejects(readProposalPlan(file),/Invalid structured plan JSON/);}
  const expected={text:'한글 😀 \uFFFD'};await writeFile(file,JSON.stringify(expected));assert.deepEqual(await readProposalPlan(file),expected);
  // Preserve prior behavior: a BOM before the JSON document is not accepted.
  await writeFile(file,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{}')]));await assert.rejects(readProposalPlan(file),/Invalid structured plan JSON/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('creator response rejects malformed UTF-8 but accepts multibyte characters split across writes',async()=>{
 let body=jsonBytes(invalid[0]!);const server=createServer((_req,res)=>{res.setHeader('content-type','application/json');for(const byte of body)res.write(Buffer.from([byte]));res.end();});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
 try{
  const client=creatorClient(`http://127.0.0.1:${address.port}/mcp/t/d/s`,'z'.repeat(43));
  for(const bytes of invalid){body=jsonBytes(bytes);await assert.rejects(client.readTarget([0]),/Invalid creator response/);}
  const expected={text:'한글 😀 \uFFFD'};body=Buffer.from(JSON.stringify(expected));assert.deepEqual(await client.readTarget([0]),expected);
  body=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{}')]);await assert.rejects(client.readTarget([0]),/Invalid creator response/);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
