# General blocks and JSON attribute differential experiment

Run `node experiments/rust-blocks-harness/harness.ts` after `cargo build --manifest-path experiments/rust-shadow/Cargo.toml`.
The fixed opt-in schema contains paragraph and heading text blocks, divider and image atoms, typed attributes and JSON `meta` within the supported wire domain. Production Doc.edit, commands, History, InputSession and SyncClient.pending provide the TypeScript reference. The native child receives operations, history options, selections and its own checkpoints, never expected states or expected inverse operations.

The receipt compares all token birth types/boundaries, attributes and register tickets, deletes/cancellations, model UTF16 runs, text and atom projections, aliases, clocks, exact history graphs/inverses/carets/pins and stable selections. Fixtures cover concurrent attributes/types, same-value ownership, foreign edits/deletes, seeded three-actor delayed causal delivery with duplicates and fresh-process pending replay. Sources and binary must remain unchanged during the recorded run.

This is a bounded flat-schema experiment. It does not qualify nested flows, grids, groups, inline nodes, moves, fields, arbitrary schemas, browser/WASM, performance, production switching or all of R4. Historical receipts remain unchanged.

Typed admission checks use production `Doc.check`; raw `Doc.apply` is permissive and is not the admission oracle. Atom attributes are valid across the same immutable shape, even when the current divider projection hides an image attribute. Boolean character marks accept false/null. JSON attributes with isolated UTF16 surrogates are a known native wire limitation: TypeScript admission accepts them; serde rejects the request without mutation. Nonfinite numbers and signed-zero normalization are outside this receipt.

The six fresh-process cases use actual pending attribute writes, type writes, block insertion, block deletion, undo and redo. The attribute case receives a foreign write to the same keys as well as foreign text. A dedicated concurrent `meta` fixture proves that the full JSON value is one LWW register: nested keys do not merge. Loser undo/redo and a foreign same-value rewrite retain the winning object. This is not `fields-v1` support. Replayed node births with changed valid birth attributes are ignored after the original birth, matching production.


Current movement-binary regression evidence uses `receipt-current-move.json` through `RUST_BLOCKS_RECEIPT`. All schema manifests, all eight harness source/readme pairs, native sources/tests/Cargo files, production sources, the MemoryNet helper and the exact binary are hashed. Historical receipts remain unchanged.
