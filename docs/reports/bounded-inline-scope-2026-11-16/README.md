# Bounded planning inline scope (#30)

Baseline c9157d5899a4b3e1776576f789dd154bbfe53457 accepted a paragraph with
A + inline-image + B through both planning guards. A length-less update at the
image offset changed its src; deleting one unit removed the image. This was an
in-block mismatch with documented text-only planning, not an authorization bypass
or access outside the selected block. #5 originally bounded planner context and
explicitly did not reduce server authority.

## Conservative contract

`assertPlanningTarget` accepts stored text blocks with only text runs, including
ordinary marks and empty runs. Inline objects, structural spans (including links)
and mixed structural/text run shapes require review before the planner callback.
Each new read and resume uses the same check. Updates require an explicit safe
integer length >= 0; zero-length no-ops remain allowed. Existing conditional
revision fencing is unchanged. No new privileged tool or server permission.

This deliberately narrows bounded mode. General editor/rich document support and
unbounded explicitly authorized missions are not changed. No guarantee of
preserving arbitrary semantic formatting or full document quality is implied.

## Verification

- Unit target/guard tests: 6/6, including marked/empty text, inline/span/mixed
  shapes, missing/negative/fractional/infinite update lengths.
- Real local server suite: 10/10 with marked text success, initial inline refusal
  before planner, peer insertion while planner waits followed by stale rejection
  and refusal before second planner call, interrupted mission restart refusing
  inline target before resumed planner call, and original replay protection.
- Full bot suite: 164/164 PASS (25.4 seconds).
- Docs build/link check: 56 pages, 2684 links PASS.
- Regression checks retain peer document state, pending and History; no new
  confirmed bot edit is recorded on inline refusal. Restart retains the original
  confirmed operation and target binding rather than replaying it.

Independent read-only review checked scope narrowing and requested explicit
restart/peer tests. Tests use deterministic injected planners, not a real model.
Original native WIP is untouched; no long-duration load or remote CI claim.


## Shared-helper follow-up

Post-publication inspection found that preservation reused the planning target
helper, unintentionally rejecting read-only protected blocks containing rich
runs. Split the stored-text type check from the writable plain-run check;
preservation uses the former, while the bounded planner retains the latter.
Tests capture/persist/re-read rich targets, refuse changed identity/scalar without
recapture, and complete a real mission editing a separate plain target while
retaining the protected inline image. Initial added unit fixture missed a closing
brace; corrected before the assertions ran. Full bot suite 165/165 PASS before
the additional real-server rich-protected scenario.

Expanded real-server preservation suite: 12/12 PASS; docs build/link check
56 pages/2684 links PASS.
