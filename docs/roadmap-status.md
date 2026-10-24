# Roadmap Execution Status — 2026-10-23

The previous integration is main `6f15291`, recorded in [HANDOFF §5.13](../HANDOFF.md#513-final-checks-and-main-integration-of-all-changes-2026-10-23). Remote model-event comparison for multiple text blocks was extended on top of it. Final retesting and main integration follow [§5.15](../HANDOFF.md#515-final-checks-and-main-integration-of-multi-text-block-remote-comparison-2026-10-23). Implementation, measurements, and scope follow [§5.14](../HANDOFF.md#514-roadmap-priority-remote-comparison-of-multiple-text-blocks-2026-10-23). Earlier screen-latency improvements remain in §5.9–§5.10; intent preservation and History fixes remain in §5.11–§5.12. The single library package and private demo/benchmark structure remain.

Paragraph-cache reuse after structural changes was added in [HANDOFF §5.16](../HANDOFF.md#516-improving-paragraph-recalculation-after-structural-changes-2026-10-23). The measurement baseline was main `10dfd86`; changes were uncommitted at that time. Subsequent final integration checks follow HANDOFF §5.17.

## Document capabilities and editor bindings

The later capability delivery adds public Slate and Lexical bindings, a complete example-schema page, paragraph/block/group movement, required-child projection, persistent annotations and declared nested attribute fields. Protocol 2 and document epochs gate compatible replay and preserve pending state on incompatible recovery. Independent fixed regressions cover the reported move-history, validation, snapshot and reference-isolation defects. Final integration evidence is recorded in HANDOFF §5.19.

Movement retains its placement log. This is an explicit later change to the earlier no-move decision. It does not implement arbitrary subtree cuts, row/column/inline/span movement, schema migration, bounded movement-log pruning, actual OS IME acceptance or product performance gates. Legacy safe receive comparison remains available; documents with movements or child rules use full comparison. Earlier measurements below keep their original source and scope.

## This Execution

1. Fixed the current source and uncommitted changes through copies, hashes, and diffs.
2. Extended stage 0's common scripts: a harness for 30 minutes of real-time automated input on 4 replicas, character editing in a fixed 50×10 table, snapshot opening after 10,000 edits, one 100,000-character paste, and comparison with the public Yorkie Tree SDK. Observed wall-clock time was 1,800,060ms. The last persisted convergence checkpoint was round 1320. The target of 1800 rounds and cadence was not met. The exact in-memory round at interruption is unknown. Results distinguish engine semantic differences and timeouts.
3. At §5.7, SyncClient remote events generated, compared, and verified only one safe text block. Item 11 below defines the current extension. Structural changes, old concurrent insertions, multiple blocks, batches depending on new tokens, hidden cells and virtual blocks, and undo/redo used the existing full path.
4. Invalidated the affected line's cache once for a large string application, avoiding copies of a growing block array for each character. ID, RGA, wire, and GC rules remain unchanged.
5. Fixed string-insertion undo to record all UTF-16 tokens. Added emoji/ZWJ and preservation tests for another user's input/deletions. The difference between model code points and stored UTF-16 remains.
6. Added the [state and synchronization specification](spec.md), property tests, an 8-peer long-run harness, and nightly CI.
7. PmBinding also reuses its internal model and PM conversion when the Doc object and version are unchanged. Selection/presence calculations and callbacks remain. Doc replacement for snapshot, reset, and IME drafts is detected separately.

8. The following scope describes validation at §5.9. See item 12 for later structural/restoration cache improvements. Unchanged text-block models and run normalization are reused across document changes. Checks covered mark writes to the same Block and cache invalidation for structure, restoration, and GC. Fresh 100,000-character Chrome p95 changed from 246.5/260.4→124.1/120.2ms. See the [measurement report](../benchmarks/results/screen-latency-2026-10-23/report.md).

9. Applied CSS isolation only to top-level plain paragraphs to reduce Paint/PrePaint cost. Composing paragraphs, headings, lists, quotes, and nested structures are excluded. Final Chrome p95 changed from 111.7/120.4→69.5/68.5ms; rerunning pre-change source gave 108.1/121.9ms. The [additional report](../benchmarks/results/screen-paint-2026-10-23/report.md) preserves the IME paint-order regression found in a broader candidate and the final validation scope. This does not establish a product SLO or complete the roadmap.

10. Added deletion/formatting/insertion/undo intent rules and 41 fixed regressions. Fixed consecutive formatting undo and added 19 regressions covering remote same-value writes, partial ranges, and undo/redo branches. Final expanded checks passed: core 204 + demo 10, compat 31, and type checking. HANDOFF §5.12–§5.13 contain evidence, including Chrome results whose source hashes match that integration.

11. Extended safe remote text/del/set model comparison to at most 8 independent TextBlocks. The existing full path remains for a ninth block, structure, old insertion, dependencies on new tokens, hidden/virtual blocks, and undo/redo. At 100,000 characters, 2-block p95 changed from 31.330–46.928→1.653–1.739ms; 8-block p95 changed from 36.132–44.818→3.917–6.410ms. This measures synchronous handling through the model-event callback, not screen latency. Checks covered 38 focused remote cases, expanded core 233 + demo 10, compat 31, type checking, and Chrome baseline 30 + new 10-step/compat 104 regressions. The [measurement report](../benchmarks/results/remote-multiblock-2026-10-23/report.md) records rejection of an unbounded candidate that slowed broader workloads.

12. Limited structural cache invalidation to affected lines instead of rereading every paragraph. Rows/columns refresh the table's parent line; visibility invalidates descendants too. After scanning boundaries in the same line, matching paragraph models are reused. Wire, RGA, deletion, formatting, undo rules, and full structural-event verification remain. See the [before/after measurement and validation report](../benchmarks/results/structural-cache-2026-10-23/report.md).

## Execution Priorities for Remaining Work

1. **Snapshot reconnection contract after lease expiry.** Specify and test disposal of old undo/pending state and actor/session transitions. Unimplemented.
2. **Separate causes of screen tail latency for structural input.** Paragraph recomputation improved. Both the demo→PM p95 regression in the first revision and the reduction in repeated measurements are preserved. Follow-up checks must separate structural-line scanning, full diff, copying, conversion, and DOM cost. Overall screen performance has not passed.
3. **Remaining stage 0 exit evidence.** Resolve Yorkie timeouts, actual editing scripts, 30 minutes at 1800 rounds/1Hz, comparable memory/GC/wire metrics, and product targets. This run reviewed existing gaps; it did not rerun 30-minute, external-editor, or Yorkie measurements.
4. **Actual CI observation and later stages.** Nightly execution/two-week observation, operations, schema evolution, target-product integration, and release conditions remain separate. The 8-block improvement does not complete G0/G1 or the full roadmap.

## Stages and Exit Conditions

| Stage | Current Assessment | Remaining Conditions |
|---|---|---|
| 0 Baseline measurement | Expanded scripts and comparison scope | G0 after reviewing complete results, timeouts, and semantic differences; confirmed targets |
| 1 Performance | Up to 8 text blocks on receipt, large paste, paragraph-model reuse after structure, Paint improvements | Structural-line scan, full comparison/copying/normalization, costs for 9+ blocks and undo/redo, actual product criteria, G1 |
| 2 Correctness | Specification, property/intent regressions, consecutive formatting undo fix, long-run CI foundation | Lease-expiry recovery, actual CI runs, two-week observation, long-lived single-document scope |
| 3 Storage/operations | Existing demo implementation | Durable snapshots/log truncation, authentication/authorization/size/rate limits, failure and multi-server validation |
| 4 Schema evolution | Unimplemented | Schema version/fingerprint negotiation, migration functions, rejection of old versions |
| 5 Target-product integration | Public PM integration and comparison demo | Actual target-editor operations, intent, performance, and OS IME validation |
| 6 Feature completion | Some foundations exist | Child-count min/max, per-mark boundary policies, comments, historical lookup, integrated selection, row/column sizing |
| 7 Release | Single-package structure complete | Release build, API/version policy, security verification, migration tools, pilot operation, G4 |

The latest single-package decision replaces stage 7's former multiple-public-package proposal. Continuous-string storage remains a design review and does not automatically reverse the decision to exclude implementation. Binary encoding awaits a decision. Move/cut operations and collection of text from merged cells were not added in this work.

## Measurement Boundaries and Targets

The roadmap's local p95 2ms, remote application p95 5ms, memory at 2× Yjs, 100B per character edit, and 300ms opening remain proposed values. This implementation does not substitute for approval of product SLOs.

| Metric | Includes | Excludes |
|---|---|---|
| Core/comparison local | Model edits, CRDT application, engine-wrapper payload preparation | Network, editor, DOM |
| Core/comparison remote | Wrapper decode and CRDT application | SyncClient model events, network, DOM |
| SyncClient remote | Event receipt through completion of model-event subscriber callbacks | Mirror-model application, network, DOM |
| Actual editor | Key-event generation through the second rAF after remote DOM verification | Physical display presentation time |
| Snapshot opening | Stored-state restoration and first model read | Remote download and actual-editor initial rendering |

One 100,000-character paste is not a p95 distribution. Do not directly compare different measurement boundaries. A timeout is not a completion time and cannot be used to calculate speedup. External CPU load and shared page renderers are additional limits.

Evidence and gaps for the G0 technical decision are in `benchmarks/results/roadmap-2026-10-23/`. Unmeasured product conditions are not marked passed. Identified bottlenecks were optimized within the existing collaboration policy.

## How to Run

Use Node 22.19 or later. All commands run from the repository root. Use a fresh result path.

```sh
npm test
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
npm run remote --workspace @doc-sync/benchmarks -- --chars 10000,100000 --blocks 1,2,8 --operations insert,delete,format --out /tmp/new-remote.json
npm run stage0:freeze --workspace @doc-sync/benchmarks -- /tmp/new-stage0-receipt
node packages/doc-sync/test/long-fuzz.ts --ops 1000 --peers 8 --seed 23 --out output/long-fuzz/new-smoke.json
```

The [measurement guide](../benchmarks/stage0/README.md) describes baseline installation, freezing, Yorkie, and long runs. CI executes at least 125,000 wire Ops in each of 8 shards. It starts fresh document batches after about 512 Ops. This differs from accumulating one million operations in one document, disk-failure tests, and lease-expiry recovery tests.

Locally, all 8 shards passed with a total of 1,000,021 wire Ops. Each shard uses 8 replicas. These are local runs. They do not establish a GitHub scheduled-workflow run or two consecutive weeks of success. Local records and final review results are in `output/validation/roadmap-execution-20261023/`. Git excludes `output/`.

The source-bound capability comparison is in [document-capabilities-2026-10-24](../benchmarks/results/document-capabilities-2026-10-24/README.md). It records mixed plain-document results and a known full-comparison limit: at 100,000 characters, prior-move text receipt p95 was 88.828 ms and minimum-child text receipt was 25.484 ms. Narrow this path before claiming large-document interactive acceptance.

The later [logical text comparison report](../benchmarks/results/logical-text-scopes-2026-10-24/README.md) narrows safe moved/required text receipt without changing CRDT semantics. At 100,000 characters, two updated p95 runs were 12.827–14.220 ms for movement and 1.904–2.061 ms for cardinality, with zero whole-model reads. Automatic storage, hidden content and structural changes retain full comparison. This supersedes the preceding full-comparison performance limit for eligible text, not for every workload.


## Automatic paragraphs and post-move splitting

The two correctness defects identified during logical-text optimization are fixed separately in HANDOFF §5.21. Edited automatic paragraphs display once; moving one leaves a distinct editable replacement when needed. Split markers no longer reanchor untouched following siblings. No corrective moves are emitted for other users' blocks. Existing placement arbitration, same-boundary Enter and conditional history rules remain. Fixed Node cases and Chrome native-editor checks record the current proof boundary; actual OS IME and product performance gates remain open.

Final integration review also fixed editing paths after lazy replacement-gap reconstruction. Empty leading replacements stay visible to both the model and editing paths, so later insert/delete/format/split operations keep their intended target. HANDOFF §5.22 records 18 new fixed cases, the expanded 525-case library run and the fresh 175-check Chrome run.
