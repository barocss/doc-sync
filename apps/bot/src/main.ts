import {proposalCommand} from "./proposals.ts";
import {readFile} from "node:fs/promises";
import {parseBrief} from "./brief.ts";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {ReviewWatch} from "./watch.ts";
import {resolve} from "node:path";
import {codexPlanner} from "./codex.ts";
import {listMissions, loadMission, runMission, recoverMission, resumeMission} from "./runner.ts";
import {createProfile, listProfiles, loadProfile, profileActor, profileUrl} from "./profiles.ts";
import type {ProfileInput} from "./profiles.ts";

const PROPOSAL_CREATE_OPTIONS = Object.freeze(["--input"]);
const PROPOSAL_DECIDE_OPTIONS = Object.freeze(["--id", "--input"]);
const PROPOSAL_INSPECT_OPTIONS = Object.freeze(["--id"]);
const WATCH_OPTIONS = Object.freeze(["--url", "--doc", "--mission", "--state-dir", "--model", "--interval", "--max-runs"]);
const RUN_OPTIONS = Object.freeze(["--url", "--doc", "--actor", "--name", "--color", "--mission", "--state-dir", "--max-steps", "--ephemeral", "--model", "--character", "--personality", "--role", "--profile", "--brief"]);
const PROFILE_CREATE_OPTIONS = Object.freeze(["--id", "--name", "--character", "--personality", "--role", "--color", "--state-dir"]);
const RESUME_OPTIONS = Object.freeze(["--id","--state-dir","--model"]);
const ID_STATE_OPTIONS = Object.freeze(["--id", "--state-dir"]);
const STATE_OPTIONS = Object.freeze(["--state-dir"]);
const PROFILE_OVERRIDE_OPTIONS = Object.freeze(["--actor","--name","--color","--character","--personality","--role"]);

const PROPOSAL_DECISION_COMMANDS = Object.freeze(["proposal-reject", "proposal-accept", "proposal-reconcile"]);
const BOOLEAN_OPTION_VALUES = Object.freeze(["true", "false"]);
const REQUIRED_PROFILE_OPTIONS = Object.freeze(["--id", "--name", "--character", "--personality", "--role", "--color"]);


