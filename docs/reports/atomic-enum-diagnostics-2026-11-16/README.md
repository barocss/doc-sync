# Atomic enum container diagnostics (#26)

Baseline af9d17a accepts `values:"ab"` or `values:{}` in checkSchema,
schemaVersion and document construction. Later value validation uses string
substring membership in the first case and raises TypeError in the second.
These malformed descriptors are distinct from valid enum equality policy.

`diagnoseAtomicAttributeEnums` reports enum_type and exact path segments for
present non-array atomic values containers on nodes and value marks. Validation,
versioning and construction reject them. Direct attrValueOk returns false before
calling includes; early null resets remain unchanged.

Empty arrays remain accepted descriptors, with no non-null allowed members.
Atomic object members still use reference identity; nested field leaves still
use their existing deep equality/checker. Omitted or undefined values remain
unconstrained at the direct API boundary. This is not member/default coercion,
full arbitrary-input validation, nested-policy unification or migration.
Original WIP and native/actual-model execution are outside this change.

Independent review found no blocking defect. Validation: full core 1661/1661
PASS (~43 seconds), followed by focused 4/4 PASS including added live-transition
invariance; package build and final core typecheck PASS. Docs build/check PASS
(56 pages, 2682 internal links). No long-load or actual-model tests.
