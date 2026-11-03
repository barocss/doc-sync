# Sparse spreadsheets

**EXPERIMENTAL.** `@barocss/doc-sync` exports `SpreadsheetSchema` and
`SparseSheet` as an independent fixed-axis sparse cell API. `Schema` remains
the document/graphic tree union. The sheet API has no `Client`, `DocHub` or
public sync transport backend. The old experiment source path re-exports the
same implementation. See [custom fields and editor mappings](./custom#spreadsheet-fields).

## Why a separate model

The existing document `grid` model expands all rows and cells into dense JSON.
An N-row, M-column table therefore produces N × M cells when the model is read.
A virtual renderer alone cannot remove that allocation. Keep document tables
for bounded document content. See [document tables and sparse sheets](../guide/schema#document-tables-and-sparse-sheets).

The experimental primitive defines a fixed numeric row count and column count.
These axes are implicit. It stores only cells with writes and their retained
metadata. A blank sheet does not allocate N rows, M columns or N × M cells.
Reading an empty coordinate does not create stored state. Sparse storage still
grows with writes, tombstones and retained history.

## Cell and merge design

A cell address is a numeric row and column within the fixed extent. Each cell
field has an independent register:

| Field | Purpose |
| --- | --- |
| `value` | Literal cell content |
| `formula` | Formula source text; no evaluation |
| `fill` | Cell fill attribute |
| `bold` | Cell text emphasis attribute |
| `numberFormat` | Stored number-format text; no formatting engine |

Registers use the same Lamport ordering: compare the logical clock, then the
actor ID to break a tie. Concurrent first writes to the same coordinate target
the same cell. Writes to separate fields merge. Competing writes to one field
select one deterministic winner, regardless of delivery order. Clearing a field
retains the metadata needed to reject an older write.

This is a coordinate-and-field model. It does not insert a whole independent
cell object for each peer's first write. The primitive does not preserve an
address through row or column edits, because it does not implement axis edits.

## History and restart

Local undo checks the exact current writer of each field. An equal value
from a peer is still a different write. Undo preserves that peer write.
Sequential local history links each action to the compensation write produced
by an earlier undo or redo. This permits repeated undo and redo while retaining
the writer check for each field.

Snapshot restore retains cell registers, the logical clock, local history,
and pending operations. A retry sends the exact saved pending operations.
Duplicate delivery preserves the same result. Pending acknowledgement must
match an exact prefix. These are primitive-level behaviors. They do not
establish parity with public conditional History, HTTP recovery or server
persistence.

## Run the sparse API example

Use Node.js 24 from the built repository root. The five npm packages remain
private and unpublished. Run `npm ci && npm run build` first. Give each live actor a unique
ID. Configure the same `sheetId` and extent manually on every replica; operations
do not negotiate the extent.

<!-- sparse-sheet-example -->
```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {SparseSheet} from '@barocss/doc-sync';

const options = {sheetId: 'example-sheet', rows: 1_000_000, columns: 16_384};
const a = new SparseSheet({...options, actor: 'a'});
const b = new SparseSheet({...options, actor: 'b'});
const valueOps = a.setCell(999_999, 16_383, {value: 42});
const fillOps = b.setCell(999_999, 16_383, {fill: '#FFEEAA'});
a.receive([...valueOps, ...fillOps]);
b.receive([...fillOps, ...valueOps]);
assert.deepEqual(a.getCell(999_999, 16_383), {value: 42, fill: '#FFEEAA'});
assert.deepEqual(b.getCell(999_999, 16_383), a.getCell(999_999, 16_383));

const saved = JSON.parse(JSON.stringify(a.captureState()));
const restored = SparseSheet.fromState(saved);
assert.deepEqual(restored.captureState(), saved);
const retry = restored.pendingChanges();
assert.deepEqual(retry, valueOps);
const beforeRetry = b.captureState();
b.receive(retry);
b.receive(retry);
assert.deepEqual(b.captureState(), beforeRetry);
restored.acknowledge(retry);
assert.deepEqual(restored.pendingChanges(), []);
console.log('Sparse sheet example passed');
JS
```

`fromState` validates a snapshot by replaying its journal and checking the
checkpoint. Use trusted snapshots. Validation does not authenticate their
origin. A restored actor continues the saved actor identity; do not keep the
original and restored actor active at the same time.

Retained operations, journal entries, tombstones and local history are
unbounded. There is no garbage collection. Capture copies retained state, and
restore replays the journal. Both costs grow with retained work. Range reads
scan the stored registers and limit the number of returned cells; they are not
a spatial index. This primitive does not establish a production resource limit.

## Run the collaborative grid demo

The private demo connects the sparse primitive to an external grid library,
VisActor VTable. It runs two independent actors through HTTP/SSE. It reads a
100 × 26 window from a fixed logical extent of 1,048,576 rows and 16,384
columns. **Window** accepts an address such as `XFD1048500`. The adapter allocates
only its bounded view records; it does not create a dense model of the entire sheet.

From the repository root with Node.js 24:

```sh
npm ci
npm run dev:spreadsheet
```

Open the loopback address printed by the server. The default port is 5422.
Choose the data schema once when opening a new room:

- `/?profile=tasks&room=task-example`: title, numeric progress and archived flag.
- `/?profile=sensors&room=sensor-example`: numeric reading and C/F unit.
- `/?room=default-example`: the original five-field API.

The native cell editor writes the profile's primary field. Its typed inspector
edits the remaining fields. Data descriptors and their identities are checked
at join; a different profile cannot open an existing room under another schema.
Pending local edits remain available after rejection. Do not switch a live
session's profile by reloading; the demo has no browser persistence.
Use the two peer views to edit separate cell fields, hold incoming changes for
controlled concurrent edits, undo local changes, and reconnect a live client.
The demo uses a private sheet protocol. It does not use public `Client` or
provide a public spreadsheet transport API.

Rooms remain in server memory. Server restart durability, structural axis edits,
formula evaluation and production recovery are not provided. The grid demo is
an early **S5a** lane beside S2 and S3. It does not complete stable row/column
identity, public schema/Client integration or the full S5 recovery gate.
See the [spreadsheet roadmap](https://github.com/barocss/doc-sync/blob/main/docs/spreadsheet-roadmap.md).

Final Chrome checks pass 21/21 for the scoped demo. Backend-only A–B–B–A
comparison reduces the 10,000-cell peer convergence p95 from 285.9–287.0 ms to
33.7–33.8 ms. Removing the view's full status range scan separately gives a
final p95 of 26.8 ms. No normal refresh reads the full sparse range. This is
local measured evidence, not a production latency or 100,000-populated-cell gate.
See [measurement boundaries](../performance#collaborative-spreadsheet-grid).
The demo's 20,000-operation room cap is a test bound, not a production budget.


## Native Rust primitive

The private Cargo SDK also exports `SparseSheet`, `SparseSheetOptions`, typed
cell fields and checkpoint APIs. Its fixed-axis S1 comparison covers 31 actions
and 62 states with exact operations, models, full History, pending queues and
checkpoints. See the [Rust example](../guide/rust#native-sparse-sheet-example).
This is not a WASM engine or public spreadsheet Client implementation.

## Research basis

[HyperFormula documents dense and sparse address mapping policies](https://hyperformula.handsontable.com/docs/guide/performance.html#address-mapping-strategies).
Its sparse policy is intended for relatively few filled cells that can be far
apart. This supports separating logical sheet extent from allocated cell
records. It does not establish this experiment's performance or formula support.

[Y.Map provides keyed shared entries](https://docs.yjs.dev/api/shared-types/y.map).
It is a reference for the idea of a coordinate-addressed map. This experiment
does not depend on Yjs and does not claim its behavior, update format or history
parity. The field-register and history contracts above require their own tests.

## Delivery stages

| Stage | Scope |
| --- | --- |
| S1 | Private sparse primitive: implicit fixed numeric axes, field registers, bounded sparse reads, local history, snapshots and exact pending retries. |
| S2 | Interval-based axes with stable row and column IDs, plus insert, delete and move operations. |
| S3 | Runtime `SpreadsheetSchema` and schema-bound operations are available; shared `Client`, protocol, transitions and conditional History integration remain open. |
| S4 | Formula references, dependency tracking and calculation. |
| S5 | Virtual UI renderer and binding, HTTP sync and recovery, plus Chrome product checks. |
| S6 | Rust/WASM parity and production qualification. |

S1 has TypeScript and native Rust implementations. The experimental public
TypeScript API adds runtime custom fields, constraints and schema-bound state. S5a adds
the private HTTP/SSE VTable demo above. S2, S3 and the complete S4–S6 gates remain
open. S1 does not provide row or column edits, formula evaluation, XLSX import
or export, public renderer bindings or production server adapters. It is not production-ready. The existing
[graphic editor checks](../guide/graphic-editor) and
[performance reports](../performance) do not qualify this spreadsheet primitive.
