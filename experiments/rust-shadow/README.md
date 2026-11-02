# Bounded native CRDT shadow interpreter

This independent Rust crate implements bounded R4 slices. It does not replace the production
TypeScript engine. Its JSON-lines process applies actual CRDT operations. It
does not accept TypeScript document states or expected results as inputs.

## Supported contract

The explicit [schema manifest](schema.json) pins a flow root, one implicit
paragraph by default, and boolean `bold` and `italic` marks. An explicit native
capability also enables authored paragraph markers within this same flat flow
schema. The schema identity is
`flow-root-paragraph:boolean-marks:bold,italic:v1`. The crate does not negotiate
schemas. It rejects unsupported schema identities or manifests.

Supported operations are `text`, `del`, `undel`, and `set` with boolean or null
values. Text enters JSON as arrays of UTF-16 code units. These arrays preserve
surrogate pairs and isolated surrogate units. Actor strings use valid Unicode;
isolated surrogate actor strings are unsupported. Text birth tickets require
a positive Lamport clock and cannot use the reserved `~root` actor. Null birth
marks are rejected. Raw TypeScript `Doc.apply` can accept inputs outside these
restrictions; this slice does not claim general rejection parity. Ticket
ordering follows JavaScript UTF-16 actor ordering.

The interpreter maintains ordered token IDs and origins, deletion IDs and
cancellation IDs, immutable birth marks, current last-writer-wins registers,
and the observed clock. Rust also generates its own History undo and redo
operations. It receives no expected TypeScript inverse operations or states.
The original apply-only harness still uses TypeScript-generated inverse inputs;
the separate History harness checks independent native generation.

The legacy modes below retain their original schema and behavior. A separate
fixed general-block mode is described later. Base replicas reject nodes. Replicas created with
`capabilities: ["paragraph-markers-v1"]` accept only ordinary paragraph-marker
births as described below. In these legacy modes, other node types, moves, GC, other mark keys, general
schemas, and schema transitions remain unsupported and must fail closed.
Invalid operation batches are atomic. Capabilities are a native experiment
setting, not a production wire negotiation. Unknown or repeated capabilities
are rejected. Requests cannot change a capability on an existing replica;
restore reads the capability from the explicit native snapshot.

## Native snapshots

The `doc-sync-rust-shadow-v1` snapshot format belongs to this crate. It is not
compatible with TypeScript snapshots. It stores the schema identity and
manifest, clock, ordered tokens, origins, UTF-16 units, birth marks, current
registers, deletion IDs, and cancellation IDs. Required nullable fields must
be present. Restore validates the full snapshot before it replaces a replica.
Invalid restore must leave the prior replica unchanged.

An opted paragraph replica exports `doc-sync-rust-shadow-v2` and the mandatory
`capabilities: ["paragraph-markers-v1"]` array. Paragraph tokens carry explicit
immutable `node` metadata: `born`, `boundary`, and `type_at`. The type is exactly
`paragraph`; its initial `$type` register is represented at the birth ticket.
Character tokens remain UTF-16 units. Root and character tokens cannot acquire
node metadata. Restore verifies the capability, token kind, birth metadata,
causal order, all boundary endpoints, and original type ticket before mutation.
It rejects missing or unknown capabilities and mixed or incomplete token kinds.
The v1 branch still accepts original character/root snapshots and rejects node
metadata or a capabilities field. There is no silent v1-to-v2 conversion.
A coupled History checkpoint can contain each explicit document version.

## Fixed placement and logical text storage

The opt-in v6 identity is `movement-logical-storage:json-attrs:value-marks:v1`.
It requires exactly `capabilities: ["movement-logical-storage-v1"]` and exports
`doc-sync-rust-shadow-v6`. Its [manifest](schema-move.json) has the same nine
shapes as v5. Earlier modes keep their operation and snapshot contracts.

The native interpreter retains `move` records independently from physical
line membership, immutable origins, text units, and deletion ledgers. It
replays placement records in total Ticket order and suppresses ancestor cycles.
Movement targets include text blocks, callouts, tables, atoms, and individual
list items. Row, column, inline, and span-container movement is not enabled.

Private `~text` and `~fragment` heads retain editable automatic paragraphs.
Logical `split:` births retain physical text partitions; `$join` registers
project their parts and aliases without copying or deleting foreign input.
`virtual:` births promote retained physical trailing text before movement.
Canonical reads close flow/cell heads and private gap storage without clock ticks.

