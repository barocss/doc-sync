import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, rm, readFile, writeFile, chmod, symlink, link} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash, randomUUID} from "node:crypto";
import {Doc, schemaVersion} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {IntentJournal} from "../src/journal.ts";
import {ProposalStore} from "../src/proposal-store.ts";
import {digest, POLICY_FINGERPRINT, proposalId} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
import {saveProposalEvidence, readProposalEvidence, parseProposalEvidence} from "../src/proposal-evidence.ts";

test("exact immutable private bridge validates actor, route, approval, base and reproduced operations", async () => {
 const dir=await mkdtemp(join(tmpdir(),"proposal-bridge-")); const physical={origin:"http://localhost:4000",document:"test",actor:"agent"};
 const owner={principal:"owner",routeKey:digest([physical.origin,physical.document,physical.actor]),actor:physical.actor}; const store=await ProposalStore.open(dir,owner);
 const journal=await IntentJournal.open(join(dir,"journal.json"),{document:physical.document,actor:physical.actor});
 try {
  const doc=new Doc(physical.actor,DEMO_SCHEMA), snapshot=doc.snapshot(), edits=[{op:"insert" as const,at:[0,0],content:"X"}];
  const request={requestId:randomUUID(),base:{generation:"g",epoch:"e",serverSeq:0,schemaVersion:schemaVersion(DEMO_SCHEMA)},change:{kind:"replace_text" as const,path:[0],blockId:"block",start:0,end:0,replacement:"X"},explanation:"test",assumptions:[],questions:[],checks:[]};
  const pending=await store.create({format:1,id:proposalId(owner,request.requestId),owner,request,...previewReplacement("",request.change),policyFingerprint:POLICY_FINGERPRINT});
  const approved=(await store.beginAccept(pending.payload.id,randomUUID(),pending.proposalDigest,"decision"))!;
  const exact=await journal.prepare({generation:"g",base:{epoch:"e",serverSeq:0,schemaVersion:request.base.schemaVersion},snapshot,schema:DEMO_SCHEMA,edits,change:{actor:physical.actor,seq:1,ops:doc.edit(edits).ops}});
  const bridge=await saveProposalEvidence(store.directory,approved,exact,physical);
  assert.deepEqual(await saveProposalEvidence(store.directory,approved,exact,physical),bridge);
  assert.deepEqual(await readProposalEvidence(store.directory,approved,physical),bridge);
  assert.throws(()=>parseProposalEvidence(bridge,approved,{...physical,actor:"other"}));
  assert.throws(()=>parseProposalEvidence({...bridge,journal:{...exact,edits:[]}},approved,physical));
  const modified=structuredClone(bridge); modified.journal.edits=[];
  const {recordDigest:_,...journalRest}=modified.journal; modified.journal.recordDigest=createHash("sha256").update(JSON.stringify(journalRest)).digest("hex");
  const {evidenceDigest:__,...bridgeRest}=modified; modified.evidenceDigest=digest(bridgeRest);
  assert.throws(()=>parseProposalEvidence(modified,approved,physical),/reproduce/);
  const changedOwner={...approved.payload.owner,principal:"other"}; assert.throws(()=>parseProposalEvidence(bridge,{...approved,payload:{...approved.payload,owner:changedOwner}},physical));
  await assert.rejects(store.recordPreparedEvidenceDigest(pending.payload.id,approved.attempt!.id,digest("wrong")));
  const attempts=join(store.directory,"attempts"), evidencePath=join(attempts,`${approved.attempt!.id}.json`), evidenceRaw=await readFile(evidencePath);
  await rm(evidencePath);
  const {spawnSync}=await import("node:child_process"); assert.equal(spawnSync("/usr/bin/mkfifo",["-m","600",evidencePath]).status,0);
  await assert.rejects(readProposalEvidence(store.directory,approved,physical)); await assert.rejects(saveProposalEvidence(store.directory,approved,exact,physical)); await rm(evidencePath);
  for(let i=0;i<256;i++) await writeFile(join(attempts,`preserved-${i}`),"unresolved",{mode:0o600});
  await assert.rejects(saveProposalEvidence(store.directory,approved,exact,physical),/quota/);
  for(let i=0;i<256;i++) assert.equal(await readFile(join(attempts,`preserved-${i}`),"utf8"),"unresolved");
  for(let i=0;i<256;i++) await rm(join(attempts,`preserved-${i}`));
  if(process.getuid?.()!==0){await chmod(attempts,0o500); await assert.rejects(saveProposalEvidence(store.directory,approved,exact,physical)); await chmod(attempts,0o700);}
  await writeFile(evidencePath,evidenceRaw,{mode:0o600});
  const prepared=await store.recordPreparedEvidenceDigest(pending.payload.id,approved.attempt!.id,bridge.evidenceDigest);
  await assert.rejects(store.markApplied(pending.payload.id,approved.attempt!.id,{status:"accepted",generation:"g",serverSeq:1,recordDigest:digest("wrong"),requestDigest:exact.requestDigest}));
  const applied=await store.markApplied(pending.payload.id,approved.attempt!.id,{status:"accepted",generation:"g",serverSeq:1,recordDigest:exact.recordDigest,requestDigest:exact.requestDigest});
  assert.equal(applied.status,"applied"); assert.equal(prepared.attempt?.evidenceDigest,bridge.evidenceDigest);
  const path=join(store.directory,"attempts",`${approved.attempt!.id}.json`), original=await readFile(path);
  await writeFile(path,"corrupt"); await assert.rejects(readProposalEvidence(store.directory,applied,physical)); assert.equal(await readFile(path,"utf8"),"corrupt");
  await rm(path); const target=join(dir,"target"); await writeFile(target,original,{mode:0o600});
  await symlink(target,path); await assert.rejects(readProposalEvidence(store.directory,applied,physical)); await rm(path);
  await link(target,path); await assert.rejects(readProposalEvidence(store.directory,applied,physical)); await rm(path);
  await writeFile(path,original,{mode:0o600}); await chmod(path,0o644); await assert.rejects(readProposalEvidence(store.directory,applied,physical));
 } finally {await journal.close(); await store.close(); await rm(dir,{recursive:true,force:true});}
});
