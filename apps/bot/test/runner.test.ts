import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm, readdir, readFile, access} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {createServer, request} from "node:http";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {listMissions, loadMission, runMission, recoverMission, resumeMission} from "../src/runner.ts";
import {createProfile,profileActor} from "../src/profiles.ts";
import type {Plan} from "../src/runner.ts";
// @ts-expect-error Demo controller is an executable JavaScript module.
import {durableBots} from "../../demo/products/durable-bots.mjs";

const wait = async (check: () => boolean) => {const deadline=Date.now()+10000;while(!check()){if(Date.now()>deadline)throw Error("timeout");await new Promise(r=>setTimeout(r,20));}};
const finish = (message: string): Plan => ({action:"finish",at:[],text:"",count:0,message});
test("bot discovers server schema, replans a stale edit and preserves a user's edit", {timeout:60000}, async () => {
    const dir=await mkdtemp(join(tmpdir(),"doc-sync-bot-test-"));
    const file=fileURLToPath(new URL("../../demo/server.ts",import.meta.url));
    const child=spawn(process.execPath,[file],{env:{...process.env,PORT:"0",DATA_DIR:join(dir,"server"),NO_SCHEMA:""},stdio:["ignore","pipe","pipe"]});
    let errors="";child.stderr.on("data",b=>errors+=String(b));
    const origin=await new Promise<string>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(Error(`server timeout ${errors}`)),10000);child.once("exit",c=>reject(Error(`server exited ${c} ${errors}`)));child.stdout.on("data",b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}})});
    const transport=new NodeHttpTransport("bot-test","human",origin),human=new SyncClient("human",transport,{schema:DEMO_SCHEMA});
    const phases: string[]=[];human.onUpdate=()=>{const expression=human.others.get("test-bot")?.expression;if(expression&&phases.at(-1)!==expression)phases.push(expression);};human.connect();
    try {
        await wait(()=>human.synchronized);
        let calls=0;
        const result=await runMission({url:origin,document:"bot-test",actor:"test-bot",mission:"Add A",stateDir:join(dir,"state"),ephemeral:true,maxSteps:4,character:"fox",personality:"careful"},async input=>{
            calls++;assert.deepEqual(input.schema,DEMO_SCHEMA);assert.equal(input.personality,"careful");
            if(calls===1){await wait(()=>human.others.get("test-bot")?.expression==="thinking");assert.equal(human.others.get("test-bot")?.character,"fox");human.commit(human.doc.edit([{op:"insert",at:[0,0],content:"H"}]).ops);await wait(()=>human.pending.length===0);return {action:"insert",at:[0,0],text:"A",count:0,message:"insert A"};}
            if(calls===2)return {action:"insert",at:[0,1],text:"A",count:0,message:"insert A"};
            return finish("Done");
        });
        assert.equal(result.status,"completed",JSON.stringify(result));assert.equal(result.character,"fox");assert.equal(result.personality,"careful");assert.equal(result.expression,"happy");assert.ok(phases.includes("thinking")&&phases.includes("editing")&&phases.includes("happy"),JSON.stringify(phases));assert.equal(calls,3);assert.match(result.steps[0],/Stale revision/);
        assert.equal(result.pending,null);assert.deepEqual((await listMissions(join(dir,"state"))).map(item=>item.id),[result.id]);assert.deepEqual(result.history.map(h=>h.kind),["stale","confirmed"]);assert.equal(result.history[1].plan.text,"A");assert.deepEqual(await loadMission(join(dir,"state"),result.id),result);
        await wait(()=>human.pending.length===0&&JSON.stringify(human.doc.toJSON()).includes("HA"));
        const server=await (await fetch(`${origin}/api/docs/bot-test/state`)).json() as {model: unknown};
        assert.equal(JSON.stringify(server.model),JSON.stringify(human.doc.toJSON()));
        let reviews=0;
        const inspected=await runMission({url:origin,document:"bot-test",actor:"review-bot",mission:"Review a range",stateDir:join(dir,"state"),ephemeral:true,maxSteps:4},async input=>{
            reviews++;
            if(reviews===1) {assert.equal(input.inspection,null);return {action:"inspect",at:[0,0],focus:[0,1],text:"",count:0,message:"Review the first character"};}
            if(reviews===2) {
                assert.deepEqual(input.inspection,{anchor:[0,0],focus:[0,1]});
                await wait(()=>human.others.get("review-bot")?.activity==="reading" && !!human.others.get("review-bot")?.focus);
                assert.equal(human.others.get("review-bot")?.expression,"focused");
                human.commit(human.doc.edit([{op:"insert",at:[0,0],content:"B"}]).ops);await wait(()=>human.pending.length===0);
                return finish("Reviewed");
            }
            assert.equal(input.inspection,null);return finish("Reviewed after refresh");
        });
        assert.equal(inspected.status,"completed",JSON.stringify(inspected));assert.equal(reviews,3);assert.equal(inspected.history.length,0);
        assert.match(JSON.stringify(human.doc.toJSON()),/BHA/);
        let plans=0;
        const structured=await runMission({url:origin,document:"bot-test",actor:"structure-bot",mission:"Add a heading and table",stateDir:join(dir,"state"),ephemeral:true,maxSteps:5},async input=>{
            plans++;
            if(plans===1){human.commit(human.doc.edit([{op:"insert",at:[0,0],content:"U"}]).ops);await wait(()=>human.pending.length===0);}
            if(plans<=2){
                assert.ok((input.schema as typeof DEMO_SCHEMA).nodes.table);
                const edits=[{op:"insert",at:[1],content:[{type:"heading2",runs:[{text:"Plan"}]},{type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"table-cell-body",children:[{type:"paragraph",runs:[{text:"Alpha"}]}]}]}]}]}]}];
                return {action:"edit",at:[],focus:[],text:"",count:0,message:"Add plan and table",editsJson:JSON.stringify(edits)};
            }
            if(plans===3) return {action:"edit",at:[],focus:[],text:"",count:0,message:"Update the cell",editsJson:JSON.stringify([{op:"insert",at:[2,0,0,0,0,5],content:"!"}])};
            return finish("Done");
        });
        assert.equal(structured.status,"completed",JSON.stringify(structured));
        assert.deepEqual(structured.history.map(entry=>entry.kind),["stale","confirmed","confirmed"]);
        await wait(()=>JSON.stringify(human.doc.toJSON()).includes("Alpha!"));
        assert.match(JSON.stringify(human.doc.toJSON()),/UBHA/);
        assert.match(JSON.stringify(human.doc.toJSON()),/Plan/);
        let repeats=0;
        const repeated=await runMission({url:origin,document:"bot-test",actor:"repeat-bot",mission:"Add one !",stateDir:join(dir,"state"),ephemeral:true,maxSteps:3},async input=>{
            if(repeats++===1){assert.deepEqual(input.lastConfirmed?.edits,[{op:"insert",at:[0,0],content:"!"}]);return {action:"edit",at:[],text:"",count:0,message:"repeat",editsJson:JSON.stringify([{content:"!",at:[0,0],op:"insert"}])};}
            return {action:"insert",at:[0,0],text:"!",count:0,message:"insert once"};
        });
        assert.equal(repeated.status,"needs_attention");assert.match(repeated.error??"",/repeated the last confirmed edit/);assert.equal(repeated.history.length,1);assert.equal(repeated.pending,null);
        await wait(()=>JSON.stringify(human.doc.toJSON()).includes("!UBHA"));

        const beforeInvalid=JSON.stringify(human.doc.toJSON());
        const invalid=await runMission({url:origin,document:"bot-test",actor:"invalid-bot",mission:"Bad edit",stateDir:join(dir,"state"),ephemeral:true},async()=>({action:"edit",at:[],text:"",count:0,message:"Invalid",editsJson:JSON.stringify([{op:"teleport",at:[0]}])}));
        assert.equal(invalid.status,"needs_attention");assert.equal(invalid.pending,null);assert.match(invalid.error??"",/Invalid structured edit/);
        assert.equal(JSON.stringify(human.doc.toJSON()),beforeInvalid);
        const reviewer=await runMission({url:origin,document:"bot-test",actor:"review-only",mission:"Review",role:"reviewer",stateDir:join(dir,"state"),ephemeral:true},async input=>{
            assert.equal(input.role,"reviewer");return {action:"insert",at:[0,0],text:"Forbidden",count:0,message:"edit"};
        });
        assert.equal(reviewer.status,"needs_attention");assert.match(reviewer.error??"",/Reviewer role cannot edit/);assert.equal(reviewer.pending,null);assert.equal(JSON.stringify(human.doc.toJSON()),beforeInvalid);
        let ready=0,release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve);
        const parallel=await Promise.all(["multi-a","multi-b"].map(actor=>{
            let calls=0;return runMission({url:origin,document:"bot-test",actor,mission:`Add ${actor}`,role:"organizer",stateDir:join(dir,"state"),ephemeral:true,maxSteps:4},async input=>{
                if(calls++===0){if(++ready===2)release();await barrier;}
                if(input.previous.some(step=>step.includes("confirmed"))||JSON.stringify(input.document).includes(actor))return finish("Done");
                const index=(input.document as {children:unknown[]}).children.length;
                return {action:"edit",at:[],text:"",count:0,message:`${actor} confirmed`,editsJson:JSON.stringify([{op:"insert",at:[index],content:[{type:"heading2",runs:[{text:actor}]}]}])};
            });
        }));
        for(const bot of parallel)assert.equal(bot.status,"completed",JSON.stringify(bot));
        assert.ok(parallel.some(bot=>bot.history.some(entry=>entry.kind==="stale")));
        await wait(()=>JSON.stringify(human.doc.toJSON()).includes("multi-a")&&JSON.stringify(human.doc.toJSON()).includes("multi-b"));


    } finally {human.disconnect();await transport.leave().catch(()=>undefined);if(child.exitCode===null&&child.signalCode===null){const exit=once(child,"exit");child.kill("SIGTERM");await exit;}await rm(dir,{recursive:true,force:true});}
});