Native Move and Split History steps generate inverse operations and retain
shared ownership states. Current placement and register writers fence each
inverse, including same-actor unrecorded movement. Coupled checkpoints retain
movement records, private storage, and shared History references. Restore
validates target ownership, immutable split values, recorded placement tuples,
physical membership, and clock limits before replacing active state.

The [movement harness](../rust-move-harness/README.md) compares actual TypeScript
wire operations with independent native results. It includes new-process
checkpoint and pending-batch retry cases. Expected states, models, and inverses
remain in the parent process. A hidden private root gap resolves to root start
for raw caret lookup. Product-style selection still returns null for that hidden
endpoint. The native regression checks empty and nonempty replacement text and
verifies that lookup preserves the exported checkpoint.

This is a fixed-schema capability. Runtime schema registration and schema
transitions are not implemented. Type and slot classifiers in `nested.rs`,
attribute classifiers in `general.rs` and `shapes.rs`, and capability/manifest
selection in `lib.rs` still use the pinned node names. A future compiled schema
registry must replace those boundaries before arbitrary schemas can be claimed.
No production native server, WASM client, browser behavior, performance benefit,
GC, dynamic child rules, or hot schema transition is qualified by this mode.

## Fixed groups, inline nodes, and value-mark spans

The separate [shape manifest](schema-shapes.json) has schema identity
`groups-inline-spans:json-attrs:value-marks:v1`. It requires exactly
`capabilities: ["groups-inline-spans-v1"]`. Its native snapshot format is
`doc-sync-rust-shadow-v5`. Earlier v1 through v4 modes keep their contracts.
The recursive flow and table storage rules also apply in v5.

Every flow accepts a `list` group. Physical storage contains `list-item` text
markers, not list containers. Adjacent items form one list when their `level`
and `listType` values match. Level has values 1 through 6 and default 1.
List type has values `bullet` and `ordered`, with default `bullet`. The model
puts these two attributes on the list. Item attributes retain `align` and
atomic JSON `meta`. Different levels create adjacent flat lists. They do not
create nested lists. Paragraphs and other blocks stop a group. The fixed
manifest has no child cardinality rules. Explicit adjacent lists with equal
group attributes therefore merge. Private required-group boundary hints are
outside this schema.

Paragraph, heading, and list-item text accepts `inline-image`. Each inline
node occupies one UTF-16 position, retains its own authored token ID and
attributes, and remains in the physical flow line. Block text represents it
with U+FFFC. Its raw token has null `unit` and immutable born type
`inline-image`. Attributes are `src`, nonnegative `width`, `decorative`, and
atomic JSON `meta`, with the same defaults as the block image. Inline type
changes and marks on inline nodes reject.

The value mark `link` accepts a string or null. Its default is the empty
string and its inheritance setting is false. Canonical output omits null
and empty links. Contiguous characters with the same nonempty link become
one `inline-hyperlink` run with `attrs.url`. Boolean mark changes make inner
runs. An inline node stops the span. The native process applies the actual
explicit marks from wire operations. The TypeScript builder determines
noninheritance and span-to-mark flattening before delivery. No native
high-level insertion builder is provided. This string-only schema does not
claim JavaScript object-identity span semantics or URL pattern validation.

Group and span containers consume no tokens, heads, or clock ticks. Recursive
body, axis, and cell storage retains the v4 zero-clock canonical closure,
including deleted owners and axes. Native History handles link, group, and
inline attribute writes through the existing independent ownership graph.
It preserves foreign same-value writes and foreign deletion tickets.
Selection paths include the list entry and item indexes. Text offsets count
inline nodes once; span runs add no selection path level. Covered cells and
deleted ancestors remain unavailable to product-style selection. Stored
contents remain available for later undo and recovery.

Restore verifies v5 schema, manifest, capability, immutable births, current
registers, physical lines, and the coupled History graph before replacement.
Invalid input preserves both document and History. Models, expected states,
and expected inverse operations are never native inputs. Movement, `$join`,
generic schemas, field-level merging, and GC remain unsupported.

## Legacy paragraph markers

Enable this slice when creating a replica:

```json
{"cmd":"new","replica":"A","actor":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","capabilities":["paragraph-markers-v1"]}
```

