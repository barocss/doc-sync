# Guided proposal recovery UI (#12), 2026-11-16

## Delta from #4

#4 provided inspection/decision/reconcile controls. This slice adds distinct
recovery explanations and original proof identifiers, saved-approval retry with
explicit reconfirmation and exact ID/digest retention for authoritative pending
records, and navigable immutable predecessor linkage. It grants no creator or
rebase capability to the owner browser. Uncertain server states remain original-
reconcile only. Stale/proven-not-applied versions cannot be approved again.

Server `supersedes` creation now requires a resolved non-applied predecessor
(stale/not_applied/rejected) in the same owner store. New successors always start
pending with no inherited decision. Exact existing creation retries retain their
stored result. This does not rewrite historical records.

Security review: new original-accept retry must compare the currently persisted
local ID/digest/kind inside the browser lock before sending; no competing local
attempt can be silently overwritten. Rendered metadata uses textContent, not HTML;
no new bridge endpoints or credentials are introduced. Receipt evidence is not a
claim that current text still matches after peer changes/undo.

Validation and uncompleted boundaries are recorded after final runs below.

Server proposal regression: **75/75 PASS** (29 seconds). Bridge security regression:
**6/6 PASS**. TypeScript and diff checks passed. The expanded Chrome run before the
final evidence-corruption addition passed 14 scenarios: two-browser peer edit and
stale refusal; successor re-review/cancel; reject; duplicate/cross-tab decisions;
post-response loss/reconcile/reload; pre-send loss and explicit same-ID retry with
cancellation; durable hosted service shutdown/recreation on the same port/store;
real peer race at conditional submission yielding proven not_applied; actor undo
preserving both human edits; editor handoff. The persisted pagehide/pageshow case
is synthetic lifecycle coverage, not a native BFCache traversal.

Restart coverage is hosted-service shutdown/recreation inside the fixture process,
not a process-kill recovery experiment. Error injection simulates response loss
before/after actual HTTP traffic; no claim of arbitrary network fault coverage.
Final model after proposal actor undos remains `Race peer Human `.

Final Chrome run: **15/15 scenarios PASS**. The final added case corrupts a genuine
synthetic not-applied plan on disk, verifies owner refresh rejects it with hidden
detail/no decision controls/no new writes, restores the exact original bytes,
and verifies not_applied evidence loads again. An earlier attempt failed because
the test fixture used a creator credential for owner-only inspection; the fixture
was corrected, then the complete 15-case suite passed. This did not require a
production authorization change. Final TypeScript/diff checks passed.

No screenshots or live access links are published in this report. Local generated
receipts/screenshots are ignored build artifacts containing only synthetic data.
Actual-model evaluation, long load and process-kill/browser BFCache qualification
remain outside this issue's bounded claim.
