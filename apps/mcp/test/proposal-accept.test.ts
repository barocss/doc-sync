import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {fixture, call, until} from "./hosted-fixtures.ts";
import {Doc, readDocumentSlice, schemaVersion} from "@barocss/doc-sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DocumentSession} from "../src/session.ts";
import {authorizeProposalIntent} from "../src/proposal-accept.ts";
import {digest, POLICY_FINGERPRINT, ACCEPTANCE_POLICY_FINGERPRINT, proposalId, type ProposalRecord} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
async function setup(options: Parameters<typeof fixture>[0] = {}) {
    const f = await fixture(options); f.service.config.proposals.enabled = true; f.service.config.proposals.acceptanceEnabled = true;
    f.service.config.grants[0]!.permissions.push("proposal_read", "proposal_decide", "proposal_accept");
    f.service.config.grants[1]!.permissions.push("proposal_create");
    const request = (suffix = "", method = "GET", data?: unknown, token = f.token) => fetch(`${f.endpoint}/proposals${suffix}`, {method, headers: {authorization: `Bearer ${token}`, ...(data ? {"content-type": "application/json"} : {})}, ...(data ? {body: JSON.stringify(data)} : {})});
    const create = async (replacement = "hello 😀", questions: string[] = [], start = 0, end = 0) => {
        const base = await (await request("/base", "GET", undefined, f.readToken)).json();
        const input = {requestId: randomUUID(), base, change: {kind: "replace_text", path: [0], blockId: "0@~root", start, end, replacement}, explanation: "synthetic", assumptions: [], questions, checks: []};
        const r = await request("", "POST", input, f.readToken); assert.equal(r.status, 200, await r.clone().text()); return {input, summary: await r.json()};
    };
    return {...f, request, create};
}
test("owner accept applies one immutable edit; same attempt is idempotent; restored actor undo preserves foreign edits", async () => {
    const f = await setup();
    try {
        const {summary} = await f.create(), decision = {requestId: randomUUID(), proposalDigest: summary.proposalDigest};
        const applied = await f.request(`/${summary.id}/accept`, "POST", decision); assert.equal(applied.status, 200, await applied.clone().text());
        const record = await applied.json(); assert.equal(record.status, "applied", JSON.stringify(record)); assert.ok(record.attempt.evidenceDigest); assert.ok(record.attempt.receipt.serverSeq > 0);
        const sent = f.requests.filter(r => r.url.includes("/conditional")).length;
        const repeat = await f.request(`/${summary.id}/accept`, "POST", decision); assert.equal((await repeat.json()).status, "applied"); assert.equal(f.requests.filter(r => r.url.includes("/conditional")).length, sent);
        assert.equal((await f.request(`/${summary.id}/reject`, "POST", {...decision, requestId: randomUUID()})).status, 409);
        const route = f.service.config.routes[0]!, transport = new NodeHttpTransport("doc", "foreign", route.upstream), schema = await transport.getSchema();
        const human = new DocumentSession("foreign", transport, schema.schema!); await human.start(); await until(() => human.client.synchronized);
        assert.equal(human.client.doc.blocks()[0]!.kind, "text"); assert.equal(human.client.doc.toJSON().children![0]!.runs?.map(r => "text" in r ? r.text : "").join(""), "hello 😀");
        await human.edit((await human.read()).revision!, [{op: "insert", at: [0, 0], content: "H"}]); await human.close();
        const actor = await f.connect();
        try {
            await call(actor.client, "undo");
            const afterUndo = await call(actor.client, "read_document"); assert.equal((afterUndo.document as any).children[0].runs.map((r: any) => r.text ?? "").join(""), "H");
            await call(actor.client, "redo");
            const afterRedo = await call(actor.client, "read_document"); assert.equal((afterRedo.document as any).children[0].runs.map((r: any) => r.text ?? "").join(""), "Hhello 😀");
        } finally { await actor.transport.terminateSession(); await actor.client.close(); }
    } finally { await f.cleanup(); }
});
test("accept is separate opt-in; wrong digest, creator, unanswered questions and overrides deny without upstream", async () => {
    const f = await setup();
    try {
        const {summary} = await f.create(), path = `/${summary.id}/accept`, decision = {requestId: randomUUID(), proposalDigest: summary.proposalDigest};
        const before = f.requests.length;
        assert.equal((await f.request(path, "POST", decision, f.readToken)).status, 403);
        assert.equal((await f.request(path, "POST", {...decision, actor: "foreign"})).status, 400);
        assert.equal((await f.request(path, "POST", {...decision, proposalDigest: "a".repeat(64)})).status, 409);
        f.service.config.proposals.acceptanceEnabled = false; assert.equal((await f.request(path, "POST", decision)).status, 405); f.service.config.proposals.acceptanceEnabled = true;
        assert.equal(f.requests.length, before);
        const unanswered = await f.create("Q", ["Required?"]), after = f.requests.length;
        assert.equal((await f.request(`/${unanswered.summary.id}/accept`, "POST", {requestId: randomUUID(), proposalDigest: unanswered.summary.proposalDigest})).status, 409); assert.equal(f.requests.length, after);
    } finally { await f.cleanup(); }
});
test("changed authoritative base marks stale and sends no conditional change", async () => {
    const f = await setup();
    try {
        const {summary} = await f.create(), route = f.service.config.routes[0]!, transport = new NodeHttpTransport("doc", "foreign", route.upstream), schema = await transport.getSchema();
        const human = new DocumentSession("foreign", transport, schema.schema!); await human.start(); await until(() => human.client.synchronized); await human.edit((await human.read()).revision!, [{op: "insert", at: [0, 0], content: "foreign"}]); await human.close();
        const before = f.requests.filter(r => r.url.includes("/conditional")).length;
        const accepted = await f.request(`/${summary.id}/accept`, "POST", {requestId: randomUUID(), proposalDigest: summary.proposalDigest}); assert.equal(accepted.status, 200); assert.equal((await accepted.json()).status, "stale"); assert.equal(f.requests.filter(r => r.url.includes("/conditional")).length, before);
    } finally { await f.cleanup(); }
});
test("prepared guard refuses wire scope escapes and runs before journal.prepare or transport", async () => {
    const owner = {principal: "p", routeKey: "a".repeat(64), actor: "stable"}, doc = new Doc(owner.actor, DEMO_SCHEMA);
    const base = {generation: "g", epoch: "e", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)}, requestId = randomUUID();
    const change = {kind: "replace_text" as const, path: [0], blockId: readDocumentSlice(doc, {limit: 1}).children[0]!.blockId!, start: 0, end: 0, replacement: "x"};
    const payload = {format: 1 as const, id: proposalId(owner, requestId), owner, request: {requestId, base, change, explanation: "fixture", assumptions: [], questions: [], checks: []}, ...previewReplacement("", change), policyFingerprint: POLICY_FINGERPRINT};
    const record = {payload, proposalDigest: digest(payload), status: "applying", stateVersion: 2, decision: {kind: "accept", approvalPolicyFingerprint: ACCEPTANCE_POLICY_FINGERPRINT, requestId, principal: "p", grantId: "owner", proposalDigest: digest(payload)}, attempt: {id: requestId}, recordDigest: "a".repeat(64)} as ProposalRecord;
    const snapshot = doc.snapshot(), edits = [{op: "insert" as const, at: [0, 0], content: "x"}], candidate = Doc.fromSnapshot(owner.actor, snapshot, DEMO_SCHEMA).edit(edits).ops;
    const prepared = {generation: "g", base: {epoch: "e", serverSeq: 0, schemaVersion: base.schemaVersion}, change: {actor: owner.actor, seq: 1, ops: candidate}, edits, snapshot, schema: DEMO_SCHEMA};
    authorizeProposalIntent(record, prepared);
    for (const op of [{t: "node", id: {lamport: 1, actor: "stable"}, origin: {lamport: 0, actor: "~root"}, type: "paragraph"}, {t: "set", at: {lamport: 1, actor: "stable"}, ids: [], key: "x", value: 1}, {...candidate[0], origin: {lamport: 99, actor: "foreign"}}, {...candidate[0], marks: {bold: true}}, {t: "del", at: {lamport: 1, actor: "stable"}, ids: [{lamport: 99, actor: "foreign"}]}]) assert.throws(() => authorizeProposalIntent(record, {...prepared, change: {...prepared.change, ops: [op as any]}}));
    const dir = await mkdtemp(join(tmpdir(), "proposal-guard-")), journal = await IntentJournal.open(join(dir, "intent.json"), {document: "doc", actor: owner.actor});
    let preparedCount = 0, sends = 0; journal.prepare = async () => { preparedCount++; throw new Error("must not prepare"); };
    const transport = {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}, submitConditional: async () => { sends++; throw new Error("must not send"); }, getSchema: async () => ({schema: DEMO_SCHEMA}), transitionSchema: async () => { throw new Error("unused"); }};
    const session = new DocumentSession(owner.actor, transport as any, DEMO_SCHEMA, 20, journal, undefined, () => { throw new Error("forbidden"); });
    try {
        // Exercise the actual submit boundary with a controlled ready client; no startup transport.
        Object.defineProperty(session.client, "conditionalEvidence", {get: () => prepared});
        (session as any).generation = {epoch: "e", value: "g"};
        const before = JSON.stringify({snapshot: session.client.doc.snapshot(), history: session.client.history.snapshot()});
        const result = await (session as any).submitConditional(prepared.base, prepared.change); assert.equal(result.code, "not_sent"); assert.equal(preparedCount, 0); assert.equal(sends, 0); assert.equal(await journal.read(), null);
        assert.equal(JSON.stringify({snapshot: session.client.doc.snapshot(), history: session.client.history.snapshot()}), before);
    } finally { await session.close(); await rm(dir, {recursive: true, force: true}); }
});

