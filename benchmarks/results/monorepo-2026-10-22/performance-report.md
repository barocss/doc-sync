# doc-sync monorepo migration performance report

> Other editors: p95 was **257.9~544.3ms** for 100,000 characters and 30 edits per direction. §10 adds the comparison. §11 adds a review of continuous string storage. The storage change was not implemented.

> After optimizations 1 and 2: input-to-remote-frame p95 was **288.1ms / 238.7ms**, a **87.1% / 91.0% decrease** from baseline. See §9 and the [report by stage](browser-latency-step12/report.md).

> Before optimization (2026-10-22 20:04 KST): input-to-remote-rendering-frame p95 in the actual editors was **2.24~2.64 seconds**. Repeated full-document conversion and demo DOM reconstruction were the main bottlenecks. See §8.

Measurement completed: 2026-10-22 15:52 KST  
Target: the monorepo migration of `/Users/user/github/doc-sync`

## 1. Results and assessment

Both post-migration runs passed all correctness checks. Edit counts, final character counts, and paragraph counts matched the pre-migration run. Wire sizes and snapshot sizes for both engines also matched. The hashes of 18 core files and the measurement source were checked before and after measurement.

Many timings decreased. Some maximum times increased. External CPU load was present. Thus, these results do not establish that the migration improved speed, or that every latency stayed the same or decreased.

The main 100,000-character results follow. Each ratio is **after migration ÷ before migration**. A value below 1 indicates a decrease.

| Item | Before migration (ms) | Range across 2 post-migration runs (ms) | After/before ratio range |
| --- | --- | --- | --- |
| ours local p50 | 0.047 | 0.04575 ~ 0.045791 | 0.973 ~ 0.974 |
| ours local p95 | 0.287667 | 0.151083 ~ 0.184375 | 0.525 ~ 0.641 |
| ours local maximum | 35.498 | 28.570209 ~ 37.541 | 0.805 ~ 1.058 |
| ours receive p95 | 0.100084 | 0.094667 ~ 0.100417 | 0.946 ~ 1.003 |
| ours receive maximum | 32.564 | 33.869709 ~ 39.643209 | 1.040 ~ 1.217 |
| Local subscribed path p95 | 2.835542 | 1.419083 ~ 1.508917 | 0.500 ~ 0.532 |

## 2. Measurement conditions

| Item | Condition |
| --- | --- |
| Environment | macOS-15.6.1-arm64-arm-64bit-Mach-O, 14 logical CPUs |
| Node | 22.19.0 before and after migration |
| Runs | 1 before migration, 2 after migration |
| Core script | Existing typing/paste script, seed 1, 10,000 and 100,000 characters |
| Engine order | ours, then yjs |
| Core heap measurement | --expose-gc; heap growth of one new replica after all received changes were applied |
| Client | Initially 10,000 or 100,000 characters, at most 160 characters per paragraph, one-character insertions |
| Client samples | 5 warmups, then 30 measured samples per path |
| Run order | Core, then client. Same order in the second run |
| Concurrent work | Started after the parent confirmed browser validation and repository tests had ended. Other users' work was kept running |

In the first run, the maximum time on the 100,000-character `Doc` path was 4.76 times baseline. Several p95 values decreased substantially. External CPU use was also observed. A second run checked this variation. Both results were kept; favorable results were not selected in isolation.

| Run | Core elapsed time (seconds) | Client elapsed time (seconds) | Exit code |
| --- | --- | --- | --- |
| 1 | 21.315 | 1.334 | All 0 |
| 2 | 21.914 | 2.281 | All 0 |

Elapsed times include npm commands, preparation, and validation. They differ from the total edit times below.

## 3. Correctness and data sizes

| Requested size | Final characters | Paragraphs | Edits | Check result |
| --- | --- | --- | --- | --- |
| 10000 | 10147 | 54 | 4261 | Both engines matched before and after migration |
| 100000 | 100031 | 625 | 41549 | Both engines matched before and after migration |

Core `correct` combines checks that the local document, receiving document, and reopened snapshot match the reference document. The raw data does not store those three checks separately. The ours server path validated each change before application. Both runs ended without errors. Server final-document equality is not stored as a separate value.

The client compared final documents on the `doc`, `client`, and `client-observed` paths. All three matched at both sizes. The subscribed path emitted 35 notifications at each size. Other paths emitted 0. All paths needed 0 corrections.

The following sizes were identical before migration and in both post-migration runs. Units are B. Per-edit values are means.

