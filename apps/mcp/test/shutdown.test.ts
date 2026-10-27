import assert from "node:assert/strict";
import {test} from "node:test";
import {NodeHttpTransport} from "@barocss/doc-sync/node";
import {shutdownSession} from "../src/shutdown.ts";

test("shutdown closes the session and releases a settled actor", async () => {
    const calls: string[] = [];
    const session = {client: {pending: [], conditionalPending: false}, async close() { calls.push("close"); }};
    await shutdownSession(session, {async leave() { calls.push("leave"); }});
    assert.deepEqual(calls, ["close", "leave"]);
});

test("shutdown retains the server lease for ordinary pending or unconfirmed conditional edits", async () => {
    for (const client of [
        {pending: [{seq: 1}], conditionalPending: false},
        {pending: [], conditionalPending: true},
        {pending: [{seq: 1}], conditionalPending: true},
    ]) {
        const calls: string[] = [];
        await shutdownSession({client, async close() { calls.push("close"); }}, {async leave() { calls.push("leave"); }});
        assert.deepEqual(calls, ["close"]);
    }
});

test("shutdown tolerates failure to send a settled actor's leave message", async () => {
    const session = {client: {pending: [], conditionalPending: false}, async close() {}};
    await assert.doesNotReject(shutdownSession(session, {async leave() { throw new Error("offline"); }}));
});

test("Node leave supplies a bounded abort signal to an unresponsive transport", async t => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("leave timed out")), 10);
    const timeout = t.mock.method(AbortSignal, "timeout", () => controller.signal);
    t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
        assert.equal(init?.signal, controller.signal);
        return new Promise<Response>((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {once: true});
        });
    });
    try {
        const transport = new NodeHttpTransport("doc", "actor", "http://localhost");
        await assert.rejects(transport.leave(), /leave timed out/);
        assert.equal(timeout.mock.calls[0].arguments[0], 5_000);
    } finally { clearTimeout(timer); }
});
