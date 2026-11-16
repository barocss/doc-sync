import assert from "node:assert/strict";
import {test} from "node:test";
import {schemaVersion} from "@barocss/doc-sync";
import type {Schema} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {parseBrief, verifyBrief} from "../src/brief.ts";
import type {Brief, Requirement} from "../src/brief.ts";
const brief=(...requirements:Requirement[]):Brief=>({version:1,objective:"Verify requested values",requirements});
const attr=(value:unknown="https://example.com",extra:Record<string,unknown>={})=>{const r:Record<string,unknown>={id:"url",kind:"attribute_equals",path:[0],runPath:[0],attribute:["url"],value,...extra};if(r.runPath===undefined)delete r.runPath;return r as Requirement;};
const mark=(value:unknown=true,extra={})=>({id:"bold",kind:"mark_equals",path:[0],runPath:[0,0],mark:"bold",value,...extra} as Requirement);
const doc=(url:unknown="https://example.com",bold:unknown=true)=>({type:"content",children:[{type:"paragraph",runs:[{type:"inline-hyperlink",attrs:{url},runs:[{text:"Same text",marks:{bold}}]}]}]});
const check=(r:Requirement[],d:unknown=doc(),schema:Schema=DEMO_SCHEMA)=>verifyBrief(brief(...r),d,schema,{epoch:"e",serverSeq:7,schemaVersion:schemaVersion(schema)});
test("equal text does not prove requested URL or mark; span values are not inherited marks",()=>{
 assert.equal(check([attr(),mark()]).status,"passed");assert.equal(check([attr(),mark()],doc("https://wrong.example")).status,"failed");assert.equal(check([attr(),mark()],doc(undefined,false)).status,"failed");
 assert.equal(check([mark("https://example.com",{mark:"link"})]).status,"failed");assert.equal(check([mark("yes")],doc(undefined,"yes")).status,"failed");
});
test("missing differs from explicit defaults, null, false, zero and empty string",()=>{
 const schema:Schema={...DEMO_SCHEMA,nodes:{...DEMO_SCHEMA.nodes,callout:{shape:"flow",children:["paragraph"],default:"paragraph",attrs:{data:{default:null}}}}};
 for(const value of [null,false,0,""]){const r=attr(value,{path:[0],runPath:undefined,attribute:["data"]});const d={type:"content",children:[{type:"callout",attrs:{data:value},children:[]}]};assert.equal(check([r],d,schema).status,"passed");assert.equal(check([r],{type:"content",children:[{type:"callout",children:[]}]},schema).status,"failed");}
 assert.equal(check([attr("info",{runPath:undefined,attribute:["tone"]})],{type:"content",children:[{type:"callout",children:[]}]}).status,"failed");
});
test("nested attributes use own JSON leaf properties and declared roots only",()=>{
 const schema:Schema={...DEMO_SCHEMA,nodes:{...DEMO_SCHEMA.nodes,callout:{shape:"flow",children:["paragraph"],default:"paragraph",attrs:{data:{default:{style:{color:""}}}}}}};
 const d={type:"content",children:[{type:"callout",attrs:{data:{style:{color:"red"},array:["red"]}},children:[]}]};
 assert.equal(check([attr("red",{runPath:undefined,attribute:["data","style","color"]})],d,schema).status,"passed");
 for(const attribute of [["unknown"],["data","constructor"],["data","array","length"]])assert.equal(check([attr(1,{runPath:undefined,attribute})],d,schema).status,"failed");
 assert.equal(check([attr("https://example.com",{attribute:["undeclared"]})]).status,"failed");assert.equal(check([mark(true,{mark:"undeclared"})]).status,"failed");
});
test("run targets reject missing indices, atoms, text as span and attribute text-run targets",()=>{
 for(const runPath of [[9],[0,9],[0,0,0]])assert.equal(check([mark(true,{runPath})]).status,"failed");
 assert.equal(check([mark(true,{runPath:[0]})]).status,"failed");assert.equal(check([attr(null,{runPath:[0,0]})]).status,"failed");
});
test("new inputs are bounded and fail closed without coercion or accessor evaluation",()=>{
 for(const value of [undefined,Infinity,NaN,{},[],"x".repeat(8193)])assert.throws(()=>parseBrief(brief({...attr(),value} as Requirement)));
 for(const extra of [{attribute:[]},{attribute:Array(17).fill("x")},{runPath:[]},{runPath:[-1]},{unsupported:true}])assert.throws(()=>parseBrief(brief(attr(null,extra))));
 const cyclic:any=doc();cyclic.children.push(cyclic);assert.equal(check([attr()],cyclic).status,"failed");
 let touched=false;const bad=doc();Object.defineProperty(bad.children[0].runs[0].attrs,"url",{get(){touched=true;throw Error("must not read")},enumerable:true});assert.equal(check([attr()],bad).status,"failed");assert.equal(touched,false);
 const inherited=doc();Object.setPrototypeOf(inherited.children[0].runs[0].attrs,{url:"https://example.com"});assert.equal(check([attr()],inherited).status,"failed");
 assert.equal(check([attr()],doc(Infinity)).status,"failed");
});
test("requirements remain owned and schema/revision evidence stays fenced",()=>{
 const input=brief(attr(),mark());const parsed=parseBrief(input);const before=JSON.stringify(input);const model=doc();const snapshot=JSON.stringify(model);const result=check(parsed.requirements,model);assert.equal(result.status,"passed");assert.equal(result.checkedRevision.serverSeq,7);assert.equal(JSON.stringify(input),before);assert.equal(JSON.stringify(model),snapshot);
 (input.requirements[0] as any).attribute[0]="wrong";assert.equal(check(parsed.requirements).status,"passed");
 assert.throws(()=>verifyBrief(parsed,model,DEMO_SCHEMA,{epoch:"e",serverSeq:7,schemaVersion:"changed"}),/schema/);
});
