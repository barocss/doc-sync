# Rust engine roadmap

This roadmap separates Rust research from production engine delivery and the
[bot roadmap](bot-roadmap.md). The current TypeScript server and client remain
unchanged by these experiments. A storage result does not approve an engine
migration. Each stage needs its own evidence and decision.

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

The SDK passed 14 unit/integration tests, formatting, Clippy, the runnable
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
boundaries, with the original package retained as a compatibility facade.
All six remain private; local JavaScript/declaration tarballs and independent
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

**Status: planned after R4.** Run a native Rust server adapter and a WASM client
adapter beside the current TypeScript paths. TypeScript remains authoritative.
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
