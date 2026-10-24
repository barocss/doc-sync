# Receive model materialization

Repeated fresh-process comparisons reduce `Doc.apply + Doc.toJSON` p95 for long paragraphs by **64.5–69.3%** across the measured live workloads. Plain 100k changes from **82.955 to 25.697 ms**; plain 1m changes from **1,049.757 to 352.018 ms**. The ID metadata index is unchanged, cold heap remains essentially the same, and model/snapshot hashes match. Short-paragraph and highly fragmented-format controls do not show the same gain; their results remain below.

## Change and invariant boundary

The CPU profile identifies repeated character expansion and temporary allocations during projection/normalization, plus a full paragraph membership-Map rewrite on each insertion. The implementation changes two core modules:

- A private reference per text block points to the current immutable Block. Insertions register only the added Item; deletion removes only its entry. Existing memberships keep the same reference. The public prior Block, its character array and text remain unchanged. Structural invalidation/rebuild and virtual-block fallback remain in use.
- Text projection accumulates adjacent characters with equal canonical marks into temporary string chunks before `unitsToRuns`. Span values also require identity equality so equal JSON objects with distinct identities cannot merge incorrectly.
- Text normalization keeps existing text runs whole instead of expanding them to a Unit for every code point. Span flattening, inherited marks, priority and inline boundaries use the same rules. Public `runsToUnits` remains unchanged for editing, offsets and diff operations; non-string runtime handling falls back to that existing path.

These are projection changes, not live Item coalescing. Logical IDs, UTF-16 units, Item/Line/Block APIs, physical token count, order, LWW ownership, placement, required children, annotations, hidden merged-cell content, conditional undo/redo, GC eligibility, snapshots and wire format remain unchanged. No public API or dependency is added.

## Baseline and measurement

The frozen **before** is the uncommitted metadata-compressed core verified in HANDOFF §5.29, not plain Git HEAD. All thirteen baseline core files match that previous measurement's after-source hashes. `baseline-core.patch` recreates this baseline from `499c221bcd7ce85fc91f9d6f2a144822e385b46a`; the reconstruction was verified byte for byte. `baseline.json` and `execution.json` identify the baseline, worker script, sources and execution order. The only measured core source differences are `doc.ts` and `model.ts`; `key-index.ts` is byte-identical.

Node 22.19.0, macOS arm64, Apple M3 Max. The primary comparison uses six workloads × two variants × three fresh processes = **36 workers**. Within each workload, order is before/after, after/before, before/after across repetitions. Another **18 fresh workers** cover three control shapes. Primary runs finish before controls; both finish before CPU after-profiling, tests, builds and Chrome checks. User services/tabs remain open and unrelated desktop load is uncontrolled. These are repeated local comparisons, not randomized isolated-host experiments.

The primary harness retains the prior six workloads and GC measurement method. Plain cases use a single text operation in one paragraph. The 100-actor case uses 100 chunks of 1,000 units. Initial bold uses per-character registers. Sparse IDs have Lamport gaps of one. Stable-deletion GC uses the unchanged eligibility contract and has no active undo history. Text is deterministic ASCII, counted as UTF-16 units.

Live primary cases exclude ten warmups, then measure 100 middle insertions (30 for 1m). Sender `Doc.edit` is timed separately. A separate seeded receiver applies each operation, then calls `toJSON`. Receiver phase samples preserve apply, model and combined elapsed times in operation order. Lookup batches are separate. Snapshots/restoration and correctness comparisons run outside these timing intervals. `Doc.verifyBlocks` is false for measurement; full regressions enable cache verification.

## Primary core timings

Each entry is the **median of three per-worker nearest-rank p95 values**, not a pooled p95. Times are milliseconds. The combined interval includes insertion bookkeeping and full model materialization/copy. It excludes SyncClient event validation/comparison, transport, native conversion, DOM and screen latency. Component p95s are separate distributions and must not be added to reconstruct the combined p95.

