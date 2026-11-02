# Engine contracts, revision 1

Core exports two different engine contracts from
`@barocss/doc-sync-core/engine`. The production contract is `ClientEngineFactory`
and `ClientEngine`. The older immutable contract is `EngineFactory` and
`DocumentEngine`. Their factories are not interchangeable.

Only the TypeScript production implementation ships. Rust and WASM cannot be
selected for a `SyncClient`. Selecting a factory at construction does not support
changing engines in a live client. Routing, regression and conversion-count checks pass. Repeated/pooled Node and controlled Chrome client comparisons qualify the
client migration. Small-block tails and original separate-server Chrome guard
crossings remain reported; this is not general product-latency acceptance. See HANDOFF section
5.104 and the client-engine comparison report.

## Select the production engine

```ts
import {SyncClient, HttpTransport} from '@barocss/doc-sync-core/sync';
import {typescriptClientEngineFactory} from '@barocss/doc-sync-core/engine';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';

const actor = 'writer-A';
const client = new SyncClient(actor, new HttpTransport('example', actor), {
    schema,
    engineFactory: typescriptClientEngineFactory,
});
const host = createSyncClientEditorHost(client);
host.commit(host.apply([{op: 'insert', at: [0, 0], content: 'hello'}]));
client.connect();
```

`schema` is the application's validated schema. The factory creates the
client's authoritative state. The constructor checks the production methods,
identity, schema fingerprint, contract version, and required capabilities before
connection. A metadata-only factory is insufficient. Omitting `engineFactory`
selects `typescriptClientEngineFactory`.

`SyncClient`, `InputSession`, and the common editor host use the selected engine.
ProseMirror, Slate, and Lexical bindings use that host; Tiptap uses the shared
ProseMirror implementation. The common port has no `Doc`, `History`, token map,
clock object, or callback that takes a document. Models are borrowed immutable
views. Generation/revision stamps let hosts cache them.

The default preserves the actual legacy `client.doc`, `client.history`, and
`InputSession.doc` objects through a separate TypeScript compatibility extension.
A backend without that extension rejects these accesses. Existing custom
Doc-based input sessions and inherited document facades use a named TypeScript
compatibility adapter. They are optional escape paths, not portable backend APIs.
No shadow Doc mirrors a selected backend.

## Client facade

Core `/client` provides a fixed local-or-sync Client. Optional transport selects
session behavior, not an engine. Without transport it constructs only LocalClient;
with transport it constructs SyncClient and forwards syncOptions.engineFactory.
Each binding creates a private view host. Legacy clients and explicit hosts remain
supported. Client.sync exposes the actual sync backend for recovery and schema
lifecycle operations. A facade does not convert checkpoints, enable Rust/WASM, or
perform storage writes. Local captureState/fromState wrap the production engine checkpoint with actor/schema identity and History. Its ordinary local edit path adds no sync queues or model fork.

## Memory-only client

`@barocss/doc-sync-core/local` exports `LocalClient`, `LocalEditorHost` and
`createLocalEditorHost`. The local client owns the production TypeScript engine
and has no transport or `SyncClient`. Convenience `edit()` applies and records
once; native adapters use apply followed by one complete ordered commit. Each
editor view needs its own host origin. External local edits notify other views.
Local host status is offline/unsynchronized and presence is empty.

Selections use engine anchors. Composition drafts reserve clocks and publish
original owned operations once. Recorded batches form one undo group;
`record: null` batches remain outside History. Cancellation preserves live edits.
Post-commit notification errors are reported without reversing accepted edits.
See the [local guide](../../apps/docs/src/guide/local-editing.md) for ownership,
lifecycle and error handling. Explicit local capture/open is available through caller-managed storage; background saving, synchronized restart recovery, live schema transitions,
automatic synchronized-session conversion and Rust/WASM local engines are not
provided by this entry point.

## Mutation and session ownership

- `engine.apply()` and `applyModelEdits()` compile and apply local edits. They
  return exact wire operations and do not record History or queue transport work.
- `client.commit(ops, record)` records once, allocates a client sequence, and
  queues the already-applied operations. Do not apply those operations again.
