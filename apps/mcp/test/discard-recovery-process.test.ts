import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {createServer, request} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL, fileURLToPath} from "node:url";
import {test} from "node:test";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {Doc} from "@barocss/doc-sync";
import {PROTOCOL_VERSION, SyncClient} from "@barocss/doc-sync/sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

type State = {
    epoch: string; generation: string; schemaVersion: string; serverSeq: number;
    lastGc: number; frontier: number; tombstones: number;
    peers: Array<{actor: string; online: boolean}>;
    model: {children?: Array<{runs?: Array<{text?: string}>}>};
};
const document = "reservation-process";
const actor = "ai-reservation";
const reservationId = "checkpoint-one";
const secondReservationId = "checkpoint-two";
const demoFile = fileURLToPath(new URL("../../demo/server.ts", import.meta.url));
const mcpFile = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const text = (state: State) => (state.model.children?.[0]?.runs ?? []).map(run => run.text ?? "").join("");

function deadline<T>(promise: Promise<T>, description: string, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([promise, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), ms);
    })]).finally(() => clearTimeout(timer));
}

async function startDemo(data: string, clockModule: string) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data};
    delete env.NO_SCHEMA;
    delete env.DOC_PROFILE;
    const child = spawn(process.execPath, ["--import", pathToFileURL(clockModule).href, demoFile], {env, stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "", stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const origin = await deadline(new Promise<string>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", code => reject(new Error(`Demo exited ${code}: ${stderr}`)));
        child.stdout.on("data", chunk => {
            stdout += String(chunk);
            const match = stdout.match(/http:\/\/localhost:(\d+)/);
            if (match) resolve(`http://127.0.0.1:${match[1]}`);
        });
    }), "server start");
    return {child, origin};
}

async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill(signal);
    await deadline(exited, `server exit after ${signal}`);
}

async function state(origin: string): Promise<State> {
    const response = await fetch(`${origin}/api/docs/${document}/state`);
    assert.equal(response.status, 200);
    return response.json() as Promise<State>;
}

async function post(origin: string, action: string, body: unknown, state?: State) {
    const response = await fetch(`${origin}/api/docs/${document}/${action}`, {
        method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION),
            ...(state ? {"x-doc-sync-epoch": state.epoch, "x-doc-sync-schema": state.schemaVersion} : {})},
        body: JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
}

async function waitUntil(check: () => Promise<boolean>, description: string) {
    const end = Date.now() + 5000;
    while (!(await check())) {
        if (Date.now() >= end) throw new Error(`Timed out: ${description}`);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

async function userInsert(origin: string) {
    const transport = new NodeHttpTransport(document, "human-reservation", origin);
    const client = new SyncClient("human-reservation", transport, {schema: DEMO_SCHEMA});
    client.connect();
    try {
        await waitUntil(async () => !!client.epoch && client.schemaVerified, "human snapshot");
        client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "Human "}]).ops);
        await waitUntil(async () => !client.pending.length, "human change acknowledged");
    } finally {
        client.disconnect();
        await transport.leave();
    }
}

type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};
type ToolResult = {isError?: boolean; structuredContent?: unknown};
const call = (client: Client, name: string, args: Record<string, unknown> = {}) =>
    client.callTool({name, arguments: args}) as Promise<ToolResult>;
function value<T>(result: ToolResult): T {
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return result.structuredContent as T;
}
async function connectMcp(origin: string, journalDir: string) {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const transport = new StdioClientTransport({command: process.execPath, args: [mcpFile], stderr: "pipe",
        env: {...env, DOC_SYNC_URL: origin, DOC_SYNC_DOCUMENT: document, DOC_SYNC_ACTOR: actor, DOC_SYNC_JOURNAL: "on", DOC_SYNC_JOURNAL_DIR: journalDir}});
    const client = new Client({name: "history-process-recovery", version: "1.0"});
    let stderr = "";
    transport.stderr?.on("data", chunk => { stderr += String(chunk); });
    try { await deadline(client.connect(transport), "MCP start"); }
    catch (error) { throw new Error(`MCP startup failed: ${stderr}`, {cause: error}); }
    return {client, transport};
}
async function killMcp(mcp: Awaited<ReturnType<typeof connectMcp>>) {
    assert.ok(mcp.transport.pid);
    process.kill(mcp.transport.pid, "SIGKILL");
    await mcp.client.close().catch(() => undefined);
}

