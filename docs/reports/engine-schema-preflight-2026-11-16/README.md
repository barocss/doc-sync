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
