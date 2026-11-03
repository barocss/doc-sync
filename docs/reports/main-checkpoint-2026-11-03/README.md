---
work_id: main-checkpoint-2026-11-03
artifact_type: checkpoint-verification
status: qa_ready
owner_role: coordinator
source_request: Review pending changes, verify tests, update docs and HANDOFF, commit and push main, and explain Client.data.
last_updated: 2026-11-03
---

# Main checkpoint verification

This checkpoint consolidates the pending Spreadsheet S2, live Presence,
DOM/framework components, common Map/List server admission and Client.data work.
Initial local HEAD was9334e591e25e9ff641eed8c6cd7c65ce9de4724a, one commit ahead
of origin/main. The user authorized committing and pushing all pending work to
main. No npm publication, release tag or package version change is included.

## Client.data decision

Keep client.data as the fixed Map/List namespace. Application keys and shared
collections belong inside it. Client owns connection, pending edits, History,
selection and save/open. The namespace creates no second backend or lifecycle.
Client.edit/model remain the schema editing/reading APIs.

Access requires the exact createDataSchema identity. This does not add Map/List
storage to an arbitrary Document/Graphic document. P4 storage/schema extraction
is still open. Existing Schema behavior, concurrency arbitration, actor-owned
undo and createDataHub admission remain. Local business validation is not server
authorization. Guarded data GC remains disabled to reserve retained IDs.

## Review and fixes

Three Sol Medium lanes reviewed Client/data/server, Spreadsheet and Presence/
framework/package changes. Root reviewed final test diffs and integrated the
checkpoint. Prior work, reports, user services and browser tabs were preserved.

| Finding | Change and proof |
| --- | --- |
| Identical newer Presence state did not refresh receipt TTL or restore expired entries | Deliver accepted sequences to the store. New regression covers TTL refresh, expiry, restoration and replay rejection. Identical active state still emits no new snapshot. |
| Delayed Spreadsheet requests could revive offline selection | Server-issued generation fences updated session requests. Join retires old stream ownership; leave/close invalidate older requests. Actual HTTP/SSE regressions cover delayed preview/leave, replacement and HTTP-only reconnect. |
| Graphic test accepted a selection-only packet before the pointer packet | Test forces that order, asserts the first cursor-null payload, then waits for the requested cursor and selection. Original content/History/pending/isolation/disconnect assertions remain. No Graphic production change. |
| MCP file pool consumed a CPU-derived number of independent workers | Default test script now runs four files at once. Within-file agent concurrency, timeouts and assertions remain. Fresh full MCP181/179PASS/2SKIP took36.44s. |
| Startup failures concealed nested stderr and could leave an unregistered AI transport | Test fixtures now retain bounded stderr, report HTTP/restart phases and close a failed startup. No bot/MCP production fix is claimed. |

Legacy direct Spreadsheet requests without a generation retain sequence-only
behavior. Updated SheetSession supplies the generation even without SSE. A
previous in-flight Presence request can delay a fresh preview after reconnect;
document edits use an independent queue.

## Final gates

Node24.22.1, final standard command:
`npm run test --workspaces --if-present`.

| Gate | Result |
| --- | --- |
| Full workspace | 1638 cases:1636 PASS,2 expected platform SKIP,0 FAIL,0 CANCEL |
| Core | 1194 PASS |
| Bindings/Presence | Lexical7,React2,Solid3,Svelte2,UI4,Vue2,Slate4 PASS |
| Apps | Bot53,Demo143,Docs43 PASS; MCP181/179 PASS/2 SKIP |
| Runtime/test/build source freeze | 552 hashes unchanged after the final run |
| Build and final root TypeScript | PASS |
| Package artifacts | Ten tarballs and twelve installed runtime/type consumers PASS |
| Release rehearsal | PASS; temporary versions only; source manifests/lock unchanged |
| Documentation | Build55 pages/2600 internal links; English/local-path checks PASS |
| Fresh browser/mobile/Rust/performance qualification | NOT_RUN |

Actual data HTTP/SSE6 cases are included in the workspace count. Final guarded
journals have accepted append counts11,16,2 and matching hashes. New lifetime
and disconnect tests exercise real HTTP/SSE but do not establish new Chrome or
production durability/performance qualification. Historical reports retain their
own source and browser boundaries. All ten libraries remain private0.0.0.

## Failed attempts and remaining uncertainty

The first integration attempt had1638 cases/1635 PASS/1 FAIL/2 SKIP. The bot
unknown restart worker returned needs_attention before conditional submission,
with no pending edit, a closed nested MCP connection and only schema GET observed.
Its actual startup cause is NOT_PROVEN. Earlier diagnostics had hidden nested
stderr. Full Bot53 and twenty isolated startup attempts with four concurrent
processes pass; this does not prove the earlier issue fixed.

The second integration attempt passed Bot53 but found the Graphic readiness race
and many MCP startup/request deadlines during high host load. The restart-history
case was cancelled by its parent120-second deadline, not a reported undo
assertion. Some test children did not exit. Root captured the owned process tree,
interrupted only that run, then verified all thirteen captured descendants gone.
No user process or service was stopped. Raw Node totals after cancellation are
1642 cases/1599 PASS/27 FAIL/14 CANCEL/2 SKIP; cancellation file wrappers make that
count different from the healthy logical suite count.

The bounded four-file MCP run and the final complete workspace run pass without
longer timeouts, skipped assertions or mission retries. High host load as the
sole cause is NOT_PROVEN. The original fast bot startup closure remains open.
These results support this main checkpoint; they do not claim all production
availability, resource, GC or restart risks closed. A future recurrence should
retain the new nested stderr, schema response and restart-phase diagnostics.

## Documentation and evidence

Updated package README counts, core subpath list, getting-started/releasing/
graphic guides, shared-data namespace boundaries and Presence lifetime/session
guides. HANDOFF section5.131 records the current checkpoint and known limits.

source-seal.json hashes maintained sources and this report. evidence-index.json
lists immutable compressed copies of success, failure and cancellation logs,
HTTP journals, source-freeze manifests, package/release receipts and process
cleanup evidence. Old report folders were not rewritten. Remote commit/push and
Pages results are verified after the source commit and reported separately.
