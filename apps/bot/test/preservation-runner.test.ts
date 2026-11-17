import {createHash} from "node:crypto";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
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
test("protected schema attribute stays identity-bound across peer edits",{timeout:60000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),"preservation-"));const server=spawn(process.execPath,[fileURLToPath(new URL("../../demo/server.ts",import.meta.url))],{env:{...process.env,PORT:"0",DATA_DIR:join(dir,"server"),NO_SCHEMA:""},stdio:["ignore","pipe","pipe"]});let errors="";server.stderr.on("data",b=>errors+=String(b));
 try{
 const origin=await new Promise<string>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(Error(errors||"server timeout")),10000);server.once("exit",()=>{clearTimeout(timer);reject(Error(errors));});server.stdout.on("data",b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});});
 for(const scenario of ["rich-protected","unchanged","human-text","human-attribute","replace","delete","move","forbidden","undo-human-first","undo-bot-first","text-unchanged","text-human","text-mark","text-replace","text-delete","text-move","text-forbidden","text-finish-race"])await t.test(scenario,async()=>{
  const transport=new NodeHttpTransport(scenario,"human",origin),human=new SyncClient("human",transport,{schema:DEMO_SCHEMA});human.connect();
  try{
   await wait(()=>human.synchronized);
   const item={type:"list",children:[{type:"list-item",attrs:{listType:"bullet",level:1},runs:[{text:"Protected",marks:{}}]}]};
   human.commit(human.doc.edit([{op:"insert",at:[1],content:[p("Target"),item]}]).ops);await wait(()=>human.pending.length===0);
   if(scenario==="rich-protected"){human.commit(human.doc.edit([{op:"insert",at:[2,0,9],content:[{type:"inline-image",attrs:{src:"https://example.com/protected.png"}}]}]).ops);await wait(()=>human.pending.length===0);}
   let calls=0;
   const result=await runMission({url:origin,document:scenario,actor:`bot-${scenario}`,mission:"Append exclamation",stateDir:join(dir,"missions"),ephemeral:!scenario.startsWith("undo-"),maxSteps:6,planningPath:[1],...(scenario.startsWith("text-")?{protectedText:[[2,0]]}:{protectedAttributes:[{path:[2,0],attribute:"level"}]})},async input=>{
    calls++;
    if(scenario.startsWith("text-"))assert(!JSON.stringify(input.document).includes("Protected"));
    if(calls===1){
     const edits:any[]=(scenario==="human-text"||scenario==="text-human"||scenario==="text-finish-race"||scenario.startsWith("undo-"))?[{op:"insert",at:[2,0,9],content:" human"}]:scenario==="human-attribute"?[{op:"update",at:[2,0],attrs:{level:2}}]:(scenario==="replace"||scenario==="text-replace")?[{op:"delete",at:[2],count:1},{op:"insert",at:[2],content:[item]}]:(scenario==="delete"||scenario==="text-delete")?[{op:"delete",at:[2],count:1}]:(scenario==="move"||scenario==="text-move")?[{op:"insert",at:[2],content:[p("Shift")]}]:scenario==="text-mark"?[{op:"update",at:[2,0,0],length:9,attrs:{bold:true}}]:[];
     if(edits.length){human.commit(human.doc.edit(edits).ops);await wait(()=>human.pending.length===0);}
    }
    if(scenario==="forbidden"||scenario==="text-forbidden")return {action:"edit",editsJson:JSON.stringify([{op:"update",at:[2,0],attrs:{level:0}}]),at:[],text:"",count:0,message:"bad"};
    if(scenario==="text-finish-race")return finish();
    return input.lastConfirmed?finish():{action:"insert",at:[1,6],text:"!",count:0,message:"Append"};
   });
   const saved=await loadMission(join(dir,"missions"),result.id);assert.deepEqual(saved.preservation,result.preservation);if(!scenario.startsWith("text-"))assert.equal(saved.preservation?.[0].value,1);
   if(scenario==="text-unchanged"||scenario==="text-mark"||scenario==="rich-protected"||scenario==="unchanged"||scenario==="human-text"||scenario.startsWith("undo-")){assert.equal(result.status,"completed",JSON.stringify(result));assert.equal(result.history.filter(x=>x.kind==="confirmed").length,1);if(scenario==="human-text")assert.match(JSON.stringify(human.doc.toJSON()),/human/);}
   else {assert.equal(result.status,"needs_attention",JSON.stringify(result));assert.equal(result.history.filter(x=>x.kind==="confirmed").length,0);if(scenario==="human-attribute")assert.match(JSON.stringify(human.doc.toJSON()),/"level":2/);}
   if(scenario.startsWith("text-")){assert.equal(saved.textPreservation?.[0].text,"Protected");assert.deepEqual(saved.textPreservation,result.textPreservation);if(scenario==="text-human")assert.match(JSON.stringify(human.doc.toJSON()),/Protected human/);}
   if(scenario==="rich-protected")assert.match(JSON.stringify(human.doc.toJSON()),/protected.png/);
   if(scenario.startsWith("undo-")){
    await wait(()=>JSON.stringify(human.doc.toJSON()).includes("Target!"));
    const undoBot=async()=>{
     const actor=`bot-${scenario}`,key=createHash("sha256").update(JSON.stringify([origin,scenario,actor])).digest("hex");
     const client=new Client({name:"preservation-undo",version:"1"});
     const env=Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined));
     await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("../../mcp/src/main.ts",import.meta.url))],stderr:"pipe",env:{...env,DOC_SYNC_URL:origin,DOC_SYNC_DOCUMENT:scenario,DOC_SYNC_ACTOR:actor,DOC_SYNC_DISCOVER_SCHEMA:"on",DOC_SYNC_SCHEMA:"",DOC_SYNC_JOURNAL:"on",DOC_SYNC_JOURNAL_DIR:join(dir,"missions","journals",key),DOC_SYNC_MISSION_BRIDGE:""}}));
     try{const reply=await client.callTool({name:"undo",arguments:{}});assert.equal(reply.isError,undefined,JSON.stringify(reply));}finally{await client.close();}
     await wait(()=>!JSON.stringify(human.doc.toJSON()).includes("Target!"));
    };
    const undoHuman=async()=>{human.undo();await wait(()=>human.pending.length===0);assert.doesNotMatch(JSON.stringify(human.doc.toJSON()),/Protected human/);};
    if(scenario==="undo-human-first"){await undoHuman();assert.match(JSON.stringify(human.doc.toJSON()),/Target!/);await undoBot();}
    else {await undoBot();assert.match(JSON.stringify(human.doc.toJSON()),/Protected human/);await undoHuman();}
    const final=JSON.stringify(human.doc.toJSON());assert.match(final,/"level":1/);assert.match(final,/Protected/);assert.match(final,/Target/);
   }
  }finally{human.disconnect();await transport.leave().catch(()=>undefined);}
 });
 await t.test("restart retains protected capture and conflicts on a newer human value",{skip:process.platform!=="darwin"&&process.platform!=="linux"},async()=>{
  for(const mode of ["finish","conflict","text-conflict"]){
   const document=`restart-${mode}`,stateDir=join(dir,"profiles");
   const transport=new NodeHttpTransport(document,"seed",origin),human=new SyncClient("seed",transport,{schema:DEMO_SCHEMA});human.connect();
   try{await wait(()=>human.synchronized);human.commit(human.doc.edit([{op:"insert",at:[1],content:[p("Target"),{type:"list",children:[{type:"list-item",attrs:{listType:"bullet",level:1},runs:[{text:"Protected",marks:{}}]}]}]}]).ops);await wait(()=>human.pending.length===0);}finally{human.disconnect();await transport.leave().catch(()=>undefined);}
   const profile=await createProfile(stateDir,{id:`scope-${mode}`,name:"Scoped",character:"owl",personality:"careful",role:"writer",color:"#123456"}),actor=profileActor(profile,origin,document);
   const options={url:origin,document,actor,mission:"Append one exclamation",stateDir,profileId:profile.id,maxSteps:4,planningPath:[1],protectedText:[[2,0]],protectedAttributes:[{path:[2,0],attribute:"level"}],brief:{version:1,objective:"Target complete",requirements:[{id:"target",kind:"exact_text",path:[1],text:"Target!"}]}};
   const edit={action:"insert",at:[1,6],text:"!",count:0,message:"Append"};
   const script=`import {runMission} from ${JSON.stringify(new URL("../src/runner.ts",import.meta.url).href)};let calls=0;await runMission(${JSON.stringify(options)},async()=>{if(calls++===0)return ${JSON.stringify(edit)};process.send('ready');await new Promise(()=>{});});`;
   const worker=spawn(process.execPath,["--input-type=module","-e",script],{detached:true,stdio:["ignore","ignore","pipe","ipc"]});let errors="";worker.stderr!.on("data",b=>errors+=String(b));const exited=once(worker,"exit");
   try{const [ready]=await Promise.race([once(worker,"message",{signal:AbortSignal.timeout(10000)}),exited.then(()=>{throw Error(errors||"worker exited")})]);assert.equal(ready,"ready");assert.equal(worker.exitCode,null);assert.equal(worker.signalCode,null);process.kill(-worker.pid!,"SIGKILL");await exited;}finally{if(worker.exitCode===null&&worker.signalCode===null){worker.kill("SIGKILL");await exited;}}
   const interrupted=(await listMissions(stateDir)).find(m=>m.document===document)!;assert.ok(interrupted.planningBinding);assert.equal(interrupted.preservation?.[0].value,1);
   assert.equal(interrupted.textPreservation?.[0].text,"Protected");
   if(mode!=="finish"){
    const peerTransport=new NodeHttpTransport(document,"peer",origin),peer=new SyncClient("peer",peerTransport,{schema:DEMO_SCHEMA});peer.connect();
    try{await wait(()=>peer.synchronized);peer.commit(peer.doc.edit(mode==="text-conflict"?[{op:"insert",at:[2,0,9],content:" peer"}]:[{op:"update",at:[2,0],attrs:{level:2}}]).ops);await wait(()=>peer.pending.length===0);}finally{peer.disconnect();await peerTransport.leave().catch(()=>undefined);}
   }
   let result;const deadline=Date.now()+5000;
   while(!result){try{result=await resumeMission(stateDir,interrupted.id,async input=>{assert.equal((input.document as any).blockId,interrupted.planningBinding!.blockId);assert.ok(input.lastConfirmed);return finish();});}catch(error){if(!(error instanceof Error)||!error.message.includes("Journal already has an active writer")||Date.now()>deadline)throw error;await new Promise(r=>setTimeout(r,50));}}
   assert.equal(result.status,mode==="finish"?"completed":"needs_attention",JSON.stringify(result));assert.equal(result.history.filter(x=>x.kind==="confirmed").length,1);assert.deepEqual(result.planningBinding,interrupted.planningBinding);assert.deepEqual(result.preservation,interrupted.preservation);assert.deepEqual(result.textPreservation,interrupted.textPreservation);if(mode!=="finish")assert.match(result.error!,/conflict/);
  }
 });
 }finally{if(server.exitCode===null&&server.signalCode===null){const done=once(server,"exit");server.kill("SIGTERM");await done;}await rm(dir,{recursive:true,force:true});}
});
