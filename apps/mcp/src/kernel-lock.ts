import {spawnSync} from "node:child_process";
import {constants} from "node:fs";
import {open} from "node:fs/promises";

// Darwin acquires flock(2) atomically with open(2).
const DARWIN_O_EXLOCK = 0x20;

/**
 * Keep this descriptor and inode until the journal queue has drained. Never
 * unlink the lock: a replacement inode would permit a second writer.
 *
 * Linux flock(2) locks an open file description, not a PID. The inherited fd 3
 * shares that description with `file.fd`. util-linux flock's descriptor form
 * exits without LOCK_UN; closing the helper's copy leaves our copy locked.
 * The kernel releases it on close or process exit, including SIGKILL.
 * This requires /usr/bin/flock (util-linux) and a local filesystem on one host.
 */
export async function openWriterLock(path: string): Promise<Awaited<ReturnType<typeof open>>> {
    if (process.platform !== "darwin" && process.platform !== "linux") {
        throw new Error("Durable journals require a supported kernel file lock; this platform is not supported");
    }
    let file: Awaited<ReturnType<typeof open>>;
    try {
        file = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_NONBLOCK | constants.O_NOFOLLOW |
            (process.platform === "darwin" ? DARWIN_O_EXLOCK : 0), 0o600);
    } catch (error) {
        if (["EAGAIN", "EWOULDBLOCK"].includes((error as NodeJS.ErrnoException).code ?? "")) {
            throw new Error("Journal already has an active writer");
        }
        throw error;
    }
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
            throw new Error("Journal lock must be a private regular file");
        }
        if (process.platform === "linux") {
            // Absolute executable, no shell, no path reopening, no persistent
            // helper. A bounded failure must never produce an unlocked journal.
            const result = spawnSync("/usr/bin/flock", ["--exclusive", "--nonblock", "3"], {
                stdio: ["ignore", "ignore", "pipe", file.fd], timeout: 5000, killSignal: "SIGKILL",
                encoding: "utf8", maxBuffer: 16 * 1024,
            });
            if (!result.error && result.status === 1) throw new Error("Journal already has an active writer");
            if (result.error || result.status !== 0) {
                throw new Error("Linux durable journals require /usr/bin/flock (util-linux); kernel lock acquisition failed", {
                    cause: result.error ?? new Error(`flock exited ${result.status ?? result.signal}: ${result.stderr.trim()}`),
                });
            }
        }
        return file;
    } catch (error) {
        await file.close();
        throw error;
    }
}
