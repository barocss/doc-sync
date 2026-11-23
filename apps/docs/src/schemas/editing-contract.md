# Editing contracts and test roadmap

A schema defines valid structure and values. Correct editing also needs command
semantics, stable identity, peer-change preservation, selective undo and an editor
mapping that represents the same model. Schema-valid output can still contain
the wrong text or lose another actor's intent.

## What the engine must preserve

- **Structure:** every accepted command produces the expected canonical model.
  Required, default and overflow children follow the declared rules.
- **Identity:** moving a stored object preserves its ID. A text-list `group` is a
  derived wrapper with no separate stored ID; a flow/container can have an ID and
  contain lists or tables.
- **Concurrency:** legal causal deliveries converge and exact retries do not
  duplicate content. Do not infer support for arbitrary delivery permutations.
- **Undo:** an actor's undo removes its own contribution and retains foreign
  text, field writers and placements, including content hidden by projection.
- **Recovery:** pending work and History retain their exact identities. Own
  checkpoint restore and durable server recovery are different qualifications.
- **Editor behavior:** normalization, selection and composition must agree with
  the command model. A backend result alone does not qualify a binding.

## Ordered roadmap

Each row separates delivered functions from the next acceptance check. The full
repository plan records dependencies and source evidence in
[schema-editing-roadmap.md](https://github.com/barocss/doc-sync/blob/main/docs/schema-editing-roadmap.md).

| Priority | Scope | Current boundary and next work |
| --- | --- | --- |
| Q1 | Group/grid model commands | Single insertion passes 22 profiles/481 actions; atomic insert batches pass 14/351; strict stored-ID/flow-edge targeting passes 14/390; typed row/cell targets pass 14/435. Explicit single-column creation and general D3 commands remain open. |
| Q2 | Generated schemas and histories | Six deterministic schemas and seed replay pass 19 TS checks plus native fixed-sequence comparison. Generated causal scheduling and validity-preserving failure reduction remain open. |
| Q3 | Combined structural editing | Test a stored flow/container containing lists and tables, lists in cells, moves plus peer edits, merge/split plus axis changes, and both undo orders. A derived text group cannot contain a table. |
| Q4 | Constraints and references | Expand required/max0/hidden-child, field-reset and reference-lifetime contracts. Keep schema-value handles separate from document object references. |
| Q5 | Schema changes while offline | Extend compatible transitions with old-schema pending work, active drafts, another transition, failed installation and selection restoration. |
| Q6 | Restart, retries and GC | Extend durable recovery and exact receipts with generation-bound reservations, hidden/deleted anchors and History pins. A local checkpoint does not close this gate. |
| Q7 | Desktop bindings and IME | Check normalization, text offsets, selections, import/paste and composition for each binding. Synthetic events and actual OS IME need separate results. |
| Q8 | Long-session budgets | Agree memory, latency and retention budgets; measure repeated edits, moves, undo, recovery, schema growth and disposal. Keep core and editor timings separate. |

The TypeScript engine already has bounded tests for many of these features.
General native commands, native sessions and protected recovery/GC, the full
CRDT WASM package and production WASM editor bindings remain separate delivery
gates. See the [Rust roadmap and API](../guide/rust).

Q1.3.1 provides strict native identity-relative insertion. A model index is current
position, not permanent identity. Read a local base, then target a current stored
primary block or an explicit root/stored-flow edge. Moves preserve the stored ID;
missing, deleted, hidden, covered, alias and synthetic targets reject. The base
uses local incarnation/revision checks, including lower-clock remote changes and
restore. It is not a server version or distributed acceptance guarantee. See the
[complete native example](../guide/rust#insert-relative-to-stored-ids).


The native typed grid API uses `{grid, row}` for row adjacency and
`{grid, row, column}` for cell-body edges. Read the same local base, then call
[`insert_grid_models_relative`](../guide/rust#address-rows-and-cell-bodies-with-stable-ids).
Axes must be live and belong to the current visible grid. Direct covered-cell
body targets reject; inserting a row inside a merge can produce covered cells
while retaining their payload and peer edits. Row payload width and overlapping
span precedence follow the existing numeric compiler. This API does not create
columns or provide a separate identity for a cell wrapper.

The native insert-only batch compiles each command against the evolving model
and commits once. A later error preserves the entire live checkpoint. Its result
has optional stored IDs, one aggregate Change and before/after clocks. A missing
requested ID does not imply no operations: a normalized-empty grid can cause
preparation or reserve a ticket. See the
[complete native batch example](../guide/rust#insert-several-models-atomically).

The detailed queue also tracks four specific contracts: host permission changes
after preparation (Q1.4), persistent annotation endpoints (Q3.1), typed
schema-value handles in model commands (Q4.1), and accepted edits when observers
throw or reenter (Q6.1). Existing TS authorization, annotations and callback
tests remain in place. Native APIs and combined acceptance evidence have their
own gates. Cursor clamping does not define where a persistent comment belongs.

## Current generated-schema checkpoint

The first Q2 generator varies node, mark and attribute names and four small grid
dimensions. A saved seed reproduces the schema, fixed insertion sequence, payload
and expected-model hash. Its current sequence inserts a text group, a grid and a
group in a cell body. It checks model closure, fixture isolation and descriptor
renaming with an independent model editor.

All six seeds also pass independent native authoring with a fixed two-actor
sequence: peer fields, selection, undo/redo, own checkpoint restore and exact
retry. They form six of the 22 Q1 comparison profiles; the remaining profiles
use original product schemas or explicitly labeled nested-table compositions.

This is a bounded generator and replayer. It does not yet generate every command
history, prove arbitrary schemas, or automatically shrink a failing schedule.
The next step adds two actors with legal causal schedules, distinct convergence
and intent properties, then a reducer that keeps the schema and failure valid.

## Model edits and normalization

Some command results depend on stable anchors, not only numeric tree attributes.
For example, a merge ending at an existing row ID grows when another row is
inserted inside that range. The projected `rowspan` changes without rewriting
the original merge owner.

In the bounded native Document path, a selection in a directly covered cell
body retains its raw text anchors and resolves visually to the merged cell's
top-left position. Splitting the cell restores the text offsets. Descendant
flows inside hidden cells are outside that native selection subset. Persistent
annotations need their own hidden-endpoint policy; cursor clamping is not that
policy.

An adapter that uses the TS model editor must request `{normalize: true}` or
register an edit listener, then apply the returned reconciliation edits after
its local command. An empty `normalize` array without that request is not proof
that no adjustment was needed. Tests must also derive the expected anchor rule
independently; applying corrections from the actual engine alone can hide a
shared mistake. See the [normalization contract](../reference/edit-api#child-counts).

## Merge granularity is part of the contract

Choose what users need to edit independently. A whole JSON value, declared field
leaves, text characters and common Map/List entries have different merge units.
Declaring an array-valued attribute does not by itself request per-element
collaboration. Stable references and deletion/restoration behavior must also be
defined when a schema node points to another object or collection.

## How to assess a new schema

Start with executable examples, not only schema validation. Verify each intended
command, invalid input, canonical default, ID/reference and normalization rule.
Then combine those commands under concurrent delivery, undo and own checkpoint
restore. Keep visible output and retained content checks separate.

Property-based command tests need valid preconditions and a small independent
model; copying the implementation into the expected result can preserve a shared
bug. This is the test-design approach described by
[fast-check's model-based testing guide](https://fast-check.dev/docs/advanced/model-based-testing/).
Editor schemas also determine defaults and allowed sequences, so each binding's
normalization requires separate checks; see the
[ProseMirror schema guide](https://prosemirror.net/docs/guide/).

See [document rules](../guide/document-rules) for the existing collaboration
contract and [custom schema mappings](./custom) for editor-specific declarations.

For one new column, use the native
[`insert_column_relative`](../guide/rust#insert-one-column-by-stable-ids) command.
It resolves one stable boundary, fills unique row payloads in caller order and
returns exactly one new column key. Empty payloads still create a column.
Existing merges can cover the new cells while preserving their contents.
A fresh local base is required for the next call.
