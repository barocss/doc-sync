# Blocks without plain text

The private native runtime accepts `text: false` on text-shaped schema nodes.
It keeps text-block storage, inline children, defaults and existing projection.
The implementation changes compilation and text admission in flat flows,
nested flows and native graphic text storage. No TypeScript collaboration rule
or SDK production API is changed.

## Admission and retained content

Document raw character admission uses all stored text types in the source flow,
including group members. A false-only flow rejects characters. A mixed flow can
accept text after a disabled marker when another stored type accepts text.
Accepted characters remain stored and visible through `$type` changes.
Allowed inline nodes still work in false-only nested flows and cells.

TypeScript container admission also depends on the immutable birth type.
A separate probe uses actual TS marker origins and continuation characters;
there is no synthetic `/text` head in TypeScript. Native graphic storage uses
a different dedicated-line model and now checks its immutable owner birth type.
This supports an admission-policy comparison, not complete cross-runtime graphic
state or graphic `$type` equivalence. Native graphic type changes remain an
inherited unsupported boundary.

Boolean `text` values are accepted; malformed JSON flag types reject in Rust.
TypeScript's runtime schema checker can accept some malformed untyped values.
These are recorded as stricter native input boundaries, not equivalent rejection.

## Verification

Final counts, commands and source bindings are in
[final-checks.json](final-checks.json). The new differential corpus uses two
independently renamed Document schemas with mixed text types, groups, nested
flows, cells and inline nodes. It compares exact operations and tickets, material
state, full History, pending/carets, selections, undo/redo, own JSON checkpoint
restore and pending retry. Peer text and external type writers have explicit
semantic assertions.

The initial logical comparison observed an existing compiler difference: setting
`$type` to its current value emits no operations in TypeScript `Doc.edit`, while
the explicit native SDK setter emits a Set. That first FAIL remains preserved.
The final main separately labels `Doc.emit`/native `record` raw authoring for
same-value external-writer protection. It does not normalize tickets or claim
that the logical compiler difference is fixed.

SDK tests and the documented program cover a false-only default, inline nodes,
local/remote text rejection, valid-prefix invalid-batch rollback, mixed-flow
UTF-16 text retention, type changes, other-user attributes, caret/selection,
undo/redo, checkpoints, exact retry and acknowledgement. README and guide
programs compile and run as independent consumers.

Original Demo and Notion schemas now pass native compilation. Word still rejects
its valid unused `divider` declaration; presentation rejects unused `heading1`.
Compiler success is separate from complete product authoring qualification.
Removing unused declarations in diagnostic variants does not change the original
fixtures or qualify their full behavior.

## Preserved work and evidence

The baseline captures inherited uncommitted source and all earlier report seals.
SDK cargo formatting unexpectedly changed six pre-existing files. Each formatted
file was archived and compared with its baseline through identical rustfmt
output. Only those six formatting changes were restored to exact baseline bytes;
new tests, examples and docs were preserved. Full SDK tests, the example and both
document consumers were then rerun on restored source. Initial logs remain.

A fresh compact Cargo target disables development/test debug information and
incremental caching to fit available disk space. Optimization and overflow
settings retain the development defaults. Prior targets and pinned executables
are preserved. No performance comparison is inferred from these build settings.
Large new traces are gzip-preserved with original-byte hash restoration checks.

Final verification: native core **183 PASS**, restored-source SDK **116 PASS**.
The final Document comparison passes **two schemas / 90 actions / 180 actor
states**, including **38 actual staged Doc.edit authorings** and **four raw
Doc.emit authorings**. Raw routes are labeled separately. Exact operations,
tickets, full History, material state, pending/carets, selection, own JSON
checkpoint restore and retry match. The focused oracle covers 24 raw admission
cases, five TS logical observations and six malformed-flag boundaries. Actual
TS Graphic origin/birth observations cover four cases separately from native
focused tests; graphic state/type-change parity is unqualified.

The complete inherited patterns corpus is freshly rerun: **two schemas /
84 actions PASS**. This does not rerun the historical 23-driver suite. Final
source/binary maps match main143, oracle4, product7 and inherited143 entries;
restored SDK source/docs52 and TS/integration31 maps also match. Ten prior report
seals and 14 prior target binaries remain unchanged. All 20 compressed trace
artifacts restore 172,473,757 original bytes with matching SHA256 checks.

Whole npm: **2,114 tests / 2,112 PASS / two expected platform SKIPs / zero FAIL /
zero cancelled**, 123.277 seconds. Typecheck and docs build pass. Documentation
checks pass **55 pages / 2,640 internal links**, with English content and local
paths excluded. Both fenced Rust programs and both compiled consumers are
byte-identical to the entire runnable example source.

## Remaining boundaries

Full D2/D3 schema/compiler coverage, valid unused declarations, production
Rust/WASM Client/editor delivery, native Map/List, protected GC and native
production process/server recovery remain separate gates. Own checkpoint replay
is not mixed-runtime wire or server durability qualification. No Chrome, mobile
or performance benchmark is claimed. No commit, push, deployment or registry
publication is included.

## Reproduce

Use Node24 and cached Cargo dependencies with compatible Rust. The captured
native toolchain is Homebrew Rust1.87. Use the task's compact build environment
or choose another target with sufficient disk space:

```sh
CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 cargo test --locked --manifest-path experiments/rust-shadow/Cargo.toml
CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 cargo test --locked --manifest-path experiments/rust-sdk/Cargo.toml
cargo run --locked --manifest-path experiments/rust-sdk/Cargo.toml --example runtime_textfalse
npm test
```

The [Rust guide](../../../apps/docs/src/guide/rust.md#blocks-without-plain-text)
and [SDK README](../../../experiments/rust-sdk/README.md) contain the complete
native program. Comparison code is in `experiments/runtime-document-textfalse`.
Avoid package rebuilds during TS traces because they regenerate `dist`.
The selected evidence capsule contains sources, diagnostics, logs and consumers;
it is not an installable distribution or a complete Cargo cache.
