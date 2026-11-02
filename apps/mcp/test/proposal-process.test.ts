import assert from "node:assert/strict";
import {test} from "node:test";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {readFile, readdir, writeFile, rename, unlink} from "node:fs/promises";
import {join} from "node:path";
import {fixture, demo, stop, call, until, gate, listen} from "./hosted-fixtures.ts";

async function hosted(configFile: string, port: string, stage?: string) {
    const child = spawn(process.execPath, [...(stage ? ["--import", new URL("./proposal-process-fixture.ts", import.meta.url).href] : []), new URL("../src/http-main.ts", import.meta.url).pathname], {
        env: {...process.env, DOC_SYNC_HOSTED_CONFIG: configFile, PORT: port, ...(stage ? {DOC_SYNC_PROPOSAL_TEST_STAGE: stage} : {})}, stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = ""; child.stderr!.on("data", b => { logs += b; });
    await until(() => logs.includes("Hosted MCP listening") || child.exitCode !== null);
    assert.equal(child.exitCode, null, logs);
    return {child, endpoint: new URL(`http://127.0.0.1:${logs.match(/listening on (\d+)/)![1]}/mcp/t/d/s`), logs: () => logs, async gate(name: string) { await until(() => logs.includes(`proposal-test-gate:${name}`) || child.exitCode !== null); assert.equal(child.exitCode, null, logs); }};
}
async function setup(options: Parameters<typeof fixture>[0] = {}) {
    const f = await fixture(options); await f.service.shutdown();
    const ownerToken = randomBytes(32).toString("base64url");
    const config = {...structuredClone(f.config), hosts: [f.endpoint.host], proposals: {enabled: true, acceptanceEnabled: true}};
    config.routes.push({...config.routes[0]!, slot: "human", actor: "human"});
    config.grants[0]!.routes.push("/mcp/t/d/human");
    config.grants[1]!.permissions.push("proposal_create");
    config.grants.push({id: "owner", principal: "p", token: ownerToken, routes: ["/mcp/t/d/s"], permissions: ["read", "proposal_read", "proposal_decide", "proposal_accept"]});
    const file = join(f.dir, "config.json"); await writeFile(file, JSON.stringify(config), {mode: 0o600});
    const request = async (suffix: string, method = "GET", body?: unknown, token = ownerToken, endpoint = f.endpoint) => fetch(`${endpoint}/proposals${suffix}`, {method, headers: {host: f.endpoint.host, authorization: `Bearer ${token}`, ...(body === undefined ? {} : {"content-type": "application/json"})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const create = async (replacement = "approved", start = 0, end = 0) => {
        const baseResponse = await request("/base", "GET", undefined, f.readToken); assert.equal(baseResponse.status, 200, await baseResponse.clone().text());
        const base = await baseResponse.json();
        const response = await request("", "POST", {requestId: randomUUID(), base, change: {kind: "replace_text", path: [0], blockId: "0@~root", start, end, replacement}, explanation: "synthetic process fixture", assumptions: [], questions: [], checks: []}, f.readToken);
        assert.equal(response.status, 200, await response.clone().text());
        return response.json() as Promise<{id: string; proposalDigest: string; status: string}>;
    };
    const journal = join(config.dataDir, createHash("sha256").update(JSON.stringify([config.routes[0]!.upstream, "doc", "stable"])).digest("hex") + ".json");
    const human = async (text: string) => {
        const current = await f.connect(f.token, new URL("/mcp/t/d/human", f.endpoint));
        try {
            const view = await call(current.client, "read_document"), document = view.document as {children: Array<{runs?: Array<{text?: string}>}>};
            const runs = document.children[0]!.runs ?? [], size = runs.reduce((n, r) => n + (r.text?.length ?? 0), 0);
            await call(current.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, size], content: text}]});
        } finally { await current.transport.terminateSession(); await current.client.close(); }
    };
    const stateBytes = async () => {
        const files: Record<string, Buffer> = {};
        const visit = async (directory: string) => { for (const entry of await readdir(directory, {withFileTypes: true})) { const path = join(directory, entry.name); if (entry.isDirectory()) await visit(path); else if (entry.name !== "writer.lock" && !entry.name.endsWith(".lock")) files[path] = await readFile(path); } };
        await visit(config.dataDir); return files;
    };
    return {...f, config, file, ownerToken, request, create, human, journal, stateBytes};
}
async function accepted(response: Response) {
    assert.equal(response.status, 200, await response.clone().text()); const record = await response.json(); assert.equal(record.status, "applied", JSON.stringify(record)); return record;
}
async function restartUpstream(f: Awaited<ReturnType<typeof setup>>) {
    await stop(f.upstream.child, "SIGKILL"); const next = await demo(join(f.dir, "upstream")); f.upstream.child = next.child; f.upstream.url = next.url;
}
async function authoritativeText(f: Awaited<ReturnType<typeof setup>>) {
    const transport = new NodeHttpTransport("doc", "", f.upstream.url), schema = await transport.getSchema(); assert.ok(schema.schema);
    const observer = new SyncClient("independent-observer", {subscribe: transport.subscribe.bind(transport), send: async message => { assert.equal(message.kind, "ack"); }, sendPresence: () => { throw new Error("observer cannot send presence"); }}, {schema: schema.schema});
    try { observer.connect(); await until(() => observer.synchronized); return observer.doc.toJSON().children![0]!.runs!.map(run => "text" in run ? run.text : "").join(""); }
    finally { observer.disconnect(); }
}
const changeCount = (f: Awaited<ReturnType<typeof setup>>) => f.requests.filter(r => r.url.endsWith("/conditional")).length;

test("proposal accepted-response loss: real host/server restart reconciles once and recovered actor undo/redo preserves human edits", {timeout: 60000}, async () => {
    const entered = gate(), release = gate(); let upstream = "", hold = true;
    const f = await setup({intercept: async (req, res) => {
        if (!hold || !req.url!.endsWith("/conditional")) return false;
        hold = false;
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
        const response = await fetch(new URL(req.url!, upstream), {method: "POST", headers: Object.fromEntries(Object.entries({...req.headers, host: new URL(upstream).host}).filter((entry): entry is [string, string] => typeof entry[1] === "string")), body: Buffer.concat(chunks)});
        assert.equal(response.status, 200); const reply = await response.json(); assert.equal(reply.status, "accepted");
        entered.release(); await release.wait; res.destroy(); return true;
    }}); upstream = f.upstream.url;
    let service: Awaited<ReturnType<typeof hosted>> | undefined;
    let bot: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
        await Promise.race([entered.wait, pending.then(async r => { throw new Error(`accept completed before gate: ${r.status} ${await r.clone().text()}`); })]);
        await f.human("H");
        assert.equal(changeCount(f), 2);
        await stop(service.child, "SIGKILL"); await pending.catch(() => undefined); release.release();
        await restartUpstream(f); service = await hosted(f.file, f.endpoint.port);
        const before = f.requests.length;
        await assert.rejects(f.connect()); assert.equal(f.requests.length, before, "generic startup must not restore or ACK an unresolved approval");
        const applied = await accepted(await f.request(`/${proposal.id}/accept`, "POST", decision));
        assert.equal(applied.attempt.id, decision.requestId); assert.equal(changeCount(f), 2, "reconciliation never resubmits conditional edit");
        await accepted(await f.request(`/${proposal.id}/accept`, "POST", decision)); assert.equal(changeCount(f), 2);
        await f.human("J"); bot = await f.connect();
        assert.match(JSON.stringify((await call(bot.client, "read_document")).document), /approvedHJ/);
        await call(bot.client, "undo"); assert.match(JSON.stringify((await call(bot.client, "read_document")).document), /"text":"HJ"/);
        await bot.transport.terminateSession(); await bot.client.close(); bot = undefined;
        await stop(service.child, "SIGKILL"); await restartUpstream(f); service = await hosted(f.file, f.endpoint.port); bot = await f.connect();
        await call(bot.client, "redo"); assert.match(JSON.stringify((await call(bot.client, "read_document")).document), /approvedHJ/);
        assert.equal((await (await f.request(`/${proposal.id}`)).json()).status, "applied", "later undo does not change historical applied receipt");
        assert.equal(changeCount(f), 3, "only accepted proposal and two human edits used conditional send");
    } finally { release.release(); await bot?.client.close(); if (service) await stop(service.child); await f.cleanup(); }
});

