import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp, writeFile, rm, chmod} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {proposalCommand} from "../src/proposals.ts";
test("owner CLI accepts and reconciles only an explicit ID through hosted route with private input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "proposal-accept-cli-")), seen: Array<{url: string; body: unknown}> = [];
    const server = createServer(async (req, res) => { assert.equal(req.headers.authorization, "Bearer " + "a".repeat(43)); assert.equal(req.method, "POST"); let raw = ""; for await (const chunk of req) raw += chunk; seen.push({url: req.url!, body: JSON.parse(raw)}); res.setHeader("content-type", "application/json"); res.end('{"status":"applied"}'); });
    server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/mcp/t/d/s`, env = {OWNER_TOKEN: "a".repeat(43)}, id = "b".repeat(64);
    try {
        const file = join(dir, "input.json"), input = {requestId: randomUUID(), proposalDigest: "c".repeat(64)};
        await writeFile(file, JSON.stringify(input), {mode: 0o600});
        const options = new Map([["--endpoint", endpoint], ["--input", file], ["--id", id], ["--token-env", "OWNER_TOKEN"]]);
        assert.deepEqual(await proposalCommand("proposal-accept", options, env), {status: "applied"});
        assert.deepEqual(await proposalCommand("proposal-reconcile", options, env), {status: "applied"});
        assert.deepEqual(seen, ["accept", "reconcile"].map(action => ({url: `/mcp/t/d/s/proposals/${id}/${action}`, body: input})));
        await chmod(file, 0o644); await assert.rejects(proposalCommand("proposal-accept", options, env)); assert.equal(seen.length, 2);
        options.delete("--id"); await assert.rejects(proposalCommand("proposal-reconcile", options, env)); assert.equal(seen.length, 2);
    } finally { await new Promise<void>(r => server.close(() => r())); await rm(dir, {recursive: true, force: true}); }
});
