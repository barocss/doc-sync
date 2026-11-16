# Define a schema

See [Custom schemas and editor mappings](../schemas/custom) for per-editor
capability checks and the separate sparse field contract.

The current `grid` shape represents a document table. Its JSON model expands
every row/column pair, including empty and covered cells. It is not a sparse
spreadsheet store. See [Document tables and sparse sheets](#document-tables-and-sparse-sheets)
before using it for a large worksheet.

The core reads shapes. Your application assigns names such as `paragraph`, `note`, or `table`. A schema defines the root, allowed children, default blocks, attributes, marks, and inheritance.

## Document and graphic domains

Existing `Schema` values remain document schemas when `domain` is omitted.
`DocumentSchema` names that contract explicitly; `domain: 'document'` is optional
and has the same schema identity as the equivalent unmarked definition.
`GraphicSchema` requires `domain: 'graphic'` and a root `container` that can be
empty. Both use the same document engine, client, synchronization and History.

Document flows keep their default text blocks. Graphic containers never create
default text siblings. Use a container for a stored frame or object group; the
existing `group` shape remains a computed list of adjacent text items.
See [Document and graphic schemas](./graphic-schema) for executable examples,
object IDs, capability checks, and current integration limits.

## Shapes

| Shape | Purpose |
|---|---|
| `text` | A block with text runs and permitted inline content. |
| `inline` | A node that occupies one position inside a text block. |
| `span` | A model wrapper derived from a value mark, such as a link. |
| `flow` | A sequence of document blocks with a default text block. |
| `container` | A stored, ordered object collection that may be empty; graphic schemas only. |
| `group` | A model group of adjacent text items, such as a list. |
| `grid` | A table with row and column token lines. |
| `row`, `cell` | The schema structure of a grid. |
| `atom` | A block without an editable body. |

## A text schema

```ts
import {checkSchema, type DocumentSchema} from "@barocss/doc-sync";

const schema: DocumentSchema = {
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

Each client and the server use an application-supplied schema. The server sends its schema version during connection, and a client verifies it before sending changes. The version is the SHA-256 hash of the canonical schema JSON, including UI metadata. The default `domain: 'document'` marker is omitted from that identity so existing schemas keep their versions. Object-key order does not change the hash; array order does. Schema values must be plain JSON data. A server started without a schema cannot verify clients or accept a schema transition. Graphic clients require a verified matching schema and `containers-v1`; they reject a schema-free server. Switching between document and graphic domains is incompatible and requires an application-managed migration.

The server supports a **compatible, additive transition** while a document is in use. It can append new boolean marks, define new nodes, and append those new node types to the children of existing flow, container, or text nodes. Existing marks and children keep their order. Existing node rules and other schema fields must remain unchanged. Some additions that would regroup or rewrap existing content are rejected. Adding a child that is already an existing node type is also rejected. For details, see `assertCompatibleSchema` in the library.

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

[Follow the editor-specific transition guide →](./schema-transition)

For the demo server, `GET /api/docs/{doc}/state` returns the current `epoch`, `serverSeq`, and `schemaVersion`. `GET /api/docs/{doc}/schema` returns the current schema and version. To propose a transition, send `POST /api/docs/{doc}/schema` with `{base: {epoch, serverSeq, schemaVersion}, schema: nextSchema}`. Set `content-type: application/json`, `x-doc-sync-protocol: 3`, `x-doc-sync-epoch` to the base epoch, and `x-doc-sync-schema` to the base schema version. A stale or incompatible proposal is rejected; read the current state before making a new proposal. The demo persists accepted schema transitions with its document log. It does not provide authentication or authorization for this endpoint.

Changing existing rules, removing types, changing defaults, or converting stored content is **not** supported by this transition. Such changes need a separate migration and an application-defined policy for offline changes and history. The library does not automatically migrate incompatible schemas.

Read the [full demo schema](./full-schema) for every type, child rule, default, attribute, and UI field used by the actual `DEMO_SCHEMA`. Its generated code preserves all runtime rules and translates UI display strings only. The separate [block operations guide](./blocks) uses a reduced teaching schema with an added paragraph alignment attribute.

[Run schema-driven block operations →](./blocks)


## Document tables and sparse sheets

A document table and a spreadsheet have different storage requirements. The
current `grid` model builds rows with all column cells. An N-row, M-column
projection therefore contains N × M cells, even if most have no text. The
internal token storage and the expanded JSON model are different layers;
blank cells need not each have a stored text operation, but materializing the
model still creates the full rectangular structure.

A large worksheet needs a separate sparse model. Store cell records only where
content or non-default properties exist. Describe the logical row/column extent
without allocating one object for every possible blank row, column, or cell.
Store width, height, style, and other overrides separately, preferably as ranges
when their scope is shared. A viewport queries only the needed cells and derives
empty defaults. Virtual rendering alone does not remove dense model allocation.

Cell identity must survive row/column insertion and movement. Stable sheet,
row, and column identities identify a cell; A1 labels and screen coordinates
are derived from the current axis order and geometry. Formula references need
that same identity and explicit copy/move semantics. Calculation, dependency
tracking, ranges, and sparse history/GC need their own contracts.

These are requirements for future spreadsheet support. Adding a
`SpreadsheetSchema` name or cell attributes to today's grid does not implement
them. Existing document table behavior remains unchanged.

## Atomic pattern descriptor diagnostics

`diagnoseAtomicAttributePatterns(schema)` returns read-only diagnostics for
atomic node attributes and value marks. Each result has `code` (`pattern_type`
or `invalid_pattern`), `path` as exact string segments, and `message`. For example,
`["nodes", "paragraph", "attrs", "label", "pattern"]` identifies one descriptor
without treating dots inside names as path separators. Invalid atomic patterns
also appear in `checkSchema`'s existing string problems and are rejected by
normal document construction and `schemaVersion` preflight.

This initial API takes a typed `Schema`; it is not a general untrusted-JSON parser
or complete descriptor diagnostics. Nested collaborative field diagnostics
remain with their existing checker and are not duplicated here. Regex syntax
success is not proof of safe execution cost or protection against pathological
regular expressions. Valid pattern behavior and empty pattern behavior remain
unchanged. Direct `attrValueOk` rejects a bad pattern rather than throwing a
compile exception; null-reset semantics remain unchanged.

Atomic `values` retains its existing reference-equality behavior for objects,
while nested field leaf enums use JSON deep equality. This diagnostic slice does
not normalize those contracts, reinterpret defaults or migrate existing data.

## Read-only transition preview

`preflightSchemaTransition(before, after)` returns `invalid` (with `side` and
`reason`), or `compatible`/`incompatible` with both schema versions and descriptor
`changes`. Incompatible results include the existing assertion's rejection
reason. It validates before then after using `schemaVersion`, and delegates the
actual verdict to `assertCompatibleSchema`; it does not invent a second policy.

Changes have `kind: "add" | "remove" | "replace"` and exact string-segment `path`.
Object keys are sorted, arrays are replaced as a whole, and explicit document
domain is normalized just as in schema identity. Changes omit descriptor values;
error reasons can contain schema names/references and are not redacted messages.
Different fingerprints or a nonempty diff do not by themselves mean incompatible.

This typed-schema API neither mutates nor installs anything. It does not inspect
stored documents, estimate affected nodes, check editor renderers or server/bot
permissions, execute migrations, or guarantee compatibility with future edits.
The report is a preview of supplied descriptors, not an approval token: the
actual transition must still enforce its own current-state checks. General
untrusted Proxy isolation and input size limits are not added by this wrapper.

For valid descriptors, `requiredCapabilities` reports `protocol`, `before`, and
`after` using the same helper as the sync client's hello check and the server's
hello advertisement. These are protocol-level requirements: all document schemas
require the baseline document capabilities even when a particular document uses
none of those features; graphic schemas additionally require `containers-v1`.
They are not snapshot feature detection, installed-renderer checks, or evidence
that any peer supports the proposal. Invalid inputs have no capability report.

## Atomic numeric bound diagnostics

`diagnoseAtomicAttributeBounds(schema)` checks atomic attributes and value marks
whose default is numeric. It reports `bound_type` for present non-finite or
non-number bounds, and `bound_order` when minimum exceeds maximum, with exact
path segments and messages. The same errors participate in `checkSchema`, schema
versioning and document creation. Omit a bound for an unlimited side; explicit
infinity is not a finite JSON schema value.

Valid equal bounds remain supported. This slice does not enforce that defaults
satisfy their constraints, reinterpret bounds on nonnumeric defaults, change
null resets or enum policy, or replace nested-field diagnostics. Direct numeric
validation does not coerce malformed bounds to numbers.

## Atomic enum container diagnostics

`diagnoseAtomicAttributeEnums(schema)` reports `enum_type` with an exact path
when atomic `values` is present but not an array. These errors are included in
schema validation/versioning and document creation. Direct value validation
fails closed rather than invoking a non-array `includes` method.

An empty array remains valid and admits no non-null values. Atomic object enum
members retain reference equality, while nested leaves retain their existing
JSON deep equality. Defaults are not rewritten and null-reset semantics do not
change. This check does not validate arbitrary untrusted executable objects or
add full member/default diagnostics.

## Mark name conflicts

`diagnoseMarkNameConflicts(schema)` reports `mark_kind_conflict` when one name is
both a boolean `marks` entry and an own `markValues` key. Its path identifies the
boolean declaration by array index, such as `["marks", "1"]`. Schema validation,
versioning and creation reject the ambiguity rather than choosing a declaration.
Disjoint boolean/value mark ordering and semantics are unchanged. This is not
full mark-name validation or automatic renaming of existing schemas.

Nested field leaves also reject malformed constraint types through their
existing `fieldsSchemaProblems`/`checkSchema`/`schemaVersion` path: enum values
must be arrays, patterns strings, and numeric-default bounds finite numbers in
order. Direct leaf validation returns false rather than coercing these malformed
rules. Null resets and valid deep enum comparisons remain unchanged. The legacy
raw Doc constructor's broader nested validation gate is not expanded by this
change; validate schema identity before installing untrusted descriptors.

### Client edit batch validation

The TypeScript client engine's detached edit preflight validates generated CRDT
operations against the unchanged document before live compilation. Invalid
atomic enum, numeric range, pattern or mark updates are rejected early, including
when they follow a valid insertion in the same batch. This changes previously
accepted local edits whose invalid values were hidden by projection and later
rejected by the server. Valid pending edits and peer changes are not discarded.

This is not a new guarantee for raw `Doc.edit`: its lower-level projection and
compilation semantics are unchanged. Existing bounded fast text/structural paths
remain separate, and this does not replace server authorization or claim every
possible command/server policy is equivalent.
