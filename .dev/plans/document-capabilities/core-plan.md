# Document capability core plan

## Decisions and critique

The latest user instruction authorizes child cardinality, persistent annotations, identity-preserving movement, and nested field collaboration. It replaces the earlier no-move scope. Existing content IDs, RGA origins, same-boundary Enter, conditional history, and immutable validation remain requirements.

Changing Item.line is rejected. Copy/delete is rejected. A text marker currently owns no independent body: source block membership comes from scanning its immutable physical RGA sequence. Non-text placement alone cannot establish full paragraph movement.

## A: Placement and cardinality

- Keep physical source blocks and immutable line membership. Add an ordered placement projection keyed by object identity and immutable placement IDs. Baseline placements derive from original markers.
- New move wire records reference existing target identity, destination flow head, and predecessor placement/head. Preserve every movement record and order anchor. Recompute a cycle-safe projection in Ticket order so arrival order never makes an irreversible decision.
- Begin with flow/grid/atom targets, retaining their existing independent body/row/column identities. Deletion controls visibility independently; movement does not revive objects.
- Validation uses existence, birth shape/type, destination slot ownership and immutable placement references. Current child counts and current ancestry are not rejection predicates.
- History appends a new inverse move only while the exact owned placement is current. Retain movement logs and references through GC; no unproved movement-log truncation.
- Snapshot format/capabilities explicitly identify new state and reject unsupported versions. Old snapshots remain readable with an empty placement overlay.
- Child rules use a declared type and min/max bounds. All candidates remain stored. Deterministic projection selects visible candidates and retains overflow. Required fallbacks have stable IDs and real editable storage; repeated reads never mint new identities. Zero bounds and unknown/invalid rule declarations need explicit checks.

## B: Text movement and logical editing

- Expose physical source blocks separately from logical block projections. Move text identity through placement while keeping every character origin in its original physical RGA.
- Joining logical text blocks must retain source markers and content identities. Add explicit join aliases instead of deleting source markers. Resolve join cycles deterministically. A logical text block is an ordered collection of physical source segments.
- Splitting a logical block inserts a physical source marker at the cut and adds its placement to the logical destination. Joined trailing segments must attach to the new logical block. Concurrent same-boundary splits must still share one visible split through physical marker absorption.
- The root/default text head has a movable block identity distinct in meaning from the parent flow identity. If moved away, an independently addressable stable fallback must receive new root input.
- Position conversion, visibility, body/cell lookup, selection, and cache invalidation must resolve logical parentage while validation retains birth facts. The entire default regression suite is a required gate; no full-move completion claim before post-move split/join and concurrent-input tests pass.

## Independent helper integration

Fields helper owns fixed declared attribute fields only. Shared core integrates per-leaf set operations, pure-model patch/diff, schema checks and materialization. Explicit same-value leaf writes retain ownership. Scalar behavior remains unchanged.

Annotations helper supplies reserved metadata operations and range resolution. Shared core validates and persists its operations, attaches history and snapshot support, and prevents metadata from appearing as document content.

## Required evidence

Focused placement/cardinality tests cover same-object concurrent moves, cycle permutations, edits inside moved objects, deletion/undo, stale anchors, snapshots and GC, retained overflow, max 0, required fallback edits, and concurrent inserts/deletes. Text tests add moved head/paragraph, post-move Enter/join, range deletion, same-boundary concurrent Enter and concurrent text through old origins. Fields and annotations have independent helper and integrated tests. Broader core/editor tests follow only after focused gates pass.

## Final implemented contract and verification

The public editing API now has six operations: insert, delete, update, split, merge, and move. Move accepts `{op: "move", from, at}`. The destination parent path refers to the document before removal; a same-parent insertion index refers to the children after removal. Text, flow, grid, atom, and derived groups are supported. A group move emits ordered placements for its stored text members. Row, column, inline, and span movement are outside this contract.

Text movement preserves every physical Item.line and character origin. Logical joins use conditional `$join` registers and retained physical fragments. Split creates a physical marker and a logical placement. Split history restores a logical join instead of deleting the marker, and it checks both join-register and placement ownership. Observed foreign or unrecorded placement writes prevent a split inverse from taking that paragraph back. Same-boundary Enter absorption remains active. Populated legacy virtual paragraphs receive a retained physical marker before local movement; their characters are not copied. Stable private storage receives new root/default/trailing input. Inserting blocks inside a moved paragraph creates a split and places the inserted blocks between its retained prefix and tail.

Cardinality rules are declared as `FlowSpec.childRules[type] = {min?, max?}`. Bounds are integers from 0 through 1000. The default minimum is zero; the default maximum is unbounded. The projection retains authored overflow and edited hidden fallbacks. `Doc.overflow(line?)` exposes retained hidden candidates. Required children have stable editable identities, including separate required groups with equal public attributes. Required objects retain their slot: movement and type changes are rejected; structural deletion clears their contents and preserves their attributes and required identity. Required slots can serve as movement order anchors. Schema validation rejects non-block rules, empty groups, malformed rules, and required recursion through nested flows or grid cell bodies.

Nested fields use fixed declared leaf paths on stored text, inline, nested flow, grid, atom, and virtual cell attributes. Root-flow, row, group-view, span-view, and cell-body-flow field declarations are rejected. Existing scalar attribute behavior is unchanged. A flow type used as a cell body cannot declare fields elsewhere in the same schema. Partial updates write only supplied leaves; explicit same-value writes acquire ownership. Whole-branch null resets stamp every descendant leaf.

Annotation metadata lives in the reserved root metadata slot. Public helpers create, update, delete, and read annotation records. Endpoint resolution uses affinity-side logical locations and retains deleted token anchors. Live annotations pin their endpoints against compaction. Metadata, field values, snapshots, and returned models have independent ownership of nested JSON values.

Feature snapshots require format 2 and matching capability flags. Restore rejects malformed reserved metadata, unknown fields, invalid fixed slot types, duplicate token identities, unsafe clocks/register tickets, and accessor payloads. Legacy snapshots with no feature payload remain readable. Every move record remains retained; ordinary deletion GC is not movement-log GC. Logical placement, block, and token-location lookups cache by document revision; legacy documents keep their existing fast paths. Sync's physical text-event optimization is disabled for movement/cardinality documents until a logical fragment-scope implementation has independent proof.

Final focused core feature suites: 137 tests passed on Node 22.19.0. Package TypeScript checking passed. Independent reviewers supplied fixed security, cardinality, field-output, and move-history regressions. Parent integration owns the complete test suite, expanded fuzzing, native editor/browser checks, performance comparison, and deployment evidence.
