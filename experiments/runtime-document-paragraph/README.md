# D3 explicit nested paragraph comparison

`fixtures.mjs` uses the original public Word (23 nodes) and Presentation (27 nodes) schemas. It checks both the public source SHA and the preserved unpruned schema snapshot. It does not change the D2 unused fixtures or receipts.

The shared logical contract is `insertParagraph` or `insertModel`, with an explicit child insertion path in `at` and the same model node in `model`. TypeScript authors `Doc.edit([{op:'insert',at,content:[model]}])`. Rust authors through the model insertion SDK. Physical `after`/`right` block helpers are a separate surface.

The fresh `[1,0]` cases use the original empty paragraph model. The corpus also has insertion in middle/end slots, required/default projections, non-default structured style, marked UTF-16 runs, nested container models, paragraph undo/checkpoint/redo, concurrent actors, foreign-writer fences, stable selections, own checkpoint restoration, and pending retries.

The comparison checks exact operations and tickets, full History, pending changes, models, material storage, registers, deletion ledgers, and clocks. Wire/model representation conversions are listed in each receipt. No ticket normalization is permitted.

Two additional profiles seed the original automatic head with `HEAD😀`, then let B place that head after a required sibling before A compiles an end paragraph insertion. B's lower-clock operation arrives after A compilation. A's undo, own checkpoint, redo, and retries must retain B's exact original placement writer and all six original UTF-16 tokens with their IDs, values, attributes, and deletion state. Paragraph compiler moves must target nodes born in that same transaction. An undo must restore the complete pre-paragraph canonical model. Schema cardinality can hide overflow content in that model; the raw token retention check is separate.

Negative TypeScript document edits run on a clone. The original document checks the compiled wire and retains its full checkpoint. This proves the staged compiler/check route; it does not claim direct `Doc.edit` atomicity. Rust negative SDK edits must reject before mutation.

`input-boundaries.mjs` records the existing invalid supplied attribute behavior separately. TypeScript `Doc.edit` normalizes those values; the native SDK rejects them. The main trace uses valid model attributes and tests invalid raw field writes through the wire validator. This boundary is not an invalid-input equivalence claim.

After TypeScript dist and native sources freeze:

```
PARAGRAPH_SKIP_BUILD=1 node experiments/runtime-document-paragraph/compare.mjs
```

The existing D3 native target must contain `debug/examples/runtime_paragraph_trace`. Without `PARAGRAPH_SKIP_BUILD`, the driver builds only the D3 target, with debug information and incremental compilation disabled and one job. It never builds the preserved D2 target.

`before.mjs` records the old TypeScript dist compiler observations. The retained old result is `output/rust-d3-paragraph-2026-11-04/compare-before/old-dist-observations.json`. Running it after the dist rebuild is a new observation and must use a separate output path.

`regressions.mjs --prepare` creates three output-only adapters for inherited admission oracles. Their original/adapted hashes and exact one-line diffs are retained in `compare-inherited-source-map.json` and companion diff files. Prepare them before the final source freeze. Then `regressions.mjs` runs the original unused84 and textfalse90 traces plus the valid oracles using only the D3 native target. It verifies the old unused CLI and all twelve prior report seals before and after. It explicitly excludes the old compiler failure assertion and the old textfalse product probe that expects unused schema rejection.

This corpus does not claim full product, browser, renderer, WASM, network, mobile, or performance parity.
