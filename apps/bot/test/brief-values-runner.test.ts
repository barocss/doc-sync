import assert from "node:assert/strict";
import {test} from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {runMission, loadMission} from "../src/runner.ts";
import type {Brief} from "../src/brief.ts";

test("authoritative completion verifies URL and mark rather than matching text alone", {timeout:60000}, async t => {
    const dir = await mkdtemp(join(tmpdir(), "brief-values-"));
    const server = spawn(process.execPath, [fileURLToPath(new URL("../../demo/server.ts", import.meta.url))], {
        env: {...process.env, PORT:"0", DATA_DIR:join(dir,"server"), NO_SCHEMA:""}, stdio:["ignore","pipe","pipe"],
    });
    let errors = ""; server.stderr.on("data", bytes => errors += String(bytes));
    try {
        const origin = await new Promise<string>((resolve, reject) => {
            let output = "";
            const timer = setTimeout(() => reject(Error(errors || "server timeout")),10000);
            server.once("exit", () => {clearTimeout(timer); reject(Error(errors));});
            server.stdout.on("data", bytes => {output += String(bytes); const match = output.match(/http:\/\/localhost:(\d+)(?=\r?\n)/); if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});
        });
        for (const [name,url,bold,expected] of [
            ["correct","https://example.com",true,"completed"],
            ["wrong-url","https://wrong.example",true,"needs_attention"],
            ["wrong-mark","https://example.com",false,"needs_attention"],
        ] as const) await t.test(name, async () => {
            const contract:Brief = {version:1,objective:"Insert the requested marked link",requirements:[
                {id:"text",kind:"exact_text",path:[1],text:"Same text"},
                {id:"url",kind:"attribute_equals",path:[1],runPath:[0],attribute:["url"],value:"https://example.com"},
                {id:"bold",kind:"mark_equals",path:[1],runPath:[0,0],mark:"bold",value:true},
            ]};
            let calls = 0;
            const result = await runMission({url:origin,document:name,actor:`bot-${name}`,mission:contract.objective,stateDir:join(dir,"missions"),ephemeral:true,brief:contract},async()=>calls++ === 0 ? {
                action:"edit",at:[],text:"",count:0,message:"Insert link",editsJson:JSON.stringify([{op:"insert",at:[1],content:[{type:"paragraph",runs:[{type:"inline-hyperlink",attrs:{url},runs:[{text:"Same text",marks:{bold}}]}]}]}]),
            } : {action:"finish",at:[],text:"",count:0,message:"Done"});
            assert.equal(result.status, expected, JSON.stringify(result));
            assert.equal(result.verification?.status, expected === "completed" ? "passed" : "failed");
            assert.equal(result.verification?.requirements[0].status,"pass");
            assert.ok(result.verification?.checkedRevision);
            assert.deepEqual((await loadMission(join(dir,"missions"),result.id)).verification,result.verification);
        });
    } finally {
        if(server.exitCode===null&&server.signalCode===null){const done=once(server,"exit");server.kill("SIGTERM");await done;}
        await rm(dir,{recursive:true,force:true});
    }
});
