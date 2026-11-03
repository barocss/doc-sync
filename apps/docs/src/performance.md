# Performance evidence

Measure the layer you need. Core application time, client notification time, and visible editor latency cover different work.

## Collection access and internal copies

A structural refactor removes full result construction from cached Map/List
queries. The paired Node 24.22.1 workload stores 10,000 List entries and 10,000
Map entries in the same archived Client implementation. Only the access layer
changes between lanes. Preparation and full result checks run outside timing.

| Cached query | Before median (ms) | After median (ms) |
| --- | ---: | ---: |
| Last List entry | 0.206014 | 0.001333 |
| Distinct Map key count | 1.962458 | 0.000320 |

Each query uses ten samples from five ABBA rounds. Cached queries use batches
of three, with the same assertion overhead in both lanes. These short timings
are observations, not production tail-latency guarantees. Decoder instrumentation
also checks that List.at decodes one selected entry and Map.size decodes none.
The first read after an edit still rebuilds the full validated projection.

A separate controlled comparison changes only Doc's immutable-primitive copy
path, with the same Client and dependency sources in both lanes. For the same
20,000 entries, seven unprofiled samples give an edit/read median of
1,007.563 ms before and 863.005 ms after, about 14.3% lower in this run.
Objects still use structuredClone, and snapshot/admission checks remain active.
Final ID/value oracles and local undo/redo/restore checks run outside timing.

