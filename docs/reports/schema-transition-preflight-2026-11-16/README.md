# Read-only schema transition preflight (#20)

Baseline d98a7dd has schemaVersion and assertCompatibleSchema, plus a separate
renderer-declaration preflight. It lacks a descriptor transition preview.

The new public preflightSchemaTransition calls the existing validators/assertion
and supplies normalized, deterministic descriptor paths without values. Invalid
input is reported before diff with no partial identity/changes. Changes operate
on validated canonical JSON snapshots; arrays are atomic. Reasons retain existing
validation text, potentially including schema references, and are not redacted.

No document state, migration, renderer support, access policy, affected count or
safe deployment is inferred. Differences and hashes are not compatibility
heuristics. Actual transition checks remain mandatory. Original WIP, actual
model calls, and long load are outside this work.

## Evidence

- Focused preflight and existing version tests: 11/11 PASS.
- Package build and core TypeScript check: PASS.
- Independent review found no blocking defect; added actual two-child reorder
  and own `__proto__` path tests following review.
- Intermediate fixture failures were corrected: invalid schemas are classified
  separately from valid-but-incompatible transitions; readonly arrays are replaced
  rather than mutated, and narrowed discriminants are checked consistently.

- Full core suite: 1642/1642 PASS (about 56 seconds).
- Docs build and link check: PASS, 55 pages / 2615 internal links.

## Remaining acceptance follow-up

The initial close was corrected because capability reporting and a direct state
invariance test were still missing. The follow-up shares
`requiredDocumentCapabilities` among server hello advertisement, client hello
validation and preflight. It reports protocol-level before/after requirements,
not inferred content usage or verified peer/renderer support. A real disconnected
client with a pending local edit checks document snapshot, pending queue, history
snapshot/object identity and hub snapshot/revision/schema identity across
compatible, incompatible and invalid previews.

- Focused follow-up suites: 18/18 PASS; package build/core typecheck PASS.
- Independent review confirmed exact handshake semantics and no runtime cycle
  (protocol schema/doc imports are type-only).
- One initial fixture incorrectly used a flow root for graphic domain and was
  correctly rejected as invalid. Replaced it with a valid container-root schema;
  the document-to-graphic transition remains incompatible while requirements are
  accurately reported.

- Follow-up full core: 1644/1644 PASS (~41 seconds); docs build/check PASS (55 pages, 2615 links).
