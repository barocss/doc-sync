# Typed model schema-value identity: dependency and design checkpoint (#22)

## Verified boundary

Published source a838eea has the flat root-flow/text/atom runtime-schema SDK.
It has no `SchemaValue`, `SchemaAttributes`, `insert_model_at`, or
`runtime_paragraph.rs`. The existing separate development checkpoint has those
APIs, but they are not independently published prerequisites. This report does
not import that checkpoint or claim a native implementation.

The prerequisite change set spans SDK `runtime_schema.rs` and exports,
shadow-engine `runtime_schema.rs`, reference-aware operations/history, and new
model compiler modules (`runtime_paragraph.rs`, `runtime_structure.rs`,
`runtime_batch.rs`, targeting/grid/column/catalog modules). It also depends on
field/required/composite support. Promote coherent tested slices separately;
do not copy one compiler file and assume its surrounding contracts exist.

## Proposed typed boundary (not an exported API)

Prefer a companion input that owns model JSON plus typed bindings to exact
attribute or run-mark slots. Each binding carries a schema-owned `SchemaValue`
handle and a typed destination (node path plus attribute/field path, or run
path plus value-mark name). Do not let callers supply arbitrary raw operation
paths, document IDs masquerading as value handles, or guessed source identity.

A first implementation should support only atomic node attributes and text-run
value marks. Field-leaf binding should reject until its register mapping has a
separate verified slice; the fixture plan below describes the broader acceptance,
not promised first-slice coverage.

Before compilation, validate every destination, source schema identity and
payload match. Reject duplicate, ancestor/descendant-overlapping, missing,
foreign-schema or unsupported bindings. Use tokenized paths, not dot splitting.
A handle clone retains its source identity. JSON cloning yields plain unbound
input and must not be upgraded to a schema reference by deep equality.

The compiler must carry bindings through canonicalization, default omission,
field flattening, span/run mark normalization, run coalescing and operation emission.
In particular, equal JSON marks from distinct sources must not be coalesced
unless their effective identity semantics also agree. Attach
reference descriptors before validation/commit; post-hoc value matching cannot
reliably distinguish two equal JSON sources. Preserve a single atomic transaction
and existing reserved-clock checks. If any binding cannot survive a supported
normalization, reject the entire command before document/history/pending mutation.
Do not silently drop a requested identity or broaden the plain-JSON API.

## Acceptance fixture plan

1. Two distinct composite default/enum sources with equal JSON: compare emitted
   descriptor source paths and writers, not just visible model values.
2. Explicit shared groups and nested field leaves: compare canonical source
   representatives; distinguish field paths from payload value paths.
3. Clone a schema handle versus clone its JSON: preserve identity only for the
   former, and test the documented plain-value fallback for the latter.
4. Invalid/duplicate/foreign binding late in a batch: identical checkpoint,
   document, pending queue, history and reservation state after rejection.
5. Undo/redo and own checkpoint restore: exact descriptors/writers retained;
   foreign edits remain preserved.
6. Independently author TypeScript and native actions over the same descriptor
   fixture. Do not create expected native results by copying native output.

All native execution, TS/native descriptor comparison and implementation tests
in this plan are NOT_RUN in this design checkpoint. No new API, runtime behavior,
WASM integration, production backend switch or long-duration load is claimed.

## Review

Independent read-only review confirmed prerequisite absence on published main
and the default-pruning/run-coalescing identity-loss hazards. No prerequisite
source was modified, executed or promoted. `git diff --check` passed; this is
a documentation-only checkpoint, so runtime tests are not claimed.
