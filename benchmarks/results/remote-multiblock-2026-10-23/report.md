# Remote model-event comparison across multiple text blocks — 2026-10-23

The baseline was main `6f15291156bf41521850cfe5b4b4ea2abeec24fa`. Final product changes were `sync/model-events.ts` and `sync/client.ts`. Remote comparison expanded from one TextBlock to at most 8 independent TextBlocks. Structure changes and 9 or more blocks keep the existing full path. CRDT application, History, token IDs, LWW, same-position Enter, deletion ledger, GC, transport, and public exports were unchanged. These changes were uncommitted.

## Measurement span and script

On Node 22.19.0, timing ran from synchronous event receipt to completion of the model-event callback. The callback stored the event. PM conversion, actual mirror application, network, server, DOM, and physical display were excluded. This does not establish UI performance or product G0/G1 status.

Documents had 10,000/100,000 characters and 160 characters per paragraph. Each Change affected 1, 2, or 8 distinct paragraphs. Document size stayed fixed within each size group; only changed-block count varied. Insertions added one ASCII character at `50+i` in each paragraph. Deletions removed one character at position 50. Formatting alternated Bold on 4 characters from position 50. Eight-block formatting targeted 32 characters, not the whole document.

Each size/block-count/operation case had 5 warmups and 30 measured samples. Run order was **before → final improvement → frozen baseline repeat**, with 18 cases per run. The 3 accepted runs had 1890 Changes including warmups and 1620 measured Changes. Outside timing, every input compared an independent fixed expected model, event-applied mirror, actual receiving model, and sending model. Each Change had one callback, with fallback 0. No own tests or other benchmarks ran during timing. External apps and existing user resources were retained.

A baseline source archive was made. Bare package imports in the baseline harness were replaced with relative paths into the copy. Harness body and expected-value computation stayed the same. Import-path records used the same replacement. Each result's `productImports` records actual resolved paths. Baseline and repeat used frozen copies; the improvement used the current repository. `sourceHashes` and `baseline-manifest.json` bind the source. The baseline copy did not import current workspace packages.

## p95 results

Units are ms. Raw data and `comparison.json` contain p50, maximums, every sample, and full-model read counts. p95 is position `floor(0.95 * 30)` in 30 sorted samples.

| Characters | Changed blocks | Operation | Before | Final improvement | Baseline repeat |
|---:|---:|---|---:|---:|---:|
| 10,000 | 1 | insert | 0.672 | 0.796 | 0.680 |
| 10,000 | 1 | delete | 0.287 | 0.514 | 0.787 |
| 10,000 | 1 | format | 0.522 | 0.579 | 0.687 |
| 10,000 | 2 | insert | 2.802 | 1.140 | 3.152 |
| 10,000 | 2 | delete | 3.495 | 1.143 | 2.768 |
| 10,000 | 2 | format | 2.772 | 0.925 | 2.394 |
| 10,000 | 8 | insert | 5.143 | 3.963 | 4.566 |
| 10,000 | 8 | delete | 6.044 | 3.247 | 3.522 |
| 10,000 | 8 | format | 5.071 | 3.270 | 3.874 |
| 100,000 | 1 | insert | 1.408 | 1.033 | 1.184 |
| 100,000 | 1 | delete | 1.503 | 1.261 | 0.918 |
| 100,000 | 1 | format | 1.960 | 1.441 | 1.276 |
| 100,000 | 2 | insert | 41.859 | 1.739 | 34.127 |
| 100,000 | 2 | delete | 31.330 | 1.653 | 51.707 |
| 100,000 | 2 | format | 46.928 | 1.694 | 34.372 |
| 100,000 | 8 | insert | 36.132 | 5.700 | 38.242 |
| 100,000 | 8 | delete | 44.818 | 6.410 | 61.063 |
| 100,000 | 8 | format | 40.954 | 3.917 | 33.578 |

For safe 2/8-block Changes, full-model reads per sample changed **2→0**; one block stayed **0→0**. At 100,000 characters, 2-block p95 changed 31.330~46.928→1.653~1.739ms, and 8-block p95 changed 36.132~44.818→3.917~6.410ms. Not every one-block or 10,000-character case became faster. Raw data preserves external load and small-sample variation. Starting→ending 1-minute load averages were before 19.08→19.68; improvement 15.66→15.48; baseline repeat 17.51→19.81. This was not a controlled statistical causal experiment.

## Why scope was limited, and rejected candidates

The first unlimited candidate searched the block prefix again for each target. One whole-document Bold diagnostic at 100,000 characters/625 paragraphs regressed from baseline 264.440ms to 1819.905ms. It was rejected. A per-block membership cache reduced repeated searches, but rebuilding before models for 625 scopes still cost more than the existing whole-model cache. Alternating fresh processes gave baseline 264.440/249.838/251.998ms and unlimited membership candidate 324.966/344.256/362.380ms. That candidate was also rejected.

