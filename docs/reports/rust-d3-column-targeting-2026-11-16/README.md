# Q1.3.3: explicit single-column targeting

Local continuation finalized on 2026-11-16. This report separates historical
comparison execution from fresh verification; no remote publication is included.

## Scope

`insert_column_relative` in `experiments/rust-sdk/src/runtime_column_targeting.rs`
creates one Document-grid column at Start/End/Before/After stable-ID boundaries.
Unique row payloads preserve caller order and span-writer priority. Omitted rows
receive defaults; empty payload creates one structural column. The target grid's
row IDs remain unchanged, including when payloads contain nested grids.
Current ownership and opaque local-base validation reject deleted/wrong-grid
axes and duplicate payload rows atomically. Existing covered payload and merged
span behavior remains unchanged. This is not a server acceptance token.

## Evidence and verification

- Historical comparison: 2026-11-04 run, 14 profiles, 422 semantic actions,
  844 actor states, 79 full-model oracles and 14 complete-undo oracles.
  All 186 source/binary hashes match the resumed checkout; not rerun today.
- Fresh native: core194 and SDK191 PASS; runnable example, two independently
  locked documentation consumers, CLI and inherited drivers PASS.
- Fresh inherited regression: all14 stages PASS, 3359 main actions plus a
  separate12-action empty-cell probe and schema/admission/product oracles.
  Before/after319 path maps,18 prior report seals and pinned binaries preserved.
- Fresh Node24 workspace:2170 total/2168 PASS/two platform SKIPs/zero failures.
  Typecheck, documentation build/check PASS; initial incompatible system npm
  failure is preserved separately. Outcomes are in `final-checks.json`.
  These local results do not establish remote nightly recovery.
- The archive manifest records the selected source and evidence
  bytes; archives are read back and hashed, not inferred from filenames.

## Boundaries

Q1.3.4 native ID read catalog remains next. Full D3, general multi-column atomic
commands, axis moves, D4/D6/D7, production WASM, durable native recovery and
mixed-runtime checkpoints remain open. Browser/mobile/performance not run.
Two obsolete expectation scripts remain excluded by the inherited runner:
unused/compiler-boundaries expects a now-fixed fresh-slide style failure;
textfalse/product-boundary expects now-supported unused product rejection.
No commit, push, registry action or deployment was performed. Existing WIP is
preserved; this report does not authorize publishing unrelated changes.
