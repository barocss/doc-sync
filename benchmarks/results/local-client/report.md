# Memory-only TypeScript client

This compares main `12da94d527d4a9edcca7d0a5752f73ea615f6459` with the
LocalClient candidate. Node 24.22.1 runs real headless ProseMirror on macOS
arm64. It does not measure browser paint, OS IME, network synchronization or
physical display latency. Native binding regressions also use real headless
Slate and Lexical editors.

## Conditions and correctness

`benchmarks/local-client.mjs` runs 10,000 and 100,000 UTF-16 ASCII units in
100-character paragraphs. Native insert, delete, mark and selection, composition,
external edits, undo and redo form 16 size/scenario cells. Each timing target
uses three blocks, three warmups and ten measured fresh-fixture samples per cell.
Verification is outside the timed action. The baseline uses the real offline
SyncClientEditorHost and an inert transport with zero calls; the new local
implementation has no transport or SyncClient. External Sync edits explicitly
pull the binding; Local notifications perform that pull automatically.

Baseline Sync, candidate Sync and candidate Local count runs each pass 16/16.
Common model/operation hashes match. Ordinary native edits add zero snapshots
and no extra model/PM conversion calls. Existing conversions remain: at 100k,
insert/delete perform one Doc.toJSON and 2,001 recursive PM fromJSON calls;
mark uses 2,003. Selection uses zero. Composition retains one snapshot/restore.
No self-echo pulls occur after local native input. All 68 pre-existing JavaScript
files in the frozen Core/PM/Slate/Lexical/facade scope match baseline. This hash
scope excludes Tiptap and is not every repository generated file.

Four actual binding regressions pass for native input, external edits,
selection, undo/redo, complete multi-apply commits and composition with a live
external edit. Six rich-profile model cases cover text/structure/attributes,
movement, hidden merged-cell content and independent unrecorded changes.

## Timing and retained limits

Before measurement, investigation guards were fixed at median increase above
max(10%, 0.1 ms), or p95 increase above max(15%, 0.2 ms). Original full timing is
**18 PASS / 14 INVESTIGATE** across 32 baseline-versus-candidate comparisons;
seven flags also occur in the byte-identical Sync control. The adjacent
`timing-comparison.json` preserves every original score.

A same-process A/B/B/A diagnostic using the unchanged benchmark retains
**14 PASS / 2 INVESTIGATE** across 16 cells. Its adjacent
`paired-comparison.json` preserves the two flags: 10k redo p95 and 100k delete
median. A focused repeated-input A/B/B/A profile runs 20 warmups and 100
observations per block, 200 samples per backend/case, with equal profiling:

| Case | Baseline median | Local median | Baseline p95 | Local p95 |
| --- | ---: | ---: | ---: | ---: |
| Redo, 10k | 1.932 ms | 1.916 ms | 2.285 ms | 2.304 ms |
| Delete, 100k | 1.722 ms | 1.681 ms | 1.897 ms | 1.808 ms |

Both focused cases meet the unchanged guards. This repeated-input diagnostic
excludes fresh-fixture setup and is narrower than the original run. Direct
wrapper CPU samples are sparse; no persistent Local-only source hotspot was
established. No runtime change was made in response to timing variation.
Original full timings remain flagged. This is neither zero-overhead proof nor
general editor latency acceptance.

The first attempted timing run exhausted the default heap because the harness
did not yield between closed fixtures. Yielding outside the measured interval
fixed harness retention; all final targets use the same corrected helper. The
aborted run supplies no valid timing result and is not a product memory result.

## Reproduction and receipts

Build each worktree with Node 24.22.1 before running, and keep build jobs
separate from benchmarks. Restore the named baseline source before measuring;
do not label a modified main tree as that baseline.

```sh
node benchmarks/local-client.mjs --target=/path/to/baseline --backend=sync --mode=counts --output=output/local-client/baseline.json
node benchmarks/local-client.mjs --target=/path/to/candidate --backend=local --mode=timing --reps=10 --warmups=3 --blocks=3 --output=output/local-client/local.json
```

Ignored `output/local-client/receipt.md` indexes frozen inputs, all count and
timing samples, separate-process diagnostics, same-process `paired-abba.mjs`,
`focused-profile.mjs`, CPU profiles and retained failed-run logs. Tracked summary
JSON retains original and paired scores; absolute input paths identify this
local run and are evidence, not portable execution paths. Local storage,
refresh recovery, Tiptap local-host support and Rust/WASM backends remain open.
