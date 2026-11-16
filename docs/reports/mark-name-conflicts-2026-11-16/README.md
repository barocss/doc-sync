# Boolean/value mark name conflicts (#27)

Baseline14948f4 permits one name in both `marks` and `markValues`. A string value
can survive canonMarks while Doc.markOk prioritizes the boolean declaration;
markOrder also lists the name twice. Ambiguous descriptors should fail before
an AI/editor begins authoring against inconsistent mark meanings.

`diagnoseMarkNameConflicts` reports mark_kind_conflict at the boolean declaration's
exact array-index path, without including descriptor payloads. Only own value-mark
keys count. checkSchema/versioning and both legacy/explicit-domain constructors
reject conflicts; no declaration is renamed, deleted or silently preferred.
Disjoint name ordering, values, defaults and inheritance remain unchanged.

This is not full mark-name/type validation, duplicate boolean-mark normalization,
renderer support, migration or arbitrary untrusted-object parsing. Existing raw
canonical helpers are not rewritten into validators; valid-schema preflight is
the boundary. Original WIP, native and actual-model execution are untouched.

Independent read-only review found no blocking defect. Validation: full core
1666/1666 PASS (~43 seconds), then focused5/5 PASS including an added repeated
conflict/valid mixed-mark operation-check case. Package build/final core typecheck
PASS; docs build/check PASS (56 pages, 2683 links). Tests using dist followed a
fresh package build. No long-load or actual-model qualification.
