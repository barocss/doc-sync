import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {createServer, request} from "node:http";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {listMissions, loadMission, resumeMission, runMission} from "../src/runner.ts";
import {createProfile, profileActor} from "../src/profiles.ts";
import type {Plan} from "../src/runner.ts";
import type {Brief} from "../src/brief.ts";

const finish = (): Plan => ({action:"finish", at:[], text:"", count:0, message:"Done"});
const brief = (): Brief => ({version:1, objective:"Add the complete sentence once", requirements:[{id:"sentence", kind:"exact_text", path:[0], text:"Confirmed exactly once."},{id:"once",kind:"text_occurrences",path:[],text:"Confirmed exactly once.",count:1},{id:"order",kind:"child_types",path:[],types:["paragraph"]}]});
const wait = async (check: () => boolean) => {const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw Error("timeout");await new Promise(r=>setTimeout(r,20));}};
const stop = async (child: ReturnType<typeof spawn>) => {if(child.exitCode===null&&child.signalCode===null){const done=once(child,"exit");child.kill("SIGTERM");await done;}};

test("invalid brief is rejected before state or network work, including the CLI", async () => {
    const dir=await mkdtemp(join(tmpdir(),"bot-brief-invalid-"));
    try {
        await assert.rejects(runMission({url:"http://127.0.0.1:1",document:"invalid",actor:"invalid",mission:"Add",stateDir:dir,brief:{...brief(),version:2} as unknown as Brief},async()=>finish()),/brief/i);
        assert.deepEqual(await listMissions(dir),[]);
        const input=join(dir,"invalid.json");await writeFile(input,JSON.stringify({...brief(),requirements:[]}));
        const child=spawn(process.execPath,[fileURLToPath(new URL("../src/main.ts",import.meta.url)),"run","--url","http://127.0.0.1:1","--doc","invalid","--mission","Add","--brief",input,"--state-dir",dir],{stdio:["ignore","pipe","pipe"]});
        let errors="";child.stderr.on("data",b=>errors+=String(b));const [code]=await once(child,"exit");
        assert.equal(code,1);assert.match(errors,/brief/i);assert.deepEqual(await listMissions(dir),[]);
    } finally {await rm(dir,{recursive:true,force:true});}
});

