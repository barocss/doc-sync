import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, access, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {ProposalStore} from "../src/proposal-store.ts";
import {digest, POLICY_FINGERPRINT, proposalId, parseProposalRecord} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
const owner={principal:"p",actor:"a",routeKey:digest(["origin","doc","a"])};
function payload(){const request={requestId:randomUUID(),base:{generation:"g",epoch:"e",serverSeq:0,schemaVersion:"s"},change:{kind:"replace_text" as const,path:[0],blockId:"b",start:1,end:2,replacement:"X"},explanation:"why",assumptions:[],questions:[],checks:[]};return {format:1 as const,id:proposalId(owner,request.requestId),owner,request,...previewReplacement("abc",request.change),policyFingerprint:POLICY_FINGERPRINT};}
test("approval persists, exact UUID/grant retries survive restart; accept/reject has one winner",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"proposal-decisions-"));let store=await ProposalStore.open(dir,owner);
 try {
  const pending=await store.create(payload()), decision=randomUUID();
  const results=await Promise.allSettled([store.beginAccept(pending.payload.id,decision,pending.proposalDigest,"grant"),store.reject(pending.payload.id,randomUUID(),pending.proposalDigest,"grant")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const approved=(await store.get(pending.payload.id))!; assert.equal(approved.status,"applying");
  await assert.rejects(store.beginAccept(pending.payload.id,decision,pending.proposalDigest,"other"));
  await assert.rejects(store.beginAccept(pending.payload.id,randomUUID(),pending.proposalDigest,"grant"));
  await assert.rejects(store.beginAccept(pending.payload.id,decision,digest("wrong"),"grant"));
  await assert.rejects(store.recordPreparedEvidenceDigest(pending.payload.id,decision,digest("missing")));
  await store.close(); store=await ProposalStore.open(dir,owner);
  assert.deepEqual(await store.beginAccept(pending.payload.id,decision,pending.proposalDigest,"grant"),approved);
  const uncertain=await store.markUnconfirmed(pending.payload.id,decision);assert.equal(uncertain.status,"unconfirmed");
  assert.deepEqual(await store.beginAccept(pending.payload.id,decision,pending.proposalDigest,"grant"),uncertain);
  const attention=await store.markNeedsAttention(pending.payload.id,decision); assert.equal(attention.status,"needs_attention");
  const second=await store.create(payload()); await assert.rejects(store.beginAccept(second.payload.id,decision,second.proposalDigest,"grant"));
  const stale=await store.markStale(pending.payload.id,decision);assert.equal(stale.status,"stale"); await assert.rejects(store.markUnconfirmed(pending.payload.id,decision));
  const firstPath=join(store.directory,`${pending.payload.id}.json`), secondPath=join(store.directory,`${second.payload.id}.json`);
  const firstBytes=await readFile(firstPath), secondBytes=await readFile(secondPath);
  await assert.rejects(store.beginAccept(second.payload.id,decision,second.proposalDigest,"grant"));
  assert.deepEqual(await readFile(firstPath),firstBytes); assert.deepEqual(await readFile(secondPath),secondBytes);
  assert.equal((await store.beginAccept(second.payload.id,randomUUID(),second.proposalDigest,"grant"))?.status,"applying");
  const path=join(store.directory,`${pending.payload.id}.json`),raw=await readFile(path,"utf8"), bad=JSON.parse(raw);bad.attempt.id=randomUUID();delete bad.recordDigest;bad.recordDigest=digest(bad);
  assert.throws(()=>parseProposalRecord(bad,owner));await writeFile(path,JSON.stringify(bad));await assert.rejects(store.get(pending.payload.id));
 } finally {await store.close();await rm(dir,{recursive:true,force:true});}
});
test("startup inspection creates no absent storage and sees durable unresolved approvals",async()=>{
 const root=await mkdtemp(join(tmpdir(),"proposal-inspect-")),dir=join(root,"absent");
 try {assert.deepEqual(await ProposalStore.inspectOutstanding(dir,owner),[]);await assert.rejects(access(dir)); const store=await ProposalStore.open(dir,owner);const pending=await store.create(payload());await store.beginAccept(pending.payload.id,randomUUID(),pending.proposalDigest,"g");await store.close();assert.equal((await ProposalStore.inspectOutstanding(dir,owner)).length,1);assert.deepEqual(await ProposalStore.inspectOutstanding(dir,{...owner,principal:"other"}),[]);} finally {await rm(root,{recursive:true,force:true});}
});
