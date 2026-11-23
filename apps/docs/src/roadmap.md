# Roadmap

This roadmap orders the work needed to turn the current library into a dependable integration. Each item has a verification condition. A passing bounded test does not by itself establish production readiness.

## Current checkpoint

The local working tree contains a schema-defined document CRDT, identity-preserving block and group moves, per-participant undo and redo, remote cursors and selections, and ProseMirror, Slate, and Lexical bindings. Word-style, Notion-style, and presentation schemas have bounded model and editor tests. They do not provide complete product file formats, layout, or editing experiences.

The local working tree also contains a Node transport and an MCP server. Protocol 3 checks a schema fingerprint. Compatible schema additions can transition without resetting the document. MCP edits check the document epoch, sequence, and schema version atomically on the demo server. Existing changes and undo history are retained under the documented rules. See [AI and headless clients](./guide/ai) and [changing a schema](./guide/schema#changing-a-schema) for the scope and limits.

The durable browser recovery checkpoint in HANDOFF section 5.75 passed 719 library and 64 demo tests before its final actor-lock change. After that change, 28 focused recovery tests passed. Chrome checked pending-edit reload, server restart, undo and redo, a lost retirement response, and rejection of a duplicate recovery tab. Those are source-bound checkpoint results, not final validation of the current working tree. Earlier browser and performance results retain their original scope in [status and limits](./status).

The opt-in product recovery mode saves origin-local checkpoints and exact recovery evidence, restores the same actor after reload, and supports explicit retirement. It requires the same document identity and saved browser storage. It does not recover legacy unprotected sessions. Schema upgrades remain disabled in this mode. See [AI and headless clients](./guide/ai) for recovery limits.

The local document bot has a separate ordered [bot roadmap](https://github.com/barocss/doc-sync/blob/main/docs/bot-roadmap.md). Its next step is a structured brief with deterministic completion checks. The Rust storage experiment is a separate investigation, described below.

## Ordered work

### 1. Validate the current integration

**Status: bounded checkpoint checks passed; current integration needs a final receipt.** The recovery checkpoint above adds Chrome proof for all three editor models with pending local input and a separate remote edit. Existing editing and compatible schema-transition checks remain source-bound evidence. Run checks for the final integrated source and record which earlier scenarios were reused. Actual OS IME, production operation, and performance acceptance remain separate work.

**Done when:** the final source, test results, and browser evidence are recorded together; regressions are fixed; and the limits of the browser checks are stated. Real OS IME and performance measurements are separate work.

### 2. Recover pending changes and history

**Status: MCP and opt-in browser recovery implemented within a bounded demo scope.** On macOS, the MCP app stores conditional intents and protected checkpoints with undo and redo history. The single-process demo persists a recovery reservation across server restart and ordinary peer lease expiry. It can atomically recover an exact pending ordinary change and restore an accepted conditional edit when the required generation, schema and GC protection are proven. Unknown conditional outcomes and unsafe or incompatible recovery remain blocked for inspection. `discard_history` permanently clears the calling participant's undo and redo history and releases its old reservation after checking pending work. An interrupted release resumes on startup. Other reservations or ordinary peer leases can still hold back garbage collection. The demo compacts released-reservation metadata by sealing reservation eras and retaining active pins. The document log and active reservations are not bounded by that compaction. The product demo also stores browser checkpoints before submission, uses Web Locks to protect each recovery actor, and restores pending edits and history after reload when server proof is valid. A failed storage write stops the session. Explicit retirement clears that actor's history and releases its reservation; an interrupted retirement retries the same release. Saved origin-local storage and the same document identity are required. Legacy unprotected sessions remain blocked. Schema upgrades are disabled in recovery mode.

**Done when:** process and network failure tests cover accepted and unaccepted writes, repeated recovery, concurrent remote edits, schema changes, undo/redo, and GC without duplicate or lost edits. Record any outcome that still requires manual reconciliation.

The [recovery plan](./reference/recovery-plan) describes the implemented recovery boundary, test scope, and remaining storage, reservation lifecycle, and failure cases.

### 3. Make server operation dependable

**Status: demo only.** Define document and actor authentication, document-level authorization, request and rate limits, durable snapshots and logs, log retention, and recovery after storage failure. Define the ordering and consistency contract before supporting multiple server processes. Add operational observability and a deployment model.

**Done when:** the chosen server passes authorization, isolation, malformed-request, storage-failure, restart, concurrency, and recovery tests. Document operational limits and the tested deployment boundary.

### 4. Extend schema evolution

**Status: compatible additions and bounded open-editor rebuilding implemented.** The product demo rebuilds Slate, Lexical and ProseMirror after a compatible transition using the application-supplied host contract. Pending edits, history and text selection are retained within the tested cases. Define explicit migrations for schema removal, narrowing, changed defaults and attributes, and changes that require new snapshot capabilities. Specify validation, rollback, offline changes, hidden content, undo history, and reconstruction of application-specific plugins and codecs.

**Done when:** each supported migration preserves the declared document state and participant changes in concurrent and failure tests. Unsupported transitions must fail without discarding state. Browser checks must exercise the supported binding transition.

### 5. Read large documents efficiently for AI

**Status: full-document MCP read available.** Add bounded document or subtree reads and an addressing contract suitable for following edits. Keep the authoritative edit-base check, schema rules, and participant history. Define pagination and stale-read behavior for concurrent structural changes.

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
2. **B2: Structured brief and completion checks — initial CLI checks implemented; stage in progress.** Preserve the original request and check explicit requirements against a fresh document read and authoritative revision. Record passed, failed, and unchecked results at the checked revision.
3. **B3: Plan, proposal, and server authorization — planned.** Enforce role and scope on the server. Store proposals and revalidate them at acceptance.
4. **B4: Templates and schema-specific authoring — planned.** Verify structure, placement, missing inputs, and preservation for each supported document schema.
5. **B5: Coordination and persistent watcher — planned.** Add explicit assignments, restart-safe triggers, cancellation, deduplication, and separate actor history.
6. **B6: Operations, sources, and memory — planned.** Define access, retention, deletion, budgets, and recovery before adding hosted operation or external retrieval.

## Separate Rust experiment

See the [Rust engine overview](./guide/rust) for the current contract, evidence, and remaining gates.

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