test("proposal pre-send SIGKILL: unknown receipt remains blocked across full restart with exact journal/bridge bytes", {timeout: 50000}, async () => {
    const entered = gate(), release = gate(); let hold = true;
    const f = await setup({intercept: async (req, res) => {
        // An unavailable settlement service cannot turn a missing receipt into rejection.
        if (req.url!.endsWith("/settle-conditional")) { res.writeHead(503, {"content-type": "application/json"}); res.end(JSON.stringify({status: "unknown"})); return true; }
        if (hold && req.url!.endsWith("/conditional")) { entered.release(); await release.wait; res.destroy(); return true; } return false;
    }});
    let service: Awaited<ReturnType<typeof hosted>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined); await Promise.race([entered.wait, pending.then(async r => { throw new Error(`accept completed before gate: ${r.status} ${await r.clone().text()}`); })]);
        await stop(service.child, "SIGKILL"); await pending.catch(() => undefined); release.release(); hold = false;
        const original = await f.stateBytes(); assert.ok(original[f.journal], "exact journal was persisted before send");
        await restartUpstream(f); service = await hosted(f.file, f.endpoint.port);
        await assert.rejects(f.connect());
        const response = await f.request(`/${proposal.id}/accept`, "POST", decision); assert.ok([200, 409, 503].includes(response.status));
        if (response.status === 200) assert.ok(["unconfirmed", "needs_attention", "applying"].includes((await response.json()).status));
        assert.equal(changeCount(f), 1); assert.equal(await authoritativeText(f), "");
        const after = await f.stateBytes();
        for (const [path, bytes] of Object.entries(original)) if (path === f.journal || /evidence|checkpoint|bridge|\/attempts\//.test(path)) assert.deepEqual(after[path], bytes, `unproven recovery preserves ${path}`);
        const beforeInspect = f.requests.length; assert.equal((await f.request(`/${proposal.id}`)).status, 200); assert.equal(f.requests.length, beforeInspect, "owner inspection uses store only");
    } finally { release.release(); if (service) await stop(service.child); await f.cleanup(); }
});

