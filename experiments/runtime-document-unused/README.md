# D2: unused document schema declarations

This experiment uses the original Word and Presentation descriptors in
`fixtures/product-schemas.ts`. It keeps every declaration, including Word
`divider` and Presentation `heading1`.

Run with Node 24. The core CLI and SDK examples must use the fresh target
`output/rust-d2-unused-2026-11-04/native-target`. Set
`CARGO_PROFILE_DEV_DEBUG=0`, `CARGO_PROFILE_TEST_DEBUG=0`,
`CARGO_INCREMENTAL=0`, and `CARGO_BUILD_JOBS=1` for Cargo.

- `export-schemas.mjs` checks that the persistent JSON snapshots and manifest
  equal the original TS descriptors. `--write` regenerates both files.
- `compare.mjs` compares independently authored native SDK and TS operations
  on both original schemas. Its 84 actions include a Word section, page
  metadata and nested paragraph; a Presentation slide and layout;
  nested default paragraph/title UTF16 text, root paragraph style and inline media, two actors, foreign
  writers, undo/redo, pending retry, own JSON restore, caret and selection.
  It checks exact tickets, operations, History and pending state. It checks
  material registers and model projections with the listed receipt rules.
- `product-boundary.mjs` checks original schema admission before and after
  the change. It verifies the prior text:false CLI SHA before execution.
- `oracle.mjs` tests unused declaration validation, valid optional cycles,
  invalid required cycles, placement, `$type`, atomic invalid batches, and
  active-root behavior with unused grid/group declarations. Base and variant
  native models must match exactly. Malformed JSON and regex restrictions
  are separate native strict-subset cases.
- `compiler-boundaries.mjs` records separate D3 compiler observations for
  model insertion, empty branch insertion and same-type updates. These
  observations do not count as D2 parity checks.
- `compress-traces.py` compresses only this experiment's large raw evidence
  and verifies each decompressed SHA before it removes the raw file.

The main trace does not qualify full product coverage, nested list/table
editing, cross-runtime checkpoint exchange, renderer behavior, WASM, network,
mobile, or performance. Snapshots remain local to each runtime. The SDK
suite separately tests original schema construction and public API behavior.

Keep failed runs. A new passing receipt does not replace a failed artifact.
