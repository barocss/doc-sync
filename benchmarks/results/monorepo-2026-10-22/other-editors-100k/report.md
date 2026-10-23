---
work_id: other-editors-100k-20261022
artifact_type: performance-report
status: done
owner_role: executor
source_request: Compare other editors and review continuous string CRDT storage design
last_updated: 2026-10-22 22:54 KST
---

# Slate · Lexical · ProseMirror comparison

Input-to-remote-display-opportunity p95 through the doc-sync integrations was **257.9~544.3ms**. Three pairs measured 30 inputs per direction, 180 total. All used actual key inputs. Every input display and final document equality check passed.

These results **include the current adapters and doc-sync**. They do not rank editor products by speed. Storage still used character Items. The [design review](../../../../docs/design/continuous-text-storage.md) covers continuous string storage.

## Measurement results

| Direction | p50 (ms) | p95 (ms) | Maximum (ms) |
| --- | --- | --- | --- |
| Slate → Lexical | 254.8 | 366.6 | 379.6 |
| Lexical → Slate | 329.1 | 544.3 | 650.6 |
| Slate → ProseMirror | 227.1 | 311.8 | 314.5 |
| ProseMirror → Slate | 285.7 | 332.7 | 333.3 |
| Lexical → ProseMirror | 209.2 | 257.9 | 297.6 |
| ProseMirror → Lexical | 253.0 | 272.7 | 306.6 |

The start was the browser key event's `timeStamp`, including waiting before the handler. The endpoint was the second `requestAnimationFrame` callback after the receiver's first-paragraph string matched expectation. This estimates a display opportunity, not physical display timing. All 6 separate diagnostics confirmed browser `Paint` after remote DOM confirmation and before the endpoint.

p50 is the 16th of 30 sorted values. p95 uses the existing test's `floor(n × 0.95)` index. For n=30, this is the 29th sorted value. Only table displays are rounded to one decimal place.

## Conditions and comparison scope

| Item | Condition |
| --- | --- |
| Initial document | 100000 characters, 625 paragraphs, 160 ASCII characters per paragraph. Seed hash matched the prior actual-browser test |
| Source | Git HEAD `8d0f887ae5fbd9fdd5e92c30dd942bb39bb2f83b` + existing Doc model-reuse WIP. Full source hashes and diff preserved |
| Editors | Slate 0.146.0, slate-react 0.147.3, Lexical 0.52.0, ProseMirror view 1.42.6 |
| Runtime | Node v22.19.0, macOS arm64, 14 logical CPUs. Chrome 156.0.8078.47, headed, DPR 1 |
| Viewport | 1440×1000. Each editor had a 460px-high scroll area. Full document model and 625-paragraph DOM retained |
| Peers | 2 per pair, on the same page and renderer. New document and browser session per pair |
| Pair order | Slate↔Lexical, Slate↔ProseMirror, Lexical↔ProseMirror. Forward direction in the table, then reverse |
| Input | First paragraph, initial offset 50 per direction. 5 warmups + 30 measured + 1 separate diagnostic. One ASCII character through `keyboard.press` |
| Transport and persistence | Real local HTTP POST / SSE and original demo server JSONL persistence. Separate temporary data folder |
| Build | Same development bundle as the compatibility app. Operation trace off. Existing 300ms status polling retained |
| Tools | Copy of the current compatibility entry point, adding only two-peer selection, native-object exposure, method timing, and DOM-change observation |
| Change scope | No product adapter or storage changes for this comparison. Existing optimization WIP retained |

Initial document, input counts, and endpoint matched the prior `/pm` test. App wrappers, scroll viewports, and status paths differed. No gain against prior figures is calculated. The app's original status text still contained a fixed five-peer string. Peer snapshots and server state confirmed 2 actual connections.

External apps kept running. Starting load averages were [20.7041015625, 20.70849609375, 20.302734375]; ending values were [24.44921875, 27.07958984375, 24.58740234375]. Pair order and external load effects cannot be excluded. One fixed-order comparison cannot establish causes of small differences.

## Bottlenecks

Each column gives an independent span distribution's p50, in ms. Do not add columns to derive total p50.

| Direction | Input handler→transport | Transport→remote receive | Remote receive→DOM | DOM→display opportunity | Server submit |
| --- | --- | --- | --- | --- | --- |
| Slate → Lexical | 37.7 | 75.7 | 130.4 | 9.8 | 1.2 |
| Lexical → Slate | 40.7 | 62.8 | 175.2 | 14.8 | 1.5 |
| Slate → ProseMirror | 38.8 | 77.6 | 101.2 | 3.9 | 1.1 |
| ProseMirror → Slate | 64.5 | 5.8 | 172.1 | 14.0 | 1.1 |
| Lexical → ProseMirror | 38.6 | 63.5 | 98.4 | 3.2 | 1.1 |
| ProseMirror → Lexical | 64.7 | 49.1 | 131.0 | 9.9 | 1.6 |

`Transport→remote receive` includes local JavaScript execution and event waiting. It is not pure network time. Server submit p50 was about 1.1~1.6ms. Browser model conversion and remote screen processing cost more on this path.

Method values are p50 after summing calls within one input observation window. Call counts and DOM mutation counts are also p50. Inclusive method times overlap. `Self` time subtracts only instrumented direct child calls.

