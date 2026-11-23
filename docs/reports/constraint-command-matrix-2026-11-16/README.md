# Constraint × command × concurrency matrix (#23)

This bounded TypeScript regression slice supplements existing constraint suites;
it does not add a constraint implementation or complete the full cross-product.

| Constraint | Command | Schedule | Additional boundary |
|---|---|---|---|
| atomic string enum | model attribute update | peer text before/after submission | invalid raw value projects default locally, hub rejects |
| numeric min/max | model attribute update | peer text before/after submission | invalid raw value projects default locally, hub rejects |
| atomic regex | model attribute update | peer text before/after submission | invalid raw value projects default locally, hub rejects |
| nested numeric leaf | model attribute patch | peer text before/after submission | client-engine late invalid batch rejects without mutation |

Eight deterministic cases author the two edits before exchanging them. Each
checks convergence, preserved peer text, empty pending queues, selective local
undo/redo and reconnect. Atomic invalid input is compiled on a disposable raw
Doc: the test checks stored invalid operation and default model projection,
then confirms hub rejection leaves snapshot/sequence unchanged. Nested rejection
uses the supported client engine and checks snapshot/pending/history unchanged.

## Important boundary findings

Raw `Doc.edit` is not a universal atomic validator. Atomic invalid attrs can be
stored and projected to defaults, while the hub validates incoming changes.
A raw document batch that inserts text then encounters an invalid nested field
can partially mutate before throwing (source/probe finding, not asserted by
this eight-case suite). The client engine's clone preflight rejects
that batch without changing live state. This report does not silently upgrade
the raw API contract or claim that every invalid model command is rejected by
all layers. Callers must not substitute raw Doc for the protected engine path.

During test development the harness initially omitted clientSchema, and later
assumed universal invalid-input rejection. Those failing attempts were corrected
after inspecting the actual compiler/model/server boundaries. They are not
reported as product fixes. Final focused suite: 8/8 PASS.

## Existing evidence and remaining scope

- `nested-fields.test.ts`: separate leaf writes, same-value ownership, reset
  races, undo and snapshot descriptors (existing tests, not new implementations).
- `cardinality.test.ts`, `cardinality-review.test.ts`: required/overflow rules.
- `schema-transition.test.ts`: additive transition and protected pending work.
- New cross-product coverage of cardinality, marks, arbitrary multi-command
  batches, deletion/move/split, schema transitions and field references: NOT_RUN.
- Native mixed-runtime, property schedule shrinking, browser/IME and long load:
  NOT_RUN here. Rust prerequisite WIP is untouched.

## Reproduction and review

Build packages first (`npm run build`), then run
`node --test packages/doc-sync/test/constraint-command-schedules.test.ts`.
The harness imports built artifacts. Independent read-only review confirmed
the two legal submission orders and API-boundary distinctions. Rejection paths
also preserve client event counters; event-mirror completeness, process restart
and offline conflict schedules are not established by these cases.

- Full core suite: 1652/1652 PASS (~55 seconds); core typecheck PASS.
- Final focused rerun after event-counter assertions: 8/8 PASS. No runtime code changed.
