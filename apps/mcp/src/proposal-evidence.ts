import {constants} from "node:fs";
import {link, lstat, mkdir, open, readdir, unlink} from "node:fs/promises";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {parseJournalRecord, type JournalRecord} from "./journal.ts";
import {digest, parseProposalRecord, type ProposalRecord} from "./proposal-schema.ts";

export const MAX_PROPOSAL_EVIDENCE_BYTES = 16 * 1024 * 1024;
export type ProposalPhysicalOwner = {origin: string; document: string; actor: string};
export type ProposalEvidence = {format: 1; physical: ProposalPhysicalOwner; proposalId: string; proposalDigest: string;
    owner: ProposalRecord["payload"]["owner"]; decision: NonNullable<ProposalRecord["decision"]>; attemptId: string; journal: JournalRecord; evidenceDigest: string};
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({format: z.literal(1), physical: z.object({origin: z.string().min(1).max(2048), document: z.string().regex(/^[a-z0-9-]{1,40}$/), actor: z.string().regex(/^[\w~-]{1,256}$/)}).strict(),
    proposalId: hash, proposalDigest: hash, owner: z.object({principal: z.string(), routeKey: hash, actor: z.string()}).strict(),
    decision: z.object({kind: z.literal("accept"), requestId: z.string().uuid(), principal: z.string(), grantId: z.string(), proposalDigest: hash, approvalPolicyFingerprint: hash}).strict(),
    attemptId: z.string().uuid(), journal: z.unknown(), evidenceDigest: hash}).strict();

export function parseProposalEvidence(value: unknown, record: ProposalRecord, physical: ProposalPhysicalOwner): ProposalEvidence {
    parseProposalRecord(record, record.payload.owner);
    const evidence = schema.parse(value), {evidenceDigest, ...rest} = evidence;
    if (digest(rest) !== evidenceDigest || digest(evidence.physical) !== digest(physical) || digest(evidence.owner) !== digest(record.payload.owner) ||
        record.payload.owner.routeKey !== digest([physical.origin, physical.document, physical.actor]) || record.payload.owner.actor !== physical.actor ||
        evidence.proposalId !== record.payload.id || evidence.proposalDigest !== record.proposalDigest || record.decision?.kind !== "accept" ||
        digest(evidence.decision) !== digest(record.decision) || evidence.attemptId !== record.attempt?.id ||
        record.attempt.evidenceDigest && record.attempt.evidenceDigest !== evidenceDigest) throw new Error("Proposal evidence identity differs; original preserved");
    const journal = parseJournalRecord(evidence.journal, physical.document, physical.actor), base = record.payload.request.base;
    if (journal.generation !== base.generation || digest(journal.base) !== digest({epoch: base.epoch, serverSeq: base.serverSeq, schemaVersion: base.schemaVersion})) throw new Error("Proposal evidence base differs; original preserved");
    const change = record.payload.request.change, at = [...change.path, change.start];
    const edits = [...(change.end > change.start ? [{op: "delete", at, count: change.end - change.start}] : []), ...(change.replacement ? [{op: "insert", at, content: change.replacement}] : [])];
    if (digest(journal.edits) !== digest(edits)) throw new Error("Proposal evidence edits differ from approval; original preserved");
    if (record.attempt.receipt && (record.attempt.receipt.recordDigest !== journal.recordDigest || record.attempt.receipt.requestDigest !== journal.requestDigest)) throw new Error("Proposal evidence receipt differs; original preserved");
    return {...evidence, journal};
}
async function privateDirectory(path: string, create: boolean): Promise<boolean> {
    if (create) await mkdir(path, {mode: 0o700});
    let stat; try { stat = await lstat(path); } catch (error) { if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) throw new Error("Evidence directory must be private and owned");
    return true;
}
async function ensureDirectory(directory: string, create: boolean): Promise<string | null> {
    await privateDirectory(directory, false);
    const path = join(directory, "attempts");
    if (create) { try { await privateDirectory(path, true); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await privateDirectory(path, false); } }
    else if (!await privateDirectory(path, false)) return null;
    return path;
}
async function read(path: string): Promise<string | null> {
    let file; try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077 || stat.size > MAX_PROPOSAL_EVIDENCE_BYTES || process.getuid && stat.uid !== process.getuid()) throw new Error("Invalid evidence file; original preserved");
        const bytes = Buffer.alloc(stat.size + 1); let length = 0;
        while (length < bytes.length) { const result = await file.read(bytes, length, bytes.length - length, null); if (!result.bytesRead) break; length += result.bytesRead; }
        if (length > stat.size) throw new Error("Evidence changed during read; original preserved");
        return bytes.subarray(0, length).toString("utf8");
    } finally { await file.close(); }
}
export async function readProposalEvidence(directory: string, record: ProposalRecord, physical: ProposalPhysicalOwner): Promise<ProposalEvidence | null> {
    if (!record.attempt) throw new Error("Missing approval attempt");
    const path = await ensureDirectory(directory, false); if (!path) return null;
    const raw = await read(join(path, `${record.attempt.id}.json`));
    return raw === null ? null : parseProposalEvidence(JSON.parse(raw), record, physical);
}
/** Internal store validation; physical identities are checked against the immutable route hash. */
export async function readStoredProposalEvidence(directory: string, record: ProposalRecord): Promise<ProposalEvidence | null> {
    if (!record.attempt) throw new Error("Missing approval attempt");
    const path = await ensureDirectory(directory, false); if (!path) return null;
    const raw = await read(join(path, `${record.attempt.id}.json`)); if (raw === null) return null;
    const parsed = schema.parse(JSON.parse(raw));
    return parseProposalEvidence(parsed, record, parsed.physical);
}
/** Immutable exact bridge. Call only while holding the proposal store's permanent lock. */
export async function saveProposalEvidence(directory: string, record: ProposalRecord, journal: JournalRecord, physical: ProposalPhysicalOwner): Promise<ProposalEvidence> {
    if (record.decision?.kind !== "accept" || !record.attempt || !["applying", "unconfirmed", "needs_attention"].includes(record.status)) throw new Error("No active approval");
    const partial = {format: 1 as const, physical, proposalId: record.payload.id, proposalDigest: record.proposalDigest, owner: record.payload.owner,
        decision: record.decision, attemptId: record.attempt.id, journal};
    const evidence = parseProposalEvidence({...partial, evidenceDigest: digest(partial)}, record, physical), raw = JSON.stringify(evidence) + "\n";
    if (Buffer.byteLength(raw) > MAX_PROPOSAL_EVIDENCE_BYTES) throw new Error("Proposal evidence byte quota reached");
    const path = (await ensureDirectory(directory, true))!, destination = join(path, `${record.attempt.id}.json`);
    const existing = await read(destination);
    if (existing !== null && digest(parseProposalEvidence(JSON.parse(existing), record, physical)) !== digest(evidence)) throw new Error("Proposal attempt evidence differs; original preserved");
    if (existing === null && (await readdir(path)).length >= 256) throw new Error("Proposal attempt lifetime quota reached");
    const temporary = join(path, `.${randomUUID()}.tmp`);
    try {
        if (existing === null) {
            const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
            try { await file.writeFile(raw); await file.sync(); } finally { await file.close(); }
            await link(temporary, destination); await unlink(temporary);
        }
        const file = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try { await file.sync(); } finally { await file.close(); }
        const folder = await open(path, constants.O_RDONLY); try { await folder.sync(); } finally { await folder.close(); }
        const parent = await open(directory, constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); }
        return (await readProposalEvidence(directory, record, physical))!;
    } finally { await unlink(temporary).catch(() => undefined); }
}
