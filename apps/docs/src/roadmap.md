# Roadmap

This roadmap orders the work needed to turn the current library into a dependable integration. Each item has a verification condition. A passing bounded test does not by itself establish production readiness.

## Current checkpoint

The local working tree contains a schema-defined document CRDT, identity-preserving block and group moves, per-participant undo and redo, remote cursors and selections, and ProseMirror, Slate, and Lexical bindings. Word-style, Notion-style, and presentation schemas have bounded model and editor tests. They do not provide complete product file formats, layout, or editing experiences.

The local working tree also contains a Node transport and an MCP server. Protocol 3 checks a schema fingerprint. Compatible schema additions can transition without resetting the document. MCP edits check the document epoch, sequence, and schema version atomically on the demo server. Existing changes and undo history are retained under the documented rules. See [AI and headless clients](./guide/ai) and [changing a schema](./guide/schema#changing-a-schema) for the scope and limits.

The latest local validation passed 688 library, 57 demo, 27 documentation, and 59 MCP tests, with one platform-specific MCP test skipped, plus 32 comparison-editor tests. Recovery tests cover process termination, restarted MCP and demo server processes, pending undo and redo, history discard, reservation compaction, GC, and another participant's edits. Cold-log tests cover concurrent access, durable-write ordering, source changes, and process termination after file sync. A real two-agent MCP test checks stale revisions and separate undo histories. The lease-expiry test uses a controlled clock. Chrome passed 90 native editing checks and 28 open-editor schema transition checks. A bounded real Codex collaboration and reconnect scenario was tested before the open-editor schema changes and was not rerun afterwards. The earlier 39 structure checks were not repeated. These results do not establish actual OS IME or release acceptance. Earlier performance results remain tied to their measured sources and conditions in [status and limits](./status).

## Ordered work

### 1. Validate the current integration

**Status: bounded checks passed.** Current Chrome checks cover browser editing and synchronization with all three editor bindings, including input, selection, undo, redo, and representative concurrent edits. Before the open-editor schema changes, an actual Codex MCP participant edited the same Word-style document as all three editors, and a simulated network interruption tested an offline Slate edit alongside a Codex edit. That Codex scenario was not repeated after the latest changes. Open-editor schema checks are recorded in item 4. These checks do not establish real OS IME, production operation, or performance acceptance.

**Done when:** the final source, test results, and browser evidence are recorded together; regressions are fixed; and the limits of the browser checks are stated. Real OS IME and performance measurements are separate work.

### 2. Recover pending changes and history

**Status: in progress.** On macOS, the MCP app stores conditional intents and protected checkpoints with undo and redo history. The single-process demo persists a recovery reservation across server restart and ordinary peer lease expiry. It can atomically recover an exact pending ordinary change and restore an accepted conditional edit when the required generation, schema and GC protection are proven. Unknown conditional outcomes and unsafe or incompatible recovery remain blocked for inspection. `discard_history` permanently clears the calling participant's undo and redo history and releases its old reservation after checking pending work. An interrupted release resumes on startup. Other reservations or ordinary peer leases can still hold back garbage collection. The demo compacts released-reservation metadata by sealing reservation eras and retaining active pins. The document log and active reservations are not bounded by that compaction.

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

**Status: not released.** Keep one public library package and private apps and benchmarks. Produce runnable JavaScript and type declarations, verify consumer installation and subpath imports, and define API, protocol, version, migration, security, and release policies. Plan the Protocol 2 to 3 upgrade for existing deployments.

**Done when:** a clean consumer can install and use the package, the selected release checks pass, compatibility and migration instructions are available, and the release gates are approved. The current package remains private and exports TypeScript source.

## Decisions kept separate

Live text-span coalescing remains excluded until the user explicitly asks to reconsider it. Binary wire format and actor numbering are undecided. Arbitrary subtree cuts and row, column, inline, or span moves are separate capability decisions. These are not implied by the ordered work above.

[Read status and limits →](./status)
