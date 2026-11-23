import assert from 'node:assert/strict';
import {test} from 'node:test';
import {openAIProposalPlanner,type ProposalFetch} from '../src/openai-proposal-planner.ts';
const apiKey='synthetic_provider_key_not_real',model='explicit-test-model';
const options=()=>({apiKey,model});
const input=()=>({brief:'Clarify this synthetic text.',target:{base:{generation:'PRIVATE_GENERATION',epoch:'PRIVATE_EPOCH',serverSeq:5,schemaVersion:'PRIVATE_SCHEMA'},target:{path:[0] as [number],blockId:'PRIVATE_BLOCK',text:'hello'}}});
const plan=()=>({start:0,end:5,replacement:'world',explanation:'Clarify',assumptions:[],questions:[],checks:[]});
const envelope=(decision:unknown=plan())=>({status:'completed',error:null,incomplete_details:null,output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({decision}),annotations:[]}]}]});
const response=(value:unknown=envelope())=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const fail=(error:unknown)=>String(error)==='Error: Model planning failed; no proposal decision available';
test('fixed destination and explicit no-tool/no-state request; only synthetic brief/text in input',async()=>{
 let calls=0;const config=options();
 const fetcher:ProposalFetch=async(url,init)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert(init.signal);
  assert.deepEqual(init.headers,{authorization:`Bearer ${apiKey}`,'content-type':'application/json'});
  const body=JSON.parse(init.body as string);assert.equal(body.model,model);assert.equal(body.store,false);assert.equal(body.stream,false);assert.equal(body.background,false);assert.equal(body.max_output_tokens,1024);assert.deepEqual(body.tools,[]);assert.equal(body.tool_choice,'none');
  assert(!('previous_response_id'in body));assert(!('conversation'in body));assert(!('metadata'in body));
  assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);
  assert.deepEqual(JSON.parse(body.input[0].content[0].text),{brief:input().brief,text:'hello'});
  for(const secret of [apiKey,'PRIVATE_GENERATION','PRIVATE_EPOCH','PRIVATE_SCHEMA','PRIVATE_BLOCK'])assert(!(init.body as string).includes(secret));
  return response();
 };
 const planner=openAIProposalPlanner(config,fetcher);config.model='changed';config.apiKey='changed';assert.deepEqual(await planner(input()),plan());await assert.rejects(planner(input()),fail);assert.equal(calls,1);
});
test('rejects endpoint overrides, malformed credentials/models and unbounded token budgets',()=>{
 const fetcher:ProposalFetch=async()=>response();
 for(const bad of [{...options(),endpoint:'https://evil.invalid'},{...options(),apiKey:'secret\r\nheader'},{...options(),model:'x\n'},{...options(),maxOutputTokens:0},{...options(),maxOutputTokens:4097}])assert.throws(()=>openAIProposalPlanner(bad,fetcher));
 assert.throws(()=>openAIProposalPlanner(options(),undefined as any));
});
test('redirects, HTTP failures and invalid content types fail without error-body reflection or retry',async()=>{
 for(const result of [new Response('SECRET', {status:302,headers:{location:'https://evil.invalid'}}),new Response('SECRET',{status:401}),new Response('SECRET',{status:429}),new Response('{}',{headers:{'content-type':'text/html'}})]){
  let calls=0;const planner=openAIProposalPlanner(options(),async()=>{calls++;return result;});await assert.rejects(planner(input()),fail);await assert.rejects(planner(input()),fail);assert.equal(calls,1);
 }
 await assert.rejects(openAIProposalPlanner(options(),async()=>{throw Error(apiKey);})(input()),fail);
});
test('only one completed assistant text decision is accepted; truncation/tool output/extra content fail',async()=>{
 const valid=envelope();
 const invalid=[{...valid,status:'incomplete'},{...valid,error:{message:apiKey}},{...valid,incomplete_details:{reason:'max_output_tokens'}},{...valid,output:[]},{...valid,output:[{type:'reasoning',summary:[]},...valid.output]},{...valid,output:[...valid.output,...valid.output]},{...valid,output:[{type:'function_call',name:'approve'}]},{...valid,output:[{...valid.output[0],role:'user'}]},{...valid,output:[{...valid.output[0],status:'in_progress'}]},{...valid,output:[{...valid.output[0],content:[...valid.output[0]!.content,...valid.output[0]!.content]}]},envelope({...plan(),approve:true})];
 for(const value of invalid)await assert.rejects(openAIProposalPlanner(options(),async()=>response(value))(input()),fail);
});
test('provider refusal becomes fixed abstention without persisting raw refusal text',async()=>{
 const value=envelope();(value.output[0] as any).content=[{type:'refusal',refusal:'Untrusted provider diagnostic'}];
 const result=await openAIProposalPlanner(options(),async()=>response(value))(input());
 assert.deepEqual(result,{kind:'abstain',reason:'unsupported',explanation:'The provider declined to produce a proposal.',questions:[]});
});
test('credential reflection in input, response or nested escaped decision is rejected',async()=>{
 let calls=0;const source=input();source.brief=apiKey;
 await assert.rejects(openAIProposalPlanner(options(),async()=>{calls++;return response();})(source),fail);assert.equal(calls,0);
 await assert.rejects(openAIProposalPlanner(options(),async()=>response(envelope({...plan(),replacement:apiKey})))(input()),fail);
 const value=envelope();value.output[0]!.content[0]!.text=JSON.stringify({decision:{...plan(),replacement:apiKey}}).replace(apiKey,[...apiKey].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join(''));
 await assert.rejects(openAIProposalPlanner(options(),async()=>response(value))(input()),fail);
});
test('bounded response parsing rejects malformed UTF-8, oversized body and empty chunk flood',async()=>{
 for(const data of [Uint8Array.of(0xc3,0x28),Buffer.alloc(262145,32)])await assert.rejects(openAIProposalPlanner(options(),async()=>new Response(data,{headers:{'content-type':'application/json'}}))(input()),fail);
 let count=0,canceled=false;const body=new ReadableStream<Uint8Array>({pull(c){count++;c.enqueue(new Uint8Array());},cancel(){canceled=true;}});
 await assert.rejects(openAIProposalPlanner(options(),async()=>new Response(body,{headers:{'content-type':'application/json'}}))(input()),fail);assert(canceled);assert(count<=1027);
});
test('timeout aborts fetch and cancels a stalled body without retry',async()=>{
 let aborted=false,canceled=false,calls=0;
 const planner=openAIProposalPlanner({...options(),timeoutMs:15},async(_url,init)=>{calls++;init.signal!.addEventListener('abort',()=>aborted=true);return new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{'content-type':'application/json'}});});
 await assert.rejects(planner(input()),fail);assert(aborted);assert(canceled);await assert.rejects(planner(input()),fail);assert.equal(calls,1);
});
test('Responses decision creates only a durable proposal; lost acknowledgement never repeats provider call',async()=>{
 const {runProposalMission}=await import('../src/proposal-planner.ts');const {mkdtemp,chmod,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'responses-proposal-'));await chmod(dir,0o700);let calls=0;const requests:any[]=[];
 const planner=openAIProposalPlanner(options(),async()=>{calls++;return response();});
 const mission={missionPath:join(dir,'mission.json'),brief:input().brief,path:[0] as [number]};
 const client={binding:'synthetic-creator-only',readTarget:async()=>input().target,create:async(r:any)=>{requests.push(r);if(requests.length===1)throw Error('lost acknowledgement');return {id:'a'.repeat(64),requestId:r.requestId};}};
 try{assert.equal((await runProposalMission(mission,planner,client)).status,'unknown');assert.equal((await runProposalMission(mission,planner,client)).status,'created');assert.equal(calls,1);assert.deepEqual(requests[0],requests[1]);assert.deepEqual(requests[0].base,input().target.base);assert.equal(requests[0].change.blockId,'PRIVATE_BLOCK');}finally{await rm(dir,{recursive:true,force:true});}
});
test('provider refusal is durably abstained and resumed without another provider or proposal call',async()=>{
 const {runProposalMission}=await import('../src/proposal-planner.ts');const {mkdtemp,chmod,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'responses-refusal-'));await chmod(dir,0o700);let calls=0,creates=0;const value=envelope();(value.output[0] as any).content=[{type:'refusal',refusal:'Untrusted refusal content'}];
 const planner=openAIProposalPlanner(options(),async()=>{calls++;return response(value);});
 const mission={missionPath:join(dir,'mission.json'),brief:input().brief,path:[0] as [number]};
 const client={binding:'b',readTarget:async()=>input().target,create:async(r:any)=>{creates++;return {id:'a'.repeat(64),requestId:r.requestId};}};
 try{assert.equal((await runProposalMission(mission,planner,client)).status,'abstained');assert.equal((await runProposalMission(mission,planner,client)).status,'abstained');assert.equal(calls,1);assert.equal(creates,0);}finally{await rm(dir,{recursive:true,force:true});}
});

test('explicit host cancellation reaches mock fetch and cancels its response body',async()=>{
 const controller=new AbortController();let signal:AbortSignal|undefined,cancelled=false,entered!:()=>void;
 const started=new Promise<void>(r=>entered=r);
 const planner=openAIProposalPlanner({...options(),signal:controller.signal},async(_url,init)=>{
  signal=init.signal as AbortSignal;return new Response(new ReadableStream<Uint8Array>({pull(){entered();},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});
 });
 const work=planner(input());await started;controller.abort('PRIVATE_REASON');await assert.rejects(work,fail);assert(signal?.aborted);assert(cancelled);
 let calls=0;const before=openAIProposalPlanner({...options(),signal:controller.signal},async()=>{calls++;return response();});await assert.rejects(before(input()),fail);assert.equal(calls,0);
});
