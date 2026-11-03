import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {test} from "node:test";
import {Client} from "../src/client/index.ts";
import {NodeHttpTransport} from "../src/sync/node-http-transport.ts";
import {DocHub} from "../src/server/hub.ts";
import {createPresenceStore, connectClientPresence, PRESENCE_METADATA_KEY} from "../src/presence/index.ts";
import type {Presence} from "../src/sync/protocol.ts";
import type {Schema} from "../src/crdt/schema.ts";
const schema: Schema = {root: "book", marks: [], nodes: {book: {shape: "flow", children: ["line"], default: "line"}, line: {shape: "text"}}};
const waitFor = async (condition: () => boolean) => {
    const deadline = Date.now() + 3000;
    while (!condition()) { if (Date.now() > deadline) throw new Error("HTTP presence wait timed out"); await new Promise(resolve => setTimeout(resolve, 5)); }
};
for (const mode of ["draft-clear", "local-clear", "dispose", "reconnect"] as const) test(`HTTP late draft cannot revive after ${mode}`, {timeout: 10000}, async () => {
    const hub = new DocHub({schema});
    let release: (() => void) | undefined, hold = false, delivered = 0;
    const server = createServer(async (req, res) => {
        if (req.method === "GET") {
            res.writeHead(200, {"content-type": "text/event-stream"});
            res.write(`data: ${JSON.stringify(hub.hello(0))}\n\n`);
            const stop = hub.listen(event => res.write(`data: ${JSON.stringify(event)}\n\n`));
            req.on("close", stop); return;
        }
        let body = ""; for await (const chunk of req) body += String(chunk);
        if (req.url?.endsWith("/presence")) {
            const presence = JSON.parse(body) as Presence;
            const envelope = presence.metadata?.[PRESENCE_METADATA_KEY] as any;
            const accept = () => { hub.setPresence(presence); delivered++; res.writeHead(200, {"content-type": "application/json"}); res.end("{}"); };
            if (hold && envelope?.state?.draft) { hold = false; release = accept; return; }
            accept(); return;
        }
        res.writeHead(200, {"content-type": "application/json"}); res.end("{}");
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("TCP address required");
    const origin = `http://127.0.0.1:${address.port}`;
    const a = new Client({actor: "A", schema, transport: new NodeHttpTransport("doc", "A", origin), profile: {metadata: {profileField: "kept"}}});
    const b = new Client({actor: "B", schema, transport: new NodeHttpTransport("doc", "B", origin)});
    const sa = createPresenceStore({actor: "A", now: () => 100}), sb = createPresenceStore({actor: "B"});
    const ca = connectClientPresence(sa, a, {intervalMs: 0, initialPresence: {anchor: "editor-anchor", focus: null}}), cb = connectClientPresence(sb, b);
    try {
        a.connect(); b.connect(); await waitFor(() => a.synchronized && b.synchronized);
        const cursor = {kind: "document", anchor: "token"} as const;
        sa.updateLocal({cursor}); await waitFor(() => sb.getSnapshot().some(state => state.actor === "A"));
        hold = true; sa.updateLocal({draft: {target: cursor, text: "composing", composing: true}});
        await waitFor(() => release !== undefined);
        const beforeClear = delivered;
        if (mode === "local-clear") sa.clearLocal();
        else if (mode === "dispose") ca.dispose();
        else if (mode === "reconnect") { a.disconnect(); a.connect(); await waitFor(() => a.synchronized); }
        else sa.updateLocal({draft: null});
        await waitFor(() => delivered > beforeClear);
        await waitFor(() => !sb.getSnapshot().find(state => state.actor === "A")?.draft);
        const beforeLate = delivered; release!(); release = undefined;
        await waitFor(() => delivered > beforeLate);
        // Confirm the source consumed the stale SSE packet before checking the ordered public store.
        await waitFor(() => !!(b.sync?.others.get("A")?.metadata?.[PRESENCE_METADATA_KEY] as any)?.state?.draft);
        assert.equal(sb.getSnapshot().find(state => state.actor === "A")?.draft, undefined);
        assert.equal(hub.presence.get("A")?.metadata?.profileField, "kept");
    } finally {
        release?.(); ca.dispose(); cb.dispose(); a.disconnect(); b.disconnect(); sa.dispose(); sb.dispose();
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
