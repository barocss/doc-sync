import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {createHash} from "node:crypto";
import {closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync} from "node:fs";
import {open as openAsync, stat as statAsync, rename as renameAsync, unlink as unlinkAsync, link as linkAsync} from "node:fs/promises";
import {createServer} from "node:http";
import {stripTypeScriptTypes} from "node:module";
import {dirname, extname, join, normalize, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {Worker} from "node:worker_threads";
import {DocHub, PostPersistUncertainError, RecoveryCompactionDeferredError, prepareDurableMutation} from "@barocss/doc-sync/server";
import {isAlive, schemaVersion} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../fixtures/demo-schema.ts";
import {PRODUCT_SCHEMAS} from "../../fixtures/product-schemas.ts";
import type {IncomingMessage, ServerResponse} from "node:http";
import type {Ack, Change, Presence, ServerEvent} from "@barocss/doc-sync/sync";
import type {Schema} from "@barocss/doc-sync";

/**
 * 동기화 서버 + 데모 페이지. Node 기본 모듈만 쓴다.
 *
 *   GET  /                          데모 페이지
 *   GET  /multi?n=10&doc=이름        여러 창 시험 (창마다 a.localhost, b.localhost … 로 연다)
 *   GET  /pm?doc=이름                데모 편집기와 ProseMirror 편집기가 같은 문서를 편집
 *   GET  /packages/doc-sync/src/**.ts, /apps/demo/ui/**.ts    TypeScript 를 타입만 벗겨 브라우저에 내준다 (번들러 없음)
 *   GET  /api/docs/:doc/stream      SSE — hello(스냅숏) → 밀린 변경 → 이후 변경·presence
 *   POST /api/docs/:doc/changes     Change 하나
 *   POST /api/docs/:doc/ack         여기까지 받았다 + 되돌리기 핀
 *   POST /api/docs/:doc/presence    커서
 *   POST /api/docs/:doc/leave       창을 닫았다 (더 기다리지 않는다)
 *   POST /api/docs/:doc/gc          지금 GC 해 보기
 *   GET  /api/docs/:doc/state       서버 문서 (확인용)
 *   POST /api/docs/:doc/reset       문서 비우기 (데모용)
 *
 * 로그는 data/<doc>.jsonl 에 한 줄씩 쌓는다 (변경 또는 GC 줄). 서버를 다시 켜면 로그를 되풀이해 이어 간다.
 * 묘비가 쌓이면 서버가 스스로 GC 한다.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, "data"));
const PORT = Number(process.env.PORT ?? 5410);
const profile = process.env.DOC_PROFILE;
if (profile && !Object.hasOwn(PRODUCT_SCHEMAS, profile)) throw new Error(`Unknown document profile: ${profile}`);
const documentSchema = profile ? PRODUCT_SCHEMAS[profile as keyof typeof PRODUCT_SCHEMAS] : DEMO_SCHEMA;
/** 끊긴 참여자의 핀을 지켜 주는 시간 */
const LEASE = 2 * 60_000;
/** 이만큼 압축할 묘비가 모이면 스스로 GC */
const AUTO_GC = 12;
const recoveryThreshold = Number(process.env.RECOVERY_COMPACT_THRESHOLD ?? 128);
if (!Number.isSafeInteger(recoveryThreshold) || recoveryThreshold < 1) throw new Error("Invalid recovery compaction threshold");
const hubs = new Map<string, DocHub>();
const seenDocuments = new Set<string>();
const streams = new Map<DocHub, Set<ServerResponse>>();
const recoveryCounts = new WeakMap<DocHub, number>();
const recoveryDeferrals = new WeakSet<DocHub>();
type LogIntegrity = {anchorBytes: number; anchorDigest: string; chainDigest: string; revision: number; dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number; pending?: boolean};
const integrity = new WeakMap<DocHub, LogIntegrity>();
type CompactionJob = {hub: DocHub; generation: string | null; phase: "running" | "paused"; worker: Worker | null; promise: Promise<void>};
const compactions = new Map<string, CompactionJob>();
let testGateUsed = false;
const testGateEnabled = process.env.DOC_SYNC_TEST_COMPACTION_GATE === "1";
type ReceiptJob = {phase: "running" | "paused"; worker: Worker; hub: DocHub; current: LogIntegrity; revision: number; source: FileIdentity; waiters: number;
    promise: Promise<{identity?: FileIdentity; error?: Error}>};
const receiptJobs = new Map<string, ReceiptJob>();
let receiptTestGateUsed = false;
const receiptTestGateEnabled = process.env.DOC_SYNC_TEST_RECEIPT_GATE === "1";
type ColdJob = {phase: "reading" | "paused" | "replaying"; waiters: number; release: (() => void) | null; promise: Promise<DocHub | null>};
const coldLoads = new Map<string, ColdJob>();
const coldGateDoc = process.env.DOC_SYNC_TEST_COLD_GATE_DOC;
let coldGateUsed = false;
const fsyncGateDoc = process.env.DOC_SYNC_TEST_FSYNC_GATE_DOC;
const fsyncGateStage = process.env.DOC_SYNC_TEST_FSYNC_GATE_STAGE ?? "before-sync";
let fsyncGateUsed = false;
const fsyncJobs = new Map<string, {release: () => void}>();
const resetGateDoc = process.env.DOC_SYNC_TEST_RESET_GATE_DOC;
let resetGateUsed = false;
const resetJobs = new Map<string, {release: () => void}>();
const commandQueues = new Map<string, Promise<void>>();
const commandWaiters = new Map<string, number>();
const storageReaders = new Map<string, number>();

function serializeDoc<T>(doc: string, fn: () => T | Promise<T>): Promise<T> {
    commandWaiters.set(doc, (commandWaiters.get(doc) ?? 0) + 1);
    const result = (commandQueues.get(doc) ?? Promise.resolve()).then(fn);
    const done = result.then(() => undefined, () => undefined).then(() => {
        const remaining = (commandWaiters.get(doc) ?? 1) - 1;
        if (remaining) commandWaiters.set(doc, remaining); else commandWaiters.delete(doc);
    });
    commandQueues.set(doc, done);
    void done.then(() => { if (commandQueues.get(doc) === done) commandQueues.delete(doc); });
    return result;
}

async function waitForDocStorage(doc: string): Promise<void> {
    storageReaders.set(doc, (storageReaders.get(doc) ?? 0) + 1);
    try { await commandQueues.get(doc); }
    finally {
        const remaining = (storageReaders.get(doc) ?? 1) - 1;
        if (remaining) storageReaders.set(doc, remaining); else storageReaders.delete(doc);
    }
}

/** Discard uncertain memory and close stale streams so clients reconnect safely. */
function invalidateHub(doc: string, hub: DocHub): void {
    if (hubs.get(doc) !== hub) return;
    hubs.delete(doc);
    const active = streams.get(hub);
    streams.delete(hub);
    active?.forEach(response => response.destroy());
}

const logPath = (doc: string) => join(DATA, `${doc}.jsonl`);

type GenerationHeader = {format: "doc-sync-log-v1"; generation: string; initialSchemaVersion: string | null};
class StorageUncertainError extends Error {}

function appendDurably(path: string, value: unknown): Buffer {
    // Do not silently recreate a deleted authoritative log with no generation.
    const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND);
    const data = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    try { writeFileSync(fd, data); fsyncSync(fd); }
    finally { closeSync(fd); }
    return data;
}