The final implementation uses the measured 1, 2, and 8-block range. At the ninth new block, it immediately returns to the existing full path before selection, membership registration, path resolution, or before-model creation for that block. Eight is not a globally optimal threshold or a guarantee against regressions for every document with at most 8 blocks. Repeated targets in one block do not increase block count.

The final whole-document Bold diagnostic was 240.945ms with 2 full reads. A one-character insertion diagnostic in one 100,000-character paragraph gave before→improvement→baseline repeat 239.811/239.511/236.898ms, with 0 full reads. Membership is not populated for the first block. **Each value is a single-sample diagnostic, not a p95 distribution or SLO result.** The diagnostic calls the receive function directly and excludes network and server validation.

`after.json` contains the unlimited membership candidate. **Final data is `after-bounded.json`.** `diagnostics/` and `source-stages.json` separate candidate code, hashes, and diagnostics. Code copies use `.ts.txt` to avoid inclusion in product type checking. Their content hashes match the original `.ts` files.

## Behavior and costs

Narrowing requires safe targets and paths for all operations. It captures each scope's before model, then applies the CRDT Change once. It applies and validates scope diffs, restores original leaf paths, and calls back once. A full no-op adds no callback or statistics. If a later scope fails validation, earlier partial events are discarded and one full-replacement fallback is emitted.

Existing exclusions remain for old insertions, operations referencing new tokens in the same batch, node/undel/block-marker/inline target changes, virtual blocks, hidden lines, dead or missing targets/origins, empty targets, and ambiguous paths. Undo, redo, snapshot, and reset keep the full path. Membership contains only real markers/chars within preflight, not aliases. Liveness, visibility, and type checks precede cache lookup.

Initial block search and `blockPath()` still depend on document size. Only model creation, diff, and validation scope was narrowed. Temporary membership memory is proportional to selected-block character counts. Eight blocks does not bound characters or total product heap. Total receive cost is not independent of document size.

## Regression and validation scope

- New `remote-multiblock.test.ts` 29 tests + existing remote 9 = 38 focused passes. Checks covered fixed models, full-diff application, event mirrors, sending/receiving Docs, snapshots, callbacks, and statistics.
- Coverage included the 8/9-block boundary, cross IDs, overlapping ranges/different keys, lists, boxes, distinct table cells, inline content, Unicode, partial/full LWW no-ops, final-operation exclusions, absorbed aliases, actual server-accepted AB/BA order, and preservation of other-user Tickets and undo/redo.
- Formatting across 32 paragraphs/5120 targets used the full path. Block membership searches were 204, below the bound 10240. No timing assertion was used. On baseline source, the first two-block insertion test failed with actual 2 full reads against expected 0.
- `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: core 233 + demo 10 passed; failures, skips, and todos 0. Compatibility 31, type checks, and separate compatibility bundle build passed.
- Stage0 passed 6 tests with the current Ours/Yjs setup. Yorkie was excluded from this run. Historical 3-engine/8-test results are not presented as new results.
- Current-source Chrome passed 30 default regressions + 10 focused multi-paragraph steps. Checks covered actual HTTP/SSE remote insert/delete/format, PM range formatting and undo/redo, observed remote same-value write preservation, and no-op callbacks. The basic demo is not a model-event subscriber; PM is. An initial harness assumption that both subscribed was corrected in v2 and preserved as separate results.
- Compatibility Chrome verified 84 input/cursor cases and 20 general regressions, and captured 30 operation records. CDP composition input differs from actual OS IME testing.
- The branch forcing later-scope validation failure was not executed. Static review of partial-result discard, normal fallback 0, and excluded-case full-path tests are separate evidence.

These results do not establish product G0/G1, actual display latency, large-table/contention throughput, memory targets, or all delivery schedules. Structure changes, 9 or more blocks, undo/redo costs, lease recovery, two weeks of actual CI, and 30-minute/1800-round/1Hz completion criteria remain.

## Artifacts and reproduction

- Accepted results: [before](before.json), [final improvement](after-bounded.json), [baseline repeat](before-repeat.json), [comparison](comparison.json), [validation](validation.json).
- [Source stages](source-stages.json), [baseline manifest](baseline-manifest.json), [baseline source archive](baseline-source.tar.gz), [same harness](harness.ts.txt). Preserve existing raw data.
- Current-source measurement: put Node 22 on PATH, then use `npm run remote --workspace @doc-sync/benchmarks -- --chars 10000,100000 --blocks 1,2,8 --operations insert,delete,format --samples 30 --out <new absolute path>`.
- To reproduce baseline, extract the archive into a new directory and link installed root node_modules. Replace preserved harness bare imports and import.meta.resolve strings with `../packages/doc-sync/src/index.ts` and `../packages/doc-sync/src/sync/index.ts` in the same way. Save it as the copy's `benchmarks/remote.ts`. Actual run paths are in raw productImports and the manifest. Record new actual paths when running elsewhere.
- Full local test and Chrome originals are in `output/validation/roadmap-next-20261023-65yw9nr4/`, `output/playwright/roadmap-multiblock-main-v2-20261023/`, and `output/playwright/roadmap-multiblock-compat-20261023/`. Git excludes `output/`.
