# Nested schema payload references

This adds logical references to composite nodes inside schema-owned atomic
values in the experimental native Rust SDK. Document registers still have
independent writers. It does not add mutable links or independent per-subkey
CRDT edits. Full D2/D3, field aliases, a live object codec and production
Rust/WASM Client integration remain open. Baseline is main
`1cfb7a23611f0a98994a6716cfc2bddfc5ba89f4` plus 193 captured inherited files,
including the prior shared-v2 graph and IPv4 test binding repair. No commit,
push, website deployment or registry publication is included.

## Versioned schema and typed paths

Use `RuntimeSchema::compile_with_payload_references` with the v3 descriptor:
`doc-sync-runtime-schema-payload-v3`. It retains v2's `{representative, slots}`
groups and adds optional `valuePath` to a reference slot. The existing `at`
addresses a schema attribute/value-mark descriptor; `source` and optional
`index` select its default or enum entry. `valuePath` then traverses that atomic
JSON value using string object keys and integer array indices. The key `"0"`
is distinct from index `0`. Paths are bounded to 64 segments and endpoints must
be objects or arrays. Primitive endpoints, missing/invalid/unsafe paths, scalar
intermediate nodes, unsupported fields and malformed groups reject atomically.

`ReferenceSlot::at_value_path` and `SchemaValue::at_value_path` provide typed
selection. The handle retains original `at/source/index/valuePath`. The binding
`path` remains the target operation payload path. A nested source cannot bypass
an enum root's admission by sharing its outer descriptor name. Target default
omission uses whole-value identity, never child equality. Existing root
constructors and serialized bare/v1/v2 schemas preserve their identities and
behavior. Direct Rust `ReferenceSlot` struct literals initialize the new
`value_path` field; constructors remain the recommended root API.

## Parent and child identity

Sharing a parent implies sharing its composite descendants. Sharing/equal
children never merges their distinct parents. A nested explicit representative
overrides inherited child order through every shared parent. Ambiguous implicit
overlaps between explicit groups, cycles and incompatible payloads reject.
Unicode path ordering uses UTF-16 canonical ordering, including BMP/astral keys.

The compiler indexes composite nodes and propagates identity downward once.
Classes retain representative locators and target indices; they do not retain
one expanded payload copy per nested node. Effective root expansion builds
fresh containers and clones primitive leaves without repeated raw subtree
cloning. Factories and default/null/enumclone-fallback models use the resolved
representative order. Raw manifest/DTO and diagnostic base identity remain
separate from effective rules and graph-bound native identity.

Values remain atomic when written. Field branches keep their existing structural
validation/register semantics. A composite default with an enum still requires
its own root enum identity in this native subset; a TS-valid unlisted default
may remain native-unsupported. This work does not infer aliases from JSON equality
or add general nested schema migration.

## Comparison and clone boundaries

Independent authoring uses actual TS `Doc.edit` and native SDK commands. The
comparison checks raw unwrapped operations/IDs, full History, material writers,
clock, pending/carets and stable UTF-16 selections. Selected nested source
locators and target paths are checked separately from reference-class membership.
Nonempty nested formatting, undo, JSON History checkpoint, redo and delivery
retain original source `at/source/index/valuePath` and target `path` exactly.

A separate factory oracle builds direct shared JS DAGs independently of the DTO
decoder. It compares payload `JSON.stringify`, model/default/reset/fallback order,
parent-induced descendants and equal unlinked parents sharing children. Actual
TS author checks are counted from trace rows, including deletes, rather than a
command-name filter.

Actual TS `Doc.apply` copies each payload with `structuredClone`: internal aliases
survive inside one payload, while schema/payload and separate payload identities
are separated. Direct document snapshots preserve that observation; JSON
snapshots and `History.snapshot` flatten the internal aliases. These are measured
observations, separate from material JSON equality. Native public values are
JSON trees: physical heap identity is **NOT_REPRESENTED** and a live JS object
bridge is **NOT_QUALIFIED**. Native schema graph/handle provenance is logical
identity for admission; it is not proof of JS heap identity after storage.
Raw/JSON TS redo admission rejection is recorded separately from successful
`Doc.apply` material recovery.

