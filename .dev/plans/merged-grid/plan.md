---
work_id: merged-grid
artifact_type: plan
status: done
owner_role: integration
source_request: Fix Lexical and ProseMirror merged-cell display models, preserve hidden content and collaboration, verify regressions and Chrome, update HANDOFF.
last_updated: 2026-10-24
---

# Merged grid consistency

Preserve inherited structural-event WIP and historical receipts. Do not commit, push or deploy. Reproduce Lexical table-plugin padding and PM demo reference omission. Represent only visible Lexical cells in native table geometry; retain covered cells in serialized NodeState and reconstruct full grid. Map native selections and moves through actual column positions. Keep PM public reference contract and pass the authoritative reference in demo readback. Validate filled horizontal/vertical/rectangle merges, native edits, hidden remote edits, unmerge and history; rerun Node and named isolated Chrome regressions. Keep existing user tabs/services and save original failures.

Completed: 11 new regressions, 41 focused tests, expanded 567/12/27 workspace tests, 31 compatibility tests, type check/build, 340 Chrome checks, documentation build/check and owned-resource cleanup. Final report and source-bound receipt: docs/reports/merged-grid-2026-10-24/. Original failures and inherited structural WIP remain preserved.
