# API and runtime structure refactor

The baseline is main commit `ec9622571a04a7d7ea3f967bb3e6423b17ce5194`.
The work preserves the public entry points, operation encoding, schema identity,
concurrent ordering, selective History, presence and recovery rules. This report
separates structural inspection, measured workloads and integration checks.

## API decisions

| Boundary | Decision |
| --- | --- |
| Client | Keep one owner for document, History, connection and pending operations. Optional transport selects local or synchronized mode at construction. |
| Editor binding | Keep one private host origin per view. A pending apply/commit batch cannot move to another view. Selection belongs to the view. |
| Map/List | Keep lazy collection access under Client.data with the exact fixed data schema. Do not create another client or transport. |
| Policy | Keep application validation local. Preserve its receiver, read access, recursive-write rejection and finally-based release. Server admission remains separate. |
| Observers | Keep stable bridge callbacks, observer receiver, subscription removal order, bounded error isolation and post-edit mutation guards. |
| Snapshots | Keep borrowed model projections distinct from detached storage snapshots and local save/open state with History. |
| Session and Presence callbacks | Keep detachable callbacks and per-owner state. Module helpers must not create shared mutable buffers or require a new receiver. |
| Engines | Keep the production TypeScript client path. Native Rust SDK and storage-only WASM remain separate; no interchangeable Rust client is introduced. |
| Spreadsheet | Keep its separate experimental protocol. Map/List access does not integrate it with Client or DocHub. |

Public method names, package exports and constructor signatures are retained.
The new Client implementation modules are private implementation details, not
new package export paths. This is an internal refactor, not a new wire version.

## Structural changes

- Immutable validation and capability lists live in private module constants.
  Membership semantics and enumeration order remain unchanged.
- Capture-free helpers and recursive validators use module functions with
  explicit input or per-call context. Mutable traversal state stays per call.
- Client dispatch calls typed observer methods directly, rather than creating
  an invoker closure for each event. Its bridge callbacks keep stable identity.
- Presence store state is explicit. Public methods still work when detached.
  Graphic helpers retain their cloned schema and factory identity.
- MCP input, bootstrap and shutdown have one private process owner. Stable
  signal callbacks preserve error classification and idempotent cleanup.
  Startup still owns input before schema/journal work and drains only under the
  existing recovery rules. Bot provenance retains its allowlist and schema policy.
- List.at decodes only one cached entry. Map.size reads the distinct-key index.
- Doc copies immutable primitives directly. Objects still use structuredClone;
  unsupported functions, symbols and proxies retain rejection behavior.
- SHA round constants and the initial vector are shared. Each call has its own
  typed mutable working state. Compression no longer allocates an eight-element
  result array for every block. Digests and schema identities remain exact.

Fresh output arrays, native DOM specifications, paths, pending operations,
listener snapshots, validation budgets and recursion guards remain separate.
Moving those arrays into shared state would change their contract. Native
framework callbacks, projection lifetime callbacks and short-lived origin
wrappers remain where they need lexical state. A zero nested-function count is
not a correctness or performance target.

## Measured workloads

These are Node 24.22.1 observations. They are not Chrome input-to-paint,
network, memory-allocation, or production-size acceptance results.

| Workload | Before median (ms) | After median (ms) | Comparison boundary |
| --- | ---: | ---: | --- |
| Cached last List entry, N=10,000 | 0.206014 | 0.001333 | Same archived Client; access layer only |
| Cached distinct Map size, N=10,000 | 1.962458 | 0.000320 | Same archived Client; access layer only |
| First List/Map read, N=10,000 | 39.658333 | 34.992417 | Includes access projection |
| Edit plus read, 20,000 entries | 1,007.563 | 863.005 | Same dependency closure; Doc copy path only |

