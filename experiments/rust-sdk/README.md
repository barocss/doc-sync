# Experimental native Rust SDK

This private crate provides a callable Rust API over the experimental native engine in `../rust-shadow`. It does not start a JSONL process. `publish = false` prevents publication.

## Add a Cargo dependency

Create a Rust application with `cargo new /tmp/doc-sync-native-example`.
Add the following to its `Cargo.toml`. Replace the absolute path with your checkout:

```toml
[dependencies]
doc-sync-native-sdk = { path = "/absolute/path/to/doc-sync/experiments/rust-sdk" }
```

Put the complete program below in the application's `src/main.rs`, then run
`cargo run --manifest-path /tmp/doc-sync-native-example/Cargo.toml`.
This native path does not require an npm build.

Use `Document` for one actor and one fixed `SchemaPreset`. Local commands return a `Change` with typed `Op` values. The host must send those operations to peers. Use `apply_remote` for delivery and exact retry. Remote delivery does not add local history or pending changes. Use a distinct actor for each independent author.

```rust
use doc_sync_native_sdk::{Attributes, Document, EditOptions, Key, SchemaPreset};

fn main() -> Result<(), doc_sync_native_sdk::Error> {
    let mut alice = Document::new("alice", SchemaPreset::Text)?;
    let mut bob = Document::new("bob", SchemaPreset::Text)?;
    let change = alice.insert_text(
        &Key::root(), "hello", Attributes::new(), EditOptions::default(), 0.0,
    )?;
    bob.apply_remote(&change.ops)?;
    let undo = alice.undo()?;
    bob.apply_remote(&undo.ops)?;
    Ok(())
}
```

Run the complete two-actor, undo/redo, checkpoint, restart, and duplicate delivery example:

```sh
CARGO_TARGET_DIR=output/r4-sdk-target cargo run --offline \
  --manifest-path experiments/rust-sdk/Cargo.toml --example two_actors
```

Run tests from the repository root:

```sh
CARGO_TARGET_DIR=output/r4-sdk-target cargo test --offline \
  --manifest-path experiments/rust-sdk/Cargo.toml
```

See the [Rust guide](../../apps/docs/src/guide/rust.md#checkpoint-retry-selection-and-history-recipe) for a complete selection, checkpoint, exact retry, acknowledgement, and History recipe. See [packages and engines](../../apps/docs/src/guide/packages.md#engine-selection-is-a-separate-milestone) for the TypeScript client and browser adapter boundary.

## Supported presets

Only these six engine presets are supported. The enum is closed. A document cannot register an arbitrary schema or change its preset.

| SDK preset | Native schema identity | Native capability |
| --- | --- | --- |
| `Text` | `flow-root-paragraph:boolean-marks:bold,italic:v1` | none |
| `Paragraphs` | `flow-root-paragraph:boolean-marks:bold,italic:v1` | `paragraph-markers-v1` |
| `Blocks` | `general-flow-blocks:json-attrs:v1` | `general-blocks-attrs-v1` |
| `Nested` | `nested-flows-tables:json-attrs:v1` | `nested-flows-tables-v1` |
| `Shapes` | `groups-inline-spans:json-attrs:value-marks:v1` | `groups-inline-spans-v1` |
| `Movement` | `movement-logical-storage:json-attrs:value-marks:v1` | `movement-logical-storage-v1` |

The native preset validates node types, attributes, marks, boundaries, and moves. `Mark::Link` requires a preset that supports links. A typed operation can still be invalid for its preset. The engine rejects invalid input.

## API and ownership

- `insert_text`, `delete_text`, and `set_mark` allocate fresh own tickets and record own history. `record` accepts an explicit typed batch for block births, moves, and other supported native operations. It requires fresh own tickets in order. It is not a retry API.
- `next_ticket` returns the next available ticket from the observed clock. It does not reserve a ticket. Construct all tickets in a batch with distinct clocks. A text birth occupies one clock per UTF-16 unit.
- `model` returns `ModelNode`, `ModelRun`, and `ModelText`. `Utf16Text` retains isolated surrogate units. Its conversion to a Rust `String` can fail.
- `capture_anchor`, `resolve_anchor`, `capture_selection`, and `resolve_selection` use native stable token anchors. `Position` indexes follow native model paths. The last text index is a UTF-16 offset. Anchor keys can include engine-owned storage heads.
- `undo` and `redo` return operations for peer delivery. The engine retains actor ownership and foreign edit fences. Each nonempty local result enters `pending_changes`.
- `acknowledge` removes only an exact pending prefix. An invalid acknowledgement leaves the queue intact. A host must call it only after its transport accepts that prefix.

## Coupled restart and retry

Persist `checkpoint().to_json()` as one host storage transaction. It contains the actor, preset, opaque native document/history checkpoint, and exact pending changes. `Checkpoint::from_json` validates with a fresh native server. `Document::restore` restores this coupled state. `restore_checkpoint` replaces a live document only when actor and preset match and all validation succeeds.

After restart, send the stored pending operations unchanged. The peer can receive them more than once. A retry must use `apply_remote`, including a retry on the source actor. Replaying pending changes does not add history or pending entries. Restoration rejects a pending queue that changes the native document/history when replayed. Pending changes can include undo and redo output.

The host must provide trusted checkpoint storage and transport. Checkpoints have no signature or authentication. These checks do not prove that an external checkpoint came from a trusted author.

## Error and proof limits

Native batches are atomic. SDK history commands also stage a fresh native replica before decoding their result. The SDK commits the replica and pending change only after decoding succeeds. Invalid checkpoint replacement leaves the live document intact. Staging uses a full checkpoint restore for each history command; this slice makes no performance claim.

This is an experimental native SDK slice. It provides no full `doc.edit` compiler, mark inheritance, text split/join compiler, network transport, durable storage driver, browser or editor adapter, WASM package, Node binding, or MCP integration. It is not a released Rust package. The native engine dependency keeps its existing scope and limits.

## Independent authoring comparison

Run `node --experimental-strip-types experiments/rust-sdk/scripts/compare-typescript.mjs` from the repository root. It executes `authoring_trace`, a Rust example that uses only public SDK authoring methods. The TypeScript oracle independently calls `Doc`, `History`, and editing commands. It does not send expected operations, state, or inverses to Rust.

The fixed 20-action trace covers two concurrent actors, explicit italic and empty marks, isolated UTF-16 surrogate units, a foreign same-value mark writer, concurrent deletion of the same unit, undo/redo, checkpoint restart, and exact pending retry twice on source and peer. After each action it compares generated operations, both models, both history availability flags, and both pending queues. It converts TypeScript strings to UTF-16 units, treats omitted empty birth marks as an empty map, and fills omitted empty model containers. It does not compare transport bytes or full internal history snapshot structures.

The script writes raw traces, source hashes, and its PASS/FAIL receipt to `output/r4-sdk-evidence/sdk-typescript-receipt.json`. This is bounded authoring proof for these declared actions. It does not prove a generic `doc.edit` compiler or any adapter, network, or production behavior.