for (const stage of ["before-approval", "after-approval", "after-bridge", "before-outcome"] as const) {
    test(`real process kill ${stage}: durable approval/evidence gap fails closed or reconciles exact receipt`, {timeout: 45000}, async () => {
        const f = await setup(); let service: Awaited<ReturnType<typeof hosted>> | undefined;
        try {
            service = await hosted(f.file, f.endpoint.port, stage); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined); await service.gate(stage);
            await stop(service.child, "SIGKILL"); await pending.catch(() => undefined);
            const original = await f.stateBytes(), before = changeCount(f);
            assert.equal(before, stage === "before-outcome" ? 1 : 0);
            await restartUpstream(f); service = await hosted(f.file, f.endpoint.port);
            const record = await (await f.request(`/${proposal.id}`)).json();
            if (stage === "before-approval") {
                assert.equal(record.status, "pending"); assert.equal(changeCount(f), 0);
                const denied = await f.request(`/${proposal.id}/accept`, "POST", decision); assert.equal(denied.status, 200); assert.equal((await denied.json()).status, "stale", "server restart changes the exact base and requires a new proposal"); assert.equal(changeCount(f), 0);
            } else {
                const count = f.requests.length; await assert.rejects(f.connect()); assert.equal(f.requests.length, count);
                const response = await f.request(`/${proposal.id}/accept`, "POST", decision);
                if (stage === "before-outcome") await accepted(response);
                else if (stage === "after-bridge") { assert.equal(response.status, 200); assert.equal((await response.json()).status, "not_applied", "a durable bridge can now be sealed without replay"); }
                else { assert.ok([200, 409, 503].includes(response.status)); if (response.status === 200) assert.ok(["needs_attention", "unconfirmed", "applying"].includes((await response.json()).status)); }
                assert.equal(changeCount(f), before, "an existing approval attempt cannot construct another send");
                const after = await f.stateBytes();
                if (stage === "after-approval") for (const [path, bytes] of Object.entries(original)) if (path === f.journal || /evidence|checkpoint|bridge|\/attempts\//.test(path)) assert.deepEqual(after[path], bytes);
            }
        } finally { if (service) await stop(service.child); await f.cleanup(); }
    });
}