The access run uses five ABBA rounds and ten samples per lane and size. Cached
queries use batches of three with equal assertion overhead. Its nearest-rank
p95 values are percentiles of batch means, not individual-operation tails. The
separate Doc run uses seven unprofiled samples per lane, one warmup, explicit GC
before samples and full ID/value oracles outside timing. Inclusive method profile
times overlap. The Doc comparison is against its lane-start source with the
same current dependencies, not a whole-commit ec962 comparison.

A second full access run with the final reproducible CLI gives cached medians
0.133181 -> 0.001250 ms for List.at and 2.184028 -> 0.000222 ms for Map.size.
Its first-read medians are 38.677709 -> 33.687750 ms. These are separate runs;
their samples are not pooled. Both keep the same archived Client in both lanes.

The generic edit/read path remains expensive. Full snapshot creation,
finite-JSON validation, register reconstruction, detached normalization proofs
and projection rebuilding retain O(stored state) work. The access layer still
clones, freezes and validates a complete projection at a revision change.
Hidden targets can require a retained-snapshot scan. Map entries still sort and
materialize complete results. Neither a cached-read improvement nor a primitive
copy fast path resolves these costs.

## Structural inventory

The AST audit covers production package/app sources and demo runtime, excluding
tests and build/serve/check tooling. Before: 163 files; after: 165 files, including
two new private Client implementation modules. Nested named helpers fall from
310 to 227; nested callbacks/accessors fall from 1,813 to 1,790. The conservative
capture-free, direct-call helper scan has no remaining candidate. This scan is
not a proof that every remaining closure is necessary or that no bottleneck
remains.

All nine nonempty primitive const-array literal candidates and 96 inline
primitive membership lists from the original audit are removed from function
scope. The broader ownership audit also moves immutable field lists and tables.
Dynamic lists and per-call mutable buffers remain. Two pure annotations preserve
removal of unused sync modules from the local-only bundle after constant hoists.
They mark fresh private string-array freeze initializers only.

## Regressions found and corrected during integration

1. Initial constant aggregation caused temporal-dead-zone errors. Lists now
   precede tables that reference them. Final source/type checks supersede the
   retained failing intermediate receipts.
2. Hoisted freeze calls retained 693 bytes from two unused sync modules in the
   local bundle. Two narrow pure annotations restore zero forbidden emitted
   bytes. The original bundle guard remains; reachable sync validators still run.
3. Independent review reproduced shared fallback metadata between observers.
   Fallback delivery now creates each observer's own array and metadata. Remote
   model-event sharing retains its previous contract. The new test fails before
   the fix and passes afterward, without freezing payloads or hiding exceptions.
4. A History comparison recorded one logical action at two wall-clock times.
   A 1 ms boundary could fail exact snapshot equality. That test now uses a
   deterministic clock and retains its complete History assertions.
5. Chrome exposed duplicate React runtimes in editor demo bundles. Shared build
   aliases select one root React/ReactDOM pair, including subpaths, across all
   four demo builders. Actual metafile tests retain the local no-network guard.

The initial Graphic checker also ran an existing mobile case contrary to the
requested desktop scope. That run is excluded from desktop-only qualification.
The checker no longer executes the mobile case. The later proof records its
scope explicitly. The original receipt remains unchanged.


## Final refactor verification

| Check | Result | Boundary |
| --- | --- | --- |
| Full workspace npm test, including build | PASS: 1,680 cases; 1,678 pass, 2 expected platform skips, 0 fail/cancel | 108.727 s, Node 24.22.1; 240 s watchdog inactive |
| Root no-emit TypeScript | PASS | Final production source and tests |
| Packed artifacts and isolated consumers | PASS: 10 tarballs, 12 consumer cases | Prepack removes stale output; no registry publication; private 0.0.0 retained |
| Docs build/check | PASS: 55 pages, 2,606 internal links | English and local-path checks pass |
| Desktop Chrome, unified Client local | PASS: all four editor groups | Trusted input, selections, undo/redo, remount and local network isolation |
| Desktop Chrome, unified Client sync | PASS: all four editor groups | Queued in-page transport, reconnect and convergence; not durable HTTP recovery |
| Desktop Chrome, custom shared local editor | PASS: 15 groups | 4 views/one LocalClient; trusted input, view selections, shared undo/redo, paragraph operations, lifecycle |
| Desktop Chrome, Graphic | PASS: 19 checks | Pixi projection, ID lookup, HTTP/SSE peer changes, selective undo/reconnect; desktop only |
| Desktop Chrome, stable Spreadsheet | PASS: 21 checks | Stable axes, native editing/selection, remote range projection, undo/redo and reconnect |
| Desktop Chrome, Presence | PASS: 27 checks | DOM/React/Vue/Svelte/Solid mounts, geometry, drafts, undo and cleanup |

