# Native product editor performance

## Scope and conditions

This run connects each product schema to the public Slate, Lexical and ProseMirror bindings in the product demo. All three native editors share one localhost HTTP/SSE document. The library and concurrency policies are unchanged. This is a small-versus-large workload comparison, not a before/after optimization result or an editor-vendor ranking.

Environment: Node v22.19.0, Chrome 156.0.8078.47, macOS-15.6.1-arm64-arm-64bit-Mach-O, Apple M3 Max, 14 logical CPUs, 36 GiB RAM. Viewport: 1680×1100. React and editor bundles use development mode. Backend state is isolated in fresh temporary directories. Every measured target was inside its editor viewport and the browser viewport.

The sample keeps the complete rich model. The large workload adds exactly 100,000 UTF-16 text units in 625 paragraphs and 20 nested containers, in addition to the rich sample and generated container labels. Word uses sections with headers/footers; Notion uses nested toggles; presentations use slides with text boxes and notes. Input targets remain nested paragraphs in the rich sample: Opening text, Details and Result summary. The presentation view is an outline, not a spatial canvas.

| Profile | Size | Initial text UTF-16 units | Model nodes | Generated paragraphs |
| --- | --- | ---: | ---: | ---: |
| notion | large | 100,472 | 723 | 625 |
| notion | sample | 241 | 58 | 0 |
| presentation | large | 100,678 | 765 | 625 |
| presentation | sample | 187 | 40 | 0 |
| word | large | 100,576 | 766 | 625 |
| word | sample | 225 | 41 | 0 |

Each profile/size uses a fresh document. Word source order is Slate → Lexical → ProseMirror; Notion is Lexical → ProseMirror → Slate; presentation is ProseMirror → Slate → Lexical. Each batch has 5 warmups and 30 measured native keyboard inputs of one ASCII character. The measured set contains **540 inputs**, with **90 warmups excluded**, and **1,080 remote DOM/rendering-opportunity endpoints**. No samples or high-latency outliers were removed.

Full native/client/server models are checked before and after each batch, outside measured input intervals. Each input also waits for all three DOM matches, the second requestAnimationFrame and empty pending queues. Model polling and operation tracing do not run inside the measured interval. Timing hooks record timestamps at beforeinput, commit entry/exit, transport send/response and SSE handler entry/exit. DOM observers check the target paragraph, then wait for two requestAnimationFrame callbacks. All measured input events were trusted Chrome events. This does not test an actual OS IME.

## Observed input-to-peer latency

For each source below, the reported peer value is the worse p95 of its two remote editors. Percentiles use nearest rank on 30 samples. Values are milliseconds.

| Profile | Source | Sample peer p95 | Large peer p95 | Large input→commit p95 | Large local DOM p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| word | Slate | 61.2 | 332.3 | 50.6 | 1.0 |
| word | Lexical | 174.5 | 607.1 | 141.3 | 0.9 |
| word | ProseMirror | 45.3 | 621.7 | 5.1 | 5.5 |
| notion | Slate | 77.2 | 345.6 | 50.5 | 1.0 |
| notion | Lexical | 61.0 | 544.5 | 150.1 | 1.0 |
| notion | ProseMirror | 62.2 | 549.7 | 4.3 | 4.6 |
| presentation | Slate | 44.7 | 336.4 | 51.4 | 1.0 |
| presentation | Lexical | 45.0 | 558.3 | 156.7 | 1.0 |
| presentation | ProseMirror | 210.1 | 550.6 | 4.9 | 5.3 |

The large workload has a visible delay: worst-peer p95 spans **332.3–621.7 ms** across the nine profile/source combinations. Small-profile values span **44.7–210.1 ms** and include retained jitter. These results do not support a claim that large-document editing is fast enough for release. No product performance target was agreed, so the measurement protocol is complete but performance acceptance remains open.

## Where the time is observed

| Receiving editor | Large-workload SSE handler p95 range |
| --- | ---: |
| Slate | 226.8–237.0 ms |
| Lexical | 103.6–161.2 ms |
| ProseMirror | 3.7–4.5 ms |

These timestamps locate a costly application phase, not an individual function. In the current source, Slate synchronization converts and replaces the native tree; Lexical also rebuilds its tree on remote updates. Their whole-document conversion/replacement paths are the next profiling candidates. ProseMirror uses a narrower native update, but shares the same main thread with the other two editors. A short ProseMirror handler does not make the combined end-to-end path fast. No CPU self-time claim or library optimization is made here.

Handler spans have different completion boundaries when an editor queues work. The separate DOM endpoint includes that later work. Input→HTTP response includes JavaScript scheduling and other editor work; it is not pure wire latency. Independent p95 values are not additive.

## Correctness and visual checks

- 90 native Chrome cases: Unicode insertion/deletion, forward/backward selection through remote input, native formatting, participant undo/redo with foreign edits, and nested split/join across all nine profile/editor combinations.
- 39 context/structure cases: header/footer/caption/cells; columns/database cells/callouts/tasks; notes/object groups/titles/cells; merged cell visibility, retained hidden foreign content/fields and history.
- Every functional step checks native editor, client and server equality. Event-application fallbacks are zero in the bounded checks.
- Each performance batch has full model equality before/after and zero event-application fallbacks. Raw records preserve per-peer timing, visibility, trusted-input state and long-task observations.
- Twelve UI checks pass for desktop/mobile layout, repeated seeding that retains edits, and invalid profile/document/size rejection. Rich-sample desktop/mobile screenshots were inspected.
- Aggregate verification passes 600 library + 16 demo + 27 documentation tests with FUZZ_SEEDS=3000 PM_SEEDS=300; compatibility 31; typecheck, product build, documentation build/link checks and root startup smoke.

## First failure and limits

The first structure check selected a paragraph containing Reviewer when it intended the cell whose text was Review. The application converged, but the requested cell was unchanged. The check now uses exact paragraph text and verifies the native model path before typing. The original script, failure and state are retained in local output. No library rule was changed to address this test setup error.

The native views validate structured editing, not Word pagination, Notion database execution or a PowerPoint canvas. Media/atoms use safe text placeholders. Native style/layout fidelity, real OS IME, paste/import/export, accessibility, WAN behavior and production build performance are separate work. Existing user tabs and preview services were preserved.

This is one development run on shared hardware, not a randomized or ABBA experiment. The three editors share a main thread and a renderer, and source order is fixed within each profile. Thermal state, GC and other system activity can affect results. DOM match plus the second requestAnimationFrame is a rendering-opportunity proxy, not physical screen timing.

## Reproduction and records

Run `npm run dev:products` after installing the comparison harness dependencies described in `apps/demo/products/README.md`. The reusable native scripts and performance template are in that folder. Raw batch JSON and `summary.json` are stored next to this report. `validation.json` records exact source/evidence hashes and final test results. Local CLI logs, first failures and screenshots are under `output/validation/product-native/` and `output/playwright/product-native/`. No timing data from the earlier flat-paragraph demo is treated as a comparable baseline.
