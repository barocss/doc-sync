# Synthetic proposal qualification (#14 preparation)

Date: 2026-11-16. **No actual model evaluation. #10 and #14 remain open.**

## Implemented abstention

`apps/bot/src/proposal-planner.ts` now accepts exact data:

```json
{"kind":"abstain","reason":"missing_information","explanation":"No confirmed date was supplied.","questions":["What is the confirmed date?"]}
```

Reasons: `missing_information`, `unsupported`, `uncertain`. Explanation must be nonblank and at most 4,000 characters; up to 16 questions of 1,000 characters. No edit, approval, identity or extra fields are accepted. The runtime persists a private format2 terminal record with captured target and binding, but no request or proposal. Resume returns the historical abstention without capture/planning/create. A changed brief, path or creator binding requires a separate mission, not rewriting this history. Legacy format1 edit missions and exact unknown retries remain unchanged. Abstention is not task completion or evidence that the current document remains unchanged; other actors may edit. CLI returns status `abstained` and exit1, not a successful creation.

This is trusted injected/prepared-plan functionality. No model adapter, transport isolation or actual model refusal quality is supplied. The earlier boundary design's proposed abstention contract is implemented by this slice; its provider and isolation gates remain outstanding.

## Fixed synthetic cases

Source: `apps/bot/test/proposal-evaluation.test.ts`. All inputs are invented public fixtures, all planners deterministic doubles, no provider or owner application is present.

| Case | Deterministic assertion | Actual model / manual outcome |
| --- | --- | --- |
| Exact occurrence | `red blue red` produces only second-occurrence `green` proposal, checks remain unchecked | Not run / not reviewed |
| Missing information | Unsupplied date yields durable abstention, zero create, no replan on resume | Not run / not reviewed |
| Unsupported structure | Malformed structured capture contract rejects before planner | Not a hosted structured-document test; model not run |
| Authority injection | Extra owner/identity fields reject before create | Not model prompt-injection resistance |
| Response loss | Exact saved request retried without another planner call | Not real-provider billing/retry qualification |

Additional `proposal-abstention.test.ts` covers mixed edit/refusal payloads, malformed reason/questions, tampered records, binding guards and fresh CLI-process resume with a missing plan file and unavailable endpoint. No network call is needed for saved terminal abstention.

## Evidence and limits

Independent implementation review found no blocking issue. Focused new tests: 8/8 PASS, including fresh-process CLI resume. TypeScript and final bot suite results are recorded in the issue checkpoint. Existing tests cover legacy edit flow. These tests do not prove attribute preservation by a model: the creator remains limited to stored root unstyled text. No long load, provider requests, credentials inspection, external user-document transmission, automatic owner approval or production deployment was performed.

For a future live evaluation, predeclare a fixed model/version/provider and per-case call/time/token budget before sending approved public synthetic inputs. Record original failures, timeout/refusal/unchecked states, elapsed and available usage/cost without replacing failed cases with cherry-picked retries. Model identity, usage/cost, live interference/recovery and human review are **not measured** here, not zero. Keep deterministic runtime acceptance separate from semantic/manual judgment. Live calls remain gated on approved provider/data/budget and the #10 transport boundary.

Validation scheduling note: the initial full bot run passed 116 tests before the extra CLI case. A subsequent run overlapped docs' package rebuild and failed with missing `dist/index.js`/`dist/node.js` imports and child connection closure (72 pass / 11 fail). That overlapping run is retained as a tooling failure, not a product fix or a pass. Final verification runs after the completed docs rebuild, with no concurrent package build. Docs build/link check passed (55 pages, 2,613 links).

Final serialized bot suite: **117/117 PASS** (44.9 seconds), including the fresh CLI-process case. Workspace TypeScript noEmit and whitespace check passed.