test("bot retains a failed mission and does not treat it as completed", {timeout:30000}, async () => {
    const dir=await mkdtemp(join(tmpdir(),"doc-sync-bot-fail-"));
    try {
        const result=await runMission({url:"http://127.0.0.1:1",document:"missing",actor:"bot-a",mission:"Inspect",stateDir:dir,ephemeral:true},async()=>finish("done"));
        assert.equal(result.status,"needs_attention");assert.ok(result.error);assert.equal(result.pending,null);
        assert.deepEqual(await loadMission(dir,result.id),result);
        await assert.rejects(loadMission(dir,"../outside"),/Invalid mission ID/);
    } finally {await rm(dir,{recursive:true,force:true});}
});

test("bot discovers a different product schema from the server", {timeout:30000}, async () => {
    const dir=await mkdtemp(join(tmpdir(),"doc-sync-bot-schema-"));
    const file=fileURLToPath(new URL("../../demo/server.ts",import.meta.url));
    const child=spawn(process.execPath,[file],{env:{...process.env,PORT:"0",DATA_DIR:join(dir,"server"),DOC_PROFILE:"word",NO_SCHEMA:""},stdio:["ignore","pipe","pipe"]});
    let error="";child.stderr.on("data",b=>error+=String(b));
    try {
        const origin=await new Promise<string>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(Error(`server timeout ${error}`)),10000);child.once("exit",c=>reject(Error(`server exited ${c} ${error}`)));child.stdout.on("data",b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}})});
        const result=await runMission({url:origin,document:"word-bot",actor:"word-bot",mission:"Inspect",stateDir:join(dir,"state"),ephemeral:true},async input=>{
            assert.equal((input.schema as {root:string}).root,"word-document");
            assert.equal((input.document as {type:string}).type,"word-document");
            return finish("Inspected the Word schema");
        });
        assert.equal(result.status,"completed",JSON.stringify(result));
    } finally {if(child.exitCode===null&&child.signalCode===null){const exit=once(child,"exit");child.kill("SIGTERM");await exit;}await rm(dir,{recursive:true,force:true});}
});