function startIntegrity(content: string, source: {dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number}, revision = 0): LogIntegrity {
    const digest = createHash("sha256").update(content, "utf8").digest("hex");
    return {anchorBytes: Buffer.byteLength(content), anchorDigest: digest, chainDigest: digest, revision, dev: source.dev, ino: source.ino, size: source.size, mtimeMs: source.mtimeMs, ctimeMs: source.ctimeMs};
}

/** Publish a new log without exposing a partially written header or replacing another file. */
async function createTextIfMissing(path: string, content: string): Promise<void> {
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    let created = false;
    try {
        const fd = await openAsync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        try { await fd.writeFile(content, "utf8"); await fd.sync(); } finally { await fd.close(); }
        try { await linkAsync(temporary, path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        await unlinkAsync(temporary); created = false;
        const directory = await openAsync(DATA, "r");
        try { await directory.sync(); } finally { await directory.close(); }
    } finally { if (created) await unlinkAsync(temporary).catch(() => undefined); }
}

/** Read and validate the complete log. A receipt check never creates a missing file. */
const loadHub = async (doc: string, create: boolean, job: ColdJob): Promise<DocHub | null> => {
    const selectedSchema = process.env.NO_SCHEMA ? null : documentSchema;
    const initialSchemaVersion = selectedSchema ? schemaVersion(selectedSchema) : null;
    const path = logPath(doc);
    let fd: Awaited<ReturnType<typeof openAsync>>;
    try { fd = await openAsync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (!create) return null;
        if (seenDocuments.has(doc)) throw new StorageUncertainError("Document log is missing; no replacement was created");
        const header: GenerationHeader = {format: "doc-sync-log-v1", generation: crypto.randomUUID(), initialSchemaVersion};
        try {
            await createTextIfMissing(path, `${JSON.stringify(header)}\n`);
        } catch (creationError) {
            throw new StorageUncertainError(`Storage outcome unknown: ${(creationError as Error).message}`);
        }
        fd = await openAsync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    }
    const identity = (value: Awaited<ReturnType<typeof fd.stat>>) => ({dev: Number(value.dev), ino: Number(value.ino), size: Number(value.size), mtimeMs: Number(value.mtimeMs), ctimeMs: Number(value.ctimeMs)});
    let content: string;
    let closed = false;
    try {
        const before = identity(await fd.stat());
        if (coldGateDoc === doc && !coldGateUsed) {
            coldGateUsed = true; job.phase = "paused";
            await new Promise<void>(resolve => { job.release = resolve; });
            job.release = null; job.phase = "reading";
        }
        content = await fd.readFile("utf8");
        if (JSON.stringify(identity(await fd.stat())) !== JSON.stringify(before)) throw new StorageUncertainError("Document log changed while it was read");
    const lines = content.split("\n").filter(Boolean);
    if (!lines.length) throw new Error(`${doc}: empty stored log cannot establish document generation`);
    if (content && !content.endsWith("\n")) throw new Error(`${doc}: incomplete stored entry`);
    let generation: string | null = null;
    let recoveryCount = 0;
    if (lines.length) {
        const first = JSON.parse(lines[0]) as Partial<GenerationHeader>;
        if (first.format !== undefined) {
            if (first.format !== "doc-sync-log-v1" || typeof first.generation !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(first.generation) ||
                first.initialSchemaVersion !== initialSchemaVersion) throw new Error(`${doc}: invalid generation header or initial schema`);
            generation = first.generation;
            lines.shift();
        }
    }
    // Legacy logs have no durable generation and cannot provide receipt evidence.
    const hub = new DocHub({lease: LEASE, schema: selectedSchema, generation});

    job.phase = "replaying";
    if (lines.length) {
        for (let i = 0; i < lines.length; i++) {
                if (i > 0 && i % 128 === 0) await new Promise<void>(resolve => setImmediate(resolve));
                const line = lines[i];
                const entry = JSON.parse(line) as {gc?: number; change?: Change; recoveryPin?: {actor: string; reservationId: string; pin: number | null}; recoveryState?: {era: number; active: Array<{actor: string; reservationId: string; pin: number}>}; conditionalBase?: {epoch: string; serverSeq: number; schemaVersion: string | null}; schema?: {from: string; to: string; schema: Schema}} & Partial<Change>;

                try {
                    if (entry.recoveryPin) {
                        recoveryCount++;
                        hub.replayRecoveryPin(entry.recoveryPin);
                    } else if (entry.recoveryState) {
                        recoveryCount = 0;
                        hub.replayRecoveryState(entry.recoveryState);
                    } else if (entry.schema) {
                        if (hub.schemaVersion !== entry.schema.from || schemaVersion(entry.schema.schema) !== entry.schema.to) {
                            throw new Error("Schema transition log does not match the preceding schema");
                        }
                        hub.transitionSchema(entry.schema.schema, {epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: entry.schema.from});
                    } else {
                        if (entry.gc !== undefined) {
                            if (!Number.isSafeInteger(entry.gc) || entry.gc < 0 || entry.gc > hub.serverSeq) throw new Error("Invalid stored GC frontier");
                            hub.replayGc(entry.gc);
                        } else {
                            const base = entry.conditionalBase;
                            if (base && (typeof base.epoch !== "string" || !base.epoch || !Number.isSafeInteger(base.serverSeq) ||
                                base.serverSeq !== hub.serverSeq || base.schemaVersion !== hub.schemaVersion)) throw new Error("Invalid stored conditional base");
                            if (!hub.submit(upgradeV2(entry.change ?? (entry as Change)), base)) throw new Error("Duplicate stored change");
                        }
                    }
                } catch (error) {
                    // Skipping any entry changes the base of later changes or schema
                    // transitions. Refuse to open rather than expose an incomplete document.
                    throw new Error(`${doc}: cannot replay stored entry: ${(error as Error).message}`);
                }
            }
    }

    // Re-establish the storage barrier when reopening after an uncertain append
    // or rename. Do not trust the validated log until both syncs succeed.
    try {
        await fd.sync();
        const directory = await openAsync(DATA, "r");
        try { await directory.sync(); } finally { await directory.close(); }
        const after = identity(await fd.stat());
        const current = identity(await statAsync(path));
        if (JSON.stringify(after) !== JSON.stringify(before) || JSON.stringify(current) !== JSON.stringify(before)) throw new Error("Document log changed during replay");
    } catch (error) {
        throw new StorageUncertainError(`Storage outcome unknown: ${(error as Error).message}`);
    }

    // This anchor describes the fully validated, durably opened source. Later
    // appends update a small rolling digest only after their fsync succeeds.
    integrity.set(hub, startIntegrity(content, before));
    const persist = (entry: unknown) => {
        try {
            const previous = integrity.get(hub);
            const identity = fileIdentity(path);
            if (!previous || identity.dev !== previous.dev || identity.ino !== previous.ino || identity.size !== previous.size || identity.mtimeMs !== previous.mtimeMs || identity.ctimeMs !== previous.ctimeMs) throw new Error("Document log changed before append");
            const data = appendDurably(path, entry);
            const current = integrity.get(hub);
            if (!current) throw new Error("Missing durable log integrity state");
            const next = fileIdentity(path);
            if (next.dev !== current.dev || next.ino !== current.ino || next.size !== current.size + data.length) throw new Error("Document log changed during append");
            current.chainDigest = createHash("sha256").update(Buffer.from(current.chainDigest, "hex")).update(data).digest("hex");
            current.size = next.size;
            current.mtimeMs = next.mtimeMs; current.ctimeMs = next.ctimeMs;
            current.revision++;
        }
        catch (error) {
            // The write may have reached disk despite an error. Reopen from the log
            // on the next request and never report this operation as rejected.
            invalidateHub(doc, hub);
            throw new StorageUncertainError(`Storage outcome unknown: ${(error as Error).message}`);
        }
    };
    hub.onAppend = (envelope, conditionalBase) => persist(envelope.gc !== undefined ? {gc: envelope.gc} : {change: envelope.change, ...(conditionalBase ? {conditionalBase} : {})});
    recoveryCounts.set(hub, recoveryCount);
    hub.onRecoveryPin = entry => { persist({recoveryPin: entry}); recoveryCounts.set(hub, (recoveryCounts.get(hub) ?? 0) + 1); };
    hub.onSchemaChange = entry => persist({schema: entry});
    hub.onPostPersistError = () => invalidateHub(doc, hub);
    await fd.close(); closed = true;
    assertColdSource(doc, hub);
    seenDocuments.add(doc);
    return hub;
    } finally { if (!closed) await fd.close(); }
};

/** All first access to one document shares the same private load. */
async function sharedColdLoad(doc: string, create: boolean): Promise<DocHub | null> {
    for (;;) {
        let job = coldLoads.get(doc);
        if (!job) {
            job = {phase: "reading", waiters: 0, release: null, promise: Promise.resolve(null)};
            const active = job;
            job.promise = loadHub(doc, create, job).finally(() => { if (coldLoads.get(doc) === active) coldLoads.delete(doc); });
            coldLoads.set(doc, job);
        }
        job.waiters++;
        let result: DocHub | null;
        try { result = await job.promise; } finally { job.waiters--; }
        if (result || !create) return result;
        // A read-only lookup found no file. Only the creator retries with create=true.
    }
}

type FileIdentity = {dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number};
const fileIdentity = (path: string): FileIdentity => {
    const value = statSync(path);
    return {dev: value.dev, ino: value.ino, size: value.size, mtimeMs: value.mtimeMs, ctimeMs: value.ctimeMs};
};

function assertColdSource(doc: string, hub: DocHub): void {
    const expected = integrity.get(hub);
    let actual: FileIdentity;
    try { actual = fileIdentity(logPath(doc)); }
    catch (error) { throw new StorageUncertainError(`Document log is unavailable before publication: ${(error as Error).message}`); }
    if (!expected || actual.dev !== expected.dev || actual.ino !== expected.ino || actual.size !== expected.size ||
        actual.mtimeMs !== expected.mtimeMs || actual.ctimeMs !== expected.ctimeMs) throw new StorageUncertainError("Document log changed before publication");
}

/** Build and sync recovery compaction away from the HTTP event loop. */
async function maybeCompactRecovery(doc: string, hub: DocHub): Promise<void> {
    if (!hub.generation || (recoveryCounts.get(hub) ?? 0) < recoveryThreshold) return;
    const running = compactions.get(doc);
    if (running && running.hub === hub && running.generation === hub.generation) return running.promise;
    const path = logPath(doc), generation = hub.generation;
    const job: CompactionJob = {hub, generation, phase: "running", worker: null, promise: Promise.resolve()};
    const run = async () => {
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                if (hubs.get(doc) !== hub || hub.generation !== generation) return;
                const snapshot = hub.recoveryCompactionState();
                const current = integrity.get(hub);
                if (!current) throw new Error("Missing durable log integrity state");
                if (current.pending) { await waitForDocStorage(doc); continue; }
                const captured = {...current}, source = fileIdentity(path);
                const temporary = `${path}.${crypto.randomUUID()}.tmp`;
                const gate = testGateEnabled && !testGateUsed;
                if (gate) testGateUsed = true;
                const worker = new Worker(new URL("./recovery-compaction-worker.ts", import.meta.url), {workerData: {
                    path, temporary, anchorBytes: captured.anchorBytes, anchorDigest: captured.anchorDigest,
                    chainDigest: captured.chainDigest, size: source.size, snapshot, gate,
                }});
                job.worker = worker; job.phase = "running";
                const result = await new Promise<{identity?: FileIdentity; temporaryIdentity?: FileIdentity; digest?: string; size?: number; error?: Error}>(resolve => {
                    let settled = false;
                    const done = (value: {identity?: FileIdentity; temporaryIdentity?: FileIdentity; digest?: string; size?: number; error?: Error}) => { if (!settled) { settled = true; resolve(value); } };
                    worker.on("message", message => {
                        const value = message as {kind?: string; identity?: FileIdentity; temporaryIdentity?: FileIdentity; digest?: string; size?: number; message?: string};
                        if (value.kind === "paused") { job.phase = "paused"; return; }
                        if (value.kind === "complete") done(value);
                        else if (value.kind === "error") done({error: new Error(value.message ?? "Recovery worker failed")});
                    });
                    worker.on("error", error => done({error}));
                    worker.on("exit", code => { if (!settled) done({error: new Error(`Recovery worker exited before completion: ${code}`)}); });
                });
                job.worker = null; job.phase = "running";
                const clean = () => { try { unlinkSync(temporary); } catch { /* It may not have been created. */ } };
                const latest = integrity.get(hub);
                // Concurrent writes or reset invalidate the candidate, not the accepted writes.
                if (hubs.get(doc) !== hub || hub.generation !== generation || latest !== current) { clean(); return; }
                if (latest.pending || latest.revision !== captured.revision) { clean(); if (latest.pending) await waitForDocStorage(doc); continue; }
                try {
                    const installed = await serializeDoc(doc, async () => {
                        try {
                        const final = integrity.get(hub);
                        if (hubs.get(doc) !== hub || hub.generation !== generation || final !== current) return "gone" as const;
                        if (final.pending || final.revision !== captured.revision) return "retry" as const;
                        if (result.error) throw result.error;
                        if (!result.identity || !result.temporaryIdentity || typeof result.digest !== "string" || !Number.isSafeInteger(result.size) ||
                            JSON.stringify(result.identity) !== JSON.stringify(source) || JSON.stringify(fileIdentity(path)) !== JSON.stringify(source) ||
                            JSON.stringify(fileIdentity(temporary)) !== JSON.stringify(result.temporaryIdentity)) {
                            throw new Error("Recovery compaction source changed or is inconsistent");
                        }
                        final.pending = true; final.revision++;
                        try {
                            await renameAsync(temporary, path);
                            const published = fileIdentity(path);
                            if (published.dev !== result.temporaryIdentity.dev || published.ino !== result.temporaryIdentity.ino ||
                                published.size !== result.size || published.mtimeMs !== result.temporaryIdentity.mtimeMs) throw new Error("Compacted log changed during publication");
                            const directory = await openAsync(DATA, "r");
                            try { await directory.sync(); } finally { await directory.close(); }
                            if (JSON.stringify(fileIdentity(path)) !== JSON.stringify(published)) throw new Error("Compacted log changed before installation");
                            hub.commitRecoveryCompaction(snapshot);
                            integrity.set(hub, {anchorBytes: result.size!, anchorDigest: result.digest!, chainDigest: result.digest!, revision: final.revision,
                                dev: published.dev, ino: published.ino, size: published.size, mtimeMs: published.mtimeMs, ctimeMs: published.ctimeMs});
                            recoveryCounts.set(hub, 0); recoveryDeferrals.delete(hub);
                            return "installed" as const;
                        } finally { final.pending = false; }
                        } catch (error) {
                            // Fence queued commands before the queue promise settles.
                            invalidateHub(doc, hub);
                            throw error;
                        }
                    });
                    if (installed === "installed" || installed === "gone") return;
                    continue;
                } finally { clean(); }
            }
            // Avoid a hot retry loop under continuous writes. A later attempt
            // starts from a fresh durable revision; the original log remains valid.
            const timer = setTimeout(() => { if (hubs.get(doc) === hub && hub.generation === generation) void maybeCompactRecovery(doc, hub).catch(() => undefined); }, 100);
            timer.unref();
        } catch (error) {
            if (error instanceof RecoveryCompactionDeferredError) {
                if (!recoveryDeferrals.has(hub)) console.warn(`Recovery compaction deferred for ${doc}: legacy recovery metadata cannot be safely sealed`);
                recoveryDeferrals.add(hub);
                return;
            }
            invalidateHub(doc, hub);
            throw new StorageUncertainError(`Recovery compaction outcome unknown: ${(error as Error).message}`);
        }
    };
    job.promise = run().finally(() => { if (compactions.get(doc) === job) compactions.delete(doc); });
    compactions.set(doc, job);
    return job.promise;
}

