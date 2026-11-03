# Document schemas

`DocumentSchema` defines a document with flow, text, marks and tables. Use
`domain: "document"` or omit the domain. Existing schemas that omit it retain
their document behavior and fingerprint.

## Structure and defaults

The engine reads shapes. Your application chooses node names such as
`paragraph`, `heading` or `table`.

| Shape | Purpose |
| --- | --- |
| `flow` | A sequence of blocks with a default text block. |
| `text` | A block with text runs and permitted inline content. |
| `group` | A computed group of adjacent text items, such as a list. |
| `inline` | A node that occupies one position inside a text block. |
| `span` | A wrapper derived from a value mark, such as a link. |
| `grid` | A document table with row and column structure. |
| `atom` | A block without an editable body. |

A flow starts with its declared default text block. Attribute defaults and
allowed children are part of the schema. Stored graphic containers have a
separate purpose: they can stay empty and preserve an object-group identity.
See [Graphic schemas](../guide/graphic-schema) for that contract.

## Editing and synchronization

Document schemas use the shared TypeScript engine, `Client`, sync APIs and
History. The same document schema must be supplied at each sync endpoint.
Compatible schema transitions add supported rules while preserving existing
rules; incompatible changes require an application-managed migration.

Start with [Define a schema](../guide/schema) and
[Getting started](../guide/getting-started). Then read:

- [Complete example schema](../guide/full-schema)
- [Word, Notion and presentation schemas](../guide/product-schemas)
- [Change an open editor's schema](../guide/schema-transition)
- [Document rules and annotations](../guide/document-rules)

## Tables and spreadsheets

The `grid` model expands every row and column cell into dense JSON. It is
suitable for bounded document tables. A large logical worksheet needs sparse
cell storage instead of N × M model allocation. Read the
[grid limits](../guide/schema#document-tables-and-sparse-sheets) and the separate
[experimental spreadsheet API](./spreadsheets). Its public `SpreadsheetSchema`
is separate from document schemas and has no `Client` backend.

## Rust and WASM boundary

The native Rust `Document` API uses six fixed document presets. A separate
`RuntimeDocument` accepts a flat root flow with text and atom blocks. It rejects
unsupported nested shapes and rules during compilation. Native runtime graphic
and sheet APIs also accept supported user-defined descriptors. See
[custom schemas](./custom#native-rust-support). The WASM adapter provides
storage only; it has no CRDT `Client` factory. The shared TypeScript schema
contract does not establish Rust or WASM parity. See
[Rust engine and adapters](../guide/rust) for the supported API.
