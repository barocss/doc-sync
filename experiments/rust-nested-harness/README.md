# Native nested-flow and table differential harness

Run from the repository root with Node 24 and a built native binary:

```sh
cargo build --manifest-path experiments/rust-shadow/Cargo.toml
node --experimental-strip-types experiments/rust-nested-harness/harness.ts
```

The fixed `schema-nested.json` permits recursive callouts and tables in root flows,
callout bodies, and table-cell bodies. Inputs are actual production `Doc.edit`
and command operations. The child receives operations, history options, deterministic
time, selection paths, and native-owned checkpoints. It receives no expected state,
model, or inverse operations.

The oracle compares complete physical lines in canonical key order, each line's
owner, slot, ordered tokens including derived heads, immutable birth/boundary,
register values and writer tickets, deletion and cancellation tickets, clocks,
recursive model, all physical-line projections, grid axes, spans, covered cells,
and retained hidden cell text. Canonical line order does not assert TS Map
insertion order. The canonical storage read materializes all valid body, axis, and physical
row-by-column cell heads before the comparison, including deleted owners and
axes. These derived reads must not advance the clock. This proves canonical
storage contents; it does not prove TS lazy allocation or snapshot byte parity. Exact shared History graphs, inverse operations, caret values, pin
tickets, and stable nested InputSession selections are compared separately.

Fixtures cover recursive flows, tables in callouts and cells, row and column edits,
cell merge/split, overlapping spans in both delivery orders, span expansion and
shrinkage after axis edits, deleted span origins, raw born-and-deleted owners,
zero-axis storage, foreign edits under deleted parents, equal-value foreign cell
attribute ownership, and three actors with saved deterministic seeds and delayed
causally ready batches plus duplicate replay. Recovery uses actual
`SyncClient.pending` and `DocHub`: a native joint checkpoint is restored in a fresh
process, foreign operations arrive, and the original pending operations replay
twice. Each recovery then checks further independent undo/redo.

The readable receipt contains counters, recovery cases, all source hashes, and a
trace descriptor. `trace.json.gz` preserves every compact request and response
in a JSON array. The descriptor includes record count, raw and compressed byte
lengths, and SHA-256 hashes of both forms. Decode it from the repository root:

```sh
gzip -dc experiments/rust-nested-harness/trace.json.gz > /tmp/rust-nested-trace.json
```

Hashes before and after
cover production source, all six harnesses and READMEs, schema manifests, Cargo
files, native source/tests, and the executable. Historical receipts remain
unchanged. The fixed schema excludes moves, schema transitions, GC, arbitrary
noncausal absent-target delivery, nonfinite JSON, and isolated UTF16 surrogates
inside JSON attribute strings. This does not qualify browser, WASM, performance,
full server recovery, or a production migration.


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_NESTED_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged. Set `RUST_NESTED_TRACE` to a distinct `trace-current-move.json.gz` path to preserve historical compressed traces.
