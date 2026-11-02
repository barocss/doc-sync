import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp, writeFile, rm, chmod} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {proposalCommand} from "../src/proposals.ts";
test("proposal CLI authenticates hosted-only exact endpoint and reads private bounded input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "proposal-cli-")); const seen: string[] = [];
    const server = createServer((req, res) => { assert.equal(req.headers.authorization, "Bearer " + "a".repeat(43)); seen.push(req.url!); res.setHeader("content-type", "application/json"); res.end('{"status":"pending"}'); }); server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/mcp/t/d/s`, env = {DOC_SYNC_PROPOSAL_TOKEN: "a".repeat(43)};
    try { const file = join(dir, "input.json"); await writeFile(file, '{}', {mode: 0o600}); const options = new Map([["--endpoint", endpoint], ["--input", file]]);
        assert.deepEqual(await proposalCommand("proposal-create", options, env), {status: "pending"}); assert.deepEqual(seen, ["/mcp/t/d/s/proposals"]);
        await assert.rejects(proposalCommand("proposal-accept", options, env));
        for (const invalid of [endpoint + "?target=x", endpoint + "/proposals", endpoint.replace("/mcp/", "/api/")]) await assert.rejects(proposalCommand("proposal-base", new Map([["--endpoint", invalid]]), env));
        await chmod(file, 0o644); await assert.rejects(proposalCommand("proposal-create", options, env)); assert.equal(seen.length, 1);
    } finally { await new Promise<void>(r => server.close(() => r())); await rm(dir, {recursive: true, force: true}); }
});
