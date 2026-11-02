# Explicit local state validation

The Client checkpoint was committed as `409ee2abc5add5bf611b7070fe90da39bc484f39` before this work. These changes add explicit local capture/open; they do not change the CRDT, SyncClient, History or engine contracts.

## API and data

`LocalClient.captureState()` and `Client(local).captureState()` produce a detached finite JSON envelope `doc-sync-local-state-v1`. `fromState(unknown, {schema})` returns a newly validated client with the saved actor, CRDT IDs, clock, document, hidden content and undo/redo History. Live cache stamps regenerate. The caller owns storage writes and replacement of views. Sync facade capture directs callers to the existing synchronized recovery protocol.

Capture rejects pending host operations, every active composition including empty drafts, observer reentry and disposal. Rejection retains operations/drafts. Restore checks exact schema/engine identity, snapshot/History structure, known references and the original allocation floor. User JSON payload is not interpreted as History. The decoder accepts retained movement anchors only with matching parents. It does not authenticate externally modified data.

## Correctness

- Full workspace: **1,325 cases, 1,323 PASS, two platform SKIPs, zero FAIL**, with default fuzz settings. Library 793, Core 163, Lexical 7, Slate 4, bot 53, demo 88, docs 36, MCP 181 (179 PASS, two SKIPs).
- Core local-state cases: **11/11 PASS**. Coverage includes Unicode, same-actor clock continuation, IDs, saved selections, undo+redo stacks, rich product profiles, hidden merged-cell content, root/nested movement, repeated reopening, corrupt JSON/schema/history/clock, mutation isolation, pending/multiple composition and observer lifecycle.
- Root/Core/app type checks pass. Six tarballs and seven consumers pass, including public Core/facade and LocalClient capture/open calls and types. An initial new consumer fixture used an unbound Client alias; correcting that fixture required no production change.
- Current 32-row PM count comparison against the preserved original baseline passes. There are no extra ordinary snapshots, model/native conversions or model/History differences. This is **NOT_RUN** for timing; no new save/open latency certification is claimed.

A real decoder defect was reproduced: nested move/split History.after can refer to a prior placement operation rather than a token. The local validator was corrected without changing Sync restore. Both valid chains and missing/forged anchors are tested.

## Chrome

The frozen bundle is `ae00354b17bc503611889d7589f83639c4a676bf66d55c33a6584456b948b604`.

The opt-in `?persist=1` route passes **10 scenarios plus four native editor save/reload/history roundtrips**. Each editor supplies trusted Unicode input, saves and reloads the same actor/state, then another editor performs undo/redo. Covered paths include anchored manual open, quota failure, malformed/schema data, injected mount rollback, forget, default ephemeral routes and disabled legacy/sync storage. Current live document/History and previous saved bytes survive expected failures. Hidden startup reaches ready=true, busy=false and equal native/client models before tab activation.

The unchanged default checker passes **all eight local/sync binding cases** on the same frozen preview, with trusted input/ranges, History, remount/reset/refresh and offline/foreign reconnect, no skips and empty error gates.

A separate narrow synthetic composition check passes: an empty Slate composition blocks both Save and Open, preserving all four live models, actor, History and exact saved bytes. Synthetic composition end then permits Save/Open. This uses untrusted synthetic events and is **NOT** OS IME acceptance. The checker-only optional branch was added after the broader receipts; production code/bundle stayed fixed.

Reload exposed an existing hidden-tab startup stall in the two-RAF mount readiness helper. A visibility/timer fallback fixes lifecycle readiness; the measurement RAF2 function is unchanged. Earlier focus/poll failures and the actual stall remain archived. None of these tests qualify power loss, OS crash, cross-tab ownership or an HTTP document-server restart.

## Performance boundary

The [input-tail diagnostics](../input-tail-diagnostics/report.md) preserve the original Node one-cell and Chrome five-cell INVESTIGATE status. A new captured Node input overlaps major GC, but old untraced spikes remain unproven. Instrumented traces do not replace original timing gates. This local save/open feature adds no automatic capture or storage write to ordinary editing. Saving is explicit; the demo reopens only the last successful saved copy.

## Evidence

[summary.json](./summary.json) contains results and source hashes. [artifacts.json](./artifacts.json) records exact gzip artifacts and original SHA-256 values. Decompress with `gzip -dc FILE.gz`. Runtime source hashes were sealed after all final checks; script-only composition diagnostics are separately scoped. Old and new previews remain available; no user-owned processes, tabs, documents or storage slots were removed.
