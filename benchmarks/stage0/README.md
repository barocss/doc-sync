# Stage 0 workload measurements

Use Node 22.19 or later. Run commands from the repository root. Install the root workspace dependencies first.

The harness runs five roadmap workloads: 10,000 single-character edits, a 100,000-character paste, four peers for 30 real minutes, a 50 by 10 table, and opening a snapshot after exactly 10,000 edits. A mixed paragraph trace also checks sequential split and merge behavior.

## Prepare an immutable source copy

```sh
npm run stage0:freeze --workspace @doc-sync/benchmarks -- /tmp/doc-sync-stage0-receipt
```

Use the printed source directory as `BASELINE`. The receipt contains the source archive, file hashes, Git HEAD, and working tree diff. The copy uses the installed root `node_modules` for dependencies. It rewrites the copied engine and schema imports to the copied core. It does not modify core source.

Install Yorkie in a separate temporary directory. Use a separate npm cache if the default cache is not writable.

```sh
npm install --prefix /tmp/doc-sync-stage0-yorkie --cache /tmp/doc-sync-stage0-npm-cache --ignore-scripts --no-audit --no-fund @yorkie-js/sdk@0.7.25
```

Use `/tmp/doc-sync-stage0-yorkie/node_modules/@yorkie-js/sdk/dist/yorkie-js-sdk.js` as `YORKIE_ENTRY`. The harness uses the published SDK. It does not require a Yorkie server or modify another SDK repository. Omitting `--yorkie` measures only ours and Yjs.

## Run

Replace the paths below with the prepared paths. Output directories must be new for each attempt.

```sh
npm run stage0 --workspace @doc-sync/benchmarks -- --baseline=BASELINE --yorkie=YORKIE_ENTRY --out=NEW_RESULT_DIR
npm run stage0:bounded --workspace @doc-sync/benchmarks -- --baseline=BASELINE --yorkie=YORKIE_ENTRY --out=NEW_BOUNDED_DIR --timeout=120000
npm run stage0:paced --workspace @doc-sync/benchmarks -- --baseline=BASELINE --yorkie=YORKIE_ENTRY --out=NEW_PACED_DIR
node benchmarks/stage0/load-sampler.mjs NEW_PACED_DIR
STAGE0_BASELINE=BASELINE STAGE0_YORKIE=YORKIE_ENTRY npm run stage0:test --workspace @doc-sync/benchmarks
```

The paced run observes a 1,800,000 ms wall-clock window. It schedules its first tick at 0 ms. Each second, four actors insert one character at the same boundary from their prior common view. The relay delivers those four changes after all four local edits. The run checks replica convergence every round and letter counts at completion. It has no network delay, lease expiry, disconnection, or server restart. Its requested cadence is one human input per second per peer. It is not a transport endurance test.

The CLI does not begin a new round at or after the deadline. It finishes an in-flight atomic round, so a slow round can exceed the window. It records actual rounds, per-tick scheduled and actual times, missed intervals, window overshoot, and convergence. A full trace with no missed intervals and the final round completed within the window produces `complete.json`. A missed cadence produces `window-observation.json` plus `failure.json` and exit code 2. Do not treat that result as a full trace pass. Use `--engines=ours` to observe one engine separately; the default three-engine loop has shared scheduling cost.

The historical `paced-real-30min` run used the original fixed-round implementation. After at least 30 real minutes, integration stopped only that owned process. Its observation receipt identifies the last durable checkpoint and missing final telemetry. It is not a pass. The original artifacts and reconstructed original harness source are preserved. The corrected wall-clock CLI was checked with short fixtures; no extra 30-minute rerun was performed.

For a short harness check, add `--duration=100 --interval=20`. Such runs have `accelerated: true`. They do not count as the real 30-minute result.

The bounded runner isolates each case in a process and preserves a declared timeout receipt. A timeout applies to the whole case, including checks and snapshot opens. It is censored evidence, not a measured edit time. `allCasesPassed` is false if any case fails or times out.

## Metric boundaries

- `localMs`: edit compilation and local apply plus the wrapper's payload preparation. Ours serializes JSON. Yjs encodes its update. Yorkie converts a change pack to its protobuf object and applies a local acknowledgement. These wrappers have different costs.
- `remoteApplyMs`: the receiver wrapper's decode and apply. There is no network or editor render time.
- `modelReadMs`: reading the visible text model. The first read and cached reads can differ. The report includes the samples and maximum.
- `openIncludingModelMs`: snapshot load plus the first visible text model. `loadMs` and `firstModelMs` also appear separately.
- `snapshot.bytes`: actual JSON, Yjs binary, or Yorkie binary snapshot bytes. Formats differ.
- `wireBytes`: actual JSON or Yjs update bytes. Yorkie is `null`. The harness does not estimate protobuf wire size from object size.
- `retainedLoadHeapDeltaBytes`: process heap change after GC while retaining one loaded document and its visible model. This is approximate. Allocator, JIT, clones, caches, and retained source snapshots differ. Do not treat this as an accepted memory SLO.
- CRDT GC policies also differ: ours has no explicit `Doc.gc` call, Yjs keeps its default GC behavior, and Yorkie GC is disabled without a service frontier. Snapshot and heap figures do not establish equal-frontier memory efficiency.
- p50 and p95 use the sorted sample at `floor(q * count)`, capped at the last sample. A one-paste workload has one local and remote sample, not a latency distribution.

The 50 by 10 comparison measures text in a fixed grid. Different cells use one common expected string model. Same-cell concurrent insertion checks convergence within each engine. Concurrent overlapping deletion must delete the original two tokens once. The harness does not require the engines to use the same concurrent insertion order. Row insertion, column deletion, merged cells, undo, and concurrent Enter have different model policies and are outside the cross-engine table comparison.

The mixed paragraph trace is sequential. Ours uses block markers for split and merge. The Yjs wrapper deletes the suffix and inserts it into another paragraph. Yorkie uses its native Tree split and merge operations. The same visible sequential result does not establish equal token identity or equal intent for concurrent Enter. Ours keeps its existing same-boundary concurrent Enter rule; this comparison does not change or qualify that rule.

Yorkie uses `Document`, `Tree`, `createChangePack`, `applyChangePack`, and `converter` from the published SDK. The in-memory relay acknowledges each actor's local changes and forwards only new changes. It disables Yorkie GC for workloads with deletions because there is no service-computed minimum version vector. The first paced run used the default Yorkie GC option. That trace contains only insertions, so it has no deleted nodes to collect.

Official API reference: https://yorkie.dev/docs/sdks/js-sdk

Keep results from failed attempts. A `started.json` without `complete.json` is not a pass. A result is valid only for its recorded source and measurement scope. Stage 0 data alone does not approve G0 or establish a product SLO.
