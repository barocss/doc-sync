# Schema editing correctness roadmap

Schema-valid output is necessary. It does not establish correct command intent,
stable identity, selective undo, safe recovery, or usable editor behavior. This
queue adds those gates to the [Rust delivery roadmap](rust-roadmap.md). It does
not replace D1–D9, the [spreadsheet roadmap](spreadsheet-roadmap.md), the
[graphic roadmap](graphic-roadmap.md), or the [recovery plan](recovery-plan.md).

## Evidence boundary

Current bounded checkpoints include the 2026-11-16 column continuation and local
catalog prototype. Earlier results retain their original source scope. Q1 group/grid
insertion passes a source-bound TS/native comparison of 22 profiles and 481
actions. The [report](reports/rust-d3-group-grid-2026-11-04/README.md) preserves
the supported subset, source maps and first failures. This does not close full
D3 or the following queue.

Q1.2 adds an insert-only atomic native batch. Its explicit-marker candidate
passes fresh TS/native comparison: 14 profiles, 351 actions and 702 actor states,
plus native core194/SDK159 and two independent full-program documentation
consumers. The earlier broad clock-canonicality failure and corrected candidate
are recorded separately. It preserves shared column
identity, foreign edits, History and reservation clocks. See the
[batch report](reports/rust-d3-batch-2026-11-04/README.md).

Q1.3.1 adds strict stored-block/flow targeting and a local read base. Fresh
TS/native authoring passes 14 profiles/390 actions/780 actor states; core194,
SDK173 and two complete documentation consumers pass. See the
[targeting report](reports/rust-d3-targeting-2026-11-05/README.md).

Q1.3.2 adds typed row adjacency and cell-body edges. Fresh independent TS/native
authoring passes 14 profiles/435 actions/870 actor states; core194/SDK182 and two
complete documentation consumers pass. Its moved-grid fixture exposed a TS
birth-line lookup bug. The accepted-placement fix passes focused source/dist
checks and the fresh whole workspace suite. See the
[axis-targeting report](reports/rust-d3-axis-targeting-2026-11-05/README.md).

Q1.3.3 implements one explicit column command. The historical independent
comparison covers 14 profiles/422 actions/844 states; the Nov 16 continuation
checks its source binding and native/inherited regressions without rerunning
that comparison. See the
[column report](reports/rust-d3-column-targeting-2026-11-16/README.md).
Q1.3.4 has a local catalog prototype with five focused and 30 inherited targeting
tests recorded on Nov 16. Broader qualification and alias diagnostics remain open.

`Implemented, bounded` identifies existing source or a recorded bounded result.
`Remaining` identifies a feature or broader delivery gate. `NOT_RUN` identifies
an acceptance check without a result in this roadmap. Source inspection here
does not rerun tests. A passing seeded corpus does not prove all schemas.

Existing coverage includes more than schema validation:

- TypeScript randomized editing already includes tables, axes, merged cells,
  nested flows, network delivery, History, GC, and an editor-event model mirror.
  See [fuzz-core.ts](../packages/doc-sync/test/fuzz-core.ts) and
  [fuzz.test.ts](../packages/doc-sync/test/fuzz.test.ts).
- Product fixtures retain hidden cell content and peer fields during merge and
  selective undo. See [product-schemas.test.ts](../packages/doc-sync/test/product-schemas.test.ts)
  and [merged-grid.test.ts](../packages/doc-sync/test/merged-grid.test.ts).
- Move/split/merge, foreign writer protection, automatic children and checkpoint
  restoration have focused TypeScript regressions. See
  [move-history-review.test.ts](../packages/doc-sync/test/move-history-review.test.ts)
  and [move-structure-regressions.test.ts](../packages/doc-sync/test/move-structure-regressions.test.ts).
- Nested field patches, resets and same-value ownership already have tests in
  [nested-fields.test.ts](../packages/doc-sync/test/nested-fields.test.ts).
- Compatible schema changes with pending edits, backward selection, composition
  refusal and failed installation already have tests in
  [open-editor-schema.test.ts](../packages/doc-sync/test/open-editor-schema.test.ts).

