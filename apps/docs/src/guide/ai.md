# MCP tools and headless clients

Start with [AI & bots](../ai/) and [connect to a document server](../ai/server). This page describes the existing MCP tools, revision checks and recovery contract. For a disposable local test, use the [local collaboration walkthrough](./ai-walkthrough).

The document model does not require an editor UI. A Node process can read a document and use the same schema-driven operations as a browser client. Use a distinct actor ID for every independent editing session.

## Node synchronization

`NodeHttpTransport` connects a `SyncClient` to the demo HTTP and SSE protocol from Node 22.18 or later. Supply the same schema that the server and other clients use. The client checks the server's schema version before sending changes. A schema-free server cannot provide this verification.

```ts
import {SyncClient} from "@barocss/doc-sync/sync";
import {NodeHttpTransport} from "@barocss/doc-sync/node";

// Supply your application's schema and a distinct actor ID.
const actor = "agent-session-1";
const transport = new NodeHttpTransport("example", actor, "http://127.0.0.1:5410");
const client = new SyncClient(actor, transport, {schema});
client.connect();

// Wait for the initial server state before reading or editing.
// After all pending changes are acknowledged, stop the session:
client.disconnect();
await transport.leave();
```

The transport retries an interrupted SSE stream. `SyncClient` retains and retries pending changes during a normal reconnect. `leave()` releases the actor's presence and ordinary undo pin; wait for pending changes first. `SyncClient` checkpoint methods do not persist data or arrange server recovery protection by themselves. The transport accepts application-supplied headers through an optional fourth argument, `{headers: {...}}`; these require an absolute HTTP or HTTPS URL. It rejects redirects. The demo server does not add authentication, authorization, or production storage.

An ordinary `SyncClient` edit applies locally before it is sent. A local result is not proof that the server accepted it. MCP `edit_document` instead prepares a conditional edit and waits for the server to accept the base before applying it locally. A disconnected session or an uncertain response can leave the outcome unknown. Check acknowledgments and reconcile against the server before issuing a replacement edit.

## MCP server

The private `apps/mcp` workspace exposes one headless participant through standard input and output (stdio). It uses one long-lived `SyncClient` session. The process connects to the document server through HTTP and SSE. It can run on the MCP host machine or beside an application server, if its MCP host can launch it there. The separate [hosted entry point](../ai/hosted) provides authenticated Streamable HTTP sessions.

Use [the document-server connection guide](../ai/server) for the server requirements and transport distinction. In an MCP host, start Node directly so that npm's startup messages do not enter the protocol stream. Replace the paths and server address below. Configuration syntax depends on the host.

```json
{
  "mcpServers": {
    "doc-sync": {
      "command": "node",
      "args": ["/absolute/path/to/doc-sync/apps/mcp/src/main.ts"],
      "env": {
        "DOC_SYNC_URL": "https://documents.example.com",
        "DOC_SYNC_DOCUMENT": "team-document",
        "DOC_SYNC_DISCOVER_SCHEMA": "on",
        "DOC_SYNC_ACTOR": "review-agent",
        "DOC_SYNC_JOURNAL_DIR": "/absolute/private/path/doc-sync/review-agent"
      }
    }
  }
}
```

The host can pass these environment variables:

| Variable | Meaning |
|---|---|
| `DOC_SYNC_URL` | Document server base URL, including any application prefix. Default: `http://127.0.0.1:5410`. |
| `DOC_SYNC_DOCUMENT` | Document ID. Default: `default`. |
| `DOC_SYNC_ACTOR` | Unique actor ID. If omitted, the app generates one, or restores the actor from its saved journal or checkpoint. |
| `DOC_SYNC_SCHEMA` | Path to a module that exports `schema` or a default schema. If omitted, the app uses the demo schema unless discovery is enabled. |
| `DOC_SYNC_DISCOVER_SCHEMA` | Set to `on` to fetch and validate the server schema as data when no schema module is supplied. A schema-free server cannot be discovered. |
| `DOC_SYNC_JOURNAL_DIR` | Stable directory for conditional-edit journals and history checkpoints. Default: `~/.local/state/doc-sync/recovery`. Use the same directory and document ID when restarting the process. |
| `DOC_SYNC_JOURNAL` | Set to `off` only to disable the journal and use an ephemeral session. |