A supported `node` operation has a positive authored `id`, an existing
`origin`, `type: "paragraph"`, and a legacy `boundary` equal to
`originKey|rightKey` or `originKey|end`. The right endpoint must already exist;
it can be a tombstone. Actor names containing `|` or `@` remain valid: the parser
uses the complete origin key to identify the left endpoint. Node `attrs` must
be absent or empty. Birth stores immutable type and boundary and exposes the
initial `$type: {value: "paragraph", at: id}` register. Authored `$type` or
paragraph-attribute updates remain unsupported. A repeated birth is idempotent;
a conflicting immutable type, origin, or boundary rejects the whole batch.
This is stricter than raw TypeScript duplicate-birth acceptance.

The native projection follows the production legacy `sourceBlocks` path.
The first live marker in physical token order for an exact boundary opens a
paragraph. Other live markers for that boundary become aliases. An alias does
not change the current paragraph for following characters. Concurrent Enter
at the same boundary therefore creates one new paragraph. Deleting a primary
promotes a surviving alias. Deleting the primary and all aliases merges text
without moving its physical origins. Empty paragraphs remain visible. The
root marker stays protected by the existing root-mutation restriction.

This slice matches actual `splitBlock`, Backspace/Delete paragraph merge, and
`Doc.edit` merge while TypeScript `Doc.hasMoves` is false. Once movement is
active, TypeScript uses logical `split:` boundaries, `move`, `$join`, and
private fragment storage. All those operations and routes are rejected here.
Arbitrary boundary strings, `root`, `virtual:`, `split:`, other nodes, nested
flows, grids, inline nodes, cardinality, and schema transitions are excluded.

Opted state includes immutable `born` and `boundary` for every token, and a
`blocks` array with primary marker, aliases, character IDs, UTF-16 text units,
type, attributes, and virtual status. Models have one paragraph child per
projected block. Counts include non-root marker tokens as well as characters.
Base replicas retain their original JSON state shape.

## Fixed general blocks and JSON attributes

The opt-in [general manifest](schema-general.json) has identity
`general-flow-blocks:json-attrs:v1`. Create it with exactly
`capabilities: ["general-blocks-attrs-v1"]`. This uses document snapshot
`doc-sync-rust-shadow-v3`; the older schema, base v1, and paragraph v2 remain
separate. A schema identity, manifest, capability or version mismatch rejects
before replacement. No runtime schema negotiation or transition is provided.

The root `content` accepts `paragraph` and `heading` text blocks, plus `divider`
and `image` atoms. Its default text type is `paragraph`.

| Type | Schema-defined attributes |
| --- | --- |
| paragraph | `align`: left/center/right, default left; `meta`: bounded wire JSON, default null |
| heading | paragraph attributes; `level`: 1 through 6, default 1 |
| divider | `style`: line/dots, default line; `meta`: bounded wire JSON, default null |
| image | `src`: string, default empty; `width`: finite nonnegative number, default 0; `decorative`: boolean, default false; `meta`: bounded wire JSON, default null |

Every declared attribute accepts null. Projection substitutes its default for
missing or null registers. `meta` accepts wire strings, finite numbers, booleans, null,
arrays, and objects because its schema default is null. This is a declared
attribute, not a generic pass-through for arbitrary node metadata. Each meta
write replaces the whole value through one LWW register; its object fields are
not independent CRDT registers. Birth
attributes must match the exact birth type. Later attribute writes must match
some type with the same immutable shape, as production `Doc.check` requires.
Thus heading-only `level` can be stored on a paragraph, or image-only `src` on
a divider. Those registers are retained but hidden from that type's projection.

`$type` writes can change a text marker, including the implicit root paragraph,
between paragraph and heading. Null restores the immutable birth type, or the
root default. Atom type changes, root deletion, other reserved keys, placement,
logical joins, nested flows, grids, groups, inline nodes, field storage, schema
changes and GC remain blocked. Text-block node births still require the legacy
`originKey|rightKey` boundary; atom boundaries must be absent or empty. The
`virtual:` builder materialization route is not included.

V3 tokens retain immutable `born`, boundary, initial type ticket and exact birth
attributes separately from current LWW registers. A duplicate node birth with
matching identity and different valid attributes leaves both original birth
attributes and current registers unchanged, as TypeScript does. Native restore validates
these facts, required birth registers, register tickets, typed current values,
and atom birth type immutability. A joint History restore also validates both
before/after values against the actual target shape. Invalid batches and
restores preserve the active document and History.

