# History provenance migration design (#32)

Status: design and current-reader baseline fixtures only. No v2 writer, migration,
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
rejection with no live/event mutation and unchanged empty pending queues.
Non-empty pending migration is not covered by these fixtures. These are baseline constraints,
not evidence that migration or v2 works.

Still required: dual-reader/v2 writer fixtures, old-reader downgrade refusal,
mixed legacy/new groups, peer simultaneous deletion, strict-mode review recovery,
set/move shared references and GC/reservations, journal replay, interrupted durable
migration and unchanged original bytes. No long-duration load or real model call.

## Checks for this design checkpoint

- Current-reader fixtures: 4/4 pass.
- Combined #31/#32 restore regression: 10/10 pass.
- Core TypeScript check passes. Full core suite was not rerun (no runtime edits).
- Independent read-only review found no blocking design inconsistency.
