# Bounded owner review workspace

Issue: https://github.com/barocss/doc-sync/issues/4

Built independently on main ba132a2 without the original native WIP.

## Delivered scope

A separately launched, disabled-by-default loopback bridge reads one private owned
0600 configuration file. It exposes only fixed-route list/inspect and exact-body
accept/reject/reconcile. The browser receives a short-lived origin-bound review
session, never the hosted owner bearer. Strict Host/Origin/session/CSRF checks,
no CORS, redirect refusal, bounded JSON and generic errors preserve the credential
boundary. No bot process is spawned or given owner credentials.

The review panel embeds the supported ProseMirror demo at a separate configured
loopback origin. It renders proposal evidence as text, requires explicit decision
confirmation, persists exact UUID/digest before sending, locks duplicate/cross-tab
decisions, and uses original server evidence for reconciliation. Stale versions
are not refreshed automatically. Lost responses are unknown, not assumed failure.
No direct editor writes or structural proposal expansion were added.

## Verification

- Bridge security: 6 tests PASS (private-file controls, disabled default,
  single-use bootstrap/session restore, exact Host/Origin/CSRF, fixed proxy route,
  strict decision body, redirects, bearer reflection, response bounds, CLI
  secret-free output and new private access-file requirement).
- Bridge plus existing proposal suites: 70 PASS, no failures/skips.
- Real installed Chrome with synthetic private hosted service and ProseMirror:
  10 scenarios PASS: inspect/XSS-safe rendering/cancel/close unchanged; actual
  browser peer input after preview becomes stale with zero conditional sends;
  rejection without edits; duplicate clicks apply once; competing review tabs;
  accepted response loss and reload without replay; unknown unreceived attempt
  remains reconcile-only; proposal actor undo retains the human browser text;
  closing the live-editor owner permits explicit tab handoff without document changes;
  synthetic persisted pagehide/pageshow releases and reacquires the editor lease.
  This last check exercises lifecycle handlers, not real browser BFCache eligibility.
- Root TypeScript PASS; fresh documentation build/check PASS (55 pages,
  2612 internal links). Initial driver selector/scroll/Window-serialization
  failures were corrected and are not counted as passing evidence.
- Independent review found a cross-tab local UUID overwrite/recovery hazard.
  Final UI uses a Web Lock, a second durable-decision check and the server's
  original decision for recovery. Unknown pending attempts explicitly explain
  that reconciliation may remain blocked; no fresh approval is synthesized.

Browser receipts/screenshots stay in ignored output and do not contain bearer or
bootstrap access URLs. Response-loss tests use deterministic browser fetch fault
injection after a real server response or before submission, respectively.

## Deliberate limits

The trusted configuration owner must verify the hosted route maps to the exact
physical document shown by the editor; a logical route name alone cannot prove
that mapping. This is not a public/multi-user authorization service or general
DoS qualification. Bootstrap exchange loss requires a new launch/access file.
Incomplete approval evidence still requires the existing owner recovery workflow.
Human-editor Undo is not proposal-actor Undo. No actual-model evaluation, general
structural approval, full B3 completion or long-duration load result is claimed.

Demo-wide regression result is **147 PASS / 4 FAIL**, not a full green demo run.
The four pre-existing client/local bundle tests cannot resolve `slate-react`:
those unchanged demo sources import it, but the baseline demo manifest and lockfile
do not declare/install it (`npm ls slate-react` is empty). This dependency gap is
not changed or hidden in the proposal UI patch. The 70 directly related tests,
new browser flow, TypeScript and docs checks pass independently.

Baseline reproduction: a separate detached worktree at ba132a2, with unchanged
tracked sources and the same locked dependency installation, rebuilt the workspace
and ran the two existing client/local test files: **4 PASS / the same 4 FAIL**,
all `Could not resolve "slate-react"`. This confirms the failures predate #4.

During stronger final browser convergence checks, opening three full ProseMirror
demo pages (two SSE streams each) left the server-state polling panel stale even
though editor text and authoritative model matched. Closing the extra page
restored polling. The final workspace holds an origin-scoped live-editor Web Lock:
additional review tabs mount no iframe/streams, while retaining review controls.
The final test leaves the extra review-only tab and separate peer editor open,
verifies server/editor convergence after actor undo, then tests explicit editor
handoff after closing the owner tab. General HTTP/1 connection pooling is not added.
