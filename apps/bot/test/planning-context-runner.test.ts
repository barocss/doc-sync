import assert from "node:assert/strict";
import {test} from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {runMission,loadMission,listMissions,resumeMission} from "../src/runner.ts";
import {createProfile,profileActor} from "../src/profiles.ts";
import type {Plan} from "../src/runner.ts";
const wait=async(check:()=>boolean)=>{const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw Error("timeout");await new Promise(r=>setTimeout(r,20));}};
const finish=():Plan=>({action:"finish",at:[],text:"",count:0,message:"Done"});
const p=(text:string)=>({type:"paragraph",runs:[{text,marks:{}}]});
test("bounded planner uses stored text identity and full authoritative finish",{timeout:60000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),"planning-context-"));const server=spawn(process.execPath,[fileURLToPath(new URL("../../demo/server.ts",import.meta.url))],{env:{...process.env,PORT:"0",DATA_DIR:join(dir,"server"),NO_SCHEMA:""},stdio:["ignore","pipe","pipe"]});let errors="";server.stderr.on("data",b=>errors+=String(b));
 try{
 const origin=await new Promise<string>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(Error(errors||"server timeout")),10000);server.once("exit",()=>{clearTimeout(timer);reject(Error(errors));});server.stdout.on("data",b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});});
 for(const scenario of ["large","peer","replace","outside","oversized"])await t.test(scenario,async()=>{
  const transport=new NodeHttpTransport(scenario,"human",origin),human=new SyncClient("human",transport,{schema:DEMO_SCHEMA});human.connect();
  try{
   await wait(()=>human.synchronized);
   human.commit(human.doc.edit([{op:"insert",at:[1],content:[p(scenario==="oversized"?"x".repeat(33000):"Target")]}]).ops);await wait(()=>human.pending.length===0);
   if(scenario==="large"){human.commit(human.doc.edit([{op:"insert",at:[2],content:[{type:"image-component",children:[{type:"image",runs:[{type:"inline-image",attrs:{src:"https://example.com/"+"x".repeat(530000)}}]}]}]}]).ops);await wait(()=>human.pending.length===0);assert.ok(JSON.stringify(human.doc.toJSON()).length>512*1024);}
   const before=JSON.stringify(human.doc.toJSON());let calls=0;
   const result=await runMission({url:origin,document:scenario,actor:`bot-${scenario}`,mission:"Append exclamation only in selected target",stateDir:join(dir,"missions"),ephemeral:true,maxSteps:5,planningPath:[1],brief:{version:1,objective:"Target must be complete",requirements:[{id:"target",kind:"exact_text",path:[1],text:"Target!"}]}},async input=>{
    calls++;const context=input.document as any;assert.equal(context.view,"bounded_subtree");assert.equal(context.partial,true);assert.deepEqual(context.path,[1]);assert.ok(context.blockId);assert.ok(JSON.stringify(input.document).length<2000);
    if(scenario==="outside")return {action:"insert",at:[0,0],text:"BAD",count:0,message:"Out of scope"};
    if(scenario==="replace"){human.commit(human.doc.edit([{op:"delete",at:[1],count:1},{op:"insert",at:[1],content:[p("Replacement")]}]).ops);await wait(()=>human.pending.length===0);return finish();}
    if(scenario==="peer"&&calls===1){human.commit(human.doc.edit([{op:"insert",at:[0,0],content:"Human"}]).ops);await wait(()=>human.pending.length===0);}
    return input.lastConfirmed?finish():{action:"insert",at:[1,6],text:"!",count:0,message:"Append"};
   });
   const restored=await loadMission(join(dir,"missions"),result.id);assert.deepEqual(restored.planningBinding,result.planningBinding);assert.deepEqual(restored.planningPath,[1]);
   if(scenario==="large"||scenario==="peer"){assert.equal(result.status,"completed",JSON.stringify(result));assert.equal(result.verification?.status,"passed");assert.equal(result.history.filter(x=>x.kind==="confirmed").length,1);if(scenario==="peer")assert.match(JSON.stringify(human.doc.toJSON()),/Human/);}
   else {assert.equal(result.status,"needs_attention",JSON.stringify(result));assert.equal(result.history.filter(x=>x.kind==="confirmed").length,0);if(scenario==="replace")assert.match(result.error!,/identity|placement/);else if(scenario==="outside")assert.match(result.error!,/scope|target/);else {assert.equal(calls,0);assert.match(result.error!,/budget/);}if(scenario!=="replace")assert.equal(JSON.stringify(human.doc.toJSON()),before);}
  }finally{human.disconnect();await transport.leave().catch(()=>undefined);}
 });
 await t.test("restart retains binding and rejects replay of confirmed scope edit",{skip:process.platform!=="darwin"&&process.platform!=="linux"},async()=>{
  for(const mode of ["finish","repeat"]){
   const document=`restart-${mode}`,stateDir=join(dir,"profiles");
   const transport=new NodeHttpTransport(document,"seed",origin),human=new SyncClient("seed",transport,{schema:DEMO_SCHEMA});human.connect();
   try{await wait(()=>human.synchronized);human.commit(human.doc.edit([{op:"insert",at:[1],content:[p("Target")]}]).ops);await wait(()=>human.pending.length===0);}finally{human.disconnect();await transport.leave().catch(()=>undefined);}
   const profile=await createProfile(stateDir,{id:`scope-${mode}`,name:"Scoped",character:"owl",personality:"careful",role:"writer",color:"#123456"}),actor=profileActor(profile,origin,document);
   const options={url:origin,document,actor,mission:"Append one exclamation",stateDir,profileId:profile.id,maxSteps:4,planningPath:[1],brief:{version:1,objective:"Target complete",requirements:[{id:"target",kind:"exact_text",path:[1],text:"Target!"}]}};
   const edit={action:"insert",at:[1,6],text:"!",count:0,message:"Append"};
   const script=`import {runMission} from ${JSON.stringify(new URL("../src/runner.ts",import.meta.url).href)};let calls=0;await runMission(${JSON.stringify(options)},async()=>{if(calls++===0)return ${JSON.stringify(edit)};process.send('ready');await new Promise(()=>{});});`;
   const worker=spawn(process.execPath,["--input-type=module","-e",script],{detached:true,stdio:["ignore","ignore","pipe","ipc"]});let errors="";worker.stderr!.on("data",b=>errors+=String(b));const exited=once(worker,"exit");
   try{const [ready]=await Promise.race([once(worker,"message",{signal:AbortSignal.timeout(10000)}),exited.then(()=>{throw Error(errors||"worker exited")})]);assert.equal(ready,"ready");assert.equal(worker.exitCode,null);assert.equal(worker.signalCode,null);process.kill(-worker.pid!,"SIGKILL");await exited;}finally{if(worker.exitCode===null&&worker.signalCode===null){worker.kill("SIGKILL");await exited;}}
   const interrupted=(await listMissions(stateDir)).find(m=>m.document===document)!;assert.ok(interrupted.planningBinding);let result;const deadline=Date.now()+5000;
   while(!result){try{result=await resumeMission(stateDir,interrupted.id,async input=>{assert.equal((input.document as any).blockId,interrupted.planningBinding!.blockId);assert.ok(input.lastConfirmed);return mode==="finish"?finish():edit as Plan;});}catch(error){if(!(error instanceof Error)||!error.message.includes("Journal already has an active writer")||Date.now()>deadline)throw error;await new Promise(r=>setTimeout(r,50));}}
   assert.equal(result.status,mode==="finish"?"completed":"needs_attention",JSON.stringify(result));assert.equal(result.history.filter(x=>x.kind==="confirmed").length,1);assert.deepEqual(result.planningBinding,interrupted.planningBinding);if(mode==="repeat")assert.match(result.error!,/repeated/);
  }
 });
 }finally{if(server.exitCode===null&&server.signalCode===null){const done=once(server,"exit");server.kill("SIGTERM");await done;}await rm(dir,{recursive:true,force:true});}
});
