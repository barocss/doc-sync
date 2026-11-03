import assert from "node:assert/strict";
import {test} from "node:test";
import {createServer} from "node:http";
import {once} from "node:events";
import {NodeHttpTransport} from "../../../packages/doc-sync/src/sync/node-http-transport.ts";
const change = {actor: "fixed", seq: 1, ops: []};
const base = {epoch: "e", serverSeq: 0, schemaVersion: null};
test("all upstream requests use only configured credentials and refuse redirects", async () => {
    const seen: Array<{url: string; headers: Headers; redirect: RequestRedirect | undefined; signal: AbortSignal | null | undefined}> = [];
    const old = globalThis.fetch;
    globalThis.fetch = async (url, init) => { seen.push({url: String(url), headers: new Headers(init?.headers), redirect: init?.redirect, signal: init?.signal}); throw new Error("blocked"); };
    try {
        const t = new NodeHttpTransport("doc", "fixed", "http://127.0.0.1", {headers: {authorization: "Bearer upstream-secret", "x-trusted": "configured"}});
        const stop = t.subscribe(0, () => {});
        for (const run of [() => t.getSchema(), () => t.getRecoveryState(), () => t.reserveRecovery("g", "r", 1), () => t.releaseRecovery("g", "r"),
            () => t.submitConditional(base, change), () => t.getChangeReceipt("g", change), () => t.recoverChange("g", "r", "v", change),
            () => t.getRecoveryReceipt("g", base, change), () => t.transitionSchema({...base, schemaVersion: "v"}, {} as never),
            () => t.send({kind: "change", change}), () => t.send({kind: "ack", ack: {actor: "fixed", serverSeq: 0, pin: null}}), () => t.leave()]) await assert.rejects(run);
        t.sendPresence({actor: "fixed", name: "name", color: "blue", anchor: null, focus: null});
        await new Promise(resolve => setImmediate(resolve)); stop();
        assert.equal(seen.length, 14);
        for (const call of seen) { assert.equal(call.redirect, "error", call.url); assert.ok(call.signal instanceof AbortSignal, call.url); assert.equal(call.headers.get("authorization"), "Bearer upstream-secret"); assert.equal(call.headers.get("x-trusted"), "configured"); assert.equal(call.headers.has("mcp-session-id"), false); }
        assert.throws(() => new NodeHttpTransport("d", "a", "http://user:secret@localhost"));
        assert.throws(() => new NodeHttpTransport("d", "a", "file:///etc/passwd"));
        assert.throws(() => new NodeHttpTransport("d", "a", "http://localhost", {headers: {"x-doc-sync-epoch": "forged"}}));
    } finally { globalThis.fetch = old; }
});
test("real redirect target receives no schema, SSE or mutation request and no secret", async () => {
    let leaked = 0, incoming = 0;
    const target = createServer((_req, res) => { leaked++; res.end("{}"); }); target.listen(0, "127.0.0.1"); await once(target, "listening"); const a = target.address(); assert.ok(a && typeof a !== "string");
    const source = createServer((_req, res) => { incoming++; res.writeHead(307, {location: `http://127.0.0.1:${a.port}/stolen`}); res.end(); }); source.listen(0, "127.0.0.1"); await once(source, "listening"); const b = source.address(); assert.ok(b && typeof b !== "string");
    const t = new NodeHttpTransport("d", "a", `http://127.0.0.1:${b.port}`, {headers: {authorization: "secret"}});
    try { await assert.rejects(t.getSchema()); await assert.rejects(t.submitConditional(base, change)); const stop = t.subscribe(0, () => {}); const deadline = Date.now() + 2000; while (incoming < 3 && Date.now() < deadline) await new Promise(r => setTimeout(r, 5)); stop(); assert.equal(incoming, 3); assert.equal(leaked, 0); }
    finally { source.close(); target.close(); }
});
