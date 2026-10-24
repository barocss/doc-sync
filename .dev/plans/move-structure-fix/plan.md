---
work_id: move-structure-fix
artifact_type: plan
status: done
owner_role: integration
source_request: Fix automatic paragraph duplication and moved-sibling order after split, preserve collaboration rules, add regressions and Chrome proof, update HANDOFF.
last_updated: 2026-10-24
---

# Structural movement regressions

Preserve inherited uncommitted logical-text-scope optimization and all measurements. No commit/push is requested.

Acceptance: one visible occurrence per automatic paragraph identity; fresh editable gap if its former paragraph moves; split retains untouched sibling placement and order; existing same-boundary Enter, independent deletion/format ownership, undo/redo, snapshots and GC keep working. Add fixed expected models before changes. Verify expanded Node tests, native Chrome with real HTTP and source-bound receipts. Preserve user services/tabs/data and prior evidence.

Approach: distinguish implicit leading gap from independent movement; recognize replacement gap storage through existing fragment identities; keep physical split markers from reanchoring following logical siblings. Review all wire validation and fixed identity implications. Run focused checks, then broad tests and browser regressions. Record any remaining limits explicitly.

Verified: 18 final fixed cases fail on archived main and pass after the fix; expanded library 507, demo 12, docs 27, compat 31; Chrome 163 finite checks. Source-bound result report and HANDOFF §5.21 retain the evidence and limits. No commit/push.
