---
work_id: mcp-startup-main-checkpoint-2026-11-03
artifact_type: final-review-and-full-test-checkpoint
status: qa_ready
owner_role: coordinator
source_request: Review pending changes, pass the full suite, update docs and HANDOFF, then commit and push main.
last_updated: 2026-11-03
---

# Startup lifetime main checkpoint

Initial local HEAD and origin/main were both
0de9f0ffc06d8be94e448222c0575a99d6ae9a66. The user authorized committing and
pushing all pending startup-lifetime work after full tests pass. No npm release,
package version change, release tag or data cleanup is included.

## Review

Reviewed the stdio input owner, bootstrap/cleanup path, Bot phase parser,
new regression tests and public guide/README. No new source blocker was found
and no runtime changes were made in this final review. Verified the previous
688-file source seal, report hash and188 evidence archives before testing.
All source hashes still matched after the fresh full run.

The entrypoint buffers raw early initialization bytes without admitting tools
before session recovery. A startup-only reference survives paused stdin. One
cleanup owner preserves uncertain intent/checkpoint and closes local resources;
ready shutdown drains admitted work and sends leave only when settled. The Bot
retains only a known startup phase and keeps remote schema discovery unchanged.
These changes preserve the existing engine, Schema, History, wire and recovery
authority. Existing evidence includes real pending/foreign edits, exact receipt
recovery, duplicate checks, natural EOF and actor undo/redo.

The original discovery-only incidents remain **NOT_PROVEN** as to exact trigger.
The separately reproduced supported async-schema/backpressure defect and resource
cleanup defects are fixed. This distinction and the cancellation/private-stderr
limits remain in HANDOFF section5.132 and the AI server guide. Passing a full run
does not retroactively identify the old incident's cause.

## Fresh full-suite verification

Node24.22.1; command `npm test`, including its build lifecycle.

| Gate | Result |
| --- | --- |
| Full workspace | 1650 cases:1648PASS,2 expected platformSKIP,0FAIL,0CANCEL |
| Core | 1194PASS |
| Bindings and Presence | Lexical7,React2,Solid3,Svelte2,UI4,Vue2,Slate4 PASS |
| Applications | Bot56,Demo143,Docs43 PASS; MCP190/188PASS/2SKIP |
| New startup regressions | Lifecycle9 and Bot3; included above |
| Build | PASS through npm test pretest |
| Root TypeScript after build | PASS |
| Docs build/check | 55pages/2601internal links; English/local-path checks PASS |
| Source identity | All688 reviewed source hashes unchanged through the full run |
| New Chrome/mobile/Rust/performance qualification | NOT_RUN |

The complete test command exits0 in133.22s. Its external360-second watchdog did
not fire. No failing invocation was retried in this final gate. Separate types,
docs-build and docs-check watchdogs also remained inactive. Public package code,
fixtures, manifests and lock did not change; previous package-artifact evidence
remains valid for those unchanged bytes. No new tarball or release rehearsal is
claimed.

## Documentation and publication boundary

The AI server guide and MCP README describe readiness, early input ownership,
startup phases, pending-safe EOF cleanup, restart identity and cancellation
limits. HANDOFF section5.133 records this full-suite checkpoint. Older reports
were not rewritten. Only a new source/evidence seal captures the current summary.

Commit and push target main. All ten library packages remain private0.0.0.
Remote HEAD, clean working tree, Pages deployment and Linux CI are verified after
the source commit and reported separately. This report does not embed its own
future commit SHA or claim a remote outcome before it is observed.

source-seal.json hashes maintained source and this report. evidence-index.json
contains immutable full-suite/type/docs logs, watchdog receipts and initial
source identity. The earlier lifetime report retains detailed baseline/control
and recovery evidence; it is not replaced by this broader full-suite gate.
