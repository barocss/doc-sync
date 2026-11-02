import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, open, readFile, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {ProposalStore} from "../src/proposal-store.ts";
import {digest, POLICY_FINGERPRINT, proposalId, type ProposalOwner} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
import {fixture} from "./hosted-fixtures.ts";

function payload(owner: ProposalOwner) {
    const request = {requestId: randomUUID(), base: {generation: "g", epoch: "e", serverSeq: 0, schemaVersion: "s"}, change: {kind: "replace_text" as const, path: [0], blockId: "b", start: 1, end: 2, replacement: "X"}, explanation: "why", assumptions: [], questions: [], checks: []};
    return {format: 1 as const, id: proposalId(owner, request.requestId), owner, request, ...previewReplacement("abc", request.change), policyFingerprint: POLICY_FINGERPRINT};
}

async function syncFault(directory: string) {
    const probe = await open(join(directory, "probe"), "w", 0o600);
    const prototype = Object.getPrototypeOf(probe), original = prototype.sync;
    await probe.close();
    let phase: "file" | "directory" | undefined;
    let failures = 0;
    prototype.sync = async function () {
        const info = await this.stat();
        if (phase && (phase === "directory" ? info.isDirectory() : info.isFile())) {
            failures++;
            throw Object.assign(new Error("injected sync EIO"), {code: "EIO"});
        }
        return original.call(this);
    };
    return {arm(value?: typeof phase) { phase = value; }, failures: () => failures, restore() { prototype.sync = original; }};
}

for (const operation of ["create", "reject"] as const) {
    test(`cached store ${operation} completes file and directory durability without rewriting`, async () => {
        const directory = await mkdtemp(join(tmpdir(), "cached-store-"));
        const owner = {principal: "p", actor: "a", routeKey: digest(["origin", "doc", "a"])};
        const store = await ProposalStore.open(directory, owner), fault = await syncFault(directory);
        try {
            const input = payload(owner), decision = randomUUID();
            if (operation === "reject") await store.create(input);
            const retry = () => operation === "create" ? store.create(input) : store.reject(input.id, decision, digest(input), "owner");
            // save() has renamed the new record, but its directory barrier fails.
            fault.arm("directory");
            await assert.rejects(retry(), {code: "EIO"});
            const path = join(store.directory, `${input.id}.json`), bytes = await readFile(path), inode = (await stat(path)).ino;
            for (const phase of ["file", "directory"] as const) {
                fault.arm(phase);
                const before = fault.failures();
                await assert.rejects(retry(), {code: "EIO"});
                assert.equal(fault.failures(), before + 1);
                assert.deepEqual(await readFile(path), bytes);
                assert.equal((await stat(path)).ino, inode);
            }
            fault.arm();
            const record = await retry();
            assert.equal(record!.status, operation === "create" ? "pending" : "rejected");
            assert.deepEqual(await readFile(path), bytes);
            assert.equal((await stat(path)).ino, inode);
            if (operation === "reject") {
                await assert.rejects(store.reject(input.id, decision, digest(input), "other"));
                await assert.rejects(store.reject(input.id, decision, digest("other"), "owner"));
            } else await assert.rejects(store.create({...input, request: {...input.request, explanation: "different"}}));
        } finally {fault.restore(); await store.close(); await rm(directory, {recursive: true, force: true});}
    });

    test(`cached HTTP ${operation} returns 503 until both sync barriers succeed without upstream access`, async () => {
        const f = await fixture();
        f.service.config.proposals.enabled = true;
        f.service.config.grants[0]!.permissions.push("proposal_read", "proposal_decide");
        f.service.config.grants[1]!.permissions.push("proposal_create");
        const route = f.service.config.routes[0]!;
        const owner = {principal: "p", actor: route.actor, routeKey: digest([route.upstream, route.upstreamDocument, route.actor])};
        const store = await ProposalStore.open(f.service.config.dataDir, owner), fault = await syncFault(f.dir);
        try {
            const input = payload(owner), decision = randomUUID();
            if (operation === "reject") await store.create(input);
            fault.arm("directory");
            await assert.rejects(operation === "create" ? store.create(input) : store.reject(input.id, decision, digest(input), "write"), {code: "EIO"});
            const path = join(store.directory, `${input.id}.json`), bytes = await readFile(path), inode = (await stat(path)).ino;
            await store.close();
            const url = `${f.endpoint}/proposals${operation === "reject" ? `/${input.id}/reject` : ""}`;
            const body = operation === "create" ? input.request : {requestId: decision, proposalDigest: digest(input)};
            const request = (value = body) => fetch(url, {method: "POST", headers: {authorization: `Bearer ${operation === "create" ? f.readToken : f.token}`, "content-type": "application/json"}, body: JSON.stringify(value)});
            const upstreamBefore = f.requests.length;
            for (const phase of ["file", "directory"] as const) {
                fault.arm(phase);
                const before = fault.failures(), response = await request();
                assert.equal(response.status, 503, await response.text());
                assert.equal(fault.failures(), before + 1);
                assert.deepEqual(await readFile(path), bytes);
                assert.equal((await stat(path)).ino, inode);
            }
            fault.arm();
            const response = await request();
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal((await response.json()).status, operation === "create" ? "pending" : "rejected");
            assert.equal(f.requests.length, upstreamBefore);
            assert.deepEqual(await readFile(path), bytes);
            assert.equal((await stat(path)).ino, inode);
            const changed = operation === "create" ? {...input.request, explanation: "different"} : {requestId: decision, proposalDigest: digest("other")};
            assert.equal((await request(changed)).status, 409);
            assert.equal(f.requests.length, upstreamBefore);
        } finally {fault.restore(); await store.close(); await f.cleanup();}
    });
}
