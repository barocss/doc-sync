# Input and remote display latency in actual editors with 100,000 characters

Collection ended: 2026-10-22 20:04 KST

## Results

The `/pm` page had high editing latency with 100,000 characters. From browser key-event creation to the remote rendering-frame boundary, p95 was 2.24 seconds for demo → ProseMirror and 2.64 seconds in reverse. Maximums were 2.25 seconds and 3.00 seconds. Correctness held, but these results do not establish adequate actual-editor performance.

Repeated full-document conversion and demo screen reconstruction were the main browser bottlenecks. Server change-processing p95 was 1.89~3.54ms. The long transport-start-to-remote-callback interval includes browser event waiting. It must not be read as network latency alone.

## Conditions and measurement definitions

| Item | Condition |
| --- | --- |
| Target | Actual /pm page, demo A and ProseMirror P, HTTP POST, SSE, and JSONL persistence |
| Document | Initially 100,000 characters, 625 paragraphs, 160 characters per paragraph |
| Input | One ASCII character at a time at position 50 in the first paragraph. Real trusted key events |
| Samples | 5 warmups + 30 measured inputs + 1 diagnostic per direction |
| Interval | At least 120ms after the prior remote frame endpoint. This is not a continuous typing throughput test |
| Browser | Chrome 156.0.8078.47, headed, 1440×1000, devicePixelRatio 1 |
| Environment | Node 22.19.0, macOS arm64, 14 logical CPUs. No network or CPU throttling |
| Peer layout | 2 actual editors on one page, sharing a renderer thread |
| Persistence | /tmp/doc-sync-editor-latency-20261022 instead of existing data/ |
| Source | Git HEAD 02ec64e5e1b0a120114305c287072683c6f7002b at preparation; hashes of 33 measurement-related source files checked before and after |
| Concurrent tests | Measurement began after the parent confirmed compatibility tests and IME diagnostics had ended. External apps kept running |

The start was the key event's `event.timeStamp`. It includes browser waiting before the handler receives the event. The capture-handler start was stored separately for comparison. Both use the same browser monotonic clock.

The DOM endpoint was when MutationObserver confirmed the exact first-paragraph string on the receiver. The frame endpoint was the second requestAnimationFrame callback after that. It estimates a point after a rendering opportunity. Physical display timing was not measured. Separate traces in both directions confirmed Paint completion after the DOM update.

Core and app files were unchanged. Browser and server methods were wrapped at runtime to record durations. The wrappers called the original methods. CPU sampling and tracing were enabled only for separate diagnostic inputs excluded from measurement.

## From input to remote display

Units are ms. p95 used position floor(0.95×30) in the 30 sorted values.

| Direction | Endpoint | p50 | p95 | Maximum |
| --- | --- | --- | --- | --- |
| Demo → ProseMirror | Remote DOM update | 1,221.7 | 1,717.0 | 1,730.2 |
| Demo → ProseMirror | Remote rendering frame boundary | 1,722.4 | 2,236.9 | 2,251.9 |
| ProseMirror → demo | Remote DOM update | 1,305.9 | 1,784.4 | 2,224.5 |
| ProseMirror → demo | Remote rendering frame boundary | 2,050.6 | 2,642.4 | 3,004.4 |

From capture-handler start to frame boundary alone, p95 was 1,789.8ms and 2,559.8ms. The table above starts at event creation and includes waiting before the handler. Keep this distinction when comparing earlier progress figures.

## Times by span

Each cell is mean (p95), in ms. Mean spans can sum to the total mean; p95 values cannot be added. Server submit is measured separately within transport and must not be added again.

| Span | Demo → ProseMirror | ProseMirror → demo |
| --- | --- | --- |
| Key-event creation → capture handler | 126.9 (486.2) | 82.4 (495.1) |
| Capture handler → transport start | 1.1 (1.4) | 233.1 (242.3) |
| Transport start → remote receive callback | 820.3 (873.8) | 820.6 (1,219.2) |
| Remote receive callback → remote DOM | 388.8 (421.3) | 298.2 (322.3) |
| Remote DOM → frame boundary | 497.0 (552.4) | 661.8 (906.2) |
| Server validation, application, and JSONL persistence (separate) | 0.8 (1.9) | 1.2 (3.5) |

ProseMirror input spent a mean 233.1ms before transport started. Long tasks on the same page also delayed the receive callback after transport. Sending, receiving, and demo observation-screen costs must all decrease.

## Bottleneck evidence

The table gives p50 after summing each method's time within one input observation window. Parentheses give p50 call counts. Inclusive times overlap; do not sum rows.

| Method | Demo → ProseMirror (ms) | ProseMirror → demo (ms) |
| --- | --- | --- |
| Doc.toJSON | 569.4 (10 calls) | 866.0 (15 calls) |
| Editor.render | 379.0 (3 calls) | 372.2 (3 calls) |
| SyncClient.withEvents | 328.8 (1 calls) | 0.2 (1 calls) |
| PmBinding.dispatch | Not applicable | 408.5 (1 calls) |
| Doc.apply | 0.3 (2 calls) | 0.4 (2 calls) |

