import assert from "node:assert/strict";
import {test} from "node:test";
import {parsePlanningPath,readPlanningContext,assertPlanningEdits,assertPlanningSelection,assertPersistedPlanningState} from "../src/planning-context.ts";
const revision={epoch:"e",serverSeq:4,schemaVersion:"s"};
const slice=()=>({revision,sessionOnline:true,pending:0,conditionalPending:false,recoveryRequired:false,children:[{path:[1],blockId:"4@A",node:{type:"paragraph",runs:[{text:"small"}]}}],nextCursor:"unused-sibling-cursor"});
test("one bounded subtree is explicit partial context and independent of unseen siblings",async()=>{
 let calls=0;const result=await readPlanningContext(async(name,args)=>{calls++;assert.equal(name,"read_document_slice");assert.deepEqual(args,{path:[],start:1,limit:1,maxNodes:2048,maxTextUnits:32768,maxBytes:131072});return slice();},[1],revision);
 assert.equal(calls,1);assert.equal(result.document.partial,true);assert.equal(result.document.view,"bounded_subtree");assert.equal(result.binding.blockId,"4@A");assert.deepEqual(result.document.path,[1]);
 const next=await readPlanningContext(async()=>({...slice(),revision:{...revision,serverSeq:5}}),[1],{...revision,serverSeq:5},result.binding);assert.equal(next.binding.blockId,result.binding.blockId);
});
test("revision, identity, epoch, schema and placement mismatches never silently rebind",async()=>{
 const initial=await readPlanningContext(async()=>slice(),[1],revision);
 for(const response of [{...slice(),revision:{...revision,serverSeq:5}},{...slice(),pending:1},{...slice(),children:[]},{...slice(),children:[{...slice().children[0],blockId:null}]},{...slice(),children:[{...slice().children[0],blockId:"0@~root"}]}])await assert.rejects(readPlanningContext(async()=>response,[1],revision));
 await assert.rejects(readPlanningContext(async()=>({...slice(),children:[{...slice().children[0],blockId:"7@B"}]}),[1],revision,initial.binding),/identity/);
 for(const changed of [{...revision,epoch:"next"},{...revision,schemaVersion:"next"}])await assert.rejects(readPlanningContext(async()=>({...slice(),revision:changed}),[1],changed,initial.binding),/identity/);
 await assert.rejects(readPlanningContext(async()=>slice(),[1],revision,{...initial.binding,path:[2]}),/identity/);
 await assert.rejects(readPlanningContext(async()=>{throw Error("Slice exceeds node budget");},[1],revision),/budget/);
});
test("path inputs are owned, finite and bounded",()=>{
 for(const value of [[],[-1],[1.5],Array(33).fill(0),[Infinity],new Array(2),"[1]"])assert.throws(()=>parsePlanningPath(value));
 const original=[1,2];const parsed=parsePlanningPath(original);original[0]=9;assert.deepEqual(parsed,[1,2]);
});
test("scope rejects out-of-target paths, structural text insertion and type-change escapes",()=>{
 assert.doesNotThrow(()=>assertPlanningEdits([{op:"insert",at:[1,0],content:"x"},{op:"delete",at:[1,0],count:1},{op:"update",at:[1,0],attrs:{bold:true},length:1}],[1]));
 for(const edit of [{op:"insert",at:[1],content:"x"},{op:"delete",at:[1],count:1},{op:"update",at:[1],attrs:{listType:"numbered"}},{op:"update",at:[2],attrs:{}},{op:"split",at:[1,1]},{op:"merge",at:[1,1]},{op:"move",from:[1,0],at:[1,1]},{op:"insert",at:[1,0],content:[{type:"paragraph",runs:[]}]},{op:"update",at:[1],attrs:{type:"heading2"}}])assert.throws(()=>assertPlanningEdits([edit as any],[1]));
 assert.doesNotThrow(()=>assertPlanningSelection([1,0],[1]));assert.throws(()=>assertPlanningSelection([0,0],[1]));
});

test("persisted path/binding pairs cannot silently widen after restart",()=>{
 const binding={path:[1],blockId:"4@A",epoch:"e",schemaVersion:"s"};
 assert.doesNotThrow(()=>assertPersistedPlanningState({}));assert.doesNotThrow(()=>assertPersistedPlanningState({planningPath:[1],planningBinding:binding}));
 for(const value of [{planningPath:[1]},{planningBinding:binding},{planningPath:[2],planningBinding:binding}])assert.throws(()=>assertPersistedPlanningState(value),/review/);
});
