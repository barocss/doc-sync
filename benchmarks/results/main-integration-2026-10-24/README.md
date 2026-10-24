---
work_id: main-integration-20261024
artifact_type: integration-report
status: qa_ready
owner_role: integration
source_request: Final-check all uncommitted work, commit passing changes and push main, update HANDOFF.
last_updated: 2026-10-24
---

# Final main integration

This delivery includes bounded logical text receive comparison, automatic paragraph identity/split-order fixes, and a replacement-gap path correction found during final review. Earlier raw reports retain their original sources and measurement boundaries.

The reviewer found that an empty leading replacement could become virtual after lazy creation and a later cache rebuild. Serialization retained that model child while editing paths omitted it. Insert, delete, formatting and split could then address an unrelated paragraph. Projection now classifies private storage by its resolved logical gap. The independent read-only reviewer re-ran the original probe and confirmed correct targeting and snapshot restoration.

## Fresh verification

| Check | Result |
|---|---|
| New fixed gap-path cases on original dirty doc.ts | 18 fail; source SHA verified against starting checkpoint |
| Same fixed cases after correction | 18 pass |
| Related focused cases | 67 pass: new 18 + structural 18 + logical scopes 31 |
| Expanded `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Library 525, demo 12, docs 27 pass |
| Compatibility unit tests | 31 pass |
| Root type checking and compatibility build | PASS |
| Chrome 156.0.8078.47 | 175 finite checks; zero reported failure/fallback in 330 saved snapshots |
| Documentation build and static checks | 20 pages, 882 internal targets, English prose, no local paths; PASS |

The new Node cases force a read between edits and a mutation after replacement materialization. They cover incoming structured movement, same/cross-parent automatic movement, visible paths and token anchors, insert/delete/format/split, a fresh peer, snapshots and deletion undo/redo. The 12 new Chrome cases keep the replacement empty, apply another remote mutation, then exercise native edits in Slate, Lexical and ProseMirror. All completed native/client/server models converge; the unrelated paragraph stays intact. Chrome also repeats the previous 163 finite checks, including 30 operation/history trace captures and the isolated required-child fixture.

The first rerun passed 507 existing library cases before review found missing coverage. The first new test draft had a seed setup and optional-flag expectation error; those local diagnostic logs are retained and excluded from the final comparison. The valid before log uses the final test file and the original dirty doc.ts SHA `030489607c6e7575cef2e34aefeb979522063dc9484ecffe8bb62a7cd695ccda`. The current test file and patch hashes are in validation.json. The gap-visibility-fix.patch file reproduces this small correction; reverse it only in an isolated copy to run the final cases against the pre-correction source.

Original logs: output/validation/main-integration-20261024/. Browser outputs and copied scripts: output/playwright/main-integration-20261024/. Actual OS IME remains **NOT EVALUATED**. No new browser-latency or performance timing was collected. Earlier before/after and current-only timing files remain historical. Finite tests are not proof of every possible history or product acceptance.

## Delivery

Two implementation commits separate the logical-text optimization from structural/path correctness and integrated documentation. A receipt-only follow-up records successful push and the Pages workflow. It does not change runtime or published-page source. No npm release is included. HANDOFF §5.22 is the current integration record.

```sh
node --test packages/doc-sync/test/automatic-gap-paths.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
npm run build --prefix apps/demo/compat
npm run docs:build
npm run docs:check
```

Run with Node 22.18 or later from the repository root. The Chrome scripts and source hashes are listed in validation.json. Existing data, tabs and preview remain. Only owned comparison servers and the named browser were closed after validation.