Atom projection includes a virtual paragraph after each atom until an explicit
text marker replaces it. Empty virtual paragraphs appear in `blocks` but do not
appear in `model`. Characters after an atom occupy its virtual paragraph. Raw
anchor operations use physical block indexes. Range capture and resolve use
visible model paths; atom paths cannot be captured as text. Atom token anchors
resolve to the following raw block, with the production one-block fallback when
that block is absent from the model.

Native History generates JSON-attribute and type inverses independently. Its
value grouping preserves ordinary object key insertion order, sorts JavaScript
array-index keys first, normalizes finite numbers to JavaScript Number equality,
and merges signed zeros. This matches JSON.stringify group equality without
requiring its literal number rendering as a group key. The pinned serde_json
`preserve_order` feature retains object insertion order through wire input,
History and native recovery. Values are detached JSON; operation-object aliasing
is outside the contract. JSON wire input uses Unicode scalar strings for actor
names, attribute names and values; isolated surrogate strings reject during JSON
parsing. UTF-16 text unit arrays still retain isolated surrogate units. JSON
transport does not retain a distinction between JavaScript positive and negative
zero. Parser recursion and retained History depth impose native limits that can
be stricter than raw JavaScript. No raw in-memory value equivalence or full
acceptance/rejection parity is claimed beyond this bounded wire contract.

## Pinned nested flows and tables

Create this opt-in mode with schema `nested-flows-tables:json-attrs:v1`,
`capabilities: ["nested-flows-tables-v1"]`, and the exact
[schema-nested.json](schema-nested.json) manifest. The native document format is
`doc-sync-rust-shadow-v4`. Earlier v1, v2, and v3 document modes retain their
contracts. There is no schema conversion or runtime schema negotiation.

The fixed schema retains paragraph, heading, divider, and image. It adds a
recursive callout flow and `table > table-row > table-cell > table-cell-body`.
Root, callout, and cell-body flows accept all six stored block types. Callout
has `tone` (info or warning, default info) and atomic JSON `meta`. Table has
atomic JSON `meta`. A cell has scalar `background` and atomic JSON `meta`.
Colspan, rowspan, and spanned are computed. Nested attribute fields remain
unsupported.

Storage retains separate physical lines with their owner, slot, deterministic
head, and RGA token order. Token IDs are indexed in a native arena for History;
the model tree is derived from the lines. A deleted owner does not delete its
body. Deleted axes do not delete cell lines. Foreign child text and attributes
remain available when an owned deletion is undone. Grids with no live row or
column do not project. Span endpoints use physical axis positions, count live
axes, and resolve overlap by descending writer ticket. Equal-ticket writes to
different span keys retain register insertion order. The v4 snapshot stores
that order explicitly.

State comparison uses a canonical zero-clock slot closure. For every physical
callout, including deleted owners, it materializes the body head. For every
physical table, it materializes rows, columns, and every physical nonhead row
and column intersection, including deleted axes. The reference uses actual
TypeScript `Doc.get` to make the same valid heads. Lines are then sorted by key;
physical token order remains unchanged. This compares storage after derived
head normalization. It does not claim equality of TypeScript's earlier lazy Map
allocation footprint, raw TypeScript snapshot bytes, or allocation order.
`state.lines` exposes normalized physical lines; `state.projections` exposes
blocks for every line, including hidden cells. `state.model` retains the full
recursive grid and marks covered cells with `spanned: true`. Cell text and
stored attributes remain in that full grid.

Nested selection capture and resolve accept recursive model paths and use
actual UTF-16 token boundaries. Product-style ranges return null when an
endpoint is inside a covered cell, a deleted axis, or a deleted ancestor.
Raw `anchor_resolve` instead escapes to a visible adjacent cell or owner block,
as `Doc.posAfter` does. Nested raw `anchor_capture` accepts optional `line` and
`paragraph` (physical block index). Raw resolution includes `line` for a nested
position. Empty virtual paragraphs stay outside the public model, while typing
or editing them uses their owning nontext marker and ordinary builder routes.

History generates its own inverses for nested node and axis existence, text,
cell attributes, and spans. Joint checkpoint restore first rebuilds immutable
births and line membership. It then validates current registers and History
against that complete document. A history state and document register cannot
have different values at the same writer ticket. A later foreign register may
legitimately leave the saved History state stale. All restore rejection is
atomic across document and History.

