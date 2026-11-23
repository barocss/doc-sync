# Bounded native `text:false` qualification

`fixtures.mjs` defines two renamed document schemas. Each has normal text, media with `text:false`, inline nodes, a false text group member, an all-false nested flow, and a grid cell with an all-false body. Commands carry semantic intent. Neither runtime receives the other runtime's operations.

`compare.mjs` runs independent TypeScript `Doc.edit` and native SDK authoring. TypeScript stages edits, calls `Doc.check`, and records its own History. It compares typed operations, material tokens and writer registers, deletion ledgers, moves, models as UTF16 units, full History, pending changes and carets, clocks, selection anchors and resolved paths. Each runtime restores its own JSON checkpoint and retries pending operations. The final fixture has 90 semantic steps across both schemas. Raw same-value type writers use TypeScript `Doc.emit` and native `record`; these rows do not claim logical compiler parity. Per-runtime guards require retained text, foreign UTF16 text after undo, and foreign type writer protection.

The TypeScript source defines these policies:

- `schema.ts:acceptsText` checks whether ANY stored text type in a flow accepts text. `storedTypes` expands group members. A current `text:false` marker in a mixed flow can therefore receive raw text.
- `doc.ts:check` adds an immutable birth-spec check for containers. The ordinary document flow does not add that check. Inline admission in a flow uses the union of permitted inline types. Containers add the birth text type's explicit children check.
- `doc.ts:sourceBlocks` retains characters after a type change to a false text type. It does not hide existing or newly admitted characters.
- `edit.ts:insert` and `insertUnits` do not call `takesText`. A logical insert into false text can emit text operations. In an all-false flow, `Doc.check` rejects those operations. `Doc.edit` itself does not promise transaction preflight.
- `edit.ts:split` checks `takesText`. Enter on a false text type emits no operations. A normal text type can still name a false text type as its `next`. The flow default can be false.

`oracle.mjs` checks raw admission and model projection for mixed, explicit true, and all-false flows, with and without groups. It checks default markers, explicit markers, type changes, and raw batches with a valid prefix. A rejected native batch must leave its snapshot unchanged. It also records actual TypeScript logical insert and split outcomes separately.

`product-boundary.mjs` preserves all original product descriptors. It compares the pinned previous patterns CLI with the current CLI. Demo and Notion now compile. Word advances to an unused `divider` declaration; Presentation advances to unused `heading1`. Removing unused declarations is a diagnostic transformation. Compile success does not establish full product authoring parity.

## Preserved failure boundaries

An initial exact comparison found a real compiler difference: a same-current-type `$type` update emits no TypeScript `Doc.edit` operations, while the native SDK setter emits a Set operation and advances its clock. That failure remains in its original output directory. The main logical comparison uses a changed type. A separate raw-wire branch checks same-value foreign type writer protection through undo. This does not repair or normalize the same-type compiler difference.

An initial fixture tried a container in the document domain. TypeScript correctly rejected the schema: a container requires the graphic domain. Native graphic text uses a dedicated `/text` slot. Actual TypeScript graphic tokens share their container line. A separate source probe checks TypeScript admission using real marker origins. Native graphic `$type` updates remain unsupported. Container birth policy is supported by source inspection, the TypeScript probe, and native focused tests; it is not part of this exact document state comparison.

Malformed JSON `text` flags are outside the typed `TextSpec.text?: boolean` contract. Native strict rejection of those values is not a TypeScript rejection-parity claim.

## Run

Use Node 24. Build the TypeScript package first. Run after sources are stable:

```sh
CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 node experiments/runtime-document-textfalse/compare.mjs
node experiments/runtime-document-textfalse/oracle.mjs
node experiments/runtime-document-textfalse/product-boundary.mjs
```

The driver builds the new `runtime_textfalse_trace` example offline with the locked Cargo graph. It uses `output/rust-d2-textfalse-2026-11-04/native-target`. Each run has a unique output directory. Receipts record hashes before and after execution. Raw traces over 1 MB are compressed with verified SHA256 round-trip records. Older evidence, fixtures, and seals remain unchanged.

Browser, mobile, renderer, WASM, network, performance, arbitrary document compiler parity, and full product acceptance are outside this qualification.