These features must not be listed as absent from TypeScript. General native
command compilation, native sessions/recovery/GC (D4), the full CRDT WASM package
(D6), and selected production WASM bindings (D7) remain separate open gates.

## Ordered work

### Q1. Complete the current group/grid insertion slice

**Status:** implemented, bounded. Group/grid construction and logical group,
grid, row, cell and cell-body insertion pass 22 profiles/481 actions/962 actor
states: 14 original Word/Presentation profiles, two explicit recursive-cell
schema compositions and six generated custom schemas. Native core189/SDK152
pass. Earlier flow/text and moved-path insertion retain their own reports.

Extend the existing `insert_model_at` API for group/grid insertion with clear
accepted model shapes, parent paths, automatic children, required slots,
row/column identity and field defaults. Keep physical helper operations distinct
from model-path commands. A schema `group` is a derived wrapper around text
members. It has no separate stored object identity and cannot contain a table.
Unsupported commands must return an explicit error before live mutation.

**Acceptance:** independently author the same supported command in TypeScript
and Rust. Compare the complete expected model, operations, stable IDs, pending
queue and actor-owned History after each action. Include empty and populated
parents, required leading/tail children, existing moves, concurrent same-gap
insertion, undo/redo and own checkpoint restore. Rejection preserves model,
clock, pending and History. Record normalization differences separately.

**Dependencies:** D2 accepted runtime schemas; existing D3 insertion/compiler.
**Completed deliverable:** the group/grid report records exact operations,
History, retained content, independent model oracles, selection and own checkpoint
restore. Runtime Document direct covered-cell capture/resolve is fixed; hidden
descendant flows remain outside that subset. Empty group/grid native rejection
versus TS normalization is a separate API policy. Q1.2 now supplies bounded
insert batches; Q1.3/Q1.4 targeting and host contracts remain next.

### Q1.2. Add an atomic native batch-edit API

**Status:** implemented, bounded to model-child INSERT commands. The additive
`RuntimeDocument::insert_models_batch(&[ModelInsert], options, now_ms)` API passes
14 profiles/351 actions/702 actor states across the original Word/Presentation
and a small custom schema. It does not accept general delete, update, split,
merge, move or text-offset commands; those remain D3 compiler work.

Deliver a native batch-edit API that compiles an array of supported commands
against one evolving candidate and records one atomic History action. Preserve
the TypeScript batch compiler's shared column memo across row operations. A
later command must see the earlier command's model changes; it must not allocate
a second column identity for the same batch boundary.

**Acceptance:** insert a grid, extend several rows at the same column boundary,
then insert into those cells in one batch. Compare stable axes, complete models,
pending operations and one undo/redo action with TypeScript. An invalid later
command leaves the whole live batch, clock, pending queue and History unchanged.
Include a peer edit between batch commit and undo to check foreign ownership.
Define normalized no-op results and reserved-clock persistence explicitly. The
strict `(Key, Change)` single insertion API still rejects normalized-empty
structures and trailing reserved-only edits. The batch returns optional keys,
one aggregate Change and before/after clocks. A requested empty grid can have no
key yet create a paragraph tail or reserve a fragment clock, depending on the
position/projection state. Empty operations preserve redo and add no pending
entry; preparation operations may exist independently of the requested model.
Runtime restore retains an explicit reservation marker matching the saved clock
above the replayed journal. Without that marker, clock equality remains strict.
Canonical-journal validation is preserved; observing the reserved ticket or a
higher ticket removes the marker. Older native readers are not qualified for
this optional checkpoint extension.

**Dependencies:** Q1 command subset and explicit batch normalization contract.
**Completed deliverable:** one evolving candidate, shared multirow column memo,
single commit, late-error checkpoint identity, foreign edit/undo/redo/retry and
own checkpoint comparisons. Default History options produce one undo group;
typing coalescence retains its existing rule. Known unsupported empty-grid
placement and out-of-range no-op inputs still have a stricter native policy
than TS normalization. **Next:** Q1.3 stable targeting; general batch commands
remain independently gated D3 work. Fixed sequences do not close Q2 fuzz.

