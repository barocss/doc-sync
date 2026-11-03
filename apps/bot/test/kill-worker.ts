import {runMission} from "../src/runner.ts";
import {loadProfile,profileActor} from "../src/profiles.ts";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
// Forward the nested MCP process's stderr in this crash-test fixture only.
// The production runner drains it without exposing document data in logs.
const start=StdioClientTransport.prototype.start;
StdioClientTransport.prototype.start=function() {
    this.stderr?.on("data",chunk=>process.stderr.write(chunk));
    return start.call(this);
};
const [url, stateDir,profileId] = process.argv.slice(2);
const actor=profileId?profileActor(await loadProfile(stateDir,profileId),url,"kill-test"):"kill-bot";
const result=await runMission({url,document:"kill-test",actor,mission:"Insert X then Y",stateDir,maxSteps:3,...(profileId?{profileId}:{})}, async()=>({action:"insert",at:[0,0],text:"X",count:0,message:"Insert X"}));
console.error(`Crash-test mission returned before process kill: ${JSON.stringify({status:result.status,error:result.error,pending:!!result.pending})}`);
process.exitCode=1;