The server exposes `get_schema`, `get_server_schema`, `read_document`, `read_document_slice`, `set_presence`, `edit_document`, `retry_edit`, `recovery_status`, `undo`, `redo`, `discard_history`, `upgrade_schema`, and `transition_schema`. `read_document` returns the full local model, its revision, the pending count, and session status. Use [`read_document_slice`](../ai/reading) for bounded canonical child pages. Read the document before editing and pass its returned `revision` as the edit base. For example, an MCP host can call `edit_document` with the following arguments after a read:

```json
{
  "base": {"epoch": "copy-from-read", "serverSeq": 12, "schemaVersion": "copy-from-read"},
  "edits": [{"op": "insert", "at": [0, 0], "content": "Hello"}]
}
```

Replace the entire `base` with the revision returned by `read_document`, and choose a path valid in that model. The revision includes the schema version as well as the epoch and sequence. A changed local view causes a stale-base error. The server also checks all three values atomically before accepting the edit. A schema-free server returns `null` for the schema version and cannot verify it. If a remote change reaches the server first, the server rejects the stale edit. Read the document again and decide on a new edit. The check protects the edit's base; it does not decide whether the AI selected the intended content.

A confirmed edit has received its own server echo and left the pending queue. A timeout is **unconfirmed**, not proof of failure. Call `read_document` to inspect the session. If `conditionalPending` is true, call `retry_edit` while the session remains alive. It retries the identical request; it does not create a replacement edit. The server can recognize the same request within the same document epoch, even if the document or schema changed after acceptance. Do not issue a new edit, undo, redo, or schema upgrade while the conditional request is unresolved. If `pending` is nonzero, wait for synchronization and reconcile the result before issuing another edit. The pending count alone does not prove server acceptance; `retry_edit` is not available for an ordinary undo or redo.

### Show an agent's position

Call `read_document` and use its revision with `set_presence` to publish the position the agent is actually working on:

```json
{
  "base": {"epoch": "copy-from-read", "serverSeq": 12, "schemaVersion": "copy-from-read"},
  "name": "Research agent",
  "color": "#7c3aed",
  "anchor": [0, 5],
  "focus": [0, 2]
}
```

Use paths valid in the returned document. `anchor` is the active end; `focus` is the other end. Use `focus: null` for a caret, or set both endpoints to `null` to hide it. Colors must be six-digit hex values. The tool validates the session's local revision and visible text positions, then publishes token-based transient presence. Selection endpoints must be in the same visible document line or slot. Another edit can move those tokens without changing their identity. Presence does not edit the document or enter undo history.

A `sent` result is not a server delivery receipt. Presence is best effort, is not journaled, and is removed on leave. The tool does not infer the agent's intent or move its cursor automatically. After an edit, read the current document and publish the position the agent actually intends to show. A client can reconnect or the document can change while presence is in transit; applications must handle unavailable or unresolved positions without inventing one.

The product demo shows the presence in its three editor panels. Its Slate and Lexical overlays cover resolvable native text positions; unsupported positions are hidden. See [cursors and selections](./presence).

### Recover a session after restart

By default, the MCP server records a conditional `edit_document` request before it sends the request. The intent contains the document and actor, server generation and edit base, exact change and model edits, schema, and pre-edit snapshot. It also saves a versioned checkpoint containing the document, pending ordinary changes, and undo and redo history. Before sending an ordinary undo or redo, it saves the resulting operation and history. Each record is limited to 16 MiB. The files use a single-writer kernel lock and private permissions. They contain document content, so protect the journal directory as you protect the document.

The durable journal supports **macOS and Linux** on a private local filesystem on one host. Linux requires `/usr/bin/flock` from util-linux. A missing helper or failed kernel lock stops startup; no automatic ephemeral fallback is used. Other platforms fail unless `DOC_SYNC_JOURNAL=off` is explicitly set. With the journal disabled, pending changes and conditional requests exist only in process memory. The library's other transports and APIs do not gain durable recovery from this MCP journal.