### Q1.3. Define identity-relative and stale-base edit targeting

**Status:** Q1.3.1 is implemented, bounded to strict before/after stored primary
blocks and root/stored-flow edges. `read_model_for_edit` returns an opaque
process-local base; `insert_models_relative` checks it before one atomic insert
batch. Fourteen profiles/390 actions pass independent authoring. Immutable IDs,
stable anchors and TS server conditional checks remain distinct existing APIs.

A current model path identifies a position, not a permanent object. Specify how
a caller edits relative to a stored node ID or stable grid/row/column identity,
and how the host rejects or rebases a command planned from an old document or
schema version. Reuse existing lookup/anchor and conditional-server machinery;
do not create a second identity system or treat a Lamport maximum as a complete
document version. Derived list wrappers have no separate stored identity.

**Acceptance:** move/reorder/delete between read and commit cannot silently edit
an unrelated object at the old index. Missing/hidden/deleted targets follow an
explicit policy and leave live state unchanged on rejection. Distinguish a
synchronous local mutable borrow from a distributed read/commit guarantee.

**Dependencies:** Q1.2 command/result contract and D4 version/schema lifecycle.
**Completed Q1.3.1:** private incarnation/revision/schema identity, checked
publication gates, lower-clock remote invalidation, restore ABA rejection and
strict root-reachable lookup. Aliases, synthetic heads, characters, axes and
hidden/covered targets reject without nearby-node fallback. Result keys can
still name intrinsic heads and are not automatically valid relative anchors.
The guard is O(1); model reads, lookup and compilation are not. No full snapshot
is retained per token. This is not distributed conditional acceptance.

### Q1.3.2. Add typed row and cell-body targets

**Status:** implemented, bounded. `insert_grid_models_relative` accepts typed
`GridRowTarget` and `GridCellTarget` with the existing opaque local read base.
Fresh comparison covers 14 profiles/435 actions/870 states across three schemas;
core194/SDK182 and two complete doc consumers pass.
Use explicit `{grid, row}` for BeforeRow/AfterRow and `{grid, row, column}` for
InsideCellStart/End. Prove live axis ownership and current root-reachable grid
identity. Reject currently covered cell tuples; a merge anchor remains valid.
Never invent an identity for the model cell or body wrapper.

Lower row commands to the existing RowModel compiler with its fixed width,
span growth and hidden-payload retention. Validate the current structural target,
not the resulting cell visibility: a new row inside a merge may become covered
under the existing anchored span rule. Do not tighten that collaboration rule.

**Acceptance:** old bases reject after peer axis insertion/deletion; fresh bases
follow the same IDs at new indices. Wrong-grid tuples, deleted axes and hidden
grids reject atomically. Compare row/span operations, hidden payload and foreign
writers through undo/redo, own restore and exact retry in Word/Presentation.
Generic Q1.3.1 block/axis rejection stays unchanged.

**Completed:** one evolving candidate, fixed-width row payloads, current tuple
ownership, late-error atomicity with nonempty redo, moved grids, stale bases,
merge-anchor growth, hidden new-row payload/peer writers, both undo orders,
checkpoint restore and retry. Newer overlapping span writers retain their
existing precedence; computed `spanned` input does not create a writer. The TS
compiler now refreshes a moved grid through its accepted current parent rather
than its birth line. Its fast path for documents without projection is retained.
The fresh workspace has 2168 PASS/two expected platform SKIPs; typecheck passes.
No Chrome, performance, WASM or durable native server recovery is qualified.


### Q1.3.3. Create one column with one explicit command

**Status:** implemented, bounded. `insert_column_relative` accepts a grid, stable
boundary and unique row-ID/cell-model payloads. It resolves one boundary against
one evolving candidate and shares its fixed column index internally. Exactly
one new column and one default History group result. Omitted rows get defaults;
empty payloads seed the first live row to create one structural column.
Repeated public calls create distinct columns. Duplicate/wrong-grid rows reject
atomically. Caller row order controls span-writer priority.