for (const processes of [1, 2]) for (const opponent of ["accept", "reject"] as const) {
    test(`${processes} hosted process${processes === 1 ? "" : "es"}: concurrent accept/${opponent} has one serialized winner`, {timeout: 45000}, async () => {
        const entered = gate(), release = gate(); let hold = true;
        const f = await setup({intercept: async (req) => { if (hold && req.url!.endsWith("/conditional")) { hold = false; entered.release(); await release.wait; } return false; }});
        let first: Awaited<ReturnType<typeof hosted>> | undefined, second: Awaited<ReturnType<typeof hosted>> | undefined;
        try {
            first = await hosted(f.file, f.endpoint.port);
            if (processes === 2) {
                const reservation = createServer(), address = new URL(await listen(reservation)); await new Promise<void>(resolve => reservation.close(() => resolve()));
                f.config.hosts.push(address.host); await writeFile(f.file, JSON.stringify(f.config), {mode: 0o600}); second = await hosted(f.file, address.port);
            }
            const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
            await Promise.race([entered.wait, pending.then(async r => { throw new Error(`accept completed before gate: ${r.status} ${await r.clone().text()}`); })]);
            const other = await f.request(`/${proposal.id}/${opponent}`, "POST", {...decision, requestId: randomUUID()}, f.ownerToken, second?.endpoint ?? f.endpoint);
            assert.ok([409, 503].includes(other.status), `competing decision ${other.status}`);
            release.release(); await accepted(await pending); assert.equal(changeCount(f), 1);
            await accepted(await f.request(`/${proposal.id}/accept`, "POST", decision, f.ownerToken, second?.endpoint ?? f.endpoint)); assert.equal(changeCount(f), 1);
            assert.equal((await f.request(`/${proposal.id}/reject`, "POST", {...decision, requestId: randomUUID()})).status, 409);
        } finally { release.release(); if (second) await stop(second.child); if (first) await stop(first.child); await f.cleanup(); }
    });
}

test("revoked owner cannot reconcile after restart; retarget cannot inspect or apply the old physical proposal", {timeout: 45000}, async () => {
    const f = await setup(); let service: Awaited<ReturnType<typeof hosted>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port, "after-bridge"); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined); await service.gate("after-bridge");
        await stop(service.child, "SIGKILL"); await pending.catch(() => undefined); const original = await f.stateBytes();
        const owner = f.config.grants.find(g => g.id === "owner")!; owner.permissions = owner.permissions.filter(p => p !== "proposal_accept");
        await writeFile(f.file, JSON.stringify(f.config), {mode: 0o600}); await restartUpstream(f); service = await hosted(f.file, f.endpoint.port);
        const before = f.requests.length;
        assert.equal((await f.request(`/${proposal.id}/reconcile`, "POST", decision)).status, 403);
        assert.equal((await f.request(`/${proposal.id}`)).status, 200); await assert.rejects(f.connect()); assert.equal(f.requests.length, before);
        assert.deepEqual(await f.stateBytes(), original, "revocation preserves every recovery byte");
        await stop(service.child); owner.permissions.push("proposal_accept"); f.config.routes[0]!.upstreamDocument = "retargeted";
        await writeFile(f.file, JSON.stringify(f.config), {mode: 0o600}); service = await hosted(f.file, f.endpoint.port);
        assert.equal((await f.request(`/${proposal.id}`)).status, 404);
        assert.equal((await f.request(`/${proposal.id}/accept`, "POST", decision)).status, 409);
        assert.equal(f.requests.length, before, "retarget fails before document access");
        const after = await f.stateBytes(); for (const [path, bytes] of Object.entries(original)) assert.deepEqual(after[path], bytes);
    } finally { if (service) await stop(service.child); await f.cleanup(); }
});

test("a foreign edit between prepared bridge and conditional send rejects the old base without replay", {timeout: 45000}, async () => {
    const entered = gate(), release = gate(); let hold = true;
    const f = await setup({intercept: async req => { if (hold && req.url!.endsWith("/conditional")) { hold = false; entered.release(); await release.wait; } return false; }});
    let service: Awaited<ReturnType<typeof hosted>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined);
        await Promise.race([entered.wait, pending.then(async r => { throw new Error(`accept completed before gate: ${r.status} ${await r.clone().text()}`); })]);
        await f.human("human"); release.release(); const response = await pending; assert.equal(response.status, 200); const record = await response.json();
        assert.equal(record.status, "not_applied", JSON.stringify(record));
        const sent = changeCount(f); assert.equal(sent, 2); assert.equal(await authoritativeText(f), "human", "stale approval cannot change document text");
        await f.request(`/${proposal.id}/accept`, "POST", decision); assert.equal(changeCount(f), sent);
        assert.equal((await (await f.request(`/${proposal.id}`)).json()).status, "not_applied");
    } finally { release.release(); if (service) await stop(service.child); await f.cleanup(); }
});

