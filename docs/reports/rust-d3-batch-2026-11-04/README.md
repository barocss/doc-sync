# Atomic native model-insert batches

The private Rust SDK adds `RuntimeDocument::insert_models_batch` for an ordered
slice of `ModelInsert {at, model}`. It compiles supported model-child insertions
against one evolving detached candidate, then commits once. A later invalid
command preserves the complete live checkpoint, clock, History and pending work.
This is an insert-only native API, not the general EditOp compiler or a production
Rust/WASM Client backend. Work began on 2026-11-04; the namespace is retained
across local midnight.

## Result and identity

The result contains optional requested keys, one aggregate Change, and the sender
clock before/after compilation. Different rows at one column boundary reuse one
column ID. A repeated row creates another column. Group members inherit group
fields with explicit member values winning. A group has no separate stored ID.

Later commands observe earlier inserts, including a table created in the same
batch. Under default History options, one undo reverses the batch. Existing
typing coalescence remains. Foreign text, fields and hidden cell data survive
selective undo/redo and own checkpoint restoration. A retry reuses captured
pending operations; invoking the method again creates a new edit.

An absent requested key does not mean an empty change. A normalized-empty grid
can create a paragraph tail in an unprojected start path, or reserve a fragment
ticket without operations when projection is active. Empty operations preserve
redo and add no pending entry. Source promotion runs once when projection first
becomes active, including activation by an earlier batch command.

## Reservation consistency and compatibility

The initial broad native run caught an overly permissive restore policy: it
accepted an inconsistent old snapshot clock. That candidate's fresh comparison
PASS was explicitly superseded. The final candidate uses optional runtime
snapshot `reservedClock` metadata:

- Without metadata, saved clock must equal the journal replay clock.
- With metadata, `replay clock < reservedClock == saved clock <= MAX`.
- Null, fractional, mismatched, redundant, below-replay and excessive values
  reject atomically. Canonical journal equality remains required.
- Actual observed tickets at/above the reservation clear the marker. Lower
  tickets retain it, including remote delivery and replay.

The existing `runtime_nested` clock-corruption test remains byte-identical and
passes. New tests cover marker corruption, lower/equal/higher remote tickets,
text range ends, own record, undo/redo and checkpoint restoration.

Ordinary snapshots keep their previous shape. Reservation-bearing snapshots
require the updated private native reader; earlier-reader support is
**NOT_QUALIFIED**. The optional metadata checks counter-state consistency; it
does not authenticate a snapshot or prove server acceptance. CRDT Op grammar
and History steps remain unchanged.

## Final marker-qualified verification

Fresh independent TS and native authoring pass **14 profiles / three schemas /
351 actions / 702 actor states**. Eleven profiles use the original unpruned
Word23/Presentation27 descriptors; three use an explicit small custom schema.

- **93 live logical TS authorings**, including **27 batch array calls with
  43 insertion commands**; **zero raw-wire authorings**.
- **11 invalid-last arrays** check native live checkpoint byte identity.
  Negative TS compilation runs on a detached document; direct document-domain
  `Doc.edit` is not claimed globally atomic.
- **70 complete independent insertion-model oracles** and **10 full product
  undo oracles** pass. The model oracle independently tracks shared columns,
  fixed-width rows, anchored spans and empty-cell placeholders. Returned
  normalization closure is a separate check.
- Exact operations, tickets, optional identities, clocks, full History, pending
  work, retained token/register/deletion/movement state, foreign writers,
  backward UTF-16 selection, own checkpoint restore, retries and ack agree.
- All four guarded stages pass with **175 unchanged source/binary hashes**.
  Current batch trace SHA-256:
  `87f6394e966676e841a57bcc2c5b6293560188d8964cacb009fc82b8dab61fb0`.

Final full native checks: **core194 PASS / SDK159 PASS**, complete example and
two independent locked full-program documentation consumers PASS. The
108-file source maps match before/after; 76 inherited tests/examples are unchanged.
The SDK README and Rust guide contain the exact tested complete program.

Whole workspace retry: **2162 cases / 2160 PASS / two expected platform SKIPs /
zero FAIL or cancelled**. Actual TypeScript typecheck passes. The workspace run
reused existing package builds; no fresh package prebuild is claimed. TS CRDT
production source/dist is unchanged in this slice.
Final documentation build/checks pass: **56 pages / 2,729 internal links**,
English and local-path exclusion checks. Both complete program fences match
their separately compiled consumers.

## Inherited regression

All **10 inherited stages PASS** on the marker candidate: exact schema export,
19 schema/model tests, group/grid **481**, moved insertion **1062**, nested
paragraph **466**, unused declarations **84**, text-disabled blocks **90**
actions, and three CLI admission/product oracles. The five semantic corpora
contain **2183 actions**. Output-only adapters redirect unchanged harnesses to
the current target. The 267-entry guard map stays unchanged, including the
175 main qualification paths, 15 prior sealed reports and two old pinned
executables. Historical probes that expect already-fixed failures remain
explicitly excluded. Full traces are preserved with verified gzip round trips.

## Failures preserved separately

The first shared-column oracle kept a derived empty paragraph placeholder;
the independent model now replaces that placeholder when filling the cell.
Native empty-group admission under a PPT slide was a product defect: the
batch-only path now flattens the empty group before stored-child admission,
while validating the schema type, attrs, parent, path and index. Strict single
insertion is unchanged.

Two further failures were test preparation/comparison errors: an omitted span
end row requested native split versus TS merge, and a copied single-insert
assertion read a nonexistent batch `model` field. Both were corrected and followed
by fresh authoring. Diagnostic trace reuse is not the final qualification.
The broad old-snapshot clock failure and prior candidate PASS remain linked;
the final marker candidate received fresh authoring and broad core/SDK tests.

Early implementation compile/admission/restore failure summaries are retained
in `implementation-attempts.json`. Their original full stdout was overwritten
by the implementation worker. Later focused logs, differential failures and
the broad regression log are preserved; missing stdout is not claimed archived.

## Boundaries and next work

Native path bounds and unsupported empty-grid placement remain stricter than
some TS normalization paths. No-op input policy is not universal rejection
parity. Text offsets, general delete/update/split/merge/move commands, mixed
structured node attrs and typed model schema-value handles remain separate D3
work. Existing physical APIs keep their own reference-handle support.

[Q1.3 stable targeting](../../schema-editing-roadmap.md#q13-define-identity-relative-and-stale-base-edit-targeting)
is next, followed by host permissions and the remaining numbered correctness
queue. Native sessions, protected GC/recovery, full CRDT WASM and production
bindings keep their own gates. Own checkpoints are not durable native process/
server recovery or cross-runtime checkpoint interoperability.

No Chrome, mobile, performance measurement, deployment, registry publication,
commit or push is included.

## Evidence

`final-checks.json` links the individual receipts and current qualification maps.
`manifest.json` lists selected source snapshots, failure records and verified
lossless full traces. Standalone `evidence-*.tar.gz` volumes keep each archive
bounded; extraction restores repository-relative paths. `seal.json` binds the
report, checks, manifest and all volumes. Every selected member is read back and
hashed. Source-only copies of stage bundles preserve prior candidate code while
excluding executables; original bundles remain local and unchanged.

The opening 286-file baseline preserves inherited work. Fifteen prior reports,
two pinned executables, original schemas/harnesses and all existing test files
remain unchanged. Native 108-file and final main 175-file maps are rechecked
before sealing. These historical receipts do not qualify later source changes.
