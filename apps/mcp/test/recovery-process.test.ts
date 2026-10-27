import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createServer, request, type Server} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};
type Model = {children?: Array<{runs?: Array<{text?: string}>}>};
type State = {generation: string | null; epoch: string; serverSeq: number; model: Model};
type JournalRecord = {generation: string; base: Revision; change: unknown; actor: string; document: string; state: string};
type ToolResult = {isError?: boolean; content?: unknown; structuredContent?: unknown};

const demoFile = fileURLToPath(new URL("../../demo/server.ts", import.meta.url));
const mcpFile = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const document = "recovery-test";
const actor = "ai-recovery";

function deadline<T>(promise: Promise<T>, label: string, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([promise, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
    })]).finally(() => clearTimeout(timer));
}

async function startDemo(data: string) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data};
    delete env.NO_SCHEMA;
    delete env.DOC_PROFILE;
    const child = spawn(process.execPath, [demoFile], {env, stdio: ["ignore", "pipe", "pipe"]});
    let output = "", errors = "";
    child.stderr.on("data", chunk => { errors += String(chunk); });
    const origin = await deadline(new Promise<string>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", code => reject(new Error(`Demo exited ${code}: ${errors}`)));
        child.stdout.on("data", chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/localhost:(\d+)/);
            if (match) resolve(`http://127.0.0.1:${match[1]}`);
        });
    }), "demo server start");
    return {child, origin};
}

async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill(signal);
    await deadline(exited, `child exit after ${signal}`);
}

/** A fault proxy isolates the exact point at which the request is interrupted. */
async function startProxy(origin: string, mode: "before-send" | "after-accept" | "pass") {
    let reached!: () => void;
    let failed!: (error: Error) => void;
    const barrier = new Promise<void>((resolve, reject) => { reached = resolve; failed = reject; });
    let streamCount = 0, ackCount = 0, conditionalCount = 0;
    const server = createServer((req, res) => {
        if (req.url?.includes("/stream")) streamCount++;
        if (req.url?.endsWith("/ack")) ackCount++;
        const conditional = req.method === "POST" && req.url?.endsWith("/conditional");
        if (conditional) conditionalCount++;
        if (conditional && mode === "before-send") {
            // The journal must already be durable before the outgoing request reaches here.
            req.resume();
            req.on("end", () => reached());
            return;
        }
        const upstream = request(`${origin}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(origin).host}}, response => {
            if (conditional && mode === "after-accept") {
                let body = "";
                response.on("data", chunk => { body += String(chunk); });
                response.on("end", () => {
                    if (response.statusCode !== 200) return failed(new Error(`Conditional response ${response.statusCode}: ${body}`));
                    try {
                        assert.equal(JSON.parse(body).status, "accepted");
                        reached();
                    } catch (error) { failed(error as Error); }
                });
                return;
            }
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
        });
        upstream.on("error", error => {
            if (conditional) failed(error);
            if (!res.headersSent) res.writeHead(502);
            res.end();
        });
        res.on("close", () => upstream.destroy());
        req.pipe(upstream);
    });
    server.listen(0, "127.0.0.1");
    await deadline(once(server, "listening"), "proxy listen");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP proxy");
    return {
        origin: `http://127.0.0.1:${address.port}`,
        barrier: () => deadline(barrier, `${mode} barrier`),
        counts: () => ({streamCount, ackCount, conditionalCount}),
        async close() {
            server.closeAllConnections();
            await deadline(new Promise<void>(resolve => server.close(() => resolve())), "proxy close");
        },
    };
}

async function connectMcp(origin: string, journalDir: string) {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const transport = new StdioClientTransport({command: process.execPath, args: [mcpFile],
        env: {...env, DOC_SYNC_URL: origin, DOC_SYNC_DOCUMENT: document, DOC_SYNC_ACTOR: actor, DOC_SYNC_JOURNAL_DIR: journalDir}, stderr: "pipe"});
    const client = new Client({name: "process-recovery-test", version: "1.0"});
    await deadline(client.connect(transport), "MCP connection");
    return {client, transport};
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    return client.callTool({name, arguments: args}) as Promise<ToolResult>;
}

function value<T>(result: ToolResult): T {
    assert.equal(result.isError, undefined, JSON.stringify(result));
    return result.structuredContent as T;
}

async function state(origin: string): Promise<State> {
    const response = await fetch(`${origin}/api/docs/${document}/state`);
    assert.equal(response.status, 200);
    return response.json() as Promise<State>;
}

const text = (model: Model) => (model.children?.[0]?.runs ?? []).map(run => run.text ?? "").join("");

async function userInsert(origin: string) {
    const transport = new NodeHttpTransport(document, "human-recovery", origin);
    const client = new SyncClient("human-recovery", transport, {schema: DEMO_SCHEMA});
    client.connect();
    try {
        const end = Date.now() + 5000;
        while ((!client.epoch || !client.schemaVerified) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(client.epoch && client.schemaVerified, "human must receive the server snapshot");
        client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "Human "}]).ops);
        while (client.pending.length && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(client.pending.length, 0, "human edit was acknowledged");
    } finally {
        client.disconnect();
        await transport.leave().catch(() => undefined);
    }
}