| Requested size | Engine | Total wire | Wire per edit | Wire per one-character insertion | Snapshot |
| --- | --- | --- | --- | --- | --- |
| 10000 | ours | 449,304 | 105.44567 | 97.780778 | 167,595 |
| 10000 | yjs | 86,310 | 20.255808 | 15.363931 | 27,231 |
| 100000 | ours | 4,436,790 | 106.784519 | 99.784608 | 1,648,279 |
| 100000 | yjs | 957,314 | 23.040603 | 17.833597 | 289,774 |

ours uses JSON. Yjs uses a binary format. Data structures alone cannot explain the size difference between engines.

## 4. Core timings and heap

Times are in ms. Values in the next three tables are **p50 / p95 / maximum / total**. Displayed values alone are rounded to six decimal places.

### Local edits

| Requested size | Engine | Before migration | After migration, run 1 | After migration, run 2 |
| --- | --- | --- | --- | --- |
| 10000 | ours | 0.010958 / 0.059917 / 4.242791 / 178.122192 | 0.010709 / 0.037042 / 4.444875 / 148.784192 | 0.010542 / 0.036625 / 4.137834 / 148.952364 |
| 10000 | yjs | 0.007 / 0.022666 / 1.253542 / 48.822417 | 0.006541 / 0.013 / 0.723666 / 36.545289 | 0.0065 / 0.013959 / 0.542583 / 37.151906 |
| 100000 | ours | 0.047 / 0.287667 / 35.498 / 10995.519002 | 0.04575 / 0.151083 / 28.570209 / 9283.683899 | 0.045791 / 0.184375 / 37.541 / 9446.923239 |
| 100000 | yjs | 0.003709 / 0.008875 / 2.429625 / 216.384339 | 0.003541 / 0.009291 / 2.146125 / 213.80766 | 0.003625 / 0.009083 / 1.928583 / 208.23042 |

### Apply received changes

| Requested size | Engine | Before migration | After migration, run 1 | After migration, run 2 |
| --- | --- | --- | --- | --- |
| 10000 | ours | 0.001625 / 0.003208 / 0.356375 / 15.073014 | 0.001542 / 0.002375 / 0.36925 / 13.311838 | 0.0015 / 0.00225 / 0.28875 / 12.832201 |
| 10000 | yjs | 0.006458 / 0.021542 / 1.131709 / 49.140582 | 0.005667 / 0.010041 / 1.036125 / 31.019168 | 0.005708 / 0.010166 / 1.038417 / 32.067696 |
| 100000 | ours | 0.010542 / 0.100084 / 32.564 / 3575.085628 | 0.006292 / 0.100417 / 33.869709 / 2833.552141 | 0.01025 / 0.094667 / 39.643209 / 3402.849886 |
| 100000 | yjs | 0.003292 / 0.007875 / 5.620917 / 200.258838 | 0.003208 / 0.00775 / 1.363125 / 182.910343 | 0.003291 / 0.007917 / 9.80525 / 201.032561 |

### Server validation and application

| Requested size | Engine | Before migration | After migration, run 1 | After migration, run 2 |
| --- | --- | --- | --- | --- |
| 10000 | ours | 0.00225 / 0.004916 / 0.844958 / 20.35807 | 0.002125 / 0.003958 / 0.576583 / 17.06563 | 0.002125 / 0.004209 / 0.449417 / 17.445867 |
| 100000 | ours | 0.01775 / 0.092084 / 74.74725 / 3853.342704 | 0.015333 / 0.08775 / 31.24075 / 3273.16038 | 0.0095 / 0.086041 / 29.010125 / 3105.074446 |

The Yjs adapter has no equivalent server validation path. Server timings compare ours only.

### Read, save, and open

Values are **document read / save / load**. Each operation was measured once per core run.

| Requested size | Engine | Before migration (ms) | After migration, run 1 (ms) | After migration, run 2 (ms) |
| --- | --- | --- | --- | --- |
| 10000 | ours | 6.776917 / 3.5095 / 6.924208 | 4.838917 / 3.172625 / 5.015125 | 5.380958 / 2.997209 / 5.713125 |
| 10000 | yjs | 0.105208 / 0.555875 / 2.2165 | 0.085666 / 0.474125 / 1.886666 | 0.090667 / 0.573583 / 2.042375 |
| 100000 | ours | 47.817459 / 19.627417 / 126.301166 | 45.666083 / 19.107667 / 94.8805 | 80.044958 / 19.0215 / 119.354917 |
| 100000 | yjs | 0.840792 / 4.476041 / 14.372583 | 0.886167 / 3.866 / 12.838125 | 0.830375 / 3.769042 / 20.28725 |

