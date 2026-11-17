import {dataOnlyProposalPlanner,type ModelPlanningLimits} from './proposal-model-boundary.ts';
import type {ProposalPlanner} from './proposal-planner.ts';

type Options = ModelPlanningLimits & {apiKey:string;model:string;maxOutputTokens?:number};
/** Explicit injection avoids ambient network/configuration access. Trusted host code, not a sandbox. */
export type ProposalFetch = (url:string,init:RequestInit)=>Promise<Response>;
const ENDPOINT='https://api.openai.com/v1/responses';
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>new Error('Provider planning failed');
const strings={type:'array',items:{type:'string'}};
const shape=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const decisionSchema=shape({decision:{anyOf:[
 shape({start:{type:'integer'},end:{type:'integer'},replacement:{type:'string'},explanation:{type:'string'},assumptions:strings,questions:strings,checks:{type:'array',items:shape({reference:{type:'string'},status:{type:'string',enum:['unchecked']}})}}),
 shape({kind:{type:'string',enum:['abstain']},reason:{type:'string',enum:['missing_information','unsupported','uncertain']},explanation:{type:'string'},questions:strings})
]}});
/**
 * Opt-in Responses contract; only synthetic fetches are qualified. No default fetch,
 * environment lookup, CLI wiring or provider authorization is implied. The host must
 * authorize account, model, credential use, data and cost before injecting real fetch.
 */
export function openAIProposalPlanner(options:Options,fetcher:ProposalFetch):ProposalPlanner {
 const allowed=['apiKey','model','maxOutputTokens','maxCalls','timeoutMs','signal'];
 if(!object(options)||Object.keys(options).some(k=>!allowed.includes(k))||typeof fetcher!=='function'||typeof options.apiKey!=='string'||!/^[-_A-Za-z0-9]{16,512}$/.test(options.apiKey)||typeof options.model!=='string'||!/^[-_.:A-Za-z0-9]{1,128}$/.test(options.model))throw Error('Invalid provider planning options');
 // Copy primitive configuration once; caller mutation cannot redirect or change credentials.
 const {apiKey,model}=options,maxOutputTokens=options.maxOutputTokens??1024;
 if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>4096)throw Error('Invalid provider output budget');
 return dataOnlyProposalPlanner(async(packet,signal)=>{
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const onAbort=()=>{try{if(reader)void reader.cancel().catch(()=>{});}catch{}};
  signal.addEventListener('abort',onAbort,{once:true});
  try{
   const body=JSON.stringify({model,store:false,stream:false,background:false,tools:[],tool_choice:'none',max_output_tokens:maxOutputTokens,
    instructions:packet.instructions+' Return the decision inside the sole root property decision.',
    input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({brief:packet.brief,text:packet.text})}]}],
    text:{format:{type:'json_schema',name:'bounded_proposal_decision',strict:true,schema:decisionSchema}}});
   if(Buffer.byteLength(body)>262144||body.includes(apiKey))throw fail();
   const response=await fetcher(ENDPOINT,{method:'POST',redirect:'error',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body,signal});
   if(signal.aborted){void response.body?.cancel().catch(()=>{});throw fail();}
   if(!response.ok||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){void response.body?.cancel().catch(()=>{});throw fail();}
   reader=response.body?.getReader();if(!reader)throw fail();
   const chunks:Buffer[]=[];let bytes=0,count=0;
   while(true){const part=await reader.read();signal.throwIfAborted();if(part.done)break;if(!(part.value instanceof Uint8Array)||++count>1024||(bytes+=part.value.byteLength)>262144)throw fail();chunks.push(Buffer.from(part.value));}
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)),envelope:unknown=JSON.parse(raw);
   // Reflections are rejected, not logged. This is not general secret detection.
   if(raw.includes(apiKey)||JSON.stringify(envelope).includes(apiKey))throw fail();
   if(!object(envelope)||envelope.status!=='completed'||envelope.error!==null||envelope.incomplete_details!==null||!Array.isArray(envelope.output)||envelope.output.length!==1)throw fail();
   const message=envelope.output[0];
   if(!object(message)||message.type!=='message'||message.role!=='assistant'||message.status!=='completed'||!Array.isArray(message.content)||message.content.length!==1)throw fail();
   const content=message.content[0];let decision:unknown;
   if(object(content)&&content.type==='refusal'&&typeof content.refusal==='string'){
    decision={kind:'abstain',reason:'unsupported',explanation:'The provider declined to produce a proposal.',questions:[]};
   }else{
    if(!object(content)||content.type!=='output_text'||typeof content.text!=='string'||!Array.isArray(content.annotations)||content.annotations.length!==0)throw fail();
    const wrapper:unknown=JSON.parse(content.text);
    if(!object(wrapper)||Object.keys(wrapper).join(',')!=='decision')throw fail();decision=wrapper.decision;
   }
   const serialized=JSON.stringify(decision);if(typeof serialized!=='string'||serialized.includes(apiKey))throw fail();
   return {async *[Symbol.asyncIterator](){yield Buffer.from(serialized);}};
  }catch{throw fail();}
  finally{signal.removeEventListener('abort',onAbort);onAbort();}
 },{maxCalls:options.maxCalls,timeoutMs:options.timeoutMs,signal:options.signal});
}
