import {randomUUID, createHash} from "node:crypto";
import {mkdir, open, readFile, readdir, rename, rm} from "node:fs/promises";
import {resolve, join} from "node:path";
import {fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {schemaVersion} from "@barocss/doc-sync";
import type {Schema, EditOp} from "@barocss/doc-sync";
import type {BotCharacter, BotExpression, BotActivity} from "@barocss/doc-sync/sync";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {claimProfile,loadProfile,profileActor,profileUrl} from "./profiles.ts";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {IntentJournal} from "../../mcp/src/journal.ts";
import {DocumentSession} from "../../mcp/src/session.ts";
import {parseBrief, verifyBrief} from "./brief.ts";
import type {Brief, VerificationReport} from "./brief.ts";

type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};
type View = {document: unknown; revision: Revision | null; pending: number; conditionalPending: boolean; recoveryRequired: boolean; sessionOnline: boolean};
export type Plan = {action: "insert" | "delete" | "edit" | "inspect" | "finish" | "needs_attention"; editsJson?: string; at: number[]; focus?: number[]; text: string; count: number; message: string};
export type Role = "writer" | "reviewer" | "organizer";
export type Personality = "curious" | "careful" | "creative" | "concise";
export type Planner = (input: {mission: string; brief?: Brief; personality: Personality; role: Role; schema: unknown; document: unknown; revision: Revision; previous: string[]; lastConfirmed: {edits: EditOp[]; revision: Revision} | null; inspection: {anchor: number[]; focus: number[]} | null}) => Promise<Plan>;
export type BotOptions = {brief?: Brief; url: string; document: string; actor: string; mission: string; stateDir: string; maxSteps?: number; ephemeral?: boolean; name?: string; color?: string; character?: BotCharacter; personality?: Personality; role?: Role; profileId?: string};
export type Mission = {brief?: Brief; completion?: "verified" | "model_reported"; verification?: VerificationReport | {version: 1; status: "not_checked"; checkedRevision: Revision; requirements: []; reason: string}; id: string; profileId?: string; recoveryProtocol?: 1; resume?: {version:1; maxSteps:number; used:number; ready:boolean}; url: string; document: string; actor: string; mission: string; name: string; color: string; character: BotCharacter; personality: Personality; role: Role; expression: BotExpression; status: "queued" | "running" | "completed" | "needs_attention"; createdAt: string; updatedAt: string; steps: string[]; history: Array<{kind: "confirmed" | "stale"; base: Revision; plan: Plan; revision?: Revision}>; pending: {revision: Revision; plan: Plan; stepId?: string} | null; result?: string; error?: string};