Actual DocHub probes distinguish source and hub-owned schema references.
Canonical default omission can pass, while retained composite enum payloads
still reject atomically after clone admission. Native peer JSON success does
not provide a general TS/native transport bridge or production crash recovery.

## Verification

- Native core: **166 PASS**, including ten new payload tests.
- Native SDK: **105 PASS**, including four new payload tests.
- New comparison: two schemas, **296 commands / 592 actor states**, with
  **162 actual staged `Doc.edit` checks**.
- Independent factories: four direct DAGs, **200 selections / 200 TS edits**.
- Scope: **56** expected outcomes; actual Hub **32** rows plus two separate clone
  observations.
- Final wrapper: **20/20 PASS**, **208 source/binary hashes** fixed throughout.
- All **36** inherited runtime fixture/helper/doc files match the baseline.
- Prior seven sealed D2 capsules remain unchanged.

The eight inherited corpora pass: flow162/324states, grid180/360, shapes188/376,
rules260/520, six runtime profiles82/164, composite160/320, alias182/364 and
shared246/492. No inherited positive or negative fixture was removed or changed.
The final wrapper uses fresh executions; trace-reuse diagnostics are not final
qualification.

Before/after raw protocol proof re-verifies the prior pinned156 CLI's digest and
32 source hashes against this task's baseline. The same five requests fail on
the old version and succeed on the current version. Initial proof expected an
enum model value instead of its actual clone-compatible null fallback; the
failed expectation is retained and the corrected proof checks material register,
source provenance, fallback and snapshot explicitly. Native recovery remains
own-format in-process checkpoint replay, not production process/server crash
qualification.

English SDK/guide programs match their runnable Rust source and compile/run in
independent Cargo consumers. Initial harness/type/root-scope errors and source-
drift attempts remain diagnostic artifacts. The actual TS clone distinctions
and stricter native subset limits are not removed to obtain PASS.

Final integrated verification: **2,114 tests / 2,112 PASS / zero FAIL / two expected platform SKIPs / zero cancelled**. Package build and typecheck pass. Documentation build and checks pass: **55 pages / 2,625 internal links**, English content and local paths excluded. Final source checks match the core, SDK, comparison and main trace maps. Both fenced Rust programs and both compiled consumers are byte-identical; the runnable example adds only one module documentation comment. All seven earlier report seals remain unchanged.

## Evidence storage

At start, disk space was low. Large completed prior trace outputs were losslessly
gzipped with original/restored SHA checks. Their sealed reports, source and
executables remain unchanged; the mapping records how to restore each raw file.
New final drivers also gzip large traces after comparison. The final audit
restores all 29 mapped artifacts byte-for-byte and checks 1,214,631,816 raw bytes.
This preserves full trace content while avoiding another ENOSPC failure.

Final integrated counts and source bindings are in
[final-checks.json](final-checks.json). No Chrome/mobile, performance benchmark,
physical native heap identity, cross-runtime wire or native production crash
qualification is claimed.

## Reproduce

Use Node24 and cached Cargo dependencies. Native drivers use Homebrew Rust1.87;
legacy uses rustup stable1.86 in a separate target. Adapt tool paths on another
platform and choose fresh output directories:

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
npm run build
PAYLOAD_OUT=output/my-payload PAYLOAD_TARGET=output/my-payload-target node experiments/runtime-document-payload/compare.mjs
```

The [Rust guide](../../../apps/docs/src/guide/rust.md#nested-schema-payload-references)
and [SDK README](../../../experiments/rust-sdk/README.md) contain the same complete
native program. Do not overlap package/docs builds with TS traces or workspace
tests because builds regenerate `dist`. Local docs checks do not deploy a site.

The selected capsule retains final compressed traces and restoration mappings,
source snapshots, compact failures, protocol requests/responses and consumer
sources/logs. Binaries, Cargo caches, duplicate stdout and large nonfinal traces
are excluded with an index. Raw receipt paths are provenance, not portable
installation paths. This is selected evidence, not an installable distribution.
