import assert from "node:assert/strict";
import {test} from "node:test";
import {spawn} from "node:child_process";
import {createHash, randomUUID, randomBytes} from "node:crypto";
import {readFile, readdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import type {IncomingMessage, ServerResponse} from "node:http";
import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {fixture, demo, stop, call, until, gate} from "./hosted-fixtures.ts";

async function hosted(config: string, port: string, stage?: string) {
    const child = spawn(process.execPath, [...(stage ? ["--import", new URL("./proposal-rejection-process-fixture.ts", import.meta.url).href] : []), new URL("../src/http-main.ts", import.meta.url).pathname], {
        env: {...process.env, DOC_SYNC_HOSTED_CONFIG: config, PORT: port, ...(stage ? {DOC_SYNC_REJECTION_TEST_STAGE: stage} : {})}, stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = ""; child.stderr!.on("data", b => { logs += b; });
    await until(() => logs.includes("Hosted MCP listening") || child.exitCode !== null);
    assert.equal(child.exitCode, null, logs);
    return {child, logs: () => logs, async gate(name: string) { await until(() => logs.includes(`rejection-test-gate:${name}`) || child.exitCode !== null); assert.equal(child.exitCode, null, logs); }};
}
async function setup(intercept?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>) {
    const f = await fixture({intercept}); await f.service.shutdown();
    const ownerToken = randomBytes(32).toString("base64url");
    const config = {...structuredClone(f.config), hosts: [f.endpoint.host], proposals: {enabled: true, acceptanceEnabled: true}};
    config.routes.push({...config.routes[0]!, slot: "human", actor: "human"});
    config.grants[0]!.routes.push("/mcp/t/d/human");
    config.grants[1]!.permissions.push("proposal_create");
    config.grants.push({id: "owner", principal: "p", token: ownerToken, routes: ["/mcp/t/d/s"], permissions: ["read", "proposal_read", "proposal_decide", "proposal_accept"]});
    const file = join(f.dir, "config.json"); await writeFile(file, JSON.stringify(config), {mode: 0o600});
    const request = (suffix: string, method = "GET", body?: unknown, token = ownerToken) => fetch(`${f.endpoint}/proposals${suffix}`, {method, headers: {authorization: `Bearer ${token}`, ...(body === undefined ? {} : {"content-type": "application/json"})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const create = async (replacement = "rejected", start = 0) => {
        const response = await request("/base", "GET", undefined, f.readToken); assert.equal(response.status, 200, await response.clone().text());
        const created = await request("", "POST", {requestId: randomUUID(), base: await response.json(), change: {kind: "replace_text", path: [0], blockId: "0@~root", start, end: start, replacement}, explanation: "rejection process test", assumptions: [], questions: [], checks: []}, f.readToken);
        assert.equal(created.status, 200, await created.clone().text());
        return created.json() as Promise<{id: string; proposalDigest: string}>;
    };
    const append = async (content: string, human = false) => {
        const session = await f.connect(f.token, human ? new URL("/mcp/t/d/human", f.endpoint) : f.endpoint);
        try {
            const view = await call(session.client, "read_document");
            const runs = (view.document as {children: Array<{runs?: Array<{text?: string}>}>}).children[0]!.runs ?? [];
            await call(session.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, runs.reduce((n, r) => n + (r.text?.length ?? 0), 0)], content}]});
        } finally { await session.transport.terminateSession(); await session.client.close(); }
    };
    const journal = join(config.dataDir, createHash("sha256").update(JSON.stringify([config.routes[0]!.upstream, "doc", "stable"])).digest("hex") + ".json");
    const bytes = async () => {
        const result: Record<string, Buffer> = {};
        const visit = async (directory: string) => { for (const entry of await readdir(directory, {withFileTypes: true})) { const path = join(directory, entry.name); if (entry.isDirectory()) await visit(path); else if (!entry.name.endsWith(".lock")) result[path] = await readFile(path); } };
        await visit(config.dataDir); return result;
    };
    return {...f, config, file, journal, request, create, append, bytes};
}
function race() {
    const entered = gate(), release = gate();
    let armed = false, origin = "", raw = "", headers: Record<string, string> = {};
    let uncertain: "none" | "storage" | "generation" = "none";
    return {entered, release, arm: () => { armed = true; }, origin: (value: string) => { origin = value; }, raw: () => JSON.parse(raw), uncertainty: (value: typeof uncertain) => { uncertain = value; },
        async intercept(req: IncomingMessage, res: ServerResponse) {
            if (req.url!.endsWith("/settle-conditional") && uncertain !== "none") {
                const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
                if (uncertain === "storage") { res.writeHead(503, {"content-type": "application/json"}); res.end(JSON.stringify({code: "storage_unknown", error: "test storage uncertainty"})); return true; }
                const payload = JSON.parse(Buffer.concat(chunks).toString()); payload.generation = "different-generation";
                const response = await fetch(new URL(req.url!, origin), {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)}, body: JSON.stringify(payload)});
                assert.equal(response.status, 200, "generation mismatch must reach the settlement endpoint");
                assert.deepEqual(await response.clone().json(), {status: "unknown"});
                res.writeHead(response.status, {"content-type": "application/json"}); res.end(await response.text()); return true;
            }
            if (!armed || !req.url!.endsWith("/conditional")) return false;
            armed = false;
            const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk); raw = Buffer.concat(chunks).toString();
            headers = Object.fromEntries(Object.entries({...req.headers, host: new URL(origin).host}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
            entered.release(); await release.wait;
            const response = await fetch(new URL(req.url!, origin), {method: "POST", headers, body: raw});
            res.writeHead(response.status, {"content-type": "application/json"}); res.end(await response.text()); return true;
        },
    };
}
async function restart(f: Awaited<ReturnType<typeof setup>>) {
    await stop(f.upstream.child, "SIGKILL"); const next = await demo(join(f.dir, "upstream")); f.upstream.child = next.child; f.upstream.url = next.url;
}
async function state(f: Awaited<ReturnType<typeof setup>>) { return (await fetch(`${f.upstream.url}/api/docs/doc/state`)).json(); }
async function post(f: Awaited<ReturnType<typeof setup>>, action: string, body: unknown) {
    return fetch(`${f.upstream.url}/api/docs/doc/${action}`, {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)}, body: JSON.stringify(body)});
}
const text = (model: unknown) => (model as {children: Array<{runs?: Array<{text?: string}>}>}).children[0]!.runs?.map(r => r.text ?? "").join("") ?? "";
async function result(response: Response, status: string) { assert.equal(response.status, 200, await response.clone().text()); const record = await response.json(); assert.equal(record.status, status, JSON.stringify(record)); return record; }