All 1,391 recorded code/test/fixture/manifest/benchmark source hashes remain
unchanged from the start of the final full test through these checks. The
post-refactor core is separately frozen as the baseline for the next roadmap
item. New work does not retroactively qualify this checkpoint.

The first full run failed the two local bundle checks and remains archived.
After the bundle correction, a run passed before the observer regression was
fixed. The final 1,680-case run includes that fix and the React build correction.
The first custom-editor browser run exceeded its external 240 s watchdog after
13 passing groups. Its incomplete receipt is not PASS. The completed identical
suite passes in 243.289 s under a declared 480 s watchdog; application polling
and command deadlines were unchanged. The first unified browser startup timed
out; a separate diagnostic found the duplicate-React Slate hook failure. The
new bundles pass both local and sync checks. No failed receipt is overwritten.

The independent review found the observer regression and no other High/Critical
blocker in its inspected delta. Its bounded direct-source checks are distinct
from the full workspace and browser results above. The retained behavior is
covered by operation/model/History tests, server/process restart and GC suites
inside npm test. This is not proof of every interleaving, operating-system IME,
production deployment, native Rust, or WASM client parity.

## Reproduction and artifacts

Use Node 24.22.1 for the recorded commands. Normal build/test checks are:

```sh
npm ci
npm test
npx tsc --noEmit
npm run check:packages
npm run docs:build
npm run docs:check
```

Browser checks require the existing compat dependencies and actual Google
Chrome. Each checker owns its session. Run `npm run dev:client` for the unified
four-editor preview or `npm run dev:local` for the shared custom editor. Pass the
printed URL to the corresponding check script. The custom checker can take more
than four minutes; use an adequate external harness deadline. Do not change its
application assertions to fit a shorter harness timeout.

The new benchmark CLIs require an explicit archive and output path. They never
run Git or overwrite existing reports. To compare collection access against the
original main source:

```sh
baseline_dir=$(mktemp -d)
git archive ec9622571a04a7d7ea3f967bb3e6423b17ce5194 | tar -xf - -C "$baseline_dir"
mkdir -p output/repro
node --expose-gc benchmarks/data-access-refactor.mjs \
  --baseline-root "$baseline_dir" --output output/repro/data.json
node --expose-gc benchmarks/core-performance.mjs \
  --output output/repro/core.json --n 10000 --samples 7 --profile 0
node benchmarks/core-sha-structure.mjs \
  --baseline-root "$baseline_dir" --output output/repro/sha.json
```

The whole-source core CLI comparison is a different experiment from the
Doc-only controlled comparison above. Baseline commit labels in benchmark input
are provenance claims; the recorded per-file hashes identify the executed
sources. Raw receipts, exact original measured harnesses, inventories, selected
patches and code/evidence hashes are archived alongside this report. CLI event
transcripts and unrelated user memory are not included.

No commit, push, npm release, deployment, schema migration, or data cleanup is
part of this checkpoint. The next roadmap step investigates only fresh private
Graphic proof copies; public snapshot validation and other recovery paths remain
required. That design is not an implementation or performance PASS.


Artifacts: [evidence archive](./evidence.tar.gz),
[evidence hashes](./evidence-manifest.json),
[tested source hashes](./tested-source.json), and the
[frozen post-refactor core](./post-refactor-core.tar.gz).
