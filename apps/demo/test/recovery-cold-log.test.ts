import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rename, rm, stat, unlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {DocHub} from "@barocss/doc-sync/server";
import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const serverFile = fileURLToPath(new URL("../server.ts", import.meta.url));
const docName = "cold-large";
const recordCount = 20_000;
type State = {epoch: string; generation: string; serverSeq: number; schemaVersion: string; model: unknown; lastGc: number};
type Fixture = {bytes: string; generation: string; base: {epoch: string; serverSeq: number; schemaVersion: string};
    change: {actor: string; seq: number; ops: ReturnType<Doc["edit"]>["ops"]}; pinId: string; pin: number};
let fixtureCache: Fixture | undefined;

/** Validate every fixture change against the real hub; this is not a no-op log. */
function fixture(): Fixture {
    if (fixtureCache) return fixtureCache;
    const generation = crypto.randomUUID(), version = schemaVersion(DEMO_SCHEMA);
    const local = new Doc("fixture", DEMO_SCHEMA), hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const base = {epoch: "fixture-epoch", serverSeq: 0, schemaVersion: version};
    const change = {actor: "fixture", seq: 1, ops: local.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops};
    assert.ok(hub.submit(change, base));
    const records = [JSON.stringify({format: "doc-sync-log-v1", generation, initialSchemaVersion: version}), JSON.stringify({change, conditionalBase: base})];
    for (let i = 0; i < recordCount; i++) {
        const ops = local.edit([{op: "update", at: [0, 0], length: 1, attrs: {bold: i % 2 === 0}}]).ops;
        assert.ok(ops.length);
        const next = {actor: "fixture", seq: i + 2, ops};
        assert.ok(hub.submit(next));
        records.push(JSON.stringify({change: next}));
    }
    const pinId = `r0~${crypto.randomUUID()}`, pin = hub.serverSeq + 1;
    hub.onRecoveryPin = () => undefined;
    assert.equal(hub.reserveRecovery(generation, "fixture", pinId, null).status, "protected");
    records.push(JSON.stringify({recoveryPin: {actor: "fixture", reservationId: pinId, pin}}));
    const deletion = {actor: "fixture", seq: recordCount + 2, ops: local.edit([{op: "delete", at: [0, 1], count: 1}]).ops};
    assert.ok(hub.submit(deletion)); records.push(JSON.stringify({change: deletion}));
    const bytes = `${records.join("\n")}\n`;
    assert.ok(Buffer.byteLength(bytes) > 3_000_000);
    return fixtureCache = {bytes, generation, base, change, pinId, pin};
}