- Engine undo and redo apply their operations and update History once. The
  client queues them without another History entry.
- Remote receive does not record local History. An own server echo acknowledges
  the pending change without applying it again.
- `InputSession` holds an engine-created session. Editing and selection capture
  use its draft; selection resolution uses live state. Clock reservation keeps
  allocation safe while remote receipt continues.
- A session collects an owned copy of draft operations. `publish()` applies those retained
  operations to live state without recording or queuing. `InputSession.end()`
  calls `client.commit()` once with the combined caret range, then cancels the
  session. It does not rebuild operations from a model diff.

Prepared document, checkpoint, and event handles belong to their engine
instance. A different instance must reject them before mutation. The engine
owns snapshot preparation/replay/install, conditional-edit preparation, scoped
model events, anchors, GC, and compatible schema preview/upgrade.

The TypeScript implementation uses a bounded existing-text fast path for normal
single edits and plain root text split/merge. More complex edits use detached preflight. It does not put the
older immutable engine's full document/History transaction on each keystroke.
This describes the implementation; it is not a performance acceptance result.

Preflight runs after the initial TypeScript edit guard and before compilation.
Invalid engine inputs preserve document state, History and allocation state.
Custom guards must act as assertions. Later legacy emit guards can run more
than once; arbitrary mutations or exceptions inside those callbacks are not a
rollback transaction. Application callback side effects are outside the engine
input-atomicity guarantee.

For remote events, `beginEvents(ops)` copies and validates the whole batch before
lazy model reads. `receive(writer, ops, capture)` applies that owned batch and
returns `{deletions: string[]}` from the operations actually applied. It reuses
the proof on the unchanged path. Source-array mutation cannot change the prepared
batch or the client's deletion ledger. Captures are instance-bound, source-bound
and single-use for receive. Changed generation, revision or schema rejects the
staged receive before application; token-only materialization requires recheck.
Prepare another capture after an intervening edit. A successful receive leaves
its capture available for `finishEvents`; finishing a stale unreceived capture
fails. Captures without a batch keep the existing undo/reset event lifecycle.
Without model listeners, the client receives and validates directly once.

`disconnect()` retains pending changes and History for reconnect. `dispose()` is
terminal. It rejects protected local state, an unresolved conditional request,
or undo/redo History. Clear or resolve that state through the normal application
workflow before disposal.

## Checkpoints and recovery

Legacy `checkpoint()` and `restoreCheckpoint()` retain the exact format-1
TypeScript snapshot/History envelope. That format is TypeScript-specific.

`captureState()` and `restoreState()` use format 2. The envelope holds one tagged
engine checkpoint, plus client sequence, pending operations, and GC metadata.
The client treats the engine payload as opaque and checks engine, version,
actor, and schema identity before installation. The engine validates its own
payload. This is matching-engine recovery, not conversion between engines.
Restore requires a disconnected, settled client and external proof of the
matching epoch and GC protection. Capture alone does not persist durable state.

`LiveRecovery` and the Node journal currently use the legacy format-1
recovery path. They remain TypeScript-specific. A portable durable recovery
adapter is future D4 work. A server snapshot alone cannot restore actor History.

## Older immutable document API

`typescriptEngine` implements `DocumentEngine` for direct document experiments.
It supports edit, receive, actor History, anchors, and tagged TypeScript
checkpoints. `edit()` records by default; pass `null` to omit recording. Each
mutation stages a document snapshot and separate History graph, then installs
both after validation. This favors atomicity and adds full copies per mutation.
It is not the production `ClientEngineFactory` and cannot be passed as
`SyncClient`'s `engineFactory`.

This older port lacks production composition, model events, GC, schema
transitions, transport queues, and client recovery. Its
`test/engine-contract.test.ts` checks direct adapter behavior. Those checks do
not prove production client routing, browser bindings, performance, a Rust/WASM
backend, or package publication.

Both contracts use UTF-16 offsets and preserve isolated surrogate code units.
Existing History and JSON number semantics can normalize negative zero. Engine
checkpoint formats remain backend-specific; no native state layout or lossless
cross-engine conversion is assumed.
