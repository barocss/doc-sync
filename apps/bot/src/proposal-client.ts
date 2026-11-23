import {createHash} from "node:crypto";
import type {CreatorOnlyClient, CreatorTarget, PlannedProposalRequest} from "./proposal-planner.ts";

/** Only creator capture/create routes exist here. No owner or raw edit transport is exposed. */
export function creatorClient(endpointValue: string, token: string): CreatorOnlyClient {
    const endpoint = new URL(endpointValue);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^\/mcp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(endpoint.pathname) || !/^[A-Za-z0-9_-]{43,256}$/.test(token)) throw new Error("Invalid creator endpoint or credential");
    if (endpoint.protocol === "http:" && !["127.0.0.1", "[::1]"].includes(endpoint.hostname)) throw new Error("Creator credentials require HTTPS outside numeric loopback");
    // Pin identity to route and credential without persisting the bearer itself. Rotation requires owner review.
    const binding = createHash("sha256").update(JSON.stringify([endpoint.href, token])).digest("hex");
    async function post(suffix: string, input: unknown): Promise<any> {
        const body = JSON.stringify(input);
        if (Buffer.byteLength(body) > 262144) throw new Error("Creator input exceeds limit");
        let response: Response;
        try { response = await fetch(`${endpoint.href}/proposals${suffix}`, {method: "POST", redirect: "error", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body, signal: AbortSignal.timeout(30000)}); }
        catch { throw new Error("Creator transport failed; outcome may be unknown"); }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Creator request rejected (${response.status})`); }
        const reader = response.body?.getReader(); if (!reader) throw new Error("Missing creator response");
        const chunks: Uint8Array[] = []; let size = 0;
        try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 262144) throw new Error("Creator response exceeds limit"); chunks.push(part.value); } }
        finally { await reader.cancel(); }
        try {
            const raw = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(Buffer.concat(chunks)), parsed = JSON.parse(raw);
            if (raw.includes(token) || JSON.stringify(parsed).includes(token)) throw new Error("Credential reflection");
            return parsed;
        } catch { throw new Error("Invalid creator response"); }
    }
    return {binding,
        readTarget: async path => await post("/target", {path}) as CreatorTarget,
        create: async (request: PlannedProposalRequest) => {
            const result = await post("", request);
            if (!result || !/^[a-f0-9]{64}$/.test(result.id) || !/^[a-f0-9]{64}$/.test(result.proposalDigest) || !["pending", "rejected", "applying", "unconfirmed", "applied", "needs_attention", "stale", "not_applied"].includes(result.status)) throw new Error("Invalid creator acknowledgement; retry original request");
            return {id: result.id, requestId: request.requestId};
        },
    };
}
