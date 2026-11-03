# Domain data APIs and collaborative spreadsheet delivery

Base HEAD: `d624a56d7ea5389fd9f67d1277637838bb343475`. This candidate preserves
inherited uncommitted package/schema/local-client work and older reports. It
adds library-provided graphic data types, native Rust graphic and sparse-sheet
APIs, and an actual two-peer spreadsheet example. It does not publish packages,
push Git, deploy hosted docs, provide a production sheet backend or complete a
Figma/Excel application.

## Delivered surfaces

| Surface | Implemented | Important boundary |
| --- | --- | --- |
| TypeScript graphic library | createGraphicSchema / BUILTIN_GRAPHIC_SCHEMA, typed constructors, validation and stable-ID edits; 17 declared node types | Existing container/atom/text storage. Doc-based helpers; no portable Client object-read port, renderer, layout, instance expansion or Boolean solver. |
| Native Rust Document | Existing six presets, text/blocks/attributes, History, selection and checkpoints | Fixed manifests; no arbitrary runtime schema or public Client factory. |
| Native Rust Graphic | Canvas and Builtins profiles; empty containers, affine/vector/paint/reference data, UTF-16 labels, moves, native History and checkpoint/pending recovery | Builtins manifest matches frozen TS schema. Normalized model/History parity; no exact graphic wire/mixed-runtime exchange qualification. |
| Native Rust SparseSheet | Fixed implicit extent, sparse per-field registers, linked selective History, exact retries and replay-validated state | Independent private S1 primitive, not public SpreadsheetSchema/Client/DocHub integration. |
| Spreadsheet browser demo | Independent TS actors and Histories over real HTTP/SSE; VTable grid, input, selection range, undo/redo, reconnect | Private protocol, fixed coordinates, bounded window, memory-only server, no formulas/axis edits/restart durability. |
| WASM | Existing UTF-16 storage experiment | Full document/graphic/sheet API and Client factory remain open. |

Graphic types are canvas, frame, object-group, rectangle, ellipse, label, path,
component, instance, boolean, vertex, segment, paint, gradient-stop, stroke,
source-ref and instance-override. Affine coefficients, positions, handles and
gradient stops are independent editable records/fields. An override assignment
is one atomic {property,value} register per override object; targetId is separate.
Typed constructors and helpers validate payload and property-specific bounds.
Raw TS AttrSpec validates the outer atomic object type only. The native pinned
checker follows the stricter helper contract. This is not a new generic wire
payload validator. Object references may dangle; evaluation/precedence/cycles
remain separate gates. Existing PixiJS renders the earlier basic canvas profile,
not these new data types.

## Grid library decision

The private demo uses VTable 1.26.8 and vtable-editors 1.26.8 (MIT). Its canvas
view and editing events permit an input adapter over our authoritative sparse
model. VTable's datasource builds row indexes, so the demo gives it only a
100 × 26 window rather than the whole logical sheet. Jumping to XFD1048576
materializes no intervening axes or cells.

