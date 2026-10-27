import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {PROTOCOL_VERSION} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {Change} from "@barocss/doc-sync/sync";
import type {Schema} from "@barocss/doc-sync";

const serverFile = fileURLToPath(new URL("../server.ts", import.meta.url));
type Base = {epoch: string; serverSeq: number; schemaVersion: string};

async function start(data: string) {
    const env: NodeJS.ProcessEnv = {...process.env, PORT: "0", DATA_DIR: data};
    delete env.NO_SCHEMA;
    delete env.DOC_PROFILE;
    const child = spawn(process.execPath, [serverFile], {cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"]});
    let output = "", error = "";
    child.stderr.on("data", chunk => { error += String(chunk); });
    const origin = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error(`Server start timed out: ${error}`)); }, 10_000);
        child.once("error", cause => { clearTimeout(timer); reject(cause); });
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${error}`)); });
        child.stdout.on("data", chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/localhost:(\d+)/);
            if (match) { clearTimeout(timer); resolve(match[0]); }
        });
    });
    return {origin, async stop() {
        if (child.exitCode === null && child.signalCode === null) {
            const stopped = once(child, "exit"); child.kill(); await stopped;
        }
    }};
}

const url = (origin: string, action: string) => `${origin}/api/docs/schema-test/${action}`;
const state = async (origin: string): Promise<Base & {model: unknown}> => {
    const response = await fetch(url(origin, "state"));
    assert.equal(response.status, 200);
    return response.json() as Promise<Base & {model: unknown}>;
};
const headers = (base: Base) => ({"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": base.epoch, "x-doc-sync-schema": base.schemaVersion});
const post = (origin: string, action: string, base: Base, body: unknown) => fetch(url(origin, action), {method: "POST", headers: headers(base), body: JSON.stringify(body)});
const extended = (): Schema => ({...structuredClone(DEMO_SCHEMA), marks: [...DEMO_SCHEMA.marks, "reviewed"]});
const makeChange = (actor: string, text: string): Change => {
    const doc = new Doc(actor, DEMO_SCHEMA);
    return {actor, seq: 1, ops: doc.edit([{op: "insert", at: [0, 0], content: text}]).ops};
};

test("HTTP conditional submission and schema transition survive restart and exact retries", async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-schema-http-"));
    let server = await start(data);
    try {
        const base = await state(server.origin);
        const first = makeChange("ai", "AI");
        const accepted = await post(server.origin, "conditional", base, {base, change: first});
        assert.equal(accepted.status, 200);
        assert.deepEqual(await accepted.json(), {status: "accepted", serverSeq: 1});

        const stale = await post(server.origin, "conditional", base, {base, change: makeChange("human", "H")});
        assert.equal(stale.status, 409);
        assert.equal((await stale.json() as {code: string}).code, "stale");
        assert.equal((await state(server.origin)).serverSeq, 1);

        const before = await state(server.origin);
        const next = extended();
        const incompatible = structuredClone(DEMO_SCHEMA);
        incompatible.marks = incompatible.marks.slice(1);
        const rejectedTransition = await post(server.origin, "schema", before, {base: before, schema: incompatible});
        assert.equal(rejectedTransition.status, 409);
        assert.equal((await state(server.origin)).schemaVersion, before.schemaVersion);
        const transition = await post(server.origin, "schema", before, {base: before, schema: next});
        assert.equal(transition.status, 200);
        const current = await state(server.origin);
        assert.notEqual(current.schemaVersion, base.schemaVersion);
        assert.deepEqual((await fetch(url(server.origin, "schema")).then(response => response.json()) as {schema: Schema}).schema, next);
        assert.deepEqual(current.model, before.model);

        const wrongSchema = await post(server.origin, "changes", base, makeChange("human", "H"));
        assert.equal(wrongSchema.status, 409);
        assert.equal((await wrongSchema.json() as {code: string}).code, "schema");
        const spoofedHeaders = await post(server.origin, "conditional", current, {base, change: makeChange("human", "H")});
        assert.equal(spoofedHeaders.status, 409);
        assert.equal((await spoofedHeaders.json() as {code: string}).code, "schema");
        const retried = await post(server.origin, "conditional", base, {base, change: first});
        assert.equal(retried.status, 200);
        assert.deepEqual(await retried.json(), {status: "accepted", serverSeq: 1});
        const changedBase = await post(server.origin, "conditional", base, {base: {...base, serverSeq: 1}, change: first});
        assert.equal(changedBase.status, 409);
        assert.equal((await changedBase.json() as {code: string}).code, "conflict");
        const conflict = await post(server.origin, "conditional", base, {base, change: {...first, ops: []}});
        assert.equal(conflict.status, 409);
        assert.equal((await conflict.json() as {code: string}).code, "conflict");
        const currentSchemaChange = await post(server.origin, "changes", current, makeChange("human", "H"));
        assert.equal(currentSchemaChange.status, 200);
        assert.deepEqual(await currentSchemaChange.json(), {serverSeq: 2});
        const notAReceipt = await post(server.origin, "conditional", current, {base: current, change: makeChange("human", "H")});
        assert.equal(notAReceipt.status, 409);
        assert.equal((await notAReceipt.json() as {code: string}).code, "conflict");
        const latest = await state(server.origin);
        const log = await readFile(join(data, "schema-test.jsonl"), "utf8");
        assert.equal(log.trim().split("\n").length, 4);
        assert.equal(JSON.parse(log.trim().split("\n")[0]).format, "doc-sync-log-v1");
        const stored = JSON.parse(log.trim().split("\n")[1]) as {conditionalBase: Base; change: Change};
        assert.equal(stored.conditionalBase.epoch, base.epoch);
        assert.equal(stored.conditionalBase.serverSeq, base.serverSeq);
        assert.equal(stored.conditionalBase.schemaVersion, base.schemaVersion);
        assert.deepEqual(stored.change, first);

        await server.stop();
        server = await start(data);
        const recovered = await state(server.origin);
        assert.notEqual(recovered.epoch, current.epoch);
        assert.equal(recovered.schemaVersion, current.schemaVersion);
        assert.equal(recovered.serverSeq, latest.serverSeq);
        assert.deepEqual(recovered.model, latest.model);
        const retryAfterRestart = await post(server.origin, "conditional", base, {base, change: first});
        assert.equal(retryAfterRestart.status, 409);
        assert.equal((await retryAfterRestart.json() as {code: string}).code, "epoch");
        const oldEpoch = await post(server.origin, "conditional", base, {base, change: makeChange("another", "B")});
        assert.equal(oldEpoch.status, 409);
        assert.equal((await oldEpoch.json() as {code: string}).code, "epoch");
        assert.equal(await readFile(join(data, "schema-test.jsonl"), "utf8"), log);

        assert.equal((await post(server.origin, "reset", recovered, {})).status, 200);
        await server.stop();
        server = await start(data);
        const reset = await state(server.origin);
        assert.equal(reset.schemaVersion, current.schemaVersion);
        assert.equal(reset.serverSeq, 0);
    } finally {
        await server.stop();
        await rm(data, {recursive: true, force: true});
    }
});

test("simultaneous transition and conditional edit accept at most one old-base request", async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-schema-race-"));
    const server = await start(data);
    try {
        const base = await state(server.origin);
        const [edit, transition] = await Promise.all([
            post(server.origin, "conditional", base, {base, change: makeChange("ai", "A")}),
            post(server.origin, "schema", base, {base, schema: extended()}),
        ]);
        assert.deepEqual([edit.status, transition.status].sort(), [200, 409]);
        const after = await state(server.origin);
        if (edit.status === 200) {
            assert.equal(after.serverSeq, 1);
            assert.equal(after.schemaVersion, base.schemaVersion);
        } else {
            assert.equal((await edit.json() as {code: string}).code, "schema");
            assert.equal(after.serverSeq, 0);
            assert.notEqual(after.schemaVersion, base.schemaVersion);
        }
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("a damaged schema transition is never skipped during log replay", async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-schema-corrupt-"));
    await writeFile(join(data, "schema-test.jsonl"), `${JSON.stringify({schema: {from: "invalid", to: "invalid", schema: extended()}})}\n`);
    const server = await start(data);
    try {
        const response = await fetch(url(server.origin, "state"));
        assert.equal(response.status, 500);
        assert.match((await response.json() as {error: string}).error, /Schema transition log/);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});

test("a damaged earlier change is not skipped before a later schema transition", async () => {
    const data = await mkdtemp(join(tmpdir(), "doc-sync-schema-corrupt-change-"));
    const oldVersion = schemaVersion(DEMO_SCHEMA), next = extended();
    const contents = [
        {change: {actor: "actor", seq: 2, ops: []}},
        {schema: {from: oldVersion, to: schemaVersion(next), schema: next}},
    ].map(entry => JSON.stringify(entry)).join("\n") + "\n";
    await writeFile(join(data, "schema-test.jsonl"), contents);
    const server = await start(data);
    try {
        const response = await fetch(url(server.origin, "state"));
        assert.equal(response.status, 500);
        assert.match((await response.json() as {error: string}).error, /cannot replay stored entry/i);
        assert.equal(await readFile(join(data, "schema-test.jsonl"), "utf8"), contents);
    } finally { await server.stop(); await rm(data, {recursive: true, force: true}); }
});
