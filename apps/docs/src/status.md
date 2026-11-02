# Verification and limits {#status-and-limits}

This documentation describes the current implementation and its verification limits. A passing bounded test is not a production release or a guarantee for every editor and workload.

For the ordered work and acceptance conditions, see the [roadmap](./roadmap).

## Available behavior

- Schema-defined text, inline content, lists, nested flows, tables, spans, and attributes.
- Local-first editing, validated changes, HTTP/SSE demo transport, and snapshot/GC support.
- A Client facade with fixed local/sync mode selected by its optional transport, common binding construction and advanced SyncClient access.
- A memory-only TypeScript LocalClient and per-view LocalEditorHost, with edits, anchored selections, undo/redo and composition drafts. All four client-facing bindings accept LocalClient or the unified Client and create per-view hosts internally. Local persistence and restart recovery remain open.
- Per-user undo and redo that retain independent changes under the stated ownership rules.
- Remote cursors and selection ranges, including backward and overlapping selection.
- Independent ProseMirror, Tiptap, Slate and Lexical binding packages, with the original compatibility subpaths.
- Shared EditorHost/EditorSession integration that calls the selected production client engine, with preserved legacy TypeScript client/input references. TypeScript is the only delivered backend.
- Identity-preserving paragraph, block and group placement, with conditional undo.
- Required-child and maximum-count projection with retained overflow.
- Declared nested-attribute field registers and persistent annotations.
- Node synchronization and a private MCP server with server-checked conditional edits and compatible schema transitions.
- A macOS/Linux MCP checkpoint and journal with protected, bounded restart recovery for pending changes and undo/redo history. An unknown conditional outcome blocks further edits for inspection.
- A private authenticated HTTP MCP service with fixed document/actor slots, read/write/schema grants, configured upstream credentials, and bounded capacity. Linux durable locks require `/usr/bin/flock`; OAuth, public TLS deployment, and multi-host storage are outside this service.
- Bounded canonical child reads with revision-bound cursors and explicit output limits. Ambiguous raw/canonical groups and model-only minimum fallbacks fail closed.
- Bot brief checks for exact UTF-16 text occurrences and ordered direct-child types, separate from model-reported completion.
- An opt-in proposal HTTP/CLI service with separate creator and owner grants, bounded plain-text previews, durable records, inspection, rejection, explicit exact approval, and receipt-based restart reconciliation. Approval applies only a supported stored root text range; it requires an additional feature flag and `proposal_accept`. Planner integration and editor review UI remain open.
- A host-based open-editor schema transition with text selection restoration. The product demo uses it with Slate, Lexical and ProseMirror after a compatible server transition.

## Unified Client verification

The current whole-workspace confirmation passes **1,310 cases on macOS:
1,308 PASS, two platform SKIPs, zero FAIL**. The groups are library 793, Core 152,
Lexical 7, Slate 4, bot 53, demo 85, documentation 35 and MCP 181. Root type
checking and six-tarball/seven-consumer checks pass. An earlier MCP process test
received unexpected HTML; its cause was not established. Isolated recovery,
the full MCP rerun and the final whole-workspace confirmation passed. The failed
receipt remains in the report.

Chrome 156 passes all four bindings in both local and sync modes with the same
Client-facing API. It checks trusted input/delete, forward/back/caret selections,
application selection restoration, shared/per-participant History, remount,
reset, refresh and offline/foreign editing followed by reconnect. Native/client
models converge, pending reaches zero, and network/notification/console/page-error
gates pass. The sync demo uses an in-page DocHub transport, not HTTP persistence.