| Direction | Doc.toJSON total | Calls | withEvents self | Target pull inclusive | DOM removed / added | Final paragraph DOM retained |
| --- | --- | --- | --- | --- | --- | --- |
| Slate → Lexical | 116.4 | 5 | 39.9 | 32.5 | 625 / 625 | 0 / 30 |
| Lexical → Slate | 117.0 | 6 | 38.8 | 31.6 | 625 / 625 | 0 / 30 |
| Slate → ProseMirror | 118.8 | 7 | 40.6 | 0.9 | 0 / 0 | 30 / 30 |
| ProseMirror → Slate | 118.6 | 12 | 40.3 | 30.7 | 625 / 625 | 0 / 30 |
| Lexical → ProseMirror | 116.5 | 7 | 38.6 | 0.8 | 0 / 0 | 30 / 30 |
| ProseMirror → Lexical | 116.0 | 13 | 38.8 | 33.4 | 625 / 625 | 0 / 30 |

The observed bottlenecks follow.

1. **Model conversion is shared cost.** Reuse still recomputes when the document changes. Cumulative `Doc.toJSON()` p50 was 116.0~118.8ms. Separate CPU profiles showed `unitsToRuns`, `rawBlock`, and format normalization. The path still rereads in-memory character Items into model strings.
2. **Remote event computation remains.** `SyncClient.withEvents` self-time p50 was about 38.6~40.6ms. This path compares before/after models, runs `diffModels`, and validates with `applyEdits`. Subfunction timings were not measured separately in the main run. CPU profiles are diagnostic evidence only.
3. **Slate and Lexical remote adapters rebuild full native documents.** Each receiver removed 625 paragraph DOM nodes and added 625. The last paragraph DOM changed every time. Slate receiver `Slate.apply` call-count p50 was 1250. ProseMirror retained first and last paragraph DOM in 30/30 inputs. This reflects current integration code.
4. **Asynchronous screen processing is separate.** Inclusive `pull` timing cannot explain React work after Slate returns. Including that work, remote-receive→DOM p50 was about 172~175ms for Slate, 130~131ms for Lexical, and 98~101ms for ProseMirror. This span also includes doc-sync model work immediately after receipt.

Next candidates were continuous string storage with range-based model conversion, changed-block event computation, and partial remote application for Slate/Lexical. Gains from these changes were not measured. Each requires a separate implementation stage and repeat measurement.

## Continuous string storage review

Structural checks were recorded in `storage-baseline.json` separately after timing ended.

| Item | Count at initial 100,000 characters |
| --- | --- |
| Wire text operations | 625, with 160 characters per operation |
| Model text runs | 625 |
| Live character Items | 100,000 |
| Total stored Items / ID Map entries | 100,625 / 100,625 |

**String transport is supported, but application to live memory splits content into character Items.** Adding batch-input tests alone does not address the storage structure.

The proposal keeps logical character IDs and existing operations while storing consecutive strings in physical batches. Batches split at interior insertions, partial deletions, and formatting boundaries. Small continuous-typing operations can merge when IDs, origins, formatting, and deletion states agree. ID indexes, block caches, position lookup, and model conversion must also use ranges.

The [design document](../../../../docs/design/continuous-text-storage.md) covers RGA order, duplicate delivery, Unicode, selection, undo, GC, and API compatibility. It first proposes storage changes that retain existing wire and snapshots. Range snapshots and bulk del/set transport are separate stages. Storage changes were not implemented. Memory reduction and latency gains were not available.

Tests for a new implementation must include 1/10/100/1000-character inputs, continuous key input, IME commit, paste, one long paragraph, heavily formatted documents, and interior edits. Compare character/batch counts, heap, snapshots, and local/remote latency separately. These 180 inputs are not evidence for those scenarios.

## Validation and limits

- Compatibility unit tests passed 31/31 on the optimized core.
- All 180/180 measured inputs were trusted and matched expected first-paragraph strings on both sides.
- 216 inputs completed including warmups and diagnostics. Each pair ended with 100072 characters / 625 paragraphs.
- Both native models, both client models, and the server model matched for every pair.
- Pending 0, fallback 0, browser errors/warnings 0. Only the original React development notice appeared.
- All 6 direction diagnostics confirmed `Paint` after remote DOM changes and before the endpoint.
- Frozen product source hashes matched before/after. Isolated temporary JSONL data replaced existing app data.
- This test covered sequential ASCII input only. Selection-range latency, concurrent input, tables, bulk paste, and actual OS IME are outside these performance results.
- Browser and server ran on one computer. This does not establish latency across independent devices or the public internet.

## Evidence files

- `summary.json`: all latency distributions, method times, DOM retention counts, and validation results.
- Per-pair `browser-raw.json`: 72 samples and native/client/server models.
- Per-pair `*.trace.json`, `*.cpuprofile`: one diagnostic per direction, separate from the main distribution.
- `server-events.jsonl`: actual submit and server Doc method times.
- `source-manifest.json`, `source.tar.gz`, `source.diff`: frozen product source and measurement harness.
- `environment.json`, `run.json`, `compat-tests.log`, `storage-baseline.json`: environment, load, checks, and structural inspection.
- `analysis.py`, `storage-count.mjs`: result validation and storage count scripts.
- Screenshots and CLI logs remain in `output/playwright/other-editors-100k/`.
