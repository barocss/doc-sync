import assert from "node:assert/strict";
import childProcess from "node:child_process";
import {chmod, link, mkdtemp, readFile, rm, stat, symlink, writeFile} from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {IntentJournal} from "../src/journal.ts";
import {openWriterLock} from "../src/kernel-lock.ts";

const supported = process.platform === "darwin" || process.platform === "linux";

test("writer exclusion remains after acquisition helper exits and close permits relock on the same inode", {skip: !supported}, async () => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-kernel-lock-")), path = join(directory, "lock");
    const first = await openWriterLock(path);
    try {
        const before = await stat(path);
        assert.equal(before.mode & 0o777, 0o600);
        await assert.rejects(openWriterLock(path), /active writer/);
        await first.close();
        const next = await openWriterLock(path);
        try { assert.equal((await next.stat()).ino, before.ino); }
        finally { await next.close(); }
    } finally { await first.close(); await rm(directory, {recursive: true, force: true}); }
});

for (const suffix of ["", ".lock", ".checkpoint"]) {
    for (const unsafe of ["symlink", "hardlink", "public", "fifo"]) {
        test(`journal refuses ${unsafe} input at ${suffix || "intent"} and preserves its bytes`, {skip: !supported}, async () => {
            const directory = await mkdtemp(join(tmpdir(), "doc-sync-private-input-")), path = join(directory, "journal");
            const input = path + suffix, target = join(directory, "target");
            try {
                await writeFile(target, "preserve", {mode: 0o600});
                if (unsafe === "symlink") await symlink(target, input);
                else if (unsafe === "hardlink") await link(target, input);
                else if (unsafe === "fifo") {
                    assert.equal(childProcess.spawnSync("mkfifo", ["-m", "600", input]).status, 0);
                } else { await writeFile(input, "preserve", {mode: 0o600}); await chmod(input, 0o644); }
                await assert.rejects(IntentJournal.open(path, {document: "example"}));
                assert.equal(await readFile(target, "utf8"), "preserve");
                if (unsafe !== "fifo") assert.equal(await readFile(input, "utf8"), "preserve");
                else assert.ok((await stat(input)).isFIFO());
            } finally { await rm(directory, {recursive: true, force: true}); }
        });
    }
}

test("Linux helper errors fail closed and close the descriptor before a retry", {skip: process.platform !== "linux"}, async t => {
    const directory = await mkdtemp(join(tmpdir(), "doc-sync-helper-failure-")), path = join(directory, "lock");
    try {
        for (const failure of ["missing", "timeout", "unsupported"]) {
            const mocked = t.mock.method(childProcess, "spawnSync", () => ({
                status: failure === "unsupported" ? 64 : null, signal: failure === "timeout" ? "SIGKILL" : null,
                stderr: "injected failure", error: failure === "unsupported" ? undefined : new Error(failure),
            }));
            syncBuiltinESMExports();
            try { await assert.rejects(openWriterLock(path), /kernel lock acquisition failed/); }
            finally { mocked.mock.restore(); syncBuiltinESMExports(); }
            const next = await openWriterLock(path);
            await next.close();
        }
    } finally { await rm(directory, {recursive: true, force: true}); }
});
