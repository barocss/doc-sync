import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fixture,until} from '../../mcp/test/hosted-fixtures.ts';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {DocumentSession} from '../../mcp/src/session.ts';
import {creatorClient} from '../src/proposal-client.ts';
import {runProposalMission} from '../src/proposal-planner.ts';
import {readPlanningContext,assertPlanningTarget} from '../src/planning-context.ts';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';
import {schemaVersion} from '@barocss/doc-sync';
const plan={start:0,end:0,replacement:'Draft',explanation:'Synthetic schema qualification',assumptions:[],questions:[],checks:[]};
for(const timing of ['before-capture','during-planner','after-created'] as const)test(`creator schema interruption ${timing} retains exact original authority`,async()=>{
 const f=await fixture();f.service.config.proposals.enabled=true;f.service.config.grants[0]!.permissions.push('proposal_read');f.service.config.grants[1]!.permissions.push('proposal_create');
 const transport=new NodeHttpTransport('doc','schema-owner',f.service.config.routes[0]!.upstream),schema=await transport.getSchema(),peer=new DocumentSession('schema-owner',transport,schema.schema!);
 const creator=creatorClient(f.endpoint.href,f.readToken),options={missionPath:join(f.dir,'schema-mission.json'),brief:'Draft plain text only',path:[0] as [number]};
 const next={...schema.schema!,marks:[...schema.schema!.marks,'highlight']};let plans=0;
 const change=async()=>{const before=await peer.read();await peer.transitionSchema({...before.revision!,schemaVersion:schemaVersion(schema.schema!)},next);};
 try{
  await peer.start();await until(()=>peer.client.synchronized);
  if(timing==='before-capture')await change();
  const result=await runProposalMission(options,async input=>{plans++;assert.equal(input.target.base.schemaVersion,schemaVersion(timing==='before-capture'?next:schema.schema!));if(timing==='during-planner')await change();return plan;},creator);
  assert.equal(result.status,timing==='during-planner'?'unknown':'created');
  const original=await readFile(options.missionPath,'utf8');const saved=JSON.parse(original);
  assert.equal(saved.target.base.schemaVersion,schemaVersion(timing==='before-capture'?next:schema.schema!));
  if(timing==='after-created')await change();
  const before=await peer.read(),sent=f.requests.filter(r=>r.url.includes('/conditional')).length;
  const again=await runProposalMission(options,async()=>{throw Error('Must not replan or migrate saved mission');},creator);
  assert.deepEqual(again,result);assert.equal(plans,1);assert.equal(await readFile(options.missionPath,'utf8'),original);
  // Restart the creator process against the same hosted service and durable intent.
  // Fixture credentials belong only to transport; no model process is launched.
  if(timing==='during-planner'){
   const code=`import {runProposalMission} from ${JSON.stringify(new URL('../src/proposal-planner.ts',import.meta.url).href)};import {creatorClient} from ${JSON.stringify(new URL('../src/proposal-client.ts',import.meta.url).href)};const o=JSON.parse(process.env.TEST_OPTIONS);const r=await runProposalMission(o,async()=>{throw Error('Unexpected replan')},creatorClient(process.env.TEST_ENDPOINT,process.env.TEST_TOKEN));process.stdout.write(JSON.stringify(r));`;
   const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TEST_OPTIONS:JSON.stringify(options),TEST_ENDPOINT:f.endpoint.href,TEST_TOKEN:f.readToken},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.resume();const [exit]=await once(child,'exit');assert.equal(exit,0);assert.deepEqual(JSON.parse(out),result);assert.equal(await readFile(options.missionPath,'utf8'),original);
  }

  assert.equal(f.requests.filter(r=>r.url.includes('/conditional')).length,sent);
  const after=await peer.read();assert.deepEqual(after.document,before.document);assert.equal(after.pending,0);assert.equal(after.conditionalPending,false);
  assert.deepEqual(saved.request.base,saved.target.base);
 }finally{await peer.close();await f.cleanup();}
});
test('bounded saved planning binding rejects schema, epoch and replacement before planner; no inferred compatibility',async()=>{
 const previous={path:[1],blockId:'1@stored',epoch:'old',schemaVersion:'original'};
 for(const change of [{schemaVersion:'compatible-additive'},{schemaVersion:'incompatible-mark-attr'},{epoch:'replacement-epoch'},{blockId:'2@replacement'}]){
  const binding={...previous,...change},revision={epoch:binding.epoch,serverSeq:7,schemaVersion:binding.schemaVersion};let calls=0;
  await assert.rejects(readPlanningContext(async()=>{calls++;return {revision,sessionOnline:true,pending:0,conditionalPending:false,recoveryRequired:false,children:[{path:[1],blockId:binding.blockId,node:{type:'paragraph',runs:[]}}]};},[1],revision,previous),/identity, placement or schema changed/);
  assert.equal(calls,1);assert.deepEqual(previous,{path:[1],blockId:'1@stored',epoch:'old',schemaVersion:'original'});
 }
 assert.throws(()=>assertPlanningTarget({type:'paragraph'},{...DEMO_SCHEMA,nodes:{...DEMO_SCHEMA.nodes,paragraph:{shape:'atom'}}}),/stored text block/);
});

