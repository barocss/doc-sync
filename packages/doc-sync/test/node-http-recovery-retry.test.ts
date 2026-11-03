import assert from "node:assert/strict";
import {test} from "node:test";
import {createServer} from "node:http";
import {once} from "node:events";
import {NodeHttpTransport} from "../src/sync/node-http-transport.ts";

const state = {generation: "generation", epoch: "epoch", serverSeq: 2, schemaVersion: null};
const lease = {status: "protected", generation: "generation", pin: 1, lastGc: 0, existing: true};
const transport = () => new NodeHttpTransport("doc", "actor", "http://localhost");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

test("recovery retries temporary HTTP responses with identical request and one deadline", async t => {
    for (const status of [429, 502, 503, 504]) {
        const requests: Array<{url: string; init?: RequestInit}> = [];
        let cancelled = false;
        const failed = new Response(new ReadableStream({cancel() { cancelled = true; }}), {status});
        t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
            requests.push({url, init});
            return requests.length === 1 ? failed : json(lease);
        });
        assert.deepEqual(await transport().reserveRecovery("generation", "reservation", 1, true), lease);
        assert.equal(requests.length, 2);
        assert.equal(cancelled, true, "discarded HTTP response releases its body");
        assert.equal(requests[1].url, requests[0].url);
        assert.equal(requests[1].init?.body, requests[0].init?.body);
        assert.equal(requests[1].init?.signal, requests[0].init?.signal);
        assert.deepEqual(JSON.parse(requests[0].init?.body as string), {generation: "generation", actor: "actor", reservationId: "reservation", pin: 1, requireExisting: true});
        t.mock.restoreAll();
    }
});

test("exact pending recovery retries only its atomic endpoint", async t => {
    const bodies: string[] = [];
    const change = {actor: "actor", seq: 3, ops: []};
    t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
        assert.ok(url.endsWith("/recover-change"));
        bodies.push(init?.body as string);
        return bodies.length < 3 ? json({}, 503) : json({status: "accepted", generation: "generation", serverSeq: 4});
    });
    await transport().recoverChange("generation", "reservation", "schema", change);
    assert.equal(bodies.length, 3);
    assert.equal(new Set(bodies).size, 1);
    assert.deepEqual(JSON.parse(bodies[0]), {generation: "generation", reservationId: "reservation", schemaVersion: "schema", change});
});

test("persistent temporary failure stops after four attempts", async t => {
    const signals: AbortSignal[] = [];
    t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => { signals.push(init!.signal!); return json({}, 503); });
    await assert.rejects(transport().getRecoveryState(), /HTTP 503/);
    assert.equal(signals.length, 4);
    assert.equal(new Set(signals).size, 1);
});

test("unsafe, permanent, malformed and generation-mismatched replies are never retried", async t => {
    for (const response of [json({}, 409), json({}, 401), json({}, 500), new Response("not json"), json({...lease, generation: "other"})]) {
        let requests = 0;
        t.mock.method(globalThis, "fetch", async () => { requests++; return response; });
        await assert.rejects(transport().reserveRecovery("generation", "reservation", 1, true));
        assert.equal(requests, 1);
        t.mock.restoreAll();
    }
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => { requests++; return json({status: "unsafe"}); });
    assert.deepEqual(await transport().reserveRecovery("generation", "reservation", 1, true), {status: "unsafe"});
    assert.equal(requests, 1);
});

test("ordinary changes and conditional submissions are never retried", async t => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => { requests++; return json({}, 503); });
    const change = {actor: "actor", seq: 1, ops: []};
    await assert.rejects(transport().send({kind: "change", change}), /503/);
    assert.equal(requests, 1);
    await assert.rejects(transport().submitConditional({epoch: "epoch", serverSeq: 0, schemaVersion: null}, change), /503/);
    assert.equal(requests, 2);
});

test("recognized connection reset retries; arbitrary errors do not", async t => {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
        if (++requests === 1) throw new TypeError("fetch failed", {cause: Object.assign(new Error("reset"), {code: "ECONNRESET"})});
        return json(state);
    });
    assert.deepEqual(await transport().getRecoveryState(), state);
    assert.equal(requests, 2);
    t.mock.restoreAll();
    requests = 0;
    t.mock.method(globalThis, "fetch", async () => { requests++; throw new TypeError("unclassified error"); });
    await assert.rejects(transport().getRecoveryState(), /unclassified/);
    assert.equal(requests, 1);
});

test("the shared operation deadline aborts before a second attempt", async t => {
    const controller = new AbortController();
    let deadlines = 0, requests = 0;
    t.mock.method(AbortSignal, "timeout", (ms: number) => { assert.equal(ms, 10000); deadlines++; return controller.signal; });
    t.mock.method(globalThis, "fetch", async () => {
        requests++;
        return new Response(new ReadableStream({cancel() { controller.abort(new DOMException("deadline reached", "TimeoutError")); }}), {status: 503});
    });
    await assert.rejects(transport().getRecoveryState(), /deadline reached/);
    assert.equal(deadlines, 1);
    assert.equal(requests, 1);
});

test("real socket loss after lease acceptance retries the identical reservation", async () => {
    const bodies: string[] = [];
    const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += String(chunk);
        bodies.push(body);
        if (bodies.length === 1) { res.destroy(); return; }
        res.writeHead(200, {"content-type": "application/json"}); res.end(JSON.stringify(lease));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    try {
        assert.deepEqual(await new NodeHttpTransport("doc", "actor", `http://127.0.0.1:${address.port}`).reserveRecovery("generation", "reservation", 1, true), lease);
        assert.equal(bodies.length, 2);
        assert.equal(bodies[0], bodies[1]);
    } finally {
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test("socket loss after successful headers retries; complete malformed JSON does not", async t => {
    const bodies: string[] = [];
    let partial: import("node:http").ServerResponse | undefined;
    const originalFetch = globalThis.fetch;
    const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += String(chunk);
        bodies.push(body);
        res.writeHead(200, {"content-type": "application/json"});
        if (bodies.length === 1) { partial = res; res.write('{"status":"protected",'); }
        else res.end(JSON.stringify(lease));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
        const response = await originalFetch(url, init);
        // The real response headers reached fetch. Fail the incomplete body now.
        if (bodies.length === 1) partial!.destroy();
        return response;
    });
    try {
        assert.deepEqual(await new NodeHttpTransport("doc", "actor", `http://127.0.0.1:${address.port}`).reserveRecovery("generation", "reservation", 1, true), lease);
        assert.equal(bodies.length, 2);
        assert.equal(bodies[0], bodies[1]);
    } finally {
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