test("an unresolved accepted proposal blocks a different proposal before journal restoration; exact first recovery preserves foreign edits", {timeout: 50000}, async () => {
    const f = await setup(); let service: Awaited<ReturnType<typeof hosted>> | undefined, bot: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port, "before-outcome");
        const a = await f.create("A"), b = await f.create("B"), decisionA = {requestId: randomUUID(), proposalDigest: a.proposalDigest}, decisionB = {requestId: randomUUID(), proposalDigest: b.proposalDigest};
        const pending = f.request(`/${a.id}/accept`, "POST", decisionA); pending.catch(() => undefined); await service.gate("before-outcome");
        await stop(service.child, "SIGKILL"); await pending.catch(() => undefined); await restartUpstream(f); service = await hosted(f.file, f.endpoint.port);
        const original = await f.stateBytes(), requests = f.requests.length;
        assert.equal((await f.request(`/${b.id}/accept`, "POST", decisionB)).status, 409);
        assert.equal(f.requests.length, requests, "a second proposal cannot access upstream while the first outcome is unresolved");
        assert.deepEqual(await f.stateBytes(), original, "second proposal cannot overwrite checkpoint sourceIntentDigest or first approval evidence");
        await f.human("H"); await accepted(await f.request(`/${a.id}/reconcile`, "POST", decisionA));
        assert.equal(changeCount(f), 2, "one A send and one human send; recovery adds none");
        const stale = await f.request(`/${b.id}/accept`, "POST", decisionB); assert.equal(stale.status, 200); assert.equal((await stale.json()).status, "stale"); assert.equal(changeCount(f), 2);
        bot = await f.connect(); await call(bot.client, "undo"); assert.match(JSON.stringify((await call(bot.client, "read_document")).document), /"text":"H"/);
        await call(bot.client, "redo"); assert.match(JSON.stringify((await call(bot.client, "read_document")).document), /AH/);
    } finally { await bot?.client.close(); if (service) await stop(service.child); await f.cleanup(); }
});

for (const damage of ["missing-bridge", "corrupt-bridge", "checkpoint-source"] as const) {
    test(`restart with ${damage} preserves original evidence and blocks receipt restore before upstream`, {timeout: 45000}, async () => {
        const f = await setup(); let service: Awaited<ReturnType<typeof hosted>> | undefined;
        try {
            service = await hosted(f.file, f.endpoint.port, "before-outcome"); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
            const pending = f.request(`/${proposal.id}/accept`, "POST", decision); pending.catch(() => undefined); await service.gate("before-outcome");
            await stop(service.child, "SIGKILL"); await pending.catch(() => undefined);
            const files = await f.stateBytes(), bridge = Object.keys(files).find(path => path.endsWith(`/attempts/${decision.requestId}.json`))!; assert.ok(bridge);
            const checkpoint = `${f.journal}.checkpoint`; assert.ok(files[checkpoint]);
            if (damage === "missing-bridge") await rename(bridge, `${bridge}.preserved`);
            else if (damage === "corrupt-bridge") { await writeFile(`${bridge}.preserved`, files[bridge]!, {mode: 0o600}); await writeFile(bridge, '{"corrupt":true}\n', {mode: 0o600}); }
            else {
                await writeFile(`${checkpoint}.preserved`, files[checkpoint]!, {mode: 0o600});
                const value = JSON.parse(files[checkpoint]!.toString()); value.sourceIntentDigest = "a".repeat(64);
                const {recordDigest: _, ...rest} = value; value.recordDigest = createHash("sha256").update(JSON.stringify(rest)).digest("hex");
                await writeFile(checkpoint, JSON.stringify(value) + "\n", {mode: 0o600});
            }
            const damaged = await f.stateBytes(); await restartUpstream(f); service = await hosted(f.file, f.endpoint.port); const count = f.requests.length;
            await assert.rejects(f.connect());
            const response = await f.request(`/${proposal.id}/reconcile`, "POST", decision); assert.ok([200, 409, 500, 503].includes(response.status));
            if (response.status === 200) assert.ok(["needs_attention", "unconfirmed"].includes((await response.json()).status));
            assert.equal(f.requests.length, count, "missing or mismatched proof cannot query receipt, join, reserve or ACK");
            assert.equal(changeCount(f), 1);
            const after = await f.stateBytes();
            for (const [path, bytes] of Object.entries(damaged)) if (path === checkpoint || /\/attempts\/|\.preserved$/.test(path)) assert.deepEqual(after[path], bytes);
            assert.deepEqual(after[damage === "checkpoint-source" ? `${checkpoint}.preserved` : `${bridge}.preserved`], files[damage === "checkpoint-source" ? checkpoint : bridge]);
        } finally { if (service) await stop(service.child); await f.cleanup(); }
    });
}