The historical comparison covers 14 profiles/422 actions/844 states. Its source
and binary binding was checked during the Nov 16 continuation; the comparison
was not rerun then. Native tests, example, two locked documentation consumers
and inherited regressions passed in that continuation. See the
[column report](reports/rust-d3-column-targeting-2026-11-16/README.md).
General multi-column atomic commands and axis moves remain open. Repeated
Before(existingColumn) across rows can shift the old index; this explicit
single-column API does not qualify a generic translation of that pattern.

### Q1.3.4. Add a typed native read catalog and alias diagnostics

**Status:** local prototype implemented; full qualification remains open.
`read_model_with_catalog` returns one captured model and opaque local edit base,
stored primary block paths/types/flow capability, owned grid axes and uncovered
cell tuples/body paths. Synthetic defaults/group wrappers and covered descendants
are excluded. Five focused tests, 30 inherited targeting tests and a runnable
example passed in the Nov 16 prototype receipt; these are historical results.
Broader required/nested fixtures, independent comparison, complete consumers and
explicit alias diagnostics remain open. Paths apply only at the captured base.
Commands still validate each target. This is not a server token or authorization.
See the [example](../experiments/rust-sdk/examples/runtime_id_catalog.rs).
TS bounded reads already distinguish stored IDs from derived wrappers.

Define current primary, alias, missing, deleted, hidden and synthetic outcomes
without silently retargeting a requested ID. Preserve strict mutation targets;
diagnostics may report a canonical primary for a caller to reassess after a new
read. Bound reads and bind continuation to the same local revision. Native host
or server read tokens require their separate D4 contract.

### Q1.4. Retain host authorization across preparation and retry

**Status:** hosted TS tool authorization, proposal-owner revocation and trusted
server policy hooks exist. Native/session acceptance coverage is remaining;
this is not a missing TS ACL feature. See
[hosted authorization](../apps/mcp/src/hosted-auth.ts),
[proposal recovery tests](../apps/mcp/test/proposal-process.test.ts) and
[server policy hooks](../packages/doc-sync/src/server/hub.ts).

**Acceptance:** revoke write or schema permission after preview, while offline,
and before direct edit, retry, undo, redo or schema transition. The host denies
unauthorized work before mutation or persistence and preserves pending evidence.
Schema validity and owned History do not grant permission. Keep denial, stale
base and unknown acceptance distinct; do not infer a new ACL engine in the CRDT.

**Dependencies:** Q1.3 targeting and D4 host lifecycle. **Next deliverable:** add
these cases to the native host acceptance matrix before enabling hosted writes.

### Q2. Generate schemas and command histories with reproducible failures

**Status:** existing TypeScript fixed-schema fuzz is implemented, bounded.
A first deterministic generator/reproducer is implemented in
[runtime-document-schema-contract](../experiments/runtime-document-schema-contract/README.md).
Six renamed schemas and the three logical group/grid insertion steps pass
19 Node 24 source checks for schema validity, model closure, exact replay,
payload isolation and descriptor renaming. These six seeds also pass native
independent authoring in the Q1 corpus, including fixed peer field writes,
selection, own undo/redo, checkpoint restore and exact retries. Generated causal
schedules, arbitrary command histories and automatic reduction remain open and
**NOT_RUN for this new corpus**.
This is a test facility, not a new editing feature.

Source: [generator](../experiments/runtime-document-schema-contract/fixtures.mjs)
and [19 checks](../experiments/runtime-document-schema-contract/test.mjs).
Seeds 1701–1706 vary type/attribute/mark names and cover all four 1–2 row/column
dimensions. `exportReproducer(seed)` serializes schema, initial model, logical
edits, expected model and SHA-256 model hash. Source-bound receipts and saved
JSON reproducers are in the local `output/rust-d3-group-grid-2026-11-04/research`
directory. That source-fixture receipt is separate from the native authoring
receipt recorded in the Q1 report.