/** Gate one ordinary change and suppress its SSE echo after the reconnect hello. */
async function historyProxy(origin: string, mode: "before-send" | "after-accept" | "pass" | "fail-recovery" | "conditional-before" | "late-echo") {
    let armed = false, changes = 0, recoveries = 0, receiptQueries = 0, echoReleased = false;
    const delayed: Array<() => void> = [];
    let resolveBarrier!: () => void, rejectBarrier!: (error: Error) => void;
    const barrier = new Promise<void>((resolve, reject) => { resolveBarrier = resolve; rejectBarrier = reject; });
    const server = createServer((req, res) => {
        const change = req.method === "POST" && req.url?.endsWith("/changes");
        if (change) changes++;
        if (req.method === "POST" && req.url?.endsWith("/change-receipt") && mode === "late-echo") {
            receiptQueries++; req.resume(); res.writeHead(200, {"content-type": "application/json"}); res.end('{"status":"unknown"}'); return;
        }
        if (req.method === "POST" && req.url?.endsWith("/recover-change")) {
            recoveries++;
            if (mode === "fail-recovery") { req.resume(); res.writeHead(503, {"content-type": "application/json"}); res.end("{}"); return; }
        }
        if (change && armed && mode === "before-send") {
            req.resume(); req.on("end", resolveBarrier); return;
        }
        if (req.method === "POST" && req.url?.endsWith("/conditional") && armed && mode === "conditional-before") {
            req.resume(); req.on("end", resolveBarrier); return;
        }
        const upstream = request(`${origin}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(origin).host}}, response => {
            if (change && armed && mode === "after-accept") {
                let body = "";
                response.on("data", chunk => { body += String(chunk); });
                response.on("end", () => {
                    try { assert.equal(response.statusCode, 200, body); assert.ok(JSON.parse(body).serverSeq); resolveBarrier(); }
                    catch (error) { rejectBarrier(error as Error); }
                });
                return;
            }
            if (change && armed && mode === "late-echo") response.once("end", resolveBarrier);
            res.writeHead(response.statusCode ?? 502, response.headers);
            if (req.url?.includes("/stream") && armed && mode !== "pass") {
                let buffered = "", helloSent = false;
                response.on("data", chunk => {
                    buffered += String(chunk);
                    let end: number;
                    while ((end = buffered.indexOf("\n\n")) >= 0) {
                        const message = buffered.slice(0, end + 2);
                        buffered = buffered.slice(end + 2);
                        if (!helloSent) { helloSent = true; res.write(message); }
                        else if (mode === "late-echo") {
                            if (echoReleased) res.write(message);
                            else delayed.push(() => { if (!res.destroyed) res.write(message); });
                        }
                    }
                });
                response.on("end", () => res.end());
                return;
            }
            response.pipe(res);
        });
        upstream.on("error", error => {
            if (change && armed) rejectBarrier(error);
            if (!res.headersSent) res.writeHead(502);
            res.end();
        });
        res.on("close", () => upstream.destroy());
        req.pipe(upstream);
    });
    server.listen(0, "127.0.0.1");
    await deadline(once(server, "listening"), "proxy start");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP proxy");
    return {origin: `http://127.0.0.1:${address.port}`, arm() { armed = true; },
        barrier: () => deadline(barrier, `${mode} ordinary change barrier`), changes: () => changes, recoveries: () => recoveries,
        receiptQueries: () => receiptQueries, releaseEcho() { echoReleased = true; delayed.splice(0).forEach(send => send()); },
        async close() { server.closeAllConnections(); await deadline(new Promise<void>(resolve => server.close(() => resolve())), "proxy close"); }};
}

/** Pause the old reservation release either before forwarding or after it is durably accepted. */
async function releaseProxy(origin: string, mode: "before-send" | "after-accept") {
    let resolveBarrier!: () => void, rejectBarrier!: (error: Error) => void;
    const barrier = new Promise<void>((resolve, reject) => { resolveBarrier = resolve; rejectBarrier = reject; });
    let releases = 0;
    const server = createServer((req, res) => {
        const headers = {...req.headers, host: new URL(origin).host};
        if (req.method === "POST" && req.url?.endsWith("/recovery-lease")) {
            const chunks: Buffer[] = [];
            req.on("data", chunk => chunks.push(Buffer.from(chunk)));
            req.on("end", () => {
                const body = Buffer.concat(chunks);
                let release = false;
                try { release = JSON.parse(body.toString("utf8")).action === "release"; } catch { /* Server validates input. */ }
                if (release) releases++;
                if (release && mode === "before-send") { resolveBarrier(); return; }
                const upstream = request(`${origin}${req.url}`, {method: req.method, headers}, response => {
                    if (release && mode === "after-accept") {
                        let reply = "";
                        response.on("data", chunk => { reply += String(chunk); });
                        response.on("end", () => {
                            try { assert.equal(response.statusCode, 200, reply); assert.equal(JSON.parse(reply).status, "released"); resolveBarrier(); }
                            catch (error) { rejectBarrier(error as Error); }
                        });
                        return;
                    }
                    res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
                });
                upstream.on("error", error => { rejectBarrier(error); if (!res.headersSent) res.writeHead(502); res.end(); });
                res.on("close", () => upstream.destroy()); upstream.end(body);
            });
            return;
        }
        const upstream = request(`${origin}${req.url}`, {method: req.method, headers}, response => {
            res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
        });
        upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        res.on("close", () => upstream.destroy()); req.pipe(upstream);
    });
    server.listen(0, "127.0.0.1");
    await deadline(once(server, "listening"), "release proxy start");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP proxy");
    return {origin: `http://127.0.0.1:${address.port}`, barrier: () => deadline(barrier, `${mode} release barrier`),
        releases: () => releases,
        async close() { server.closeAllConnections(); await deadline(new Promise<void>(resolve => server.close(() => resolve())), "release proxy close"); }};
}

async function aiEdit(mcp: Awaited<ReturnType<typeof connectMcp>>, edits: unknown[]) {
    const read = value<{revision: Revision}>(await call(mcp.client, "read_document"));
    assert.equal(value<{status: string}>(await call(mcp.client, "edit_document", {base: read.revision, edits})).status, "confirmed");
}

test("discard releases only its own reservation and permits GC while keeping other edits", {
    timeout: 45000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-discard-success-"));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    const checkpointPath = join(journal, `${document}.json.checkpoint`);
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
        demo = await startDemo(data, module);
        mcp = await connectMcp(demo.origin, journal);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
        await aiEdit(mcp, [{op: "delete", at: [0, 1], count: 1}]);
        const before = await state(demo.origin);
        const previous = JSON.parse(await readFile(checkpointPath, "utf8")) as {reservationId: string};
        const other = {generation: before.generation, actor: "other-actor", reservationId: "other-reservation", pin: before.serverSeq};
        assert.equal((await post(demo.origin, "recovery-lease", other)).status, "protected");
        await userInsert(demo.origin);
        assert.equal(text(await state(demo.origin)), "Human ac");
        await waitUntil(async () => text({model: value<{document: State["model"]}>(await call(mcp!.client, "read_document")).document} as State) === "Human ac", "remote edit reaches MCP");
        assert.equal(value<{status: string}>(await call(mcp.client, "discard_history")).status, "discarded");
        assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "no_change");
        assert.equal(value<{status: string}>(await call(mcp.client, "redo")).status, "no_change");
        assert.equal(text(await state(demo.origin)), "Human ac");
        const gone = await post(demo.origin, "recovery-lease", {generation: before.generation, actor,
            reservationId: previous.reservationId, pin: null, requireExisting: true});
        assert.equal(gone.status, "unsafe");
        await post(demo.origin, "gc", {});
        assert.ok((await state(demo.origin)).lastGc < before.serverSeq, "another actor's reservation continues to protect its history");
        assert.equal((await post(demo.origin, "recovery-lease", {...other, action: "release"})).status, "released");
        await waitUntil(async () => (await state(demo!.origin)).frontier >= before.serverSeq, "discarded deletion becomes collectable");
        await post(demo.origin, "gc", {});
        assert.ok((await state(demo.origin)).lastGc >= before.serverSeq);
        assert.equal(text(await state(demo.origin)), "Human ac");
        assert.equal(value<{status: string}>(await call(mcp.client, "discard_history")).status, "discarded", "discard can be repeated");
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "New "}]);
        assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "confirmed", "new history remains functional");
        assert.equal(text(await state(demo.origin)), "Human ac");
    } finally {
        if (mcp) await killMcp(mcp);
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

for (const mode of ["before-send", "after-accept"] as const) {
    test(`discard recovers across MCP and server crash ${mode} of reservation release`, {
        timeout: 60000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
    }, async () => {
        const root = await mkdtemp(join(tmpdir(), `doc-sync-discard-${mode}-`));
        const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
        const checkpointPath = join(journal, `${document}.json.checkpoint`);
        await writeFile(module, "export {};\n");
        let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
        let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
        let proxy: Awaited<ReturnType<typeof releaseProxy>> | undefined;
        try {
            demo = await startDemo(data, module);
            proxy = await releaseProxy(demo.origin, mode);
            mcp = await connectMcp(proxy.origin, journal);
            await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
            await aiEdit(mcp, [{op: "delete", at: [0, 1], count: 1}]);
            const before = await state(demo.origin);
            assert.equal(text(before), "ac");
            assert.ok(before.tombstones > 0);
            const previous = JSON.parse(await readFile(checkpointPath, "utf8")) as {reservationId: string};
            const discard = call(mcp.client, "discard_history").catch(() => undefined);
            await proxy.barrier();
            assert.equal(proxy.releases(), 1);
            const staged = JSON.parse(await readFile(checkpointPath, "utf8")) as Record<string, unknown>;
            assert.ok(staged.releasePending, "durable discard marker must precede the release request");
            await killMcp(mcp); mcp = undefined;
            await deadline(discard, "discard completion after SIGKILL");
            await proxy.close(); proxy = undefined;
            await stop(demo.child, "SIGKILL"); demo = undefined;
            demo = await startDemo(data, module);
            await userInsert(demo.origin);
            const afterHuman = await state(demo.origin);
            assert.equal(text(afterHuman), "Human ac");
            mcp = await connectMcp(demo.origin, journal);
            const read = value<{recoveryRequired: boolean; document: State["model"]}>(await call(mcp.client, "read_document"));
            assert.equal(read.recoveryRequired, false);
            assert.equal(text({model: read.document} as State), "Human ac");
            assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "no_change");
            assert.equal(value<{status: string}>(await call(mcp.client, "redo")).status, "no_change");
            const old = await post(demo.origin, "recovery-lease", {generation: before.generation, actor,
                reservationId: previous.reservationId, pin: null, requireExisting: true});
            assert.equal(old.status, "unsafe", "old reservation must remain released after recovery");
            await waitUntil(async () => (await state(demo!.origin)).frontier >= before.serverSeq, "released deletion becomes collectable");
            await post(demo.origin, "gc", {});
            const collected = await state(demo.origin);
            assert.ok(collected.lastGc >= before.serverSeq, "GC advances beyond the discarded history");
            assert.equal(text(collected), "Human ac");
            await killMcp(mcp); mcp = undefined;
            await stop(demo.child, "SIGKILL"); demo = undefined;
            demo = await startDemo(data, module);
            mcp = await connectMcp(demo.origin, journal);
            assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "no_change");
            assert.equal(text(await state(demo.origin)), "Human ac", "repeated restart must not resurrect discarded history");
        } finally {
            if (mcp) await killMcp(mcp);
            await proxy?.close();
            if (demo) await stop(demo.child);
            await rm(root, {recursive: true, force: true});
        }
    });
}

