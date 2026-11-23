# References from declared field leaves

The private native runtime SDK can use a declared field leaf's default or enum
entry as a schema-reference source. This extends the partial D2 schema subset.
It does not complete D2 or provide a production Rust/WASM Client backend.

## API and data contract

Use `RuntimeSchema::compile_with_payload_references` and the existing v3 format.
A source descriptor uses explicit `fields` edges:

```json
{"at":["nodes","paragraph","attrs","style","fields","fill"],"source":"default","valuePath":["items",0]}
```

The descriptor path selects the declared leaf. The typed `valuePath` selects an
object or array inside its value. An operation reference's `path` selects its
destination payload. These paths have different roles. Whole branches, computed
fields, unknown or unsafe keys, invalid key/index types and excessive depth
reject. Bare/v1/v2 do not acquire the new source selector. Field paths have a
64-segment ceiling including the outer attribute; the existing whole-schema
JSON depth limit of 128 can reject a deeply nested schema earlier.

`field_default_value` and `field_enum_value` select the native schema value.
`set_runtime_field_path` checks schema provenance, then uses ordinary field
validation. A field destination compares JSON content, including enum choices,
and writes plain JSON to its independent leaf register. An equal JSON copy may
pass; it does not need object identity or create a symbolic document link.
Other leaf and user writers remain independent.

A field source can supply an atomic attribute or value mark when a declared
reference group admits that destination. These operations keep symbolic source
metadata and the separate target binding path. Atomic enum admission retains
its existing identity contract. The field contract does not weaken it.

## Verification

Final source-bound counts and command receipts are recorded in
[final-checks.json](final-checks.json). The capsule manifest identifies selected
source, raw protocol requests/responses, diagnostics, comparison traces and
consumer programs. Tests are scoped separately from unverified product gates.

The pinned previous core executable rejects the new leaf-source request. The
current core accepts it. A previously supported v3 schema with fields but no
new field-source groups retains the same identity, DTO and own checkpoint replay
responses before and after. Old source and binary hashes are checked against the
captured baseline. This is an execution comparison, not an inferred compatibility
claim.

The TypeScript tests independently author field edits and observe actual
`Doc.check`, `Doc.apply` and DocHub behavior. They separate JSON field admission
from local atomic enum identity and server clone rejection. Equality of material
JSON does not prove native heap identity or TS/native wire interoperability.

The baseline contains the inherited uncommitted work. Earlier sealed D2 reports
are checked without rewriting them. Initial test or harness failures remain
separate diagnostic evidence; only final source-bound runs provide qualification.

The initial field comparison used a TS branch-patch command against a native
direct leaf command and observed a real ticket difference. The final harness
authors the corresponding direct encoded field edit in TypeScript, retaining
exact operation tickets and payloads. Existing branch-patch compiler behavior
and the separate D3 compiler clock gap are not changed or normalized away.

One diagnostic retained all checkpoints, History, pending data, models and state
for both actors at every step. It took about four minutes and an observed
sample of about 1.82GiB RSS. Source inspection finds inherited per-edit staging
through schema compilation and journal restore/replay. This is a trace-harness
observation, not a controlled performance benchmark or a production latency
result. No core optimization was inferred from that observation alone.

Final verification: **171 native core tests / 109 SDK tests PASS**. The fresh
comparison wrapper passes **23/23** drivers with **219 fixed source/binary hashes**.
The new two-schema corpus compares **352 commands / 704 actor states** and
**184 actual staged TS Doc.edit checks**. New input checks pass 28 cases and
actual TypeScript/DocHub checks pass 32 rows. All 44 inherited runtime source
files are unchanged. All nine inherited corpora pass, including the previous
296-command nested-payload corpus. Eight earlier report seals remain unchanged.

Workspace tests: **2,114 total / 2,112 PASS / two expected platform SKIPs /
zero FAIL / zero cancelled**. Typecheck and documentation build pass. Documentation
checks pass **55 pages / 2,630 internal links**, with English content and local
paths excluded. Final source bindings match core34, SDK6, wrapper219, main163,
inherited TS/integration31 and next-product evidence32 maps. The compressed
integrity audit checks 76 gzip artifacts; 32 trace artifacts also match their
recorded original raw hashes. Compiled documentation bodies match both fences.

## Remaining boundaries

Whole field-branch references and linked mutable object graphs are unsupported.
Native public values remain JSON trees. The new field-copy helper intentionally
emits raw field writes, so it does not persist a symbolic source handle on that
field. Native own checkpoint replay is distinct from production process/server
crash recovery. Full D2 compiler/schema coverage, live schema transitions,
production Rust/WASM Client and editor binding, native Map/List, protected GC and
a TS/native object wire codec remain separate gates.

No Chrome, mobile or performance benchmark is claimed. This task does not commit,
push, deploy or publish packages.

## Next product-schema work

A separate read-only probe checks the actual public Word, Notion and presentation
fixtures. All pass TS schema validation. Native compilation first rejects the
optional URL pattern. Diagnostic variants that remove the URL and cell color
patterns then expose `image-block.text: false` and valid unused declarations.
The next bounded implementation is those two existing product patterns, compared
against JS validators; this report does not claim they are implemented.
`markValues.fields` is invalid in TypeScript as well and is not a missing native
feature. Exact requests, variant labels, responses and unchanged source/binary
hashes are retained in `core/next-d2-results.json` and its 32-file hash map.

## Reproduce

Use a compatible cached Cargo toolchain and Node24. The current receipts use
Homebrew Rust1.87 for native traces and rustup stable1.86 for the inherited legacy
comparison, in separate targets. Use fresh output directories:

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm test
FIELDREFS_OUT=output/my-fieldrefs FIELDREFS_TARGET=output/my-fieldrefs-target node experiments/runtime-document-fieldrefs/compare.mjs
```

The [Rust guide](../../../apps/docs/src/guide/rust.md#field-leaf-reference-sources)
and [SDK README](../../../experiments/rust-sdk/README.md) include the native example.
Do not rebuild packages during TS trace verification: builds regenerate `dist`.
The selected evidence capsule contains sources and receipts; it is not an
installable distribution.
