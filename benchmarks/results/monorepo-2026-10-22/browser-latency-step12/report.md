---
work_id: editor-latency-step12-20261022
artifact_type: performance-report
status: done
owner_role: executor
source_request: Apply model reuse and paragraph DOM reuse in stages, then remeasure with the same 100,000-character conditions
last_updated: 2026-10-22 22:20 KST
---

# Results of model and DOM reuse

Input-to-remote-rendering-frame p95 decreased from 2,236.9ms → 288.1ms for demo → ProseMirror, and 2,642.4ms → 238.7ms in reverse. Decreases from baseline were 87.1% and 91.0%. Each stage measured 30 inputs per direction, excluding warmups. Every input and final document equality check passed.

## Results by stage

Units are ms. Time starts at key-event creation, including waiting before handler execution. It ends at the second requestAnimationFrame callback after confirmation of the remote DOM string. Physical display timing was not measured.

| Direction | Status | p50 | p95 | Maximum | p95 decrease from baseline |
| --- | --- | --- | --- | --- | --- |
| Demo → ProseMirror | Before optimization | 1,722.4 | 2,236.9 | 2,251.9 | — |
| Demo → ProseMirror | 1: model reuse | 1,241.8 | 1,626.9 | 2,101.7 | 27.3% |
| Demo → ProseMirror | 1+2: add paragraph DOM reuse | 234.0 | 288.1 | 312.2 | 87.1% |
| ProseMirror → demo | Before optimization | 2,050.6 | 2,642.4 | 3,004.4 | — |
| ProseMirror → demo | 1: model reuse | 1,253.6 | 1,593.9 | 1,959.6 | 39.7% |
| ProseMirror → demo | 1+2: add paragraph DOM reuse | 207.1 | 238.7 | 239.3 | 91.0% |

| Direction | Optimization 1 p95 | Optimizations 1+2 p95 | p95 decrease from adding optimization 2 |
| --- | --- | --- | --- |
| Demo → ProseMirror | 1,626.9 | 288.1 | 82.3% |
| ProseMirror → demo | 1,593.9 | 238.7 | 85.0% |

In the final state, p95 to remote DOM update alone was 264.0ms for demo → ProseMirror and 188.1ms in reverse. These endpoints differ from the frame figures above.

## Optimization 1: reuse model computation

Canonical model computation in `Doc.toJSON()` is reused per document. `apply()` and `compact()` clear the cache and update the version. Cursor, Presence, and status reads do not reread tokens and formatting if the document is unchanged.

Returned NodeJSON, run, attrs, and marks containers are copied separately. A caller changing a returned model cannot affect later reads or the internal model. Later edits also do not change earlier read results. CRDT operations, order, undo, GC, and snapshot formats were unchanged.

Source and raw data with only optimization 1 were frozen first. Optimization 2 was applied only after that measurement ended.

## Optimization 2: reuse paragraph DOM

Each paragraph compares Block, formatting LWW values, cursor, and selection display. Unchanged paragraphs retain DOM. Only changed paragraphs and those affected by selection display are rebuilt. Paragraphs inside tables and boxes follow the same rule. Duplicate renders with the same document/display state are skipped.

Child order is adjusted without detaching unchanged nodes. The input textarea is retained. The full document stays visible and keeps its character count. Paths that invalidate the whole Block cache, such as structure changes, can still rebuild broader areas.

## Changes in bottleneck timing

These values are p50 after summing method inclusive times in each input observation window, in ms. Methods contain other measured methods. Do not add rows.

| Direction | Method | Before optimization | 1 | 1+2 |
| --- | --- | --- | --- | --- |
| Demo → ProseMirror | Doc.toJSON | 569.4 | 119.4 | 115.0 |
| Demo → ProseMirror | Editor.render | 379.0 | 369.5 | 5.2 |
| ProseMirror → demo | Doc.toJSON | 866.0 | 120.3 | 115.2 |
| ProseMirror → demo | Editor.render | 372.2 | 354.9 | 5.2 |

`toJSON()` calls remain. Expensive full-model computation is reused; the calls did not all disappear. Cumulative demo render p50 fell from about 355~379ms to about 5.2ms.

One full canonical model build per change, remote before/after model comparison and validation, and ProseMirror conversion remain. This work applied only requested optimizations 1 and 2. Final p95 of 239~288ms does not establish input latency within one frame.

