# Persistent reviewer checkpoint API (#18)

This is an opt-in local API slice of B5, not a CLI integration or a persistent
production AI service. `ReviewWatch` and the existing `watch` command remain
in-memory and unchanged. No provider/model is invoked by this API or its tests.

## Contract

`PersistentReviewWatch.open({file,binding,maxRuns}, read, review)` claims a private
local checkpoint and exposes polling, stop and close. The caller supplies a
64-hex digest of an explicit nonsecret identity/configuration contract; it must
cover the intended endpoint, document, task and reviewer/model configuration.
The API cannot prove that a hash represents those facts and does not authorize
access, isolate a callback or attest a real model identity. Never use a bearer
or credential as a binding input. The callbacks are trusted application code.

Baseline and budget survive a clean restart. Before a reviewer callback, consumed
budget and an in-flight marker are saved and synced. Only a completed callback
plus a valid post-read can advance the baseline, and only to the originally
captured sequence. Newer peer changes remain for a later poll within the budget.
Interrupted/uncertain state does not automatically run again. It may have called
a provider or performed another callback effect; lack of checkpoint completion
is not proof of nonexecution, nonbilling or rollback. There is no automatic
repair, cursor reset, budget reset or migration.

## Local storage boundary

The immediate directory must be owned/private, checkpoint files private regular
bounded JSON, and writers exclusively claimed using the existing supported local
kernel-lock implementation. File and directory fsync plus atomic replacement
protect checkpoints within the existing local-filesystem assumptions, not
arbitrary network/distributed storage or power-loss guarantees. A lock must not
be unlinked or replaced to bypass a live writer. A compromised same-user host
or malicious trusted callback is outside this boundary.

## Not delivered

No CLI flag/default change, persistent scheduler, cross-process task dispatcher,
automatic approval/edit, true exactly-once callback guarantee, recovery UI,
production deployment, actual-model result or long load. Existing #10/#14
provider/actual-model gates remain open. Original checkout WIP is untouched.

## Lifecycle semantics and inspected evidence

`stop()` persists stopped when awaited; stopped checkpoints cannot reopen without
inspection. `close()` drains active work without cancelling it and releases the
writer claim; clean ready checkpoints may resume. Neither should be awaited
inside its own read/review callback, because both drain that callback. Slow or
stuck trusted callbacks retain the lock; no unsafe forced unlock is provided.
Budget exhaustion remains terminal for that fixed budget, without claiming all
later changes were reviewed.

A real separate process test acquired the writer lock, synced an in-flight
marker, then paused inside a synthetic callback. A competing open was rejected.
After SIGKILL, a fresh open refused unfinished state before any read/review, and
checkpoint bytes remained unchanged. This is a process-crash test, not a power
loss or provider billing test. Initial targeted process test passed.

## Independent review and short tests

Persistent API tests plus the separate process test and existing in-memory
watcher tests passed **33/33**. TypeScript and whitespace checks passed.
Private file permission/symlink/hardlink/size/shape validation, binding/budget
mismatch, successful reopen, exhausted budget, overlapping polls, stop/close,
post-read schema/regression failures and callback failures are covered.
Real directory permission failures before callback prevented dispatch and left
the prior ready checkpoint; failures after callback retained in-flight evidence
and refused reopen. Both failed instances became unusable. This is not fault
injection at every filesystem/fsync instruction or storage-device failure.

Final sequential validation: docs build/link check PASS (55 pages, 2,613 internal
links), full bot **160/160 PASS** (51.3 seconds). No package build overlapped tests.
