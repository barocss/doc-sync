# Rust groups, inline units, and value spans differential harness

This experiment compares the pinned `schema-shapes.json` reference with the native v5 interpreter. It does not change the production editor.

Run from the repository root after `cargo build --manifest-path experiments/rust-shadow/Cargo.toml`:

```sh
node --experimental-strip-types experiments/rust-shapes-harness/harness.ts
```

The reference uses actual `Doc.edit`, commands, `History`, `InputSession`, and `MemoryNet` (`SyncClient.pending` and `DocHub`). The child receives operation batches, times, history options, selections, and its own checkpoint. It receives no expected state, model, or inverse operation. The child projects its own recursive model and generates its own undo and redo operations.

Checks compare all physical normalized lines, token identity, UTF-16 units, inline identity, attributes and writers, deletion ledgers, every line's block projection, the complete recursive model, History graphs, caret values, pins, and inverse arrays. Inline nodes count as one unit. Selection capture covers every offset, including positions inside surrogate pairs, around inline units, and inside value spans. After each capture, the harness retains 24 evenly distributed ranges for checks after each operation.

Fixtures cover lists grouped by level and listType, contiguous boundaries, `$type` entry and exit, inline insertion and deletion, equal foreign writers, link values and null reset, nested bold and italic formats, and shapes inside callouts and table cells. Covered cells and deleted ancestors retain physical shape content. Three saved random seeds drive three actors through causally valid delayed batches, reordered independent batches, duplicates, and History actions.

Fresh-process recovery uses nine real pending cases: group attributes and type, inline birth, deletion and attributes, span value and null, undo, and redo. Foreign tokens are inserted in the same affected list item. Their identity, units, attributes, writer metadata, and ledgers must survive restore, exact pending replay twice, and subsequent undo and redo. Replay must leave History unchanged.

`receipt.json` is the readable summary. `fulltrace.json.gz` contains complete native requests and responses, expected state/History hashes, saved seeds, pending batches and checkpoints. The receipt records raw and compressed byte counts and SHA-256 hashes. Source and binary manifests are captured before and after the run. Overrides: `RUST_SHADOW_BINARY`, `RUST_SHAPES_RECEIPT`, and `RUST_SHAPES_TRACE`.

Proof is limited to the pinned schema and native process. It does not establish browser, WASM, performance, GC, movement, schema migration, or production replacement readiness.


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_SHAPES_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged. Set `RUST_SHAPES_TRACE` to a distinct `trace-current-move.json.gz` path to preserve historical compressed traces.
