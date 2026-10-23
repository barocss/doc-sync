# Stage 0 baseline measurements: interim report

Written: 2026-10-23T05:30:43.422337+00:00

**Status: 30-minute cadence run in progress. This is not evidence of a G0 pass or product performance approval.**

## Frozen source

- Starting HEAD and uncommitted WIP were preserved in baseline-manifest.json, baseline-working-tree.diff, and baseline-source.tar.gz. Core measurements used this copy.
- The new bulk-text optimization's after measurement preserved separate source and SHA in after-bulk-source/. Before and after are distinct sources.
- Node 22.19.0, Yjs 13.6.33, Yorkie Tree 0.7.25. The official Yorkie npm package was installed in /tmp. Root lock and other SDK repositories were unchanged.

## Shared harness results

| Workload | Engine | Status | local p95 ms | remote p95 ms | open+first model p95 ms |
|---|---|---|---:|---:|---:|
| typing-10000 | ours | Model checks passed | 0.224 | 0.006 | 13.868 |
| typing-10000 | yjs | Model checks passed | 0.008 | 0.010 | 0.409 |
| typing-10000 | yorkie-tree | Exceeded 120-second case limit; incomplete | — | — | — |
| paste-100000 | ours | Exceeded 120-second case limit; incomplete | — | — | — |
| paste-100000 | yjs | Model checks passed | 0.570 | 0.220 | 0.734 |
| paste-100000 | yorkie-tree | Model checks passed | 2.742 | 0.379 | 1.088 |
| mixed-10000chars | ours | Model checks passed | 0.061 | 0.010 | 18.960 |
| mixed-10000chars | yjs | Model checks passed | 0.018 | 0.017 | 2.877 |
| mixed-10000chars | yorkie-tree | Model checks passed | 0.272 | 0.068 | 28.560 |
| open-after-10000edits | ours | Model checks passed | 0.131 | 0.003 | 12.174 |
| open-after-10000edits | yjs | Model checks passed | 0.009 | 0.010 | 0.617 |
| open-after-10000edits | yorkie-tree | Exceeded 120-second case limit; incomplete | — | — | — |
| table-50x10 | ours | Model checks passed | 0.059 | 0.015 | — |
| table-50x10 | yjs | Model checks passed | 0.071 | 0.073 | — |
| table-50x10 | yorkie-tree | Model checks passed | 0.418 | 0.209 | — |

- 12 of 15 cases completed. Three timeouts are not performance values or single-operation timings for the SDK or core.
- 100k paste has one local and one remote sample. A field named p95 does not establish a distribution.
- open measures snapshot load + first text-model read, over 5 samples.
- table used 4 peers and 1000 edits in a fixed 50×10-cell table. Independent string models, concurrent same-cell insertion, and overlapping deletion were validated. Row/column changes, merge, undo, and cross-engine concurrent Enter policies were not compared.

## After the bulk-text change

- One 100k paste: local 128.358ms, remote 113.309ms, snapshot+first-model open p95 235.161ms. Local/remote/snapshot model checks passed.
- Before timed out at the case limit. No 100k speedup ratio is calculated.
- The same smaller workload alternated 3 runs per source. These are small samples from shared CPU resources.

| Characters | before local p50 ms | after local p50 ms | p50 ratio |
|---:|---:|---:|---:|
| 1000 | 87.919 | 4.065 | 21.63× |
| 5000 | 342.479 | 3.745 | 91.45× |
| 10000 | 1539.747 | 12.851 | 119.82× |

## 30-minute workload

- paced-real-30min/ is the original run. Every second, 4 actors each append one character to the same prior document. Each round checks convergence of 4 replicas. The target is 1800 rounds.
- Execution uses real time. If processing exceeds one second, actual completion exceeds 30 minutes. It must not be marked as an endurance pass before completion.
- The completion receipt will store schedule lateness p50/p95/max and total elapsed time. Minute progress and external CPU load at 30-second intervals are also preserved.
- First-run harness source was restored from the initial tool input. No starting file SHA was captured. The core copy and SHA were frozen before start.
- paced-real-30min-ticks/ stopped on the integration owner's instruction to avoid duplicate measurement. Partial tick records and cancellation reasons were preserved. The original run was not stopped at this report's time.

## Evidence scope and G0

- These are CRDT + wrapper measurements in one process. They exclude browser rendering, network, authentication, Yorkie service, and production failure recovery.
- Ours uses JSON. Yjs uses binary updates. Yorkie includes protobuf object conversion and local acknowledgement. Wrapper costs differ.
- The mixed split/merge script is sequential. Ours uses block markers. The Yjs wrapper deletes and reinserts trailing text. Yorkie uses native Tree split/merge. Equal sequential models do not prove equivalent token identity or intent rules for concurrent Enter. Existing Ours concurrent Enter rules were unchanged.
- Yorkie actual wire bytes were not measured and are null. Snapshot sizes are actual persisted bytes.
- GC, allocators, clones, and caches affect heap delta. It does not establish a product RAM cap or approval of the target of at most twice Yjs memory.
- CRDT GC conditions differ. Ours has no explicit Doc.gc call. Yjs uses default GC. Yorkie disables GC without a service frontier. Stored sizes and heap do not compare efficiency at the same GC frontier.
- G0 needs evidence for per-edit product latency, memory targets, engine structural-policy differences, and 30-minute workload results. G0 remains unapproved.

## Tests

- Harness tests passed 7/7 on original source and source after the bulk-text change.
- freeze CLI source preservation, manifest, and copied-import checks passed.
- Full-project tests and before/after remote-event performance are covered by separate integration results.

Reproduction: ../../stage0/README.md