const mcpFile = fileURLToPath(new URL("../../mcp/src/main.ts", import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
const validateId = (value: string, label: string) => {if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error(`Invalid ${label}`);};

/** Keep only a bounded line prefix, then retain only a known startup phase. */
function startupProvenance() {
    const phases = new Set(["input", "schema-import", "schema-discovery", "journal-open", "journal-read", "session-create", "session-start", "stdio-connect", "ready"]);
    let prefix = "", phase: string | undefined, active = true;
    const inspect = () => {
        const match = /^MCP startup failure \[([a-z-]+)\]: /.exec(prefix);
        if (!phase && match && phases.has(match[1])) phase = match[1];
        prefix = "";
    };
    return {
        consume(chunk: Buffer) {
            if (!active || phase) return;
            let start = 0;
            while (start < chunk.length) {
                const newline = chunk.indexOf(10, start), end = newline < 0 ? chunk.length : newline;
                const remaining = 96 - prefix.length;
                if (remaining > 0) prefix += chunk.subarray(start, Math.min(end, start + remaining)).toString("latin1");
                if (newline < 0) break;
                inspect();
                if (phase) break;
                start = newline + 1;
            }
        },
        finish() { inspect(); active = false; return phase; },
    };
}

/** Atomic durable replacement. A failed or interrupted write is not treated as an acknowledgement. */
async function save(path: string, state: Mission): Promise<void> {
    const dir = resolve(path, ".."), temp = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temp, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(state, null, 2) + "\n"); await handle.sync(); }
    finally { await handle.close(); }
    try {
        await rename(temp, path);
        const directory = await open(dir, "r");
        try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) { await rm(temp, {force: true}).catch(() => undefined); throw error; }
}
export async function loadMission(stateDir: string, id: string): Promise<Mission> {
    validateId(id, "mission ID");
    return JSON.parse(await readFile(join(resolve(stateDir), "missions", `${id}.json`), "utf8")) as Mission;
}
export async function listMissions(stateDir: string): Promise<Mission[]> {
    let names: string[];
    try { names = await readdir(join(resolve(stateDir), "missions")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const ids = names.filter(name => /^[0-9a-f-]+\.json$/i.test(name)).map(name => name.slice(0, -5));
    return (await Promise.all(ids.map(id => loadMission(stateDir, id)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function checkPlan(value: Plan): void {
    if (!value || !["insert", "delete", "edit", "inspect", "finish", "needs_attention"].includes(value.action) || !Array.isArray(value.at) || value.at.length > 64 ||
        value.at.some(i => !Number.isSafeInteger(i) || i < 0) || typeof value.text !== "string" || value.text.length > 512 ||
        !Number.isSafeInteger(value.count) || value.count < 0 || value.count > 512 || typeof value.message !== "string" || value.message.length > 4000) throw new Error("Invalid or oversized model plan");
    if (!(["finish", "needs_attention", "edit"] as string[]).includes(value.action) && value.at.length < 2) throw new Error("A text edit needs a valid model position");
    if (value.action === "inspect" && (!Array.isArray(value.focus) || value.focus.length < 2 || value.focus.length > 64 || value.focus.some(i => !Number.isSafeInteger(i) || i < 0) || JSON.stringify(value.at) === JSON.stringify(value.focus))) throw new Error("An inspection needs a valid selection");
    if (value.action === "insert" && !value.text) throw new Error("An insertion needs text");
    if (value.action === "delete" && !value.count) throw new Error("A deletion needs a positive count");
}

/** Parse an untrusted model plan before it enters the durable pending state. */
function structuredEdits(plan: Plan): EditOp[] {
    if (typeof plan.editsJson !== "string" || Buffer.byteLength(plan.editsJson, "utf8") > 64 * 1024) throw new Error("Structured edit plan must be JSON of at most 64 KiB");
    let value: unknown;
    try { value = JSON.parse(plan.editsJson); } catch { throw new Error("Structured edit plan is not valid JSON"); }
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error("Structured edit plan must contain 1–20 edits");
    const path = (v: unknown) => Array.isArray(v) && v.length >= 1 && v.length <= 64 && v.every(i => Number.isSafeInteger(i) && i >= 0);
    const object = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
    for (const item of value) {
        if (!object(item) || !path(item.at)) throw new Error("Invalid structured edit path");
        const keys: Record<string, string[]> = {insert: ["op", "at", "content"], delete: ["op", "at", "count"], update: ["op", "at", "attrs", "length"], split: ["op", "at"], merge: ["op", "at"], move: ["op", "at", "from"]};
        if (typeof item.op !== "string" || !Object.hasOwn(keys, item.op) || Object.keys(item).some(k => !keys[item.op].includes(k))) throw new Error("Invalid structured edit operation");
        if (item.op === "insert" && !(typeof item.content === "string" || (Array.isArray(item.content) && item.content.length > 0 && item.content.every(object)))) throw new Error("Invalid insert content");
        if (item.op === "delete" && (!Number.isSafeInteger(item.count) || item.count < 1)) throw new Error("Invalid delete count");
        if (item.op === "update" && (!object(item.attrs) || (item.length !== undefined && (!Number.isSafeInteger(item.length) || item.length < 0)))) throw new Error("Invalid update attributes");
        if (item.op === "move" && !path(item.from)) throw new Error("Invalid move source");
    }
    return value as EditOp[];
}

function editFingerprint(edits: EditOp[]): string {
    return JSON.stringify(edits, (_key, value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    });
}

function planEdits(plan:Plan):EditOp[] {
    if(plan.action==="edit")return structuredEdits(plan);
    if(plan.action==="insert")return [{op:"insert",at:plan.at,content:plan.text}];
    if(plan.action==="delete")return [{op:"delete",at:plan.at,count:plan.count}];
    throw Error("Pending step is not an edit");
}

/** Reconcile a claimed mission without replaying or replanning any edit. */
export async function recoverMission(stateDir:string,id:string):Promise<Mission> {
    const initial=await loadMission(stateDir,id);
    if(initial.brief !== undefined)parseBrief(initial.brief);
    if(initial.recoveryProtocol!==1 || !initial.profileId) throw Error("Legacy mission requires manual recovery inspection");
    const profile=await loadProfile(stateDir,initial.profileId),url=profileUrl(initial.url);
    if(url!==initial.url || profileActor(profile,url,initial.document)!==initial.actor)throw Error("Mission identity does not match its profile");
    const release=await claimProfile(stateDir,initial.actor);
    try {
        const state=await loadMission(stateDir,id);
        if(state.brief !== undefined)parseBrief(state.brief);
        if(state.recoveryProtocol!==1 || state.profileId!==profile.id || state.actor!==initial.actor || state.url!==url || state.document!==initial.document)throw Error("Mission identity changed");
        if(state.resume?.ready && !state.pending && state.status==="queued")return state;
        if(!state.pending && state.status!=="running" && state.status!=="queued")return state;
        const key=createHash("sha256").update(JSON.stringify([url,state.document,state.actor])).digest("hex");
        const path=join(resolve(stateDir),"journals",key,`${state.document}.json`);
        const journal=await IntentJournal.open(path,{document:state.document,actor:state.actor});
        let session:DocumentSession | undefined,settled=false;
        const transport=new NodeHttpTransport(state.document,state.actor,url);
        try {
            const stored=await journal.read();
            let evidence:Awaited<ReturnType<IntentJournal["read"]>>=null;
            if(state.pending) {
                const step=state.pending.stepId;
                if(!step || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(step))throw Error("Mission step has no valid recovery identity");
                const bridge=await IntentJournal.open(join(resolve(stateDir),"mission-evidence",id,`${step}.json`),{document:state.document,actor:state.actor});
                try {evidence=await bridge.read();} finally {await bridge.close();}
                if(evidence) {
                    if(JSON.stringify(evidence.base)!==JSON.stringify(state.pending.revision) || editFingerprint(evidence.edits)!==editFingerprint(planEdits(state.pending.plan)))throw Error("Mission step does not match its recovery evidence");
                    if(stored && stored.recordDigest!==evidence.recordDigest)throw Error("Journal does not match the mission step");
                    const receipt=await transport.getRecoveryReceipt(evidence.generation,evidence.base,evidence.change);
                    if(receipt.status!=="accepted")throw Error("Mission edit receipt is unknown");
                } else if(stored) throw Error("A journal exists without matching mission evidence");
            }
            const schema=await transport.getSchema();if(!schema.schema||!schema.schemaVersion)throw Error("Server schema is unavailable");
            const checkpoint=await journal.readCheckpoint();
            session=new DocumentSession(state.actor,transport,stored?.schema??checkpoint?.schema??schema.schema,10000,journal);
            await session.start();
            const view=await session.read();
            if(!view.sessionOnline || !view.revision || view.pending || view.conditionalPending || view.recoveryRequired)throw Error("Recovered session is not settled");
            settled=true;
            if(evidence) {
                const restored=await journal.readCheckpoint();
                if(!restored || restored.generation!==evidence.generation || restored.sourceIntentDigest!==evidence.recordDigest)throw Error("Recovered checkpoint does not prove the mission edit");
                state.history.push({kind:"confirmed",base:state.pending!.revision,plan:state.pending!.plan,revision:view.revision});
                state.steps.push("Recovered the confirmed edit without resubmission.");
            } else if(state.pending) state.steps.push("The interrupted edit was not submitted.");
            state.pending=null;
            if(state.resume?.version===1 && Number.isInteger(state.resume.maxSteps) && state.resume.maxSteps>=1 && state.resume.maxSteps<=20 && Number.isInteger(state.resume.used) && state.resume.used>=0 && state.resume.used<state.resume.maxSteps) {
                state.resume.ready=true;state.status="queued";state.expression="thinking";delete state.error;
            } else {state.status="needs_attention";state.expression="concerned";state.error="The interrupted task was recovered. Review its progress before starting another task.";}
            state.updatedAt=new Date().toISOString();
            await save(join(resolve(stateDir),"missions",`${id}.json`),state);
            return state;
        } finally {if(session)await session.close();else await journal.close();if(settled)await transport.leave().catch(()=>undefined);}
    } finally {await release();}
}

/** Reconcile first, then continue the same bounded mission while holding its profile claim. */
export async function resumeMission(stateDir:string,id:string,planner:Planner):Promise<Mission>{
    const recovered=await recoverMission(stateDir,id);
    if(!recovered.resume?.ready || recovered.status!=="queued" || recovered.pending)return recovered;
    const release=await claimProfile(stateDir,recovered.actor);
    try {
        const state=await loadMission(stateDir,id),profile=await loadProfile(stateDir,recovered.profileId!);
        if(state.actor!==recovered.actor||state.profileId!==profile.id||state.url!==recovered.url||state.document!==recovered.document||profileActor(profile,state.url,state.document)!==state.actor||!state.resume?.ready||state.status!=="queued"||state.pending)throw Error("Mission changed before continuation");
        const others=await listMissions(stateDir);
        if(others.some(m=>m.id!==id&&m.profileId===state.profileId&&m.document===state.document&&m.url===state.url&&(m.pending||m.status==="running"||m.status==="queued")))throw Error("Another task requires recovery inspection");
        return await runMissionClaimed({url:state.url,document:state.document,actor:state.actor,mission:state.mission,brief:state.brief,stateDir,profileId:state.profileId,maxSteps:state.resume.maxSteps,name:state.name,color:state.color,character:state.character,personality:state.personality,role:state.role},planner,state);
    } finally {await release();}
}

/** One bounded, user-requested mission; uncertain steps are retained for inspection, never replayed automatically. */
export async function runMission(options: BotOptions, planner: Planner): Promise<Mission> {
    // Reject invalid requirements before creating state, claiming a profile, or starting a session.
    options = {...options, ...(options.brief !== undefined ? {brief: parseBrief(options.brief)} : {})};
    if (!options.profileId) return runMissionClaimed(options, planner);
    if (options.ephemeral) throw new Error("A profile requires durable recovery");
    const profile=await loadProfile(options.stateDir,options.profileId);
    const url=profileUrl(options.url);
    if (profileActor(profile,url,options.document)!==options.actor || url!==options.url) throw new Error("Profile actor or server URL does not match");
    const release=await claimProfile(options.stateDir,options.actor);
    try {
        const missions=await listMissions(options.stateDir);
        if (missions.some(m=>m.profileId===profile.id && m.url===url && m.document===options.document && (m.pending || m.status==="running" || m.status==="queued"))) throw new Error("A previous task requires recovery inspection before another task");
        return await runMissionClaimed(options,planner);
    } finally {await release();}
}

async function runMissionClaimed(options: BotOptions, planner: Planner, resumed?: Mission): Promise<Mission> {
    const {url, document, actor, mission} = options;
    const brief = resumed?.brief !== undefined ? parseBrief(resumed.brief) : options.brief !== undefined ? parseBrief(options.brief) : undefined;
    validateId(document, "document ID"); validateId(actor, "actor ID");
    const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid server URL");
    if (!mission.trim() || mission.length > 4000) throw new Error("Mission must contain 1–4000 characters");
    const maxSteps = options.maxSteps ?? 4;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 20) throw new Error("maxSteps must be 1–20");
    const variants: BotCharacter[] = ["cat", "fox", "owl", "robot"];
    const personalities: Personality[] = ["curious", "careful", "creative", "concise"];
    const identity = createHash("sha256").update(actor).digest();
    const character = options.character ?? variants[identity[0] % variants.length];
    const personality = options.personality ?? personalities[identity[1] % personalities.length];
    const role = options.role ?? "writer";
    if (!["writer", "reviewer", "organizer"].includes(role)) throw new Error("Invalid bot role");
    if (!variants.includes(character) || !personalities.includes(personality)) throw new Error("Invalid bot character or personality");
    const colors = ["#7c3aed", "#a14418", "#036b58", "#175bb5", "#b12b62", "#79541b"];
    const color = options.color ?? colors[identity[2] % colors.length], name = options.name ?? actor;
    if (!/^#[0-9a-f]{6}$/i.test(color) || !name.trim() || name.length > 80) throw new Error("Invalid bot name or color");
    const directory = join(resolve(options.stateDir), "missions"); await mkdir(directory, {recursive: true, mode: 0o700});
    const id = resumed?.id ?? randomUUID(), path = join(directory, `${id}.json`), now = new Date().toISOString();
    const state: Mission = resumed ?? {id, ...(brief ? {brief} : {}), ...(options.profileId ? {profileId: options.profileId,recoveryProtocol:1 as const,resume:{version:1 as const,maxSteps,used:0,ready:false}} : {}), url, document, actor, mission, name, color, character, personality, role, expression: "thinking", status: "queued", createdAt: now, updatedAt: now, steps: [], history: [], pending: null};
    const persist = async () => {state.updatedAt = new Date().toISOString(); await save(path, state);};
    await persist();
    let client: Client | null = null;
    let reportConcern: (() => Promise<void>) | undefined;
    try {
        state.status = "running"; if(state.resume)state.resume.ready=false;await persist();
        const key = createHash("sha256").update(JSON.stringify([url, document, actor])).digest("hex");
        const journal = join(resolve(options.stateDir), "journals", key);
        const transport = new StdioClientTransport({command: process.execPath, args: [mcpFile], stderr: "pipe", env: {...env,
            DOC_SYNC_URL: url, DOC_SYNC_DOCUMENT: document, DOC_SYNC_ACTOR: actor, DOC_SYNC_DISCOVER_SCHEMA: "on",
            DOC_SYNC_SCHEMA: "", DOC_SYNC_JOURNAL: options.ephemeral ? "off" : "on", DOC_SYNC_JOURNAL_DIR: journal,
            DOC_SYNC_MISSION_BRIDGE: options.profileId ? join(resolve(options.stateDir),"mission-evidence",id) : ""}});
        // Drain child stderr to prevent a blocked protocol process; do not expose document data in logs.
        const provenance = startupProvenance();
        transport.stderr?.on("data", (chunk: Buffer) => provenance.consume(chunk));
        client = new Client({name: `bot-${id}`, version: "0.0.0"});
        try { await client.connect(transport); }
        catch (error) {
            const phase = provenance.finish();
            if (phase) throw new Error(`${error instanceof Error ? error.message : String(error)} (MCP startup phase: ${phase})`, {cause: error});
            throw error;
        } finally { provenance.finish(); }
        const call = async (tool: string, args: Record<string, unknown> = {}) => {
            const reply = await client!.callTool({name: tool, arguments: args}) as {isError?: boolean; content?: Array<{type: string; text?: string}>; structuredContent?: Record<string, unknown>};
            if (reply.isError) throw new Error(reply.content?.map(block => block.type === "text" ? block.text : "").join(" ") || `${tool} failed`);
            return reply.structuredContent as Record<string, unknown>;
        };
        const publish = async (base: Revision, anchor: number[] | null, expression: BotExpression, activity: BotActivity, focus: number[] | null = null) => {
            try { await call("set_presence", {base, name, color, anchor, focus, character, expression, activity}); } catch { /* Transient presence has no delivery guarantee. */ }
        };
        reportConcern = async () => {
            const current = await call("read_document") as View;
            if (current.revision && current.sessionOnline && !current.pending && !current.conditionalPending && !current.recoveryRequired) await publish(current.revision, null, "concerned", "needs_attention");
        };
        const verified = await call("get_schema"), server = await call("get_server_schema");
        if (verified.verifiedAgainstServer !== true || !server.schema || typeof server.schemaVersion !== "string" ||
            !verified.schema || schemaVersion(verified.schema as Schema) !== server.schemaVersion) throw new Error("Server schema is not verified or has changed");
        const prior=[...state.history].reverse().find(entry=>entry.kind==="confirmed"&&entry.revision);
        let lastConfirmed: {edits: EditOp[]; revision: Revision} | null = prior ? {edits:planEdits(prior.plan),revision:prior.revision!} : null;
        let resumedGuard=!!resumed&&!!lastConfirmed;
        let inspection: {anchor: number[]; focus: number[]; revision: Revision} | null = null;
        for (let i = state.resume?.used ?? 0; i < maxSteps; i++) {
            const view = await call("read_document") as View;
            if (!view.revision || !view.sessionOnline || view.pending || view.conditionalPending || view.recoveryRequired || view.revision.schemaVersion !== server.schemaVersion) throw new Error("Session is not settled or schema changed; inspect recovery before proceeding");
            if (inspection && JSON.stringify(inspection.revision) !== JSON.stringify(view.revision)) inspection = null;
            state.expression = inspection ? "focused" : "thinking";if(state.resume)state.resume.used=i+1;await persist();
            // Whole-document context has no implied caret. A range is shown only when explicitly requested.
            await publish(view.revision, inspection?.anchor ?? null, inspection ? "focused" : "thinking", "reading", inspection?.focus ?? null);
            const plan = await planner({mission, ...(brief ? {brief: structuredClone(brief)} : {}), personality, role, schema: server.schema, document: view.document, revision: view.revision, previous: [...state.steps], lastConfirmed, inspection: inspection ? {anchor: inspection.anchor, focus: inspection.focus} : null});
            checkPlan(plan);
            if (role === "reviewer" && ["insert", "delete", "edit"].includes(plan.action)) throw new Error("Reviewer role cannot edit the document");
            if (plan.action === "inspect") {
                const focus = plan.focus!;
                // Validate both endpoints against the same revision before displaying the selection.
                await call("set_presence", {base: view.revision, name, color, anchor: plan.at, focus, character, expression: "focused", activity: "reading"});
                inspection = {anchor: plan.at, focus, revision: view.revision};
                state.expression = "focused";
                state.steps.push(plan.message || "Selected a range for review"); await persist(); continue;
            }
            inspection = null;
            if (plan.action === "finish") {
                const latest = await call("read_document") as View;
                if (!latest.revision || !latest.sessionOnline || latest.pending || latest.conditionalPending || latest.recoveryRequired) throw new Error("Session is not settled; inspect recovery before finishing");
                // A settled MCP read is a local replica. Fence structured verification against
                // the server sequence so delayed stream delivery cannot prove stale content.
                const authority = brief ? await new NodeHttpTransport(document, actor, url).getRecoveryState() : latest.revision;
                if (JSON.stringify(latest.revision) !== JSON.stringify(view.revision) ||
                    latest.revision.epoch !== authority.epoch || latest.revision.serverSeq !== authority.serverSeq || latest.revision.schemaVersion !== authority.schemaVersion) {
                    state.steps.push("Document changed while planning; read again before finishing."); await persist(); continue;
                }
                if (brief) {
                    state.verification = verifyBrief(brief, latest.document, server.schema as Schema, latest.revision);
                    if (state.verification.status !== "passed") {
                        state.result = plan.message;
                        state.error = "The planner reported completion, but the brief requirements did not all pass. Inspect the saved verification report.";
                        state.expression = "concerned"; state.status = "needs_attention";
                        await persist(); await publish(latest.revision, null, "concerned", "needs_attention");
                        await new Promise(resolve => setTimeout(resolve, 750)); return state;
                    }
                    state.completion = "verified";
                } else {
                    state.completion = "model_reported";
                    state.verification = {version: 1, status: "not_checked", checkedRevision: latest.revision, requirements: [], reason: "No structured brief was supplied. Completion was reported by the model."};
                }
                state.result = plan.message; state.expression = "happy"; state.status = "completed"; await persist(); await publish(latest.revision, null, "happy", "done"); await new Promise(resolve => setTimeout(resolve, 750)); return state;
            }
            if (plan.action === "needs_attention") {state.error = plan.message || "The planner needs user input"; state.expression = "concerned"; state.status = "needs_attention"; await persist(); await publish(view.revision, null, "concerned", "needs_attention"); await new Promise(resolve => setTimeout(resolve, 750)); return state;}
            const edits = planEdits(plan);
            if (lastConfirmed && (resumedGuard || JSON.stringify(lastConfirmed.revision) === JSON.stringify(view.revision)) && editFingerprint(lastConfirmed.edits) === editFingerprint(edits)) throw new Error("The planner repeated the last confirmed edit; inspect the result before continuing");
            resumedGuard=false;
            // Presence is best-effort; structural paths are not text cursors.
            state.expression = "editing";
            await publish(view.revision, plan.action === "edit" ? null : plan.at, "editing", "editing");
            const stepId=options.profileId?randomUUID():undefined;
            state.pending = {revision: view.revision, plan,...(stepId?{stepId}:{})}; await persist();
            let reply: Record<string, unknown>;
            try { reply = await call("edit_document", {base: view.revision, edits,...(stepId?{stepId}:{})}); }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (/conditional_stale|local document or schema changed since it was read/i.test(message)) {
                    state.history.push({kind: "stale", base: view.revision, plan}); state.pending = null; state.steps.push("Stale revision rejected; read again and replan."); await persist(); continue;
                }
                throw error;
            }
            if (reply.status !== "confirmed") throw new Error(`Edit outcome is ${String(reply.status)}; inspect recovery`);
            lastConfirmed = {edits: structuredClone(edits), revision: reply.revision as Revision};
            state.history.push({kind: "confirmed", base: view.revision, plan, revision: reply.revision as Revision});
            state.steps.push(plan.message || `${plan.action} confirmed`); state.pending = null; state.expression = "thinking"; await persist();
            const after = await call("read_document") as View;
            if (plan.action !== "edit" && after.revision && !after.pending && !after.conditionalPending && !after.recoveryRequired) {
                const next = [...plan.at]; if (plan.action === "insert") next[next.length - 1] += plan.text.length;
                await publish(after.revision, next, "thinking", "thinking");
            }
        }
        state.expression = "concerned"; state.status = "needs_attention"; state.error = "Step limit reached; inspect the document and decide how to proceed."; await persist(); await reportConcern().catch(() => undefined); await new Promise(resolve => setTimeout(resolve, 750)); return state;
    } catch (error) {
        state.expression = "concerned"; state.status = "needs_attention"; state.error = error instanceof Error ? error.message : String(error);
        // If the durable store itself failed, propagate it: the previous state may still show a pending operation.
        await persist();
        if (!state.pending && reportConcern) { await reportConcern().catch(() => undefined); await new Promise(resolve => setTimeout(resolve, 750)); }
        return state;
    } finally { await client?.close().catch(() => undefined); }
}
