# Product validation patterns

The private native runtime supports the two patterns already used by the public
product schemas: optional HTTP(S) links and optional six-digit hex colors. This
extends partial D2 using the existing attribute, field and value-mark APIs.
Production SDK APIs and TypeScript editing rules are unchanged.

## Supported behavior

- `^(https?://\S+)?$`: empty string or the case-sensitive prefix `http://` or
  `https://` followed by one or more characters without ECMAScript whitespace.
- `^(#[0-9a-fA-F]{6})?$`: empty string or `#` followed by exactly six ASCII hex
  digits.

The link rule uses the ECMAScript whitespace set explicitly. BOM is whitespace;
NEL, U+180E and zero-width space are not. Rust Unicode whitespace classification
has different behavior. The pattern validates the declared string grammar;
URL parsing and host checks remain application responsibilities. Null retains
the existing reset behavior. Non-string values reject where the schema requires
strings. Existing pattern handlers remain unchanged, and unsupported expression
variants reject during schema compilation. No general regex dependency is added.

## Verification

Source-bound command receipts and final counts are in
[final-checks.json](final-checks.json). The independent oracle executes actual
JavaScript `RegExp`, schema value validation, `Doc.check` and staged `Doc.edit`.
It distinguishes raw regex matching from typed validation and null reset.

Native SDK tests cover atomic attributes, value marks, nested field leaves and
cell attributes, invalid batch rejection without changing clock/History/pending,
concurrent actors, undo/redo that retain another user's writers, own JSON
checkpoint restore and idempotent pending replay. The README and guide contain
the same runnable Rust program, compiled in independent Cargo consumers.

The differential corpus uses two independently renamed schemas. It compares
raw operations and tickets, normalized material state, full History, pending,
carets, undo/redo and own checkpoint replay. Selected inherited corpora validate
shared admission paths; other earlier sealed results remain historical evidence.
This task does not repeat the entire previous 23-driver qualification.

A pinned previous core executable and current executable inspect the original
product schemas. They record the first compiler rejection before and after.
Diagnostic variants that remove `text: false` or unused declarations remain
explicitly labeled. Compiling such variants does not prove original product
editing or collaboration support.

The initial SDK fixture expected a reset color to appear as an empty-string
model property. The existing model omits that property. The corrected test
asserts omission and retains the original failed log; production projection
rules are unchanged.

Final verification: native core **177 PASS**, SDK **113 PASS**. The two-schema
trace passes **84 actions / 168 actor-state comparisons / 44 exact operations**,
with 36 positive staged Doc.edit cases and 16 rejected target actions. The oracle
passes **1,267 typed cases**: 362 new and 905 legacy-pattern cases. It executes
1,232 string RegExp tests, 2,534 native value-validator checks, 1,416 actual JS
target checks/staged edit records and 33 schema compile cases. Its whitespace
matrix covers all 25 ECMAScript whitespace codepoints and 15 contrasting values.
Two lone-surrogate inputs are BOUNDARY_OBSERVED, excluded from parity PASS.

The 24 product compilation probes use demo, Word, Notion and presentation.
Current originals reach a text:false rejection after passing pattern admission;
they remain unsupported complete profiles. One selected inherited composite
article trace retains status **FILTERED_DIAGNOSTIC_PASS**, 80 actions. It is not
a fresh full-corpus or full 23-driver PASS. Final before/after/current guards match
main139, oracle80, product8 and filtered legacy140 source/binary entries.

Whole npm: **2,114 tests / 2,112 PASS / two expected platform SKIPs / zero FAIL /
zero cancelled**, 133.424 seconds. Typecheck passes; docs build and checks pass
**55 pages / 2,635 internal links**, with English content and local paths excluded.
Nine earlier report seals and 14 previous target binaries remain unchanged.
The 17 new compressed outputs restore all 223,812,772 original bytes with exact
SHA256 checks. Compiled documentation program bodies match both current fences.

## Boundaries

Rust JSON strings represent Unicode scalar values. JavaScript lone-surrogate
strings remain a separate JSON/value-codec boundary, recorded by the oracle.
They are not replaced or counted as successful cross-runtime pattern parity.
Native text UTF-16 support does not change this JSON attribute-value limit.

Original product schemas still require `image-block.text: false` support and,
for some profiles, admission of valid unused declarations. Full D2/D3,
production Rust/WASM Client/editor bindings, native Map/List, protected GC and
production native process/server durability remain separate gates. Own-format
checkpoint replay does not qualify mixed-runtime wire exchange or server crash
recovery. No Chrome, mobile or performance benchmark is claimed. No commit,
push, deployment or registry publication is included.

## Reproduce

Use Node24 and a compatible cached Cargo toolchain. Current native evidence uses
Homebrew Rust1.87. Choose fresh output directories:

```sh
cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
cargo run --locked --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_patterns
npm test
```

The [Rust guide](../../../apps/docs/src/guide/rust.md#product-validation-patterns)
and [SDK README](../../../experiments/rust-sdk/README.md) show API use. Comparison
sources are in `experiments/runtime-document-patterns`. Do not rebuild packages
during trace checks because builds regenerate `dist`.

The selected evidence capsule retains sources, exact input/output, compact
failures, logs and consumers. It excludes Cargo caches and loose executables
with an index. The task target was an APFS copy-on-write clone of the completed
prior target; the original target and earlier sealed reports were preserved.
