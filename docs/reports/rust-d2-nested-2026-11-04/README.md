# Recursive runtime Document schemas

Status: **PASS for the declared native flow/text/atom slice. D2 and D3 remain open.**
Source base: `1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4`, with the source hashes in
this report's evidence archive. No registry release or browser qualification is
part of this work.

## Implementation

Runtime Document descriptors can now contain recursive `flow` nodes, `text`
nodes and `atom` nodes. Each flow has its own allowed children and default text
type. Supported custom node names, scalar attributes and Boolean marks use the
existing nested CRDT storage, projection, History and selection implementations.
Empty nested bodies use the declared flow default. Existing flat runtime
schemas and the six fixed presets keep their earlier paths.

`RuntimeDocument` adds `insert_block_in`, `insert_text_in`, `flow_head`,
`flow_text_ids`, `reparent_block`, `capture_selection` and `resolve_selection`.
Insertion helpers address physical source tokens. They do not compile all
current model positions after movement. Reparenting after an already moved
block resolves the accepted placement writer, including cycle rejection,
instead of using its original birth token.

The [native SDK README](../../../experiments/rust-sdk/README.md) and
[Rust guide](../../../apps/docs/src/guide/rust.md) include the same complete
nested two-actor example. It is extracted and executed as a separate Cargo
consumer. Its checkpoint, pending replay twice, acknowledgement, foreign-text
preservation and undo/redo assertions pass.

## Verification

| Check | Result | Boundary |
| --- | --- | --- |
| Before recursive compiler support | FAIL / UnsupportedSchema | Original focused rejection at `$.nodes.box.shape`; independent archived baseline rejection at `$.nodes.section.shape` retained |
| Accepted placement exposure and moved-anchor helper | FAIL before, PASS after | Logs preserve both discriminators |
| Native shadow core | 89 PASS, zero FAIL | Includes 11 new focused cases |
| Native SDK | 55 PASS, zero FAIL | Includes seven recursive runtime cases |
| Legacy runtime comparison | PASS: 6 profiles, 82 actions, 164 actor states | Graphic, flat Document and custom sparse sheets |
| Independent recursive authoring | PASS: 2 renamed depth-three descriptors, 162 actions, 324 actor states | Native authors its own operations; TS uses `Doc.edit` and `History` |
| Unsupported descriptor cases | 7 rejected | Unsupported shapes and rules do not silently enter the supported slice |
| Coupled checkpoint recovery | 14 checkpoints | Exact document/History/pending preservation within each runtime |
| Empty root/nested selection | 6 captures | UTF-16 follow-up insertion, including emoji, in the qualified fixture |
| Documentation example | PASS | Identical fenced examples executed with Cargo/rustc 1.87 |

The independent corpus covers concurrent inserts, formatting, deletion,
attributes and movement, foreign-write ownership during undo, redo, flow cycles,
checkpoint restoration, duplicate pending delivery and acknowledgement. Invalid
parent, child, operation, attribute, acknowledgement and checkpoint attempts
must leave the prior coupled state unchanged.

Full raw History identity references are exact, including undo/redo entries,
writer and move references. Pending operations and carets are compared. Typed
operations compare UTF-16 units and explicit defaults for omitted fields.
Normalized models, clocks, material token order, attribute writers, deletion
and cancellation ledgers and moves also match. Native sources retain the same
46-file hash map throughout the SDK tests and example execution.

### Declared projection differences

Native checkpoints save an accepted operation journal; TS snapshots save token
lines. Recovery equality is checked within each runtime. This does not establish
cross-runtime checkpoint or wire compatibility.

The storage comparison omits only unwritten, sole-head derived text/fragment
lines whose keys match `/^0@~(?:text|fragment):/`, with no attributes, deletion
or cancellation entries and no History, pending or move reference. Ordinary
root/flow body heads and authored data remain. The final evidence records
1,786 such occurrences across 134 actor rows, with the raw traces retained.
Root token defaults and collection order also have explicit format projections.
History ownership references are never removed or normalized.

## Integrated workspace and documentation

The final sequential `npm test` passes **2,110 cases: 2,108 PASS, zero FAIL,
two expected platform SKIPs, zero cancelled**, in 124.905 seconds. Production
TypeScript source is unchanged by this native work. Documentation build passes
in 12.372 seconds; its check passes 55 pages and 2,610 internal links, with
English content and no local checkout paths in the generated site.

The earlier full run failed in 116.830 seconds because this session ran the
documentation prebuild alongside tests. Both invoke the package builder, which
removes `dist` before recreating it. The first child failure could not import
`dist/crdt/text-storage.js`; the affected MCP group had 99 PASS/25 FAIL, all
associated with unavailable modules or their child-startup wrappers. The
independent execution-race receipt and original failed log remain in the
archive. No assertion or test timeout was weakened to obtain the final PASS.
See [final check summary](final-checks.json).

## Observed command gap

The earlier expanded 150-action corpus **FAILS** at
`article-callout/create sibling recursive flow`: native physical-source
insertion emits `Node37`; TS model-position insertion emits `Node37 + Move38`.
This is **OBSERVED_COMMAND_MISMATCH / D3_NOT_IMPLEMENTED**, not NOT_RUN. The
original fixtures, native and TS traces and failure receipt are retained. The
failed binary hash is retained; compiled binaries are excluded from the portable
archive.

The qualified 162-action corpus creates the later cycle-test sibling flows
before movement and checks physical-source insertion separately from movement.
Its PASS does not close or supersede the model-position command gap. A full
EditOp compiler is the next distinct delivery step.

## Remaining work

Runtime tables/grids, groups, inline nodes, spans, value marks, structured
Document attributes, cardinality and computed rules remain unsupported. Complete
Word/Notion/presentation descriptors, `text.next` split authoring and arbitrary
virtual-tail selection/follow-up insertion are not qualified. Existing fixed
preset support is a separate scope.

No production server/GC recovery, live schema transition, common Map/List native
facade, CRDT WASM artifact, Client engine factory or editor integration is added.
Chrome, mobile, performance and mixed-runtime networking were not tested here.
No claim of full D2 completion or same-binding TS/WASM interchange is made.

## Reproduce

From the repository root, with Node 24 and Cargo dependencies available. The
current nested comparison driver uses `/opt/homebrew/bin/cargo`; its recorded
execution is on macOS with Homebrew Cargo. The legacy driver selects the local
rustup toolchain. Other host layouts need an explicit driver-path adjustment:

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
NESTED_OUT=output/my-nested-comparison node experiments/runtime-document-nested/compare.mjs
RUNTIME_SCHEMA_TARGET=output/my-runtime-target RUNTIME_SCHEMA_OUT=output/my-runtime-comparison node experiments/runtime-schema-native/compare.mjs
```

Use a new output directory to keep the recorded comparison intact. The current
nested driver keeps its own Cargo target below the task output directory. See
[evidence manifest](manifest.json) and [selected evidence archive](evidence.tar.gz)
for source hashes, final and failed traces, logs, review and executable fixtures.
The archive excludes build targets and executables. Absolute checkout paths in
original receipts are provenance, not portable execution paths.
