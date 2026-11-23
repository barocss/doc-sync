import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proposalCommand} from '../src/proposals.ts';
const options=(endpoint:string)=>new Map([['--endpoint',endpoint]]);
test('owner proposal CLI rejects plaintext remote endpoints before credential access or fetch',async(t)=>{
 let calls=0,reads=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('{}');});
 const env={get DOC_SYNC_PROPOSAL_TOKEN(){reads++;return 'a'.repeat(43);}};
 for(const host of ['example.invalid','localhost','127.0.0.2','[::ffff:127.0.0.1]'])await assert.rejects(proposalCommand('proposal-list',options(`http://${host}/mcp/t/d/s`),env),/HTTPS outside numeric loopback/);
 assert.equal(calls,0);assert.equal(reads,0);
});
test('owner proposal CLI retains HTTPS and exact numeric loopback with redirects disabled',async(t)=>{
 const seen:string[]=[];t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{seen.push(url);assert.equal(init.redirect,'error');assert.equal((init.headers as Record<string,string>).authorization,'Bearer '+'a'.repeat(43));return new Response('{}');});
 for(const endpoint of ['https://example.invalid/mcp/t/d/s','http://127.0.0.1:4567/mcp/t/d/s','http://[::1]:4567/mcp/t/d/s'])assert.deepEqual(await proposalCommand('proposal-list',options(endpoint),{DOC_SYNC_PROPOSAL_TOKEN:'a'.repeat(43)}),{});
 assert.equal(seen.length,3);
});
