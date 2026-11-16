# History provenance migration design (#32)

Status: design, detached format inspector, and current-reader baseline fixtures. No v2 writer, migration,
legacy quarantine UI, or new runtime guarantee is implemented. #32 remains open.

## Evidence and boundary

`packages/doc-sync/src/crdt/history.ts` stores existence steps as `{ids, delAt}`.
Undoing a local deletion makes `delAt` null; redo creates a fresh deletion ticket.
The original deletion ticket is no longer attached to that step. Foreign target
IDs are legitimate when this actor deleted another actor's text. Inferring the
original writer from those IDs is incorrect. #31 checks applicable ownership,
known targets and allocation floors but does not authenticate ambiguous redo.
A coherent malicious checkpoint can forge metadata: provenance is an invariant,
not a signature, storage trust boundary or peer authentication mechanism.

## Proposed v2 representation (not an accepted runtime format)

Retain the existing mutable `delAt` and ordered target IDs. Add an immutable
`origin` discriminated union on each existence step:

- `{kind: 'insert', ticket: Ticket}`: original text/node birth ticket. Text targets
  are the contiguous UTF-16 ticket range (not Unicode code point count).
- `{kind: 'delete', ticket: Ticket}`: original deletion operation ticket; targets
  may belong to other actors. Undo/redo never replaces this origin ticket.
- `{kind: 'legacy-unverified'}`: imported v1 step without invented original facts.

Every imported v1 existence step stays legacy-unverified, even if its current
phase appears attributable. A later locally generated redo ticket does not
retroactively prove its original action. Preserve groups, caret data, ordering,
set/move shared references and pins. Do not reconstruct provenance from unrelated
cancellation records. Set/move/split origin upgrades are outside this first slice.

For new entries validate actor and safe ticket ranges, origin kind/target shape,
current phase and allocation floor before issuing an install handle. In undo,
insert has null delAt and delete has non-null delAt; redo has the opposite phase.
When non-null, delAt must be local but can differ from the original delete ticket
following repeated cycles. Concurrent peer deletions must remain effective when
local deletion is undone. GC acceptance still depends on protected generation
and retained targets; origin metadata must not bypass reservation/GC checks.

## Reader/writer compatibility and rollout

| Reader | v1 payload | proposed v2 payload |
| --- | --- | --- |
| Current release | Existing validation/behavior | Reject before install |
| Future dual reader | Preserve as legacy-unverified | Validate discriminator and invariants |
| Future writer | Explicit v1 compatibility only; no claim of v2 guarantees | Emit v2 only after application opt-in/capability gate |

The future v1 compatibility writer means a separate legacy-writing mode, not
a conversion of existing v2 state. Do not change version to 1 or strip origin to downgrade v2. Current readers ignore
unknown step fields inside v1, so adding origin under version 1 is unsafe. Reject
unsupported version at the top level. Local state, engine envelope and SyncClient
outer format numbers are independent from History version; their successful parse
must not imply History compatibility.

Coordinated consumers: `crdt/history.ts` type/reader/writer,
`engine/typescript-client.ts` prepare/install, `engine/checkpoint-validation.ts`,
`local/state.ts` and local client, `sync/client.ts` format 1/2 restores,
`apps/mcp/src/journal.ts` replay/checkpoint recovery and `apps/mcp/src/session.ts`.
Update public exported types and reader capability checks before enabling writes.
The old package must receive the fixture in compatibility tests, not merely a
mock claiming to be an old reader.

Legacy policy must be explicit at open: compatibility mode preserves current v1
behavior with a visible unverified status; strict mode retains the complete
checkpoint but blocks unverified undo/redo, rather than silently dropping groups.
A strict-blocked imported document must remain exportable. Switching policy must
not implicitly execute a pending action. Neither policy exists in this patch.

## Interrupted migration protocol (proposed)

Read and retain original bytes; parse into a detached candidate; validate all
history, document, pending and journal metadata; write a separately versioned
candidate using storage-specific transaction/atomic replace; verify durable read;
then mark the active generation. Never overwrite the only original copy first.
Failure at any stage leaves old bytes and live state intact. Reject incompatible
reader before writing. Journal needs an explicit generation/checkpoint envelope
agreement, not mixed v1/v2 records interpreted opportunistically. Crash injection
must test every write boundary using the actual storage adapter before rollout.

## Validation plan and current coverage

