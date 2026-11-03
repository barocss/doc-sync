# Schemas

A schema defines the node types, attributes, marks and child rules of a model.
Read the sections in order: Document, Graphic, then Spreadsheet.

The public `Schema` type supports two domains: `DocumentSchema` and
`GraphicSchema`. The domain is a schema property. It does not select another
CRDT or sync protocol. The experimental `SpreadsheetSchema` and `SparseSheet` APIs are separate
from this tree-schema union. They do not use `Client` or `DocHub`.

See [Custom schemas and editor mappings](./custom) for data definitions,
editor capability checks and the native Rust support boundary.

## Document

`DocumentSchema` defines document flow. Its domain can be omitted or set to
`"document"`. Existing schemas that omit it keep their behavior and fingerprint.
Flows use default text blocks. The model supports text, lists, inline content,
marks and document tables.

Start with the [Document overview](./document), then
[define a schema](../guide/schema). Use the
[complete example](../guide/full-schema) or
[Word, Notion and presentation schemas](../guide/product-schemas) for a larger
model. See [schema transitions](../guide/schema-transition) and
[document rules and annotations](../guide/document-rules) for editing behavior.

The TypeScript engine uses application-defined schemas. Native Rust supports
six document presets and a separate runtime flat-flow/text/atom subset.
Nested document shapes remain outside that runtime subset.
The WASM adapter provides storage only and has no CRDT `Client` factory.
See [Rust engine and adapters](../guide/rust) for the API limits.

## Graphic

`GraphicSchema` defines stored object trees with `domain: "graphic"`.
A `container` can stay empty. It does not create a paragraph. Start with the
[Graphic overview](../guide/graphic-schema).

Use the built-in [`createGraphicSchema()` contract](../guide/graphic-schema#use-the-built-in-graphic-contract)
for standard shapes, affine transforms, vector data, paints, strokes and ID
references. It needs no application-defined attribute declarations. Rendering,
layout, Boolean solving and instance expansion remain separate work.

The repository also provides two smaller examples:

- [`fixtures/graphic-schema.ts`](https://github.com/barocss/doc-sync/blob/main/fixtures/graphic-schema.ts)
  is a minimal data-model fixture. It shows stored containers, a generic shape,
  explicit labels and document text inside a text box.
- [`fixtures/graphic-canvas-schema.ts`](https://github.com/barocss/doc-sync/blob/main/fixtures/graphic-canvas-schema.ts)
  is the complete application schema for the [PixiJS graphic editor](../guide/graphic-editor).
  It includes transforms, size, color, opacity, locks and sample objects.

The PixiJS example uses these node types:

| Node | Stored shape |
| --- | --- |
| `canvas` | Root container |
| `frame` | Container with a clipping attribute |
| `object-group` | Container for stored objects |
| `rectangle` | Atom |
| `ellipse` | Atom |
| `label` | Text |

Geometry, rendering and pointer input belong to the application. The schema
stores the object tree and attributes.

The TypeScript runtime implements graphic schemas, stored containers, graphic
edits, synchronization and persistence. The native Rust SDK implements fixed `Canvas` and 17-node `Builtins` profiles
through `GraphicDocument`. The Builtins manifest matches the frozen TypeScript
contract. A separate `RuntimeDocument` accepts user-defined container/text/atom
schemas. See [native support](../guide/rust#runtime-custom-schemas).

The graphic editor report records **20/20 Chrome functional checks passed**.
Its large-scene interactive performance remains **INVESTIGATE**. Functional
checks do not establish large-scene performance. Read the
[performance evidence](../performance) for measurements and limits.

## Spreadsheet

The document `grid` uses dense JSON with all rows and cells. The separate
**experimental** [sparse spreadsheet API](./spreadsheets) supports user-defined
fields through `SpreadsheetSchema`, exported from `@barocss/doc-sync`.
It stores writes rather than all coordinates. It is not integrated with
tree `Schema`, `Client`, `DocHub` or the public sync wire protocol.
Use [stable rows and columns](./spreadsheet-structure) for opt-in structural
edits without allocating the logical grid.
See the [grid limits](../guide/schema#document-tables-and-sparse-sheets) before
choosing a document table for a worksheet.