The default location is keyed by document ID, not server origin or actor. Use a separate `DOC_SYNC_JOURNAL_DIR` for each independent server or concurrent actor that uses the same document ID. Keep the same directory and document ID after restart so the intent and checkpoint can be found.

### Run multiple agents on one document

Start one MCP process for each agent. Give both processes the same `DOC_SYNC_URL`, `DOC_SYNC_DOCUMENT`, and compatible schema. Give each process a different `DOC_SYNC_ACTOR` and a different `DOC_SYNC_JOURNAL_DIR`. For example, use actors `agent-a` and `agent-b` with separate absolute journal directories. Keep each agent's actor and directory stable across restarts.

Each agent calls `read_document` before it chooses an edit and passes the returned revision to `edit_document`. If two agents edit from the same revision, the server can accept one and reject the other as stale. The rejected agent reads the latest document and decides again. Each agent's `undo` and `redo` use its own history. The local demo does not authenticate these actors; use an authenticated server before exposing it to untrusted users.

The demo server records a recovery reservation for the checkpoint. It protects the required deletion history independently of the ordinary peer lease and survives a demo server restart. When the MCP process restarts, it checks the document generation, schema, reservation and garbage-collection boundary before reconnecting. A pending ordinary undo or redo is recovered through an atomic server operation that recognizes the exact accepted change or applies the original change once. Other users' accepted edits remain in the document.

For an interrupted conditional edit, an exact `accepted` receipt lets the app restore the edit and its history from a compatible protected checkpoint. An `unknown` receipt does not mean the edit failed. In that case the app preserves the intent, enters `recovery_required`, and blocks further edits, undo, redo, and schema changes. Call `recovery_status` to inspect the available evidence. A generation or schema mismatch, missing reservation, unsafe garbage-collection boundary, or unavailable server can also prevent recovery. Do not discard the files while an outcome is unresolved.

### Discard this participant's history

Call `discard_history` with `{}` to permanently remove this participant's undo and redo history and release its old recovery reservation. This operation does not delete document content or another participant's history. It cannot be undone. The app rejects it while an edit or its outcome is pending or unresolved. Resolve pending work before calling it.

The app records the empty history and a pending release in its local checkpoint before it asks the server to release the old reservation. If the process stops during release, the next startup resumes the same release. The app creates a new reservation and reconnects before it reports `discarded`, so the session can continue editing. If the server or local storage cannot confirm the steps, the app blocks further edits and retains the checkpoint for recovery. Restart with the same journal directory and document ID.

Releasing this reservation can allow garbage collection to advance. Another participant's reservation or an ordinary peer lease can still delay it. Do not delete checkpoint files or release reservations independently while recovery is unresolved.

The demo server compacts reservation metadata after 128 reservation events by default. Set `RECOVERY_COMPACT_THRESHOLD` on the demo server to use a different positive threshold. Compaction seals the old reservation era, retains active reservations, and rejects attempts to create an inactive ID from a sealed era. It keeps the document changes, GC records, schema transitions, and exact receipts in the log. An interrupted empty, unconfirmed checkpoint can receive a new ID in the current era; a checkpoint containing pending work or history is not rekeyed.

Existing active unversioned IDs remain usable. Older clients cannot create new unversioned IDs after an era is sealed. Compaction is deferred for some incompatible active legacy IDs and previously released legacy IDs that resemble future-era IDs; metadata can grow while it is deferred. The server does not compact generation-free legacy logs, and a log that reused an old ID retains its existing delayed-release ambiguity. A worker reads and prepares the full compacted log away from the HTTP event loop. Concurrent writes can require a retry, and sustained writes can defer compaction. Cold loading reads and syncs files asynchronously and yields between replay batches; requests for the same document share that load. Document mutations are serialized per document and are applied only after their file sync. Full-log memory, a single large replay operation, other synchronous computation and cross-document worker concurrency are not bounded by this change.

