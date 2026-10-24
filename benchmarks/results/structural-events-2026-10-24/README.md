---
work_id: structural-events
artifact_type: performance-and-regression-report
status: done
owner_role: integration
source_request: Reduce remaining full comparison and recalculation after structural changes, preserve collaboration rules, measure before and after, verify Chrome and update HANDOFF.
last_updated: 2026-10-24
---

# Structural event verification

A guarded comparison window reduces repeated canonicalization after eligible structural changes. Existing collaboration rules and the full verification path for uncertain cases remain. Baseline is clean main `d46db51b75120539d1f649e4025800b7c96b7506`. Changes are uncommitted. This request did not include push or deployment.

## Cause and change

The receiver read complete before/after models, generated events and applied those events to verify the result. Applying events canonicalized unchanged text across the document again. Separate 100,000-character diagnostic samples spent roughly 54–74 ms outside `Doc.apply`/`toJSON`, compared with 0.00–0.05 ms in `Doc.apply`. About 201,000 stringification calls occurred outside application/model reads. These instrumented samples establish the repeated work; their times include wrapper overhead. The initial whole-process CPU profile also includes setup and correctness work and is not timed-path attribution.

The change retains complete before/after reads and identifies their identical top-level prefix/suffix. It includes stable boundary nodes and validates at most eight top-level nodes, then translates event paths back into the complete document. Each selected subtree stays complete. Small documents, root child-count rules, root groups/group boundaries, wider changes and whole-tree windows retain full comparison/verification. Existing replacement fallback retains the original complete models. No wire-op prediction, borrowed mutable cache or CRDT/history/schema/editor-binding change is introduced.

The top-level limit does not bound nested subtree size. Full model reads/copies, prefix/suffix scans, structural projection, local edit normalization and native tree conversion remain. Event patches can differ from whole-tree LCS; applying them to a full mirror must produce the same canonical model. This is not a general incremental structural engine.

## Measurements

Node 22.19.0; Apple M3 Max, 14 logical CPUs, 36 GiB RAM; macOS arm64 kernel 24.6.0. The same new `benchmarks/structural-events.ts` harness runs against the archived baseline and working source. Only bare product imports are redirected for the baseline. Dependencies are shared, each process uses the measured tree as cwd, archived sources are checked against Git blobs, and product/harness hashes are checked before and after the sequence.

Sequential ABBA order is before 1 / after 1 / after 2 / before 2. Each run has eight scenarios at 10,000 and 100,000 body characters. Each row has five warmups, 30 unwrapped timing samples and two separate diagnostic samples. Timing covers synchronous change receipt through model-event callback completion. Setup, network/server, native conversion, DOM and correctness assertions are outside that interval. No tests/build or active compatibility page overlapped these final runs. External one-minute load changed from 23.15 to 13.78 and was not controlled.

The table reports individual-run p95, sorted index `floor(0.95 * 30) = 28`, not pooled percentiles. Preserve both baseline runs and controls when interpreting variation.

| Body characters | Scenario | Before 1 p95 ms | After 1 | After 2 | Before 2 |
|---:|---|---:|---:|---:|---:|
| 10,000 | root-split | 6.200 | 3.830 | 2.555 | 7.395 |
| 10,000 | callout-split | 5.402 | 2.220 | 1.394 | 5.689 |
| 10,000 | root-type | 5.896 | 2.812 | 2.693 | 6.346 |
| 10,000 | cell-split | 7.256 | 1.191 | 1.078 | 4.904 |
| 10,000 | table-row | 12.884 | 1.746 | 1.984 | 5.776 |
| 10,000 | table-span | 6.364 | 1.706 | 3.159 | 7.812 |
| 10,000 | root-list | 8.460 | 7.516 | 8.311 | 6.082 |
| 10,000 | root-cardinality | 12.625 | 9.248 | 8.609 | 6.345 |
| 100,000 | root-split | 65.746 | 21.147 | 13.172 | 60.397 |
| 100,000 | callout-split | 56.563 | 5.453 | 3.617 | 51.190 |
| 100,000 | root-type | 66.485 | 14.468 | 14.082 | 55.572 |
| 100,000 | cell-split | 56.965 | 3.663 | 3.746 | 47.239 |
| 100,000 | table-row | 68.679 | 15.695 | 15.639 | 62.634 |
| 100,000 | table-span | 68.858 | 17.323 | 16.221 | 62.262 |
| 100,000 | root-list | 83.931 | 78.693 | 70.448 | 62.420 |
| 100,000 | root-cardinality | 90.416 | 65.293 | 65.611 | 98.301 |

The six supported 100,000-character rows improve in both updated runs relative to both baselines. Root-list and root-cardinality are declined full-path controls. No improvement is claimed for those controls: the later root-list baseline is faster than either updated run. External load is recorded, but no causal explanation for individual control differences or product SLO is asserted. Supported diagnostic rows reduce repeated stringification to a few thousand calls.

All 64 rows and 2,368 Changes pass fixed-edit expected-model, complete event-mirror, sender/receiver equality, one-callback and zero-fallback assertions. The total comprises 1,920 timed samples, 320 warmups and 128 diagnostics. Diagnostics also check reconstruction from fresh snapshots. Raw samples, phase counters and measured hashes are in `abba/`. Timing is core receipt evidence, not end-to-end input or screen latency.

