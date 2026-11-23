# Native paragraph marker differential harness

This experiment opts in to native capability `paragraph-markers-v1`.
It uses actual production split, backspace, forward-delete, and model merge
commands. The production TypeScript code is unchanged.

```sh
cargo build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-structure-harness/harness.ts
```

The receipt compares every token's ID, origin, immutable `born` and `boundary`,
UTF-16 character unit, deletion/cancellation sets, and current register values
and tickets, including paragraph `$type`. It compares full projected blocks,
marker IDs, live aliases, character IDs, attributes, model runs, clock, counts,
and exact shared History graph. Rust generates its own inverse operations.

Cases cover splits inside a surrogate pair and at paragraph edges, empty
paragraphs, node undo/redo, merge by both editing commands and model operations,
simultaneous Enter by three actors, both delivery orders, duplicate delivery,
primary-marker deletion and alias re-election, reverse actor undo/redo, merge
of all aliases, and foreign insertion across a concurrent merge.

Two saved random seeds run ten rounds each with three actors. Every actor
creates its split, merge, insertion, mark, undo, or redo batch before any actor
receives the other batches in that round. Causally ready batches use permuted
delivery followed by reverse duplicate replay. Full state must converge after
every round. Multi-paragraph anchors are checked throughout these traces.

Actual InputSession capture/resolve checks multi-paragraph anchor/focus ranges.
Real SyncClient pending split and merge batches are saved after generation with
a native joint document/history checkpoint. A fresh native process restores
that checkpoint, receives a foreign insertion, and applies the original pending
batch twice. History must stay unchanged, and later independent undo/redo must
preserve the foreign insertion.

The native child receives operations, positions, anchor keys, record metadata,
and its own checkpoint. It never receives expected TypeScript states or inverse
outputs. Full requests/responses and recursive source/binary hashes are saved
in `structure.json`. The manifest includes the native test sources.

This slice supports only legacy paragraph marker boundaries. Other node types,
authored type changes, general attributes, moves, `$join`, GC, schema transitions,
full server recovery, WASM, browser behavior, and performance are outside its
scope. R4 remains incomplete. Prior phase receipts remain immutable; regression
runs against this binary use distinct `receipt-current-structure.json` files.


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_STRUCTURE_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged.
