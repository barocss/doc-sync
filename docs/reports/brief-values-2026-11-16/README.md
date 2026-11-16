# Structured brief attribute and mark equality

Issue: https://github.com/barocss/doc-sync/issues/2

Implemented from clean main revision 6d10c27 in an isolated worktree, without
including the separate native D2/D3 or other inherited uncommitted changes.

## Behavior

- Additive v1 `attribute_equals` and `mark_equals` requirements.
- Declared node attributes, including span-mapped URL attributes; nested own
  JSON object properties may select a bounded scalar leaf.
- Marks inspect one selected text run's own values. Span ancestor values are
  not inferred. Boolean marks require boolean expectations.
- Missing is not null, false, zero, empty string or an inferred schema default.
- Unsupported structure, nonfinite values, cyclic/accessor data and oversized
  input fail closed. Existing brief kinds retain their prior behavior.
- Existing runner schema fingerprint and authoritative revision checks remain
  unchanged. Correct text alone cannot establish a requested URL or mark.

## Local verification

Using Node 22.19.0 and locked dependencies in the isolated checkout:

- Focused new and legacy brief unit tests: 23 PASS.
- New and existing authoritative runner tests: 15 PASS, including equal-text
  correct/wrong URL/wrong mark, persisted reports and delayed-stream fencing.
- Complete bot test suite: 66 PASS, zero failures/skips.
- Root TypeScript check PASS.
- Documentation build/check PASS: 55 pages, 2609 internal links, English and
  local-path checks. A nonblocking existing chunk-size warning remains.
- Independent read-only implementation review found no blocking issue; exact
  path, own-mark/default semantics and bounds are documented in the bot guide.

These results do not establish full schema validation, cardinality, provenance,
undeclared-content preservation or full B2 completion. Canonical run indexes
are not stable IDs or text offsets. Long-duration load was deliberately deferred.
