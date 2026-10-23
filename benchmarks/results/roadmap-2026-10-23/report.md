# Stage 0 baseline measurements: observation ended

Written: 2026-10-23T05:30:43.422337+00:00
Last updated: 2026-10-23T05:49:48.082025+00:00

**Status: 30-minute wall-clock observation ended. The 1Hz target and all 1800 rounds were incomplete. G0 is unapproved.**

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

## 30-minute observation results

- Original start: 2026-10-23T05:14:32.777Z. Observation end: 2026-10-23T05:44:32.830Z.
- Actual observation: 1,800,060ms. At least 30 minutes of wall-clock observation was confirmed.
- Last durable converged checkpoint: 1320 rounds, 5280 edits per engine. Each engine's 4 replicas converged through this checkpoint.
- Elapsed at this checkpoint was 1,759,999.782ms, 439,999.782ms behind schedule. This excess includes round processing, so it is not pure tick lateness.
- The original saved progress only every 60 rounds. Exact in-memory completed rounds and timer lateness at termination are unknown. No completion after the last checkpoint is claimed.
- The 1800-round and 1Hz cadence targets did not pass. `window-observation.json` and `failure.json` record incompletion. No `complete.json` exists.
- The default harness runs three engines and model checks sequentially in one process. Missing schedule is not attributed as an ours-only SLO failure.
- The initial CLI ran until all fixed rounds completed. To retain the meaning of the 30-minute script, the integration owner instructed termination of original PID 78810 only. No other worker or user process was terminated.
- Original core source was frozen before execution with SHA and archive. Initial harness source was restored from the tool input; no starting file SHA was captured. The initial receipt's GC wording was too broad. The first Yorkie wrapper used default GC options, and this script only inserted, without deletions. The original source manifest preserves the correction.
- `paced-real-30min-ticks/` stopped on the integration owner's instruction to avoid duplicate measurement. Partial tick records and cancellation reasons were preserved. This run is also not passing evidence.

## Harness changes for future runs

- After the original process ended, the CLI changed to a wall-clock window. No new round starts after the deadline. Only an already started round completes atomically.
- It stores actual completed rounds, scheduled/actual tick times, late counts, last round completion time, and window overrun. A cadence miss writes an incomplete receipt and exit code 2.
- An overload control fixture checked that the window closes without running all fixed rounds. Harness tests passed 8/8. Control-fixture times are not CRDT performance measurements.
- A short actual Ours smoke with the revised CLI validated a 300ms window, 3 rounds, and 12 edits. This is not a 30-minute revalidation. No additional 30-minute run occurred.

## Evidence scope and G0

- These are CRDT + wrapper measurements in one process. They exclude browser rendering, network, authentication, Yorkie service, and production failure recovery.
- Ours uses JSON. Yjs uses binary updates. Yorkie includes protobuf object conversion and local acknowledgement. Wrapper costs differ.
- The mixed split/merge script is sequential. Ours uses block markers. The Yjs wrapper deletes and reinserts trailing text. Yorkie uses native Tree split/merge. Equal sequential models do not prove equivalent token identity or intent rules for concurrent Enter. Existing Ours concurrent Enter rules were unchanged.
- Yorkie actual wire bytes were not measured and are null. Snapshot sizes are actual persisted bytes.
- GC, allocators, clones, and caches affect heap delta. It does not establish a product RAM cap or approval of the target of at most twice Yjs memory.
- CRDT GC conditions differ. Ours has no explicit Doc.gc call. Yjs uses default GC. Yorkie disables GC without a service frontier. Stored sizes and heap do not compare efficiency at the same GC frontier.
- G0 needs evidence for per-edit product latency, memory targets, engine structural-policy differences, and 30-minute workload results. G0 remains unapproved.

## Tests

- Existing harness tests passed 7/7 on original source and on source after the bulk-text change. After the wall-clock fix, tests including the control fixture passed 8/8.
- freeze CLI source preservation, manifest, and copied-import checks passed.
- Full-project tests and before/after remote-event performance are covered by separate integration results.

Reproduction: [stage0 README](../../stage0/README.md)

Diagnostic CPU profile: `profiles/paste-before-after.cpuprofile`. Baseline anonymous frame `doc.ts:766` and `charAdded` dominated. Sampled CPU results are separate from accepted timing figures.
