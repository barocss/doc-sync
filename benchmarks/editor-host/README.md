# EditorHost H0/H1 performance gate

Run from the host worktree with Node 24.22.1. The target must have current compiled packages and peer dependencies. The harness imports the target dist and resolves PM peers from that target; it does not import source TS or use the invoking worktree's PM classes.

```sh
node benchmarks/editor-host.mjs --target=/absolute/frozen/root --output=/absolute/evidence/counts.json
node benchmarks/editor-host.mjs --target=/absolute/frozen/root --mode=timing --output=/absolute/evidence/self-abba.json
```

Defaults: 10,000 and 100,000 ASCII characters, 100-character paragraphs, actors seed/A/B, two warmups and eight recorded observations per scenario per block. Timing uses A/B/B/A repeated three times: 12 fresh-client blocks, 96 observations per size/scenario. In self-control mode A and B both run the same frozen runtime. A future candidate comparison must retain this harness hash, schedule, fixtures and invariants. Block p95 with eight samples is the block maximum; this small sample budget is explicit and does not establish tail percentiles for production.

The harness executes real SyncClient and PmBinding dispatch for local insert/delete/mark and selection. Presence measures pull plus headless decoration resolution. Remote receipt prepares real sender Ops before timing and delivers 1/2/8 text scopes or a paragraph split. Composition uses real InputSession begin/edit/end and one final PM pull. It does not measure browser native input, OS IME or paint.

Each observation checks core/PM model equality outside timing. Local edits also use an independent model-edit expectation. Remote edits match the sender model. Pending changes, generated Op arrays, History availability, composition's single group, and zero fallback are checked. Counts wrap Doc.snapshot/fromSnapshot/toJSON and PM Node.fromJSON (including recursive child calls). Selection and presence require zero model reads/conversions; ordinary edits require zero snapshots/restores. Composition requires exactly one fork. Eligible remote text receipt requires zero whole-model reads before the PM model callback; the PM pull itself can read/convert once. Setup, sender Op generation and correctness checks are outside timing.

Reports retain raw samples, counts, semantic hashes, compiler/dependency paths and versions, complete source/dist file hashes before/after, and harness hash. A target mutation fails the run. Control fixes a per-scenario investigation guard at max(10% of median A block p95, 0.25 ms). This is a regression investigation threshold, not a product SLO or a statistical equivalence claim. External OS workload can remain and must be disclosed. Do not overlap these runs with native/Rust/full regression suites.

After H0 capture, a runner-only `--schedule=A` / `--schedule=B` selector was added so an external runner can interleave the frozen baseline target and the final candidate target without repeating 12 blocks per turn. Use A/B/B/A x3 across target processes. Scenario preparation, timing, counters, warmups, repetitions and verification did not change. The exact H0 program is preserved in `output/editor-host-evidence/frozen-baseline-harness.mjs`; its SHA is in the H0 reports. Final A/B reports share the new harness SHA. Single-label runs omit the within-process self-control summary; the cross-target runner must calculate it from combined rows and use the already frozen H0 thresholds.

Final paired comparison (wait until both target builds are complete; run without other heavy suites):

```sh
node benchmarks/editor-host/compare.mjs --baseline=/absolute/frozen/root --candidate=/absolute/candidate/root --thresholds=/absolute/evidence/frozen-thresholds.json --output=/absolute/evidence/cross-target-abba
```

The runner retains 12 raw reports and `comparison.json`. It checks stable per-target source/dist hashes, identical current harness SHA, semantic invariants and no count increases. It reports a fixed-guard exceedance as `INVESTIGATE_PERF`; existing baseline noise remains explicit even when candidate values are within the guard.

The first candidate comparison exposed a harness error: raw History snapshots contain `undo`/`redo` group `at: Date.now()` metadata. Hashes from separate runs differ even when History source and all semantic state are identical. The current harness removes only each top-level undo/redo group's `at` before hashing. It preserves group order, steps, carets, typing, tickets and all CRDT state. This normalization runs outside the timer. The first-failure raw reports are retained; baseline and candidate counts were rerun with the same corrected harness before paired timing. Original H0 thresholds remain frozen.