This mode targets fresh valid builder operations. It rejects physical line-head
delete/undelete operations, arbitrary axis attributes, missing mutation targets,
moves, `$join`, private text-storage/required-child identities, generic schemas,
and GC. Raw TypeScript `Doc.check` or `Doc.apply` can accept some of those inputs,
including ordinary flow-head deletion. General admission or rejection parity
is not claimed. Isolated surrogate strings in JSON attributes retain the v3
wire-parser limitation. The [nested harness](../rust-nested-harness/README.md)
records the exact compared workloads and recovery boundary.

## Native History

History supports text insertion, deletion, and boolean-or-null bold/italic
formatting. Opted replicas also record paragraph-marker births as ordinary
existence steps, so native undo and redo delete or revive the original marker
identity with its own deletion ticket. It preserves exact write-ticket ownership, shared previous-state
references, per-target suppression, first-encounter value-group order, caret
strings, typing groups (1,500 ms), the 100-group limit, undo and redo stacks,
and deletion pins. Undo of a local deletion cancels only that deletion. A
foreign deletion can keep the text hidden. A later observed write fences local
formatting undo even if that write has the same value. Empty and undel-only
local records leave redo intact.

`history_record` is an atomic local apply-and-record operation. It models fresh
own-actor operations emitted in order by a local TypeScript builder, including
capture of each set operation's actual previous register. It is not a general
port of raw `History.record`: TypeScript keeps previous-register metadata in
an operation-object WeakMap, which JSON cannot represent. Repeated operation
tickets or overlapping text ticket spans within one local batch are rejected.
Mutation targets must exist and all operation actors must match the replica.
Reusing an original operation across local records is outside this contract.
Use `apply` for pending-operation replay and duplicate remote delivery. A local
record is not retry-safe. Original pending operations can have clocks below a
later foreign write; local input is not required to exceed the observed clock.

Each JSONL request has `cmd` and `replica`. Local record and coupled restore
also require the pinned `schema` identity.

| Command | Additional input | Output fields |
| --- | --- | --- |
| `history_record` | `ops`, `options: {caretBefore, caretAfter, typing?}`, finite `now` in milliseconds | `state`, `history`, `status`, `ops`, `caret` |
| `history_undo`, `history_redo` | none | `state`, `history`, `status`, independently generated `ops`, `caret` |
| `history_state` | none | `history`, `status` |
| `history_clear` | none | `state`, empty `history`, `status` |
| `history_pin` | `sequences`, a map of deletion ticket keys to safe nonnegative server sequences | minimum matching `pin`, or null |
| `history_export` | none | `checkpoint` |
| `history_restore` | `checkpoint`, optional matching `actor` | `state`, `history`, `status` |

`status` has `canUndo`, `canRedo`, and deletion `pins` in stack traversal order.
Pin calculation does not implement server GC protection. `history_clear` clears
both stacks and releases pins. There is no custom typing-flush operation.
An explicit non-typing record or an expired typing window starts a new group.

The `doc-sync-rust-history-v1` checkpoint contains the actor, a complete native
document snapshot, and the bounded History ownership graph. Restore validates
both parts before replacement. Invalid restore preserves both active parts.
Validation checks reference counts, per-slot state identity, current references,
existing targets, clock bounds, local ownership tickets, and retained deletion
ledgers. Restore cannot change the actor of an existing replica. Plain document
`restore` clears old History so it cannot act on a different restored document.
Clock exhaustion rejects the whole undo/redo request. Export is detached JSON;
the process does not persist the checkpoint itself. The caller must retain the
matching document and arrange GC protection. These checks do not authenticate a
checkpoint or prove compatibility with production recovery or snapshots.

## UTF-16 selection anchors

The flat paragraph schema supports native token anchors and strict range
capture/resolve. `anchor_capture` takes a valid UTF-16 `offset` and optional
`paragraph` index (default zero). It returns the key of the visible character
immediately to its left, or that paragraph's primary marker at zero.
`anchor_resolve` takes `anchor` and optional `strict`. It resolves through the
production legacy position map. Primary markers map
to their paragraph start; visible characters map to their UTF-16 positions.
An absorbed alias or tombstone has no direct entry and walks physical token
predecessors until a mapped position is found. This can cross a paragraph
boundary. Opted responses include `paragraph` beside `offset`; base responses
retain only `offset`. Missing keys resolve to zero in raw mode and null with
`strict: true`.

