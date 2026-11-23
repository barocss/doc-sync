import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {proposalCommand} from '../src/proposals.ts';
const token='z'.repeat(43),env={DOC_SYNC_PROPOSAL_TOKEN:token};
const options=()=>new Map([['--endpoint','https://example.invalid/mcp/t/d/s']]);
const fixed=(message:string)=>(e:unknown)=>e instanceof Error&&e.message===message;
test('proposal CLI never returns raw or JSON-escaped bearer reflections',async(t)=>{
 let body=JSON.stringify({text:token});t.mock.method(globalThis,'fetch',async()=>new Response(body));
 for(const raw of [body,'{"text":"'+[...token].map(()=>String.raw`\u007a`).join('')+'"}']){body=raw;await assert.rejects(proposalCommand('proposal-list',options(),env),fixed('Invalid proposal response'));}
});
test('proposal CLI response decoder rejects malformed bytes and suppresses JSON source diagnostics',async(t)=>{
 let body:Uint8Array=Buffer.from('PRIVATE_DIAGNOSTIC');t.mock.method(globalThis,'fetch',async()=>new Response(body));
 await assert.rejects(proposalCommand('proposal-list',options(),env),fixed('Invalid proposal response'));
 body=Buffer.concat([Buffer.from('{"text":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')]);await assert.rejects(proposalCommand('proposal-list',options(),env),fixed('Invalid proposal response'));
 const expected={text:'한글 😀 \uFFFD'};body=Buffer.from(JSON.stringify(expected));assert.deepEqual(await proposalCommand('proposal-list',options(),env),expected);
});
test('proposal CLI private input fails before fetch on malformed UTF-8 or JSON without exposing content',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'proposal-cli-input-')),file=join(dir,'input.json');const opts=options();opts.set('--input',file);let calls=0;
 t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{calls++;assert.deepEqual(JSON.parse(init.body as string),{text:'한글 😀 \uFFFD'});return new Response('{}');});
 try{
  for(const body of [Buffer.from('PRIVATE_DIAGNOSTIC'),Buffer.concat([Buffer.from('{"text":"'),Buffer.from([0xc3,0x28]),Buffer.from('"}')])]){await writeFile(file,body,{mode:0o600});await assert.rejects(proposalCommand('proposal-create',opts,env),fixed('Invalid proposal input JSON'));}
  assert.equal(calls,0);await writeFile(file,JSON.stringify({text:'한글 😀 \uFFFD'}));assert.deepEqual(await proposalCommand('proposal-create',opts,env),{});assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
