# Define a schema

The core reads shapes. Your application assigns names such as `paragraph`, `note`, or `table`. A schema defines the root, allowed children, default blocks, attributes, marks, and inheritance.

## Shapes

| Shape | Purpose |
|---|---|
| `text` | A block with text runs and permitted inline content. |
| `inline` | A node that occupies one position inside a text block. |
| `span` | A model wrapper derived from a value mark, such as a link. |
| `flow` | A sequence of document blocks. |
| `group` | A model group of adjacent text items, such as a list. |
| `grid` | A table with row and column token lines. |
| `row`, `cell` | The schema structure of a grid. |
| `atom` | A block without an editable body. |

## A text schema

```ts
import {checkSchema, type Schema} from "@barocss/doc-sync";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {
            shape: "flow",
            children: ["paragraph", "heading", "note"],
            default: "paragraph",
        },
        paragraph: {shape: "text"},
        heading: {shape: "text", next: "paragraph"},
        note: {
            shape: "flow",
            children: ["paragraph"],
            default: "paragraph",
            attrs: {tone: {default: "info", values: ["info", "warning"]}},
        },
    },
};

const problems = checkSchema(schema);
if (problems.length) throw new Error(problems.join("; "));
```

## Inheritance and normalization

New text inherits boolean marks from the left character observed by the author. Value marks require `inherit: true`; the demo's link value mark does not inherit by default. The insertion operation stores its marks; the receiver does not recompute them from its current neighbor.

A flow starts with a text-shaped default block. That type can set `text: false`, as the demo image block does. Adjacent list items can form a model group. Table cells retain a full-grid model even when a span hides a cell. These rules are part of the shared document contract.

## Changing a schema

Each client and the server use an application-supplied schema. The server sends its schema version during connection, and a client verifies it before sending changes. The version is the SHA-256 hash of the complete canonical schema JSON, including UI metadata. Object-key order does not change the hash; array order does. Schema values must be plain JSON data. A server started without a schema cannot verify clients or accept a schema transition.

The server supports a **compatible, additive transition** while a document is in use. It can append new boolean marks, define new nodes, and append those new node types to the children of existing flow or text nodes. Existing marks and children keep their order. Existing node rules and other schema fields must remain unchanged. Some additions that would regroup or rewrap existing content are rejected. Adding a child that is already an existing node type is also rejected. For details, see `assertCompatibleSchema` in the library.

The server also checks whether the existing snapshot can be restored under the proposed schema. A transition that introduces the document's first `fields-v1` or `cardinality-v1` capability is currently rejected if the snapshot does not already carry that capability. This can occur even when the additions pass `assertCompatibleSchema`. The server leaves the current schema and document unchanged. Adding capability metadata or converting such a document requires a separate migration; this transition does not perform one.

The transition checks the current document epoch, server sequence, and schema version together. It keeps the CRDT document identities, including hidden cell content. A client with the old schema stops synchronization and retains its local document, pending changes, and history. After the application supplies the accepted new schema, update the client and reconnect:

```ts
// `nextSchema` must match the schema accepted by the server.
client.upgradeSchema(nextSchema);
client.connect();
```

Resolve an unconfirmed conditional edit before calling `upgradeSchema`. A successful reconnect verifies the new schema and retries the client's pending changes. Keep the client session alive during the transition; pending changes and history are held in memory. Do not discard a disconnected client while it still has pending work.

### Rebuild an open editor

The sync package provides `upgradeOpenEditorSchema` to coordinate an open editor after the server accepts a compatible schema. The application supplies a host that owns its editor and binding:

```ts
import {upgradeOpenEditorSchema} from "@barocss/doc-sync/sync";

await upgradeOpenEditorSchema(client, nextSchema, {
  pause() { /* block input; reject an active composition */ },
  selection() { return currentModelRange(); }, // {anchor, focus} or null
  prepare(schema, model) { return buildDetachedEditor(schema, model); },
  detach() { disposeMountedEditor(); },
  async install(prepared, selection) {
    await mountEditor(prepared);
    restoreModelRange(selection);
  },
  resume() { unblockInput(); },
});
```

The named functions in the example belong to the application. `pause`, `selection`, `prepare`, and `detach` must be synchronous. `pause` must block edits and reject an active composition without discarding it. Capture the native selection before a pause that changes focus. `prepare` must validate the replacement without changing the mounted editor. The helper anchors both selection endpoints to document tokens, preserves the client and its history and pending changes, installs the replacement, and waits for a verified server connection before resuming input. The installed binding must continue to map selection when subsequent remote edits arrive.

If preparation fails, the old editor resumes. If detaching, installation, selection restoration, or reconnection fails after detachment, the helper disconnects the client and leaves input paused. When the client already knows the document epoch, a changed epoch during the transition also stops reconnection before it can replace the local document or history. The application must inspect the error and rebuild or reconnect explicitly; it must retain the client and its pending changes. An unresolved conditional edit blocks the transition. A null selection means no selection; an unsupported native selection must be rejected rather than silently converted to null. Keep the client's event callbacks in place while the transition is running.

The product demo implements these host steps for Slate, Lexical and ProseMirror. It rebuilds native editor state and restores forward or backward text selections. Select **Load server schema** after a compatible server transition. The demo does not automatically migrate application plugins or codecs, and it cannot convert incompatible schemas. Applications must supply their own native schema, plugin and codec reconstruction. The bounded Chrome checks use automated input and do not establish real OS IME behavior.

For the demo server, `GET /api/docs/{doc}/state` returns the current `epoch`, `serverSeq`, and `schemaVersion`. `GET /api/docs/{doc}/schema` returns the current schema and version. To propose a transition, send `POST /api/docs/{doc}/schema` with `{base: {epoch, serverSeq, schemaVersion}, schema: nextSchema}`. Set `content-type: application/json`, `x-doc-sync-protocol: 3`, `x-doc-sync-epoch` to the base epoch, and `x-doc-sync-schema` to the base schema version. A stale or incompatible proposal is rejected; read the current state before making a new proposal. The demo persists accepted schema transitions with its document log. It does not provide authentication or authorization for this endpoint.

Changing existing rules, removing types, changing defaults, or converting stored content is **not** supported by this transition. Such changes need a separate migration and an application-defined policy for offline changes and history. The library does not automatically migrate incompatible schemas.

Read the [full demo schema](./full-schema) for every type, child rule, default, attribute, and UI field used by the actual `DEMO_SCHEMA`. Its generated code preserves all runtime rules and translates UI display strings only. The separate [block operations guide](./blocks) uses a reduced teaching schema with an added paragraph alignment attribute.

[Run schema-driven block operations →](./blocks)
