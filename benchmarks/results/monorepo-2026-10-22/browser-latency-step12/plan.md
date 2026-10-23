---
work_id: editor-latency-step12-20261022
artifact_type: implementation-plan
status: done
owner_role: executor
source_request: Apply document model reuse and demo paragraph DOM updates in order, then remeasure 100,000 characters in both directions with 30 inputs per stage
last_updated: 2026-10-22
---

# Scope and validation

1. Reuse model computation when the document is unchanged. Keep public toJSON results independent. Results must match the new document after model changes, remote changes, undo/redo, GC, and snapshots.
2. Preserve source and diff with only optimization 1. Run type checks and related regressions. On the actual /pm page, use initially 100,000 characters and 625 paragraphs, with 5 warmups and 30 measured inputs per direction.
3. Redraw only changed demo paragraphs and paragraphs affected by selections or cursors. Keep exact full updates for structure changes. Do not hide or shorten the model.
4. After optimization 2, repeat the same tests and browser conditions. Check real selection, Presence, tables, and undo/redo.
5. Compare p50/p95/max for key-event creation → remote DOM and remote rendering frame across baseline, optimization 1, and optimizations 1+2. Keep raw data, source, load, correctness, and limits for each stage.

Do not edit ongoing apps/demo/compat changes. Preserve existing raw data and HANDOFF. Commit and push are outside this request.
