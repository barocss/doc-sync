# Local point-cache candidate decision

## Decision and current source

**DECISION: DECLINED. The copy-on-write (COW) candidate was not landed.**
The root retained only the initial API/structure refactor. The rejected prototype
has no accepted latency claim in the current library.

This is a **bounded restored-checkpoint qualification, not release approval**.
The root's final exact-source gate is **PASS: 2,084 cases, 2,082 PASS, zero FAIL,
two expected platform SKIP and zero CANCELLED**, in 104.214 seconds.
All 1,403 input files still match source-manifest SHA-256
`975d72001307ac4df08a0a7aae3da1697eb0f2c4f337f343f5144e4a77dfc023`.
Direct root TypeScript checking passed in 5.157 seconds. These are reused root
receipts, not new test runs by this documentation task.

The original MCP repeated-restart failure remains **NOT_REPRODUCED / UNRESOLVED**.
A later full PASS does not explain that failure or establish a product fix.
The complete chronology and its limits are below. The retained public-contract
cleanup passes 335 focused tests, including 162 new behavior contracts; this
overlaps the full suite and must not be added to its count.

`rollback.json` records restoration of the eight changed existing modules and
removal of `internal/point-receipt.ts`. The 69 Core sources match the frozen
post-refactor baseline exactly. This worker independently checked those 69
hashes and the helper's absence in `restored-core-identity.json`. Identity is not
a test result. The restored source has no candidate point helper, original-surface
predicates, or new runtime exports. Prior reports and seals remain unchanged.

## Proof boundaries

| Layer | Result | Boundary |
| --- | --- | --- |
| Rejected prototype source review | APPROVE_CODE | High reviewer inspected the exact 70-source candidate manifest; not package, Chrome, or performance approval. |
| Rejected prototype focused tests | 480 PASS / 0 FAIL / 0 SKIP | 478 main tests plus two ticket tests; the 16 isolated preload cases overlap and must not be added. |
| Rejected prototype bounded types | PASS | Zero diagnostics in the recorded imported dependency closure, not a full-workspace check. |
| Final-size clone counts | PASS | Four separate 2k/20k before/current receipts; functional branch proof only. |
| First-cycle timing processes and oracles | 12 PASS_ORACLE | Eight Data processes and four direct-Doc processes completed; not a performance-gate PASS. |
| Mandatory performance gates | FAIL | 2k nested Map total regression; 20k nested Map/List useful-effect misses. |
| Timing cycles 2 and 3 | NOT_RUN | Early decline after mandatory first-cycle failures; no favorable rerun. |
| Final restored full suite | PASS | 2,084 cases / 2,082 PASS / 0 FAIL / 2 expected platform SKIP / 0 CANCELLED; 104.214s; exact 1,403-file manifest. Original MCP failure remains unresolved. |
| Final root TypeScript | PASS | Direct tsc, 5.157s; final input manifest unchanged. |
| Recorded documentation build/check | PASS | 55 pages, 2,607 links, English and local-path checks true; precedes this final roadmap prose edit. |
| Existing documentation desktop DOM | PASS, bounded | Owned Google Chrome 156 binary, HeadlessChrome user agent, 1280×633; discarded warning and limits, not editor/performance or physical-display proof. |
| New package/build, Chrome, Rust/WASM, heap qualification | NOT_RUN | No such qualification for the rejected candidate. |
| Commit, push, release | NOT_RUN | This documentation task does not publish code or evidence remotely. |

Phase-1 package and actual Chrome receipts for four editor LocalSync paths,
custom editor, Graphic, Sheet and Presence can be reused **only for unchanged
production runtime**. The historical identity receipt matched all 1,391 files
at its recorded timestamp. Current comparison matches 1,389; only
`apps/bot/test/brief-runner.test.ts` and
`apps/mcp/test/automatic-recovery-process.test.ts` now differ.
Do not describe all 1,391 files as currently matching. Old receipts do not
qualify those changed tests or newly added tests; the final 2,084-case run covers
the current test set. New benchmark files are not runtime imports and do not
extend runtime qualification. No new Rust/WASM or editor Chrome qualification
is implied.

