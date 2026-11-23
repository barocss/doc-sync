# D3 group and grid model insertion

The native SDK extends `insert_model_at` for bounded group/grid models and
logical group/grid/row/cell-body paths. Compilation uses detached native state
and records one History action. Rejection leaves the live model, clock, pending
queue and History unchanged. General native command compilation and production
Rust/WASM clients remain separate roadmap gates.

## Supported boundary

- A derived text group returns its first stored member ID. It has no stored
  wrapper ID. Group `by` values feed member fields; explicit member fields win.
  A parent-admitted paragraph or grid inserted at a group gap splits the group.
- New dense grids allocate all rows, then all columns, then row-major cells.
  New ragged grids use the maximum supplied width. Nested grids require an
  explicit schema placement; original Word/Presentation cells do not permit
  tables in their cell-body flows.
- Row model insertion preserves the existing grid width, clipping excess cells
  and padding short rows. Cell model insertion creates a global column at the
  same index in every row and returns that column ID. Cell-body selector is zero.
- Supported cell fields compile in exact TS order, including span and mixed
  structured/scalar fields. The private compiled-operation recorder accepts
  fresh nonoverlapping operation stamps in TS emission order. The public
  monotonic recorder contract is unchanged.
- Runtime Document direct covered-cell selections retain raw text identities
  and visually resolve to the merged top-left cell. Split, backward UTF-16
  ranges, moved-in/out text, checkpoint restore and deleted-axis/owner rejection
  have focused tests. Hidden descendant flows remain outside this subset.
  Legacy hidden-selection and superseded-required-child rejection rules stay.

Empty group/grid inputs have a separate policy: TS can normalize/drop them,
whereas the native `(Key, Change)` API rejects them atomically because no stored
result ID exists. Malformed attrs, unsupported row/body attrs, text offset paths,
general mixed structured node attrs, model schema-value handles and trailing
reserved-only transactions remain explicit limits. A single insertion is not
a public multi-command batch with shared column memo.

## Verification boundary

Native core **189 PASS** and SDK **152 PASS**. The complete example and two
independent locked documentation consumers pass. The 104-file source maps match
before and after those checks, and 72 inherited tests/examples are byte-identical.
See the source-bound aggregate in
`output/rust-d3-group-grid-2026-11-04/structural-final-receipt.json`.

Whole workspace retry: **2162 tests, 2160 PASS, two expected platform SKIPs,
zero failures/cancellations**. Initial workspace testing failed only because
the new schema-contract navigation link was missing from its golden assertion;
the expected link was added without removing order assertions. The final
workspace run reused existing package builds. Actual TypeScript typecheck passes.
No TypeScript CRDT production source or dist change is part of this slice.
Final documentation build and checks pass: **56 pages / 2,722 internal links**,
English text and local-path exclusion checks. Both complete Rust program fences
match their independently compiled consumers exactly.

The initial four native comparisons pass 77 actions. The expanded six-case
diagnostic passes 134 actions, including the covered-cell selection fix.
The fresh final authoring corpus passes **22 profiles, 10 distinct schemas,
481 actions and 962 actor states**. It contains 14 profiles on the original two
Word/Presentation schemas, two explicit recursive-cell-table compositions and
six generated schemas. All four guarded stages pass: schema/admission checks,
independent TS authoring, independent native authoring and exact comparison.
The source and binary maps are unchanged across those stages. The main receipt is
`output/rust-d3-group-grid-2026-11-04/compare/run-2026-11-04T14-05-05.467Z-20711/receipt.json`.
There are 113 actual TS `Doc.edit` authorings and five raw `Doc.emit` authorings;
they are not interchangeable proof of command compilation.
All **93 complete independent insertion-model oracles** pass.

Current-native inherited comparisons also pass: moved insertion **1062 actions**,
nested paragraph **466**, unused declarations **84** and text-disabled blocks
**90**. Schema export, unused/text-disabled admission oracles and the product
compilation boundary pass separately. New namespace adapters target the new
binary; the original harnesses, previous targets and 14 sealed reports remain
unchanged. Historical probes that expect already-fixed failures are excluded
explicitly, rather than reported as new failures or silent passes.

## Findings and oracle corrections

The old native compiler rejected group/grid model construction. New comparisons
also exposed a real runtime Document covered-cell selection mismatch: TS kept
raw text anchors and clamped their displayed position; native returned no
selection. The scoped native capture/resolve guards now follow the current
logical location. Physical origins, movement, wire and History rules did not
change for that fix.

Other initial failures were expected-model mistakes. The documented TS edit
contract allows computed normalization: anchored merge extents grow across
inserted axes, column insertion changes every row at the same index, and row
insertion preserves the previous width. The independent oracle now derives
those rules from the pre-command model. A second check requests `{normalize:
true}` and verifies that applying the returned corrections closes the local
request to the actual model. The corrections are not the sole oracle. The TS
production model rules were preserved. All initial failures remain evidence.

## Follow-up research

[The numbered schema-editing queue](../../schema-editing-roadmap.md) separates
functions from qualification. Next: atomic batches, ID/stale-base targeting,
host authorization after preparation, generated causal schedules and reduction,
persistent annotations, typed schema-value model inputs, native lifecycle/GC,
observer completion, desktop normalization and long-session budgets. Existing
TS features are identified rather than described as absent.

The first Q2 fixture generator has **19 PASS** source checks, six reproducible
seeds, schema renaming, fixture isolation and independent model closure. All six
seeds also pass **120 native/TS actions** in fixed two-actor sequences with field writes, selection,
undo/redo, own checkpoints and exact retry in the main comparison. Fixed
sequences are not a general causal scheduler or a validity-preserving reducer.

## Evidence and preservation

[Final checks](final-checks.json) bind the source-bound result and individual
receipts. `manifest.json` lists selected sources, opening baseline snapshots,
compact failures and verified lossless full traces in `evidence.tar.gz`.
`seal.json` binds these files; every selected archive member is read back and
checked. Large raw JSON remains local, with verified gzip copies selected for
the archive. Duplicate stdout, loose executables and Cargo targets are excluded.

The opening 265-file snapshot and separate navigation/config snapshots preserve
inherited work. TS production source/dist, original product schemas, old
harnesses, previous reports and the pinned old executable stay unchanged. The
final native 104-file and main 168-file source maps are rechecked against current
files before sealing. Subsequent inherited adapters have their own stable map.
An archive of selected evidence is not a package release.

No Chrome, mobile, performance benchmark, WASM integration, mixed-runtime wire,
durable native process/server restart, protected native GC, commit, push,
deployment or registry publication is included.