The companion `history-provenance-compatibility.test.ts` exercises current v1:
local/foreign-target deletion cycles, original-ticket loss, forward-version
rejection with no live/event mutation. Non-empty pending is preserved by the
existing unsettled-client guard, which runs before history parsing.
This does not validate a successful pending migration. These are baseline constraints,
not evidence that migration or v2 works.

Still required: dual-reader/v2 writer fixtures, old-reader downgrade refusal,
mixed legacy/new groups, peer simultaneous deletion, strict-mode review recovery,
set/move shared references and GC/reservations, journal replay, interrupted durable
migration and unchanged original bytes. No long-duration load or real model call.

## Checks for this design checkpoint

- Current-reader fixtures: 8/8 pass after policy follow-up.
- Combined #31/#32 restore regression: 14/14 pass after policy follow-up.
- Core TypeScript check passes. Full core suite was not rerun (no runtime edits).
- Independent read-only review found no blocking design inconsistency.

## Dual-reader admission and explicit legacy policy (design follow-up)

A future dual reader should have a detached parsing stage that returns version,
legacy step count and validated candidate; it must not install into a live client.
The caller must supply an explicit policy before creating an install handle:

| Input | Policy | Proposed result |
| --- | --- | --- |
| v1 with existence entries | compatibility | Preserve exact v1 behavior, expose unverified status |
| v1 with existence entries | strict | Retain source/candidate, block legacy undo/redo |
| v2 with any legacy entries | strict | Same blocked behavior; do not infer trust from envelope version |
| v2 with complete origins | either | Check document coupling/actor/phase before admission |
| unknown version or malformed origin | either | Reject before install/write |
| omitted/unknown policy | migration entry point | Reject, not a permissive fallback |

The existing v1-only API stays compatible until a coordinated opt-in API is
available. Do not silently change existing applications to strict or automatically
promote their data. Provenance status describes format validation only, never
trusted authorship. V2 reader cannot merely run the old parser and drop unknown
fields; the baseline proves that v1 step extensions are silently discarded.

Strict mode must check the entire next group before popping any stack or creating
operations. If one step is unverified, leave the group, caret, document, pending,
clock, pins, and events unchanged. Newly recorded actions cannot upgrade an older
legacy step. Clear-history is an explicit user operation, never a migration
fallback. Capability/status UI needs to distinguish available-but-blocked history
from an empty stack. Policy switching must be explicit and cannot trigger replay.

Current follow-up fixtures exercise non-empty pending preservation for both Sync
formats, v1 extension-field loss, and retry from the unchanged serialized source
after a future-version rejection. They do not simulate a disk crash, implement a
dual reader, or supply the strict-mode UI. Those remain rollout requirements.

Follow-up test correction: non-empty pending triggers the existing settled-client
precondition before the history version parser, so it proves rejection/preservation,
not dual-reader handling of pending changes. A successful fallback install resets
the engine revision as documented; compare document/history and original source
bytes, not revision identity. Initial 3 assertion failures exposed these assumptions
and were corrected without altering runtime behavior.

## Implemented detached inspection slice

`inspectHistorySnapshot(input, {legacyPolicy: 'strict' | 'compatibility'})` is now
exported from Core. It validates JSON/common tables/groups and the proposed v2
existence origins/phases, returning only `scope: 'format-only'`, source version,
legacy/origin step counts, and `legacyActionsBlocked` policy signal. The latter
is a recommendation for a future caller, NOT enforcement of live undo/redo.
It produces no History object, install handle, migrated snapshot or disk write.
The v1-only reader and writer remain unchanged and continue rejecting version 2.

V1 origin-looking fields still count as unverified. V2 explicitly tagged legacy
steps remain unverified even alongside valid origins. Invalid/missing policy,
unsupported version, malformed origin, wrong phase, inconsistent deletion actor
and invalid insert ticket range throw before any external state is touched.
This inspector cannot prove actor ownership relative to a document, saved clock
floor, token existence, GC safety or trusted authorship. Checkpoint installation
still needs those checks. Non-existence step provenance is outside this slice.

The internal v1 projection only reuses common shape validation on an already
JSON-validated detached copy. It is never returned or installed and does not
constitute a v2-to-v1 migration. No consumer is automatically switched to v2.

Inspector verification: 7 focused tests, core build/typecheck and final full Core
suite 1706/1706 pass (53.6 seconds). Docs build/check passes: 56 pages, 2686 links.
Independent review prompted internal causal-clock checks and an explicit field
comment that the policy signal is not runtime enforcement. An initial full run
overlapped a rebuild and had two missing-dist import failures; the final suite was
rerun after the completed build and passed. No long-duration load was performed.
