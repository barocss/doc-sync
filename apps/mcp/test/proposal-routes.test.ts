import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {fixture, call} from "./hosted-fixtures.ts";
import {Doc, schemaVersion, readDocumentSlice} from "@barocss/doc-sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
async function setup() {
    const f = await fixture(); f.service.config.proposals.enabled = true;
    f.service.config.grants[0]!.permissions.push("proposal_read", "proposal_decide");
    f.service.config.grants[1]!.permissions.push("proposal_create");
    const request = (suffix = "", method = "GET", body?: unknown, token = f.readToken) => fetch(`${f.endpoint}/proposals${suffix}`, {method, headers: {authorization: `Bearer ${token}`, ...(body === undefined ? {} : {"content-type": "application/json"})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    return {...f, request};
}
test("proposal creation and rejection leave actual upstream snapshot/sequence unchanged; owner boundary", async () => {
    const f = await setup();
    try {
        const transport = new NodeHttpTransport("doc", "observer", f.config.routes[0]!.upstream), schema = await transport.getSchema(); assert.ok(schema.schema);
        const observer = new SyncClient("observer", {subscribe: transport.subscribe.bind(transport), send: async () => undefined, sendPresence: () => undefined}, {schema: schema.schema}); observer.connect();
        try {
            const deadline = Date.now() + 10000; while (!observer.synchronized) { if (Date.now() > deadline) throw new Error("timeout"); await new Promise(r => setTimeout(r, 5)); }
            const baseline = JSON.stringify(observer.doc.snapshot()), history = JSON.stringify(observer.history.snapshot()), state = await transport.getRecoveryState();
            const children = readDocumentSlice(observer.doc, {limit: 1}).children;
            const baseResponse = await f.request("/base"); assert.equal(baseResponse.status, 200); const base = await baseResponse.json();
            const input = {requestId: randomUUID(), base, change: {kind: "replace_text", path: children[0]!.path, blockId: children[0]!.blockId, start: 0, end: 0, replacement: "hello 😀"}, explanation: "test", assumptions: [], questions: [], checks: []};
            const created = await f.request("", "POST", input); assert.equal(created.status, 200, await created.clone().text()); const summary = await created.json();
            assert.equal((await f.request(`/${summary.id}`)).status, 403);
            const inspected = await f.request(`/${summary.id}`, "GET", undefined, f.token); assert.equal(inspected.status, 200); const record = await inspected.json(); assert.equal(record.status, "pending");
            assert.equal((await f.request(`/${summary.id}/accept`, "POST", {}, f.token)).status, 405);
            const decision = {requestId: randomUUID(), proposalDigest: summary.proposalDigest};
            const rejected = await f.request(`/${summary.id}/reject`, "POST", decision, f.token); assert.equal(rejected.status, 200); assert.equal((await rejected.json()).status, "rejected");
            assert.equal((await f.request("", "POST", input)).status, 200);
            assert.equal((await f.request("", "POST", {...input, explanation: "changed"})).status, 409);
            assert.equal(JSON.stringify(observer.doc.snapshot()), baseline); assert.equal(JSON.stringify(observer.history.snapshot()), history); assert.deepEqual(await transport.getRecoveryState(), state);
            const mutating = f.requests.filter(r => /\/(conditional|changes|ack|presence|recover-change|recovery-lease)(?:\?|$)/.test(r.url));
            // Ordinary MCP slice initialization may reserve/ACK; no proposal operation does.
            assert.deepEqual(mutating, []);
            assert.ok(f.requests.filter(r => r.url.includes("/stream?") && !r.url.includes("actor=observer")).every(r => new URL(r.url, "http://local").searchParams.get("actor") === ""));
        } finally { observer.disconnect(); }
    } finally { await f.cleanup(); }
});
test("unauthorized/unsupported proposals deny before any upstream access and default is disabled", async () => {
    const f = await setup();
    try { const before = f.requests.length;
        assert.equal((await f.request("", "POST", {}, f.token)).status, 403);
        assert.equal((await f.request("", "GET")).status, 403);
        assert.equal((await f.request("/" + "a".repeat(64) + "/accept", "POST", {}, f.token)).status, 405);
        assert.equal((await f.request("", "POST", {actor: "foreign"})).status, 400);
        assert.equal(f.requests.length, before); f.service.config.proposals.enabled = false;
        assert.equal((await f.request("/base")).status, 403); assert.equal(f.requests.length, before);
    } finally { await f.cleanup(); }
});
test("busy actor and unresolved journal refuse capture before upstream; owner list stays available", async () => {
    const f = await setup();
    try {
        const connected = await f.connect(); const count = f.requests.length;
        assert.equal((await f.request("/base")).status, 409); assert.equal(f.requests.length, count);
        assert.equal((await f.request("", "GET", undefined, f.token)).status, 200); assert.equal(f.requests.length, count);
        await connected.transport.terminateSession(); await connected.client.close(); const end = Date.now() + 10000; while (f.service.registry.entries.size) { if (Date.now() > end) throw new Error("timeout"); await new Promise(r => setTimeout(r, 5)); }
        const {IntentJournal} = await import("../src/journal.ts"), {createHash} = await import("node:crypto"), {DEMO_SCHEMA} = await import("../../../fixtures/demo-schema.ts");
        const r = f.service.config.routes[0]!, identity = JSON.stringify([r.upstream, r.upstreamDocument, r.actor]), path = join(f.service.config.dataDir, createHash("sha256").update(identity).digest("hex") + ".json");
        const journal = await IntentJournal.open(path, {document: "doc", actor: r.actor}), doc = new Doc(r.actor, DEMO_SCHEMA), snapshot = doc.snapshot(), edits = [{op: "insert" as const, at: [0, 0], content: "pending"}];
        await journal.prepare({generation: "g", base: {epoch: "e", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)}, change: {actor: r.actor, seq: 1, ops: doc.edit(edits).ops}, edits, snapshot, schema: DEMO_SCHEMA}); await journal.close();
        const bytes = await readFile(path), after = f.requests.length;
        assert.equal((await f.request("/base")).status, 409); assert.equal(f.requests.length, after); assert.deepEqual(await readFile(path), bytes);
        assert.equal((await f.request("", "GET", undefined, f.token)).status, 200); assert.equal(f.requests.length, after);
    } finally { await f.cleanup(); }
});
test("exact generation, schema and revision are mandatory; retargeted store is isolated", async () => {
    const f = await setup();
    try {
        const base = await (await f.request("/base")).json();
        for (const stale of [{...base, generation: "other"}, {...base, schemaVersion: "other"}, {...base, serverSeq: base.serverSeq + 1}, {...base, epoch: "other"}]) {
            const response = await f.request("", "POST", {requestId: randomUUID(), base: stale, change: {kind: "replace_text", path: [0], blockId: "root", start: 0, end: 0, replacement: "X"}, explanation: "stale", assumptions: [], questions: [], checks: []}); assert.equal(response.status, 409);
        }
        const before = f.requests.length; f.service.config.routes[0]!.upstreamDocument = "other";
        assert.deepEqual(await (await f.request("", "GET", undefined, f.token)).json(), []); assert.equal(f.requests.length, before);
    } finally { await f.cleanup(); }
});
test("proposal HTTP host/origin/session/body bounds and slow readers retain existing admission", async () => {
    const f = await setup();
    try {
        const before = f.requests.length, url = `${f.endpoint}/proposals`;
        for (const headers of [{origin: "https://foreign.test"}, {host: "foreign.test"}, {"mcp-session-id": "foreign"}] as Array<Record<string, string>>) {
            const response = await fetch(url, {method: "POST", headers: {authorization: `Bearer ${f.readToken}`, ...headers}, body: "{}"}); assert.ok([400, 403].includes(response.status));
        }
        const oversized = await fetch(url, {method: "POST", headers: {authorization: `Bearer ${f.readToken}`}, body: '"' + "x".repeat(262144) + '"'}); assert.equal(oversized.status, 413);
        f.service.config.limits.bodyReaders = 1; f.service.config.limits.perPrincipalBodyReaders = 1;
        const {request} = await import("node:http");
        const slow = request(url, {method: "POST", headers: {authorization: `Bearer ${f.readToken}`, "content-type": "application/json"}}); slow.on("error", () => undefined); slow.write("{");
        await new Promise(r => setTimeout(r, 50)); const blocked = await f.request("", "POST", {}); assert.equal(blocked.status, 429); slow.destroy();
        assert.equal(f.requests.length, before);
    } finally { await f.cleanup(); }
});
test("owner GET holds bounded admission through store cleanup and shutdown drains it", async () => {
    const {ProposalStore} = await import("../src/proposal-store.ts");
    const original = ProposalStore.prototype.list;
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    ProposalStore.prototype.list = async function () { entered(); await gate; return original.call(this); };
    const f = await setup(); f.service.config.limits.bodyReaders = 1; f.service.config.limits.perPrincipalBodyReaders = 1;
    let stopped: Promise<void> | undefined;
    try {
        const pending = f.request("", "GET", undefined, f.token); await started;
        assert.equal((await f.request("/" + "a".repeat(64), "GET", undefined, f.token)).status, 429);
        assert.equal((await f.request("/base")).status, 429);
        let complete = false; stopped = f.service.shutdown().then(() => { complete = true; });
        await new Promise(r => setTimeout(r, 20)); assert.equal(complete, false);
        release(); assert.equal((await pending).status, 200); await stopped; assert.equal(complete, true);
    } finally { release(); ProposalStore.prototype.list = original; await stopped; await f.cleanup(); }
});
