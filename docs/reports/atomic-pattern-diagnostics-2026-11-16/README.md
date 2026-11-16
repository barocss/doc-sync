# Atomic pattern descriptor diagnostics (#19)

Baseline baa000d accepted `{default:"",pattern:"["}` in an atomic text-node
attribute: checkSchema returned [], document construction accepted the schema,
and a later attrValueOk("text") raised SyntaxError. Nested fields already catch
regex failures, so this is not a new regex or nested-fields feature.

The first narrow descriptor slice exports `diagnoseAtomicAttributePatterns` and
`AtomicAttributePatternDiagnostic`. Diagnostics contain a stable code and exact
path segments for atomic node attrs/value marks; existing checkSchema strings
include these errors before construction/versioning. Direct atomic validation
returns false on invalid/nonstring patterns, preserving early null resets.
Nested field diagnostics and enum equality semantics are unchanged: atomic
object enums use identity; nested leaf enums use JSON deep equality.

Scope excludes a complete unknown-input descriptor parser, all-constraint
coverage, regex complexity/ReDoS guarantees, default normalization, schema diff,
migration, automatic repair and actual-model validation. Existing valid schemas
must retain fingerprints and behavior. Original WIP is not included.

## Validation

- Focused descriptor regression suite: 6/6 PASS.
- Full core suite: 1637/1637 PASS (about 53 seconds), including existing schema
  version and collaboration tests; no long-running load test was added or run.
- Workspace package build and core TypeScript check: PASS.
- Independent review found the legacy constructor's conditional checkSchema
  gate. The patch retains that gate and adds atomic-only validation before
  document state initialization, without broadening other legacy diagnostics.
- An intermediate full-core run had 1634 PASS / 3 FAIL before the constructor
  fix and test-fixture corrections. The final result above is after those fixes.
- No provider/model invocation, external document transmission, migration or
  original-checkout WIP changes.

- Documentation build/link check: PASS, 55 pages and 2614 internal links.
