# Status and limits

This documentation describes the current implementation and its verification limits. A passing bounded test is not a production release or a guarantee for every editor and workload.

## Available behavior

- Schema-defined text, inline content, lists, nested flows, tables, spans, and attributes.
- Local-first editing, validated changes, HTTP/SSE demo transport, and snapshot/GC support.
- Per-user undo and redo that retain independent changes under the stated ownership rules.
- Remote cursors and selection ranges, including backward and overlapping selection.
- Public ProseMirror, Slate and Lexical binding subpaths in one library package.
- Identity-preserving paragraph, block and group placement, with conditional undo.
- Required-child and maximum-count projection with retained overflow.
- Declared nested-attribute field registers and persistent annotations.

## Regression coverage

The earlier structural-cache implementation was verified with `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: 246 library tests and 10 demo tests passed. The compatibility unit suite passed 31 tests. Stage0 Ours/Yjs passed 6 tests. Type checking and the compatibility build passed.

Chrome checks covered 40 basic/nested/presence/multiple-block steps, 84 compatibility input cases, and 20 ordinary cases (18 convergence checks and 2 probes). Another 30 operation traces were captured. These are different evidence types; a captured trace is not an OS IME acceptance result.

The fixed collaboration-intent cases cover overlapping deletion, formatting, insertion, and undo. Sequential formatting undo/redo regressions include remote same-value and partial-range writes.

The new capability review added fixed cases for placement cycles, post-move split/join/history, required slots, field ownership, annotation affinity, snapshots, invalid operations and mutable-output isolation. Functional and security review suites passed 137 cases. Final aggregate and browser results are recorded with the current source; earlier counts above describe their original integration.

Automatic paragraphs now keep one visible identity when edited or moved. Splitting before moved siblings preserves their order and placement ownership. Fixed regressions cover concurrent input/formatting, same-boundary splits, history, compaction, snapshots and private-anchor validation. Chrome exercises native input and Enter in Slate, Lexical and ProseMirror, with five native/client models matching the server. See the collaboration intent reference for the expected examples.

Final expanded tests pass 525 library, 12 demo and 27 documentation cases, plus 31 compatibility unit cases. Chrome passes 175 finite checks, including 14 automatic-paragraph/split-order checks and 12 checks for editing paths after an empty replacement and cache rebuild. The 30 operation traces within that count establish captured operations and convergence, not OS IME acceptance.

## Open work

| Area | Remaining work |
|---|---|
| Recovery | Fresh-session snapshot recovery after lease expiry; old pending edits and history. |
| Operations | Authentication, authorization, durable snapshot/log retention, limits, and failure recovery. |
| Schema evolution | Schema migration and evolution. Protocol 2 gates the current capabilities and rejects incompatible peers; it does not migrate schemas. |
| Editor acceptance | Target-editor behavior and real OS IME validation. |
| Performance | Structural line scans, whole-model comparison/copy, conversion, DOM work, and unexplained tail latency. Stable visible text in moved/required documents now uses at most eight scopes. Automatic storage, hidden content and structural changes retain full comparison. |
| Long-term evidence | Actual scheduled CI and two-week observation; the 30-minute target cadence is not complete. |
| Distribution | npm build output, API/version policy, migration tools, and release gates. |

G0/G1 and product SLOs are not approved. The long local test used bounded histories; it is not a million operations accumulated in one permanent document.

## Intentional boundaries

Live text-span coalescing is excluded by the current decision. Binary wire format and actor numbering remain undecided. Arbitrary subtree cuts, row/column/inline/span movement, and collection of hidden merged-cell text remain outside the current contract. Deletion and formatting remain separate states.

[Read performance evidence →](./performance)
