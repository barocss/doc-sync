# Exact-text no-raw-text schema guard (#17)

At f8a95ef51, a valid schema declared a text-shaped `label` with `text:false`.
Malformed evidence nevertheless supplied `runs:[{text:"forbidden"}]`.
`verifyBrief` returned passed for exact_text while text_occurrences returned
failed. This is a malformed-evidence inconsistency, not a demonstrated invalid
canonical document emitted by a server or actual-model failure.

`ExactTextContext` now carries the selected text node's acceptsText policy.
Nonempty raw text is rejected recursively through declared spans when text is
forbidden. Empty no-text evidence remains valid, as do ordinary text-enabled
nodes. The verifier does not mutate evidence or schema. This does not add full
attribute-value, cardinality, pattern or whole-model validation to legacy checks.

Tests use synthetic schemas and malformed evidence only. No model/provider,
credentials, user-document transmission or long load. #10/#14 remain open and
original checkout WIP is preserved.

Independent guard review and new 8-case synthetic suite completed. New + existing
brief/brief-values tests: 31/31 PASS. TypeScript and whitespace checks PASS.
Empty and ordinary enabled/omitted-text behavior remains covered. No docs site
page or navigation was changed; this repository report is not a published page.

Final full bot regression: **149/149 PASS** (49.3 seconds).
