# Creator planner slice, 2026-11-16 (#10 partial)

## Delivered

- Authenticated creator-only `POST /proposals/target` captures one root stored,
  unstyled text target with its exact generation/epoch/sequence/schema and stable
  block ID. Existing read-only capture proves settled state before and after;
  it cannot send changes or presence and refuses unresolved journal/outstanding
  proposal recovery. No owner policy expansion (#11).
- Trusted injected planner receives a data copy. Runtime owns base, identity,
  request ID and objective digest. Strict output rejects extra authority, no-op,
  unsupported Unicode/newlines and out-of-range changes.
- Private mission stores exact intent before create; same request survives lost
  response/restart. Lock prevents concurrent planners. Unknown never creates a
  fresh request or refreshes a stale base. Owner still explicitly reviews/applies
  through the existing workspace; creator cannot apply/reject/reconcile.
- Prepared private JSON CLI is an intake/demo path, not a real model invocation.
  Its contents are not proven generated from the freshly captured target.

## Evidence

- Bot suite: 101/101 passed before final independent-review hardening; focused
  client/planner/hosted suite after hardening: 10/10 passed (includes raw and
  escaped bearer reflection rejection). Final full bot rerun: **102/102 PASS** (21.5 seconds).
- MCP proposal suite: 64/64 passed. TypeScript noEmit and diff whitespace pass.
- Real local hosted fixture tests: no conditional edit before owner accept;
  creator accept denied; explicit owner apply idempotent; lost response yields one
  proposal; rejected proposal is not reapplied; peer edit between capture/create
  leaves original request unknown and never silently rebinds; wrong grant/path
  rejected. No paid model, external data, or long-running load test.
- Independent review of transport, host capture, adapter and CLI: credential
  reflection gap corrected before commit; shared preview validation reused to
  reject unsupported replacement before persisting/sending.

## Not completed / do not infer

#10 remains open. Actual-model credential/process isolation and model-driven
planning→review orchestration are not supplied. Existing Codex direct runner is
not reused: it inherits host environment and is not an isolation proof. Injected
functions are trusted code, not sandboxed plugins. A raw objective string is not
the structured brief verifier. `created` is historical storage acknowledgement,
not current pending/applied status or verified completion. No browser rerun or
model quality evaluation is claimed here; #4 has its separately recorded browser
coverage and #14 tracks short actual-model evaluation.

Hard crash can leave a lock requiring inspected manual recovery. All failed
create outcomes conservatively return unknown, including explicit stale failure;
recovery UX remains #12. Local source checkout's unrelated 41 tracked WIP files
and roadmap edits are untouched; this slice is built in the independent tree.