Generate a bounded subset of accepted schemas and valid initial models. Vary
descriptor names, depth, defaults, child limits, groups, grids and declared
fields. Keep unsupported manifest features in separate rejection cases.
Schedule two actors first. Preserve each actor's causal dependencies; distinguish
legal delivery permutations from deliberately invalid protocol input.

**Acceptance:** save seed, schema, schema fingerprint, commands, actor schedule,
source/binary hashes and first divergent state. Replaying a saved seed gives the
same failure. Reduce commands and schema while retaining validity and the same
failure class. Check convergence, command intent, selective undo, event-model
agreement and atomic rejection separately. A schema-valid wrong result fails. Documented computed normalization is part of the command
contract: independently derive anchored span adjustments, and also verify local
request plus requested normalization equals the actual model. An empty normalize
array without normalize:true/listener does not establish an exact request-only
model result.

Use an independent small expected-model rule where possible. Differential
agreement alone can preserve a shared bug. Start with schema-descriptor renaming
as a metamorphic relation: rename declared types/marks and their references,
then map the result back. Defaults/order remain unchanged; compare normalized
operations and model semantics without inventing ID equality across runs.

**Dependencies:** frozen Q1 input/API contract. **Completed Q2.1:** deterministic
schema generation, seed replay and the six-case bounded native integration.
**Next deliverable Q2.2:** generated causal scheduling and
validity-preserving reduction. The first JSON reproducer is deterministic but
is not called minimal: no reducer has run. Reuse the repository harness before
adding a test dependency.

### Q3. Edit and move nested structures under concurrent table changes

**Status:** TypeScript commands and focused/fuzz tests are implemented, bounded.
General native insert/delete/update/split/merge/move compilation remains open.
The combined native product-command matrix is **NOT_RUN**.

Deliver missing native commands in small slices. Include an explicit flow or
stored object container containing both a text-list group and a table, a table
cell body that contains a text-list group, reparenting, and moves concurrent
with deletion or text/field edits. The document schema `group` itself is a
derived text-only wrapper; do not assign it a stored ID or a table child.
Keep document-grid axes separate from the
StructuralSheet protocol; one cannot qualify the other.

**Acceptance:** cross-parent move plus peer cell edit retains cell identity and
peer text. Merge/unmerge plus row/column insert/delete/move retains hidden
content. Undo in both actor orders removes only owned changes. Check parent
cycle handling, positions after accepted/suppressed moves, empty source
replacement and all affected selection endpoints. Preserve retained storage as
well as the visible model.

**Dependencies:** Q1; Q2 replayer can support each slice. **Next deliverable:**
explicit command support matrix and one deterministic concurrent fixture per
interaction before broader seeded coverage.

### Q3.1. Preserve persistent annotation endpoints separately from cursors

**Status:** TypeScript annotations already have hidden/missing/cross-slot/
compacted statuses and protected endpoints. The native public annotation
authoring API and combined recovery fixture are remaining. See
[annotation regressions](../packages/doc-sync/test/annotations.test.ts) and
[the contract](spec.md).

**Acceptance:** annotate a cell paragraph, move/split it, merge its cell, insert
axes and edit peer metadata; undo in both actor orders, restore, then run
protected GC. Compare annotation status, metadata and writer identities as well
as content. A cursor may clamp to the visible merged cell; a hidden annotation
must remain hidden rather than attach to unrelated text. Define whether content
and annotation edits share the future batch transaction.

**Dependencies:** Q1.2 batches, Q3 structures and Q6 protected retention.
**Next deliverable:** native annotation command contract, followed by the named
combined fixture. Current cursor tests do not close this gate.

### Q4. Complete constraints, hidden-state and reference semantics

**Status:** required/overflow projection, field rules and hidden cells have
bounded existing coverage. Complete generic native compiler coverage remains
open. Graphic reference semantics and common-data reclamation are actual
product gaps documented in their own roadmaps. New cross-domain combinations
are **NOT_RUN**.

