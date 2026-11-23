# Native schema references for composite defaults and enum choices

This implements a bounded D2 native extension. Full D2, the D3 model-position
compiler and production Rust/WASM integration remain open. Baseline is main
`1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus inherited uncommitted native
flow/grid/group/field/rules work. The actual 102-file baseline is captured in
`baseline.json` and `baseline.tar.gz` in the selected evidence archive.
No commit, push, website deployment or registry publication is included.

## Contract

Atomic node attributes and value marks support object/array defaults without
an enum. Composite enum choices use a null default and may include duplicate
object/array choices and primitive choices. Values still occupy one atomic
register. Structured field leaves retain their separate structural-value rules.
Scalar defaults, scalar enums and fixed-preset behavior remain unchanged.

`SchemaValue::json` represents plain JSON. `RuntimeSchema::default_value`,
`enum_value` and `reference_value` return schema-owned handles. Equal plain JSON
is not silently upgraded into a handle. A handle contains the schema identity,
descriptor path and default/enum source, including the exact enum index.
Reference-aware insert, set and format helpers preserve these identities.
The fixed Graphic preset API rejects the new reference operations.

Native wire uses an explicit `doc-sync-runtime-reference-op-v1` envelope around
the ordinary operation. Its reference entries bind exact payload paths to exact
schema paths and payloads. Wrong schema, path, value, index, duplicate binding,
malformed envelope or inapplicable target rejects atomically. Target checks retain
the TypeScript text-descriptor candidate rules; descriptor names are not a new
wire-level ownership permission. These are protocol
metadata, not special keys hidden in user JSON. Register values remain JSON;
accepted writer provenance supplies the reference envelope for undo/redo.
Native peer delivery and checkpoint input pass through actual JSON encoding
and decoding. Duplicate replay and exact pending-prefix acknowledgement keep
the same pending/History rules. Validation borrows the compiled schema; it adds
no per-edit full schema compile or extra journal replay for preflight.

## Split History correction

Review reproduced a reference-envelope split bug: History scanned only raw
`node` tags, missed the split node and retained its companion move as an extra
History step. Undo emitted a move instead of the required `$join`. The scanner
now reads the underlying operation. A new regression compares raw and enveloped
split History, undo and redo exactly. The failing-before receipt and
both source seals are retained. Final core coverage is 138 passing tests,
including 18 new composite cases.

## Schema-equivalent payload correction

A second review probe reproduced rejection between native peers whose schemas
have the same canonical identity but different object key insertion order.
Four default/enum cases admitted on the source peer and rejected on the other.
Reference payload binding, temporary admission and History provenance now use
canonical JSON equivalence, matching schema identity. Only an explicit valid
reference can take this path; plain equal JSON still gains no enum identity.
Raw operation/register payload order and TypeScript mark/group serialization
remain unchanged. Peer delivery, undo/redo and own-checkpoint restore are checked
with those schema-equivalent manifests. Before-failure evidence is retained.

## TypeScript comparison boundary

TypeScript checks composite enum membership by object identity. A schema-default
reference and a distinct deeply equal JSON object can produce different edits.
The native API preserves this distinction rather than switching enum admission
to deep equality. Equal duplicate enum entries have distinct reference indices.
Per-token mark cloning, adjacent-span behavior, inherited values and attribute
clone/fallback projection remain compared against actual TypeScript behavior.

A staged TypeScript authoring check can accept its own schema-member reference.
A JSON copy loses that identity and fails raw `Doc.check`. Even editing against
`DocHub`'s own schema cannot bypass the retained-copy check: submission fails
atomically and the hub sequence stays unchanged. History redo can produce
cloned enum values rejected by `Doc.check`, while direct `Doc.apply` still
applies them. Those observations are retained separately from the positive
material/History comparison. The native envelope deliberately extends native
admission. This is **not** proof of TS/native wire or TS server interoperability.

A separate ten-case scope probe checks text-kind changes, wrong-shape rejection,
multi-operation rollback and forged checkpoint/provenance rejection. It observes
one stricter native boundary: a different atom descriptor's enum reference can
pass TypeScript's same-shape candidate admission but native nontext validation
requires the born descriptor and rejects it. This is TS-valid/native-unsupported,
not complete admission parity and not an authorization check.

Composite enum declarations with composite defaults remain unsupported. In
particular, JSON schemas cannot express `default === values[index]`. Supporting
that alias needs a schema identity/serialization format that preserves it. This
slice does not infer aliases from deep equality or claim the combination works.
Arbitrary cross-descriptor JavaScript reference aliases also need that schema
identity format; equal JSON declarations alone do not establish them.

## Verification

| Check | Result |
| --- | --- |
| Actual inherited baseline | 102 archived source files; eight before-reject/current-accept cases |
| Native core | 138 PASS, including 18 composite tests |
| Native SDK | 86 PASS, including eight composite tests |
| Independent TS/native authoring | Two schemas, 160 actions / 320 actor states; 88 staged `Doc.edit` actions |
| Earlier flow/grid/shapes/rules | 162/180/188/260 actions PASS |
| Earlier runtime profiles | Six schemas, 82 actions / 164 actor states PASS |
| Scope and forgery probe | Ten expected outcomes PASS; stricter native nontext boundary retained |
| Reference key order | Four peer cases and 24 History protocol actions PASS |
| Runnable documentation | Identical Rust programs compile/run in an independent Cargo consumer |

The final eight-lane replay used no earlier PASS results. All 160 source files
and seven compiled binaries remained unchanged during execution. The five prior
positive corpus hashes are unchanged. A later report-only correction counts all
88 staged `Doc.edit` actions from the actual trace, including two deletes; the
original command-name counter reported 86. The main corpus was rerun and passed
160/320 unchanged. The correction receipt proves the single counter-expression
change and unchanged native/TS source and binaries, preserving the earlier
seven lane results. Twenty-six JSON author checks reject composite enum copies
as expected; they are an observed protocol boundary, not 26 regression failures. Schema negative migration is explicit:
grid has seven rejections/five admissions, shapes ten rejections/two admissions,
and rules sixteen rejections/three compile-only admissions. No invalid-input
case was filtered out to create PASS.

Final integrated counts and source bindings are recorded in [final-checks.json](final-checks.json).
The independent corpus authors TS and native operations separately and compares
unwrapped raw payloads, writer IDs, full History, pending/carets, clocks,
material registers, selections and models. Native reference metadata is checked
separately against actual TS references; it is not discarded to obtain PASS.
The two renamed schemas cover object/array defaults, mixed/duplicate enums,
inherited marks, UTF-16 text, fields, nested blocks, concurrent insert/delete/
format and foreign-writer fences. Checkpoint restore preserves pending edits
and redo availability. Existing flow, grid, shapes, rules and six-profile
runtime corpora are also rerun without deleting positive cases.

Source snapshots bind each run to source, fixtures and its compiled binary.
Failed development, stale expectation, legacy compiler/binary drift and source-race attempts remain diagnostic
evidence. An expanded fixture first reached the already-known D3 physical-versus-model
insertion boundary. Its root insertion is now explicitly at the physical tail;
all 160 actions remain, and that failed trace is retained. The four earlier
sealed D2 report capsules remain unchanged. This
turn changes experimental native code and comparison/docs, with no further
production TypeScript semantic changes.

## Integrated checks

Final sequential workspace test: **2,112 cases / 2,110 PASS / zero FAIL / two
expected platform SKIPs / zero cancelled**, 125.234 seconds. Typecheck passes
in 15.292 seconds. Documentation build passes in 13.991 seconds; the final
check passes 55 pages and 2,619 internal links with English content and local
paths excluded. No Chrome/mobile or performance benchmark is added. Final core
15-file, SDK61-file, corrected comparison167-file and main118-file hash maps
match current sources/artifacts after the package rebuilds. The identical Cargo
example remains compiled, and all four earlier report seals match.

## Remaining work

Composite default-to-enum aliases, `markValues.fields`, unsafe JSON values,
`text: false`, positive-minimum cycles, arbitrary computed/callback rules,
axis moves and model-only stored attributes remain outside this subset.
The observed D3 empty-field-patch compiler clock gap, post-move model-position
insertion and empty-head compiler gaps remain open. Full product fixtures,
live schema transitions, public Rust Client selection, CRDT WASM, editor
bindings, native shared Map/List, production GC/recovery and cross-runtime
network validation require separate delivery gates. Checkpoint round trips
here do not qualify a production process/server crash recovery path.
No Chrome, mobile or performance run is claimed.

## Reproduce

Use Node 24, cached Cargo dependencies and fresh output directories. The recorded
comparison uses `/opt/homebrew/bin/cargo` on macOS; adapt that path elsewhere.

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
COMPOSITE_OUT=output/my-composite COMPOSITE_TARGET=output/my-composite-target node experiments/runtime-document-composite/compare.mjs
```

Run `identity-probe.mjs` beside the comparator for the separate TypeScript
reference/server observations. Do not overlap package/docs builds with tests
or TS traces: rebuilding removes and recreates `dist`. The [Rust guide](../../../apps/docs/src/guide/rust.md)
and [SDK README](../../../experiments/rust-sdk/README.md) provide a compiled native
reference-aware example. A successful local docs build does not deploy the site.

The selected evidence archive and manifest retain final traces, compact failed
receipts, source snapshots, before/after probes and consumer logs. Binaries,
Cargo targets, duplicate stdout and large nonfinal raw traces remain local;
exclusions are identified by reason and digest. Original receipt paths are
provenance, not portable command paths.