async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const options = new Map<string, string>();
    for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i], value = rest[i + 1];
        if (!key?.startsWith("--") || value === undefined || options.has(key)) throw new Error("Use unique --option value pairs");
        options.set(key, value);
    }
    const permitted = command?.startsWith("proposal-") ? new Set(["--endpoint", "--token-env", ...(command === "proposal-create" ? PROPOSAL_CREATE_OPTIONS : PROPOSAL_DECISION_COMMANDS.includes(command) ? PROPOSAL_DECIDE_OPTIONS : command === "proposal-inspect" ? PROPOSAL_INSPECT_OPTIONS : [])]) : command === "watch" ? new Set(WATCH_OPTIONS) : command === "run" ? new Set(RUN_OPTIONS) : command === "profile-create" ? new Set(PROFILE_CREATE_OPTIONS) : command === "resume" ? new Set(RESUME_OPTIONS) : command === "profile-show" || command === "inspect" || command === "recover" ? new Set(ID_STATE_OPTIONS) : command === "profile-list" || command === "list" ? new Set(STATE_OPTIONS) : new Set<string>();
    for (const key of options.keys()) if (!permitted.has(key)) throw new Error(`Unknown option: ${key}`);
    if (command?.startsWith("proposal-")) { console.log(JSON.stringify(await proposalCommand(command, options), null, 2)); return; }
    if (options.has("--ephemeral") && !BOOLEAN_OPTION_VALUES.includes(options.get("--ephemeral")!)) throw new Error("--ephemeral must be true or false");
    const stateDir = resolve(process.env.INIT_CWD ?? process.cwd(), options.get("--state-dir") ?? ".doc-sync-bots");
    if (command === "profile-create") {
        if (REQUIRED_PROFILE_OPTIONS.some(field => !options.get(field))) throw new Error("profile-create requires --id, --name, --character, --personality, --role and --color");
        console.log(JSON.stringify(await createProfile(stateDir, {id:options.get("--id")!,name:options.get("--name")!,character:options.get("--character") as ProfileInput["character"],personality:options.get("--personality") as ProfileInput["personality"],role:options.get("--role") as ProfileInput["role"],color:options.get("--color")!}),null,2));return;
    }
    if (command === "profile-list") {console.log(JSON.stringify(await listProfiles(stateDir),null,2));return;}
    if (command === "profile-show") {const id=options.get("--id");if(!id)throw new Error("profile-show requires --id");console.log(JSON.stringify(await loadProfile(stateDir,id),null,2));return;}
    if (command === "list") {console.log(JSON.stringify(await listMissions(stateDir), null, 2)); return;}
    if (command === "recover") {const id=options.get("--id");if(!id)throw new Error("recover requires --id");console.log(JSON.stringify(await recoverMission(stateDir,id),null,2));return;}
    if (command === "resume") {const id=options.get("--id");if(!id)throw new Error("resume requires --id");const result=await resumeMission(stateDir,id,codexPlanner({model:options.get("--model")}));console.log(JSON.stringify(result,null,2));if(result.status!=="completed")process.exitCode=1;return;}
    if (command === "inspect") {
        const id = options.get("--id"); if (!id) throw new Error("inspect requires --id");
        console.log(JSON.stringify(await loadMission(stateDir, id), null, 2)); return;
    }
    if (command === "watch") {
        const url = options.get("--url"), document = options.get("--doc"), mission = options.get("--mission");
        if (!url || !document || !mission?.trim()) throw new Error("watch requires --url, --doc and --mission");
        const interval = Number(options.get("--interval") ?? "10"), maxRuns = Number(options.get("--max-runs") ?? "5");
        if (!Number.isSafeInteger(interval) || interval < 5 || interval > 3600) throw new Error("Interval must be 5–3600 seconds");
        const actor = `bot-${randomUUID()}`, transport = new NodeHttpTransport(document, actor, url);
        const watcher = new ReviewWatch(() => transport.getRecoveryState(), async ({from, to}) => {
            const result = await runMission({url, document, mission, actor, stateDir, ephemeral: true, role: "reviewer", maxSteps: 4}, codexPlanner({model:options.get("--model")}));
            console.log(JSON.stringify({event:"review", from, to, missionId:result.id, status:result.status, result:result.result, error:result.error}));
            return result;
        }, maxRuns);
        const abort = new AbortController();
        const stop = () => { watcher.stop(); abort.abort(); };
        process.once("SIGINT", stop); process.once("SIGTERM", stop);
        try {
            await watcher.poll();
            console.log(JSON.stringify({event:"watching", document, interval, maxRuns}));
            while (!watcher.done) {
                try { await delay(interval * 1000, undefined, {signal: abort.signal}); }
                catch (error) { if (!abort.signal.aborted) throw error; }
                if (!watcher.done) await watcher.poll();
            }
        } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
        return;
    }
    if (command !== "run") throw new Error("Use run, list or inspect. See apps/bot/README.md.");
    const url = options.get("--url"), document = options.get("--doc"), mission = options.get("--mission");
    if (!url || !document || !mission) throw new Error("run requires --url, --doc and --mission");
    const briefFile = options.get("--brief");
    const brief = briefFile !== undefined ? parseBrief(JSON.parse(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), briefFile), "utf8"))) : undefined;
    const profileId=options.get("--profile");
    let configured: Awaited<ReturnType<typeof loadProfile>> | undefined;
    let actualUrl=url;
    if(profileId){
        if(options.get("--ephemeral")==="true")throw new Error("A profile requires durable MCP recovery; ephemeral mode is not supported");
        if(PROFILE_OVERRIDE_OPTIONS.some(key=>options.has(key)))throw new Error("Profile identity fields cannot be overridden for a mission");
        configured=await loadProfile(stateDir,profileId);actualUrl=profileUrl(url);
    }
    const actor = configured ? profileActor(configured,actualUrl,document) : options.get("--actor") ?? `bot-${randomUUID()}`;
    const result = await runMission({url:actualUrl, document, mission, brief, actor, stateDir, profileId:configured?.id,
        ephemeral: options.get("--ephemeral") === "true", maxSteps: Number(options.get("--max-steps") ?? "4"),
        name: configured?.name ?? options.get("--name"), color: configured?.color ?? options.get("--color"), character: (configured?.character ?? options.get("--character")) as "cat" | "fox" | "owl" | "robot" | undefined,
        personality: (configured?.personality ?? options.get("--personality")) as "curious" | "careful" | "creative" | "concise" | undefined,
        role: (configured?.role ?? options.get("--role")) as "writer" | "reviewer" | "organizer" | undefined},
        codexPlanner({model: options.get("--model")}));
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "completed") process.exitCode = 1;
}
main().catch(error => {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;});
