# Private preflight candidate: performance HOLD

**Disposition: NOT_PROMOTED / HOLD_PERFORMANCE.** The first serial cycle failed one mandatory direct Doc control. The candidate remains in output storage. Production Core stays equal to the qualified 69-file post-refactor archive.

The first failure is `cycle1-doc.remoteApplyMs`: **2.188646 → 2.2744375 ms (+3.9198436%)**. The maximum was 2.25430538 ms (3%). The baseline exceeds 1 ms, so the 0.25 ms allowance does not apply. All 24 child processes exited 0 and passed their declared semantic and source checks. A successful child process is not a performance-gate pass.

Cycle 1 completed normal 20k, normal 2k, legacy-no-moves 20k, legacy-no-moves 2k, fallback, then Doc groups. Each group used A-B-B-A, five measured samples and two warmups per process. A is the frozen post-refactor archive; B is the frozen candidate. Each lane median pools ten raw samples within that group. The orchestrator stopped at the first mandatory failure. **All 12 groups in cycles 2 and 3 are NOT_RUN.** No retry or failed-cycle pooling occurred.

## Recorded cycle 1 cells

All values below are milliseconds. Negative change means a lower candidate median. Main next-read cells are observations; their individual regressions do not override the declared setter/total gates.

| Fixture / entries | Case | Setter A → B (change) | First read A → B (change) | Total A → B (change) | Main gate |
|---|---|---|---|---|---|
| normal / 20,000 | Root Map | 803.418917 → 630.969041 (-21.465%) | 98.163021 → 103.047209 (+4.976%) | 902.235542 → 737.906812 (-18.214%) | PASS |
| normal / 20,000 | Nested Map | 798.885667 → 627.545854 (-21.447%) | 101.997896 → 101.407313 (-0.579%) | 903.015417 → 731.046729 (-19.044%) | PASS |
| normal / 20,000 | List | 810.788583 → 619.622229 (-23.578%) | 98.690063 → 103.147354 (+4.516%) | 907.141479 → 726.671792 (-19.894%) | PASS |
| normal / 2,000 | Root Map | 76.289438 → 54.516250 (-28.540%) | 8.943396 → 8.622521 (-3.588%) | 85.762021 → 63.239063 (-26.262%) | PASS |
| normal / 2,000 | Nested Map | 71.084396 → 57.465937 (-19.158%) | 8.406792 → 8.238084 (-2.007%) | 79.728979 → 65.850146 (-17.408%) | PASS |
| normal / 2,000 | List | 72.627645 → 53.480000 (-26.364%) | 8.950751 → 8.050104 (-10.062%) | 81.053063 → 62.667062 (-22.684%) | PASS |
| legacy-no-moves / 20,000 | Root Map | 795.745271 → 612.410166 (-23.039%) | 96.610791 → 100.679084 (+4.211%) | 896.959750 → 714.634125 (-20.327%) | PASS |
| legacy-no-moves / 20,000 | Nested Map | 796.130979 → 616.664938 (-22.542%) | 99.681438 → 98.523229 (-1.162%) | 897.592187 → 717.576625 (-20.055%) | PASS |
| legacy-no-moves / 20,000 | List | 791.456979 → 610.362688 (-22.881%) | 100.164479 → 99.714458 (-0.449%) | 891.709333 → 712.398250 (-20.109%) | PASS |
| legacy-no-moves / 2,000 | Root Map | 74.908291 → 59.002041 (-21.234%) | 9.084146 → 8.685834 (-4.385%) | 84.327312 → 67.830541 (-19.563%) | PASS |
| legacy-no-moves / 2,000 | Nested Map | 70.878209 → 57.341187 (-19.099%) | 8.304291 → 8.273146 (-0.375%) | 79.156791 → 65.599229 (-17.127%) | PASS |
| legacy-no-moves / 2,000 | List | 71.493583 → 54.619375 (-23.602%) | 8.074708 → 8.242791 (+2.082%) | 79.546646 → 63.191604 (-20.560%) | PASS |

The six 20k totals improved by 18.214–20.327%, which passed the required 5% improvement gate in this cycle. Every main setter and every 2k total passed its maximum 3% regression gate. These results do not make the full prospective gate pass.

| Fallback control | A median | B median | Change | Gate |
|---|---:|---:|---:|---|
| default-structural-insert | 15.711792 | 15.925250 | +1.358585% | PASS |
| default-structural-delete | 13.616333 | 13.803708 | +1.376105% | PASS |
| default-structural-move | 41.560271 | 41.043208 | -1.244127% | PASS |
| custom-schema-value-update | 13.187021 | 13.423271 | +1.791534% | PASS |

| Direct public Doc 100k control | A median | B median | Change | Gate |
|---|---:|---:|---:|---|
| localEditMs | 57.771542 | 48.909791 | -15.339301% | PASS |
| localColdToJSONMs | 22.259125 | 22.160750 | -0.441954% | PASS |
| remoteApplyMs | 2.188646 | 2.274438 | +3.919844% | FAIL |
| remoteColdToJSONMs | 30.518875 | 29.576771 | -3.086955% | PASS |
| localEditAndReadMs | 79.343354 | 70.473333 | -11.179287% | PASS |
| remoteApplyAndReadMs | 32.756459 | 32.077770 | -2.071921% | PASS |