for(const scenario of ['retained','cleared','unknown','repeat'] as const)test(`a killed bot and restarted server preserve another user's change (${scenario})`, {timeout:60000, skip:(process.platform!=="darwin"&&process.platform!=="linux")}, async () => {
    const dir=await mkdtemp(join(tmpdir(),"doc-sync-bot-kill-"));
    const demo=fileURLToPath(new URL("../../demo/server.ts",import.meta.url));
    const worker=fileURLToPath(new URL("./kill-worker.ts",import.meta.url));
    let child: ReturnType<typeof spawn> | undefined, server: ReturnType<typeof spawn> | undefined, proxy: ReturnType<typeof createServer> | undefined, human: SyncClient | undefined, humanTransport: NodeHttpTransport | undefined, mcp: Client | undefined;
    const stop=async(process: ReturnType<typeof spawn>|undefined, signal: NodeJS.Signals="SIGTERM")=>{if(process&&process.exitCode===null&&process.signalCode===null){const exited=once(process,"exit");process.kill(signal);await exited;}};
    const start=async()=>{
        const p=spawn(process.execPath,[demo],{env:{...process.env,PORT:"0",DATA_DIR:join(dir,"server"),NO_SCHEMA:""},stdio:["ignore","pipe","pipe"]});let errors="";p.stderr.on("data",b=>errors+=String(b));
        const origin=await new Promise<string>((resolve,reject)=>{let out="";const timer=setTimeout(()=>reject(Error(`server timeout ${errors}`)),10000);p.once("exit",c=>reject(Error(`server exited ${c} ${errors}`)));p.stdout.on("data",b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}})});
        return {p,origin};
    };
    try {
        let started=await start();server=started.p;let accepted!:()=>void;const barrier=new Promise<void>(resolve=>accepted=resolve);
        proxy=createServer((req,res)=>{
            if(scenario==='unknown'&&req.method==='POST'&&req.url?.endsWith('/conditional')){req.resume();req.on('end',accepted);return;}
            const upstream=request(`${started.origin}${req.url?.replace(/^\/profiles\/word/,"")}`,{method:req.method,headers:{...req.headers,host:new URL(started.origin).host}},response=>{
                if(req.method==="POST"&&req.url?.endsWith("/conditional")){
                    let body="";response.on("data",b=>body+=String(b));response.on("end",()=>{try{const parsed=JSON.parse(body);if(response.statusCode===200&&parsed.status==="accepted")accepted();else {res.writeHead(response.statusCode??500);res.end(body);}}catch{res.writeHead(500);res.end();}});return;
                }
                res.writeHead(response.statusCode??502,response.headers);response.pipe(res);
            });
            upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on("close",()=>upstream.destroy());req.pipe(upstream);
        });
        proxy.listen(0,"127.0.0.1");await once(proxy,"listening");const address=proxy.address();assert.ok(address&&typeof address!=="string");
        const origin=`http://127.0.0.1:${address.port}`,url=`${origin}/profiles/word`,stateDir=join(dir,"state");
        const profile=await createProfile(stateDir,{id:"kill",name:"Kill test",character:"fox",personality:"careful",role:"writer",color:"#a14418"});
        const actor=profileActor(profile,url,"kill-test");
        child=spawn(process.execPath,[worker,url,stateDir,"kill"],{stdio:["ignore","ignore","pipe"]});let workerError="";child.stderr!.on("data",b=>workerError+=String(b));
        let barrierTimer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([barrier,new Promise<never>((_,reject)=>{barrierTimer=setTimeout(()=>reject(Error(`conditional barrier timeout ${workerError}`)),15000);})]); }
        finally { if(barrierTimer)clearTimeout(barrierTimer); }
        const names=await readdir(join(dir,"state","missions"));assert.equal(names.length,1);
        const missionPath=join(dir,"state","missions",names[0]), before=JSON.parse(await readFile(missionPath,"utf8"));
        assert.equal(before.status,"running");assert.equal(before.pending.plan.text,"X");
        await stop(child,"SIGKILL");proxy.closeAllConnections();await new Promise<void>(resolve=>proxy!.close(()=>resolve()));proxy=undefined;
        const journals=await readdir(join(dir,"state","journals"));assert.equal(journals.length,1);
        const intent=JSON.parse(await readFile(join(dir,"state","journals",journals[0],"kill-test.json"),"utf8"));
        assert.equal(intent.state,"may_have_been_sent");assert.equal(intent.actor,actor);assert.equal(intent.document,"kill-test");
        assert.equal(intent.edits[0].content,"X");
        const state=await (await fetch(`${started.origin}/api/docs/kill-test/state`)).json() as {model:{children:Array<{runs:Array<{text:string}>}>}};
        assert.equal(state.model.children[0].runs.map(r=>r.text).join(""),scenario==='unknown'?'':'X');
        await stop(server);started=await start();server=started.p;
        const after=await (await fetch(`${started.origin}/api/docs/kill-test/state`)).json() as {model:{children:Array<{runs:Array<{text:string}>}>}};
        assert.equal(after.model.children[0].runs.map(r=>r.text).join(""),scenario==='unknown'?'':'X');
        const retained=JSON.parse(await readFile(missionPath,"utf8"));assert.equal(retained.status,"running");assert.equal(retained.pending.plan.text,"X");
        humanTransport=new NodeHttpTransport("kill-test","human",started.origin);human=new SyncClient("human",humanTransport,{schema:DEMO_SCHEMA});human.connect();await wait(()=>human!.synchronized);
        human.commit(human.doc.edit([{op:"insert",at:[0,scenario==='unknown'?0:1],content:"H"}]).ops);await wait(()=>human!.pending.length===0);
        // Restore the original URL, forwarding normally after the crash barrier.
        proxy=createServer((req,res)=>{const upstream=request(`${started.origin}${req.url?.replace(/^\/profiles\/word/,"")}`,{method:req.method,headers:{...req.headers,host:new URL(started.origin).host}},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on("close",()=>upstream.destroy());req.pipe(upstream);});
        proxy.listen(address.port,"127.0.0.1");await once(proxy,"listening");
        const env=Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string,string]=>entry[1]!==undefined));
        if(scenario==='unknown'){
            await assert.rejects(recoverMission(stateDir,before.id),/receipt is unknown/);
            const controller=durableBots({root:process.cwd(),stateDir,children:[]});
            const blocked=await controller.records('word','kill-test',origin);assert.equal(blocked.jobs[0].blocked,true);
            assert.ok((await loadMission(stateDir,before.id)).pending);assert.match(JSON.stringify(human.doc.toJSON()),/H/);assert.doesNotMatch(JSON.stringify(human.doc.toJSON()),/X/);
            return;
        }
        if(scenario==='cleared'){
            const prior=new Client({name:"prior-recovery",version:"1"});
            await prior.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("../../mcp/src/main.ts",import.meta.url))],stderr:"pipe",env:{...env,DOC_SYNC_URL:url,DOC_SYNC_DOCUMENT:"kill-test",DOC_SYNC_ACTOR:actor,DOC_SYNC_DISCOVER_SCHEMA:"on",DOC_SYNC_SCHEMA:"",DOC_SYNC_JOURNAL:"on",DOC_SYNC_JOURNAL_DIR:join(dir,"state","journals",journals[0])}}));
            const priorView=await prior.callTool({name:"read_document",arguments:{}});assert.equal(priorView.isError,undefined);await prior.close();
            await assert.rejects(access(join(dir,"state","journals",journals[0],"kill-test.json")),{code:"ENOENT"});
            assert.ok((await loadMission(stateDir,before.id)).pending);
        }
        const controller=durableBots({root:process.cwd(),stateDir,children:[]});
        const first=await controller.records('word','kill-test',origin);assert.equal(first.jobs[0].blocked,true);
        if(scenario==='cleared'){
            const staged=await recoverMission(stateDir,before.id);assert.equal(staged.status,'queued');assert.equal(staged.resume?.ready,true);
            assert.deepEqual(await recoverMission(stateDir,before.id),staged);
        }
        if(scenario==='repeat'){
            const repeated=await resumeMission(stateDir,before.id,async()=>({action:'insert',at:[0,0],text:'X',count:0,message:'repeat'}));
            assert.equal(repeated.status,'needs_attention');assert.match(repeated.error??'',/repeated the last confirmed edit/);
            assert.equal(JSON.stringify(human.doc.toJSON()).match(/X/g)?.length,1);assert.match(JSON.stringify(human.doc.toJSON()),/XH/);return;
        }
        let plans=0;
        const recovered=await resumeMission(stateDir,before.id,async input=>{
            plans++;assert.match(JSON.stringify(input.document),/XH/);assert.ok(input.lastConfirmed);
            return plans===1?{action:'insert',at:[0,2],text:'Y',count:0,message:'Insert Y'}:finish('done');
        });
        assert.equal(recovered.id,before.id);assert.equal(recovered.pending,null);assert.equal(recovered.status,"completed");assert.equal(recovered.history.filter(h=>h.kind==='confirmed').length,2);assert.equal(recovered.resume?.used,3);assert.equal(recovered.resume?.maxSteps,3);assert.equal(plans,2);
        const unlocked=await controller.records('word','kill-test',origin);assert.equal(unlocked.jobs[0].blocked,false);
        const again=await recoverMission(stateDir,before.id);assert.deepEqual(again,recovered);
        assert.equal(JSON.stringify(human.doc.toJSON()).match(/X/g)?.length,1);
        mcp=new Client({name:"crash-recovery-test",version:"1"});
        await mcp.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL("../../mcp/src/main.ts",import.meta.url))],stderr:"pipe",env:{...env,DOC_SYNC_URL:url,DOC_SYNC_DOCUMENT:"kill-test",DOC_SYNC_ACTOR:actor,DOC_SYNC_DISCOVER_SCHEMA:"on",DOC_SYNC_SCHEMA:"",DOC_SYNC_JOURNAL:"on",DOC_SYNC_JOURNAL_DIR:join(dir,"state","journals",journals[0])}}));
        const read=await mcp.callTool({name:"read_document",arguments:{}});assert.equal(read.isError,undefined,JSON.stringify(read));assert.equal((read.structuredContent as {recoveryRequired:boolean}).recoveryRequired,false);
        assert.match(JSON.stringify(read.structuredContent),/XHY/);
        // The mission was reconciled before the normal session removed its intent.
        await assert.rejects(access(join(dir,"state","journals",journals[0],"kill-test.json")),{code:"ENOENT"});
        const undo=await mcp.callTool({name:"undo",arguments:{}});assert.equal(undo.isError,undefined,JSON.stringify(undo));
        const undo2=await mcp.callTool({name:"undo",arguments:{}});assert.equal(undo2.isError,undefined,JSON.stringify(undo2));await wait(()=>JSON.stringify(human!.doc.toJSON()).includes('"H"'));
        assert.doesNotMatch(JSON.stringify(human.doc.toJSON()),/XH/);
        const resolved=JSON.parse(await readFile(missionPath,"utf8"));assert.equal(resolved.pending,null);
    } finally {await mcp?.close().catch(()=>{});human?.disconnect();await humanTransport?.leave().catch(()=>{});await stop(child,"SIGKILL");if(proxy){proxy.closeAllConnections();await new Promise<void>(resolve=>proxy!.close(()=>resolve()));}await stop(server);await rm(dir,{recursive:true,force:true});}
});

test("bot refuses an invalid schema fingerprint before the planner runs", {timeout:20000}, async () => {
    const dir=await mkdtemp(join(tmpdir(),"doc-sync-bot-bad-schema-"));
    const fake=createServer((_req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({schema:DEMO_SCHEMA,schemaVersion:"sha256:invalid"}));});
    fake.listen(0,"127.0.0.1");await once(fake,"listening");const address=fake.address();assert.ok(address&&typeof address!=="string");
    try {
        let calls=0;const result=await runMission({url:`http://127.0.0.1:${address.port}`,document:"bad-schema",actor:"bot-bad",mission:"Inspect",stateDir:dir,ephemeral:true},async()=>{calls++;return finish("done");});
        assert.equal(result.status,"needs_attention");assert.equal(calls,0);assert.equal(result.pending,null);
        assert.deepEqual(await loadMission(dir,result.id),result);
    } finally {fake.closeAllConnections();await new Promise<void>(resolve=>fake.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
