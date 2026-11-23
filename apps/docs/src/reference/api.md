# Public API

Six packages provide Core, four editor bindings, and a compatibility facade. All remain private before registry release. The demo, documentation, and benchmark workspaces are private. See [packages and engines](../guide/packages) for independent imports and peer dependencies.

## Entry points

| Import | Main exports |
|---|---|
| `@barocss/doc-sync` | `Doc`, `History`, `commands`, model/schema/position helpers, and shared types. |
| `@barocss/doc-sync/sync` | `SyncClient`, `HttpTransport`, `typescriptClientEngineFactory`, `ClientEngineFactory`, `upgradeOpenEditorSchema`, `OpenEditorSchemaHost`, `ModelRange`, protocol constants and types. |
| `@barocss/doc-sync/node` | `NodeHttpTransport`, `NodeHttpTransportOptions` for Node.js HTTP and SSE synchronization. |
| `@barocss/doc-sync/server` | `DocHub`, `HubOptions`. |
| `@barocss/doc-sync/prosemirror` | `PmBinding`, `buildPmSchema`, model/position conversion. |
| `@barocss/doc-sync/tiptap` | `DocSync`, `createTiptapExtensions`, Tiptap options and storage types. |
| `@barocss/doc-sync/slate` | `SlateBinding`, schema codecs and selection conversion. |
| `@barocss/doc-sync/lexical` | `LexicalBinding`, `buildLexicalSchema`, schema nodes and selection conversion. |

These eight compatibility entry points re-export the independent packages. Current package exports resolve compiled ESM JavaScript and declarations. Local tarball installation is verified; registry publication and release policy remain separate gates.

## Editor host

`@barocss/doc-sync-core/editor` exports `EditorHost`, `EditorSession`, and `createSyncClientEditorHost(client)`. The adapter uses the selected production SyncClient engine and its input sessions. The TypeScript implementation keeps ordinary single-text edits on an incremental path. Model values are borrowed immutable views with generation/revision stamps.

