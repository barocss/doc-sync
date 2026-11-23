import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,until} from './hosted-fixtures.ts';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {DocumentSession} from '../src/session.ts';
import type {EditOp} from '@barocss/doc-sync';
async function files(dir:string):Promise<Record<string,string>>{const out:Record<string,string>={};for(const name of await readdir(dir)){if(name.endsWith('.lock'))continue;try{out[name]=(await readFile(join(dir,name))).toString('base64');}catch{}}return out;}
for(const kind of ['insert-before','split','replace','move','schema'] as const)test(`pinned policy rejects peer ${kind} before recapture/create/accept`,async()=>{
 const f=await fixture();f.service.config.proposals.enabled=true;f.service.config.proposals.acceptanceEnabled=true;
 f.service.config.grants[0]!.permissions.push('proposal_read','proposal_decide','proposal_accept');f.service.config.grants[1]!.permissions.push('proposal_create');
 const route=f.service.config.routes[0]!;
 const req=(suffix:string,input?:unknown,token=f.readToken)=>fetch(`${f.endpoint}/proposals${suffix}`,{method:input?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});
 const transport=new NodeHttpTransport('doc','peer',route.upstream),schema=await transport.getSchema(),peer=new DocumentSession('peer',transport,schema.schema!);
 try{
  await peer.start();await until(()=>peer.client.synchronized);
  await peer.edit((await peer.read()).revision!,[{op:'insert',at:[0,0],content:'hello'},{op:'insert',at:[1],content:[{type:'paragraph',runs:[{text:'other',marks:{}}]}]}]);
  const captured=await (await req('/target',{path:[0]})).json();
  (route as any).proposalPolicy={...captured.base,blockId:captured.target.blockId,path:[0],start:0,end:5,operations:['replace_text']};
  const input={requestId:randomUUID(),base:captured.base,change:{kind:'replace_text',path:[0],blockId:captured.target.blockId,start:0,end:5,replacement:'Draft'},explanation:'Synthetic',assumptions:[],questions:[],checks:[]};
  const creation=await req('',input);assert.equal(creation.status,200,await creation.clone().text());const summary=await creation.json();
  const edits:EditOp[]=kind==='insert-before'?[{op:'insert',at:[0,0],content:'Foreign'}]:kind==='split'?[{op:'split',at:[0,2]}]:kind==='replace'?[{op:'delete',at:[0],count:1},{op:'insert',at:[0],content:[{type:'paragraph',runs:[{text:'replacement',marks:{}}]}]}]:[{op:'move',from:[0],at:[1]}];
  if(kind==='schema'){const current=await peer.read();const next={...schema.schema!,marks:[...schema.schema!.marks,'highlight']};await peer.transitionSchema({...current.revision!,schemaVersion:captured.base.schemaVersion},next);}
  else await peer.edit((await peer.read()).revision!,edits);
  const before=await files(f.service.config.dataDir),conditional=f.requests.filter(r=>r.url.includes('/conditional')).length;
  assert.ok([403,409].includes((await req('/target',{path:[0]})).status));
  assert.ok([403,409].includes((await req('',{...input,requestId:randomUUID()})).status));
  const accepted=await req(`/${summary.id}/accept`,{requestId:randomUUID(),proposalDigest:summary.proposalDigest},f.token);
  assert.ok(accepted.status===409 || accepted.status===200,await accepted.clone().text());
  if(accepted.status===200)assert.equal((await accepted.json()).status,'stale');
  assert.equal(f.requests.filter(r=>r.url.includes('/conditional')).length,conditional);
  assert.deepEqual(await files(f.service.config.dataDir),before,'actor journal/checkpoint must not change');
 }finally{await peer.close();await f.cleanup();}
});
