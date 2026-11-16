# Planner persistence bounds (#16)

At 26b06a5, direct-runner `checkPlan` accepted an insert plan containing unused 2 MiB `editsJson`. Only action=edit reached the later 64 KiB structured-edits validator. Non-inspect `focus` and additional keys were also unchecked, while pending/history persisted the complete plan. A read-only evaluation of the original validation function reproduced acceptance. This is local resource-safety hardening, not evidence of remote code execution.

Runtime validation now checks allowed fields, every optional field and complete serialized size before an output can become pending/history. Existing structured operation validation remains separate. Normal optional omissions and bounded plans remain supported. The model schema or instructions alone are not the enforcement boundary.

No actual model, external user document, credential inspection or long load was used. The trusted injected callback is not sandboxed by validation. Already-allocated oversized provider output and historic oversized mission files are not retroactively bounded by this change; a future provider adapter still needs streaming input/output limits. Original checkout WIP remains untouched. #10/#14 remain open.

## Validation

New unit checks cover unused 2 MiB input, unknown keys, sparse/invalid focus and positions, normal actions, optional fields, raw 64 KiB UTF-8 boundary and 96 KiB JSON-escaping aggregate. Existing runner + unit checks: 12/12 PASS. A separate real local server/runner test rejects oversized unused editsJson, oversized focus and unknown fields with null pending, empty history, bounded saved mission and no requested document text. This integration passed; it does not invoke a model. TypeScript and whitespace checks pass.

The aggregate limit includes escaping and can reject escape-heavy strings even below the raw 64 KiB editsJson limit; this is an intentional bound, not a promise that every previously accepted plan remains accepted. Full bot result is recorded below/at issue close.

Final full bot suite: **141/141 PASS** (53.4 seconds). Subsequent docs build/link check: 55 pages / 2,613 internal links PASS. Builds and tests ran sequentially.
