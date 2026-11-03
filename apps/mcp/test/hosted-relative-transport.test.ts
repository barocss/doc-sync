import assert from "node:assert/strict";
import {test} from "node:test";
import {HttpTransport} from "../../../packages/doc-sync/src/sync/http-transport.ts";
import {NodeHttpTransport} from "../../../packages/doc-sync/src/sync/node-http-transport.ts";

test("browser HttpTransport retains default and product-relative recovery fetch targets", async () => {
    const original = globalThis.fetch; const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
        requests.push(String(input)); assert.equal(new Headers(init?.headers).has("authorization"), false); assert.equal(init?.redirect, "error");
        return Response.json({generation: "g", epoch: "e", serverSeq: 0, schemaVersion: null});
    };
    try {
        const defaultTransport = new HttpTransport("doc", "browser");
        await defaultTransport.getRecoveryState();
        const productTransport = new HttpTransport("doc", "browser", "/profiles/word");
        await productTransport.getRecoveryState();
        assert.deepEqual(requests, ["/api/docs/doc/recovery-state", "/profiles/word/api/docs/doc/recovery-state"]);
    } finally {globalThis.fetch = original;}
});
test("configured upstream headers require an absolute valid HTTP URL", async () => {
    for (const origin of ["", "/profiles/word", "profiles/word", "//other.example"]) {
        assert.throws(() => new NodeHttpTransport("doc", "actor", origin, {headers: {authorization: "secret"}}));
        assert.throws(() => new NodeHttpTransport("doc", "actor", origin, {headers: {}}));
    }
    for (const origin of ["http://user:secret@localhost", "file:///tmp/doc", "/profiles/word?token=secret", "/profiles/word#fragment", "/profiles/word?", "/profiles/word#", "//user:secret@localhost"]) {
        assert.throws(() => new NodeHttpTransport("doc", "actor", origin));
    }
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        assert.equal(input, "https://upstream.example/api/docs/doc/recovery-state"); assert.equal(new Headers(init?.headers).get("authorization"), "configured-secret"); assert.equal(init?.redirect, "error");
        return Response.json({generation: "g", epoch: "e", serverSeq: 0, schemaVersion: null});
    };
    try {await new NodeHttpTransport("doc", "actor", "https://upstream.example", {headers: {authorization: "configured-secret"}}).getRecoveryState();}
    finally {globalThis.fetch = original;}
});