test("two scalar-range replacements form separate actor history groups", async () => {
    const f = await setup();
    try {
        const r = f.service.config.routes[0]!, transport = new NodeHttpTransport("doc", "seed", r.upstream), schema = await transport.getSchema();
        const seed = new DocumentSession("seed", transport, schema.schema!); await seed.start(); await until(() => seed.client.synchronized);
        await seed.edit((await seed.read()).revision!, [{op: "insert", at: [0, 0], content: "prefix 😀 suffix"}]); await seed.close();
        for (const [replacement, end] of [["X", 9], ["Y", 8]] as const) {
            const {summary} = await f.create(replacement, [], 7, end);
            const response = await f.request(`/${summary.id}/accept`, "POST", {requestId: randomUUID(), proposalDigest: summary.proposalDigest});
            assert.equal(response.status, 200); assert.equal((await response.json()).status, "applied");
        }
        const actor = await f.connect();
        try {
            const text = async () => ((await call(actor.client, "read_document")).document as any).children[0].runs.map((r: any) => r.text ?? "").join("");
            assert.equal(await text(), "prefix Y suffix");
            await call(actor.client, "undo"); assert.equal(await text(), "prefix X suffix");
            await call(actor.client, "undo"); assert.equal(await text(), "prefix 😀 suffix");
        } finally { await actor.transport.terminateSession(); await actor.client.close(); }
    } finally { await f.cleanup(); }
});