| Workload | Receive + model before | Receive + model after | Reduction | Model only before | Model only after |
|---|---:|---:|---:|---:|---:|
| 100k plain, one paragraph | 82.955 | 25.697 | 69.0% | 78.672 | 25.260 |
| 1m plain, one paragraph | 1049.757 | 352.018 | 66.5% | 953.151 | 344.800 |
| 100k plain, 100 actors | 81.095 | 24.884 | 69.3% | 77.056 | 24.378 |
| 100k initial bold | 100.513 | 35.691 | 64.5% | 96.333 | 35.139 |
| 100k sparse Lamport IDs | 80.973 | 25.971 | 67.9% | 76.396 | 25.482 |

| Workload | Sender edit before | Sender edit after | Receiver apply before | Receiver apply after |
|---|---:|---:|---:|---:|
| 100k plain, one paragraph | 5.129 | 0.894 | 4.517 | 0.603 |
| 1m plain, one paragraph | 105.329 | 6.438 | 105.740 | 8.204 |
| 100k plain, 100 actors | 4.879 | 1.018 | 4.770 | 0.577 |
| 100k initial bold | 5.445 | 0.848 | 4.957 | 0.585 |
| 100k sparse Lamport IDs | 5.290 | 0.971 | 4.794 | 0.597 |

The primary data has **2,580 measured sender edits and 2,580 receiver intervals**, plus 300 excluded warmups in each direction. All five live primary workloads improve at their median p95. Individual raw samples, per-run percentiles and maxima remain in `raw/` and `summary.json`. No single worker or tail is dropped.

## Control shapes

Controls use ten warmups and thirty measured receiver operations in each fresh worker. A separate sender generates the same wire operations outside timing. All initial model/snapshot, final model and wire hashes match across variants. These controls use a richer schema with a link span and are separate from primary workload totals.

| Workload | Before median p95 ms | After median p95 ms | Interpretation |
|---|---:|---:|---|
| paragraphs100k | 0.919 | 1.009 | 625 paragraphs of 160 units; roughly 1 ms, no demonstrated improvement |
| alternating20k | 37.376 | 38.316 | 20k units, bold alternates every unit; p95 median +2.5%, no demonstrated improvement |
| links20k | 33.662 | 10.255 | 20k units in alternating 100-unit link spans; p95 improves |

The 625-paragraph p95 median rises by about **0.090 ms** (0.919 → 1.009 ms); individual before/after ranges overlap. Alternating-format p95 rises from 37.376 to 38.316 ms. Its paired third run rises from 36.031 to 39.809 ms; that result is retained. The optimized path helps long same-format stretches, while fragmented marks still produce many runs and public copying still traverses them. No universal speedup or regression-free latency claim follows. Controls add **540 measured receiver intervals**, plus 180 excluded warmups, and retain every operation's component samples.

## Memory preservation

Four forced collections precede the worker's initial baseline and each cold/warm reading. Cold is after creation (and eligible GC in the deleted case), before explicit model materialization. Warm follows one model materialization. Heap figures subtract initial process `heapUsed`, in MiB (1,048,576 bytes). They include runtime/JIT effects and are not an exact object-size census. RSS is whole-process resident memory and includes allocator capacity.

| Workload | Cold before MiB | Cold after MiB | Warm before MiB | Warm after MiB |
|---|---:|---:|---:|---:|
| 100k plain, one paragraph | 25.084 | 25.088 | 29.853 | 29.759 |
| 1m plain, one paragraph | 251.899 | 251.915 | 292.820 | 291.880 |
| 100k plain, 100 actors | 25.431 | 25.429 | 30.198 | 30.098 |
| 100k initial bold | 46.490 | 46.494 | 51.261 | 51.168 |
| 100k sparse Lamport IDs | 27.618 | 27.587 | 32.383 | 32.254 |
| 100k after stable deletion/GC | 0.264 | 0.268 | 0.306 | 0.313 |

Plain 1m cold heap is **251.899 → 251.915 MiB**, a 0.016 MiB difference; warm heap is **292.820 → 291.880 MiB**. Its warm RSS median is **716.69 → 503.16 MiB**. The RSS drop is consistent with fewer temporary allocations but is not a pure retained-document memory measure. The stable-GC case has a small heap change (0.264 → 0.268 MiB cold); relative percentages exaggerate that few-KiB difference. No extra history or text is collected.

