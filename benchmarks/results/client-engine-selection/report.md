# Selected TypeScript client engine

## Scope

This comparison checks the D1 client/engine boundary against main commit
`dafe2c762a205f4570e3e9cbefc008befd5b866c`. The candidate explicitly selects
`typescriptClientEngineFactory`. It does not compare TypeScript with Rust or
WASM and does not qualify a production release.

The host is an Apple M3 Max with 14 logical CPUs and 36 GiB memory, macOS arm64,
Node 24.22.1 and Google Chrome 156.0.8078.74. Other local applications remain
running. Task-owned correctness jobs finish before timing starts.

## Method

The Node headless ProseMirror workload covers insert, delete, marks, selection,
presence, remote batches of 1/2/8 operations, composition and remote structure.
Documents contain 10,000 or 100,000 UTF-16 units in 100-character paragraphs.
The controlled comparison loads both versions in one Node process and alternates
execution order. Each cell uses two warmups and eight observations per version.
Verification runs outside the timed action. CPU time is diagnostic; wall time is
the declared acceptance metric. The original standalone schedule labels are
self-controls, not cross-version A/B observations.

Chrome covers Word, Notion and presentation schemas with Slate, Lexical and
ProseMirror, plus 100,000 UTF-16 units per document. Each editor supplies two
warmups and eight native inputs. Receipt, DOM update and second animation frame
are separate observations. The latter is a rendering opportunity, not a
physical display measurement. A small-sample p95 is descriptive.

Before candidate measurements, the investigation thresholds were fixed:

| Metric | Increase that requires investigation |
| --- | --- |
| Node median | More than the larger of 10% and 0.1 ms |
| Node p95 | More than the larger of 15% and 0.2 ms |
| Chrome median | More than the larger of 10% and 2 ms |
| Chrome p95 | More than the larger of 15% and 4 ms |

A threshold crossing requires an isolated repeat and cause analysis. Functional,
operation, History, snapshot-count and fallback gates are independent of timing.

## Correctness and allocation

The original 20 size/scenario cells match baseline model, operation and History
hashes and all instrumented conversion counts. Ordinary edits add no snapshots;
composition retains its one draft fork. Eligible remote text events add no whole
model read before the binding callback. No covered event fallback is introduced.

Eight additional local ProseMirror split/join records match baseline operations,
History and model hashes. Snapshot/restore counts are 0/0 and toJSON count is 1,
matching baseline. These eight records are an additional counts-only gate.

Initial candidates failed these gates. Whole-inventory checks, repeated parent
path resolution, duplicate anchor resolution and detached proof for ordinary
marks and plain root split/merge were corrected. Path memoization is limited to
one selected-engine operation and invalidates on revision, token count or schema
change. Complex structural commands retain detached preflight; no constant-cost
claim is made for every schema or command.

## Timing decision

The selected engine's repeated parent scans, mark preflight copies and plain
split/join copies were removed. A further eight-operation receive regression
reproduced before the final fix. The client now prepares one owned, validated
batch before scoped reads and reuses that proof for application. Its deletion
ledger uses the batch actually applied. Invalid or stale captures reject safely.

The original fixed eight-observation runs are retained. Median wall times in ms:

| Size | Scenario | Baseline | Selected TS | Repeat baseline | Repeat selected TS |
| ---: | --- | ---: | ---: | ---: | ---: |
| 10,000 | insert | 0.523 | 0.587 | 0.417 | 0.450 |
| 10,000 | delete | 0.309 | 0.331 | 0.339 | 0.346 |
| 10,000 | mark | 0.376 | 0.402 | 0.415 | 0.486 |
| 10,000 | selection | 0.037 | 0.043 | 0.028 | 0.032 |
| 10,000 | presence | 0.114 | 0.150 | 0.120 | 0.111 |
| 10,000 | remote1 | 0.721 | 0.827 | 0.728 | 0.725 |
| 10,000 | remote2 | 0.989 | 1.068 | 0.905 | 1.014 |
| 10,000 | remote8 | 2.170 | 2.595 | 2.005 | 2.138 |
| 10,000 | composition | 12.216 | 12.499 | 12.353 | 12.185 |
| 10,000 | structure | 1.941 | 1.925 | 1.581 | 1.654 |
| 100,000 | insert | 2.078 | 2.226 | 2.058 | 2.026 |
| 100,000 | delete | 1.808 | 1.866 | 1.817 | 1.861 |
| 100,000 | mark | 2.038 | 1.917 | 1.790 | 1.792 |
| 100,000 | selection | 0.184 | 0.187 | 0.169 | 0.175 |
| 100,000 | presence | 0.689 | 0.674 | 0.657 | 0.636 |
| 100,000 | remote1 | 2.758 | 2.424 | 2.510 | 2.488 |
| 100,000 | remote2 | 2.858 | 2.798 | 3.205 | 2.954 |
| 100,000 | remote8 | 5.781 | 5.166 | 5.969 | 5.289 |
| 100,000 | composition | 134.394 | 137.881 | 133.269 | 130.992 |
| 100,000 | structure | 20.157 | 14.993 | 18.323 | 16.820 |

