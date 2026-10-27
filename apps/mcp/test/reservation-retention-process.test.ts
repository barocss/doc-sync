import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm, stat} from "node:fs/promises";
import {createServer, request} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {Doc} from "@barocss/doc-sync";
import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";

const document = "retention-process";
const demoFile = fileURLToPath(new URL("../../demo/server.ts", import.meta.url));
const mcpFile = fileURLToPath(new URL("../src/main.ts", import.meta.url));
type State = {epoch: string; generation: string; serverSeq: number; schemaVersion: string; lastGc: number; frontier: number; model: unknown};
type Result = {isError?: boolean; structuredContent?: unknown};
type Revision = {epoch: string; serverSeq: number; schemaVersion: string | null};

function deadline<T>(promise: Promise<T>, name: string, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([promise, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${name}`)), ms);
    })]).finally(() => clearTimeout(timer));
}

async function startDemo(data: string, threshold = 8) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data, RECOVERY_COMPACT_THRESHOLD: String(threshold)};
    delete env.NO_SCHEMA; delete env.DOC_PROFILE;
    const child = spawn(process.execPath, [demoFile], {env, stdio: ["ignore", "pipe", "pipe"]});
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
    const exited = once(child, "exit"); child.kill(signal);
    await deadline(exited, `server exit after ${signal}`);
}

async function state(origin: string): Promise<State> {
    const response = await fetch(`${origin}/api/docs/${document}/state`);
    assert.equal(response.status, 200);
    return response.json() as Promise<State>;
}

async function post(origin: string, action: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${origin}/api/docs/${document}/${action}`, {
        method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)}, body: JSON.stringify(body),
    });
    const value = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
}

const call = (client: Client, name: string, args: Record<string, unknown> = {}) => client.callTool({name, arguments: args}) as Promise<Result>;
function value<T>(result: Result): T { assert.equal(result.isError, undefined, JSON.stringify(result)); return result.structuredContent as T; }

async function connectMcp(origin: string, journal: string) {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const transport = new StdioClientTransport({command: process.execPath, args: [mcpFile], stderr: "pipe", env: {...env,
        DOC_SYNC_URL: origin, DOC_SYNC_DOCUMENT: document, DOC_SYNC_ACTOR: "retention-ai", DOC_SYNC_JOURNAL: "on", DOC_SYNC_JOURNAL_DIR: journal}});
    const client = new Client({name: "reservation-retention-test", version: "1.0"});
    let stderr = ""; transport.stderr?.on("data", chunk => { stderr += String(chunk); });
    try { await deadline(client.connect(transport), "MCP start"); }
    catch (error) { throw new Error(`MCP startup failed: ${stderr}`, {cause: error}); }
    return {client, transport};
}

async function killMcp(mcp: Awaited<ReturnType<typeof connectMcp>>) {
    assert.ok(mcp.transport.pid); process.kill(mcp.transport.pid, "SIGKILL");
    await mcp.client.close().catch(() => undefined);
}

