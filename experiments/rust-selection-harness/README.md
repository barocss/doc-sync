# Native selection and delayed delivery harness

Run from the repository root with Node 24:

```sh
cargo build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-selection-harness/harness.ts
```

The reference uses actual TypeScript `anchorAt`, `pathAt`, and
`InputSession.capture`/`resolve`, together with production `Doc` and `History`.
The child independently captures and resolves token keys. It receives offsets,
anchor/focus keys, operations, and native-owned checkpoints. Expected positions,
expected inverse operations, and expected document states are not inputs.

Fixtures capture each UTF-16 offset in `A😀B`, including the point between the
surrogate units. They preserve reversed and collapsed anchor/focus ranges.
Checks run after insertions, deletion of endpoints and their predecessors,
undo/redo, native process restart, and further edits. Empty/root/end positions,
unknown keys, strict invalid paths, and null ranges are included. Raw unknown
key resolution returns the start. Strict product resolution rejects an unknown
key. `anchor_capture` accepts valid offsets only; it does not claim raw editor
clamping parity for invalid offsets.

Two saved seeds run eight rounds each with three actors. All three actors
create a local batch before any actor receives the other batches from that
round. Receivers use different permutations of causally ready batches, then
replay duplicate batches in reverse order. Native History independently creates
local inverse operations. Every checkpoint compares the complete declared flat
document state and exact history graph. Each completed round must converge.
Dependencies from earlier rounds are delivered before the next round starts.
This is delayed and reordered causal delivery, with exact duplicate replay;
it does not assume buffering for mutations of absent birth tokens.

The compact receipt contains full native requests and responses, comparison
hashes, exact counters, and recursive source/binary SHA-256 manifests before
and after the run. The scope remains one implicit paragraph with boolean marks.
General node identity and schema behavior, moves, protected GC, real network
recovery, WASM, browser selection, and performance remain outside this proof.
These results do not complete R4 or authorize a production switch.


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_SELECTION_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged.
