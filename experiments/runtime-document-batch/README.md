# Atomic supported model-child insert batches

This is an additive, bounded Q1.2 comparison. It does not modify the older
experiments, fixture snapshots, reports, or binaries.

The corpus has 14 profiles on three schemas: eleven profiles use the original,
unpruned Word23 and Presentation27 schemas; three profiles use the small custom
schema declared in `fixtures.mjs`. Each `batch` action calls the native public
`RuntimeDocument::insert_models_batch` once and live TypeScript `Doc.edit` once
with an array of the same insert requests. Detached TypeScript preflight uses a
separate clone. Logical compiler calls and raw wire authorings have separate
receipt counts. Negative final-command arrays compile only on a detached TS
document; this does not claim that direct live TS `Doc.edit` is atomic.

`oracle.mjs` starts with the complete pre-command model. It imports the older
read-only insertion oracle for documented anchored span growth, global columns,
and fixed existing row width. It implements the independent one-slot column
memo: another row at the same grid and index fills the existing global column;
a repeated row creates a new column and replaces the memo. Filling a previously
empty cell replaces the projected empty text placeholder. A labeled fresh
unprojected empty-grid-at-zero fixture separately expects the tail paragraph
promotion established by the compiler boundary. Returned normalization must
close the requested pure model to the result; normalization is not the oracle.

The corpus checks grid creation and multirow filling in one batch, evolving batch targeting, same-boundary column identities,
duplicate rows, fixed row width, groups, normalized empty groups/grids, true
empty arrays, clock-only edits, trailing reservations, redo preservation,
checkpoint clock persistence, and concurrent same-gap batches. It compares
complete models, exact operation order/tickets, optional command identities,
reserved clocks, full History, pending queues, retained token fields/deletion
ledgers/moves, writer tickets, and backward UTF-16 stable selections after every
action. Foreign property/text changes occur between batch commit and undo.
Both undo orders, one-action undo/redo, own checkpoint restore, repeated own and
peer delivery, and acknowledgement are covered. Product undo has a separate
full prebatch-model oracle with the surviving foreign edits.

Builds are externally serialized. After the owner builds the new example into
the new target directory, run:

```sh
BATCH_SKIP_BUILD=1 /Users/user/.volta/tools/image/node/24.22.1/bin/node experiments/runtime-document-batch/compare.mjs
python3 experiments/runtime-document-batch/compress-traces.py
```

The default binary is
`output/rust-d3-batch-2026-11-04/native-target/debug/examples/runtime_batch_trace`.
`BATCH_TS_ONLY=1` runs preparatory TS checks. `BATCH_FILTER`, `BATCH_NAMES`, and
`BATCH_LIMIT` are diagnostics. Only a complete fresh native run can report PASS.
Each run writes source/binary hash maps before and after stages and stores a
source archive. Failures and complete traces are retained; the compressor
verifies SHA256 round trips before replacing large traces with gzip files.

This is not full-product, arbitrary-schema, browser, mobile, network, release,
WASM, or performance qualification. Own checkpoint restore is not durable
server or process recovery.