The direct Doc workload uses 100,000 UTF-16 units, public local Doc.edit, plain remote operation application, and separate first toJSON reads. It has no History; its undo/redo field is explicitly NOT_RUN. The four fallback timing cells cover default-schema insert/delete/move and an altered custom schema value edit. Their separate untimed factory guard passed factory/engine receiver checks and omitted-domain document behavior. All control baselines exceeded 1 ms; no absolute allowance was used.

## Proof and evidence boundary

| Item | Result | Scope |
|---|---|---|
| Original independent 90 cases | HOLD_FUNCTIONAL_FAILURE | 90 paired outputs matched; one legacy-count assertion failed because its “custom” input was a clone of the exact default schema. This receipt remains unchanged. |
| Scope clarification | Recorded before timing | Authority comes from actual factory validation/copy/freeze of the exact default fingerprint. A clone of default can qualify through that route. An altered valid schema stays on legacy staging. |
| Clarified independent 94 cases | 94 baseline / 94 candidate / 94 equivalence PASS | Zero count failures. Includes altered custom, default-clone/raw/frozen factory cases and direct public Doc fallback. |
| Independent High review | APPROVE_PROOF | Exact candidate source closure and bounded value-update construction/order proof only. Its report preserves the earlier 90-case HOLD. The parent timing gate separately binds the later 94-case result. |
| Candidate TypeScript | PASS | Candidate-only 70-file noEmit check; no package/build acceptance. |
| Positive operation census | PASS | 19 scenarios: private snapshot/restore pairs 3→2, compiler entries 4→3; both live snapshots remain. Nine required normal scenarios pass. |
| Existing normal 2k/20k count receipts | PASS | Root/nested/List next-read root clones remain 1 in both lanes. Authored fixtures and full final checkpoints match. |
| Weak ownership probe | OBSERVED_RECLAIMED, both lanes | Twelve disposed Clients per lane plus a strong-root control; fixed two schedules of eight explicit GC calls. No general leak, retained-memory, heap-saving or performance claim. |
| First prospective performance cycle | FAIL | First mandatory failure: direct Doc remoteApplyMs +3.9198436%. Later two cycles NOT_RUN. |
| Production full workspace | HISTORICAL PASS | Existing exact-source receipt: 2,084 cases, 2,082 PASS, zero FAIL, two expected platform SKIP, zero cancelled; 104.214 s. No runtime change in this candidate study. Not rerun here. |
| New candidate full suite / packages / desktop Chrome | NOT_RUN | Candidate was not promoted. Focused proof and Node controls do not replace those checks. |
| Original MCP second-restart issue | NOT_REPRODUCED / UNRESOLVED | The intermittent recovery_required failure has no confirmed current production fix. |

The eligible candidate route is one ordinary value update of a guarded existing default-Data entry. It does not cover general schemas, structural edits, unknown receivers or uncertain storage. Public validation/copies, both live snapshots, live staging and normalization remain. The candidate source is retained for inspection. A separate read-only High diagnostic can inspect the control regression; this report does not assign a cause, approve another run, or change the stop rule.

Host load, CPU information, elapsed time and source inventories are in each process record. Execution was serial, but the host was not isolated. No claim follows about Chrome end-to-end latency, network behavior, Rust/WASM, allocation savings, general heap behavior, package acceptance or release.

## Source identity and portable selected evidence

- Production = frozen baseline: 69 Core files; sorted-line SHA-256 `8b532beb32d4ef0e7d69e54ac9a989d269d0c590e11d6ef8f3f0545b362c4a51`.
- Output candidate: 70 Core files; sorted-line SHA-256 `d6106051dccaac969849fac5ef24199690ccddf7a452cdeccdcc94606149d3ab`.
- Candidate JSON-manifest digest: `fd49e2f3c695cfa40b3c16c28a72624158becb71a3788bf7d1bd6223c70a5862`. This encoding differs from the sorted-line closure above.

[Selected evidence archive](selected-evidence.tar.gz), [member manifest](evidence-manifest.json), [source identity](source-identity.json), and [seal](seal.json) contain this follow-up only. The archive stores original workspace-relative paths under `workspace/`, plus this report and a manifest. Absolute paths inside original receipts are preserved as provenance. This is a portable evidence collection, not a full workspace or an installed runnable distribution.

The selection includes the candidate 70 sources, current/baseline 69 sources, proof/test drivers, final producer/private-edge receipts, the old 90-case HOLD, clarified 94-case and type receipts, bounded retention receipts, count receipts, plan/parent gate, all six group receipts and all 24 process/raw/stdout/stderr records, four original Doc receipts, and relevant failed-attempt diagnostics. Large model event streams, app dist and node_modules are excluded. This selection is not all-workspace qualification.

The three earlier report/seal directories remain byte-identical: API structure refactor, validation candidates, and local point cache candidate. Their old conclusions are historical. No older seal, HANDOFF, roadmap, application documentation, production source, candidate source or test source was edited by this finalizer. No test, timing, build, browser, mobile, Git or release action ran in this documentation step. The parent owns any later current-document update/build.
