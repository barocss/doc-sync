---
work_id: structural-cache-20261023
artifact_type: implementation-brief
status: done
owner_role: executor
source_request: Improve the full-recalculation bottleneck after structural changes and verify before/after performance and regressions
last_updated: 2026-10-23
---

Scope: Doc cache invalidation after structural operations. Remote structural events retain existing full verification.
Constraints: Preserve RGA, concurrent Enter absorption, LWW, deletion ledger, undo/redo, hidden-cell and GC rules, and public API.
Simple alternative: Keep clearing all caches. Measure current cost, then narrow invalidation to affected sequences. Incremental marker algorithms within one sequence and new storage structures are outside this scope.
Validation: Use an immutable baseline for before/after/before-repeat measurements of 10,000/100,000-character structural paths. Verify fresh snapshot models and event mirrors. Regressions cover model reuse in unchanged sequences, table row/column/merge dependencies, dead/duplicate/lower-Ticket operations, hidden sequences, and undo/redo. Run full fuzz and PM tests, comparison demo, type checks, and structural paths in Chrome.
Completion criteria: Reproduce the current bottleneck; provide evidence for the narrowed invalidation scope; pass existing-rule regressions; preserve before/after raw data and source hashes; update HANDOFF. Do not decide product SLOs or actual OS IME acceptance. This request does not include commit/push.

Result: Completed product Doc cache changes and 13 regressions. Final full tests and Chrome functional regressions passed. Preserved original/final/original-repeat core data and 4 Chrome runs. The cause of the first modified Chrome run's p95 regression in one direction remains unresolved. Core improvement does not establish screen p95 or SLO acceptance. HANDOFF §5.16 and benchmarks/results/structural-cache-2026-10-23/report.md define the results.
