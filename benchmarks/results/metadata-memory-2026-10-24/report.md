# Runtime metadata memory and core performance

Runtime ID metadata now uses actor ranges instead of a string-keyed Map entry for each logical ID. On this machine, the median incremental JS heap for a plain one-million-unit document falls from **300.69 to 252.23 MiB (16.1%)** before explicit model materialization. With the model cache populated, it falls from **341.60 to 293.15 MiB (14.2%)**. Every measured before/after model and snapshot hash matches. This is a bounded runtime-index change, not a full Automerge column store or a live-character segment implementation.

## Implementation and invariants

- Group consecutive Lamport IDs by actor in ranges of at most 256 IDs. Dense ranges retain one Item reference per logical ID. Sparse sequences switch to numeric Map keys after more than 64 ranges with fewer than four IDs per range on average.
- After existing stable-tombstone GC merges Items, a range whose references all agree stores one reference. GC frontier, annotation pins and undo eligibility rules are unchanged.
- Reuse an existing equal origin-key string on insertion. Snapshot restoration reuses the immediately preceding key only for an exact single-ID consecutive predecessor. An origin that names the interior of a compacted span retains that exact logical ID.
- Live Item count, Item identity, Line/Block APIs, UTF-16 units, logical IDs, ordering, formatting ownership, movement, required children, hidden cell text, history targets, snapshots and wire format remain unchanged. No additional history is discarded. No public API or dependency is added.

The core baseline is commit `499c221bcd7ce85fc91f9d6f2a144822e385b46a`. All twelve frozen baseline CRDT source files match that commit byte for byte; see `baseline.json`. Inherited demo/binding/documentation WIP is preserved. The measured core changes are `doc.ts` and the new `key-index.ts`. Source hashes and execution order are in `execution.json`; final validation binds the sources and browser bundles separately.

## Measurement conditions

Node 22.19.0, macOS arm64, Apple M3 Max. Six workloads, two variants, three fresh processes per workload/variant: **36 measured workers**. Within each workload, variant order is before/after, after/before, before/after across repetitions. Runs are sequential. Browser validation, tests and builds start after these measurements. User services and tabs remain open; unrelated desktop load is not controlled. This is a repeated local comparison, not a randomized host-isolated trial.

`Doc.verifyBlocks` is disabled for timing; fixed/differential/full regression tests verify cached projections separately. `node --expose-gc` runs four explicit collections before the initial baseline and each cold/warm reading. Cold means after creation (and stable GC for the deleted case), before explicit `toJSON`. Warm means after one model materialization. Heap figures subtract the worker's initial `heapUsed`; they are incremental post-GC process heap measurements, not an exact object-size census. RSS is whole-process resident memory, includes Node, the TypeScript runtime, allocator capacity and other overhead, and is not baseline-subtracted. This library's measured document state is JavaScript storage; these figures cannot be compared directly with the earlier Automerge/WASM measurements.

Generated text is deterministic ASCII, counted as UTF-16 units. Plain cases use one large text operation and one paragraph. The 100-actor case uses 100 chunks of 1,000 units. The marked case creates a distinct per-character formatting register, preserving its write ID. The sparse case inserts one unit per operation with Lamport gaps of one. The deleted case deletes all units and invokes the pre-existing stable-GC contract; no undo history is recorded by this benchmark. It measures already-eligible tombstones, not active user history.

## Memory results

Values are medians of three independent workers. MiB = 1,048,576 bytes. Cold and warm are separate retained-cache states, measured before edit timing.

| Workload | Cold before MiB | Cold after MiB | Reduction | Warm before MiB | Warm after MiB | Reduction |
|---|---:|---:|---:|---:|---:|---:|
| 100k plain, one actor | 30.45 | 25.08 | 17.6% | 35.21 | 29.85 | 15.2% |
| 1m plain, one actor | 300.69 | 252.23 | 16.1% | 341.60 | 293.15 | 14.2% |
| 100k plain, 100 actors | 31.78 | 25.43 | 20.0% | 36.55 | 30.20 | 17.4% |
| 100k bold at insertion | 51.85 | 46.49 | 10.3% | 56.62 | 51.26 | 9.5% |
| 100k sparse Lamport IDs | 31.16 | 27.62 | 11.4% | 35.93 | 32.38 | 9.9% |
| 100k after stable deletion/GC | 6.73 | 0.26 | 96.1% | 6.79 | 0.31 | 95.5% |

