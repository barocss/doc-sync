import {Client} from "../src/client/index.ts";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {test} from "node:test";
import {createDataSchema} from "../src/data/index.ts";
import type {ClientOptions} from "../src/client/index.ts";
import {NodeHttpTransport} from "../src/sync/node-http-transport.ts";
import {PROTOCOL_VERSION} from "../src/sync/protocol.ts";
import type {Change, Ack, Presence, ServerEvent} from "../src/sync/protocol.ts";
import {DocHub} from "../src/server/hub.ts";

async function waitFor(condition: () => boolean) {
    const deadline = Date.now() + 5000;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error("Data HTTP convergence timed out");
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

/** Real loopback HTTP/SSE and production wire guards; no replacement fetch or transport. */
async function network() {
    const hub = new DocHub({schema: createDataSchema()});
    const peers: Client[] = [], failures: string[] = [];
    const requests: Array<{action: string; protocol: string; schema: string | null; epoch: string | null}> = [];
    const server = createServer(async (req, res) => {
        const reply = (status: number, body: unknown) => { res.writeHead(status, {"content-type": "application/json"}); res.end(JSON.stringify(body)); };
        try {
            const url = new URL(req.url!, "http://localhost"), action = url.pathname.split("/").at(-1)!;
            assert.equal(url.pathname, `/api/docs/data-http/${action}`);
            if (req.method === "GET" && action === "stream") {
                assert.equal(url.searchParams.get("protocol"), String(PROTOCOL_VERSION));
                assert.equal(url.searchParams.get("schemaVersion"), hub.schemaVersion);
                requests.push({action, protocol: url.searchParams.get("protocol")!, schema: url.searchParams.get("schemaVersion"), epoch: url.searchParams.get("epoch")});
                const since = Number(url.searchParams.get("since")), actor = url.searchParams.get("actor")!;
                const hello = hub.hello(since, url.searchParams.get("epoch") ?? undefined);
                const write = (event: ServerEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
                res.writeHead(200, {"content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store"});
                write(hello);
                if (hello.type === "hello" && !hello.snapshot && since > 0) hub.since(since).forEach(envelope => write({type: "change", envelope}));
                hub.connect(actor, hello.type === "hello" && hello.snapshot ? hub.serverSeq : since);
                const stop = hub.listen(write);
                req.on("close", () => { stop(); hub.disconnect(actor); hub.dropPresence(actor); });
                return;
            }
            assert.equal(req.method, "POST");
            const protocol = String(req.headers["x-doc-sync-protocol"] ?? ""), epoch = String(req.headers["x-doc-sync-epoch"] ?? ""), schema = String(req.headers["x-doc-sync-schema"] ?? "");
            assert.equal(protocol, String(PROTOCOL_VERSION)); assert.equal(epoch, hub.epoch); assert.equal(schema, hub.schemaVersion);
            requests.push({action, protocol, epoch, schema});
            let text = ""; for await (const chunk of req) text += String(chunk);
            const body = JSON.parse(text);
            if (action === "changes") { const envelope = hub.submit(body as Change); reply(200, {serverSeq: envelope?.serverSeq ?? null}); }
            else if (action === "ack") { hub.ack(body as Ack); reply(200, {}); }
            else if (action === "presence") { hub.setPresence(body as Presence); reply(200, {}); }
            else if (action === "leave") { hub.disconnect(body.actor); hub.dropPresence(body.actor); reply(200, {}); }
            else reply(404, {});
        } catch (error) { failures.push(String(error)); reply(409, {error: String(error)}); }
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const peer = (actor: string, options: Omit<ClientOptions, "schema" | "actor" | "transport"> = {}) => {
        const client = new Client({schema: createDataSchema(), ...options, actor, transport: new NodeHttpTransport("data-http", actor, origin)});
        peers.push(client); client.connect(); return client;
    };
    const settled = async (minimum: number) => {
        await waitFor(() => hub.serverSeq >= minimum && peers.every(peer => peer.synchronized && peer.sync?.serverSeq === hub.serverSeq));
        assert.deepEqual(failures, []);
        for (const peer of peers) assert.deepEqual(peer.model(), hub.doc.toJSON(), "exact model convergence with authoritative hub");
    };
    return {hub, peer, settled, requests, async close() {
        peers.forEach(peer => { peer.clearHistory(); peer.disconnect(); if (!peer.sync?.pending.length) peer.dispose(); });
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }};
}

test("Client.data HTTP merges concurrent map keys and same-key writes; selective undo preserves peer writes", {timeout: 15000}, async () => {
    const net = await network(), a = net.peer("A"), b = net.peer("B");
    try {
        await net.settled(0); a.disconnect(); b.disconnect();
        a.data.root.set("left", 1); a.data.root.set("same", "A"); b.data.root.set("right", 2); b.data.root.set("same", "B");
        a.connect(); b.connect(); await net.settled(4);
        assert.deepEqual(a.data.root.entries(), b.data.root.entries()); assert.equal(a.data.root.size, 3);
        assert.equal(a.data.root.get("left"), 1); assert.equal(a.data.root.get("right"), 2); assert.ok(["A", "B"].includes(a.data.root.get("same") as string));
        a.data.root.set("counter", 0); await net.settled(5); a.clearHistory();
        a.data.root.set("counter", 1); await net.settled(6);
        b.data.root.set("counter", 2); b.data.root.set("peer", 3); await net.settled(8);
        a.undo(); await net.settled(net.hub.serverSeq); assert.equal(a.data.root.get("counter"), 2); assert.equal(a.data.root.get("peer"), 3);
        a.redo(); await net.settled(net.hub.serverSeq); assert.equal(a.data.root.get("counter"), 2); assert.equal(a.data.root.get("peer"), 3);
        assert.ok(net.requests.some(request => request.action === "stream" && request.epoch === net.hub.epoch));
        assert.ok(net.requests.some(request => request.action === "changes"));
    } finally { await net.close(); }
});

test("Client.data HTTP list insert, move and peer edit preserve stable IDs through own undo/redo", {timeout: 15000}, async () => {
    const net = await network(), a = net.peer("A"), b = net.peer("B");
    try {
        await net.settled(0); const listA = a.data.createList(); a.data.root.set("items", listA); const first = listA.push("first"); await net.settled(3);
        const listB = b.data.getList(listA.id)!; assert.ok(listB);
        a.disconnect(); b.disconnect(); const x = listA.insert(0, "A"), y = listB.insert(0, "B"); a.connect(); b.connect(); await net.settled(5);
        assert.deepEqual(listA.entries(), listB.entries()); assert.equal(listA.length, 3);
        a.clearHistory(); listA.move(first, 0); listB.set(y, "peer edit"); await net.settled(7);
        assert.equal(listA.at(0)?.id, first); assert.equal(listA.get(y), "peer edit"); assert.equal(listA.get(x), "A");
        const moved = listA.entries(); a.undo(); await net.settled(8); assert.equal(listA.get(y), "peer edit");
        assert.deepEqual(new Set(listA.entries().map(entry => entry.id)), new Set([first, x, y]));
        a.redo(); await net.settled(9); assert.deepEqual(listA.entries(), moved); assert.deepEqual(listA.entries(), listB.entries());
    } finally { await net.close(); }
});

test("Client.data HTTP reconnect delivers queued pending edits exactly; invalid local policy creates no accepted sequence", {timeout: 15000}, async () => {
    const net = await network(), a = net.peer("A", {data: {validate(write) { if (write.key === "denied") throw new Error("local policy denied"); }}}), b = net.peer("B");
    try {
        await net.settled(0); a.data.root.set("initial", "seed"); await net.settled(1);
        a.disconnect(); a.data.root.set("offline", "queued"); a.data.root.set("same", "offline value");
        assert.equal(a.sync?.pending.length, 2); const pending = structuredClone(a.sync!.pending);
        b.data.root.set("peer", "online"); await waitFor(() => net.hub.serverSeq === 2 && b.synchronized);
        assert.equal(b.data.root.has("offline"), false); assert.deepEqual(a.sync!.pending, pending);
        a.connect(); await net.settled(4); assert.equal(a.sync?.pending.length, 0);
        assert.equal(b.data.root.get("offline"), "queued"); assert.equal(a.data.root.get("peer"), "online");
        assert.equal(net.hub.log.filter(envelope => envelope.change?.actor === "A").length, 3, "each queued change accepted once");
        const beforeSeq = net.hub.serverSeq, beforeRequests = net.requests.filter(request => request.action === "changes").length, beforeState = {model: a.model(), history: a.historyStatus(), pending: structuredClone(a.sync!.pending)};
        assert.throws(() => a.data.root.set("denied", 1), /local policy denied/);
        assert.throws(() => a.data.root.set("invalid", NaN), /finite scalar/);
        await new Promise(resolve => setTimeout(resolve, 30));
        assert.equal(net.hub.serverSeq, beforeSeq); assert.equal(net.requests.filter(request => request.action === "changes").length, beforeRequests);
        assert.deepEqual({model: a.model(), history: a.historyStatus(), pending: a.sync!.pending}, beforeState); await net.settled(beforeSeq);
        // This checks local validation only. createDataSchema is broad storage shape,
        // not semantic remote admission for IDs, encoded values or references (P2).
    } finally { await net.close(); }
});