/** Verify the stable durable source off-thread before trusting a live receipt. */
async function verifiedReceipt<T>(doc: string, read: (hub: DocHub | null) => T): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const hub = hubs.get(doc);
        // Preserve read-only missing-document behavior. A cold document still
        // uses the existing full replay, but never creates or joins a document.
        if (!hub) {
            const cold = await sharedColdLoad(doc, false);
            // A creator may have installed the same hub while the cold read
            // was pending. Its in-flight writes must use the live barrier.
            if (hubs.has(doc)) continue;
            if (cold) assertColdSource(doc, cold);
            return read(cold);
        }
        const path = logPath(doc);
        let job = receiptJobs.get(doc);
        if (!job) {
            const current = integrity.get(hub);
            if (!current) { invalidateHub(doc, hub); throw new Error("Missing durable log integrity state"); }
            if (current.pending) { await waitForDocStorage(doc); continue; }
            const captured = {...current};
            let source: FileIdentity;
            try { source = fileIdentity(path); }
            catch (error) { invalidateHub(doc, hub); throw error; }
            const gate = receiptTestGateEnabled && !receiptTestGateUsed;
            if (gate) receiptTestGateUsed = true;
            const worker = new Worker(new URL("./recovery-compaction-worker.ts", import.meta.url), {workerData: {
                path, mode: "verify", anchorBytes: captured.anchorBytes, anchorDigest: captured.anchorDigest,
                chainDigest: captured.chainDigest, size: source.size, gate,
            }});
            job = {phase: "running", worker, hub, current, revision: captured.revision, source, waiters: 0, promise: Promise.resolve({})};
            const activeJob = job;
            job.promise = new Promise<{identity?: FileIdentity; error?: Error}>(resolve => {
                let settled = false;
                const done = (value: {identity?: FileIdentity; error?: Error}) => { if (!settled) { settled = true; resolve(value); } };
                worker.on("message", message => {
                    const value = message as {kind?: string; identity?: FileIdentity; message?: string};
                    if (value.kind === "paused") { activeJob.phase = "paused"; return; }
                    if (value.kind === "complete") done(value);
                    else if (value.kind === "error") done({error: new Error(value.message ?? "Receipt worker failed")});
                });
                worker.on("error", error => done({error}));
                worker.on("exit", code => { if (!settled) done({error: new Error(`Receipt worker exited before completion: ${code}`)}); });
            });
            receiptJobs.set(doc, job);
        }
        job.waiters++;
        const result = await job.promise;
        job.waiters--;
        if (receiptJobs.get(doc) === job) receiptJobs.delete(doc);
        const latest = integrity.get(job.hub);
        if (hubs.get(doc) !== job.hub || latest !== job.current || latest.pending || latest.revision !== job.revision) continue;
        try {
            if (result.error) throw result.error;
            if (!result.identity || JSON.stringify(result.identity) !== JSON.stringify(job.source) || JSON.stringify(fileIdentity(path)) !== JSON.stringify(job.source)) {
                throw new Error("Receipt source changed during verification");
            }
            // Compute the immutable receipt before yielding to another request.
            return read(job.hub);
        } catch (error) {
            invalidateHub(doc, job.hub);
            throw error;
        }
    }
    throw new StorageUncertainError("Receipt verification could not observe a stable durable revision");
}

