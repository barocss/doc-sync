# Native Rust CRDT shadow harness

Run from the repository root with Node 24:

```sh
cargo build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-shadow-harness/harness.ts
```

The harness uses the current production TypeScript `Doc`, `History`, `SyncClient`, and `DocHub`. The native child process receives actual operation tickets and causal references. Text strings become UTF-16 code-unit arrays. The child never receives an expected state.

The supported schema is a flow root with one implicit paragraph and boolean `bold` and `italic` marks. Each checkpoint compares ordered token IDs, origins, UTF-16 units, visibility, deletion IDs, cancellation IDs, current attribute values and tickets, clock, counts, and the projected model. The receipt retains full states and operation inputs. It also records source and binary hashes before and after the run.

Deterministic cases cover concurrent insertion, overlapping and independent deletion, delete then bold then undo, foreign write protection, repeated undo/redo, duplicate replay, partial birth replay, and native process restart. Random cases use four saved seeds. Invalid batches must leave the native state unchanged. Nodes, moves, GC, other schemas, and other mark keys are outside this slice and must fail closed.

The restart cases save native snapshots both before and after local pending operations. Each case closes the child, starts a new child, restores the snapshot, and replays the exact saved `SyncClient.pending` operations after another user's edits. The pending operations are absent from one restored snapshot and already present in the other. This tests native document recovery and duplicate replay. It does not test complete server recovery or protected GC.

This apply-only harness uses TypeScript `History` to create all undo/redo inverse operations. Rust applies those inverse operations here. The separate [History harness](../rust-history-harness/README.md) exercises independent Rust inverse generation. Unicode actor comparator fixtures use raw `Doc.apply`; they are outside the production server actor gate. Browser and WASM tests are not run.

The generated `receipt.json` is the evidence for the specific source and binary hashes recorded in that run. A passing result applies only to this schema and operation slice.

See the [native contract and exclusions](../rust-shadow/README.md) for the exact
boundary. Rust rejects births with Lamport clock zero, the reserved `~root`
actor, or null birth marks. Isolated-surrogate actor names are unsupported;
UTF-16 text units remain supported. Raw TypeScript `Doc.apply` can accept some
inputs outside these restrictions. The harness does not establish general
acceptance or rejection parity.


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_SHADOW_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged.
