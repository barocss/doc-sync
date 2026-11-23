# D2 cross-attribute shared references

This experiment uses `doc-sync-runtime-schema-shared-v2`. Each reference group has an explicit representative and at least two unique slots. A slot names a complete descriptor path, source (`default` or `enum`), and enum index when required. The representative must occur in its group. Slots cannot occur in two groups.

`schema.mjs` creates actual shared JavaScript objects from the DTO. One group uses the representative payload and its property insertion order. Equal unlinked slots remain separate objects. The canonical native identity includes the representative and group membership. The TypeScript JSON manifest identity does not encode those identity edges.

`fixtures.mjs` retains the inherited alias corpus and adds cross-attribute references between value marks and text, flow, inline and atom node attributes. Source and target attribute names differ. Source metadata remains the selected original slot. Operation payload paths name the target attribute.

`compare.mjs` runs independent TypeScript and native authors. It checks every positive TypeScript `Doc.edit` result through a separate staged `Doc.check`. It compares unwrapped operations and writer IDs, complete History, material token registers, deletion and move ledgers, clocks, pending changes and carets, UTF16 selection anchors and paths, recovery, undo, redo, retry and ACK behavior. Raw and JSON History redo admission are recorded separately from material application. Each material attribute and mark payload also has an exact `JSON.stringify` order check.

`factory-order-probe.mjs` compares direct shared JavaScript schemas, DTO hydration and SDK value factories. It includes enum-only groups, a representative outside the first sorted slot, reordered equal members, equal unlinked objects, and nested arrays. It checks source metadata, raw payload order, actual TypeScript edits and direct/hydrated material models.

`scope-probe.mjs` checks declared cross-kind and cross-name admission, unlinked equal values, malformed groups, foreign graph identities, checkpoint and History forgery, and atomic rejection. Existing stricter native admission boundaries remain explicitly classified.

`identity-probe.mjs` uses the actual TypeScript `DocHub`. It distinguishes references from the source schema and the Hub-owned schema. Structured schema cloning preserves sharing within a group. Canonical omitted births pass. Retained composite enum payloads lose identity at the Hub retained-op clone and reject atomically.

Run `regressions.mjs` only after the TypeScript build and source freeze. It builds native examples with Homebrew Rust 1.87 and the legacy schema example with rustup stable Rust 1.86 in a separate target. It freezes the source and all binaries, preserves every inherited fixture hash, runs the seven inherited corpora plus new checks with up to four drivers, and checks the frozen hashes after each driver. Source or binary drift produces a failure. Diagnostic filtered or reused traces are never a product PASS.

No result here proves native-envelope interoperability with the TypeScript server, cross-runtime checkpoint exchange, process-crash recovery, renderer, WASM, network, mobile, or performance behavior. No production TypeScript source is changed by this experiment.
