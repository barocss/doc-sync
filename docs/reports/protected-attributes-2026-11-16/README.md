# Identity-bound protected attributes

Issue: https://github.com/barocss/doc-sync/issues/3

Independent implementation on main 39e0a3a, without the inherited native WIP.

## Contract

The optional `protectedAttributes` / `--protect-attributes` configuration selects
1–16 top-level scalar schema attributes on stored text blocks. A separate bounded
`planningPath` is mandatory. Its existing text-only edit guard prevents structural
or out-of-target edits; protection does not extend that guard's permissions.

A settled, revision-matched slice captures path, stored ID, node type, epoch,
schema fingerprint and explicit attribute presence/value before planning. Every
subsequent step and authoritative finish compares the original capture. A changed
human value stops for review, never restoration or recapture. Missing targets,
replacement IDs, moved paths, schema/epoch transitions and incomplete persisted
captures fail closed. The atomic edit base fence still rejects intervening edits.

The guarantee is an observed authoritative revision, not a perpetual lock or
history-wide invariant. Changes that occur and revert between observations are
not detected. No general structural preservation, moved-ID relocation, nested
attribute objects, mark-range identity, model semantic evaluation or long-load
coverage is claimed.

## Verification

Short deterministic tests exercise unchanged attributes, unrelated human text,
conflicting human attributes, same-path replacement, deletion, shifted targets,
forbidden edits, durable process kill/resume, and both actor undo orders. Pure
checks cover absence versus explicit scalar values and schema/epoch mismatch.
The existing full bot suite, TypeScript and documentation checks are also run.

Independent read-only review found no blocking concurrency/recovery flaw and
caught an absent-value fixture using a default parameter; the final fixture
explicitly checks `present:false`, missing own `value`, and absent-to-false conflict.

Final Node 22.19.0 verification: full bot suite **92 PASS**, zero failures or
skips (about 21 seconds); root TypeScript PASS; fresh docs build and link check
PASS. The actual restart tests kill the bot process, restore its durable
checkpoint and compare the original capture. Schema and epoch transitions are
unit-level rejection checks, not a full server migration/rollback simulation.
