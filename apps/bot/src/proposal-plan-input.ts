import {constants} from "node:fs";
import {open} from "node:fs/promises";
/** A prepared structured plan is data, never executable code or a model credential. */
export async function readProposalPlan(path: string): Promise<unknown> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077 || stat.size > 32768 || process.getuid && stat.uid !== process.getuid()) throw new Error("Plan input requires a private owned bounded regular file");
        const buffer = Buffer.alloc(32769); let length = 0;
        while (length < buffer.length) { const part = await file.read(buffer, length, buffer.length - length, null); if (!part.bytesRead) break; length += part.bytesRead; }
        if (length > 32768) throw new Error("Plan input exceeds limit");
        try { return JSON.parse(new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(buffer.subarray(0, length))); } catch { throw new Error("Invalid structured plan JSON"); }
    } finally { await file.close(); }
}
