# Rust engine roadmap

This roadmap separates Rust research from production engine delivery and the
[bot roadmap](bot-roadmap.md). The production server remains TypeScript. The
client has a shared engine boundary with a TypeScript implementation. A storage result does not approve an engine
migration. Each stage needs its own evidence and decision.

The runtime custom-schema subset is now implemented as a **partial D2** slice.
It covers Graphic container/text/atom, recursive Document flow/text/atom with
groups, inline tokens, scalar/nullable-JSON spans, nested field attributes,
required-child rules and grid/row/cell tables, plus arbitrary sparse scalar fields. Full document
schema/compiler coverage, live transitions
and a production WASM Client backend remain open. See D2 below and
[custom schema recipes](../apps/docs/src/schemas/custom.md).

## Delivery goal and ordered work

The delivery target is **the same editor bindings with a TypeScript or Rust/WASM
backend selected when a client is created**. TypeScript remains the default.
A native Rust SDK is a separate useful product; a native server adapter is an
optional parallel lane. Neither storage benchmarks nor the present factory
prototype satisfy this target. Switching engines inside a live editing session
is not required for the first release.

The historical R1–R6 research gates below stay in place. D1–D8 are the ordered
implementation queue that makes the remaining R4–R6 work actionable. D9 is a
separate native-server option. D1 is implemented with the qualified evidence below. D2 has the partial runtime
slices described below. Full D2 and the D3–D9 delivery gates remain open; they
are not implemented configuration or new verification results.

### Current source boundary

