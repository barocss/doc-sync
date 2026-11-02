# Draft engine contract, revision 1

`@barocss/doc-sync-core/engine` exports `DocumentEngine`, its DTO types, and the
`typescriptEngine` factory. This is a tested TypeScript adapter groundwork.
Production `SyncClient`, `InputSession`, and editor bindings still use `Doc`.
They do not select or use this port. No Rust or WASM backend is provided.

```ts
import {typescriptEngine} from '@barocss/doc-sync-core/engine';
const schema = {
  root: 'note', marks: [],
  nodes: {
    note: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
    paragraph: {shape: 'text'},
  },
} as const;
const engine = typescriptEngine.create('writer-A', schema);
const {ops, normalize} = engine.edit([
  {op: 'insert', at: [0, 0], content: 'hello'},
]);
```

## Supported operations

- Create an engine with any schema accepted by the existing TypeScript schema
  validator. Identity includes engine name, contract revision, actor, complete
  schema fingerprint, and supported capabilities. Invalid actors are rejected.
- Query detached model and schema DTOs. No `Doc`, token storage object, `Map`, or
  clock object crosses the interface.
- Compile `EditOp[]` with the real compiler. Return actual wire `Op[]` and model
  `normalize` edits. Normalization is always enabled. Only operations from this
  edit enter local history. Pass `null` as the second argument to omit recording.
- Receive a causally ordered wire batch with its writer actor. Validate the batch
  on a candidate document, then apply it. Exact retries, including own edit,
  undo, and redo echoes, retain the existing document semantics. Receive never
  records history. Newly received operations advance the document clock. The
  writer must match each operation's issuing ticket; referenced tokens can belong
  to any actor. Missing causal predecessors are rejected, not buffered.
- Own actor history: undo, redo, clear, availability, and deletion pin. The pin
  method takes JSON pairs of deletion-ticket keys and server sequence numbers.
  It calculates the existing History pin and does not run GC.
- Capture and resolve anchors and forward or backward selections. Strings and
  offsets use UTF-16 code units. Surrogate pairs and isolated surrogates survive
  edit, wire transfer, JSON checkpoint, and undo. Hidden nested content resolves
  to `null`. Deleted text in a visible line follows existing nearest-position
  rules. Invalid paths and missing token keys return `null`.
- Export and restore a coupled document and history checkpoint. Checkpoints are
  tagged with the TypeScript engine format. Restore requires the same actor,
  engine, contract revision, capability set, and schema fingerprint. History's
  decoder validates its reference tables. Additional checks reject missing
  document targets, insertion/deletion history from another actor, and history
  clocks beyond the document clock. The checkpoint is trusted local recovery
  data, not an authenticated or tamper-proof message.

Each input and output must contain finite plain JSON values. Accessors, cycles,
exotic objects, sparse arrays, and non-finite numbers are rejected. DTO copies use `structuredClone` after the plain-value guard. This preserves
shared references, negative zero, and isolated surrogate code units at the copy
boundary. The existing History serializer and inverse-operation grouping use
JSON number semantics: negative zero can become positive zero during undo or
history recovery. JSON serialization of a checkpoint also normalizes negative
zero. This port does not strengthen those existing guarantees.

Each mutation first clones the document snapshot and restores a separate history
graph. The adapter installs both only after the complete operation and output
copy succeed. A compiler, validation, apply, or restore error preserves the live
document, history, clock, and revision. This favors a clear atomicity boundary.
It adds a full document/history copy per mutation and has no latency guarantee.
Revision counts successful mutation calls, including duplicate receive calls and
empty history actions. Restore installs the saved revision. Revision is not a
server sequence or a content hash.

## Limits and next steps

Capabilities `composition`, `events`, `gc`, and `schema-transition` are absent.
`requireCapability()` throws for these capabilities. The port does not implement
composition drafts, clock reservation between drafts and live state, pending
transport queues or acknowledgements, conditional edits, recovery controller
protection, live schema changes, verified mutation events, disposal, or GC.
A port checkpoint does not save pending network operations or server metadata.
Use the existing client recovery API for a connected production client. An engine
restore is local recovery and must not run beside another live writer with the
same actor identity.

The checkpoint envelope deliberately identifies a TypeScript document format.
The common `EngineCheckpoint` leaves document and history payloads opaque.
`TypeScriptEngineCheckpoint` gives the existing `Snapshot` and `HistorySnapshot`
DTOs concrete types. Another backend must reject the TypeScript format until
lossless snapshot/history conversion is proved. No common native snapshot layout
is assumed. Contract revision 1 remains
a draft; backend-specific state layout needs review before a second backend.

Migration must first add the missing capabilities and their acceptance tests.
Then adapt `InputSession`, `SyncClient`, model events, and each editor binding.
Rust still needs compiler, arbitrary-schema, runtime-schema, history, anchor, GC,
and UTF-16 parity before an actual WASM adapter can pass the same suite. A future
engine selector requires that adapter and browser editor validation.

## Evidence

The focused suite is `test/engine-contract.test.ts`. It covers two independently
renamed text schemas and a separately named grid schema; actual nonempty table
normalization; UTF-16 and isolated surrogates; concurrent actors with causal delay
and duplicate retries; same-actor edit/undo/redo echoes; continuation after restore;
foreign same-value formatting and concurrent deletion; backward selections; hidden
anchors; and atomic failures for edits, wire batches, checkpoint metadata,
history references, document coupling, and clocks. Differential checks compare
shared and distinct object-valued span inputs with the real `Doc` compiler, model,
anchors, and checkpoint continuation. A separate `Doc`/`History` comparison checks
negative-zero DTO copies and existing undo number semantics.

Run it with Node 24 and run the core build and workspace typecheck:

```sh
node --test packages/doc-sync-core/test/engine-contract.test.ts
npm run build --workspace @barocss/doc-sync-core
npm run typecheck
```

These are adapter/source checks. They do not establish production binding use,
network recovery, performance, WASM support, or package publication.
