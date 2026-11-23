import {createHash} from "node:crypto";
import {join} from "node:path";
import {Doc, MAIN, readDocumentSlice, schemaVersion, type EditOp} from "@barocss/doc-sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {DocumentSession, type PreparedIntent} from "./session.ts";
import {IntentJournal} from "./journal.ts";
import {ProposalStore, ProposalConflict} from "./proposal-store.ts";
import {acceptProposalSchema, digest, POLICY_FINGERPRINT, ACCEPTANCE_POLICY_FINGERPRINT, type ProposalOwner, type ProposalRecord} from "./proposal-schema.ts";
import {saveProposalEvidence, readProposalEvidence} from "./proposal-evidence.ts";
import type {HostedConfig, HostedGrant, HostedRoute} from "./hosted-config.ts";

export const proposalOwner = (route: HostedRoute, grant: HostedGrant): ProposalOwner => ({principal: grant.principal, routeKey: digest([route.upstream, route.upstreamDocument, route.actor]), actor: route.actor});
export function proposalEdits(record: ProposalRecord): EditOp[] {
    const c = record.payload.request.change, at = [...c.path, c.start];
    return [...(c.end > c.start ? [{op: "delete" as const, at, count: c.end - c.start}] : []), ...(c.replacement ? [{op: "insert" as const, at, content: c.replacement}] : [])];
}
const key = (id: {lamport: number; actor: string}) => `${id.lamport}@${id.actor}`;
/** Validate the detached candidate before the journal or upstream sees it. */
export function authorizeProposalIntent(record: ProposalRecord, intent: PreparedIntent): void {
    const request = record.payload.request, c = request.change;
    if (record.status !== "applying" || !record.attempt || record.decision?.kind !== "accept" || record.decision.approvalPolicyFingerprint !== ACCEPTANCE_POLICY_FINGERPRINT || record.proposalDigest !== digest(record.payload) ||
        intent.change.actor !== record.payload.owner.actor || intent.generation !== request.base.generation ||
        digest(intent.base) !== digest({epoch: request.base.epoch, serverSeq: request.base.serverSeq, schemaVersion: request.base.schemaVersion}) ||
        schemaVersion(intent.schema) !== request.base.schemaVersion || digest(intent.edits) !== digest(proposalEdits(record))) throw new Error("Prepared intent is outside the approved attempt");
    const doc = Doc.fromSnapshot(record.payload.owner.actor, intent.snapshot, intent.schema);
    const blocks = doc.blocks(), block = blocks.find(b => b.marker.key === c.blockId);
    const child = readDocumentSlice(doc, {path: [], start: c.path[0], limit: 1, maxNodes: 1024, maxTextUnits: 16384, maxBytes: 131072}).children[0];
    const source = record.payload.preview.prefix + record.payload.preview.removed + record.payload.preview.suffix;
    if (!child || child.blockId !== c.blockId || !block || block.kind !== "text" || block.virtual || block.parts || block.aliases.length || block.marker.line.key !== MAIN ||
        block.text !== source || block.chars.some(char => char.kind !== "char" || Object.keys(doc.marksOf(char)).length) || blocks.filter(b => b.marker.key === c.blockId).length !== 1 ||
        intent.schema.nodes[child.node.type]?.shape !== "text" || child.node.children || child.node.runs?.some(r => !("text" in r) || Object.keys(r.marks).length)) throw new Error("Unsupported approved target");
    const selected = new Set<string>(); let offset = 0; let origin = block.marker.key;
    for (const char of block.chars) { const end = offset + char.ch.length; if (end <= c.start) origin = char.key; if (offset >= c.start && end <= c.end) selected.add(char.key); offset = end; }
    const deleted = new Set<string>(), inserted = new Set<string>(); let text = "", nextOrigin = origin;
    for (const op of intent.change.ops) {
        if (op.t === "del") {
            if (op.at.actor !== intent.change.actor) throw new Error("Foreign delete actor");
            for (const id of op.ids) { const k = key(id); if (!selected.has(k) || deleted.has(k)) throw new Error("Delete outside approved range"); deleted.add(k); }
        } else if (op.t === "text") {
            if (op.id.actor !== intent.change.actor || key(op.origin) !== nextOrigin || Object.keys(op.marks ?? {}).length) throw new Error("Insertion outside approved origin");
            for (let i = 0; i < op.text.length; i++) { const id = {lamport: op.id.lamport + i, actor: op.id.actor}, k = key(id); if (doc.get(k) || inserted.has(k)) throw new Error("Insertion reuses an ID"); inserted.add(k); }
            nextOrigin = key({lamport: op.id.lamport + op.text.length - 1, actor: op.id.actor}); text += op.text;
        } else throw new Error("Structural or foreign operation is unsupported");
    }
    if (text !== c.replacement || deleted.size !== selected.size) throw new Error("Prepared operations differ from approval");
    // Recompile independently from the saved pre-edit snapshot; ticket allocation must match.
    const expected = doc.edit(proposalEdits(record)).ops;
    if (digest(expected) !== digest(intent.change.ops)) throw new Error("Prepared IDs or operations differ from approved compilation");
    const after = doc.blocks().find(b => b.marker.key === c.blockId);
    if (!after || after.kind !== "text" || after.text !== record.payload.preview.prefix + c.replacement + record.payload.preview.suffix) throw new Error("Prepared preview differs");
}

