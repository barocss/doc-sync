import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {DocHub} from "@barocss/doc-sync/server";
import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const serverFile = fileURLToPath(new URL("../server.ts", import.meta.url));
const docName = "large-log";
const recordCount = 20_000;
type State = {epoch: string; generation: string; serverSeq: number; schemaVersion: string; model: unknown; lastGc: number};

async function start(data: string, gate = false, receiptGate = false) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data, RECOVERY_COMPACT_THRESHOLD: "3", ...(gate ? {DOC_SYNC_TEST_COMPACTION_GATE: "1"} : {}), ...(receiptGate ? {DOC_SYNC_TEST_RECEIPT_GATE: "1"} : {})};
    delete env.NO_SCHEMA; delete env.DOC_PROFILE;
    if (!gate) delete env.DOC_SYNC_TEST_COMPACTION_GATE;
    if (!receiptGate) delete env.DOC_SYNC_TEST_RECEIPT_GATE;
    const child = spawn(process.execPath, [serverFile], {cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"]});
    let errors = "";
    child.stderr.on("data", chunk => { errors += String(chunk); });
    const origin = await new Promise<string>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error(`server startup timed out: ${errors}`)); }, 15_000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${errors}`)); });
        child.stdout.on("data", chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/localhost:(\d+)/);
            if (match) { clearTimeout(timer); resolve(match[0]); }
        });
    });
    return {origin, async stop(signal: NodeJS.Signals = "SIGTERM") {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, "exit"); child.kill(signal); await exited;
        }
    }};
}

const url = (origin: string, action: string) => `${origin}/api/docs/${docName}/${action}`;
async function state(origin: string): Promise<State> {
    const response = await fetch(url(origin, "state"));
    assert.equal(response.status, 200);
    return response.json() as Promise<State>;
}
function post(origin: string, action: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(url(origin, action), {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), ...headers}, body: JSON.stringify(body)});
}
async function reply(response: Response) {
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<Record<string, unknown>>;
}
async function waitForCompaction(origin: string, phase: "paused" | "idle", timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const response = await fetch(url(origin, "compaction-state"));
        assert.equal(response.status, 200, await response.clone().text());
        const value = await response.json() as {phase?: string};
        if (value.phase === phase) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Compaction did not reach ${phase}`);
}
async function releaseCompaction(origin: string) {
    assert.equal((await post(origin, "compaction-test-release", {})).status, 200);
}
async function waitForReceiptPause(origin: string, minimumWaiters = 1) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        const response = await fetch(url(origin, "receipt-state"));
        assert.equal(response.status, 200, await response.clone().text());
        const value = await response.json() as {phase?: string; waiters?: number};
        if (value.phase === "paused" && (value.waiters ?? 0) >= minimumWaiters) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Receipt worker did not pause");
}
async function releaseReceipt(origin: string) {
    assert.equal((await post(origin, "receipt-test-release", {})).status, 200);
}
async function waitForLogText(path: string, text: string) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        if ((await readFile(path, "utf8")).includes(text)) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("The concurrent reservation was not durably appended while compaction was paused");
}

/** Produce a realistic large history: one insertion followed by 20,000 real formatting edits. */
async function fixture(data: string) {
    const generation = crypto.randomUUID(), version = schemaVersion(DEMO_SCHEMA), epoch = "fixture-epoch";
    const local = new Doc("fixture", DEMO_SCHEMA), hub = new DocHub({schema: DEMO_SCHEMA, generation});
    const header = {format: "doc-sync-log-v1", generation, initialSchemaVersion: version};
    const base = {epoch, serverSeq: 0, schemaVersion: version};
    const insert = {actor: "fixture", seq: 1, ops: local.edit([{op: "insert", at: [0, 0], content: "abc"}]).ops};
    assert.ok(hub.submit(insert, base));
    const records: string[] = [JSON.stringify(header), JSON.stringify({change: insert, conditionalBase: base})];
    for (let i = 0; i < recordCount; i++) {
        const ops = local.edit([{op: "update", at: [0, 0], length: 1, attrs: {bold: i % 2 === 0}}]).ops;
        assert.ok(ops.length, `formatting edit ${i} must produce a real operation`);
        const change = {actor: "fixture", seq: i + 2, ops};
        assert.ok(hub.submit(change), `fixture change ${i} must be accepted by DocHub`);
        records.push(JSON.stringify({change}));
    }
    const pinId = `r0~${crypto.randomUUID()}`, pin = {actor: "fixture", reservationId: pinId, pin: hub.serverSeq + 1};
    hub.onRecoveryPin = () => undefined;
    assert.deepEqual(hub.reserveRecovery(generation, pin.actor, pin.reservationId, null),
        {status: "protected", generation, pin: pin.pin, lastGc: 0, existing: false});
    records.push(JSON.stringify({recoveryPin: pin}));
    const deletion = {actor: "fixture", seq: recordCount + 2, ops: local.edit([{op: "delete", at: [0, 1], count: 1}]).ops};
    assert.ok(hub.submit(deletion));
    records.push(JSON.stringify({change: deletion}));
    const path = join(data, `${docName}.jsonl`);
    await writeFile(path, `${records.join("\n")}\n`, {mode: 0o600});
    assert.ok((await stat(path)).size > 3_000_000, "fixture must have a multi-megabyte durable log");
    return {generation, base, insert, pinId, pin: pin.pin, path};
}