test("a concurrent change before submission settles the exact rejected attempt without blocking fresh reads", async () => {
    let armed = false, race = false, human: DocumentSession | undefined;
    const f = await setup({intercept: async req => {
        if (armed && !race && req.url?.includes("/conditional")) {
            race = true;
            await human!.edit((await human!.read()).revision!, [{op: "insert", at: [0, 0], content: "H"}]);
        }
        return false;
    }});
    try {
        const {summary} = await f.create("approved"), route = f.service.config.routes[0]!, transport = new NodeHttpTransport("doc", "foreign", route.upstream), schema = await transport.getSchema();
        human = new DocumentSession("foreign", transport, schema.schema!); await human.start(); await until(() => human!.client.synchronized);
        armed = true;
        const decision = {requestId: randomUUID(), proposalDigest: summary.proposalDigest};
        const response = await f.request(`/${summary.id}/accept`, "POST", decision); assert.equal(response.status, 200);
        const result = await response.json(); assert.equal(result.status, "not_applied"); assert.ok(result.attempt.evidenceDigest); assert.equal(race, true);
        await until(() => human!.client.synchronized);
        assert.equal(human.client.doc.toJSON().children![0]!.runs!.map(r => "text" in r ? r.text : "").join(""), "H");
        const {readFile} = await import("node:fs/promises"), {createHash} = await import("node:crypto");
        const identity = JSON.stringify([route.upstream, route.upstreamDocument, route.actor]), path = join(f.service.config.dataDir, createHash("sha256").update(identity).digest("hex") + ".json");
        await assert.rejects(readFile(path), {code: "ENOENT"});
        const before = await readFile(`${path}.checkpoint`);
        const sends = f.requests.filter(r => r.url.includes("/conditional")).length;
        const repeat = await f.request(`/${summary.id}/accept`, "POST", decision); assert.equal((await repeat.json()).status, "not_applied");
        assert.equal(f.requests.filter(r => r.url.includes("/conditional")).length, sends); assert.deepEqual(await readFile(`${path}.checkpoint`), before);
        assert.equal((await f.request("/base", "GET", undefined, f.readToken)).status, 200);
    } finally { await human?.close(); await f.cleanup(); }
});

