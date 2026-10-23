# Document capability performance

This delivery adds editor bindings, placement, cardinality, annotations, declared fields, and protocol validation. It is a capability delivery, not an across-the-board performance improvement. The results contain regressions and variable tails. Keep the historical screen-latency regression in the structural-cache report.

## Method and proof boundary

- Baseline: `ce421449514698fdaa844194c65566200061011c`, extracted with `git archive`. Updated source is identified by SHA256 entries in `comparison-metadata.json`.
- Node 22.19.0 on the same computer. Sequential ABBA order: before, after, after, before. Each case uses 5 warmups and 30 samples. Structural cases add 2 separate mark-read diagnostics. Times in the comparison tables are p95 milliseconds from each run; they are not pooled percentiles.
- Baseline imports resolve to the archived product. Current fixtures supply protocol 2 hello and remain connected. Handshakes are outside timing. Both versions use the same installed dependency directory. Product source was frozen during measurement.
- No test/build job or active comparison-editor page ran during timing. External desktop load remained high: the one-minute load average started at 22.15 and ended at 16.07. ABBA order does not isolate scheduler, GC, thermal, or system-load effects.
- Local rows compare direct Doc editing, SyncClient editing without a model observer, and SyncClient with a model observer. Remote rows end after the synchronous model-event callback. Network, native editor conversion, DOM, animation frames, and physical display output are outside timing.
- All recorded model/mirror checks passed. Remote fallback count was zero. Zero fallback means verification succeeded; it does not mean the full-model path was avoided.
- Existing up-to-eight-block plain-document receive scopes still avoided full-model reads. Moved/cardinality documents intentionally use full-model comparison. Slate/Lexical receive conversion still scans/rebuilds the native tree. Movement records are retained; bounded log pruning is not included.

## Local edit

| Characters | Case | Before 1 | After 1 | After 2 | Before 2 |
|---:|---|---:|---:|---:|---:|
| 10000 | doc | 0.139 | 0.237 | 0.121 | 0.131 |
| 10000 | client | 0.030 | 0.307 | 0.260 | 0.031 |
| 10000 | client-observed | 0.396 | 1.470 | 1.865 | 0.732 |
| 100000 | doc | 0.233 | 0.667 | 0.229 | 0.224 |
| 100000 | client | 0.266 | 0.329 | 0.118 | 0.101 |
| 100000 | client-observed | 2.825 | 3.263 | 2.366 | 2.473 |

## Remote text and formatting

| Characters | Case | Before 1 | After 1 | After 2 | Before 2 |
|---:|---|---:|---:|---:|---:|
| 10000 | 1 block(s), insert | 0.527 | 2.091 | 0.902 | 0.629 |
| 10000 | 1 block(s), format | 0.532 | 1.189 | 0.874 | 0.980 |
| 10000 | 8 block(s), insert | 3.998 | 7.823 | 3.736 | 4.657 |
| 10000 | 8 block(s), format | 2.246 | 5.232 | 5.295 | 2.699 |
| 100000 | 1 block(s), insert | 1.146 | 1.382 | 0.976 | 0.886 |
| 100000 | 1 block(s), format | 1.006 | 1.363 | 0.989 | 0.500 |
| 100000 | 8 block(s), insert | 4.063 | 5.359 | 5.349 | 4.027 |
| 100000 | 8 block(s), format | 3.020 | 4.356 | 5.313 | 7.597 |

## Remote structural changes

| Characters | Case | Before 1 | After 1 | After 2 | Before 2 |
|---:|---|---:|---:|---:|---:|
| 10000 | root-split | 5.781 | 13.207 | 10.255 | 7.122 |
| 10000 | callout-split | 4.642 | 7.820 | 8.215 | 10.064 |
| 10000 | root-type | 18.143 | 9.017 | 12.421 | 8.584 |
| 10000 | cell-split | 4.849 | 9.301 | 7.317 | 6.676 |
| 10000 | table-row | 9.892 | 9.743 | 6.238 | 9.895 |
| 10000 | table-span | 10.141 | 7.008 | 6.380 | 8.760 |
| 100000 | root-split | 118.137 | 68.716 | 96.884 | 90.830 |
| 100000 | callout-split | 75.996 | 57.626 | 63.472 | 65.204 |
| 100000 | root-type | 83.272 | 83.686 | 68.539 | 59.092 |
| 100000 | cell-split | 84.101 | 62.401 | 75.134 | 46.340 |
| 100000 | table-row | 68.217 | 89.418 | 73.428 | 63.617 |
| 100000 | table-span | 93.011 | 106.292 | 77.893 | 53.658 |

## Current capability cost

This separate current-only run uses a remote text insertion in each mode, except `field-write`, which patches one declared field. It has 5 warmups and 30 samples. `moved` has one prior block move. `cardinality` has a minimum paragraph rule. `annotations` has a stored range, but the timed path does not read/render annotations. Annotation API cost is therefore not measured. Field-write and text-insert rows are different operations and must not be ranked as equivalent workloads.

| Characters | Capability | p50 ms | p95 ms | Full-model reads per change |
|---:|---|---:|---:|---:|
| 10000 | plain | 0.336 | 0.599 | 0 |
| 10000 | moved | 6.727 | 9.026 | 2 |
| 10000 | cardinality | 2.151 | 3.252 | 2 |
| 10000 | annotations | 0.262 | 0.313 | 0 |
| 10000 | field-write | 3.578 | 4.017 | 2 |
| 100000 | plain | 0.485 | 0.999 | 0 |
| 100000 | moved | 77.030 | 88.828 | 2 |
| 100000 | cardinality | 24.703 | 25.484 | 2 |
| 100000 | annotations | 0.476 | 1.346 | 0 |
| 100000 | field-write | 42.193 | 49.793 | 2 |

At 100,000 characters, placement history raised synchronous receive p95 to 88.828 ms, and cardinality raised it to 25.484 ms in this run. Both took two full-model reads per change. Declared-field writes took 49.793 ms. These costs can cause visible delay before native conversion or painting. This is an open performance limit, not an approved product SLO. The next performance task is to narrow model-event comparison for logical moved/required text while preserving validation and conditional history rules. Deep output ownership must remain intact.

The ABBA plain-document results are mixed. Some 10,000-character text/formatting cases are slower in both updated runs; several 100,000-character structural cases vary widely. Do not claim universal improvement or no regression from these samples. The frozen implementation is retained with explicit measurements; unmeasured clone shortcuts were not applied.

## Reproduce

Run from the repository root with Node 22.18 or later. Choose new output paths. Do not overlap measurements with other tests.

```sh
node benchmarks/results/document-capabilities-2026-10-24/run.mjs --out-dir /tmp/doc-sync-new-abba
node benchmarks/capabilities.ts --samples 30 --out /tmp/doc-sync-new-capabilities.json
```

`run.mjs` refuses to overwrite existing measurements. It extracts the fixed baseline into a temporary folder and links the current dependency directory. The raw files and metadata in this folder describe the measured source, even after later commits. Automated Chrome correctness tests are separate evidence. No new browser latency, actual OS IME, long-run memory, or full-roadmap acceptance claim is made.
