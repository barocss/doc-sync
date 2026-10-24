---
work_id: structural-events
artifact_type: plan
status: done
owner_role: integration
source_request: Reduce remaining full comparison and recalculation after structural changes, preserve collaboration rules, measure before/after, verify Chrome and update HANDOFF.
last_updated: 2026-10-24
---

# Structural event costs

Baseline: main d46db51b75120539d1f649e4025800b7c96b7506, clean worktree. No commit/push is requested.

Measure synchronous structural receipt separately from model calculation and comparison/verification. Preserve RGA/placement, same-boundary Enter, independent delete/format ownership, conditional undo/redo, child-count projection, snapshot/GC, public mutable-output isolation and event-mirror validation. Profile before selecting a bounded change. Keep uncertain structural cases on the existing path. Use fixed expected models and concurrency histories, then expanded tests and Chrome native-editor regressions. Save raw baseline/candidate/final data with source hashes and a Markdown report. Do not replace user tabs/services/data or historical receipts. No OS IME or screen-performance claim follows from core timing.

Diagnostic: 100k changes spend roughly54–74ms in comparison/verification versus0.00–0.05ms in Doc.apply; two diagnostic samples report about201k JSON.stringify calls outside Doc.apply/toJSON. Selected approach: compare actual whole before/after models, identify an unchanged prefix/suffix, include stable non-group boundary guards, and diff/validate a bounded top-level window. Keep full model reads and uncertain/large/root-cardinality cases on the old path. No CRDT/model API or unsafe cache sharing is needed.

Completed guarded verification, ABBA measurements, expanded Node tests, 211 Chrome checks and documentation. Existing merged-grid native mismatch is explicitly recorded as FAIL before and after. Full model reads and structural scans remain. See benchmarks/results/structural-events-2026-10-24/README.md and validation.json.