| Area | Current state and evidence pointer |
| --- | --- |
| Native Document SDK | Private typed API, History, anchors, pending prefix and checkpoints; six fixed document presets. See [SchemaPreset](../experiments/rust-sdk/src/lib.rs). |
| Native Graphic SDK | `GraphicDocument` implements fixed Canvas and 17-node Builtins manifests with stored objects, fields, moves, History and checkpoints. Runtime container/text/atom schemas use a separate API; complete rules and graphic selection remain open. |
| Native Spreadsheet SDK | Private `SparseSheet` fixed-axis S1 primitive: sparse field registers, undo/redo, exact pending operations and checkpoints. Stable structural axes and public Client integration remain open. |
| Runtime schemas | Partial D2: owned Graphic container/text/atom and recursive Document shapes with recursive field attributes, scalar/nullable-JSON value marks and required-child rules; custom scalar sheets. The full compiler and remaining advanced rules/transitions stay open. |
| Engine port | Production client ports cover editing, History, anchors, sessions, events, GC, schema changes and lifecycle. The immutable draft is separate. See [client contract](../packages/doc-sync/src/engine/client-contract.ts). |
| Client selection | SyncClient and portable editor hosts call the selected engine. TypeScript is the default and the only production implementation. See [client](../packages/doc-sync/src/sync/client.ts) and [host adapter](../packages/doc-sync/src/editor/sync-client-host.ts). |
| Wire compatibility | Native Text uses UTF-16 units; TypeScript uses a string. Current comparison normalizes their values. A real wire codec and complete server snapshot import still need qualification. See [SDK comparison](../experiments/rust-sdk/scripts/compare-typescript.mjs#L38-L44). |
| WASM | Current rust-core module is a UTF-16 storage experiment, not a CRDT document engine. See [module scope](../experiments/rust-core/src/lib.rs#L1). |

### Native domain progress

Document, Graphic and Spreadsheet now have separate native API surfaces.
`SchemaPreset::Shapes` still means the document group/inline/span fixture.
Graphic uses `GraphicDocument` with `GraphicPreset::Canvas` or
`GraphicPreset::Builtins`. The latter has an exact manifest match with the
frozen TypeScript `createGraphicSchema()` contract. Spreadsheet uses the private
fixed-axis `SparseSheet` primitive, not a public `SpreadsheetSchema` or `Client`
backend.

The graphic Canvas receipt records seven focused tests and a 20-action,
40-state normalized model/History comparison. Builtins adds seven focused tests
and 35 independently authored actions with 70 normalized actor model/History
states. That domain checkpoint had 42 SDK tests and 75 shadow-core tests.
The earlier flat runtime-schema checkpoint passed 48 SDK tests and 78
shadow-core tests in the main publication check. The recursive slice below
raises those totals to 55 and 89. These checks
do not qualify exact graphic wire encoding or mixed-runtime exchange.
The sheet receipt records 14 focused tests and a 31-action, 62-state exact comparison of operations, models,
full History, pending queues and checkpoints. These checks add no browser,
WASM, renderer, server durability or performance qualification.

Evidence is in `output/rust-graphic-evidence-20261103/receipt.json`,
`output/rust-graphic-builtins-evidence-20261103/receipt.json`, and
`output/rust-sheet-proof-20261103/receipt.json` in the checkout. These are local
receipts, not published release artifacts. See the
[graphic roadmap](graphic-roadmap.md) and
[spreadsheet roadmap](spreadsheet-roadmap.md) for their ordered work. D2 runtime
schemas, D3 compiler completion and the later production gates remain open.

Builtins overrides store one atomic `{property, value}` assignment attribute and
an independent `targetId`. TypeScript graphic helpers validate the complete
payload and typed value bounds. The raw generic TypeScript attribute rule only
checks its outer object type. The native pinned checker enforces the stricter
helper contract. This does not add a generic wire validator or claim universal
invalid-input acceptance parity. References can remain dangling; effective
instance expansion and Boolean solving remain separate work.

### D1. Shared client and engine boundary

**Status:** implemented. Selected-TS routing, 1,199 regression cases (1,197 PASS,
two platform SKIPs), package consumers and conversion-count gates pass.
Repeated/pooled Node and exact controlled Chrome comparisons qualify the client
migration. Small-block tails remain reported. This is a bounded migration
result, not general product-latency acceptance. The original separate-server Chrome comparison
retains 12/27 flagged cells; general end-to-end latency acceptance remains open.
See [comparison and limits](../benchmarks/results/client-engine-selection/report.md).
This is not a Rust/WASM delivery or global product-performance acceptance.

Define real operations for transactions, model reads, anchor visibility,
events, composition sessions, ordered GC, schema changes, checkpoint transfer,
and disposal. Separate compile/apply from commit/History ownership so one edit
cannot be recorded twice. Separate document revision from server sequence.
Specify lossless text/value/wire conversion and how an engine imports the
current server snapshot; private engine checkpoints remain tagged and opaque.
Visible model JSON alone cannot bootstrap retained operations or History.

Migrate the TypeScript client/host path first. Preserve existing TypeScript
constructors and public client.doc compatibility for legacy TS callers only;
never substitute a stale shadow Doc for a WASM engine. Portable bindings use the
host contract. Select a backend at construction. Unsupported capabilities fail
before connecting or mutating. No working Rust selector is claimed by this step.
Do not put the draft factory's full document/History copy on every production
keystroke. Preserve scoped model events, caches and the current incremental path;
the adapter seam needs production transaction ownership, not just a wrapper.

**Gate:** one existing binding uses an explicitly selected TypeScript factory;
a tracking engine proves edit/receive/undo/redo/session/recovery calls reach it.
The complete existing TypeScript regression suite stays green. Compare the
current TS path and selected-TS path on the same editing traces, including large
documents; establish and check the migration budget before merging D1. Invalid calls
preserve document, pending queue, History, clock and revision. Contract fixtures
cover omitted/null values, actor ordering, safe clocks, isolated text surrogates,
and operation/snapshot round trips without changing the existing wire contract.

### D2. Load a validated runtime schema in Rust

**Partial implementation:** `RuntimeSchema`/`RuntimeDocument` compile owned
Graphic container/text/atom and recursive Document flow/text/atom/group/inline/
span/grid/row/cell descriptors, recursive field attributes, scalar/nullable-JSON
value marks and required-child rules. Document flows use their own defaults and allowed-child rules;
each grid has its own row/cell/body chain. The native SDK adds parent-flow and
cell insertion, stable selections, accepted-placement-aware block moves, row
and column insertion, cell attributes and merge/split. `SpreadsheetSchema`/`RuntimeSheet` compile scalar field registries.
Unsupported descriptors reject with paths; legacy presets and flat runtime
behavior remain. Native schema-reference handles now support composite defaults
and composite enum choices, including explicitly declared default/enum sharing.
Explicit atomic cross-descriptor and enum-only reference groups are supported.
Nested schema payload selectors are supported through v3 logical reference
classes. Declared field leaves can also supply references; whole field-branch
sources, mutable runtime graphs, markValues.fields,
derived group/span and row/cell-body attributes, root fields, axis moves,
positive-minimum required cycles, arbitrary computed rules and the product-schema gate
remain open. This slice does not complete D2.

The preceding recursive-flow slice passed 55 SDK and 89 shadow-core tests. Independent native
and TypeScript authoring matches 162 actions and 324 actor states across two
renamed schemas, with the declared operation/derived-metadata projection. Full
History and pending/caret are compared. The historical wider post-move probe
records a physical-helper/model-command mismatch. The bounded model-path API
in D3 below now supports moved paragraphs; physical-anchor helpers retain their
separate contract and do not replace the full TypeScript EditOp compiler.
See the [source-bound report](reports/rust-d2-nested-2026-11-04/README.md).
See [custom schema contracts](../apps/docs/src/schemas/custom.md).

The nested-grid extension passes 60 SDK and 96 shadow-core tests. It adds
independently named `grid → row → cell → flow` chains, nested tables, stable
axes/cell addresses, merge/split with covered content retained and standard
computed span metadata. Row/cell-body attributes and axis moves reject in this
subset. Independent TS/native authoring passes 180 actions/360 actor states
under declared format projections; the twelve schema checks now assert eight
targeted rejections and four explicit admissions after the shapes extension.
Historical post-move probes preserve the physical-source/grid-command gap;
complete grid model-position compilation remains open. See the
[source-bound grid report](reports/rust-d2-grid-2026-11-04/README.md).

The group/inline/span extension passes 67 SDK and 107 shadow-core tests.
Runtime groups follow flow-local membership and arbitrary `by` attributes;
inline nodes have stable keys; scalar value marks derive schema-ordered spans.
Independent TS/native authoring passes 188 actions/376 states and twelve
schema checks with raw History/pending/caret comparisons. The current schema
checks have ten rejections and two compile-only admissions after later extensions. The
native helpers canonicalize birth defaults without dropping update writers and
resolve effective text types after `$type` changes. Empty-head group insertion
still exposes a D3 authoring gap. See the
[source-bound shapes report](reports/rust-d2-shapes-2026-11-04/README.md).

The fields/required-child extension passes 78 SDK and 120 shadow-core tests.
It adds independent recursive attribute leaves, nullable field-safe JSON atomic
mark values, deterministic required text/group/flow/grid/atom slots, min/max
projection, authored replacement/promotion, selection, undo/redo and recovery.
Four independently renamed descriptors compare 260 semantic actions/520 states
and 19 schema checks. Empty branch updates retain an observed D3 compiler-only
clock difference. That checkpoint rejected composite defaults/enums; the next
extension adds the explicit native reference protocol described below. A reproduced
TS required-anchor projection cycle that hid nonempty content after redo is
fixed in both engines, with before-failure and focused regressions.
See the [fields/rules report](reports/rust-d2-rules-2026-11-04/README.md).

The composite-reference extension adds object/array defaults without an enum,
and mixed composite enum choices with a null default. `SchemaValue` distinguishes
a schema default/enum handle from equal plain JSON. Operations carry an explicit
versioned reference envelope, validated against the schema and descriptor path.
Undo/redo and native JSON checkpoint/replay preserve its provenance. This is a
native protocol extension, not raw TS wire compatibility. TypeScript uses object
identity: JSON copies fail composite enum admission, and even DocHub's retained
copy rejects such edits. Native projection retains TS clone/fallback behavior.
A different same-shape atom descriptor's enum reference can be TS-valid but
native-unsupported because nontext admission requires the born descriptor.
That checkpoint left composite default-to-enum aliases open; the next extension
implements explicit same-descriptor sharing as described below.
That composite checkpoint passed 138 core tests and 86 SDK tests. The key-order
correction preserves raw payload order while validating against canonical schema
identity. The reference-aware split History scanner is also corrected.
See the [composite-reference report](reports/rust-d2-composite-2026-11-04/README.md).

The shared-reference extension compiles
`doc-sync-runtime-schema-alias-v1` descriptors. Each edge identifies an atomic
attribute or value mark and an enum index that shares its composite default.
Several slots may explicitly share that default; equal unlisted slots remain
distinct. Invalid/duplicate edges and inferred sharing reject. The schema's
semantic identity includes the graph; `base_identity()` retains the raw TS
schema hash. Bare schema identity and serialization remain unchanged. Snapshots
retain the versioned DTO and references retain their selected source/index.
Compiled lookup tables avoid scanning the entire graph during an edit. Linked
enum payloads use the default object's property order, retaining selected
source/index; equal unlinked slots keep their own order. Current coverage is
147 core/93 SDK tests, 182 independent semantic actions/364 actor states and
four-schema32-factory exact JS/native order comparisons. Six inherited corpora
and the final twelve-driver source/binary-frozen replay pass.

TypeScript material/History comparison rehydrates actual shared object references.
A default-alias birth can pass DocHub when canonicalization omits its value;
retained composite payloads still fail its cloning/admission path. This does
not close TS/native wire integration or arbitrary nested alias graphs,
live schema transitions, D3 or the remaining D2 product/compiler gates. See the
[shared-reference report](reports/rust-d2-alias-2026-11-04/README.md).

The cross-property extension adds `doc-sync-runtime-schema-shared-v2` with
explicit `{representative, slots}` groups of atomic default/enum references.
Members may span node kinds, differently named attributes and value marks;
enum-only groups use the same format. The representative is a member and its
payload order is authoritative. Canonical group/member order does not erase
that representative choice from semantic identity. Bare/v1 identity and wire
stay unchanged. Raw manifest/DTO and diagnostic base identity remain separate
from compile-once effective rules and graph-bound native identity.

Target-aware admission and birth omission retain the selected source path/index
and actual target key. Per-key caches avoid cloning/scanning every group target
for each Set. Effective defaults, null resets and clone fallback match actual
TS shared-object projection. The own-enum default requirement and stricter
unshared native-handle boundary remain explicit native subset limits. Field aliases, mutable runtime graphs, live transitions, remaining D2 and D3
compiler gates stay open. See the
[cross-property report](reports/rust-d2-shared-2026-11-04/README.md).

The payload extension adds `doc-sync-runtime-schema-payload-v3` and optional
`valuePath` selectors inside atomic default/enum JSON. Typed string keys and
integer array indices remain distinct. Parent identity propagates downward to
composite descendants; equal/shared children never merge distinct parents.
Nested representatives resolve through shared parents once, with ambiguous
explicit-group overlaps, unsafe paths and cycles rejected. Logical class
indices retain representative locators instead of a full payload copy per node.

Bare/v1/v2 wire and identity remain intact. The selected source valuePath is
separate from the target operation path and survives native History/checkpoints.
Source schema identity and actual TS stored-clone observations are qualified
separately: native public JSON values do not represent JS heap aliases. Mutable
runtime links, structured-field aliases, a TS/native object codec and production
Rust/WASM Client delivery remain separate gates. See the
[nested payload report](reports/rust-d2-payload-2026-11-04/README.md).

The field-source extension uses v3 descriptor paths with explicit `fields`
edges to select declared writable leaf defaults and enum entries. Payload
`valuePath` and operation binding paths keep their separate roles. Native field
writes retain TypeScript's structural JSON validation and independent leaf
registers; copying a schema value into a field does not create a symbolic
identity link. Whole branches remain rejected. Existing atomic source formats
and operations remain. See the
[field-source report](reports/rust-d2-fieldrefs-2026-11-04/README.md).

The product-pattern extension supports exactly `^(https?://\S+)?$` and
`^(#[0-9a-fA-F]{6})?$` through existing attribute, field-leaf and value-mark
validation. The link rule is case-sensitive, accepts the empty default, and
requires a nonempty HTTP(S) suffix without ECMAScript whitespace. NEL is allowed;
BOM is rejected. Rust Unicode whitespace classification is not substituted.
The color rule accepts the empty default or exactly six ASCII hex digits after
`#`. Null retains the existing reset behavior. All earlier pattern handlers
remain. See the [pattern report](reports/rust-d2-patterns-2026-11-04/README.md).

The text-disabled extension accepts boolean `text` flags on text-shaped nodes.
It preserves text markers, inline children, stored characters and projection.
Raw Document flow admission checks all stored text types, including group
members: a false-only flow rejects characters, while a mixed flow can accept
characters after a disabled marker. The native container text guard uses the
immutable birth type. Existing SDK methods provide selection, History and own
checkpoint recovery. Native graphic type-change state parity and the full D3
editor compiler remain separate. See the
[text-disabled block report](reports/rust-d2-textfalse-2026-11-04/README.md).

The original Word and presentation registries now compile without pruning
unused declarations. The extension validates every declaration, retains all
descriptors in schema identity/DTO/checkpoints, and keeps parent placement rules
unchanged. Unused grid/group declarations do not change the active flat-flow
model or History. Global value-mark rules still select their required engine
path. See the [unused-declaration report](reports/rust-d2-unused-2026-11-04/README.md).

The D3 paragraph slice now compiles bounded nested model insertion, including
head retyping, structured field resets and required-slot end placement. Existing
physical-source helpers retain their separate contract. The complete command
compiler remains open; see the D3 gate and
[paragraph report](reports/rust-d3-paragraph-2026-11-04/README.md).

The optional URL and six-digit hex-color product patterns are supported with
exact JavaScript whitespace and matching semantics. Arbitrary patterns remain
fail-closed. Original Demo, Word, Notion and presentation schemas compile.
Bounded Word/presentation traces include section/slide metadata, their default
internal text and concurrent History/checkpoint recovery. Full-profile editing,
list/table authoring and complete D3 command equivalence remain unqualified.
Removing declarations in diagnostic copies is not original-product evidence. `markValues.fields`
is rejected by TypeScript too; it remains an invalid-schema boundary, not a
missing native feature to implement. These ordered gates still need their own
implementation and differential evidence.

Replace preset/type-name branches with per-document compiled schema data.
Support all nine shapes, allowed children, grouping, grid chains, defaults,
next/text rules, boolean/value marks, nested attribute fields, cardinality,
computed values and supported pattern rules. Match TypeScript schema identity,
including UI metadata. Presets remain convenience fixtures, not the mechanism.
Unsupported descriptors must reject atomically; a limited subset is not full
arbitrary-schema support.

**Gate:** independently renamed schemas coexist without rebuilding Rust. Vary
roots, node/mark/attribute names, defaults and rules. Compare valid and invalid
inputs, models, History, anchors and restore against TypeScript. Include the
Word, Notion and presentation schema fixtures. Dependencies: D1 value/schema
identity contract; implementation can run alongside the D1 client migration.

### D3. Implement the schema-based editing compiler

**Partial implementation:** `RuntimeDocument::insert_paragraph_at` compiles one
text-shaped model node at a child path. `insert_model_at` also accepts supported
flow/text trees. `insert_model_at` also accepts supported group/grid models and
row/cell axis inputs. Both compile on detached native state and record once. Original
Word/presentation cases cover first, middle and required-slot end insertion,
field/default writes, UTF-16 runs, independent concurrent writers, History and
own checkpoint replay. The TypeScript compiler tracks pending type changes
when expanding fields. Detached physical stubs no longer become required-tail
base anchors; only newly inserted nodes receive placement writes.

The single-model APIs reject offset paths, uncompiled row/body-wrapper attributes,
mixed structured node attribute maps and trailing reserved-only transactions.
Cell attribute patches support mixed structured/scalar input in exact TS order.
Empty group/grid inputs reject atomically rather than return a fake stored ID. Bounded insertion after existing moves is supported; general model command
compilation remains separate.
Input normalization differs for malformed model attributes: TypeScript can
sanitize them while the native API rejects before mutation. These cases are
not claimed as rejection parity. Schema constraints can hide overflow in the
canonical model while storage and foreign writer records remain retained.


**Moved-document extension:** current model child paths now resolve through
accepted placement winners, including undone movement and suppressed cycles.
Only newly inserted identities receive compiler placement writes. A fresh empty
default preserves canonical leading slots without overwriting an old head.
Source virtual text promotion uses a deterministic candidate order; boundary
anchors retain their meaning across concurrent predecessor relocation/deletion.
Original Word/presentation comparisons check the full independent model-edit
result, exact operations/History and own checkpoint recovery. See the
[moved insertion report](reports/rust-d3-moved-2026-11-04/README.md).

**Group/grid extension:** derived group `by` values flow to members and member
overrides win. Model group gaps can split into parent-admitted blocks. Dense
model grids preserve row/column IDs, hidden cell contents, span/custom attribute
order, and cell body paths. Row model insertion returns a row axis; inserting a
cell at a row gap creates a global column and returns its axis. One API call is
one transaction.
See the [schema editing queue](schema-editing-roadmap.md) and
[group/grid report](reports/rust-d3-group-grid-2026-11-04/README.md).

**Atomic insert-batch extension:** `insert_models_batch` accepts an ordered
array of `ModelInsert {at, model}` and compiles against one evolving candidate.
Different rows at one column boundary share one column identity; repeating a
row creates another column. A later failure preserves the live document, clock,
pending work and History. The result has optional identities, one Change and
before/after clocks, including reservations. Empty operations preserve redo.
Runtime checkpoints retain explicit, bounded reservation metadata above the
replayed journal; ordinary snapshots still require exact clock equality.
Canonical operation validation stays, and older readers are not qualified for
reservation-bearing snapshots. The strict single-model
input policy remains unchanged. Fourteen original-product/custom profiles
compare 351 actions/702 actor states. General EditOp compilation, typed model
value handles and offset paths remain separate work. See the
[batch report](reports/rust-d3-batch-2026-11-04/README.md).

**Strict ID targeting extension:** `read_model_for_edit` captures a model and
opaque process-local base. `insert_models_relative` resolves before/after stored
primary blocks or explicit root/stored-flow edges against one evolving candidate.
Checked incarnation/revision/schema identity detects stale reads even when the
Lamport maximum is unchanged. Successful publications consume the base; reads,
ack and failed calls preserve it. Restore changes the instance. Missing/deleted/
hidden/covered/alias/synthetic/axis targets reject without selection fallback.
The base check avoids whole-journal snapshots; strict lookup uses a captured
state and indexes per command. Core, wire, History and checkpoint formats stay
unchanged. Fresh comparisons cover 14 profiles/390 actions/780 states. Typed
axis/cell targets also pass their bounded slice below. The explicit one-column command now passes its bounded slice below; a native
ID read catalog has a local prototype described below. See
the [targeting report](reports/rust-d3-targeting-2026-11-05/README.md).

**Typed grid targeting extension:** `insert_grid_models_relative` uses a grid/row
pair for BeforeRow/AfterRow and a grid/row/column triple for InsideCellStart/End.
It checks live ownership and current reachability against the same local base.
Current covered-cell targets reject; row insertion retains existing span growth,
hidden payload and newer-overlap rules. Fresh 14-profile/435-action comparison,
core194/SDK182 and two documentation consumers pass. A moved-grid TS compiler
bug is fixed using accepted placement; source/dist focused tests and the fresh
whole workspace suite pass. See the
[axis report](reports/rust-d3-axis-targeting-2026-11-05/README.md).

**Explicit column targeting extension (Q1.3.3):** `insert_column_relative`
creates exactly one column in the target Document grid, using stable boundary
and unique row-ID payloads. Omitted rows get defaults; empty payload still
creates one column. Current ownership/base checks, atomic rejection and existing
span-writer rules remain intact. Historical independent comparison covers
14 profiles/422 actions/844 actor states; its source/binary map remains unchanged.
Fresh 2026-11-16 core194/SDK191, example, two documentation consumers and all
14 inherited regression stages pass (3359 main actions plus a separate12-action
empty-cell probe). This is not full D3 completion. General multi-column commands
and axis moves remain separate.
See the [column report](reports/rust-d3-column-targeting-2026-11-16/README.md).

**Local catalog prototype (Q1.3.4):** `read_model_with_catalog` returns the model,
opaque process-local base, stored primary block paths/types/flow capability,
owned grid axes and uncovered cell tuples/body paths. It excludes synthetic
defaults, group wrappers and covered descendants. Commands revalidate targets;
paths are diagnostic at that base. The Nov 16 receipt records five focused tests,
30 inherited targeting tests and the runnable example PASS. This is historical
prototype evidence, not full Q1.3.4 closure. Broader required/nested fixtures,
independent comparison, complete consumers and alias diagnostics remain open.
It adds no server authorization, durable recovery or production WASM integration.
See the [catalog example](../experiments/rust-sdk/examples/runtime_id_catalog.rs).

Provide the public EditOp/command path in Rust, rather than requiring callers
to hand-author low-level operations. Cover insert/delete/update/split/merge/move,
normalization, mark inheritance, blocks, groups, inline/span content, tables,
merged hidden cells, required/overflow children, field attributes and annotations.
Preserve IDs, origins, ownership and atomic failure. Use the actual TypeScript
feature corpus to bound supported behavior.

**Gate:** independent TS and Rust authoring from the same commands compares
operations and state, not just replay of TS-generated operations. Concurrent
delete/format/insert/move and every undo/redo order retain foreign edits. Invalid
batches leave state unchanged. Dependencies: D1 and D2.

### D4. Complete sessions, recovery and GC

Add composition draft/clock reservation/commit/cancel, incremental model-event
DTOs, visible/retained anchor lookup, presence ranges, and logged-frontier GC.
Preserve exact pending operations, actor sequence, History pins and protected
checkpoints. Implement compatible schema changes and open-editor selection
restoration under the existing TS rules; uncertain conditional outcomes block
unsafe transitions. Separate local checkpoint restore from server recovery.

**Gate:** crash before/after send, accepted-response loss, duplicate receipt,
negative settlement, server restart, refresh, reservation release and GC all
retain IDs, pending edits and foreign changes. Undo/redo stays actor-owned.
Schema transitions preserve supported pending/history and selection state.
Composition with remote edits, cancel and reset has dedicated cases.
Dependencies: D1–D3; facets can proceed independently after their ports settle.

### D5. Complete the native Rust SDK contract

Expose the completed schema/compiler/lifecycle functions as a typed native API,
with explicit errors, ownership, persistence responsibilities, exact pending
acknowledgement, supported versions and executable examples. Retain low-level
record/apply_remote for advanced hosts; do not make it the only authoring path.
A host still supplies networking and trusted durable storage.

**Gate:** an external Cargo consumer edits the three product schemas, restores
History and pending state, retries exact operations, and exchanges actual public
wire values with TS. Wrong schema/checkpoint/version and malformed inputs fail
atomically. Dependencies: D2–D4. Native SDK delivery does not depend on WASM or
a native HTTP server.

### D6. Build the full CRDT WASM SDK

Wrap the semantic core from D2–D4, not the storage benchmark. Supply a built
module, typed JS factory, async loader, asset/ABI version checks, bounded value
codec, owned handles, memory-growth-safe views and explicit disposal. Define
initialization failure, cancellation, instance isolation, double close and
stale-handle behavior. The binding-facing edit API can remain synchronous after
module initialization. Batch transfers without losing incremental updates.

**Gate:** shared contract fixtures pass in native Rust, Node WASM and browser
WASM. A fresh consumer loads the built artifact; failed calls preserve live
state; repeated create/dispose finishes with zero live handles. Record memory
measurements separately from logical-handle correctness. Dependencies: D1–D4;
packaging/ABI prototypes can proceed earlier with a declared limited scope.

### D7. Connect the same bindings to the selectable backend

Connect the WASM factory to the real client/host boundary from D1. Keep editor
setup and binding code the same except backend construction. Preserve the TS
server protocol and Node/MCP callers; a native server is not a prerequisite.
Qualify ProseMirror, Tiptap, Slate and Lexical independently.

**Gate:** Chrome runs TS/TS, TS/WASM, WASM/TS and WASM/WASM peers with the same
schemas. Cover input, formatting, backward/overlapping selection, bot presence,
undo/redo, moves/tables/hidden cells, offline pending, reconnect, restart,
compatible schema transition and GC. Test IME composition; actual OS IME proof
is separate from synthetic browser events. Dependencies: D1–D4 and D6; the native SDK release in D5 does not block this lane.

### D8. Qualify packages, long sessions and performance

Provide independently consumable core/native/WASM artifacts and unchanged
binding peers. Package names and publication remain separate release decisions;
no proposed import should be documented as an existing registry package.
Retain the default TypeScript path and an operational rollback plan.

**Gate:** isolated consumer/export/type/loader tests pass; deterministic and
randomized differential failures are zero for the declared support matrix.
Test repeated sessions, cancellation and memory limits. Compare startup,
wire/bridge cost, memory, core time and actual editor latency separately using
the same schemas/documents/actors and at least seven samples per workload.
Set acceptance budgets before judging results. Make separate native and WASM
go/no-go decisions; reject a default migration that does not meet its budgets.
The WASM release lane depends on D7; the native SDK release lane depends on D5.
Qualify and decide each independently. These gates do not promise a Rust speedup.

### D9. Optional native Rust server adapter

After D1–D4, a separate lane can define a new server engine port and embed the
Rust semantic core behind it. The current DocHub has no selectable engine port. Start as a read-only shadow; it must not submit a second
edit. An opt-in authoritative backend comes only after exact protocol, schema,
GC, conditional receipt, durable negative seal, storage-failure and restart
parity. This need not rewrite HTTP/auth/MCP in Rust.

**Gate:** mixed native/TS/WASM peers converge; same-point races, lost responses,
GC/restart and undo retain edits and ownership. Native throughput/RSS and failure
recovery have separate evidence. D9 is not required to finish the WASM client.

### Parallel work and first implementation slice

- Lane A: D1 client/host ports and selected TypeScript implementation.
- Lane B: D2 runtime schema kernel, then D3 compiler and D4 semantic lifecycle.
- Lane C: independent wire/History/recovery fixtures and package/ABI prototypes.
- After D1, a text-only Rust/WASM prototype can mount one existing binding to
  expose ABI/session problems early. It must reject other features and remain
  labelled text-only; it does not pass D2–D7 or establish protected recovery.
- D5 native SDK and D6 WASM delivery can proceed in parallel once the shared
  kernel gates pass. D9 server work is independently optional.

The D1 source now supplies callable client ports and selected-TS routing through
the real bindings, with the bounded evidence above. General Chrome latency
remains a separate open acceptance item. D2 is the next Rust implementation lane. Keep legacy constructors and
the same concurrent editing behavior; a fake Rust selector or storage benchmark
does not deliver a production engine.

## R1. Freeze the UTF-16 contract and baseline

**Status: delivered within the isolated storage experiment.** The
[experiment](../experiments/rust-core/README.md) defines offsets and deletion
lengths in UTF-16 code units. It preserves isolated surrogates, rejects invalid
ranges before mutation, and does not normalize text. A native differential
trace passed 265 operations against an independent JavaScript string oracle.
This does not prove CRDT compatibility.

The [recorded results](../experiments/rust-core/RESULTS.md) include Node 24.22.1
and Headless Chrome 156. Each batch starts with 100,000 UTF-16 units and makes
1,000 edits. JavaScript/WASM medians were 1.759/8.050 ms in Node 24 and
1.700/7.300 ms in Chrome. Both returned checksum `719347296`. WASM was slower in
both measured batches. Timing includes allocation, initialization, edits, and
hashing. It excludes module loading, compilation, text transfer, and per-edit
boundary calls. Rust `Vec::splice` and JavaScript fixed-capacity storage use
different allocation strategies.

**Gate:** retain the contract, deterministic fixtures, runtime versions, raw
samples, and workload bounds as the reference for later stages. Do not use the
batch checksum as proof of full engine equivalence.

## R2. Compare safe storage implementations

**Status: declared bounded storage comparison gate passed.** The
[comparison](../experiments/rust-core/STORAGE-RESULTS.md) retains the original
native benchmark and adds independent JavaScript string comparison with both
WASM backends in Node 24 and Headless Chrome 156. Each runtime passed 30,538
validation operations with complete UTF-16 state checks after every operation,
including 29 invalid cases. All three final native trace hashes also matched.
Eleven native tests and the offline WASM release build passed.
Review fixes and final source hashes are recorded with the receipts.

Gap improved local edits but regressed against Vec for alternating ends in
native Rust and both WASM runtimes. Chrome Vec also regressed against the
JavaScript string candidate for far jumps and alternating ends. Separate
construction, edit, and materialization samples do not establish a general
engine benefit. Logical capacity and scratch limits are documented. The later
no-WASM comparison adds sampled process RSS; peak-memory acceptance remains
unmeasured.

The same-algorithm follow-up compares JavaScript Gap with Rust WASM Gap.
Both use the same initial gap, movement, growth rule, prepared UTF-16 inputs,
and fresh contiguous output contract. Each runtime must pass an independent
complete-state oracle before timing. The practical WASM path includes checks,
copies, calls, and a mutex. JavaScript typed-array and Rust Vec allocation can
differ; this does not isolate a language effect. See the appended
[follow-up results](../experiments/rust-core/STORAGE-RESULTS.md) for the
same-workload tables and regression limits. Node 24 and Chrome each passed
60,033 complete-state operations, including 19 invalid cases. WASM edit and
pipeline medians exceeded JS Gap for all six seed/trace pairs in both runtimes.
This supports no measured gain for the current practical WASM path; it does
not rank native Rust/server execution or pure language cost.

A separate no-WASM follow-up compares native Rust Gap with Node.js Gap under
matched binary traces and output contracts. Both pass 24,009 independent
complete-state oracle operations, including four rejections. All 84 measured
outputs and twelve memory-run outputs pass full-state checks. The final receipt
uses Node 24.22.1 and rustup Rust 1.86.0; ambient Homebrew Rust 1.87.0 is separate.
Each of six seed/trace conditions uses 100,000 units, 10,000 edits, seven paired
samples, and five warm-ups in each fresh sample process. Native edit and
pipeline medians are lower in all six conditions. Native pipeline wins 41/42
paired samples; one far-jump sample and one fresh-output phase median regress.
Sampled external process RSS is lower for native Rust at all six observed
stages. These observations include runtime and retained trace costs; they do
not measure per-document heap, peak RSS, or leak freedom. See the appended
[results](../experiments/rust-core/STORAGE-RESULTS.md) for phase tables and limits.
This supports further native experiments, not a language-wide benefit or a
production server claim. No server adapter or production migration is approved.

The comparison covers the existing Rust vector, safe Rust gap buffer, and an
independent JavaScript implementation within the declared workload bounds.
Keep these implementations inside the experiment. Preserve the R1 UTF-16 and
invalid-range contracts. A gap buffer is a storage candidate; it does not
replace CRDT item IDs or ordering.

Use separate workloads for local edits near the previous cursor position and
far jumps across the document. Include insertions, deletions, replacements,
empty text, end edits, growth, isolated surrogates, and invalid ranges. Report
document sizes, edit distributions, capacities, and seeds. Measure allocation
and initialization, edit execution, and full-text materialization separately.
Report memory capacity and allocation behavior where measurable; do not infer
process memory from the text length alone.

**Gate:** compare complete UTF-16 state after every operation with an independent
oracle. Invalid operations must preserve state. Save native and WASM results,
raw samples, conditions, and any regressions. A benefit for local edits does
not establish a benefit for far jumps or full-document reads.

## R3. Measure the JavaScript/WASM boundary

**Status: declared bounded boundary and lifetime gate passed.** The
[bridge completion results](../experiments/rust-bridge/RESULTS.md) record
Node 24 and actual Chrome 156 evidence bound to the same sources and WASM.
Each runtime passed 4,000 differential edits, 4,018 exact read/hash checks,
2,000 lifetime cycles with 5,997 stale-handle rejections, 42 boundary cases
with seven samples each, and seven batches of 1,000 create/read/close cycles.
Six native tests and the offline WASM build passed. Independent audit passed
13 assertions, including cross-realm and hostile-input cases.

The interface transfers real UTF-16 units, including isolated surrogates.
Terminal disposal, failed-close retry, wrapper ownership, copied results,
detached inputs, and refreshed views after memory growth are checked. Final
live handles and logical units are zero. Stable linear memory during cycles
and a separate explicit 64 KiB growth do not prove allocator, RSS, or GC leak
freedom. Raw exports require a trusted synchronous host.

Calibrated scalar/probe calls use matched JS controls. Input/output copies use
reused and fresh destinations; Rust scratch transfer includes its WASM call.
Raw samples retain sizes, call counts, runtime versions, order, and sources.
Startup records first observations with unknown engine cache state and repeated
instantiation from a retained compiled module. Combined edit and lifecycle
costs remain separate. These measurements do not isolate pure ABI, allocator,
or splice cost. Chrome per-edit input was slower than JS string edits; full
output increased cost in both runtimes. No product speedup is established.

**Gate: passed within this declared scope.** Complete-state differential,
lifetime, boundary, startup, and combined-operation receipts exist for Node 24
and Chrome. The original batch ABI and initial bridge receipts remain history.
No production adapter or CRDT/editor acceptance is approved by this result.

## R4. Implement CRDT semantics in shadow mode

**Status: in progress; pinned movement and logical split/join comparison passed,
including the four corrected hidden-root-gap endpoints.** The isolated
[Rust shadow crate](../experiments/rust-shadow/README.md) applies actual wire
operations from the TypeScript engine. It does not receive expected document
states as input. TypeScript remains authoritative. The pinned schema has a flow
root, one implicit paragraph, and boolean `bold` and `italic` marks. The native
base interpreter supports `text`, `del`, `undel`, and boolean-or-null `set`
operations. An explicit `paragraph-markers-v1` capability now adds authored
paragraph node births for legacy split and merge. Other nodes, moves, GC,
other marks, general schemas, and schema transitions remain unsupported and
must fail closed.

A separate pinned [block schema](../experiments/rust-shadow/schema-general.json)
now supports paragraph and heading text blocks, divider and image atoms, and
schema-defined attributes. Its identity is `general-flow-blocks:json-attrs:v1`,
with exactly the opt-in capability `general-blocks-attrs-v1` and native snapshot
v3. It does not change the original schema, base v1, or paragraph v2 contract.
That v3 slice remains flat. The subsequent v4 slice below adds nested flows and
grids. The v5 slice below adds groups, inline nodes, and string-valued spans.
Arbitrary runtime schemas remain open.

Births with Lamport clock zero, the reserved `~root` actor, or null birth marks
are also rejected. Isolated-surrogate actor names are unsupported; UTF-16 text
units remain supported. These restrictions do not establish general rejection
parity with raw TypeScript `Doc.apply`.

The [differential harness](../experiments/rust-shadow-harness/README.md) uses the
real TypeScript `Doc`, `History`, `SyncClient`, and `DocHub` through an in-memory
network. It compares token IDs and origins, UTF-16 units, tombstones and deletion
cancellations, last-writer-wins attribute values and tickets, clock, counts,
and the projected model. The original apply-only harness uses TypeScript
`History` to generate inverses. The separate
[native History harness](../experiments/rust-history-harness/README.md) now
compares inverses generated independently by Rust. Rust captures local prior
registers, maintains shared formatting ownership states, groups typing, retains
100 history groups, generates fresh inverse tickets, and exports deletion pins.
The production TypeScript engine remains authoritative.

Deterministic cases include concurrent insertion and deletion, foreign changes
followed by undo, repeated undo/redo, and duplicate replay. Four saved random
seeds use sequential causal delivery. Two native process restart cases restore
snapshots that include or exclude saved `SyncClient.pending` operations, then
replay those original operations after foreign edits. The snapshot has a
Rust-owned format and explicit schema manifest. It is not TypeScript snapshot
compatible. Invalid restore must leave the prior state unchanged.

The [original receipt](../experiments/rust-shadow-harness/receipt.json) passed 614
full-state comparisons over 588 input batches and 1,214 records. Native tests
passed 9/9. The independent final audit confirmed all 53 source hashes and the
native binary hash, eight additional edge checkpoints, and a fresh-process
restore. These results apply only to the declared slice and recorded inputs.

The History checkpoint passed 1,039 full document and exact shared-history
graph comparisons, 291 generated inverse/caret comparisons, and 1,046 pin
comparisons. Nine native child processes cover eight restarts. Actual
`SyncClient.pending` delete, format, undo, and redo batches are replayed twice
after a matching document/history checkpoint and a foreign edit. The history
graph stays unchanged during replay. Later undo/redo preserves the foreign
deletion or formatting write. Pending inverse recovery requires saving the
history transition after generation; regeneration from an older checkpoint is
outside this slice. These are checkpoint/replay tests, not durable storage or
complete server recovery tests.

The [selection harness](../experiments/rust-selection-harness/README.md) passed
281 document/history comparisons, 27 native inverse comparisons, 150 captures,
7,604 endpoint resolutions, and 3,803 range comparisons. Three actors create
concurrent changes before delivery. Two saved seeds cover 96 delayed batches
and 96 duplicate batches. UTF-16 surrogate boundaries, reversed selections,
deleted-token fallback, and a fresh process restore are checked. Strict
selection rejects unknown keys; raw unknown-key lookup returns the start.
Native capture accepts valid offsets only; invalid-offset clamping parity is
not claimed.

At this checkpoint, native tests passed 23/23 and focused TypeScript regressions
passed 72/72. All recorded before/after/current hashes matched across the three
receipts. The existing apply-only checks also passed 614 states on the new
binary in a [separate receipt](../experiments/rust-shadow-harness/receipt-current-history.json).
The original receipt remains unchanged. HANDOFF section 5.85 records the exact
checkpoint and independent review.

Local recording accepts unique builder-produced operation tickets for the
same actor and existing targets. It is not an idempotent submission API.
Already-present pending operations must use plain apply rather than record
again. Raw TypeScript object-reference aliasing is outside this JSON contract.
Native invalid records and restores preserve the existing document and history;
native checkpoint validation is stricter than raw TypeScript History validation.
General acceptance/rejection parity is not claimed. The native document and
joint checkpoint formats are not TypeScript document snapshot formats.

The subsequent [paragraph structure slice](../experiments/rust-structure-harness/README.md)
passed 507 full states and exact History graphs, 75 generated inverse/caret
comparisons, 642 captures, 9,284 range comparisons, and 18,568 endpoint checks.
It compares immutable node identity and boundaries, birth type-register tickets,
full blocks and aliases, and character membership. Three concurrent same-boundary
Enters create one extra paragraph. Deleting the primary marker promotes a live
alias. Merge and its undo preserve foreign text. Physically separated aliases
must not redirect following text into an earlier paragraph.

Two saved seeds cover 20 genuinely concurrent three-actor rounds, 120 delayed
and 120 duplicate deliveries. Pending split and merge each restore a fresh native
process, replay the original operations twice, and preserve both History and
foreign text. Native tests passed 31/31. All previous apply, History, and selection
harnesses passed again against this binary in separate current-structure
receipts. The earlier receipts remain unchanged. HANDOFF section 5.86 records
the final sources, binary, audit, tests, and reproduction commands.

The opt-in path uses explicit native snapshot v2 with its exact capability.
Base v1 retains its original format and excludes nodes. Both are native-owned
formats. Unsupported logical split/join boundaries, placement, derived storage,
arbitrary node attributes, and type changes remain blocked. Selection across
paragraphs is covered only for these legacy paragraph markers.

The [block and attribute harness](../experiments/rust-blocks-harness/README.md)
passed 746 full document states and exact History graphs, 102 independently
generated inverse/caret comparisons, 746 pin comparisons, 750 captures, 12,714
ranges, and 25,428 endpoint checks. Three saved seeds cover 36 truly concurrent
three-actor rounds, 216 delayed deliveries, and 216 duplicates. Fourteen
admission checks compare the actual TypeScript `Doc.check` with the native
validator. Six fresh-process cases restore actual pending attribute updates,
type changes, block insertions, deletions, undo, and redo. Exact replay preserves
History, foreign text, and later same-key attribute writes.

Attributes include alignment enums, heading levels, image source/width/boolean
flags, and bounded JSON metadata. Missing/null attributes project their defaults.
Text `$type` changes retain immutable birth identity and hidden attribute
registers. Admission follows the immutable shape, rather than the receiver's
current displayed type. JSON `meta` is one atomic LWW attribute; this does not
implement nested field merging. History grouping preserves JavaScript object
key order and Number equality. JSON wire strings require valid Unicode scalar
strings; isolated-surrogate attribute strings fail closed. All UTF-16 text units
remain supported. Raw in-memory signed zero, arbitrary JSON depth, and generic
acceptance/rejection parity are not qualified.

Native tests passed 40/40, formatting and Clippy passed, and the offline build
passed. Focused TypeScript reference regressions passed 104/104. All four earlier
harnesses passed again on the same final binary in distinct
`receipt-current-blocks.json` files. All five receipts bind the same 73 files,
including tests, both schemas, ordered-JSON dependencies, and the native binary.
The 21 preexisting receipts remain unchanged. HANDOFF section 5.87 records the
checkpoint, independent review fixes, supported boundaries, and reproduction.

A separate [nested manifest](../experiments/rust-shadow/schema-nested.json)
adds recursive callout bodies and `table > table-row > table-cell >
table-cell-body`. Root, callout, and cell-body flows accept paragraph, heading,
divider, image, callout, and table blocks. The explicit schema identity is
`nested-flows-tables:json-attrs:v1`, with exactly the native capability
`nested-flows-tables-v1` and native snapshot v4. Earlier modes remain separate.

Rust now stores each physical line with its owner, slot, deterministic head,
and token order. Parent and axis deletion hide descendant lines without
discarding their contents. Full-grid projection retains covered cell text and
attributes. Spans use physical endpoints and live axis counts. Overlaps select
descending writer tickets, with register insertion order retained for equal
tickets. Native History independently generates nested text, block, axis,
cell-attribute, and span inverses.

Comparison uses a canonical storage read. Both engines materialize all valid
zero-clock body/axis/cell heads for physical owners and row/column intersections,
including deleted owners and axes, then compare lines in key order. Authored
token order, values, and deletion ledgers stay fully compared. This does not
claim equality of TypeScript's lazy allocation footprint or snapshot bytes.
Nested selection rejects endpoints inside covered cells, deleted axes, or
deleted ancestors; raw token lookup retains the reference escape behavior.

Joint restore first rebuilds line membership and immutable births, then checks
current registers and History against the complete state. A current register
and a History state with the same writer cannot disagree on their value. A
foreign newer writer can legitimately make saved History stale. Invalid restore
preserves both document and History.

The [nested harness](../experiments/rust-nested-harness/README.md) records the
current recursive-model, physical-storage, concurrency, History, selection,
admission, and fresh-process pending replay evidence. HANDOFF section 5.88
records the exact final checkpoint and reproduction commands. Native server
recovery, crash durability, protected GC, WASM, Chrome, and performance remain
outside this semantic slice.

The final nested receipt passed 582 full document/History comparisons, 85 native
inverse/caret comparisons, and eight fresh-process restores. Three saved seeds
cover 24 three-actor rounds with 144 delayed and 144 duplicate deliveries.
Recovery specifically preserves bold foreign tokens inside a deleted parent,
deleted column, and covered cell through replay and undo/redo. Native tests
passed 50/50; focused TypeScript reference tests passed 115/115. All five earlier
harnesses passed again on the same binary in separate current-nested receipts.
The six receipts share the same 78-file before/after/live manifest; 26 historical
receipts remain unchanged. Complete request/response records are retained in a
compressed trace bound by raw and compressed SHA-256 values.

A separate [shape manifest](../experiments/rust-shadow/schema-shapes.json) adds
groups, inline nodes, and string-valued spans to the recursive schema. It uses
schema `groups-inline-spans:json-attrs:value-marks:v1`, exactly capability
`groups-inline-spans-v1`, and native snapshot v5. Earlier v1–v4 modes retain
their existing contracts and reject the new shapes without that opt-in.

`list-item` text tokens stay in their physical flow. Contiguous items with equal
`level` and `listType` form a flat `list` model node; group attributes move onto
that container in the model. Inline images retain their own token ID and consume
one text position, represented by U+FFFC in block text. String-valued `link`
registers form `inline-hyperlink` runs. Null and empty links are omitted, boolean
marks stay inside the span, and inline units stop spans. Group/span containers
do not create storage tokens. Selection paths include group item indexes but
do not add a level for span runs.

The TypeScript authoring compiler supplies explicit non-inherited link marks in
the wire operations. Rust applies them and independently computes projection,
History inverses, selections, and recovery. A native high-level editing compiler
is not delivered by this slice. The pinned schema has string links, not
object-identity-valued spans or URL-pattern qualification. Required-group/private
boundary hints and other schema constraints remain open.

The [shape harness](../experiments/rust-shapes-harness/README.md) records direct
group split/merge cases, inline and span operations, causal three-actor traces,
exact foreign-write ownership, and fresh-process pending replay in the same
affected item and range. HANDOFF section 5.89 records the exact final checkpoint,
reproduction commands, and remaining boundaries.

The final new receipt passed 606 full document/History comparisons, 71 native
inverse/caret comparisons, 5,812 selection captures, and nine fresh-process
pending recovery cases. Three saved seeds cover 24 three-actor rounds with
144 delayed and 144 duplicate deliveries. Native tests passed 60/60, focused
TypeScript regressions 128/128, and all six earlier harnesses passed again on
the same binary. Seven receipts share the same 83-file before/after/live
manifest. The prior 32 receipts and historical compressed trace remain
unchanged. Independent live recovery replay reproduced 72 complete responses
in nine new processes and confirmed foreign token/register preservation across
63 phases. These are native semantic checks, not full server or browser proof.

Next R4 work proceeds in this order:

1. Runtime schema loading through a per-document compiled schema, replacing
   pinned type-name rules. This is not implemented yet.
2. Compatible live schema transitions that preserve pending operations, History,
   selection anchors, schema identity, and recovery protection.
3. Required-child/group boundary rules, field-level attributes, additional
   value-mark cases, protected GC, and serialization boundaries.
4. Broader multi-actor differential and recovery evidence before R5 adapters.

### Movement and logical text storage checkpoint

The pinned [movement interpreter](../experiments/rust-shadow/README.md) uses
schema `movement-logical-storage:json-attrs:value-marks:v1`, exactly capability
`movement-logical-storage-v1`, and native snapshot v6. Its manifest retains the
same nine shapes as v5. Earlier v1–v5 modes keep their existing contracts.

Retained placement records move text blocks, atoms, callouts, tables, and
individual list items while preserving physical origins and token identity.
Ticket-ordered replay suppresses ancestor cycles. Private text/fragment heads,
logical split births, join aliases, and virtual trailing-text promotion retain
foreign input without copying it. Rust generates Move and Split History
inverses independently, fences them with current placement ownership, and
validates coupled document/History checkpoints before replacement.

The [movement harness](../experiments/rust-move-harness/README.md) passed 360
complete state/History comparisons, 56 native inverse/caret comparisons, 802
selection captures, 2,833 range comparisons, and 5,662 raw endpoint comparisons.
Five fresh-process restores replay actual pending move, split, join, undo, and
redo operations twice, then run four History actions. Foreign text and original
node writers remain intact. Three seeds cover 12 three-actor rounds with 72
delayed and 72 duplicate deliveries. The automatic leading gap fixture uses
actual editing commands; the separate hidden trailing-gap fixture identifies
its low-level physical seed before command-driven promotion and split/resplit.

Four additional raw endpoint comparisons are **NOT_RUN**. The TypeScript
reference throws a null-owner `TypeError` for the hidden root gap
`0@~text:0%40~root:`. The harness records only that exact key, error, hidden
location, and null owner as an omission. All strict `InputSession.resolve`
comparisons still run, including null results. This is a known reference bug,
not complete raw endpoint parity. A source/synthetic ProseMirror undo selection
probe can propagate the same exception; no browser occurrence is established.

Native tests passed 74/74, including 14 new movement tests. Offline build,
formatting, and isolated stable-toolchain Clippy passed. Focused TypeScript
movement regressions passed 47/47; separate schema-transition reference tests
passed 21/21. Seven previous harnesses passed again against the same frozen
binary in distinct `receipt-current-move.json` files. All eight receipts bind
the same 88-file before/after/live manifest. Independent review passed 15
semantic checkpoints and atomically rejected 14 malformed checkpoints and five
invalid move batches. HANDOFF section 5.90 records the full evidence boundary.

### Hidden root-gap cursor correction

The subsequent correction terminates raw anchor escape at root start only when
hidden private storage has no owning node. TypeScript no longer calls
`posFrom(null)`. Rust applies the same terminal fallback after checking visible
logical placement. Existing owned nested, neighboring-cell, and deleted-owner
fallbacks retain their behavior. Strict editor selection still rejects hidden
endpoints; the correction does not make hidden content visible or emit edits.

Six focused TypeScript tests cover empty/nonempty replacement roots, exact
fallback paths, snapshot/clock/History/operation purity, strict null ranges,
nested/deleted owners, and a synthetic ProseMirror undo/redo caret. Five failed
before the correction; all six now pass. The complete library suite passed
726/726 and type checking passed. Native tests passed 75/75, including the new
cursor case; offline build and isolated stable Clippy passed.

The new movement receipt is
`experiments/rust-move-harness/receipt-current-cursor.json`. It compares all
5,666 raw endpoints, including exactly the four formerly omitted checkpoints.
`rawEndpointStatus` is PASS and `rawEndpointNotRun` is zero. All four fallback
outputs match root start, while their strict ranges remain null. Document,
History, and inverse counts remain 360, 360, and 56. These are finite declared
semantic comparisons, not a complete R4 gate. Historical partial receipts and
their traces remain unchanged. HANDOFF section 5.91 records the new checkpoint.

### Dynamic schema delivery

Rust can use a schema supplied as data. Current shadow modes instead use
compiled-in manifests, explicit version flags, and type-name branches in
validation, projection, selection, and History. Passing a new JSON object to
the constructor alone would not provide runtime schema support. There is no
current Rust arbitrary-schema registry or live schema transition API.

The next schema milestone will build an immutable per-document `CompiledSchema`
from validated JSON. It must hold node shapes, allowed children and groups,
grid chains, defaults, next/text rules, attributes and limits, mark/span rules,
inheritance, and grouping keys. Validation, projection, model paths, History,
and checkpoint admission must use this compiled data. Schema identity must use
the same canonical digest as TypeScript, including UI metadata. Unsupported
descriptors must reject before any live state changes.

Its acceptance gate needs at least two independently renamed schemas active in
one native engine, with different roots, node names, grid chains, group keys,
and span-mark names. Compare both against TypeScript through editing, History,
selection, and checkpoint restore. Reject invalid references/rules/defaults and
wrong digests atomically. Pinned fixture success does not satisfy this gate.

Loading a schema when creating a document is separate from replacing one on an
open document. The later transition must follow the current TypeScript
append-only compatibility rules and atomically check epoch, server sequence,
and schema version. Existing node attributes, defaults, value marks, rules,
root, and UI stay unchanged under that compatibility contract. New nodes,
allowed new child types, and boolean marks can be appended in the permitted
order. Incompatible migration is a separate feature.

Prepare and persist the compatible replacement before switching active state.
Retain actor identity, exact pending operations, shared History ownership, and
recovery/GC evidence. Pause old clients on a digest mismatch. Open-editor
replacement must retain both selection anchors and verify reconnect before
resuming input. TypeScript already supplies compatible in-memory schema/editor
transition and separate schema-bound recovery safeguards. Rust must implement
and qualify their integration. Recovery-proof migration across schema versions
is not established by these tests.

These slices do not complete R4. They do not establish full server recovery,
protected GC, protocol compatibility, R5 adapters, production behavior, WASM,
Chrome, or performance. The remaining R4 scope must preserve node identity,
general attributes, schema validation and transitions, GC protection, and
serialization behavior beyond the declared pinned shape and attribute cases.

Build deterministic and randomized differential traces for multiple actors.
Include reordered and duplicate delivery, concurrent insert/delete/move,
invalid operations, history, snapshots, reconnect, and schema changes. Compare
public document state, stable IDs, accepted/rejected outcomes, history behavior,
and protocol/snapshot output at declared checkpoints. Record any intentional
format difference as a separate compatibility decision.

**Gate:** all declared semantic fixtures pass with saved traces and reproducible
failure seeds. Unsupported behavior must be explicit and blocked. Storage
checksum equality cannot satisfy this gate.

### Native SDK delivery

The private [native SDK](../experiments/rust-sdk/README.md) now exposes direct
Rust calls over the same semantic core. It does not spawn the JSONL driver or
replace the TypeScript production engine. `Document` provides typed text edits,
explicit `Op` recording, remote replay, model reads, actor-owned undo/redo,
selection, coupled checkpoint restore, and exact pending-prefix acknowledgement.
Its closed `SchemaPreset` enum selects the six existing native modes; it does
not implement runtime arbitrary schemas or live transitions.

The initial Document SDK checkpoint passed 14 unit/integration tests, formatting, Clippy, the runnable
two-author/restart example, and a README doctest. Eight independent review cases
checked preset/UTF-16 restore, tombstones, clock exhaustion and forged pending
rejection. An independent TypeScript authoring comparison passed 20 actions and
40 actor states, comparing generated operations, models, History availability,
and pending operations. The comparison normalizes UTF-16 text representation,
omitted empty birth marks, and omitted empty model containers; it does not
compare full History ownership graphs at the SDK layer.

All 14 existing Build an editor guides now contain SDK-first programs. Their
14 printed Rust examples compile and execute with 41 assertions. Previous raw
protocol probes remain as expandable engine-inspection examples. The central
Rust guide distinguishes native SDK calls from missing editor adapters.

Current History commands stage a full native checkpoint restore before
committing decoded results and pending metadata. This gives an explicit error
boundary, not a performance gain. The SDK has no full native `doc.edit()`
compiler, mark-inheritance compiler, transport, storage driver, Node binding,
WASM package, editor adapter, or MCP adapter. It is not published to crates.io.
SDK delivery does not complete R4 or satisfy R5. The new Tiptap extension uses
the TypeScript engine; its Chrome evidence is not Rust browser evidence.

### Binding packages and backend seam

Core, ProseMirror, Tiptap, Slate, and Lexical now have independent npm package
boundaries. `@barocss/doc-sync` contains the dependency-free core and the four
editor bindings use independent packages. All five remain private; local JavaScript/declaration tarballs and independent
consumer checks do not constitute registry publication.

The production TypeScript `EditorHost` adapter delegates to existing
`SyncClient` and `InputSession` paths. The shared ProseMirror implementation
uses this interface; its legacy `PmBinding` wrapper and Tiptap preserve their
client-based APIs. Host models are borrowed views and ordinary edits do not
fork a snapshot. This differs from the separate DTO engine prototype, which
stages full checkpoints and is not a production hot path.

Slate and Lexical now use the same host/session boundary, while legacy wrappers
preserve their client and input-session APIs.
An actual Rust/WASM host still needs schema/compiler, events, composition,
history, recovery, and GC parity. No `engine: 'wasm'` option or Rust editor
adapter is established by splitting packages or adding the TypeScript host.

### TypeScript read and canonical-path qualification

After bounded reads and stored-group canonical path mapping were added to TypeScript, all eight native differential suites passed again against the packaged Core. Their 401 common source/compiled/native inputs matched before, after, and live checks. The fixed-schema comparisons cover 4,735 states, 707 independent inverse comparisons, 39 coupled restores, and all 5,666 movement endpoints. The original historical artifacts remain unchanged.

The exact multi-type attribute-domain fixture from the TypeScript path correction is not a supported Rust manifest. Its TypeScript test passes; native parity for that schema remains NOT_RUN. This qualification does not add dynamic schemas, SDK authoring coverage, WASM, or a Rust editor backend. R4 remains in progress.

## R5. Add native server and WASM client shadow adapters

**Status: planned after R4.** Native-server and WASM-client adapters have separate
exit gates. The native server is not required to release a qualified WASM client.
Run each adapter beside its corresponding current TypeScript path. TypeScript remains authoritative.
Feed both engines the same recorded operations and compare their results.
Rust shadow output must not submit a second edit or change participant history.

Preserve the supported protocol, schema fingerprints, actor identity, exact
receipts, recovery generations, pending changes, and GC reservations. Define
startup, shutdown, cancellation, disposal, and failure behavior. Test both
adapter directions with existing editor bindings and transport boundaries.

**Gate:** saved server/client integration traces show parity for the declared
scope, including restart, reconnect, lost responses, recovery, and undo/redo.
Report native server evidence and browser client evidence separately. Keep
unsupported recovery and schema transitions blocked.

## R6. Apply end-to-end gates and decide go or no-go

**Status: planned after R5.** Agree on acceptance targets before judging Rust.
Use the same source checkpoint, document sizes, actor counts, machines,
runtimes, and workloads for both engines. Include local editing, far jumps,
large reads, concurrent edits, reconnect, recovery, and long-lived documents.
Measure actual editor input through transport, remote DOM match, and a second
rendering opportunity. Keep this distinct from physical display latency.

Report correctness, startup, throughput, p50/p95 latency, repeated-run
variability, memory, transfer, and disposal costs. Separate native server,
WASM client, storage-only, and full editor results. Include regressions and
missing evidence. Real OS IME and production deployment need their own checks.

**Gate:** make an explicit go/no-go decision from semantic parity, integration
reliability, measured product targets, compatibility, and a rollback plan.
Define the supported migration scope before changing production. A go decision
for one adapter does not approve the other. A no-go result may retain a useful
experimental component without replacing the TypeScript engine.

## Current decision

R1 has bounded evidence. R2 passed its declared bounded storage comparison
gate with native, independent JavaScript, and Node 24/Chrome WASM evidence.
R3 passed its declared bounded boundary and lifetime gate with Node 24 and
Chrome evidence; pure ABI/allocation isolation and production behavior are not claimed.
R4 is in progress with bounded native History, pending replay, UTF-16 selection,
legacy paragraph split/merge, pinned text/atom attributes, and recursive
flow/grid storage and recovery, group/inline/string-span projection, and pinned
movement/logical split/join comparison evidence. The four previously omitted
raw endpoints now pass after the narrow TypeScript/Rust fallback correction.
An initial typed native SDK is available with separate authoring/restart tests.
Runtime compiled schemas,
live transitions, broader schema/value rules, and the R4 gate remain open. R5 and R6
remain planned.
The current WASM path has no measured gain over JavaScript
Gap. The no-WASM native path has lower edit and pipeline medians in all six
measured conditions and lower sampled whole-process RSS. That result supports
further native experiments; it does not measure the production server or
isolate an intrinsic Rust language benefit. Storage gains against string/Vec
candidates can come from the gap algorithm; JavaScript can use that algorithm
too. These bounded results do not approve a production migration. R4 still
requires broader semantic evidence. R5 and R6 still require
separate integration and product evidence; the formal R6 decision is pending.
Full CRDT equivalence, production Rust integration, and editor performance
acceptance remain **NOT_RUN**. There is no blanket Rust performance promise.
