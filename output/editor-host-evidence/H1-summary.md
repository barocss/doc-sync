# H1 performance evidence

Count and semantic gate: **PASS**. Full cross-target ABBA x3: **INVESTIGATE_PERF**. Overall performance: **UNRESOLVED**. This evidence applies only to H1 candidate aggregate `77828080f50189184ec464e5e8459de340c9f2bc581b7efd466d9b1eb6a1555f`; it must not be relabeled for later H2 changes.

Baseline aggregate: `7e382c5e759fa1a22008dee3478812a9063f8af9175bdd407375a56697252cd0`. Both roots stayed unchanged across all 12 turns. Current identical harness SHA: `d24b3d029fc45e00087f9df192982994533510463ebacc3eed22da1c7ae016b1`. There are 1,920 recorded full-workload observations; no samples were discarded.

The full run has zero semantic differences and no operation-count increases. Three of 20 fixed guards were exceeded: 10k mark +1.806ms (guard .25), 100k presence +2.202ms (guard .25), and 100k structure +8.470ms (guard 1.698). The other 17 pairs are within the guard. Original H0 self-control noise exceeded guards in 5/20 pairs and remains disclosed.

One bounded diagnostic repeat used only mark, presence and structure in ABBA x3 with the same frozen guards and all samples retained. All six size/scenario pairs were within guards. For the three original flags, deltas were −.044ms, +.062ms and −.174ms. This targeted workload has different allocation history and diagnostic trace overhead; it does not replace the original full-workload result or clear the gate.

Separate V8 GC traces and per-turn system process snapshots are retained. GC logs show major pauses of roughly 7–8.5ms and scavenge pauses around 2–3ms. However, calibration proved the raw V8 trace clock has a different origin from performance.now. The per-process offset was not captured during the targeted run. Exact per-sample overlap and GC causality are **UNPROVEN**. The original overlap draft is explicitly retained as `gc-correlation-INVALID-clock-alignment.json`; the current `gc-correlation.json` removes invalid overlap claims. Source audit found no mutation guard or extra model query in presence reads; it records only small stamp/status object allocation and equivalent resolver wrappers.

The first count comparison's only mismatch was a harness error: History group's Date.now metadata. Raw reports and diff remain. Only top-level undo/redo group `at` is removed for semantic hashing, outside timing. Both count and timing targets use the same corrected harness. All other fields remain compared.

H1 source/dist archive SHA256: `35590d9d347ed915d5f131f3c68410870d1f8a4b41f8ed26a94aec90ab43d171`. Archive validation reports zero changed files against the H1 count manifest. All timing is headless Node PM; it does not measure Chrome paint/native input or OS IME.
