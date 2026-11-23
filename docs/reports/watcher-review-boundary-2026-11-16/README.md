# Watcher review completion boundary (#15)

## Reproduced

At 162ad040 a synthetic read returned one shared state object. A review callback changed its schema and sequence from s/2 to changed/3. The watcher returned `reviewed`, then `unchanged`, with `done:false`. It silently adopted a schema and sequence not covered by the original review. Separate immutable read objects also lacked a post-review state check.

## Change

`apps/bot/src/watch.ts` snapshots validated primitive identity and sequence fields before awaiting review. After a completed callback it reads state again and rejects generation/epoch/schema changes, invalid state, read failures or sequence regression. The baseline advances only to the originally reviewed sequence, not to newer peer changes seen in the final read. Those changes remain eligible for the next poll within its budget. Stop during review or final read returns stopped; it does not undo or interrupt an already-running callback. The existing busy guard and bounded run count remain.

## Scope

This is the experimental in-memory review watcher, not persistent coordination or a production snapshot-isolation guarantee. A change after final validation is observed by the next poll; max-run exhaustion still stops rather than promising all edits were reviewed. The callback's own completion claim is not independently proven by these state checks. No actual model, external user-document transmission, long-load test or automatic edits. #10/#14 actual-model work remains open. Original checkout WIP is untouched.

## Validation

Independent review found no blocking issue. Focused watcher tests: 22/22 PASS (19 new interrupted-review cases plus 3 existing). They cover shared and fresh read objects, each identity field, invalid/regressed sequence, later peer changes, stop during review/post-read, and failed post-read. Workspace TypeScript and whitespace checks pass. Full bot and docs checks are recorded in the issue checkpoint; all use synthetic callbacks, not a model.

Final sequential validation: docs build/link check PASS (55 pages / 2,613 internal links); full bot suite **136/136 PASS** (54.1 seconds). No package rebuild overlapped the test suite.