test("accept-only owner refuses an unrelated durable actor intent before participant startup and preserves it after restart", {timeout: 45000}, async () => {
    const {IntentJournal} = await import("../src/journal.ts"), {Doc, schemaVersion} = await import("@barocss/doc-sync"), {DEMO_SCHEMA} = await import("../../../fixtures/demo-schema.ts");
    const f = await setup(); let service: Awaited<ReturnType<typeof hosted>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        const journal = await IntentJournal.open(f.journal, {document: "doc", actor: "stable"}), draft = new Doc("stable", DEMO_SCHEMA), snapshot = draft.snapshot(), edits = [{op: "insert" as const, at: [0, 0], content: "unrelated"}];
        try { await journal.prepare({generation: "unrelated-generation", base: {epoch: "unrelated-epoch", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)}, change: {actor: "stable", seq: 1, ops: draft.edit(edits).ops}, edits, snapshot, schema: DEMO_SCHEMA}); } finally { await journal.close(); }
        const original = await f.stateBytes(), before = f.requests.length;
        assert.equal((await f.request(`/${proposal.id}/accept`, "POST", decision)).status, 409);
        assert.equal(f.requests.length, before); assert.deepEqual(await f.stateBytes(), original);
        await stop(service.child, "SIGKILL"); await restartUpstream(f); service = await hosted(f.file, f.endpoint.port);
        assert.equal((await f.request(`/${proposal.id}/accept`, "POST", decision)).status, 409);
        assert.equal(f.requests.length, before); assert.deepEqual(await f.stateBytes(), original);
        const record = await (await f.request(`/${proposal.id}`)).json(); assert.equal(record.status, "pending"); assert.equal(record.decision, undefined);
    } finally { if (service) await stop(service.child); await f.cleanup(); }
});


test("cached applied approval retries require file and directory sync without actor startup or duplicate send", {timeout: 45000}, async () => {
    const f = await setup(); let service: Awaited<ReturnType<typeof hosted>> | undefined;
    try {
        service = await hosted(f.file, f.endpoint.port, "cached-sync-fail"); const proposal = await f.create(), decision = {requestId: randomUUID(), proposalDigest: proposal.proposalDigest};
        const original = await accepted(await f.request(`/${proposal.id}/accept`, "POST", decision)), durable = await f.stateBytes(), before = f.requests.length;
        assert.equal(changeCount(f), 1);
        for (const target of ["file", "directory"]) {
            await writeFile(`${f.file}.sync-fail`, target, {mode: 0o600});
            const failed = await f.request(`/${proposal.id}/reconcile`, "POST", decision); assert.equal(failed.status, 503, `${target} sync EIO cannot return cached success`);
            assert.equal(f.requests.length, before, "cached decision cannot open actor transport or query upstream"); assert.deepEqual(await f.stateBytes(), durable);
            await unlink(`${f.file}.sync-fail`);
            const recovered = await accepted(await f.request(`/${proposal.id}/accept`, "POST", decision)); assert.deepEqual(recovered, original);
            assert.equal(f.requests.length, before); assert.deepEqual(await f.stateBytes(), durable); assert.equal(changeCount(f), 1);
        }
    } finally { if (service) await stop(service.child); await f.cleanup(); }
});
