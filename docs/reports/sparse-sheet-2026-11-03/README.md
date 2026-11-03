# Schema navigation and sparse sheet foundation

Base HEAD is `d624a56d7ea5389fd9f67d1277637838bb343475`. This candidate
preserves inherited uncommitted package, schema-domain and PixiJS work. It adds
schema navigation, explicit Rust/WASM graphic limits, and an independent sparse
sheet experiment. No commit, push, npm publish, or hosted deployment occurred.

## Research and decision

The existing document grid expands every row/column pair in JSON. A virtual
renderer cannot remove that model allocation. Graphic containers alone are not
a cell-keyed CRDT: two actors inserting into the same empty coordinate could
create different object IDs. A sparse sheet needs coordinate-keyed registers
and an implicit axis model before a renderer.

HyperFormula's [official performance guide](https://hyperformula.handsontable.com/docs/guide/performance.html#address-mapping-strategies)
distinguishes sparse and dense address mapping. [Y.Map's API](https://docs.yjs.dev/api/shared-types/y.map)
provides keyed shared entries. These sources inform the representation choice;
neither library was added as a dependency, and no behavioral parity is claimed.

`experiments/sparse-sheet/src/sheet.ts` implements a private fixed-axis primitive
using the public Clock/Ticket ordering helpers. It does not extend public
`Schema`, `Client`, `DocHub`, transport, protocol, or the production CRDT engine.
The public domain union remains document/graphic. Existing production source
remains identical to the preceding graphic checkpoint.

## S1 implementation and proof

Extent is two safe integer counts; no row, column or blank-cell arrays exist.
Canonical tuple keys address sheet/row/column/field. Value, formula, fill, bold,
and numberFormat are independent LWW registers. Null is a retained reset.
Concurrent first writes use the same register and deterministic ticket/actor
ordering. Exact duplicate delivery changes no state; conflicting payloads for
one ticket reject the entire batch, including losing operations. Same-actor
forks are unsupported and rejected on unseen local-actor operations.

Undo and redo check exact writer stamps. Linked state references permit repeated
undo/redo and preserve observed peer writes, including same-value writes.
Compensation is an ordinary LWW write; an unseen concurrent peer write competes
by ticket order, not a receiver-arrival guard. This is tested prototype behavior,
not proof of complete public History/conditional/recovery parity.

The pending queue accepts only exact-prefix acknowledgement. A versioned state
contains a replay journal and derived clock/register/ledger/pending/history
checkpoint. Restore rebuilds the candidate and checks all values before swapping
live state. Source snapshots must still be trusted; this is not authentication.
Each peer must pre-agree sheet ID, extent, and field policy. No server negotiates
them. Restored actor ownership must remain exclusive.

| Check | Result | Boundary |
| --- | --- | --- |
| Sparse tests | 18/18 PASS | Huge blank extent, far cells, first-write ties, field merge, shuffled/repeated delivery, collisions, partial peer-fenced undo, consecutive undo/redo, clear tombstones, invalid batch/state atomicity, bounded sparse reads, exact ack, restart/pending replay, three-replica independent ticket oracle. |
| Sparse strict TypeScript | PASS | Source and independent tests, NodeNext strict, verbatim and erasable syntax. Experiments are outside root tsc. |
| Benchmark correctness | 4/4 PASS | Empty/extremely large logical extent and 4/1,000/10,000 written cells; restored and duplicate-replayed models equal. No timing thresholds. |
| Docs tests | 40/40 PASS | Real VitePress sidebar/active routing and executable private sheet example. |
| Docs production build | 50 pages / 2,255 internal links PASS | English and local-path checks. |
| Chrome docs smoke | Seven checks PASS | Five built routes with correct active category and Document/Graphic/Spreadsheet content order; 390px sparse page without horizontal overflow; zero page/console errors. Not a spreadsheet editor proof. |
| Native Rust SDK | 13/13 PASS | Fresh isolated target/toolchain; fixed document SDK only, not graphic or spreadsheet parity. |

The preceding full production workspace result is unchanged-source historical
evidence: 1,419 PASS and two platform SKIPs in the graphic report. It was not
rerun as a new spreadsheet integration test. New experiments run explicitly,
and the final docs checks run separately.

## Sparse allocation and observed costs

Node 24.22.1, darwin arm64, Apple M3 Max. One sample per scenario. Explicit GC
heap deltas are noisy; JSON checkpoint bytes and heap bytes are different.

| Logical extent | Written cells | Empty JSON bytes | Written JSON bytes | 10,000 point reads ms | Heap delta after writes bytes |
| --- | --- | --- | --- | --- | --- |
| 100 × 100 | 4 | 241 | 2,880 | 10.10 | 28,224 |
| 1,000,000,000 × 1,000,000 | 4 | 251 | 2,940 | 9.66 | -613,424 |
| 1,000,000,000 × 1,000,000 | 1,000 | 250 | 693,799 | 12.49 | 1,813,816 |
| 1,000,000,000 × 1,000,000 | 10,000 | 251 | 7,204,800 | 18.98 | 17,997,992 |

Empty checkpoint differences reflect names and numeric text, not axis objects.
The negative small-case heap delta is measurement noise, not negative memory
usage. At 10k writes, capture is 58.59 ms and a full sparse range is 8.06 ms in
this observation. Point queries use five Map reads. Range queries scan retained
registers and limit output cells; they are not viewport-indexed. Journal, ledger,
tombstones and History remain unbounded. Capture copies full state; restore
replays all journal actions. No performance speedup or production memory budget
is qualified. Raw values and source hashes are archived.

## Documentation and engine boundaries

Schemas now has its own top navigation and sidebar. Existing schema URLs remain
valid. The overview distinguishes the minimal graphic fixture from the complete
PixiJS canvas schema. The Rust guide contains an engine support matrix and
explicitly distinguishes its document `Shapes` preset from GraphicSchema.
The private Cargo SDK has no runtime graphic schema or browser adapter; WASM is
storage-only and has no full document Client factory. The TS graphic demo retains
its measured 5k client p50 649.7 ms and convergence p50 1,570.3 ms. Those timings
are not sparse-sheet measurements, and Rust has no matched canvas result.

Initial Rust commands found a non-rustup Homebrew cargo and compiler/cache
version mismatch. Explicit stable rustc/rustdoc/cargo with a new target directory
passed without source changes or deleting prior targets. The failed logs remain
in the receipt set. No WASM or full Rust differential corpus was rerun.

## Delivery queue and execution

S1 is the private primitive proved above. S2 adds interval axes and stable row/
column identities with insert/delete/move; S3 integrates SpreadsheetSchema,
Client, schema identity and wire plus full History parity; S4 adds formula
references/dependency calculation; S5 adds virtual UI/HTTP/recovery and Chrome
product evidence; S6 adds Rust/WASM parity and production gates. No axis edits,
formula evaluation, XLSX handling, browser spreadsheet, HTTP adapter, durable
provider or GC is implemented here.

```sh
npm run build
node --test experiments/sparse-sheet/test/*.test.ts
node --expose-gc experiments/sparse-sheet/bench.mjs
npm test --workspace @doc-sync/docs
npm run docs:build
npm run docs:check
```

`validation.json` records compressed receipts and hashes. `source-seal.json`
records this checkpoint; older graphic/schema report seals are immutable.

The built docs preview is `http://127.0.0.1:62051/doc-sync/schemas/` (owned
session 11214). The existing docs dev server at port 5415 remains unchanged.
The owned headless docs browser was closed. Its first harness wait used an
incorrect heading and timed out; the corrected final navigation proof passes.
All user browser tabs and existing demo services are preserved.

Final sealing found a reserved-actor validation edit after the first sparse
benchmark. The initial raw benchmark is retained separately. Source was frozen;
tests, strict types and all four benchmark correctness cases were rerun on the
final hash. Tables above use that final run. This is not an optimization claim.

Schema navigation and overview content now follow Document → Graphic →
Spreadsheet. The final Chrome smoke includes all five routes, section order and
mobile layout. A first order assertion included VitePress's invisible permalink
character; the corrected assertion removes that character. Both harness failure
records are retained separately from the final PASS.