1. **Repeated full-document conversion.** `Doc.toJSON()` usually ran 10 or 15 times. Cumulative p50 was 569.4ms or 866.0ms. It reread characters and formatting across all body blocks and canonicalized them. CPU profiles also showed high self time in `unitsToRuns`, `rawBlock`, and character/format processing. [Doc.toJSON source](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/packages/doc-sync/src/crdt/doc.ts#L1313), [unitsToRuns source](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/packages/doc-sync/src/crdt/model.ts#L132).

2. **Full demo screen reconstruction.** `Editor.render()` usually ran 3 times. Cumulative p50 was 379.0ms or 372.2ms. It emptied the surface and rebuilt spans for 100,000 characters, followed by style calculation, layout, and Paint. [Demo render source](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/apps/demo/ui/editor.ts#L937), [surface reconstruction](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/apps/demo/ui/editor.ts#L1086).

3. **Cursor and status observation repeated full-document work.** `/pm` polled status every 700ms. Shared render rebuilt the demo, then converted and serialized both models. Presence updates also updated ProseMirror state and the shared screen. Cursor decoration calculation read the whole model. [Polling and shared render](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/apps/demo/ui/pm-app.ts#L176), [remote selection decorations](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/packages/doc-sync/src/pm/binding.ts#L398).

4. **Remote model-event computation also incurred full-document costs.** Demo → ProseMirror `SyncClient.withEvents()` inclusive p50 was 328.8ms. This path included before/after model creation, comparison, diff, validation, and editor callbacks. The mean after subtracting instrumented child spans was 37.2ms. The entire 328.8ms is not diff cost. [Remote model-event source](https://github.com/barocss/doc-sync/blob/02ec64e5e1b0a120114305c287072683c6f7002b/packages/doc-sync/src/sync/client.ts#L105).

5. **Simple CRDT application and server submit were smaller.** Browser `Doc.apply()` cumulative p50 was about 0.3~0.4ms. Server submit p95 was 1.89~3.54ms. Full-model and screen work cost more on this single-character path.

## Paint and network diagnostics

Each direction had one diagnostic. The following values start at the capture handler. They are separate from the 30 measured samples.

| Direction | Remote DOM update (ms) | First Paint end (ms) | Frame boundary (ms) | Paint after DOM confirmed |
| --- | --- | --- | --- | --- |
| Demo → ProseMirror | 1,178.8 | 1,631.3 | 1,668.7 | Confirmed |
| ProseMirror → demo | 1,220.1 | 1,426.6 | 1,489.0 | Confirmed |

Paint confirmation means the browser painted a frame after the DOM change. A Paint event alone does not prove when a specific pixel appeared physically. Final screenshots confirmed inserted strings in both first paragraphs and convergence.

| Direction | POST request → response headers (ms) | Header receipt → renderer response event (ms) |
| --- | --- | --- |
| Demo → ProseMirror | 80.6 | 712.0 |
| ProseMirror → demo | 3.1 | 668.4 |

Response headers arrived, but the renderer response event ran hundreds of ms later. This shows browser processing waits within the transport interval. These values describe POST responses, not a separately measured SSE latency distribution.

## Correctness, external load, and limits

All 60 measured inputs were trusted. Both first-paragraph strings matched expectations after each input. At the end, both full client models matched the server. Pending changes were 0. After 72 inputs including warmups and diagnostics, the final document had 100,072 characters and 625 paragraphs. Model-event fallback was 0.

Load averages at measurement start were 10.71 / 14.62 / 15.21. At final analysis they were 11.46 / 10.56 / 12.21. The order is 1-minute / 5-minute / 15-minute. External app CPU load remained. These results apply to that local environment.

Both editors shared one page and renderer thread. These results do not extend to independent screens or networks on other computers. Server and browser ran on one computer. Only sequential ASCII insertion was measured. IME composition, continuous input throughput, split/merge, large tables, and multi-user contention were excluded. Instrumentation and DOM observation effects were not fully removed.

This measured source after the Presence feature change. Its source point differs from the earlier monorepo before/after data. These results do not measure a migration speed change.

## Next work

1. Build and reuse a model once per change. Avoid full-model reconstruction for cursor, Presence, or status-only changes.
2. Update only changed paragraph DOM in the demo renderer. Combine duplicate updates within one frame.
3. Restrict remote event computation and ProseMirror conversion to changed blocks. Keep existing document equality and validation rules.
4. Repeat with the same 100,000-character document and 30 inputs per direction. Then measure sending and receiving in separate windows or devices.

This work measured and reported results. It did not apply those optimizations.

## Raw data and reproduction tools

- [Raw browser samples and final models](browser-raw.json), [analysis, call counts, and spans](summary.json)
- [Server submit records](server-events.jsonl), [methodology](methodology.json), [source hashes](source-manifest.json), [starting load](measurement-start.json)
- Demo → PM: [Chrome trace](demo-to-pm.trace.json), [CPU profile](demo-to-pm.cpuprofile)
- PM → demo: [Chrome trace](pm-to-demo.trace.json), [CPU profile](pm-to-demo.cpuprofile)
- [Browser instrumentation](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/install-instrumentation.js), [sample collector](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/run-batch.js), [analysis tool](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/summarize.py)
- Screenshots: [demo → PM](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/demo-to-pm.png), [PM → demo](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/pm-to-demo.png)

To reproduce, run the original demo server with `server-launch.mjs` in a separate data directory. Install instrumentation with Playwright CLI `run-code`. Set the first-paragraph caret with `prepare-direction.js`. Run `run-batch.js` with 5 warmups and 30 measured inputs. Run one separate diagnostic per direction. Export the raw data, then analyze it with `summarize.py`. Use a new output path because existing results and diagnostics must be preserved.