/** Called only after hosted authentication and the physical actor registry reservation. */
export async function acceptProposal(config: HostedConfig, route: HostedRoute, grant: HostedGrant, id: string, input: unknown, reconcileOnly = false): Promise<ProposalRecord> {
    const decision = acceptProposalSchema.parse(input), owner = proposalOwner(route, grant);
    if (!config.proposals.acceptanceEnabled || !grant.permissions.includes("read") || !grant.permissions.includes("proposal_accept")) throw new ProposalConflict("Acceptance is disabled or unauthorized");
    const store = await ProposalStore.open(config.dataDir, owner);
    let journal: IntentJournal | undefined, session: DocumentSession | undefined;
    try {
        let record = await store.get(id);
        if (!record || record.proposalDigest !== decision.proposalDigest || record.payload.policyFingerprint !== POLICY_FINGERPRINT) throw new ProposalConflict("Proposal does not match");
        if (record.status === "pending" && (reconcileOnly || record.payload.request.questions.length || record.payload.before === record.payload.after)) throw new ProposalConflict("Proposal cannot be accepted");
        if (record.status !== "pending" && (record.decision?.kind !== "accept" || record.decision.requestId !== decision.requestId || record.decision.grantId !== grant.id)) throw new ProposalConflict("Different decision already exists");
        if (["applied", "stale"].includes(record.status)) return (await store.beginAccept(id, decision.requestId, decision.proposalDigest, grant.id))!;
        const fresh = record.status === "pending";
        if (fresh && (await store.list()).some(other => other.payload.id !== id && ["applying", "unconfirmed", "needs_attention"].includes(other.status))) throw new ProposalConflict("Another approved attempt requires reconciliation");
        // Opening the actor journal does not start or acknowledge a participant.
        const identity = JSON.stringify([route.upstream, route.upstreamDocument, route.actor]);
        journal = await IntentJournal.open(join(config.dataDir, createHash("sha256").update(identity).digest("hex") + ".json"), {document: route.upstreamDocument, actor: route.actor});
        const retained = await journal.read(), checkpoint = await journal.readCheckpoint();
        if (checkpoint?.releasePending || checkpoint?.client.pending.length || fresh && retained) throw new ProposalConflict("Unrelated recovery must be resolved first");
        const physical = {origin: route.upstream, document: route.upstreamDocument, actor: route.actor};
        const transport = new NodeHttpTransport(route.upstreamDocument, route.actor, route.upstream, {headers: route.headers});
        if (!fresh) {
            // Proof must precede reservation restore, connect, ACK, and any replay.
            const evidence = await readProposalEvidence(store.directory, record, physical);
            if (!evidence || !record.attempt?.evidenceDigest || record.attempt.evidenceDigest !== evidence.evidenceDigest || !checkpoint ||
                retained && retained.recordDigest !== evidence.journal.recordDigest || !retained && checkpoint.sourceIntentDigest !== evidence.journal.recordDigest) return await store.markNeedsAttention(id, decision.requestId);
            authorizeProposalIntent({...record, status: "applying"}, evidence.journal);
            const receipt = await transport.getRecoveryReceipt(evidence.journal.generation, evidence.journal.base, evidence.journal.change);
            if (receipt.status !== "accepted" || receipt.generation !== evidence.journal.generation) return await store.markUnconfirmed(id, decision.requestId);
            session = new DocumentSession(route.actor, transport, checkpoint.schema, 10000, journal);
            await session.start();
            const protectedCheckpoint = await journal.readCheckpoint();
            if (session.recoveryRequired || !protectedCheckpoint?.reservationConfirmed || protectedCheckpoint.sourceIntentDigest !== evidence.journal.recordDigest || protectedCheckpoint.client.pending.length) return await store.markNeedsAttention(id, decision.requestId);
            return await store.markApplied(id, decision.requestId, {...receipt, requestDigest: evidence.journal.requestDigest, recordDigest: evidence.journal.recordDigest});
        }
        record = (await store.beginAccept(id, decision.requestId, decision.proposalDigest, grant.id))!;
        const state = await transport.getRecoveryState();
        if (digest({generation: state.generation, epoch: state.epoch, serverSeq: state.serverSeq, schemaVersion: state.schemaVersion}) !== digest(record.payload.request.base)) return await store.markStale(id, decision.requestId);
        const schema = checkpoint?.schema ?? (await transport.getSchema()).schema;
        if (!schema) return await store.markNeedsAttention(id, decision.requestId);
        let bridge: Awaited<ReturnType<typeof saveProposalEvidence>> | undefined;
        session = new DocumentSession(route.actor, transport, schema, 10000, journal, async (step, prepared) => {
            if (step !== decision.requestId) throw new Error("Different approval attempt");
            bridge = await saveProposalEvidence(store.directory, record!, prepared, physical);
            await store.recordPreparedEvidenceDigest(id, step, bridge.evidenceDigest);
        }, intent => authorizeProposalIntent(record!, intent));
        await session.start();
        const current = await transport.getRecoveryState();
        if (digest({generation: current.generation, epoch: current.epoch, serverSeq: current.serverSeq, schemaVersion: current.schemaVersion}) !== digest(record.payload.request.base)) return await store.markStale(id, decision.requestId);
        if (session.recoveryRequired) return await store.markNeedsAttention(id, decision.requestId);
        try {
            const result = await session.edit({epoch: record.payload.request.base.epoch, serverSeq: record.payload.request.base.serverSeq, schemaVersion: record.payload.request.base.schemaVersion}, proposalEdits(record), decision.requestId);
            if (result.status !== "confirmed" || session.recoveryRequired || !bridge) return await store.markUnconfirmed(id, decision.requestId);
            const protectedCheckpoint = await journal.readCheckpoint(), receipt = await transport.getRecoveryReceipt(bridge.journal.generation, bridge.journal.base, bridge.journal.change);
            if (!protectedCheckpoint?.reservationConfirmed || protectedCheckpoint.sourceIntentDigest !== bridge.journal.recordDigest || receipt.status !== "accepted" || receipt.generation !== bridge.journal.generation) return await store.markNeedsAttention(id, decision.requestId);
            return await store.markApplied(id, decision.requestId, {...receipt, requestDigest: bridge.journal.requestDigest, recordDigest: bridge.journal.recordDigest});
        } catch { return await store.markNeedsAttention(id, decision.requestId); }
    } finally { try { if (session) await session.close(); else await journal?.close(); } finally { await store.close(); } }
}