Univer was considered as a broader workbook/formula SDK; its
[worksheet model](https://docs.univer.ai/guides/sheets/model/worksheet-data)
separates row/column counts and cellData. Its
[installation](https://docs.univer.ai/guides/sheets/getting-started/installation)
brings its own workbook/plugin stack. Glide Data Grid was also checked as a
React-based alternative. Neither was installed. VTable's
[editing API](https://visactor.io/vtable/guide/edit/edit_cell) and
[official repository](https://github.com/VisActor/VTable) fit the bounded adapter
needed here. Formula evaluation and a second authoritative undo stack are not
silently delegated to the widget.

The new dependency chain initially included old lodash/minimist versions.
Scoped overrides under VTable pin lodash 4.18.1 and minimist 1.2.8. A targeted
update applied them; final demo production audit reports zero vulnerabilities.
This is the named workspace audit scope, not a universal security approval.
No public library gains VTable/editor/Pixi runtime dependencies. Five packed
library artifacts and seven independent consumers still pass.

## Correctness evidence

| Check | Result | Scope |
| --- | --- | --- |
| Final coordinated workspace | 1,445 cases: 1,443 PASS, two platform SKIPs, zero FAIL | Core 1,044; Lexical 7; Slate 4; bot 53; demo 115; docs 41; MCP 181/179 PASS. |
| New TS graphic regressions | 12/12 PASS | Vertex/handle fields, affine data, gradient stops, stable refs, concurrent assignment, selective undo/redo, strict helper failures. |
| Existing TS sparse tests | 18/18 PASS | Independent S1 state, field, History, deduplication and range cases. |
| New demo source tests | 8/8 PASS | Real HTTP authority, atomically rejected batches, exact response-loss retry, newer pending suffix, SSE/presence lifecycle, epoch failure preservation and inspector field isolation. |
| Root TypeScript | PASS | Final frozen TS source and declarations. |
| Native SDK all targets | 42 PASS | Document13, Canvas7, Builtins7, SparseSheet14, unit1; examples compile. |
| Existing native shadow | 75/75 PASS | Existing document engine regression suite. |
| Native Canvas differential | 20 actions / 40 states PASS | Independently authored normalized models and History. |
| Native Builtins differential | 35 actions / 70 states PASS | Exact manifest, independently authored normalized models/History; native ID/storage-slot normalization is explicit. |
| Native SparseSheet differential | 31 actions / 62 states PASS | Exact operations, models, full linked History, pending, journal and checkpoint; rerun against final source. |
| Chrome functional | 21/21 PASS | Trusted native input, actual peer grid values/styles, drafts, concurrency, History, range shading, far cells, reconnect and independent Node oracle. |
| Chrome performance correctness | All three sizes PASS | 0/1k/10k stored cells, three warmups and ten recorded actions per size; timing acceptance is not qualified. |
| Package and release preparation | PASS | Five tarballs/seven consumers, core dependency isolation and temporary Changesets version rehearsal; no publication. |
| Docs | 41/41 PASS; 50 pages / 2,273 links PASS | Actual printed TS examples run; printed native Canvas/Builtins/SparseSheet examples compile and run separately. English/local-path checks pass. |

The final UI bundle is
`a8ecd1f914c8611d467450d185839b768de165de13168411f7c3e8126307045c`.
A scoped active local/remote refresh probe records zero full-range reads.
Two distinct actors each submit HTTP changes and own successful EventSource
streams. There are zero browser GET state-oracle requests; independent Node
requests compare server cells. Selected B4:D6 shading is asserted against actual
scenegraph fill, not just a style callback. Screenshots were visually inspected.
The final proof has no page/console errors and no 390px horizontal overflow.

## Sparse data and matched receive optimization

Logical cells are not stored cells. The demo declares 1,048,576 × 16,384 logical
coordinates but does not allocate blank axis/cell objects. The original10k case
contains10,000 values, and every request sends only changed operations. Its slow
path was internal: the server copied/replayed all retained state per request,
and the UI built a complete sparse list just to display status counts.

The optimized server tracks a bounded accepted-ticket index, preflights fresh
and unique request IDs, then uses the primitive's existing atomic receive.
Exact prior receipts are resolved first. Invalid or reused ticket batches leave
state unchanged; ticket indexes update only after receive succeeds. The hot path
uses no full capture/restore. Final UI summary uses stats.pending directly and
no getRange/pendingChanges clone; explicit debug/oracle snapshot still returns
full sparse data. Normal view work reads its bounded window.

### Phase1: backend-only A–B–B–A

Same UI bundle04a94e0ce429615fd1d403eb47026e209b8a8fd020c1491f06030adb6205ea7f,
same immutable benchmark script, dataset and three-warmup/ten-sample protocol:

| Run | Server | 1k convergence p95 ms | 10k convergence p95 ms |
| --- | --- | --- | --- |
| A1 | Full replay | 51.4 | 287.0 |
| B1 | Incremental preflight | 21.1 | 33.8 |
| B2 | Incremental preflight | 26.2 | 33.7 |
| A2 | Full replay | 38.8 | 285.9 |

Paired10k p95 improves8.49× and8.48×, about88.2% in both pairs. No percentiles
are pooled or selected. The old server is rehosted by changing only its relative
SparseSheet import and static asset HERE path; original/adapter hashes and exact
phase1 bundle/source files are retained. Raw harness workspace source fields do
not stand in for the executed baseline handler: abba-summary.json names both
actual backend mappings. Optimized phase1 functional checks pass20/20.

### Phase2: final UI without status range scans

The second phase changes the UI bundle. These final observations are not merged
with the backend-only ratio:

| Stored cells | Sparse edit p50/p95 ms | Peer convergence p50/p95 ms | Highest per-view render CPU p95 ms | Cold ready wall ms |
| --- | --- | --- | --- | --- |
| 0 | 0.1 / 0.3 | 12.1 / 23.8 | 5.9 | 2,412 |
| 1,000 | 0.0 / 0.1 | 12.8 / 27.1 | 5.1 | 1,485 |
| 10,000 | 0.1 / 0.2 | 17.9 / 26.8 | 5.4 | 1,957 |

Chrome156/M3Max/1720×1080, fresh owned browser/room per size, three warmups and
ten measured edits. Zero timer readings reflect resolution, not zero work.
Sparse edit includes History/pending. Convergence polls only the addressed peer
cell and sender acknowledgement. Full sparse equality and independent Node
oracle checks run outside timing. Timed input uses application actions; trusted
keyboard/pointer behavior is qualified separately. Render submission/rAF do not
measure GPU completion or physical display. Cold wall includes browser/CLI
startup and polling, one observation per size. Final10k seeding takes276.6ms
through40 batches outside timing. No production latency/memory budget or WAN/
100k-populated-cell result is claimed; the20k-operation room cap remains.

Initial join, explicit capture/export/ranges and retained history still scale
with stored work. GC, durable recovery, stable structural axes and public Client
integration are open. Native large-document performance was not measured.
Earlier basic graphic timing flags are unchanged.

## Fixes and preserved first failures

- Review reproduced invalid cross-register override assignment under concurrent
  property/value writes. An atomic typed assignment fixes both delivery orders;
  later ref edits and undo/redo pass.
- Native positive-clock actor admission now rejects unsupported slash actors in
  births, sets/text/moves. Rejected batches preserve state atomically.
- Server per-request full replay was removed with preflight and exact-ID indexes;
  invalid/mixed requests and response-loss retries retain atomic behavior.
- View status no longer reads the complete sparse sheet or clones pending ops.
- Inspector applies changed fields only, preserving remote values/types/styles.
- Style-only/presence updates now invalidate actual bounded scenegraph cells.
- Jump preserves VTable's options, including row-number mapping and native editor.
- The legacy static-import test regex mistook a string literal `from` for an
  import. The harness now uses the TypeScript AST; real module/URL checks remain.
- An initial typecheck raced pretest's declaration rebuild. Stable rerun passes.
- Browser harness failures (editor-object truthiness and JSON key-order equality)
  are preserved separately and are not application failures or accepted passes.

An independent reviewer closed the two concrete P1/P2 findings. Those focused
observations were reported through tool output without saved raw repro logs;
`review-closure.md` states that proof boundary. This is not a blanket independent
review approval. Authoring traces, source tests and browser receipts are separate.

## Roadmap and run

The ordered S1–S6 queue is in `docs/spreadsheet-roadmap.md`. S1 exists in TS/native.
S5a is the early real-transport browser preview. **S2 interval axes/stable IDs**
is the next structural-engine priority; S3 common schema/Client/wire integration
follows. S4 formula calculation, S5 durability/resource budgets and S6 full
Rust/WASM client parity remain open. G1 standard graphic data is implemented;
G2 effective references/overrides and G3 geometry/layout/rendering remain open.
Pinned native Builtins does not close arbitrary-schema/WASM gates.

```sh
npm run dev:spreadsheet
SPREADSHEET_URL=http://127.0.0.1:5422 npm run check:spreadsheet
SPREADSHEET_URL=http://127.0.0.1:5422 npm run bench:spreadsheet
```

The optimized manual preview is
`http://127.0.0.1:58318/?room=collaborative-sheet-optimized` (owned exec60445),
opened in a new IAB tab. Twelve confirmed sample cells were copied from the
original preview. Its pending edits and local History remain in the original
tab/server at51497(exec40650); that tab was neither replaced nor closed.
Proof and baseline services retain isolated synthetic rooms. These are memory
servers. Existing user services/tabs and earlier report folders are preserved.
`source-seal.json` and `validation.json` bind compressed receipts to this
checkpoint. Earlier report folders remain unchanged. No commit/push/publish or
hosted deployment was performed.


## Final static UI cleanup

After timing, explanatory intro/footer blocks were removed and a small Memory
only badge remained. The JavaScript bundle, its input fingerprint and exact
grid dimensions are unchanged. A separate final21-check functional proof passes
against the cleaned HTML/CSS. No new performance claim is derived from that
static change. The measured phase2 sources/build proof and final static sources
are retained separately. Original user tabs remain open; a reload/new URL loads
the cleaned interface.
