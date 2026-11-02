// Test-only crash barriers. Runtime code has no crash or fault switch.
import {ProposalStore} from "../src/proposal-store.ts";
import {IntentJournal} from "../src/journal.ts";
import {readFileSync, readdirSync, statSync} from "node:fs";
import {open, type FileHandle} from "node:fs/promises";
import {join} from "node:path";

const stage = process.env.DOC_SYNC_REJECTION_TEST_STAGE;
let retiring = false;
let writingRetiredCheckpoint = false;
async function pause(name: string) {
    if (stage !== name) return;
    process.stderr.write(`rejection-test-gate:${name}\n`);
    await new Promise<void>(() => undefined);
}
const plan = ProposalStore.prototype.recordNotAppliedPlan;
ProposalStore.prototype.recordNotAppliedPlan = async function (...args) {
    const result = await plan.apply(this, args);
    retiring = true;
    await pause("after-plan");
    return result;
};
const checkpoint = IntentJournal.prototype.writeCheckpoint;
IntentJournal.prototype.writeCheckpoint = async function (...args) {
    writingRetiredCheckpoint = retiring;
    try {
        const result = await checkpoint.apply(this, args);
        if (retiring) await pause("after-checkpoint");
        return result;
    } finally { writingRetiredCheckpoint = false; }
};
const clear = IntentJournal.prototype.clearAfterNotApplied;
IntentJournal.prototype.clearAfterNotApplied = async function (...args) {
    const result = await clear.apply(this, args);
    await pause("after-clear");
    return result;
};
const terminal = ProposalStore.prototype.markNotApplied;
ProposalStore.prototype.markNotApplied = async function (...args) {
    await pause("before-terminal");
    return terminal.apply(this, args);
};

// Inject EIO at actual fsync calls after the plan link or checkpoint rename.
// The fault remains active after a process restart with the same preload stage.
if (stage?.endsWith("sync-fail")) {
    const source = await open(new URL(import.meta.url), "r"), prototype = Object.getPrototypeOf(source);
    await source.close();
    const sync = prototype.sync;
    const dataDir = JSON.parse(readFileSync(process.env.DOC_SYNC_HOSTED_CONFIG!, "utf8")).dataDir as string;
    function planFile(directory: string): string | undefined {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) { const found = planFile(path); if (found) return found; }
            else if (entry.name.endsWith(".not-applied.json")) return path;
        }
    }
    prototype.sync = async function (this: FileHandle) {
        const file = await this.stat();
        const plan = planFile(dataDir);
        const fault = plan && (stage === "plan-file-sync-fail" && file.ino === statSync(plan).ino ||
            stage === "plan-directory-sync-fail" && file.isDirectory() ||
            stage === "checkpoint-directory-sync-fail" && writingRetiredCheckpoint && file.isDirectory());
        if (fault) {
            process.stderr.write(`rejection-test-fault:${stage}\n`);
            throw Object.assign(new Error(`Synthetic rejection ${stage}`), {code: "EIO"});
        }
        return sync.call(this);
    };
}
