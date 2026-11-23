# Q1.3.4 bounded native ID read catalog

Add a read-only catalog with a model and the existing opaque local edit base.
Enumerate visible stored primary blocks once through the strict target walker;
expose their current model paths, type and stored-flow capability. Enumerate
owned grid rows/columns and uncovered cell tuples with body paths. Do not invent
IDs for default/group/cell/body wrappers or include hidden/covered descendants.
Model paths are read-time diagnostics, not durable identity. Base lifetime and
strict command validation remain unchanged; catalog membership is not authority.

No wire/core/checkpoint/history change. No server lease, WASM, generic multi-axis
edit or alias-diagnostic completion claim. Preserve historical sealed reports
and baseline all inherited source before additive changes. Verify read purity,
base reuse/staleness, move/group/default/grid ownership and catalog-to-command
round trips. Do not publish remotely. Independent review is in progress.
