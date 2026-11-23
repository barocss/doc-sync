# D2 nested payload references

This experiment uses `doc-sync-runtime-schema-payload-v3`. A reference slot has `at`, `source`, and optional `index` and `valuePath`. A value path uses string keys for objects and integer indices for arrays. Empty paths denote the original root slot and are omitted on output.

`schema.mjs` is a test adapter. It decodes the DTO into actual JavaScript objects. It unifies source object classes and their matching descendants before it rebuilds any root. Thus a shared parent implies shared descendants. A child group can select a new representative order and propagate that order through every parent alias. Shared children do not merge distinct parents. Explicit groups that overlap after parent closure reject. Composite source values are immutable schema constants. Document register values remain independent copies.

`fixtures.mjs` imports the inherited shared corpus without changing it. It adds nested object and array sources across text, flow, inline and atom attributes and value marks. Each runtime authors the semantic commands independently. The 296 commands across two schemas include concurrent writers, delivery, retry, carets, UTF16 selection, and nonempty nested format undo followed by a JSON checkpoint, redo, and delivery.

`compare.mjs` checks 162 actual TypeScript `Doc.edit` rows with separate staged `Doc.check` admission. It compares unwrapped operations and writer IDs, complete History, material registers, deletion and move ledgers, clocks, pending changes, carets, and selection anchors and paths. It checks exact `JSON.stringify` payload order in material attributes and marks. Source metadata retains its original `at`, `source`, `index`, and `valuePath`. Operation binding paths name the actual target payload.

`factory-order-probe.mjs` constructs four independent direct JavaScript object graphs. It compares 200 factory selections and 200 actual TypeScript edits with DTO decoding and SDK factories. It covers object key `"0"`, array index `0`, Unicode keys, nested arrays, representative order, shared parent descendants, and equal distinct parents with shared children.

`scope-probe.mjs` covers 56 admission and rejection cases. They include invalid nested path types, negative/fractional/unsafe array indices, missing keys, scalar endpoints, deep paths, implicit group overlap, graph identity, enum-root admission bypass, and atomic checkpoint and History rejection.

`identity-probe.mjs` runs the actual TypeScript `DocHub` with both source-owned and Hub-owned schemas. Its 32 rows distinguish omitted default births from retained nested payloads. Two further clone observations show that `Doc.apply` and a direct document snapshot preserve aliases within each independently cloned payload. JSON snapshot exchange and `History.snapshot` remove those aliases. Native public JSON values do not expose physical heap identity: that property is `NOT_REPRESENTED`. A native live-object bridge is `NOT_QUALIFIED`.

Run `regressions.mjs` after the root TypeScript build and engine source freeze. It builds native examples with Rust 1.87 and the legacy schema example with Rust 1.86 in a separate target. It freezes sources and binaries, checks inherited fixture/helper hashes against the task baseline, and runs the eight inherited corpora plus payload and inherited probes with at most four drivers. It checks the freeze after every driver. Large completed traces are stored as lossless gzip files with raw SHA256 and byte counts in the wrapper receipt.

Raw and JSON History redo admission are recorded separately from `Doc.apply` material behavior. A recovered composite enum payload can fail TypeScript `Doc.check` while still producing matching material JSON through `Doc.apply`. Such a result does not qualify TypeScript JSON/server protocol compatibility.

This experiment does not qualify native-envelope interoperability with the TypeScript server, cross-runtime checkpoint exchange, process-crash recovery, a live object bridge, renderer, WASM, network, mobile, or performance behavior. It changes no production TypeScript source.
