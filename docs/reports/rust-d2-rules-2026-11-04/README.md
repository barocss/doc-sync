# Runtime structured attributes, values and required children

**PASS for the declared D2 runtime subset. Full D2 and the complete D3 compiler
remain open.** The baseline is main
`1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus inherited uncommitted flow/grid/
group/inline/span work. The actual 72-file worktree is archived and hash-verified.
Earlier sealed reports remain unchanged. This task includes a narrow production
TS projection bug fix, as well as the experimental native implementation.
No commit, push, deployment or registry publication is included.

## Implemented contract

Stored Document attributes can opt into recursive `fields`. Each declared leaf
has its own encoded register and writer. Partial branch patches retain other
leaves; null resets the declared branch. Attribute defaults must equal their
child defaults. Leaves can contain scalar or field-safe JSON object/array data.
Cell field keys retain their row/column identity. Root, row, cell-body and
derived group/span field positions remain unsupported where the model has no
stored attribute owner.

Field-safe JSON has bounded depth/path length (64), representable numbers and
safe object keys. Dollar-prefixed, `__proto__`, `constructor` and `prototype`
keys are rejected. This policy also bounds nullable atomic mark values. It is
stricter than TypeScript's non-field atomic value admission; three such runtime
value cases explicitly prove TS acceptance, native rejection and rollback.

`markValues` with a null default and no enum can carry object/array values.
A mark remains one atomic register; changing two nested keys does not merge them
as independent fields. Composite default/enum declarations and `markValues.fields`
remain unsupported. TS reference identity is retained as a boundary, not replaced
by deep equality. A source-bound probe shows the schema-default object reference
and a distinct deeply equal object produce different results. Per-token composite
mark copies can split spans even when JSON values match; plain-run grouping
retains the JS JSON representation behavior.

`flow.childRules` supports min/max bounds from zero to 1000 for text, group,
flow, grid and atom children. Missing children have deterministic schema-owned
storage. Authored replacements can hide fallback content; deletion reveals it
again. Extra candidates remain stored and can be promoted. Required grids have
initial row/column identities. Positive-minimum generative cycles reject rather
than expanding without bound. Required identities use:

```text
~required:<URI parent physical head>:<URI type>:<ordinal>
Lamport 0: text/group head; 1: nontext marker; 2/3: initial grid row/column
```

Fixed required markers cannot be forged, moved, retyped or removed. Their text
and descendant flows can be edited through supported APIs. `delete_block` is
qualified for required text and flow/text content, without recursively clearing
grid-cell lines; deleting a required atom/grid
marker is a no-op in the SDK helper, and grid cells use their cell APIs.
Constrained authored text has a validated `|child:<birth ID>` boundary so
concurrent candidates do not alias. Required right endpoints must be canonical
and belong to the same parent.

## SDK and compatibility

New APIs include `set_attributes`, `set_field_path`, `required_head`,
`required_node` and bounded physical `delete_block`. Existing attribute, cell
and group setters expand supported structured patches. New leaf operations keep
TS authoring ticket allocation for nonempty branches; direct encoded leaf
updates retain their separate contract. Same-value/default/null update writers
remain for selective undo ownership. Generic scalar births, raw record, Graphic
writers and block/head move-anchor contracts keep their earlier behavior.
Character-to-containing-block interpretation occurs in the semantic trace
adapter, not by widening the old public move API.

Schema load/restore performs schema validation; edit-time checks use borrowed
rule validators. No extra full schema compilation or journal replay was added
merely for validating field values. The normal atomic record path retains its
existing validation. No performance speedup is claimed.

## Production TS redo visibility bug

Independent review reproduced an existing bug with a minimal paragraph plus
required atom schema. Moving nonempty `content` after the atom, undoing and
redoing hid the paragraph from the model. Raw text/attributes remained alive;
there was no deletion loss. A model read materialized an automatic text gap
anchored after the required atom. The next required-chain predecessor lookup
could select that gap, producing an unreachable required/gap cycle. Snapshot
restore also retained the bad visibility.

The bounded fix in `packages/doc-sync/src/crdt/doc.ts` excludes required-anchored
automatic gaps and unwritten root-only gaps from the required-chain predecessor.
A cheap guard skips this work on flows without rules. The native projection uses
the same rule. Ordinary ordering, RGA comparison and sync/History protocols are
unchanged. Generated `dist` was rebuilt before final TS/native comparisons.

The new source-import regression has **2 FAIL before / 2 PASS after**, covering
nonempty text and attributes, move/undo/redo, repeated model reads, snapshot
restore and two-peer convergence with a foreign writer. A separate source-bound
minimal probe passes after the rebuild. Matching two broken renderings was not
accepted as correctness evidence.

## Verification

| Check | Final result |
| --- | --- |
| Baseline/source counterfactual | 72 archived hashes match; fields/rules compile old rejection and current acceptance; nullable composite value old operation rejection/current acceptance |
| Native core | 120 PASS, zero FAIL, including 13 focused new cases |
| Native SDK | 78 PASS, zero FAIL, including 11 focused new cases |
| Independent authoring | Four descriptors, 260 actions / 520 actor states PASS |
| Schema checks | 19 exact path/reason cases; five TS-valid native-unsupported descriptors distinguished |
| TS required redo regression | 2 FAIL before, 2 PASS after guarded source fix |
| Earlier flow corpus | 162 actions / 324 states PASS |
| Earlier grid corpus | 180 actions / 360 states PASS, positive hash unchanged |
| Earlier shapes corpus | 188 actions / 376 states PASS, positive hash unchanged |
| Earlier runtime profiles | Six profiles, 82 actions / 164 states PASS |
| Documented native example | Identical 78-line programs compile/run with the final guarded source snapshot |

Coverage includes nested field defaults and sparse birth, independent concurrent
leaf updates, reset versus foreign writes, structured group-by projection,
inline/flow/grid/cell field edits, nullable composite marks, required text/group/
flow/grid/atom materialization, same-slot concurrent typing, authored replacement,
overflow, deletion/promotion, movement, fixed-marker rejection, selection,
selective undo/redo, twelve coupled checkpoints, duplicate pending replay and
exact acknowledgement. Stored atom field attributes use the shared implementation
but are not directly qualified by the independent positive corpus.

Each `Doc.edit`-authored positive passes public `Doc.check` against its pre-edit
state. Native semantic commands generate their own operations. Exact typed IDs,
raw full History and availability, pending/carets, material token order,
register/writer/deletion/cancel/move state, clocks and normalized models match.
History undo/redo output is compared separately. The final run binds one source
manifest across all stages, plus the built binary; each run has its own source
archive, fixtures and receipts. Filtered/TS-only/development runs remain diagnostic.

Only declared format projections apply: recursive string-to-UTF16 representation,
optional empty/default DTO fields, collection/set order, and the earlier narrow
unwritten derived text/fragment-head and axis-born display projections. Required
nontext source heads keep their actual raw birth type; an earlier harness
normalization mistake is preserved and corrected. Authored fields, required
identities, hidden content and History references are never removed to obtain
PASS. Each runtime restores its own checkpoint wire format; exchange of native
journal and TS token snapshots is not qualified.

Old schema negatives now explicitly admit newly supported cardinality instead
of being filtered out. Grid checks are seven rejections/five admissions; shapes
checks are eleven rejections/one admission. Their positive document fixture
hashes are unchanged. Old missing-marks negatives remain rejection smokes, not
new named-rule evidence.

## Integrated final checks

Final sequential workspace test: **2,112 cases / 2,110 PASS / zero FAIL / two
expected platform SKIPs / zero cancelled**, 116.265 seconds. This includes the
two new production TS visibility regressions. Root typecheck passes in 14.350
seconds. Documentation build passes in 13.048 seconds; the final check passes
55 pages and 2,615 internal links with English content and local paths excluded.
See [final check summary](final-checks.json).

The final core manifest (35 files) still matches. The SDK suite mapped 84
source/data/fixture/doc files with stable before/after hashes; only later SDK
README prose differs from that run's snapshot. All executable sources/data,
comparison source manifests and the identical compiled 78-line example body
remain unchanged. The final documentation build qualifies the updated prose.

## Observed boundaries

- **OBSERVED_D3_COMPILER_CLOCK_GAP:** empty `{}` branch updates produce no ops,
  model, pending or History changes in both runtimes, but TS consumes one discarded
  compiler ticket. The native physical helper does not. The difference is proved
  on the final source, not normalized away in the positive run.
- Composite mark defaults and enum entries retain the reference-identity boundary.
  Nullable safe JSON values are the supported composite format path.
- TS-valid atomic values with dollar/prototype keys are native-unsupported; three
  representative probes fail closed without replacing the coupled state.
- Mixed scalar and structured definitions in one group attribute update are not
  independently qualified by the helper's compiler contract.
- Earlier generic post-move model-position insertion and empty-head compiler
  gaps remain D3 work. The required-anchor projection cycle is a separate bug
  and is fixed.

`text: false`, callback/general computed rules, model-only stored attributes,
axis moves, live transitions and complete product schema/compiler gates remain
open. This work does not add a Rust Client factory, native production server,
protected GC, real native process/server crash qualification, a CRDT WASM build,
Rust editor binding, cross-runtime wire transport or native shared Map/List.
No Chrome, mobile or performance benchmark was run.

## Documentation and reproduction

The [Rust guide](../../../apps/docs/src/guide/rust.md#structured-fields-and-required-children)
and [SDK README](../../../experiments/rust-sdk/README.md) show a complete two-peer
example with a required title, two structured leaves, a foreign same-value undo
fence, nullable JSON mark, checkpoint input, duplicate retry and ACK. The
[Document rules guide](../../../apps/docs/src/guide/document-rules.md) separates
the runtime field contract from the older fixed-preset atomic JSON example.
The root README's obsolete claim that schemas cannot express exactly-one
children has been removed.

Use Node 24 and cached Cargo dependencies. Recorded comparison drivers use
macOS `/opt/homebrew/bin/cargo` (1.87); the legacy driver uses local rustup stable.
Other layouts need a driver-path adjustment. Use fresh output/target directories:

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
RULES_OUT=output/my-rules RULES_TARGET=output/my-rules-target node experiments/runtime-document-rules/compare.mjs
SHAPES_OUT=output/my-shapes SHAPES_TARGET=output/my-shapes-target node experiments/runtime-document-shapes/compare.mjs
GRID_OUT=output/my-grid GRID_TARGET=output/my-grid-target node experiments/runtime-document-grid/compare.mjs
NESTED_OUT=output/my-flow NESTED_TARGET=output/my-flow-target node experiments/runtime-document-nested/compare.mjs
RUNTIME_SCHEMA_OUT=output/my-runtime RUNTIME_SCHEMA_TARGET=output/my-runtime-target node experiments/runtime-schema-native/compare.mjs
```

Do not overlap package/docs rebuilds with workspace tests or TS traces, since
build removes and regenerates `dist`. Local source qualification does not publish
the website or a registry package.

The selected evidence includes `final-comparison-summary.json`, which links the
qualified main run, before/after redo proofs and each separately classified
identity/value/clock boundary using paths relative to the task evidence folder.

The [selected evidence archive](evidence.tar.gz) and [manifest](manifest.json)
retain the final full traces, source snapshots before build, compact failed-run
receipts, before/after probes, consumer source and logs. Large duplicate or
nonfinal raw traces and binary-containing later-stage source bundles remain in
local task output; excluded paths/hashes are listed in the manifest. Binaries,
Cargo targets and duplicate stdout are excluded from this capsule. Absolute
paths in original receipts are provenance, not portable execution paths. This
is selected evidence, not an installable distribution or complete dump of every
local diagnostic artifact.