## Restored-checkpoint failure chronology

1. **First restored full run: FAIL, 103.9s.** Its then-current 1,403-file
   manifest was unchanged. Bot cleanup raised `kill EPERM`; parent and child
   counts record two failures from one cleanup cause. MCP undo/after-accept
   returned `recovery_required`, not `clear`. Preserve the original full log
   byte-for-byte, including its NUL bytes.
2. **Bot harness correction, not a production change.** The worker keeps its
   owned detached group leader alive at an IPC barrier. The parent then sends
   SIGKILL to the whole owned group. It no longer attempts group cleanup after
   the leader has exited. The exact original Darwin EPERM condition was not
   reproduced. Brief identity, verified result and history assertions remain.
3. **Intermediate full run: PASS, 103.332s**, 2,083 cases / 2,081 PASS /
   0 FAIL / 2 platform SKIP. Subsequent root TypeScript checking **failed** with
   TS18047 for nullable stderr. A test-only non-null assertion expresses the
   configured pipe contract; 11 focused Bot cases and corrected types passed.
   This intermediate receipt does not qualify the later barrier-test source.
4. **MCP localization correction.** The Medium investigation initially
   diagnosed the first recovery stage. High review mapped original line 358
   to then-current line 361: the **second/repeated restart**, after the first
   recovery, exact receipt and human-content assertions had passed. No complete
   original response survives. Its cause is **NOT_REPRODUCED / UNRESOLVED**.
5. **Ordering evidence, not a recovery fix.** One output-only controlled probe
   passed. It held the first atomic recovery response and then the repeated
   startup SSE hello; stdio did not become ready early. This disproved the
   early-stdio hypothesis for the audited path. A separate persistent barrier
   regression now covers these stages. Its full test file passes eight cases;
   overlapping one-case and four-case runs are not additional coverage.
   Repeated-stage assertions now retain complete response JSON and stderr.
   Immediate `clear`, human text, exact receipt, zero ordinary resend, one
   atomic recovery and opposite undo/redo checks remain. There is no new
   polling, force-clear, relaxed expectation or skip.
6. **Final current-source run: PASS, 104.214s**, 2,084 cases / 2,082 PASS /
   0 FAIL / 2 expected platform SKIP / 0 CANCELLED. Root types also pass.
   The final manifest and post-run result bind all 1,403 source/test inputs.
   These receipts establish the observed final gate, not the missing original
   failure mechanism. Product runtime was unchanged by the harness work.

The archived worker investigation is historical evidence and contains the
superseded first-stage diagnosis. The High review and barrier report correct it.
The first failed log, intermediate full PASS, type failure, corrected focused
checks and final exact-source gate are all retained.

## Prospective plan and stop rule

All three plan versions precede the first timing process:

| Receipt | UTC timestamp | Change |
| --- | --- | --- |
| `timing-plan.json` | 2026-11-03 17:39:22.648518 | Initial three-cycle design and per-cycle gates. |
| `timing-plan-v2.json` | 2026-11-03 17:41:40.773171 | Added the useful 5% combined large-size gate. |
| `timing-plan-v3.json` | 2026-11-03 17:43:30.951087 | Corrected count-mode CLI bounds for large fixtures and made early-decline reporting explicit. |
| `timing-start.json` | 2026-11-03 17:47:41.662808 | First timing began with v3 and final source hashes. |

Version 2 requires at least 5% total setter-plus-read reduction in every 20k
scenario. The reason was the cross-cutting Doc/History/Clock ownership complexity
for a narrow headless local path. First-read improvement alone was insufficient.
Version 3 changes the driver guard to permit count qualification at 2k/20k;
it does not change timing oracles or effect thresholds. No gate changed after
observing timing data. The independent audit's earlier large-count blocker is
historical: the final four count receipts use the corrected driver and final
candidate closure. Its earlier pending-source statements are not final failures.

