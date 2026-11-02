# Slate input tail investigation

The performance status remains **INVESTIGATE**. These bounded diagnostics explain a newly captured GC tail. They do not prove the cause of the original Node or Chrome spikes, and do not replace the original guards. No runtime change was made.

## Retained acceptance boundary

The [original report](../unified-client/report.md) and raw receipts remain unchanged:

- Native Node comparison: **15/16 guards pass**. Slate 10k insertion median improves 1.333 → 0.947 ms, while p95 increases 2.123 → 4.481 ms. Candidate B2/B3 first measured samples are 4.962/4.481 ms. Those receipts have no GC or JIT trace.
- Chrome comparison: **59/64 guards pass**. Five local 10k p95 flags remain: PM → Slate and Slate → each of the four targets. All medians, 100k cells and sync cells pass their original guards.
- Node guard: median increase at most max(10%, 0.1 ms), p95 increase at most max(15%, 0.2 ms). Chrome DOM guard: median max(10%, 1 ms), p95 max(15%, 2 ms). No guard changed.

Eight samples make nearest-rank p95 the maximum. Pooling 24 samples makes it the second largest. The original Chrome five flags arise from two input events: one PM input delays the Slate target; one Slate input delays all four targets. They are not five independent latency events.

## Fixed diagnostic scope

The first stage used exactly **A-B-B-A four Node captures** with GC/JIT tracing, per-stage times, heap and process CPU usage. The second stage used exactly **one Node CPU-profile A/B pair**, then **one Chrome legacy/unified trace pair** for local 10k, all four sources, two warmups and eight samples per source. No capture was added because of a measured result.

All Node captures retain the same full 16-cell fixture order, native operations, operation cloning, fixed model and native-projection oracles, one history group and undo/redo checks. The trace stage passes 64/64 such cells; the CPU pair passes 32/32. The Chrome pair completes 80 trusted insertions including warmups, verifies all four models and DOM views, and restores text with undo after each input. Page error and warning checks pass.

**Every new timing is diagnostic only.** Observer, tracing, inspector, markers and sampling overhead can change allocation and JIT behavior. The new Chrome comparison has zero crossings in its 16 traced cells, but does not establish acceptance or erase any original flag. No forced GC, extra warmups, dropped samples, threshold adjustment or acceptance rerun was used.

## Node findings

The four GC/JIT trace captures do not reproduce the original candidate spike. Candidate first measured inputs take 1.611/1.828 ms. Synchronous native Transform work takes 0.118/0.200 ms; callback microtask flush takes 1.491/1.626 ms. Flush includes binding work and must not be described as idle waiting. Every first measured input overlaps compilation activity, but this proves activity, not its time contribution. No candidate measured input overlaps GC in this first stage. Baseline A2 has a 2.595 ms sample with a 1.050 ms minor GC.

The CPU pair then captures a candidate **5.395 ms** first input. In the same `performance.now()` clock domain, a **3.788 ms major GC** starts at 305.403 ms inside input 304.852–310.248 ms. Native Transform takes 0.155 ms and callback flush takes 5.234 ms. GC therefore explains most of this captured spike. Candidate sample 1 also overlaps a 1.053 ms minor GC, and sample 5 overlaps a 1.447 ms minor GC. The remaining candidate measured inputs take 0.818–1.090 ms without overlapping GC.

The candidate first measured fixture starts with 57.45 MB heap, reaches 91.61 MB before input and falls to 40.64 MB after its major GC. Non-GC candidate input samples increase net heap by about 1.5–1.6 MB. Fresh fixture/oracle preparation can leave substantial heap pressure before the timed action. The records do not identify which allocation scheduled collection. A reused-editor benchmark would answer a separate steady-state question and must not replace the retained fixture result.

The driver's operation clone costs 0.006–0.016 ms and runtime commit costs 0.010–0.047 ms in the CPU candidate capture. Neither explains a several-millisecond tail. Operation evidence was retained.

The CPU profile includes schema/model conversion and equality work in the Slate callback. Source inspection confirms full `fromSlate` conversion and JSON-based `sameModel`; the single native text helper converts and validates only its changed block. These operations protect model/native consistency and operation ownership. This bounded profile does not show that one is unnecessary or that changing it would fix the tail. No Slate source or regression test was changed.

Inspector and `process.hrtime` use different macOS monotonic clock domains. Five empty inspector captures bracket the offset; they are clock calibration, not benchmark repetitions. The common bracket is 0.790 ms wide. Conservative input attribution contains 35 samples for the candidate first input, 31 labelled garbage collector. Exact pause duration comes from PerformanceObserver in the input clock domain and does not depend on this calibration.

## Chrome findings

The saved traces contain V8 CPU samples, DevTools timeline events and input/DOM timing marks. Their frozen served bundle is archived. The following target-Slate values are observations under instrumentation:

| Source → Slate | Legacy median / p95 | Unified median / p95 |
|---|---:|---:|
| ProseMirror | 6.5 / 7.3 ms | 5.9 / 6.2 ms |
| Slate | 5.7 / 6.4 ms | 5.8 / 6.6 ms |
| Lexical | 5.9 / 10.1 ms | 5.3 / 7.6 ms |
| Tiptap | 6.1 / 6.9 ms | 6.0 / 7.1 ms |

The original unified 9.6/9.7 ms PM/Slate events do not recur in this pair. Legacy also has a 10.1 ms Lexical-source tail. It has no overlapping main-thread GC. Unified's largest Slate-source observation is 6.6 ms and also has no overlapping GC. A separate unified Slate input overlaps a 0.380 ms minor GC. Browser tail behavior cannot be attributed uniformly to GC from these records.

For the largest Slate-source observation, the CPU stacks include Slate's change handler/push and React work in both routes. Legacy has 80 CPU samples: 24 include the Slate change handler and 43 include React `performWorkOnRoot`. Unified has 66 samples: 21 include the change handler and 33 include that React root function. These are stack-presence counts and overlap; they are not additive durations. React development functions are present in the frozen demo bundle. This is evidence of binding plus React work in the observed interval, not evidence of a new Client-only path or a production React performance claim.

DOM timing starts at trusted `beforeinput` and ends when a MutationObserver reads the expected full DOM text. It includes synchronous work, callback scheduling and whole-text comparison. The two RAF callbacks indicate rendering opportunities. They do not measure physical display. No OS IME, network, sync-mode, 100k or broad product acceptance claim is added by this narrow pair.

## Artifacts and source identity

[summary.json](summary.json) retains every original flagged comparison and the bounded results. [manifest.json](manifest.json) records source identities, script hashes, original byte hashes, compressed hashes and sizes. All 31 raw/derived local evidence files are archived under `raw/` as deterministic gzip files, including Node JSON/logs, CPU profiles, clock calibration, Chrome traces, receipt and served bundle bytes. The uncompressed files also remain in the local output directory.

Baseline source is `0bc37f9af7ed41b2d268ebff51bc0e75e5b69f46`; candidate distributions were built for checkpoint `409ee2abc5add5bf611b7070fe90da39bc484f39`. Node before/after fingerprints are unchanged within each capture. These measurements finished before the later local save/restore build. That separate feature build does not replace the identities in these receipts.

The diagnostic scripts are `benchmarks/native-input-tail-diagnostic.mjs`, `benchmarks/native-input-tail-cpu-diagnostic.mjs` and `benchmarks/chrome-input-tail-diagnostic.mjs`. Use their archived commands and artifacts to inspect this result. Do not use their instrumented timing or inherited comparison output for acceptance.
