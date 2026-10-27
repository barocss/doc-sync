import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chmod, mkdtemp, readFile, rm, stat, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";
import type {PreparedIntent} from "../src/journal.ts";

function intent(actor = "agent-1", text = "hello"): PreparedIntent {
    const doc = new Doc(actor, DEMO_SCHEMA), snapshot = doc.snapshot();
    const edits = [{op: "insert" as const, at: [0, 0], content: text}];
    return {generation: "generation-1", base: {epoch: "epoch-1", serverSeq: 0, schemaVersion: schemaVersion(DEMO_SCHEMA)},
        change: {actor, seq: 1, ops: doc.edit(edits).ops}, edits, snapshot, schema: DEMO_SCHEMA};
}

test("journal persists the exact intent privately and restores the actor without replaying", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-")), path = join(directory, "document.json");
    let journal: IntentJournal | null = null;
    try {
        journal = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
        assert.equal(await journal.read(), null);
        const data = intent(), record = await journal.prepare(data);
        assert.equal(record.state, "may_have_been_sent");
        assert.equal(record.actor, "agent-1");
        assert.deepEqual(record.change, data.change);
        assert.equal((await stat(path)).mode & 0o777, 0o600);
        assert.deepEqual(await journal.prepare(data), record, "exact retry keeps the same record");
        await assert.rejects(journal.prepare(intent("agent-1", "different")), /unresolved/);
        await assert.rejects(journal.clearAfterConfirmed("wrong"), /refusing/);
        await journal.close(); journal = null;
        journal = await IntentJournal.open(path, {document: "example"});
        assert.equal(journal.actor, "agent-1");
        assert.deepEqual(await journal.read(), record);
        await journal.clearAfterConfirmed(record.recordDigest);
        assert.equal(await journal.read(), null);
    } finally { await journal?.close(); await rm(directory, {recursive: true, force: true}); }
});

test("corrupt, mismatched and symbolic journal inputs are refused without changing their files", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-invalid-")), path = join(directory, "document.json");
    try {
        const original = "{incomplete journal";
        await writeFile(path, original, {mode: 0o600});
        await assert.rejects(IntentJournal.open(path, {document: "example", actor: "agent-1"}), /corrupt/);
        assert.equal(await readFile(path, "utf8"), original);
        await rm(path);
        const target = join(directory, "target");
        await writeFile(target, "preserve", {mode: 0o600});
        await symlink(target, path);
        await assert.rejects(IntentJournal.open(path, {document: "example", actor: "agent-1"}));
        assert.equal(await readFile(target, "utf8"), "preserve");
    } finally { await rm(directory, {recursive: true, force: true}); }
});

test("digest corruption and actor mismatch never overwrite the record", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-digest-")), path = join(directory, "document.json");
    let journal: IntentJournal | null = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
    try {
        await journal.prepare(intent()); await journal.close(); journal = null;
        await assert.rejects(IntentJournal.open(path, {document: "example", actor: "different"}), /actor differs/);
        const raw = await readFile(path, "utf8"), changed = raw.replace('"epoch-1"', '"epoch-2"');
        assert.notEqual(changed, raw);
        await writeFile(path, changed, {mode: 0o600});
        await assert.rejects(IntentJournal.open(path, {document: "example"}), /digest/);
        assert.equal(await readFile(path, "utf8"), changed);
    } finally { await journal?.close(); await rm(directory, {recursive: true, force: true}); }
});

test("concurrent writes within one process cannot replace an unresolved intent", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-serial-")), path = join(directory, "document.json");
    const journal = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
    try {
        const [first, second] = await Promise.allSettled([journal.prepare(intent()), journal.prepare(intent("agent-1", "other"))]);
        assert.equal(first.status, "fulfilled"); assert.equal(second.status, "rejected");
        if (first.status === "fulfilled") assert.equal((await journal.read())?.recordDigest, first.value.recordDigest);
    } finally { await journal.close(); await rm(directory, {recursive: true, force: true}); }
});