import {runMission,loadMission} from '../src/runner.ts';
for(const timing of ['during-planner','after-confirmed'] as const)test(`direct bounded mission stops on ${timing} schema transition without automatic upgrade`,{timeout:30000},async()=>{
 const f=await fixture();const transport=new NodeHttpTransport('doc','human-schema',f.upstream.url),schema=await transport.getSchema(),peer=new DocumentSession('human-schema',transport,schema.schema!);
 try{
  await peer.start();await until(()=>peer.client.synchronized);await peer.edit((await peer.read()).revision!,[{op:'insert',at:[0,0],content:'Foreign'},{op:'insert',at:[1],content:[{type:'paragraph',runs:[{text:'Target',marks:{}}]}]}]);
  let calls=0;const next={...schema.schema!,marks:[...schema.schema!.marks,'highlight']};
  const result=await runMission({url:f.upstream.url,document:'doc',actor:`bot-${timing}`,mission:'Append only in target',stateDir:join(f.dir,'direct'),ephemeral:true,maxSteps:4,planningPath:[1]},async input=>{
   calls++;
   if(timing==='during-planner'||input.lastConfirmed){const current=await peer.read();await peer.transitionSchema({...current.revision!,schemaVersion:schemaVersion(schema.schema!)},next);}
   return input.lastConfirmed?{action:'finish',at:[],text:'',count:0,message:'Done'}:{action:'insert',at:[1,6],text:'!',count:0,message:'Append'};
  });
  assert.equal(result.status,'needs_attention',JSON.stringify(result));assert.equal(calls,timing==='during-planner'?1:2);
  assert.equal(result.history.filter(h=>h.kind==='confirmed').length,timing==='during-planner'?0:1);
  assert.equal(result.planningBinding?.schemaVersion,schemaVersion(schema.schema!));
  const saved=await loadMission(join(f.dir,'direct'),result.id);assert.deepEqual(saved.planningBinding,result.planningBinding);assert.deepEqual(saved.pending,result.pending);assert.deepEqual(saved.history,result.history);
  const state=await (await fetch(f.upstream.url+'/api/docs/doc/state')).json();assert.match(JSON.stringify(state.model),/Foreign/);assert.match(JSON.stringify(state.model),timing==='during-planner'?/Target"/:/Target!/);
  assert.match(result.error??'',/schema|settled|recovery|revision|not connected/i);
 }finally{await peer.close();await f.cleanup();}
});
test('incompatible mark and attribute changes reject without model, events, pending or history mutation',async()=>{
 const f=await fixture();const transport=new NodeHttpTransport('doc','human-rules',f.upstream.url),schema=await transport.getSchema(),peer=new DocumentSession('human-rules',transport,schema.schema!);
 try{
  await peer.start();await until(()=>peer.client.synchronized);await peer.edit((await peer.read()).revision!,[{op:'insert',at:[0,0],content:'Keep human text'}]);
  const view=await peer.read(),history=peer.client.history.snapshot(),pending=structuredClone(peer.client.pending),before=peer.client.doc.toJSON();let events=0;peer.client.onModelEvents=()=>{events++;};
  const nextMark={...schema.schema!,marks:[...schema.schema!.marks].reverse()};
  const nextAttr=structuredClone(schema.schema!);nextAttr.nodes['list-item'].attrs!.listType={default:'numbered',values:['bullet','numbered'],inherit:true};
  for(const next of [nextMark,nextAttr]){
   await assert.rejects(peer.transitionSchema({...view.revision!,schemaVersion:schemaVersion(schema.schema!)},next),/Incompatible schema/);
   assert.deepEqual(peer.client.doc.toJSON(),before);assert.deepEqual(peer.client.history.snapshot(),history);assert.deepEqual(peer.client.pending,pending);assert.equal(peer.client.conditionalPending,false);assert.equal(events,0);assert.deepEqual(peer.client.notificationErrors,[]);
   assert.equal((await transport.getSchema()).schemaVersion,schemaVersion(schema.schema!));
  }
 }finally{await peer.close();await f.cleanup();}
});
