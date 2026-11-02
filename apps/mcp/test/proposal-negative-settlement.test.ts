import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import {mkdtemp, rm, readFile, open, stat} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {SyncClient} from "@barocss/doc-sync/sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {ProposalStore} from "../src/proposal-store.ts";
import {IntentJournal} from "../src/journal.ts";
import {digest, POLICY_FINGERPRINT, proposalId} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
import {saveProposalEvidence, makeNotAppliedPlan, readNotAppliedPlan} from "../src/proposal-evidence.ts";
import {settleRejectedAttempt} from "../src/proposal-accept.ts";
const rawDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture() {
 const dir = await mkdtemp(join(tmpdir(), "negative-proof-")), physical = {origin: "http://localhost:4000", document: "test", actor: "agent"};
 const owner = {principal: "owner", routeKey: digest([physical.origin, physical.document, physical.actor]), actor: physical.actor};
 let store = await ProposalStore.open(dir, owner), journal = await IntentJournal.open(join(dir, "journal.json"), physical);
 const foreign = new Doc("foreign", DEMO_SCHEMA); foreign.edit([{op: "insert", at: [0, 0], content: "F"}]);
 const doc = Doc.fromSnapshot(physical.actor, foreign.snapshot(), DEMO_SCHEMA), snapshot = doc.snapshot(), edits = [{op: "insert" as const, at: [0, 1], content: "X"}];
 const request = {requestId: randomUUID(), base: {generation: "g", epoch: "e", serverSeq: 1, schemaVersion: schemaVersion(DEMO_SCHEMA)}, change: {kind: "replace_text" as const, path: [0], blockId: "block", start: 1, end: 1, replacement: "X"}, explanation: "test", assumptions: [], questions: [], checks: []};
 const pending = await store.create({format: 1, id: proposalId(owner, request.requestId), owner, request, ...previewReplacement("F", request.change), policyFingerprint: POLICY_FINGERPRINT});
 let record = (await store.beginAccept(pending.payload.id, randomUUID(), pending.proposalDigest, "grant"))!;
 const inert = {subscribe: () => () => {}, send: async () => {}, sendPresence: () => {}};
 const client = new SyncClient(physical.actor, inert, {schema: DEMO_SCHEMA}); client.doc = Doc.fromSnapshot(physical.actor, snapshot, DEMO_SCHEMA);
 const before = await journal.writeCheckpoint({generation: "g", epoch: "e", reservationId: "reservation", reservationConfirmed: true, sourceIntentDigest: "a".repeat(64), schema: DEMO_SCHEMA, client: client.checkpoint()});
 const intent = await journal.prepare({generation: "g", base: {epoch: "e", serverSeq: 1, schemaVersion: request.base.schemaVersion}, snapshot, schema: DEMO_SCHEMA, edits, change: {actor: physical.actor, seq: 1, ops: doc.edit(edits).ops}});
 const evidence = await saveProposalEvidence(store.directory, record, intent, physical);
 record = await store.recordPreparedEvidenceDigest(record.payload.id, record.attempt!.id, evidence.evidenceDigest);
 const receipt = {status: "not_applied" as const, generation: "g", requestDigest: intent.requestDigest, changeDigest: rawDigest(intent.change), sealId: intent.requestDigest};
 return {dir, physical, owner, before, intent, evidence, receipt, get store() {return store;}, get journal() {return journal;}, get record() {return record;},
  async reopen() {await journal.close(); await store.close(); store = await ProposalStore.open(dir, owner); journal = await IntentJournal.open(join(dir, "journal.json"), physical); record = (await store.get(record.payload.id))!;},
  async close() {await journal.close(); await store.close(); await rm(dir, {recursive: true, force: true});}};
}
for (const stage of ["proof", "checkpoint", "clear", "terminal"] as const) test(`negative settlement restarts after ${stage} without startup, edit replay or history loss`, async () => {
 const f = await fixture(); let calls = 0;
 try {
  const target = stage === "proof" || stage === "terminal" ? f.store : f.journal;
  const method = stage === "proof" ? "recordNotAppliedPlan" : stage === "checkpoint" ? "writeCheckpoint" : stage === "clear" ? "clearAfterNotApplied" : "markNotApplied";
  const original = (target as any)[method].bind(target);
  (target as any)[method] = async (...args: unknown[]) => {const result = await original(...args); throw new Error("simulated process stop");};
  const transport = {reserveRecovery: async () => ({status: "protected", existing: true}), getRecoveryState: async () => ({generation: "g", schemaVersion: schemaVersion(DEMO_SCHEMA), serverSeq: 1}), settleConditional: async () => {calls++; return f.receipt;}} as any;
  await assert.rejects(settleRejectedAttempt(f.store, f.record, f.journal, transport, f.evidence), /simulated/);
  await f.reopen();
  if (f.record.status !== "not_applied") assert.equal((await settleRejectedAttempt(f.store, f.record, f.journal, transport, f.evidence))?.status, "not_applied");
  assert.equal(calls, 1); assert.equal(await f.journal.read(), null);
  const after = (await f.journal.readCheckpoint())!, expected = structuredClone(f.before);
  expected.client.snapshot.lamport = after.client.snapshot.lamport; expected.recordDigest = after.recordDigest;
  assert.deepEqual(after, expected); assert.ok(after.client.snapshot.lamport > f.before.client.snapshot.lamport);
  assert.equal((await f.store.list()).filter(r => !["not_applied", "applied", "stale"].includes(r.status)).length, 0);
  const fresh = Doc.fromSnapshot(f.physical.actor, after.client.snapshot, DEMO_SCHEMA).edit(f.intent.edits).ops;
  assert.notEqual(rawDigest(fresh), rawDigest(f.intent.change.ops));
 } finally {await f.close();}
});
test("unknown and mismatched negative evidence preserve the journal and checkpoint", async () => {
 const f = await fixture();
 try {
  const before = await readFile(f.journal.path), checkpoint = await readFile(`${f.journal.path}.checkpoint`);
  assert.equal(await settleRejectedAttempt(f.store, f.record, f.journal, {reserveRecovery: async () => ({status: "protected", existing: true}), getRecoveryState: async () => ({generation: "g", schemaVersion: schemaVersion(DEMO_SCHEMA), serverSeq: 1}), settleConditional: async () => ({status: "unknown"})} as any, f.evidence), null);
  for (const receipt of [{...f.receipt, generation: "other"}, {...f.receipt, requestDigest: "b".repeat(64)}, {...f.receipt, changeDigest: "b".repeat(64)}, {...f.receipt, sealId: "b".repeat(64)}]) assert.throws(() => makeNotAppliedPlan(f.evidence, receipt, f.before));
  assert.deepEqual(await readFile(f.journal.path), before); assert.deepEqual(await readFile(`${f.journal.path}.checkpoint`), checkpoint);
  assert.equal(await readNotAppliedPlan(f.store.directory, f.record), null);
 } finally {await f.close();}
});
test("unexpected pending, source tag, sequence or missing plan blocks cleanup", async () => {
 const f = await fixture();
 try {
  for (const change of [ (x: any) => x.client.pending.push(f.intent.change), (x: any) => x.sourceIntentDigest = f.intent.recordDigest, (x: any) => x.client.seq++, (x: any) => x.reservationConfirmed = false ]) {
   const checkpoint = structuredClone(f.before); change(checkpoint); const {recordDigest: _, ...rest} = checkpoint; checkpoint.recordDigest = rawDigest(rest);
   assert.throws(() => makeNotAppliedPlan(f.evidence, f.receipt, checkpoint));
  }
  const plan = makeNotAppliedPlan(f.evidence, f.receipt, f.before);
  await f.store.recordNotAppliedPlan(f.record.payload.id, f.record.attempt!.id, plan.planDigest).then(() => assert.fail("missing plan accepted"), () => {});
  assert.ok(await f.journal.read());
 } finally {await f.close();}
});

