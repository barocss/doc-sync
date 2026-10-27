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
async function historyProxy(origin: string, mode: "before-send" | "after-accept" | "pass" | "fail-recovery") {
    let armed = false, changes = 0, recoveries = 0;
    let resolveBarrier!: () => void, rejectBarrier!: (error: Error) => void;
    const barrier = new Promise<void>((resolve, reject) => { resolveBarrier = resolve; rejectBarrier = reject; });
    const server = createServer((req, res) => {
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
            if (change && armed && mode === "after-accept") {
                let body = "";
                response.on("data", chunk => { body += String(chunk); });
                response.on("end", () => {
                    try { assert.equal(response.statusCode, 200, body); assert.ok(JSON.parse(body).serverSeq); resolveBarrier(); }
                    catch (error) { rejectBarrier(error as Error); }
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
    return {origin: `http://127.0.0.1:${address.port}`, arm() { armed = true; },
        barrier: () => deadline(barrier, `${mode} ordinary change barrier`), changes: () => changes, recoveries: () => recoveries,
        async close() { server.closeAllConnections(); await deadline(new Promise<void>(resolve => server.close(() => resolve())), "proxy close"); }};
}

test("recovery reservation survives peer lease expiry and a killed server, without losing another user's edit", {timeout: 30000}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-reservation-process-"));
    const data = join(root, "data"), clock = join(root, "clock.txt"), module = join(root, "clock.mjs");
    // Move only the server's Date.now clock. Timers and test deadlines stay real.
    // This exercises a 121-second lease expiry without sleeping for two minutes.
    await writeFile(clock, "0");
    await writeFile(module, `import {readFileSync} from 'node:fs';\nconst now = Date.now.bind(Date);\nDate.now = () => now() + Number(readFileSync(${JSON.stringify(clock)}, 'utf8'));\n`);
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    const stream = new AbortController();
    try {
        demo = await startDemo(data, module);
        let current = await state(demo.origin);
        const doc = new Doc(actor, DEMO_SCHEMA);
        const insertion = {actor, seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops};
        assert.equal((await post(demo.origin, "changes", insertion, current)).serverSeq, 1);
        current = await state(demo.origin);
        const reservation = await post(demo.origin, "recovery-lease", {generation: current.generation, actor, reservationId, pin: null});
        assert.deepEqual(reservation, {status: "protected", generation: current.generation, pin: 2, lastGc: 0, existing: false});
        const second = await post(demo.origin, "recovery-lease", {generation: current.generation, actor, reservationId: secondReservationId, pin: null});
        assert.deepEqual(second, reservation, "independent checkpoints both reserve the deletion");
        const response = await fetch(`${demo.origin}/api/docs/${document}/stream?protocol=${PROTOCOL_VERSION}&since=0&actor=${actor}&schemaVersion=${current.schemaVersion}`, {signal: stream.signal});
        assert.equal(response.status, 200);
        const deletion = {actor, seq: 2, ops: doc.edit([{op: "delete", at: [0, 1], count: 1}]).ops};
        assert.equal((await post(demo.origin, "changes", deletion, current)).serverSeq, 2);
        stream.abort();
        await waitUntil(async () => (await state(demo!.origin)).peers.some(peer => peer.actor === actor && !peer.online), "peer disconnected");
        await writeFile(clock, "121000");
        const expired = await state(demo.origin);
        assert.equal(expired.frontier, 1, "expired peer no longer controls GC, but reservation still does");
        await post(demo.origin, "gc", {});
        current = await state(demo.origin);
        assert.equal(current.tombstones, 1);
        assert.equal(text(current), "ac");
        assert.equal(current.lastGc, 0, "no protected deletion is collected");
        const generation = current.generation;
        await stop(demo.child, "SIGKILL"); demo = undefined;

        demo = await startDemo(data, module);
        current = await state(demo.origin);
        assert.equal(current.generation, generation);
        assert.equal(current.tombstones, 1, "the reservation and deletion survive server restart");
        assert.equal(current.frontier, 1, "the restored reservation constrains GC without a peer");
        await userInsert(demo.origin);
        await post(demo.origin, "gc", {});
        current = await state(demo.origin);
        assert.equal(text(current), "Human ac");
        assert.equal(current.tombstones, 1);
        assert.equal(current.frontier, 1);
        const repeated = await post(demo.origin, "recovery-lease", {generation, actor, reservationId, pin: null});
        assert.equal(repeated.status, "protected");
        assert.equal(repeated.pin, 2, "repeat acquisition must retain the original floor");
        assert.equal(repeated.existing, true, "the original reservation must survive restart");
        assert.equal((await post(demo.origin, "recovery-lease", {generation, actor, reservationId, action: "release"})).status, "released");
        await post(demo.origin, "gc", {});
        const stillProtected = await state(demo.origin);
        assert.equal(stillProtected.frontier, 1, "releasing one reservation must preserve the other");
        assert.equal(stillProtected.tombstones, 1);
        assert.equal(stillProtected.lastGc, 0);
        assert.equal((await post(demo.origin, "recovery-lease", {generation, actor, reservationId: secondReservationId, action: "release"})).status, "released");
        await post(demo.origin, "gc", {});
        const collected = await state(demo.origin);
        // A deleted token may remain as an insertion anchor after compaction.
        // The advanced GC frontier, not token count, determines recovery safety.
        assert.equal(text(collected), "Human ac", "GC does not discard another user's edit");
        assert.ok(collected.lastGc >= 2);
        assert.deepEqual(await post(demo.origin, "recovery-lease", {generation, actor, reservationId, pin: 2}), {status: "unsafe"});
        const log = await readFile(join(data, `${document}.jsonl`), "utf8");
        assert.match(log, /"recoveryPin"/);
    } finally {
        stream.abort();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

test("MCP restart restores edit history across server restart, undo, another restart, and redo", {
    timeout: 45000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-history-restart-"));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
        demo = await startDemo(data, module);
        mcp = await connectMcp(demo.origin, journal);
        let view = value<{revision: Revision}>(await call(mcp.client, "read_document"));
        assert.equal(value<{status: string}>(await call(mcp.client, "edit_document", {base: view.revision,
            edits: [{op: "insert", at: [0, 0], content: "abc"}]})).status, "confirmed");
        await killMcp(mcp); mcp = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        await userInsert(demo.origin);
        mcp = await connectMcp(demo.origin, journal);
        let read = value<{recoveryRequired: boolean; document: State["model"]}>(await call(mcp.client, "read_document"));
        assert.equal(read.recoveryRequired, false);
        assert.equal(text({model: read.document} as State), "Human abc");
        assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "confirmed");
        assert.equal(text(await state(demo.origin)), "Human ");
        await killMcp(mcp); mcp = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        mcp = await connectMcp(demo.origin, journal);
        read = value<{recoveryRequired: boolean; document: State["model"]}>(await call(mcp.client, "read_document"));
        assert.equal(read.recoveryRequired, false);
        assert.equal(text({model: read.document} as State), "Human ");
        assert.equal(value<{status: string}>(await call(mcp.client, "redo")).status, "confirmed");
        assert.equal(text(await state(demo.origin)), "Human abc");
    } finally {
        if (mcp) await killMcp(mcp);
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

for (const action of ["undo", "redo"] as const) for (const mode of ["before-send", "after-accept"] as const) {
    test(`MCP killed during ${action} ${mode}: exact receipt controls automatic recovery`, {
        timeout: 45000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
    }, async () => {
        const root = await mkdtemp(join(tmpdir(), `doc-sync-undo-${mode}-`));
        const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
        const checkpointPath = join(journal, `${document}.json.checkpoint`);
        await writeFile(module, "export {};\n");
        let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
        let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
        let proxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
        let resumedProxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
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
            resumedProxy = await historyProxy(demo.origin, "pass");
            mcp = await connectMcp(resumedProxy.origin, journal);
            const recovery = value<{status: string; message?: string}>(await call(mcp.client, "recovery_status"));
            assert.equal(recovery.status, "clear");
            assert.equal(resumedProxy.changes(), 0, "pending change must not use the ordinary send path");
            assert.equal(resumedProxy.recoveries(), 1, "the server atomically checks and recovers the exact change");
            const view = value<{recoveryRequired: boolean; document: State["model"]}>(await call(mcp.client, "read_document"));
            assert.equal(view.recoveryRequired, false);
            assert.equal(text({model: view.document} as State), `Human ${afterText}`);
            const accepted = await post(demo.origin, "change-receipt", {generation: pending.generation, change: pending.client.pending[0]});
            assert.equal(accepted.status, "accepted");
            if (mode === "after-accept") assert.equal(accepted.serverSeq, originalReceipt.serverSeq, "accepted history change is not appended twice");
            await killMcp(mcp); mcp = undefined;
            await resumedProxy.close(); resumedProxy = undefined;
            await stop(demo.child, "SIGKILL"); demo = undefined;
            demo = await startDemo(data, module);
            mcp = await connectMcp(demo.origin, journal);
            assert.equal(value<{status: string}>(await call(mcp.client, "recovery_status")).status, "clear");
            assert.equal(text(await state(demo.origin)), `Human ${afterText}`, "repeated restart must not duplicate the history change");
            assert.equal(value<{status: string}>(await call(mcp.client, action === "undo" ? "redo" : "undo")).status, "confirmed");
            assert.equal(text(await state(demo.origin)), `Human ${beforeText}`);
        } finally {
            if (mcp) await killMcp(mcp);
            await proxy?.close(); await resumedProxy?.close();
            if (demo) await stop(demo.child);
            await rm(root, {recursive: true, force: true});
        }
    });
}

test("unavailable atomic recovery keeps the pending checkpoint and blocks edits until a later restart", {
    timeout: 45000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-undo-unavailable-"));
    const data = join(root, "data"), journal = join(root, "journal"), module = join(root, "clock.mjs");
    const checkpointPath = join(journal, `${document}.json.checkpoint`);
    await writeFile(module, "export {};\n");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    let firstProxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
    let failedProxy: Awaited<ReturnType<typeof historyProxy>> | undefined;
    try {
        demo = await startDemo(data, module);
        firstProxy = await historyProxy(demo.origin, "before-send");
        mcp = await connectMcp(firstProxy.origin, journal);
        const view = value<{revision: Revision}>(await call(mcp.client, "read_document"));
        assert.equal(value<{status: string}>(await call(mcp.client, "edit_document", {base: view.revision,
            edits: [{op: "insert", at: [0, 0], content: "abc"}]})).status, "confirmed");
        firstProxy.arm();
        const undo = call(mcp.client, "undo").catch(() => undefined);
        await firstProxy.barrier();
        const original = await readFile(checkpointPath);
        await killMcp(mcp); mcp = undefined;
        await deadline(undo, "undo completion after SIGKILL");
        await firstProxy.close(); firstProxy = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data, module);
        await userInsert(demo.origin);
        const afterHuman = await state(demo.origin);
        assert.equal(text(afterHuman), "Human abc");
        failedProxy = await historyProxy(demo.origin, "fail-recovery");
        mcp = await connectMcp(failedProxy.origin, journal);
        const recovery = value<{status: string}>(await call(mcp.client, "recovery_status"));
        assert.equal(recovery.status, "recovery_required");
        assert.equal((await call(mcp.client, "redo")).isError, true);
        const upgrade = await call(mcp.client, "upgrade_schema");
        assert.equal(upgrade.isError, true);
        assert.match(JSON.stringify(upgrade), /Resolve recovery before changing schema/);
        const transition = await call(mcp.client, "transition_schema", {
            base: {epoch: afterHuman.epoch, serverSeq: afterHuman.serverSeq, schemaVersion: afterHuman.schemaVersion},
            schema: DEMO_SCHEMA,
        });
        assert.equal(transition.isError, true);
        assert.match(JSON.stringify(transition), /Resolve recovery before changing schema/);
        assert.equal(failedProxy.recoveries(), 1);
        assert.equal(failedProxy.changes(), 0);
        assert.deepEqual(await readFile(checkpointPath), original, "unproven recovery preserves the checkpoint bytes");
        assert.deepEqual((await state(demo.origin)).model, afterHuman.model);
        await killMcp(mcp); mcp = undefined;
        await failedProxy.close(); failedProxy = undefined;
        mcp = await connectMcp(demo.origin, journal);
        assert.equal(value<{status: string}>(await call(mcp.client, "recovery_status")).status, "clear");
        assert.equal(text(await state(demo.origin)), "Human ");
        assert.equal(value<{status: string}>(await call(mcp.client, "redo")).status, "confirmed");
        assert.equal(text(await state(demo.origin)), "Human abc");
    } finally {
        if (mcp) await killMcp(mcp);
        await firstProxy?.close(); await failedProxy?.close();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});