async function start(data: string, gate = false, fsyncGate = false, fsyncStage: "before-sync" | "after-sync" = "before-sync", resetGate = false, compactionGate = false) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data,
        ...(gate ? {DOC_SYNC_TEST_COLD_GATE_DOC: docName} : {}),
        ...(fsyncGate ? {DOC_SYNC_TEST_FSYNC_GATE_DOC: docName, DOC_SYNC_TEST_FSYNC_GATE_STAGE: fsyncStage} : {}),
        ...(resetGate ? {DOC_SYNC_TEST_RESET_GATE_DOC: docName} : {}),
        ...(compactionGate ? {DOC_SYNC_TEST_COMPACTION_GATE: "1", RECOVERY_COMPACT_THRESHOLD: "2"} : {})};
    delete env.NO_SCHEMA; delete env.DOC_PROFILE;
    if (!gate) delete env.DOC_SYNC_TEST_COLD_GATE_DOC;
    if (!fsyncGate) { delete env.DOC_SYNC_TEST_FSYNC_GATE_DOC; delete env.DOC_SYNC_TEST_FSYNC_GATE_STAGE; }
    if (!resetGate) delete env.DOC_SYNC_TEST_RESET_GATE_DOC;
    if (!compactionGate) { delete env.DOC_SYNC_TEST_COMPACTION_GATE; delete env.RECOVERY_COMPACT_THRESHOLD; }
    delete env.DOC_SYNC_TEST_RECEIPT_GATE;
    const child = spawn(process.execPath, [serverFile], {cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"]});
    let stderr = ""; child.stderr.on("data", chunk => { stderr += String(chunk); });
    const origin = await new Promise<string>((resolve, reject) => {
        let stdout = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error(`server timeout: ${stderr}`)); }, 15_000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${stderr}`)); });
        child.stdout.on("data", chunk => {
            stdout += String(chunk); const match = stdout.match(/http:\/\/localhost:(\d+)/);
            if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
        });
    });
    return {origin, async stop(signal: NodeJS.Signals = "SIGTERM") {
        if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(signal); await exited; }
    }};
}

const url = (origin: string, doc: string, action: string) => `${origin}/api/docs/${doc}/${action}`;
function post(origin: string, doc: string, action: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(url(origin, doc, action), {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), ...headers}, body: JSON.stringify(body)});
}
async function json(response: Response) {
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<Record<string, unknown>>;
}
async function state(origin: string, doc = docName): Promise<State> {
    return await json(await fetch(url(origin, doc, "state"))) as unknown as State;
}
async function waitForCold(origin: string, minimumWaiters = 1) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const response = await fetch(url(origin, docName, "cold-state"));
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json() as {phase?: string; waiters?: number};
        if (result.phase === "paused" && (result.waiters ?? 0) >= minimumWaiters) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Cold loader did not reach the expected test boundary");
}
async function releaseCold(origin: string) {
    assert.equal((await post(origin, docName, "cold-test-release", {})).status, 200);
}
async function waitForFsync(origin: string, minimumWaiters = 1) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const response = await fetch(url(origin, docName, "fsync-state"));
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json() as {phase?: string; waiters?: number};
        if (result.phase === "paused" && (result.waiters ?? 0) >= minimumWaiters) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("File sync did not reach the expected test boundary");
}
async function waitForReset(origin: string, minimumWaiters = 1) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const response = await fetch(url(origin, docName, "reset-state"));
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json() as {phase?: string; waiters?: number};
        if (result.phase === "paused" && (result.waiters ?? 0) >= minimumWaiters) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Reset did not reach the expected test boundary");
}
async function waitForCompaction(origin: string) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const response = await fetch(url(origin, docName, "compaction-state"));
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json() as {phase?: string};
        if (result.phase === "paused") return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Compaction did not reach the expected test boundary");
}

async function waitUntil(check: () => boolean, description: string) {
    const deadline = Date.now() + 10_000;
    while (!check()) {
        if (Date.now() >= deadline) throw new Error(`Timed out: ${description}`);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

test("cold replay shares one load while another document remains responsive", {timeout: 120_000}, async t => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-cold-load-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = fixture(), path = join(data, `${docName}.jsonl`);
        await writeFile(path, input.bytes, {mode: 0o600});
        server = await start(data, true);
        await state(server.origin, "warm");
        const first = fetch(url(server.origin, docName, "state"));
        await waitForCold(server.origin);
        const second = fetch(url(server.origin, docName, "recovery-state"));
        await waitForCold(server.origin, 2);
        const warm = await Promise.race([state(server.origin, "warm"), new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Unrelated document was blocked by cold replay")), 3000))]);
        assert.equal(warm.serverSeq, 0);
        await releaseCold(server.origin);
        const cold = await json(await first) as unknown as State;
        const recovery = await json(await second);
        assert.equal(cold.generation, input.generation);
        assert.equal(cold.serverSeq, recordCount + 2);
        assert.equal(recovery.generation, input.generation);
        const receipt = {generation: input.generation, base: input.base, change: input.change};
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", receipt)), {status: "accepted", generation: input.generation, serverSeq: 1});
        const held = {generation: input.generation, actor: "fixture", reservationId: input.pinId, pin: null, requireExisting: true};
        assert.equal((await json(await post(server.origin, docName, "recovery-lease", held))).status, "protected");
        assert.equal((await json(await post(server.origin, docName, "gc", {}))).gc, null);
        const bytes = (await stat(path)).size;
        await server.stop("SIGKILL"); server = await start(data);
        const restarted = await state(server.origin);
        assert.equal(restarted.generation, input.generation);
        assert.equal(restarted.serverSeq, recordCount + 2);
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", receipt)), {status: "accepted", generation: input.generation, serverSeq: 1});
        assert.equal((await json(await post(server.origin, docName, "recovery-lease", held))).status, "protected");
        assert.equal((await json(await post(server.origin, docName, "gc", {}))).gc, null);
        t.diagnostic(`Cold fixture: ${recordCount} real formatting changes, ${bytes} bytes; shared load and unrelated document were observed at a deterministic gate.`);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("cold replay refuses a truncated log without changing its original bytes", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-cold-truncated-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = fixture(), path = join(data, `${docName}.jsonl`);
        const truncated = input.bytes.slice(0, -7);
        await writeFile(path, truncated, {mode: 0o600});
        server = await start(data);
        const response = await fetch(url(server.origin, docName, "state"));
        assert.ok(response.status >= 500, `cold load unexpectedly succeeded: ${response.status}`);
        assert.equal(await readFile(path, "utf8"), truncated);
        const receipt = {generation: input.generation, base: input.base, change: input.change};
        const receiptResponse = await post(server.origin, docName, "receipt", receipt);
        assert.ok(receiptResponse.status >= 500);
        assert.equal(await readFile(path, "utf8"), truncated);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("cold replay detects a same-size change after opening the source", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-cold-tamper-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = fixture(), path = join(data, `${docName}.jsonl`);
        await writeFile(path, input.bytes, {mode: 0o600});
        server = await start(data, true);
        const pending = fetch(url(server.origin, docName, "state"));
        await waitForCold(server.origin);
        const tampered = input.bytes.replace('"epoch":"fixture-epoch"', '"epoch":"fixture-epoCh"');
        assert.notEqual(tampered, input.bytes);
        assert.equal(Buffer.byteLength(tampered), Buffer.byteLength(input.bytes));
        await writeFile(path, tampered);
        await releaseCold(server.origin);
        const response = await pending;
        assert.ok(response.status >= 500, `changed cold source must not be accepted: ${response.status}`);
        assert.equal(await readFile(path, "utf8"), tampered, "a changed source must not be rewritten");
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("cold replay interrupted by SIGKILL leaves the original log recoverable", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-cold-kill-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = fixture(), path = join(data, `${docName}.jsonl`);
        await writeFile(path, input.bytes, {mode: 0o600});
        server = await start(data, true);
        const pending = fetch(url(server.origin, docName, "state")).catch(() => undefined);
        await waitForCold(server.origin);
        await server.stop("SIGKILL"); await pending;
        assert.equal(await readFile(path, "utf8"), input.bytes);
        server = await start(data);
        const recovered = await state(server.origin);
        assert.equal(recovered.generation, input.generation);
        assert.equal(recovered.serverSeq, recordCount + 2);
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", {generation: input.generation, base: input.base, change: input.change})),
            {status: "accepted", generation: input.generation, serverSeq: 1});
        const held = {generation: input.generation, actor: "fixture", reservationId: input.pinId, pin: null, requireExisting: true};
        assert.equal((await json(await post(server.origin, docName, "recovery-lease", held))).status, "protected");
        assert.equal((await json(await post(server.origin, docName, "gc", {}))).gc, null);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("reset queued behind cold replay cannot restore the old generation", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-cold-reset-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = fixture(), path = join(data, `${docName}.jsonl`);
        await writeFile(path, input.bytes, {mode: 0o600});
        server = await start(data, true);
        const pendingRead = fetch(url(server.origin, docName, "state"));
        await waitForCold(server.origin);
        const pendingReset = post(server.origin, docName, "reset", {});
        await waitForCold(server.origin, 2);
        await releaseCold(server.origin);
        assert.equal((await pendingRead).status, 200);
        assert.equal((await pendingReset).status, 200);
        const reset = await state(server.origin);
        assert.notEqual(reset.generation, input.generation);
        assert.equal(reset.serverSeq, 0);
        const human = new Doc("human", DEMO_SCHEMA);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "new generation"}]).ops};
        const result = await json(await post(server.origin, docName, "changes", change, {"x-doc-sync-epoch": reset.epoch, "x-doc-sync-schema": reset.schemaVersion}));
        assert.equal(result.serverSeq, 1);
        await server.stop("SIGKILL"); server = await start(data);
        const restarted = await state(server.origin);
        assert.equal(restarted.generation, reset.generation);
        assert.equal(restarted.serverSeq, 1);
        assert.match(JSON.stringify(restarted.model), /new generation/);
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", {generation: input.generation, base: input.base, change: input.change})), {status: "unknown"});
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("a pending file sync hides its change and serializes the same document while other documents progress", {timeout: 60_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-fsync-gate-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    const controller = new AbortController();
    let pump: Promise<void> | undefined;
    try {
        server = await start(data, false, true);
        const before = await state(server.origin);
        const warm = await state(server.origin, "warm");
        const events: Array<{type?: string; envelope?: {change?: {actor?: string}}}> = [];
        const stream = await fetch(`${url(server.origin, docName, "stream")}?protocol=${PROTOCOL_VERSION}&since=0`, {signal: controller.signal});
        assert.equal(stream.status, 200); assert.ok(stream.body);
        const reader = stream.body.getReader(), decoder = new TextDecoder();
        pump = (async () => {
            let buffer = "";
            for (;;) {
                const part = await reader.read();
                if (part.done) break;
                buffer += decoder.decode(part.value, {stream: true});
                let separator: number;
                while ((separator = buffer.indexOf("\n\n")) >= 0) {
                    const record = buffer.slice(0, separator); buffer = buffer.slice(separator + 2);
                    for (const line of record.split("\n")) if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
                }
            }
        })().catch(() => undefined);
        await waitUntil(() => events.some(event => event.type === "hello"), "initial stream hello");

        const first = new Doc("first", DEMO_SCHEMA), second = new Doc("second", DEMO_SCHEMA);
        const change = {actor: "first", seq: 1, ops: first.edit([{op: "insert", at: [0, 0], content: "A"}]).ops};
        const rival = {actor: "second", seq: 1, ops: second.edit([{op: "insert", at: [0, 0], content: "B"}]).ops};
        const base = {epoch: before.epoch, serverSeq: before.serverSeq, schemaVersion: before.schemaVersion};
        let firstDone = false, rivalDone = false, readDone = false, receiptDone = false;
        const firstRequest = post(server.origin, docName, "conditional", {base, change}).then(result => { firstDone = true; return result; });
        await waitForFsync(server.origin);
        const rivalRequest = post(server.origin, docName, "conditional", {base, change: rival}).then(result => { rivalDone = true; return result; });
        const readRequest = fetch(url(server.origin, docName, "state")).then(result => { readDone = true; return result; });
        const receiptRequest = post(server.origin, docName, "receipt", {generation: before.generation, base, change}).then(result => { receiptDone = true; return result; });
        await waitForFsync(server.origin, 4);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(firstDone, false, "write must not be acknowledged before fsync");
        assert.equal(rivalDone, false, "same-document competing write must wait");
        assert.equal(readDone, false, "same-document read must not expose staged state");
        assert.equal(receiptDone, false, "a receipt must not confirm an unflushed change");
        assert.equal(events.filter(event => event.type === "change").length, 0, "SSE must not publish staged changes");

        const other = new Doc("other", DEMO_SCHEMA);
        const otherChange = {actor: "other", seq: 1, ops: other.edit([{op: "insert", at: [0, 0], content: "warm edit"}]).ops};
        const otherReply = await json(await post(server.origin, "warm", "conditional", {base: {epoch: warm.epoch, serverSeq: warm.serverSeq, schemaVersion: warm.schemaVersion}, change: otherChange}));
        assert.equal(otherReply.status, "accepted", "a different document must progress while fsync is paused");

        assert.equal((await post(server.origin, docName, "fsync-test-release", {})).status, 200);
        assert.equal((await json(await firstRequest)).status, "accepted");
        assert.equal((await rivalRequest).status, 409, "the rival's old base must be rejected after the first write commits");
        assert.match(JSON.stringify(await json(await readRequest)), /A/);
        assert.deepEqual(await json(await receiptRequest), {status: "accepted", generation: before.generation, serverSeq: 1});
        await waitUntil(() => events.some(event => event.type === "change" && event.envelope?.change?.actor === "first"), "durable change stream event");
        assert.equal(events.filter(event => event.type === "change" && event.envelope?.change?.actor === "first").length, 1);
        controller.abort(); await pump;
        await server.stop("SIGKILL"); server = await start(data);
        const restarted = await state(server.origin);
        assert.equal(restarted.serverSeq, 1);
        assert.match(JSON.stringify(restarted.model), /A/);
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", {generation: before.generation, base, change})),
            {status: "accepted", generation: before.generation, serverSeq: 1});
        assert.match(JSON.stringify((await state(server.origin, "warm")).model), /warm edit/);
    } finally {
        controller.abort(); await pump; await server?.stop(); await rm(data, {recursive: true, force: true});
    }
});

for (const mode of ["truncate", "replace-inode"] as const) {
    test(`live log ${mode} before append cannot produce a false accepted change`, {timeout: 60_000}, async () => {
        const data = await mkdtemp(join(tmpdir(), `doc-sync-live-${mode}-`));
        let server: Awaited<ReturnType<typeof start>> | undefined;
        try {
            server = await start(data);
            const initial = await state(server.origin);
            const priorDoc = new Doc("prior", DEMO_SCHEMA);
            const prior = {actor: "prior", seq: 1, ops: priorDoc.edit([{op: "insert", at: [0, 0], content: "preserved"}]).ops};
            assert.equal((await json(await post(server.origin, docName, "conditional", {base: {epoch: initial.epoch, serverSeq: 0, schemaVersion: initial.schemaVersion}, change: prior}))).status, "accepted");
            const latest = await state(server.origin), path = join(data, `${docName}.jsonl`);
            const original = await readFile(path, "utf8");
            const modified = mode === "truncate" ? original.slice(0, -3) : original;
            if (mode === "truncate") await writeFile(path, modified);
            else {
                const replacement = join(data, "replacement.tmp");
                await writeFile(replacement, modified, {mode: 0o600});
                await rename(replacement, path);
            }
            const human = new Doc("human", DEMO_SCHEMA);
            const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "must not be accepted"}]).ops};
            const response = await post(server.origin, docName, "conditional", {base: {epoch: latest.epoch, serverSeq: latest.serverSeq, schemaVersion: latest.schemaVersion}, change});
            assert.ok(response.status >= 500, `a changed live file must not accept a new change: ${response.status}`);
            assert.equal(await readFile(path, "utf8"), modified, "the mismatching file must not be appended to or replaced");
            if (mode === "truncate") assert.ok((await fetch(url(server.origin, docName, "state"))).status >= 500, "truncated source must not be served by a stale hub");
        } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
    });
}

for (const mode of ["truncate", "delete", "replace-inode"] as const) {
    test(`idempotent conditional retry fails closed after live log ${mode}`, {timeout: 60_000}, async () => {
        const data = await mkdtemp(join(tmpdir(), `doc-sync-retry-${mode}-`));
        let server: Awaited<ReturnType<typeof start>> | undefined;
        try {
            server = await start(data);
            const initial = await state(server.origin), path = join(data, `${docName}.jsonl`);
            const doc = new Doc("agent", DEMO_SCHEMA);
            const change = {actor: "agent", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "accepted"}]).ops};
            const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
            assert.equal((await json(await post(server.origin, docName, "conditional", {base, change}))).status, "accepted");
            const original = await readFile(path, "utf8"), truncated = original.slice(0, -4);
            if (mode === "truncate") await writeFile(path, truncated);
            else if (mode === "delete") await unlink(path);
            else { const replacement = join(data, "replacement.tmp"); await writeFile(replacement, original, {mode: 0o600}); await rename(replacement, path); }
            const retry = await post(server.origin, docName, "conditional", {base, change});
            assert.ok(retry.status >= 500, `idempotent retry must not confirm a missing or truncated log: ${retry.status}`);
            if (mode === "truncate") assert.equal(await readFile(path, "utf8"), truncated);
            else if (mode === "delete") await assert.rejects(readFile(path), {code: "ENOENT"});
            else assert.equal(await readFile(path, "utf8"), original);
        } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
    });
}

test("a protected reservation released during compaction is not reported as still protected", {timeout: 60_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-compaction-released-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        server = await start(data, false, false, "before-sync", false, true);
        const initial = await state(server.origin);
        const doc = new Doc("owner", DEMO_SCHEMA);
        const first = {actor: "owner", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
        assert.equal((await json(await post(server.origin, docName, "conditional", {base: {epoch: initial.epoch, serverSeq: 0, schemaVersion: initial.schemaVersion}, change: first}))).status, "accepted");
        const keeper = {generation: initial.generation, actor: "keeper", reservationId: `r0~${crypto.randomUUID()}`, pin: null};
        assert.equal((await json(await post(server.origin, docName, "recovery-lease", keeper))).status, "protected");
        const updated = await state(server.origin);
        const deletion = {actor: "owner", seq: 2, ops: doc.edit([{op: "delete", at: [0, 0], count: 1}]).ops};
        assert.equal((await json(await post(server.origin, docName, "conditional", {base: {epoch: updated.epoch, serverSeq: updated.serverSeq, schemaVersion: updated.schemaVersion}, change: deletion}))).status, "accepted");
        const candidate = {generation: initial.generation, actor: "candidate", reservationId: `r0~${crypto.randomUUID()}`, pin: null};
        const reserve = post(server.origin, docName, "recovery-lease", candidate);
        await waitForCompaction(server.origin);
        const release = post(server.origin, docName, "recovery-lease", {...candidate, action: "release"});
        const path = join(data, `${docName}.jsonl`), deadline = Date.now() + 10_000;
        for (;;) {
            const log = await readFile(path, "utf8");
            if (log.includes(JSON.stringify({recoveryPin: {actor: candidate.actor, reservationId: candidate.reservationId, pin: null}}))) break;
            if (Date.now() >= deadline) throw new Error("The competing release did not become durable during compaction");
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal((await post(server.origin, docName, "compaction-test-release", {})).status, 200);
        const oldReply = await reserve;
        assert.notEqual(oldReply.status, 200, "a released reservation must not be reported protected");
        assert.equal((await json(await release)).status, "released");
        assert.equal((await json(await post(server.origin, docName, "recovery-lease", {...keeper, requireExisting: true}))).status, "protected");
        assert.equal((await json(await post(server.origin, docName, "gc", {}))).gc, null, "the other actor's pin must remain effective");
        await server.stop("SIGKILL"); server = await start(data);
        assert.equal((await json(await post(server.origin, docName, "recovery-lease", {...keeper, requireExisting: true}))).status, "protected");
        assert.equal((await json(await post(server.origin, docName, "gc", {}))).gc, null);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("cold receipt and reset never return old acceptance after reset commits", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-cold-reset-receipt-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = fixture(), path = join(data, `${docName}.jsonl`);
        await writeFile(path, input.bytes, {mode: 0o600});
        server = await start(data, true, false, "before-sync", true);
        const reset = post(server.origin, docName, "reset", {});
        await waitForCold(server.origin);
        const query = {generation: input.generation, base: input.base, change: input.change};
        let firstDone = false;
        const firstReceipt = post(server.origin, docName, "receipt", query).then(response => { firstDone = true; return response; });
        await waitForCold(server.origin, 2);
        await releaseCold(server.origin);
        await waitForReset(server.origin);
        const completedBeforeResetPause = firstDone;
        let secondDone = false;
        const secondReceipt = post(server.origin, docName, "receipt", query).then(response => { secondDone = true; return response; });
        await waitForReset(server.origin, 2);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(secondDone, false, "receipt must wait for reset's durable commit");
        if (!completedBeforeResetPause) assert.equal(firstDone, false, "the shared cold receipt must not read a stale in-flight reset state");
        assert.equal((await post(server.origin, docName, "reset-test-release", {})).status, 200);
        assert.equal((await reset).status, 200);
        assert.deepEqual(await json(await secondReceipt), {status: "unknown"});
        const firstResponse = await firstReceipt;
        // A racing verification may conservatively exhaust its stable-revision
        // retries. It must not claim old acceptance after reset has committed.
        if (firstResponse.status === 200) {
            const first = await json(firstResponse);
            if (!completedBeforeResetPause) assert.deepEqual(first, {status: "unknown"});
            else assert.ok(first.status === "accepted" || first.status === "unknown");
        } else assert.equal(firstResponse.status, 503);
        const current = await state(server.origin);
        assert.notEqual(current.generation, input.generation);
        assert.equal(current.serverSeq, 0);
        await server.stop("SIGKILL"); server = await start(data);
        const restarted = await state(server.origin);
        assert.equal(restarted.generation, current.generation);
        assert.equal(restarted.serverSeq, 0);
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", query)), {status: "unknown"});
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("a change fsynced before in-memory commit is recovered exactly once after SIGKILL", {timeout: 60_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-after-fsync-kill-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        server = await start(data, false, true, "after-sync");
        const before = await state(server.origin);
        const doc = new Doc("agent", DEMO_SCHEMA);
        const change = {actor: "agent", seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: "durable"}]).ops};
        const base = {epoch: before.epoch, serverSeq: before.serverSeq, schemaVersion: before.schemaVersion};
        let answered = false;
        const pending = post(server.origin, docName, "conditional", {base, change}).then(() => { answered = true; }).catch(() => undefined);
        await waitForFsync(server.origin);
        assert.equal(answered, false, "the change must not be acknowledged before in-memory installation");
        await server.stop("SIGKILL"); await pending;
        server = await start(data);
        const after = await state(server.origin);
        assert.equal(after.generation, before.generation);
        assert.equal(after.serverSeq, 1);
        assert.match(JSON.stringify(after.model), /durable/);
        assert.deepEqual(await json(await post(server.origin, docName, "receipt", {generation: before.generation, base, change})),
            {status: "accepted", generation: before.generation, serverSeq: 1});
        const duplicate = await json(await post(server.origin, docName, "changes", change, {"x-doc-sync-epoch": after.epoch, "x-doc-sync-schema": after.schemaVersion}));
        assert.equal(duplicate.serverSeq, null, "exact replay must not append the same change again");
        assert.equal((await state(server.origin)).serverSeq, 1);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});