Define stored versus visible children at min/max boundaries, including max0,
defaults and required replacement. Define field reset, missing, null, explicit
default, same-value ownership and type-change behavior for supported commands.
Keep schema-source JSON handles distinct from document object ID references.
Declare merge granularity: a JSON array stored as one attribute is not a promise
of per-element collaborative editing. Use independently addressable fields or
common Map/List data when the application needs that intent, and define how
schema nodes reference that data. Native Map/List delivery keeps its own gate.
Do not use one reference test as evidence for the other.

**Acceptance:** concurrent overflow and delete/undo preserve hidden foreign
writers; later visibility reveals the correct content. Invalid depth, values,
field paths and references reject before mutation. Define same-document and
target-kind checks, deleted/missing targets, cycles and restoration. Graphic
effective-instance/override evaluation and graph reclamation need explicit
product decisions before their tests can pass.

**Dependencies:** D2 rules and each domain's reference contract; Q3 for compound
commands. **Next deliverable:** rule/command matrix with supported, blocked and
untested entries, then separately scoped reference semantics changes.

### Q4.1. Carry schema-value identity through model commands

**Status:** physical native block insertion accepts `SchemaAttributes` with
schema-source descriptors. `insert_model_at` accepts plain JSON, which cannot
carry a `SchemaValue` source handle. This is an actual bounded command-API gap.

**Acceptance:** define typed model values or explicit companion bindings before
claiming reference-aware model commands. Compare equal JSON from distinct
default/enum sources, shared groups, field leaves, clone fallback, undo and own
checkpoint restore. Compare reference descriptors and writers, not only values.
Keep document object references separate from schema-value handles.

**Dependencies:** Q1.2 command input/result design and existing D2 handles.
**Next deliverable:** typed-input design and one exact TS/native descriptor
fixture. The plain-JSON boundary remains explicit until implemented.

### Q5. Preserve offline pending work during compatible schema changes

**Status:** TypeScript compatible transition and editor rebuild are implemented,
bounded. Native live transition and corresponding D4 session support remain
open. Incompatible migration is a separate product decision, not promised here.
New native transition scenarios are **NOT_RUN**.

**Acceptance:** old-schema peers stop unsafe synchronization; compatible
additions preserve exact pending operations, actor-owned History and backward
selection. Cover remote acceptance while offline, another schema change during
installation, active composition, epoch reset, rebuild failure and unresolved
conditional outcome. Refusal preserves the checkpoint and draft. Never infer
rejection from a missing receipt or rewrite pending work to fit a new schema.

**Dependencies:** Q4 rule identity and D4 ports. **Next deliverable:** native
transition API contract plus a TS/native capability matrix; reuse existing
[schema transition rules](../apps/docs/src/guide/schema-transition.md).

### Q6. Recover edits across restart, duplicate delivery and protected GC

**Status:** TypeScript MCP/demo process recovery and exact retry have bounded
tests; native same-runtime checkpoint restore is implemented, bounded. Full
native durable session recovery and protected GC remain open. Native process
and mixed-runtime recovery qualification are **NOT_RUN**.

**Acceptance:** inject failure before/after local persistence, send, server
acceptance, response, echo and checkpoint cleanup. Exact duplicate submission
does not duplicate edits/History; a conflicting actor/sequence payload rejects.
Reservation and generation checks protect hidden cells, moved/deleted anchors,
undo dependencies and pending operations. Restart during recovery must preserve
the same outcome. An unsafe or unknown outcome blocks submission and retains
evidence. Include schema mismatch and receipt pruning as explicit failures.

**Dependencies:** D4 recovery/GC ports and Q5 transition rules. **Next deliverable:**
native durable recovery design and bounded process fixture matrix. Local
checkpoint replay alone cannot close this gate. See the
[recovery plan](recovery-plan.md) for existing implementation and open limits.

### Q6.1. Keep accepted edits accepted when observers fail or reenter

**Status:** TS session callback-error and durable reentrancy regressions exist.
The future native host/editor boundary still needs equivalent acceptance cases.
See [session tests](../apps/mcp/test/session.test.ts) and
[durable staging tests](../packages/doc-sync/test/durable-staging.test.ts).

