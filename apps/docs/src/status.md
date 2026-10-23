# Status and limits

This documentation describes the implementation verified on 2026-10-23. A passing bounded test is not a production release or a guarantee for every editor and workload.

## Available behavior

- Schema-defined text, inline content, lists, nested flows, tables, spans, and attributes.
- Local-first editing, validated changes, HTTP/SSE demo transport, and snapshot/GC support.
- Per-user undo and redo that retain independent changes under the stated ownership rules.
- Remote cursors and selection ranges, including backward and overlapping selection.
- A ProseMirror binding and separate Slate/Lexical/ProseMirror compatibility demo.

## Regression coverage

The structural-cache implementation was verified with `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: 246 library tests and 10 demo tests passed. The compatibility unit suite passed 31 tests. Stage0 Ours/Yjs passed 6 tests. Type checking and the compatibility build passed.

Chrome checks covered 40 basic/nested/presence/multiple-block steps, 84 compatibility input cases, and 20 ordinary cases (18 convergence checks and 2 probes). Another 30 operation traces were captured. These are different evidence types; a captured trace is not an OS IME acceptance result.

The fixed collaboration-intent cases cover overlapping deletion, formatting, insertion, and undo. Sequential formatting undo/redo regressions include remote same-value and partial-range writes.

## Open work

| Area | Remaining work |
|---|---|
| Recovery | Fresh-session snapshot recovery after lease expiry; old pending edits and history. |
| Operations | Authentication, authorization, durable snapshot/log retention, limits, and failure recovery. |
| Schema evolution | Version negotiation, migration, and old-client handling. |
| Editor acceptance | Target-editor behavior and real OS IME validation. |
| Performance | Structural line scans, whole-model comparison/copy, conversion, DOM work, and unexplained tail latency. |
| Long-term evidence | Actual scheduled CI and two-week observation; the 30-minute target cadence is not complete. |
| Distribution | npm build output, API/version policy, migration tools, and release gates. |

G0/G1 and product SLOs are not approved. The long local test used bounded histories; it is not a million operations accumulated in one permanent document.

## Intentional boundaries

Live text-span coalescing is excluded by the current decision. Binary wire format and actor numbering remain undecided. Move/cut operations and collection of hidden merged-cell text are not implemented. Deletion and formatting remain separate states.

[Read performance evidence →](./performance)
