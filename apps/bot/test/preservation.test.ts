import assert from "node:assert/strict";
import {test} from "node:test";
import {parseProtection,checkPreservation,assertPreservationState} from "../src/preservation.ts";
import type {Schema} from "@barocss/doc-sync";
const revision={epoch:"e",serverSeq:1,schemaVersion:"s"};
const schema:Schema={root:"root",marks:[],nodes:{root:{shape:"flow",children:["p"],default:"p"},p:{shape:"text",attrs:{flag:{default:false}}}}};
const targets=[{path:[2],attribute:"flag"}];
const response=(value:unknown,id="4@A",rev=revision)=>({revision:rev,sessionOnline:true,pending:0,conditionalPending:false,recoveryRequired:false,children:[{path:[2],blockId:id,node:{type:"p",...(value===undefined?{}:{attrs:{flag:value}}),runs:[]}}]});
test("capture retains absent versus scalar values without inferred defaults",async()=>{
 for(const value of [false,true,0,"",null,undefined]){
 const initial=await checkPreservation(async()=>response(value),targets,revision,schema);
 assert.equal(initial[0].present,value!==undefined);assert.equal(Object.hasOwn(initial[0],"value"),value!==undefined);
 if(value===undefined)await assert.rejects(checkPreservation(async()=>response(false),targets,revision,schema,initial),/conflict/);
 const next={...revision,serverSeq:2};assert.deepEqual(await checkPreservation(async()=>response(value,"4@A",next),targets,next,schema,initial),initial);
 const changed=value===true?false:true;await assert.rejects(checkPreservation(async()=>response(changed),targets,revision,schema,initial),/conflict/);
 assertPreservationState({planningPath:[1],protectedAttributes:targets,preservation:initial});
 }
});
test("identity, schema, epoch and value conflicts never recapture",async()=>{
 const original=await checkPreservation(async()=>response(false),targets,revision,schema);
 const typed={...response(false),children:[{...response(false).children[0],node:{type:"other",attrs:{flag:false},runs:[]}}]};
 await assert.rejects(checkPreservation(async()=>typed,targets,revision,{...schema,nodes:{...schema.nodes,other:{shape:"text",attrs:{flag:{default:false}}}}},original),/conflict/);
 for(const r of [response(false,"7@B"),{...response(false),children:[]},{...response(false),children:[{...response(false).children[0],path:[3]}]}])await assert.rejects(checkPreservation(async()=>r,targets,revision,schema,original));
 for(const rev of [{...revision,epoch:"restored"},{...revision,schemaVersion:"new"}])await assert.rejects(checkPreservation(async()=>response(false,"4@A",rev),targets,rev,schema,original));
 await assert.rejects(checkPreservation(async()=>response({nested:true}),targets,revision,schema));
 await assert.rejects(checkPreservation(async()=>response(false),[{path:[2],attribute:"unknown"}],revision,schema));
 for(const state of [{planningPath:[1],protectedAttributes:targets},{planningPath:[1],preservation:original},{planningPath:[1],protectedAttributes:targets,preservation:[]},{planningPath:[1],protectedAttributes:targets,preservation:[{...original[0],present:false}]}])assert.throws(()=>assertPreservationState(state));
});
test("configuration is bounded, disjoint and copied",()=>{
 for(const targets of [[],Array(17).fill({path:[2],attribute:"x"}),[{path:[1],attribute:"x"}],[{path:[2],attribute:"x"},{path:[2],attribute:"x"}],[{path:[2],attribute:"x",extra:true}]])assert.throws(()=>parseProtection(targets,[1]));
 assert.throws(()=>parseProtection(targets));const parsed=parseProtection(targets,[1]);parsed[0].path[0]=9;assert.equal(targets[0].path[0],2);
});


test("read-only protection permits rich text while retaining original scalar and identity fences",async()=>{
 const rich=(value:unknown,id="4@A",rev=revision)=>{
  const result=response(value,id,rev);
  return {...result,children:[{...result.children[0],node:{...result.children[0].node,runs:[{text:"A",marks:{bold:true}},{type:"inline-image",attrs:{src:"https://example.com/a"}},{type:"link",runs:[{text:"B",marks:{}}]}]}}]};
 };
 const initial=await checkPreservation(async()=>rich(false),targets,revision,schema);
 const persisted=JSON.parse(JSON.stringify(initial));
 assertPreservationState({planningPath:[1],protectedAttributes:targets,preservation:persisted});
 const next={...revision,serverSeq:2},incoming=rich(false,"4@A",next),before=JSON.stringify(incoming);
 assert.deepEqual(await checkPreservation(async()=>incoming,targets,next,schema,persisted),initial);
 assert.equal(JSON.stringify(incoming),before);
 await assert.rejects(checkPreservation(async()=>rich(true,"4@A",next),targets,next,schema,persisted),/conflict/);
 await assert.rejects(checkPreservation(async()=>rich(false,"5@peer",next),targets,next,schema,persisted),/identity/);
 assert.deepEqual(persisted,initial);
});
