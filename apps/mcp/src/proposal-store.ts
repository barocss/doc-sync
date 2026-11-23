import {constants} from "node:fs";
import {lstat, mkdir, open, readdir, realpath, rename, unlink} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {openWriterLock} from "./kernel-lock.ts";
import {digest, MAX_PROPOSAL_BYTES, parseProposalRecord, proposalId, type ProposalImmutable, type ProposalOwner, type ProposalRecord} from "./proposal-schema.ts";
export class ProposalConflict extends Error {}
export class ProposalQuota extends Error {}
async function privateDirectory(path: string) {
    await mkdir(path, {recursive: true, mode: 0o700}); const s = await lstat(path);
    if (!s.isDirectory() || s.isSymbolicLink() || s.mode & 0o077 || process.getuid && s.uid !== process.getuid()) throw new Error("Proposal directory must be private and owned");
    return realpath(path);
}
/** One permanent kernel-lock inode serializes each bounded route/principal store transaction. */
export class ProposalStore {
    private queue: Promise<void> = Promise.resolve();
    private closing = false;
    private closed = false;
    private closePromise?: Promise<void>;
    private serial<T>(operation: () => Promise<T>): Promise<T> {
        if (this.closing || this.closed) return Promise.reject(new Error("Proposal store is closed"));
        const result = this.queue.then(operation); this.queue = result.then(() => undefined, () => undefined); return result;
    }
    readonly directory: string; readonly owner: ProposalOwner; private lock: Awaited<ReturnType<typeof open>>;
    private constructor(directory: string, owner: ProposalOwner, lock: Awaited<ReturnType<typeof open>>) { this.directory = directory; this.owner = owner; this.lock = lock; }
    static async open(dataDir: string, owner: ProposalOwner) {
        const root = await privateDirectory(dataDir), parent = await privateDirectory(join(root, "proposals"));
        const directory = await privateDirectory(join(parent, digest([owner.routeKey, owner.principal])));
        const lock = await openWriterLock(join(directory, "writer.lock"));
        try { const s = await lock.stat(); if (process.getuid && s.uid !== process.getuid()) throw new Error("Foreign lock owner"); return new ProposalStore(directory, owner, lock); }
        catch (error) { await lock.close(); throw error; }
    }
    close(): Promise<void> { if (this.closePromise) return this.closePromise; this.closing = true; this.closePromise = (async () => { await this.queue; await this.lock.close(); this.closed = true; })(); return this.closePromise; }
    get(id: string) { return this.serial(() => this.load(id)); }
    list() { return this.serial(() => this.loadAll()); }
    create(payload: ProposalImmutable) { return this.serial(() => this.createRecord(payload)); }
    reject(id: string, requestId: string, proposalDigest: string, grantId: string) { return this.serial(() => this.rejectRecord(id, requestId, proposalDigest, grantId)); }
    private async load(id: string): Promise<ProposalRecord | null> {
        if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid proposal ID");
        let file: Awaited<ReturnType<typeof open>>;
        try { file = await open(join(this.directory, `${id}.json`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
        let raw: string;
        try { const s = await file.stat(); if (!s.isFile() || s.nlink !== 1 || s.mode & 0o077 || s.size > MAX_PROPOSAL_BYTES || process.getuid && s.uid !== process.getuid()) throw new Error("Invalid proposal file; original preserved"); const buffer = Buffer.alloc(MAX_PROPOSAL_BYTES + 1); let length = 0;
            while (length < buffer.length) { const read = await file.read(buffer, length, buffer.length - length, null); if (!read.bytesRead) break; length += read.bytesRead; }
            if (length > MAX_PROPOSAL_BYTES) throw new Error("Proposal exceeds byte limit; original preserved"); raw = buffer.subarray(0, length).toString("utf8"); }
        finally { await file.close(); }
        const record = parseProposalRecord(JSON.parse(raw), this.owner);
        if (record.payload.id !== id) throw new Error("Foreign proposal file; original preserved");
        return record;
    }
    private async loadAll() {
        const names = await readdir(this.directory);
        if (names.length > 260) throw new ProposalQuota("Proposal storage quota reached");
        const ids = names.filter(n => /^[a-f0-9]{64}\.json$/.test(n)).sort();
        const records: ProposalRecord[] = [];
        for (const name of ids) { const record = await this.load(name.slice(0, -5)); if (record) records.push(record); }
        return records;
    }
    private async save(record: ProposalRecord) {
        parseProposalRecord(record, this.owner);
        const raw = JSON.stringify(record) + "\n"; if (Buffer.byteLength(raw) > MAX_PROPOSAL_BYTES) throw new ProposalQuota("Record too large");
        const path = join(this.directory, `${record.payload.id}.json`), temporary = `${path}.tmp-${randomUUID()}`;
        let file: Awaited<ReturnType<typeof open>> | undefined;
        try { file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); await file.writeFile(raw); await file.sync(); await file.close(); file = undefined;
            await rename(temporary, path); const directory = await open(this.directory, constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
        } catch (error) { await file?.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); throw error; }
        return (await this.load(record.payload.id))!;
    }
    private async createRecord(payload: ProposalImmutable) {
        if (payload.id !== proposalId(this.owner, payload.request.requestId)) throw new Error("Foreign proposal");
        const existing = await this.load(payload.id);
        if (existing) { if (existing.proposalDigest !== digest(payload)) throw new ProposalConflict("Create UUID has different content"); return existing; }
        const records = await this.loadAll();
        if (records.length >= 256 || records.filter(r => r.status === "pending").length >= 128) throw new ProposalQuota("Proposal quota reached");
        if (payload.request.supersedes && !await this.load(payload.request.supersedes)) throw new ProposalConflict("Missing previous proposal");
        const partial = {payload, proposalDigest: digest(payload), status: "pending" as const, stateVersion: 1};
        return this.save({...partial, recordDigest: digest(partial)});
    }
    private async rejectRecord(id: string, requestId: string, proposalDigest: string, grantId: string) {
        const record = await this.load(id); if (!record) return null;
        if (record.proposalDigest !== proposalDigest) throw new ProposalConflict("Proposal digest differs");
        if (record.status !== "pending") { if (record.decision?.requestId === requestId && record.decision.grantId === grantId) return record; throw new ProposalConflict("Proposal is terminal"); }
        const {recordDigest: _, ...rest} = record;
        const partial = {...rest, status: "rejected" as const, stateVersion: 2, decision: {kind: "reject" as const, requestId, principal: this.owner.principal, grantId, proposalDigest}};
        return this.save({...partial, recordDigest: digest(partial)});
    }
}