test("a prepared authorizer requires durability before any transport contact", () => {
    let contacts = 0;
    const transport = new Proxy({}, {get() { contacts++; throw new Error("Transport must not be inspected"); }});
    assert.throws(() => new DocumentSession("stable", transport as any, DEMO_SCHEMA, 20, null, undefined, () => {}), /requires a durable journal/);
    assert.equal(contacts, 0);
    const ephemeral = new DocumentSession("ephemeral", {} as any, DEMO_SCHEMA);
    assert.equal(ephemeral.client.actor, "ephemeral");
});

test("cached terminal approval confirms file and directory durability before acknowledgment", async () => {
    const {open, readFile} = await import("node:fs/promises");
    const f = await setup();
    let prototype: any, originalSync: any;
    try {
        const {summary} = await f.create(), decision = {requestId: randomUUID(), proposalDigest: summary.proposalDigest};
        const response = await f.request(`/${summary.id}/accept`, "POST", decision); assert.equal(response.status, 200); const applied = await response.json(); assert.equal(applied.status, "applied");
        const proposalPath = join(f.service.config.dataDir, "proposals", digest([applied.payload.owner.routeKey, applied.payload.owner.principal]), `${summary.id}.json`);
        const bytes = await readFile(proposalPath), handle = await open(proposalPath, "r"); prototype = Object.getPrototypeOf(handle); originalSync = prototype.sync; await handle.close();
        const before = f.requests.length;
        for (const kind of ["file", "directory"]) {
            let failures = 0;
            prototype.sync = async function () {
                const stat = await this.stat();
                if (kind === "file" ? stat.isFile() : stat.isDirectory()) { failures++; const error = new Error("Injected transient sync failure") as NodeJS.ErrnoException; error.code = "EIO"; throw error; }
                return originalSync.call(this);
            };
            try {
                const failed = await f.request(`/${summary.id}/reconcile`, "POST", decision); assert.equal(failed.status, 503); assert.equal(failures, 1);
                assert.equal(f.requests.length, before); assert.deepEqual(await readFile(proposalPath), bytes);
            } finally { prototype.sync = originalSync; }
            const retried = await f.request(`/${summary.id}/accept`, "POST", decision); assert.equal(retried.status, 200); assert.deepEqual(await retried.json(), applied);
            assert.equal(f.requests.length, before); assert.deepEqual(await readFile(proposalPath), bytes);
        }
    } finally { if (prototype && originalSync) prototype.sync = originalSync; await f.cleanup(); }
});
