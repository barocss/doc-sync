---
work_id: structural-cache-20261023
artifact_type: performance-and-regression-report
status: done
owner_role: executor
source_request: Reduce full recomputation after structural changes and validate before/after performance and regressions
last_updated: 2026-10-23
---

# Reduce paragraph recomputation after structural changes

The baseline main was `10dfd860f23e0cc6eb92f67c2d9b710386c7c2ba`. Changes were uncommitted. Commit and push were not requested.

## Cause and change

Structural operations cleared block, position, visibility, raw paragraph, and normalized paragraph caches for every line. With 100,000 body characters and 600 nested characters, each small structural change reread formatting 100,600 times.

`Doc.apply()` operation application, LWW, and deletion ledger remain unchanged. Actual node insertions, liveness transitions on delete/restore, and winning node-attribute writes invalidate the affected line. Row/column operations invalidate the table's parent line. Descendant and hidden-cell visibility caches are fully invalidated. GC still clears all caches.

One prior cache per invalidated line is retained until the next recomputation. The existing full scan recomputes block boundaries. Existing TextBlock and paragraph models are reused only when nonvirtual text-block marker, type, attrs, character order, and absorption markers all match. Pending character/inline attribute writes also invalidate the affected raw model in that prior cache. List/table/flow normalization and returned-model copying remain. Remote structural events keep the existing full diff and validation.

## Core measurement

Apple M3 Max, 14 logical CPUs, 36 GiB RAM, macOS Darwin 24.6.0, Node 22.19.0 (`host.json`). Documents had 10,000/100,000 body characters + 600 box/table characters, in 160-character paragraphs. Timing covered synchronous receipt through SyncClient model-event callback completion. Network, mirror application, and DOM were excluded. Each case had 5 warmups + 30 measured + 2 instrumentation samples. Formatting counters were excluded from timing samples. p95 used index 29 of 30 sorted samples. Small sample counts required preserving p50, max, and all samples in JSON.

The same script ran baseline → modified → baseline repeat. After the final product type annotation fix, `after-final.json` was measured again. `after.json` is intermediate data before that fix and is excluded from the final table. Baseline imported a temporary source copy; baseline manifest froze its SHA and file hashes. The baseline harness changed only product import paths. Both harness hashes and copies were preserved.

| Body characters | Case | Baseline p95 ms | Final p95 ms | Baseline repeat p95 ms | Final format lookups, 2 probes |
|---:|---|---:|---:|---:|---|
| 10000 | root-split | 15.709 | 6.760 | 18.066 | [160, 160] |
| 10000 | callout-split | 18.966 | 5.679 | 20.635 | [120, 120] |
| 10000 | root-type | 21.589 | 6.134 | 15.500 | [160, 160] |
| 10000 | cell-split | 24.663 | 5.697 | 15.291 | [120, 120] |
| 10000 | table-row | 18.649 | 6.717 | 17.945 | [0, 0] |
| 10000 | table-span | 15.417 | 6.316 | 16.512 | [0, 0] |
| 100000 | root-split | 169.830 | 63.493 | 198.613 | [160, 160] |
| 100000 | callout-split | 292.377 | 62.117 | 179.840 | [120, 120] |
| 100000 | root-type | 160.939 | 115.216 | 160.756 | [160, 160] |
| 100000 | cell-split | 183.373 | 46.512 | 156.163 | [120, 120] |
| 100000 | table-row | 214.140 | 72.644 | 162.050 | [0, 0] |
| 100000 | table-span | 226.743 | 101.239 | 167.302 | [0, 0] |

12 cases × 3 runs = 1080 timing samples, 180 warmups, and 72 separate formatting instrumentation samples. All 1332 Changes checked one callback and equality among the fixed EditOp expected model, event mirror, sending/receiving models, and fresh snapshot model. Preparation and validation were outside timing.

This change did not remove full-token scans within a line. Structural changes reread boundaries in that line. Full-document model copying/diff and table normalization remain. External app load was uncontrolled; load averages and timestamps were stored per run. These results do not establish product SLO, G0/G1, or memory improvement.

## Chrome and regressions

Chrome 156.0.8078.47, headed, on `/pm` with 100,000 characters and 625 paragraphs. Actual key events alternated Enter and Backspace, with 6 warmups and 30 measured inputs per direction. Timing started at the key-event timestamp and ended after both editor DOMs matched expected paragraph counts/content and the second rAF passed. Network, editors, and DOM were included. Physical display and actual OS IME were excluded. p95 used index 28 of 30 values. This differs from the core span and cannot be compared directly.