## Conditions and validation

| Item | Condition or result |
| --- | --- |
| Initial document | 100,000 characters, 625 paragraphs, 160 characters per paragraph. Initial JSONL seed was byte-identical to existing data |
| Input | Same ASCII key sequence. Initial offset 50 in the first paragraph. Real trusted key events |
| Samples | 5 warmups, 30 measured inputs, and 1 separate diagnostic per stage and direction |
| Environment | Node 22.19.0, Chrome 156, 1440×1000, devicePixelRatio 1 |
| Transport | Real local HTTP POST/SSE and server JSONL persistence |
| Optimization 1 source checks | Type check passed. FUZZ_SEEDS=3000 PM_SEEDS=300 npm test: library 106 + demo 10 passed |
| Optimization 2 source checks | Type check passed. npm test: library 106 + demo 10 passed |
| UI checks | 30 items passed: paragraph DOM retention, polling, formatting, undo/redo, structural separation, Presence, reverse selections, overlap, disconnect, tables, boxes, rows/columns, cell merge/split, and reopen |
| Document equality | All 60 measured inputs per stage passed. Both final client models matched the server. Pending changes 0. Fallback 0 |
| Final size | 100,072 characters and 625 paragraphs per stage after 72 inputs including warmups and diagnostics |
| Source separation | Only apps/demo/ui/editor.ts differed between optimization 1 and 1+2. Each stage preserved a source archive and hashes |
| Paint | Separate diagnostics per direction confirmed Paint completion after remote DOM updates |

## External load and interrupted run

| Status | Starting load average | Ending load average |
| --- | --- | --- |
| 1: model reuse | 26.80 / 20.62 / 14.04 | 21.88 / 22.38 / 17.28 |
| 1+2: add paragraph DOM reuse | 23.37 / 23.14 / 20.61 | 20.53 / 21.79 / 20.53 |

The order is 1-minute / 5-minute / 15-minute load averages. There were 14 logical CPUs. External desktop load was present. Early optimization 1 timing might overlap extra compatibility validation in another chat. Completion notices and per-run load records were preserved. Timing differences are not attributed solely to code. Per-call model computation and DOM creation cost reductions were also checked.

The first optimization 2 run stopped saving near the end due to disk ENOSPC. Its 61 samples were preserved and excluded from final comparison. After checking free space, the full measurement was repeated once with the same source and initial seed. No user files were deleted. Final figures use completed `step2-repeat` results.

The tool's console-output parser was also changed to accept text responses. This was post-collection output processing. Keys, script, frame endpoint, and 30 measured inputs were unchanged.

## Interpretation limits

Both actual editors shared one page and renderer thread. Results do not extend to network/display performance on other computers. Physical scanout was not measured. A single 30-sample run per stage does not establish statistical equivalence.

Only sequential ASCII insertion latency was measured. IME, continuous typing throughput, multi-user contention, and large-table latency were excluded. Structure changes, GC, and revival can invalidate the full Block cache and still reconstruct full DOM. Passing UI regressions does not establish latency passes on those paths.

## Files

- [Baseline raw data](../browser-latency-100k/browser-raw.json) · [All before/after values and ratios](comparison.json)
- Optimization 1: [raw data](step1/browser-raw.json), [analysis](step1/summary.json), [source archive](step1/source.tar.gz), [run and load](step1/run.json)
- Final optimizations 1+2: [raw data](step2-repeat/browser-raw.json), [analysis](step2-repeat/summary.json), [source archive](step2-repeat/source.tar.gz), [run and load](step2-repeat/run.json)
- Interrupted run: [record](step2/interrupted.json), [partial raw data](step2/partial-browser-raw.json)
- Checks: [optimization 1 extended tests](step1-tests.log), [optimization 2 default tests](step2-tests.log), [type check](step2-typecheck.log), [UI checks](step2-browser-validation.json), [tables, boxes, and reopen](step2-browser-validation-nested.json)
- Changed files: [Doc](/Users/user/github/doc-sync/packages/doc-sync/src/crdt/doc.ts), [demo renderer](/Users/user/github/doc-sync/apps/demo/ui/editor.ts), [model reuse tests](/Users/user/github/doc-sync/packages/doc-sync/test/model-cache.test.ts)
