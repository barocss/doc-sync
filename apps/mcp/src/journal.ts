import {createHash, randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {mkdir, open, realpath, rename, unlink} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import type {EditOp, Schema, Snapshot} from "@barocss/doc-sync";
import type {Change} from "@barocss/doc-sync/sync";
import {SyncClient} from "@barocss/doc-sync/sync";
import type {ClientCheckpoint, Transport} from "@barocss/doc-sync/sync";

export type RecoveryCheckpoint = {
    format: 1; document: string; actor: string; generation: string; epoch: string;
    reservationId: string; reservationConfirmed: boolean; sourceIntentDigest: string | null;
    schema: Schema; client: ClientCheckpoint; recordDigest: string;
    /** The local history was durably discarded; release must finish before reconnect. */
    releasePending?: true;
};

/**
 * A crash-recovery record is evidence only: it is not an undo checkpoint and
 * does not authorize replay. The caller must inspect the server receipt first.
 */
export type JournalBase = {epoch: string; serverSeq: number; schemaVersion: string | null};
export type PreparedIntent = {
    generation: string;
    base: JournalBase;
    change: Change;
    edits: EditOp[];
    snapshot: Snapshot;
    schema: Schema;
};
export type JournalRecord = PreparedIntent & {
    format: 1;
    state: "may_have_been_sent";
    document: string;
    actor: string;
    requestDigest: string;
    recordDigest: string;
};

const MAX_BYTES = 16 * 1024 * 1024;
// Darwin's O_EXLOCK is acquired by open(2) and is released by the kernel on
// process exit, including SIGKILL. Keep this inode and descriptor for the
// lifetime of the session; do not unlink or rename the lock file.
const DARWIN_O_EXLOCK = 0x20;
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function assertPlainJson(value: unknown, active = new Set<object>(), depth = 0): void {
    if (depth > 128) throw new Error("Journal data exceeds maximum depth");
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || active.has(value)) throw new Error("Journal data must be finite acyclic JSON");
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error("Journal data must use plain objects and arrays");
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== "string")) throw new Error("Journal data must not contain symbols");
    if (array && (keys.length !== (value as unknown[]).length + 1 || !keys.includes("length"))) throw new Error("Journal arrays must be dense");
    active.add(value);
    try {
        for (const key of keys) {
            if (array && key === "length") continue;
            const property = Object.getOwnPropertyDescriptor(value, key)!;
            if (!("value" in property) || !property.enumerable) throw new Error("Journal properties must be plain values");
            assertPlainJson(property.value, active, depth + 1);
        }
    } finally { active.delete(value); }
}

function validateIntent(input: PreparedIntent, actor: string): void {
    assertPlainJson(input);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["base", "change", "edits", "generation", "schema", "snapshot"])) throw new Error("Invalid journal intent fields");
    if (typeof input.generation !== "string" || !input.generation || input.generation.length > 256) throw new Error("Invalid document generation");
    const base = input.base, change = input.change;
    if (!base || typeof base.epoch !== "string" || !base.epoch || !Number.isSafeInteger(base.serverSeq) || base.serverSeq < 0 ||
        !(typeof base.schemaVersion === "string" || base.schemaVersion === null) ||
        JSON.stringify(Object.keys(base).sort()) !== JSON.stringify(["epoch", "schemaVersion", "serverSeq"])) throw new Error("Invalid journal base");
    if (!change || change.actor !== actor || !Number.isSafeInteger(change.seq) || change.seq < 1 || !Array.isArray(change.ops) || !Array.isArray(input.edits) ||
        JSON.stringify(Object.keys(change).sort()) !== JSON.stringify(["actor", "ops", "seq"])) throw new Error("Invalid journal change");
    const version = schemaVersion(input.schema);
    if (base.schemaVersion !== null && version !== base.schemaVersion) throw new Error("Journal schema does not match its base");
    const draft = Doc.fromSnapshot(actor, input.snapshot, input.schema);
    const result = draft.edit(input.edits);
    if (JSON.stringify(result.ops) !== JSON.stringify(change.ops)) throw new Error("Journal edits do not reproduce the exact change");
}

function requestDigest(intent: PreparedIntent): string {
    return digest({generation: intent.generation, base: intent.base, change: intent.change});
}

function recordWithoutDigest(record: JournalRecord): Omit<JournalRecord, "recordDigest"> {
    const {recordDigest: _ignored, ...rest} = record;
    return rest;
}

