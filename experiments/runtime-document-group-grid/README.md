# D3 group and grid model insertion

The first four small profiles passed before expansion. The final corpus has 22 profiles: 14 on the original unpruned Word23/Presentation27 schemas, two explicit recursive cell/table compositions, and six deterministic generated custom schemas. Custom variants are not additional original product schemas. Both runtimes receive the same logical model commands.

Every logical insert must match the complete independent model result. Ordinary commands use `applyEdits(schema,beforeCanonicalModel,sameInsert)`. Axis commands also apply independently derived existing contracts: a partial-row cell command creates a rectangular whole column; merge extents grow only for insertions inside their prior anchored range; a row added to an existing grid keeps its current column count, clips valid excess payload cells, and pads missing cells. New-grid creation still uses maximum supplied row width. Expected results never read actual CRDT state or returned normalization. A separate check requests `{normalize:true}` and verifies request plus returned normalization reproduces the actual model. Canonical target type, attributes, content, and position are checked, including regrouped destinations. Exact operations/tickets, full History, pending changes, material tokens/registers/deletion ledgers, foreign writers, stable selections, own checkpoints, and retries are compared separately.

A list wrapper has no stored ID. Its returned key is the first stored member. Group wrapper `by` values feed member attributes; explicit member values and null resets override them. A group path is an insertion position in its parent flow. A list-item can extend the group; a paragraph or grid can split it when that parent admits the type. Original Word lists belong inside a section. Presentation lists are reachable through text-boxes, not directly through presentation/slide roots.

Original table cells contain a cell-body flow with paragraph/list/figure children. A true table inside that cell-body needs an explicitly labeled schema-composition variant. It is not an original product placement. Dense initial tables contain UTF-16 text, bold marks, inline mentions, and structured cell properties.

Covered cell contents remain in the full model and raw storage. Profiles keep hidden text, span endpoint writers, and foreign cell fields through peer row/column changes and both undo orders. Covered selection captures the hidden identities and resolves to the merge origin. Another profile checks max-clamped title data hides and reappears without losing its raw token identities. Six generated-schema seeds check renamed node/attribute/mark roles separately; this is bounded seed reproducibility, not arbitrary-schema fuzzing or shrinking.

Empty group/grid input is a separate API policy boundary: TypeScript can normalize/drop it; the native `(Key,Change)` API rejects it atomically because there is no legitimate stored result key. No fake wrapper or axis ID is introduced.

After sources, dist, and the new native binary freeze:

```
GROUP_GRID_SKIP_BUILD=1 node experiments/runtime-document-group-grid/compare.mjs
```

Only the new `rust-d3-group-grid-2026-11-04/native-target` is built. Cargo uses one job, no incremental compilation, and debug information disabled. Older harnesses, adapters, evidence, and seals remain unchanged. Browser, mobile, renderer, WASM, network, performance, schema transition, offline GC, and IME qualification are outside this task.