All six workloads retain the same physical Item count, logical IDs and range/sparse index diagnostics. Plain 100k/1m retain 100,001/1,000,001 Items and 392/3,908 index ranges. The original metadata compression remains active and byte-identical. The earlier uncompressed comparison remains historical evidence in the metadata-memory report; it is not a third variant measured in this run. Browser/editor heap, snapshot-load retained memory and long-lived histories are not separately measured.

## Profiling and regression evidence

Before/after CPU profiles use setup, initial materialization and ten insert/materialize iterations on one million units. Their summaries retain source URLs, sampled duration and profile hashes. Before, character-level conversion callbacks, GC and the membership rewrite are prominent. After, `rawBlock`, `marksOf` and GC remain prominent. Samples are diagnostic evidence rather than exact function self-time or GC pause measurements. Profiling runs do not contribute to the latency tables.

Six new tests cover 500 seeded mixed-run/nested-span cases against the unchanged character-unit oracle, non-string runtime rejection, one-entry membership updates with prior public Block immutability, subsequent formatting/deletion invalidation, object-valued span identity, and both multiple-span priority orders. Existing Unicode, mutable-output isolation, hidden-cell, structural cache, placement, cardinality and history regressions remain enabled.

First failures are retained locally. The intended baseline bound test writes 10,001 membership entries instead of one. A first candidate incorrectly merged separate object-valued spans with identical JSON; the new fixed case requires strict span-value identity and passes after the guard. An exploratory 100k pilot is excluded from the 36 workers; primary results use the final worker/source only. `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` passes **622 library + 16 demo + 27 documentation tests**. Compatibility unit tests pass **31**. Chrome 156.0.8078.47 passes **150 product + 310 existing compatibility assertions**, with **30 separately captured operation traces** and zero console errors. The five required-child cases use matching explicit fixture schemas in the bundle and backend. No unexpected Chrome failure occurs. Typecheck, isolated product/compat builds and docs build/link/English checks pass (22 pages, 1,030 internal links). Results are bound to sources in `validation.json` and HANDOFF §5.30.

## Remaining scope

This reduces full text-model allocation and redundant membership work. It does not remove full character reads in a changed paragraph, line/character array copies, structural sequence scans, block-tree normalization or public model copying. Very fragmented marks still require many output runs. Browser regression checks establish bounded functionality, not before/after screen latency or memory. Actual OS IME, production/WAN behavior and release SLOs remain separate work.

## Reproduction

Use Node 22.19.0 and repository dependencies. From the repository root, measure current sources:

```sh
node --expose-gc benchmarks/receive-model.mjs packages/doc-sync/src/crdt/doc.ts plain100k
node --expose-gc benchmarks/receive-model-controls.mjs packages/doc-sync/src/crdt/doc.ts paragraphs100k
```

Recreate the compressed baseline in an unused output directory without altering current sources:

```sh
mkdir -p output/receive-model-baseline
git archive 499c221bcd7ce85fc91f9d6f2a144822e385b46a packages/doc-sync/src/crdt | tar -x -C output/receive-model-baseline
git apply --directory=output/receive-model-baseline benchmarks/results/receive-model-2026-10-24/baseline-core.patch
node --expose-gc benchmarks/receive-model.mjs output/receive-model-baseline/packages/doc-sync/src/crdt/doc.ts plain100k
```

Primary workload names: `plain100k`, `plain1m`, `actors100k`, `marked100k`, `sparse100k`, `compacted100k`. Control names: `paragraphs100k`, `alternating20k`, `links20k`. Repeat each variant in fresh processes with alternating order and check hashes before comparing values.

```sh
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm run typecheck
npm test --prefix apps/demo/compat
PRODUCT_BUNDLE=output/playwright/my-receive-check/bundle.js node apps/demo/products/build.mjs
npm run docs:build
npm run docs:check
```

Browser checks use a separate named Chrome session, isolated bundles and temporary backend directories. User servers, tabs, original data and inherited WIP remain protected. No commit, push or deployment is requested.