test("stale prepared approval retires exact IDs, preserves prior history and foreign text, and fences delayed replay after GC and server restart", {timeout: 60000}, async () => {
    const r = race(), f = await setup(r.intercept); r.origin(f.upstream.url);
    let service: Awaited<ReturnType<typeof hosted>> | undefined, actor: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port); await f.append("old");
        const checkpointBefore = JSON.parse(await readFile(`${f.journal}.checkpoint`, "utf8"));
        const proposal = await f.create("rejected", 3), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        r.arm(); const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
        await r.entered.wait; await f.append("H", true); r.release.release();
        const denied = await result(await pending, "not_applied");
        const count = f.requests.filter(q => q.url.endsWith("/conditional")).length;
        await result(await f.request(`/${proposal.id}/accept`, "POST", decision), "not_applied");
        assert.equal(f.requests.filter(q => q.url.endsWith("/conditional")).length, count, "terminal retry cannot resubmit");
        const checkpointAfter = JSON.parse(await readFile(`${f.journal}.checkpoint`, "utf8"));
        assert.equal(checkpointAfter.client.seq, checkpointBefore.client.seq, "rejection cannot consume actor seq");
        assert.deepEqual(checkpointAfter.client.history, checkpointBefore.client.history, "retirement preserves undo/redo history");
        assert.equal(checkpointAfter.reservationId, checkpointBefore.reservationId, "retirement keeps the history reservation");
        assert.equal(checkpointAfter.client.serverSeq, checkpointBefore.client.serverSeq, "retirement itself does not advance the checkpoint frontier");
        assert.ok(checkpointAfter.client.snapshot.lamport > checkpointBefore.client.snapshot.lamport, "retirement burns tentative IDs");
        await assert.rejects(readFile(f.journal), {code: "ENOENT"});
        await stop(service.child, "SIGKILL"); await restart(f); service = await hosted(f.file, f.endpoint.port);
        await post(f, "gc", {});
        const beforeReplay = await state(f);
        const delayed = await post(f, "conditional", r.raw()); assert.equal(delayed.status, 409);
        const rebased = await post(f, "conditional", {base: {epoch: beforeReplay.epoch, serverSeq: beforeReplay.serverSeq, schemaVersion: beforeReplay.schemaVersion}, change: r.raw().change}); assert.equal(rebased.status, 409, "rebasing cannot bypass the raw change fence");
        const rawDelayed = await post(f, "changes", r.raw().change); assert.equal(rawDelayed.status, 409);
        const recoveryDelayed = await post(f, "recover-change", {generation: beforeReplay.generation, reservationId: checkpointAfter.reservationId, schemaVersion: beforeReplay.schemaVersion, change: r.raw().change}); assert.equal(recoveryDelayed.status, 409, "protected recovery cannot bypass the raw change fence");
        const afterReplay = await state(f); assert.equal(afterReplay.serverSeq, beforeReplay.serverSeq); assert.equal(text(afterReplay.model), "oldH");
        await result(await f.request(`/${proposal.id}/reconcile`, "POST", decision), "not_applied");
        assert.equal((await (await f.request(`/${proposal.id}`)).json()).attempt.id, denied.attempt.id);
        const fresh = await f.create("new", 4);
        const nextDecision = {requestId: randomUUID(), proposalDigest: fresh.proposalDigest};
        await result(await f.request(`/${fresh.id}/accept`, "POST", nextDecision), "applied");
        const saved = await f.bytes(), bridge = Object.keys(saved).find(path => path.endsWith(`/attempts/${nextDecision.requestId}.json`)); assert.ok(bridge);
        const nextChange = JSON.parse(saved[bridge]!.toString()).journal.change;
        assert.equal(nextChange.seq, r.raw().change.seq, "a negative settlement preserves the next actor sequence");
        assert.notDeepEqual(nextChange.ops, r.raw().change.ops, "the next edit allocates fresh IDs");
        assert.ok(nextChange.ops.find((op: {t: string}) => op.t === "text").id.lamport > checkpointAfter.client.snapshot.lamport, `fresh insertion starts after every retired Lamport ID: ${JSON.stringify({nextChange, retired: checkpointAfter.client.snapshot.lamport, rejected: r.raw().change})}`);
        actor = await f.connect(); assert.equal(text((await call(actor.client, "read_document")).document), "oldHnew");
        await call(actor.client, "undo"); assert.equal(text((await call(actor.client, "read_document")).document), "oldH");
        await call(actor.client, "undo"); assert.equal(text((await call(actor.client, "read_document")).document), "H");
        await call(actor.client, "redo"); assert.equal(text((await call(actor.client, "read_document")).document), "oldH");
        await call(actor.client, "redo"); assert.equal(text((await call(actor.client, "read_document")).document), "oldHnew");
    } finally { r.release.release(); await actor?.client.close(); if (service) await stop(service.child); await f.cleanup(); }
});

