# Runtime Document groups, inline nodes and spans

**PASS for the declared native runtime subset. Full D2 and the D3 model-position
compiler remain open.** The base is main
`1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus inherited uncommitted flow/grid
work. An immutable 67-file archive captures the actual pre-extension worktree;
Git HEAD alone does not identify that source. Earlier sealed reports remain
unchanged. No commit, push or registry publication is part of this task.

## Supported semantics

Document runtime descriptors add `group`, `inline`, `span` and scalar
`markValues`. Type, mark and attribute names come from each schema. Groups
collect consecutive stored text members using declared `by` fields. If multiple
groups contain the same member type, the containing flow's child order selects
the first owner. A flow default may name a member inside a declared group.
Computed group attributes come from its members and are removed from each child
model. Group wrappers have no stored identity.

Inline nodes retain stable token IDs, declared scalar attributes and one UTF-16
selection position. Emoji use two surrogate positions. They remain part of the
text sequence during block movement. Spans derive from scalar marks: the first
active span in schema declaration order becomes the wrapper; other value marks
stay on child runs. Span wrappers add neither stored IDs nor text offsets.
Boolean marks and scalar marks preserve distinct default/null semantics,
including valid zero, false and empty values. Explicit and inherited-mark
insertion are separate SDK APIs.

The implementations work in root flows, nested flows and grid cells. Minimal
flat descriptors also activate the required projection path. Existing fixed
presets, flat runtime descriptors, Graphic and sparse-sheet APIs retain their
separate contracts. Graphic runtime value marks remain unsupported.

Nonempty attributes on derived group/span nodes, duplicate group `by` keys,
unsafe span attribute names, `text: false`, structured Document fields/value
marks, cardinality, general computed rules, axis movement and live transitions
remain outside this subset. Runtime tables retain their earlier dense projection
and model-only row/body attribute limits.

## SDK and fixes

New helpers include `insert_group_member_at`, `insert_inline_at`,
`insert_text_at`, `line_token_ids`, `format_tokens`, `format_span`,
`insert_inherited_text_at` and `set_group_attribute`. Existing selective
History, stable selections, pending queue, checkpoint restore, exact retry and
acknowledgement APIs are reused. Group/span wrappers are not inserted as stored
Node operations. Physical heads and token IDs do not compile arbitrary current
model paths.

Independent comparison and source review found and resolved two real SDK
issues:

- New group/inline authoring retained default-valued birth attribute registers
  that TS `Doc.edit` omits. The new helpers now validate all raw attributes and
  omit null/default birth values. Unknown keys and invalid values still reject.
  Existing raw `record` and generic block insertion keep their supplied attrs.
  Same-value/default/null update operations are retained for writer ownership.
- Group attribute updates checked the immutable birth type instead of current
  effective `$type`. The helper now resolves a valid visible text type, with
  null/unset fallback, and checks membership/attribute rules against that type.
  Tests cover retyping to another group, foreign same-value writes, undo/redo,
  recovery, rejected IDs and invalid types.

Birth filtering uses the core's shared pure value validator. An intermediate
extra checkpoint restore/journal replay for validation was removed; the normal
atomic record path still performs its existing state validation. No speedup or
end-to-end performance qualification is claimed.

## Verification

| Check | Result and boundary |
| --- | --- |
| Archived pre-extension compiler | Group, inline and span/value-mark descriptors reject at the expected unsupported rule/dependency |
| Full native core | 107 PASS, zero FAIL; includes 11 new focused cases |
| Full native SDK | 67 PASS, zero FAIL; includes seven new focused cases |
| Independent semantic authoring | 188 actions / 376 actor states, two renamed descriptors |
| Schema rejection | 12 isolated cases, exact rejection paths and reasons |
| Earlier recursive-flow corpus | 162 actions / 324 actor states PASS |
| Earlier grid corpus | 180 actions / 360 actor states PASS; positive corpus hash unchanged |
| Earlier runtime profiles | Six profiles, 82 actions / 164 actor states PASS |
| Documented Cargo consumers | Both identical 73-line fences compile and run independently; 59 native source/data/manifest files unchanged |

Each positive descriptor contains three group types, two inline types and two
span types. The corpus covers nested flow/grid-cell contexts, first-match group
ownership, group defaults, concurrent inline insertion/deletion/attributes,
scalar formatting fences, overlapping span order, inheritance, regrouping,
retyping, undo/redo, ten coupled checkpoints, stable UTF-16 selection captures
and resolutions, duplicate pending replay and acknowledgement. Nonempty undo
and redo pending carets cross checkpoint restoration.

TS authors real `Doc.edit` operations and records raw `History`. Each `Doc.edit`-authored
change also passes public `Doc.check` against its pre-edit snapshot; `Doc.edit`
alone is not the full wire-admission oracle. Native authors independently through
the SDK. Typed operation IDs, raw full History/availability, pending/carets,
material storage, register writers, deletion/cancel ledgers, moves and clocks
match. Models normalize strings to UTF-16 units recursively in children and span
runs, and fill absent empty collections. Optional typed-operation defaults have
explicit format projections. Writer data is not removed to obtain a PASS.

The earlier narrow derived empty text/fragment-head projection remains: no
attributes, deletion/cancel entries or History/pending/move references. Flow-head
birth display uses its declared default; axis-head birth display maps the
already-reviewed DTO fallback to empty. All axis/cell/inline content and other
fields remain. Checkpoints are exact within each runtime; native journal and
TS line snapshots are different wire formats.

Earlier grid rejection expectations were updated only for newly supported
descriptors. Four cases now explicitly assert successful admission rather than
being filtered away; malformed span metadata still rejects at its intended
missing-field path. The 180-action positive document fixtures keep the same
hash. Old flow negatives with missing required marks are used only as rejection
smokes, not new named-rule coverage. New shapes negatives have valid required
fields except their intended violation.

## Integrated workspace and documentation

Final sequential workspace test passes **2,110 cases: 2,108 PASS, zero FAIL,
two expected platform SKIPs, zero cancelled**, in 122.128 seconds. Production
TypeScript, MCP, server and binding sources remain unchanged by this task.
Documentation build passes in 15.984 seconds. The final link check passes
55 pages and 2,612 internal links, with English content and local checkout
paths excluded. Review corrected the old grid paragraph to eight rejections
plus four new admissions; the original twelve-rejection result belongs to the
preceding historical checkpoint. See [final check summary](final-checks.json).

## Preserved failures and D3 gap

A separate observed empty-cell group insertion differs: TS rewrites the empty
head type/attributes and creates a default paragraph tail; the native physical
helper creates a member marker. **OBSERVED_D3_GAP** remains open. The final
positive corpus seeds cell intro text and inserts after its stable final token;
it does not claim to qualify the empty-head model command. Earlier post-move
model-position insertion gaps also remain open. This is not a format
normalization or a NOT_RUN result.

Diagnostic artifacts distinguish fixture mistakes, comparison-format mistakes
and actual SDK defects. One mixed-scalar fixture used a string default, so both
TS wire validation and native validation rejected zero/false; its valid null
default replacement is tested. A recursive run normalizer initially mishandled
native units and was corrected without discarding marks/content. A first-character
anchor was corrected to the intended physical block tail. Raw failed fixtures,
traces, error stacks and attempt hash maps are retained. Some early runs reused
`receipt.json`; their separate receipt copies were not all captured. Later runs
save numbered receipts. The final qualified receipt is `receipt-30.json`.
The report does not claim immutable per-run receipts or complete intermediate
source/binary snapshots for every diagnostic attempt.

## Documentation and proof limits

The [SDK README](../../../experiments/rust-sdk/README.md) and
[Rust guide](../../../apps/docs/src/guide/rust.md) share a complete two-peer
example. It asserts group/inline/span edits, foreign scalar preservation through
undo/redo, coupled checkpoint input, duplicate replay and acknowledgement.
The [Document schema guide](../../../apps/docs/src/schemas/document.md), custom
schema table and roadmaps describe derived identity and remaining rules.

Recovery comparisons export and restore native/TS checkpoints in the harness.
They do not qualify native process/server crash recovery, production transport
or GC protection, cross-runtime snapshot/wire exchange, a native Map/List
facade, a CRDT WASM artifact, Rust editor bindings or a Client engine factory.
No Chrome, mobile, performance or real-model invocation was run for this task.

## Reproduce

Use Node 24 and available Cargo dependencies. The recorded native comparisons
use macOS/Homebrew `/opt/homebrew/bin/cargo` (1.87); the legacy driver selects
local rustup stable. Other host layouts need a driver-path adjustment. Use new
output and target directories to retain existing evidence.

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
SHAPES_OUT=output/my-shapes SHAPES_TARGET=output/my-shapes-target node experiments/runtime-document-shapes/compare.mjs
GRID_OUT=output/my-grid GRID_TARGET=output/my-grid-target node experiments/runtime-document-grid/compare.mjs
NESTED_OUT=output/my-flow NESTED_TARGET=output/my-flow-target node experiments/runtime-document-nested/compare.mjs
RUNTIME_SCHEMA_OUT=output/my-runtime RUNTIME_SCHEMA_TARGET=output/my-runtime-target node experiments/runtime-schema-native/compare.mjs
```

Package/docs builds remove and recreate `dist`; do not overlap them with traces
or workspace tests. Local passes and source qualification do not publish the
website or a package.

The [selected evidence archive](evidence.tar.gz) retains native sources/data,
semantic fixtures, final and diagnostic failed traces, review, baseline proof,
consumer code and logs. The [manifest](manifest.json) records hashes and archive
membership. Build targets, executables and duplicate stdout traces are excluded.
Absolute paths in original receipts record provenance; they are not portable
execution paths. This is an evidence capsule, not an installable distribution.