The independent binding packages export `PmHostBinding`, `SlateHostBinding`, and `LexicalHostBinding`. Legacy client constructors share those implementations and preserve `.client`; Lexical preserves its original `.input` session. Tiptap uses the shared PM implementation. See [host integration](../guide/packages#connect-prosemirror-through-an-editor-host) for examples. Only the TypeScript production factory ships; a Rust/WASM adapter is not selectable.

`OpenEditorSchemaHost` below is the application-owned native editor rebuild lifecycle. It is separate from the backend-facing `EditorHost` interface.

## Production engine and client state

`@barocss/doc-sync-core/engine` exports `ClientEngineFactory`, `ClientEngine`,
`EngineEditingView`, `EngineInputSession`, and `typescriptClientEngineFactory`.
Pass the factory as `new SyncClient(actor, transport, {schema, engineFactory})`.
Omit it for the TypeScript default. The constructor validates methods, identity,
schema, version, and capabilities before connection. `client.engine` owns the
authoritative state. The common port exposes no `Doc` or `History` objects.

| Member | Contract |
|---|---|
| `engine.apply(edits)` | Compile and apply local edits; return exact wire operations without History or transport queuing. |
| `client.commit(ops, record?)` | Record once and queue already-applied operations. |
| `engine.createSession()` | Create an engine-owned composition draft. Publication applies its retained operations; InputSession commits once. |
| `client.disconnect()` | Stop transport and retain pending changes and History. |
| `client.dispose()` | End the client; reject protected work, unresolved conditional work, or undo/redo History. |
| `client.checkpoint()` / `restoreCheckpoint(value, epoch)` | Exact legacy format-1 TypeScript snapshot/History envelope. |
| `client.captureState()` / `restoreState(value, epoch)` | Format-2 client envelope with one tagged opaque engine payload and transport metadata. Restore requires matching engine/version/actor/schema and external epoch/GC proof. |

Format 2 does not convert between engines. `LiveRecovery` and the Node journal
still use the TypeScript-specific format-1 recovery path; a portable durable
adapter is future D4 work. A checkpoint capture does not persist durable state.

Legacy `client.doc`, `client.history`, and `InputSession.doc` return the real
TypeScript objects through an optional compatibility extension. Custom Doc input
sessions and document facades have a separate TypeScript adapter. A portable
backend can reject those accesses. The older immutable `DocumentEngine` /
`typescriptEngine` API is separate and cannot serve as `ClientEngineFactory`.
Only TypeScript ships. Live engine switching and Rust/WASM selection are not
available. Selected-engine routing and regression checks pass; broader end-to-end Chrome
latency acceptance remains open. See [status and limits](../status).

## Doc

| Member | Contract |
|---|---|
| `new Doc(actor, schema)` | Create a replica with an actor-local clock and schema. |
| `edit(edits, options?)` | Apply ordered model edits and return `{ops, normalize}`. |
| `check(ops)` | Validate references and schema compatibility before application. |
| `apply(op)` | Apply one wire operation in valid causal order. |
| `toJSON()` | Read a canonical model whose containers can be changed by the caller. |
| `snapshot()` | Export stored CRDT state. |
| `Doc.fromSnapshot(actor, snapshot, schema)` | Restore a replica with a selected local actor. |
| `version` | Revision that changes after application and compaction. |
| `blocks(line?)`, `visible(line)` | Read stored-line blocks and current visibility. |
| `compact(frontier, seqOf)` | Compact stable tombstones at the agreed GC boundary. |

## Model and positions

`NodeJSON`, `Run`, `EditOp`, and `ModelPath` describe editor-visible content. `Op`, `Ticket`, `Item`, and `Snapshot` describe stored and transmitted state. A model path is a current address; a token key is a stable identity. Stored group paths use canonical attribute values, including validated defaults, when grouping adjacent blocks. Model-only required-group fallbacks are not stored edit targets.

`canonical`, `applyEdits`, and `diffModels` normalize, apply, and compare models. `pathAt`, `anchorAt`, `posOfPath`, and `pathOfPos` convert between editor paths and token positions.

## Commands and history

`commands` includes `insertText`, `splitBlock`, `backspace`, `deleteForward`, `setMark`, `setLink`, `setBlockType`, `insertBlock`, `insertInline`, `insertAxis`, `deleteAxis`, `setSpan`, and related attribute helpers.

The [schema-driven block operations guide](../guide/blocks) includes executable examples for lists, nested flows, tables, spans, inline nodes, attributes, and atomic blocks.

`SyncClient` owns collaboration history for connected editors. `client.undo()` and `client.redo()` create new wire operations. They do not restore a past whole-document snapshot. The exact ownership and concurrent-write rules are in [collaboration intent](./collaboration-intent).

## Schema transitions

`schemaVersion(schema)` returns the fingerprint of a schema. `assertCompatibleSchema(previous, next)` rejects unsupported changes. After the server accepts a compatible schema, `client.upgradeSchema(next)` installs it locally; call `client.connect()` to reconnect. This does not rebuild a native editor.

Use `upgradeOpenEditorSchema(client, next, host, timeoutMs?)` when an editor is mounted. The application-owned `OpenEditorSchemaHost` blocks input, captures a `ModelRange`, builds and installs the replacement editor, and resumes input. The helper retains the client, its history and pending changes, anchors the selection and waits for a verified connection. The default reconnect timeout is 10 seconds. See [change an open editor's schema](../guide/schema-transition) for lifecycle steps, examples for the three editors and failure handling.

The private MCP app exposes schema inspection, compatible transitions and conditional edits to a headless participant. See the separate [AI and bots section](../ai/) and [document server connection guide](../ai/server).

## Partial reads and Node credentials

Core exports `readDocumentSlice`, `SliceQuery`, `DocumentSlice`, and `SLICE_LIMITS`. A slice reads selected canonical children without a full `toJSON()` call. The first containing-line index can scan all siblings; nested and global projections can cost more. Node, UTF-16, depth, and JSON-byte budgets reject oversized pages. Covered table-cell content remains in the canonical model. Ambiguous raw/canonical grouping and model-only minimum fallbacks are rejected. See [bounded reads](../ai/reading) for paths, cursor scope, and the different Core/session/MCP byte counters.

`new NodeHttpTransport(doc, actor, origin, {headers})` supplies configured headers to document requests. Credentialed origins must be absolute HTTP(S) URLs with no user information, query, or fragment. Redirects are rejected. Headerless relative bases remain available for browser transport compatibility. The private [hosted MCP service](../ai/hosted) requires a stricter upstream origin with no path; it never forwards the incoming MCP bearer token.

## Authoritative source

- [Core exports](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync-core/src/index.ts)
- [Client and protocol](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-core/src/sync)
- [Server](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-core/src/server)
- [ProseMirror binding](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-prosemirror/src)

- [Slate binding](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-slate/src)
- [Lexical binding](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-lexical/src)

- [Tiptap extension](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-tiptap/src)
