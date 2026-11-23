# Bounded AI read workload comparison

Measurement status: NOT_RUN. The benchmark is ready. Measurements wait for the shared CPU and package-build freeze.

## Scope

This benchmark compares two local workloads in the same compiled public Core package:

- Full read: `Doc.toJSON()` returns the canonical root model, then `JSON.stringify` serializes that model.
- Bounded read: `readDocumentSlice()` returns the selected children with paths, block identities, paging metadata, and counters, then `JSON.stringify` serializes that result.

The full result contains more document content. The output scopes differ by design. This comparison is not an implementation before/after test and does not establish a speedup for equivalent output. It measures no network, server, MCP transport, editor, browser, paid model, or model-inference latency. Byte counts describe Core JSON only. Signed MCP response bytes and transport envelopes are outside this scope.

## Method

Run from the repository root after the Core package build:

```sh
PATH=/Users/user/.nvm/versions/node/v24.22.1/bin:$PATH node --expose-gc benchmarks/bounded-ai-reads.mjs
```

The script uses 1,000 and 100,000 flat paragraph siblings with one text character each. Two smaller rich workloads use 1,000 nested boxes, bold text, Korean text, emoji, and a retained covered table cell. Each mode starts from a separate restored replica of the same snapshot and schema. Construction and snapshot restoration occur outside the measured interval.

Each mode has one first-read observation per fixture. This is the first read on its restored replica; the Node process, JIT, and OS are not cold. First-read order alternates across fixtures. The script then repeats the same query 21 times on each unchanged replica and alternates mode order for each repetition. There is no extra untimed warmup. Summary percentiles use nearest rank: median is sorted sample 11; p95 is sorted sample 20.

The script measures model materialization and `JSON.stringify` separately and reports their sum. GC, oracle checks, JSON byte counting, and source hashing occur outside those timing intervals. It records raw samples, execution order, API-reported projected/indexed block counts, and calls to `Doc.toJSON` and `projectVisibleBlock`.

The selected child nodes must equal the corresponding children in the full canonical model. Each replica's final snapshot digest must equal its original snapshot digest. A separate oversized single-child check must reject before detached block projection. The script hashes Core source and compiled output before and after the run and rejects a changed build. It also records its own hash, Node version, OS, architecture, and CPU model.

Heap observations start after explicit GC. The script records `heapUsed` changes before final GC and after final GC while keeping the result and serialized string live. These values are process heap deltas. They are not total allocated bytes, peak memory, retained CRDT cache size in isolation, or allocation-profiler results. GC can reclaim unrelated data and produce negative deltas.

## Limits

There is one first-read observation per mode. JIT, runtime scheduling, execution order, and measurement instrumentation can affect all timings. The 100,000-sibling fixture is a simple flat document; the nested and table fixtures are smaller controls. Warm flat-root behavior does not establish global constant time. First reads can scan sibling lines and build caches. Nested address resolution and subtree projection can add work.

Stale paging after insert, move, delete, and schema mutation belongs to the separate Core correctness tests. It is not timed here. This benchmark alone does not close a broad nested/global performance gate or establish a product SLO.