Three ABBA cycles were planned. Cycle 1 failed mandatory gates, so the root
explicitly declined the candidate and did not run cycles 2/3. This is not a
three-cycle PASS, an incomplete series reported as PASS, or a selected favorable
rerun. Historical failed probes and red tests are preserved in review reports
and selected logs; they are not hidden behind later functional passes.

## Workload and measurement limits

- Node 24.22.1, stock executable, empty execArgv and NODE_OPTIONS.
- BEFORE is the frozen uncommitted post-refactor source, **not Git HEAD**.
  CURRENT in all candidate timing receipts means the rejected prototype, not
  today's restored runtime.
- At each size, ABBA uses four separate processes, three measured samples and one
  warmup per process: six raw observations per lane/case. Doc control uses the
  same process/sample/warmup pattern. These are not six independent hosts.
- N is the total entry count across root Map, nested Map and List, not N in each.
  Splits are 666/666/668 and 6,666/6,666/6,668. Stored List keys are nonempty.
- Data timers include a complete public Map.set/List.set, normal History, then
  the first public read. No eager read moves cost outside the setter interval.
  Full expected values/IDs/order, held-entry, reference/-0 and undo/redo checks
  run outside timing. Within each lane, raw Client.edit control and public
  setter replicas compare full snapshots/History with stated normalization.
  The driver does not export exact cross-source checkpoint equality; do not
  claim that stronger equivalence from the benchmark alone.
- Separate raw-edit fallback timings remain in the raw receipts and decision
  JSON. They are not optimized-path timings and are not pooled with them.
- Unrelated CAD jobs were preserved. Per-process load and host records are saved;
  starting load averages were 9.88/10.25/10.44. There is no isolated-host claim,
  no production SLA, and no causal attribution of a result to host noise.

## First-cycle Data results

Each cell is a median in milliseconds. Change is `(candidate / before - 1) × 100`;
negative means faster. Total medians use the raw combined samples, not the sum
of component medians. Values are rounded here; exact JSON and raw samples are
in the archive. The first-read gate is >=20% reduction for every case/size;
the total guard permits at most 5% regression, and the 20k useful gate requires
>=5% reduction in every case.

| Entries | Case | Setter before → candidate | Change | First read before → candidate | Change | Total before → candidate | Change | Mandatory gates |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2,000 | root-map-overwrite | 79.9874 → 80.6854 | +0.87% | 8.7698 → 6.0885 | -30.57% | 88.7512 → 86.6157 | -2.41% | PASS |
| 2,000 | nested-map-overwrite | 67.7849 → 74.4390 | +9.82% | 8.1510 → 5.9844 | -26.58% | 76.2012 → 80.3169 | +5.40% | >5% total regression |
| 2,000 | list-item-set | 71.6159 → 69.5780 | -2.85% | 8.2050 → 5.2342 | -36.21% | 79.8140 → 75.0104 | -6.02% | PASS |
| 20,000 | root-map-overwrite | 817.8809 → 798.3969 | -2.38% | 102.6202 → 66.4315 | -35.26% | 922.7442 → 867.3164 | -6.01% | PASS |
| 20,000 | nested-map-overwrite | 802.3650 → 808.7684 | +0.80% | 101.1539 → 64.9611 | -35.78% | 905.1104 → 872.9801 | -3.55% | <5% large total reduction |
| 20,000 | list-item-set | 797.0064 → 804.1233 | +0.89% | 97.5537 → 65.0619 | -33.31% | 897.7067 → 871.6155 | -2.91% | <5% large total reduction |

All first reads improved by 26.58–36.21%. That does not override the combined
cost gates. The 2k nested Map total increased by 5.40%, beyond its guardrail.
The 20k nested Map and List totals improved by only 3.55% and 2.91%, below the
useful-effect threshold. Strict zero-total-regression sensitivity also fails the
2k nested Map case; passing a 5% guardrail elsewhere is not a claim of zero
observed regression. Setter-only increases remain visible above.

## Direct-Doc NIL-trace control

