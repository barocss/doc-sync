# Unused node declarations

The private native runtime accepts supported node declarations that are not
reachable from the root. Original Word and presentation registries compile
without pruning. Every declared specification is still validated. Declaring a
type does not grant placement under a parent that excludes it.

## Implementation and compatibility

The compiler removes the document reachability rejection. Global validation
continues to check unused shapes, attributes, references, default/next rules,
grid/group structure and positive required-child cycles within the native subset.

Two additional checks prevent newly admitted declarations from changing active
behavior. Engine routing considers root-reachable node features while retaining
the existing global value-mark criterion. Unused grids/groups no longer switch
an active flat flow into nested storage. Flat text/atom classification also
checks root placement membership, so declared spare leaves cannot be born or
selected by `$type` at a disallowed root. Nested and graphic placement rules
remain. Initial metamorphic and orphan-placement failures are retained.

Descriptors remain in schema identity, DTO and checkpoints. Adding an unused
declaration changes schema identity; it does not migrate an existing document.
A registry entry and a parent-child permission have separate roles.

## Original product evidence

The deterministic export in `experiments/runtime-document-unused` retains the
original Word registry (23 nodes) and presentation registry (27 nodes). The source,
snapshots, schema identities and manifest hashes are checked against the public
fixtures. No unused declaration or constraint is removed in the qualifying traces.

The main trace covers concurrent root text/marks, attributes, selection and raw
foreign-writer protection. It also inserts real Word sections and presentation
slides, edits their metadata, and writes into the existing default internal
paragraph/title. It compares exact operations/tickets, full History, pending,
carets, material state, undo/redo, own JSON checkpoint restore and exact retry.
Actual `Doc.edit` and raw `Doc.emit` authoring are counted separately.

This is bounded product evidence. Explicit nested paragraph construction exposes
an existing D3 compiler difference: TypeScript emits field/default reset writes,
different tickets and a different placement boundary from the native helper.
A direct paragraph insertion into a fresh slide can also produce a TypeScript
wire-invalid `style: null` birth. These observed failures remain separate;
the qualifying main uses supported default internal text. List/table authoring
and broad product-editor equivalence are not claimed.

## Verification

Final commands, counts and source bindings are in
[final-checks.json](final-checks.json). Initial failed attempts remain distinct
from authoritative source-bound reruns. The complete inherited text-disabled
corpus is rerun; the historical 23-driver suite is not rerun for this slice.

SDK tests cover supported unused text/atom/grid/disconnected-flow declarations,
malformed unused definitions, missing references, wrong-parent placement,
forged birth/type batches, rejection atomicity, schema identity/DTO/checkpoints
and original Word/presentation concurrent editing. The runnable README/guide
program is compiled and executed in two independent Cargo consumers.

Final bounded verification: native core **189 PASS**, SDK **120 PASS**. Original
Word (23 nodes) and presentation (27 nodes) retain their complete registries.
The main passes **84 actions / 168 actor states**, with **24 actual staged
Doc.edit authorings** and **four raw Doc.emit authorings**. The inherited complete
text-disabled corpus passes **90 actions**. Oracle coverage: **14 schema cases /
20 placement and atomicity cases / three exact native-model metamorphic variants**.
Seven D3 compiler observations remain separate; the summary status is
**BOUNDED_PASS_WITH_D3_OBSERVATIONS**, not full product-command parity.

The final workspace command `npm run test --workspaces --if-present` passes
**2,114 tests / 2,112 PASS / two expected platform SKIPs / zero FAIL / zero
cancelled** in 121.594 seconds. It uses the initial completed package build;
no production TypeScript source changed. Initial `npm test` had 2,110 PASS,
two FAIL and two SKIPs. The two failed MCP tests both pass focused reruns, with
no MCP source change. Typecheck and documentation build pass. Docs checks pass
**55 pages / 2,645 internal links**, English content and local paths excluded.
Both documentation programs match the entire runnable source and both compiled
independent consumers byte-for-byte.

Final source maps match main151, inherited146, oracle6, product4, compiler4,
SDK10 and inherited TS/integration31 entries. Eleven older report seals and
14 prior target binaries remain unchanged. Twelve new trace files restore
150,008,067 raw bytes with SHA checks. Twenty-two completed historical trace
files restore 1,155,686,277 raw bytes from 77,368,431 gzip bytes. Their mapping
records local restoration; earlier sealed evidence remains intact.

## Resource incident and preserved evidence

Parallel Rust linking failed with errno28 while available disk fell during the
run. Serial builds with compact debug settings passed. The first workspace run
also failed two MCP tests: one explicit ENOSPC and one unexpected null edit base.
The null-base failure's cause is not conclusively attributed. Both tests pass
in focused reruns after space is available, followed by a full workspace pass.
No MCP or TypeScript production fix is included.

Completed rules comparison traces were losslessly gzipped with original/restored
SHA and byte-size checks. The restoration map preserves their original paths.
No source, executable, Cargo cache or sealed report was removed. Additional disk
space became available and the user confirmed disk recovery. Free-space changes
are observations, not a claim that trace compression caused the entire increase.
Old report seals and pinned binaries remain checked. New large traces are also
gzip-preserved. The capsule is selected evidence, not a complete output dump.

## Remaining work

Full D2/D3 schema/command coverage, list/table product authoring, production
Rust/WASM Client/editor integration, native Map/List, protected GC and native
production process/server recovery remain separate gates. Own checkpoint replay
is not mixed-runtime wire or server durability qualification. No Chrome, mobile
or performance benchmark is claimed. No commit, push, deployment or registry
publication is included.

## Reproduce

Use Node24 and cached Cargo dependencies with compatible Rust. The captured
native compiler is Homebrew Rust1.87. The compact target disables debug info and
incremental builds; serial jobs avoid the observed parallel linker peak:

```sh
CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml -j1
CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml -j1
node experiments/runtime-document-unused/export-schemas.mjs
npm test
```

The [Rust guide](../../../apps/docs/src/guide/rust.md#unused-node-declarations)
and [SDK README](../../../experiments/rust-sdk/README.md) contain the native
example. Avoid package rebuilds during TS comparison because they regenerate
`dist`. Selected source, exact protocol inputs/outputs, failed diagnostics,
consumer programs and logs are retained; loose executables and build caches are
excluded with their source/digest provenance.
