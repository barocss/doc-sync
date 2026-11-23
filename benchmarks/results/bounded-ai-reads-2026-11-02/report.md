# Bounded AI read workload comparison

Measurement status: PASS for the four local workloads and their oracle checks. This is a workload comparison. No broader performance gate or product SLO is declared complete.

Run: `2026-11-01T18:53:31.273Z`. Node `v24.22.1`; darwin 24.6.0 arm64; Apple M3 Max. Raw samples, exact values, queries, snapshot digests, and execution order are in [run.json](run.json).

## Observations

Timings are milliseconds. First-read values are single observations. Warm values use 21 samples per mode. Materialization includes the Core read; serialization is the subsequent `JSON.stringify`.

| Fixture | Mode | First model | First model + JSON | Warm model median | Warm JSON median | Warm model + JSON median | Warm model + JSON p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flat-1000 | full | 6.784 | 6.891 | 0.580 | 0.105 | 0.686 | 0.729 |
| flat-1000 | bounded | 4.219 | 4.223 | 0.473 | 0.005 | 0.477 | 0.512 |
| flat-100000 | full | 330.093 | 344.525 | 58.406 | 12.473 | 70.936 | 75.800 |
| flat-100000 | bounded | 135.316 | 135.320 | 0.480 | 0.004 | 0.484 | 0.520 |
| nested-marked-1000-boxes | full | 116.273 | 121.318 | 2.571 | 1.208 | 3.818 | 4.318 |
| nested-marked-1000-boxes | bounded | 2.695 | 2.696 | 1.373 | 0.001 | 1.375 | 1.461 |
| retained-table-cell-in-rich-document | full | 109.845 | 113.679 | 2.122 | 1.958 | 4.109 | 4.433 |
| retained-table-cell-in-rich-document | bounded | 3.675 | 3.679 | 3.315 | 0.001 | 3.316 | 3.516 |

The 100,000-sibling full result contains 4,600,027 bytes (4.39 MiB). Its slice contains 2,100 bytes on the first read and 2,095 bytes on warm reads, below the 262,144-byte limit. The output scopes differ. These times do not measure equivalent-output speedup.

The flat-root warm slices have similar observed times at 1,000 and 100,000 siblings. Their first reads differ: the slice indexes 1,000 and 100,000 blocks respectively. This supports a narrow observation about a cached flat-root query. It does not support constant-time first reads or global constant time.

The retained-table query returns one paragraph from a covered cell. The oracle confirms that this is the retained canonical model content. Its warm model time is higher than the full model time in this run (median 3.315 ms versus 2.122 ms), while its JSON output is smaller. Its warm pre-final-GC heap delta is also higher. A small payload does not guarantee less work or less temporary heap use for every address.

## Output and bounded-read counters

Bytes are UTF-8 bytes of the complete Core JSON result. First and warm sizes can differ because the indexed-block counter changes. The reported counters do not count all internal address-resolution scans.

| Fixture | Full bytes | Bounded bytes first / warm | Indexed blocks first / warm | Projected blocks | `toJSON` calls per bounded read |
| --- | ---: | ---: | ---: | ---: | ---: |
| flat-1000 | 46,027 | 2,012 / 2,009 | 1,000 / 0 | 20 | 0 |
| flat-100000 | 4,600,027 | 2,100 / 2,095 | 100,000 / 0 | 20 | 0 |
| nested-marked-1000-boxes | 513,963 | 761 / 761 | 3 / 0 | 2 | 0 |
| retained-table-cell-in-rich-document | 514,522 | 438 / 438 | 1 / 0 | 1 | 0 |

All 88 bounded reads matched the selected-child oracle and stayed below the Core JSON cap. Each full read called `Doc.toJSON` once. Each bounded read called it zero times. The oversized single child has 65,537 text units; the 65,536-unit default limit rejected it before any `projectVisibleBlock` or `toJSON` call.

## Scoped heap observations

Values below are MiB changes in `heapUsed`. They are not total allocation or peak memory. First-read values can include newly retained caches. Warm values are medians. Negative post-GC values occur in raw nested/table samples because GC can reclaim unrelated data.