The plain 100k/1m cases retain 100,001/1,000,001 physical root-line Items in both variants. The new index uses 392/3,908 ranges, including the root. This does **not** mean a 256-fold reduction in total document memory: dense ranges still hold every Item reference, and Items, tickets, formatting maps, block/position caches and history remain character-level structures. The stable-GC case keeps two Items and all 100,001 logical IDs; its new 392 ranges have no dense arrays. The sparse case keeps 100,000 numeric entries plus one root range. Only 100 actors are measured; arbitrary actor counts and richer application caches are not covered.

| Workload | Cold RSS before MiB | Cold RSS after MiB | Warm RSS before MiB | Warm RSS after MiB |
|---|---:|---:|---:|---:|
| 100k plain, one actor | 195.62 | 177.23 | 228.92 | 209.27 |
| 1m plain, one actor | 485.72 | 432.03 | 782.09 | 723.19 |
| 100k plain, 100 actors | 201.03 | 186.75 | 235.66 | 216.56 |
| 100k bold at insertion | 215.38 | 205.48 | 248.59 | 237.58 |
| 100k sparse Lamport IDs | 204.50 | 199.89 | 235.12 | 229.78 |
| 100k after stable deletion/GC | 220.47 | 211.86 | 222.14 | 212.12 |

Raw records also retain process peak RSS. That peak includes later correctness verification with multiple live documents, snapshots and temporary copies, so it is not presented as one document's steady-state memory. Memory after loading a snapshot, editor/browser heap and long-lived histories are not separately measured here.

## Core performance

Each live case has 10 excluded warmups and 100 measured middle insertions, except the one-million-unit case, which has 30 measured insertions after 10 warmups. `Doc.edit` inserts one ASCII unit at the middle of the paragraph. A separate seeded receiver applies every resulting operation and calls `toJSON` after each change. Sender and receiver models are checked outside timing. The receiver phase runs before snapshot creation/restoration, after explicit collection, so temporary restored documents cannot affect those timings.

Each table entry below is the **median of three per-worker nearest-rank p95 values**, not a pooled p95. Times are milliseconds. Receive includes full model calculation/copy. These are core calls, not SyncClient event time, native input, network, DOM or screen latency.

| Workload | Doc.edit before | Doc.edit after | Apply + model before | Apply + model after |
|---|---:|---:|---:|---:|
| 100k plain, one actor | 5.029 | 4.812 | 92.890 | 90.041 |
| 1m plain, one actor | 113.385 | 111.260 | 1146.307 | 1190.076 |
| 100k plain, 100 actors | 5.300 | 4.983 | 88.666 | 85.038 |
| 100k bold at insertion | 5.502 | 5.249 | 110.454 | 112.546 |
| 100k sparse Lamport IDs | 5.064 | 4.918 | 92.189 | 90.118 |

The median edit p95 decreases in each measured live workload. Full receive/model p95 increases **3.8%** for one million units and **1.9%** for the marked case. The 100-actor after-run p95 values are **154.61, 85.04, 68.21 ms**, versus **88.90, 88.67, 69.62 ms** before; the first tail spike remains in the record. The sparse third after run is **90.12 ms**, versus **74.36 ms** before. Host/GC variability prevents attributing every change to the index. No universal speedup, regression-free latency or performance acceptance is claimed. Full paragraph reconstruction/copy remains expensive.

The following are medians of three single measured phase durations, not latency percentiles. Initial model time includes hashing the returned model.

| Workload | Create before / after ms | First model + hash before / after ms | Snapshot before / after ms | Restore before / after ms |
|---|---:|---:|---:|---:|
| 100k plain, one actor | 53.94 / 54.21 | 89.04 / 93.74 | 10.21 / 8.59 | 158.41 / 123.79 |
| 1m plain, one actor | 771.10 / 566.67 | 820.89 / 844.21 | 108.02 / 111.58 | 1753.11 / 1591.86 |
| 100k plain, 100 actors | 70.12 / 60.42 | 90.16 / 84.61 | 10.10 / 10.80 | 171.47 / 137.13 |
| 100k bold at insertion | 100.58 / 99.01 | 108.73 / 105.26 | 58.75 / 58.11 | 348.93 / 333.76 |
| 100k sparse Lamport IDs | 78.65 / 82.16 | 91.66 / 86.46 | 8.48 / 8.88 | 156.17 / 162.56 |
| 100k after stable deletion/GC | 55.77 / 53.79 | 1.51 / 1.42 | 0.20 / 0.20 | 29.55 / 27.94 |