for (const stage of ["after-plan", "after-checkpoint", "after-clear", "before-terminal"] as const) {
    test(`rejection SIGKILL ${stage}: durable negative plan resumes after host and upstream restart`, {timeout: 60000}, async () => {
        const r = race(), f = await setup(r.intercept); r.origin(f.upstream.url);
        let service: Awaited<ReturnType<typeof hosted>> | undefined;
        try {
            service = await hosted(f.file, f.endpoint.port, stage); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            r.arm(); const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
            await r.entered.wait; await f.append("H", true); r.release.release(); await service.gate(stage);
            await stop(service.child, "SIGKILL"); await pending.catch(() => undefined);
            const saved = await f.bytes(), plan = Object.keys(saved).find(path => path.endsWith(`/attempts/${decision.requestId}.not-applied.json`)); assert.ok(plan, "negative plan is durable before checkpoint or clear");
            await restart(f); service = await hosted(f.file, f.endpoint.port);
            await result(await f.request(`/${proposal.id}/reconcile`, "POST", decision), "not_applied");
            assert.deepEqual((await f.bytes())[plan], saved[plan], "recovery retains the immutable negative proof and retirement plan");
            await assert.rejects(readFile(f.journal), {code: "ENOENT"});
            assert.equal(f.requests.filter(q => q.url.endsWith("/conditional")).length, 2, "recovery sends no second conditional change");
            await f.append("next"); assert.equal(text((await state(f)).model), "Hnext");
        } finally { r.release.release(); if (service) await stop(service.child); await f.cleanup(); }
    });
}

