import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chmod, mkdtemp, readFile, readdir, rm, unlink, writeFile} from "node:fs/promises";
import {request} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {HttpTransport,PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const serverFile = fileURLToPath(new URL("../server.ts", import.meta.url));
async function start(data: string, extra: NodeJS.ProcessEnv = {}) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data, ...extra};
    delete env.NO_SCHEMA; delete env.DOC_PROFILE;
    const child = spawn(process.execPath, [serverFile], {cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"]});
    let error = "";
    child.stderr.on("data", chunk => { error += String(chunk); });
    const origin = await new Promise<string>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error(`server timeout: ${error}`)); }, 10_000);
        child.once("error", failure => { clearTimeout(timer); reject(failure); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${error}`)); });
        child.stdout.on("data", chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);
            if (match) { clearTimeout(timer); resolve(match[0]); }
        });
    });
    return {origin, async stop(signal: NodeJS.Signals = "SIGTERM") { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(signal); await exited; } }};
}

type State = {epoch: string; generation: string | null; serverSeq: number; schemaVersion: string; model: unknown};
const url = (origin: string, doc: string, action: string) => `${origin}/api/docs/${doc}/${action}`;
const state = async (origin: string, doc: string): Promise<State> => (await fetch(url(origin, doc, "state"))).json() as Promise<State>;
const post = (origin: string, doc: string, action: string, body: unknown) => fetch(url(origin, doc, action), {
    method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)}, body: JSON.stringify(body),
});
const makeChange = (actor: string, text: string) => {
    const doc = new Doc(actor, DEMO_SCHEMA);
    return {actor, seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: text}]).ops};
};

test("recovery metadata compacts across server restart without losing receipts, active pins or concurrent edits", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-recovery-compact-"));
    const options = {RECOVERY_COMPACT_THRESHOLD: "3"};
    let server = await start(data, options);
    const doc = "compact", local = new Doc("a", DEMO_SCHEMA), remote = new Doc("b", DEMO_SCHEMA);
    try {
        const initial = await state(server.origin, doc);
        const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
        const change = {actor: "a", seq: 1, ops: local.edit([{op: "insert", at: [0, 0], content: "x"}]).ops};
        assert.equal((await post(server.origin, doc, "conditional", {base, change})).status, 200);
        const keepId = `r0~${crypto.randomUUID()}`, oldId = `r0~${crypto.randomUUID()}`;
        const keep = {generation: initial.generation, actor: "a", reservationId: keepId, pin: null};
        const old = {...keep, reservationId: oldId};
        assert.equal((await (await post(server.origin, doc, "recovery-lease", keep)).json() as {status: string}).status, "protected");
        const next = await state(server.origin, doc);
        const deletion = {actor: "a", seq: 2, ops: local.edit([{op: "delete", at: [0, 0], count: 1}]).ops};
        assert.equal((await post(server.origin, doc, "conditional", {base: {epoch: next.epoch, serverSeq: next.serverSeq, schemaVersion: next.schemaVersion}, change: deletion})).status, 200);
        const human = await state(server.origin, doc);
        assert.equal((await post(server.origin, doc, "conditional", {base: {epoch: human.epoch, serverSeq: human.serverSeq, schemaVersion: human.schemaVersion}, change: {actor: "b", seq: 1, ops: remote.edit([{op: "insert", at: [0, 0], content: "human"}]).ops}})).status, 200);
        assert.equal((await (await post(server.origin, doc, "recovery-lease", old)).json() as {status: string}).status, "protected");
        const path = join(data, `${doc}.jsonl`);
        const retained = (await readFile(path, "utf8")).split("\n").filter(line => line && !Object.hasOwn(JSON.parse(line), "recoveryPin"));
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", {generation: initial.generation, actor: "a", reservationId: oldId, action: "release"})).json(), {status: "released"});
        const compacted = (await readFile(path, "utf8")).trimEnd().split("\n");
        assert.deepEqual(compacted.slice(0, -1), retained, "change and receipt records retain exact bytes and order");
        const metadata = JSON.parse(compacted.at(-1)!) as {recoveryState: {era: number; active: Array<{reservationId: string}>}};
        assert.equal(metadata.recoveryState.era, 1);
        assert.deepEqual(metadata.recoveryState.active.map(item => item.reservationId), [keepId]);
        assert.equal((await (await post(server.origin, doc, "recovery-lease", old)).json() as {status: string}).status, "unsafe");
        assert.equal((await (await post(server.origin, doc, "gc", {})).json() as {gc: number | null}).gc, null);
        assert.deepEqual(await (await post(server.origin, doc, "receipt", {generation: initial.generation, base, change})).json(), {status: "accepted", generation: initial.generation, serverSeq: 1});
        await server.stop("SIGKILL");
        server = await start(data, options);
        const restarted = await state(server.origin, doc);
        assert.equal(restarted.generation, initial.generation);
        assert.match(JSON.stringify(restarted.model), /human/);
        assert.deepEqual(await (await post(server.origin, doc, "receipt", {generation: initial.generation, base, change})).json(), {status: "accepted", generation: initial.generation, serverSeq: 1});
        assert.equal((await (await post(server.origin, doc, "recovery-lease", {...keep, requireExisting: true})).json() as {status: string}).status, "protected");
        assert.equal((await (await post(server.origin, doc, "gc", {})).json() as {gc: number | null}).gc, null);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("repeated release compaction bounds metadata and rejects old reservation IDs after restart", {timeout: 30_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-recovery-cycles-"));
    const options = {RECOVERY_COMPACT_THRESHOLD: "8"};
    let server = await start(data, options);
    const doc = "cycles";
    try {
        const initial = await state(server.origin, doc);
        const old: Array<{generation: string | null; actor: string; reservationId: string; pin: null}> = [];
        for (let i = 0; i < 50; i++) {
            const current = await (await fetch(url(server.origin, doc, "recovery-state"))).json() as {reservationEra: number};
            const reservation = {generation: initial.generation, actor: "a", reservationId: `r${current.reservationEra}~${crypto.randomUUID()}`, pin: null};
            old.push(reservation);
            assert.equal((await (await post(server.origin, doc, "recovery-lease", reservation)).json() as {status: string}).status, "protected");
            assert.equal((await (await post(server.origin, doc, "recovery-lease", {...reservation, action: "release"})).json() as {status: string}).status, "released");
        }
        const path = join(data, `${doc}.jsonl`);
        const content = await readFile(path, "utf8"), records = content.trimEnd().split("\n").map(line => JSON.parse(line) as {recoveryPin?: unknown; recoveryState?: {era: number}});
        assert.ok(Buffer.byteLength(content) < 2000, `unexpected recovery metadata growth: ${Buffer.byteLength(content)} bytes`);
        assert.equal(records.filter(entry => entry.recoveryState).length, 1);
        assert.ok(records.filter(entry => entry.recoveryPin).length < 8);
        assert.ok(records.find(entry => entry.recoveryState)!.recoveryState!.era > 1);
        await server.stop("SIGKILL");
        server = await start(data, options);
        for (const reservation of [old[0], old[15], old[31]]) {
            assert.equal((await (await post(server.origin, doc, "recovery-lease", reservation)).json() as {status: string}).status, "unsafe");
            assert.equal((await (await post(server.origin, doc, "recovery-lease", {...reservation, action: "release"})).json() as {status: string}).status, "released");
        }
        assert.equal(await readFile(path, "utf8"), content, "old retries must not recreate metadata");
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("compaction fails closed on a corrupt durable log and preserves the original bytes", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-compact-corrupt-"));
    const server = await start(data, {RECOVERY_COMPACT_THRESHOLD: "2"});
    const doc = "corrupt-compact";
    try {
        const initial = await state(server.origin, doc);
        const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
        const change = makeChange("a", "preserved");
        assert.equal((await post(server.origin, doc, "conditional", {base, change})).status, 200);
        const id = `r0~${crypto.randomUUID()}`;
        const reservation = {generation: initial.generation, actor: "a", reservationId: id, pin: null};
        assert.equal((await (await post(server.origin, doc, "recovery-lease", reservation)).json() as {status: string}).status, "protected");
        const path = join(data, `${doc}.jsonl`), original = await readFile(path, "utf8");
        const corrupt = `${original}{"broken":`;
        await writeFile(path, corrupt, "utf8");
        const release = {generation: initial.generation, actor: "a", reservationId: id, action: "release"};
        const result = await post(server.origin, doc, "recovery-lease", release);
        assert.equal(result.status, 503, "failed validation must not report a confirmed release");
        const expected = corrupt; // The async append checks the last verified file identity before writing.
        assert.equal(await readFile(path, "utf8"), expected, "compaction must not replace or silently repair the corrupted log");
        assert.equal((await fetch(url(server.origin, doc, "state"))).status, 500, "the stale in-memory hub must be invalidated");
        assert.equal((await post(server.origin, doc, "receipt", {generation: initial.generation, base, change})).status, 500, "a damaged log cannot prove a receipt");
        assert.equal(await readFile(path, "utf8"), expected);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("compaction refuses a modified conditional receipt even when the document is unchanged", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-compact-receipt-corrupt-"));
    const server = await start(data, {RECOVERY_COMPACT_THRESHOLD: "2"});
    const doc = "receipt-corruption";
    try {
        const initial = await state(server.origin, doc);
        const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
        const change = makeChange("a", "preserved");
        assert.equal((await post(server.origin, doc, "conditional", {base, change})).status, 200);
        const id = `r0~${crypto.randomUUID()}`;
        const reservation = {generation: initial.generation, actor: "a", reservationId: id, pin: null};
        assert.equal((await (await post(server.origin, doc, "recovery-lease", reservation)).json() as {status: string}).status, "protected");
        const path = join(data, `${doc}.jsonl`), original = await readFile(path, "utf8");
        const tampered = original.replace(JSON.stringify({conditionalBase: base}).slice(1, -1), JSON.stringify({conditionalBase: {...base, epoch: `${base.epoch}-altered`}}).slice(1, -1));
        assert.notEqual(tampered, original, "test must change only the stored receipt base");
        await writeFile(path, tampered, "utf8");
        const release = {generation: initial.generation, actor: "a", reservationId: id, action: "release"};
        assert.equal((await post(server.origin, doc, "recovery-lease", release)).status, 503);
        const expected = tampered; // Reject the changed file before appending the release.
        assert.equal(await readFile(path, "utf8"), expected, "the inconsistent log must not be replaced");
        assert.match(JSON.stringify((await state(server.origin, doc)).model), /preserved/, "altered base does not alter the document");
        assert.deepEqual(await (await post(server.origin, doc, "receipt", {generation: initial.generation, base, change})).json(), {status: "unknown"});
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("future-shaped legacy IDs defer compaction without breaking reservation operations", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-legacy-compact-"));
    const generation = crypto.randomUUID(), id = `r1~${crypto.randomUUID()}`, doc = "legacy-future";
    const path = join(data, `${doc}.jsonl`);
    const header = {format: "doc-sync-log-v1", generation, initialSchemaVersion: schemaVersion(DEMO_SCHEMA)};
    await writeFile(path, `${JSON.stringify(header)}\n${JSON.stringify({recoveryPin: {actor: "old", reservationId: id, pin: 1}})}\n`);
    let server = await start(data, {RECOVERY_COMPACT_THRESHOLD: "1"});
    try {
        await state(server.origin, doc);
        const old = {generation, actor: "old", reservationId: id, pin: null};
        const current = {generation, actor: "new", reservationId: `r0~${crypto.randomUUID()}`, pin: null};
        assert.equal((await (await post(server.origin, doc, "recovery-lease", {...old, requireExisting: true})).json() as {status: string}).status, "protected");
        assert.equal((await (await post(server.origin, doc, "recovery-lease", current)).json() as {status: string}).status, "protected");
        assert.equal((await (await post(server.origin, doc, "recovery-lease", {...old, action: "release"})).json() as {status: string}).status, "released");
        assert.equal((await (await post(server.origin, doc, "recovery-lease", old)).json() as {status: string}).status, "unsafe");
        const metadata = (await readFile(path, "utf8")).trimEnd().split("\n").map(line => JSON.parse(line) as {recoveryState?: unknown});
        assert.equal(metadata.some(entry => !!entry.recoveryState), false, "a future legacy tombstone must not be forgotten");
        await server.stop("SIGKILL"); server = await start(data, {RECOVERY_COMPACT_THRESHOLD: "1"});
        assert.equal((await (await post(server.origin, doc, "recovery-lease", old)).json() as {status: string}).status, "unsafe");
        assert.equal((await (await post(server.origin, doc, "recovery-lease", {...current, requireExisting: true})).json() as {status: string}).status, "protected");
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("recovery reservation survives server crash, concurrent edits, and blocks GC until release", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-pin-"));
    let server = await start(data);
    const doc = "reservation";
    try {
        const local = new Doc("a", DEMO_SCHEMA);
        const apply = async (actor: string, seq: number, ops: ReturnType<Doc["edit"]>["ops"]) => {
            const current = await state(server.origin, doc);
            const base = {epoch: current.epoch, serverSeq: current.serverSeq, schemaVersion: current.schemaVersion};
            const response = await post(server.origin, doc, "conditional", {base, change: {actor, seq, ops}});
            assert.equal(response.status, 200, await response.text());
        };
        await apply("a", 1, local.edit([{op: "insert", at: [0, 0], content: "x"}]).ops);
        const original = await state(server.origin, doc);
        const reservation = {generation: original.generation, actor: "a", reservationId: "one", pin: null};
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", reservation)).json(),
            {status: "protected", generation: original.generation, pin: 2, lastGc: 0, existing: false});
        await apply("a", 2, local.edit([{op: "delete", at: [0, 0], count: 1}]).ops);
        const remote = new Doc("b", DEMO_SCHEMA);
        await apply("b", 1, remote.edit([{op: "insert", at: [0, 0], content: "remote"}]).ops);
        await server.stop("SIGKILL");
        server = await start(data);
        const restarted = await state(server.origin, doc);
        assert.equal(restarted.generation, original.generation);
        assert.match(JSON.stringify(restarted.model), /remote/);
        const protectedGc = await (await post(server.origin, doc, "gc", {})).json() as {gc: number | null};
        assert.equal(protectedGc.gc, null);
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", reservation)).json(),
            {status: "protected", generation: original.generation, pin: 2, lastGc: 0, existing: true});
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", {generation: original.generation, actor: "a", reservationId: "one", action: "release"})).json(), {status: "released"});
        const collected = await (await post(server.origin, doc, "gc", {})).json() as {gc: number | null};
        assert.equal(collected.gc, 3);
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", {...reservation, pin: 2})).json(), {status: "unsafe"});
        await server.stop("SIGKILL");
        server = await start(data);
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", {...reservation, pin: 2})).json(), {status: "unsafe"});
        assert.match(JSON.stringify((await state(server.origin, doc)).model), /remote/);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("released reservation cannot be recreated after server crash or a delayed retry", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-release-restart-"));
    let server = await start(data);
    const doc = "released";
    try {
        const initial = await state(server.origin, doc);
        const first = {generation: initial.generation, actor: "a", reservationId: "one", pin: null};
        const second = {...first, reservationId: "two"};
        assert.equal((await (await post(server.origin, doc, "recovery-lease", first)).json() as {status: string}).status, "protected");
        assert.equal((await (await post(server.origin, doc, "recovery-lease", second)).json() as {status: string}).status, "protected");
        const local = new Doc("a", DEMO_SCHEMA);
        const remote = new Doc("b", DEMO_SCHEMA);
        const submit = async (actor: string, seq: number, ops: ReturnType<Doc["edit"]>["ops"]) => {
            const current = await state(server.origin, doc);
            const base = {epoch: current.epoch, serverSeq: current.serverSeq, schemaVersion: current.schemaVersion};
            const response = await post(server.origin, doc, "conditional", {base, change: {actor, seq, ops}});
            assert.equal(response.status, 200, await response.text());
        };
        await submit("a", 1, local.edit([{op: "insert", at: [0, 0], content: "x"}]).ops);
        await submit("a", 2, local.edit([{op: "delete", at: [0, 0], count: 1}]).ops);
        await submit("b", 1, remote.edit([{op: "insert", at: [0, 0], content: "remote"}]).ops);
        const release = {generation: initial.generation, actor: "a", reservationId: "one", action: "release"};
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", release)).json(), {status: "released"});
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", release)).json(), {status: "released"});
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", first)).json(), {status: "unsafe"});
        await server.stop("SIGKILL");
        server = await start(data);
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", release)).json(), {status: "released"});
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", first)).json(), {status: "unsafe"});
        assert.equal((await (await post(server.origin, doc, "recovery-lease", {...second, requireExisting: true})).json() as {status: string}).status, "protected");
        assert.equal((await (await post(server.origin, doc, "gc", {})).json() as {gc: number | null}).gc, null);
        assert.deepEqual(await (await post(server.origin, doc, "recovery-lease", {...release, reservationId: "two"})).json(), {status: "released"});
        assert.notEqual((await (await post(server.origin, doc, "gc", {})).json() as {gc: number | null}).gc, null);
        assert.match(JSON.stringify((await state(server.origin, doc)).model), /remote/);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("ordinary exact receipt survives server crash and rejects conflicting actor sequence", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-change-receipt-"));
    let server = await start(data);
    try {
        const initial = await state(server.origin, "ordinary");
        const change = makeChange("a", "saved");
        const submit = (value: unknown, epoch: string) => fetch(url(server.origin, "ordinary", "changes"), {
            method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION),
                "x-doc-sync-epoch": epoch, "x-doc-sync-schema": initial.schemaVersion}, body: JSON.stringify(value),
        });
        assert.equal((await submit(change, initial.epoch)).status, 200);
        await server.stop("SIGKILL");
        server = await start(data);
        const restarted = await state(server.origin, "ordinary");
        assert.deepEqual(await (await post(server.origin, "ordinary", "change-receipt", {generation: initial.generation, change})).json(),
            {status: "accepted", generation: initial.generation, serverSeq: 1});
        assert.deepEqual(await (await post(server.origin, "ordinary", "change-receipt", {generation: initial.generation, change: {...change, ops: []}})).json(), {status: "unknown"});
        assert.equal((await submit({...change, ops: []}, restarted.epoch)).status, 409);
        assert.equal((await submit(change, restarted.epoch)).status, 200);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("recovery submit survives a lost reply and never creates a missing reservation", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-recover-change-"));
    let server = await start(data);
    try {
        const initial = await state(server.origin, "replay");
        const reservation = {generation: initial.generation, actor: "a", reservationId: "one", pin: null};
        const body = {generation: initial.generation, reservationId: "one", schemaVersion: initial.schemaVersion, change: makeChange("a", "recovered")};
        assert.deepEqual(await (await post(server.origin, "replay", "recovery-lease", {...reservation, requireExisting: true})).json(), {status: "unsafe"});
        assert.deepEqual(await (await post(server.origin, "replay", "recover-change", body)).json(), {status: "unsafe"});
        await post(server.origin, "replay", "recovery-lease", reservation);
        const expected = {status: "accepted", generation: initial.generation, serverSeq: 1};
        assert.deepEqual(await (await post(server.origin, "replay", "recover-change", body)).json(), expected);
        await server.stop("SIGKILL");
        server = await start(data);
        assert.deepEqual(await (await post(server.origin, "replay", "recover-change", body)).json(), expected);
        assert.equal((await state(server.origin, "replay")).serverSeq, 1);
        assert.deepEqual(await (await post(server.origin, "replay", "recover-change", {...body, change: {...body.change, ops: []}})).json(), {status: "conflict"});
        assert.deepEqual(await (await post(server.origin, "replay", "recover-change", {...body, schemaVersion: "other"})).json(), {status: "unsafe"});
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("browser HTTP recovery primitives preserve exact changes and other users across restart", {timeout:20_000},async()=>{
    const data=await mkdtemp(join(tmpdir(),"doc-sync-browser-recovery-http-"));let server=await start(data);
    try {
        const initial=await state(server.origin,"browser-primitives");assert.ok(initial.generation);
        let browser=new HttpTransport("browser-primitives","browser",server.origin);
        const metadata=await browser.getRecoveryState();assert.equal(metadata.generation,initial.generation);
        const reservation=`r${metadata.reservationEra??0}~${crypto.randomUUID()}`;
        const local=makeChange("browser","local"),remote=makeChange("other","other");
        assert.equal((await browser.reserveRecovery(initial.generation,reservation,1)).status,"protected");
        assert.equal((await fetch(url(server.origin,"browser-primitives","changes"),{method:"POST",headers:{"content-type":"application/json","x-doc-sync-protocol":String(PROTOCOL_VERSION),"x-doc-sync-epoch":initial.epoch,"x-doc-sync-schema":initial.schemaVersion},body:JSON.stringify(remote)})).status,200);
        assert.deepEqual(await browser.getChangeReceipt(initial.generation,local),{status:"unknown"});
        await browser.recoverChange(initial.generation,reservation,initial.schemaVersion,local);
        await server.stop("SIGKILL");server=await start(data);browser=new HttpTransport("browser-primitives","browser",server.origin);
        assert.equal((await browser.reserveRecovery(initial.generation,reservation,1,true)).status,"protected");
        assert.equal((await browser.getChangeReceipt(initial.generation,local)).status,"accepted");
        await browser.recoverChange(initial.generation,reservation,initial.schemaVersion,local);
        const restored=await state(server.origin,"browser-primitives"),text=JSON.stringify(restored.model);
        assert.equal(restored.serverSeq,2);assert.equal((text.match(/local/g)??[]).length,1);assert.equal((text.match(/other/g)??[]).length,1);
        await assert.rejects(browser.recoverChange("wrong-generation",reservation,initial.schemaVersion,local));
        await browser.releaseRecovery(initial.generation,reservation);
    } finally {await server.stop();await rm(data,{recursive:true,force:true});}
});

test("durable generation and exact receipt survive process restart and reset changes the generation", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-receipt-"));
    let server = await start(data);
    try {
        const original = await state(server.origin, "recovery");
        assert.ok(original.generation);
        const base = {epoch: original.epoch, serverSeq: original.serverSeq, schemaVersion: original.schemaVersion};
        const change = makeChange("ai", "saved");
        const request = {generation: original.generation, base, change};
        const unknown = await post(server.origin, "recovery", "receipt", request);
        assert.deepEqual(await unknown.json(), {status: "unknown"});
        const accepted = await post(server.origin, "recovery", "conditional", {base, change});
        assert.equal(accepted.status, 200);
        assert.deepEqual(await accepted.json(), {status: "accepted", serverSeq: 1});
        const result = await post(server.origin, "recovery", "receipt", request);
        assert.deepEqual(await result.json(), {status: "accepted", generation: original.generation, serverSeq: 1});
        const acceptedState = await state(server.origin, "recovery");
        assert.deepEqual(await (await post(server.origin, "recovery", "receipt", {...request, change: {...change, ops: []}})).json(), {status: "unknown"});
        const log = await readFile(join(data, "recovery.jsonl"), "utf8");
        assert.equal(log.trim().split("\n").length, 2);
        await server.stop();
        server = await start(data);
        const restarted = await state(server.origin, "recovery");
        assert.equal(restarted.generation, original.generation);
        assert.notEqual(restarted.epoch, original.epoch);
        assert.equal(restarted.serverSeq, 1);
        assert.deepEqual(restarted.model, acceptedState.model);
        assert.deepEqual(await (await post(server.origin, "recovery", "receipt", request)).json(), {status: "accepted", generation: original.generation, serverSeq: 1});
        const replay = await post(server.origin, "recovery", "conditional", {base, change});
        assert.equal(replay.status, 409);
        assert.equal((await replay.json() as {code: string}).code, "epoch");
        assert.equal(await readFile(join(data, "recovery.jsonl"), "utf8"), log);
        assert.equal((await post(server.origin, "recovery", "reset", {})).status, 200);
        const reset = await state(server.origin, "recovery");
        assert.notEqual(reset.generation, original.generation);
        assert.equal(reset.serverSeq, 0);
        assert.deepEqual(await (await post(server.origin, "recovery", "receipt", request)).json(), {status: "unknown"});
        await server.stop();
        server = await start(data);
        const recoveredReset = await state(server.origin, "recovery");
        assert.equal(recoveredReset.generation, reset.generation);
        assert.equal(recoveredReset.serverSeq, 0);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("legacy logs and malformed or truncated logs never produce a false receipt", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-legacy-receipt-"));
    const change = makeChange("legacy", "old");
    const base = {epoch: "old-epoch", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)};
    await writeFile(join(data, "legacy.jsonl"), `${JSON.stringify({change, conditionalBase: base})}\n`);
    await writeFile(join(data, "truncated.jsonl"), '{"format":"doc-sync-log-v1"');
    await writeFile(join(data, "empty.jsonl"), "");
    const server = await start(data);
    try {
        const legacy = await state(server.origin, "legacy");
        assert.equal(legacy.generation, null);
        assert.equal(legacy.serverSeq, 1);
        assert.deepEqual(await (await post(server.origin, "legacy", "receipt", {generation: crypto.randomUUID(), base, change})).json(), {status: "unknown"});
        const corrupted = await fetch(url(server.origin, "truncated", "state"));
        assert.equal(corrupted.status, 500);
        assert.equal(await readFile(join(data, "truncated.jsonl"), "utf8"), '{"format":"doc-sync-log-v1"');
        assert.equal((await fetch(url(server.origin, "empty", "state"))).status, 500);
        assert.equal(await readFile(join(data, "empty.jsonl"), "utf8"), "");
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("receipt inspection of a missing document never creates a generation or file", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-missing-receipt-"));
    const server = await start(data);
    try {
        const before = await readdir(data);
        const base = {epoch: "missing", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)};
        const request = {generation: crypto.randomUUID(), base, change: makeChange("ai", "x")};
        assert.deepEqual(await (await post(server.origin, "missing", "receipt", request)).json(), {status: "unknown"});
        assert.deepEqual(await readdir(data), before);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("receipt inspection fails closed if the live log is truncated", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-live-receipt-"));
    const server = await start(data);
    try {
        const initial = await state(server.origin, "live");
        const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
        const change = makeChange("ai", "saved");
        assert.equal((await post(server.origin, "live", "conditional", {base, change})).status, 200);
        const request = {generation: initial.generation, base, change};
        const file = join(data, "live.jsonl");
        const damaged = `${await readFile(file, "utf8")}{"change":`;
        await writeFile(file, damaged);
        assert.equal((await post(server.origin, "live", "receipt", request)).status, 500);
        assert.equal(await readFile(file, "utf8"), damaged);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("missing live log is not recreated by a write or a later request", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-removed-log-"));
    const server = await start(data);
    try {
        const initial = await state(server.origin, "removed");
        const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
        const file = join(data, "removed.jsonl");
        await unlink(file);
        const response = await post(server.origin, "removed", "conditional", {base, change: makeChange("ai", "x")});
        assert.equal(response.status, 503);
        assert.equal((await response.json() as {code: string}).code, "storage_unknown");
        assert.equal((await fetch(url(server.origin, "removed", "state"))).status, 503);
        await assert.rejects(readFile(file), {code: "ENOENT"});
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("an in-flight body and scheduled GC cannot mutate an invalidated hub", {
    timeout: 20_000,
    skip: process.platform === "win32" || process.getuid?.() === 0,
}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-stale-hub-"));
    const server = await start(data);
    try {
        const initial = await state(server.origin, "stalehub");
        const seed = new Doc("seed", DEMO_SCHEMA);
        const headers = {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION),
            "x-doc-sync-epoch": initial.epoch, "x-doc-sync-schema": initial.schemaVersion};
        const write = (body: unknown) => fetch(url(server.origin, "stalehub", "changes"), {method: "POST", headers, body: JSON.stringify(body)});
        const insert = {actor: "seed", seq: 1, ops: seed.edit([{op: "insert", at: [0, 0], content: "abcdefghijkl"}]).ops};
        const remove = {actor: "seed", seq: 2, ops: seed.edit([{op: "delete", at: [0, 0], count: 12}]).ops};
        assert.equal((await write(insert)).status, 200);
        assert.equal((await write(remove)).status, 200);
        assert.equal((await fetch(url(server.origin, "stalehub", "ack"), {method: "POST", headers, body: JSON.stringify({actor: "seed", serverSeq: 2, pin: null})})).status, 200);
        const current = await state(server.origin, "stalehub");
        const base = {epoch: current.epoch, serverSeq: current.serverSeq, schemaVersion: current.schemaVersion};
        const pendingBody = JSON.stringify(makeChange("a", "A"));
        let finish!: () => void;
        const stalled = new Promise<number | undefined>((resolve, reject) => {
            const req = request(url(server.origin, "stalehub", "changes"), {method: "POST", headers: {...headers, expect: "100-continue"}}, res => {
                res.resume(); res.once("end", () => resolve(res.statusCode));
            });
            req.once("error", reject);
            req.once("continue", () => { req.write(pendingBody.slice(0, 1)); finish = () => req.end(pendingBody.slice(1)); });
            req.flushHeaders();
        });
        const deadline = Date.now() + 5000;
        while (!finish && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
        assert.ok(finish, "the first request reached the server before storage failure");
        const file = join(data, "stalehub.jsonl");
        const before = await readFile(file, "utf8");
        await chmod(file, 0o400);
        try {
            const failed = await post(server.origin, "stalehub", "conditional", {base, change: makeChange("b", "B")});
            assert.equal(failed.status, 503);
            assert.equal((await failed.json() as {code: string}).code, "storage_unknown");
        } finally { await chmod(file, 0o600); }
        finish();
        assert.equal(await stalled, 503, "the captured hub must not accept a later mutation");
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.equal(await readFile(file, "utf8"), before, "stale scheduled GC must not append");
        const reloaded = await state(server.origin, "stalehub");
        assert.notEqual(reloaded.epoch, initial.epoch);
        assert.equal(reloaded.serverSeq, 2);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

for (const acceptedFirst of [false, true]) test(`live recovery retains ${acceptedFirst ? 'accepted but unconfirmed' : 'unsent'} edits and undo across server restart`, {timeout: 30_000}, async () => {
    const {SyncClient, LiveRecovery} = await import('@barocss/doc-sync/sync');
    const {NodeHttpTransport} = await import('@barocss/doc-sync/node');
    const data = await mkdtemp(join(tmpdir(), 'doc-sync-live-recover-'));
    const recovered: number[] = [];
    let server = await start(data), wire = new NodeHttpTransport('live-recover','human',server.origin), blocked = false;
    const transport = {
        subscribe: (...args: Parameters<typeof wire.subscribe>) => wire.subscribe(...args),
        send: async (message: Parameters<typeof wire.send>[0]) => { if (blocked && message.kind === 'change') throw Error('held'); return wire.send(message); },
        sendPresence: (...args: Parameters<typeof wire.sendPresence>) => wire.sendPresence(...args),
        getRecoveryState: () => wire.getRecoveryState(),
        reserveRecovery: (...args: Parameters<typeof wire.reserveRecovery>) => wire.reserveRecovery(...args),
        getChangeReceipt: (...args: Parameters<typeof wire.getChangeReceipt>) => wire.getChangeReceipt(...args),
        recoverChange: (...args: Parameters<typeof wire.recoverChange>) => { recovered.push(args[3].seq); return wire.recoverChange(...args); },
        releaseRecovery: (...args: Parameters<typeof wire.releaseRecovery>) => wire.releaseRecovery(...args),
    };
    const client = new SyncClient('human',transport,{schema:DEMO_SCHEMA});
    const wait = async (condition: () => boolean) => { const until=Date.now()+8000; while(!condition()) {if(Date.now()>until) throw Error('condition timeout'); await new Promise(resolve=>setTimeout(resolve,10));} };
    try {
        client.connect(); await wait(()=>client.synchronized);
        const recovery = new LiveRecovery(client,transport); await recovery.establish();
        blocked=true;
        client.commit(client.doc.edit([{op:'insert',at:[0,0],content:'human'}]).ops);
        client.commit(client.doc.edit([{op:'insert',at:[0,5],content:'-tail'}]).ops);
        assert.equal(client.pending.length,2);
        const pending=structuredClone(client.pending);
        if(acceptedFirst){
            // Persist the exact first change, but withhold its acknowledgement and SSE from this client.
            client.disconnect();
            const initial=await state(server.origin,'live-recover');
            assert.equal((await fetch(url(server.origin,'live-recover','changes'),{method:'POST',headers:{'content-type':'application/json','x-doc-sync-protocol':String(PROTOCOL_VERSION),'x-doc-sync-epoch':initial.epoch,'x-doc-sync-schema':initial.schemaVersion},body:JSON.stringify(pending[0])})).status,200);
        }
        await server.stop('SIGKILL'); client.disconnect(); server=await start(data);
        wire=new NodeHttpTransport('live-recover','human',server.origin);
        const remote=makeChange('other','other'), current=await state(server.origin,'live-recover');
        const response=await fetch(url(server.origin,'live-recover','changes'),{method:'POST',headers:{'content-type':'application/json','x-doc-sync-protocol':String(PROTOCOL_VERSION),'x-doc-sync-epoch':current.epoch,'x-doc-sync-schema':current.schemaVersion},body:JSON.stringify(remote)});
        assert.equal(response.status,200); blocked=false;
        await recovery.recover(); await wait(()=>client.synchronized && client.pending.length===0);
        assert.deepEqual(recovered,acceptedFirst?[pending[1].seq]:pending.map(change=>change.seq),'exact accepted receipts must prevent replay');
        let text=JSON.stringify(client.doc.toJSON()); assert.equal((text.match(/human/g)??[]).length,1); assert.equal((text.match(/other/g)??[]).length,1);
        assert.match(text,/human-tail/);
        client.undo(); await wait(()=>client.pending.length===0); text=JSON.stringify(client.doc.toJSON()); assert.doesNotMatch(text,/-tail/); assert.match(text,/human/); assert.match(text,/other/);
        client.undo(); await wait(()=>client.pending.length===0); text=JSON.stringify(client.doc.toJSON()); assert.doesNotMatch(text,/human/); assert.match(text,/other/);
        client.redo(); await wait(()=>client.pending.length===0); text=JSON.stringify(client.doc.toJSON()); assert.equal((text.match(/human/g)??[]).length,1); assert.match(text,/other/);
        client.redo(); await wait(()=>client.pending.length===0); assert.match(JSON.stringify(client.doc.toJSON()),/human-tail/);
        assert.deepEqual(client.doc.toJSON(),(await state(server.origin,'live-recover')).model);
    } finally { client.disconnect(); await server.stop(); await rm(data,{recursive:true,force:true}); }
});

test('protected acknowledged history survives a server restart without pending changes', {timeout:30_000}, async()=>{
    const {SyncClient,LiveRecovery}=await import('@barocss/doc-sync/sync');
    const {NodeHttpTransport}=await import('@barocss/doc-sync/node');
    const data=await mkdtemp(join(tmpdir(),'doc-sync-history-restart-'));
    let server=await start(data),wire=new NodeHttpTransport('history-restart','human',server.origin);
    const transport={
        subscribe:(...args:Parameters<typeof wire.subscribe>)=>wire.subscribe(...args),
        sendPresence:(...args:Parameters<typeof wire.sendPresence>)=>wire.sendPresence(...args),
        send:(...args:Parameters<typeof wire.send>)=>wire.send(...args),
        getRecoveryState:()=>wire.getRecoveryState(),
        reserveRecovery:(...args:Parameters<typeof wire.reserveRecovery>)=>wire.reserveRecovery(...args),
        getChangeReceipt:(...args:Parameters<typeof wire.getChangeReceipt>)=>wire.getChangeReceipt(...args),
        recoverChange:(...args:Parameters<typeof wire.recoverChange>)=>wire.recoverChange(...args),
        releaseRecovery:(...args:Parameters<typeof wire.releaseRecovery>)=>wire.releaseRecovery(...args),
    };
    const client=new SyncClient('human',transport,{schema:DEMO_SCHEMA});
    const wait=async(condition:()=>boolean)=>{const until=Date.now()+8000;while(!condition()){if(Date.now()>until)throw Error('condition timeout');await new Promise(resolve=>setTimeout(resolve,10));}};
    try{
        client.connect();await wait(()=>client.synchronized);
        const recovery=new LiveRecovery(client,transport);await recovery.establish();
        client.commit(client.doc.edit([{op:'insert',at:[0,0],content:'human'}]).ops);
        await wait(()=>client.pending.length===0);assert.ok(client.history.canUndo);
        await server.stop('SIGKILL');client.disconnect();server=await start(data);
        wire=new NodeHttpTransport('history-restart','human',server.origin);
        client.connect();await wait(()=>!!client.connectionError&&!client.online);
        assert.ok(client.history.canUndo,'epoch mismatch must preserve the acknowledged undo stack');
        await recovery.recover();await wait(()=>client.synchronized);
        client.undo();await wait(()=>client.pending.length===0);assert.doesNotMatch(JSON.stringify(client.doc.toJSON()),/human/);
        client.redo();await wait(()=>client.pending.length===0);assert.match(JSON.stringify(client.doc.toJSON()),/human/);
        assert.deepEqual(client.doc.toJSON(),(await state(server.origin,'history-restart')).model);
    }finally{client.disconnect();await server.stop();await rm(data,{recursive:true,force:true});}
});

test('live recovery refuses reset generation and preserves the local pending edit and undo stack', {timeout:30_000}, async()=>{
    const {SyncClient,LiveRecovery}=await import('@barocss/doc-sync/sync');
    const {NodeHttpTransport}=await import('@barocss/doc-sync/node');
    const data=await mkdtemp(join(tmpdir(),'doc-sync-live-reset-'));
    const server=await start(data),wire=new NodeHttpTransport('live-reset','human',server.origin);
    let blocked=false;
    const transport={
        subscribe:(...args:Parameters<typeof wire.subscribe>)=>wire.subscribe(...args),
        sendPresence:(...args:Parameters<typeof wire.sendPresence>)=>wire.sendPresence(...args),
        send:(...args:Parameters<typeof wire.send>)=>blocked?Promise.reject(Error('held')):wire.send(...args),
        getRecoveryState:()=>wire.getRecoveryState(),
        reserveRecovery:(...args:Parameters<typeof wire.reserveRecovery>)=>wire.reserveRecovery(...args),
        getChangeReceipt:(...args:Parameters<typeof wire.getChangeReceipt>)=>wire.getChangeReceipt(...args),
        recoverChange:(...args:Parameters<typeof wire.recoverChange>)=>wire.recoverChange(...args),
        releaseRecovery:(...args:Parameters<typeof wire.releaseRecovery>)=>wire.releaseRecovery(...args),
    };
    const client=new SyncClient('human',transport,{schema:DEMO_SCHEMA});
    const wait=async(condition:()=>boolean)=>{const until=Date.now()+8000;while(!condition()){if(Date.now()>until)throw Error('condition timeout');await new Promise(resolve=>setTimeout(resolve,10));}};
    try{
        client.connect();await wait(()=>client.synchronized);
        const recovery=new LiveRecovery(client,transport);await recovery.establish();
        blocked=true;client.commit(client.doc.edit([{op:'insert',at:[0,0],content:'keep-local'}]).ops);client.disconnect();
        const before=client.checkpoint(),model=client.doc.toJSON();
        assert.equal((await post(server.origin,'live-reset','reset',{})).status,200);
        const reset=await state(server.origin,'live-reset');
        await assert.rejects(recovery.recover(),/generation, schema or history changed/i);
        assert.deepEqual(client.checkpoint(),before);assert.deepEqual(client.doc.toJSON(),model);assert.ok(client.history.canUndo);
        assert.deepEqual((await state(server.origin,'live-reset')).model,reset.model,'failed recovery must not write the old edit into the reset document');
        assert.equal(client.online,false);
    }finally{client.disconnect();await server.stop();await rm(data,{recursive:true,force:true});}
});

test("conditional settlement fences a delayed body across restart, GC and recovery metadata compaction", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-settle-"));
    let server = await start(data, {RECOVERY_COMPACT_THRESHOLD: "2"});
    const doc = "settled";
    try {
        const initial = await state(server.origin, doc);
        const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
        const change = makeChange("retired", "old"), payload = {generation: initial.generation, base, change};
        const proof = await (await post(server.origin, doc, "settle-conditional", payload)).json() as {status: string; requestDigest: string};
        assert.equal(proof.status, "not_applied");
        assert.equal((await state(server.origin, doc)).serverSeq, 0);
        assert.equal((await post(server.origin, doc, "conditional", {base, change})).status, 409);
        const pin = {generation: initial.generation, actor: "retired", reservationId: "r0~" + crypto.randomUUID(), pin: null};
        await post(server.origin, doc, "recovery-lease", pin);
        await post(server.origin, doc, "recovery-lease", {...pin, action: "release"});
        for (let tries = 0; tries < 100; tries++) {
            const compact = await (await fetch(url(server.origin, doc, "compaction-state"))).json() as {phase: string};
            if (compact.phase === "idle") break;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        await post(server.origin, doc, "gc", {});
        await server.stop("SIGKILL"); server = await start(data);
        assert.equal((await state(server.origin, doc)).serverSeq, 0);
        assert.deepEqual(await (await post(server.origin, doc, "settle-conditional", payload)).json(), {...proof});
        // Use the current epoch to ensure the body fence, rather than epoch rejection, is checked.
        const current = await state(server.origin, doc);
        const delayed = await post(server.origin, doc, "conditional", {base: {...base, epoch: current.epoch}, change});
        assert.equal(delayed.status, 409);
        assert.match(await delayed.text(), /conditional_sealed/);
        const ordinary = await fetch(url(server.origin, doc, "changes"), {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-schema": current.schemaVersion, "x-doc-sync-epoch": current.epoch}, body: JSON.stringify(change)});
        assert.equal(ordinary.status, 409); assert.match(await ordinary.text(), /conditional_sealed/);
        assert.equal((await state(server.origin, doc)).serverSeq, 0);
        const durable = await readFile(join(data, `${doc}.jsonl`), "utf8");
        assert.match(durable, /conditionalSeal/);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("settlement and conditional acceptance share one durable serial order", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-settle-race-"));
    const server = await start(data);
    try {
        for (let index = 0; index < 8; index++) {
            const doc = `race${index}`, initial = await state(server.origin, doc);
            const base = {epoch: initial.epoch, serverSeq: initial.serverSeq, schemaVersion: initial.schemaVersion};
            const change = makeChange("racer", "x");
            const [settlement, submit] = await Promise.all([
                post(server.origin, doc, "settle-conditional", {generation: initial.generation, base, change}).then(r => r.json()) as Promise<{status: string}>,
                post(server.origin, doc, "conditional", {base, change}),
            ]);
            if (settlement.status === "not_applied") { assert.equal(submit.status, 409); assert.equal((await state(server.origin, doc)).serverSeq, 0); }
            else { assert.equal(settlement.status, "accepted"); assert.equal(submit.status, 200); assert.equal((await state(server.origin, doc)).serverSeq, 1); }
        }
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("missing or corrupted settlement source is unknown and never creates a document", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-settle-unknown-"));
    const server = await start(data);
    try {
        const payload = {generation: crypto.randomUUID(), base: {epoch: "old", serverSeq: 0, schemaVersion: null}, change: makeChange("a", "x")};
        assert.deepEqual(await (await post(server.origin, "missing", "settle-conditional", payload)).json(), {status: "unknown"});
        assert.equal((await readdir(data)).includes("missing.jsonl"), false);
        const initial = await state(server.origin, "corrupt");
        await writeFile(join(data, "corrupt.jsonl"), "corrupt\n");
        assert.deepEqual(await (await post(server.origin, "corrupt", "settle-conditional", {...payload, generation: initial.generation})).json(), {status: "unknown"});
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("negative settlement requires actual file and directory sync after uncertain append and cached retries", {timeout: 20_000}, async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-settle-sync-"));
    const preload = join(data, "inject-sync.mjs"), fault = join(data, "sync-fault"), log = join(data, "sync.jsonl");
    // Patch the real FileHandle method. The append bytes remain visible when sync
    // reports EIO; hashes alone therefore cannot establish durable rejection.
    await writeFile(preload, `import {open} from 'node:fs/promises';
import {existsSync,readFileSync,statSync} from 'node:fs';
const dir=await open(process.env.DATA_DIR,'r');
const proto=Object.getPrototypeOf(dir), original=proto.sync;
await dir.close();
proto.sync=async function(){
  const target=${JSON.stringify(log)}, control=${JSON.stringify(fault)};
  if(existsSync(control)&&existsSync(target)&&readFileSync(target,'utf8').includes('conditionalSeal')) {
    const mode=readFileSync(control,'utf8'), current=await this.stat(), targetStat=statSync(target);
    if((mode==='file'&&current.ino===targetStat.ino&&current.dev===targetStat.dev)||(mode==='directory'&&current.isDirectory())) {
      const error=new Error('injected FileHandle.sync EIO');error.code='EIO';throw error;
    }
  }
  return original.call(this);
};
`);
    const server = await start(data, {NODE_OPTIONS: `--import=${preload}`});
    try {
        const initial = await state(server.origin, "sync");
        const base = {epoch: initial.epoch, serverSeq: 0, schemaVersion: initial.schemaVersion};
        const payload = {generation: initial.generation, base, change: makeChange("a", "x")};
        await writeFile(fault, "file");
        const settle = async () => (await (await post(server.origin, "sync", "settle-conditional", payload)).json()) as {status: string};
        assert.deepEqual(await settle(), {status: "unknown"});
        assert.match(await readFile(log, "utf8"), /conditionalSeal/);
        assert.deepEqual(await settle(), {status: "unknown"});
        await unlink(fault);
        const durable = await settle(); assert.equal(durable.status, "not_applied");
        // This attempt finds the installed cached fence. It still must sync.
        await writeFile(fault, "file");
        assert.deepEqual(await settle(), {status: "unknown"});
        await unlink(fault);
        assert.deepEqual(await settle(), durable);
        await writeFile(fault, "directory");
        assert.deepEqual(await settle(), {status: "unknown"});
        await unlink(fault);
        assert.deepEqual(await settle(), durable);
        const current = await state(server.origin, "sync");
        assert.equal(current.serverSeq, 0);
        assert.equal((await post(server.origin, "sync", "conditional", {base: {...base, epoch: current.epoch}, change: payload.change})).status, 409);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});
