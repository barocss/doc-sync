# D3 model insertion after movement history

The corpus uses the original Word23 and Presentation27 descriptors. Their public source and preserved unpruned snapshots are checked. The older paragraph harness, adapters, receipts, and sealed reports remain unchanged.

Both runtimes receive the same explicit model child path and model node. TypeScript authors through staged and actual `Doc.edit`; native authors through the new moved model compiler. Physical token helpers have a separate contract.

For every logical model insertion, an independent oracle applies that insert to the complete prior canonical model with `applyEdits`. The resulting complete model must match. The requested slot, node type, supplied attributes, and content must also match. Exact operations and tickets, full History, pending changes, clocks, selections, registers, token/deletion state, and movement records are compared separately. No ticket or placement normalization is permitted.

The profiles cover root reorder, undone/redone movement history, moved default/required projections, cross-flow physical origins and current placement anchors, moved parent paths, and a suppressed cycle whose last record is not the winning placement. B adds UTF-16 text, structured fields, and a placement to A's new paragraph. Both actor undo orders are included. A's insertion undo/redo, own checkpoints, and pending retries must retain the three foreign UTF-16 tokens with their original IDs, values, attributes, and deletion state. Canonical schema cardinality can hide content; raw retention is checked separately.

Additional profiles deliver A's pending paragraph only after B reparents or deletes its predecessor. B's placement and deletion writers must remain unchanged during A's recovery. Complete multi-child flow models are also inserted after movement history.

Promotion profiles use explicit raw Node/Text seed operations. They do not stage `Doc.edit` or restore a checkpoint while the pre-movement seed has an implicit virtual-text cache. That earlier preparation boundary is retained separately and is not claimed fixed. After a recorded Move, equivalent own snapshots restore eligible physical line maps in A,B and B,A order. This controls the same lazy line-map order used by the independent design probe. Both orders must allocate the same four promotion IDs in UTF-16 line order, emit the same compiler operations, and satisfy the complete model oracle. Raw preparation and this snapshot-order control are separate from the logical model input contract.

`before.mjs` executes the pinned old paragraph binary with a valid recorded movement before insertion. It records the former blanket rejection without changing earlier compile-before-move traces.

After source, TypeScript dist, and the native binary freeze:

```
MOVED_SKIP_BUILD=1 node experiments/runtime-document-moved/compare.mjs
```

The binary is `output/rust-d3-moved-2026-11-04/native-target/debug/examples/runtime_moved_trace`. All Cargo builds use only the new target, one job, no incremental compilation, and debug information disabled. The experiment does not claim browser, mobile, renderer, network, WASM, performance, arbitrary model compiler, or cross-runtime checkpoint wire compatibility.

`regressions.mjs --prepare` makes output-only adapters for unchanged inherited oracles. Their original hashes, adapted hashes, and exact diffs are recorded. After the final freeze, `regressions.mjs` runs the unmodified paragraph466, unused84, and textfalse90 traces in the new target. It also checks the original schema export, valid admission oracles, the old paragraph binary, and thirteen prior report seals. Historical probes that assert repaired failure outcomes are explicitly excluded.
