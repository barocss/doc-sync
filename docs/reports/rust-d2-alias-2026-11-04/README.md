# Shared default and enum references

This adds explicit same-descriptor reference sharing to the experimental native
Rust SDK. Full D2, D3, production Rust/WASM Client integration and general mixed
TS/native transport remain open. Baseline is main
`1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus inherited uncommitted D2 work.
The actual 153-file source/fixture baseline is archived. Earlier five sealed
D2 reports remain unchanged. No commit, push, deployment or release is included.

## Schema contract

`RuntimeSchema::compile_with_default_references` accepts the raw manifest and
`DefaultReference::new(path, enum_index)` edges. The equivalent wire form is:

```json
{
  "format": "doc-sync-runtime-schema-alias-v1",
  "manifest": {},
  "defaultReferences": [
    {"at": ["markValues", "paint"], "enumIndex": 0}
  ]
}
```

Replace `manifest` with the complete schema. Paths address `markValues[key]` or
`nodes[kind].attrs[key]`. Each edge declares that the composite default and one
enum entry are the same logical object. Several enum entries may explicitly
share that default. Equal unlisted entries remain separate identities. Plain
JSON is never promoted into a reference by deep equality. Field leaves retain
their independent structural-value contract.

The descriptor must contain at least one edge. Invalid format/path/index,
unknown keys, duplicate edges, unsafe values, mismatched payloads, scalar
aliases, field branches and computed targets reject before replacing a live
replica. Bare composite-default/enum JSON without declared sharing still
rejects in the native subset. Arbitrary cross-descriptor and enum-only alias
graphs remain outside this format.

`manifest()` exposes raw rules; `dto()` preserves the versioned graph.
`base_identity()` is the raw rules hash corresponding to TS `schemaVersion`,
for diagnostics. `identity()` includes the normalized graph and pins native
references and checkpoints. Different graphs cannot exchange reference handles.
Edge order, explicit/omitted document domain and object key order normalize as
declared; enum index order remains significant. Bare schemas retain their prior
identity and wire form. A new schema builder is not a live schema migration.
Compiled lookup tables avoid scanning all graph edges during an edit.

`default_value`, `enum_value` and mark `reference_value` handles share the default
only when the graph declares it. Reference-aware birth helpers omit those
values, while equal unlisted entries retain their writer and selected enum
index. Explicit updates retain writers. The existing native reference envelope
preserves selected source/index through peers, pending queues, History and own
checkpoints. Exact retry rules still reject conflicting writer provenance.
Native JSON peers, duplicate pending replay, selective undo/redo and exact
acknowledgement retain other actors' changes.

## TypeScript boundary

Comparison rehydrates actual JS sharing before authoring. The default and all
listed enum entries refer to one object; unlisted equal entries remain separate.
Native reference metadata is checked against the selected command and that
actual equivalence class, rather than discarded to obtain PASS. Operation IDs,
full History, models, material writers, clocks, pending/carets and UTF-16 stable
selections are compared independently.

Actual `DocHub` cloning preserves aliases inside its schema copy and separates
that copy from the source schema. Default/linked-enum births can omit the value
and pass the existing Hub path. A retained unlinked-enum birth or explicit
object default/enum update still loses identity in the retained payload copy
and rejects atomically. Retained hub-owned references can pass the initial
check; retained references from the source schema fail it. Source and hub-owned
authors are both probed, with 48 expected outcomes.

Stored composite enum values still follow TS clone/fallback projection and
per-token mark/span behavior. Raw History redo can lose live enum identity;
its material application is distinguished from raw `Doc.check` admission.
The native envelope is an explicit extension. These results do not provide a
general TS/native wire adapter, cross-runtime checkpoint import, production
server recovery or a CRDT WASM engine.

## Reference payload order

A review probe reproduced an authored-value mismatch when the default and a
linked enum slot had equal JSON with different property insertion order. JS
sharing resolves the linked entry to the default object. Native resolution now
uses that same default payload for linked entries while retaining the selected
source/index. An unlinked equal slot keeps its own payload order. Raw incoming
operation/register order, canonical wire binding and existing JS grouping rules
remain unchanged. The before failure and focused order comparison are retained.

## Verification

Native core **147 PASS** includes nine new alias tests. Native SDK **93 PASS**
includes seven new alias tests. Both documented Rust programs are byte-identical
to the independently compiled Cargo consumer. The payload-order correction has
an explicit failing-before SDK test and actual JS/native before/after proof.

Final counts and source bindings are recorded in [final-checks.json](final-checks.json).
The final twelve-driver run uses no previous PASS results and holds 180 source/
binary hashes fixed. The independent alias corpus includes 182 semantic actions / 364 actor states
and 110 actual staged `Doc.edit` checks across two renamed descriptors. It
covers object/array defaults, single/multiple aliases, equal unlinked entries,
concurrent fields/text/format/delete, foreign-writer fences, native JSON peer
delivery, checkpoints, pending replay, ACK and undo/redo.

The six inherited corpus files are unchanged from the baseline. Their separate
comparisons cover flow162/324states, grid180/360, shapes188/376, rules260/520,
six runtime profiles82/164 and composite160/320. Existing schema negative
expectations were not removed or rewritten for this task. Native scope probes
include malformed graph and mismatched graph/checkpoint/provenance rollback;
accepting a valid reordered graph is distinguished from rejecting a different
one. Before/after protocol probes compile archived baseline sources independently
and send identical requests to old and current executables.

Unique per-run source snapshots and binary digests bind the results. Initial
source-race and development attempts remain diagnostic evidence. Source-only
results, native checkpoint recovery, TS server observations, workspace tests
and documentation checks are separate evidence categories. No Chrome, mobile,
performance benchmark or native production process/server crash test is claimed.

## Integrated checks

Final sequential workspace test: **2,112 cases / 2,110 PASS / zero FAIL / two
expected platform SKIPs / zero cancelled**, 135.660 seconds. Typecheck passes
in 18.434 seconds. Corrected documentation build passes in 15.100 seconds;
55 pages and 2,619 internal links pass with English content and local paths
excluded. The first docs link check found one wrong Rust section anchor; it
was corrected and rebuilt before the final PASS, with the failure retained.
Final core3file, SDK7file, wrapper180input and main125file hash maps match the
current sources/artifacts after all package rebuilds. The two documented Rust
programs match the compiled Cargo consumer byte-for-byte. All five earlier
report seals are unchanged. No Chrome/mobile or performance result is added.

## Reproduce

Use Node 24 and cached Cargo dependencies. The recorded native comparator uses
Homebrew Rust1.87; the legacy comparator uses local rustup stable1.86 in a
separate target. Adapt tool paths on another machine and use fresh outputs.

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
ALIAS_OUT=output/my-alias ALIAS_TARGET=output/my-alias-target node experiments/runtime-document-alias/compare.mjs
```

The [Rust guide](../../../apps/docs/src/guide/rust.md) and
[SDK README](../../../experiments/rust-sdk/README.md) contain the same complete
Rust example, compiled in an independent Cargo consumer. Own checkpoints are
restored in-process; they are not production crash-recovery qualification.
Do not overlap package/docs rebuilds with TS traces or workspace tests because
build removes and regenerates `dist`. Local docs checks do not publish the site.

The selected evidence archive and manifest retain final traces, before/after
requests, source snapshots and compact failed-run receipts. Loose binaries,
Cargo targets, duplicate stdout and large nonfinal raw traces stay local;
exclusions are indexed by reason and digest. Receipt paths are provenance, not
portable installation paths.