### Heap

| Requested size | Engine | Before migration (B) | After migration, run 1 (B) | After migration, run 2 (B) |
| --- | --- | --- | --- | --- |
| 10000 | ours | 3,868,776 | 3,868,608 | 3,869,928 |
| 10000 | yjs | 440,832 | 501,568 | 472,424 |
| 100000 | ours | 36,475,960 | 36,475,960 | 36,477,376 |
| 100000 | yjs | 3,753,736 | 3,472,944 | 3,751,472 |

For ours with 100,000 characters, the measured heap changed from 36,475,960B to 36,475,960~36,477,376B. Run timing and GC affect heap measurements.

## 5. Local client timings

Values are **p50 / p95 / maximum**, in ms. `doc` edits Doc directly. `client` edits through SyncClient without a local subscription. `client-observed` edits through SyncClient with a local edit subscription.

| Initial characters | Path | Before migration | After migration, run 1 | After migration, run 2 |
| --- | --- | --- | --- | --- |
| 10000 | doc | 0.0655 / 0.138916 / 0.139375 | 0.056125 / 0.119584 / 0.131709 | 0.060375 / 0.124583 / 0.125834 |
| 10000 | client | 0.029958 / 0.031084 / 0.048584 | 0.026416 / 0.027167 / 0.041125 | 0.028959 / 0.0325 / 0.047583 |
| 10000 | client-observed | 0.292166 / 0.77975 / 1.420459 | 0.245458 / 0.517459 / 0.584333 | 0.239208 / 0.484833 / 0.52125 |
| 100000 | doc | 0.180375 / 0.346958 / 0.384 | 0.103 / 0.196958 / 1.829583 | 0.098333 / 0.171083 / 0.197541 |
| 100000 | client | 0.105708 / 0.357333 / 2.76875 | 0.091375 / 0.094125 / 0.0945 | 0.087125 / 0.092083 / 0.101584 |
| 100000 | client-observed | 0.4865 / 2.835542 / 4.937459 | 0.303917 / 1.508917 / 1.673625 | 0.320834 / 1.419083 / 1.516834 |

The initial 10,000-character document had 63 paragraphs. The 100,000-character document had 625. Each path inserted 35 characters across warmup and measurement. The raw character count is the initial count. No separate field stores the final count.

Maximum times for the 100,000-character `Doc` path were 0.384ms → 1.830ms → 0.198ms. The high first post-migration value did not recur in the second run. These results alone do not establish the cause of the variation.

The subscription callback counts notifications only. It excludes screen updates, network, commit, and document updates inside user callbacks. A p95 below 2ms on this path does not establish an actual-editor latency target pass.

## 6. External load and interpretation

CPU use from external apps and monitor processes was observed. The values below are 1-minute / 5-minute / 15-minute load averages. There were 14 logical CPUs. No pre-migration load record exists, so equal load conditions cannot be confirmed.

| Run | Before start | After end |
| --- | --- | --- |
| 1 | 6.60 / 11.94 / 22.58 | 7.44 / 11.78 / 22.27 |
| 2 | 6.76 / 10.78 / 21.13 | 7.02 / 10.57 / 20.81 |

The maximum receiving time for ours at 100,000 characters exceeded baseline 32.564ms in both runs. The Yjs maximum also varied: 5.621ms → 1.363ms → 9.805ms. The raw data preserves these increases.

This report covers only the existing single-user typing/paste script and local client insertion path. It did not measure long runs, multiple users, large tables, remote model-event subscriptions, or browser latency. It also excludes performance after the Presence selection-range change.

One pre-migration run and two post-migration runs cannot establish statistical equivalence or causality. No timing tolerance was set before this migration. Correctness, scripts, and sizes were preserved. Timing variation remains.

## 7. Reproduction commands and evidence

The following commands ran from the root. Root commands forward to the `benchmarks` workspace, so output paths are relative to `benchmarks`.

```bash
cd /Users/user/github/doc-sync
env PATH=/Users/user/.nvm/versions/node/v22.19.0/bin:$PATH npm run bench -- --out-dir results/monorepo-2026-10-22/after
env PATH=/Users/user/.nvm/versions/node/v22.19.0/bin:$PATH npm run bench:client -- --label monorepo-after --out results/monorepo-2026-10-22/client-after.json
```

