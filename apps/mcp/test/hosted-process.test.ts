import assert from "node:assert/strict";
import {test} from "node:test";
import {spawn, type ChildProcess} from "node:child_process";
import {writeFile, readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {once} from "node:events";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {fixture, demo, stop, call, until, gate} from "./hosted-fixtures.ts";
async function hosted(configFile: string, port: string) {
    const child = spawn(process.execPath, [new URL("../src/http-main.ts", import.meta.url).pathname], {env: {...process.env, DOC_SYNC_HOSTED_CONFIG: configFile, PORT: port}, stdio: ["ignore", "pipe", "pipe"]});
    let logs = ""; child.stderr!.on("data", b => {logs += b;});
    await until(() => logs.includes("Hosted MCP listening") || child.exitCode !== null);
    assert.equal(child.exitCode, null, logs); return {child, logs: () => logs};
}
const documentText = (value: Record<string, unknown>) => JSON.stringify(value.document);
test("real SIGKILL + MCP/upstream process restart restores actor history and preserves second actor", {timeout: 40000}, async () => {
    const f = await fixture(); await f.service.shutdown();
    const config = structuredClone(f.config); config.hosts = [f.endpoint.host];
    config.routes.push({...config.routes[0]!, slot: "second", actor: "other"});
    config.grants[0]!.routes.push("/mcp/t/d/second");
    const file = join(f.dir, "config.json"); await writeFile(file, JSON.stringify(config), {mode: 0o600});
    let process: Awaited<ReturnType<typeof hosted>> | undefined, first: Awaited<ReturnType<typeof f.connect>> | undefined, second: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        process = await hosted(file, f.endpoint.port); first = await f.connect();
        let view = await call(first.client, "read_document"); await call(first.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "A"}]});
        second = await f.connect(f.token, new URL("/mcp/t/d/second", f.endpoint));
        view = await call(second.client, "read_document"); await call(second.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 1], content: "B"}]});
        const oldId = first.transport.sessionId!;
        await stop(process.child, "SIGKILL"); await first.client.close(); first = undefined; await second.client.close(); second = undefined;
        await stop(f.upstream.child);
        const next = await demo(join(f.dir, "upstream")); f.upstream.child = next.child; f.upstream.url = next.url;
        process = await hosted(file, f.endpoint.port);
        assert.equal((await fetch(f.endpoint, {headers: {authorization: `Bearer ${f.token}`, "mcp-session-id": oldId}})).status, 404);
        first = await f.connect(); view = await call(first.client, "read_document"); assert.match(documentText(view), /AB/);
        await call(first.client, "undo"); view = await call(first.client, "read_document"); assert.match(documentText(view), /"text":"B"/); assert.doesNotMatch(documentText(view), /AB/);
        await call(first.client, "redo"); view = await call(first.client, "read_document"); assert.match(documentText(view), /AB/);
        await first.transport.terminateSession(); await first.client.close(); first = undefined;
        await stop(process.child); assert.doesNotMatch(process.logs(), new RegExp(f.token)); assert.doesNotMatch(process.logs(), /AB/);
    } finally {await first?.client.close(); await second?.client.close(); if (process) await stop(process.child); await f.cleanup();}
});
test("SIGKILL before send preserves exact unknown journal and blocks automatic replay", {timeout: 40000}, async () => {
    const entered = gate(), release = gate(); let block = true;
    const f = await fixture({intercept: async (req, res) => {
        if (block && req.url!.endsWith("/conditional")) {entered.release(); await release.wait; res.destroy(); return true;}
        return false;
    }}); await f.service.shutdown();
    const config = {...f.config, hosts: [f.endpoint.host]}; const file = join(f.dir, "config.json"); await writeFile(file, JSON.stringify(config), {mode: 0o600});
    let process: Awaited<ReturnType<typeof hosted>> | undefined, current: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        process = await hosted(file, f.endpoint.port); current = await f.connect(); const view = await call(current.client, "read_document");
        const pending = current.client.callTool({name: "edit_document", arguments: {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "uncertain"}]}}); pending.catch(() => {});
        await entered.wait; const journal = (await readdir(config.dataDir)).find(name => name.endsWith(".json"))!; const exact = await readFile(join(config.dataDir, journal), "utf8");
        await stop(process.child, "SIGKILL"); await current.client.close(); current = undefined; await pending.catch(() => {}); release.release(); block = false;
        await stop(f.upstream.child); const next = await demo(join(f.dir, "upstream")); f.upstream.child = next.child; f.upstream.url = next.url;
        process = await hosted(file, f.endpoint.port);
        const beforeReadAttempt = f.requests.length;
        await assert.rejects(f.connect(f.readToken), {code: 503});
        assert.equal(f.requests.length, beforeReadAttempt);
        assert.equal(await readFile(join(config.dataDir, journal), "utf8"), exact);
        current = await f.connect();
        const recovery = await call(current.client, "recovery_status"); assert.match(JSON.stringify(recovery), /unknown/);
        assert.equal(await readFile(join(config.dataDir, journal), "utf8"), exact);
        const requestCount = f.requests.filter(r => r.url.endsWith("/conditional")).length;
        const edit = await current.client.callTool({name: "edit_document", arguments: {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "replay"}]}}); assert.equal(edit.isError, true);
        assert.equal(f.requests.filter(r => r.url.endsWith("/conditional")).length, requestCount);
        await current.transport.terminateSession(); await current.client.close(); current = undefined;
        assert.equal(await readFile(join(config.dataDir, journal), "utf8"), exact);
        assert.equal(f.requests.some(r => r.url.endsWith("/leave")), false);
    } finally {release.release(); await current?.client.close(); if (process) await stop(process.child); await f.cleanup();}
});
test("SIGKILL after upstream acceptance resolves only the exact durable receipt after restart", {timeout: 40000}, async () => {
    const accepted = gate(), release = gate(); let target = "", intercept = true;
    const f = await fixture({intercept: async (req, res) => {
        if (intercept && req.url!.endsWith("/conditional")) {
            const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
            const response = await fetch(new URL(req.url!, target), {method: "POST", headers: Object.fromEntries(Object.entries({...req.headers, host: new URL(target).host}).filter((entry): entry is [string, string] => typeof entry[1] === "string")), body: Buffer.concat(chunks)});
            assert.equal(response.status, 200); await response.arrayBuffer(); accepted.release(); await release.wait; res.destroy(); return true;
        } return false;
    }}); target = f.upstream.url; await f.service.shutdown();
    const config = {...f.config, hosts: [f.endpoint.host]}, file = join(f.dir, "config.json"); await writeFile(file, JSON.stringify(config), {mode: 0o600});
    let process: Awaited<ReturnType<typeof hosted>> | undefined, current: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        process = await hosted(file, f.endpoint.port); current = await f.connect(); const view = await call(current.client, "read_document");
        const pending = current.client.callTool({name: "edit_document", arguments: {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "accepted"}]}}); pending.catch(() => {});
        await accepted.wait; await stop(process.child, "SIGKILL"); await current.client.close(); await pending.catch(() => {}); current = undefined; release.release(); intercept = false;
        await stop(f.upstream.child); const next = await demo(join(f.dir, "upstream")); f.upstream.child = next.child; f.upstream.url = next.url;
        process = await hosted(file, f.endpoint.port); current = await f.connect();
        assert.match(documentText(await call(current.client, "read_document")), /accepted/);
        await call(current.client, "undo"); assert.doesNotMatch(documentText(await call(current.client, "read_document")), /accepted/);
        assert.equal(f.requests.filter(r => r.url.endsWith("/conditional")).length, 1);
        await current.transport.terminateSession(); await current.client.close(); current = undefined;
    } finally {release.release(); await current?.client.close(); if (process) await stop(process.child); await f.cleanup();}
});
test("SIGTERM waits for a delayed admitted edit before closing durable resources", {timeout: 40000}, async () => {
    const entered = gate(), release = gate(); let blocked = true;
    const f = await fixture({intercept: async (req, _res) => { if (blocked && req.url!.endsWith("/conditional")) {entered.release(); await release.wait;} return false; }}); await f.service.shutdown();
    const config = {...f.config, hosts: [f.endpoint.host]}, file = join(f.dir, "config.json"); await writeFile(file, JSON.stringify(config), {mode: 0o600});
    let process: Awaited<ReturnType<typeof hosted>> | undefined, current: Awaited<ReturnType<typeof f.connect>> | undefined;
    try {
        process = await hosted(file, f.endpoint.port); current = await f.connect(); const view = await call(current.client, "read_document");
        const pending = call(current.client, "edit_document", {base: view.revision, edits: [{op: "insert", at: [0, 0], content: "drained"}]}); pending.catch(() => {});
        await entered.wait; process.child.kill("SIGTERM"); await new Promise(r => setTimeout(r, 30)); assert.equal(process.child.exitCode, null); assert.equal(process.child.signalCode, null);
        release.release(); blocked = false; await pending; await until(() => process!.child.exitCode !== null); assert.equal(process.child.exitCode, 0);
        await current.client.close(); current = undefined;
        process = await hosted(file, f.endpoint.port); current = await f.connect(); assert.match(documentText(await call(current.client, "read_document")), /drained/); await call(current.client, "undo");
        await current.transport.terminateSession(); await current.client.close(); current = undefined;
        assert.equal(f.requests.some(r => r.url.endsWith("/leave")), false);
    } finally {release.release(); await current?.client.close(); if (process) await stop(process.child); await f.cleanup();}
});
test("CLI rejects nonprivate, symlink, hardlinked and oversized configuration without leaking credentials", {timeout: 20000}, async () => {
    const {symlink, link, chmod} = await import("node:fs/promises");
    const f = await fixture(); await f.service.shutdown();
    try {
        const privateFile = join(f.dir, "private.json"); await writeFile(privateFile, JSON.stringify(f.config), {mode: 0o600});
        const symbolic = join(f.dir, "symbolic.json"); await symlink(privateFile, symbolic);
        const hardlinked = join(f.dir, "hardlinked.json"); await link(privateFile, hardlinked);
        const publicFile = join(f.dir, "public.json"); await writeFile(publicFile, JSON.stringify(f.config), {mode: 0o644}); await chmod(publicFile, 0o644);
        const oversized = join(f.dir, "oversized.json"); await writeFile(oversized, " ".repeat(1048577), {mode: 0o600});
        for (const file of [symbolic, hardlinked, publicFile, oversized]) {
            const child = spawn(process.execPath, [new URL("../src/http-main.ts", import.meta.url).pathname], {env: {...process.env, DOC_SYNC_HOSTED_CONFIG: file, PORT: "0"}, stdio: ["ignore", "pipe", "pipe"]}); let logs = ""; child.stdout!.on("data", b => {logs += b;}); child.stderr!.on("data", b => {logs += b;}); await once(child, "exit"); assert.equal(child.exitCode, 1); assert.equal(logs.trim(), "Hosted MCP startup failed"); assert.doesNotMatch(logs, new RegExp(f.token));
        }
        assert.equal(f.requests.length, 0);
    } finally {await f.cleanup();}
});
