import type {IncomingMessage, ServerResponse} from "node:http";
import type {HostedConfig, HostedGrant, HostedRoute} from "./hosted-config.ts";
import {routePath} from "./hosted-config.ts";
import {createProposalSchema, digest, POLICY_FINGERPRINT, proposalId, rejectProposalSchema, type CreateProposal, type ProposalOwner} from "./proposal-schema.ts";
import {ProposalConflict, ProposalQuota, ProposalStore} from "./proposal-store.ts";
import {previewReplacement} from "./proposal-preview.ts";

const UNSETTLED_PROPOSAL_STATUSES = Object.freeze(["applying", "unconfirmed", "needs_attention"]);

export class ProposalHttpError extends Error { readonly status: number; constructor(status: number) { super("Proposal request rejected"); this.status = status; } }
export type ProposalCapture = (route: HostedRoute, grant: HostedGrant, request?: CreateProposal) => Promise<{base: CreateProposal["base"]; source?: string}>;
export function proposalCapability(method: string | undefined, suffix: string): "proposal_create" | "proposal_read" | "proposal_decide" | "proposal_accept" {
    if (suffix === "/base" && method === "GET" || suffix === "" && method === "POST") return "proposal_create";
    if (/^\/[a-f0-9]{64}\/(accept|reconcile)$/.test(suffix) && method === "POST") return "proposal_accept";
    if (/^\/[a-f0-9]{64}\/reject$/.test(suffix) && method === "POST") return "proposal_decide";
    if ((suffix === "" || /^\/[a-f0-9]{64}$/.test(suffix)) && method === "GET") return "proposal_read";
    throw new ProposalHttpError(405);
}
export async function handleProposal(options: {req: IncomingMessage; res: ServerResponse; config: HostedConfig; route: HostedRoute; grant: HostedGrant; suffix: string; parsed?: unknown; capture: ProposalCapture; accept?: (id: string, input: unknown, reconcileOnly: boolean) => Promise<unknown>}) {
    const {req, res, config, route, grant, suffix, parsed, capture} = options;
    const capability = proposalCapability(req.method, suffix);
    if (capability === "proposal_accept" && !config.proposals.acceptanceEnabled) throw new ProposalHttpError(405);
    if (!grant.permissions.includes("read") || !grant.permissions.includes(capability)) throw new ProposalHttpError(403);
    const owner: ProposalOwner = {principal: grant.principal, routeKey: digest([route.upstream, route.upstreamDocument, route.actor]), actor: route.actor};
    const respond = (value: unknown) => { const raw = JSON.stringify(value); if (Buffer.byteLength(raw) > 262144) throw new ProposalHttpError(413); res.writeHead(200, {"content-type": "application/json", "cache-control": "no-store"}); res.end(raw); };
    if (capability === "proposal_accept") {
        try { rejectProposalSchema.parse(parsed); } catch { throw new ProposalHttpError(400); }
        try { if (!options.accept) throw new ProposalHttpError(405); respond(await options.accept(suffix.split("/")[1]!, parsed, suffix.endsWith("/reconcile"))); return; }
        catch (error) { if (error instanceof ProposalConflict) throw new ProposalHttpError(409); if (error instanceof ProposalHttpError) throw error; throw new ProposalHttpError(503); }
    }
    if (suffix === "/base") { respond((await capture(route, grant)).base); return; }
    let request: CreateProposal | undefined;
    try { if (capability === "proposal_create") request = createProposalSchema.parse(parsed); else if (capability === "proposal_decide") rejectProposalSchema.parse(parsed); }
    catch { throw new ProposalHttpError(400); }
    let store: ProposalStore;
    try { store = await ProposalStore.open(config.dataDir, owner); } catch { throw new ProposalHttpError(503); }
    try {
        if (request) {
            const existing = await store.get(proposalId(owner, request.requestId));
            if (existing) { if (digest(existing.payload.request) !== digest(request)) throw new ProposalConflict(); const record = await store.create(existing.payload); respond({id: record.payload.id, status: record.status, proposalDigest: record.proposalDigest}); return; }
            if ((await store.list()).some(r => UNSETTLED_PROPOSAL_STATUSES.includes(r.status))) throw new ProposalHttpError(409);
            const captured = await capture(route, grant, request);
            if (captured.source === undefined) throw new Error("Missing source");
            const payload = {format: 1 as const, id: proposalId(owner, request.requestId), owner, request, ...previewReplacement(captured.source, request.change), policyFingerprint: POLICY_FINGERPRINT};
            const record = await store.create(payload);
            respond({id: record.payload.id, status: record.status, proposalDigest: record.proposalDigest});
        } else if (capability === "proposal_decide") {
            const decision = rejectProposalSchema.parse(parsed), record = await store.reject(suffix.split("/")[1]!, decision.requestId, decision.proposalDigest, grant.id);
            if (!record) throw new ProposalHttpError(404); respond(record);
        } else if (suffix) { const record = await store.get(suffix.slice(1)); if (!record) throw new ProposalHttpError(404); respond(record); }
        else { respond((await store.list()).map(r => ({id: r.payload.id, status: r.status, proposalDigest: r.proposalDigest, stateVersion: r.stateVersion}))); }
    } catch (error) { if (error instanceof ProposalConflict) throw new ProposalHttpError(409); if (error instanceof ProposalQuota) throw new ProposalHttpError(429); if (error instanceof ProposalHttpError) throw error; throw new ProposalHttpError(503); }
    finally { await store.close(); }
}
