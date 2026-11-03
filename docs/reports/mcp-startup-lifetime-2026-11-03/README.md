---
work_id: mcp-startup-lifetime-2026-11-03
artifact_type: root-cause-and-regression-report
status: qa_ready
owner_role: coordinator
source_request: Diagnose and fix initial MCP closure with multiple agents while preserving pending and foreign edits; verify restart and update docs.
last_updated: 2026-11-03
---

# MCP startup lifetime and recovery verification

The stdio bridge now owns input before asynchronous initialization and retains
a startup reference when that input is backpressured. One cleanup path closes
local resources without deleting uncertain recovery data. The Bot runner records
only a known startup phase when initialization fails.

Baseline: main0de9f0ffc06d8be94e448222c0575a99d6ae9a66, initially clean.
The user authorized implementation and docs, not a new commit, push or release.
Sol Medium lanes handled source analysis, reproduction, production, regressions
and independent review through OMX CLI. Previous coordination runtime and user
services were preserved. No relationship between a coordination transport closure
and the project failure is inferred.

## What was proved

| Case | Baseline or negative control | Final behavior |
| --- | --- | --- |
| Supported async schema import; host sends initialize early | Actual main exits0 before initialization | Initialize,13 tools and read_document succeed |
| Same module; valid262144-byte initialize client name | PassThrough-only copy fills64KiB, pauses stdin and exits0;8-byte control succeeds | Both sizes initialize; exact parsed name length/hash, model and sequence are checked |
| Stdio.start rejects after a real live SSE session and journal acquisition | Startup prints error but stream keeps child alive until test deadline | Nonzero natural exit with phase/error, SSE closure and writer reacquisition |
| Ready EOF while accepted response is held | Stream ownership remains after EOF | Admitted work drains; child exits naturally; writer is released and restart adds no duplicate |

The full identical-test matrix has9/9PASS on final source. Archived HEAD has
7FAIL/2PASS. A source copy that changes only the bootstrap lease to a no-op has
1FAIL/8PASS: the large initialize case exits0. This control isolates the reference
gap from the new byte proxy and cleanup logic. Baseline/control failures are
negative evidence, not product acceptance failures on final source.

The generated schema module is an existing supported DOC_SYNC_SCHEMA feature.
It exports a valid schema after a bounded unreferenced timer. The final fixture
observes real buffer saturation before schema export and SDK start, delegates
original methods, and adds no active handle that masks the failure. A new
startup-only reference prevents abandonment while that valid import is pending.
The60-second interval is not a deadline, readiness sleep or retry; no code waits
for a tick. It is cleared on ready, failure or observed lifecycle closure.

## Historical cause remains unknown

The original discovery-only incidents did not retain nested child exit status
or stderr. Their exact trigger is **NOT_PROVEN**. The normal journal/lock path
does not contain an unreferenced readiness timer. Real filesystem-delay controls
connect; a held writer lock correctly exits1 with an active-writer error. Neither
lock rejection nor a hypothetical injected wait proves the original trigger.

The supported async-schema/backpressure defect above is reachable and fixed.
It must not be presented as forensic proof for the earlier discovery-only run.
Future bootstrap failures include phase diagnostics, and the Bot preserves the
safe phase instead of losing all provenance behind a generic Connection closed.

## Pending and foreign edit safety

Real SDK children, journals and HTTP/SSE servers verify both unknown and accepted
durable intents across failed startup, EOF and process/server restart.

- Unknown intent/checkpoint bytes remain unchanged. No automatic conditional
  replay or leave occurs. New edits stay blocked and a later foreign edit remains.
- Accepted evidence reconciles through the existing receipt/recovery contract.
  No duplicate conditional is applied. Actor undo/redo changes only that actor's
  edit and preserves the foreign accepted edit.
- Failed stdio startup and normal EOF close only the owned stream/writer.
  No journal/checkpoint deletion, lock unlink or protection release was added.
- Ready closure drains admitted work and uses the existing settled-only leave
  gate. Uncertain pending state retains recovery protection.

Public Core, Schema, History, synchronization transport, DocumentSession,
IntentJournal and shutdownSession implementations are unchanged from baseline.
The new entrypoint owns their lifetime; it does not change CRDT arbitration,
undo semantics, server admission or recovery authority.

## Parent diagnostic privacy and preserved policy

Bot startup parsing retains at most a96-byte line prefix, accepts only a known
phase and wraps only a failed connect. Raw stderr and arbitrary message text are
not copied into mission records. Split markers, oversized/unknown text, opaque
private canaries, planner call count0, unchanged existing state and child exit
are checked through real runMission and a real MCP child.

An initial worker changed ambient DOC_SYNC_SCHEMA inheritance to make its test
fail. Root rejected that unrelated behavior change and restored forced-empty
Bot schema-module configuration. Final tests use a test-only preload to fail
discovery and assert an ambient module never executes. The initial Bot receipt
is superseded. Direct stdio CLI custom schema support remains unchanged.

## Final verification

Node24.22.1; installed MCP SDK1.32.2; same installed dependencies for baseline
and current source controls.

| Check | Result |
| --- | --- |
| MCP whole workspace, four independent files at once | 190 cases:188PASS,2 expected platformSKIP,0FAIL,0CANCEL |
| Bot whole workspace | 56/56PASS |
| Product server pre-submission restart recovery | 1/1PASS |
| New focused cases | Lifecycle9 and Bot3, included above |
| Build and root TypeScript | PASS |
| Docs | 43PASS; build55pages/2601internal links; English/local-path checks PASS |
| Tested changed runtime/test source freeze | Six SHA256 values unchanged after integration |
| Fresh whole repository, Chrome/mobile, Rust, performance or publication | NOT_RUN |

Commands: npm run build; npm test --workspace @doc-sync/mcp;
npm test --workspace @doc-sync/bot; node --test
apps/demo/test/bot-recovery-start.test.ts; npx tsc --noEmit;
npm test --workspace @doc-sync/docs; docs workspace build; npm run docs:check.
MCP takes34.37s, Bot18.65s and the product recovery case2.19s in these test logs.
These are verification durations, not controlled performance benchmarks.

Integration tests use a180-second external process-group watchdog. Focused
comparison runs retain their original110-second watchdog and scenario deadlines.
No watchdog fired. Cleanup targets only owned PIDs. Worker receipts verify tracked
children absent after their runs. Prior failed development/probe receipts remain
separate from final source-frozen PASS receipts.

## Remaining limits

An executable schema module that never settles is not internally cancelled.
Paused input can hide EOF until bytes are consumed. No immediate kernel EOF
detector or cancellation inside session.start was added. MCP hosts retain their
own deadline and escalation policy. Raw application stderr can contain private
schema-thrown text; only the Bot mission-record boundary excludes that raw text.
Hosted HTTP behavior is unchanged; its existing regressions are included in MCP.

No fresh full repository or browser result is claimed. Prior engine/browser
receipts remain historical. The original incident's exact trigger remains open.
The current task's reproduced startup and cleanup defects are fixed and tested.

## Evidence

source-seal.json identifies baseline, maintained sources and this report.
evidence-index.json hashes archived test logs, source manifests, baseline/control
source snapshots and reproduction receipts. It excludes agent conversations and
user data. Read the archived backpressure-test and lifetime reports for exact
case counters, natural-exit proof and source identities. Old report directories
were not rewritten. Updated usage is in the AI server guide and MCP README;
HANDOFF section5.132 records this checkpoint.