/** Open a document once per server process and preserve its live peers. */
const hubOf = async (doc: string): Promise<DocHub> => {
    const existing = hubs.get(doc);
    if (existing) return existing;
    const hub = (await sharedColdLoad(doc, true))!;
    const installed = hubs.get(doc);
    if (installed) return installed;
    assertColdSource(doc, hub);
    hubs.set(doc, hub);
    seenDocuments.add(doc);
    return hub;
};

/** Run inside serializeDoc: durably append before changing or broadcasting the hub. */
async function durableMutation<T>(doc: string, hub: DocHub, apply: () => T): Promise<T> {
    if (hubs.get(doc) !== hub) throw new StorageUncertainError("Document state changed before the operation");
    const current = integrity.get(hub);
    if (!current || current.pending) throw new StorageUncertainError("Document storage state is unavailable");
    try {
        const source = fileIdentity(logPath(doc));
        if (source.dev !== current.dev || source.ino !== current.ino || source.size !== current.size ||
            source.mtimeMs !== current.mtimeMs || source.ctimeMs !== current.ctimeMs) throw new Error("Document log changed before operation");
    } catch (error) {
        invalidateHub(doc, hub);
        throw new StorageUncertainError(`Storage outcome unknown: ${(error as Error).message}`);
    }
    const prepared = prepareDurableMutation(hub, apply);
    if (prepared.status === "done") return prepared.result;
    const path = logPath(doc), data = Buffer.from(`${JSON.stringify(prepared.record)}\n`, "utf8");
    current.pending = true;
    current.revision++;
    try {
        const fd = await openAsync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
        try {
            const before = await fd.stat();
            const named = await statAsync(path);
            if (before.dev !== current.dev || before.ino !== current.ino || before.size !== current.size || before.mtimeMs !== current.mtimeMs || before.ctimeMs !== current.ctimeMs ||
                before.dev !== named.dev || before.ino !== named.ino || before.size !== named.size) throw new Error("Document log changed before append");
            await fd.writeFile(data);
            if (fsyncGateDoc === doc && fsyncGateStage === "before-sync" && !fsyncGateUsed) {
                fsyncGateUsed = true;
                await new Promise<void>(resolve => { fsyncJobs.set(doc, {release: resolve}); });
                fsyncJobs.delete(doc);
            }
            await fd.sync();
            if (fsyncGateDoc === doc && fsyncGateStage === "after-sync" && !fsyncGateUsed) {
                fsyncGateUsed = true;
                await new Promise<void>(resolve => { fsyncJobs.set(doc, {release: resolve}); });
                fsyncJobs.delete(doc);
            }
            const after = await fd.stat(), currentPath = await statAsync(path);
            if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size + data.length ||
                currentPath.dev !== after.dev || currentPath.ino !== after.ino || currentPath.size !== after.size || currentPath.mtimeMs !== after.mtimeMs || currentPath.ctimeMs !== after.ctimeMs) throw new Error("Document log changed during append");
            current.mtimeMs = after.mtimeMs; current.ctimeMs = after.ctimeMs;
        } finally { await fd.close(); }
        if (hubs.get(doc) !== hub || integrity.get(hub) !== current) throw new Error("Document changed while persisting the operation");
        const finalPath = fileIdentity(path);
        if (finalPath.dev !== current.dev || finalPath.ino !== current.ino || finalPath.size !== current.size + data.length ||
            finalPath.mtimeMs !== current.mtimeMs || finalPath.ctimeMs !== current.ctimeMs) throw new Error("Document log changed before commit");
        current.chainDigest = createHash("sha256").update(Buffer.from(current.chainDigest, "hex")).update(data).digest("hex");
        current.size += data.length;
        const result = prepared.commit();
        if ("recoveryPin" in prepared.record) recoveryCounts.set(hub, (recoveryCounts.get(hub) ?? 0) + 1);
        return result;
    } catch (error) {
        invalidateHub(doc, hub);
        throw new StorageUncertainError(`Storage outcome unknown: ${(error as Error).message}`);
    } finally { current.pending = false; }
}

