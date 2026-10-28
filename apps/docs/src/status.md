# Status and limits

This documentation describes the current implementation and its verification limits. A passing bounded test is not a production release or a guarantee for every editor and workload.

For the ordered work and acceptance conditions, see the [roadmap](./roadmap).

## Available behavior

- Schema-defined text, inline content, lists, nested flows, tables, spans, and attributes.
- Local-first editing, validated changes, HTTP/SSE demo transport, and snapshot/GC support.
- Per-user undo and redo that retain independent changes under the stated ownership rules.
- Remote cursors and selection ranges, including backward and overlapping selection.
- Public ProseMirror, Slate and Lexical binding subpaths in one library package.
- Identity-preserving paragraph, block and group placement, with conditional undo.
- Required-child and maximum-count projection with retained overflow.
- Declared nested-attribute field registers and persistent annotations.
- Node synchronization and a private MCP server with server-checked conditional edits and compatible schema transitions.
- A macOS MCP checkpoint and journal with protected, bounded restart recovery for pending changes and undo/redo history. An unknown conditional outcome blocks further edits for inspection.
- A host-based open-editor schema transition with text selection restoration. The product demo uses it with Slate, Lexical and ProseMirror after a compatible server transition.

## Regression coverage

The latest integration passed 688 library, 57 demo, 28 documentation and 59 MCP tests, with one platform-specific MCP test skipped, plus 32 comparison-editor tests. Real process checks covered MCP termination, server restart, GC, receipts and another participant's edit. Chrome passed 90 native editing checks and 28 open-editor schema checks across three profiles and bindings, including a synthetic composition guard. The earlier 39 structure checks were not repeated after the recovery storage changes. A real Codex collaboration scenario was tested before the open-editor schema changes. These tests do not establish real OS IME or production acceptance. Performance results below describe their earlier source-bound runs.

Receive model materialization passes 622 library, 16 demo and 27 documentation tests with `FUZZ_SEEDS=3000 PM_SEEDS=300`, plus 31 compatibility unit tests. Chrome passes 460 functional assertions and captures 30 separate operation traces, with zero console errors. Long-paragraph core receive/model p95 improves 64.5–69.3% across the measured live workloads, while the compressed ID index and cold heap footprint remain essentially unchanged. Short-paragraph and alternating-format controls do not show the same gain. See the [comparison report and limits](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/receive-model-2026-10-24/report.md).

The earlier runtime ID metadata verification passed 616 library, 16 demo and 27 documentation tests with `FUZZ_SEEDS=3000 PM_SEEDS=300`, plus 31 compatibility unit tests. Chrome also passes 460 functional assertions and records 30 separate operation traces, with zero console errors. Actor ranges and numeric sparse indexes preserve logical IDs, Item identities, history ownership and snapshot/wire formats. In three fresh-process repetitions, plain one-million-unit incremental JS heap falls from 300.69 to 252.23 MiB before explicit model materialization (16.1%). Full receive/model p95 is 3.8% higher for that workload; this change does not close latency acceptance. See the [memory report and limits](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/metadata-memory-2026-10-24/report.md).

The earlier native projection change passed 608 library, 16 demo and 27 documentation tests with `FUZZ_SEEDS=3000 PM_SEEDS=300`, plus 31 compatibility unit tests. This includes 33 [Word, Notion and presentation profile cases](./guide/product-schemas) and eight new native projection regressions. The separate native profile demo passes 150 Chrome assertions for editing, structure, UI/guards and retained DOM identity. A repeated 2,160-input local development comparison reduces large-document input-to-peer rendering-opportunity p95 from 305.6–610.1 ms to 70.1–176.5 ms. Small-document results remain about 47–49 ms. See the [report and limits](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/native-receive-2026-10-24/report.md). Performance acceptance, product layout and actual OS IME remain open.

The earlier structural-cache implementation was verified with `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: 246 library tests and 10 demo tests passed. The compatibility unit suite passed 31 tests. Stage0 Ours/Yjs passed 6 tests. Type checking and the compatibility build passed.

Chrome checks covered 40 basic/nested/presence/multiple-block steps, 84 compatibility input cases, and 20 ordinary cases (18 convergence checks and 2 probes). Another 30 operation traces were captured. These are different evidence types; a captured trace is not an OS IME acceptance result.

The fixed collaboration-intent cases cover overlapping deletion, formatting, insertion, and undo. Sequential formatting undo/redo regressions include remote same-value and partial-range writes.

The capability review added fixed cases for placement cycles, post-move split/join/history, required slots, field ownership, annotation affinity, snapshots, invalid operations and mutable-output isolation. Functional and security review suites passed 137 cases. These counts and browser results describe their original integration, not a fresh Protocol 3 run.

Automatic paragraphs now keep one visible identity when edited or moved. Splitting before moved siblings preserves their order and placement ownership. Fixed regressions cover concurrent input/formatting, same-boundary splits, history, compaction, snapshots and private-anchor validation. Chrome exercises native input and Enter in Slate, Lexical and ProseMirror, with five native/client models matching the server. See the collaboration intent reference for the expected examples.

An earlier expanded run passed 567 library, 12 demo and 27 documentation cases, plus 31 compatibility unit cases. Its Chrome run passed 340 finite regression/roundtrip checks, including guarded structural changes, merged-grid geometry and forward/backward range restoration. Merged states required all five native/client models to match the server. Tests preserved foreign hidden text, formatting and cell attributes across typing, merge undo/redo and unmerge. The 30 operation traces within that count establish captured operations and convergence, not OS IME acceptance.

## Open work

| Area | Remaining work |
|---|---|
| Recovery | The macOS MCP app and single-process demo support bounded recovery of pending ordinary changes and history when generation, schema, reservation and GC protection are proven. Unknown conditional outcomes, unsupported platforms, storage failures, retention and production recovery remain open. See the [recovery plan](./reference/recovery-plan). |
| Operations | Authentication, authorization, durable snapshot/log retention, limits, and failure recovery. |
| Schema evolution | Protocol 3 verifies schema identity. Compatible additions can transition without resetting the document; a host can rebuild an open editor. Incompatible migration, application plugin reconstruction and broader failure coverage need separate work. |
| Editor acceptance | Broader target-editor behavior and real OS IME validation. The reported Lexical/PM merged-grid mismatch is fixed; finite Chrome checks cover merged geometry, hidden data, history and selection. |
| Performance | Structural line scans, whole-model comparison/copy, conversion, DOM work, and unexplained tail latency. Stable visible text in moved/required documents now uses at most eight scopes. Whole before/after reads remain for structural changes; eligible large documents compare/verify guarded windows of at most eight top-level nodes. Root child rules, group boundaries and wider spans retain whole verification. Native projection retains unchanged root blocks; changed root containers, Lexical readback, local conversion and whole-model comparisons remain. |
| Long-term evidence | Two-week scheduled observation and the 30-minute target cadence are not complete. |
| Distribution | npm build output, API/version policy, migration tools, and release gates. |

G0/G1 and product SLOs are not approved. The long local test used bounded histories; it is not a million operations accumulated in one permanent document.

## Intentional boundaries

Live text-span coalescing is excluded by the current decision. Binary wire format and actor numbering remain undecided. Arbitrary subtree cuts, row/column/inline/span movement, and collection of hidden merged-cell text remain outside the current contract. Deletion and formatting remain separate states.

[Read performance evidence →](./performance)