test("large log compaction preserves exact receipts, concurrent edits and GC pins across server restart", {timeout: 120_000}, async t => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-large-log-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = await fixture(data);
        const beforeBytes = (await stat(input.path)).size;
        server = await start(data, true);
        const before = await state(server.origin);
        assert.equal(before.generation, input.generation);
        assert.equal(before.serverSeq, recordCount + 2);
        const held = {generation: input.generation, actor: "fixture", reservationId: input.pinId, pin: null, requireExisting: true};
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "protected");
        const releasedId = `r0~${crypto.randomUUID()}`;
        const temporary = {generation: input.generation, actor: "temporary", reservationId: releasedId, pin: null};
        // The third reservation event starts the compaction worker. Keep the
        // original request outstanding while a test gate holds that worker.
        const compactionTrigger = post(server.origin, "recovery-lease", temporary);
        await waitForCompaction(server.origin, "paused");
        const human = new Doc("human", DEMO_SCHEMA);
        const humanChange = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "Human"}]).ops};
        const concurrentId = `r0~${crypto.randomUUID()}`;
        const concurrent = {generation: input.generation, actor: "other", reservationId: concurrentId, pin: null};
        const concurrentReservation = post(server.origin, "recovery-lease", concurrent);
        const writes = await Promise.all([
            post(server.origin, "changes", humanChange, {"x-doc-sync-epoch": before.epoch, "x-doc-sync-schema": before.schemaVersion}),
            post(server.origin, "gc", {}),
        ]);
        const [changed, gc] = await Promise.all(writes.map(reply));
        assert.equal(changed.serverSeq, before.serverSeq + 1);
        assert.equal(gc.gc, null, "the active reservation must protect the deletion");
        await waitForLogText(input.path, concurrentId);
        await releaseCompaction(server.origin);
        assert.equal((await reply(await compactionTrigger)).status, "protected");
        assert.equal((await reply(await concurrentReservation)).status, "protected");
        await waitForCompaction(server.origin, "idle");
        assert.equal((await reply(await post(server.origin, "recovery-lease", {...temporary, action: "release"}))).status, "released");
        const receipt = {generation: input.generation, base: input.base, change: input.insert};
        assert.deepEqual(await reply(await post(server.origin, "receipt", receipt)), {status: "accepted", generation: input.generation, serverSeq: 1});
        assert.match(JSON.stringify((await state(server.origin)).model), /Human/);
        await server.stop("SIGKILL"); server = await start(data);
        const restarted = await state(server.origin);
        assert.equal(restarted.generation, input.generation);
        assert.match(JSON.stringify(restarted.model), /Human/);
        assert.deepEqual(await reply(await post(server.origin, "receipt", receipt)), {status: "accepted", generation: input.generation, serverSeq: 1});
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "protected");
        assert.equal((await reply(await post(server.origin, "recovery-lease", {...concurrent, requireExisting: true}))).status, "protected");
        assert.equal((await reply(await post(server.origin, "gc", {}))).gc, null);
        assert.equal((await reply(await post(server.origin, "recovery-lease", temporary))).status, "unsafe");
        t.diagnostic(`Fixture: ${recordCount} formatting edits, ${beforeBytes} initial JSONL bytes. A worker pause established that edit, GC and another reservation overlapped compaction.`);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("server reset while compaction is paused cannot restore the old generation", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-large-reset-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = await fixture(data);
        server = await start(data, true);
        const before = await state(server.origin);
        const held = {generation: input.generation, actor: "fixture", reservationId: input.pinId, pin: null, requireExisting: true};
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "protected");
        const temporary = {generation: input.generation, actor: "temporary", reservationId: `r0~${crypto.randomUUID()}`, pin: null};
        const trigger = post(server.origin, "recovery-lease", temporary);
        await waitForCompaction(server.origin, "paused");
        assert.equal((await post(server.origin, "reset", {})).status, 200);
        const reset = await state(server.origin);
        assert.notEqual(reset.generation, input.generation);
        assert.equal(reset.serverSeq, 0);
        const human = new Doc("human", DEMO_SCHEMA);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "new generation"}]).ops};
        assert.equal((await reply(await post(server.origin, "changes", change, {"x-doc-sync-epoch": reset.epoch, "x-doc-sync-schema": reset.schemaVersion}))).serverSeq, 1);
        await releaseCompaction(server.origin);
        assert.equal((await trigger).status, 503, "the old reservation must not be reported protected after reset");
        await waitForCompaction(server.origin, "idle");
        let current = await state(server.origin);
        assert.equal(current.generation, reset.generation);
        assert.match(JSON.stringify(current.model), /new generation/);
        await server.stop("SIGKILL"); server = await start(data);
        current = await state(server.origin);
        assert.equal(current.generation, reset.generation);
        assert.equal(current.serverSeq, 1);
        assert.match(JSON.stringify(current.model), /new generation/);
        assert.deepEqual(await reply(await post(server.origin, "receipt", {generation: input.generation, base: input.base, change: input.insert})), {status: "unknown"});
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "unsafe");
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("same-length receipt tampering during paused compaction fails closed without replacing the log", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-large-tamper-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = await fixture(data);
        server = await start(data, true);
        const before = await state(server.origin);
        const held = {generation: input.generation, actor: "fixture", reservationId: input.pinId, pin: null, requireExisting: true};
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "protected");
        const temporary = {generation: input.generation, actor: "temporary", reservationId: `r0~${crypto.randomUUID()}`, pin: null};
        const trigger = post(server.origin, "recovery-lease", temporary);
        await waitForCompaction(server.origin, "paused");
        const human = new Doc("human", DEMO_SCHEMA);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "confirmed during failure"}]).ops};
        assert.equal((await reply(await post(server.origin, "changes", change, {"x-doc-sync-epoch": before.epoch, "x-doc-sync-schema": before.schemaVersion}))).serverSeq, before.serverSeq + 1);
        const original = await readFile(input.path, "utf8");
        assert.ok(original.includes('"actor":"human"'), "the already accepted human change is present before tampering");
        const tampered = original.replace('"epoch":"fixture-epoch"', '"epoch":"fixture-epoCh"');
        assert.notEqual(tampered, original);
        assert.equal(Buffer.byteLength(tampered), Buffer.byteLength(original));
        await writeFile(input.path, tampered);
        await releaseCompaction(server.origin);
        assert.equal((await trigger).status, 503, "the reservation outcome must not be reported confirmed after invalidation");
        assert.equal(await readFile(input.path, "utf8"), tampered, "compaction must not replace the inconsistent source");
        assert.ok((await readFile(input.path, "utf8")).includes('"actor":"human"'), "the confirmed human change must remain in the source");
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("SIGKILL while compaction is paused retains accepted edits and pins on restart", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-large-kill-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = await fixture(data);
        server = await start(data, true);
        const before = await state(server.origin);
        const held = {generation: input.generation, actor: "fixture", reservationId: input.pinId, pin: null, requireExisting: true};
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "protected");
        const temporary = {generation: input.generation, actor: "temporary", reservationId: `r0~${crypto.randomUUID()}`, pin: null};
        const trigger = post(server.origin, "recovery-lease", temporary).catch(() => undefined);
        await waitForCompaction(server.origin, "paused");
        const human = new Doc("human", DEMO_SCHEMA);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "survives kill"}]).ops};
        assert.equal((await reply(await post(server.origin, "changes", change, {"x-doc-sync-epoch": before.epoch, "x-doc-sync-schema": before.schemaVersion}))).serverSeq, before.serverSeq + 1);
        await server.stop("SIGKILL");
        await trigger;
        server = await start(data);
        const restarted = await state(server.origin);
        assert.equal(restarted.generation, input.generation);
        assert.match(JSON.stringify(restarted.model), /survives kill/);
        assert.deepEqual(await reply(await post(server.origin, "receipt", {generation: input.generation, base: input.base, change: input.insert})), {status: "accepted", generation: input.generation, serverSeq: 1});
        assert.equal((await reply(await post(server.origin, "recovery-lease", held))).status, "protected");
        assert.equal((await reply(await post(server.origin, "recovery-lease", {...temporary, requireExisting: true}))).status, "protected");
        assert.equal((await reply(await post(server.origin, "gc", {}))).gc, null);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("receipt verification retries an actual concurrent edit and preserves the exact receipt after restart", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-large-receipt-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = await fixture(data);
        server = await start(data, false, true);
        const before = await state(server.origin);
        const query = {generation: input.generation, base: input.base, change: input.insert};
        const pending = post(server.origin, "receipt", query);
        await waitForReceiptPause(server.origin);
        const pendingChangeReceipt = post(server.origin, "change-receipt", {generation: input.generation, change: input.insert});
        await waitForReceiptPause(server.origin, 2);
        const human = new Doc("human", DEMO_SCHEMA);
        const change = {actor: "human", seq: 1, ops: human.edit([{op: "insert", at: [0, 0], content: "concurrent receipt"}]).ops};
        const accepted = await reply(await post(server.origin, "changes", change, {"x-doc-sync-epoch": before.epoch, "x-doc-sync-schema": before.schemaVersion}));
        assert.equal(accepted.serverSeq, before.serverSeq + 1);
        await releaseReceipt(server.origin);
        assert.deepEqual(await reply(await pending), {status: "accepted", generation: input.generation, serverSeq: 1});
        assert.deepEqual(await reply(await pendingChangeReceipt), {status: "accepted", generation: input.generation, serverSeq: 1});
        const wrong = {...query, base: {...query.base, epoch: "wrong"}};
        assert.deepEqual(await reply(await post(server.origin, "receipt", wrong)), {status: "unknown"});
        assert.match(JSON.stringify((await state(server.origin)).model), /concurrent receipt/);
        await server.stop("SIGKILL"); server = await start(data);
        assert.deepEqual(await reply(await post(server.origin, "receipt", query)), {status: "accepted", generation: input.generation, serverSeq: 1});
        assert.match(JSON.stringify((await state(server.origin)).model), /concurrent receipt/);
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("receipt verification detects same-length receipt tampering without replacing source", {timeout: 120_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-large-receipt-tamper-"));
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
        const input = await fixture(data);
        server = await start(data, false, true);
        await state(server.origin);
        const pending = post(server.origin, "receipt", {generation: input.generation, base: input.base, change: input.insert});
        await waitForReceiptPause(server.origin);
        const original = await readFile(input.path, "utf8");
        const tampered = original.replace('"epoch":"fixture-epoch"', '"epoch":"fixture-epoCh"');
        assert.notEqual(tampered, original);
        assert.equal(Buffer.byteLength(tampered), Buffer.byteLength(original));
        await writeFile(input.path, tampered);
        await releaseReceipt(server.origin);
        assert.equal((await pending).status, 500, "receipt verification cannot assert acceptance against an inconsistent source");
        assert.equal(await readFile(input.path, "utf8"), tampered, "verification must not replace the inconsistent source");
    } finally { await server?.stop(); await rm(data, {recursive: true, force: true}); }
});

test("receipt lookup for a missing document does not create a file", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-missing-async-receipt-"));
    const server = await start(data, false, true);
    try {
        const before = await readdir(data);
        const change = {actor: "human", seq: 1, ops: new Doc("human", DEMO_SCHEMA).edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
        const result = await reply(await post(server.origin, "receipt", {generation: crypto.randomUUID(), base: {epoch: "missing", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)}, change}));
        assert.deepEqual(result, {status: "unknown"});
        assert.deepEqual(await readdir(data), before);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("compaction and receipt gate controls are unavailable without test settings", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-disabled-gates-"));
    const server = await start(data);
    try {
        const before = await readdir(data);
        assert.equal((await fetch(url(server.origin, "compaction-state"))).status, 404);
        assert.equal((await post(server.origin, "compaction-test-release", {})).status, 404);
        assert.equal((await fetch(url(server.origin, "receipt-state"))).status, 404);
        assert.equal((await post(server.origin, "receipt-test-release", {})).status, 404);
        assert.deepEqual(await readdir(data), before);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});
