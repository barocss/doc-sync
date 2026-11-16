# Bounded mission schema interruption qualification (#13)

This slice qualifies the conservative public workflow rather than implementing
an implicit schema/history migration. No new model permission, native transition
or automatic upgrade is introduced. Existing server exact-base checks, bounded
planning bindings, private persisted request replay and route policy restrictions
remain the mechanisms.

Creator and direct-writing bot workflows are distinct. A new initial capture may
use a newer verified schema; an already saved mission cannot swap its schema/base
or target on retry. Unknown creation retains the exact request even after a schema
conflict. Fresh linked successor review is permitted only after a terminal
non-applied predecessor; unresolved application is never treated as permission
to start again. Route policies require explicit owner renewal after revision
changes. Actual model execution remains unfinished #10, not qualified here.

Independent hosted test applies a proposal, adds a foreign edit, explicitly changes
the peer schema, then reconciles the original receipt without resubmission or
checkpoint-byte changes. Normal policy-route MCP startup refuses the old
checkpoint. Explicit peer actor undo removes only its Human text, preserving AI
text, pending=0 and redo history. This tests actor separation, not automatic AI
history migration.

Final targeted/full regression counts and limitations follow below.

Targeted evidence: **7/7 bot schema tests PASS** (~5.1s), including a genuine new
creator process reading the saved mission after schema drift and returning the
same unknown request ID with byte-identical intent, no planner call and no
conditional submission. Tests also cover current-schema initial capture, drift
while planning, stored-created historical acknowledgment, direct bounded runner
interruption during planning/after one confirmed edit, persisted target binding,
and incompatible mark ordering/attribute default transitions with exact model,
history and pending preservation and zero model events/notification errors.
The independent post-confirmed hosted test passes separately.

The full bot suite passed **109/109** before the final child-process assertion was
added to the existing targeted test; that final targeted suite was rerun afterward.
There is no claim of automatic migration or resumed writing after schema drift.
Direct runner interruption can report a generic disconnected-session error after
the schema stream changes; its saved intent/binding remains available for review.
Actual-model, arbitrary schema combinations, native engine and long-load behavior
are not qualified by these bounded synthetic cases.

Proposal suite: initial parallel run was **75 PASS / 1 FAIL**, an HTTP503 in the
existing scalar-range replacement acceptance test. The isolated acceptance file
then passed **8/8** and full proposal rerun with test-concurrency=2 passed **76/76**
(40.3s). The original503 root cause is not proven fixed or attributed to production
schema logic; no unrelated production change was made to mask it. Typecheck and
whitespace checks passed. Fresh docs build/link validation: **55 pages / 2613
internal links PASS**. Roadmaps explicitly keep #10 partial and #14 unrun.