/** Stop the first creation request before it reaches the server. */
async function reservationGate(origin: string, mode: "create" | "release" = "create") {
    let resolveBarrier!: () => void;
    const barrier = new Promise<void>(resolve => { resolveBarrier = resolve; });
    const server = createServer((req, res) => {
        if (req.method === "POST" && req.url?.endsWith("/recovery-lease")) {
            const chunks: Buffer[] = [];
            req.on("data", chunk => chunks.push(Buffer.from(chunk)));
            req.on("end", () => {
                const body = Buffer.concat(chunks);
                const value = JSON.parse(body.toString("utf8")) as {actor?: unknown; action?: unknown};
                if (value.actor === "retention-ai" && (mode === "create" ? value.action === undefined : value.action === "release")) { resolveBarrier(); return; }
                const upstream = request(`${origin}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(origin).host}}, response => {
                    res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
                });
                upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
                res.on("close", () => upstream.destroy()); upstream.end(body);
            });
            return;
        }
        const upstream = request(`${origin}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(origin).host}}, response => {
            res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
        });
        upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
        res.on("close", () => upstream.destroy()); req.pipe(upstream);
    });
    server.listen(0, "127.0.0.1");
    await deadline(once(server, "listening"), "proxy start");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP proxy");
    return {origin: `http://127.0.0.1:${address.port}`, barrier: () => deadline(barrier, "prepared reservation"),
        async close() { server.closeAllConnections(); await deadline(new Promise<void>(resolve => server.close(() => resolve())), "proxy close"); }};
}

async function churnReservations(origin: string, count: number) {
    for (let i = 0; i < count; i++) {
        const current = await recoveryState(origin);
        const reservation = {generation: current.generation, actor: "churn", reservationId: `r${current.reservationEra}~${crypto.randomUUID()}`, pin: null};
        assert.equal((await post(origin, "recovery-lease", reservation)).status, "protected");
        assert.equal((await post(origin, "recovery-lease", {...reservation, action: "release"})).status, "released");
    }
}

async function recoveryState(origin: string) {
    const response = await fetch(`${origin}/api/docs/${document}/recovery-state`);
    assert.equal(response.status, 200);
    return response.json() as Promise<{generation: string; reservationEra: number}>;
}

async function aiEdit(mcp: Awaited<ReturnType<typeof connectMcp>>, edits: unknown[]) {
    const read = value<{revision: Revision}>(await call(mcp.client, "read_document"));
    assert.equal(value<{status: string}>(await call(mcp.client, "edit_document", {base: read.revision, edits})).status, "confirmed");
}

const log = (data: string) => join(data, `${document}.jsonl`);
const text = (model: unknown) => JSON.stringify(model);

test("reservation retention bounds release metadata and preserves protected history across real restarts", {
    timeout: 60000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async t => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-retention-"));
    const data = join(root, "data"), journal = join(root, "journal");
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
        demo = await startDemo(data);
        mcp = await connectMcp(demo.origin, journal);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
        await aiEdit(mcp, [{op: "delete", at: [0, 1], count: 1}]);
        const before = await state(demo.origin);
        const checkpoint = JSON.parse(await readFile(join(journal, `${document}.json.checkpoint`), "utf8")) as {reservationId: string};
        const legacy = {generation: before.generation, actor: "legacy", reservationId: "old-release", pin: null};
        assert.equal((await post(demo.origin, "recovery-lease", {...legacy, action: "release"})).status, "released");

        // Keep another participant's old-era pin across every compaction.
        const era0 = await recoveryState(demo.origin);
        assert.equal(era0.generation, before.generation);
        assert.ok(Number.isSafeInteger(era0.reservationEra));
        const other = {generation: before.generation, actor: "other", reservationId: `r${era0.reservationEra}~${crypto.randomUUID()}`, pin: before.serverSeq};
        assert.equal((await post(demo.origin, "recovery-lease", other)).status, "protected");

        const human = new Doc("human", DEMO_SCHEMA);
        const humanChange = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "Human "}]).ops};
        const humanBase = {epoch: before.epoch, serverSeq: before.serverSeq, schemaVersion: before.schemaVersion};
        const humanReply = await post(demo.origin, "conditional", {base: humanBase, change: humanChange});
        assert.equal(humanReply.status, "accepted");
        const receipt = {generation: before.generation, base: humanBase, change: humanChange};
        const expectedReceipt = await post(demo.origin, "receipt", receipt);
        assert.equal(expectedReceipt.status, "accepted");

        let middleSize = 0, middlePins = 0;
        for (let i = 0; i < 48; i++) {
            const current = await recoveryState(demo.origin);
            const value = {generation: before.generation, actor: "churn", reservationId: `r${current.reservationEra}~${crypto.randomUUID()}`, pin: null};
            assert.equal((await post(demo.origin, "recovery-lease", value)).status, "protected");
            assert.equal((await post(demo.origin, "recovery-lease", {...value, action: "release"})).status, "released");
            if (i === 23) {
                middleSize = (await stat(log(data))).size;
                middlePins = (await readFile(log(data), "utf8")).trimEnd().split("\n").map(line => JSON.parse(line) as Record<string, unknown>).filter(record => !!record.recoveryPin).length;
            }
        }
        const after = await recoveryState(demo.origin);
        assert.ok(after.reservationEra > era0.reservationEra, "reservation metadata must compact and seal an era");
        const records = (await readFile(log(data), "utf8")).trimEnd().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
        assert.ok(records.some(record => !!record.recoveryState), "compacted log must contain canonical recovery state");
        const finalSize = (await stat(log(data))).size, finalPins = records.filter(record => !!record.recoveryPin).length;
        t.diagnostic(`threshold=8; 24 cycles: ${middleSize} bytes, ${middlePins} recoveryPin records; 48 cycles: ${finalSize} bytes, ${finalPins} recoveryPin records. Document changes and receipts remain in the log.`);
        assert.ok(finalPins < 16, "recent release records stay bounded by the test threshold");
        assert.ok(finalSize <= middleSize + 2048, "additional release churn must not grow the log linearly");
        assert.deepEqual(await post(demo.origin, "receipt", receipt), expectedReceipt, "conditional receipt survives metadata compaction");
        assert.equal((await post(demo.origin, "recovery-lease", {...other, requireExisting: true})).status, "protected");
        assert.equal((await post(demo.origin, "recovery-lease", {...legacy, requireExisting: false})).status, "unsafe");
        assert.equal((await post(demo.origin, "recovery-lease", {...legacy, action: "release"})).status, "released");
        assert.equal((await post(demo.origin, "recover-change", {generation: before.generation, reservationId: legacy.reservationId,
            schemaVersion: before.schemaVersion, change: {actor: legacy.actor, seq: 1, ops: []}})).status, "unsafe");
        await post(demo.origin, "gc", {});
        assert.ok((await state(demo.origin)).lastGc < before.serverSeq, "live old-era pins protect deletions");

        await killMcp(mcp); mcp = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data);
        assert.deepEqual(await post(demo.origin, "receipt", receipt), expectedReceipt);
        assert.equal((await post(demo.origin, "recovery-lease", {...other, requireExisting: true})).status, "protected");
        assert.equal((await post(demo.origin, "recovery-lease", {...legacy})).status, "unsafe");
        assert.equal((await post(demo.origin, "recovery-lease", {generation: before.generation, actor: "retention-ai", reservationId: checkpoint.reservationId, pin: null, requireExisting: true})).status, "protected");
        mcp = await connectMcp(demo.origin, journal);
        const restored = value<{document: unknown; recoveryRequired: boolean}>(await call(mcp.client, "read_document"));
        assert.equal(restored.recoveryRequired, false);
        assert.match(text(restored.document), /Human/);
        assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "confirmed");
        const undone = await state(demo.origin);
        assert.match(text(undone.model), /Human/);
        assert.match(text(undone.model), /abc/);
    } finally {
        if (mcp) await killMcp(mcp);
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

test("an empty unconfirmed checkpoint changes its stale era only after server and MCP restart", {
    timeout: 45000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-retention-prepare-"));
    const data = join(root, "data"), journal = join(root, "journal"), path = join(journal, `${document}.json.checkpoint`);
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let gate: Awaited<ReturnType<typeof reservationGate>> | undefined;
    let first: ChildProcess | undefined;
    let resumed: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
        demo = await startDemo(data);
        gate = await reservationGate(demo.origin);
        first = spawn(process.execPath, [mcpFile], {stdio: ["pipe", "pipe", "pipe"], env: {...process.env,
            DOC_SYNC_URL: gate.origin, DOC_SYNC_DOCUMENT: document, DOC_SYNC_ACTOR: "retention-ai", DOC_SYNC_JOURNAL: "on", DOC_SYNC_JOURNAL_DIR: journal}});
        let stderr = ""; first.stderr?.on("data", chunk => { stderr += String(chunk); });
        await gate.barrier();
        const prepared = JSON.parse(await readFile(path, "utf8")) as {reservationId: string; reservationConfirmed: boolean; client: {pending: unknown[]}};
        assert.equal(prepared.reservationConfirmed, false);
        assert.equal(prepared.client.pending.length, 0);
        const initial = await state(demo.origin);
        const initialEra = await recoveryState(demo.origin);
        await churnReservations(demo.origin, 10);
        const newEra = await recoveryState(demo.origin);
        assert.ok(newEra.reservationEra > initialEra.reservationEra);
        assert.equal((await post(demo.origin, "recovery-lease", {generation: initial.generation, actor: "retention-ai", reservationId: prepared.reservationId, pin: null})).status, "unsafe");
        const human = new Doc("human", DEMO_SCHEMA);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "Human"}]).ops};
        const latest = await state(demo.origin);
        assert.equal((await post(demo.origin, "conditional", {base: {epoch: latest.epoch, serverSeq: latest.serverSeq, schemaVersion: latest.schemaVersion}, change})).status, "accepted");
        if (first.exitCode !== null || first.signalCode !== null) throw new Error(`MCP exited before SIGKILL: ${stderr}`);
        await stop(first, "SIGKILL"); first = undefined;
        await gate.close(); gate = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data);
        resumed = await connectMcp(demo.origin, journal);
        const read = value<{document: unknown; recoveryRequired: boolean; pending: number}>(await call(resumed.client, "read_document"));
        assert.equal(read.recoveryRequired, false);
        assert.equal(read.pending, 0);
        assert.match(text(read.document), /Human/);
        const saved = JSON.parse(await readFile(path, "utf8")) as {reservationId: string; reservationConfirmed: boolean};
        assert.notEqual(saved.reservationId, prepared.reservationId);
        assert.equal(saved.reservationConfirmed, true);
        await aiEdit(resumed, [{op: "insert", at: [0, 0], content: "AI"}]);
        assert.equal(value<{status: string}>(await call(resumed.client, "undo")).status, "confirmed");
        assert.match(text((await state(demo.origin)).model), /Human/);
    } finally {
        if (first) await stop(first, "SIGKILL");
        if (gate) await gate.close();
        if (resumed) await killMcp(resumed);
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

test("paired 48-cycle comparison bounds recovery records without removing document receipts", {timeout: 60000}, async t => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-retention-compare-"));
    async function run(threshold: number) {
        const data = join(root, `threshold-${threshold}`);
        let demo = await startDemo(data, threshold);
        try {
            const initial = await state(demo.origin);
            const doc = new Doc("human", DEMO_SCHEMA);
            const change = {actor: "human", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "retained"}]).ops};
            const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
            assert.equal((await post(demo.origin, "conditional", {base, change})).status, "accepted");
            const current = await recoveryState(demo.origin);
            const active = {generation: initial.generation, actor: "other", reservationId: `r${current.reservationEra}~${crypto.randomUUID()}`, pin: null};
            assert.equal((await post(demo.origin, "recovery-lease", active)).status, "protected");
            const receipt = {generation: initial.generation, base, change};
            const expected = await post(demo.origin, "receipt", receipt);
            assert.equal(expected.status, "accepted");
            await churnReservations(demo.origin, 48);
            const size = (await stat(log(data))).size;
            const records = (await readFile(log(data), "utf8")).trimEnd().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
            const pins = records.filter(record => !!record.recoveryPin).length;
            await stop(demo.child, "SIGKILL");
            demo = await startDemo(data, threshold);
            assert.deepEqual(await post(demo.origin, "receipt", receipt), expected);
            assert.equal((await post(demo.origin, "recovery-lease", {...active, requireExisting: true})).status, "protected");
            assert.match(text((await state(demo.origin)).model), /retained/);
            return {size, pins};
        } finally { await stop(demo.child); }
    }
    try {
        const baseline = await run(10000), compacted = await run(8);
        t.diagnostic(`48 create/release cycles: threshold 10000 = ${baseline.size} bytes, ${baseline.pins} recoveryPin records; threshold 8 = ${compacted.size} bytes, ${compacted.pins} recoveryPin records. Document changes and receipts remain; this is not a heap or throughput measurement.`);
        assert.ok(baseline.pins >= 96);
        assert.ok(compacted.pins < 16);
        assert.ok(compacted.size * 2 < baseline.size);
    } finally { await rm(root, {recursive: true, force: true}); }
});