| Fixture | Mode | First before final GC | First after final GC | Warm before final GC | Warm after final GC |
| --- | --- | ---: | ---: | ---: | ---: |
| flat-1000 | full | 6.448 | 1.642 | 0.899 | 0.265 |
| flat-1000 | bounded | 4.329 | 0.719 | 0.256 | 0.012 |
| flat-100000 | full | 202.739 | 147.744 | 41.696 | 26.512 |
| flat-100000 | bounded | 104.006 | 56.882 | 0.216 | 0.013 |
| nested-marked-1000-boxes | full | 35.060 | 21.789 | 3.850 | 1.843 |
| nested-marked-1000-boxes | bounded | 4.663 | 0.566 | 2.349 | 0.004 |
| retained-table-cell-in-rich-document | full | 34.895 | 21.830 | 3.855 | 1.845 |
| retained-table-cell-in-rich-document | bounded | 6.365 | 0.516 | 6.943 | 0.222 |

## Integrity checks

- Selected-child oracle: PASS for first and warm reads in all four workloads.
- Snapshot preservation: PASS. The final full and bounded replica digests each equal the fixture `snapshotSha256` stored in the raw receipt. Digests are asserted, not inferred from timing.
- Core source and compiled-output freeze: PASS. Hashes before and after the run match.
- Core source SHA-256: `4484232e778f6eb0d3ddaa6820bf8d6fd81cb6fdea747c66413a160fbfd01038`.
- Core dist SHA-256: `48e43a8a7f8c2cb506d1212188af2c0ae865e057fdff4902df949419bc10fe92`.
- Benchmark SHA-256: `17c0884f6add49ca744ca523828cd3832d6f42ec4cfa6c63ea882f856760eff7`.
- Oversized single-child rejection: PASS.


## Scope

This benchmark compares two local workloads in the same compiled public Core package:

- Full read: `Doc.toJSON()` returns the canonical root model, then `JSON.stringify` serializes that model.
- Bounded read: `readDocumentSlice()` returns the selected children with paths, block identities, paging metadata, and counters, then `JSON.stringify` serializes that result.

The full result contains more document content. The output scopes differ by design. This comparison is not an implementation before/after test and does not establish a speedup for equivalent output. It measures no network, server, MCP transport, editor, browser, paid model, or model-inference latency. Byte counts describe Core JSON only. Signed MCP response bytes and transport envelopes are outside this scope.

## Method

Run from the repository root after the Core package build:

```sh
node --expose-gc benchmarks/bounded-ai-reads.mjs
```

The script uses 1,000 and 100,000 flat paragraph siblings with one text character each. Two smaller rich workloads use 1,000 nested boxes, bold text, Korean text, emoji, and a retained covered table cell. Each mode starts from a separate restored replica of the same snapshot and schema. Construction and snapshot restoration occur outside the measured interval.

Each mode has one first-read observation per fixture. This is the first read on its restored replica; the Node process, JIT, and OS are not cold. First-read order alternates across fixtures. The script then repeats the same query 21 times on each unchanged replica and alternates mode order for each repetition. There is no extra untimed warmup. Summary percentiles use nearest rank: median is sorted sample 11; p95 is sorted sample 20.

The script measures model materialization and `JSON.stringify` separately and reports their sum. GC, oracle checks, JSON byte counting, and source hashing occur outside those timing intervals. It records raw samples, execution order, API-reported projected/indexed block counts, and calls to `Doc.toJSON` and `projectVisibleBlock`.

The selected child nodes must equal the corresponding children in the full canonical model. Each replica's final snapshot digest must equal its original snapshot digest. A separate oversized single-child check must reject before detached block projection. The script hashes Core source and compiled output before and after the run and rejects a changed build. It also records its own hash, Node version, OS, architecture, and CPU model.

Heap observations start after explicit GC. The script records `heapUsed` changes before final GC and after final GC while keeping the result and serialized string live. These values are process heap deltas. They are not total allocated bytes, peak memory, retained CRDT cache size in isolation, or allocation-profiler results. GC can reclaim unrelated data and produce negative deltas.

## Limits

There is one first-read observation per mode. JIT, runtime scheduling, execution order, and measurement instrumentation can affect all timings. The 100,000-sibling fixture is a simple flat document; the nested and table fixtures are smaller controls. Warm flat-root behavior does not establish global constant time. First reads can scan sibling lines and build caches. Nested address resolution and subtree projection can add work.

Stale paging after insert, move, delete, and schema mutation belongs to the separate Core correctness tests. It is not timed here. This benchmark alone does not close a broad nested/global performance gate or establish a product SLO.
