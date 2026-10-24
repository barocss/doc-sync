---
work_id: logical-text-scopes
artifact_type: performance-report
status: done
owner_role: integration
source_request: Reduce full comparison for moved and required-child documents without changing collaboration rules.
last_updated: 2026-10-24
---

# Logical text receive comparison

Visible stable paragraphs now use bounded text comparison in documents with movement history or child-count rules. At 100,000 characters, the two baseline p95 results were 81.507–95.088 ms for moved documents and 26.413–35.144 ms for cardinality documents. Updated p95 was 12.827–14.220 ms and 1.904–2.061 ms respectively. Whole-model reads fell from two to zero per received change in both workloads. Every mirror check passed with zero fallback.

## Behavior and limits

The receiver resolves the affected physical paragraph to its current logical parent, then checks membership in the projected visible blocks. Joined physical fragments use the complete location resolver. Ordinary flow paths already identify logical blocks; only private required/fragment storage paths need redirection. At most eight visible stable text blocks are compared. Existing per-block diff, mirror verification and whole replacement fallback remain.

Automatic text storage can appear/disappear beside other text, so it stays on full comparison. Hidden cells/overflow, inline-node mutation, structural changes, undo restoration, old-clock insertion, references to newly created tokens in the same Change and nine or more blocks keep the full path. A structural batch is not partially narrowed. CRDT application, placement/cycle projection, child-count rules, history ownership, snapshots, GC and wire protocol are unchanged.

This removes full model comparison for eligible text changes. It does not eliminate structural projection, physical block lookup or native tree conversion. Moved-document time remains greater than plain text time. Declared field updates are outside this optimization and still read the whole model.

## Method

Baseline: `84fa81df7ff2288551fd33285dd6f3f2fa2de781`. Node 22.19.0. Fixed `benchmarks/capabilities.ts`; five warmups, 30 samples per case; sequential before/after/after/before processes. Baseline imports resolve into a `git archive` tree. Each process uses its own measured tree as cwd, so baseline raw source hashes match baseline Git blobs. Updated source hashes match the final measured runtime. Samples cover remote text insertion; `field-write` is a different control operation. Annotation reads are not timed.

Timing runs from synchronous change receipt to model-event callback. It excludes initialization, network, native editor conversion, mirror verification and DOM work. No test/build job or active comparison-editor page overlapped timing. External desktop load remained nonzero: one-minute load went from 17.88 to 12.88. Values below are p95 from each separate run, not pooled percentiles. Do not infer an approved product SLO or a universal screen latency improvement.

| Characters | Mode | Before 1 p95 | After 1 p95 | After 2 p95 | Before 2 p95 |
|---:|---|---:|---:|---:|---:|
| 10000 | plain | 0.916 | 0.682 | 0.654 | 0.667 |
| 10000 | moved | 10.913 | 1.955 | 1.691 | 7.706 |
| 10000 | cardinality | 4.230 | 0.941 | 0.631 | 2.662 |
| 10000 | annotations | 0.800 | 0.700 | 0.674 | 0.378 |
| 10000 | field-write | 5.640 | 5.064 | 4.028 | 4.795 |
| 100000 | plain | 1.060 | 0.937 | 1.115 | 0.903 |
| 100000 | moved | 95.088 | 14.220 | 12.827 | 81.507 |
| 100000 | cardinality | 35.144 | 2.061 | 1.904 | 26.413 |
| 100000 | annotations | 1.862 | 1.134 | 1.137 | 1.419 |
| 100000 | field-write | 60.942 | 44.108 | 61.797 | 48.961 |

All ten rows in all four runs passed model assertions with zero fallback. Plain and annotation controls retained zero full-model reads; field writes retained two. The separate exploratory before/candidate files are preserved. `candidate-1` removed blanket comparison but still used a complete location scan. `candidate-2` added direct physical/logical resolution. `diagnostic-abba/` is retained because its baseline self-reported source hashes used the wrong working directory; its times are not used for the final claim. The corrected `abba/` run has verified baseline hashes.

## Reproduce

Run from the repository root with Node 22.18 or later:

```sh
node benchmarks/results/logical-text-scopes-2026-10-24/run.mjs --out-dir /tmp/doc-sync-fresh-logical-abba
node --test packages/doc-sync/test/remote-logical-scopes.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
```

Use a fresh output directory. Do not overlap performance runs with other tests. Chrome regression and isolated required-schema browser evidence are recorded in validation.json and HANDOFF §5.20. The required browser fixture can be rebuilt with `browser-fixture.mjs --receipt <fresh-path>`; it uses an isolated demo schema with minimum two paragraphs and the current library source. It does not change fixtures/demo-schema.ts or user data. Actual OS IME remains NOT EVALUATED.