| Run | Direction | p50 ms | p95 ms | max ms |
|---|---|---:|---:|---:|
| before-v2 | demo-to-pm | 539.6 | 601.7 | 616.4 |
| before-v2 | pm-to-demo | 515.4 | 598.0 | 598.9 |
| after | demo-to-pm | 438.2 | 771.1 | 775.7 |
| after | pm-to-demo | 396.9 | 435.5 | 436.2 |
| before-repeat | demo-to-pm | 548.3 | 605.2 | 645.2 |
| before-repeat | pm-to-demo | 516.7 | 553.3 | 618.6 |
| after-repeat | demo-to-pm | 425.5 | 467.3 | 478.8 |
| after-repeat | pm-to-demo | 394.3 | 452.9 | 463.5 |

`before-v2` was the first completed baseline. The agent ended its initial `before` session early, interpreting it as an initialization wait. All partial samples were excluded; local logs were retained. Four completed runs used the same instrumentation and key-input batch JS hashes. Source and actual JS hashes are in `browser/binding.json` and per-run `sources.json`. All 288 samples were retained: 240 timing samples and 48 warmups. Every sample confirmed trusted keys and expected DOM on both sides. At each run end, full models of both clients and server matched the fixed 625×160-character final model, with pending 0 and fallback 0. Created server/browser sessions were closed and ports checked closed.

**Screen result limits**: Medians decreased in both modified runs. PM→demo p95 also decreased twice. The first modified demo→PM p95 regressed 601.7→771.1ms; the modified repeat was 467.3ms. This failed direction is not hidden by averaging or attributed conclusively to external CPU or GC. The first modified run's last 6 samples were 628.6~775.7ms. Key→DOM was 617~748ms, followed by 12~43ms to the frame endpoint. This instrumentation could not isolate the cause. Core paragraph recomputation decreased, but screen p95 did not always improve and no SLO pass is established. Raw data also records initial baseline load average about 110 versus modified repeat about 7. Other users' apps, servers, and tabs kept running.

Final source passed `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` with core 246 + demo 10, compatibility unit tests 31, Stage0 Ours/Yjs 6, type checks, and an independent compatibility bundle build. Failures, skips, and todos were 0. Yorkie was excluded from this run. Chrome verified 40 basic/nested/Presence/multiblock steps, compatibility inputs 84 + general regressions 20 (convergence 18, probes 2), and 30 operation records. Input included CDP composition and does not establish actual OS IME validation. Detailed logs are in `output/validation/structural-cache-20261023/`; screens/JSON are in `output/playwright/structural-cache-{main,compat}-20261023/`. Thirteen focused tests checked full snapshot model, position, and visibility; box/cell/body split/merge; row/column delete/restore/add; hidden-cell formatting; remote edits during parent deletion; pending mark/inline writes; large insert/delete/restore/GC; duplicate/lower Tickets; concurrent Enter representative replacement; and structural undo/redo preserving other-user input and formatting.

Initial diagnostic failures remain in `output/validation/structural-cache-20261023/`. The benchmark cell-type loop used a wrong list-group path and produced `0 !== 1`. Baseline/modified comparisons began after replacing it with a cell-split loop. Two focused-test errors were harness defects: a local command under a hidden parent and a nonexistent `client.edit()` call. They were corrected using remote operations created before hiding and the actual `doc.edit()+commit()` API. Type errors were corrected through a narrowed TextBlock variable and explicit inline Run discrimination. These failures were not treated as reasons to change CRDT policy.


## Reproduction

```sh
node --test packages/doc-sync/test/structural-cache.test.ts
node benchmarks/structure.ts --chars 10000,100000 --samples 30 --label current --out /tmp/new-structure-result.json
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
node --expose-gc --test benchmarks/stage0/workloads.test.mjs
```

Use Node 22.18 or later. Do not overwrite existing result files. `baseline-source.tar.gz`, `baseline-harness.ts.txt`, `harness.ts.txt`, and `harness-binding.json` identify actual executed source.

Rerun the browser script as follows, using a new output folder. The runner and templates are tracked in Git. `executed-runner.py.txt` is the measured runner. Reproduction `measure.py` changes only paths so it reads templates from its own folder.

```sh
python3 benchmarks/results/structural-cache-2026-10-23/browser/measure.py "$PWD" /tmp/new-structure-chrome current
```

Baseline browser source is in `baseline-browser-source.tar.gz`. Extract into a new temporary folder and link this repository's installed `node_modules`. Only server Node imports were changed to copied source; the browser reads the original library and same UI from that copy's server. Library source matches baseline in the manifest. Dependency lock hashes are in `dependencies.json`.
