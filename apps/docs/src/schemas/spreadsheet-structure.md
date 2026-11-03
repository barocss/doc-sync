# Stable spreadsheet rows and columns

Use experimental `StructuralSheet` when a worksheet needs row or column edits.
It stores cells by immutable row and column IDs. Numeric coordinates describe
where those IDs are visible now; they are not cell identities.

`SparseSheet` keeps its fixed-axis contract and legacy formats. Selecting
`StructuralSheet` is explicit. It does not migrate a live fixed-axis session.
Both APIs remain separate from `Client` and `DocHub`.

## IDs and implicit intervals

An axis starts as one implicit interval. A million empty rows do not create a
million row objects. An ID contains `source` and `offset`: the initial interval
or a particular inserted interval, plus an offset inside it. Row and column
IDs have separate namespaces. Cell registers use the pair of IDs and a field.

Inserting or moving rows changes interval order. It does not rewrite cell
register keys. Splitting and combining interval records costs storage according
to structural work, rather than logical row count. Deleted IDs remain retained
for History, pending operations and anchored edits.

| Action | Visible order | Where the stored cell remains |
| --- | --- | --- |
| Initial | A, B, C | Row ID B, column ID X |
| Insert N before B | A, N, B, C | B/X, now at the next numeric row |
| Move B to the start | B, A, N, C | B/X, now at numeric row 0 |
| Delete B | A, N, C | B/X retained, hidden from coordinate reads |
| Undo own deletion | B, A, N, C | Same B/X and retained peer values |

A/B/C/N/X are readable labels in this table, not serialized ID strings.

## Use stable targets

<!-- structural-sheet-example -->
```ts
import {StructuralSheet} from "@barocss/doc-sync";

const options = {sheetId: "budget", rows: 1_000_000, columns: 16_384};
const alice = new StructuralSheet({...options, actor: "alice"});
const bob = new StructuralSheet({...options, actor: "bob"});
const row = alice.rowIdAt(5);
const column = alice.columnIdAt(2);
bob.receive(alice.setCellById(row, column, {value: 42}));
bob.receive(alice.insertRows(0, 1));
// row is still the same ID; it is now visible at index 6.
bob.receive(alice.moveRows(alice.rowIndexOf(row), 1, 0));
// destination is the index AFTER removal of the selected rows.
const position = bob.rowIndexOf(row); // 0
const cell = bob.getCellById(row, column); // {value: 42}
bob.receive(alice.undo());
// The move is undone; the inserted row and cell value remain.
```

Supply the same initial extent, sheet ID and optional `SpreadsheetSchema` on
each replica. Keep actor IDs unique. Operations bind to the schema identity
when a custom descriptor is supplied.

| API | Behavior |
| --- | --- |
| `rows`, `columns` | Current visible extent |
| `rowIdAt`, `columnIdAt` | Visible numeric index to immutable ID |
| `rowIndexOf`, `columnIndexOf` | ID to current index; -1 when hidden or absent |
| `getCell`, `getCellValue`, `getRange` | Read through current visible coordinates |
| `getCellById` | Read retained cell data, including hidden rows/columns |
| `setCellById` | Edit the selected IDs; rejects a locally hidden or missing target |
| `insertRows`, `insertColumns` | Insert an implicit interval before a visible index; append at the current length |
| `deleteRows`, `deleteColumns` | Hide exactly the observed IDs in the selected range |
| `moveRows`, `moveColumns` | Move exactly the observed IDs to an index in the remaining visible axis |

Indices are zero-based. For moves, a destination of 0 means the beginning;
`length - count` means the end after removal. Concurrent inserts that were not
part of the observed target range are not silently included in that range.

Deleting a row hides its cells. It does not erase another actor's field writes.
Accepted remote edits to a now-hidden ID remain retained. A local editor must
capture IDs when editing starts, then commit to those IDs. Re-resolving a stale
numeric coordinate can write to the wrong cell.

## Concurrent structure and History