**Acceptance:** throw from an observer after acceptance and start another edit
from a listener. Preserve exactly one accepted change and History action for
each edit, report observer errors, keep reentrant ordering, avoid automatic
resubmission, and recover the same result after checkpoint restore. An observer
error must not turn an accepted edit into an unknown or rejected edit.

**Dependencies:** D4 completion/events and Q6 recovery. **Next deliverable:** reuse
the existing TS cases in the native host acceptance matrix; listeners do not
become transactional by assumption.

### Q7. Qualify desktop editor normalization, selection and composition

**Status:** TypeScript editor bindings, schema preflight and model round trips
are implemented, bounded. A production Rust/WASM editor backend remains open.
This roadmap adds no browser or real OS IME result; both are **NOT_RUN here**.

**Acceptance:** for each supported desktop binding, local command, remote event
and native editor normalization yield the same canonical document without
feedback edits. Test selection after move, merge and hidden-cell changes;
unsupported selection types fail explicitly. Check UTF-16 offsets, surrogate
pairs, combining text, mark inheritance, paste/import/export, disposal and
listener cleanup. Exercise composition begin/update/commit/cancel with remote
changes and schema transition. Synthetic composition and actual OS Korean IME
require separate results. Data preservation and semantic rendering are separate
gates. Do not add mobile testing to this queue.

**Dependencies:** D4 events/sessions; D6 and D7 for actual WASM product evidence.
**Next deliverable:** desktop capability/normalization matrix, then bounded
binding tests and separate real OS IME evidence.

### Q8. Bound long-session memory, latency and resource growth

**Status:** repository benchmarks and bounded storage measurements exist. They
do not close D8 or production editor performance. New long-session product
measurements are **NOT_RUN**.

**Acceptance:** agree workload and budgets before judging results. Measure
repeated editing, move/undo churn, reconnect/restart, hidden content, History
retention, GC, schema additions and open/close cycles. Report retained state,
heap/RSS, pending bytes, log/receipt/reservation growth, disposal, p50/p95 editor
input-to-remote-render latency and repeat variability. Keep core timings,
process RSS and end-to-end editor latency separate. Include backlog/resource
limits and explicit behavior when a limit is reached.

**Dependencies:** stable delivered slices; D7 for WASM editor comparisons.
**Next deliverable:** workload/budget document and reproducible desktop/native
measurement receipt. A storage microbenchmark cannot approve product migration.

## External research and its use

These sources inform test design. They do not establish doc-sync behavior or
select a new dependency. Checked 2026-11-04.

- ProseMirror schemas constrain child sequences and choose a default node from
  expression order. This supports a separate default/normalization check in Q4
  and Q7; exact doc-sync rules still come from this repository.
  [ProseMirror guide](https://prosemirror.net/docs/guide/).
- fast-check describes stateful commands, preconditions, shrinking and replay
  metadata, and warns against copying the implementation into the test model.
  Q2 adopts these design requirements, without adopting the package here.
  [Model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/).
- Yjs documents order-independent and duplicate-safe updates, and separately
  notes that merging encoded updates does not collect deleted content. This
  suggests independent delivery and retention checks in Q2/Q6. It does not imply
  that doc-sync accepts arbitrary out-of-order operations.
  [Document updates](https://docs.yjs.dev/api/document-updates).
- Automerge distinguishes composite maps/lists/text and recommends text edit
  APIs for concurrent text changes. This supports checking fine-grained edit
  intent separately from whole-value replacement; doc-sync field and text rules
  remain repository-defined.
  [Document data model](https://automerge.org/docs/reference/documents/).

## Evidence required for each completed slice

Record the product change separately from added test coverage. Save the exact
source checkpoint, command/schema subset, source or product boundary, seed and
delivery schedule, first failure, final result and known limits. Preserve old
reports. Do not relabel an old failure as a fresh result. Keep native, TS,
mixed-runtime wire, desktop UI, real OS IME, remote publication and performance
results separate. No item in this plan authorizes a release or production
engine replacement.
