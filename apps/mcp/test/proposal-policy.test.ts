import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {proposalPolicySchema,enforcePolicy,policyFingerprint} from '../src/proposal-policy.ts';
import {authorizeTool} from '../src/hosted-auth.ts';
import {POLICY_FINGERPRINT,parseProposalRecord,digest} from '../src/proposal-schema.ts';
import {fixture} from './hosted-fixtures.ts';
const policy={generation:'g',epoch:'e',serverSeq:1,schemaVersion:'s',blockId:'block',path:[0] as [number],start:1,end:3,operations:['replace_text'] as ['replace_text']};
test('single-revision policy validates bounded containment including boundary insertion and rejects widening',()=>{
 assert.deepEqual(proposalPolicySchema.parse(policy),policy);
 for(const [start,end] of [[1,1],[1,3],[3,3]])enforcePolicy(policy,policy,{path:[0],blockId:'block',kind:'replace_text',start,end});
 for(const changed of [{serverSeq:2},{epoch:'other'},{generation:'other'},{schemaVersion:'other'}])assert.throws(()=>enforcePolicy(policy,{...policy,...changed}));
 for(const target of [{path:[1],blockId:'block'},{path:[0],blockId:'other'},{path:[0],blockId:'block',start:0,end:1},{path:[0],blockId:'block',start:3,end:4},{path:[0],blockId:'block',kind:'move'}])assert.throws(()=>enforcePolicy(policy,policy,target));
 assert.equal(policyFingerprint(undefined,POLICY_FINGERPRINT),POLICY_FINGERPRINT);assert.notEqual(policyFingerprint(policy,POLICY_FINGERPRINT),POLICY_FINGERPRINT);
 assert.notEqual(policyFingerprint(policy,POLICY_FINGERPRINT),policyFingerprint({...policy,end:4},POLICY_FINGERPRINT));
});
test('policy routes deny every non-read tool despite write/schema grants; unconfigured unchanged',()=>{
 const grant={permissions:['read','write','schema']} as any,route={proposalPolicy:policy} as any;
 for(const tool of ['edit_document','retry_edit','undo','redo','discard_history','set_presence','upgrade_schema','transition_schema']){assert.throws(()=>authorizeTool(grant,tool,route));assert.doesNotThrow(()=>authorizeTool(grant,tool));}
 for(const tool of ['get_schema','get_server_schema','read_document','read_document_slice','recovery_status'])assert.doesNotThrow(()=>authorizeTool(grant,tool,route));
});
test('configured policy is immutable in proposals; change blocks accept/reconcile; restore permits exact owner approval',async()=>{
 const f=await fixture();
 try{
  f.service.config.proposals.enabled=true;f.service.config.proposals.acceptanceEnabled=true;
  f.service.config.grants[0]!.permissions.push('proposal_read','proposal_accept');f.service.config.grants[1]!.permissions.push('proposal_create');
  const post=(suffix:string,value:unknown,token=f.readToken)=>fetch(`${f.endpoint}/proposals${suffix}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(value)});
  const t=await (await post('/target',{path:[0]})).json();
  const p={...t.base,blockId:t.target.blockId,path:[0] as [number],start:0,end:0,operations:['replace_text'] as ['replace_text']};f.service.config.routes[0]!.proposalPolicy=p;
  const request={requestId:randomUUID(),base:t.base,change:{kind:'replace_text',path:[0],blockId:t.target.blockId,start:0,end:0,replacement:'Draft'},explanation:'test',assumptions:[],questions:[],checks:[]};
  const created=await post('',request);assert.equal(created.status,200);const ack=await created.json();
  const decision={requestId:randomUUID(),proposalDigest:ack.proposalDigest};
  const record = await (await fetch(`${f.endpoint}/proposals/${ack.id}`,{headers:{authorization:`Bearer ${f.token}`}})).json();
  const tampered=structuredClone(record);tampered.payload.routePolicy.end=1;tampered.proposalDigest=digest(tampered.payload);const {recordDigest:_old,...rest}=tampered;tampered.recordDigest=digest(rest);
  assert.throws(()=>parseProposalRecord(tampered,tampered.payload.owner));
  delete f.service.config.routes[0]!.proposalPolicy;
  assert.equal((await post(`/${ack.id}/accept`,decision,f.token)).status,409);
  f.service.config.routes[0]!.proposalPolicy={...p,end:1};
  assert.equal((await post(`/${ack.id}/accept`,decision,f.token)).status,409);
  assert.equal((await post(`/${ack.id}/reconcile`,decision,f.token)).status,409);
  assert.equal(f.requests.filter(r=>r.url.includes('/conditional')).length,0);
  f.service.config.routes[0]!.proposalPolicy=p;
  const accepted=await post(`/${ack.id}/accept`,decision,f.token);assert.equal(accepted.status,200);assert.equal((await accepted.json()).status,'applied');
  const beforeConnect=f.requests.length;
  await assert.rejects(f.connect());assert.equal(f.requests.length,beforeConnect,'policy read startup must not restore accepted checkpoint or touch upstream');
  const repeated=await post(`/${ack.id}/reconcile`,decision,f.token);assert.equal(repeated.status,200);assert.equal((await repeated.json()).status,'applied');
 }finally{await f.cleanup();}
});

test('real hosted MCP blocks write/schema tools under policy while read remains available',async()=>{
 const f=await fixture();try{
  f.service.config.proposals.enabled=true;f.service.config.grants[1]!.permissions.push('proposal_create');
  const response=await fetch(`${f.endpoint}/proposals/target`,{method:'POST',headers:{authorization:`Bearer ${f.readToken}`,'content-type':'application/json'},body:JSON.stringify({path:[0]})});const t=await response.json();
  f.service.config.routes[0]!.proposalPolicy={...t.base,blockId:t.target.blockId,path:[0],start:0,end:0,operations:['replace_text']};
  const {client}=await f.connect();
  try{
   const read=await client.callTool({name:'read_document',arguments:{}});assert.equal(read.isError,undefined);
   const base={epoch:t.base.epoch,serverSeq:t.base.serverSeq,schemaVersion:t.base.schemaVersion};
   const before=f.requests.filter(r=>r.url.includes('/conditional')).length;
   for(const [name,args] of [['edit_document',{base,edits:[{op:'insert',at:[0,0],content:'bypass'}]}],['undo',{}],['redo',{}],['discard_history',{}],['retry_edit',{}],['upgrade_schema',{}]] as const){
    let denied=false;try{denied=(await client.callTool({name,arguments:args})).isError===true;}catch{denied=true;}assert.equal(denied,true,name);
   }
   assert.equal(f.requests.filter(r=>r.url.includes('/conditional')).length,before);
  }finally{await client.close();}
 }finally{await f.cleanup();}
});
test('newly configured policy cannot authorize a pre-policy legacy proposal',async()=>{
 const f=await fixture();try{
  f.service.config.proposals.enabled=true;f.service.config.proposals.acceptanceEnabled=true;
  f.service.config.grants[0]!.permissions.push('proposal_accept');f.service.config.grants[1]!.permissions.push('proposal_create');
  const post=(suffix:string,input:unknown,token=f.readToken)=>fetch(`${f.endpoint}/proposals${suffix}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});
  const t=await(await post('/target',{path:[0]})).json();const request={requestId:randomUUID(),base:t.base,change:{kind:'replace_text',path:[0],blockId:t.target.blockId,start:0,end:0,replacement:'legacy'},explanation:'test',assumptions:[],questions:[],checks:[]};
  const ack=await(await post('',request)).json();
  f.service.config.routes[0]!.proposalPolicy={...t.base,blockId:t.target.blockId,path:[0],start:0,end:0,operations:['replace_text']};
  const before=f.requests.length;assert.equal((await post(`/${ack.id}/accept`,{requestId:randomUUID(),proposalDigest:ack.proposalDigest},f.token)).status,409);assert.equal(f.requests.length,before);
 }finally{await f.cleanup();}
});