No identical median guard remained exceeded in both final full Node runs.
Individual guard crossings and p95 tails remain in the raw scores. A focused
32-pair mark check has median 0.335→0.346 ms and p95 0.512→0.462 ms. The 32-pair
remote8 check has median 2.267→2.353 ms, within the original 0.227 ms median
guard; its p95 is 3.751→5.595 ms. This tail remains reported. A final 128-pair investigation uses four independent
32-pair blocks with fixture/prelude resets. Pooled median is 2.164→2.263 ms,
within its 0.216 ms guard. Pooled p95 (rank 122 of 128) is 3.681→3.663 ms,
within its 0.552 ms guard. All four block medians are within guards; two block
p95 guard crossings remain recorded. GC observer overlap occurs in 10/128
baseline and 13/128 selected intervals; seven of seven and six of seven top
respective tails overlap a GC entry. This association does not establish a
cause, and one selected 4.201 ms tail has no observed GC overlap.

The original separate-server Chrome comparison against a fresh frozen baseline
crosses guards in **12 of 27 source/target cells**. A no-tracing default-engine
diagnostic also crosses guards in 12 cells, in different directions. Removing
the tracking Proxy alone does not explain the variation. These original scores
are not rewritten as PASS.

Same-Chrome two-tab paired checks locate the extra time in pre-receive and
post-DOM intervals, while synchronous commit/receive durations stay similar or
improve in the investigated cases. An additional client-isolation control uses
one fresh unchanged baseline backend and two symmetric proxy origins that serve
the respective frozen client bundles. Both clients have the same extra HTTP hop,
matching fixtures and alternating trusted native input. This controls the server
implementation and process lifetime; it is not the original deployment topology.

| Shared-backend check | Baseline | Selected TS | Result under original guard |
| --- | ---: | ---: | --- |
| Word, Slate→Lexical DOM median, 16 pairs | 49.3 ms | 43.3 ms | Within guard |
| Word, Lexical→Slate DOM p95, 16 pairs | 67.9 ms | 65.6 ms | Within guard |
| Notion, PM local rendering opportunity median, 64 pairs | 10.0 ms | 10.1 ms | Within 2 ms guard |
| Notion, PM local rendering opportunity p95, 64 pairs | 17.9 ms | 18.8 ms | Within 4 ms guard |
| Notion, PM local DOM median / p95, 64 pairs | 4.1 / 5.0 ms | 4.1 / 5.5 ms | Within guard |
| Notion, PM commit median / p95, 64 pairs | 0.3 / 0.5 ms | 0.3 / 0.5 ms | Within guard |

Additional exact controls cover every remaining original flagged cell:
Word PM local/remote rendering medians, Notion Slate→Lexical/PM tails,
Notion Lexical local rendering/commit and remote PM receive, and presentation
PM local rendering. Notion Slate gets a focused 64-pair repeat: Lexical DOM
p95 60.9→61.8 ms and PM DOM p95 65.5→66.1 ms, both within their original
relative/absolute guards. Source commit medians are 0.3 ms in both versions.
All 12 original flagged cells now have exact controlled coverage without a
persistent crossing under those conditions. Original separate-server scores
remain unchanged; the controlled topology does not replace that deployment.

For the Notion PM 64-pair check above, p95 is rank 61, rather than the sample maximum. Post-DOM frame
wait median is 5.8 ms in both versions; its p95 is 14.0→14.4 ms. Both pages have
the same bounded LongTask/LongAnimationFrame diagnostic observer. No overlapping
entries were recorded in the 128 measured intervals. This does not exclude
shorter work or identify a scheduling cause. Supplemental checks retain exact
model/convergence, trusted-input and source/hash gates.

**Decision:** selected-engine routing, regressions and conversion-count gates
pass. The pooled 128-pair Node control and exact controlled Chrome comparisons
qualify the investigated client migration. Two small-block Node p95 crossings
and all original separate-server Chrome scores remain in the report. General separate-server Chrome latency
acceptance remains open; this report does not claim that every original cell
passed, that tails disappeared, or that all product latency is qualified.


## Evidence and reproduction

Baseline receipts are in `output/d1-engine-selection/baseline` in the main
checkout. Candidate receipts, comparison helpers, initial failures and final
results are copied into `output/d1-engine-selection/after` in main; the isolated
D1 worktree also retains them. The source transfer and generated-file
qualification are in `output/d1-engine-selection/integration`. Restore the
baseline Git SHA and archived generated files before rerunning old baseline
helpers; the main working tree now contains the candidate implementation.
`final-browser/manifest.json` records the additional Chrome checks. These ignored
artifacts retain exact commands, workload adaptations, runtime hashes and raw
observations. HANDOFF section 5.104 records their integration status.

Run `npm run check:packages`, `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`, and
`npm run typecheck` with Node 24. The standalone headless gate is
`node benchmarks/editor-host.mjs --mode=counts`. For a selected browser client,
run `npm run dev:products` and open `?profile=word&engine=typescript`; replace
`word` with `notion` or `presentation` for the other profiles.

Actual OS IME, physical display latency, full Rust/WASM engines and mixed-engine
editing remain outside this result.
