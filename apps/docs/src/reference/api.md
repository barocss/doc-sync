# Public API

The library has one package and seven entry points. The demo, documentation, and benchmark workspaces are private npm packages.

## Entry points

| Import | Main exports |
|---|---|
| `@barocss/doc-sync` | `Doc`, `History`, `commands`, model/schema/position helpers, and shared types. |
| `@barocss/doc-sync/sync` | `SyncClient`, `HttpTransport`, `upgradeOpenEditorSchema`, `OpenEditorSchemaHost`, `ModelRange`, protocol constants and types. |
| `@barocss/doc-sync/node` | `NodeHttpTransport` for Node.js HTTP and SSE synchronization. |
| `@barocss/doc-sync/server` | `DocHub`, `HubOptions`. |
| `@barocss/doc-sync/prosemirror` | `PmBinding`, `buildPmSchema`, model/position conversion. |
| `@barocss/doc-sync/slate` | `SlateBinding`, schema codecs and selection conversion. |
| `@barocss/doc-sync/lexical` | `LexicalBinding`, `buildLexicalSchema`, schema nodes and selection conversion. |

The current exports point to TypeScript source. A published npm release still needs a distribution build and API/version policy.

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

`NodeJSON`, `Run`, `EditOp`, and `ModelPath` describe editor-visible content. `Op`, `Ticket`, `Item`, and `Snapshot` describe stored and transmitted state. A model path is a current address; a token key is a stable identity.

`canonical`, `applyEdits`, and `diffModels` normalize, apply, and compare models. `pathAt`, `anchorAt`, `posOfPath`, and `pathOfPos` convert between editor paths and token positions.

## Commands and history

`commands` includes `insertText`, `splitBlock`, `backspace`, `deleteForward`, `setMark`, `setLink`, `setBlockType`, `insertBlock`, `insertInline`, `insertAxis`, `deleteAxis`, `setSpan`, and related attribute helpers.

The [schema-driven block operations guide](../guide/blocks) includes executable examples for lists, nested flows, tables, spans, inline nodes, attributes, and atomic blocks.

`SyncClient` owns collaboration history for connected editors. `client.undo()` and `client.redo()` create new wire operations. They do not restore a past whole-document snapshot. The exact ownership and concurrent-write rules are in [collaboration intent](./collaboration-intent).

## Schema transitions

`schemaVersion(schema)` returns the fingerprint of a schema. `assertCompatibleSchema(previous, next)` rejects unsupported changes. After the server accepts a compatible schema, `client.upgradeSchema(next)` installs it locally; call `client.connect()` to reconnect. This does not rebuild a native editor.

Use `upgradeOpenEditorSchema(client, next, host, timeoutMs?)` when an editor is mounted. The application-owned `OpenEditorSchemaHost` blocks input, captures a `ModelRange`, builds and installs the replacement editor, and resumes input. The helper retains the client, its history and pending changes, anchors the selection and waits for a verified connection. The default reconnect timeout is 10 seconds. See [change an open editor's schema](../guide/schema-transition) for lifecycle steps, examples for the three editors and failure handling.

The private MCP app exposes schema inspection, compatible transitions and conditional edits to a headless participant. See [AI and headless clients](../guide/ai).

## Authoritative source

- [Core exports](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/index.ts)
- [Client and protocol](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/sync)
- [Server](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/server)
- [ProseMirror binding](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/pm)

- [Slate binding](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/slate)
- [Lexical binding](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/lexical)