`selection_capture` takes `range: {anchor: [paragraph, offset], focus: [paragraph, offset]}`
and returns token-key endpoints. `selection_resolve` takes those token-key
endpoints and returns model paths. Both accept null; invalid capture paths or
missing strict endpoints return a null range. Reversed ranges preserve anchor
and focus order. Tokens inside a surrogate pair remain distinct boundaries.
These helpers model `Doc.anchorOf`/`posAfter` for valid positions and actual
`InputSession.capture`/`resolve` for this flat schema. Native raw capture rejects
negative, fractional, or oversized offsets. It does not claim the clamping
behavior of the higher-level TypeScript `anchorAt` helper. Other nodes, movement,
nested model paths, and editor/browser selection are outside this slice.

## Reproduce

Run from the repository root with Node 24 and a matching Rust compiler and
rustdoc. Dependencies are pinned in `Cargo.toml` and `Cargo.lock`. The offline
commands require those dependencies in the local Cargo cache.

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" cargo test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" cargo build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-shadow-harness/harness.ts
node experiments/rust-history-harness/harness.ts
node experiments/rust-selection-harness/harness.ts
node experiments/rust-structure-harness/harness.ts
node experiments/rust-blocks-harness/harness.ts
node experiments/rust-nested-harness/harness.ts
node experiments/rust-shapes-harness/harness.ts
```

The [harness](../rust-shadow-harness/README.md) uses the real TypeScript `Doc`,
`History`, `SyncClient`, and `DocHub` with an in-memory network. It compares
complete internal state and the projected model. Expected TypeScript states
remain in the parent process. Only operation inputs enter the Rust process.
The [receipt](../rust-shadow-harness/receipt.json) stores full checkpoints,
operation inputs, four random seeds, and source/binary hashes before and after
the run.

Deterministic fixtures include concurrent changes, foreign changes followed by
undo, repeated undo/redo, duplicate replay, and invalid atomic batches. The
four random seeds use sequential causal delivery. Unicode actor comparator
fixtures use raw `Doc.apply` outside the production server actor gate.

Two restart cases stop the native process and start a new process. One native
snapshot includes the saved `SyncClient.pending` operations; the other excludes
them. Both replay the original pending operations after foreign changes. This
checks bounded native document recovery and duplicate replay.

The [History harness](../rust-history-harness/README.md) compares exact native
inverse operations, complete document state, shared ownership graphs, stacks,
carets, and pins against the actual TypeScript History. It includes fresh
process recovery, pending replay, partial foreign-write suppression, typing,
depth eviction, and atomic rejection. The
[selection harness](../rust-selection-harness/README.md) compares raw anchors
and actual InputSession ranges under delayed, reordered three-actor delivery.
See each receipt for its recorded inputs, counters, seeds, and source hashes.
The [structure harness](../rust-structure-harness/README.md) compares actual
production legacy split/merge, native node History inverses, immutable marker
metadata, full blocks and aliases, multi-paragraph InputSession ranges, and
pending structural recovery. Expected reference states stay in the Node parent
process. Historical receipts retain their original hashes. Use distinct receipt
output paths when checking a later native binary against earlier harnesses.

## Evidence boundary

Current native regression tests pass 75/75: 9 apply/snapshot tests, 11 History
tests, 3 UTF-16 selection tests, 8 paragraph-marker tests, 9 general-block tests,
10 nested-flow/grid tests, 10 group/inline/span tests, and 15 movement tests.
The movement tests include the hidden ownerless root-gap cursor regression.
These are native test results. Differential
harness results are reported separately in each harness receipt.

The historical first-slice receipt passed 614 full-state comparisons over 588 input batches and
1,214 records, with four saved seeds. The first-slice native tests passed 9/9. All
53 source hashes matched before, after, and at the final independent audit.
The native binary SHA-256 was
`ca454ee71f4ee4e59efa5bb91a52e3e761b331c38cacd50afb50e75d2e571c98`.
The independent audit also passed eight TypeScript/Rust edge checkpoints and
a fresh-process snapshot restore. These checks apply to the recorded inputs.

These remain bounded R4 slices. It does not establish full CRDT equivalence,
full server recovery, protected GC, protocol compatibility, R5 integration,
production migration, WASM, Chrome, or performance. Native test and harness
results apply only to the supported schema, operations, and saved checkpoints.
