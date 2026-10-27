import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {test} from "node:test";
import {NodeHttpTransport} from "../src/node.ts";
import type {ServerEvent} from "../src/sync/protocol.ts";

const waitFor = async (check: () => boolean, timeout = 4000) => {
    const until = Date.now() + timeout;
    while (!check()) {
        if (Date.now() >= until) throw new Error("Timed out waiting for transport event");
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

test("conditional HTTP request has a timeout and propagates an unknown outcome", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
        assert.ok(init?.signal instanceof AbortSignal);
        throw new DOMException("Request timed out", "TimeoutError");
    };
    try {
        const transport = new NodeHttpTransport("doc", "ai", "http://localhost");
        await assert.rejects(transport.submitConditional({epoch: "epoch", serverSeq: 0, schemaVersion: null}, {actor: "ai", seq: 1, ops: []}), /timed out/);
    } finally { globalThis.fetch = original; }
});

test("Node transport decodes SSE, reconnects, sends epochs, and stops", {timeout: 10_000}, async () => {
    const streams: string[] = [];
    const posts: Array<{path: string; epoch: string | undefined; protocol: string | undefined; body: unknown}> = [];
    const server = createServer(async (req, res) => {
        if (req.method === "GET") {
            streams.push(req.url!);
            res.writeHead(200, {"content-type": "text/event-stream"});
            if (streams.length === 1) {
                const data = JSON.stringify({type: "presence", presence: {actor: "other", name: "가", color: "blue", anchor: null, focus: null}});
                const bytes = Buffer.from(`: ping\r\ndata: ${data}\r\n\r\n`);
                const split = bytes.indexOf(Buffer.from("가"));
                res.write(bytes.subarray(0, split + 1));
                res.write(bytes.subarray(split + 1, bytes.length - 1));
                res.end(bytes.subarray(bytes.length - 1));
            } else {
                res.write(`data: ${JSON.stringify({type: "reset", epoch: "new epoch"})}\n\n`);
            }
        } else {
            let body = "";
            for await (const chunk of req) body += String(chunk);
            posts.push({path: req.url!, epoch: req.headers["x-doc-sync-epoch"] as string | undefined, protocol: req.headers["x-doc-sync-protocol"] as string | undefined, body: JSON.parse(body)});
            res.writeHead(req.url!.endsWith("/changes") ? 409 : 200, {"content-type": "application/json"});
            res.end("{}");
        }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server");
    const transport = new NodeHttpTransport("document", "actor space", `http://127.0.0.1:${address.port}`);
    const events: ServerEvent[] = [];
    const stop = transport.subscribe(7, event => events.push(event), "old epoch");
    try {
        await waitFor(() => events.length === 2);
        assert.equal(streams.length, 2);
        for (const stream of streams) {
            const url = new URL(stream, "http://localhost");
            assert.equal(url.searchParams.get("since"), "7");
            assert.equal(url.searchParams.get("epoch"), "old epoch");
            assert.equal(url.searchParams.get("actor"), "actor space");
            assert.equal(url.searchParams.get("protocol"), "3");
        }
        assert.equal(events[0].type, "presence");
        if (events[0].type === "presence") assert.equal(events[0].presence.name, "가");
        await transport.send({kind: "ack", ack: {actor: "actor space", serverSeq: 7, pin: null}});
        await assert.rejects(transport.send({kind: "change", change: {actor: "actor space", seq: 1, ops: []}}), /409/);
        transport.sendPresence({actor: "actor space", name: "AI", color: "red", anchor: null, focus: null});
        await transport.leave();
        await waitFor(() => posts.length === 4);
        assert.deepEqual(new Set(posts.map(post => post.path)), new Set([
            "/api/docs/document/ack", "/api/docs/document/changes", "/api/docs/document/presence", "/api/docs/document/leave",
        ]));
        assert.ok(posts.every(post => post.epoch === "new epoch" && post.protocol === "3"));
        assert.deepEqual(posts.find(post => post.path.endsWith("/leave"))?.body, {actor: "actor space"});
        stop();
        await new Promise(resolve => setTimeout(resolve, 1200));
        assert.equal(streams.length, 2, "stop cancels the active stream and retry");
    } finally {
        stop();
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test("Node clients converge after concurrent edits, undo, and offline reconnect", {timeout: 15_000}, async () => {
    const {spawn} = await import("node:child_process");
    const {mkdtempSync, rmSync} = await import("node:fs");
    const {tmpdir} = await import("node:os");
    const {join} = await import("node:path");
    const {fileURLToPath} = await import("node:url");
    const {SyncClient} = await import("../src/sync/client.ts");
    const {DEMO_SCHEMA} = await import("../../../fixtures/demo-schema.ts");
    const data = mkdtempSync(join(tmpdir(), "doc-sync-node-transport-"));
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../../apps/demo/server.ts", import.meta.url))], {
        env: {...process.env, PORT: "0", DATA_DIR: data}, stdio: ["ignore", "pipe", "pipe"],
    });
    const exit = new Promise<void>(resolve => child.once("exit", () => resolve()));
    let ai: InstanceType<typeof SyncClient> | undefined;
    let user: InstanceType<typeof SyncClient> | undefined;
    let aTransport: NodeHttpTransport | undefined;
    let uTransport: NodeHttpTransport | undefined;
    try {
        const origin = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Demo server did not start")), 5000);
            let output = "";
            child.stdout.on("data", chunk => {
                output += String(chunk);
                const match = output.match(/http:\/\/localhost:(\d+)/);
                if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
            });
            child.once("error", reject);
            child.once("exit", code => reject(new Error(`Demo server exited: ${code}`)));
        });
        aTransport = new NodeHttpTransport("transport-test", "ai", origin);
        uTransport = new NodeHttpTransport("transport-test", "user", origin);
        ai = new SyncClient("ai", aTransport, {schema: DEMO_SCHEMA});
        user = new SyncClient("user", uTransport, {schema: DEMO_SCHEMA});
        ai.connect(); user.connect();
        await waitFor(() => !!ai!.epoch && !!user!.epoch);
        ai.commit(ai.doc.edit([{op: "insert", at: [0, 0], content: "A"}]).ops);
        user.commit(user.doc.edit([{op: "insert", at: [0, 0], content: "U"}]).ops);
        await waitFor(() => ai!.serverSeq >= 2 && user!.serverSeq >= 2 && !ai!.pending.length && !user!.pending.length);
        assert.deepEqual(ai.doc.toJSON(), user.doc.toJSON());
        ai.undo();
        await waitFor(() => ai!.serverSeq >= 3 && user!.serverSeq >= 3 && !ai!.pending.length);
        assert.deepEqual(ai.doc.toJSON(), user.doc.toJSON());
        const afterUndo = ai.doc.toJSON().children![0].runs![0];
        assert.ok("text" in afterUndo);
        assert.equal(afterUndo.text, "U", "AI undo preserves the user's concurrent insert");
        ai.disconnect();
        user.commit(user.doc.edit([{op: "insert", at: [0, 1], content: "x"}]).ops);
        ai.commit(ai.doc.edit([{op: "insert", at: [0, 1], content: "y"}]).ops);
        await waitFor(() => !user!.pending.length && user!.serverSeq >= 4);
        ai.connect();
        await waitFor(() => ai!.serverSeq >= 5 && user!.serverSeq >= 5 && !ai!.pending.length);
        assert.deepEqual(ai.doc.toJSON(), user.doc.toJSON());
        const resultRun = ai.doc.toJSON().children![0].runs![0];
        assert.ok("text" in resultRun);
        const result = resultRun.text;
        assert.equal(result.length, 3);
        assert.ok(result.includes("U") && result.includes("x") && result.includes("y"));
    } finally {
        ai?.disconnect(); user?.disconnect();
        if (aTransport && uTransport) await Promise.allSettled([aTransport.leave(), uTransport.leave()]);
        child.kill("SIGTERM");
        await exit;
        rmSync(data, {recursive: true, force: true});
    }
});
