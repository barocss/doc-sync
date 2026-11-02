# Synchronization

`SyncClient` manages a local document, pending changes, acknowledgments, model events, history, and presence. `DocHub` validates and orders changes for one document. A `Transport` connects them.

For an editor that needs no server session, see the
[LocalClient and SyncClient comparison](./local-editing#localclient-and-syncclient).
It explains the shared editing model, offline behavior, bindings and storage limits.

## Preferred client API

For a new editor, use the [unified Client](./client). It accepts an optional
transport and creates hosts inside the bindings. A supplied transport selects
the existing SyncClient backend. The lower-level examples below retain direct
SyncClient access for transport, engine and recovery integration.

```ts
import {Client} from "@barocss/doc-sync-core/client";
import {HttpTransport} from "@barocss/doc-sync-core/sync";

const actor = "alice-session-1";
const client = new Client({schema, actor, transport: new HttpTransport("example", actor)});
client.connect();
client.edit([{op: "insert", at: [0, 0], content: "Hello"}]);
```

Without a transport, `new Client({schema})` creates a true memory-only backend.
Disconnecting a synchronized client does not change its mode. Check
`client.sync` before using sync-only checkpoint or schema-transition APIs.

## HTTP and SSE

```ts
import {SyncClient, HttpTransport} from "@barocss/doc-sync/sync";

const actor = "alice-session-1";
const client = new SyncClient(actor, new HttpTransport("example", actor), {schema});

client.onModelEvents = (events, info) => {
    // Apply remote, undo, redo, or snapshot changes to your editor.
    // Check info.cause and info.fallback when collecting diagnostics.
};
client.connect();

const result = client.doc.edit([{op: "insert", at: [0, 0], content: "Hello"}]);
client.commit(result.ops);
```

This transport expects the API served by the demo server. It does not add authentication, authorization, request limits, or production storage.

## Select the client engine

Pass `engineFactory: typescriptClientEngineFactory` in the constructor options
to select the production TypeScript engine explicitly. Both exports are
available from `@barocss/doc-sync-core/sync`. The default uses that same factory.
`client.engine` is the selected authoritative engine; common editor hosts and
input sessions use it without a Doc-based interface. Factory and capability
checks finish before connection. Only TypeScript ships; Rust/WASM selection and
live engine switching are not available.

For a portable edit, call
`client.commit(client.engine.apply([{op: "insert", at: [0, 0], content: "Hello"}]))`.
`apply` compiles and applies without History. `commit` records and queues once.
The `client.doc` example above uses the optional TypeScript compatibility
extension. The older immutable `typescriptEngine` factory cannot be used as a
production client factory. See [packages and engines](./packages#engine-selection-is-a-separate-milestone).

## Ordered changes

A change has an actor, an actor-local `seq`, and wire operations. The hub assigns a document-wide `serverSeq`. Dependencies must arrive before operations that reference them. `Doc.apply()` is not a buffer for arbitrary out-of-order dependencies.

Use distinct actor identities for independent replicas and sessions. Your application must define how a persisted session resumes its sequence; an actor display name alone is not a session identity.

`DocHub.submit()` checks an entire change before application. Invalid changes do not partially update the document. Repeated accepted sequences are recognized as duplicates.

## Server boundary

```ts
import {DocHub} from "@barocss/doc-sync/server";

const hub = new DocHub({schema});
// Attach authenticated transport, persistence, and document ownership here.
```

The hub is independent of HTTP. The repository demo attaches HTTP, SSE, and a JSONL log. Treat it as a development server rather than a production service.

## Reconnect and history

Pending changes can be sent after a normal disconnect. Acknowledgments include history pins so GC does not discard data still needed for undo. An ordinary `SyncClient` keeps these changes and history in memory; it does not automatically persist a checkpoint or establish durable recovery protection.

The macOS MCP app and single-process demo server provide a bounded recovery path using a checkpoint, exact receipts and a recovery reservation. An ordinary pending change can be recognized or applied once after restart when the required protection is proven. An unresolved conditional outcome or unsafe recovery blocks further edits for inspection. See the [recovery plan](../reference/recovery-plan) for its conditions and remaining work. A server snapshot by itself does not restore a participant's undo history.

`disconnect()` retains pending changes and History. `dispose()` ends the client
and rejects protected local state, unresolved conditional work, or remaining
undo/redo History.

`checkpoint()` / `restoreCheckpoint()` keep the exact legacy format-1
TypeScript envelope. `captureState()` / `restoreState()` use format 2 with one
tagged, opaque engine payload and the client transport metadata. Restore checks
engine, contract version, actor, and schema identity; it does not convert state
between engines. It requires a disconnected, settled client and the same external
epoch/GC recovery proof. Capture alone does not establish durable protection.

`LiveRecovery` and the Node recovery journal still use the TypeScript-specific
format-1 path. Portable durable recovery integration is future D4 work. Selected-engine routing and regression checks pass. Repeated/pooled Node and controlled Chrome timing qualify the client migration.
Original separate-server and small-block guard crossings remain reported;
general end-to-end latency acceptance remains open. See [status and limits](../status).

After a compatible server schema transition, use [the open-editor transition procedure](./schema-transition) to rebuild a mounted editor without discarding its client or pending work.

[Read the state and reconnect contract →](../reference/spec)

## Rust experiment

Persist the checkpoint with its actor history and pending queue. Retry the saved `Change.ops` through `apply_remote`. Acknowledge only the exact sent prefix after the host transport confirms receipt. The SDK supplies no HTTP client or server.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{Attributes, Document, EditOptions, Key, Result, SchemaPreset};

fn main() -> Result<()> {
    let mut doc = Document::new("sync-author", SchemaPreset::Text)?;
    let mut peer = Document::new("sync-peer", SchemaPreset::Text)?;
    doc.insert_text(
        &Key::root(),
        "Hi",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    let json = doc.checkpoint()?.to_json()?;
    let saved = doc_sync_native_sdk::Checkpoint::from_json(&json)?;
    let mut restarted = Document::restore(&saved)?;
    let sent = restarted.pending_changes().to_vec();
    assert_eq!(sent.len(), 1);
    for _ in 0..2 {
        for change in &sent {
            peer.apply_remote(&change.ops)?;
        }
    }
    assert_eq!(restarted.model()?, peer.model()?);
    restarted.acknowledge(&sent)?;
    assert!(restarted.pending_changes().is_empty());
    assert!(peer.pending_changes().is_empty());
    Ok(())
}
```

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The native executable keeps named replicas in memory. Its `Server` is a JSONL experiment driver, not an HTTP synchronization server. The pending-replay harness provides a useful engine recovery check:

```sh
mkdir -p output/rust-sync-example
RUST_MOVE_RECEIPT=output/rust-sync-example/receipt.json RUST_MOVE_TRACE=output/rust-sync-example/trace.json.gz RUST_MOVE_SUMMARY=output/rust-sync-example/summary.txt node experiments/rust-move-harness/harness.ts
```

Build the executable first with [the private experiment commands](./rust#run-the-private-experiment). Use new output paths on each run to retain earlier evidence. Check `status: "PASS"`, `restarts: 5` and the five `recoveryCases`: move, split, join, undo and redo. Each case saves an actual TypeScript `SyncClient.pending` batch and matching native checkpoint, starts a fresh native process, receives a foreign edit, applies the saved batch twice through `apply`, then checks four more History actions.

This compares native state, foreign writers, History and duplicate replay with the TypeScript reference. It does not prove durable server recovery, receipt acknowledgment, recovery reservations, protected GC, HTTP/SSE transport or a production Rust server. No public native server or full WASM CRDT client exists. See [restart and pending replay](./rust#restart-and-pending-replay).

</details>
