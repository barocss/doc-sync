# Bounded native document pattern qualification

This experiment checks exactly two new public patterns:

- `^(https?://\S+)?$`
- `^(#[0-9a-fA-F]{6})?$`

The link pattern is a string constraint. It does not parse URLs or test reachability.

`compare.mjs` supplies only semantic commands and descriptors to the native SDK trace. TypeScript authors its own operations with `Doc.edit`, validates them with `Doc.check`, and records its own History. The comparison checks raw operations, model text as UTF16 units, full History, pending changes, clock, writer registers, deletion ledgers, checkpoints, and peer content after selective undo. The fixtures use two renamed schemas and 84 actions. The cell text helper passes marks in a text run, as required by the public edit API.

`oracle.mjs` uses actual JavaScript `RegExp.test` on strings, `attrValueOk` on typed values, and public `Doc.check` for atomic attributes, fields, marks, and grid cells. It sends only inputs to a separate native `value_ok`/`atomic_value_ok` oracle. Cases cover all 25 ECMAScript whitespace code points; NEL, U+180E, zero-width characters, controls, astral characters; null reset and wrong types; five existing pattern forms; valid and invalid source defaults; and unknown regex rejection. Lone UTF16 surrogates pass the JavaScript string APIs but fail the native JSON parser. The receipt records that boundary without replacement.

`product-boundary.mjs` compiles the original demo and three public product descriptors with a pinned prior core executable and the current executable. The original descriptors advance from the link-pattern blocker to `text:false`. Removing `text:false` is a diagnostic change. Word and Presentation then expose unused node declarations that the native compiler rejects. These changes do not qualify the original products.

Run after the package build and native sources are stable:

```sh
node experiments/runtime-document-patterns/compare.mjs
PATTERNS_ORACLE_BINARY=output/rust-d2-patterns-2026-11-04/core/patterns-oracle-01 node experiments/runtime-document-patterns/oracle.mjs
node experiments/runtime-document-patterns/product-boundary.mjs
```

The shared target is `output/rust-d2-patterns-2026-11-04/native-target`. The comparison builds `runtime_composite_trace` in that target, then freezes its hash before execution. All drivers write unique output directories. They preserve prior fixtures, traces, receipts, and executables. Receipts compare source and binary hashes before and after each run.

Browser, mobile, renderer, WASM, network, performance, and original product acceptance are outside this experiment.
