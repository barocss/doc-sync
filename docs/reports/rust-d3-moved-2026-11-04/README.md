# Model-position insertion after movement

This bounded D3 extension supports `RuntimeDocument::insert_paragraph_at` and
`insert_model_at` when a Document already has retained movement records. Original
Word23 and Presentation27 schema declarations remain unpruned and unchanged.
The opening state is main `1cfb7a2` plus inherited uncommitted work. The 195-file
opening snapshot and 13 previous report seals preserve that distinction.

## API and behavior

Use the current model child path, not a retained physical source index. The
compiler uses accepted placement winners, including movement history after undo
and cycle-suppressed operations. It caches the predecessor's accepted placement
stamp before creating the node. A new node keeps its physical source origin and
receives its own logical Move. Existing sibling placements are not rewritten.
Nested inserted flows chain their children through the same rule.

Native compilation runs on a detached checkpoint candidate, validates it, and
records the whole insertion once. Rejection preserves the original clock,
History, state and pending changes. The physical `insert_block_in` contract stays
unchanged. The complete two-peer program is `examples/runtime_moved.rs` in the
SDK; both documentation fences and independently compiled consumers match it.

Two TypeScript position defects were exposed by the independent model oracle.
A moved default title can leave `[notes,title]` in the raw projection while the
canonical model has `[defaultTitle,notes]`. An automatic empty leading text gap
can also disappear during insertion. The compiler now prepares fresh empty
default identities only where target/ancestor paths need them. It preserves
written heads, foreign writers and max-hidden original text. The new local
schema accessor avoids a full document-model read. Group owners, maximum zero,
shared automatic groups, traversal and invalid child gaps have regression tests.

A second defect appeared after move undo/redo. Appending after ONE reused the
old `ONE-tail|end` boundary of moved-away TWO. Source coalescence joined TWO's
text into the new paragraph. For an unconstrained ordinary text birth, an exact
boundary collision in another accepted logical gap now uses the next retained
physical primary text marker as its right fence. IDs, origins, ticket counts
and existing placement writers are unchanged. Repeated reuse advances the fence.
Peers inserting at the same observed gap still use one boundary and coalesce;
undo removes only the author's contribution and retains peer text.

Physical source virtual-text promotions precede editing. Eligible candidates
are sorted by UTF-16 line-key order, keeping within-line order. This avoids ID
allocation differences caused by TS lazy line materialization versus native
eager storage. The read-only native `source_projections` query uses the existing
source-block serializer and original storage order. It changes no state or
checkpoint DTO. Sorting happens in the compiler, not in stored sequences.

Native movement-mode boundary admission now treats a known right key as a
retained opaque anchor. A current-parent equality check would reject valid
pending insertion after a peer relocates or deletes its predecessor. Known-key,
non-self, origin-prefix, parser, child-boundary and schema/type checks remain.
Legacy non-movement physical checks stay unchanged. This matches the existing TS
boundary contract and adds no wire grammar or blanket per-birth unique suffix.

## Verification

- Original Word/Presentation: **27 profiles / 1062 actions /
  2124 actor states**, with the complete model-edit oracle.
  **176 logical Doc.edit authorings /
  93 raw Doc.emit authorings** are separate;
  **130 complete independent insertion model oracles** pass.
- Native core **189 PASS**, SDK **142 PASS**. The complete example and
  both independent locked documentation consumers pass, with frozen source maps.
- Current TypeScript source regressions: **119 PASS**; actual typecheck **PASS**.
- Fresh complete `npm test`: **2162 tests / 2160 PASS / two expected
  platform SKIPs / zero FAIL / zero cancelled**.
- Documentation build and checks pass: **55 pages / 2,660 internal links**, English
  and local-path checks pass. Both full program fences match their consumers.
- Inherited paragraph466, unused84 and textfalse90 traces, schema export and
  admission/product oracles have separate fresh receipts in the summary. Historical
  probes that expect already-fixed failures are explicitly excluded.


The main corpus compares the complete independent `applyEdits(beforeModel, edit)`
result for every logical insertion, plus requested child slot/type/text/attrs.
It also compares typed operations and exact ticket order, complete History,
pending batches, registers, deletion/placement ledgers, clocks and stable
selections. Models convert text strings to UTF-16; absent empty model fields,
derived unused empty storage and listed material ordering representations use
explicit conversions. No writer, ticket or History normalization hides a gap.

Scenarios cover root and nested gaps, movement undo/redo, cross-flow blocks and
parents, required/default heads, suppressed-cycle winners, fresh recursive
flow/text insertion, both peer undo orders, stale insertion after predecessor
relocation/deletion, checkpoint redo and exact pending retries. Promotion pairs
control the TS own-snapshot line inventory to emulate opposite lazy read orders;
this is a read-history control, not cross-runtime checkpoint exchange.

The old executable's blanket movement rejection and initial TS requested-model
failures remain separate diagnostics. The promotion seed initially failed in a
pre-movement staged snapshot capability boundary before reaching insertion.
Those controlled fixtures now use explicit raw Node/Text seeds; no production
snapshot fix or broader pre-movement authoring qualification is claimed. Raw and
logical authorings are counted separately. One new fixture initially omitted
its declared bold mark; that corrected fixture failure remains in the evidence.

An initial typecheck rejected ES2023 array copy methods in new tests. They were
replaced with compatible copied-array reverse/sort operations. Actual typecheck
and source regressions were rerun. Later physical-boundary production changes
received a fresh complete npm run. Earlier positive runs are historical, not
substitutes for the final source-bound receipts.

The final comparison reuses the completed, guarded TS and native authoring
traces. The original comparison searched the first Move for a target and selected
an older retained record. The corrected verifier finds B's exact stamp and
separately checks the authoritative winning placement in both runtimes. The
assertion-only diff and read-only executor diff are saved. All remaining model,
operation, History and material checks run on SHA-bound full traces with current
production/input/binary hashes. Status is `TRACE_RECOMPARISON_PASS`; this is not
a claim that the corrected comparer originally authored all four stages. The
original failure remains. A compact failure pointer avoids duplicating the large
traces in an error dump. Raw promotion atoms were also corrected to use empty
nontext boundaries, preserving the native contract rather than widening it.

`final-checks.json` binds receipt paths and current source hashes. Qualified full
traces are losslessly compressed with restoration hashes. The selected evidence
archive includes sources, diagnostics and receipts; its manifest and readback
seal identify included files and exclusions. Previous report seals and the
pinned before executable remain unchanged.

## Bounds and remaining work

The input is one text node or a supported recursive flow/text tree. Grid/group
model construction or parents, flows with grouped child projections, text-offset
paths, mixed structured attribute
maps, schema reference handles in model JSON and trailing reserved-only edits
remain unsupported. Existing TS malformed-model normalization and native strict
atomic rejection differ and are recorded as an API boundary. Negative TS edits
in comparisons compile on a clone; direct `Doc.edit` is not newly transactional.

Recovery restores each runtime's own schema, actor, pending state and History.
This does not qualify mixed-runtime checkpoint/wire exchange, protected GC or
production process/server crash recovery. General D3 delete/update/split/merge/
move compiler equivalence and production Rust/WASM Client/editor integration
remain open. No Chrome, mobile or performance benchmark was run. No commit,
push, deployment or registry publication is included.
