# Reduce Paint and PrePaint costs in the demo — 2026-10-23

The baseline was main `f9370df85d93a69902254bbba5d6c90f95dc4559` plus uncommitted source from the prior [paragraph model reuse change](../screen-latency-2026-10-23/report.md). Prior raw data was preserved. The only additional product change was `apps/demo/ui/style.css`. Core, PM, SyncClient, transport, server, concurrent editing rules, and public API were unchanged at this stage. No commit or push occurred.

## Cause and final change

Paint and PrePaint costs remained in Chrome input spans. The normal Change path had no intentional transport-delay timer. There is no evidence that `/pm` ACK delay, Presence, GC, or heartbeat periods buffer normal Changes. Cross-process clocks and browser scheduling waits are not pure network latency.

```css
.surface > .blk.paragraph:not(:has(.composing)) {
    isolation: isolate;
}
```

Only measured top-level ordinary paragraphs are isolated. Headings, lists, quotes, table/box descendants, and image captions are excluded. Paragraphs with composition preview retain `auto`. In environments without `:has()`, the full new rule does not apply. Invalid selectors follow [W3C Selectors §3.9](https://www.w3.org/TR/selectors-4/#invalid). The validation Chrome confirmed this selector and `auto`↔`isolate` transitions. No Paint/layout/size containment, virtualization, or DOM removal was added.

`isolation: isolate` creates a stacking context under [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/#isolation). The following gains were observed in this Chrome; CSS standards do not guarantee that speed.

## Final before/after measurement

Conditions: Node 22.19.0, headed Chrome 156.0.8078.47, viewport 1440×1000, DPR 1. The same ASCII script used 100,000 characters, 625 paragraphs, 160 characters per paragraph, and first-paragraph offset 50. Each run used a new local HTTP/SSE server and JSONL store. Each direction had 5 warmups and 30 measured inputs. Both editors shared one page renderer thread. Timing ran from key-event creation to the second rAF after remote DOM confirmation. This is not physical display timing.

| Direction | Before p50 / p95 / maximum | Final improvement p50 / p95 / maximum | Final baseline repeat p50 / p95 / maximum |
|---|---:|---:|---:|
| Demo→PM | 81.0 / 111.7 / 135.8ms | 35.9 / 69.5 / 74.1ms | 79.1 / 108.1 / 132.2ms |
| PM→demo | 88.7 / 120.4 / 175.8ms | 45.4 / 68.5 / 72.5ms | 88.4 / 121.9 / 124.1ms |

Observed p95 decreases from the first baseline were 37.8%/43.1%. In all 210 inputs including warmups across the 3 accepted runs, both clients matched the server model and pending/fallback were 0. Product hashes matched between before and final baseline repeat. Final improved hashes matched current source; the before/after difference was one CSS file. Initial JSONL seeds also matched across all runs.

Starting→ending 1-minute load averages were before 53.68→40.72; improvement 15.62→10.23; baseline repeat 10.50→9.45. External apps and existing user servers/tabs were retained. No own regressions or other benchmarks ran during timing. Failed-candidate exploration and QA occurred between initial baseline and final candidate. Frozen baseline was remeasured after the final candidate. This is not a statistical causal experiment with controlled external load or a product SLO pass.

`before/`, `after/`, and `before-repeat-final/` contain per-input raw data, summaries, source hashes, actual document JSONL, diagnostic server events, conditions, and scripts. `comparison.json` aggregates the final 3 runs. Document JSONL may also contain separate trace inputs after formal measurement. Formal 70-input judgments use each `browser-raw.json` and the server model at the time. Trace inputs are excluded from p95.

Run each `measure.py` from repository root with Node 22 on PATH. Set `DOCSYNC_MEASURE_OUT`, `DOCSYNC_SESSION`, and, if needed, `DOCSYNC_SOURCE_ROOT` to new paths. Adjust templates and absolute output paths in `export-results.js` and `profile.js` too. Preserve existing results. Runs use the local Playwright CLI wrapper and installed Chrome. `run.json` records actual absolute paths, temporary DATA, and load. Final repeat used the preserved baseline copy and a separate node_modules link pointing to its packages.

## Final source traces

Three inputs per direction were recorded outside formal measurement. Main-thread spans were clipped from input to the second rAF. Nested events of the same kind used the union of intervals. Nested `#document`→`HTML` Paint was not simply added. Event kinds can overlap; do not add the columns below.

| Direction | Paint median before→after | PrePaint median before→after | Layout median before→after |
|---|---:|---:|---:|
| Demo→PM | 29.856→13.674ms | 19.973→0.558ms | 9.601→7.381ms |
| PM→demo | 30.331→19.890ms | 20.744→0.636ms | 10.204→10.614ms |

A large Paint clip/root does not prove all 100,000 characters were repainted. Initial diagnostics showed about 232~236 new inline objects, similar to the changed paragraph length. Paragraph DOM creation and layout costs remain. These data do not measure GPU composition, physical display timing, or pure network latency. `*.trace.json.gz` and `*.cpuprofile.gz` are original gzip files. `analyze-trace.py` reads an extracted trace folder and creates per-kind union summaries.

## Candidates rejected after regression

The first candidate isolated every `.blk`. Paint order changed where a long label overlapped composition text in the next heading. Static candidate→baseline→candidate comparisons repeatedly differed by 155 pixels; candidate-to-candidate differed by 0. This candidate was rejected. Its p95 93.7/108.3ms is not final performance. Raw data remains in `after-rejected/`, `rejected-source.diff`, and `rejected-boundary/`. A 5-pixel callout-boundary difference in an intermediate candidate was also preserved. Optimization scope was narrowed instead of adding arbitrary z-index or overflow changes.

The first expanded capture of the final selector had a 2-pixel callout-corner residual. Candidate and baseline repeat matched; only the first baseline differed. Retesting with the same threshold after 500ms idle following scrolling gave 0 pixels with RGB channel difference above 12 in all 13 pairs and 13 baseline repeat pairs. This residual was not labeled as label occlusion, and tolerance was not increased. Tool viewport, locator, and result-path errors remain local failure records and are excluded from final passes.

## Tests and validation scope

The same core/demo TypeScript source passed `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` with core 144 + demo 10 and failures 0. Compatibility unit tests 31, type checks, and a separate compatibility bundle build also passed. CSS scope was narrowed afterward; final CSS was revalidated in Chrome.

- Basic demo Chrome: 30 regressions passed, covering DOM retention, polling, formatting, undo/redo, structure, tables, boxes, and Presence.
- Compatibility Chrome CDP: 84 inputs passed. Convergence/expected values were checked in 20 general regressions, with 30 operation records captured. Evidence checked `passed` 84, `captured` 30, final snapshot checks 18, and diagnostic opt-in checks 2, beyond the exit code.
- Boundary screens: 13 pairs, 13 baseline repeat pairs, and separate IME B→A→B had 0 pixels with RGB channel difference above 12. Composition start/update/end auto↔isolate transitions and 10 functional checks passed. Server and 3 client models/pending were compared. This is not actual OS IME evidence.
- Supplementary list-marker test: 8 actual bullet-ink pixels from a label-free reference overlapped the label region. Before/after and baseline repeat had 0 changed pixels; labels had 828 colored pixels on both sides.
- Two core deletion/Bold concurrency probes: delete `c` vs Bold `c`, and delete `c` vs Bold `bc`. Both arrival orders and duplicate delivery produced equal models. The first gave `ab`; the second made only surviving `b` bold. These are core probes, not browser tests or new policy implementation.

Evidence is in `checks/`, `boundary/final-report.md`, and `validation.json`. Full browser originals are local in `output/playwright/screen-next-*20261023/`.

Actual OS Korean IME, large-table/contention performance, memory targets, lease-expiry recovery, 30-minute/1800-round/1Hz, G0/G1, and two weeks of actual CI are outside this approval. Full computation remains for initial creation and after structure changes, revival, and GC. Returned copying, conversion, DOM, layout, requests, and frame waits also remain. Existing user servers, tabs, and data were untouched. Only this validation's servers and Chrome sessions were closed.
