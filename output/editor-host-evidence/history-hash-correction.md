# First-failure correction

The first candidate count run passed all runtime count assertions. Its comparison failed only `historyHash` in all 20 size/scenario pairs. Model hash, generated Op hash, pending, PM stats, event stats, eligible remote core reads and all operation budgets matched.

`History.snapshot()` copies each undo/redo group, including `at: Date.now()`. This field changes between runs. History source is unchanged between roots. See frozen main `packages/doc-sync-core/src/crdt/history.ts` lines 339 and 430-448. The raw first failure remains in `candidate-counts-first-failure-raw-history.json` and `first-failure-raw-history-diff.json`; H0 original raw hashes remain in `baseline-counts.json`.

The corrected harness deletes only `at` on top-level `snapshot.undo` and `snapshot.redo` groups, outside the timing region, before hashing. All semantic fields remain. Baseline and candidate count runs with this same harness passed with no differences. Harness SHA256: `d24b3d029fc45e00087f9df192982994533510463ebacc3eed22da1c7ae016b1`.

Original H0 timing thresholds remain unchanged. Candidate cross-target timing uses the same corrected harness for both targets.
