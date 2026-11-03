import {readStoredProposalEvidence, readNotAppliedPlan} from "./proposal-evidence.ts";
import {constants} from "node:fs";
import {lstat, mkdir, open, readdir, realpath, rename, unlink} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {openWriterLock} from "./kernel-lock.ts";
import {ACCEPTANCE_POLICY_FINGERPRINT, digest, MAX_PROPOSAL_BYTES, parseProposalRecord, proposalId, type ProposalImmutable, type ProposalOwner, type ProposalRecord, type ProposalReceipt} from "./proposal-schema.ts";

const PROPOSAL_RECONCILIATION_STATUSES = Object.freeze(["applied", "stale", "not_applied"]);
const FINAL_PROPOSAL_STATUSES = Object.freeze(["rejected", "applied", "stale", "not_applied"]);

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
    /** Approval is durable before the caller may prepare or send an intent. */
    beginAccept(id: string, requestId: string, proposalDigest: string, grantId: string) {
        return this.serial(async () => {
            const record = await this.load(id); if (!record) return null;
            if (record.proposalDigest !== proposalDigest) throw new ProposalConflict("Proposal digest differs");
            if (record.status !== "pending") {
                if (record.decision?.kind === "accept" && record.decision.requestId === requestId && record.decision.grantId === grantId) return this.confirmDurable(record);
                throw new ProposalConflict("Proposal already has a different decision");
            }
            const previous = (await this.loadAll()).find(r => r.decision?.requestId === requestId);
            if (previous) throw new ProposalConflict("Decision UUID already belongs to another proposal");
            const {recordDigest: _, ...rest} = record;
            const partial = {...rest, status: "applying" as const, stateVersion: 2,
                decision: {kind: "accept" as const, requestId, principal: this.owner.principal, grantId, proposalDigest, approvalPolicyFingerprint: ACCEPTANCE_POLICY_FINGERPRINT}, attempt: {id: requestId}};
            return this.save({...partial, recordDigest: digest(partial)});
        });
    }
    recordPreparedEvidenceDigest(id: string, requestId: string, evidenceDigest: string) {
        return this.serial(() => this.transition(id, requestId, undefined, evidenceDigest));
    }
    markApplied(id: string, requestId: string, receipt: ProposalReceipt) { return this.serial(() => this.transition(id, requestId, "applied", undefined, receipt)); }
    markUnconfirmed(id: string, requestId: string) { return this.serial(() => this.transition(id, requestId, "unconfirmed")); }
    markNeedsAttention(id: string, requestId: string) { return this.serial(() => this.transition(id, requestId, "needs_attention")); }
    recordNotAppliedPlan(id: string, requestId: string, planDigest: string) {
        return this.serial(async () => {
            const record = await this.load(id);
            if (!record || record.attempt?.id !== requestId || !record.attempt.evidenceDigest || record.attempt.receipt || PROPOSAL_RECONCILIATION_STATUSES.includes(record.status)) throw new ProposalConflict("No active prepared attempt");
            const plan = await readNotAppliedPlan(this.directory, record);
            if (!plan || plan.planDigest !== planDigest || record.attempt.notAppliedPlanDigest && record.attempt.notAppliedPlanDigest !== planDigest) throw new ProposalConflict("Negative settlement plan differs");
            if (record.attempt.notAppliedPlanDigest) return this.confirmDurable(record);
            const {recordDigest: _, ...rest} = record;
            const partial = {...rest, stateVersion: record.stateVersion + 1, attempt: {...record.attempt, notAppliedPlanDigest: planDigest}};
            return this.save({...partial, recordDigest: digest(partial)});
        });
    }
    markNotApplied(id: string, requestId: string) { return this.serial(() => this.transition(id, requestId, "not_applied")); }
    markStale(id: string, requestId: string) { return this.serial(() => this.transition(id, requestId, "stale")); }
    private async transition(id: string, requestId: string, status?: ProposalRecord["status"], evidenceDigest?: string, receipt?: ProposalReceipt) {
        const record = await this.load(id);
        if (!record || record.decision?.kind !== "accept" || record.attempt?.id !== requestId) throw new ProposalConflict("Approval attempt differs");
        if (evidenceDigest && record.attempt.evidenceDigest && evidenceDigest !== record.attempt.evidenceDigest) throw new ProposalConflict("Prepared evidence differs");
        if (record.status === "applied" || record.status === "stale" || record.status === "not_applied") {
            if ((!status || status === record.status) && (!evidenceDigest || evidenceDigest === record.attempt.evidenceDigest) && (!receipt || digest(receipt) === digest(record.attempt.receipt))) return this.confirmDurable(record);
            throw new ProposalConflict("Proposal is terminal");
        }
        if (evidenceDigest || status === "applied") {
            const bridge = await readStoredProposalEvidence(this.directory, record);
            if (!bridge || evidenceDigest && bridge.evidenceDigest !== evidenceDigest || status === "applied" && (!record.attempt.evidenceDigest || receipt?.recordDigest !== bridge.journal.recordDigest || receipt?.requestDigest !== bridge.journal.requestDigest)) throw new ProposalConflict("Exact prepared evidence is missing or differs");
        }
        if (status === "applied" && record.attempt.notAppliedPlanDigest) throw new ProposalConflict("A sealed attempt cannot become applied");
        if (status === "not_applied" && !record.attempt.notAppliedPlanDigest) throw new ProposalConflict("Negative settlement plan is missing");
        if (status === "stale" && record.attempt.evidenceDigest) throw new ProposalConflict("Prepared attempt cannot become stale");
        if (status === "applying" && record.status !== "applying") throw new ProposalConflict("Attempt cannot restart");
        const {recordDigest: _, ...rest} = record;
        const partial = {...rest, status: status ?? record.status, stateVersion: record.stateVersion + 1,
            attempt: {...record.attempt, ...(evidenceDigest ? {evidenceDigest} : {}), ...(receipt ? {receipt} : {})}};
        if (partial.status === record.status && digest(partial.attempt) === digest(record.attempt)) return this.confirmDurable(record);
        return this.save({...partial, recordDigest: digest(partial)});
    }
    /** Read-only startup guard. A disabled service does not create proposal storage. */
    static async inspectOutstanding(dataDir: string, owner: ProposalOwner): Promise<ProposalRecord[]> {
        const directory = join(dataDir, "proposals", digest([owner.routeKey, owner.principal]));
        try { await lstat(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
        for (const path of [dataDir, join(dataDir, "proposals"), directory]) {
            const stat = await lstat(path);
            if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) throw new Error("Invalid proposal directory; original preserved");
        }
        const lock = await openWriterLock(join(directory, "writer.lock"));
        const store = new ProposalStore(directory, owner, lock);
        try { return (await store.list()).filter(r => r.decision?.kind === "accept" && !PROPOSAL_RECONCILIATION_STATUSES.includes(r.status)); }
        finally { await store.close(); }
    }
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
        if (record.attempt?.evidenceDigest) {
            const bridge = await readStoredProposalEvidence(this.directory, record);
            if (!bridge || bridge.evidenceDigest !== record.attempt.evidenceDigest) throw new Error("Missing or differing proposal evidence; original preserved");
        }
        if (record.attempt?.notAppliedPlanDigest) {
            const plan = await readNotAppliedPlan(this.directory, record);
            if (!plan || plan.planDigest !== record.attempt.notAppliedPlanDigest) throw new Error("Missing or differing negative settlement plan; original preserved");
        }
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
    /** Retrying after a successful rename must still complete both durability barriers. */
    private async confirmDurable(record: ProposalRecord): Promise<ProposalRecord> {
        const file = await open(join(this.directory, `${record.payload.id}.json`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077 || stat.size > MAX_PROPOSAL_BYTES || process.getuid && stat.uid !== process.getuid()) throw new Error("Invalid proposal file; original preserved");
            await file.sync();
        } finally { await file.close(); }
        const folder = await open(this.directory, constants.O_RDONLY); try { await folder.sync(); } finally { await folder.close(); }
        const checked = await this.load(record.payload.id);
        if (!checked || checked.recordDigest !== record.recordDigest) throw new ProposalConflict("Proposal changed during durability confirmation");
        return checked;
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
        if (existing) { if (existing.proposalDigest !== digest(payload)) throw new ProposalConflict("Create UUID has different content"); return this.confirmDurable(existing); }
        const records = await this.loadAll();
        if (records.length >= 256 || records.filter(r => !FINAL_PROPOSAL_STATUSES.includes(r.status)).length >= 128) throw new ProposalQuota("Proposal quota reached");
        if (payload.request.supersedes && !await this.load(payload.request.supersedes)) throw new ProposalConflict("Missing previous proposal");
        const partial = {payload, proposalDigest: digest(payload), status: "pending" as const, stateVersion: 1};
        return this.save({...partial, recordDigest: digest(partial)});
    }
    private async rejectRecord(id: string, requestId: string, proposalDigest: string, grantId: string) {
        const record = await this.load(id); if (!record) return null;
        if (record.proposalDigest !== proposalDigest) throw new ProposalConflict("Proposal digest differs");
        if (record.status !== "pending") { if (record.status === "rejected" && record.decision?.kind === "reject" && record.decision.requestId === requestId && record.decision.grantId === grantId) return this.confirmDurable(record); throw new ProposalConflict("Proposal is terminal"); }
        const previous = (await this.loadAll()).find(r => r.decision?.requestId === requestId);
        if (previous) throw new ProposalConflict("Decision UUID already belongs to another proposal");
        const {recordDigest: _, ...rest} = record;
        const partial = {...rest, status: "rejected" as const, stateVersion: 2, decision: {kind: "reject" as const, requestId, principal: this.owner.principal, grantId, proposalDigest}};
        return this.save({...partial, recordDigest: digest(partial)});
    }
}