Lookup timing uses 100 measured batches after 10 warmups, with 1,000 generated keys and `assert.ok(doc.get(key))` calls per batch. Worker records retain per-lookup batch p50/p95/max, including key generation and assertion overhead. These are not isolated index CPU timings. `summary.json` preserves min/max and all three process values for every metric. Individual edit/lookup timing samples are summarized by the worker rather than saved individually.

## Correctness and validation

PASS: all six workloads have identical initial model hashes, final snapshot hashes, ASCII JSON snapshot sizes and physical Item counts across all six workers per workload. Restored snapshots re-encode identically, and sender/receiver models agree. The unchanged snapshot bytes also rule out a smaller serialization format as the cause of the memory result.

New regressions compare a native Map oracle with range lookup under concurrent delivery, duplicate and partial replay, Unicode/UTF-16 input, formatting and deletion. They check every logical alias and position, snapshots after stable GC, and delayed references to an interior tombstone ID. History checks retain another participant's formatting through deletion undo, formatting undo and redo. Internal index tests cover shuffled writes, gaps, replacement, maximum safe IDs, actors containing `@`, noncanonical keys, range bridges, sparse fallback, constant aliases and clear.

Final verification passes **616 library, 16 demo, 27 docs and 31 compatibility unit tests**, with `FUZZ_SEEDS=3000 PM_SEEDS=300`. Chrome 156.0.8078.47 passes **150 product + 310 existing compatibility assertions**, plus **30 separately captured operation traces**; both browser suites report zero console errors. Typecheck, isolated product/compat builds, documentation build and link/English checks pass (22 pages, 1,029 internal links). Source-bound results are recorded in `validation.json` and HANDOFF §5.29. Chrome is a functional regression run; browser memory and before/after editor latency are not measured in this task. Actual OS IME and physical display remain unmeasured. Prior browser performance evidence remains in the native-receive report with its original provenance.

The first index test intentionally failed with a missing module before implementation. Two exploratory pilot records are retained locally and excluded from the 36 workers: the initial receiver timing held temporary snapshot/restored documents. The final harness moves that phase after receiver timing. A required-child Chrome preflight initially timed out because the local fixture bootstrap was applied to the parent proxy but omitted from its spawned backend. The saved state shows one server paragraph, two client paragraphs and all peers offline: schema mismatch blocked the connection. The isolated harness now explicitly supplies the same bootstrap to its backend; all five required-child cases pass under the correct fixture. The original timeout, state and server log remain in local first-failure evidence. No production code or collaboration rule changed for this harness correction.

## Reproduction

Use Node 22.19.0 and install the repository dependencies. To measure the current core:

```sh
node --expose-gc benchmarks/metadata-memory.mjs packages/doc-sync/src/crdt/doc.ts plain100k
```

To recreate the frozen core baseline inside the repository, use an unused output directory:

```sh
mkdir -p output/metadata-baseline
# Extract the twelve baseline CRDT files without changing the working tree.
git archive 499c221bcd7ce85fc91f9d6f2a144822e385b46a packages/doc-sync/src/crdt | tar -x -C output/metadata-baseline
node --expose-gc benchmarks/metadata-memory.mjs output/metadata-baseline/packages/doc-sync/src/crdt/doc.ts plain100k
```

Replace `plain100k` with `plain1m`, `actors100k`, `marked100k`, `sparse100k` or `compacted100k`. Repeat in fresh processes with alternating variant order. Check hashes before comparing numbers. No thresholds in this benchmark establish a release target.

```sh
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm run typecheck
npm test --prefix apps/demo/compat
PRODUCT_BUNDLE=output/playwright/metadata-check/bundle.js node apps/demo/products/build.mjs
npm run docs:build
npm run docs:check
```

Browser validation uses a separate named Chrome session, isolated bundles and temporary backend data. Existing review servers, user tabs, original data and inherited WIP are preserved. This work is local; no commit, push or deployment is requested.
