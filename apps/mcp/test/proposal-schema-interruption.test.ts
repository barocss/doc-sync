import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture,until} from './hosted-fixtures.ts';
import {DocumentSession} from '../src/session.ts';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
async function actorFiles(dir:string){const out:Record<string,string>={};for(const file of await readdir(dir)){if(!file.endsWith('.json')&&!file.endsWith('.json.checkpoint'))continue;out[file]=(await readFile(join(dir,file))).toString('base64');}return out;}
test('confirmed proposal receipt survives later schema without replay or implicit checkpoint migration',async()=>{
 const f=await fixture();f.service.config.proposals.enabled=true;f.service.config.proposals.acceptanceEnabled=true;
 f.service.config.grants[0]!.permissions.push('proposal_read','proposal_accept');f.service.config.grants[1]!.permissions.push('proposal_create');
 const request=(suffix:string,input?:unknown,token=f.readToken)=>fetch(`${f.endpoint}/proposals${suffix}`,{method:input?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});
 let peer:DocumentSession|undefined;
 try{
  const target=await(await request('/target',{path:[0]})).json(),route=f.service.config.routes[0]!;
  route.proposalPolicy={...target.base,blockId:target.target.blockId,path:[0],start:0,end:0,operations:['replace_text']};
  const input={requestId:randomUUID(),base:target.base,change:{kind:'replace_text',path:[0],blockId:target.target.blockId,start:0,end:0,replacement:'AI '},explanation:'Synthetic',assumptions:[],questions:[],checks:[]};
  const created=await request('',input);assert.equal(created.status,200);const ack=await created.json(),decision={requestId:randomUUID(),proposalDigest:ack.proposalDigest};
  const applied=await(await request(`/${ack.id}/accept`,decision,f.token)).json();assert.equal(applied.status,'applied');
  const files=await actorFiles(f.service.config.dataDir);assert.ok(Object.keys(files).length>0);
  const transport=new NodeHttpTransport('doc','peer',route.upstream),schema=await transport.getSchema();peer=new DocumentSession('peer',transport,schema.schema!);await peer.start();await until(()=>peer!.client.synchronized);
  await peer.edit((await peer.read()).revision!,[{op:'insert',at:[0,0],content:'Human '}]);
  const before=await peer.read(),next={...schema.schema!,marks:[...schema.schema!.marks,'highlight']};
  await peer.transitionSchema({...before.revision!,schemaVersion:schema.schemaVersion!},next);
  const changed=await peer.read();assert.notEqual(changed.revision!.schemaVersion,target.base.schemaVersion);
  const sent=f.requests.filter(r=>r.url.includes('/conditional')).length;
  const repeat=await(await request(`/${ack.id}/reconcile`,decision,f.token)).json();assert.equal(repeat.status,'applied');assert.deepEqual(repeat.attempt,applied.attempt);
  assert.equal(f.requests.filter(r=>r.url.includes('/conditional')).length,sent);assert.deepEqual(await actorFiles(f.service.config.dataDir),files);
  await assert.rejects(f.connect());assert.deepEqual(await actorFiles(f.service.config.dataDir),files);
  assert.deepEqual((await peer.read()).document,changed.document);assert.equal(peer.client.pending.length,0);
  // Explicit human actor undo remains theirs; this is not an AI schema migration.
  await peer.history('undo');const undone=await peer.read();assert.match(JSON.stringify(undone.document),/AI /);assert.doesNotMatch(JSON.stringify(undone.document),/Human /);
  assert.equal(peer.client.pending.length,0);assert.equal(peer.client.history.canRedo,true);assert.deepEqual(await actorFiles(f.service.config.dataDir),files);
 }finally{await peer?.close();await f.cleanup();}
});
