import {createHash} from "node:crypto";
import {z} from "zod";
import {previewReplacement} from "./proposal-preview.ts";
export const MAX_PROPOSAL_BYTES = 262144;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(256);
export const proposalBaseSchema = z.object({generation: identity, epoch: identity, serverSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), schemaVersion: identity}).strict();
export const createProposalSchema = z.object({requestId: z.string().uuid(), base: proposalBaseSchema,
    change: z.object({kind: z.literal("replace_text"), path: z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).length(1), blockId: identity,
        start: z.number().int().nonnegative().max(16384), end: z.number().int().nonnegative().max(16384), replacement: z.string().max(4096)}).strict(),
    explanation: z.string().min(1).max(4000), assumptions: z.array(z.string().max(1000)).max(16), questions: z.array(z.string().max(1000)).max(16),
    checks: z.array(z.object({reference: z.string().min(1).max(256), status: z.literal("unchecked")}).strict()).max(16),
    briefDigest: hash.optional(), supersedes: hash.optional()}).strict();
export const rejectProposalSchema = z.object({requestId: z.string().uuid(), proposalDigest: hash}).strict();
export const acceptProposalSchema = rejectProposalSchema;
export type CreateProposal = z.infer<typeof createProposalSchema>;
export type ProposalOwner = {principal: string; routeKey: string; actor: string};
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
    return value;
}
export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const proposalId = (owner: ProposalOwner, requestId: string) => digest(["doc-sync/proposal/v1", owner.routeKey, owner.principal, owner.actor, requestId]);
const immutableSchema = z.object({format: z.literal(1), id: hash, owner: z.object({principal: identity, routeKey: hash, actor: identity}).strict(),
    request: createProposalSchema, before: z.string().max(4096), after: z.string().max(4096),
    preview: z.object({prefix: z.string().max(16384), removed: z.string().max(4096), inserted: z.string().max(4096), suffix: z.string().max(16384)}).strict(), policyFingerprint: hash}).strict();
export type ProposalImmutable = z.infer<typeof immutableSchema>;
const decisionSchema = z.object({kind: z.enum(["accept", "reject"]), requestId: z.string().uuid(), principal: identity, grantId: identity, proposalDigest: hash, approvalPolicyFingerprint: hash.optional()}).strict();
export const ACCEPTANCE_POLICY_FINGERPRINT = digest(["B3b", 1, "root-stored-visible-unstyled-text", "exact-revision", "prepared-wire-guard"]);
export const proposalReceiptSchema = z.object({status: z.literal("accepted"), generation: identity, serverSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), requestDigest: hash, recordDigest: hash}).strict();
export type ProposalReceipt = z.infer<typeof proposalReceiptSchema>;
const recordSchema = z.object({payload: immutableSchema, proposalDigest: hash,
    status: z.enum(["pending", "rejected", "applying", "unconfirmed", "applied", "needs_attention", "stale", "not_applied"]), stateVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    decision: decisionSchema.optional(), attempt: z.object({id: z.string().uuid(), evidenceDigest: hash.optional(), receipt: proposalReceiptSchema.optional(), notAppliedPlanDigest: hash.optional()}).strict().optional(), recordDigest: hash}).strict();
export type ProposalRecord = z.infer<typeof recordSchema>;
function validState(record: ProposalRecord, owner: ProposalOwner): boolean {
    const {status, stateVersion, decision, attempt} = record;
    if (status === "pending") return stateVersion === 1 && !decision && !attempt;
    if (!decision || decision.principal !== owner.principal || decision.proposalDigest !== record.proposalDigest) return false;
    if (status === "rejected") return stateVersion === 2 && decision.kind === "reject" && !decision.approvalPolicyFingerprint && !attempt;
    if (decision.kind !== "accept" || decision.approvalPolicyFingerprint !== ACCEPTANCE_POLICY_FINGERPRINT || !attempt || attempt.id !== decision.requestId || stateVersion < 2) return false;
    if (attempt.notAppliedPlanDigest && (!attempt.evidenceDigest || status === "applied")) return false;
    if (status === "not_applied") return stateVersion >= 5 && !!attempt.evidenceDigest && !!attempt.notAppliedPlanDigest && !attempt.receipt;
    if (attempt.receipt && status !== "applied") return false;
    if (status === "applying" && stateVersion === 2 && attempt.evidenceDigest) return false;
    if (status !== "applying" && stateVersion < 3) return false;
    if (status === "applied") return stateVersion >= 4 && !!attempt.evidenceDigest && !!attempt.receipt && attempt.receipt.generation === record.payload.request.base.generation && attempt.receipt.serverSeq > record.payload.request.base.serverSeq;
    if (status === "stale" && attempt.evidenceDigest) return false;
    return true;
}
export function parseProposalRecord(value: unknown, owner: ProposalOwner): ProposalRecord {
    const record = recordSchema.parse(value), {recordDigest, ...rest} = record;
    if (Buffer.byteLength(JSON.stringify(record)) > MAX_PROPOSAL_BYTES || digest(rest) !== recordDigest || digest(record.payload) !== record.proposalDigest ||
        digest(record.payload.owner) !== digest(owner) || record.payload.id !== proposalId(owner, record.payload.request.requestId) ||
        !validState(record, owner)) throw new Error("Invalid proposal evidence; original preserved");
    const payload = record.payload, source = payload.preview.prefix + payload.preview.removed + payload.preview.suffix;
    const preview = previewReplacement(source, payload.request.change);
    if (JSON.stringify(preview.preview) !== JSON.stringify(payload.preview) || preview.before !== payload.before || preview.after !== payload.after || payload.policyFingerprint !== POLICY_FINGERPRINT) throw new Error("Inconsistent proposal preview; original preserved");
    return record;
}
export const POLICY_FINGERPRINT = digest(["B3a", 1, "root-stored-visible-unstyled-text", "utf16-scalar", "no-apply"]);
