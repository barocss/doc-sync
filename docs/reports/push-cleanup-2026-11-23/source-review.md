# Source review before push and cleanup — 2026-11-23

Scope: read-only review of inherited work in `/Users/user/github/doc-sync`, based
on main `308e8b4`. This report adds no product changes. No Cargo command, test,
Git mutation, cleanup, release, or deployment was run by this reviewer.

## Source result

The work includes native D2 schema/runtime additions, D3 paragraph/model/batch/
stable/grid/column targeting, a local ID catalog prototype, TypeScript compiler
and required/default projection fixes, explicit IPv4 test-server bindings, docs,
fixtures, and evidence capsules. These parts must be preserved together.
Publishing the catalog files alone would omit required inherited native modules.

`runtime_paragraph.rs` includes the catalog module under the runtime schema
module, and `lib.rs` exports its public types.
`RuntimeDocument::read_model_with_catalog` captures the current model and
original process-local edit base, uses the strict target walker, omits synthetic
defaults and covered descendants, and returns stored blocks and owned grid axes/
uncovered cell tuples. It restores a temporary helper from a checkpoint. This is
an allocation/performance consideration, not a measured failure.

Five catalog tests cover read purity and repeatability, default exclusion, moved
and grouped paths, column/cell command consumption, covered stored descendants,
deleted grids, lower-clock remote invalidation, and restore invalidation. The
Nov 16 receipt records five focused tests plus 30 inherited targeting tests and
the example PASS. All seven source hashes in that receipt match current files.
These are preserved historical receipts, not fresh test results from this review.

Full Q1.3.4 qualification remains open: broader required/nested fixtures,
independent comparison, and complete external consumers are still missing.
Full D2/D3 and production Rust/WASM Client integration are not established by
these sources or receipts. Code takes precedence over stale roadmap status.

## Fresh checks for the root agent

Use one controlled Cargo target location and run Cargo checks sequentially.
Required commands from repository root:

```sh
cargo test --manifest-path experiments/rust-shadow/Cargo.toml --locked
cargo test --manifest-path experiments/rust-sdk/Cargo.toml --locked
cargo run --manifest-path experiments/rust-sdk/Cargo.toml --locked --example runtime_id_catalog
npm test
npm run typecheck
npm run docs:build
npm run docs:check
```

`npm test` builds packages first. The native SDK suite includes the new catalog
tests and inherited targeting tests. Workspace tests cover changed TypeScript
compiler/projection behavior and recovery/process fixtures. Docs build/check
cover generated content and navigation. Do not add mobile tests. Do not rerun
long nightly/property workloads solely to claim this push is a release.
Record actual fresh results and first failure separately from historical PASS.

## Push content and cleanup boundary

At review time, Git reports 345 untracked files, 1,051,883,251 bytes in total.
The largest is `docs/reports/rust-d2-fieldrefs-2026-11-04/evidence.tar.gz` at
96,125,586 bytes. No individual untracked file exceeds 100 MiB. The aggregate
upload is large. The 31 evidence archives contain 9,391 members. Member names
contain no `node_modules`, `target`, `.git`, or `.env` path components.
Four archived trace/failure JSON members exceed 100 MiB uncompressed; they are
historical evidence, not Cargo build output. Keep existing seals and hashes
intact when preserving those capsules.

Common plaintext private-key, GitHub-token, OpenAI-key, and AWS-access-key
patterns were not found in the reviewed `.rs`, `.mjs`, `.ts`, `.md`, and `.json`
trees. This bounded pattern scan is not a full secret audit. Compressed member
contents were not scanned for secrets.

Do not publish regenerated Cargo targets, package dependencies, package dist,
docs site output, runtime data directories, or temporary locked consumers.
Do preserve sources, tests, fixtures, docs, and intended report capsules.

The catalog evidence exists only in ignored
`output/rust-d3-id-catalog-2026-11-16/`. Before deleting that directory, preserve
its README, receipt, review, final focused/example logs, initial failed attempts,
and necessary source/baseline evidence in a tracked report capsule. Exclude its
`native-target` build directory. Otherwise HANDOFF references would lose their
only backing evidence. Other ignored output evidence needs the same explicit
coverage check before deletion. Do not delete source or user-owned sessions
merely because a temporary directory has a similar name.

No source-level release blocker was established by this bounded inspection.
Fresh build/test results, successful remote push verification, and exact cleanup
ownership remain the root agent's completion gates. Preserve catalog prototype
limits in the final commit/report; this push must not imply feature closure.