`before-profile.json`, `before-diagnostic.json`, `candidate.json` and `control-smoke.json` preserve exploratory evidence. They are excluded from the final p95 comparison. The CPU profile and logs remain in the ignored local output directory.

## Regression results

| Check | Result | Boundary |
|---|---|---|
| New structural event tests | PASS 31/31 | Includes two deterministic 100-round unique/repeated-text histories |
| Earlier focused suite | PASS 101/101 | Before the last automatic-gap test was added |
| Expanded library tests | PASS 556/556 | `FUZZ_SEEDS=3000 PM_SEEDS=300`; legacy fuzz scope unchanged |
| Demo / documentation tests | PASS 12/12 and 27/27 | Workspace suite |
| Compatibility unit tests | PASS 31/31 | Separate compatibility app |
| Type check / compatibility build | PASS | Current measured source |
| Documentation build/check | PASS | 20 pages, 883 internal links, English, local paths excluded |
| Chrome finite checks | PASS 211 | 175 previous + 24 structural + 12 repeated-paragraph selection checks |
| Native merged-grid model equality | FAIL before and after | Lexical a/b and PM a; unchanged baseline issue below |
| Actual OS IME | NOT EVALUATED | Automated operation traces are not OS IME proof |
| Chrome input-to-screen latency | NOT MEASURED | Core samples do not measure screen performance |

New Node tests cover splits/joins at root, first/last/nested/cell positions; types; node/row insert/delete; spans; small/wide windows and eight/nine-node guards; root/nested child rules and groups; adjacent/wide movement; concurrent Enter/delete/format receipt orders; conditional history; same-boundary Enter absorption; callback mutation isolation; and repeated automatic-gap reconstruction. CRDT ownership, movement, snapshot/GC and existing history tests remain green. Finite tests do not prove every possible history.

Chrome 156.0.8078.47 exercises Slate, Lexical and ProseMirror with actual native Enter/Backspace and undo/redo. Repeated-paragraph tests check an outside caret, forward/backward range endpoints and a caret inside the split paragraph. Normal completed checked states have all five native/client models equal to the server, pending zero and fallback zero. Thirty operation traces within the total establish captured operations and convergence only. Final console check reports zero errors/warnings. The saved unmerged screenshot was visually inspected and shows the same paragraphs, callout and filled 2×2 table in all five editors.

### Existing merged-grid limitation

The first new structural script failed while a filled 2×2 grid was merged. This failure is retained. A separate server and bundle from the archived baseline, with matching configs/dependencies, reproduce the same failure. Before merge and after unmerge, all five native models equal the server. During merge, all five stored client models equal the server, but Lexical a/b readback exposes an extra grid column and PM readback lacks hidden-cell text. Baseline and updated native models match exactly at all three probe phases. This task does not fix this existing binding/readback limitation or accept it as intended behavior.

Three successful span roundtrip cases check stored models while merged and native equality after unmerge. They do not assert native equality during merge. Three merged-state diagnostics are recorded separately from the 211 successful checks. `native-span-limit.json` records explicit FAIL for lexical-a, lexical-b and pm-a. The final source/config-bound probes are `span-baseline-final.json` and `span-current-final.json` in local browser output. Initial archive-buffer failure/config warnings and a draft expected-object key-order timeout are also preserved; the latter was fixed in the test expectation without a product change.

## Reproduction and receipts

From the repository root with Node 22.19.0 and installed dependencies:

```sh
node benchmarks/results/structural-events-2026-10-24/run.mjs --out-dir /tmp/doc-sync-structural-abba-new
node --test packages/doc-sync/test/structural-event-window.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
npm run build --prefix apps/demo/compat
npm run docs:build
npm run docs:check
```

Use a fresh ABBA output path. The runner archives the fixed baseline, preserves existing files and refuses to replace a result directory. The correctness checks run outside the timed interval. Diagnostic instrumentation runs only for the two separate samples per row.

The Chrome driver is `output/validation/structural-events/run-chrome.py`. Browser check sources are under `apps/demo/compat/checks-*.js`; the new scripts are `checks-structural-events.js` and `checks-structural-selection.js`. Run each through a named Playwright CLI `run-code --filename` session on an isolated compatibility server. Parse returned assertions rather than relying on CLI exit status. The required-child fixture uses `benchmarks/results/logical-text-scopes-2026-10-24/browser-fixture.mjs` to add a two-paragraph minimum in an isolated copy; the repository demo schema stays unchanged. `browser-baseline.mjs` creates the separate baseline browser fixture for the merged-state probe.

Tracked receipts: this report, ABBA JSON/logs and metadata, exploratory JSON, baseline helper, `native-span-limit.json` and `validation.json`. Local originals: `output/validation/structural-events/` for test/build/fixture/driver logs and CPU profile, and `output/playwright/structural-events/` for assertions, initial failures, probes, console results and screenshots. These ignored outputs are retained locally; the tracked validation receipt includes their hashes. Historical benchmark receipts are unchanged. Only this task's named browser session and three owned compatibility/backend pairs are stopped; the existing docs preview and user tabs are preserved. Implementing-agent review only; no independent review or production acceptance is claimed.
