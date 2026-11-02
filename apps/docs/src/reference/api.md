# Public API

Six packages provide Core, four editor bindings, and a compatibility facade. All remain private before registry release. The demo, documentation, and benchmark workspaces are private. See [packages and engines](../guide/packages) for independent imports and peer dependencies.

## Entry points

| Import | Main exports |
|---|---|
| `@barocss/doc-sync` | `Doc`, `History`, `commands`, model/schema/position helpers, and shared types. |
| `@barocss/doc-sync/sync` | `SyncClient`, `HttpTransport`, `upgradeOpenEditorSchema`, `OpenEditorSchemaHost`, `ModelRange`, protocol constants and types. |
| `@barocss/doc-sync/node` | `NodeHttpTransport`, `NodeHttpTransportOptions` for Node.js HTTP and SSE synchronization. |
| `@barocss/doc-sync/server` | `DocHub`, `HubOptions`. |
| `@barocss/doc-sync/prosemirror` | `PmBinding`, `buildPmSchema`, model/position conversion. |
| `@barocss/doc-sync/tiptap` | `DocSync`, `createTiptapExtensions`, Tiptap options and storage types. |
| `@barocss/doc-sync/slate` | `SlateBinding`, schema codecs and selection conversion. |
| `@barocss/doc-sync/lexical` | `LexicalBinding`, `buildLexicalSchema`, schema nodes and selection conversion. |

These eight compatibility entry points re-export the independent packages. Current package exports resolve compiled ESM JavaScript and declarations. Local tarball installation is verified; registry publication and release policy remain separate gates.

## Editor host

`@barocss/doc-sync-core/editor` exports `EditorHost`, `EditorSession`, and `createSyncClientEditorHost(client)`. The adapter uses the existing TypeScript SyncClient/InputSession without a full snapshot per ordinary edit. Model values are borrowed immutable views with generation/revision stamps.

The independent binding packages export `PmHostBinding`, `SlateHostBinding`, and `LexicalHostBinding`. Legacy client constructors share those implementations and preserve `.client`; Lexical preserves its original `.input` session. Tiptap uses the shared PM implementation. See [host integration](../guide/packages#connect-prosemirror-through-an-editor-host) for examples. A Rust/WASM host and backend selector remain unimplemented.

`OpenEditorSchemaHost` below is the application-owned native editor rebuild lifecycle. It is separate from the backend-facing `EditorHost` interface.

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
