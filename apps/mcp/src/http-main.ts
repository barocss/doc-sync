import {open} from "node:fs/promises";
import {constants} from "node:fs";
import {createHostedService} from "./hosted.ts";
async function main() {
    const file = process.env.DOC_SYNC_HOSTED_CONFIG;
    if (!file) throw new Error("DOC_SYNC_HOSTED_CONFIG is required");
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let config: unknown;
    try {
        const mode = await handle.stat();
        if (!mode.isFile() || mode.nlink !== 1 || (mode.mode & 0o077) || (process.getuid && mode.uid !== process.getuid()) || mode.size > 1048576) throw new Error("Invalid private configuration file");
        const bytes = Buffer.alloc(1048577); let length = 0;
        while (length < bytes.length) {
            const next = await handle.read(bytes, length, bytes.length - length, null);
            if (!next.bytesRead) break; length += next.bytesRead;
        }
        if (length > 1048576) throw new Error("Configuration exceeds its size limit");
        config = JSON.parse(bytes.subarray(0, length).toString("utf8"));
    } finally { await handle.close(); }
    const service = createHostedService(config);
    const port = Number(process.env.PORT ?? 5411);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid PORT");
    service.server.listen(port, process.env.HOST ?? "127.0.0.1", () => { const address = service.server.address(); if (address && typeof address !== "string") console.error(`Hosted MCP listening on ${address.port}`); });
    for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { void service.shutdown().catch(() => { process.exitCode = 1; }); });
}
main().catch(() => { console.error("Hosted MCP startup failed"); process.exitCode = 1; });
