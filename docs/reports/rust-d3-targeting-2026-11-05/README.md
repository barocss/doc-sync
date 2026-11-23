# Strict native stored-ID insertion

The private Rust SDK adds `read_model_for_edit` and `insert_models_relative`.
Read one model/base, then insert before/after an exact stored primary block or
at the root/stored-flow body's start/end. Each command resolves on the evolving
candidate and the batch commits once. A later failure preserves live document,
clock, History, pending work and base usability. Current group members address
their member slots; a derived wrapper has no stored ID.

## Local base and strict targets

The opaque non-Serde base contains instance incarnation, checked publication
revision and existing schema identity. It retains no snapshot/journal. Successful
apply/commit consumes it, including duplicate, empty and clock-only publications.
Failed calls, reads and acknowledgement preserve it. Restore creates a new
incarnation, including identical-checkpoint rollback. Counter exhaustion checks
precede publication; bounded threaded allocation checks uniqueness.

The token check is O(1), not the whole operation. Lookup captures one state per
command and reuses projection/liveness/birth/required-source/cell indexes.
Source review removed repeated whole-state exports and quadratic cell searches.
Model reading, lookup and detached compilation still depend on document size.
No performance or memory benchmark is claimed.

Missing, deleted, ancestor/cardinality-hidden, covered, alias, character/inline,
synthetic/default-head and axis targets reject without selection fallback.
Stored visible-cell blocks can be sibling targets. Generic inside(text/grid/
atom) rejects. A result key naming an intrinsic head is not an eligible stored
anchor; explicit root/stored-flow edges remain available. Repeated After(K)
commands place later content closer to K; InsideEnd appends in array order.

This is a synchronous local SDK guarantee, not a server version, lease,
authorization decision or acceptance receipt. It does not automatically rebase
stale plans. Op grammar, core storage, History, checkpoints and Q1.2 reservation
metadata remain unchanged. Core source matches the opening baseline.

## Fresh execution

- **14 profiles / four schemas / 390 actions / 780 actor states**. Five profiles
  use original Word23/Presentation27; nine are explicitly custom.
- **107 live logical TS authorings**, including **16 relative arrays / 26
  insertion commands**, plus three ordinary no-op batches. Four raw setup
  authorings are separate from compiler evidence.
- **26 negative calls / 27 base reads / 89 complete independent model oracles**.
  Tests include moves/current group slots, visible/covered cells, hidden live
  descendants, lower-clock remote changes, stale/foreign bases, restore ABA,
  no-ops, reads/ack, foreign edits, undo/redo, own restore and exact retry.
- TS resolves strict targets independently against a complete detached prefix,
  then calls one live Doc.edit array. No native-returned path is its oracle.
  Exact operations, IDs, clocks, History, pending work, retained storage/writers
  and stable backward UTF-16 selection agree.
- All four fresh guarded stages PASS with **176 unchanged paths**. Target trace
  SHA-256: `fd2515c4d455ec68ac0a84054ec40b4611eef1b07bf7a4b32194474240ddbabb`.

Full native **core194 / SDK173 PASS**, complete example and two independent
locked full-program documentation consumers PASS. The complete **112-file**
before/after maps match; **80 inherited tests/examples** remain byte-identical.
An earlier successful broad run's collector omitted four filenames containing
`target`; that subset receipt is preserved. Correct exact-directory filtering
and fresh broad tests qualify the full map. Main comparison always included them.

Inherited regression: **11 stages / 2534 actions PASS** across batch351,
group/grid481, moved1062, paragraph466, unused84, textfalse90, exact schema
export, 19 schema/model tests and three CLI oracles. The 285-entry map stays
unchanged, including main176, 16 old seals and three pinned executables.

The prior Q1.2 whole workspace **2160 PASS / two expected platform SKIPs** and
typecheck are reused for unaffected TS code, not rerun here. New checks are native,
independent authoring and current docs. TS production/dist is unchanged.
Docs build/check PASS: **56 pages / 2735 internal links**, English/local-path
checks PASS. Complete program fences match their separate consumers.

## Preparation and review provenance

Failed focused/setup/oracle/helper attempts remain preserved and classified.
Legacy SDK delete_block cascades descendants; owner-only rawDelete preparation
now matches the intended alive-but-hidden child fixture. It changes no public
delete or targeting rule. Native eager flow-body heads and TS lazy heads are
matched with explicit deterministic read-only materialization. Clock/model and
all other authored state stay unchanged; ordinary stored heads are not filtered.
Other corrections cover actual group wrapper metadata, synthetic-head eligibility,
raw text boundaries and prefix-planning/helper details. Final qualification uses
fresh authoring after these fixes.

The High source review covers 18 unchanged product/API/test/core inputs. Its
three later MJS harness corrections and rawDelete utility have recovered reviewed
bytes, hash-bound diffs and fresh execution proof in a separate provenance
receipt. That review is not retroactively claimed to cover the four later files.

## Limits and next work

Q1.3.2 adds typed grid+row(+column) row/cell-body targets. Q1.3.3 separates one
explicit column creation command from numeric memo behavior. Q1.3.4 adds a native
read catalog and explicit alias diagnostics. None is implemented by this report.
General D3 commands, native sessions/GC/recovery, full WASM CRDT and production
bindings remain open. Same-runtime checkpoints are not durable process/server
recovery or cross-runtime checkpoint interchange.

No Chrome, mobile, performance measurement, native hosted permission, deployment,
registry publication, commit or push is included.

## Evidence

`final-checks.json` binds the receipts and source maps. `manifest.json` lists
selected current/baseline sources, failures and lossless complete traces in
`evidence-*.tar.gz` volumes. `seal.json` binds the report, checks, manifest and
volumes; every archive member is read back and hashed. Source-only derivatives
retain prior stage code while excluding executables. Historical seals do not
qualify later source changes.
