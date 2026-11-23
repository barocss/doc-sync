// Test-only preload. No production environment switch or transport hook is added.
import {ProposalStore} from "../src/proposal-store.ts";
import {existsSync, readFileSync} from "node:fs";
import {open, type FileHandle} from "node:fs/promises";
const stage = process.env.DOC_SYNC_PROPOSAL_TEST_STAGE;
async function pause(name: string) {
    if (stage !== name) return;
    process.stderr.write(`proposal-test-gate:${name}\n`);
    await new Promise<void>(() => undefined);
}
const begin = ProposalStore.prototype.beginAccept;
ProposalStore.prototype.beginAccept = async function (...args) {
    await pause("before-approval");
    const result = await begin.apply(this, args);
    await pause("after-approval");
    return result;
};
const prepared = ProposalStore.prototype.recordPreparedEvidenceDigest;
ProposalStore.prototype.recordPreparedEvidenceDigest = async function (...args) {
    const result = await prepared.apply(this, args);
    await pause("after-bridge");
    return result;
};
const applied = ProposalStore.prototype.markApplied;
ProposalStore.prototype.markApplied = async function (...args) {
    await pause("before-outcome");
    return applied.apply(this, args);
};

// A real FileHandle.sync fault in a test child. The parent toggles a private
// test sentinel only after the first acceptance has completed.
if (stage === "cached-sync-fail") {
    const source = await open(new URL(import.meta.url), "r"), prototype = Object.getPrototypeOf(source);
    await source.close();
    const sync = prototype.sync, fault = `${process.env.DOC_SYNC_HOSTED_CONFIG}.sync-fail`;
    prototype.sync = async function (this: FileHandle) {
        if (existsSync(fault) && (await this.stat()).isDirectory() === (readFileSync(fault, "utf8") === "directory")) {
            const error = Object.assign(new Error("Synthetic terminal approval sync failure"), {code: "EIO"}); throw error;
        }
        return sync.call(this);
    };
}
