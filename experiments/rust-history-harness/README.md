# Independent native History differential harness

Run from the repository root with Node 24:

```sh
cargo build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-history-harness/harness.ts
```

The reference is the current production TypeScript `Doc` and `History`. The
native child captures each operation's prior state and generates its own undo
and redo operations. The harness compares exact generated operation arrays,
caret keys, every field of the declared flat document state, `canUndo` and
`canRedo`, deletion pin tickets and minimum sequences, and the exact exported
history graph. Shared formatting state references are part of that graph.

The child receives operation inputs, record options, a deterministic timestamp,
and its own exported checkpoints. It never receives an expected TypeScript
state or an expected inverse operation. The compact receipt retains actual
native responses, full document/history states, original requests, expected
state hashes, and source/binary SHA-256 hashes before and after the run.

Cases include foreign insertion preservation, overlapping deletions, partial
foreign formatting ownership, same-actor unrecorded writes, sequential shared
format states, multiple prior-value inverse groups, two sets in one record,
delete then format, repeated undo/redo, branch invalidation, typing groups,
the exact 1500 ms typing boundary, caret discontinuity, empty record, explicit
history clear, depth eviction, and four deterministic random seeds. Invalid
history requests must leave both the native document and history unchanged.
`History.clear` is the explicit clear/flush operation; production History has
no separate flush method.

Recovery fixtures use actual `SyncClient.pending` operations from `MemoryNet`.
Native checkpoints are exported both before and after pending edits. Each is
restored in a fresh child process, receives a foreign accepted insertion, and
replays the saved pending operations. Missing pending edits are recorded once;
already-present pending edits use plain `apply`. The test repeats exact replay,
undo/redo, another partly-undone process restart, and a new branch. This proves
the recorded document/history recovery slice. It does not prove complete sync
client or server recovery. `history_record` is not a deduplicated request API;
the pending owner must distinguish a new local commit from wire replay.

The recovery matrix also saves checkpoints after actual pending delete, format,
undo, and redo operations. Each case restarts the native child, receives a
foreign overlapping deletion or later same-key format, and applies the original
pending batch twice. The saved history graph must stay unchanged. Four later
undo/redo actions must match exactly and preserve the foreign edit. Pin tickets
and minimum sequence are checked. A checkpoint saved before a pending inverse
does not contain that inverse's history transition. Restoring that transition
from the wire operations alone is outside this proof; the harness does not
regenerate inverse tickets and call them an exact retry.

The native schema remains one implicit paragraph with UTF-16 text and boolean
`bold`/`italic` marks. Supported history steps are text existence and those
mark writes. Local record batches require fresh unique operation tickets and
valid targets. Repeated references to the same JavaScript operation object in
one local emit batch are outside the JSON boundary. Remote exact duplicate
application is tested. Native validation is stricter than raw TypeScript;
general rejection parity, clock exhaustion behavior, nodes/moves, general
schemas, protected GC, WASM, browser behavior, and performance are not proven.

This receipt supplements the historic first CRDT shadow receipt. It does not
replace that evidence or complete R4. The next bounded slice is
[selection and delayed multi-actor delivery](../rust-selection-harness/README.md).


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_HISTORY_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged.
