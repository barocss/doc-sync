import {runMission} from "../src/runner.ts";
import {loadProfile,profileActor} from "../src/profiles.ts";
const [url, stateDir,profileId] = process.argv.slice(2);
const actor=profileId?profileActor(await loadProfile(stateDir,profileId),url,"kill-test"):"kill-bot";
await runMission({url,document:"kill-test",actor,mission:"Insert X then Y",stateDir,maxSteps:3,...(profileId?{profileId}:{})}, async()=>({action:"insert",at:[0,0],text:"X",count:0,message:"Insert X"}));
