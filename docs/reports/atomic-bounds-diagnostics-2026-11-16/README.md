# Atomic numeric bounds diagnostics (#24)

Baseline dd0af8b accepts `{default:0,min:10,max:1}` in checkSchema,
schemaVersion and Doc construction, although no numeric value can satisfy it.
This slice diagnoses numeric-default atomic node attrs and value marks with
`bound_type` (present bounds must be finite numbers) and `bound_order` (min>max).
Exact path segments are returned without including descriptor values.

checkSchema/versioning and document construction reject these descriptors;
direct attrValueOk fails closed without numeric coercion. Omit a bound to leave
that side unlimited. Finite explicit bounds are consistent with schemaVersion's
existing finite-JSON requirement.

This does not normalize defaults, require default values to satisfy constraints,
change enums/null-reset, or interpret min/max on nonnumeric default values.
Nested-field checks remain separate. It is not complete descriptor validation,
regex safety, migration or a native/WASM qualification. Existing WIP untouched.

## Validation notes

Independent review found no blocking defect; additional tests cover explicitly
undefined bounds and separate diagnostics for two malformed bounds. Numeric
value validation avoids allocating a diagnostic list on its hot path.

An intermediate full-core run had 1655 PASS / 1 FAIL because the graphic helper
test expected its old later `malformed attribute` error. The malformed numeric
bound now fails earlier at schemaVersion with the structured bound error, so
that exact expectation was updated. This is an error-stage/message change,
not weaker acceptance of malformed descriptors.

Final validation: full core 1657/1657 PASS (~43 seconds); subsequent focused
bounds/pattern suite including added transition-invariance test 12/12 PASS;
package build and final core typecheck PASS. Docs build/link check PASS
(56 pages, 2668 internal links). No long-load or actual model calls.
