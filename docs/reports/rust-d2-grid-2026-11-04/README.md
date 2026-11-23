# Runtime nested Document grid schemas

Status: **PASS for the declared native runtime grid slice. Full D2 and the
D3 model-position compiler remain open.** The base is `1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus the
inherited uncommitted recursive-flow work. This task archived that actual
61-file worktree baseline before changes; Git HEAD alone is not its source
identity. Earlier sealed reports remain unchanged.

## Supported contract

Runtime Document descriptors support `grid → row → cell → flow` chains inside
recursive flow/text/atom documents. Type names come from each descriptor, not
preset names. Different chains can coexist in one schema. Cell bodies can
contain another grid with a different row/cell/body chain and text default.

Grid and cell scalar attributes, Boolean text marks, stable row/column IDs,
cell text/blocks, merge/split, hidden content, block moves, nested selection,
selective History and coupled checkpoints use the existing CRDT rules.
`col` remains an internal reserved axis type. The cell's address combines the
grid key, row key and column key. The body has its own physical flow head.

Standard computed cell metadata accepts `colspan`/`rowspan` descriptors with
`default: 1`, `computed: true` and optional `min: 1`, and `spanned` with
`default: false`, `computed: true`. These are derived span properties, not
writable user registers. Arbitrary computed attributes remain unsupported.

Nonempty attributes on model-only rows and cell-body flows reject at schema
compilation. Axis moves, groups, inline/span, value marks, structured Document
attributes, cardinality and full product descriptors remain outside this slice.
Row/column insertion and deletion are distinct from the unimplemented axis-move
operation. A Document table projects dense row × column model JSON; sparse
worksheets use the separate Spreadsheet API.

## SDK

`insert_grid_at` creates the grid and both axes in one History transaction.
`insert_grid_row` and `insert_grid_column` add stable axis IDs; `delete` removes
axes using their IDs. Cell helpers include `cell_head`, `insert_cell_text`,
`insert_cell_block`, `set_cell_attribute`, `merge_cells`, `split_cell` and
`reparent_block_to_cell`. `grid_rows_head` and `grid_columns_head` expose stable
physical sequence heads.

The API addresses physical source tokens. It does not compile every TS
`EditOp` model position or create all trailing model boundaries. Existing
physical source addresses do not follow a moved block into its projected
position. Stable cell IDs still identify the same cell after structural edits.
Dimension arithmetic and remaining clock space are checked before axis
allocation. Overflow rejects without a partial edit.

A real SDK defect rejected a valid default paragraph head as a move anchor
because it used the Graphic placement lookup. The repair accepts only an
existing physical Document line head and keeps Graphic behavior unchanged.
A separate initial driver error supplied a character ID where the block-anchor
contract required a paragraph marker; that mapping was corrected in the driver.
These are separate findings, not a reason to widen the public contract to
arbitrary character anchors.

See the [SDK README](../../../experiments/rust-sdk/README.md),
[Rust guide](../../../apps/docs/src/guide/rust.md) and
[Document schema guide](../../../apps/docs/src/schemas/document.md).

## Native regression

| Check | Result |
| --- | --- |
| Archived pre-extension grid descriptor | UnsupportedSchema rejection; new core tests initially fail 4/4 |
| New core grid suite | 7 PASS |
| Full core suite | 96 PASS, zero FAIL |
| New SDK grid suite | 5 PASS |
| Full SDK suite | 60 PASS, zero FAIL |

The focused suites include independently named chains/defaults, nested tables,
concurrent axis and cell edits, row deletion/undo retaining foreign text,
covered-cell text after merge/split, selection restoration, duplicate pending
replay, exact acknowledgement and invalid schema/operation/checkpoint rejection.
Full runs initially caught two obsolete negative-test assertions that expected
all grids to be unsupported. Those assertions now check the malformed chain
or obsolete flow default; group/inline/span rejection remains. The original
failed runs are retained.

## Independent TypeScript/native comparison

Two renamed descriptors each contain two different grid chains and different
cell-body defaults/allowed children. Independently authored native SDK commands
and TS `Doc.edit` + `History` match **180 actions / 360 actor states**. Coverage
includes same/distinct-cell concurrency, concurrent axis insertion/deletion,
cell attributes and marks, merge/split with foreign edits to a covered cell,
grid movement, fenced undo/redo, duplicate pending replay and acknowledgement.
The corpus has eight coupled checkpoints and two UTF-16 selection captures.

Typed operation IDs, raw full History references and availability, typed
pending/carets, models, clocks, material token order, registers/writer IDs,
deletion/cancellation ledgers and moves are compared. Models use UTF-16 units
and explicit empty/default collections; typed text/string operation encoding
and omitted optional fields have declared format projections.

Unwritten sole-head derived text/fragment lines may be omitted only when they
have no attributes, deletion/cancellation entries or History/pending/move
references. Ordinary flow, axis and cell lines are retained. Native raw DTOs
report `born: "paragraph"` on axis root heads; TS has no default text type for
axis lines. The comparison maps this one axis-head field to empty. The core
source review confirms that it is a DTO fallback: the actual head has no node
birth, axis validation excludes text/attribute writes, and History and journal
checkpoints do not use that displayed field. All other axis fields and hidden
cell content remain in the comparison. Raw traces and the first mismatch are
preserved; History references are never normalized away.

Fresh earlier-slice regression also passes: recursive-flow authoring **162
actions / 324 states**, and the legacy six runtime profiles **82 actions /
164 states**. These are separate corpora, not additional coverage of the new
grid-specific commands.

### Targeted schema rejection

The final corpus includes **12 independent negative descriptors**, asserting
both rejection path and reason. Eight are valid TS descriptors outside the
native subset. Four deliberately isolate malformed chain/reference, reserved
axis-name or span-shape cases. Span's value-mark dependency is tested separately
from the isolated unsupported node shape. This distinguishes prerequisite
rejection from the shape rejection itself.

An earlier copied negative list omitted required `marks`; those cases could
fail before the named rule was reached. Its rule-specific coverage is withdrawn
in `negative-coverage-gap.json`, with the earlier receipt retained. The final
list has its own valid base descriptors and no name-based filtering. The
180-action positive corpus has the same hash before and after this verification
repair, and all four fresh comparison stages pass with frozen source hashes.

## Observed D3 limit

A separate probe inserts an atom at the model position after a moved nested
grid. TS authors `Node + Move`; the native physical-source helper rejects the
anchor because it belongs to another source flow. The receipt is
**OBSERVED_D3_GAP**, not NOT_RUN. The failed probe does not enter the positive
180-action PASS and is not suppressed by a format projection.

`insert_grid_at` also documents that it does not compile the trailing default
model block when inserting into every possible empty flow. The qualified
corpus creates its grids after authored text. A complete current-model-position
EditOp compiler remains D3 work. This slice does not close the earlier observed
post-move insertion gap in the recursive-flow report.

## Documentation and workspace

The SDK README and Rust guide contain the same complete two-chain, two-actor
Cargo consumer example. It compiles and runs after extraction, with all 49
native source/manifest hashes unchanged. It checks foreign text through
undo/redo, retained covered-cell content, split visibility, parsed checkpoint
input, pending replay and acknowledgement. An initial example assertion that
confused hidden display content with raw model nodes is preserved as a failed
log; the final example explicitly checks both visibility and retained content.

Final sequential workspace test: **2,110 cases / 2,108 PASS / zero FAIL / two
expected platform SKIPs / zero cancelled**, 124.462 seconds. Production TS,
server, MCP and binding sources are unchanged by this grid work. Documentation
build passes in 14.262 seconds; the link check passes 55 pages and 2,611 internal
links, with English content and local checkout paths excluded (0.557 seconds).
See [final check summary](final-checks.json).

## Proof boundary

Native snapshots retain an accepted operation journal; TS snapshots retain
material token lines. Exact checkpoint restoration is checked within each
runtime. Native schema support does not establish cross-runtime snapshot/wire
compatibility, a production server, durable transport/GC recovery, live schema
transition, a shared native Map/List facade or a CRDT WASM Client factory.
No browser, mobile, performance, registry release, commit or push is part of
this task.

## Evidence and reproduction

Use Node 24, Cargo dependencies and new output/Cargo target directories.
The grid and flow comparison drivers currently call `/opt/homebrew/bin/cargo`;
the recorded executions use macOS/Homebrew Cargo 1.87. The legacy driver selects
the local rustup toolchain. Other host layouts need a driver-path adjustment. The inherited nested driver gains
an optional `NESTED_TARGET` override, preserving its old default. The legacy
driver already has the equivalent runtime-schema target override.

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
GRID_OUT=output/my-grid GRID_TARGET=output/my-grid-target node experiments/runtime-document-grid/compare.mjs
NESTED_OUT=output/my-flow NESTED_TARGET=output/my-flow-target node experiments/runtime-document-nested/compare.mjs
RUNTIME_SCHEMA_OUT=output/my-runtime RUNTIME_SCHEMA_TARGET=output/my-runtime-target node experiments/runtime-schema-native/compare.mjs
```

Do not overlap a package/docs build with TS traces or workspace tests: the
builder removes `dist` before regenerating it. Run final verification and
publication as distinct steps. This report records local source qualification;
it does not publish the documentation website.

The [selected evidence archive](evidence.tar.gz) contains native sources,
comparison fixtures, final and failed traces, negative-path results, review,
compiled-example source and logs. The [manifest](manifest.json) hashes every
member and the archive. Build targets and executables are excluded; original
binary hashes remain in the receipts. Absolute local paths in receipts are
provenance, not portable execution paths.
