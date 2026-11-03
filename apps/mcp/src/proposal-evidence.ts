import {constants} from "node:fs";
import {link, lstat, mkdir, open, readdir, unlink} from "node:fs/promises";
import {join} from "node:path";
import {Doc} from "@barocss/doc-sync";
import {createHash, randomUUID} from "node:crypto";
import {z} from "zod";
import {parseJournalRecord, type JournalRecord, type RecoveryCheckpoint} from "./journal.ts";
import {digest, parseProposalRecord, type ProposalRecord} from "./proposal-schema.ts";

const UNSETTLED_PROPOSAL_STATUSES = Object.freeze(["applying", "unconfirmed", "needs_attention"]);


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
    if (record.decision?.kind !== "accept" || !record.attempt || !UNSETTLED_PROPOSAL_STATUSES.includes(record.status)) throw new Error("No active approval");
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

export type NegativeReceipt = {status: "not_applied"; generation: string; requestDigest: string; changeDigest: string; sealId: string};
export type NotAppliedPlan = {format: 1; evidenceDigest: string; receipt: NegativeReceipt; before: RecoveryCheckpoint; after: RecoveryCheckpoint; planDigest: string};
const rawDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const negativeReceiptSchema = z.object({status: z.literal("not_applied"), generation: z.string().min(1).max(256), requestDigest: hash, changeDigest: hash, sealId: hash}).strict();
const notAppliedPlanSchema = z.object({format: z.literal(1), evidenceDigest: hash, receipt: negativeReceiptSchema, before: z.unknown(), after: z.unknown(), planDigest: hash}).strict();
/** Retire only allocation IDs. Keep the exact replica, history, sequence and protection. */
function retiredCheckpoint(before: RecoveryCheckpoint, evidence: ProposalEvidence): RecoveryCheckpoint {
    const intent = evidence.journal, {recordDigest, ...partial} = before;
    if (rawDigest(partial) !== recordDigest || before.format !== 1 || before.actor !== intent.actor || before.document !== intent.document || before.generation !== intent.generation ||
        before.epoch !== intent.base.epoch || !before.reservationConfirmed || before.releasePending || before.client.pending.length || before.client.seq + 1 !== intent.change.seq ||
        before.client.serverSeq > intent.base.serverSeq || before.sourceIntentDigest === intent.recordDigest || digest(before.schema) !== digest(intent.schema)) throw new Error("Checkpoint cannot retire this exact intent; original preserved");
    const draft = Doc.fromSnapshot(intent.actor, intent.snapshot, intent.schema);
    if (digest(draft.edit(intent.edits).ops) !== digest(intent.change.ops)) throw new Error("Rejected intent allocation differs");
    const next = structuredClone(partial);
    next.client.snapshot.lamport = Math.max(next.client.snapshot.lamport, draft.snapshot().lamport);
    return {...next, recordDigest: rawDigest(next)};
}
export function makeNotAppliedPlan(evidence: ProposalEvidence, receiptInput: unknown, before: RecoveryCheckpoint): NotAppliedPlan {
    const receipt = negativeReceiptSchema.parse(receiptInput), intent = evidence.journal;
    if (receipt.generation !== intent.generation || receipt.requestDigest !== intent.requestDigest || receipt.changeDigest !== rawDigest(intent.change) || receipt.sealId !== receipt.requestDigest) throw new Error("Negative receipt differs from the approved wire request");
    const partial = {format: 1 as const, evidenceDigest: evidence.evidenceDigest, receipt, before, after: retiredCheckpoint(before, evidence)};
    return {...partial, planDigest: digest(partial)};
}
function parseNotAppliedPlan(value: unknown, evidence: ProposalEvidence): NotAppliedPlan {
    const plan = notAppliedPlanSchema.parse(value);
    const expected = makeNotAppliedPlan(evidence, plan.receipt, plan.before as RecoveryCheckpoint);
    if (digest(plan) !== digest(expected)) throw new Error("Negative settlement plan differs; original preserved");
    return expected;
}
export async function readNotAppliedPlan(directory: string, record: ProposalRecord): Promise<NotAppliedPlan | null> {
    const evidence = await readStoredProposalEvidence(directory, record);
    if (!evidence) return null;
    const path = await ensureDirectory(directory, false); if (!path) return null;
    const raw = await read(join(path, `${record.attempt!.id}.not-applied.json`));
    return raw === null ? null : parseNotAppliedPlan(JSON.parse(raw), evidence);
}
/** Immutable proof and retirement WAL. Must be durable before touching the checkpoint. */
export async function saveNotAppliedPlan(directory: string, record: ProposalRecord, plan: NotAppliedPlan): Promise<NotAppliedPlan> {
    const evidence = await readStoredProposalEvidence(directory, record);
    if (!evidence || record.attempt?.receipt) throw new Error("No unresolved prepared evidence");
    const checked = parseNotAppliedPlan(plan, evidence), path = (await ensureDirectory(directory, true))!;
    const destination = join(path, `${record.attempt!.id}.not-applied.json`), existing = await read(destination);
    if (existing !== null && digest(parseNotAppliedPlan(JSON.parse(existing), evidence)) !== digest(checked)) throw new Error("Negative settlement plan already differs; original preserved");
    // The proof and plan share the existing bounded lifetime namespace.
    if (existing === null && (await readdir(path)).length >= 256) throw new Error("Proposal settlement lifetime quota reached");
    const raw = JSON.stringify(checked) + "\n";
    if (Buffer.byteLength(raw) > MAX_PROPOSAL_EVIDENCE_BYTES) throw new Error("Settlement plan byte quota reached");
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
        return (await readNotAppliedPlan(directory, record))!;
    } finally { await unlink(temporary).catch(() => undefined); }
}
