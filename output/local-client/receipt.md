# LocalClient native bindings and offline PM performance

Scope: Node 24.22.1; real headless ProseMirror, Slate, and Lexical bindings. No browser paint, DOM typing, OS IME, or network synchronization claim. No transport connects in the local tests or benchmark; inert baseline transport invocation counts remain zero.

## Native binding proof

Root executed the built-dist test file `packages/doc-sync/test/local-host-bindings.test.ts`: 4/4 PASS, exit 0, log `/tmp/doc-sync-local-bindings.log`.

- PM native input, external client edit, token selection, undo and redo preserve fixed expected text/model.
- PM multi-step transaction combines multiple apply batches into one commit/history group; empty apply is inert; own commit does not trigger a native remote pull.
- Actual Slate and Lexical composition drafts remain private, preserve a same-actor external live edit, retain native selection, and undo the full composition as one group while preserving the external edit.

## Frozen baseline and counts

Baseline: `/Users/user/github/doc-sync`, HEAD `12da94d`; candidate: `/Users/user/github/doc-sync-local`, same starting HEAD. Baseline archive hashes 136 dist files in core, ProseMirror, Slate, Lexical, and facade packages. All 68 pre-existing JavaScript files in that archive are byte-identical in candidate. These counts do not include every repository dist file.

Count runs: baseline Sync 16/16, candidate Sync 16/16, candidate Local 16/16 PASS. Common model and generated-operation hashes match. Ordinary insert/delete/mark/selection add zero snapshots/restores and no extra model/PM conversion calls. Existing ordinary input performs model/PM conversion; this work does not remove it. At 100k characters, insert/delete use one Doc.toJSON and 2001 recursive PM fromJSON calls, mark 2003; selection uses zero. Composition uses one snapshot/restore in all targets. Local ordinary input does not echo into the mounted host.

## Declared timing budget and results

Budget declared before candidate measurement: investigate median regression above max(10% baseline, 0.1 ms), or p95 above max(15% baseline, 0.2 ms). No budget changes were made.

Original full runs use the same harness hash, 10k/100k ASCII content, 3 blocks, 3 warmups and 10 measured samples per block. Scenarios: native insert/delete/mark/selection, host composition, external public edit, undo, redo. Each sample starts from an independently seeded document. Verification is outside the timed interval. External baseline applications explicitly pull the binding; LocalClient notifications pull it automatically.

- Original baseline versus candidate Sync and Local: 18/32 pairs PASS; 14 INVESTIGATE. Seven flags occur in byte-identical Sync control. Original raw scores are retained in `timing-comparison.json`; they are not an all-PASS timing gate.
- Same-process full ABBA diagnostic, unchanged benchmark: baseline A1 / local B1 / local B2 / baseline A2, instrumentation restored between blocks, all raw samples retained. 14/16 pairs PASS. Flags: 10k redo p95, 100k delete median. The other original Local flags do not persist in this run.
- Focused same-process ABBA profiling of those two cases: 20 warmups + 100 measured repetitions per block, 200 retained samples per backend/case, profiler enabled equally. Both PASS with the unchanged budget. Redo10k baseline/local p50 1.932/1.916 ms, p95 2.285/2.304 ms. Delete100k p50 1.722/1.681 ms, p95 1.897/1.808 ms. This repeated-input diagnostic excludes fresh-fixture setup and is narrower than the original run.
- Sampled local wrapper direct CPU hits are small: redo 3/368 and 1/301 samples; delete 2/363 and 0/355. No persistent Local-only source hotspot was established. No production source change was made from the noisy timing flags.

Conclusion: semantic/native/count parity PASS; existing Sync JavaScript parity PASS; full-run timing retains investigation flags. Paired diagnostics and focused profiles did not reproduce a persistent Local-only regression. Do not present this as zero overhead or as a full all-PASS timing result.

The first attempted timing run exhausted the default heap because the harness did not yield between closed fixtures. The harness was corrected to yield outside the measured interval, then all final baseline/candidate counts and timing runs used that same final harness. The aborted run produced no valid timing report.

## Artifacts

- `baseline-dist-freeze.json`, `old-js-parity.json`
- `baseline-sync-counts.json`, `candidate-sync-counts.json`, `candidate-local-counts.json`, `counts-comparison.json`
- `baseline-sync-timing.json`, `candidate-sync-timing.json`, `candidate-local-timing.json`, `timing-comparison.json`
- `diagnostic-A1-baseline.json`, `diagnostic-B1-local.json`, `diagnostic-B2-local.json`, `diagnostic-A2-baseline.json` (separate-process ABBA retained)
- `paired-abba.mjs`, `paired-{A1,B1,B2,A2}.json`, `paired-{A,B}-aggregate.json`, `paired-comparison.json` (same-process full ABBA)
- `focused-profile.mjs`, `focused-profile.json`, `profile-*.cpuprofile`, `profile-summary.json`

Reusable commands:

```
node benchmarks/local-client.mjs --target=/path/to/worktree --backend=sync --mode=counts --output=output/local-client/run.json
node benchmarks/local-client.mjs --target=/path/to/worktree --backend=local --mode=timing --reps=10 --warmups=3 --blocks=3 --output=output/local-client/run.json
node benchmarks/local-client.mjs --compare=baseline.json,candidate-sync.json,candidate-local.json --output=output/local-client/comparison.json
```