The 100k control imports direct Doc/schema and takes no storage/owner receipt.
All six first-cycle metric effects are non-regressive, within their prospective
5% per-metric guardrails. This does not rescue the failed Data gates or prove
zero overhead for all Doc workloads.

| Metric | Before median (ms) | Candidate median (ms) | Change |
| --- | ---: | ---: | ---: |
| `localEditMs` | 46.6835 | 46.3447 | -0.73% |
| `localColdToJSONMs` | 22.5402 | 21.8653 | -2.99% |
| `remoteApplyMs` | 2.3524 | 2.2357 | -4.96% |
| `remoteColdToJSONMs` | 32.2734 | 30.0216 | -6.98% |
| `localEditAndReadMs` | 68.7547 | 68.2709 | -0.70% |
| `remoteApplyAndReadMs` | 34.7466 | 32.2073 | -7.31% |

Each sample restores the same 100,000-UTF-16 seed, applies 16 deterministic
operations and ends at 100,032 UTF-16 units. Independent operation/model/full
physical-snapshot oracles pass. Local edit plus first toJSON and remote apply
plus first toJSON are separate totals. Wire serialization, transport, restore
and oracle work are outside timing. This is not network or editor latency.
No History layer is present in this direct-Doc control; the Data workload keeps
its normal History path.

## Functional qualification before decline

The rejected prototype fixed all four demonstrated findings before final review:

| Finding | Demonstrated defect | Final prototype resolution |
| --- | --- | --- |
| R1 | Optional trace-observer exception interrupted physical apply. | Revoke optional proof and preserve original apply/clock/cache behavior. |
| R2 | Doc private-brand access broke transparent Proxy receivers. | Guard optional private access after the original guard; Proxy gets no authority. |
| R3 | Public engine compatibility methods broke Proxy receivers or failed to revoke the real owner. | Preserve receiver/error behavior and revoke through private pointer associations. |
| R4 | Server-before-Client import adopted a late public override as original, bypassing malformed unrelated data validation. | Capture original surfaces in defining modules; overridden reads take legacy validation. |

The High reviewer issued **APPROVE_CODE** for the exact candidate manifest
SHA-256 `dff44206fe088af77f1c7da8537202e92c4a4608d17684753c755ec88e824987`.
That approval applies to the archived 70-source prototype only, not restored
source, packaging, browser behavior, performance, or release. The latest 480
focused passes supersede, rather than add to, overlapping 409/371/191 receipts.
The isolated preload suite's 16 cases are included in the main receipt.

The final 2k/20k count receipts prove first-read full data-root clones of one
BEFORE and zero in the eligible prototype for all three cases. Setter clones
are zero in both lanes; raw-edit fallback retains a full root clone. This is a
specific functional count, not a heap-allocation, retained-memory or universal
eligibility claim. Count instrumentation is absent from timing runs.

The history revocation contract is model-mutating undo/redo, not every History
action. Public overrides, escape, unsupported owners and uncertain proof decline
to the original full validation. Neither full setter work nor History was removed.
Those mechanisms were rejected with the prototype, not retained as a fast path.

## Evidence archive and qualification seal

Only copied, manifest-listed files are evidence for this report. References to
ignored `output/` paths name their archived original paths; ignored originals
alone are not publishable evidence. Extract `evidence.tar.gz` to inspect them.
The archive contains **169 files**. Its original **84 members remain
byte-exact**, including all three plans, all 12 raw first-cycle timings, four
final-size count receipts, decision/rollback, historical reviews, final drivers,
source hook and copied post-refactor baseline archive. The 85 added members
include final and intermediate gate JSON/logs, original failed log, current
1,403-file source manifest/result, restored contract-test receipts, bounded
cleanup and MCP diagnostics/probes, corrected test sources, desktop DOM receipt,
and runtime identity/provenance records. Massive agent CLI events are excluded.

