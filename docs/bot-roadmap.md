# Document bot roadmap

This roadmap orders document bot delivery. The [engine roadmap](../apps/docs/src/roadmap.md) keeps its existing items 1–9. The [authoring design](./document-authoring-bot-design.md) defines the intended product contracts. This file records the next delivery steps, not a second history of test runs.

## B1. Recovery foundation

**Status: delivered within the opt-in local demo scope.** Profile missions retain exact request and receipt evidence. The browser recovery mode saves actor checkpoints before submission, restores protected pending edits and history after reload, and supports explicit retirement. Web Locks prevent concurrent use of one recovery actor. Missing proof and legacy unprotected sessions remain blocked. This mode requires saved origin-local storage and the same document identity; schema upgrades are disabled.

**Evidence boundary:** HANDOFF section 5.75 records Chrome checks for pending input, a separate participant's edit, reload, server restart, undo, redo, duplicate-tab rejection, and a lost retirement response. Its 719 core and 64 demo tests preceded the last actor-lock change; 28 focused recovery tests passed after that change. These counts describe that checkpoint, not the final current tree. Power loss, actual OS IME, and production reliability are not established.

**Maintain:** keep exact-receipt recovery and generation, schema, and GC checks in later stages. Never resend a confirmed edit. Stop when evidence is insufficient.

## B2. Structured brief and verifiable completion

**Status: CLI checks include exact occurrence and child-type requirements; the B2 stage remains in progress.** The runner preserves the original mission and a versioned brief, gives the planner the brief, and retains it during recovery. A planner's completion report is separate from deterministic verification.

The checks support exact text, node type, exact non-overlapping UTF-16 occurrence counts in a canonical subtree, exact ordered direct-child types, and explicit manual requirements. Text runs and spans join for occurrence matching; inline objects and text-node boundaries break a sequence. Retained hidden cell text counts. New structural checks use bounded shape validation; they do not establish complete attribute or cardinality validation. Existing version-1 briefs remain supported. Paths follow model `children` indexes; they are not editor positions or text offsets. Before reporting verified completion, the runner reads the document again, verifies the schema fingerprint, and checks that the local read revision matches authoritative server metadata. Record each result and its evidence. A failed requirement or an unchecked manual requirement stops the mission for attention. A mission without a brief retains a clearly marked model-reported result.

**Acceptance gate:** reproduce the earlier partial `Confirmed` result for the request `Confirmed exactly once.` and reject it as verified completion. Cover invalid briefs, exact-text failures, node-type failures, manual requirements, unsettled reads, stale replanning, and resume without duplicate edits. Check that the saved brief survives restart. The initial implementation has 38 passing bot tests and a real Codex run with both declared checks passed; HANDOFF section 5.77 records the receipt and limits. Record any later user-visible checks separately. Placement, source provenance, preservation rules, and general document quality need explicit contracts beyond these initial check kinds.

## B3. Plan, proposal, and server authorization

**Status: bounded owner approval and recovery implemented; B3 remains in progress.** The private hosted HTTP/CLI path stores immutable plain-text proposals separately from History. A creator has read + proposal_create; a separate owner can inspect/reject and use read + proposal_accept to approve or reconcile. Both `proposals.enabled` and `proposals.acceptanceEnabled` default to false. Inspect before explicit owner approval. Keep owner secrets outside the planner. No acceptance MCP tool, planner adapter, or editor approval UI is included.

Acceptance checks the exact base and prepared CRDT operations before journal preparation/submission. It permits only one visible plain unstyled text block physically stored in root MAIN, with source at most 16,384 UTF-16 units and selection/replacement at most 4,096 each. Structure, moves, marks, cells, and promotion remain outside scope. Preview and immutable proposal policy remain unchanged; approval has a separate policy fingerprint. Each applied proposal has a separate fixed-actor undo group; undo/redo does not rewrite historical applied status.

An accepted exact request can recover after restart without resend when receipt, private evidence, protected History, and checkpoint agree, including after later foreign edits. Missing/corrupt proof or unknown receipts remain blocked. Unsettled attempts block ordinary MCP startup, new base/capture work, and other approvals. Initial stale checks produce terminal stale without a proposal edit. For a foreign edit after the checks, reconciliation can produce terminal not_applied only after an exact durable server seal and checkpoint retirement. The seal prevents delayed application across restart; local cleanup preserves confirmed History and does not resend. Unknown outcomes and incomplete proof remain blocked. This does not establish universal automatic unblocking.

**Remaining acceptance gates:** qualify remaining failure windows, supported-editor review controls, planner integration, and general document operation/scope authorization, including structural operations that cross a scope boundary. Create and review a new proposal after a stale base; never refresh under an old approval. Preserve concurrent edits and separate actor undo groups. Rejection must leave the document unchanged. The [proposal guide](../apps/docs/src/ai/proposals.md) gives command/API instructions. Browser and actual-model proposal acceptance remain unqualified.

## B4. Templates and schema-specific authoring

**Status: planned after B3.** Add project proposal, meeting notes, and presentation templates using the actual server schema. Define required sections, node relationships, exact content, placement, preservation, and missing-information handling for each template. Extend B2 checks where the template needs stronger guarantees.

**Acceptance gate:** run shared deterministic fixtures with valid and invalid outputs for each schema. Test concurrent edits and unsupported schema transitions. Measure actual model task success separately from fixture success. Do not infer full Word, Notion, or presentation compatibility from these templates.

## B5. Coordination and persistent watcher

