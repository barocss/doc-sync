import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {createServer, request} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL, fileURLToPath} from "node:url";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {PROTOCOL_VERSION, SyncClient} from "@barocss/doc-sync/sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {DEMO_SCHEMA} from "../../../../fixtures/demo-schema.ts";

type State = {
    epoch: string; generation: string; schemaVersion: string; serverSeq: number;
    lastGc: number; frontier: number; tombstones: number;
    peers: Array<{actor: string; online: boolean}>;
    model: {children?: Array<{runs?: Array<{text?: string}>}>};
};
const document = "reservation-process";
const actor = "ai-reservation";
const demoFile = fileURLToPath(new URL("../../../demo/server.ts", import.meta.url));
const mcpFile = fileURLToPath(new URL("../../src/main.ts", import.meta.url));
const text = (state: State) => (state.model.children?.[0]?.runs ?? []).map(run => run.text ?? "").join("");

function deadline<T>(promise: Promise<T>, description: string, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([promise, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), ms);
    })]).finally(() => clearTimeout(timer));
}

export async function startDemo(data: string, clockModule: string, onChild?: (child: ChildProcess) => void) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data};
    delete env.NO_SCHEMA;
    delete env.DOC_PROFILE;
    const child = spawn(process.execPath, ["--import", pathToFileURL(clockModule).href, demoFile], {env, stdio: ["ignore", "pipe", "pipe"]});
    onChild?.(child);
    let stdout = "", stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const origin = await deadline(new Promise<string>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", code => reject(new Error(`Demo exited ${code}: ${stderr}`)));
        child.stdout.on("data", chunk => {
            stdout += String(chunk);
            const match = stdout.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);
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
    return {client, transport, diagnostics: () => stderr};
}
async function killMcp(mcp: Awaited<ReturnType<typeof connectMcp>>) {
    assert.ok(mcp.transport.pid);
    process.kill(mcp.transport.pid, "SIGKILL");
    await mcp.client.close().catch(() => undefined);
}

/** Gate one ordinary change and suppress its SSE echo after the reconnect hello. */
async function historyProxy(origin: string, mode: "before-send" | "after-accept" | "pass" | "fail-recovery",
    startupGate?: "recover-change" | "stream", fault?: Fault) {
    const transcript: Array<{url: string; method: string; body: string; status?: number; response?: string}> = [];
    let faultRequests = 0;
    let armed = false, changes = 0, recoveries = 0, streams = 0;
    let releaseGate!: () => void, seeGate!: () => void;
    const held = new Promise<void>(resolve => { releaseGate = resolve; });
    const seen = new Promise<void>(resolve => { seeGate = resolve; });
    let resolveBarrier!: () => void, rejectBarrier!: (error: Error) => void;
    const barrier = new Promise<void>((resolve, reject) => { resolveBarrier = resolve; rejectBarrier = reject; });
    const server = createServer((req, res) => {
        const entry = {url: req.url ?? "", method: req.method ?? "", body: "", status: undefined as number | undefined, response: undefined as string | undefined};
        transcript.push(entry);
        req.on("data", chunk => { entry.body += String(chunk); });
        const target = fault && req.url?.endsWith(fault === "state" ? "/recovery-state" : "/recovery-lease");
        const inject = target && (++faultRequests === 1 || fault === "persistent");
        if (inject && fault !== "lease-after") {
            req.resume(); entry.status = 503; entry.response = "{}";
            res.writeHead(503, {"content-type": "application/json"}); res.end("{}"); return;
        }
        if (req.url?.includes("/stream")) streams++;
        const change = req.method === "POST" && req.url?.endsWith("/changes");
        if (change) changes++;
        if (req.method === "POST" && req.url?.endsWith("/recover-change")) {
            recoveries++;
            if (mode === "fail-recovery") { req.resume(); res.writeHead(503, {"content-type": "application/json"}); res.end("{}"); return; }
        }
        if (change && armed && mode === "before-send") {
            req.resume(); req.on("end", resolveBarrier); return;
        }
        const upstream = request(`${origin}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(origin).host}}, response => {
            entry.status = response.statusCode;
            if (!req.url?.includes("/stream")) {
                entry.response = "";
                response.on("data", chunk => { entry.response += String(chunk); });
            }
            if (inject && fault === "lease-after") {
                response.on("end", () => {
                    const reply = JSON.parse(entry.response!);
                    if (response.statusCode !== 200 || reply.status !== "protected" || reply.existing !== true) {
                        res.writeHead(502); res.end(JSON.stringify({unexpected: entry})); return;
                    }
                    res.writeHead(503, {"content-type": "application/json"}); res.end("{}");
                });
                return;
            }
            if (change && armed && mode === "after-accept") {
                let body = "";
                response.on("data", chunk => { body += String(chunk); });
                response.on("end", () => {
                    try { assert.equal(response.statusCode, 200, body); assert.ok(JSON.parse(body).serverSeq); resolveBarrier(); }
                    catch (error) { rejectBarrier(error as Error); }
                });
                return;
            }
            if (mode === "pass" && response.statusCode === 200 &&
                (startupGate === "stream" ? req.url?.includes("/stream") : startupGate === "recover-change" && req.url?.endsWith("/recover-change"))) {
                response.pause();
                seeGate();
                void held.then(() => {
                    res.writeHead(response.statusCode ?? 502, response.headers);
                    response.pipe(res);
                });
                return;
            }
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
    return {transcript, faultRequests: () => faultRequests, gateSeen: () => deadline(seen, `${startupGate} startup barrier`), releaseGate, streams: () => streams,
        origin: `http://127.0.0.1:${address.port}`, arm() { armed = true; },
        barrier: () => deadline(barrier, `${mode} ordinary change barrier`), changes: () => changes, recoveries: () => recoveries,
        async close() { releaseGate(); server.closeAllConnections(); await deadline(new Promise<void>(resolve => server.close(() => resolve())), "proxy close"); }};
}

export type Fault = "lease-before" | "lease-after" | "state" | "persistent";
export async function restartRecoveryScenario(fault: Fault, action: "undo" | "redo" = "undo", mode: "before-send" | "after-accept" = "after-accept") {
    const controlledStartup = true;
    const root = await mkdtemp(join(tmpdir(), `doc-sync-undo-${mode}-`));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    const checkpointPath = join(journal, `${document}.json.checkpoint`);
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    let proxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
    let resumedProxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
    let connecting: Promise<Awaited<ReturnType<typeof connectMcp>>> | undefined;
    async function connectThroughGate(proxy: Awaited<ReturnType<typeof historyProxy>>, phase: "recover-change" | "stream") {
        let connected = false;
        connecting = connectMcp(proxy.origin, journal).then(result => { connected = true; return result; });
        // Observe rejection even if waiting for the proxy barrier fails first.
        void connecting.catch(() => undefined);
        await proxy.gateSeen();
        assert.equal(connected, false, `${phase}: stdio must wait for automatic recovery`);
        if (phase === "recover-change") {
            assert.equal(proxy.recoveries(), 1, "hold the first successful atomic recovery response");
            assert.equal(proxy.streams(), 0, "atomic recovery must precede SSE admission");
        } else {
            assert.equal(proxy.streams(), 1, "hold the repeated restart hello");
            assert.equal(proxy.recoveries(), 0, "settled checkpoint needs no atomic resubmission");
            assert.equal(proxy.changes(), 0, "settled checkpoint needs no ordinary resend");
        }
        proxy.releaseGate();
        const result = await connecting;
        connecting = undefined;
        return result;
    }
    try {
        demo = await startDemo(data, module);
        proxy = await historyProxy(demo.origin, mode);
        mcp = await connectMcp(proxy.origin, journal);
        const initial = value<{revision: Revision}>(await call(mcp.client, "read_document"));
        assert.equal(value<{status: string}>(await call(mcp.client, "edit_document", {base: initial.revision,
            edits: [{op: "insert", at: [0, 0], content: "abc"}]})).status, "confirmed");
        if (action === "redo") assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "confirmed");
        proxy.arm();
        const pendingAction = call(mcp.client, action).catch(() => undefined);
        await proxy.barrier();
        const checkpoint = await readFile(checkpointPath);
        const pending = (JSON.parse(checkpoint.toString("utf8")) as {generation: string; client: {pending: unknown[]}});
        assert.equal(pending.client.pending.length, 1);
        await killMcp(mcp); mcp = undefined;
        await deadline(pendingAction, `${action} completion after SIGKILL`);
        await proxy.close(); proxy = undefined;
        const beforeText = action === "undo" ? "abc" : "";
        const afterText = action === "undo" ? "" : "abc";
        assert.equal(text(await state(demo.origin)), mode === "after-accept" ? afterText : beforeText);
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        await userInsert(demo.origin);
        const afterHuman = await state(demo.origin);
        assert.equal(text(afterHuman), `Human ${mode === "after-accept" ? afterText : beforeText}`);
        const originalReceipt = await post(demo.origin, "change-receipt", {generation: pending.generation, change: pending.client.pending[0]});
        assert.equal(originalReceipt.status, mode === "after-accept" ? "accepted" : "unknown");
        resumedProxy = await historyProxy(demo.origin, "pass", controlledStartup ? "recover-change" : undefined);
        mcp = controlledStartup ? await connectThroughGate(resumedProxy, "recover-change") : await connectMcp(resumedProxy.origin, journal);
        const recovery = value<{status: string; message?: string}>(await call(mcp.client, "recovery_status"));
        // Stdio startup awaits session.start(), including automatic recovery.
        // A recovery error here is not an unfinished background operation.
        assert.equal(recovery.status, "clear", JSON.stringify({action, mode, recovery, checkpoint: pending,
            originalReceipt, afterHuman, changes: resumedProxy.changes(), recoveries: resumedProxy.recoveries(), stderr: mcp.diagnostics()}));
        assert.equal(resumedProxy.changes(), 0, "pending change must not use the ordinary send path");
        assert.equal(resumedProxy.recoveries(), 1, "the server atomically checks and recovers the exact change");
        const view = value<{recoveryRequired: boolean; document: State["model"]}>(await call(mcp.client, "read_document"));
        assert.equal(view.recoveryRequired, false);
        assert.equal(text({model: view.document} as State), `Human ${afterText}`);
        const accepted = await post(demo.origin, "change-receipt", {generation: pending.generation, change: pending.client.pending[0]});
        assert.equal(accepted.status, "accepted");
        if (mode === "after-accept") assert.equal(accepted.serverSeq, originalReceipt.serverSeq, "accepted history change is not appended twice");
        if (controlledStartup) {
            const settled = JSON.parse(await readFile(checkpointPath, "utf8")) as {client: {pending: unknown[]}};
            assert.equal(settled.client.pending.length, 0, "healthy recovery persists a settled checkpoint");
        }
        await killMcp(mcp); mcp = undefined;
        await resumedProxy.close(); resumedProxy = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        if (controlledStartup) {
            const settledBytes = await readFile(checkpointPath);
            resumedProxy = await historyProxy(demo.origin, "pass", undefined, fault);
            mcp = await connectMcp(resumedProxy.origin, journal);
            const attempts = resumedProxy.transcript.filter(entry => entry.url.endsWith(fault === "state" ? "/recovery-state" : "/recovery-lease"));
            assert.equal(attempts.length, fault === "persistent" ? 4 : fault === "state" ? 3 : 2, JSON.stringify(resumedProxy.transcript));
            assert.equal(new Set(attempts.map(entry => entry.body)).size, 1, "retries preserve the exact request body");
            if (fault !== "state") {
                const requestBody = JSON.parse(attempts[0].body);
                const settled = JSON.parse(settledBytes.toString());
                assert.equal(requestBody.generation, settled.generation);
                assert.equal(requestBody.reservationId, settled.reservationId);
                assert.equal(requestBody.actor, actor);
                assert.equal(requestBody.requireExisting, true);
            }
            if (fault === "persistent") {
                const blocked = value<{status: string; message: string}>(await call(mcp.client, "recovery_status"));
                assert.equal(blocked.status, "recovery_required", JSON.stringify({blocked, transcript: resumedProxy.transcript}));
                assert.match(blocked.message, /HTTP 503/);
                assert.equal((await call(mcp.client, "redo")).isError, true);
                assert.deepEqual(await readFile(checkpointPath), settledBytes, "exhausted recovery preserves settled checkpoint bytes");
                assert.equal(resumedProxy.streams(), 0);
                assert.equal(resumedProxy.recoveries(), 0);
                assert.equal(resumedProxy.changes(), 0);
                assert.equal(text(await state(demo.origin)), `Human ${afterText}`);
                await killMcp(mcp); mcp = undefined;
                await resumedProxy.close(); resumedProxy = undefined;
                resumedProxy = await historyProxy(demo.origin, "pass");
                mcp = await connectMcp(resumedProxy.origin, journal);
            }
        } else {
            mcp = await connectMcp(demo.origin, journal);
        }
        const repeatedResponse = await call(mcp.client, "recovery_status");
        const repeatedRecovery = repeatedResponse.structuredContent as {status: string; message?: string} | undefined;
        const repeatedDiagnostic = JSON.stringify({stage: "repeated-restart", action, mode,
            response: repeatedResponse, transcript: resumedProxy?.transcript, stderr: mcp.diagnostics()});
        assert.equal(repeatedResponse.isError, undefined, repeatedDiagnostic);
        assert.equal(repeatedRecovery?.status, "clear", repeatedDiagnostic);
        if (controlledStartup) {
            assert.equal(resumedProxy!.recoveries(), 0, "repeated startup must not recover settled history again");
            assert.equal(resumedProxy!.changes(), 0, "repeated startup must not resend settled history");
        }
        assert.equal(text(await state(demo.origin)), `Human ${afterText}`, "repeated restart must not duplicate the history change");
        assert.equal(value<{status: string}>(await call(mcp.client, action === "undo" ? "redo" : "undo")).status, "confirmed");
        assert.equal(text(await state(demo.origin)), `Human ${beforeText}`);
    } finally {
        if (connecting) {
            resumedProxy?.releaseGate();
            mcp = await connecting.catch(() => undefined);
        }
        if (mcp) await killMcp(mcp);
        await proxy?.close(); await resumedProxy?.close();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
}
