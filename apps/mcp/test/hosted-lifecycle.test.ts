import assert from "node:assert/strict";
import {test} from "node:test";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {request} from "node:http";
import {readdir} from "node:fs/promises";
import {IntentJournal} from "../src/journal.ts";
import {parseHostedConfig} from "../src/hosted-config.ts";
import {fixture, gate, until, delay, call} from "./hosted-fixtures.ts";

test("canonical actor aliases and invalid journal document IDs fail configuration", async () => {
    const f = await fixture();
    try {
        for (const alias of [f.config.routes[0]!.upstream + "/", f.config.routes[0]!.upstream.replace("http:", "HTTP:")]) {
            const c = structuredClone(f.config); c.routes.push({...c.routes[0]!, slot: "alias", upstream: alias}); assert.throws(() => parseHostedConfig(c), /Duplicate/);
        }
        const c = structuredClone(f.config); c.routes[0]!.upstreamDocument = "INVALID_DOCUMENT"; assert.throws(() => parseHostedConfig(c));
        const foreign = structuredClone(f.config); foreign.grants[1]!.principal = "foreign-observer"; assert.throws(() => parseHostedConfig(foreign), /one principal/);
        const parsed = parseHostedConfig({...f.config, routes: [{...f.config.routes[0]!, upstream: "http://LOCALHOST:80/"}]}); assert.equal(parsed.routes[0]!.upstream, "http://localhost");
    } finally {await f.cleanup();}
});
test("read grants cannot directly invoke any mutation or schema tool", async () => {
    const f = await fixture(); const {client, transport} = await f.connect(f.readToken);
    try {
        const view = await call(client, "read_document"), count = f.requests.length;
        const schema = (await call(client, "get_schema")).schema;
        const args: Record<string, Record<string, unknown>> = {
            edit_document: {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "denied"}]}, set_presence: {base: view.revision, name: "a", color: "#123456", anchor: null, focus: null},
            transition_schema: {base: view.revision, schema},
        };
        for (const name of ["edit_document", "retry_edit", "undo", "redo", "discard_history", "set_presence", "upgrade_schema", "transition_schema"]) {
            const result = await client.callTool({name, arguments: args[name] ?? {}}); assert.equal(result.isError, true, name); assert.match(JSON.stringify(result), /permission denied/);
        }
        assert.equal(f.requests.length, count);
        assert.ok(f.requests.every(r => r.authorization === "Bearer configured-upstream"));
        await transport.terminateSession();
    } finally {await client.close(); await f.cleanup();}
});
test("duplicate initialize and provisional capacity reserve before schema discovery", async () => {
    const blocker = gate(), entered = gate(); let block = true;
    const f = await fixture({limits: {sessions: 1, perPrincipal: 1}, intercept: async (req, res) => {
        if (block && req.url!.endsWith("/schema")) { entered.release(); await blocker.wait; block = false; }
        return false;
    }});
    let first: Awaited<ReturnType<typeof f.connect>> | undefined;
    const opening = f.connect(); opening.catch(() => {});
    try {
        await entered.wait; assert.equal(f.service.registry.entries.size, 1);
        await assert.rejects(f.connect(), {code: 429});
        blocker.release(); first = await opening; await first.transport.terminateSession(); assert.equal(f.service.registry.entries.size, 0);
    } finally {blocker.release(); await first?.client.close(); await f.cleanup();}
});
test("DELETE drains a delayed edit, retains its journal lock, and sends no late leave", {timeout: 20000}, async () => {
    const editGate = gate(), editEntered = gate();
    const f = await fixture({intercept: async (req, _res) => {
        if (req.url!.endsWith("/conditional")) {editEntered.release(); await editGate.wait;}
        return false;
    }});
    const {client, transport} = await f.connect();
    try {
        const view = await call(client, "read_document");
        const edit = call(client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "delayed"}]}); edit.catch(() => {});
        await editEntered.wait;
        let deleted = false; const deleting = transport.terminateSession().then(() => {deleted = true;});
        await delay(20); assert.equal(deleted, false); assert.equal(f.service.registry.entries.size, 1);
        await assert.rejects(f.connect(), {code: 429});
        const names = await readdir(f.config.dataDir), journal = names.find(n => n.endsWith(".json"))!;
        await assert.rejects(IntentJournal.open(join(f.config.dataDir, journal), {document: "doc", actor: "stable"}), /lock|owned|busy|active writer/i);
        editGate.release(); await edit; await deleting; assert.equal(f.service.registry.entries.size, 0);
        assert.equal(f.requests.some(r => r.url.endsWith("/leave")), false);
        const replacement = await f.connect(); await call(replacement.client, "read_document"); await replacement.transport.terminateSession(); await replacement.client.close();
        const reopened = await IntentJournal.open(join(f.config.dataDir, journal), {document: "doc", actor: "stable"}); await reopened.close();
    } finally {editGate.release(); await client.close(); await f.cleanup();}
});
test("idle cleanup closes the actor and repeated shutdown shares one promise", async () => {
    const f = await fixture({limits: {idleMs: 30}}); const {client} = await f.connect();
    try { await until(() => !f.service.registry.entries.size); assert.equal(f.requests.some(r => r.url.endsWith("/leave")), false); const first = f.service.shutdown(); assert.equal(f.service.shutdown(), first); await first; }
    finally {await client.close(); await f.cleanup();}
});
test("shutdown refuses initialize whose body completes after shutdown starts", {timeout: 10000}, async () => {
    const f = await fixture();
    const req = request(f.endpoint, {method: "POST", headers: {authorization: `Bearer ${f.token}`, "content-type": "application/json"}});
    const response = new Promise<number>(resolve => req.on("response", res => {res.resume(); resolve(res.statusCode!);}));
    req.write('{"jsonrpc":"2.0",'); await delay(20);
    const closing = f.service.shutdown(); req.end('"id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}');
    try {assert.equal(await response, 503); await closing; assert.equal(f.service.registry.entries.size, 0); assert.equal(f.requests.length, 0);}
    finally {req.destroy(); await f.cleanup();}
});
test("chunked overflow gets 413 and bounded raw-body readers reject slow parallel bodies", {timeout: 10000}, async () => {
    const f = await fixture({limits: {bodyBytes: 256, bodyReaders: 1, perPrincipalBodyReaders: 1}});
    try {
        const slow = request(f.endpoint, {method: "POST", headers: {authorization: `Bearer ${f.token}`}});
        const slowResponse = new Promise<number>(resolve => slow.on("response", res => {res.resume(); resolve(res.statusCode!);})); slow.write("{"); await delay(20);
        assert.equal((await fetch(f.endpoint, {method: "POST", headers: {authorization: `Bearer ${f.token}`}, body: "{}"})).status, 429);
        slow.end("}"); assert.equal(await slowResponse, 400);
        const chunked = request(f.endpoint, {method: "POST", headers: {authorization: `Bearer ${f.token}`}});
        const oversized = new Promise<number>((resolve, reject) => {chunked.on("response", res => {res.resume(); resolve(res.statusCode!);}); chunked.on("error", reject);});
        chunked.write("x".repeat(257)); chunked.end(); assert.equal(await oversized, 413);
        assert.equal(f.requests.length, 0);
    } finally {await f.cleanup();}
});
test("admitted tool calls are bounded while a schema read is delayed", async () => {
    const entered = gate(), release = gate(); let blocked = false;
    const f = await fixture({limits: {calls: 1}, intercept: async (req, _res) => { if (blocked && req.url!.endsWith("/schema")) {entered.release(); await release.wait;} return false;}});
    const {client, transport} = await f.connect();
    try {
        blocked = true; const first = call(client, "get_server_schema"); await entered.wait;
        const overflow = await client.callTool({name: "read_document", arguments: {}}); assert.equal(overflow.isError, true); assert.match(JSON.stringify(overflow), /capacity/);
        release.release(); await first; blocked = false; await transport.terminateSession();
    } finally {release.release(); await client.close(); await f.cleanup();}
});
test("failed initialize releases provisional capacity and rejects unsafe existing data directories", async () => {
    let rejectSchema = true;
    const f = await fixture({limits: {sessions: 1}, intercept: async (req, res) => {if (rejectSchema && req.url!.endsWith("/schema")) {res.writeHead(503); res.end("{}"); return true;} return false;}});
    try {
        await assert.rejects(f.connect(), {code: 503}); assert.equal(f.service.registry.entries.size, 0);
        rejectSchema = false; const first = await f.connect(); await first.transport.terminateSession(); await first.client.close();
        const {chmod} = await import("node:fs/promises"); await chmod(f.config.dataDir, 0o755);
        await assert.rejects(f.connect(), {code: 503}); assert.equal(f.service.registry.entries.size, 0); await chmod(f.config.dataDir, 0o700);
        const second = await f.connect(); await second.transport.terminateSession(); await second.client.close();
    } finally {await f.cleanup();}
});
test("retargeted route cannot load the previous physical actor checkpoint", async () => {
    const f = await fixture();
    try {
        const first = await f.connect(); const view = await call(first.client, "read_document"); await call(first.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "old-document"}]}); await first.transport.terminateSession(); await first.client.close();
        const physical = JSON.stringify([f.config.routes[0]!.upstream, "doc", "stable"]); const original = createHash("sha256").update(physical).digest("hex");
        assert.ok((await readdir(f.config.dataDir)).includes(`${original}.json.checkpoint`));
        f.service.config.routes[0]!.upstreamDocument = "new-doc";
        const second = await f.connect(); assert.doesNotMatch(JSON.stringify(await call(second.client, "read_document")), /old-document/); await second.transport.terminateSession(); await second.client.close();
        assert.equal((await readdir(f.config.dataDir)).filter(name => name.endsWith(".lock")).length, 2);
    } finally {await f.cleanup();}
});
test("read credential cannot replay a pending checkpoint; write credential recovers it and preserves user text", async () => {
    const {Doc} = await import("@barocss/doc-sync"); const {SyncClient} = await import("@barocss/doc-sync/sync"); const {NodeHttpTransport} = await import("@barocss/doc-sync/node"); const {readFile} = await import("node:fs/promises");
    const f = await fixture();
    try {
        const initial = await f.connect(); const view = await call(initial.client, "read_document"); await call(initial.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "A"}]}); await initial.transport.terminateSession(); await initial.client.close();
        const journalPath = join(f.config.dataDir, (await readdir(f.config.dataDir)).find(name => name.endsWith(".json.lock"))!.replace(/\.lock$/, ""));
        const journal = await IntentJournal.open(journalPath, {document: "doc", actor: "stable"}); const checkpoint = (await journal.readCheckpoint())!;
        const {format, document, actor, recordDigest, ...input} = checkpoint;
        const draft = Doc.fromSnapshot("stable", input.client.snapshot, input.schema); const {ops} = draft.edit([{op: "insert", at: [0, 1], content: "P"}]); const change = {actor: "stable", seq: input.client.seq + 1, ops};
        await journal.writeCheckpoint({...input, client: {...input.client, seq: change.seq, pending: [change], snapshot: draft.snapshot()}}); await journal.close();
        const exact = await readFile(`${journalPath}.checkpoint`, "utf8"), requestCount = f.requests.length;
        await assert.rejects(f.connect(f.readToken), {code: 503}); assert.equal(f.requests.length, requestCount); assert.equal(await readFile(`${journalPath}.checkpoint`, "utf8"), exact);
        const human = new SyncClient("human", new NodeHttpTransport("doc", "human", f.upstream.url), {schema: input.schema}); human.connect(); await until(() => human.synchronized && human.schemaVerified);
        human.commit(human.doc.edit([{op: "insert", at: [0, 1], content: "H"}]).ops); await until(() => !human.pending.length); human.disconnect();
        const recovered = await f.connect(); const output = JSON.stringify(await call(recovered.client, "read_document")); assert.match(output, /H/); assert.match(output, /P/);
        assert.equal(f.requests.filter(r => r.url.endsWith("/recover-change")).length, 1); await recovered.transport.terminateSession(); await recovered.client.close();
    } finally {await f.cleanup();}
});
test("foreign routes, guessed sessions and forged identity headers cannot change selected actor", async () => {
    const f = await fixture(); const {client, transport} = await f.connect();
    try {
        const id = transport.sessionId!;
        for (const method of ["POST", "GET", "DELETE"]) {
            assert.equal((await fetch(f.endpoint, {method, headers: {authorization: `Bearer ${f.token}`, "mcp-session-id": "guessed"}})).status, 404);
            for (const path of ["/mcp/foreign/d/s", "/mcp/t/foreign/s", "/mcp/t/d/foreign"]) assert.equal((await fetch(new URL(path, f.endpoint), {method, headers: {authorization: `Bearer ${f.token}`, "mcp-session-id": id}})).status, 403);
        }
        const reply = await fetch(f.endpoint, {method: "POST", headers: {authorization: `Bearer ${f.token}`, "mcp-session-id": id, "content-type": "application/json", accept: "application/json, text/event-stream", "x-doc-sync-actor": "evil", "x-principal": "evil", "x-forwarded-host": "evil.example"}, body: JSON.stringify({jsonrpc: "2.0", id: 100, method: "tools/call", params: {name: "read_document", arguments: {}}})}); assert.equal(reply.status, 200);
        assert.ok(f.requests.filter(r => r.url.includes("/stream?")).every(r => r.url.includes("actor=stable") && !r.url.includes("evil")));
        const denied = await client.callTool({name: "read_document", arguments: {actor: "evil", url: "http://evil.example"}}); assert.equal(denied.isError, true);
        await transport.terminateSession();
    } finally {await client.close(); await f.cleanup();}
});
test("schema permission changes only the configured document", async () => {
    const f = await fixture(); const {client, transport} = await f.connect();
    try {
        const view = await call(client, "read_document"), schema = (await call(client, "get_schema")).schema;
        await call(client, "transition_schema", {base: view.revision, schema}); await call(client, "upgrade_schema");
        assert.ok(f.requests.filter(r => r.url.endsWith("/schema")).every(r => r.url.startsWith("/api/docs/doc/")));
        await transport.terminateSession();
    } finally {await client.close(); await f.cleanup();}
});
test("stdio shutdown reads settled state after its admitted queue drains", async () => {
    const {shutdownSession} = await import("../src/shutdown.ts"); const calls: string[] = [];
    const session = {client: {pending: [], conditionalPending: false}, async drain() {this.client.conditionalPending = true; calls.push("drain");}, async close() {calls.push("close");}};
    await shutdownSession(session, {async leave() {calls.push("leave");}}); assert.deepEqual(calls, ["drain", "close"]);
});
