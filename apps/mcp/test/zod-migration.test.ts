import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {parseHostedConfig} from '../src/hosted-config.ts';
import {createServer} from '../src/server.ts';
import {rejectProposalSchema} from '../src/proposal-schema.ts';
import type {DocumentSession} from '../src/session.ts';
const config = () => ({dataDir:'/tmp/zod-test',hosts:['127.0.0.1:1'],routes:[{tenant:'t',document:'d',slot:'s',actor:'a',upstreamDocument:'doc',upstream:'http://127.0.0.1:2'}],grants:[{id:'g',principal:'p',token:randomBytes(32).toString('base64url'),routes:['/mcp/t/d/s'],permissions:['read']}]});
test('v4 config preserves disabled proposals and every nested bound for omitted, empty and partial input', () => {
 const defaults = {bodyBytes:1048576,sessions:64,perPrincipal:4,calls:8,bodyReaders:64,perPrincipalBodyReaders:4,idleMs:900000,requestMs:30000};
 for(const extra of [{},{limits:{},proposals:{}},{limits:{calls:2},proposals:{enabled:false}}]){
  const parsed=parseHostedConfig({...config(),...extra});assert.deepEqual(parsed.proposals,{enabled:false,acceptanceEnabled:false});assert.deepEqual(parsed.limits,{...defaults,...extra.limits});assert.deepEqual(parsed.routes[0]!.headers,{});
 }
 assert.throws(()=>parseHostedConfig({...config(),limits:{bodyBytes:8388609}}));
 assert.throws(()=>parseHostedConfig({...config(),limits:{unexpected:1}}));
});
test('stored decision IDs retain the historical version-agnostic hexadecimal contract', () => {
 for(const requestId of ['00000000-0000-0000-0000-000000000001','12345678-1234-1234-1234-123456789abc'])assert.equal(rejectProposalSchema.parse({requestId,proposalDigest:'a'.repeat(64)}).requestId,requestId);
 assert.equal(rejectProposalSchema.safeParse({requestId:'invalid',proposalDigest:'a'.repeat(64)}).success,false);
});
test('real SDK tools/list preserves required fields, strict objects, nullable positions and discriminated edits', async () => {
 let accesses=0;const session=new Proxy({}, {get(){accesses++;throw Error('session accessed');}}) as DocumentSession;
 const server=createServer(session);const client=new Client({name:'zod-compat',version:'1'});const [l,r]=InMemoryTransport.createLinkedPair();await server.connect(r);await client.connect(l);
 try{
  const tools=(await client.listTools()).tools;assert.equal(tools.length,13);
  const schemas=Object.fromEntries(tools.map(t=>[t.name,t.inputSchema])) as Record<string,any>;
  for(const schema of Object.values(schemas))assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schemas.transition_schema.required,['base','schema']);assert.deepEqual(schemas.transition_schema.properties.schema.additionalProperties,{});
  assert.equal(schemas.read_document_slice.properties.path.maxItems,32);
  assert.equal(schemas.edit_document.properties.edits.maxItems,100);
  const branches=schemas.edit_document.properties.edits.items.oneOf;assert.deepEqual(branches.map((b:any)=>b.properties.op.const),['insert','delete','update','split','merge','move']);
  for(const branch of branches)assert.equal(branch.additionalProperties,false);
  assert(schemas.set_presence.properties.anchor.anyOf.some((b:any)=>b.type==='null'));
  for(const args of [{base:{epoch:'e',serverSeq:Number.MAX_SAFE_INTEGER+1,schemaVersion:null},edits:[{op:'split',at:[0]}]},{base:{epoch:'e',serverSeq:0,schemaVersion:null},edits:[{op:'split',at:[0],unexpected:true}]}])assert.equal((await client.callTool({name:'edit_document',arguments:args})).isError,true);
  assert.equal(accesses,0);
 }finally{await client.close();await server.close();}
});
test('bounded invalid collection rejects within isolated memory and wall-time limits', () => {
 const moduleUrl=new URL('../src/proposal-schema.ts',import.meta.url).href;
 const child=spawnSync(process.execPath,['--max-old-space-size=96','--input-type=module','-e',`import {createProposalSchema} from ${JSON.stringify(moduleUrl)};const r=createProposalSchema.safeParse({assumptions:Array(1024).fill(0)});if(r.success)process.exit(2);`],{timeout:5000,maxBuffer:16384});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,0);
});
