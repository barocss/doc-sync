# Client engine schema preflight (#29)

Baseline: 09ad63edcbb572455a8b0f0acc9cb081a72acf63.
A supported TypeScript engine apply batch inserted text then set a numeric
attribute to 99 outside [0,10]. It returned two operations and mutated its live
snapshot, while engine.check rejected the same operations. Detached compilation
alone did not validate atomic values; model projection hid the invalid value.

## Change

`packages/doc-sync/src/engine/typescript-client.ts` checks the detached compiled
batch using the original document's `check` before live compilation. This shares
the hub's CRDT/schema check, not its authorization or persistence callbacks.
Checks run against the original base, not the already-applied draft. Same-batch
new-token references remain valid. Raw Doc.edit and existing bounded fast paths
are unchanged. This intentionally rejects local inputs previously projected to
defaults and rejected later by the server. It does not alter object enum identity.

## Evidence

`engine-schema-preflight.test.ts` covers scalar enum/range/pattern, value/boolean
marks, single and mixed late-invalid batches, existing pending/history/events and
clock preservation, peer text delivery, valid updates, undo/redo, and creation
followed by an update to new storage in one batch.

- Initial new fixture had a missing closing brace; corrected before assertions.
- Focused regression: 11/11 PASS.
- Existing TypeScript engine regression: 17/17 PASS.
- Package build and typecheck PASS.
- Full core suite: 1679/1679 PASS (56.5 seconds), then focused 11/11 with
  the additional scalar-enum and same-batch new-storage cases.
- Docs build/link check: 56 pages, 2684 links PASS.

Independent source review confirmed preflight ordering and original-base check;
it also identified fast-path scope and legacy raw Doc boundaries above.
No actual-model, native parity, remote CI or long-duration load claim.


## No-text fast-path follow-up

Independent in-memory review found that a physical `text:false` target could
still take the single-string fast path, mutate locally, then produce operations
rejected by Doc.check. Schemas containing any no-text text rule now route inserts
through detached compilation and the original-base wire check. This conservatively
prioritizes admission correctness over insertion speed for those schemas; it is
not a new universal projection-level prohibition. Document mixed-type flows retain
their existing flow-level wire policy, while graphic container admission retains
its birth-type restriction. No schema wire-policy change or raw Doc change.

Focused tests cover string/marked-run refusal, unchanged clock/checkpoint,
pending/History/events, retained peer block, mixed document-flow acceptance and
graphic no-text versus caption behavior. Expanded focused regression 14/14 PASS;
existing engine fast-path tests also pass (combined earlier focused run 30/30).
Package build PASS. No performance qualification for no-text schemas or long load.

Final full core 1685/1685 PASS (40.6 seconds), package typecheck and docs
56 pages/2684 links PASS.

Independent diff review found no blocking issue. The admission guard scans
schema node metadata on insertion even for ordinary schemas; no unchanged
performance claim is made.
