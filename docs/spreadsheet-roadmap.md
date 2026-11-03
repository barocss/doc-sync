# Spreadsheet delivery roadmap

This queue preserves the S1–S6 stages from the schema guide. Each stage has an
explicit acceptance gate. An early S5a browser example can run before axis edits
and public Client integration, but it does not close S2, S3 or all of S5.

## Current foundations

- TypeScript S1: experimental public core `SparseSheet`, local selective History,
  exact pending retries and validated state. The old experiment path re-exports it.
- Native Rust S1: independent typed SparseSheet API, with authored-operation,
  model, history and checkpoint comparisons against TypeScript.
- TypeScript S2: opt-in StructuralSheet with implicit interval axes, stable
  row/column IDs, insert/delete/move, own-action structural undo/redo, exact
  cell-writer fences and schema-bound replay state. Native S2 remains open.
- The production document grid remains a dense document-table projection.
- Public tree Schema still has document and graphic domains. A separate public
  experimental SpreadsheetSchema supports constrained custom fields, canonical
  identity and schema-bound operations/checkpoints. Client/DocHub integration
  and live schema transitions remain open.

## Ordered stages and gates

| Stage | Delivery | Acceptance gate |
| --- | --- | --- |
| S1 | Fixed implicit extent and sparse coordinate/field registers | No allocation proportional to logical rows × columns; concurrent first writes, per-field merge, exact retry, collision rejection, selective linked undo/redo, snapshot/pending validation. |
| S2 | Interval axes and stable row/column identities | Sparse initial runs; insert/delete/move with deterministic concurrent boundaries; cells retain identity under reindexing; axis undo preserves peer edits; checked conversion between visible coordinates and stable IDs. |
| S3 | Common schema, engine and Client integration | Runtime SpreadsheetSchema admission, schema identity and version transition, shared engine factory and host contract, transport capability negotiation, server validation and exact acceptance receipts; TS mixed-domain regressions remain passing. |
| S4 | Formula model and calculation | Parsed references bind to stable axes/cells; copy and move differ explicitly; dependency updates, range references, cycles, errors and deterministic recomputation pass independent tests. No expression eval of arbitrary JavaScript. |
| S5 | Virtual UI, transport and recovery | Bounded viewport; real peer input/selection/history/reconnect; model/render agreement; durable accepted changes and unconfirmed exact retry after process/server failure; browser performance and memory budgets. |
| S6 | Native Rust/WASM parity and production qualification | Matching schema/operation/checkpoint contracts; TS/TS, TS/WASM and WASM/WASM peer corpus; resource lifetimes; backend selection through the same binding; packaging, upgrade and operational gates. |

S2 has a TypeScript core and opt-in browser route. Its structural replay cost
tracks retained actions/runs; this is not a native or production resource gate.
S3 is the next common-client priority and remains partial: custom schema admission
and schema-bound operations are implemented; shared Client, protocol and
transition integration remain open. Formula strings in S1 do not close
S4. An in-memory demo with live reconnect does not close S5 durability.

## S5a: early collaborative example

Use a third-party grid as a view and input adapter; the sparse model remains
authoritative. The selected example uses VTable in a private demo workspace.
Only a bounded window is materialized for the widget. Jumping to a far cell does
not allocate all intermediate rows or cells. Sorting, row movement and formula
calculation are not silently delegated to a conflicting second data model.

The example must use two independent actors, histories and actual HTTP/SSE
connections. It must verify concurrent first writes and separate fields,
observed foreign same-value undo fences, exact request retry, disconnected
pending work, presence ranges and a separate server-model oracle. Epoch or
schema mismatch must preserve local pending state and block unsafe submission.

The server's storage boundary must be visible. If memory-only, state disappears
with its process and there is no reload/restart recovery claim. Credentials,
user-owned document storage and existing preview services must remain isolated.

## Rust domain support

Document retains its six fixed presets and adds a limited runtime flat-flow
API. Graphic runtime schemas support container/text/atom, separate from the
pinned Canvas/Builtins APIs. RuntimeSheet owns arbitrary constrained scalar
fields. These APIs do not create a complete WASM Client factory or prove full
arbitrary document schema support. Native live schema transition remains open.
Each parity report must identify whether it compares exact operations, normalized
models, History, checkpoints or actual cross-runtime wire exchange.

## Remaining resource work

S1 retains operation IDs, clears, History and a replay journal. Storage therefore
grows with edit history. Compaction requires proved acknowledgement/retention
frontiers and must preserve retry collision checks and undo ownership. Range
reads currently scan retained field registers; a viewport index is a separate
optimization. Measure retained heap, capture/restore, network and visible UI
latency separately. Do not substitute JSON bytes for heap usage.


## Measured S5a optimization

The demo's initial per-batch whole-state copy/replay was removed after a
matched backend A–B–B–A comparison. At10k stored cells, peer convergence p95
changed from285.9–287.0ms to33.7–33.8ms under the same UI bundle. A second phase
removed whole-range reads from view status; final p95 was26.8ms. Atomic batch,
identity collision, retry, pending and epoch tests remain passing. These are
local observations with separate source/bundle receipts, not a production
resource budget. Initial join, explicit capture/export/range reads and retained
history still scale with stored work. S2 TypeScript structure and S3 shared Client delivery remain separate gates.

## S2 structural contract

StructuralSheet stores cells by immutable row/column ID pairs. Initial axes are
one implicit run. Inserts create another run; moves reorder captured identity
spans, and deletes hide them. Numeric move destinations are measured after
removal. Axis actions replay in Ticket order, including late delivery. Own
structural undo toggles only that actor's original action; cell undo preserves
the existing exact writer fence and linked compensation behavior.

The dedicated S2 operation/state format is opt-in. No live S1 conversion or
native-axis parity is claimed. Client receive supports unresolved earlier causal
references for out-of-order delivery. The demo server uses strict known-source
admission consistently from room creation and rejects malformed cross-axis or
non-birth references before mutation.

The new route is ?axes=stable in a fresh room. Native and inspector input bind
to IDs at edit start; a deleted target cannot redirect a draft into a neighbor.
See [the API guide](../apps/docs/src/schemas/spreadsheet-structure.md) and
[the S2 report](reports/spreadsheet-s2-2026-11-03/README.md).
