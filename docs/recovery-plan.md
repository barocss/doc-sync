# Recovery plan

This document tracks [roadmap item 2](../apps/docs/src/roadmap.md#2-recover-pending-changes-and-history). The MCP app and the single-process demo server support bounded restart recovery and explicit history discard. Remaining work includes broader failure coverage, reservation retention policy, and a production storage contract.

## 1. Scope

The MCP app persists a conditional edit intent and a separate versioned checkpoint. The checkpoint contains the actor, document snapshot, schema, pending changes, sequence metadata, deletion sequence mapping, and undo and redo history. History serialization preserves group boundaries, previous write ownership, and shared formatting, move, and split state. A document snapshot or visible edits alone cannot reconstruct that history.

The library exposes checkpoint serialization and restoration as mechanisms. A `SyncClient` does not persist state or establish server protection automatically. An application using those mechanisms must establish its own storage and recovery contract. The automatic recovery described here is specific to the MCP app and demo server.

## 2. Local storage

On macOS, the MCP journal is enabled by default at `~/.local/state/doc-sync/recovery`. Set `DOC_SYNC_JOURNAL_DIR` to another stable directory. Restart with the same directory and document ID. Different servers or simultaneous actors using the same document ID require separate directories. The app restores the recorded actor; an incompatible explicitly configured actor is rejected.

The journal uses a private single-writer kernel lock. Each intent and checkpoint is bounded to 16 MiB. Files contain document content, so protect the directory as document data. Writes validate the content, flush a private temporary file, rename it in the same directory, and flush the directory. A corrupt or mismatched record is preserved for inspection. These checks do not authenticate the file or prove power-loss durability.

Enabled durable storage currently supports macOS only. On other platforms startup fails unless `DOC_SYNC_JOURNAL=off` explicitly selects an ephemeral session. With the journal disabled, process exit loses in-memory pending changes and history.

## 3. Server generation and recovery reservations

The demo stores a document generation in its local log. The generation survives server restart and changes on document reset. Legacy logs without a generation cannot establish the same recovery evidence. The process epoch still changes on restart.

Before allowing durable history operations, the MCP app records a unique reservation ID locally and requests a server reservation. The reservation pins the earliest required deletion frontier. The server durably records it before confirming it. It is separate from the ordinary peer acknowledgment and its two-minute offline lease. A confirmed reservation survives a server restart and peer lease expiry. Reservations for the same actor use independent IDs; releasing one does not release another.

On recovery, the app checks the generation, schema, original reservation, and garbage-collection boundary before joining as that actor. If it cannot establish protection, it keeps the checkpoint and stops in `recovery_required`. It must not infer that a deleted token is still available after the frontier has advanced.

Reservations do not expire automatically. They can prevent garbage collection indefinitely while history is retained. The MCP `discard_history` tool permanently clears only the calling participant's undo and redo history and releases its old reservation. It refuses to proceed if a local or recorded change is pending or its outcome is unresolved. An empty-history checkpoint with a pending-release marker is flushed before the release request. The server treats repeated release requests for the same reservation as the same action and prevents reuse of a released reservation ID.

The demo server compacts reservation metadata after 128 reservation events by default. `RECOVERY_COMPACT_THRESHOLD` sets a different positive threshold, for example in tests. Each compaction advances a durable reservation era and retains the active reservations. An active reservation from an earlier era remains usable. A request cannot create an inactive reservation from a sealed era. A repeated release of such an ID succeeds without creating another tombstone. Current-era tombstones are retained until the next compaction. This bounds released-reservation churn in the normal compaction path; active reservations still consume space.

Before replacement, the server validates the stored log against the live document, active reservations, and conditional receipts. It keeps every document change, GC, schema transition, and receipt record in its original order. It replaces the reservation events with a compact state record. The server writes and syncs a temporary file, renames it, and syncs the directory. If the storage outcome is uncertain, it invalidates the live hub and reopens the durable log before serving the document again. These checks do not authenticate the log or establish power-loss durability.

The complete log is not bounded by this operation. Document changes, receipts, GC records, active reservations, and an individual record can still grow. A worker verifies the complete log against the live server's durable byte digest, prepares a replacement and syncs it away from the HTTP event loop. The server checks the document generation, write revision and file identity before the final rename. Concurrent writes discard the candidate and trigger a bounded retry; sustained writes can defer compaction. Live receipt verification uses a shared worker per document. Cold reads and syncs are asynchronous, and replay yields between batches; same-document first requests share a single load. Per-document mutation queues persist and sync each staged record before applying it or returning success. Full-log memory, a large individual replay operation, synchronous metadata checks and multiple-document worker concurrency need separate limits. A generation-free legacy log is not compacted.

Existing active unversioned reservation IDs remain usable after an era is sealed. Older clients that create new unversioned IDs must be updated before they can create reservations after sealing. If an unconfirmed checkpoint has no pending change, conditional intent, or undo/redo history, the MCP app can save a new current-era ID and retry. It does not replace the ID of a confirmed reservation or an unconfirmed checkpoint that contains work. An old log that already reused a released ID retains its earlier ambiguity for delayed release requests. Compaction is deferred if an active legacy ID cannot be represented safely or a previously released legacy ID resembles a future-era ID. Metadata remains and can grow while compaction is deferred.

After an interrupted release, startup completes that release before reconnecting. The app records a new reservation ID, obtains protection for future history, and reconnects before it reports `discarded`. If these steps cannot be confirmed, it preserves recovery state and blocks new edits. Releasing one reservation does not release another participant's reservation. An ordinary peer lease or another reservation can still delay garbage collection. Do not delete local checkpoints or release server reservations independently when history may still be needed. A production retention policy and authenticated administrative recovery are still required.

## 4. Pending changes and automatic recovery

The MCP app persists the exact ordinary undo or redo change and the resulting history before sending it. On restart, it checks the checkpoint and reservation, then uses the demo server's atomic recovery submission for each pending change. The server checks the generation, schema and reservation, recognizes an exact previously accepted change, or accepts the original change once. A different payload for the same actor and sequence is rejected. A retry after an uncertain response uses the same change, rather than creating a replacement operation. Other participants' accepted changes remain in the server document.

A conditional `edit_document` intent is also persisted before its first submission. Its receipt identifies the exact generation, base, actor, sequence and payload. If the server proves acceptance, the MCP app can restore the edit and its history from a compatible protected checkpoint. If the receipt is `unknown`, the app preserves the original intent and enters `recovery_required`; it does not infer rejection or automatically resend it. A live session can still use `retry_edit` for its exact unresolved request within the supported conditional protocol.

A generation or schema mismatch, a missing reservation, unsafe GC frontier, invalid checkpoint, conflicting sequence, or unavailable server prevents automatic recovery. Inspect `recovery_status` and preserve the stored files until the outcome is resolved. The demo's local log and synchronous persistence provide a single-process test boundary; they do not provide authorization, multi-server consistency, or a production retention policy.

## 5. Validation and remaining work

The recovery tests use isolated local storage. They cover history round trips, file validation, process termination, server restart, concurrent human edits, ordinary pending undo recovery before sending and after acceptance, repeated recovery, and exact conditional receipt handling. Reservation-compaction tests cover sealed-era requests, active pins, log retention, process restart, and an empty prepared checkpoint. A server-process test advances a controlled clock past the ordinary peer lease; it does not wait for two minutes of real time. Server and MCP process termination tests do not prove behavior during power loss.

Roadmap item 2 remains open. Further work includes:

1. More failure injection across file flush, rename, server persistence, response, echo, and checkpoint cleanup boundaries, including repeated interruption during recovery.
2. Broader concurrent deletion, formatting, move, split, hidden-cell and schema-transition coverage at real process boundaries.
3. Production retention for document logs and active reservations, orphan handling, administrative access, and resource limits.
4. Recovery behavior for unsupported platforms, multi-process servers, unavailable or pruned receipts, and compatible or incompatible schema changes.
5. Evidence for the selected filesystem and deployment, including power-loss behavior if required. Do not treat local subprocess tests as production acceptance.