The demo assigns a durable generation to a new document and keeps it across a server restart. A reset creates a different generation. A legacy log without a generation cannot provide the required recovery evidence. Reservations do not expire automatically and can prevent garbage collection while history is retained. The demo uses a single local server process and has no authentication or authorization; these tests do not prove power-loss or multi-server durability. See the [recovery plan](../reference/recovery-plan) for scope and remaining work.

## Change the active schema

`get_schema` returns the session's schema and whether the server verified it. `get_server_schema` reads the schema and version from the server. A schema change stops clients that still use the previous version. The `upgrade_schema` tool reads the server schema, checks that it is a compatible extension, installs it in the existing client, and reconnects. It retains that client's pending changes and history. Resolve any unconfirmed conditional edit first. Check the session status and wait for pending changes to be acknowledged after reconnecting.

`transition_schema` proposes a complete new schema to the server using a base containing `epoch`, `serverSeq`, and `schemaVersion`. The server checks that base and the compatibility rules atomically. On acceptance, the MCP session installs the new schema and reconnects. Use `get_server_schema` and the document state to obtain the base; if the proposal is rejected as stale, read again. If the response is lost, its outcome is unknown: inspect the server schema and document before proposing another transition. Schema transitions are limited to compatible additions; they do not migrate incompatible documents. See [changing a schema](./schema#changing-a-schema).

This transition updates the headless client. An open editor also needs a new native schema, registered nodes and binding. The application can coordinate that rebuild and selection restoration with `upgradeOpenEditorSchema`; see [rebuilding an open editor](./schema#rebuild-an-open-editor). Application plugins and codecs still need their own reconstruction.

## AI and concurrent editing

Treat the AI as a separate participant. It uses the same wire operations and per-participant history as a human editor. For example, the AI can format text while a human deletes it; the existing collaboration rules determine the result and undo behavior. They do not guarantee that an AI chose the intended text.

Document paths can change after a read. The atomic server check rejects an edit if another accepted change has advanced the base. Read the document again and make a new decision. See [collaboration intent](../reference/collaboration-intent) for the edit and undo rules, and [synchronization](./sync) for reconnect limits.

## Rust experiment

A native agent can edit a document through the SDK. Use a unique actor and send the returned operations to each peer. This example changes a mark and confirms the peer sees the same model. It does not call an AI model or MCP server.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{Attributes, Document, EditOptions, Key, Result, SchemaPreset};

fn main() -> Result<()> {
    let mut doc = Document::new("review-agent", SchemaPreset::Text)?;
    let mut human = Document::new("human-editor", SchemaPreset::Text)?;
    let change = doc.insert_text(
        &Key::root(),
        "Hi",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    human.apply_remote(&change.ops)?;
    let doc_sync_native_sdk::Op::Text { id, .. } = &change.ops[0] else {
        panic!("expected text")
    };
    let marked = doc.set_mark(
        vec![id.clone()],
        doc_sync_native_sdk::Mark::Italic(Some(true)),
        EditOptions::default(),
        10.0,
    )?;
    human.apply_remote(&marked.ops)?;
    assert_eq!(doc.model()?, human.model()?);
    assert_eq!(doc.pending_changes().len(), 2);
    assert!(!human.history_status()?.can_undo);
    Ok(())
}
```

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The MCP client still uses TypeScript. To inspect the engine layer, give the native replica a bot actor and deliver a human operation through plain `apply`. Record only the bot formatting change in its local History.

Build the driver with [Run the private experiment](./rust#run-the-private-experiment), then run this from the repository root:

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"bot","actor":"bot","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"bot","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"human"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"history_record","replica":"bot","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"set","at":{"lamport":3,"actor":"bot"},"ids":[{"lamport":1,"actor":"human"}],"key":"bold","value":true}],"options":{"caretBefore":"0@~root","caretAfter":"1@human"},"now":10}
{"cmd":"history_undo","replica":"bot"}
JSONL
```

Undo removes the bot formatting and retains the human text `Hi`. This tests local ownership of an inverse. It does not run MCP, a model, revision checks, or server recovery.

This uses the fixed base text schema. Rust has no production editor, bot, or MCP adapter. See the [Rust engine guide](./rust) for the separate v1 through v6 capabilities and limits.

</details>
