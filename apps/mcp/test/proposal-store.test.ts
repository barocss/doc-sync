import {test} from "node:test";
import {once} from "node:events";
import assert from "node:assert/strict";
import {mkdtemp, rm, readFile, writeFile, symlink, link, chmod} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {ProposalStore} from "../src/proposal-store.ts";
import {digest, POLICY_FINGERPRINT, proposalId, type ProposalOwner} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
const owner: ProposalOwner = {principal: "p", actor: "a", routeKey: digest(["origin", "doc", "actor"])};
function payload(requestId = randomUUID()) { const request = {requestId, base: {generation: "g", epoch: "e", serverSeq: 0, schemaVersion: "s"}, change: {kind: "replace_text" as const, path: [0], blockId: "b", start: 1, end: 2, replacement: "X"}, explanation: "why", assumptions: [], questions: [], checks: []}; return {format: 1 as const, id: proposalId(owner, requestId), owner, request, ...previewReplacement("abc", request.change), policyFingerprint: POLICY_FINGERPRINT}; }
test("durable immutable create/reject and private store isolation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "proposals-")); let store = await ProposalStore.open(dir, owner);
    try { const p = payload(), record = await store.create(p); assert.deepEqual(await store.create(p), record); await assert.rejects(store.create({...p, request: {...p.request, explanation: "different"}}));
        await assert.rejects(ProposalStore.open(dir, owner));
        const decision = randomUUID(), rejected = await store.reject(p.id, decision, record.proposalDigest, "owner"); assert.equal(rejected?.status, "rejected");
        assert.deepEqual(await store.reject(p.id, decision, record.proposalDigest, "owner"), rejected); await assert.rejects(store.reject(p.id, randomUUID(), record.proposalDigest, "owner"));
        await store.close(); store = await ProposalStore.open(dir, owner); assert.deepEqual(await store.get(p.id), rejected);
        const other = await ProposalStore.open(dir, {...owner, principal: "other"}); try { assert.equal(await other.get(p.id), null); } finally { await other.close(); }
    } finally { await store.close(); await rm(dir, {recursive: true, force: true}); }
});
test("corrupt, symlink, hardlink and public record remain untouched", async () => {
    const dir = await mkdtemp(join(tmpdir(), "proposals-bad-")); const store = await ProposalStore.open(dir, owner);
    try { const p = payload(); await store.create(p); const path = join(store.directory, `${p.id}.json`), original = await readFile(path);
        await writeFile(path, "bad", {mode: 0o600}); await assert.rejects(store.get(p.id)); assert.equal(await readFile(path, "utf8"), "bad");
        await rm(path); const target = join(dir, "target"); await writeFile(target, original, {mode: 0o600}); await symlink(target, path); await assert.rejects(store.get(p.id)); await rm(path);
        await link(target, path); await assert.rejects(store.get(p.id)); await rm(path); await writeFile(path, original, {mode: 0o600}); await chmod(path, 0o644); await assert.rejects(store.get(p.id));
    } finally { await store.close(); await rm(dir, {recursive: true, force: true}); }
});
test("hard unresolved quota never deletes; store close drains admitted operation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "proposals-quota-")); const store = await ProposalStore.open(dir, owner);
    try {
        for (let i = 0; i < 128; i++) await store.create(payload());
        await assert.rejects(store.create(payload())); assert.equal((await store.list()).length, 128);
        const pending = store.list(), closed = store.close(); assert.equal((await pending).length, 128); await closed;
        await assert.rejects(store.list());
    } finally { await store.close(); await rm(dir, {recursive: true, force: true}); }
});
test("SIGKILL releases permanent kernel inode; persisted proposal survives restart", async () => {
    const {spawn} = await import("node:child_process");
    const dir = await mkdtemp(join(tmpdir(), "proposals-process-")); const p = payload(); const store = await ProposalStore.open(dir, owner); const saved = await store.create(p); const directory = store.directory; await store.close();
    const child = spawn(process.execPath, ["--input-type=module", "-e", `import {ProposalStore} from ${JSON.stringify(new URL("../src/proposal-store.ts", import.meta.url).href)}; const store=await ProposalStore.open(${JSON.stringify(dir)},${JSON.stringify(owner)}); console.log('locked'); setInterval(()=>{},1000);`], {stdio: ["ignore", "pipe", "pipe"]});
    try {
        await new Promise<void>((resolve, reject) => { child.stdout!.once("data", () => resolve()); child.once("error", reject); child.once("exit", () => reject(new Error("early exit"))); });
        await assert.rejects(ProposalStore.open(dir, owner)); const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
        const reopened = await ProposalStore.open(dir, owner); try { assert.deepEqual(await reopened.get(p.id), saved); assert.equal(reopened.directory, directory); } finally { await reopened.close(); }
    } finally { child.kill("SIGKILL"); await rm(dir, {recursive: true, force: true}); }
});
test("FIFO record and lock fail without waiting or removing evidence", async () => {
    const {spawnSync} = await import("node:child_process"); const dir = await mkdtemp(join(tmpdir(), "proposals-fifo-")); const store = await ProposalStore.open(dir, owner); const id = payload().id, directory = store.directory;
    try { const path = join(directory, `${id}.json`); assert.equal(spawnSync("/usr/bin/mkfifo", ["-m", "600", path]).status, 0); await assert.rejects(store.get(id));
        await store.close(); const lock = join(directory, "writer.lock"); await rm(lock); assert.equal(spawnSync("/usr/bin/mkfifo", ["-m", "600", lock]).status, 0); await assert.rejects(ProposalStore.open(dir, owner));
    } finally { await store.close(); await rm(dir, {recursive: true, force: true}); }
});
