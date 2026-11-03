# Sparse sheet experiment

This private prototype stores only written cell fields. It reuses the public
`Clock`, `Ticket`, and `compareTicket` primitives from `@barocss/doc-sync`.
It does not extend `Schema`, `Client`, `DocHub`, or the document wire protocol.
It is not a published spreadsheet package or a complete Excel implementation.

```ts
import {SparseSheet} from "./src/sheet.ts";

const a = new SparseSheet({actor: "a", sheetId: "budget", rows: 1_048_576, columns: 16_384});
const b = new SparseSheet({actor: "b", sheetId: "budget", rows: 1_048_576, columns: 16_384});
const first = a.setCell(999_999, 16_000, {value: 42});
const second = b.setCell(999_999, 16_000, {fill: "#ffeedd"});
a.receive(second);
b.receive(first);
// Both cells contain {value: 42, fill: "#ffeedd"}.
```

Coordinates are zero based and fixed. The extent is two numbers. Blank axes and
blank cells have no objects. A cell has the stable logical identity
`[sheetId, row, column]`. Each field has its own LWW register, ordered by Lamport
ticket and actor. Concurrent first writes address the same register directly.
An explicit `null` clears a field. Its tombstone remains, so an older write cannot
restore a cleared value. Formula strings are stored without evaluation.

The supported fields are `value` (finite number, string, or boolean), `formula`,
`fill`, `numberFormat` (strings), and `bold` (boolean). Each accepts `null`.
`setCell` returns one ordinary operation for each explicitly supplied field.
`getCell` returns only nonnull fields. An untouched or cleared cell returns `{}`.

`getRange({row, column, rowCount, columnCount, limit?})` returns sparse
`{row, column, cell}` entries in coordinate order. It scans stored registers,
never all coordinates or a dense model. The default result limit is 10,000 cells.
Exceeding the limit throws; results are not silently truncated. Point reads use
five map lookups. The range cost is linear in stored field registers.

`receive(ops)` validates the complete batch before mutation. Exact retries are
idempotent. Reusing a ticket with different content fails, including for a losing
write. Each actor must have one writing replica. An unseen operation from the
local actor is rejected. Actor forks need a separate recovery protocol. Peers
must use the same sheet ID, extent, and field policy before exchanging operations.
Operations contain the sheet ID but do not negotiate an extent or policy version.

Undo and redo emit ordinary LWW writes. They change only fields whose current
stamp still equals the exact recorded state. Remote writes, including writes of
the same value, are preserved. Linked history states support consecutive local
undo and redo. A remote operation concurrent with an undo competes by the same
LWW order at every replica. No arrival dependent condition is sent on the wire.

`pendingChanges()` returns a copy. `acknowledge(ops)` accepts only an exact prefix
of that queue. There is no durable provider or server acknowledgement proof.
`captureState()` includes a versioned replay journal and a derived checkpoint.
`SparseSheet.fromState(state)` recomputes operations, winners, clock, pending, and
history, then checks the checkpoint. `restoreState(state)` installs the result
only after all validation passes, and requires the same actor, sheet, and extent.
Returned operations and snapshots are detached copies. Snapshots do not provide
cryptographic authentication. Retained operations, journal entries, and history
are unbounded and are not garbage collected. Storage grows with edits, not just
current nonblank cells. Capturing a checkpoint copies the full retained state;
restoring a checkpoint replays the full journal and checks the derived state.
Neither operation has constant cost as edit history grows.

`stats()` reports `registers`, `retainedOps`, `pending`, `undo`, `redo`, and `clock`.
The two history counts are entry counts, including entries whose fields were
subsequently changed by a remote writer.

Deferred work includes row and column insertion, deletion and movement; interval
axis identities; formulas and dependencies; merged cells; a viewport renderer;
durable synchronization; compaction; and integration with the shared document
engine. Such integration needs explicit coordinate register validation, snapshot
and history support, schema identity, and capability negotiation. The existing
dense document table and graphic object schemas do not establish these gates.

Run focused validation from the repository root with Node 22.18+ or Node 24:

```sh
node --test experiments/sparse-sheet/test/*.test.ts
node --expose-gc experiments/sparse-sheet/bench.mjs
node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck --verbatimModuleSyntax --erasableSyntaxOnly experiments/sparse-sheet/src/sheet.ts experiments/sparse-sheet/test/*.test.ts
```

The public package must already be built for the `@barocss/doc-sync` imports.
These commands test this private primitive. They do not test a browser editor,
the shared Client or server transport, or Excel compatibility.
