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
`RuntimeDocument` loads supported user-defined recursive descriptors. It supports
flow/text/atom blocks, computed groups, inline tokens, supported value-mark spans and
the `grid → row → cell → flow` table chain, including
different table chains in one descriptor and tables nested inside cell bodies.
Each body uses its own declared default text type and allowed children.

Rows and columns have stable token IDs. A cell is addressed by its table ID,
row ID and column ID; its body is a physical flow. Merge/split changes span
registers and retains covered-cell text. Standard `rowspan`, `colspan` and
`spanned` properties are derived metadata. Document table projection is dense;
this native API does not turn it into a sparse worksheet.

Groups use the current flow's first matching group definition and its `by`
attributes. This runtime subset requires unique declared `by` keys. The stored text members have stable keys; a derived group wrapper
has no stored key. Inline nodes have stable keys and occupy one text offset.
Emoji use their UTF-16 length. Span wrappers come from scalar value marks;
the first active span in schema order wraps the run, while other marks remain
on the child text. A span adds no text offset or stored wrapper identity.

Stored text, flow, inline, grid and atom attributes, and cell attributes, can
opt into recursive `fields`. Each declared leaf has an independent writer;
partial patches preserve other leaves and null resets the declared branch.
Field defaults must match their child defaults. Structured marks are different:
`markValues` with `default: null` can carry field-safe JSON object/array values
in one atomic register. They do not merge nested keys. Native composite defaults
and composite enum choices use explicit schema-reference handles; equal JSON
objects are not interchangeable references. Use the [Rust API guide](../guide/rust)
for the native protocol and its TypeScript transport boundary. A composite enum
can share its default with explicitly listed enum slots through the versioned
alias schema DTO. The v2 shared schema DTO also declares groups across stored
atomic attributes, value marks and enum-only slots. The chosen source reference
and the target property stay separate. Equal JSON alone does not declare sharing.
A representative determines factory and default-projection payload order;
`manifest()` stays raw and `effective_manifest()` exposes the resolved rules.
The v3 payload descriptor adds typed `valuePath` selectors inside atomic
schema-owned defaults and enum values. Parent sharing also shares descendants;
sharing a child leaves its separate parents independent. Effective rules resolve
nested representative order without changing raw schema data. The native API
exposes logical schema references and JSON trees; it does not expose JavaScript
heap aliasing or linked mutable registers. Declared field leaves can supply
reference values through descriptor paths such as `attrs.style.fields.fill`.
Field destinations still use structural JSON equality and independent leaf
registers. Copying a reference value into a field does not create a symbolic
link. Whole field branches and `markValues.fields` remain unsupported reference
sources. See [field reference sources](../guide/rust#field-leaf-reference-sources).

The native runtime also accepts the product HTTP(S) link and optional six-digit
hex-color patterns, including JavaScript whitespace behavior. Existing attribute,
field and mark APIs apply them. Original Demo, Word, Notion and presentation
registries compile, including valid unused declarations. Full-profile editing
and remaining D2/D3 gates still need qualification. See the
[pattern API example](../guide/rust#product-validation-patterns).

`text: false` keeps the text shape and inline children. Raw character admission
follows the containing flow's complete stored text set, so mixed flows can
accept text after a disabled marker. Stored characters remain visible across
type changes. See [native usage](../guide/rust#blocks-without-plain-text).

The native registry can retain supported node declarations that are not reachable
from the root. Every declaration is validated. Declaring a type does not add it
to a parent's allowed children. See
[unused declarations](../guide/rust#unused-node-declarations) for APIs and tests.

`flow.childRules` supplies deterministic required text, group, flow, grid and
atom slots, with `min`/`max` bounds from zero to 1000. Authored replacements can
hide a fallback; deleting them reveals its retained content. Overflow remains
stored. Required IDs are schema-owned and cannot be moved or forged. Use the
[Rust fields and required-child example](../guide/rust#structured-fields-and-required-children)
for native APIs, checkpoint retry and selective undo/redo.

General computed rules, positive-minimum required cycles and
nonempty attributes on derived group/span nodes or model-only rows/cell bodies
remain unsupported. Field-safe JSON rejects dollar-prefixed and prototype keys.
Empty branch patches have a known compiler-only clock difference; mixed scalar
and field definitions in a group update are not qualified by the helper.
Physical-source insertion keeps its explicit-token contract. The bounded native
model compiler supports nested paragraph head/middle/end positions and required
boundaries; complete post-move and arbitrary model command coverage remain D3
work. See [model insertion](../guide/rust#insert-paragraphs-at-model-positions). Native runtime graphic and sheet
APIs also accept their supported descriptors. See
[custom schemas](./custom#native-rust-support) and the
[Rust API examples](../guide/rust).

The WASM adapter provides storage only; it has no CRDT `Client` factory. Native
schema support does not establish browser binding or cross-runtime transport
compatibility.


Native model paths can also be used after existing block movement. Resolve the
child index from the current model, while retaining object IDs for identity.
See [insertion after moves](../guide/rust#insert-at-current-model-positions-after-moves)
for the complete two-peer Rust program and the remaining input boundaries.


The native model-path compiler now resolves derived text groups and dense grids,
including row/column identities and cell body paths. Inserting a paragraph at a
list-member gap can split that list wrapper into two groups. A table can be
nested in a cell only when the body schema declares table children; the original
Word/Presentation body rules do not add that permission automatically. See the
[complete Rust group/grid program](../guide/rust#insert-groups-grids-and-cell-contents-by-model-path)
and the [editing contract roadmap](./editing-contract).


The native [insert-only atomic batch](../guide/rust#insert-several-models-atomically)
compiles against one evolving model and shares column identities across rows.
Its optional result IDs and before/after clocks distinguish stored content,
normalized-empty requests and reserved tickets. Invalid later commands leave
pending changes, History, clock and model intact. The strict single-insertion
API keeps its existing input policy; general model commands remain separate.


For native ID-relative insertion, read an opaque local base with
`read_model_for_edit`, then use
[`insert_models_relative`](../guide/rust#insert-relative-to-stored-ids) for
before/after stored primary blocks or explicit root/stored-flow edges. The guard
rejects stale reads, and strict lookup rejects deleted/hidden/aliased/synthetic
targets. Direct row/cell tuples remain a separate typed API. This is native SDK
behavior, not distributed server acceptance or a production WASM binding.

The native typed grid API uses `{grid, row}` for row adjacency and
`{grid, row, column}` for cell-body edges. Read the same local base, then call
[`insert_grid_models_relative`](../guide/rust#address-rows-and-cell-bodies-with-stable-ids).
Axes must be live and belong to the current visible grid. Direct covered-cell
body targets reject; inserting a row inside a merge can produce covered cells
while retaining their payload and peer edits. Row payload width and overlapping
span precedence follow the existing numeric compiler. This API does not create
columns or provide a separate identity for a cell wrapper.

For one new column, use the native
[`insert_column_relative`](../guide/rust#insert-one-column-by-stable-ids) command.
It resolves one stable boundary, fills unique row payloads in caller order and
returns exactly one new column key. Empty payloads still create a column.
Existing merges can cover the new cells while preserving their contents.
A fresh local base is required for the next call.
