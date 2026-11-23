# Typed native grid targeting and moved-grid compiler repair

Bounded Q1.3.2 PASS. This is a private native SDK command slice. It does not close
general D3 commands, hosted native recovery, production WASM or browser gates.

`insert_grid_models_relative` uses the existing process-local read base and
strict grid/row/column ownership. BeforeRow/AfterRow use a grid/row pair;
InsideCellStart/End use a grid/row/column triple. Current covered-cell body targets
reject. Row insertion can create covered cells and retains their payload.
Existing fixed-width, anchored span growth and newer-overlapping-span precedence
are preserved. No cell wrapper ID or column-creation API is added.

The moved-grid row fixture exposed a TS compiler birth-line lookup bug. The
accepted-parent gridLine helper fixes refreshGrid/gridPath without changing
Doc/Core. The no-projection fast path and last-axis deletion behavior remain.
Original red tests and failing traces are retained. Source/dist eight-case
regressions pass;50 existing affected tests pass. Only edit.js changes among138
captured dist files.

Fresh independent authoring covers14 profiles/three schemas/435 actions/870 actor
states,101 logical authorings,15 typed arrays/25 insert commands, five raw setup
calls,17 negatives and82 independent full-model oracles. Two plain merge profiles
prove covered-cell payload/foreign writers across both undo orders; a third cell
writer profile covers a newer overlapping span anchor and is not a hidden-cell
proof. Operations, IDs, clocks, pending, History, storage, foreign ledgers,
selection, own checkpoint restore and exact retry agree. The independent oracle
uses anchored endpoint growth and newer-rectangle precedence; engine
normalization is checked only for closure.

Fresh native core194/SDK182, full80-line example and two independent locked doc
consumers PASS. Complete116-file before/after maps match;83 inherited native
tests/examples remain unchanged. Fresh workspace2168 PASS/two expected platform
SKIPs/zero failures and direct TypeScript check PASS. High source review seals25
inputs. A separate empty/default-only cell probe passes12 actions on the frozen binary;
its count is separate from main435. All12 inherited stages/2924 main actions,
schema/model tests and CLI oracles pass. Docs build/checks pass56 pages/2741
links. Opening313 paths,17 earlier sealed reports and four old binaries are
protected. Final docs/preservation counts are bound
in [final checks](final-checks.json).

Native trace SHA256:
`21b14c87abb37f25e8d736e66aa1518d47f5a899042a54b4f29bec3c6c5de4c2`.
Main181 guards are stable through all four stages. Full qualified traces are
losslessly compressed with round-trip hashes. Selected sources, complete traces,
failures and receipts are sealed in the manifest volumes; executable targets
and binary-containing stage bundles stay local, with verified source-only
stage derivatives included. Existing reports and old binaries remain unchanged.

No Chrome, mobile, performance, mixed-runtime checkpoint exchange, durable
native server/process recovery, production Rust/WASM integration, commit, push,
deployment or npm publication was run. API/compiler equality is not a timing or
browser result. Next: explicit one-column-per-call targeting, then a bounded ID
read catalog. See [roadmap](../../schema-editing-roadmap.md) and HANDOFF §5.158.
