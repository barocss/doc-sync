import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {SyncClient, type Transport} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";

const transport: Transport = {subscribe: () => () => undefined, send: async () => undefined, sendPresence: () => undefined};
function checkpoint(actor = "agent-1") {
    const client = new SyncClient(actor, transport, {schema: DEMO_SCHEMA});
    client.commit(client.doc.edit([{op: "insert", at: [0, 0], content: "saved"}]).ops);
    return {generation: "generation-1", epoch: "epoch-1", reservationId: "reservation-1", reservationConfirmed: true, sourceIntentDigest: null,
        schema: DEMO_SCHEMA, client: client.checkpoint()};
}

test("checkpoint persists privately and restores the original actor and history", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-checkpoint-")), path = join(directory, "doc.json");
    let journal: IntentJournal | null = null;
    try {
        journal = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
        const saved = await journal.writeCheckpoint(checkpoint());
        assert.equal(saved.reservationConfirmed, true);
        assert.equal((await stat(`${path}.checkpoint`)).mode & 0o777, 0o600);
        assert.deepEqual(await journal.readCheckpoint(), saved);
        await journal.close(); journal = null;
        journal = await IntentJournal.open(path, {document: "example"});
        assert.equal(journal.actor, "agent-1");
        assert.deepEqual(await journal.readCheckpoint(), saved);
        await assert.rejects(IntentJournal.open(path, {document: "example", actor: "agent-1"}), /active writer/);
    } finally { await journal?.close(); await rm(directory, {recursive: true, force: true}); }
});

test("invalid input and corrupt checkpoint do not overwrite stored bytes", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-checkpoint-invalid-")), path = join(directory, "doc.json");
    let journal: IntentJournal | null = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
    try {
        await journal.writeCheckpoint(checkpoint());
        const before = await readFile(`${path}.checkpoint`, "utf8"), invalid = checkpoint();
        invalid.client.actor = "other";
        await assert.rejects(journal.writeCheckpoint(invalid));
        assert.equal(await readFile(`${path}.checkpoint`, "utf8"), before);
        await journal.close(); journal = null;
        await assert.rejects(IntentJournal.open(path, {document: "example", actor: "other"}), /actor differs/);
        const corrupted = before.replace('"generation-1"', '"generation-2"');
        assert.notEqual(corrupted, before);
        await writeFile(`${path}.checkpoint`, corrupted, {mode: 0o600});
        await assert.rejects(IntentJournal.open(path, {document: "example"}), /digest/);
        assert.equal(await readFile(`${path}.checkpoint`, "utf8"), corrupted);
    } finally { await journal?.close(); await rm(directory, {recursive: true, force: true}); }
});

test("checkpoint and writer lock survive a process termination", {skip: process.platform !== "darwin", timeout: 10000}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-checkpoint-kill-")), path = join(directory, "doc.json");
    const module = new URL("../src/journal.ts", import.meta.url).href;
    const saved = checkpoint();
    const source = `import {IntentJournal} from ${JSON.stringify(module)}; const j=await IntentJournal.open(process.argv[1],{document:'example',actor:'agent-1'}); await j.writeCheckpoint(${JSON.stringify(saved)}); console.log('ready'); setInterval(()=>void j.actor,60000);`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, path], {stdio: ["ignore", "pipe", "pipe"]});
    const exited = once(child, "exit");
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    let journal: IntentJournal | null = null;
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Checkpoint helper did not start: ${stderr}`)), 5000);
            child.once("error", reject);
            child.once("exit", code => reject(new Error(`Checkpoint helper exited ${code}: ${stderr}`)));
            child.stdout.on("data", chunk => { if (String(chunk).includes("ready")) { clearTimeout(timer); resolve(); } });
        });
        await assert.rejects(IntentJournal.open(path, {document: "example"}), /active writer/);
        child.kill("SIGKILL"); await exited;
        journal = await IntentJournal.open(path, {document: "example"});
        assert.equal(journal.actor, "agent-1");
        assert.deepEqual((await journal.readCheckpoint())?.client, saved.client);
    } finally {
        if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
        await journal?.close(); await rm(directory, {recursive: true, force: true});
    }
});
