# Schema references across attributes and marks

This adds explicit cross-descriptor sharing of schema-owned atomic values to
the experimental native Rust SDK. It does not link mutable document registers:
writing one property leaves other properties and their writers independent.
Full D2, D3, production Rust/WASM Client integration and general mixed-runtime
transport remain open. Baseline is main
`1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus inherited uncommitted D2 work.
The actual 166-file baseline is captured. Six earlier D2 report seals stay
unchanged. No commit, push, deployment or registry publication is included.

## Shared schema format

Use `RuntimeSchema::compile_with_reference_groups`, `ReferenceSlot` and
`ReferenceGroup`. The versioned schema descriptor contains the complete manifest
and explicit groups. Each group has a representative and at least two slots:

```json
{
  "format": "doc-sync-runtime-schema-shared-v2",
  "manifest": {},
  "referenceGroups": [{
    "representative": {"at": ["markValues", "paint"], "source": "default"},
    "slots": [
      {"at": ["markValues", "paint"], "source": "default"},
      {"at": ["nodes", "note", "attrs", "fill"], "source": "enum", "index": 0}
    ]
  }]
}
```

Replace `manifest` with the full schema. Slots address an atomic node attribute
or value mark default/enum entry. Different attribute names and node kinds,
mark-to-node/node-to-mark references and enum-only groups use the same format.
The representative must be included. Every member must have a valid composite
payload with equal canonical JSON and satisfy its own type/constraints.
Duplicates, overlapping groups, unknown slots, invalid representative, primitive
values, field branches and computed targets reject before replacement.

Member/group order normalizes, but representative choice remains part of the
semantic identity. Its payload property order defines the one logical shared
object. Equal unlisted values remain distinct. Nested payload pointer graphs
and structured-field aliasing are outside this format. The native subset still
requires each nonnull composite enum default to share with at least one own
enum slot. A TS-valid unlisted-default configuration can remain native-unsupported;
it is not called an invalid TypeScript schema.

Bare manifests and v1 default/enum descriptors retain their prior identity and
wire form. `manifest()` exposes raw declared rules; `dto()` retains the graph.
`base_identity()` is a diagnostic raw TS schema hash, while `identity()` includes
the native graph and representative. References and checkpoints use the latter.
`effective_manifest()` resolves group members to representative payloads once,
so unwritten defaults, null reset, cloned-enum fallback and factory values have
the same order as actual TypeScript shared objects. Raw input data stays available.
Builders create new schemas; they do not migrate an open document.

## Target admission and History

`SchemaValue` retains the selected source descriptor, source kind and enum index.
Reference-aware helpers validate against the actual target property. A cross-
descriptor handle requires declared identity; equal JSON is not sufficient.
Birth omits a handle only when it shares the target default. Explicit updates
retain target writers. The operation payload path identifies the target, while
reference metadata still identifies the selected source. Representative choice
does not replace that provenance.

The native reference envelope, pending queue, exact retries, selective undo/redo
and own checkpoints retain these bindings. Conflicting writer provenance and
wrong graph/target reject atomically. Per-key caches avoid scanning or copying
all group targets for each Set; validation adds no full schema recompilation
or extra journal replay solely for edit preflight.

## TypeScript comparison and transport boundary

The comparator authors actual `Doc.edit` commands and native SDK commands
independently. It rehydrates real JS identity classes from the descriptor and
checks source selection separately from class equivalence. It compares raw
unwrapped operations and IDs, full History, material registers/writers, clocks,
pending/carets, stable UTF-16 selections and each model attribute/mark value's
`JSON.stringify` order. Nested arrays, different keys and node kinds, concurrent
text/delete/format and foreign-writer fences are included.

Dedicated cross-group undo, JSON checkpoint restore, redo and delivery steps
assert nonempty operations. Raw and JSON redo `Doc.check` rejection is recorded
separately from successful material `Doc.apply`; cloning does not manufacture
live JS enum identity. Default/representative fallback projection remains exact.

Actual DocHub cases distinguish source and hub-owned schema references and
within-copy sharing. Default omission can pass its current transport; retained
enum payloads still reject atomically after cloning. Native JSON peer success
therefore does not establish a general TS/native wire bridge, production server
recovery or CRDT WASM support.

## Verification

Core **156 PASS** includes nine new shared-reference tests. SDK **101 PASS**
includes eight new tests. A complete identical program in the SDK README and
Rust guide compiles/runs in an independent Cargo consumer. Baseline core147 also
passes from archived sources; the same six protocol requests fail on the old
binary and succeed on the new one. A separate fourteen-request cell-key probe
passes different-source/key writes, undo/redo and JSON document/History restore
without changing the frozen sources.

New comparison: two renamed schemas, **246 actions / 492 actor states**, with
**138 actual staged `Doc.edit` checks**. Factory order32, native scope27 and
actual Hub identity32 probes pass. The seven inherited corpora pass unchanged:
flow162/324states, grid180/360, shapes188/376, rules260/520, six runtime
profiles82/164, composite160/320 and alias182/364. Their fixture files and the
inherited alias schema helper retain all eight baseline hashes. No old negative
case was removed or rewritten.

The final qualification combines fourteen successful drivers with two complete
retries under the same **194 source/binary hashes**. The initial sixteen-driver
attempt hit `ENOSPC` while writing rules/alias traces; it remains a FAIL receipt.
No semantic mismatch or source drift was observed in that attempt. Owned
unqualified diagnostics were losslessly gzipped with restored SHA checks. Only
this task's standalone Cargo debug caches were removed after inventory; selected
executables, sources, inherited evidence and frozen regression targets remained
unchanged. After space recovery, rules260 and alias182 were rerun in full and
passed. The joint receipt links the fourteen original PASS results and these two
retry results, rather than claiming a clean first-attempt run.

Final integrated counts and source bindings are in
[final-checks.json](final-checks.json). Initial fixture/guard failures and the
native-unsupported TS-valid default/enum boundary remain diagnostic evidence.
Source inspection, API tests, actual TS server observations and checkpoint
recovery are separate proof categories. No Chrome/mobile, performance benchmark
or native production process/server crash qualification is claimed.

## Demo/MCP verification repair

The first workspace run failed two MCP tests with empty 404 responses. Controlled
owned-listener and actual-demo probes reproduced this host's IPv6 wildcard and
IPv4-specific listeners sharing one numeric port. An IPv4 request reached the
other listener. The failed banner test's port was owned by an unrelated
persistent IPv4 server; that process was preserved. This is confirmed for the
banner failure. The automatic-recovery failure has no original origin in its
log, so the same cause remains an inference rather than direct proof.

The demo now accepts optional `DOC_SYNC_HOST`. Twelve test spawn helpers that
force IPv4 origins set it to `127.0.0.1`; the normal unspecified-host default
remains available. No transport retry/error suppression or CRDT rule changed.
A real-demo regression fails before the change and passes afterward for occupied
and ephemeral IPv4 ports. The original two failed files pass ten tests; the
full demo suite passes147; a guarded twelve-test focused run preserves all
fourteen integration source hashes. Original failures, before sources, patch,
collision probes and final source maps are retained separately from Rust proof.

## Final integrated checks

Final corrected workspace test: **2,114 cases / 2,112 PASS / zero FAIL / two
expected platform SKIPs / zero cancelled**, 122.869 seconds. The first full run
had 2,112 cases, 2,108 PASS, two MCP failures and two SKIPs; its logs are retained.
The two added IPv4 regressions explain the new total. Root typecheck passes in
14.309 seconds. Documentation build passes in 14.927 seconds; 55 pages and 2,622
internal links pass with English content and local paths excluded. Current core
32-file, SDK8-file, integration14-file, joint194-input and main130-file hash maps
match after package rebuilds. Documented Rust programs equal the compiled Cargo
consumer byte-for-byte. All six prior report seals match. No Chrome/mobile or
performance run is claimed.

## Reproduce

Use Node24 and cached dependencies. Recorded native drivers use Homebrew
Rust1.87 and legacy uses rustup stable1.86 in a separate target. Adapt absolute
tool paths on another platform and choose fresh output directories:

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
SHARED_OUT=output/my-shared SHARED_TARGET=output/my-shared-target node experiments/runtime-document-shared/compare.mjs
```

Do not overlap package/docs builds with workspace tests or TS traces: builds
regenerate `dist`. The [Rust guide](../../../apps/docs/src/guide/rust.md) and
[SDK README](../../../experiments/rust-sdk/README.md) show the native API with a
runnable two-peer example. Own checkpoints restore in-process; they are not
production crash-recovery acceptance. Local docs checks do not deploy a website.

The selected archive retains qualified traces, source snapshots, compact
failures, before/after/cell protocol requests and consumer source/logs. Binaries,
Cargo caches, duplicate stdout and large nonfinal traces are excluded with an
index. Diagnostic gzip mappings retain original and restored hashes. Raw receipt
paths are provenance, not portable installation paths. This capsule is selected
evidence, not a distribution or a complete dump of every diagnostic output.