/** Exclusive, same-directory, durable journal for one document and actor. */
export class IntentJournal {
    readonly path: string;
    readonly document: string;
    readonly actor: string;
    private readonly lock: Awaited<ReturnType<typeof open>>;
    private closed = false;
    private closing = false;
    private closePromise: Promise<void> | null = null;
    private queue: Promise<void> = Promise.resolve();

    private constructor(path: string, document: string, actor: string, lock: Awaited<ReturnType<typeof open>>) {
        this.path = path; this.document = document; this.actor = actor; this.lock = lock;
    }

    /** macOS only until another platform has a verified kernel lock implementation. */
    static async open(path: string, options: {document: string; actor?: string}): Promise<IntentJournal> {
        if (process.platform !== "darwin") throw new Error("Durable journals require a supported kernel file lock; this platform is not supported");
        if (typeof path !== "string" || !path || path.includes("\0")) throw new Error("Invalid journal path");
        if (!/^[a-z0-9-]{1,40}$/.test(options.document)) throw new Error("Invalid document ID");
        if (options.actor !== undefined && !/^[\w~-]{1,256}$/.test(options.actor)) throw new Error("Invalid actor ID");
        const absolute = resolve(path), name = basename(absolute);
        if (name === "." || name === ".." || !name) throw new Error("Invalid journal filename");
        await mkdir(dirname(absolute), {recursive: true, mode: 0o700});
        const directory = await realpath(dirname(absolute));
        const canonicalPath = join(directory, name);
        let lock: Awaited<ReturnType<typeof open>>;
        try {
            lock = await open(`${canonicalPath}.lock`, constants.O_CREAT | constants.O_RDWR | constants.O_NONBLOCK | constants.O_NOFOLLOW | DARWIN_O_EXLOCK, 0o600);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "EAGAIN" || code === "EWOULDBLOCK") throw new Error("Journal already has an active writer");
            throw error;
        }
        try {
            const lockStat = await lock.stat();
            if (!lockStat.isFile() || lockStat.nlink !== 1 || (lockStat.mode & 0o077) !== 0) throw new Error("Journal lock must be a private regular file");
            const initial = new IntentJournal(canonicalPath, options.document, options.actor ?? "", lock);
            const record = await initial.load();
            const checkpoint = await initial.loadCheckpoint();
            if (record && checkpoint && record.actor !== checkpoint.actor) throw new Error("Journal and checkpoint actors differ");
            if ((record || checkpoint) && options.actor && (record?.actor ?? checkpoint?.actor) !== options.actor) throw new Error("Journal actor differs from the requested actor");
            const actor = record?.actor ?? checkpoint?.actor ?? options.actor ?? `ai-${randomUUID()}`;
            return new IntentJournal(canonicalPath, options.document, actor, lock);
        } catch (error) { await lock.close(); throw error; }
    }

    private ensureOpen(): void { if (this.closed) throw new Error("Journal is closed"); }

    private async syncDirectory(): Promise<void> {
        const directory = await open(dirname(this.path), constants.O_RDONLY);
        try { await directory.sync(); } finally { await directory.close(); }
    }

    private async load(): Promise<JournalRecord | null> {
        let file: Awaited<ReturnType<typeof open>>;
        try { file = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
        let raw: string;
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES || (stat.mode & 0o077) !== 0) throw new Error("Journal must be a bounded private regular file");
            raw = await file.readFile("utf8");
        } finally { await file.close(); }
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { throw new Error("Journal is corrupt; original file was preserved"); }
        assertPlainJson(parsed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid journal record; original file was preserved");
        const record = parsed as JournalRecord;
        const keys = ["format", "state", "document", "actor", "generation", "base", "change", "edits", "snapshot", "schema", "requestDigest", "recordDigest"].sort();
        if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(keys) || record.format !== 1 || record.state !== "may_have_been_sent" ||
            record.document !== this.document || typeof record.actor !== "string" || !/^[\w~-]{1,256}$/.test(record.actor) ||
            typeof record.requestDigest !== "string" || typeof record.recordDigest !== "string" ||
            digest(recordWithoutDigest(record)) !== record.recordDigest || requestDigest(record) !== record.requestDigest) {
            throw new Error("Invalid journal record or digest; original file was preserved");
        }
        validateIntent({generation: record.generation, base: record.base, change: record.change, edits: record.edits, snapshot: record.snapshot, schema: record.schema}, record.actor);
        return record;
    }

    async read(): Promise<JournalRecord | null> {
        this.ensureOpen();
        const record = await this.load();
        if (record && record.actor !== this.actor) throw new Error("Journal actor changed; original file was preserved");
        return record;
    }

    private async loadCheckpoint(): Promise<RecoveryCheckpoint | null> {
        let file: Awaited<ReturnType<typeof open>>;
        try { file = await open(`${this.path}.checkpoint`, constants.O_RDONLY | constants.O_NOFOLLOW); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
        let raw: string;
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES || (stat.mode & 0o077) !== 0) throw new Error("Checkpoint must be a bounded private regular file");
            raw = await file.readFile("utf8");
        } finally { await file.close(); }
        let input: unknown;
        try { input = JSON.parse(raw); } catch { throw new Error("Checkpoint is corrupt; original file was preserved"); }
        assertPlainJson(input);
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid checkpoint; original file was preserved");
        const record = input as RecoveryCheckpoint;
        const {recordDigest, ...rest} = record;
        const expectedKeys = ["actor", "client", "document", "epoch", "format", "generation", "recordDigest", "reservationConfirmed", "reservationId", "schema", "sourceIntentDigest", ...(Object.hasOwn(record, "releasePending") ? ["releasePending"] : [])].sort();
        if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys) ||
            record.format !== 1 || record.document !== this.document || typeof record.actor !== "string" || !/^[\w~-]{1,256}$/.test(record.actor) ||
            typeof record.generation !== "string" || !record.generation || record.generation.length > 256 || typeof record.epoch !== "string" || !record.epoch ||
            typeof record.reservationId !== "string" || !/^[\w~-]{1,256}$/.test(record.reservationId) || typeof record.reservationConfirmed !== "boolean" || !(record.sourceIntentDigest === null || /^[a-f0-9]{64}$/.test(record.sourceIntentDigest)) ||
            (Object.hasOwn(record, "releasePending") && record.releasePending !== true) ||
            typeof recordDigest !== "string" || digest(rest) !== recordDigest) throw new Error("Invalid checkpoint or digest; original file was preserved");
        const inertTransport: Transport = {subscribe: () => () => undefined, send: async () => undefined, sendPresence: () => undefined};
        const client = new SyncClient(record.actor, inertTransport, {schema: record.schema});
        client.restoreCheckpoint(record.client, record.epoch);
        if (record.releasePending && (!record.reservationConfirmed || record.sourceIntentDigest !== null || record.client.pending.length || client.history.canUndo || client.history.canRedo)) {
            throw new Error("Invalid release checkpoint; original file was preserved");
        }
        return record;
    }

    async readCheckpoint(): Promise<RecoveryCheckpoint | null> {
        this.ensureOpen();
        const record = await this.loadCheckpoint();
        if (record && record.actor !== this.actor) throw new Error("Checkpoint actor changed; original file was preserved");
        return record;
    }

    /** Save a single replica/history checkpoint; the caller must prove server protection separately. */
    async writeCheckpoint(input: Omit<RecoveryCheckpoint, "format" | "document" | "actor" | "recordDigest">): Promise<RecoveryCheckpoint> {
        if (this.closing) throw new Error("Journal is closing");
        return this.serial(async () => {
            this.ensureOpen();
            assertPlainJson(input);
            const expectedKeys = ["client", "epoch", "generation", "reservationConfirmed", "reservationId", "schema", "sourceIntentDigest", ...(input && Object.hasOwn(input, "releasePending") ? ["releasePending"] : [])].sort();
            if (!input || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(expectedKeys) ||
                typeof input.generation !== "string" || !input.generation || input.generation.length > 256 || typeof input.epoch !== "string" || !input.epoch ||
                typeof input.reservationId !== "string" || !/^[\w~-]{1,256}$/.test(input.reservationId) || typeof input.reservationConfirmed !== "boolean" || !(input.sourceIntentDigest === null || /^[a-f0-9]{64}$/.test(input.sourceIntentDigest)) ||
                (Object.hasOwn(input, "releasePending") && input.releasePending !== true)) {
                throw new Error("Invalid checkpoint input");
            }
            const inertTransport: Transport = {subscribe: () => () => undefined, send: async () => undefined, sendPresence: () => undefined};
            const client = new SyncClient(this.actor, inertTransport, {schema: input.schema});
            client.restoreCheckpoint(input.client, input.epoch);
            if (input.releasePending && (!input.reservationConfirmed || input.sourceIntentDigest !== null || input.client.pending.length || client.history.canUndo || client.history.canRedo)) throw new Error("Invalid release checkpoint input");
            const partial = {format: 1 as const, document: this.document, actor: this.actor, ...structuredClone(input)};
            const record: RecoveryCheckpoint = {...partial, recordDigest: digest(partial)};
            const data = `${JSON.stringify(record)}\n`;
            if (Buffer.byteLength(data) > MAX_BYTES) throw new Error("Checkpoint exceeds the maximum size");
            // Refuse to overwrite an unreadable or foreign checkpoint.
            await this.readCheckpoint();
            const temporary = `${this.path}.checkpoint.tmp-${randomUUID()}`;
            let file: Awaited<ReturnType<typeof open>> | null = null;
            try {
                file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
                await file.writeFile(data, "utf8"); await file.sync(); await file.close(); file = null;
                await rename(temporary, `${this.path}.checkpoint`); await this.syncDirectory();
            } catch (error) {
                if (file) await file.close().catch(() => undefined);
                await unlink(temporary).catch(() => undefined);
                throw error;
            }
            const checked = await this.readCheckpoint();
            if (!checked || checked.recordDigest !== record.recordDigest) throw new Error("Checkpoint verification failed; file was preserved");
            return checked;
        });
    }

    private serial<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.queue.then(operation);
        this.queue = result.then(() => undefined, () => undefined);
        return result;
    }

    /** Persist before calling the sender. Never replace a different pending intent. */
    async prepare(intent: PreparedIntent): Promise<JournalRecord> {
        if (this.closing) throw new Error("Journal is closing");
        return this.serial(() => this.writePrepared(intent));
    }

    private async writePrepared(intent: PreparedIntent): Promise<JournalRecord> {
        this.ensureOpen();
        validateIntent(intent, this.actor);
        const owned = structuredClone(intent);
        const partial = {format: 1 as const, state: "may_have_been_sent" as const, document: this.document, actor: this.actor,
            ...owned, requestDigest: requestDigest(owned)};
        const record: JournalRecord = {...partial, recordDigest: digest(partial)};
        const data = `${JSON.stringify(record)}\n`;
        if (Buffer.byteLength(data) > MAX_BYTES) throw new Error("Journal record exceeds the maximum size");
        const pending = await this.read();
        if (pending) {
            if (pending.recordDigest !== record.recordDigest) throw new Error("An unresolved journal record already exists");
            // A previous rename may have succeeded even though syncing its
            // directory failed. Do not allow a send until both the existing
            // file and its directory have been synced successfully.
            const existing = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                const stat = await existing.stat();
                if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES || (stat.mode & 0o077) !== 0) throw new Error("Journal must be a bounded private regular file");
                await existing.sync();
            } finally { await existing.close(); }
            await this.syncDirectory();
            const checked = await this.read();
            if (!checked || checked.recordDigest !== record.recordDigest) throw new Error("Journal verification failed; original file was preserved");
            return checked;
        }
        const temporary = `${this.path}.tmp-${randomUUID()}`;
        let file: Awaited<ReturnType<typeof open>> | null = null;
        try {
            file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
            await file.writeFile(data, "utf8");
            await file.sync();
            await file.close(); file = null;
            await rename(temporary, this.path);
            await this.syncDirectory();
        } catch (error) {
            if (file) await file.close().catch(() => undefined);
            // Only this attempt's random temporary file may be removed.
            await unlink(temporary).catch(() => undefined);
            throw error;
        }
        const checked = await this.read();
        if (!checked || checked.recordDigest !== record.recordDigest) throw new Error("Journal verification failed; original file was preserved");
        return checked;
    }

    /** Call only after authoritative confirmation and reconciliation. */
    async clearAfterConfirmed(expectedRecordDigest: string): Promise<void> {
        if (this.closing) throw new Error("Journal is closing");
        return this.serial(() => this.removeConfirmed(expectedRecordDigest));
    }

    private async removeConfirmed(expectedRecordDigest: string): Promise<void> {
        this.ensureOpen();
        const record = await this.read();
        if (!record || record.recordDigest !== expectedRecordDigest) throw new Error("Journal record changed; refusing to remove it");
        await unlink(this.path);
        await this.syncDirectory();
    }

    async close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closing = true;
        this.closePromise = (async () => {
            await this.queue;
            this.closed = true;
            await this.lock.close();
        })();
        return this.closePromise;
    }
}
