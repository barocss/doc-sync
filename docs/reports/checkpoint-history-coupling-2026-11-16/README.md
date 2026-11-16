# Checkpoint History coupling (#31)

Baseline 1d7dc6c92a854ef86fc174b623f28b2cc787289e. In-memory reproduction:
B inserts and records HUMAN; A receives it; replacing A checkpoint History with
B History was accepted by production prepare/installCheckpoint. A.undo then
deleted all B text. This is malformed/mixed local recovery input, not evidence
that an arbitrary remote peer can inject a checkpoint or bypass server auth.

## Change

Extract the existing LocalClient known-field coupling validator into
`engine/checkpoint-validation.ts`, keep its local entry point, and call it before
production engine prepared-handle creation. Check retained document/History
references, saved allocation bounds and applicable actor ownership. SyncClient
restore formats 1 and 2 inherit this boundary. No checkpoint format change.

Initial reuse exposed a pre-existing local-validator overrestriction: valid redo
of a locally deleted foreign token has null delAt after undo. Initial focused
runs were 27/28 and 4/5 due to this case. Validation is now stack-aware: undo/null
is insertion ownership; non-null deletion tickets on either stack must be local;
redo/null permits foreign targets. Corrected combined focused suite 33/33 PASS.

## Limits

A null redo deletion ticket loses the original delete provenance. This does not
cryptographically authenticate arbitrary forged redo state or reconstruct full
operation history. Current snapshot format cannot provide that proof. Existing
trusted-storage, generation and GC recovery requirements remain. User attribute
payloads are not recursively treated as ticket metadata. Draft engine, raw Doc
semantics and checkpoint wire format are not expanded by this change.

## Regression evidence

Dedicated tests cover swapped peer insertion History, absent target, insufficient
clock, unchanged engine state/stamp, SyncClient metadata/pending/events, valid
local deletion of foreign text and restored redo, and LocalClient restore parity.
Dedicated focused tests: 6/6 PASS; full core: 1691/1691 PASS (42.9 seconds).
Initial typecheck found a wrong Transport type import and missing Run union
narrowing in new tests; corrected before final verification.
Native/actual-model evaluation and long load are not claimed. Original unpublished
native WIP remains untouched.

Final typecheck and focused 6/6 rerun PASS after test annotation fixes.
Docs build/link check: 56 pages, 2685 links PASS. Independent diff review
found no blocking issue within the documented provenance limits.