test("a rejected persistence attempt cannot replace an existing intent", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-error-")), path = join(directory, "document.json");
    const journal = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
    try {
        const record = await journal.prepare(intent());
        const before = await readFile(path, "utf8");
        const altered = intent(); altered.change.ops = [];
        await assert.rejects(journal.prepare(altered), /exact change/);
        assert.equal(await readFile(path, "utf8"), before);
        assert.equal((await journal.read())?.recordDigest, record.recordDigest);
        await chmod(directory, 0o500);
        await assert.rejects(journal.clearAfterConfirmed(record.recordDigest));
        await chmod(directory, 0o700);
        assert.equal(await readFile(path, "utf8"), before);
    } finally { await chmod(directory, 0o700); await journal.close(); await rm(directory, {recursive: true, force: true}); }
});

test("a failed pre-send journal write leaves no apparent prepared request", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-nosend-")), path = join(directory, "document.json");
    const journal = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
    try {
        await chmod(directory, 0o500);
        await assert.rejects(journal.prepare(intent()));
        await chmod(directory, 0o700);
        assert.equal(await journal.read(), null);
    } finally { await chmod(directory, 0o700); await journal.close(); await rm(directory, {recursive: true, force: true}); }
});

test("a retry after rename cannot proceed until directory sync succeeds", {skip: process.platform !== "darwin"}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-dirsync-")), path = join(directory, "document.json");
    const journal = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
    const internals = journal as unknown as {syncDirectory: () => Promise<void>};
    const syncDirectory = internals.syncDirectory.bind(journal);
    let failures = 2;
    internals.syncDirectory = async () => {
        if (failures-- > 0) throw new Error("injected directory sync failure");
        await syncDirectory();
    };
    try {
        const data = intent();
        await assert.rejects(journal.prepare(data), /injected directory sync failure/);
        const saved = await readFile(path, "utf8");
        const pending = await journal.read();
        assert.ok(pending, "rename completed before directory sync failed");
        await assert.rejects(journal.prepare(data), /injected directory sync failure/);
        assert.equal(await readFile(path, "utf8"), saved);
        assert.deepEqual(await journal.prepare(data), pending);
        assert.equal(await readFile(path, "utf8"), saved);
    } finally { await journal.close(); await rm(directory, {recursive: true, force: true}); }
});

test("kernel writer lock excludes another process and is released after SIGKILL", {skip: process.platform !== "darwin", timeout: 10000}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-journal-lock-")), path = join(directory, "document.json");
    const module = new URL("../src/journal.ts", import.meta.url).href;
    const program = `import {IntentJournal} from ${JSON.stringify(module)}; const j=await IntentJournal.open(process.argv[1],{document:'example',actor:'agent-1'}); await j.prepare(${JSON.stringify(intent())}); console.log('ready'); setInterval(()=>void j.actor,60000);`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", program, path], {stdio: ["ignore", "pipe", "pipe"]});
    const exited = once(child, "exit");
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Lock helper did not start: ${stderr}`)), 5000);
            child.once("error", reject);
            child.once("exit", code => reject(new Error(`Lock helper exited ${code}: ${stderr}`)));
            child.stdout.on("data", chunk => { if (String(chunk).includes("ready")) { clearTimeout(timer); resolve(); } });
        });
        await assert.rejects(IntentJournal.open(path, {document: "example", actor: "agent-1"}), /active writer/);
        child.kill("SIGKILL"); await exited;
        const restored = await IntentJournal.open(path, {document: "example", actor: "agent-1"});
        try { assert.deepEqual((await restored.read())?.change, intent().change); }
        finally { await restored.close(); }
    } finally {
        if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
        await rm(directory, {recursive: true, force: true});
    }
});

test("unsupported platforms fail closed instead of using an unsafe lock", {skip: process.platform === "darwin"}, async () => {
    await assert.rejects(IntentJournal.open("/tmp/example-journal", {document: "example"}), /not supported/);
});
