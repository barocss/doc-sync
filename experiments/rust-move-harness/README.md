# Pinned movement and logical text storage differential harness

Run `node experiments/rust-move-harness/harness.ts` after building the native shadow.
Use `RUST_MOVE_RECEIPT` and `RUST_MOVE_TRACE` to select new output paths.
`RUST_MOVE_TS_ONLY=1` checks authoring paths and reference assertions without claiming native parity.

The v6 contract pins `movement-logical-storage:json-attrs:value-marks:v1` with capability `movement-logical-storage-v1`. It compares full physical stores, operation placements, recursive projections, logical models, History shared graphs and generated inverse operations. Recovery uses real MemoryNet SyncClient pending batches with a fresh native process, two exact replays and four subsequent History actions. Foreign text and attribute writers target the original moved/split node.

This is a fixed experimental schema. Dynamic schema registration and hot changes, production integration, browser, WASM, performance and live server acceptance are outside this receipt.

The comparator calls production `Doc.posAfter` for every saved raw endpoint. Any throw fails the run. Native endpoints must equal the complete TypeScript position, including the physical line. The receipt reports `rawEndpointStatus: PASS` and `rawEndpointNotRun: 0` only after all comparisons pass. It records the exact TypeScript and native output at each of the four former hidden root gap exception checkpoints. A coverage assertion requires all four checkpoints exactly once. `InputSession.resolve` is also compared in full, including null.

The original `receipt.json` and `fulltrace.json.gz` retain the earlier bounded result with four omitted comparisons. Use `RUST_MOVE_RECEIPT=experiments/rust-move-harness/receipt-current-cursor.json`, `RUST_MOVE_TRACE=experiments/rust-move-harness/fulltrace-current-cursor.json.gz`, and `RUST_MOVE_SUMMARY=experiments/rust-move-harness/summary-current-cursor.txt` to preserve that evidence.
Automatic leading gap movement, replacement text, split and resplit use actual `Doc.edit`. Empty virtual trailing gaps are absent from model authoring paths (`visibleBlocks` in `edit.ts`). That separate fixture therefore identifies its low-level `Doc.emit` physical trailing seed, empty trailing movement and replacement text explicitly. Subsequent virtual promotion, movement and split/resplit use actual `Doc.edit`. These wire fixtures do not claim an editor authoring path for model-hidden empty trailing gaps.

`TS_ONLY_PASS` confirms reference authoring and model paths only. It is not native acceptance. The native receipt and readable `summary.txt` include trace byte counts and SHA-256 values. This bounded result is not a full R4 product gate. Passing this harness establishes parity only within the declared native fixtures.