for (const mode of ["before-send", "after-accept"] as const) {
    test(`SIGKILL ${mode}: conditional intent survives process and server restart`, {
        timeout: 45_000,
        skip: process.platform !== "darwin" ? "The durable journal currently requires the macOS kernel lock" : false,
    }, async () => {
        const root = await mkdtemp(join(tmpdir(), `doc-sync-recovery-${mode}-`));
        const data = join(root, "server"), journalDir = join(root, "journal");
        let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
        let firstProxy: Awaited<ReturnType<typeof startProxy>> | undefined;
        let secondProxy: Awaited<ReturnType<typeof startProxy>> | undefined;
        let first: Awaited<ReturnType<typeof connectMcp>> | undefined;
        let resumed: Awaited<ReturnType<typeof connectMcp>> | undefined;
        try {
            demo = await startDemo(data);
            firstProxy = await startProxy(demo.origin, mode);
            first = await connectMcp(firstProxy.origin, journalDir);
            const initial = value<{revision: Revision}>(await call(first.client, "read_document"));
            const editPromise = call(first.client, "edit_document", {base: initial.revision, edits: [{op: "insert", at: [0, 0], content: "AI"}]}).catch(() => undefined);
            await firstProxy.barrier();
            const journalPath = join(journalDir, `${document}.json`);
            const original = await readFile(journalPath);
            const record = JSON.parse(original.toString("utf8")) as JournalRecord;
            assert.equal(record.actor, actor);
            assert.equal(record.document, document);
            assert.ok(record.generation);
            assert.deepEqual(record.base, initial.revision);
            const pid = first.transport.pid;
            assert.ok(pid, "SDK must expose the MCP child PID");
            process.kill(pid, "SIGKILL");
            await deadline(editPromise, "MCP call completion after SIGKILL");
            await first.client.close().catch(() => undefined);
            first = undefined;
            await firstProxy.close(); firstProxy = undefined;
            const beforeRestart = await state(demo.origin);
            assert.equal(beforeRestart.serverSeq, mode === "after-accept" ? 1 : 0);
            assert.equal(text(beforeRestart.model), mode === "after-accept" ? "AI" : "");
            await stop(demo.child); demo = undefined;
            demo = await startDemo(data);
            const afterRestart = await state(demo.origin);
            assert.equal(afterRestart.generation, beforeRestart.generation, "document generation survives server restart");
            assert.notEqual(afterRestart.epoch, beforeRestart.epoch, "server process has a new epoch");
            await userInsert(demo.origin);
            const afterHuman = await state(demo.origin);
            assert.equal(text(afterHuman.model), mode === "after-accept" ? "Human AI" : "Human ");
            const receiptTransport = new NodeHttpTransport(document, actor, demo.origin);
            const receipt = await receiptTransport.getRecoveryReceipt(record.generation, record.base, record.change as Parameters<NodeHttpTransport["getRecoveryReceipt"]>[2]);
            assert.equal(receipt.status, mode === "after-accept" ? "accepted" : "unknown");
            secondProxy = await startProxy(demo.origin, "pass");
            resumed = await connectMcp(secondProxy.origin, journalDir);
            const recovery = value<{status: string; record: JournalRecord; receipt: {status: string}}>(await call(resumed.client, "recovery_status"));
            if (mode === "before-send") {
                assert.equal(recovery.status, "recovery_required");
                assert.equal(recovery.receipt.status, "unknown");
                assert.deepEqual(recovery.record.base, initial.revision);
                assert.deepEqual(recovery.record.change, record.change);
                const blocked = await call(resumed.client, "edit_document", {base: initial.revision, edits: [{op: "insert", at: [0, 0], content: "duplicate"}]});
                assert.equal(blocked.isError, true);
                assert.deepEqual(secondProxy.counts(), {streamCount: 0, ackCount: 0, conditionalCount: 0}, "unknown intent must not join, ACK, or retry");
                assert.deepEqual(await readFile(journalPath), original, "inspection must preserve the exact recovery record");
                const final = await state(demo.origin);
                assert.equal(final.serverSeq, afterHuman.serverSeq);
                assert.deepEqual(final.model, afterHuman.model);
            } else {
                assert.equal(recovery.status, "clear", "an exact accepted receipt restores the session");
                await assert.rejects(readFile(journalPath), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
                assert.ok(secondProxy.counts().streamCount >= 1, "restored session reconnects");
                assert.equal(secondProxy.counts().conditionalCount, 0, "the accepted conditional edit is not resent");
                const reconciled = await state(demo.origin);
                assert.equal(reconciled.serverSeq, afterHuman.serverSeq, "restoration does not duplicate the accepted edit");
                assert.deepEqual(reconciled.model, afterHuman.model, "restoration preserves both users' edits");
                const undo = value<{status: string}>(await call(resumed.client, "undo"));
                assert.equal(undo.status, "confirmed");
                const afterUndo = await state(demo.origin);
                assert.equal(text(afterUndo.model), "Human ", "restored undo preserves the other user's edit");
                const redo = value<{status: string}>(await call(resumed.client, "redo"));
                assert.equal(redo.status, "confirmed");
                const afterRedo = await state(demo.origin);
                assert.equal(text(afterRedo.model), "Human AI", "restored redo restores only the AI edit");
                assert.equal(afterRedo.serverSeq, reconciled.serverSeq + 2);
            }
        } finally {
            await resumed?.client.close().catch(() => undefined);
            if (first?.transport.pid) process.kill(first.transport.pid, "SIGKILL");
            await first?.client.close().catch(() => undefined);
            await firstProxy?.close();
            await secondProxy?.close();
            if (demo) await stop(demo.child);
            await rm(root, {recursive: true, force: true});
        }
    });
}