async function replaceTextAsync(path: string, content: string): Promise<FileIdentity> {
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    let created = false;
    try {
        const fd = await openAsync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        let source: {dev: number; ino: number; size: number};
        try {
            await fd.writeFile(content, "utf8"); await fd.sync();
            const stat = await fd.stat(); source = {dev: stat.dev, ino: stat.ino, size: stat.size};
        } finally { await fd.close(); }
        await renameAsync(temporary, path);
        created = false;
        const directory = await openAsync(DATA, "r");
        try { await directory.sync(); } finally { await directory.close(); }
        const installed = fileIdentity(path);
        if (installed.dev !== source.dev || installed.ino !== source.ino || installed.size !== source.size) throw new Error("Reset log changed during publication");
        return installed;
    } finally { if (created) await unlinkAsync(temporary).catch(() => undefined); }
}

/**
 * 앞 판(v2) 로그를 지금 연산으로 바꾼다. v2 는 블록 종류를 CRDT 가 알았고(bullet·numbered·indent), 지금은 데모 스키마가
 * 목록을 list-item + listType·level 로 나타낸다.
 */
type V2Op = {t: string; [key: string]: unknown};

const LIST: Record<string, string> = {bullet: "bullet", numbered: "numbered"};

const upgradeV2 = (change: Change): Change => ({
    ...change,
    ops: (change.ops as unknown as V2Op[]).map(op => {
        if (op.t === "block") {
            const type = String(op.type);
            const attrs: Record<string, unknown> = LIST[type] ? {listType: LIST[type], ...(op.indent ? {level: op.indent} : {})} : {};

            return {t: "node", id: op.id, origin: op.origin, type: LIST[type] ? "list-item" : type, boundary: op.boundary, ...(Object.keys(attrs).length ? {attrs} : {})};
        }

        if (op.t === "attr") {
            const value = op.key === "type" && LIST[String(op.value)] ? "list-item" : op.value;

            return {t: "set", at: op.at, ids: [op.target], key: op.key === "type" ? "$type" : op.key === "indent" ? "level" : op.key, value};
        }

        return op.t === "mark" ? {t: "set", at: op.at, ids: op.ids, key: op.key, value: op.value} : op;
    }) as Change["ops"],
});

let gcTimer: ReturnType<typeof setTimeout> | null = null;

/** 편집·ack 가 잦아들면 GC 를 한 번 시도한다 */
const scheduleGc = (doc: string, hub: DocHub) => {
    gcTimer && clearTimeout(gcTimer);
    gcTimer = setTimeout(() => {
        void serializeDoc(doc, async () => {
            if (hubs.get(doc) !== hub) return;
            await durableMutation(doc, hub, () => hub.gc(AUTO_GC));
        }).catch(error => console.error(`GC storage outcome unknown: ${(error as Error).message}`));
    }, 800);
};

const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((ok, fail) => {
        let body = "";

        req.on("data", chunk => (body += chunk));
        req.on("end", () => ok(body));
        req.on("error", fail);
    });

const send = (res: ServerResponse, status: number, body: string, type = "application/json; charset=utf-8") => {
    res.writeHead(status, {"content-type": type, "cache-control": "no-store"});
    res.end(body);
};

const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".ts": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
};