for (const uncertainty of ["storage", "generation"] as const) {
    test(`settlement ${uncertainty} uncertainty preserves journal and checkpoint and blocks actor reuse`, {timeout: 60000}, async () => {
        const r = race(), f = await setup(r.intercept); r.origin(f.upstream.url); r.uncertainty(uncertainty);
        let service: Awaited<ReturnType<typeof hosted>> | undefined;
        try {
            service = await hosted(f.file, f.endpoint.port); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            r.arm(); const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
            await r.entered.wait; const before = await f.bytes(); await f.append("H", true); r.release.release();
            const response = await pending; assert.ok([200, 409, 503].includes(response.status));
            if (response.status === 200) assert.ok(["applying", "unconfirmed", "needs_attention"].includes((await response.json()).status));
            const after = await f.bytes(); assert.deepEqual(after[f.journal], before[f.journal]); assert.deepEqual(after[`${f.journal}.checkpoint`], before[`${f.journal}.checkpoint`]);
            assert.ok(!Object.keys(after).some(path => path.endsWith(".not-applied.json")), "unknown cannot create a retirement plan");
            await stop(service.child, "SIGKILL"); await restart(f); r.origin(f.upstream.url); service = await hosted(f.file, f.endpoint.port);
            await assert.rejects(f.connect());
            const resumed = await f.request(`/${proposal.id}/reconcile`, "POST", decision); assert.ok([200, 409, 503].includes(resumed.status));
            if (resumed.status === 200) assert.ok(["applying", "unconfirmed", "needs_attention"].includes((await resumed.json()).status));
            const preserved = await f.bytes(); assert.deepEqual(preserved[f.journal], before[f.journal]); assert.deepEqual(preserved[`${f.journal}.checkpoint`], before[`${f.journal}.checkpoint`]);
            assert.equal(text((await state(f)).model), "H");
        } finally { r.release.release(); if (service) await stop(service.child); await f.cleanup(); }
    });
}

test("generation reset after durable negative proof preserves unfinished retirement and blocks actor reuse", {timeout: 60000}, async () => {
    const r = race(), f = await setup(r.intercept); r.origin(f.upstream.url);
    let service: Awaited<ReturnType<typeof hosted>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port, "after-plan"); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        r.arm(); const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
        await r.entered.wait; await f.append("H", true); r.release.release(); await service.gate("after-plan");
        await stop(service.child, "SIGKILL"); await pending.catch(() => undefined);
        const before = await f.bytes(), generation = (await state(f)).generation;
        const reset = await post(f, "reset", {}); assert.equal(reset.status, 200); assert.notEqual((await state(f)).generation, generation);
        await restart(f); service = await hosted(f.file, f.endpoint.port);
        const response = await f.request(`/${proposal.id}/reconcile`, "POST", decision); assert.ok([200, 409, 503].includes(response.status));
        if (response.status === 200) assert.ok(["applying", "unconfirmed", "needs_attention"].includes((await response.json()).status), "old proof cannot finish retirement in a different generation");
        const after = await f.bytes(); assert.deepEqual(after[f.journal], before[f.journal]); assert.deepEqual(after[`${f.journal}.checkpoint`], before[`${f.journal}.checkpoint`]);
        await assert.rejects(f.connect()); assert.equal(text((await state(f)).model), "");
    } finally { r.release.release(); if (service) await stop(service.child); await f.cleanup(); }
});

