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
const recordSchema = z.object({payload: immutableSchema, proposalDigest: hash, status: z.enum(["pending", "rejected"]), stateVersion: z.number().int().min(1).max(2),
    decision: z.object({kind: z.literal("reject"), requestId: z.string().uuid(), principal: identity, grantId: identity, proposalDigest: hash}).strict().optional(), recordDigest: hash}).strict();
export type ProposalRecord = z.infer<typeof recordSchema>;
export function parseProposalRecord(value: unknown, owner: ProposalOwner): ProposalRecord {
    const record = recordSchema.parse(value), {recordDigest, ...rest} = record;
    if (Buffer.byteLength(JSON.stringify(record)) > MAX_PROPOSAL_BYTES || digest(rest) !== recordDigest || digest(record.payload) !== record.proposalDigest ||
        digest(record.payload.owner) !== digest(owner) || record.payload.id !== proposalId(owner, record.payload.request.requestId) ||
        (record.status === "pending" ? record.stateVersion !== 1 || !!record.decision : record.stateVersion !== 2 || !record.decision || record.decision.principal !== owner.principal || record.decision.proposalDigest !== record.proposalDigest)) throw new Error("Invalid proposal evidence; original preserved");
    const payload = record.payload, source = payload.preview.prefix + payload.preview.removed + payload.preview.suffix;
    const preview = previewReplacement(source, payload.request.change);
    if (JSON.stringify(preview.preview) !== JSON.stringify(payload.preview) || preview.before !== payload.before || preview.after !== payload.after || payload.policyFingerprint !== POLICY_FINGERPRINT) throw new Error("Inconsistent proposal preview; original preserved");
    return record;
}
export const POLICY_FINGERPRINT = digest(["B3a", 1, "root-stored-visible-unstyled-text", "utf16-scalar", "no-apply"]);