Before repacking, this task preserved the complete prior draft archive, README,
manifest and documentation checks under
`output/local-point-cache-finalizer-2026-11-04/draft-*`.
The original archive SHA-256 is
`bd68ab3f56e6a6c9e9cf2b700d34380b33f700269eba0202c7d3fe0d688cd887`.
The new archive includes the old draft manifest, README, checks and their
provenance hashes. The separately preserved old archive remains immutable;
the old manifest is not rewritten as if it had qualified the final source.

`candidate-final-core.tar.gz` still contains the exact **70** rejected Core
sources. `candidate-proof-tests.tar.gz` preserves **245** original candidate
test registrations. Neither archive changed. Normal tests retain 162 public
contracts and omit 83 rejected-feature registrations; the retained tests do
not import the removed private helper or depend on these evidence files.
The current **69** Core sources match the frozen qualified phase-1 archive,
not Git HEAD. The archive is bounded evidence, not a standalone installed
runtime or clean-host reproduction claim.

`evidence-manifest.json` records every archive member's bytes and SHA-256.
`seal.json` binds the report, manifest, documentation audit, final source gate
and archive hashes at actual sealing time. It is a restored-checkpoint evidence
seal, **not release approval or acceptance of COW**.
`prior-report-identity.json` still verifies the ten inventoried phase-1/phase-2
report files and seals without changing them.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `evidence.tar.gz` | 920,451 | `47fd9e3b8ba0c2da7aa42510d5cd52915cffe9a6736e17a50711f4fbaa875316` |
| `candidate-final-core.tar.gz` | 212,180 | `480bc202e83234c95182cd257118fc5388ce07b41cd8d70dc1fc959c2e7a772d` |
| `candidate-proof-tests.tar.gz` | 18,052 | `36cabb6a70effca6f7d673dd2c6ad210994218c604e925b340b118fcfda4779a` |
| `prior-report-identity.json` | 1,512 | `60b0f7a3f6a818d9de0c71b1a8e8c87c12d5f4b841f3183cd33b7ddc8758bd51` |
| `restored-core-identity.json` | 8,318 | `34a28b0f8102b37ee5821dc413ddea1ed6ced043faed95d090f244d71b28586f` |

The recorded root docs build/check passed: **55 pages, 2,607 internal links,
English=true, localPathsExcluded=true**. This precedes the final roadmap prose
correction in this task; a rebuild of that updated prose is left to the parent.
The existing owned desktop DOM receipt proves the discarded-candidate warning
and measured limits in Google Chrome 156 (actual Google Chrome binary,
HeadlessChrome user agent, 1280×633 viewport). It is not editor, performance,
physical-display or mobile proof. Its server on port 61213 and named browser
session were closed. No new browser run was made here.

This task changed only this report directory, HANDOFF §5.136 and the final
roadmap paragraph, plus its own ignored evidence-output prefix. It ran only
bounded document/archive/hash checks. No implementation, test, benchmark,
lockfile, build, browser/mobile, commit, push or release operation was run.

## Next investigation, not implementation

- **Owned payload transfer: HOLD.** Original snapshot identity does not prove
  private payload ownership. Own `items.map` and native Array species can expose
  payloads. The bounded design report and baseline probes are archived. No
  transfer, trust flag or validation bypass is implemented or approved.
- **KeyIndex census: COMPLETED / DECLINE_OPPORTUNITY.** There were exactly
  60,015 rebuild insertions, but KeyIndex.set inclusive CPU was about 1.1% in
  the bounded sampled workload. Duplicate parsing is only a fraction of that.
  This does not support a plausible 5% total gain; no implementation follows.
  This is an opportunity decision, not a universal performance upper bound.
- **Duplicated disposable preflight review: PENDING.** The parent's read-only
  High macro design review at `output/preflight-reuse-2026-11-04/design.*` is
  active at this handoff. It is not implemented or approved. Its eventual
  findings are outside this sealed checkpoint.

Public admission, normalization, selective History, schema transitions, recovery
and fail-closed fallback remain mandatory. P2 GC/resource, S3 Spreadsheet
integration and Rust/WASM delivery gates remain open. There is no new Rust
package or Chrome qualification.