for (const boundary of ["plan", "checkpoint"] as const) test(`fsync failure at ${boundary} is retried before intent deletion`, async () => {
 const f = await fixture(), probe = await open(f.journal.path, "r"), prototype = Object.getPrototypeOf(probe), original = prototype.sync;
 await probe.close(); let failures = 0;
 const directoryStat = await stat(boundary === "plan" ? join(f.store.directory, "attempts") : f.dir);
 const transport = {reserveRecovery: async () => ({status: "protected", existing: true}), getRecoveryState: async () => ({generation: "g", schemaVersion: schemaVersion(DEMO_SCHEMA), serverSeq: 1}), settleConditional: async () => f.receipt} as any;
 try {
  prototype.sync = async function() {
   const stat = await this.stat();
   if (stat.isDirectory() && stat.ino === directoryStat.ino && stat.dev === directoryStat.dev) {
    let reached = false;
    if (boundary === "plan") {
     try {await readFile(join(f.store.directory, "attempts", `${f.record.attempt!.id}.not-applied.json`)); reached = true;} catch {}
    } else {
     const disk = JSON.parse(await readFile(`${f.journal.path}.checkpoint`, "utf8"));
     reached = disk.client.snapshot.lamport > f.before.client.snapshot.lamport;
    }
    if (reached) {failures++; throw Object.assign(new Error("injected durable barrier EIO"), {code: "EIO"});}
   }
   return original.call(this);
  };
  await assert.rejects(settleRejectedAttempt(f.store, f.record, f.journal, transport, f.evidence), /EIO/);
  assert.ok(await f.journal.read());
  const beforeRetry = failures;
  await assert.rejects(settleRejectedAttempt(f.store, (await f.store.get(f.record.payload.id))!, f.journal, transport, f.evidence), /EIO/);
  assert.ok(failures > beforeRetry); assert.ok(await f.journal.read());
  prototype.sync = original;
  await f.reopen();
  assert.equal((await settleRejectedAttempt(f.store, f.record, f.journal, transport, f.evidence))?.status, "not_applied");
  assert.equal(await f.journal.read(), null);
 } finally {prototype.sync = original; await f.close();}
});
