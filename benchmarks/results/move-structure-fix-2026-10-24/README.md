---
work_id: move-structure-fix
artifact_type: validation-report
status: done
owner_role: integration
source_request: Fix automatic paragraph duplication and split order after movement, retain collaboration rules, verify Chrome and update HANDOFF.
last_updated: 2026-10-24
---

# Automatic paragraphs and split order

Edited automatic paragraphs now display once. Splitting before moved siblings preserves their logical order and placement ownership. For example, splitting `abc | ghi | def` at offset 1 gives `a | bc | ghi | def`. Moving populated automatic input leaves a distinct editable gap where required; its old text is not duplicated into that gap.

The previous projection could include an automatic head both as a stored placement and as a synthesized input gap. Derived gap births now use their first retained content stamp for sibling order, while explicit moves keep their movement Ticket. Replacement gaps use the existing fragment namespace and retained move stamps. A physical split marker no longer reanchors older following siblings. No corrective moves are emitted for those siblings. Private text-storage anchors validate against their immutable owning flow. No wire or snapshot format changed.

## Correctness evidence

Main baseline: `84fa81df7ff2288551fd33285dd6f3f2fa2de781`. Current source includes the inherited logical-text receive optimization, preserved byte-for-byte. This task changes doc.ts and placement.ts. It leaves history.ts unchanged. Current source hashes and exact original-log digests are in validation.json.

| Check | Result |
|---|---|
| Same 18 fixed cases on archived main | 0 pass, 18 fail; node-before.log |
| Updated fixed cases | 18 pass; node-after.log |
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Library 507, demo 12, documentation 27 pass |
| Compatibility unit tests | 31 pass |
| Root type checking, comparison build | PASS |
| Documentation build/static checks | 20 pages, 882 internal targets, English prose, no local paths; PASS |
| Chrome 156.0.8078.47 | 163 finite checks; zero reported failures/fallbacks in 318 saved snapshots |

Fixed expectations cover UTF-16 input, automatic identity uniqueness, same/across-parent movement and editable replacements, splits at start/middle/end, untouched sibling placement, remote bold through undo/redo, same-boundary splits and input/formatting in both receipt orders, actual deletion compaction, snapshots and rejection of foreign-flow private anchors. Existing placement/cycle, Enter absorption, deletion and conditional history tests remain. Legacy random generators keep their old operation scope; these tests do not prove every history.

Chrome includes 84 input/caret cases, 20 ordinary checks, 30 captured operation/history traces, 8 capability flows, 7 logical-path flows and 14 new structural checks. New cases use native input, Enter, undo and redo in Slate, Lexical and ProseMirror over real HTTP. Each expected model must match the server and all five client/native models with no pending changes or fallback. The required-rule fixture is an isolated copy; fixtures/demo-schema.ts is unchanged. The final console query returned zero errors. The inspected screenshot is output/playwright/move-structure-fix/replacement-split-full.png.

Actual OS IME is **NOT EVALUATED**. No browser latency metric was collected. Trace capture, model convergence and automated composition are different evidence types. The first driver assertion incorrectly required a status field from legacy checks that signal failure by throwing; the resumed driver parsed those original outputs and separately required captured status for operation traces. No product assertion was relaxed. Initial implementation/test-draft failures remain under output/validation/move-structure-fix/. One draft deletion used length instead of count and was corrected.

## Current performance smoke

Node 22.19.0, 5 warmups and 30 samples per row. The run preceded the final tests/browser work, with no overlapping test/build or active comparison page. External one-minute load was 21.73 → 21.31. Raw samples are in current-capabilities.json.

| Characters | Mode | p95 ms | Full-model reads/change |
|---:|---|---:|---:|
| 10,000 | moved | 1.766 | 0 |
| 10,000 | required-child | 0.797 | 0 |
| 100,000 | moved | 15.368 | 0 |
| 100,000 | required-child | 2.717 | 0 |

All ten workload rows passed mirror assertions with fallback 0. Field writes retained two full-model reads. Timing covers synchronous change receipt through the model-event callback; it excludes setup, network, native conversion, DOM and correctness checks. Automatic-gap creation and splitting are not timed by this workload. This single current-source run is not a causal speedup, a performance-regression verdict or product acceptance. The earlier logical-text ABBA report and raw files retain their original source hashes and are unchanged.

## Reproduce

Run from the repository root with Node 22.18 or later. Use fresh result paths. Do not overlap timing with tests/build/browser work.

```sh
node benchmarks/results/move-structure-fix-2026-10-24/verify-before.mjs --out-dir /tmp/doc-sync-fresh-move-baseline
node --test packages/doc-sync/test/move-structure-regressions.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
npm run docs:build
npm run docs:check
node benchmarks/capabilities.ts --samples 30 --out /tmp/doc-sync-fresh-move-current.json
npm run build --prefix apps/demo/compat
COMPAT_PORT=0 npm start --prefix apps/demo/compat
```

Open the printed compatibility URL in a dedicated Chrome session. Run apps/demo/compat/checks-move-structure.js through the existing Playwright CLI run-code entry point. It uses fresh document IDs. Other scripts and their hashes are listed in validation.json. The isolated required fixture is reproduced by the earlier logical-text browser-fixture.mjs script. Original local evidence is under output/playwright/move-structure-fix/ and output/validation/move-structure-fix/. HANDOFF §5.21 records the final scope. Only owned comparison servers/browser were stopped; user tabs, preview and data remain. No commit, push or deployment was requested.