test("releasePending from a sealed era finishes after MCP and server restart", {
    timeout: 60000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
}, async () => {
    const root = await mkdtemp(join(tmpdir(), "doc-sync-retention-release-"));
    const data = join(root, "data"), journal = join(root, "journal"), path = join(journal, `${document}.json.checkpoint`);
    let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
    let gate: Awaited<ReturnType<typeof reservationGate>> | undefined;
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
        demo = await startDemo(data);
        gate = await reservationGate(demo.origin, "release");
        mcp = await connectMcp(gate.origin, journal);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "abc"}]);
        await aiEdit(mcp, [{op: "delete", at: [0, 1], count: 1}]);
        const before = await state(demo.origin), old = await recoveryState(demo.origin);
        const discarded = call(mcp.client, "discard_history").catch(() => undefined);
        await gate.barrier();
        const pending = JSON.parse(await readFile(path, "utf8")) as {releasePending: boolean; reservationId: string};
        assert.equal(pending.releasePending, true);
        await churnReservations(demo.origin, 10);
        assert.ok((await recoveryState(demo.origin)).reservationEra > old.reservationEra);
        assert.equal((await post(demo.origin, "recovery-lease", {generation: before.generation, actor: "retention-ai", reservationId: pending.reservationId, pin: null, requireExisting: true})).status, "protected");
        const human = new Doc("human", DEMO_SCHEMA), latest = await state(demo.origin);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "Human"}]).ops};
        assert.equal((await post(demo.origin, "conditional", {base: {epoch: latest.epoch, serverSeq: latest.serverSeq, schemaVersion: latest.schemaVersion}, change})).status, "accepted");
        await killMcp(mcp); mcp = undefined;
        await deadline(discarded, "discard result after SIGKILL");
        await gate.close(); gate = undefined;
        await stop(demo.child, "SIGKILL"); demo = undefined;
        demo = await startDemo(data);
        mcp = await connectMcp(demo.origin, journal);
        const read = value<{document: unknown; recoveryRequired: boolean}>(await call(mcp.client, "read_document"));
        assert.equal(read.recoveryRequired, false);
        assert.match(text(read.document), /Human/);
        assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "no_change");
        assert.equal((await post(demo.origin, "recovery-lease", {generation: before.generation, actor: "retention-ai", reservationId: pending.reservationId, pin: null, requireExisting: true})).status, "unsafe");
        const saved = JSON.parse(await readFile(path, "utf8")) as {reservationId: string; reservationConfirmed: boolean; releasePending?: boolean};
        assert.notEqual(saved.reservationId, pending.reservationId);
        assert.equal(saved.reservationConfirmed, true);
        assert.equal(saved.releasePending, undefined);
        await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "new"}]);
        assert.equal(value<{status: string}>(await call(mcp.client, "undo")).status, "confirmed");
        assert.match(text((await state(demo.origin)).model), /Human/);
    } finally {
        if (mcp) await killMcp(mcp);
        if (gate) await gate.close();
        if (demo) await stop(demo.child);
        await rm(root, {recursive: true, force: true});
    }
});

