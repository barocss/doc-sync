# Direct Doc control regression analysis

Disposition: UNRESOLVED_CAUSE. The prospective performance result remains FAIL.

No new timing was run. No source, candidate, benchmark, test, old report, or acceptance gate was changed. Cycles 2 and 3 remain NOT_RUN. All diagnostic writes are confined to the assigned new analysis directory and report/final files.

## Finding

The new Doc/Line/Placement WeakMap registrations do **not** execute inside the exact 100k remote-apply interval. The actual remote path runs the same callable entry counts on the archive and frozen candidate. The evidence does not prove whether the measured regression is caused by indirect runtime effects or uncontrolled variation. It does not justify a code fix or a performance pass.

The original failed cell remains:

| Metric | Original result |
| --- | ---: |
| Baseline pooled median | 2.188646 ms |
| Candidate pooled median | 2.2744375 ms |
| Change | +3.9198436% |
| Allowed candidate median | 2.25430538 ms |
| Candidate minus baseline | 0.0857915 ms |
| Result | FAIL; strict 3%; no absolute allowance |

The analysis recomputes the same pooled medians from all ten preserved samples in each lane. It removes no sample, changes no statistic, and does not pool later cycles.

## Untimed exact-path evidence

`control-regression-analysis/count-child.mjs` runs one archive child and one candidate child. It recreates the exact 100k fixture and uses the preserved driver's schema and 16 edits. Source hooks count callable entries by phase. The diagnostic imports no stopwatch, records no duration, and runs no benchmark warmup/sample loop. It is structural evidence only.

Both executions match the original operation, model, and full snapshot hashes:

- Operations: `2a70fca01e2b2c0303df062330e29bc1f50d7186d3a39b119115e633d8fb0f06`
- Model: `9ce16cf91b49b90623ce741d86ece1a6760c56ab742f0924de3997c5ae2306ff`
- Snapshot: `281084acbf6dc39dbe744b0a623bd82401b9d392f61011d263db32e8142c9a6c`

The remote loop executes 16 public `Doc.apply` calls: eight text operations insert 40 UTF16 units; eight deletions remove eight existing units. Both lanes execute **28 callable definitions and 1,176 total callable entries**, with exactly equal counts. `Doc.apply`, `integrate`, `charAdded`, `charRemoved`, `Clock.observe`, KeyIndex get/set/find/join, and their selected helpers retain the same source-token bodies.

Twenty-seven of the 28 reached whole callable bodies match. `Doc.get` differs because its implicit-storage allocation branches now wrap new Lines with `rememberLine`. That function is entered 88 times in this remote path, but `rememberLine` is entered zero times. Thus its new line-registration instructions are not reached. This whole-function difference still prevents a claim that generated machine code or JIT choices must be equal.

| New or changed site | Remote interval calls | Where observed instead |
| --- | ---: | --- |
| Doc constructor / `docAllocations.set` | 0 | Seed 1; restore 2 |
| `rememberLine` / `lineArrays.set` | 0 | Seed 1; restore 4 |
| Placements constructor / records registry | 0 | Seed 1; restore 2 |
| Defining-module `captureSurface` | 0 | Module import 9 |
| Doc snapshot certificate path | 0 | Snapshot calls occur in seed/oracle; no active audit |
| `originalDataDispatch`, source/array/wrapper guards | 0 | Never called in this direct document fixture |
| Private Data shape, metadata, eligibility, preflight | 0 | Never called |
| Engine schema factory | 0 | Never called; engine is not imported |
| Doc.edit private-point check | 0 | Seed/local edit only |

The candidate additionally imports `crdt/private-data.ts`, `crdt/schema-version.ts`, and `data/schema.ts` during module load. Registries and those imports can alter pre-interval runtime state. This analysis neither measures nor attributes such indirect effects. Zero registration calls inside the remote interval does not rule out heap/GC/JIT/code-layout effects established outside it.

Evidence: `baseline-counts.json`, `candidate-counts.json`, and `structural-comparison.json` in the new analysis directory. The comparison stores each reached callable's token-body hash and every phase count. Hooks affect the diagnostic process, so its counts must not be treated as timing evidence or a perfect profile of optimized code in the prior uninstrumented process.

## Preserved process observations

`analyze-receipts.mjs` read and hash-checked all 24 preserved process receipts. All 24 have process/oracle/source checks PASS and unchanged per-process source closures. The four Data groups and fallback group retain PASS; the direct Doc group retains its remote-apply FAIL. All five measured samples for every scenario are preserved in `existing-observations.json`, with process order, host load, resource totals, and original gate result.

The failed Doc group's raw remote values, in the original A-B-B-A order, are:

| Process | Five raw samples, ms | Process median, ms |
| --- | --- | ---: |
| A1 | 2.030375, 2.018542, 2.182833, 2.194459, 2.112750 | 2.112750 |
| B2 | 2.098709, 2.247458, 2.478959, 2.064500, 2.754541 | 2.247458 |
| B3 | 2.312375, 2.301417, 2.221500, 2.052083, 2.814333 | 2.301417 |
| A4 | 2.370416, 2.081417, 2.262875, 2.335583, 2.280708 | 2.280708 |

These descriptive process medians do not replace the predeclared pooled-lane median. A1 to A4 changes +7.9497%; B2 to B3 changes +2.4009%. The same baseline source also changes +16.8510% in its process local-edit median. Both candidate processes have their highest remote value in sample 5. The pattern is not a consistent monotonic warmup improvement.

Host one-minute load around the four Doc processes ranges approximately 10.00 to 10.66. A4 records 8,411 process-wide involuntary context switches, versus 3,874/3,948 in B2/B3 and 4,444 in A1. These totals cover the entire process, including restoration and oracles; they do not locate a switch inside any failed interval. Load is host-wide and time-averaged. No per-interval CPU scheduling, GC, deoptimization, or JIT event telemetry was recorded. The two warmups retain hashes but no raw timing values. Therefore neither drift, JIT, GC, host load, nor noise is a proved cause. The observed variability does not invalidate or waive the FAIL.

## Bound and next step

No directly executed metadata overhead was found in the failed remote interval. No bounded source isolation change is supported by this evidence. In particular, changing WeakMap registration solely to repair this cell would be a speculative fix. Preserve the current failure and frozen source. Any later diagnostic experiment or new prospective candidate needs parent authorization; it must retain this receipt and use its own declared scope. This analysis grants no retry-until-pass loop, gate relaxation, promotion, or release approval.

Source preservation was verified after the diagnostic:

- Production/archive: 69 files, closure `8b532beb32d4ef0e7d69e54ac9a989d269d0c590e11d6ef8f3f0545b362c4a51`.
- Frozen candidate: 70 files, closure `d6106051dccaac969849fac5ef24199690ccddf7a452cdeccdcc94606149d3ab`.
- Original timing summary SHA-256: `2f3bc2cc3f51dc7752fc626d7032a09dd018c7124161233498df7333c84676f4`.

`control-regression-analysis/hashes.json` binds all diagnostic scripts and receipts. Source closure format is SHA-256 of sorted `file_sha256 + two spaces + relative_path + LF` entries. No Git, browser, mobile, further agent, or heavy timing run was used.