test("authoritative finish checks reject partial text and wrong structure, and accept the complete result", {timeout:60000}, async t => {
    const dir=await mkdtemp(join(tmpdir(),"bot-brief-server-"));
    const server=spawn(process.execPath,[fileURLToPath(new URL("../../demo/server.ts",import.meta.url))],{env:{...process.env,PORT:"0",DATA_DIR:join(dir,"server"),NO_SCHEMA:""},stdio:["ignore","pipe","pipe"]});
    let errors="";server.stderr.on("data",b=>errors+=String(b));
    try {
        const origin=await new Promise<string>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(Error(errors||"server timeout")),10000);server.once("exit",()=>{clearTimeout(timer);reject(Error(errors));});server.stdout.on("data",b=>{out+=String(b);const match=out.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});});
        const stateDir=join(dir,"state");
        for (const text of ["Confirmed","Confirmed exactly once."]) await t.test(text,async()=>{
            const document=text==="Confirmed"?"partial":"complete";let calls=0;
            const original=brief();
            const result=await runMission({url:origin,document,actor:`bot-${document}`,mission:original.objective,stateDir,ephemeral:true,brief:original},async input=>{
                assert.deepEqual(input.brief,brief());
                // Neither caller nor planner may replace the stored acceptance contract.
                original.requirements.length=0;input.brief!.requirements.length=0;
                return calls++===0?{action:"insert",at:[0,0],text,count:0,message:"Inserted"}:finish();
            });
            assert.deepEqual(result.brief,brief());assert.equal(result.status,text==="Confirmed"?"needs_attention":"completed",JSON.stringify(result));
            assert.equal(result.verification?.status,text==="Confirmed"?"failed":"passed");
            assert.equal(result.completion,text==="Confirmed"?undefined:"verified");
            assert.deepEqual(await loadMission(stateDir,result.id),result);
            const authoritative=await (await fetch(`${origin}/api/docs/${document}/state`)).json() as {model:unknown};
            assert.match(JSON.stringify(authoritative.model),new RegExp(text.replaceAll(".","\\.")));
            assert.ok(result.verification?.checkedRevision);
        });
        await t.test("occurrence counts and ordered child types use authoritative persisted evidence",async()=>{
            const contract:Brief={version:1,objective:"Keep one confirmation and one heading",requirements:[{id:"once",kind:"text_occurrences",path:[],text:"Confirmed exactly once.",count:1},{id:"order",kind:"child_types",path:[],types:["paragraph","heading2"]}]};
            let calls=0;
            const result=await runMission({url:origin,document:"new-checks",actor:"new-checks",mission:contract.objective,stateDir,ephemeral:true,brief:contract},async()=>calls++===0?{action:"edit",at:[],text:"",count:0,message:"Insert requested content",editsJson:JSON.stringify([{op:"insert",at:[0,0],content:"Confirmed exactly once."},{op:"insert",at:[1],content:[{type:"heading2",runs:[{text:"Plan"}]}]}])}:finish());
            assert.equal(result.status,"completed",JSON.stringify(result));assert.equal(result.completion,"verified");assert.equal(result.verification?.status,"passed");
            assert.deepEqual(result.verification?.requirements.map(item=>item.status),["pass","pass"]);
            const restored=await loadMission(stateDir,result.id);assert.deepEqual(restored.brief,contract);assert.deepEqual(restored.verification,result.verification);
        });
        await t.test("heading text in paragraph does not prove heading placement",async()=>{
            const contract:Brief={version:1,objective:"Place heading at first node",requirements:[{id:"heading",kind:"node_type",path:[0],type:"heading2"}]};let calls=0;
            const result=await runMission({url:origin,document:"structure",actor:"structure",mission:contract.objective,stateDir,ephemeral:true,brief:contract},async()=>calls++===0?{action:"edit",at:[],text:"",count:0,message:"Inserted heading in wrong place",editsJson:JSON.stringify([{op:"insert",at:[1],content:[{type:"heading2",runs:[{text:"Plan"}]}]}])}:finish());
            assert.equal(result.status,"needs_attention");assert.equal(result.verification?.status,"failed");
        });
        await t.test("manual checks remain unchecked",async()=>{
            const result=await runMission({url:origin,document:"manual",actor:"manual",mission:"Review",stateDir,ephemeral:true,brief:{version:1,objective:"Review",requirements:[{id:"review",kind:"manual",description:"Confirm legal wording"}]}},async()=>finish());
            assert.equal(result.status,"needs_attention");assert.equal(result.verification?.status,"not_checked");
        });
        await t.test("concurrent revision prevents stale completion",async()=>{
            const transport=new NodeHttpTransport("stale","human",origin),human=new SyncClient("human",transport,{schema:DEMO_SCHEMA});human.connect();
            try {
                await wait(()=>human.synchronized);let calls=0;
                const result=await runMission({url:origin,document:"stale",actor:"stale-bot",mission:"Ensure empty first paragraph",stateDir,ephemeral:true,brief:{version:1,objective:"Ensure empty first paragraph",requirements:[{id:"empty",kind:"exact_text",path:[0],text:""}]}},async()=>{
                    if(calls++===0){human.commit(human.doc.edit([{op:"insert",at:[0,0],content:"Human"}]).ops);await wait(()=>human.pending.length===0);}
                    return finish();
                });
                assert.equal(calls,2);assert.match(result.steps[0],/changed while planning/);assert.equal(result.status,"needs_attention");assert.equal(result.verification?.status,"failed");
            } finally {human.disconnect();await transport.leave().catch(()=>undefined);}
        });
        await t.test("delayed bot stream cannot verify a stale local snapshot",async()=>{
            let hold=false,held=false;
            const proxy=createServer((req,res)=>{
                const upstream=request(`${origin}${req.url}`,{method:req.method,headers:{...req.headers,host:new URL(origin).host}},response=>{
                    res.writeHead(response.statusCode??502,response.headers);
                    response.on("data",chunk=>{if(hold&&response.headers["content-type"]?.includes("text/event-stream")){held=true;return;}res.write(chunk);});
                    response.on("end",()=>res.end());
                });
                upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on("close",()=>upstream.destroy());req.pipe(upstream);
            });proxy.listen(0,"127.0.0.1");await once(proxy,"listening");const address=proxy.address();assert.ok(address&&typeof address!=="string");
            const transport=new NodeHttpTransport("delayed","human",origin),human=new SyncClient("human",transport,{schema:DEMO_SCHEMA});human.connect();
            try {
                await wait(()=>human.synchronized);let calls=0;
                const result=await runMission({url:`http://127.0.0.1:${address.port}`,document:"delayed",actor:"delayed-bot",mission:"Keep paragraph empty",stateDir,ephemeral:true,maxSteps:2,brief:{version:1,objective:"Keep paragraph empty",requirements:[{id:"empty",kind:"exact_text",path:[0],text:""}]}},async context=>{
                    assert.doesNotMatch(JSON.stringify(context.document),/Human/);
                    if(calls++===0){hold=true;human.commit(human.doc.edit([{op:"insert",at:[0,0],content:"Human"}]).ops);await wait(()=>human.pending.length===0&&held);}
                    return finish();
                });
                assert.equal(calls,2);assert.equal(result.status,"needs_attention");assert.equal(result.completion,undefined);assert.equal(result.verification,undefined);assert.match(result.error??"",/Step limit/);assert.equal(result.steps.length,2);
            } finally {human.disconnect();await transport.leave().catch(()=>undefined);proxy.closeAllConnections();await new Promise<void>(resolve=>proxy.close(()=>resolve()));}
        });
        await t.test("legacy completion is explicitly model reported",async()=>{
            const result=await runMission({url:origin,document:"legacy",actor:"legacy",mission:"Inspect",stateDir,ephemeral:true},async()=>finish());
            assert.equal(result.status,"completed");assert.equal(result.completion,"model_reported");assert.equal(result.verification?.status,"not_checked");
        });
        await t.test("killed mission resumes with its original detached brief",{skip:(process.platform!=="darwin"&&process.platform!=="linux")},async()=>{
            const profile=await createProfile(stateDir,{id:"brief-restart",name:"Brief",character:"owl",personality:"careful",role:"writer",color:"#123456"});
            const document="restart",actor=profileActor(profile,origin,document), contract=brief();
            const input=join(dir,"brief.json");await writeFile(input,JSON.stringify(contract));
            const script=`import {readFile} from 'node:fs/promises';import {runMission} from ${JSON.stringify(new URL("../src/runner.ts",import.meta.url).href)};let calls=0;await runMission({...${JSON.stringify({url:origin,document,actor,mission:contract.objective,stateDir,profileId:profile.id,maxSteps:4})},brief:JSON.parse(await readFile(${JSON.stringify(input)},'utf8'))},async()=>{if(calls++===0)return {action:'insert',at:[0,0],text:'Confirmed exactly once.',count:0,message:'Inserted'};process.send('ready-to-kill');await new Promise(()=>{});});`;
            const worker=spawn(process.execPath,["--input-type=module","-e",script],{detached:true,stdio:["ignore","ignore","pipe","ipc"]});
            let workerErrors="";assert.ok(worker.stderr);worker.stderr.on("data",b=>workerErrors+=String(b));
            const exited=once(worker,"exit");
            try {
                // Keep the owned group leader alive until the parent kills the group.
                // A PID saved after exit is not proof of current process-group ownership.
                const [ready]=await Promise.race([once(worker,"message",{signal:AbortSignal.timeout(10000)}),exited.then(result=>{throw Error(`Worker exited before kill barrier: ${JSON.stringify(result)} ${workerErrors}`);})]);
                assert.equal(ready,"ready-to-kill");
                assert.equal(worker.exitCode,null);assert.equal(worker.signalCode,null);
                process.kill(-worker.pid!,"SIGKILL");
                const [code,signal]=await exited;assert.equal(code,null,workerErrors);assert.equal(signal,"SIGKILL");
            } finally {
                if(worker.exitCode===null&&worker.signalCode===null){worker.kill("SIGKILL");await exited;}
            }
            const interrupted=(await listMissions(stateDir)).find(m=>m.document===document)!;assert.equal(interrupted.status,"running");assert.deepEqual(interrupted.brief,contract);
            await writeFile(input,JSON.stringify({...contract,requirements:[]}));
            let resumed;
            const deadline=Date.now()+5000;
            while(!resumed){
                try {resumed=await resumeMission(stateDir,interrupted.id,async context=>{assert.deepEqual(context.brief,contract);return finish();});}
                catch(error){if(!(error instanceof Error)||!error.message.includes("Journal already has an active writer")||Date.now()>deadline)throw error;await new Promise(resolve=>setTimeout(resolve,50));}
            }
            assert.equal(resumed.id,interrupted.id);assert.equal(resumed.status,"completed",JSON.stringify(resumed));assert.equal(resumed.completion,"verified");assert.equal(resumed.verification?.status,"passed");assert.deepEqual(resumed.brief,contract);assert.equal(resumed.history.length,1);
        });
    } finally {await stop(server);await rm(dir,{recursive:true,force:true});}
});