for (const stage of ["after-plan", "after-checkpoint"] as const) {
    test(`rejection ${stage} with a different valid checkpoint hash preserves journal and blocks cleanup`, {timeout: 60000}, async () => {
        const r = race(), f = await setup(r.intercept); r.origin(f.upstream.url);
        let service: Awaited<ReturnType<typeof hosted>> | undefined;
        try {
            service = await hosted(f.file, f.endpoint.port, stage); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            r.arm(); const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
            await r.entered.wait; await f.append("H", true); r.release.release(); await service.gate(stage);
            await stop(service.child, "SIGKILL"); await pending.catch(() => undefined);
            const checkpointPath = `${f.journal}.checkpoint`, checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
            checkpoint.client.snapshot.lamport += 100;
            const {recordDigest: _recordDigest, ...partial} = checkpoint;
            checkpoint.recordDigest = createHash("sha256").update(JSON.stringify(partial)).digest("hex");
            await writeFile(checkpointPath, JSON.stringify(checkpoint) + "\n", {mode: 0o600});
            const before = await f.bytes(); await restart(f); service = await hosted(f.file, f.endpoint.port);
            const response = await f.request(`/${proposal.id}/reconcile`, "POST", decision); assert.ok([200, 409, 503].includes(response.status));
            if (response.status === 200) assert.ok(["needs_attention", "unconfirmed"].includes((await response.json()).status));
            const after = await f.bytes(); assert.deepEqual(after[f.journal], before[f.journal]); assert.deepEqual(after[checkpointPath], before[checkpointPath]);
            await assert.rejects(f.connect()); assert.equal(text((await state(f)).model), "H");
        } finally { r.release.release(); if (service) await stop(service.child); await f.cleanup(); }
    });
}

for (const fault of ["plan-file-sync-fail", "plan-directory-sync-fail", "checkpoint-directory-sync-fail"] as const) {
    test(`rejection ${fault}: fsync uncertainty cannot authorize clear on this process or the next`, {timeout: 60000}, async () => {
        const r = race(), f = await setup(r.intercept); r.origin(f.upstream.url);
        let service: Awaited<ReturnType<typeof hosted>> | undefined;
        const blocked = async (response: Response) => { assert.ok([200, 409, 500, 503].includes(response.status)); if (response.status === 200) assert.ok(["needs_attention", "unconfirmed", "applying"].includes((await response.json()).status)); };
        try {
            service = await hosted(f.file, f.endpoint.port, fault); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            r.arm(); const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
            await r.entered.wait; await f.append("H", true); r.release.release(); await blocked(await pending);
            assert.match(service.logs(), new RegExp(`rejection-test-fault:${fault}`), "real FileHandle.sync injected EIO after link or rename");
            const before = await f.bytes(); assert.ok(before[f.journal], "uncertain sync preserves the exact intent");
            await stop(service.child, "SIGKILL"); await restart(f); service = await hosted(f.file, f.endpoint.port, fault);
            await blocked(await f.request(`/${proposal.id}/reconcile`, "POST", decision));
            assert.match(service.logs(), new RegExp(`rejection-test-fault:${fault}`), "restart must retry the durability barrier before journal clear");
            const after = await f.bytes(); assert.deepEqual(after[f.journal], before[f.journal]); assert.deepEqual(after[`${f.journal}.checkpoint`], before[`${f.journal}.checkpoint`]);
            await stop(service.child, "SIGKILL"); service = await hosted(f.file, f.endpoint.port);
            await result(await f.request(`/${proposal.id}/reconcile`, "POST", decision), "not_applied");
            await assert.rejects(readFile(f.journal), {code: "ENOENT"}); await f.append("next"); assert.equal(text((await state(f)).model), "Hnext");
        } finally { r.release.release(); if (service) await stop(service.child); await f.cleanup(); }
    });
}