Axis actions have the same Lamport-and-actor total ordering used by the cell
primitive. Replicas replay the immutable axis action set in that order over
compressed intervals. Late delivery rebuilds the axis projection. Moves extract
selected identities and place them before a stable anchor; a sequential replay
always has a valid sequence, including competing moves. An anchor inside the
move target is invalid.

An insert retains its interval even when undone, so later references still
have an identity. Its rows remain hidden while that insertion is inactive.
Structural undo and redo toggle only the originating actor's exact action.
Other actors' inserts, moves and deletes remain active. It does not restore a
whole old worksheet over their work.

Cell History keeps the existing exact-writer fence and linked compensation
rules. A peer's same-value write is still a distinct writer. Undo preserves it.
Cell and structural actions share one local history order and one logical clock.

The same set of accepted operations converges regardless of delivery order.
Identical retries are no-ops; a reused ticket with a different payload rejects.
Malformed mixed batches reject before changing the clock, model, pending queue
or History. Unseen earlier causal insertions can remain unresolved in client receive
until their births arrive. The demo server uses
`receive(ops, {requireKnownReferences: true})` consistently for fresh operations
and rejects unknown source references. This prevents an unresolved malformed
reference from blocking a later valid server operation. Strict mode does not
retroactively validate unresolved duplicates previously admitted in default
mode. Arbitrary invalid operation unions have no convergence guarantee.

Input previews now use a separate ephemeral [presence protocol](../guide/presence#spreadsheet-live-previews).
They follow the same stable IDs and do not change schema rules or cell History.

## State and limits

`captureState`, `fromState` and `restoreState` use the separate
`doc-sync-structural-sheet-v1` format. Journal replay validates the checkpoint,
History and exact pending operations. `acknowledge` requires an exact pending
prefix. Replay validates consistency, not storage authenticity.

Initial storage is independent of logical extent. Structural projection work
grows with retained actions and split intervals. Cell range reads scan retained
field registers. State capture/replay and History remain unbounded; there is
no GC, formula engine, structural-axis Rust parity or production resource budget.
No full Client, durable demo server or live schema transition is supplied.

## Run the structural demo

```sh
npm run dev:spreadsheet
```

Open a new room with `/?axes=stable&room=stable-example`. Custom field profiles
also work with `?axes=stable&profile=tasks&room=stable-tasks` or
`?axes=stable&profile=sensors&room=stable-sensors`.

The mode is chosen when the session starts. Mixed S1/S2 rooms reject mismatched
protocols before applying edits. Use a new room for a different mode or schema.
The demo remains memory-only: reconnecting a live actor is supported, but page
reload and server restart do not restore pending work.

## Verification and performance boundary

The final workspace run passes 1,509 tests with two expected platform skips.
Desktop Chrome passes 21 structural checks, six cancel/selection checks,
20 fixed-axis checks and 29 custom-profile checks on the same bundle.
Mobile checks are excluded from the current acceptance scope. Native selection borders
and remote range shading follow the stored IDs after insertion and movement.
During active native input, selection remapping waits for commit or cancel to
keep the actual input draft intact. A hidden target cannot commit to a neighbor.

Node diagnostics use fresh processes at initial extents 1,000, 1 million and
1 billion, with 0/25/100 structural actions. Each initial row/column axis has one
run and no cell registers. Post-GC heap deltas are 5,584–6,120 bytes and include
measurement noise. Point-edit p95 is 0.0404–0.0529 ms across those nine cases.
Capture p50 is 0.865–1.746 ms; replay p50 is 11.506–53.391 ms. Replay grows with
retained structural history and includes 120 retained point writes in these
fixtures. These are separate Node observations, not browser latency or a
production resource budget.

Chrome proof requests frames with screenshots before native view assertions.
It does not measure physical paint, GPU completion or editing latency. S2 view
projection and structural replay still need dedicated performance qualification.
The viewport remains bounded, and normal refresh performs zero whole-range
reads. No performance parity with native Rust or WASM is claimed.

See the [source-bound S2 report](https://github.com/barocss/doc-sync/blob/main/docs/reports/spreadsheet-s2-2026-11-03/README.md)
for raw results, failed attempts and exact source hashes.
