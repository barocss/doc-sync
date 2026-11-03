import assert from "node:assert/strict";
import {test} from "node:test";
import {randomBytes} from "node:crypto";
import {createServer as http} from "node:http";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {createHostedService} from "../src/hosted.ts";
import {parseHostedConfig} from "../src/hosted-config.ts";
import {SessionRegistry} from "../src/session-registry.ts";
import {createServer} from "../src/server.ts";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import type {DocumentSession} from "../src/session.ts";
const token = randomBytes(32).toString("base64url"), readToken = randomBytes(32).toString("base64url");
function configuration(dataDir: string, upstream = "http://127.0.0.1:1") { return {dataDir, hosts: ["127.0.0.1:0"], routes: [{tenant: "t", document: "d", slot: "s", actor: "stable-actor", upstreamDocument: "doc", upstream}],
    grants: [{id: "write", principal: "p", token, routes: ["/mcp/t/d/s"], permissions: ["read", "write", "schema"]}, {id: "read", principal: "p", token: readToken, routes: ["/mcp/t/d/s"], permissions: ["read"]}]}; }
async function listen(server: ReturnType<typeof http>) { server.listen(0, "127.0.0.1"); await once(server, "listening"); const a = server.address(); assert.ok(a && typeof a !== "string"); return `http://127.0.0.1:${a.port}`; }
test("strict configuration and synchronous capacity reservations", () => {
    assert.throws(() => parseHostedConfig({...configuration("/tmp/x"), unexpected: true}));
    const c = configuration("/tmp/x"); c.grants[0]!.token = "a"; assert.throws(() => parseHostedConfig(c));
    const registry = new SessionRegistry<object>(2, 1), owner = {};
    registry.reserve("a", "p", owner); assert.throws(() => registry.reserve("a", "q", {})); assert.throws(() => registry.reserve("b", "p", {}));
    registry.release("a", {}); assert.equal(registry.entries.size, 1); registry.release("a", owner); assert.equal(registry.entries.size, 0);
});
test("every tool authorization runs before session access", async () => {
    let reads = 0;
    const session = new Proxy({}, {get() { reads++; throw new Error("Session accessed"); }}) as DocumentSession;
    const server = createServer(session, {authorizeTool() { throw new Error("Denied"); }});
    const [left, right] = InMemoryTransport.createLinkedPair(); await server.connect(right);
    const client = new Client({name: "test", version: "1"}); await client.connect(left);
    try {
        for (const {name} of (await client.listTools()).tools) {
            let args = {};
            if (name === "transition_schema") args = {base: {epoch: "e", serverSeq: 0, schemaVersion: "s"}, schema: {}};
            if (name === "edit_document") args = {base: {epoch: "e", serverSeq: 0, schemaVersion: null}, edits: [{op: "insert", at: [0, 0], content: "x"}]};
            if (name === "set_presence") args = {base: {epoch: "e", serverSeq: 0, schemaVersion: null}, name: "a", color: "#123456", anchor: null, focus: null};
            assert.equal((await client.callTool({name, arguments: args})).isError, true, name);
        }
        assert.equal(reads, 0);
    } finally { await client.close(); await server.close(); }
});
test("HTTP boundary rejects credentials, host, origin and bodies before upstream", async () => {
    let upstreamCalls = 0; const upstream = http((_req, res) => { upstreamCalls++; res.end("{}"); }); const upstreamUrl = await listen(upstream);
    const service = createHostedService(configuration("/tmp/not-opened", upstreamUrl)); const base = await listen(service.server); service.config.hosts.push(new URL(base).host);
    const endpoint = `${base}/mcp/t/d/s`;
    try {
        for (const method of ["POST", "GET", "DELETE"]) for (const authorization of ["", "Bearer wrong"]) assert.equal((await fetch(endpoint, {method, headers: {authorization}})).status, 401);
        assert.equal((await fetch(endpoint, {method: "POST", headers: {authorization: `Bearer ${token}`, origin: "https://evil.example"}})).status, 403);
        const hosts = service.config.hosts.splice(0);
        assert.equal((await fetch(endpoint, {method: "POST", headers: {authorization: `Bearer ${token}`}})).status, 403); service.config.hosts.push(...hosts);
        assert.equal((await fetch(endpoint, {method: "POST", headers: {authorization: `Bearer ${token}`}, body: "{"})).status, 400);
        assert.equal((await fetch(endpoint, {method: "POST", headers: {authorization: `Bearer ${token}`}, body: "x".repeat(1048577)})).status, 413);
        assert.equal((await fetch(`${endpoint}?access_token=${token}`, {headers: {authorization: `Bearer ${token}`}})).status, 400);
        assert.equal((await fetch(endpoint, {method: "POST", headers: {authorization: `Bearer ${token}`, origin: ""}})).status, 403);
        assert.equal(upstreamCalls, 0);
    } finally { await service.shutdown(); upstream.close(); }
});
test("SDK HTTP initialize, grant binding, edit, DELETE and stable reconnect history", {timeout: 40000}, async () => {
    const dir = await mkdtemp(join(tmpdir(), "hosted-mcp-"));
    const demo = spawn(process.execPath, [new URL("../../demo/server.ts", import.meta.url).pathname], {env: {...process.env, PORT: "0", DATA_DIR: join(dir, "upstream")}, stdio: ["ignore", "pipe", "pipe"]});
    let err = ""; demo.stderr.on("data", b => { err += b; });
    const upstream = await new Promise<string>((resolve, reject) => { let out = ""; const timer = setTimeout(() => reject(new Error(err)), 10000); demo.stdout.on("data", b => { out += b; const m = out.match(/http:\/\/localhost:\d+(?=\r?\n)/); if (m) {clearTimeout(timer); resolve(m[0]);} }); });
    const service = createHostedService(configuration(join(dir, "journals"), upstream)); const base = await listen(service.server); service.config.hosts.push(new URL(base).host); const endpoint = new URL(`${base}/mcp/t/d/s`);
    const connect = async () => { const client = new Client({name: "hosted-test", version: "1"}); const transport = new StreamableHTTPClientTransport(endpoint, {requestInit: {headers: {authorization: `Bearer ${token}`}}}); await client.connect(transport); return {client, transport}; };
    let current: Awaited<ReturnType<typeof connect>> | undefined;
    try {
        current = await connect();
        assert.ok((await current.client.listTools()).tools.length >= 12);
        const id = current.transport.sessionId!;
        for (const method of ["GET", "DELETE", "POST"]) assert.equal((await fetch(endpoint, {method, headers: {authorization: `Bearer ${readToken}`, "mcp-session-id": id}})).status, 403);
        const view = (await current.client.callTool({name: "read_document", arguments: {}})).structuredContent as Record<string, unknown>;
        const edited = await current.client.callTool({name: "edit_document", arguments: {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "persist"}]}}); assert.equal(edited.isError, undefined, JSON.stringify(edited));
        await current.transport.terminateSession(); await current.client.close(); current = undefined;
        assert.equal(service.registry.entries.size, 0);
        current = await connect();
        const undone = await current.client.callTool({name: "undo", arguments: {}}); assert.equal(undone.isError, undefined, JSON.stringify(undone));
        await current.transport.terminateSession(); await current.client.close(); current = undefined;
    } finally { await current?.client.close(); await service.shutdown(); demo.kill("SIGTERM"); await once(demo, "exit"); await rm(dir, {recursive: true, force: true}); }
});
