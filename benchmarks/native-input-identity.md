# Native input identity cost

This benchmark compares an independently imported baseline checkout with the current checkout. It uses raw `SyncClient` for both checkouts. It does not use the unified Client wrapper. The browser's `api=legacy` route shares the current native fix, so that route cannot measure the cost of the fix against the old native implementation.

Timing is measured. The [delivery report](results/unified-client/report.md)
retains 15/16 passing repeated guards and the remaining Slate 10k insert p95
flag. The first baseline probe incorrectly required zero snapshots for marked
replacement; its existing fallback uses one. The failed receipt is retained.
Build each checkout before timing and do not overlap builds or other deliberate
CPU workloads with measurement.

```sh
node benchmarks/native-input-identity.mjs --target=/Users/user/github/doc-sync-client-baseline --output=output/unified-client-delivery/native-identity/baseline.json
node benchmarks/native-input-identity.mjs --target=/Users/user/github/doc-sync --output=output/unified-client-delivery/native-identity/current.json
node benchmarks/native-input-identity.mjs --compare=output/unified-client-delivery/native-identity/baseline.json,output/unified-client-delivery/native-identity/current.json --output=output/unified-client-delivery/native-identity/comparison.json
```

The script requires Node 24. Each editor and scenario has two warmups and eight saved timing samples. Each fixture has 10,000 or 100,000 text characters, in paragraphs with 100 characters. The first 10 characters of each paragraph have the bold mark. Slate uses actual `Transforms` operations. Lexical uses actual discrete editor updates and native range selections. Selection setup, model checks, fixture construction, undo, and redo are outside the measured input interval.

The scenarios are one-character insertion, insertion of a repeated plain prefix, range deletion, and replacement of a marked range. Each action must match a fixed model oracle, match its native projection, create one undo group, and pass undo and redo roundtrips. Sync clients remain disconnected. Transport subscription, send, and presence counters must be zero. These checks qualify native input semantics and history roundtrips. They do not qualify foreign-actor character ownership; the separate Chrome regression does that.

The receipt includes all warmup and timing samples, `Doc.snapshot`, `Doc.fromSnapshot`, and `Doc.toJSON` counts, full distribution fingerprints before and after measurement, and model and history hashes. Snapshot and restore counts must be zero for basic insertion, prefix insertion, and deletion. For marked replacement, the comparison requires candidate snapshot, restore, and toJSON counts to be no greater than the paired baseline maximum. It records all counts. It does not assume zero for this existing fallback. Internal codec conversion counts are **NOT_INSTRUMENTED**: replacing an exported ESM function does not replace its internal imported bindings. Do not report such counts as zero.

The comparison uses the nearest-rank median and p95. Eight samples make p95 the largest sample. A median increase above `max(10% of baseline, 0.1 ms)` or a p95 increase above `max(15% of baseline, 0.2 ms)` has status **INVESTIGATE**. The script has no flag to hide a regression or loosen these limits. An INVESTIGATE result is saved as evidence and requires review.

This is a Node native-editor benchmark. It excludes browser DOM work, rendering, transport delivery, OS IME, and physical display latency. It measures the input interval through native callback microtasks. Compare distributions produced by the same script and Node version.

For a semantics and count diagnostic, use `--mode=counts`. This mode uses one sample without warmups and makes no timing claim. Default timing mode keeps the fixed two warmups and eight samples. Comparison reports `timingStatus: NOT_RUN` for count diagnostics.

The count diagnostic in `baseline-counts-attempt-2.json` also exposed a setup error: the programmatic Lexical range helper did not copy the anchor node's typing format. That failed receipt is retained. The corrected setup explicitly sets the native range typing format from its anchor TextNode before the measured interval. The fixed bold semantic oracle remains unchanged.

## Recorded result

The final count pair passes all 16 cells. A six-capture A-B-B-A-A-B run pools
24 timing samples per side and passes 15/16 guards. Slate 10k insert p95 retains
an INVESTIGATE flag (2.123 to 4.481 ms), while median improves 1.333 to 0.947 ms.
All 100k medians improve. Original timing, failed harness probes and all repeated
captures remain in the report. A uniform performance PASS is not established.
