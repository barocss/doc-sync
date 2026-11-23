import {test} from "node:test";
import assert from "node:assert/strict";
import {join} from "node:path";
import {mkdir, readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {fixture} from "../../mcp/test/hosted-fixtures.ts";
import {creatorClient} from "../src/proposal-client.ts";
import {runProposalMission} from "../src/proposal-planner.ts";
import {DocumentSession} from "../../mcp/src/session.ts";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {until} from "../../mcp/test/hosted-fixtures.ts";
const plan = {start: 0, end: 0, replacement: "Draft", explanation: "Synthetic test only", assumptions: [], questions: [], checks: [{reference: "owner inspection", status: "unchecked"}]};
async function setup() {
    const f = await fixture(); f.service.config.proposals.enabled = true; f.service.config.proposals.acceptanceEnabled = true;
    f.service.config.grants[0]!.permissions.push("proposal_read", "proposal_decide", "proposal_accept");
    f.service.config.grants[1]!.permissions.push("proposal_create");
    const dir = join(f.dir, "missions"); await mkdir(dir, {mode: 0o700});
    const request = (suffix: string, input?: unknown, token = f.token) => fetch(`${f.endpoint}/proposals${suffix}`, {method: input ? "POST" : "GET", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, ...(input ? {body: JSON.stringify(input)} : {})});
    return {...f, dir, request, creator: creatorClient(f.endpoint.href, f.readToken)};
}
test("injected planner creates only; explicit separate owner applies once; retry never replans", async () => {
    const f = await setup();
    try {
        const options = {missionPath: join(f.dir, "m.json"), brief: "Draft proposal", path: [0] as [number]}; let calls = 0;
        const result = await runProposalMission(options, async input => {calls++; assert.equal(JSON.stringify(input).includes(f.readToken), false); return plan;}, f.creator);
        assert.equal(result.status, "created"); assert.equal(calls, 1); if(result.status !== "created") throw Error("Expected created");
        assert.equal(f.requests.filter(r => r.url.includes("/conditional")).length, 0);
        assert.deepEqual(await runProposalMission(options, async () => {throw Error("Must not replan");}, f.creator), result);
        const record = await (await f.request(`/${result.id}`)).json(); assert.equal(record.status, "pending");
        const decision = {requestId: randomUUID(), proposalDigest: record.proposalDigest};
        assert.equal((await f.request(`/${result.id}/accept`, decision, f.readToken)).status, 403);
        const applied = await (await f.request(`/${result.id}/accept`, decision)).json(); assert.equal(applied.status, "applied");
        assert.equal((await (await f.request(`/${result.id}/accept`, decision)).json()).status, "applied");
        const saved = await readFile(options.missionPath, "utf8"); assert.ok(!saved.includes(f.token) && !saved.includes(f.readToken));
    } finally { await f.cleanup(); }
});
test("lost create response reuses exact request; rejected owner outcome is not reapplied", async () => {
    const f = await setup();
    try {
        const options = {missionPath: join(f.dir, "lost.json"), brief: "Draft proposal", path: [0] as [number]}; let sent = 0;
        const uncertain = {...f.creator, create: async (request: Parameters<typeof f.creator.create>[0]) => {const result = await f.creator.create(request); if (++sent === 1) throw Error("lost response"); return result;}};
        assert.equal((await runProposalMission(options, async () => plan, uncertain)).status, "unknown");
        const result = await runProposalMission(options, async () => {throw Error("No new plan");}, uncertain); assert.equal(result.status, "created"); if(result.status !== "created") throw Error("Expected created");
        const list = await (await f.request("")).json(); assert.equal(list.length, 1);
        const rejected = await (await f.request(`/${result.id}/reject`, {requestId:randomUUID(), proposalDigest:list[0].proposalDigest})).json(); assert.equal(rejected.status, "rejected");
        await runProposalMission(options, async () => plan, uncertain);
        assert.equal((await (await f.request(`/${result.id}`)).json()).status,"rejected");
        assert.equal(f.requests.filter(r => r.url.includes("/conditional")).length,0);
    } finally { await f.cleanup(); }
});
test("peer edit between capture and create rejects without automatic new base", async () => {
    const f = await setup();
    try {
        const options = {missionPath: join(f.dir,"stale.json"),brief:"Draft proposal",path:[0] as [number]};
        const result = await runProposalMission(options, async () => {
            const route=f.service.config.routes[0]!, transport=new NodeHttpTransport("doc","peer",route.upstream), schema=await transport.getSchema();
            const peer=new DocumentSession("peer",transport,schema.schema!); await peer.start(); await until(()=>peer.client.synchronized);
            await peer.edit((await peer.read()).revision!,[{op:"insert",at:[0,0],content:"Foreign"}]); await peer.close(); return plan;
        },f.creator);
        assert.equal(result.status,"unknown"); assert.deepEqual(await (await f.request("")).json(),[]);
        const before=f.requests.filter(r=>r.url.includes("/conditional")).length;
        assert.equal((await runProposalMission(options,async()=>{throw Error("No replan");},f.creator)).status,"unknown");
        assert.equal(f.requests.filter(r=>r.url.includes("/conditional")).length,before);
    } finally {await f.cleanup();}
});
test("capture denies wrong grant/path and remote plaintext credentials",async()=>{
    const f=await setup(); try {
        assert.equal((await f.request("/target",{path:[0]})).status,403);
        assert.equal((await f.request("/target",{path:[0,0]},f.readToken)).status,400);
        assert.equal((await f.request("/target",{path:[0],approve:true},f.readToken)).status,400);
        assert.throws(()=>creatorClient("http://example.com/mcp/t/d/s",f.readToken));
    }finally{await f.cleanup();}
});