/** 정적 파일. .ts 는 타입을 벗겨 JS 로 내준다 */
const serveStatic = (res: ServerResponse, urlPath: string) => {
    const pages: Record<string, string> = {"/": "apps/demo/ui/index.html", "/multi": "apps/demo/ui/multi.html", "/pm": "apps/demo/ui/pm.html"};
    const relative = pages[urlPath] ?? urlPath.replace(/^\/+/, "");
    const file = normalize(join(ROOT, relative));
    // 라이브러리·데모 UI·공유 스키마, 그리고 node_modules 의 js·css 만 (ProseMirror 를 import map 으로 바로 읽는다 — 번들러 없음)
    const within = (directory: string) => file.startsWith(join(ROOT, directory) + sep);
    const allowed = within("packages/doc-sync/src") || within("apps/demo/ui") || file === join(ROOT, "fixtures/demo-schema.ts") || (within("node_modules") && /\.(m?js|css)$/.test(file));

    if (!allowed || !existsSync(file)) {
        return send(res, 404, "없음", "text/plain; charset=utf-8");
    }

    const source = readFileSync(file, "utf8");
    const body = extname(file) === ".ts" ? stripTypeScriptTypes(source, {mode: "strip"}) : source;

    send(res, 200, body, TYPES[extname(file)] ?? "application/octet-stream");
};

/** SSE: 첫 인사 + 밀린 변경을 보내고, 이후 이벤트를 흘린다 */
const stream = (doc: string, req: IncomingMessage, res: ServerResponse, hub: DocHub, url: URL) => {
    if (url.searchParams.get("protocol") !== String(PROTOCOL_VERSION)) {
        return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
    }
    const since = Number(url.searchParams.get("since") ?? 0);
    const actor = url.searchParams.get("actor") ?? "";
    const write = (event: ServerEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
    });
    const epoch = url.searchParams.get("epoch") ?? undefined;
    const hello = hub.hello(since, epoch);
    write(hello);
    // 처음 붙는 참여자(since=0)는 스냅숏이 전부를 담고 있다. 다시 이어진 참여자에게만 밀린 변경을 보낸다
    hello.type === "hello" && !hello.snapshot && since > 0 && hub.since(since).forEach(envelope => write({type: "change", envelope}));
    actor && hub.connect(actor, hello.type === "hello" && hello.snapshot ? hub.serverSeq : since);

    const stop = hub.listen(write);
    const active = streams.get(hub) ?? new Set<ServerResponse>();
    active.add(res);
    streams.set(hub, active);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

    req.on("close", () => {
        stop();
        clearInterval(heartbeat);
        active.delete(res);
        if (!active.size && streams.get(hub) === active) streams.delete(hub);

        if (actor) void serializeDoc(doc, () => {
            if (hubs.get(doc) === hub) { hub.disconnect(actor); hub.dropPresence(actor); }
        });
    });
};

/** 서버가 들고 있는 문서 — 토큰까지 (확인·시각화용) */
const state = (hub: DocHub) => ({
    epoch: hub.epoch,
    generation: hub.generation,
    serverSeq: hub.serverSeq,
    schemaVersion: hub.schemaVersion,
    frontier: hub.frontier(),
    lastGc: hub.lastFrontier,
    stable: hub.doc.countStable(hub.frontier(), hub.seqOf),
    peers: hub.peerInfo(),
    model: hub.doc.schema ? hub.doc.toJSON() : null,
    tokens: hub.doc.lines().reduce((n, l) => n + l.items.length, 0),
    tombstones: hub.doc.lines().reduce((n, l) => n + l.items.filter(i => !isAlive(i)).length, 0),
    log: hub.log.slice(-50),
});

