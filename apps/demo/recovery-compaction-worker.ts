import {createHash} from "node:crypto";
import {closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync} from "node:fs";
import {parentPort, workerData} from "node:worker_threads";

type Snapshot = {era: number; active: Array<{actor: string; reservationId: string; pin: number}>};
type Task = {path: string; temporary?: string; anchorBytes: number; anchorDigest: string; chainDigest: string; size: number; snapshot?: Snapshot; gate: boolean; mode?: "verify"};
const task = workerData as Task;
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const identity = (stat: ReturnType<typeof fstatSync>) => ({dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs});

async function run(): Promise<void> {
    if (task.gate) {
        parentPort!.postMessage({kind: "paused"});
        await new Promise<void>(resolve => parentPort!.once("message", () => resolve()));
    }
    const source = openSync(task.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    let before: ReturnType<typeof identity>;
    try {
        before = identity(fstatSync(source));
        bytes = readFileSync(source);
        if (JSON.stringify(before) !== JSON.stringify(identity(fstatSync(source)))) throw new Error("Recovery source changed during reading");
    } finally { closeSync(source); }
    if (bytes.length !== task.size || task.anchorBytes > bytes.length || hash(bytes.subarray(0, task.anchorBytes)) !== task.anchorDigest) {
        throw new Error("Recovery source does not match the durable log");
    }
    let chain = task.anchorDigest;
    for (let at = task.anchorBytes; at < bytes.length;) {
        const end = bytes.indexOf(10, at);
        if (end < 0) throw new Error("Recovery source ends in a partial record");
        chain = createHash("sha256").update(Buffer.from(chain, "hex")).update(bytes.subarray(at, end + 1)).digest("hex");
        at = end + 1;
    }
    if (chain !== task.chainDigest) throw new Error("Recovery source does not match durable appended records");
    if (task.mode === "verify") { parentPort!.postMessage({kind: "complete", identity: before}); return; }
    if (!task.temporary || !task.snapshot) throw new Error("Recovery compaction task is incomplete");
    const sourceText = bytes.toString("utf8");
    if (!Buffer.from(sourceText, "utf8").equals(bytes) || !sourceText.endsWith("\n")) throw new Error("Invalid recovery source encoding");
    const lines = sourceText.split("\n");
    lines.pop();
    const retained = lines.filter(line => {
        if (!line) return true;
        const value = JSON.parse(line) as {recoveryPin?: unknown; recoveryState?: unknown};
        return !Object.hasOwn(value, "recoveryPin") && !Object.hasOwn(value, "recoveryState");
    });
    const output = Buffer.from(`${retained.join("\n")}\n${JSON.stringify({recoveryState: task.snapshot})}\n`, "utf8");
    let created = false;
    try {
        const fd = openSync(task.temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        let temporaryIdentity: ReturnType<typeof identity>;
        try { writeFileSync(fd, output); fsyncSync(fd); temporaryIdentity = identity(fstatSync(fd)); } finally { closeSync(fd); }
        parentPort!.postMessage({kind: "complete", identity: before, temporaryIdentity, digest: hash(output), size: output.length});
        created = false; // Ownership transfers to the server.
    } finally {
        if (created) try { unlinkSync(task.temporary); } catch { /* Only this worker's temporary file is removed. */ }
    }
}

run().catch(error => { parentPort!.postMessage({kind: "error", message: error instanceof Error ? error.message : String(error)}); });
