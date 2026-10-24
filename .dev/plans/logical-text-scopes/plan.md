---
work_id: logical-text-scopes
artifact_type: plan
status: done
owner_role: integration
source_request: Reduce full comparison for moved and required-child documents; preserve collaboration rules; measure before/after and verify Chrome; update HANDOFF.
last_updated: 2026-10-24
---

# Logical text receive scopes

Baseline: main 84fa81df7ff2288551fd33285dd6f3f2fa2de781. Preserve user services, tabs and data. This request does not authorize a new release or main push.

Acceptance:

1. Text-only changes in visible, stable logical paragraphs can use the existing at-most-eight-block comparison, including moved and required-child documents. Hidden content, structural changes, unsafe origins and uncertain automatic text storage retain full comparison.
2. Operations, projection, conflict handling, conditional history, snapshots and GC rules remain unchanged. Existing model mirror verification and full replacement fallback remain.
3. Fixed expected-model regressions cover moved/cross-parent/joined/required/overflow/hidden cases, same-boundary concurrency and undo/redo protection. Expanded workspace and compatibility tests pass.
4. Same-computer sequential before/after comparisons retain raw measurements and source hashes. Chrome regression tests use real native editors and HTTP. Automated composition does not establish actual OS IME.
5. HANDOFF records behavior, limits, exact counts and measurements. No unrelated performance shortcuts or protocol changes.

Steps: inspect logical location/storage and path invariants; collect baseline; implement a guarded logical scope; add regressions; measure the candidate; run expanded checks and Chrome; review diff and record final evidence.

Verified: 489 library +12 demo +27 docs; compat31; TypeScript/build PASS. Chrome149 PASS including isolated minimum-two-paragraph real-HTTP fixture. Final source-bound ABBA p95 at100k: movement81.507–95.088→12.827–14.220ms; cardinality26.413–35.144→1.904–2.061ms; whole-model reads2→0. Raw candidates and first failures preserved. Two unchanged structural correctness probes are deferred explicitly in HANDOFF §5.20. No commit/push/deploy.
