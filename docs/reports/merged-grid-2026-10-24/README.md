---
work_id: merged-grid
artifact_type: regression-report
status: done
owner_role: integration
source_request: Fix Lexical and ProseMirror merged-cell display models, preserve hidden content and collaboration, verify regressions and Chrome, update HANDOFF.
last_updated: 2026-10-24
---

# Merged-grid consistency

Lexical native tables now contain only visible cells. Covered cells remain in the shared document and in serialized Lexical NodeState. ProseMirror comparison readback now supplies its matching full-model reference. The converter also copies covered-cell attributes and content instead of borrowing the reference body.

## Cause and implementation

The earlier Lexical representation placed all full-grid cells in native rows and hid covered DOM cells. With `registerTablePlugin` enabled, both the owner span and covered native cells occupied coordinates. The plugin padded the resulting grid, which added columns. Codec-only tests without native table transforms missed this case. A new Node reproduction fails against that representation; the first failure is retained.

The corrected representation omits covered native cells and stores their complete data on the table's NodeState. Serialized data includes text, marks, nested nodes and attributes. Reading a table reconstructs the full grid. Origin metadata on retained visible native cells remaps covered data when a native row or column is inserted before the merge. Native unmerge restores retained data into blank split cells. Selection and native reparent mapping use logical columns, including columns covered by an earlier row span. The obsolete DOM hiding pass is removed. Standalone JSON conversion still reads the previous full-grid serialization.

Coordinate maps are scoped to one conversion/selection/movement traversal. They are not retained across edits. Covered cells use a keyed lookup; the implementation does not search the entire covered-cell array for each grid position. This avoids introducing repeated whole-grid construction per row or quadratic hidden-cell lookup. No benchmark or editor latency gain is claimed in this task.

ProseMirror intentionally omits covered cells from its native document. `fromPmJSON` already takes a reference model for them, and `PmBinding` already uses that contract. The comparison app omitted this fourth argument. It now passes the matching input model. Covered cells are deep-copied from the reference, preserving cell attributes as well as their bodies. The demo's programmatic core-edit hook also pulls the selected native view after commit, which is required for a local PM command issued outside native transactions.

Core CRDT, schema, history, wire protocol, identities, model events and the shared full-grid/hidden-text GC contract are unchanged by this task. Inherited uncommitted structural-event changes remain unchanged. Their source-bound performance report and its historical native-model FAIL stay intact. No commit, push or deployment is requested.

## Verification

The final receipt records exact commands, counts, source hashes and evidence hashes.

| Final check | Result | Scope |
|---|---|---|
| New merged-grid regressions | PASS 11/11 | Table transforms, serialization, hidden data, selection, history, reference isolation |
| Focused binding/conversion/cache suite | PASS 41/41 | Final nested-attribute copy included |
| Expanded workspace suite | PASS 567 library + 12 demo + 27 docs | FUZZ_SEEDS=3000 PM_SEEDS=300 |
| Compatibility unit suite | PASS 31/31 | Separate nested app |
| Type checking / compatibility build | PASS | Final product source |
| Documentation build/check | PASS | 20 pages, 884 internal links, English and local-path exclusion |
| Chrome | PASS 340 | 211 previous + 3 promoted merge assertions + 96 merged-grid + 30 merged-range checks |
| Actual OS IME | NOT EVALUATED | Automated traces/input do not establish OS IME acceptance |
| Screen latency | NOT MEASURED | No performance claim from these functional checks |

 New `merged-grid.test.ts` has 11 cases with actual Lexical table transforms: four merge geometries including a fully covered lower row, native/JSON roundtrip, logical selection coordinates and visible native edits, both orders of concurrent merge/hidden text/format edits, merge history and native unmerge, native row/column insertion before a merge, legacy JSON reading, and PM rich covered-cell/nested-attribute/output isolation.

Chrome checks compare all five stored and native editor models with the server and require pending/fallback zero. The new merged-grid script checks nine distinct filled cells across Slate, Lexical and PM initiators and 1×2, 2×1, 2×2 and 3×3 merges. Each scene checks DOM visible-cell count and owner row/column spans, native typing, foreign hidden text/bold/background edits, typing undo, merge undo, merge redo, typing redo and unmerge. The structural script now asserts native equality during its three previously diagnostic-only merged intervals. A separate merged-selection script checks forward/backward range restoration and actual native replacement in logical column 2 after a 2×2 merge.

Intermediate evidence is preserved: the original reproduction, native unmerge experiments, a legacy fixture header-state error (fixed in the fixture), the first new Chrome attempt that exposed the missing local PM pull, a later nested-attribute alias reproduction (fixed by deep copying), and earlier successful runs before the final traversal-map/attribute-copy review. Final claims use the final source below, not those earlier runs.

Actual OS IME is **NOT EVALUATED**. Screen latency is **NOT MEASURED**. Finite histories do not establish every native table command or possible concurrent history. Review is by the implementing agent; no independent review or production acceptance is claimed.

## Reproduction

Use Node 22.19.0 and installed workspace dependencies from the repository root:

```sh
node --test packages/doc-sync/test/merged-grid.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
npm run build --prefix apps/demo/compat
npm run docs:build
npm run docs:check
```

Run the compatibility app with a task-owned loopback port (`COMPAT_PORT=0 npm start --prefix apps/demo/compat`) and its temporary data directory. Run `apps/demo/compat/checks-*.js` through a named Playwright CLI `run-code --filename` session and parse the returned assertions. The new scripts are `checks-merged-grid.js` and `checks-merged-selection.js`. The final local driver is `output/validation/merged-grid/run-chrome-verified.py`.

The tracked `browser-fixture.mjs --receipt <fresh-path>` helper creates an isolated required-child fixture with a two-paragraph minimum, copies the current compatibility main file and resolves current product source through workspace dependencies. It keeps the repository schema and existing user data unchanged. Use a fresh receipt path.

Tracked report/receipt: this folder. Original Node/build/fixture/driver logs and source hashes: `output/validation/merged-grid/`. Original Chrome assertions, first failure, console output and screenshots: `output/playwright/merged-grid/`. Final browser run: its `verified/` subfolder. These output folders remain local and are excluded from Git; their hashes are in `validation.json`.

## Final evidence and resource state

Final source hashes match the verified rebuild and checked scripts. The final 340-state Chrome run is under `output/playwright/merged-grid/verified/`. All 153 structural/merged snapshots were also checked directly across five editors for full stored/native/server equality, pending zero and fallback zero. Final console reports zero errors and warnings. The full-page `merged-native-models.png` was visually inspected: all five editors show the same 2×2 owner span inside a 3×3 grid, with six visible cells and no extra column. Covered foreign text remains in each full model.

Only the named `doc-sync-merged-grid` Chrome session and the two owned compatibility/backend pairs were closed. All four owned ports are closed. The existing documentation preview on port 62490 is still listening. User browser tabs, repository data and temporary validation data remain untouched. Historical tracked benchmark files (1,082 files), inherited raw structural measurements and the structural optimization source are unchanged.