for (const mode of ["history", "pending", "intent"] as const) {
    test(`stale unconfirmed checkpoint with ${mode} is preserved instead of rekeyed`, {
        timeout: 45000, skip: process.platform !== "darwin" ? "The journal requires the macOS kernel lock" : false,
    }, async () => {
        const root = await mkdtemp(join(tmpdir(), `doc-sync-retention-${mode}-`));
        const data = join(root, "data"), journalDir = join(root, "journal"), journalPath = join(journalDir, `${document}.json`);
        let demo: Awaited<ReturnType<typeof startDemo>> | undefined;
        let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
        let journal: IntentJournal | undefined;
        try {
            demo = await startDemo(data);
            mcp = await connectMcp(demo.origin, journalDir);
            if (mode === "history") await aiEdit(mcp, [{op: "insert", at: [0, 0], content: "saved"}]);
            await killMcp(mcp); mcp = undefined;
            journal = await IntentJournal.open(journalPath, {document, actor: "retention-ai"});
            const checkpoint = await journal.readCheckpoint(); assert.ok(checkpoint);
            const {format: _format, document: _document, actor: _actor, recordDigest: _digest, ...input} = checkpoint;
            const edits = [{op: "insert" as const, at: [0, 0], content: "pending"}];
            if (mode === "pending" || mode === "intent") {
                const draft = Doc.fromSnapshot("retention-ai", input.client.snapshot, input.schema);
                const {ops} = draft.edit(edits);
                const change = {actor: "retention-ai", seq: input.client.seq + 1, ops};
                if (mode === "pending") input.client = {...input.client, seq: change.seq, pending: [change], snapshot: draft.snapshot()};
                else await journal.prepare({generation: input.generation,
                    base: {epoch: input.epoch, serverSeq: input.client.serverSeq, schemaVersion: input.client.schemaVersion},
                    change, edits, snapshot: input.client.snapshot, schema: input.schema});
            }
            // Build a deliberately inconsistent but valid recovery fixture. It must never authorize rekeying.
            await journal.writeCheckpoint({...input, reservationConfirmed: false, sourceIntentDigest: null});
            await journal.close(); journal = undefined;
            const bytes = await readFile(`${journalPath}.checkpoint`);
            assert.equal((await post(demo.origin, "recovery-lease", {generation: checkpoint.generation, actor: "retention-ai", reservationId: checkpoint.reservationId, action: "release"})).status, "released");
            const before = await recoveryState(demo.origin);
            await churnReservations(demo.origin, 10);
            assert.ok((await recoveryState(demo.origin)).reservationEra > before.reservationEra);
            await stop(demo.child, "SIGKILL"); demo = await startDemo(data);
            mcp = await connectMcp(demo.origin, journalDir);
            const read = value<{recoveryRequired: boolean}>(await call(mcp.client, "read_document"));
            assert.equal(read.recoveryRequired, true);
            assert.equal((await call(mcp.client, "undo")).isError, true);
            assert.equal((await call(mcp.client, "discard_history")).isError, true);
            assert.deepEqual(await readFile(`${journalPath}.checkpoint`), bytes);
            if (mode === "intent") assert.ok((await stat(journalPath)).size > 0, "the conditional intent stays on disk");
        } finally {
            await journal?.close();
            if (mcp) await killMcp(mcp);
            if (demo) await stop(demo.child);
            await rm(root, {recursive: true, force: true});
        }
    });
}
