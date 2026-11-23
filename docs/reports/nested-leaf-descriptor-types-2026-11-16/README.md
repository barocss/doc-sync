# Nested leaf descriptor type guards (#28)

Baseline4b39ad7 accepts nested numeric leaves with string bounds and string
leaves with object patterns through checkSchema/schemaVersion and direct field
validation, via JavaScript coercion. Malformed enum containers can also reach
`.some` and throw instead of producing ordinary invalid-descriptor results.

The existing fieldsSchemaProblems checker now reports explicit leaf-container,
pattern-type and numeric-bound errors. Direct leaf validation returns false
before coercion or non-array `.some`; early null resets and valid deep enum
comparison remain unchanged. Numeric bounds apply only to numeric-default leaves.

This does not change branch/default semantics or expand the legacy raw Doc
constructor gate. Call schemaVersion/checkSchema before installing a schema;
raw constructor acceptance alone is not a comprehensive nested validation proof.
No new general unknown-object parser, nested structured diagnostic API, migration,
member normalization or performance qualification is claimed. Original WIP and
native/actual-model execution are untouched.

Independent review found no blocking defect; branch- and leaf-level null resets
are explicitly covered. Full core1670/1670 PASS (~42 seconds), then focused4/4
PASS with added deep-path/transition-invariance case. Package build/final core
typecheck PASS; docs build/check PASS (56 pages, 2683 links). No long load.