The repeated run used core output folder `after-repeat`, client label `monorepo-after-repeat`, and output file `client-after-repeat.json`. Conditions and seed stayed the same. Those paths already contain data. Use a new empty path for reproduction. The core script can overwrite files with the same names.

- [Pre-migration core: 10,000 characters](before/2026-10-22-10000.json), [100,000 characters](before/2026-10-22-100000.json)
- [Post-migration core run 1: 10,000 characters](after/2026-10-22-10000.json), [100,000 characters](after/2026-10-22-100000.json)
- [Post-migration core run 2: 10,000 characters](after-repeat/2026-10-22-10000.json), [100,000 characters](after-repeat/2026-10-22-100000.json)
- Client: [before migration](client-before.json), [after migration, run 1](client-after.json), [after migration, run 2](client-after-repeat.json)
- [All values, ratios, conditions, and load records](comparison.json)
- [Migration source receipt](migration-source-receipt.json)

This report used the frozen `comparison.json`. No measurements were rerun while writing it. Existing raw data, source, and HANDOFF were unchanged.

## 8. Actual-editor latency with 100,000 characters

Additional collection completed: 2026-10-22 20:04 KST

This section measured source after the Presence feature change. It differs from the migration comparison above. The actual `/pm` page used HTTP POST, SSE, and server JSONL persistence. The starting document had 100,000 characters and 625 paragraphs. Each direction had 5 warmups and 30 measured real key inputs.

| Direction | Remote DOM p95 | Remote frame p50 | Remote frame p95 | Remote frame maximum |
| --- | --- | --- | --- | --- |
| Demo → ProseMirror | 1,717.0ms | 1,722.4ms | 2,236.9ms | 2,251.9ms |
| ProseMirror → demo | 1,784.4ms | 2,050.6ms | 2,642.4ms | 3,004.4ms |

The start was key-event creation, including waiting before handler execution. The remote frame endpoint was the second requestAnimationFrame callback after confirmation of the exact DOM string. This estimates a browser rendering opportunity. Separate diagnostics confirmed Paint completion after the DOM update. Physical display timing was not measured.

The main bottlenecks follow.

- `Doc.toJSON()` usually ran 10~15 times per input observation window. Cumulative p50 was 569.4~866.0ms.
- `Editor.render()` usually ran 3 times. Cumulative p50 was 372.2~379.0ms. It rebuilt the full 100,000-character DOM.
- The `/pm` 700ms status poll and Presence/cursor updates also triggered full model conversion and shared-screen updates.
- The remote model-event path built, compared, and validated full before/after models, then called the editor callback. Demo → PM inclusive p50 was 328.8ms. It overlaps other items and must not be added to them.

Browser CRDT application had cumulative p50 around 0.3~0.4ms. Server validation, application, and persistence had p95 1.89~3.54ms. Transport-start-to-receive-callback includes browser event waiting. Diagnostic POSTs took another 669~712ms from header receipt to renderer response-event execution. This is not solely network latency.

All 60 measured inputs displayed the expected characters on both sides. Final client and server models matched. There were 0 pending changes. After 72 inputs including warmups and diagnostics, the document had 100,072 characters and 625 paragraphs. Model-event fallback was 0.

The actual editing flow still had high latency. The next work was to reduce duplicate full-model computation and full demo DOM reconstruction, then restrict remote event computation to changed blocks and repeat measurements under the same conditions. This measurement did not apply those optimizations.

The editors shared one page and renderer thread. External apps kept running. These results do not establish performance on other computers, with IME, continuous input, large tables, or multiple users.

[Detailed report, spans, and CPU/Paint evidence](browser-latency-100k/report.md) · [Analysis](browser-latency-100k/summary.json) · [Raw data](browser-latency-100k/browser-raw.json)

## 9. Model and paragraph DOM reuse

Final collection completed: 2026-10-22 22:20 KST

Optimization 1 reused model computation and was measured first. Optimization 2 then reused paragraph DOM and was measured under the same conditions: initially 100,000 characters and 625 paragraphs, 5 warmups and 30 measured inputs per direction, and the same keys, viewport, HTTP/SSE, and JSONL conditions. The initial seed was byte-identical.