**Status: planned.** Add explicit assignments, distinct actors, a shared task view, cancellation, and restart-safe trigger state. The existing experimental watcher is a bounded local reviewer with an in-memory baseline. It does not persist its cursor or restore missed changes after restart.

**Acceptance gate:** test adjacent and overlapping bot work, reviewer isolation, independent undo, user edits, restart, cancellation, deduplication, and self-trigger suppression. Define what missed changes mean and how a resumed watcher processes them. Keep uncertain recovery blocked. Record incorrect completion claims, latency, and cost as separate measures.

## B6. Operations, sources, and memory

**Status: private hosted MCP foundation implemented; broader operations remain planned.** The single-host service uses static bearer grants, configured routes and upstream credentials, bounded sessions and requests, private durable journals, and restart recovery. macOS and Linux use kernel locks; Linux requires `/usr/bin/flock` from util-linux. This does not establish OAuth, TLS termination, distributed storage, production tenant isolation, or the full stage gate. Define audit retention, failure recovery, and deployment limits. Start source checking with explicitly supplied material. Add external retrieval and cross-document memory only with access rules, provenance, retention, user-visible deletion, and budgets. Treat source text as data, not as permission to act.

**Acceptance gate:** test unauthorized access, unavailable sources, fabricated-reference rejection, deletion, quota enforcement, storage failure, and restart. Report inaccessible or judgment-based requirements as unchecked. A hosted-service claim needs evidence from the selected deployment boundary.

## Separate experiment lane

The [Rust engine roadmap](rust-roadmap.md) is outside B1–B6. Its stages are R1 UTF-16 contract and baseline, R2 safe storage comparison, R3 per-edit UTF-16 bridge, R4 shadow CRDT semantics, R5 native server and WASM client shadow adapters, and R6 end-to-end gates with a go/no-go decision. R1 has bounded evidence. R2 passed its declared bounded [storage comparison gate](../experiments/rust-core/STORAGE-RESULTS.md) with native Rust, independent JavaScript, and Node 24/Chrome WASM evidence; the alternating-end regression remains recorded. R3 passed its declared bounded [boundary and lifetime gate](../experiments/rust-bridge/RESULTS.md) in Node 24 and Chrome; pure ABI/allocation isolation and production behavior are not claimed. The same-algorithm JavaScript Gap/Rust WASM Gap follow-up uses matched traces
and fresh-output contracts. It does not establish an intrinsic Rust benefit;
WASM path overhead and allocator differences remain included. A separate
no-WASM native Rust Gap/Node.js Gap comparison has lower native edit and
pipeline medians in all six measured conditions and lower sampled whole-process
RSS. Runtime and retained trace costs are included; per-document heap, peak RSS,
and leak freedom are not measured. This supports further native experiments,
not an intrinsic language benefit or a production server result. These bounded
results do not approve a production migration. The formal R6 decision is pending.
R4 is in progress with a [bounded native CRDT shadow slice](../experiments/rust-shadow/README.md).
It applies real TypeScript operations for UTF-16 text, deletion, deletion
cancellation, and boolean `bold`/`italic` marks. Rust now has independent bounded
History generation, shared formatting ownership, deletion pins, and joint
document/history recovery. Separate fixtures compare token-based UTF-16
selection and three actors' delayed and duplicate delivery. Restart cases cover
saved pending insertion, deletion, formatting, undo, and redo; replay preserves
other users' changes. An explicit paragraph-marker capability also covers legacy
split/merge, simultaneous Enter aliases, node History, and multi-paragraph
selection. A separate pinned schema adds paragraph/heading text blocks,
divider/image atoms, typed and atomic JSON attributes, foreign-write ownership,
and pending attribute/type/block/undo/redo replay. A further pinned schema adds
recursive flows, full tables with covered-cell retention, nested selection,
axis and span History, and pending nested replay. The next pinned variant adds
flat groups, single-unit inline nodes, string link spans, model-path selection,
and corresponding History and pending replay. The latest pinned variant adds
block/subtree placement, logical split/join, independent movement History, and
five fresh-process pending replay cases. The root-gap cursor correction passes
75 native tests and 726 library tests. Its movement receipt compares all 5,666
raw endpoints, including the four formerly omitted checkpoints; strict hidden
editor ranges remain null. HANDOFF sections 5.85–5.91 record
the separate checkpoints. Runtime compiled schemas, compatible live schema
transitions, broader schema/value rules, and GC remain open. Rust can implement
dynamic schemas, but its current manifests and type rules are compiled in.
The first private native SDK now exposes typed document/operation/History/
selection/checkpoint calls for the six fixed presets. Its 14 tests and bounded
20-action TypeScript comparison are separate from editor or transport evidence.
The TypeScript Tiptap extension adds a fourth editor integration; it does not
connect bots or editors to Rust. This is not full
server recovery or a complete CRDT port. R5 and R6 remain planned, with separate
integration and product gates. Production server and client code remain TypeScript.

The [recorded experiment results](../experiments/rust-core/RESULTS.md) include 265 passing Node 24 differential operations and an isolated Chrome 156 storage-batch check. Chrome matched checksum `719347296`; JavaScript/WASM medians were 1.700/7.300 ms. Node 24 medians were 1.759/8.050 ms. WASM was slower in both measured batches. Timing includes allocation, initialization, edits, and hashing; it excludes text transfer and per-edit boundary calls. Full CRDT equivalence, production Rust integration, and editor performance acceptance remain **NOT_RUN**. Each later stage needs separate evidence. No production speedup follows from the baseline.