const ACTIONS = "stream|changes|conditional|receipt|change-receipt|schema|ack|presence|leave|gc|state|recovery-state|recovery-lease|recover-change|compaction-state|compaction-test-release|receipt-state|receipt-test-release|cold-state|cold-test-release|fsync-state|fsync-test-release|reset-state|reset-test-release|reset";

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(new RegExp(`^/api/docs/([a-z0-9-]{1,40})/(${ACTIONS})$`));

        if (!match) {
            return req.method === "GET" ? serveStatic(res, url.pathname) : send(res, 404, "{}");
        }

        const [, doc, action] = match;
        if (action === "reset-state" || action === "reset-test-release") {
            if (resetGateDoc !== doc) return send(res, 404, "{}");
            const job = resetJobs.get(doc);
            if (action === "reset-state" && req.method === "GET") return send(res, 200, JSON.stringify({phase: job ? "paused" : "idle", waiters: (commandWaiters.get(doc) ?? 0) + (storageReaders.get(doc) ?? 0)}));
            if (action === "reset-test-release" && req.method === "POST" && job) { job.release(); return send(res, 200, "{}"); }
            return send(res, 409, JSON.stringify({error: "No paused reset"}));
        }
        if (action === "fsync-state" || action === "fsync-test-release") {
            if (fsyncGateDoc !== doc) return send(res, 404, "{}");
            const job = fsyncJobs.get(doc);
            if (action === "fsync-state" && req.method === "GET") return send(res, 200, JSON.stringify({phase: job ? "paused" : "idle", waiters: (commandWaiters.get(doc) ?? 0) + (storageReaders.get(doc) ?? 0)}));
            if (action === "fsync-test-release" && req.method === "POST" && job) { job.release(); return send(res, 200, "{}"); }
            return send(res, 409, JSON.stringify({error: "No paused fsync"}));
        }
        if (action === "cold-state" || action === "cold-test-release") {
            if (coldGateDoc !== doc) return send(res, 404, "{}");
            const job = coldLoads.get(doc);
            if (action === "cold-state" && req.method === "GET") return send(res, 200, JSON.stringify({phase: job?.phase ?? "idle", waiters: job?.waiters ?? 0}));
            if (action === "cold-test-release" && req.method === "POST" && job?.phase === "paused" && job.release) {
                job.release(); return send(res, 200, "{}");
            }
            return send(res, 409, JSON.stringify({error: "No paused cold load"}));
        }
        if (action === "receipt-state" || action === "receipt-test-release") {
            if (!receiptTestGateEnabled) return send(res, 404, "{}");
            const job = receiptJobs.get(doc);
            if (action === "receipt-state" && req.method === "GET") return send(res, 200, JSON.stringify({phase: job?.phase ?? "idle", waiters: job?.waiters ?? 0}));
            if (action === "receipt-test-release" && req.method === "POST" && job?.phase === "paused") {
                job.phase = "running"; job.worker.postMessage({continue: true});
                return send(res, 200, "{}");
            }
            return send(res, 409, JSON.stringify({error: "No paused receipt verification"}));
        }
        if (action === "compaction-state" || action === "compaction-test-release") {
            if (!testGateEnabled) return send(res, 404, "{}");
            const job = compactions.get(doc);
            if (action === "compaction-state" && req.method === "GET") return send(res, 200, JSON.stringify({phase: job?.phase ?? "idle"}));
            if (action === "compaction-test-release" && req.method === "POST" && job?.phase === "paused" && job.worker) {
                job.phase = "running";
                job.worker.postMessage({continue: true});
                return send(res, 200, "{}");
            }
            return send(res, 409, JSON.stringify({error: "No paused recovery compaction"}));
        }
        if (action === "change-receipt") {
            if (req.method !== "POST") return send(res, 405, "{}");
            if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
            }
            const payload = JSON.parse(await readBody(req)) as {generation?: unknown; change?: Change};
            const {generation, change} = payload;
            if (typeof generation !== "string" || !change || typeof change.actor !== "string" ||
                !Number.isSafeInteger(change.seq) || change.seq < 1 || !Array.isArray(change.ops)) {
                return send(res, 400, JSON.stringify({error: "Invalid receipt query"}));
            }
            const result = await verifiedReceipt(doc, verified => verified?.findChangeReceipt(generation, change) ?? {status: "unknown"});
            return send(res, 200, JSON.stringify(result));
        }
        if (action === "receipt") {
            if (req.method !== "POST") return send(res, 405, "{}");
            if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
            }
            const payload = JSON.parse(await readBody(req)) as {generation?: unknown; base?: {epoch: string; serverSeq: number; schemaVersion: string | null}; change?: Change};
            const {generation, base, change} = payload;
            if (typeof generation !== "string" || !base || typeof base.epoch !== "string" || !Number.isSafeInteger(base.serverSeq) || base.serverSeq < 0 ||
                !(typeof base.schemaVersion === "string" || base.schemaVersion === null) || !change || typeof change.actor !== "string" ||
                !Number.isSafeInteger(change.seq) || change.seq < 1 || !Array.isArray(change.ops)) {
                return send(res, 400, JSON.stringify({error: "Invalid receipt query"}));
            }
            // This read-only path never opens an editing participant or creates a
            // missing document. Verify a live durable source off-thread first.
            const result = await verifiedReceipt(doc, verified => verified?.findConditionalReceipt(generation, base, change) ?? {status: "unknown"});
            return send(res, 200, JSON.stringify(result));
        }
        const hub = await hubOf(doc);

        if (action === "stream" && req.method === "GET") {
            return await serializeDoc(doc, () => {
                if (hubs.get(doc) !== hub) return send(res, 503, JSON.stringify({code: "storage_unknown", error: "Document state changed"}));
                if (res.destroyed) return;
                return stream(doc, req, res, hub, url);
            });
        }

        if (action === "state" && req.method === "GET") {
            return await serializeDoc(doc, () => hubs.get(doc) === hub ? send(res, 200, JSON.stringify(state(hub))) : send(res, 503, JSON.stringify({code: "storage_unknown"})));
        }

        if (action === "recovery-state" && req.method === "GET") {
            return await serializeDoc(doc, () => hubs.get(doc) === hub ? send(res, 200, JSON.stringify({generation: hub.generation, epoch: hub.epoch, serverSeq: hub.serverSeq, schemaVersion: hub.schemaVersion, reservationEra: hub.recoveryEra})) : send(res, 503, JSON.stringify({code: "storage_unknown"})));
        }

        if (action === "schema" && req.method === "GET") {
            return await serializeDoc(doc, () => hubs.get(doc) === hub ? send(res, 200, JSON.stringify({generation: hub.generation, schemaVersion: hub.schemaVersion, schema: hub.getSchema()})) : send(res, 503, JSON.stringify({code: "storage_unknown"})));
        }

        if (req.method !== "POST") {
            return send(res, 405, "{}");
        }

        const body = await readBody(req);
        if (action === "recovery-lease") {
            if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
            const payload = JSON.parse(body) as {generation?: unknown; actor?: unknown; reservationId?: unknown; pin?: unknown; action?: unknown; requireExisting?: unknown};
            if (typeof payload.generation !== "string" || typeof payload.actor !== "string" || !payload.actor || typeof payload.reservationId !== "string" || !payload.reservationId ||
                (payload.action !== undefined && payload.action !== "release") ||
                (payload.requireExisting !== undefined && typeof payload.requireExisting !== "boolean") ||
                (payload.action !== "release" && payload.pin !== null && (!Number.isSafeInteger(payload.pin) || (payload.pin as number) < 1))) return send(res, 400, JSON.stringify({error: "Invalid recovery reservation"}));
            const {result, operationGeneration} = await serializeDoc(doc, async () => {
                if (hubs.get(doc) !== hub) throw new StorageUncertainError("Document state changed while the request was in flight");
                const operationGeneration = hub.generation;
                const result = await durableMutation(doc, hub, () => payload.action === "release"
                    ? hub.releaseRecovery(payload.generation as string, payload.actor as string, payload.reservationId as string)
                    : hub.reserveRecovery(payload.generation as string, payload.actor as string, payload.reservationId as string, payload.pin as number | null, payload.requireExisting === true));
                return {result, operationGeneration};
            });
            if (result.status === "released" || result.status === "protected") await maybeCompactRecovery(doc, hub);
            return await serializeDoc(doc, () => {
                if (hubs.get(doc) !== hub || hub.generation !== operationGeneration) return send(res, 503, JSON.stringify({code: "storage_unknown", error: "Document changed while compaction was in progress"}));
                if (result.status === "protected" && !hub.hasRecoveryReservation(payload.generation as string, payload.actor as string, payload.reservationId as string)) {
                    return send(res, 503, JSON.stringify({code: "storage_unknown", error: "Recovery reservation changed before confirmation"}));
                }
                if (payload.action === "release" && result.status === "released") scheduleGc(doc, hub);
                return send(res, 200, JSON.stringify(result));
            });
        }
        return await serializeDoc(doc, async () => {
        // Another in-flight request may have invalidated this instance after an
        // uncertain storage write. Never mutate the captured stale hub.
        if (hubs.get(doc) !== hub) return send(res, 503, JSON.stringify({code: "storage_unknown", error: "Document state changed while the request was in flight"}));

        if (["changes", "ack", "presence", "leave"].includes(action)) {
            const epoch = action === "leave" ? url.searchParams.get("epoch") ?? req.headers["x-doc-sync-epoch"] : req.headers["x-doc-sync-epoch"];
            if (epoch !== hub.epoch) return send(res, 409, JSON.stringify({error: "Document epoch changed", epoch: hub.epoch}));
        }

        switch (action) {
            case "recover-change": {
                if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                    return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
                }
                const payload = JSON.parse(body) as {generation?: unknown; reservationId?: unknown; schemaVersion?: unknown; change?: Change};
                const {generation, reservationId, schemaVersion: version, change} = payload;
                if (typeof generation !== "string" || typeof reservationId !== "string" || !reservationId ||
                    !(typeof version === "string" || version === null) || !change || typeof change.actor !== "string" || !change.actor ||
                    !Number.isSafeInteger(change.seq) || change.seq < 1 || !Array.isArray(change.ops)) {
                    return send(res, 400, JSON.stringify({error: "Invalid recovery change"}));
                }
                try {
                    const result = await durableMutation(doc, hub, () => hub.submitRecovery(generation, reservationId, version, change));
                    if (result.status === "accepted") scheduleGc(doc, hub);
                    return send(res, 200, JSON.stringify(result));
                } catch (error) {
                    if (error instanceof StorageUncertainError || error instanceof PostPersistUncertainError) return send(res, 503, JSON.stringify({code: "storage_unknown", error: error.message}));
                    return send(res, 409, JSON.stringify({code: "invalid", error: (error as Error).message}));
                }
            }
            case "changes": {
                if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                    return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
                }
                if (hub.schemaVersion !== null && req.headers["x-doc-sync-schema"] !== hub.schemaVersion) {
                    return send(res, 409, JSON.stringify({code: "schema", error: "Document schema changed", schemaVersion: hub.schemaVersion}));
                }
                try {
                    const change = JSON.parse(body) as Change;
                    const envelope = await durableMutation(doc, hub, () => hub.submit(change));

                    scheduleGc(doc, hub);

                    return send(res, 200, JSON.stringify({serverSeq: envelope?.serverSeq ?? null}));
                } catch (error) {
                    if (error instanceof StorageUncertainError || error instanceof PostPersistUncertainError) return send(res, 503, JSON.stringify({code: "storage_unknown", error: error.message}));
                    return send(res, 409, JSON.stringify({error: (error as Error).message}));
                }
            }
            case "conditional": {
                if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                    return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
                }
                const payload = JSON.parse(body) as {base?: {epoch: string; serverSeq: number; schemaVersion: string | null}; change?: Change};
                const {base, change} = payload;
                if (!base || typeof base.epoch !== "string" || !Number.isSafeInteger(base.serverSeq) || base.serverSeq < 0 ||
                    !(typeof base.schemaVersion === "string" || base.schemaVersion === null) || !change || typeof change.actor !== "string" ||
                    !Number.isSafeInteger(change.seq) || change.seq < 1 || !Array.isArray(change.ops)) {
                    return send(res, 400, JSON.stringify({error: "Invalid conditional change"}));
                }
                try {
                    // The hub validates the body base atomically and resolves an exact
                    // retry first, even if its old transport headers are now stale.
                    const envelope = await durableMutation(doc, hub, () => hub.submitConditional(change, base));
                    scheduleGc(doc, hub);
                    return send(res, 200, JSON.stringify({status: "accepted", serverSeq: envelope.serverSeq}));
                } catch (error) {
                    if (error instanceof StorageUncertainError || error instanceof PostPersistUncertainError) return send(res, 503, JSON.stringify({code: "storage_unknown", error: error.message}));
                    const message = (error as Error).message;
                    const codes: Record<string, string> = {conditional_stale: "stale", conditional_conflict: "conflict", conditional_epoch: "epoch", conditional_schema: "schema"};
                    return send(res, 409, JSON.stringify({code: codes[message] ?? "invalid", error: message}));
                }
            }
            case "schema": {
                if (req.headers["x-doc-sync-protocol"] !== String(PROTOCOL_VERSION)) {
                    return send(res, 426, JSON.stringify({error: "Unsupported doc-sync protocol", protocol: PROTOCOL_VERSION}));
                }
                const payload = JSON.parse(body) as {base?: {epoch: string; serverSeq: number; schemaVersion: string}; schema?: Schema};
                const {base, schema} = payload;
                if (!base || typeof base.epoch !== "string" || !Number.isSafeInteger(base.serverSeq) || base.serverSeq < 0 || typeof base.schemaVersion !== "string" || !schema) {
                    return send(res, 400, JSON.stringify({error: "Invalid schema transition"}));
                }
                if (req.headers["x-doc-sync-epoch"] !== base.epoch || req.headers["x-doc-sync-schema"] !== base.schemaVersion) {
                    return send(res, 400, JSON.stringify({error: "Transition headers do not match base"}));
                }
                try {
                    const version = await durableMutation(doc, hub, () => hub.transitionSchema(schema, base));
                    return send(res, 200, JSON.stringify({schemaVersion: version}));
                } catch (error) {
                    if (error instanceof StorageUncertainError) return send(res, 503, JSON.stringify({code: "storage_unknown", error: error.message}));
                    return send(res, 409, JSON.stringify({code: "schema", error: (error as Error).message}));
                }
            }
            case "ack":
                hub.ack(JSON.parse(body) as Ack);
                scheduleGc(doc, hub);

                return send(res, 200, "{}");
            case "presence":
                hub.setPresence(JSON.parse(body) as Presence);

                return send(res, 200, "{}");
            case "leave":
                hub.leave((JSON.parse(body) as {actor: string}).actor);

                return send(res, 200, "{}");
            case "gc": {
                const envelope = await durableMutation(doc, hub, () => hub.gc());

                return send(res, 200, JSON.stringify({gc: envelope?.gc ?? null, ...state(hub), log: undefined}));
            }
            default:
                // reset
                {
                    const nextGeneration = crypto.randomUUID();
                    const initial = process.env.NO_SCHEMA ? null : schemaVersion(documentSchema);
                    const records: unknown[] = [{format: "doc-sync-log-v1", generation: nextGeneration, initialSchemaVersion: initial} satisfies GenerationHeader];
                    // Reset removes operations, but retains the active schema.
                    if (initial && hub.schemaVersion !== initial) {
                        const schema = hub.getSchema();
                        if (schema) records.push({schema: {from: initial, to: hub.schemaVersion, schema}});
                    }
                    const resetContent = records.map(record => JSON.stringify(record)).join("\n") + "\n";
                    const current = integrity.get(hub);
                    if (!current || current.pending) throw new StorageUncertainError("Document storage state is unavailable");
                    current.pending = true; current.revision++;
                    try {
                        const published = await replaceTextAsync(logPath(doc), resetContent);
                        if (resetGateDoc === doc && !resetGateUsed) {
                            resetGateUsed = true;
                            await new Promise<void>(resolve => { resetJobs.set(doc, {release: resolve}); });
                            resetJobs.delete(doc);
                        }
                        if (JSON.stringify(fileIdentity(logPath(doc))) !== JSON.stringify(published)) throw new Error("Reset log changed before installation");
                        hub.reset(nextGeneration);
                        integrity.set(hub, startIntegrity(resetContent, published));
                        recoveryCounts.set(hub, 0);
                    } catch (error) {
                        invalidateHub(doc, hub);
                        throw new StorageUncertainError(`Reset storage outcome unknown: ${(error as Error).message}`);
                    } finally { current.pending = false; }
                }

                return send(res, 200, "{}");
        }
        });
    } catch (error) {
        send(res, error instanceof StorageUncertainError ? 503 : 500, JSON.stringify({...(error instanceof StorageUncertainError ? {code: "storage_unknown"} : {}), error: (error as Error).message}));
    }
});

mkdirSync(DATA, {recursive: true});
server.listen(PORT, () => {
    const address = server.address();

    console.log(`doc-sync 서버 http://localhost:${typeof address === "object" && address ? address.port : PORT}`);
});