| Direction | Status | p50 | p95 | Maximum | p95 decrease from baseline |
| --- | --- | --- | --- | --- | --- |
| Demo → ProseMirror | Before optimization | 1,722.4ms | 2,236.9ms | 2,251.9ms | — |
| Demo → ProseMirror | 1: model reuse | 1,241.8ms | 1,626.9ms | 2,101.7ms | 27.3% |
| Demo → ProseMirror | 1+2: add paragraph DOM reuse | 234.0ms | 288.1ms | 312.2ms | 87.1% |
| ProseMirror → demo | Before optimization | 2,050.6ms | 2,642.4ms | 3,004.4ms | — |
| ProseMirror → demo | 1: model reuse | 1,253.6ms | 1,593.9ms | 1,959.6ms | 39.7% |
| ProseMirror → demo | 1+2: add paragraph DOM reuse | 207.1ms | 238.7ms | 239.3ms | 91.0% |

Optimization 1 copied return containers while reusing model computation. Optimization 2 rebuilt changed paragraphs and paragraphs affected by selection/cursor display. It retained unchanged nodes and state. This also applied inside tables and boxes. The model was not hidden or shortened.

Cumulative `toJSON()` p50 fell from 569.4~866.0ms to about 115~120ms. Cumulative demo render p50 fell from 355~379ms to about 5.2ms. Full-model creation and remote comparison/validation remained in scope as existing costs.

All 60 measured inputs at each stage displayed expected characters. Final client and server models matched, with pending and fallback 0. Optimization 1 passed 116 extended tests; optimization 2 passed 116 default tests. Type checks and 30 browser regression items passed.

The first optimization 2 run stopped after a disk-write failure. Its 61 partial samples were preserved and excluded. The completed `step2-repeat` run used the same source. Early optimization 1 timing might overlap additional validation from another chat. Each run recorded load. Timing decreases are not attributed entirely to code.

The start was key-event creation. The endpoint was the second rAF after remote DOM confirmation. This is a rendering-opportunity measure on one local page. It does not establish passes for physical display, IME, large tables, or multiple users. Full block invalidation after structure changes, GC, or revival can still cause broader DOM updates.

[Detailed report by stage](browser-latency-step12/report.md) · [All values and ratios](browser-latency-step12/comparison.json)

## 10. Other editor comparison — 100,000 characters

The optimized Doc was compared through Slate/Lexical/ProseMirror compatibility adapters. Each pair opened two actual editors. Each direction had 5 warmups and 30 measured inputs, for 180 measurements total. Initial size was 100000 characters / 625 paragraphs. Six separate diagnostics were excluded from the distribution.

| Direction | p50 (ms) | p95 (ms) | Maximum (ms) |
| --- | --- | --- | --- |
| Slate → Lexical | 254.8 | 366.6 | 379.6 |
| Lexical → Slate | 329.1 | 544.3 | 650.6 |
| Slate → ProseMirror | 227.1 | 311.8 | 314.5 |
| ProseMirror → Slate | 285.7 | 332.7 | 333.3 |
| Lexical → ProseMirror | 209.2 | 257.9 | 297.6 |
| ProseMirror → Lexical | 253.0 | 272.7 | 306.6 |

Time ran from key-event creation to the second rAF after remote DOM confirmation. This is not physical display timing. Every input display and final native/client/server document equality check passed. Each pair ended with 100072 characters / 625 paragraphs, pending 0, fallback 0. The current core also passed 31 compatibility unit tests.

Slate/Lexical receivers removed and added 625 paragraph DOM nodes per input. ProseMirror retained paragraph DOM. Shared-path cumulative Doc.toJSON p50 was 116.0~118.8ms. Model conversion and remote full-document application remained costs. This compares the current integrations, not editor-product rankings. Different screens and wrappers also prevent a gain calculation against the prior /pm test.

The [detailed report](other-editors-100k/report.md) and [validation results](other-editors-100k/summary.json) record conditions and raw data.

## 11. Review of continuous string CRDT storage

The initial document already used 625 text operations of 160 characters each. The model also had 625 text runs. Memory still held 100000 character Items and 100625 total ID Map entries. Wire string batches and memory storage batches are distinct.

The proposal keeps logical IDs and stores consecutive strings in batches. Batches split only at interior edits, partial deletions, and formatting boundaries. ID lookup, block/position caches, and model conversion must also use ranges. Selection, undo, GC, and existing wire behavior must remain compatible.

The [design document](../../../docs/design/continuous-text-storage.md) defines migration scope, API compatibility, and acceptance criteria. The storage change was not implemented. New continuous-input/multi-character measurements and gains from the storage change were not available. They are separate from the single-character baselines above.
