# Server proposal target policy (#11), 2026-11-16

The optional owner route policy pins generation, epoch, server sequence, schema
version, root path, stable block ID, UTF-16 selection interval and replace_text
operation. Server sequence is essential: an insertion earlier in the same block
would otherwise silently shift a numeric authorized interval.

Stored proposals bind an optional policy snapshot and canonical derived fingerprint.
Parsing checks both, old unconfigured records retain their original fingerprint,
and accept/reconcile require the current policy to match. Actual prepared wire
operations still undergo the prior independent exact-edit authorization. Policy
capture and fresh accept fail before actor journal/start when the pinned current
revision is stale. Single-request policy snapshots are used; live policy reload
or mid-request revocation is not advertised.

Direct MCP edit/retry/undo/redo/schema/presence/history tools are denied even for
write-bearing grants on a policy route. Old actor checkpoint/recovery prevents
normal MCP startup, avoiding an initialization replay bypass. Proposal receipt
reconciliation is separate and requires original policy/evidence. No token/schema
permission expansion, model execution, external data or long-load testing.

Independent peer regression covers insert-before, split, block replacement,
movement and schema transition: target/new creation/fresh acceptance denied,
no additional conditional submission and actor journal files unchanged. Positive
proposal acceptance and exact receipt repetition are tested separately. Policy
change blocks original acceptance/reconciliation. Explicit configuration absent
means legacy behavior; this is route mutation authority, not global document ACL
or read redaction. Renew after every revision only after owner review.

Validation counts are recorded after final regression below.

Final validation: MCP **223 passed / 2 platform skips / 0 failed** (39.4s), bot
**102/102 passed** (30.6s), focused policy/peer **10/10 passed**, TypeScript noEmit
and diff checks passed. Real hosted MCP mutation denial and checkpoint startup
rejection are included, not merely unit-level permission tests. New tests cover
terminal receipt reconciliation under identical policy; existing recovery tests
remain regression coverage, not a new exhaustive policy+crash schedule proof.

Security review was split between implementation and independent integration/code
review. No credential-bearing API or log was added. The current-state probe is not
a distributed atomic lock: a later peer race is still guarded by existing exact
conditional submission and prepared wire proof. A race after admission can leave
normal recovery bookkeeping; the unchanged-journal assertion specifically covers
already-stale denial before admission, not every possible network interleaving.