This generic workload remains slow. Whole snapshots, finite-JSON validation,
normalization and projection rebuilds still scale with stored state. The numbers
exclude browser input, network delivery, physical paint, server restart and heap
allocation measurement. They do not qualify all editor latency or Rust/WASM.
See the [API and structure report](https://github.com/barocss/doc-sync/blob/main/docs/reports/api-structure-refactor-2026-11-03/README.md)
for source hashes, raw records, regression results and remaining costs.

## Discarded local point-cache experiment

A local copy-on-write prototype was **DISCARDED**, not landed. Its first-read
medians improved by 26.58–36.21% in the measured Node workloads, but mandatory
combined setter-plus-read gates failed: a 2k nested Map regressed by 5.40%, and
20k nested Map/List reductions of 3.55%/2.91% missed the prospective 5% useful-effect
gate. Cycle 1 completed all 12 processes and correctness oracles; cycles 2/3
were NOT_RUN after early decline. Functional passes are not performance passes.

The library retains only the initial refactor described above. It has no accepted
COW latency claim. See the [candidate decision](https://github.com/barocss/doc-sync/blob/main/docs/reports/local-point-cache-candidate-2026-11-04/README.md)
for raw evidence, plan versions and qualification limits. These measurements
are not isolated-host, network or editor-latency results.

## Private preflight experiment remains on hold

A separate output-only prototype removes one disposable validation stage for
one guarded value update in the default Data schema. It preserves both live
snapshots, public admission, normalization and selective History. Independent
comparison passes 94 paired cases and a candidate-only TypeScript check. This
prototype is **not part of the current library**.

The prospective first ABBA cycle used Node 24.22.1, two warmups and five samples
per process. Each lane contributes ten samples per case. All 24 processes pass
their semantic and source checks. For 20,000 entries with authored moves, the
complete setter plus first read has these pooled medians:

| Data operation | Baseline (ms) | Prototype (ms) |
| --- | ---: | ---: |
| Root Map overwrite | 902.236 | 737.907 |
| Nested Map overwrite | 903.015 | 731.047 |
| List item update | 907.141 | 726.672 |

All four Data size/fixture groups and structural/custom-schema controls pass
their first-cycle gates. The direct 100k-character Doc remote-apply control,
however, rises from 2.188646 to 2.274438 ms, a 3.92% increase against a 3% limit.
The prospective decision is therefore **FAIL**. Cycles two and three are
**NOT_RUN**; no retry or tolerance change replaces that result. The candidate
remains outside the library while the control difference is investigated.

An untimed trace of the exact remote operations observes no new registration,
snapshot-audit or private Data calls inside that interval. It does not establish
whether code generation, GC or host variation caused the difference. The
[control analysis](https://github.com/barocss/doc-sync/blob/main/docs/reports/private-preflight-control-attribution-2026-11-04/README.md)
preserves that unresolved result and supports no source fix.

These are source-only Node observations on a host with uncontrolled external
load. They establish no editor, network, heap-saving or Rust/WASM result. The
bounded explicit-GC probe observes reclamation in both lanes; it is not a
general memory-leak guarantee. The [candidate report](https://github.com/barocss/doc-sync/blob/main/docs/reports/private-preflight-candidate-2026-11-04/README.md)
retains the first failure, raw samples, source hashes, scope clarification and
all qualification limits.

## Graphic canvas demo

The [PixiJS editor](./guide/graphic-editor) uses two independent TypeScript
clients over real loopback HTTP/SSE. Chrome functional checks pass 20/20.
The size sweep passes convergence and model equality, but **large-scene
interactive performance remains INVESTIGATE**.

| Stored objects | Client edit p50 / p95 (ms) | Peer convergence p50 / p95 (ms) | Cold ready wall time (s) |
| --- | --- | --- | --- |
| 9 | 2.4 / 3.0 | 8.3 / 8.9 | 2.56 |
| 100 | 13.8 / 14.9 | 21.2 / 22.5 | 0.66 |
| 1,000 | 125.7 / 135.6 | 194.8 / 210.7 | 4.29 |
| 5,000 | 649.7 / 686.4 | 1,570.3 / 1,686.2 | 113.84 |

Each size uses a fresh room, three warmups, and ten recorded attribute edits.
The environment is Chrome 156 on Apple M3 Max, WebGL through ANGLE Metal,
1720 × 1080. Cold wall time includes room seeding, page startup, connections,
and tool overhead; it is one observation, not an initial-render distribution.

A batch of 1,000 cached same-ID lookups takes about 0.3 ms p50 at every size.
Three separate sweeps over 5,000 distinct IDs take 1.2, 1.2, and 1.3 ms without
reindexing. This excludes cache construction. At 5,000 objects the full index
rebuild is 68.7 ms p50; Pixi view update CPU work is about 2 ms per view. Client
editing still performs full staging and model work. The next investigation is
whole-document snapshot/restore/model allocation and bulk room seeding, then
incremental scene indexing.

Client edit time includes synchronous engine, History, and enqueue work and
excludes deferred view callbacks. Convergence polls the addressed ID and pending
state; full-model equality is checked after timing. Pixi CPU timing excludes GPU
completion. Animation-frame waits do not measure physical paint. There is no
before/after optimization claim or production scene-size acceptance.
The [source-bound report](https://github.com/barocss/doc-sync/blob/main/docs/reports/graphic-demo-2026-11-03/README.md)
contains raw records, diagnostics, failures, and hashes. Existing text-editor
performance flags below remain open.

## Collaborative spreadsheet grid

The private [VTable spreadsheet demo](./schemas/spreadsheets#run-the-collaborative-grid-demo)
uses two independent sparse replicas over real loopback HTTP/SSE. Final Chrome
functional checks pass 21/21: trusted native input, dirty inspector fields,
active drafts, concurrent first writes, selective undo/redo, actual rectangular
shading, far-cell edits and reconnect. An instrumented edit/remote-refresh check
records zero full-range reads. A separate Node request checks server equality;
the browser does not poll the state oracle.

### Why sparse editing was slow

Logical extent and stored data are different. The demo has 1,048,576 rows and
16,384 columns, but creates no storage for blank coordinates. The original
10,000-cell benchmark contains 10,000 cells with values. Each request sends only
its changed operations. The original server nevertheless copied and replayed
all retained state to validate each new batch. The view also built a full sparse
cell list merely to display status counts. Neither was required for point edits.

The server now checks fresh ticket IDs with a bounded index and calls the sparse
primitive's atomic batch preflight directly. Exact accepted retries use their
original receipt before those checks. Malformed batches and reused tickets fail
without partial application. Accepted/rejected hot-path tests record zero full
state captures/restores. View status uses a constant-size summary; full sparse
reads remain explicit debug/oracle operations. Normal rendering reads only its
bounded window.

### Backend-only comparison

An A–B–B–A run kept the exact UI bundle, benchmark script, sparse data and sample
counts fixed. Each size uses three warmups and ten recorded point edits. Here
are the per-run peer convergence p95 values; percentiles are not pooled:

| Run | Server | 1,000 stored cells (ms) | 10,000 stored cells (ms) |
| --- | --- | --- | --- |
| A1 | Full state replay | 51.4 | 287.0 |
| B1 | Incremental batch preflight | 21.1 | 33.8 |
| B2 | Incremental batch preflight | 26.2 | 33.7 |
| A2 | Full state replay | 38.8 | 285.9 |

The paired 10k p95 reduction is about 88.2% in both repeats, or about 8.5×.
Before/after handler snapshots, the rehosted baseline adapter, emitted bundle and
all four raw runs are retained. Workspace source fingerprints in the old run
are not substituted for the separately pinned executed baseline handler.

### Final view with no status range scan

A second phase also removes the view's full range read. It uses a different UI
bundle, so these final observations are separate from the backend-only ratio.

| Preseeded cells | Sparse edit p50 / p95 (ms) | Peer convergence p50 / p95 (ms) | Maximum per-view render CPU p95 (ms) |
| --- | --- | --- | --- |
| 0 | 0.1 / 0.3 | 12.1 / 23.8 | 5.9 |
| 1,000 | 0.0 / 0.1 | 12.8 / 27.1 | 5.1 |
| 10,000 | 0.1 / 0.2 | 17.9 / 26.8 | 5.4 |

Chrome 156, Apple M3 Max, 1720 × 1080; three warmups and ten recorded edits per
size, each with a fresh browser and room. The view mounts at most 100 × 26
records. A zero reading reflects timer resolution. Sparse edit includes local
History/pending bookkeeping. Timed edits use application actions; trusted input
is a separate functional check. Convergence waits for sender acknowledgement
and the addressed peer cell. Full sparse equality and the Node oracle run after
timing. Render CPU and rAF exclude GPU completion and physical display time.

Cold ready wall times of 2.41/1.49/1.96 s include browser/CLI startup and polling;
they are single observations. Seeding 10,000 cells through 40 batches takes
276.6 ms in the final run and is excluded from those times. No production timing
budget is declared. These measurements do not qualify WAN latency, 100,000
populated cells or long histories. Blank logical coordinates do not count as
populated cells. The memory demo retains its 20,000-operation cap per room.
Initial catch-up, explicit capture/range scans, history growth, GC, durable
recovery, structural axes and public Client integration remain open.

Raw records, phase boundaries and hashes are in the
[domain delivery report](https://github.com/barocss/doc-sync/blob/main/docs/reports/domain-delivery-2026-11-03/README.md).

### Custom-schema integration regression observation

After adding custom field profiles, the default profile was measured again with
its final bundle. Peer convergence p95 was 18.2/18.9/18.8 ms at 0/1,000/10,000
populated cells. Sparse edit p95 was 0.2/0.2/0.1 ms and maximum view render CPU
p95 was 3.6/4.1/4.2 ms. The fixed 100 × 26 view and three-warmup/ten-sample
method are unchanged. This is a fresh regression observation, not a paired
before/after speedup claim. It does not qualify custom-profile large histories,
WAN, 100,000 populated cells or physical paint.

The same final bundle passes 21 default-profile and 29 custom-profile Chrome
functional checks. Tasks and Sensors support their declared typed fields;
normal edit/remote refresh uses zero whole-range reads. See the
[custom schema report](https://github.com/barocss/doc-sync/blob/main/docs/reports/custom-schemas-2026-11-03/README.md).


### Stable-axis S2 boundary

The opt-in [StructuralSheet route](./schemas/spreadsheet-structure) has separate
functional Chrome proof. Its Node diagnostics cover nine logical-extent/history
conditions. Empty 1,000/million/billion axes each retain one run per dimension;
point-edit p95 is 0.0404–0.0529 ms. Checkpoint replay p50 reaches 53.391 ms in
the measured retained-history case. These are Node measurements; they do not
establish S2 browser latency. Structural replay and view projection remain
performance work. The earlier fixed-axis convergence measurements above do not
qualify the S2 renderer.


## Sparse sheet primitive

The [private sparse-sheet experiment](./schemas/spreadsheets) is a separate,
headless TypeScript primitive. Its timings are not canvas or spreadsheet editor
latency. One Node 24 sample on Apple M3 Max observes:

| Logical extent | Written cells | Empty JSON checkpoint bytes | JSON checkpoint after writes | 10,000 point reads (ms) |
| --- | --- | --- | --- | --- |
| 100 × 100 | 4 | 241 | 2,880 bytes | 10.10 |
| 1,000,000,000 × 1,000,000 | 4 | 251 | 2,940 bytes | 9.66 |
| 1,000,000,000 × 1,000,000 | 1,000 | 250 | 693,799 bytes | 12.49 |
| 1,000,000,000 × 1,000,000 | 10,000 | 251 | 7,204,800 bytes | 18.98 |

The extent is two numbers; cell reads create no blank row, column, or cell
records. Different sheet names and numeric lengths account for the small empty
JSON size differences. This demonstrates sparse allocation, not production
memory qualification. The 10,000-cell case retains about 18 MB of heap above its
baseline in this observation. Heap deltas use explicit GC and can be noisy or
negative in the small cases. JSON bytes are not heap bytes.

The checkpoint contains a full journal, retained operations, pending queue and
History. It grows with edits, and restore replays the journal. At 10,000 written
cells, capture takes 58.59 ms and a full sparse range read takes 8.06 ms in this
single run. There is no compaction, GC, formula calculation, network, or renderer.
Four benchmark correctness cases pass, without timing thresholds or a matched
baseline. See the [source-bound report](https://github.com/barocss/doc-sync/blob/main/docs/reports/sparse-sheet-2026-11-03/README.md)
for raw values and limits.

## Unified Client and native input

The [Client and native-input report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/unified-client/report.md) compares an independently built
main baseline with the source-frozen Client facade and native ownership fixes.
All 32 PM scenario/count pairs pass without extra ordinary snapshots or model
conversions. Original timing retains eight investigation flags; focused matched
repeats put those cases inside the original guards. This is scoped headless PM
evidence, not a zero-overhead or network-latency claim.

The separate raw-Sync Slate/Lexical comparison isolates the native fix. At 100k,
pooled single-character insert medians change from **19.170 to 5.985 ms** in Slate
and **31.259 to 18.450 ms** in Lexical. All 16 count comparisons pass; marked range
replacement retains its existing one snapshot/restore. Repeated timing retains
one Slate 10k insert p95 flag (**2.123 to 4.481 ms**) while its median improves
from 1.333 to 0.947 ms. That tail remains unqualified.

Chrome records 320 trusted inputs across both sizes, modes, APIs and four source
editors, observing all four views. **59/64 paired DOM cells** meet guards declared
before timing. All medians, sync cells and 100k cells pass. Five local 10k p95
cells exceed the guard. The current-code legacy control shares the native fixes;
its local Tiptap path is new. It is not an old-source native-fix comparison.

The clock covers trusted beforeinput to observed DOM equality. Two animation
frame callbacks indicate a rendering opportunity, not physical display. The sync
transport is in-page; HTTP/restart performance is not measured. Raw failures,
partial setup runs, repeated samples and source/bundle hashes remain in the
report. The performance result is **INVESTIGATE**, not a uniform PASS.

## Input-tail diagnostics

The [bounded diagnostic report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/input-tail-diagnostics/report.md)
keeps the original Node and Chrome investigation flags. A new CPU-profiled
5.395 ms input overlaps 3.788 ms of major GC, after fresh-fixture/oracle setup
increases the heap substantially. This explains that captured sample. The
original 4.481–4.962 ms samples have no GC trace, so their cause is not established.
Operation proof cloning and commit take only tens of microseconds in the capture.

A separate 80-input Chrome trace pair passes content/History checks but does not
reproduce the original 9.6/9.7 ms events. Both API routes include Slate callbacks
and React work. Instrumented timing is not used as acceptance, and no runtime
optimization was justified by these traces. Do not remove old flags, exclude
samples, force GC or widen guards to call them a PASS. These captures use the
compiled Client checkpoint before the separate local save/open implementation.

## Memory-only client

The [LocalClient comparison](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/local-client/report.md)
checks real headless ProseMirror at 10k and 100k UTF-16 units against an offline
SyncClient host on main `12da94d`. All 48 count cells match without extra ordinary
snapshots or conversion calls. The original full timing keeps 14 investigation
flags out of 32 comparisons. Same-process ABBA keeps two out of 16; focused
repeated-input profiles place those two within the original guards. No persistent
Local-only hotspot was established. These are scoped Node results, not browser
latency acceptance or zero-overhead proof.

## Receive model materialization

Text projection now accumulates adjacent equal-format characters in temporary string chunks. Normalization keeps each existing text run whole instead of expanding it again. A shared private reference per text block also avoids rewriting every character's membership entry after one insertion. Public blocks remain immutable, span-value identity is preserved, and editing/diff offsets still use the existing unit conversion. Live Items, logical IDs, history ownership, snapshots and wire format are unchanged.

A repeated Node 22.19.0 local comparison uses the metadata-compressed baseline, three fresh processes per workload/variant, and separate warmups. Values below are medians of per-process p95s, not pooled p95s. They measure `Doc.apply + Doc.toJSON`, including full model copying, and exclude SyncClient, network, native conversion and DOM work.

| Plain one-paragraph document | Before p95 | After p95 | Reduction |
|---|---:|---:|---:|
| 100,000 UTF-16 units | 82.955 ms | 25.697 ms | 69.0% |
| 1,000,000 UTF-16 units | 1,049.757 ms | 352.018 ms | 66.5% |

One-million-unit cold incremental JS heap remains essentially unchanged (251.899 → 251.915 MiB); warm heap is 292.820 → 291.880 MiB. The ID metadata compression remains active. Control workloads retain less favorable results: 625 short paragraphs are about 1 ms, with no demonstrated gain, and per-character alternating marks have a 2.5% higher p95 median. Long changed paragraphs still require full character reads, and fragmented marks still create many runs.

[All 54 fresh-process records, memory readings, controls and reproduction steps](https://github.com/barocss/doc-sync/tree/main/benchmarks/results/receive-model-2026-10-24) define the proof boundary. Browser regressions verify bounded functionality; this comparison does not measure screen latency or establish a release SLO.

## Runtime ID metadata

The runtime index shares actor names and groups consecutive logical IDs in ranges of at most 256 entries. Fragmented sequences use numeric keys. Stable tombstone aliases can share one reference per range after the existing GC policy permits merging. Equal insertion-origin strings reuse an existing key string.

Each live UTF-16 unit still has its own Item, logical ID, formatting registers and history targets. Item identity, conflict rules, hidden content, wire operations and snapshot format remain unchanged. This is runtime index compression; it does not implement live string segments or the complete Automerge storage model.

[Memory and core performance measurements](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/metadata-memory-2026-10-24/report.md) cover fresh-process GC measurements, cache state, fragmented IDs and before/after correctness checks. Core timings do not establish input-to-screen latency or a production memory limit.

## Logical text comparison

Visible, stable text blocks now use bounded receive comparison even when the document has movement history or required-child rules. The receiver finds the current logical parent, verifies projected membership, and compares at most eight text blocks. Ordinary flow paths avoid the complete token-location scan; private storage paths still resolve through it.

A sequential before/after/after/before run compared baseline `84fa81d` with the updated source. Each case used 5 warmups and 30 samples on Node 22.19.0. These are separate per-run p95 values in milliseconds, not pooled percentiles.

| 100,000-character remote text insert | Before 1 | After 1 | After 2 | Before 2 |
|---|---:|---:|---:|---:|
| Prior block move | 95.088 | 14.220 | 12.827 | 81.507 |
| Required-child rule | 35.144 | 2.061 | 1.904 | 26.413 |

Whole-model reads dropped from two to zero per eligible change. Every model/mirror check passed with zero fallback. Network, native conversion and DOM work are excluded. External desktop load varied; no test/build job or active comparison-editor page overlapped timing. This is not a screen-latency or product SLO claim.

Automatic text storage, hidden content, structural batches, old-clock insertion, references to new tokens in the same Change, and nine or more blocks retain full comparison. Structural projection and Slate/Lexical tree conversion still have costs. CRDT conflict, history, child projection, snapshot and GC rules are unchanged.

[Source hashes, raw samples, control cases and reproduction commands](https://github.com/barocss/doc-sync/tree/main/benchmarks/results/logical-text-scopes-2026-10-24) describe the measured source and proof boundary.

## Structural event verification

For a document with more than eight top-level children, structural events can compare and verify a guarded window of at most eight top-level nodes. The receiver still reads the actual whole models before and after the change. It finds an identical prefix/suffix, includes stable boundary nodes, verifies the local patch, and translates its paths back to the document. The window includes complete nested subtrees. Full model reads, copying and structural projection remain.

Small documents, root child-count rules, top-level groups in the window or its boundary, large changed spans and windows without a stable text start retain whole-model comparison and verification. Nested group/child-count rules are processed inside their complete parent subtree. Existing whole replacement fallback remains if patch verification fails. Text identity, CRDT arbitration, deletion/formatting ownership, conditional history, snapshots and protocol are unchanged.

An independent sequential before/after/after/before run used baseline `d46db51`, Node 22.19.0, five warmups and 30 samples per case. These are separate p95 values in milliseconds for 100,000 body characters plus nested content:

| Structural receipt | Before 1 | After 1 | After 2 | Before 2 |
|---|---:|---:|---:|---:|
| Root split/join | 65.746 | 21.147 | 13.172 | 60.397 |
| Nested split/join | 56.563 | 5.453 | 3.617 | 51.190 |
| Block type | 66.485 | 14.468 | 14.082 | 55.572 |
| Cell split/join | 56.965 | 3.663 | 3.746 | 47.239 |
| Table row insert/delete | 68.679 | 15.695 | 15.639 | 62.634 |
| Cell merge/split | 68.858 | 17.323 | 16.221 | 62.262 |

All timed changes passed full event-mirror/model assertions with zero fallback. Timing covers synchronous receipt through the callback, excluding network, native conversion, DOM and correctness checks. Diagnostic wrappers run outside the timing samples. No tests/build or active comparison page overlapped timing; external desktop load remained uncontrolled. Root-list and root-cardinality controls retain full verification and varied across runs. No improvement is claimed for those controls or for every structural document. No screen-latency or product SLO result follows from this measurement.

[Raw samples, diagnostic phases, controls, source hashes and reproduction commands](https://github.com/barocss/doc-sync/tree/main/benchmarks/results/structural-events-2026-10-24) describe the exact scope. The earlier figures below keep their original measured source.

## Capability baseline before scoped comparison

The capability baseline at `84fa81d` added bindings and document capabilities. It did not establish a general performance improvement. A sequential before/after/after/before comparison used Node 22.19.0, 5 warmups and 30 samples per case. The baseline was `ce42144`. Some plain-document paths regressed, and structural tails varied under high external desktop load.

A separate baseline-only remote-receive run measured the following p95 times. Text rows insert one character; the field row updates one declared leaf. Timing ends at the model-event callback and excludes network, native conversion and DOM work.

| 100,000-character workload | p95 ms | Full-model reads per change |
|---|---:|---:|
| Plain document, text insert | 0.999 | 0 |
| Document with a stored annotation, text insert | 1.346 | 0 |
| Document with minimum child count, text insert | 25.484 | 2 |
| Document with a prior block move, text insert | 88.828 | 2 |
| Declared field update | 49.793 | 2 |

All mirror checks passed with zero fallbacks. In that baseline, moved and required-child documents used full-model comparison to preserve logical placement and projection rules. Eligible text changes now use bounded comparison as described above. These synchronous costs can cause visible delay. The annotation row does not measure annotation reads or rendering. Slate and Lexical also scan/rebuild the native tree on receipt. No new browser-latency or product SLO claim is made.

[All comparison runs, raw samples and reproduction commands](https://github.com/barocss/doc-sync/tree/main/benchmarks/results/document-capabilities-2026-10-24) include both improved and regressed results. The scoped text improvement above addresses that measured path; automatic storage and structural workloads remain separate.

## Structural cache measurements

The 2026-10-23 structural workload used a 100,000-character main document and 600 characters in nested content. Each scenario had 5 warmups, 30 timing samples, and 2 separate mark-read diagnostics. Timing ran from remote receipt through the model-event callback; it excluded network and DOM work.

| Scenario | Before p95 ms | Final p95 ms | Before repeat p95 ms |
|---|---:|---:|---:|
| Main split/merge | 169.830 | 63.493 | 198.613 |
| Callout split/merge | 292.377 | 62.117 | 179.840 |
| Main block type | 160.939 | 115.216 | 160.756 |
| Cell split/merge | 183.373 | 46.512 | 156.163 |
| Table row insertion/deletion | 214.140 | 72.644 | 162.050 |
| Cell merge/split | 226.743 | 101.239 | 167.302 |

Before the change, every scenario reread marks 100,600 times. The final implementation reread 0–160 marks. It invalidates affected lines and reuses text blocks only after checking marker, type, attributes, character order, and absorbed markers. It still scans structural boundaries and retains full structural event verification.

## Browser results include a tail-latency regression

Headed Chrome used 100,000 characters in 625 paragraphs, alternating trusted Enter and Backspace events. Each direction had 6 warmups and 30 timing samples. Timing ended after both expected DOMs and a second animation frame; it did not measure physical display output.

| Direction | Before p95 ms | After p95 ms | Before repeat p95 ms | After repeat p95 ms |
|---|---:|---:|---:|---:|
| Demo → PM | 601.7 | 771.1 | 605.2 | 467.3 |
| PM → demo | 598.0 | 435.5 | 553.3 | 452.9 |

Median latency decreased in both updated runs. The first demo-to-PM p95 increased, and its cause is not isolated. The repeat does not erase that result. External desktop load also differed. These measurements confirm less paragraph recomputation; they do not establish consistent screen p95 improvement or an approved SLO.

## Reproduce

```sh
node benchmarks/structure.ts --chars 10000,100000 --samples 30 --out /tmp/new-structure.json
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm run typecheck
```

Use a new output path. Do not overlap timing with other test jobs. Keep raw samples, source hashes, and rejected candidates.

[Full report and raw data](https://github.com/barocss/doc-sync/tree/main/benchmarks/results/structural-cache-2026-10-23) · [Roadmap status](https://github.com/barocss/doc-sync/blob/main/docs/roadmap-status.md)
