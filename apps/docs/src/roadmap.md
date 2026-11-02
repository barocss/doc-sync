# Roadmap

This roadmap orders the work needed to turn the current library into a dependable integration. Each item has a verification condition. A passing bounded test does not by itself establish production readiness.

## Current checkpoint

The local working tree contains a schema-defined document CRDT, identity-preserving block and group moves, per-participant undo and redo, remote cursors and selections, and ProseMirror, Slate, and Lexical bindings. Word-style, Notion-style, and presentation schemas have bounded model and editor tests. They do not provide complete product file formats, layout, or editing experiences.

The local working tree also contains a Node transport and an MCP server. Protocol 3 checks a schema fingerprint. Compatible schema additions can transition without resetting the document. MCP edits check the document epoch, sequence, and schema version atomically on the demo server. Existing changes and undo history are retained under the documented rules. See [AI and headless clients](./guide/ai) and [changing a schema](./guide/schema#changing-a-schema) for the scope and limits.

The durable browser recovery checkpoint in HANDOFF section 5.75 passed 719 library and 64 demo tests before its final actor-lock change. After that change, 28 focused recovery tests passed. Chrome checked pending-edit reload, server restart, undo and redo, a lost retirement response, and rejection of a duplicate recovery tab. Those are source-bound checkpoint results, not final validation of the current working tree. Earlier browser and performance results retain their original scope in [status and limits](./status).

The opt-in product recovery mode saves origin-local checkpoints and exact recovery evidence, restores the same actor after reload, and supports explicit retirement. It requires the same document identity and saved browser storage. It does not recover legacy unprotected sessions. Schema upgrades remain disabled in this mode. See [AI and headless clients](./guide/ai) for recovery limits.

The local document bot has a separate ordered [bot roadmap](https://github.com/barocss/doc-sync/blob/main/docs/bot-roadmap.md). Its structured brief includes exact text, node type, occurrence-count, and direct-child-type checks. Proposal flow and broader product verification remain open. The Rust storage experiment is a separate investigation, described below.

## Unified client delivery

The Client facade selects a local or sync backend at construction. All four
client-facing bindings accept it and create per-view hosts internally. Existing
LocalClient, SyncClient and host constructors remain supported. The dedicated
four-editor demo uses one shared client locally and independent actors in sync
mode. See [Client](./guide/client) for setup and current verification boundaries.
The current integration passes 1,323 tests with two platform SKIPs; fresh Chrome passes
all four editors in both modes and explicit saved-copy reload. In the preceding
Client checkpoint, all 100k Chrome timing cells meet the guard,
but five local 10k p95 cells and one Node Slate tail remain under investigation.
See [the measured boundaries](./performance#unified-client-and-native-input).

Next in this lane:

1. Profile the retained Slate/local 10k early-input tails and separate cold
   setup, JIT, allocation and event-delivery costs before choosing a fix.
2. Extend the implemented local save/open API with application storage providers,
   auto-save scheduling, quota handling and multi-tab ownership.
3. Define local schema transitions and identity-preserving session handoff.
4. Deliver Rust/WASM production factories through the existing engine roadmap.

Explicit local capture/open is implemented with actor, IDs, clock and History;
see [local storage](./guide/local-storage). Automatic background durability, local
schema transitions, live session conversion and a Rust/WASM factory remain open.

## Local editing delivery

1. **L1: Memory-only TypeScript client and host — implemented within the tested scope.**
   `LocalClient` and `LocalEditorHost` provide model edits, anchored selections,
   per-client undo/redo and composition drafts without a transport. Real headless
   ProseMirror, Slate and Lexical bindings pass. Word, Notion and presentation
   model tests cover structure and hidden cell content. See [Local editing](./guide/local-editing).
2. **L2: Local browser acceptance and Tiptap host option — bounded demo verified; broader acceptance open.**
   The dedicated [local demo](./guide/local-editing#run-the-local-editor-demo)
   passes Chrome input, selection, undo/redo, application-edit selection
   restoration, remount, reset and refresh checks in ProseMirror, Slate and
   Lexical with document networking disabled. A host-based custom textarea and
   all three native editors also pass shared-document Chrome checks, including
   per-view selection, shared History and plain paragraph operations. Tiptap now also accepts Client and LocalClient directly. Broader composition, rich-schema browser behavior,
   actual BFCache navigation, mobile editing and actual OS IME remain open.
3. **L3: Explicit persistence — implemented within the tested local scope.**
   LocalClient and Client(local) capture a versioned JSON state and restore a new
   validated client with the same actor, CRDT identities, clock and undo/redo.
   Pending operations and active composition block capture. The opt-in four-editor
   demo saves one browser slot explicitly and reopens that copy after reload.
   Failed capture/open preserves the current document and previous saved bytes;
   mounting failure rolls back the old views. Hidden-tab startup does not depend
   on animation frames. Background durability, production storage providers,
   quota policies, migrations and multi-tab ownership remain open. See
   [Save and open locally](./guide/local-storage).
4. **L4: Local schema transitions and synchronized-session handoff — open.**
   Define identity, pending work, History and conflict behavior before converting
   sessions. Rust/WASM local engines depend on the separate engine delivery gates.

This local lane does not renumber engine items 1–9 or Rust D1–D9. Timing reports
retain original guard crossings and their narrower controlled investigations;
local headless timings do not establish browser latency acceptance.

## Ordered work

### 1. Validate the current integration

**Status: current private MCP, read, and editor-host checkpoints have local regression receipts.** Fresh integration tests cover macOS and Linux, with Chrome checks for the three rich profiles and bindings plus Tiptap. These remain bounded checks. The recovery checkpoint above adds Chrome proof for all three editor models with pending local input and a separate remote edit. Existing editing and compatible schema-transition checks remain source-bound evidence. Run checks for the final integrated source and record which earlier scenarios were reused. Actual OS IME, production operation, and performance acceptance remain separate work.

**Done when:** the final source, test results, and browser evidence are recorded together; regressions are fixed; and the limits of the browser checks are stated. Real OS IME and performance measurements are separate work.

### 2. Recover pending changes and history

**Status: MCP and opt-in browser recovery implemented within a bounded demo scope.** On macOS and Linux with supported kernel file locks, the MCP app stores conditional intents and protected checkpoints with undo and redo history. The single-process demo persists a recovery reservation across server restart and ordinary peer lease expiry. It can atomically recover an exact pending ordinary change and restore an accepted conditional edit when the required generation, schema and GC protection are proven. Unknown conditional outcomes and unsafe or incompatible recovery remain blocked for inspection. `discard_history` permanently clears the calling participant's undo and redo history and releases its old reservation after checking pending work. An interrupted release resumes on startup. Other reservations or ordinary peer leases can still hold back garbage collection. The demo compacts released-reservation metadata by sealing reservation eras and retaining active pins. The document log and active reservations are not bounded by that compaction. The product demo also stores browser checkpoints before submission, uses Web Locks to protect each recovery actor, and restores pending edits and history after reload when server proof is valid. A failed storage write stops the session. Explicit retirement clears that actor's history and releases its reservation; an interrupted retirement retries the same release. Saved origin-local storage and the same document identity are required. Legacy unprotected sessions remain blocked. Schema upgrades are disabled in recovery mode.

**Done when:** process and network failure tests cover accepted and unaccepted writes, repeated recovery, concurrent remote edits, schema changes, undo/redo, and GC without duplicate or lost edits. Record any outcome that still requires manual reconciliation.

The [recovery plan](./reference/recovery-plan) describes the implemented recovery boundary, test scope, and remaining storage, reservation lifecycle, and failure cases.

### 3. Make server operation dependable

**Status: private hosted MCP foundation implemented; document-server operations remain demo-level.** The single-host HTTP MCP service has static bearer grants, fixed document/actor routes, configured upstream credentials, capacity limits, and private macOS/Linux journals. This does not authorize direct document-server requests or provide OAuth, TLS deployment, or multi-host consistency. Define application document and actor authorization, rate limits, durable snapshots and logs, retention, and recovery after storage failure. Define the ordering and consistency contract before supporting multiple server processes. Add operational observability and a deployment model.

**Done when:** the chosen server passes authorization, isolation, malformed-request, storage-failure, restart, concurrency, and recovery tests. Document operational limits and the tested deployment boundary.

### 4. Extend schema evolution

**Status: compatible additions and bounded open-editor rebuilding implemented.** The product demo rebuilds Slate, Lexical and ProseMirror after a compatible transition using the application-supplied host contract. Pending edits, history and text selection are retained within the tested cases. Define explicit migrations for schema removal, narrowing, changed defaults and attributes, and changes that require new snapshot capabilities. Specify validation, rollback, offline changes, hidden content, undo history, and reconstruction of application-specific plugins and codecs.

**Done when:** each supported migration preserves the declared document state and participant changes in concurrent and failure tests. Unsupported transitions must fail without discarding state. Browser checks must exercise the supported binding transition.

### 5. Read large documents efficiently for AI

**Status: bounded canonical child reads and a local full/slice workload comparison are implemented; the complete gate remains open.** `read_document_slice` supports flow, group, and cell-body parents, signed revision-bound cursors, and child, node, UTF-16, and successful tool-result JSON byte limits. Unsupported raw-to-canonical grouping and model-only minimum cases fail closed. Covered retained cell content remains in the model view. Keep the authoritative edit-base check, schema rules, and participant history. The first sibling index and nested/global projection costs remain; output bounds do not establish an overall speedup. The local comparison records output size, first/warm timing, and scoped heap; one retained-table model path is slower. See [bounded reads](./ai/reading).

**Done when:** tests cover large and nested documents, concurrent insert/move/delete, pagination boundaries, stale bases, and equivalent results against full-document reads. Record response size, memory, and timing under stated conditions.

### 6. Set and verify performance targets

**Status: improvements measured; product targets not accepted.** Profile current-source structural scans, full-model comparisons and copies, native conversion, Lexical readback, and DOM work. Measure a real editor path from input through transport, remote DOM match, and a second rendering opportunity. Review and set explicit document sizes, workloads, environments, and G0/G1 targets before judging acceptance.

**Done when:** a reproducible before/after report includes measurements, conditions, correctness checks, tail latency, memory, regressions, and the agreed targets. Keep core timings separate from end-to-end editor timing and physical display latency.

### 7. Establish long-term reliability evidence

**Status: test and CI foundations exist.** Run and observe the scheduled workflow, exercise a long-lived single document, and cover multi-peer editing, reconnect, GC, server restarts, and recovery. Review the unfinished 30-minute cadence target and comparison-engine timeouts.

**Done when:** the agreed long-run conditions complete with saved results, failure records, and convergence checks. A bounded batch run does not substitute for a long-lived document or scheduled observation.

### 8. Complete target-editor acceptance

**Status: representative coverage exists.** Extend native editing, paste, keyboard, accessibility, selection, tables, and schema-transition checks for the chosen product integrations. Separately test trusted operating-system IME input. Define which Word-style, Notion-style, or presentation features belong in the core library and which belong in an application.

**Done when:** each selected editor has a written acceptance scope and current-source evidence for that scope. Do not treat the representative schemas as full Word, Notion, or presentation-product compatibility.

### 9. Prepare the public release

**Status: local package artifacts verified; not released.** Core and the ProseMirror, Tiptap, Slate, and Lexical bindings are separate packages. The compatibility facade keeps existing imports. All six packages remain private. Compiled JavaScript, declarations, and isolated tarball consumers are available. Define release versions, API/protocol compatibility, migrations, security, and release policy before registry publication. Plan the Protocol 2 to 3 upgrade for existing deployments.

**Done when:** a clean consumer can install and use the package, the selected release checks pass, compatibility and migration instructions are available, and the release gates are approved. The six packages remain private and export compiled ESM JavaScript and declarations. See [packages and engines](./guide/packages).

## Bot delivery sequence

Bot work has its own acceptance gates and does not renumber engine items 1–9. See the [bot roadmap](https://github.com/barocss/doc-sync/blob/main/docs/bot-roadmap.md) for the detailed scope.

1. **B1: Recovery foundation — delivered within the opt-in demo scope.** Preserve receipt, generation, schema, and GC safeguards. Keep unsupported sessions blocked.
2. **B2: Structured brief and completion checks — exact occurrence and child-type checks added; stage in progress.** Preserve the original request and check explicit requirements against a fresh document read and authoritative revision. Record passed, failed, and unchecked results at the checked revision.
3. **B3: Plan, proposal, and server authorization — bounded owner approval and recovery added; stage in progress.** The opt-in HTTP/CLI path supports immutable preview/storage, inspection, rejection, and explicit approval of one visible plain unstyled root `MAIN` text change. Both proposal and acceptance flags default to false. Separate owner `read` + `proposal_accept` authority approves only the stored digest and decision UUID; keep it outside the planner. Exact-base and prepared-operation checks precede journal preparation/submission. Accepted exact requests can recover without resend when receipt, private evidence, protected History, and checkpoint agree. Unknown receipts and missing/corrupt proof remain blocked. Unsettled attempts block ordinary MCP startup, new base/capture work, and other approvals. Initial base mismatches are terminal `stale`; a later concurrent-edit race can reconcile to `not_applied` only after an exact durable server seal and private checkpoint retirement, without resending. Unknown outcomes and incomplete proof remain blocked; universal unblocking is not promised. Separate fixed-actor undo groups do not rewrite historical `applied` status. See the [proposal guide](./ai/proposals) for commands, API, and limits. Full UI, planner integration, general structural authorization, and remaining failure qualification stay open; browser and actual-model proposal acceptance are not established.
4. **B4: Templates and schema-specific authoring — planned.** Verify structure, placement, missing inputs, and preservation for each supported document schema.
5. **B5: Coordination and persistent watcher — planned.** Add explicit assignments, restart-safe triggers, cancellation, deduplication, and separate actor history.
6. **B6: Operations, sources, and memory — private hosted foundation implemented; broader stage planned.** Static grants, upstream credentials, capacity limits, and journals do not complete production access, retention, deletion, budgets, recovery, or external retrieval gates.

## Separate Rust experiment

See the [Rust engine overview](./guide/rust) for the current contract, evidence, and remaining gates. The [ordered D1–D9 delivery queue](./guide/rust#ordered-delivery-work) turns the remaining R4–R6 gates into client-boundary, schema/compiler, recovery, native SDK, full WASM, binding and release work. D1 now provides the selected TypeScript client and binding boundary, with passing routing/regression/count checks and bounded client timing evidence. Broader Chrome end-to-end latency remains open. D2 runtime schemas are the next Rust implementation lane; the native server remains optional.

The [Rust engine roadmap](https://github.com/barocss/doc-sync/blob/main/docs/rust-roadmap.md) defines a separate R1–R6 sequence. R1 has bounded UTF-16 contract and baseline evidence. R2 passed its declared [storage comparison gate](https://github.com/barocss/doc-sync/blob/main/experiments/rust-core/STORAGE-RESULTS.md) with independent JavaScript, native Rust, and WASM checks; the alternating-end regression remains recorded. R3 passed its declared boundary and lifetime gate in Node 24 and Chrome. These results do not approve a production migration.

R4 is in progress. The private native interpreter now compares text, History,
selection, recursive blocks and tables, groups, inline nodes, spans, and block
movement with logical split/join against TypeScript. The cursor correction
passes 75 native tests and 726 library tests. The movement receipt compares all
5,666 raw endpoints, including four formerly omitted hidden-root-gap cases.
Strict hidden editor ranges remain null. These remain bounded semantic checks,
not production Rust integration evidence.

Runtime schema loading and live schema replacement are separate next steps.
The initial native Rust SDK now provides direct typed document, operation,
History, selection and checkpoint calls for six fixed presets. Its 14 tests
and 20-action TypeScript comparison passed. It has no browser/WASM, Node,
editor or MCP adapter. The new Tiptap extension uses the TypeScript engine.
Rust can support them, but its current experimental schemas are compiled in.
The planned per-document compiled schema must replace fixed type rules before
arbitrary schemas are supported. Compatible live transitions must then retain
pending operations, History, selection anchors, and recovery protection.

R5 covers native server and WASM client shadow adapters. R6 requires end-to-end
gates and an explicit go/no-go decision. Production server and client code
remain TypeScript. Current native semantic results establish no new Chrome or
performance result.

The isolated [experiment](https://github.com/barocss/doc-sync/tree/main/experiments/rust-core) passed 265 Node 24 differential cases and a Chrome 156 batch check with checksum `719347296`. JavaScript/WASM medians were 1.759/8.050 ms in Node 24 and 1.700/7.300 ms in Chrome. WASM was slower in both measured batches. These timings include allocation, initialization, edits, and hashing. They exclude per-edit boundary calls and text transfer. See the [results](https://github.com/barocss/doc-sync/blob/main/experiments/rust-core/RESULTS.md) for raw samples and conditions. Full CRDT equivalence, production Rust integration, and editor performance acceptance remain **NOT_RUN**.

## Decisions kept separate

Live text-span coalescing remains excluded until the user explicitly asks to reconsider it. Binary wire format and actor numbering are undecided. Arbitrary subtree cuts and row, column, inline, or span moves are separate capability decisions. These are not implied by the ordered work above.

[Read status and limits →](./status)


## AI connection delivery

AI and bot documentation is separate from editor development. The [stdio connection](./ai/server) and [private hosted MCP service](./ai/hosted) both connect to the application document server through HTTP/SSE. The hosted entry point adds authenticated Streamable HTTP, configured slots, read/write/schema grants, upstream credentials, and stable actor journals on a single host. Linux requires `/usr/bin/flock` from util-linux; macOS uses the native kernel lock.

Bounded source and real-client checks do not establish production deployment acceptance. OAuth, TLS termination, multiple-host coordination, storage-failure qualification, and operational rollout remain separate gates. Preserve conditional edits, exact retries, and protected recovery across both transports.