test("discard rejects an unresolved ordinary change without changing its evidence", {
    timeout: 60000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-discard-pending-"));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    const checkpointPath = join(journal, `${document}.json.checkpoint`);
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    let first: Awaited<ReturnType<typeof historyProxy>> | undefined;
    let failed: Awaited<ReturnType<typeof historyProxy>> | undefined;
    try {
        demo = await startDemo(data, module);
        first = await historyProxy(demo.origin, "before-send");
        mcp = await connectMcp(first.origin, journal);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
        first.arm();
        const undo = call(mcp.client, "undo").catch(() => undefined);
        await first.barrier();
        const original = await readFile(checkpointPath);
        await killMcp(mcp); mcp = undefined;
        await deadline(undo, "undo completion after SIGKILL");
        await first.close(); first = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        await userInsert(demo.origin);
        failed = await historyProxy(demo.origin, "fail-recovery");
        mcp = await connectMcp(failed.origin, journal);
        assert.equal(value<{status: string}>(await call(mcp.client, "recovery_status")).status, "recovery_required");
        const before = await readFile(join(data, `${document}.jsonl`));
        const model = (await state(demo.origin)).model;
        assert.equal((await call(mcp.client, "discard_history")).isError, true);
        assert.deepEqual(await readFile(checkpointPath), original, "unconfirmed edit checkpoint must remain byte-identical");
        assert.deepEqual(await readFile(join(data, `${document}.jsonl`)), before, "discard must not release the reservation");
        assert.deepEqual((await state(demo.origin)).model, model);
        await killMcp(mcp); mcp = undefined;
        await failed.close(); failed = undefined;
        mcp = await connectMcp(demo.origin, journal);
        assert.equal(value<{status: string}>(await call(mcp.client, "recovery_status")).status, "clear");
        assert.equal(text(await state(demo.origin)), "Human ");
        assert.equal(value<{status: string}>(await call(mcp.client, "redo")).status, "confirmed");
        assert.equal(text(await state(demo.origin)), "Human abc");
    } finally {
        if (mcp) await killMcp(mcp);
        await first?.close(); await failed?.close();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

test("discard rejects an unresolved conditional intent and preserves it across restart", {
    timeout: 60000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-discard-conditional-"));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    const journalPath = join(journal, `${document}.json`), checkpointPath = `${journalPath}.checkpoint`;
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    let proxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
    try {
        demo = await startDemo(data, module);
        proxy = await historyProxy(demo.origin, "conditional-before");
        mcp = await connectMcp(proxy.origin, journal);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
        const read = value<{revision: Revision}>(await call(mcp.client, "read_document"));
        proxy.arm();
        const editing = call(mcp.client, "edit_document", {base: read.revision,
            edits: [{op: "insert", at: [0, 3], content: "!"}]}).catch(() => undefined);
        await proxy.barrier();
        const intent = await readFile(journalPath), checkpoint = await readFile(checkpointPath);
        await killMcp(mcp); mcp = undefined;
        await deadline(editing, "conditional completion after SIGKILL");
        await proxy.close(); proxy = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        await userInsert(demo.origin);
        mcp = await connectMcp(demo.origin, journal);
        const recovery = value<{status: string; receipt: {status: string}}>(await call(mcp.client, "recovery_status"));
        assert.equal(recovery.status, "recovery_required");
        assert.equal(recovery.receipt.status, "unknown");
        const serverBefore = await readFile(join(data, `${document}.jsonl`));
        assert.equal((await call(mcp.client, "discard_history")).isError, true);
        assert.deepEqual(await readFile(journalPath), intent, "conditional intent is preserved byte-for-byte");
        assert.deepEqual(await readFile(checkpointPath), checkpoint, "checkpoint is not discarded");
        assert.deepEqual(await readFile(join(data, `${document}.jsonl`)), serverBefore, "reservation is not released");
        assert.equal(text(await state(demo.origin)), "Human abc");
        await killMcp(mcp); mcp = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        mcp = await connectMcp(demo.origin, journal);
        assert.equal(value<{status: string}>(await call(mcp.client, "recovery_status")).status, "recovery_required");
        assert.deepEqual(await readFile(journalPath), intent);
        assert.equal(text(await state(demo.origin)), "Human abc");
    } finally {
        if (mcp) await killMcp(mcp);
        await proxy?.close();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

test("late echo cannot discard persisted pending history without an exact receipt", {
    timeout: 60000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-discard-late-echo-"));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    const checkpointPath = join(journal, `${document}.json.checkpoint`);
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    let proxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
    try {
        demo = await startDemo(data, module);
        proxy = await historyProxy(demo.origin, "late-echo");
        mcp = await connectMcp(proxy.origin, journal);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
        await userInsert(demo.origin);
        await waitUntil(async () => text({model: value<{document: State["model"]}>(await call(mcp!.client, "read_document")).document} as State) === "Human abc", "remote edit reaches MCP");
        proxy.arm();
        const undo = call(mcp.client, "undo");
        await proxy.barrier();
        assert.equal(value<{status: string}>(await deadline(undo, "undo timeout", 15000)).status, "unconfirmed");
        const checkpoint = await readFile(checkpointPath);
        assert.equal((JSON.parse(checkpoint.toString("utf8")) as {client: {pending: unknown[]}}).client.pending.length, 1);
        proxy.releaseEcho();
        await waitUntil(async () => value<{pending: number}>(await call(mcp!.client, "read_document")).pending === 0, "late undo echo");
        const before = await readFile(join(data, `${document}.jsonl`));
        assert.equal((await call(mcp.client, "discard_history")).isError, true);
        assert.equal(proxy.receiptQueries(), 1, "stored pending change must be checked with an exact receipt");
        assert.deepEqual(await readFile(checkpointPath), checkpoint);
        assert.deepEqual(await readFile(join(data, `${document}.jsonl`)), before, "unknown receipt must not release protection");
        assert.equal(text(await state(demo.origin)), "Human ");
        await killMcp(mcp); mcp = undefined;
        await proxy.close(); proxy = undefined;
        mcp = await connectMcp(demo.origin, journal);
        assert.equal(value<{status: string}>(await call(mcp.client, "recovery_status")).status, "clear");
        assert.equal(value<{status: string}>(await call(mcp.client, "redo")).status, "confirmed");
        assert.equal(text(await state(demo.origin)), "Human abc");
    } finally {
        if (mcp) await killMcp(mcp);
        await proxy?.close();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});