The 320-input Chrome timing run has **59/64 paired DOM cells within the declared
guards**. All medians, all sync cells and all 100k cells pass; five local 10k p95
cells exceed the guard. Node native-input repeats retain one Slate 10k p95 flag,
although median and 100k timings improve. A uniform performance PASS is not
established. [Performance evidence](./performance#unified-client-and-native-input)
keeps original and repeated results. OS IME, browser composition, physical paint,
rich-schema browser performance and local persistence remain outside this proof.

## Regression coverage

The final shared-custom-editor integration passes **1,254 full-workspace cases
on macOS: 1,252 PASS, two platform SKIPs, zero FAIL**, with default fuzz settings.
The groups are library 758, Core 136, Lexical 7, Slate 4, bot 53, demo 81,
documentation 34 and MCP 181. Root type checking passes. The existing shared
15-scenario and independent three-editor Chrome proofs use identical runtime
inputs and are reused; this publication does not claim a new browser run.

The host-based custom-editor checkpoint adds a shared plain-text LocalClient
mode with Custom, ProseMirror, Slate and Lexical. Its separate 15-scenario Chrome
run verifies native edits in all directions, per-view stable selections, shared
toolbar/keyboard undo/redo, paragraph split/join/range deletion, remount, shared
reset and refresh. All four native models match; document requests and
notification/console/page errors are zero with networking disabled. Focused demo
tests pass 13/13, Core 136/136, native bindings 18/18 and documentation 34/34;
root type checking passes. All 146 generated package files match the preceding
main publication. This is bounded plaintext shared-view proof, not rich-schema,
network collaboration, Chrome composition or actual OS IME acceptance.

The preceding local-editing main publication passed **1,244 full-workspace cases on
macOS: 1,242 PASS, two platform SKIPs, zero FAIL**, with default fuzz settings.
The groups are library 758, Core 136, Lexical 7, Slate 4, bot 53, demo 71,
documentation 34 and MCP 181. This is a fresh main-worktree run of the combined
changes, separate from earlier enhanced-fuzz checkpoints. A direct headless
ProseMirror/Slate integration also verifies that two per-view hosts can share one
LocalClient, exchange native edits and use one shared undo/redo History. That
shared-document check is separate from the independent-client Chrome demo.

The dedicated [LocalClient demo](./guide/local-editing#run-the-local-editor-demo)
passes Chrome 156 checks in ProseMirror, Slate and Lexical for native Unicode
input/delete, forward/backward/collapsed selection, toolbar and keyboard History,
independent documents, application selection restoration through repeated
prefixes, remount, reset and refresh. Logical and DOM ranges are checked. Editing
works with networking disabled after static assets load; document requests and
notification/console/page errors are zero. The bundle emits no synchronization
client, transport or document-server implementation. A mobile screenshot/overflow
check and synthetic persisted-pagehide guard pass; broad mobile behavior,
actual BFCache navigation, OS IME and rendering latency remain unqualified.

This browser work fixes two binding defects: Lexical now captures selection-only
updates, and ProseMirror restores text selections by token identity when text
diffs are ambiguous. New regressions fail on the old builds and pass after the
fixes. Core runtime and collaboration operations are unchanged. The earlier
LocalClient performance comparison predates these selection fixes; no new timing
or memory result is claimed for this demo.

The local-client checkpoint passes **1,226 full-workspace cases on macOS:
1,224 PASS, two platform SKIPs, zero FAIL**, with the default 500 fuzz seeds.
It adds memory-only editing without changing existing synchronized runtime
JavaScript. Later focused runs pass all **136 Core cases**, including six added
Word/Notion/presentation structure and hidden-content cases, and the current
documentation tests. Four actual headless binding tests cover ProseMirror,
Slate and Lexical input, external edits, selection, History and draft publication.
Type checking and six-package/seven-consumer verification pass. These are
headless local API results, not new local-browser or OS IME acceptance.

At that earlier checkpoint, all 68 existing JavaScript files in the frozen
Core/PM/Slate/Lexical/facade scope matched main `12da94d`. The offline PM count comparison passes 48 size/scenario
checks without added ordinary-edit snapshots or conversion calls. Original
full timing retains 14 investigation flags out of 32 comparisons; seven also
occur in the unchanged Sync control. Same-process ABBA retains two flags out of
16; focused repeated-input profiles place both within the original guards.
No persistent Local-only hotspot was established. These narrower results do
not turn every original timing into a PASS. See the
[local comparison report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/local-client/report.md).


The selected-TypeScript engine checkpoint passes **1,199 full-workspace cases
on macOS: 1,197 PASS, two platform SKIPs, zero FAIL** with `FUZZ_SEEDS=3000` and
`PM_SEEDS=300`. This includes 751 library, 110 Core, eight binding Host, 53 bot,
68 demo, 28 documentation and 181 MCP cases. Type checking and the separate
33-case comparison demo pass. Six package artifacts pass seven isolated consumer
checks. Format-2 opaque state and real selected-engine binding routing have
dedicated regressions. Portable durable recovery remains D4 work.

Fresh Chrome 156 checks pass nine rich-profile combinations (Word, Notion and
presentation × Slate, Lexical and ProseMirror) for input, foreign edits, selection,
undo/redo and reconnect, plus nine native Enter/Backspace combinations. Actual
selected engine calls are checked. Tiptap passes default and explicit TS modes,
selection, History, reconnect and remount; an unsupported selector is rejected
before editor mount. Normal paths have no console/page errors. Actual OS IME
remains NOT_RUN. Controlled comparisons include a 64-pair Chrome check. The pooled Node remote8
128-pair median/p95 are within guards; two of its four small-block p95 scores
remain flagged. Exact shared-backend Chrome controls cover all 12 original
flagged cells, with no persistent crossing under those conditions. The original separate-server
comparison still flags 12/27 source/target cells. General Chrome end-to-end
latency acceptance remains open; these results do not turn every original score
into a PASS.

The earlier SDK-documentation and final-review checkpoint passes **1,148
full-workspace tests on macOS: 1,146 PASS, two platform SKIPs, zero FAIL**. This
includes 748 library, 62 Core, eight binding Host, 53 bot, 68 demo, 28
documentation, and 181 MCP cases. The comparison demo separately passes 33/33.
Six local package tarballs pass seven isolated-consumer/prepack checks.

Fresh unprivileged Linux MCP tests pass **181 cases: 180 PASS, one platform SKIP,
zero FAIL**. All 345 frozen runtime inputs match the image; storage is
container-local with no host mounts. This total is only the current MCP scope;
the earlier 1,108-case Linux checkpoint retains its scope in HANDOFF section
5.101. Section 5.102 records this final-review checkpoint.

Native validation separately passes SDK 14, semantic core 75, and storage 13
tests, formatting and Clippy. Two native SDK guide programs and the Node WASM
storage recipe run successfully. The SDK comparison checks 20 actions and 40
actor states. These checks do not provide a Rust browser/editor backend or a
full WASM CRDT SDK. Eight broad native comparison harnesses and Chrome were not
rerun in this checkpoint. Older package-consumer, Rust comparison,
browser, and actual-model receipts retain their earlier scope; they are not
fresh proposal-approval results.

The approval process suite passes 31 real process scenarios. These cover lost
accepted responses, process/server restart, duplicate and competing decisions,
stale proposals, delayed conditional/ordinary/recovery requests, foreign edits,
retained and new undo/redo, checkpoint mismatch, generation change, and real
file/directory sync errors. Accepted-request recovery requires matching evidence
and checkpoint protection. A late submission race can now settle as
`not_applied` after an exact durable server seal and private checkpoint
retirement. Unknown outcomes and incomplete proof remain blocked. There is no
browser approval UI or actual-model proposal-approval result.

An earlier real Codex HTTP MCP session read the schema and document, edited, and reread
the result. Separate SDK checks restarted that service and preserved a user's
edit across the bot's own undo and redo. The autonomous model did not exercise
every tool or deployment condition. Those model receipts predate owner approval and do not test proposal application. See [hosted MCP](./ai/hosted).

Earlier Chrome checks pass nine rich-profile combinations (Word, Notion and presentation ×
Slate, Lexical and ProseMirror) for trusted Unicode input, foreign changes,
one-group undo/redo, bidirectional selection and same-editor reconnect. Tiptap
also passes keyboard, range, history, reconnect and remount checks. Actual OS
IME remains NOT_RUN. Core/binding component bytes are unchanged; these browser checks were not repeated for the HTTP-only approval work. They do not establish full product acceptance.

At the earlier editor-host checkpoint, the Core/PM operation-count gate matched
the pre-host baseline for all 20 size/scenario pairs: no additional ordinary-edit snapshots or selection/
presence model conversions. That count receipt predates the read/canonical
additions and was not rerun in this phase. H1 timing remains UNRESOLVED: three of twenty
fixed guards were exceeded in the full run; targeted repeats did not reproduce
them. The earlier H1 timing checkpoint is not relabeled as final H2 latency
evidence. See [packages and engines](./guide/packages) for the backend scope.

An earlier recovery integration passed 688 library, 57 demo, 28 documentation and 59 MCP tests, with one platform-specific MCP test skipped, plus 32 comparison-editor tests. Real process checks covered MCP termination, server restart, GC, receipts and another participant's edit. Chrome passed 90 native editing checks and 37 open-editor schema checks, including 27 across three profiles and bindings, nine Word-profile checks without a concurrent remote edit, and a synthetic composition guard. The earlier 39 structure checks were not repeated after the recovery storage changes. A separate real Codex session edited a Word-profile document alongside browser input and confirmed its own undo and redo; all three panels showed the final text. These tests do not establish real OS IME or production acceptance. Performance results below describe their earlier source-bound runs.

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
| Recovery | The macOS/Linux MCP app and single-process demo support bounded recovery of pending ordinary changes and history when generation, schema, reservation and GC protection are proven. Unknown conditional outcomes, unsupported platforms, storage failures, retention and production recovery remain open. See the [recovery plan](./reference/recovery-plan). |
| Operations | The private hosted MCP boundary has static bearer grants, fixed routes, configured upstream credentials, and capacity limits. The document server still needs application authorization and private network placement. OAuth, deployment/TLS, retention, multi-host consistency, and broader failure recovery remain open. |
| Schema evolution | Protocol 3 verifies schema identity. Compatible additions can transition without resetting the document; a host can rebuild an open editor. Incompatible migration, application plugin reconstruction and broader failure coverage need separate work. |
| Editor acceptance | Broader target-editor behavior and real OS IME validation. The reported Lexical/PM merged-grid mismatch is fixed; finite Chrome checks cover merged geometry, hidden data, history and selection. |
| Performance | Structural line scans, whole-model comparison/copy, conversion, DOM work, and unexplained tail latency. Stable visible text in moved/required documents now uses at most eight scopes. Whole before/after reads remain for structural changes; eligible large documents compare/verify guarded windows of at most eight top-level nodes. Root child rules, group boundaries and wider spans retain whole verification. Native projection retains unchanged root blocks; changed root containers, Lexical readback, local conversion and whole-model comparisons remain. |
| Long-term evidence | Two-week scheduled observation and the 30-minute target cadence are not complete. |
| Distribution | Compiled local packages and isolated consumers pass. Registry publication, API/version policy, migration tools, and release gates remain open. |

G0/G1 and product SLOs are not approved. The long local test used bounded histories; it is not a million operations accumulated in one permanent document.

## Intentional boundaries

Model paths for stored group children now use the same normalized attribute values as the canonical model. Existing model-only required-group fallbacks remain a separate limit: they cannot be edited as stored nodes, and their attribute placement can differ from `applyEdits`. Bounded reads keep a stricter guard for unsupported canonical/raw group boundaries.

Live text-span coalescing is excluded by the current decision. Binary wire format and actor numbering remain undecided. Arbitrary subtree cuts, row/column/inline/span movement, and collection of hidden merged-cell text remain outside the current contract. Deletion and formatting remain separate states.

[Read performance evidence →](./performance)
