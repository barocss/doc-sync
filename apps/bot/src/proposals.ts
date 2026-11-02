import {constants} from "node:fs";
import {open} from "node:fs/promises";
const MAX = 262144;
/** Authenticated hosted-only client. Tokens remain in environment; no upstream authority. */
export async function proposalCommand(command: string, options: Map<string, string>, env: NodeJS.ProcessEnv = process.env) {
    const endpoint = new URL(options.get("--endpoint") ?? "");
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^\/mcp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(endpoint.pathname)) throw new Error("Use an exact hosted route endpoint");
    const tokenName = options.get("--token-env") ?? "DOC_SYNC_PROPOSAL_TOKEN", token = env[tokenName];
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(tokenName) || !token || !/^[A-Za-z0-9_-]{43,256}$/.test(token)) throw new Error("Set the bearer token environment variable");
    let suffix = "", method = "GET", body: string | undefined;
    if (command === "proposal-base") suffix = "/base";
    else if (command === "proposal-inspect" || ["proposal-reject", "proposal-accept", "proposal-reconcile"].includes(command)) {
        const id = options.get("--id"); if (!id || !/^[a-f0-9]{64}$/.test(id)) throw new Error("Use a proposal ID"); suffix = `/${id}`;
        if (["proposal-reject", "proposal-accept", "proposal-reconcile"].includes(command)) suffix += `/${command.slice("proposal-".length)}`;
    } else if (command !== "proposal-list" && command !== "proposal-create") throw new Error("Unsupported proposal command");
    if (command === "proposal-create" || ["proposal-reject", "proposal-accept", "proposal-reconcile"].includes(command)) {
        const path = options.get("--input"); if (!path) throw new Error("Use --input with a private bounded JSON file");
        const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try { const s = await file.stat(); if (!s.isFile() || s.nlink !== 1 || s.mode & 0o077 || s.size > MAX || process.getuid && s.uid !== process.getuid()) throw new Error("Input must be a private bounded owned regular file"); const buffer = Buffer.alloc(MAX + 1); let length = 0; while (length < buffer.length) { const read = await file.read(buffer, length, buffer.length - length, null); if (!read.bytesRead) break; length += read.bytesRead; } if (length > MAX) throw new Error("Input exceeds limit"); body = buffer.subarray(0, length).toString("utf8"); JSON.parse(body); }
        finally { await file.close(); }
        method = "POST";
    }
    const response = await fetch(`${endpoint.href}/proposals${suffix}`, {method, redirect: "error", headers: {authorization: `Bearer ${token}`, ...(body ? {"content-type": "application/json"} : {})}, body, signal: AbortSignal.timeout(30000)});
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Proposal request rejected (${response.status})`); }
    const reader = response.body?.getReader(); if (!reader) throw new Error("Missing response");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const result = await reader.read(); if (result.done) break; bytes += result.value.length; if (bytes > MAX) throw new Error("Response exceeds limit"); chunks.push(result.value); } }
    finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
