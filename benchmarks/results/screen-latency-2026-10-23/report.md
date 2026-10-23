# Screen latency improvement — 2026-10-23

Chrome screen-latency p95 for the same 100,000-character script decreased **246.5 → 124.1ms** for demo→PM and **260.4 → 120.2ms** for PM→demo. Observed decreases were 49.7% and 53.8%. This does not establish product performance targets or improvements across all editing paths.

## Cause and change

The baseline was `f9370df85d93a69902254bbba5d6c90f95dc4559`. Existing caching reduced repeated reads at the same Doc version. But even a one-character change made the next `toJSON()` recompute characters, formatting, and runs for every paragraph. Demo status and PM document checks each incurred this cost.

`doc.ts` reuses raw models by TextBlock object. The internal path in `model.ts` reuses normalized text models by raw model through WeakMap. Replacing a Block after insertion/deletion rereads that paragraph. A successful LWW character-format write on the same Block clears its cache. Structure changes, revival, and GC clear the full cache. List grouping and table/flow normalization still run each time.

Public `canonical()` does not use the cache. `toJSON()` still returns copied model containers, preserving the contract that consumers can modify returned models. RGA, same-position concurrent Enter, per-actor undo, wire, GC policy, and public exports were unchanged. Screen characters, paragraphs, polling, status, and editor features were retained.

In the new regression test, character/format lookups while reading after insertion changed from **100,001** to **161**. The same tests gave 1 failure/5 passes on baseline and 6 passes on improved source. Initial counts included 1 format lookup by the command itself, so the final test resets the counter after insertion. Comparison uses final records `model-before-final.log` and `model-after-focused-final.log`.

## Chrome before/after measurement

The initial document had 100,000 characters, 625 paragraphs, and 160 characters per paragraph. The same ASCII keys were inserted at offset 50 in the first paragraph. Each run/direction had 5 warmups and 30 measured inputs. Three runs followed **before → improvement → frozen baseline repeat**. Each used a new temporary data folder and separate Chrome session.

Timing started at trusted key-event creation and ended at the second requestAnimationFrame callback after expected remote DOM confirmation. This differs from physical display timing. Real local HTTP POST/SSE and JSONL persistence were used. Both editors shared one renderer thread. Conditions: Chrome 156.0.8078.47, Node 22.19.0, headed, 1440×1000, DPR 1.

| Direction | Source | p50 ms | p95 ms | Maximum ms |
|---|---|---:|---:|---:|
| Demo→PM | Before | 216.7 | 246.5 | 251.2 |
| Demo→PM | Improvement | 88.9 | 124.1 | 157.5 |
| Demo→PM | Baseline repeat | 216.2 | 248.9 | 269.1 |
| PM→demo | Before | 226.9 | 260.4 | 276.0 |
| PM→demo | Improvement | 96.7 | 120.2 | 123.9 |
| PM→demo | Baseline repeat | 219.1 | 276.5 | 301.8 |

p95 to remote DOM confirmation alone changed 226.4 → 100.1ms for demo→PM and 195.2 → 64.6ms for PM→demo. Do not combine those endpoints with frame timings or present them as the same metric.

All **210 inputs**, including warmups across three runs, displayed expected strings. Final models for both clients and the server matched in every run. Pending and fallback were 0. Before/after source hashes differed only for `doc.ts` and `model.ts`. Baseline repeat used the same source as the first baseline.

## Computation costs

These are medians after summing inclusive method time within each input observation window, in ms. Methods contain other measured methods; do not add rows.

| Direction | Method | Before | Improvement |
|---|---|---:|---:|
| Demo→PM | Doc.toJSON | 118.45 | 0.85 |
| Demo→PM | PmBinding.pull | 68.00 | 5.50 |
| Demo→PM | Editor.render | 5.75 | 6.05 |
| PM→demo | Doc.toJSON | 119.55 | 0.90 |
| PM→demo | PmBinding.reconcile | 64.15 | 0.60 |
| PM→demo | Editor.render | 6.35 | 6.10 |

Paragraph model computation decreased while demo DOM processing stayed similar. In improved source, input-processing-start→remote-event-receipt median was 62.0/26.55ms, and remote DOM confirmation was 68.5/38.95ms. These spans mix request waits, browser work, and frame waits. They are not pure network time or Paint cost.

No own regressions or other benchmarks ran during timing. External apps kept running. Starting→ending 1-minute load averages were before 18.23→26.35, improvement 33.92→30.75, and baseline repeat 22.61→23.10. Exact conditions and batch loads are in `run.json` and `measurement.log`. The repeat and token lookup counts support the improvement, but this was not a statistical experiment with controlled external load.

## Tests

- Current-source `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: core 144 + demo 10 passed, failures 0.
- Focused regressions 24, compatibility unit tests 31, and type checks passed.
- Additional 8-replica harness: 10,007 wire Ops passed. These were bounded document batches, not one long-lived document or disk-failure recovery tests.
- Chrome demo DOM, table, box, formatting, undo/redo, and Presence regressions: 30 passed.
- Comparison demo Chrome CDP: 84 inputs and 20 general regressions passed; 30 operation records checked. Final totals are in `validation.json`.

## Scope and remaining costs

Full computation remains for initial model creation and after structure changes, revival, and GC. Returned-model copying, list/table normalization, editor conversion, and DOM processing remain. WeakMap retains additional paragraph results, but this work did not revalidate memory targets. Sequential ASCII insertion latency does not establish large-table, IME, multi-user contention, or continuous typing throughput. Chrome CDP composition regressions differ from OS Korean IME validation.

This work does not complete G0/G1, the 30-minute/1800-round/1Hz script, lease-expiry recovery, or two weeks of actual CI. The earlier one-million-operation result belongs to previous source and is not reused as this result. These changes were uncommitted on `f9370df`.

## Artifacts and reproduction

- [Values and method analysis](comparison.json), [final validation totals](validation.json), [source diff](after-source.diff).
- `before/`, `after/`, and `before-repeat/` preserve raw data, source hashes, conditions, server records, and executed JS/Python harnesses. Harness absolute paths record this computer's runs. Elsewhere, adjust source root, output, and server import paths.
- Actual local run folder: `output/playwright/screen-latency-20261023/`. `measure.py` reads `DOCSYNC_SOURCE_ROOT`, `DOCSYNC_MEASURE_OUT`, and `DOCSYNC_SESSION`. Prepare templates and a source manifest in a new output folder before execution. Preserve existing result folders.
- Product regressions: `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`, `npm test --prefix apps/demo/compat`, `npm run typecheck`. Comparison demo Chrome commands are in `apps/demo/compat/README.md`. Main demo regression scripts and logs are in `output/playwright/screen-regression-20261023/`.
