# Handoff — @barocss/doc-sync

Latest **§5.133** qualifies the startup-lifetime checkpoint with a fresh full
`npm test`:1650 cases/1648PASS/two expected platformSKIP/zeroFAIL/zeroCANCEL.
Root typecheck and docs55pages/2601links PASS. All688 source hashes matched the
reviewed checkpoint through the run; no additional runtime changes were needed.
The async-schema/backpressure and cleanup fixes retain pending/foreign edits and
actor History; the historical discovery-only trigger remains NOT_PROVEN.
This checkpoint is for commit/push to main. No package versions or npm release,
new Chrome/mobile/Rust or performance qualification are included. Source/evidence:
docs/reports/mcp-startup-main-checkpoint-2026-11-03/.

Earlier entries describe their own captured source and publication state.

Latest **§5.132** fixes a reproduced stdio bootstrap lifetime gap and initialization
cleanup leaks. Early protocol bytes use bounded backpressure; a startup-only
reference remains until SDK readiness or observed closure. Supported async schema
imports now connect with both small and saturated initialize input. EOF drains
admitted work, closes local ownership and preserves uncertain recovery state.
Bot failures retain only a known startup phase, not raw stderr. Final affected
regressions: MCP190/188PASS/two expected SKIP, Bot56PASS, product restart1PASS;
new lifecycle9PASS and Bot provenance3PASS are included. Build/root tsc/docs43/
55pages/2601links PASS. No public Core/Schema/History/protocol source changed.
The exact trigger of the earlier discovery-only failures remains NOT_PROVEN;
the reachable async-schema/backpressure defect is separately proved and fixed.
No new browser/mobile/Rust/performance or whole-workspace run; no commit/push.

Latest **§5.131** consolidates the pending Spreadsheet S2, ephemeral Presence,
shared DOM/framework views, Map/List server admission and Client.data work for
the main checkpoint. Final full workspace run: 1638 cases/1636PASS/two expected
platform SKIP/zeroFAIL. Review fixed identical-state Presence TTL and late
Spreadsheet disconnect requests; the Graphic HTTP test now waits for the
requested cursor state. MCP test files run in a bounded pool of four without
changing scenario concurrency, assertions or timeouts. Original intermittent
bot MCP startup closure remains NOT_PROVEN; diagnostics and failed runs are
preserved. Client.data is the fixed Map/List namespace, requiring
createDataSchema; it does not reinterpret other domain schemas. Client owns
transport, History and save/open. Guarded data GC, storage extraction and resource
qualification remain open. npm publication is outside this checkpoint.

The entries below are historical snapshots. Their API names, counts and
uncommitted/publication status describe the checkpoint recorded in each entry.

Latest **§5.129** adds pre-application intrinsic Map/List server admission
through createDataHub and detached Client/LocalClient snapshots for retained
reference reads. Generic DocHub/Schema behavior remains; DataClient stays a
facade over one existing Client. Rejected batches do not persist/apply or consume
seq/receipt/broadcast state. Full workspace1616cases=1614PASS/two expected platform
SKIP/zeroFAIL; data60PASS/actualHTTP3PASS; root build/tscPASS. Ten tarballs/
12consumers and release rehearsalPASS; docs43PASS/55pages/2594links. Guarded data
GC is disabled to retain IDs; metadata-aware compaction remains open. No fresh
browser/mobile/process-restart proof. No commit/push/publication.

Latest **§5.128** adds Core `/data` (`DataClient`, `SharedMap`, `SharedList`),
a numbered storage/schema separation roadmap, and optional SolidJS Presence.
P1 uses the existing Client with a fixed internal encoding Schema and separate
local value policy; full storage extraction and authoritative data admission
remain later gates. No new Text engine/facade. Full workspace1588cases:
1586PASS/two expected platform SKIP/zeroFAIL; root tsc/buildPASS. Focused data29,
actual HTTP3, Solid tests3 and five-surface Chrome27PASS. Ten tarballs/12consumer
cases and release rehearsalPASS; docs43PASS/55pages/2590links. Preview:
http://127.0.0.1:55787. Native OS IME/mobile NOT_RUN. No commit/push/publication.

Latest **§5.127** adds Core `/presence`, shared DOM overlays and optional
React/Vue/Svelte packages. Nine library packages remain private0.0.0. Full
workspace1552cases=1550PASS/two expected platform SKIP/zeroFAIL; final affected
UI/framework10PASS/root tscPASS; desktop Chrome27/27PASS/errors0. Nine tarballs/11isolated
consumer cases and release rehearsalPASS. Docs43PASS;53pages/2471linksPASS.
Preview: http://127.0.0.1:49849. No commit/push/publication. Native OS IME and
mobile NOT_RUN. Existing-receiver sequence protection is not server-wide
Presence ordering; Graphic/Spreadsheet playground surfaces are projection
fixtures. Existing private sheet session is not automatically migrated.

Latest **§5.126** adds remote intra-cell text carets and character selections
through ephemeral Spreadsheet Presence. Affected Demo141/141, focused
Document/Graphic54/54 and root tscPASS; desktop Chrome spreadsheet68/68 and
domain7/7PASS. Docs43/43 and build52pages/2407linksPASS. OS IME and mobile
NOT_RUN (composition is simulated). Shared remote Document raw drafts and
Graphic drag geometry remain NOT_IMPLEMENTED. Fresh preview:
http://127.0.0.1:62007/?axes=stable&room=text-cursor-review.
No commit/push/publication; inherited WIP and user tabs remain preserved.

Latest **§5.125** fixes remote preview typography and range outlines. Preview
text is normal and matches native input padding; independent SVG outer borders
replace actor-colored shared grid edges. Demo136/136 and root tscPASS; desktop
Chrome57/57PASS with errors0. Mobile NOT_RUN. Fresh preview:
http://127.0.0.1:50796/?axes=stable&room=selection-review. Existing58880 user
input/History remains untouched. Intra-cell remote text carets are a proposed
next extension, not implemented by this repair. No commit/push/publication.

Latest **§5.124** adds per-user colored ranges and live input previews through
ephemeral demo Presence, without changing data schemas or CRDT operations.
Full workspace1516cases:1514PASS/two expected SKIPs/zeroFAIL; final affected
Demo129PASS and root tscPASS. Desktop Chrome92checksPASS; mobile NOT_RUN.
The fresh preview is http://127.0.0.1:58880/?axes=stable&room=live-presence-review.
Baseline9334e59 is committed; S2/presence work remains uncommitted with no push.

The tested inherited checkpoint is committed as **9334e59**. TypeScript
Spreadsheet S2 delivery is in **§5.123**: stable row/column IDs, implicit
intervals, insert/delete/move, selective structural History, stable editor
drafts/selection and strict server reference validation. Final workspace run:
**1,511 cases / 1,509 PASS / two expected SKIPs / zero FAIL**. Desktop Chrome
acceptance has **76 passing checks** on one bundle. Mobile testing is excluded
by the latest user instruction. New S2 changes remain uncommitted; no push or
publication occurred. Shared Client integration, native S2, formulas, GC and
browser performance qualification remain open.

The custom-schema and editor-mapping checkpoint is in **§5.121**. Experimental
public SpreadsheetSchema/SparseSheet, custom Graphic ID helpers, editor
capability preflight and native runtime schema subsets are implemented.
Final suite aggregate: **1,464 cases / 1,462 PASS / two expected SKIPs / zero FAIL**
after correcting and rerunning the docs suite. Chrome default/custom profiles
pass 21/21 and 29/29; native SDK/shadow pass 48/48 and 78/78. Full native nested
Document schemas, live Rust transitions, shared sheet Client integration and
WASM remain open. That checkpoint preceded the tested 9334e59 commit; read
§5.123 for current delivery and working-tree state.

The collaborative VTable spreadsheet demo, built-in graphic data APIs and native
Rust Document/Graphic/Spreadsheet delivery are in **§5.120**. Final workspace:
**1,445 cases / 1,443 PASS / two platform SKIPs / zero FAIL**. Chrome sheet
functional 21/21 passes; final 10k remote p95 is 26.8 ms. Backend-only ABBA
repeats improve p95 by about 8.5× under an identical UI bundle. Native SDK 42 and
shadow 75 pass; graphic and sheet differential proof boundaries differ.
Public SpreadsheetSchema/Client integration and a full WASM backend remain open.
All changes are uncommitted; no publication or push is included.

Schema navigation, explicit native Rust/WASM graphic support limits and the
private sparse-sheet S1 experiment are in **§5.119**. Schemas now has its own
menu. Sparse tests pass 18/18, docs 40/40, and native SDK 13/13. This is not a
public SpreadsheetSchema/Client/server integration. Interval axes, formulas,
virtual sheet UI, compaction and Rust/WASM sheet support remain open.

The private PixiJS graphic editor and real HTTP/SSE verification are in
**§5.118**. Chrome functional checks pass 20/20. The full workspace has 1,419 PASS
and two platform SKIPs. Large-scene latency remains INVESTIGATE; stable cached
ID lookup is fast, but whole-model staging and cold seeding remain expensive.
The manual demo is open in a new browser tab. Nothing is committed or published.

The DocumentSchema/GraphicSchema implementation and current verification are in
**§5.117**. Existing unmarked Schema and explicit document schemas share the same
identity. Graphic schemas use stored empty containers for canvases, frames and
object groups. This is headless model/sync support, not a canvas renderer.
The source checkout is still uncommitted and npm publication is deferred.

The five-package consolidation, actor profiles, release preparation, and fresh
verification are in **§5.116**. `@barocss/doc-sync` now owns the actual core;
there is no separate core package or binding facade. All five library packages
remain private at `0.0.0`. npm publication is deferred. Current changes are
uncommitted; the last confirmed main push is in **§5.115**.

The input-tail diagnostics and explicit local save/open are in **§5.114**.
The unified Client API, four-editor demo and input-ownership corrections are
in **§5.113**. This working-tree change is not a new publication.
Latest publication review is in **§5.115**. Selected TypeScript client engines
and their verification limits are described in **§5.104**.
The numbered Rust/WASM delivery queue is in **§5.103**.
Final review, Rust SDK/WASM usage, and the main publication checkpoint
are in **§5.102**. Safe conditional rejection settlement is in **§5.101**;
owner approval and accepted-request recovery are in **§5.100**.
Unknown outcomes remain blocked; a refreshed change requires a new approval.

The historical six-package extraction and draft TypeScript engine contract
are in **§5.93**. Its core/facade layout and compatibility imports are superseded
by **§5.116**. This is not a TS/WASM backend selector.

The dedicated TypeScript Tiptap extension and first typed native Rust SDK are
in **§5.92**. Tiptap uses the production TypeScript engine. Native SDK calls do
not yet provide a Rust browser, Node, editor, or MCP adapter.

The hidden root-gap cursor correction and complete retest of the four formerly
omitted endpoints are in **§5.91**. Its TypeScript library suite passed 726/726,
and all eight native differential suites passed at that checkpoint.

The pinned Rust movement/logical split/join slice, independent History,
selection limits, pending replay, and dynamic-schema delivery plan are in
**§5.90**. Runtime arbitrary schemas and live Rust schema transitions are not
implemented.

The Rust group/inline/string-span projection, independent History, selection,
and pending recovery comparison are in **§5.89**.

The pinned Rust recursive flow/table storage, nested History and selection,
covered-cell retention, and recovery comparison are in **§5.88**.

The pinned Rust text/atom block and JSON attribute slice, independent History,
typed admission, and pending replay comparison are in **§5.87**.

The independent Rust History, UTF-16 selection, and pending undo/redo checkpoint
comparison are in **§5.85**. The subsequent opt-in paragraph split/merge, aliases,
node History, and multi-paragraph selection comparison are in **§5.86**.
The Rust roadmap separates these bounded R4 results
from the remaining structural, schema, GC, adapter, and production gates.

The one-shot bot runtime and character design are in **§5.54–§5.55**. The headless-agent presence implementation and verification are in **§5.53**. The 15-agent and three-editor experiment is in **§5.52**. The expanded AI collaboration scenarios are in **§5.51**. The hydration-race fix and publication checks are in **§5.49–§5.50**. The follow-up examples, selection fix, and validation are in **§5.48**. The documentation-site refresh and publication checks are in **§5.46–§5.47**. The open-editor schema transition and its verification are in **§5.44**; its main integration verification is in **§5.45**. The earlier Codex and editor collaboration checks are in **§5.42**; their main integration validation is in **§5.43**. The recovery storage and large-log work is in **§5.36–§5.40**.

Created 2026-10-22. The review-only durable conditional journal, server generation and process-failure evidence are in **§5.35**. The numbered roadmap, earlier Chrome integration and recovery work are in **§5.34**. Server-atomic edits, schema versioning, compatible transitions and fresh Codex validation are in **§5.33**. Headless Node synchronization, an MCP server, Codex validation and schema-change analysis are in **§5.32**. Verified main integration is recorded in **§5.31**. Receive model materialization and preserved metadata-memory evidence are in **§5.30**. Runtime ID metadata compression is in **§5.29**. Remote native projection and repeated Chrome comparison are in **§5.28**. Native product-schema editing and large-document measurements are in **§5.27**. Representative Word-style, Notion-style and presentation profiles are in **§5.26**. Verified integration and editor design lessons are in **§5.25**. Merged-grid native models and hidden-cell preservation are fixed in **§5.24**. Guarded structural event comparison is in **§5.23**. Final main integration is in **§5.22**. Automatic paragraph and post-move split fixes are in **§5.21**. The moved/required text receive optimization is in **§5.20**. Public editor bindings and extended document contracts are in **§5.19**. English documentation and the GitHub Pages app are in **§5.18**. Final integration checks for the 2026-10-23 structural cache change are in **§5.17**; implementation and measurements are in **§5.16**. Final checks and main integration for multi-text-block remote comparison are in **§5.15**; implementation and measurements are in **§5.14**. Main before that integration was `6f15291`. The previous full integration is in **§5.13**, consecutive formatting undo/redo in **§5.12**, intent preservation in **§5.11**, and screen latency in **§5.9–§5.10**. Remaining priorities are in **§6**.
See [`README.md`](README.md) for the concepts, [`docs/edit-api.md`](docs/edit-api.md) for editing API design, and the roadmap for the plan.

---

## 0. Overview

- **Purpose**: A **document CRDT** library with an externally injected schema. It does not know block types. It knows only schema shapes: text, inline, flow, group, grid, row, cell, atom, and span.
- **Supported scope**: Concurrent text, formatting, links, lists, tables, images, nested flows and atoms; ProseMirror, Tiptap, Slate and Lexical bindings; identity-preserving paragraph/block/group placement; required-child projection; persistent annotations; declared nested attribute fields. Earlier scope is in §5.19; Tiptap scope and limits are in §5.92.
- **Monorepo**: `packages/doc-sync` owns the dependency-free core, local/sync clients, server, and editor contracts. Four `packages/doc-sync-{prosemirror,tiptap,slate,lexical}` workspaces own bindings. These five are private at `0.0.0`; apps and benchmarks stay private. Changesets prepares independent versions without publication (§5.116). Rust remains a private Cargo experiment. Historical extraction evidence is retained in §5.93.
- **Input preservation**: Fixed 22 caret/IME failures in the Slate/Lexical/PM comparison demo, `apps/demo/compat`. Causes, composition drafts, and Chrome validation scope are in §5.6. This is separate from the default `/pm` IME implementation.
- **Current stage**: Expanded stage 0 measurements. Improved stage 1 safe single-block receive comparison and large-string cache copying. Added stage 2 specifications, property tests, and a long-run CI foundation (§5.7). Actual editor latency, G0/G1, lease-expiry recovery, and long-run exit criteria remain open. Improved paragraph model recalculation and demo Paint/PrePaint costs (§5.9–§5.10). Core timing alone does not establish product performance acceptance. Added intent-preservation case specifications and 41 regressions (§5.11). Fixed consecutive formatting undo and added regressions that preserve other users' writes (§5.12). Extended safe remote comparison to at most 8 text blocks (§5.14). Broader batches, structure and undo/redo retain whole-model reads; eligible large-document cases now use guarded structural comparison/verification windows (§5.23). Structural paragraph cache reuse was improved in §5.16.
- **Next**: Review baseline timeouts, trace speed, and semantic differences between engines. Set targets and G0. Remote root-block projection is improved in §5.28. Narrow remaining local conversion, Lexical readback, large changed containers, multi-block/structural costs and screen costs. Keep the existing decisions on contiguous storage and binary formats. Use §5.20 measurements to profile the remaining logical projection and structural costs (§6).
- **Name**: `@barocss/doc-sync` (user decision, 2026-10-22). Do not use the old name. The `@barocss` scope already includes CSS packages (browser and kit) and math-editor-lexical.

## 1. Location and execution

```
/Users/user/github/doc-sync      ← Git initialized on 2026-10-22 at user request; default branch main
```

Remote `origin`: `https://github.com/barocss/doc-sync.git`. The first commit preserved the existing README and included project source, configuration, and documents. `data/`, all `node_modules/`, `.playwright-cli/`, `.omx/`, and `output/` remain local. Evidence paths under `output/` in this document exist on the validation computer and are not in Git. Raw measurements under `benchmarks/results/` are in Git.

```bash
npm install --cache <writable-temporary-folder>/npm-cache   # ~/.npm gives EACCES; do not fix with sudo
npm test                     # Builds first; latest exact counts and limits are in §5.117
npm test --prefix apps/demo/compat  # 33 comparison-demo conversion, input, and probe tests
FUZZ_SEEDS=3000 npm test     # Large random run (several minutes)
PM_SEEDS=300 npm test        # More ProseMirror random traces
npm run typecheck            # tsc (project typescript 5.8)
npm run build                # Five ESM/declaration packages, in dependency order
npm run check:packages       # Real independent tarball consumers; run separately from tests
npm run release:status       # Read the five-package Changesets plan
npm run check:release        # Temporary-copy version rehearsal, no publish
npm run docs:dev              # English documentation, loopback URL printed by VitePress
npm run docs:build            # Static site in apps/docs/dist
npm run docs:check            # Built pages, links, fragments, assets, and English prose
npm run docs:preview          # Static loopback preview under /doc-sync/
npm run dev:products         # Native Word/Notion/presentation views, http://127.0.0.1:5413
npm run dev                  # Demo server http://localhost:5410
npm run bench                # Stage 0 (default 10,000/100,000 characters, about 25 seconds)
npm run bench -- --chars 10000 --engines ours,yjs --seed 1
npm run bench -- --out-dir results/manual-20261022       # Output relative to benchmarks/
npm run bench:client -- --label current --out results/manual-client-20261022.json
node --cpu-prof --cpu-prof-dir=<folder> benchmarks/profile.ts 10000   # CPU profile
```

- Requires Node 22.18 or later. Runs `.ts` directly with type stripping. Use **erasable TS syntax only** (`erasableSyntaxOnly`). Do not use enum, namespace, or constructor parameter properties.
- Public package exports point to compiled ESM `.js` and `.d.ts` declarations. `npm test` builds first. Source tests use direct `.ts` execution; packed consumers use public imports. The release tools support Node 22.18+ in the 22.x line or Node 24.x.
- Demo pages:
  - `/`: three demo editors and a token inspector.
  - `/multi?n=10&doc=name`: multiple frames.
  - `/pm?doc=name`: demo editor × ProseMirror.
- The demo server appends logs to `data/<doc>.jsonl`. On restart, it replays the logs. `NO_SCHEMA=1` starts a schema-free server.
- Separate validation storage: `DATA_DIR=/tmp/doc-sync-demo-check PORT=5411 npm run dev`. The default is root `data/`, independent of execution cwd. `PORT=0` assigns a random port and logs the actual port.
- `.claude/launch.json` in this folder runs `apps/demo/server.ts` on port 5410. External launch settings in the earlier experiment repository were not changed during migration.
- npm registry: This folder uses the default `registry.npmjs.org`. The user allowed direct npm downloads for this project only. Do not change other repositories' registry settings.

Root `package.json` is a private npm workspace. Run `npm run dev`, `npm test`, `npm run bench`, and `npm run bench:client` from the root. `npm run typecheck` checks all work units together. See §5.4 for execution and configuration changes.

## 2. Structure

```text
packages/doc-sync/           Actual dependency-free @barocss/doc-sync core
  src/index.ts              Doc, commands, History, model, schema, Client
  src/crdt/                 Tokens, validation, editing, model, compaction
  src/client/, src/local/   Unified/local clients and actor profiles
  src/sync/, src/server/    SyncClient, transports, protocol, DocHub
  src/editor/, src/engine/  Shared editor contracts and TypeScript engine
  test/                     Consolidated core/integration/regression suites
packages/doc-sync-prosemirror/  ProseMirror schema, conversion, binding
packages/doc-sync-tiptap/       Tiptap extension, ProseMirror binding peer
packages/doc-sync-slate/        Slate binding and codec
packages/doc-sync-lexical/      Lexical nodes, conversion, binding
apps/demo/                  Private demo server, local/client/product UIs, tests
apps/docs/                  Private English VitePress documentation and tests
apps/mcp/                   Private stdio/HTTP MCP service and recovery tests
apps/bot/                   Private document bot runtime and tests
benchmarks/                 Private measurements; results/ retains old evidence
fixtures/                   Shared example and representative product schemas
experiments/                Private Rust/native/WASM experiments
.changeset/                 Independent release plans; no npm publication
scripts/                    Builds, packed consumers, isolated version rehearsal
docs/                       Design, reports, roadmap
data/                       Existing logs (do not move or delete)
```

Layer dependencies:

```
demo ─▶ pm ─▶ sync ─▶ crdt ◀─ server
              (crdt has 0 external package dependencies; keep this property)
```

## 3. Core concepts (details in README §1–18)

1. **A document is a token sequence.**
   - Character tokens and node tokens (block marker ¶, table, row, column, image, and so on).
   - Block lists are not stored. They are calculated from live tokens.
   - Enter inserts a marker; paragraph joining deletes a marker; block type is marker attribute `$type`.
2. **Sequences are one main body plus per-node slot sequences.**
   - Slots: `body`, `rows`, `cols`, `cell:rowKey,colKey`.
   - Head IDs derive from owner node and slot name (`0@owner/slot`). There is no sequence-creation operation.
3. **RGA**: New tokens go immediately after their origin. Larger IDs come first for the same origin. Text sequence origins remain immutable. Identity-preserving placement is a separate operation (§5.19); retained move records determine logical parents and order. It does not rewrite the RGA.
4. **Concurrent Enter at one position creates one line.**
   - Markers record left/right token boundaries. Only the first marker at a shared boundary opens a block; others are absorbed.
   - This is the user's chosen rule.
5. **Deletion ledger** (dels / cancels):
   - Undo is participant-specific and cancels only that participant's deletion.
   - Attribute undo applies only while the current value is still that participant's value.
6. **Server order = causal order.**
   - A client stores only the last received serverSeq.
   - The server validates and applies a Change atomically (409 if any check fails).
7. **GC**: Compact tombstones instead of removing them (`▒×N`). Watermark: `min(ack, undo pin − 1)`.
8. **Schema validation uses immutable facts only**: sequence membership and birth type.
   - An operation accepted by the server is therefore not rejected by another replica.
   - The tradeoff is sequence-level validation (README "Validation precision").
9. **Model**: `toJSON()` returns a tree in the schema-based document editor's document JSON form.
   - Groups such as list > list-item are stored flat and grouped during calculation.
   - A flow always starts with a text block.
   - Graphic container roots and stored frame/group containers may be empty and never add default text. DocumentSchema keeps flow defaults; GraphicSchema uses the same CRDT with explicit domain/capability checks (§5.117).
   - Tables use a full grid with covered cells; colspan/rowspan are calculated.
10. **Editing API**: `doc.edit(EditOp[])`; EditOp is insert, delete, update, split, merge, or move.
    - Paths are model-tree child indices, in the same numeric-array form as schema-based editor paths.
    - The compiler converts by shape to wire operations. Per-row cell insertion folds into one column.
    - If editor and CRDT models differ, `normalize` returns the difference.
11. **Receive-side events**: `SyncClient.onModelEvents`.
    - Compares models before/after remote changes and returns model operations.
    - Falls back to whole-document replacement on verification failure. This occurred 0 times in 3000 random traces.
12. **Carets and selections**: Token-key anchors: `anchorAt(doc, path)` / `pathAt(doc, key)`. Presence `anchor` is the active end (head); `focus` is the opposite end. Resolve both to current document positions, then draw user-colored ranges and named carets (§5.5).
13. **ProseMirror binding**:
    - Send side preserves Step meaning for text, Enter, join, range deletion, and formatting. Other Steps use diff.
    - Receive side applies one minimal replacement.
    - Undo uses the CRDT history.

## 4. Current state: verified results

The table below records input-fix commit `8d0f887`. See §5.7 for 2026-10-23 implementation/measurements, §5.8 for final pre-integration tests, and §5.9 for later screen-latency improvements.

| Item | Result |
|---|---|
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | 113 passed at input-fix integration: library 103 + demo 10. Independent copy of committed core, block verification enabled, about 141 seconds (§5.6). |
| `npm test --prefix apps/demo/compat` | 31 passed: conversion, token selection, composition, probes, remote-edit tools, clock reservations. |
| `npm run typecheck` | 0 errors |
| 3000 random traces × 2/4 participants × GC off/on | 0 divergence, mirror mismatch, receive fallback, or server rejection. All 4 runs passed again with block verification enabled after performance fixes (about 3 minutes). |
| Old edit functions ↔ new commands equivalence | 34,001 steps, 0 differences; old functions then removed. |
| ProseMirror 300 random traces × 2/3 participants | All documents matched. Existing Step conversion rules retained. |
| Browser | Tables, cell merging, background, links, captions, images; 10 frames (373/514/206 changes converged to one fingerprint); /pm bidirectional editing, table columns, and remote carets. |
| Post-monorepo browser | `/`: concurrent Enter, rows/columns, undo, GC. `/multi?n=3`: convergence after offline edits. `/pm`: bidirectional editing and tables (§5.4). |
| Presence browser | 14 cases passed: ranges, backward/multi-paragraph selections, post-edit positions, overlap, disconnection, and others (§5.5). |

Earlier changes (standalone-library preparation; paths below are the historical pre-monorepo paths):

- Old document class name → `Doc`; ProseMirror `ZtSchema` → `DocSchema`; old PM transaction metadata value → `REMOTE_META = "doc-sync"`.
- Moved the demo outside the library:
  - `src/ui` → `demo/ui`.
  - `src/server/main.ts` → `demo/server.ts`.
  - `src/schemas/demo.ts` → `demo/schema.ts`.
- Four entry files (`packages/doc-sync/src/index.ts`, `packages/doc-sync/src/sync/index.ts`, `packages/doc-sync/src/server/index.ts`, `packages/doc-sync/src/pm/index.ts`) and `package.json` `exports`.
- Moved prosemirror-* from dependencies to **optional peerDependencies**; development packages remain devDependencies.
- Added typescript 5.8.3, @types/node 22, and yjs 13.6 to devDependencies.
- Replaced old names in demo titles, README, and edit-api.md.
- Added `benchmarks/` (§5).
- Full backup before changes: `/Users/user/github/zero-js/yorkie/zero-yorkie-backups/2026-10-22/zerotree-crdt-before-standalone.tgz` (excluding node_modules).

## 5. Stage 0: first measurements (2026-10-22, Node 22.19, seed 1)

Trace (`benchmarks/trace.ts`):

- Human-like editing on a paragraph list: mostly single-character input, occasional Enter, Backspace (including joins), caret movement, range deletion, and paste.
- Runs a reference model alongside the engines. Checks local, receive-side, and save/load results against it.
- Yjs uses the y-prosemirror form (XmlFragment > paragraph > XmlText). Split/join deletes and reinserts text, as y-prosemirror does.

| Size | Engine | Correct | Local edit p50 / p95 / max (ms) | Local total | Receive p50 / p95 (ms) | Receive total | Server validation+apply total | One text read | B/edit (one character) | Saved size | Save / load (ms) | Heap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10,000 characters · 54 paragraphs · 4,261 edits | ours | ✓ | 0.59 / 2.67 / 28 | 3.8s | 0.22 / 0.61 | 1.1s | 1.8s | 9ms | 105 (98) | 1.8MB | 13 / 16 | 8.4MB |
| | yjs | ✓ | 0.0072 / 0.024 / 1.5 | 0.05s | 0.0064 / 0.020 | 0.05s | — | 0.1ms | 20 (15) | 27KB | 0.6 / 2.8 | 0.5MB |
| 100,000 characters · 625 paragraphs · 41,549 edits | ours | ✓ | **15 / 59 / 838** | **893s** | 4.2 / 23 | 331s | 296s | 171ms | 107 (100) | **17.5MB** | 139 / 247 | **81MB** |
| | yjs | ✓ | 0.004 / 0.010 / 3.6 | 0.27s | 0.0034 / 0.0082 | 0.23s | — | 0.8ms | 23 (18) | 283KB | 4.5 / 17 | 3.6MB |

- This table contains **pre-fix** values. `benchmarks/results/2026-10-22-*.json` was overwritten by post-fix runs. The table is the only remaining pre-fix data. A 100,000-character run took about 33 minutes for ours alone (Yjs 0.9 seconds).
- **All three results are correct**: local, receive-side, and save/load match the reference model. The issue is speed and size.
- A 10× size increase produces about 25× local p50. Each edit is O(n) or worse. The gap from Yjs reaches thousands of times at 100,000 characters.
- Against proposed roadmap targets (100,000-character local p95 < 2ms, receive p95 < 5ms, memory ≤ 2× Yjs, one character ≤ 100B, open < 300ms), only opening at 247ms narrowly passes. Single-character size at 100B is on the boundary. Other values fall far short.

**Wire size is not a fair comparison**: ours uses JSON; Yjs uses binary. Our saved form also uses one JSON object per token.

### Bottlenecks (10,000-character CPU profile, local editing + receive)

| Self time | Location | Cause |
|---|---|---|
| **44%** | `Doc.indexOf`: `private indexOf` in `packages/doc-sync/src/crdt/doc.ts` | Discards the sequence position index (`line.index`, token → index Map) **on each token insertion** (`line.index = null` at the end of `integrate`). The next lookup rebuilds it for the whole sequence. Each edit becomes O(sequence length). |
| **19% + 13%** | `Doc.blocks` and its anonymous function (`blocks(lineKey)` in `doc.ts`) | Discards the entire block list cache (`blockCache`) on every edit. The next path resolution (`entriesOf` → `resolvePath` in `edit.ts`) scans the sequence and rebuilds each block's `text` string. |
| 8% | GC | Maps and arrays created by the two paths above. |
| 3.5% | `Doc.apply` itself | |

These causes account for about 90% of time. Both are **algorithm issues**, rather than a limit of token-sequence storage. Yjs, also in the RGA family, handles the same trace within O(log n).

The initial gap was far outside G0's rough "within 10×" criterion. Both causes rebuilt the whole structure per edit. With the user, we fixed those two paths first and measured again (§5.1).

### 5.1 After fixing the two bottlenecks (2026-10-22)

**Changes** (`packages/doc-sync/src/crdt/doc.ts`; behavior unchanged, with the same test/random results):

1. **Position index**: Removed the full-sequence Map.
   - Each token stores its last known position (`Item.index`) and the insertion count at that time (`Item.indexAt`).
   - Insertions shift a sequence by one position at a time. The token can therefore have shifted right from its stored position by at most the number of later insertions.
   - Check `items[stored] === token` on use. On mismatch, search only that range. If it exceeds 256 positions, rewrite all sequence positions (`reindex`). Reindex after GC compaction too, because removal shifts positions left.
   - Consecutive typing, whose origin is the last inserted character, is always O(1).
2. **Block list**: Character operations update the affected sequence's block list.
   - In `apply`, character insertion, deletion, and formatting no longer call `dirty()`, which cleared all caches.
   - On insertion, find the live token to the left. If it is a character, insert into its block. If it is an opening marker, insert at that block's start. Deletion removes the character from its block.
   - Recalculate only that sequence in other cases: after an absorbed marker, a virtual block after a table, or traversal across more than 512 tombstones.
   - Markers, nodes, restoration, and node attributes still recalculate everything.
   - Updates create **new arrays and block objects** (copy-on-write), so compilers holding a previous list remain safe.
   - **Verification**: `Doc.verifyBlocks = true` compares each cached read with a fresh calculation. The test harness always enables it (`VERIFY_BLOCKS=0` disables it). A deliberate one-position fault was detected immediately at seed 1.

**Results** (same trace, seed 1):

| 100,000 characters | Before | After | Yjs | After / Yjs |
|---|---|---|---|---|
| Local edit p50 / p95 | 15 / 59 ms | **0.043 / 0.19 ms** | 0.0037 / 0.0097 ms | 12× / 20× |
| Local edit total | 893s | **12.8s** | 0.24s | 53× |
| Receive p50 / p95 | 4.2 / 23 ms | **0.0069 / 0.059 ms** | 0.0034 / 0.0090 ms | 2× / 7× |
| Receive total | 331s | 2.1s | 0.23s | 9× |
| Server validation+apply total | 296s | 2.6s | — | |
| One text read (toJSON) | 171 ms | 56 ms | 1.1 ms | |
| Open | 247 ms | 129 ms | 18 ms | 7× |
| Saved size · heap | 17.5MB · 81MB | 17.5MB · 85MB | 283KB · 3.3MB | 63× · 25× |
| Run duration | About 33 minutes | 21s | 0.8s | |

At 10,000 characters: local p50 0.59 → 0.012ms (Yjs 0.008); receive p50 0.22 → 0.0017ms (faster than Yjs 0.006).

Against the proposed roadmap targets:

- **Met**: 100,000-character local p95 < 2ms (0.19), receive p95 < 5ms (0.059), open < 300ms (129).
- **Boundary**: One character ≤ 100B (100).
- **Not met**: Memory ≤ 2× Yjs (25×), saved size (63×).

**Remaining bottlenecks** (100,000-character profile):

| Share | Location | Cause |
|---|---|---|
| About 50% | Full `blocks()` recalculation | Split/join (marker insertion/deletion) still recalculates the whole sequence. It is 2.5% of edits, but costs tens of ms each and dominates the total. Local max 31ms comes from this path. |
| About 28% | `splice` in `integrate` | The sequence is a flat array. Middle insertion shifts all later entries (O(n) memory copying). This also accounts for most receive time. |
| 12% | GC | New arrays created during updates. |

Memory and saved size come from one large token object per character (§5.2).

### 5.2 Reducing memory and saved size (2026-10-22; user requested only items 1 and 2)

Causes at 100,000 characters: 111,769 tokens, one per character. Yjs groups consecutive input into 11,329 items, averaging 15.3 characters.

- Memory per token ≈ 800B. **Three empty containers** (attrs Map 184 + dels Set 152 + cancels Set 152 = 488B, 61%) were allocated even for unformatted, undeleted characters. The rest was the object 144, id object/key/origin strings 88, and sequence array/byKey/block lookup entries 74.
- Snapshot JSON per token ≈ 164B. It wrote 11 field names and default values (`"born":""`, `"compact":false`, `"span":1`, and so on). Defaults alone used 88B. Character content used 1B.

Changes (`packages/doc-sync/src/crdt/doc.ts`, behavior unchanged):

1. **Shared empty containers**: `attrs`, `dels`, and `cancels` initially point to shared empty containers (`NO_ATTRS`, `NO_DELS`). On first write, `attrsFor`, `delsFor`, and `cancelsFor` allocate owned containers. Shared containers are `EmptyMap`/`EmptySet`, which throw on writes so tests detect missed conversions. GC returns items to shared containers instead of calling `clear()`. **All new writes must use `…For(item)`.**
2. **Short snapshot form**: Single-character keys (`i o k c b y a d x z s`), with defaults omitted. Omit origin (`o`) when it is the preceding ID of the same participant (consecutive input). Store one ID key string (`"5@A"`), restored through `ticketOf`. The format is documented in the `ItemJSON` comment. Snapshots are not stored on disk; logs store only changes. No old-format reader was added. **Pages still running old code cannot read snapshots after the server starts with new code**; reload those pages.

3. **Omit consecutive IDs**: Omit `i` when it is the next ID after the previous token in the sequence, skipping the length of compacted spans (about 91% of tokens). Saved size fell from 2.9MB to 1.6MB. Hexadecimal and base-36 forms saved only 1–2%, so they were not added. Round-trip tests: `packages/doc-sync/test/snapshot.test.ts` (3 tests; detect a broken reader).

Results (100,000 characters):

| | Before | After | Yjs |
|---|---|---|---|
| Memory (receive-only replica) | 85MB | **35MB** | 3.4MB |
| Saved size | 17.5MB | **1.6MB** (through item 3) | 283KB |
| Save / load | 63 / 129ms | 27 / 55ms | 4 / 16ms |

Latency remained similar (local p50 0.042ms, p95 0.17ms). Checked 83 tests, four runs of 3000 random traces, and browser /pm, where a new participant received the new snapshot form and converged.

Remaining memory (≈ 320B per token) cannot fall much while every character has a token. Grouping (§6.2 item 3) addresses that, but **the user prohibited it**. The user will consider the wire form (107B JSON/edit versus Yjs 23B) and binary storage (§6.2 item 4) further.

### 5.3 Reducing full-document comparison in SyncClient local edits (2026-10-22)

- Changed `SyncClient.onLocalEdits` to a getter/setter. With no subscriber, `doc.editListener` is absent too. Subscription changes, initial snapshots, and reset reconnect the current subscription state. Explicit `{normalize: true}` verifies even without a subscriber.
- With a subscriber or explicit normalize, `Doc.edit` verifies only one block for **character insertion/deletion and range formatting within the same text block**. It uses existing `applyEdits`/`diffModels` and maps correction paths back to the original document. This applies in the main body, list items, table cells, and containers.
- Paragraph split/join, multi-block edits, table/group structure, inline-node insertion, virtual blocks, and hidden sequences retain full verification. CRDT wire operations, application, ordering, undo, and GC rules are unchanged.
- **Remote `withEvents`, undo/redo, and full ProseMirror conversion are outside this change.** This does not establish that their latency is resolved. A large text block still incurs verification proportional to block size.

Reproduce with `node benchmarks/client.ts --label <name> --out <new-JSON-path>` (Node 22.19). It does not overwrite files. Uses 10,000/100,000 characters, at most 160 characters per paragraph, single-character insertion, 5 warmups, and 30 samples. Subscriber callbacks count calls only. Screen, network, commit, and document-update costs in user callbacks are excluded. Final documents and notification counts are checked on all three paths.

| Size | Path | Before p50 / p95 (ms) | After p50 / p95 (ms) |
|---|---|---|---|
| 10,000 characters · 63 paragraphs | No subscriber | 10.499 / 11.362 | 0.027 / 0.028 |
| 10,000 characters · 63 paragraphs | Local subscriber | 10.700 / 11.438 | 0.243 / 0.707 |
| 100,000 characters · 625 paragraphs | No subscriber | 117.287 / 173.969 | 0.091 / 0.104 |
| 100,000 characters · 625 paragraphs | Local subscriber | 115.373 / 135.459 | 0.703 / 3.245 |

Raw data: `benchmarks/results/2026-10-22-client-before.json`, `2026-10-22-client-after.json`, `2026-10-22-client-after-repeat.json` (the table uses the last file for after values). The first post-fix run overlapped with type checking, so it was repeated separately. Across both post-fix runs, 100,000-character subscribed p50 was 0.70–1.06ms, p95 2.62–3.25ms, and max 16.5–17.3ms. **Do not interpret this as an actual-editor pass or a p95 < 2ms target pass.**

`packages/doc-sync/test/client-edit.test.ts` checks subscription lifetime, paths that avoid full-document reads, equivalence to existing full verification and wire operations, correction paths, existing structural verification, and explicit normalize. Existing random mirror tests remain in use.

Validation: Type checks passed. `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` passed 91/91 in about 153 seconds. For each 2/4-participant × GC off/on configuration, 3000 traces had 0 divergence, mirror mismatch, or receive fallback. GC ran 1500/1091 times and compacted 5899/4027 tombstones. ProseMirror passed 300 traces each with 2/3 participants. All 5 new local tests also passed separately, including the final wire-equivalence assertion. Browser checks were not repeated. Validation record: `benchmarks/results/2026-10-22-client-validation.json`.

### 5.4 Monorepo migration (2026-10-22)

**Structure**: One library, `packages/doc-sync`. Kept `@barocss/doc-sync`, its four public entry points (default, sync, server, prosemirror), and existing `private: true`. Root is a private npm workspace. Demo `apps/demo` and benchmarks `benchmarks` are separate private workspaces. Shared schema: `fixtures/demo-schema.ts`. See §2 for the tree. No Git initialization, commit, push, or deployment was performed at this stage.

**Execution**: Requires Node 22.18 or later; validated with 22.19.0. Install from root, then use these commands. Kept the existing npm registry and lockfile. External dependency versions and integrity values did not change.

| Root command | Scope |
|---|---|
| `npm run dev` | Demo server (default 5410, root data/) |
| `npm test` | Library and demo tests |
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Expanded collaboration/PM and demo tests |
| `npm run typecheck` | All library, demo, benchmarks, and fixtures |
| `npm run bench -- --out-dir results/new-folder` | 10,000/100,000-character measurement, output relative to benchmarks |
| `npm run bench:client -- --label current --out results/new-file.json` | Local-client paths; fails if output already exists |

Direct workspace examples: `npm test --workspace @barocss/doc-sync`, `npm test --workspace @doc-sync/demo`, `npm run typecheck --workspace @doc-sync/benchmarks`. Root dev/bench commands forward trailing arguments. Direct server execution derives ROOT from the file location, so cwd does not change log location. Isolated validation uses `DATA_DIR=/tmp/doc-sync-demo-check PORT=5411 npm run dev`.

**Preservation checks**: At migration time, SHA-256 hashes of 18 CRDT/sync/server/PM source files and 8 existing data JSONL files matched the originals. Six existing raw measurement files were byte-identical. Receipt: `benchmarks/results/monorepo-2026-10-22/migration-source-receipt.json`. It records the monorepo baseline **before** the later Presence change. Original backup: `/tmp/doc-sync-monorepo-20261022/before.tgz`. Data was hashed, not moved.

**Validation**: 91 default library tests passed. Expanded post-migration tests also passed 91 (3000 traces for each 2/4-participant × GC off/on setup, 0 mirror mismatch/divergence/receive fallback; 300 PM traces each for 2/3 participants). The final 6 demo tests and all type checks passed. The root expanded command first ran 2 demo HTTP tests. The final 6 demo tests, including 4 new reset/guard regressions, were checked separately. Package dry-run included only 19 library files (18 source + package.json). Demo, fixtures, benchmarks, and data were excluded. Offline workspace-link installation passed. An additional npm ci in a separate empty folder did not finish and was stopped; this is not evidence of successful fresh-download installation.

**Browser validation**: Used a copy of original data in a separate DATA_DIR. Concurrent Enter at the same position in a new empty document converged to two paragraphs. Concurrent row/column insertion converged to 3×3. PM column insertion converged to 2×4 in A, P, and server. Undo and GC matched; GC compacted 6 tombstones. Three frames queued 10/12/13 offline changes. After reconnection, pending was 0 and all matched server fingerprint `6100260f`. New console errors: 0. Record: `output/playwright/monorepo-browser-validation.json`; screenshots are in the same folder.

Browser checks found an existing reset race, fixed only in the app. A new document already has serverSeq 0. Waiting only for seq0 after reset could seed before the actual reset. Seeding now waits for actual reset events from every participant and observer. Manual reset and scenarios share a guard to prevent duplicate execution. Existing hooks are restored on success, failure, and timeout. A browser double-click on reset also confirmed only one actual reset request. This does not change CRDT operations, convergence, undo, or GC rules.

**Before/after performance completed**: Node 22.19.0, same seed 1, 10,000/100,000-character traces. Compared one pre-migration run with two post-migration runs. Browser and storage tests ended before timing. Other user work was not stopped.

| 100,000-character metric | Before (ms) | Two after runs (ms) |
|---|---|---|
| Core local p50 | 0.047 | 0.046–0.046 |
| Core local p95 | 0.288 | 0.151–0.184 |
| Core receive p95 | 0.100 | 0.095–0.100 |
| Core local max | 35.498 | 28.570–37.541 |
| Local client, subscribed p50 | 0.486 | 0.304–0.321 |
| Local client, subscribed p95 | 2.836 | 1.419–1.509 |

Both runs passed correctness checks. Trace edit count, final character/paragraph counts, wire size, and snapshot size matched before migration. The core 100,000-character saved size was 1,648,279B. Heap was 36,475,960B before and 36,475,960–36,477,376B after. All figures, ratios, and raw data, including 10,000/100,000-character and Yjs comparisons, are in `benchmarks/results/monorepo-2026-10-22/comparison.json`. Existing raw data was not overwritten.

**Interpretation limits**: Several p95 values fell, but some maximum times rose. Core receive max was 32.564ms before and 33.870–39.643ms after. External CPU load and a single baseline run prevent a claim that migration improved performance or made every metric equal or faster. These are core/local-edit measurements before Presence implementation. They exclude screen updates, network, remote model events, long multi-user editing, large tables, and Presence rendering.

**Actual separate work chats**: Browser `01a16256-c5b6-74b1-86c7-e3541bc657f2`, performance `01a16257-2bdc-7113-9069-6ec5f81777ed`, Presence `01a1625d-9368-7020-aeda-5c14eee54797`. All three completed. The main chat handled library, shared settings, final tests, and documentation integration. Migration validation record: `output/validation/monorepo-20261022/validation.json`.

### 5.5 Remote user selection ranges (2026-10-22)

**Cause and fix**: The protocol already sent `anchor` and `focus`. Demo and PM receive-side display ignored `focus`, so only a caret appeared. Both token keys now resolve to current document positions. Their range uses the user's color. The named caret stays at the active end. Reverse selection shows the same range; a collapsed selection shows only the caret. Presence-only updates do not change document content. Wire form and public API are unchanged.

- **PM**: `packages/doc-sync/src/pm/binding.ts` creates inline decorations and caret widgets. Supports multi-paragraph and full-document selection. Overlapping participants use nested spans to retain each color. Classes: `pm-remote-selection`, `pm-remote-caret`. Binding sets range backgrounds. Demo `/pm` name/underline styles are in `apps/demo/ui/pm.html`.
- **Demo**: `apps/demo/ui/presence.ts` resolves positions; `editor.ts` draws a translucent range layer per character. Supports multiple paragraphs in one CRDT sequence (slot). Under existing editor selection rules, **ranges across table cells or slots are not painted; only a valid active caret is shown**. Styles: `style.css`.
- **Endpoints**: Deleted character tokens in visible sequences use existing left-position resolution. Deleted columns and covered merged cells are excluded before position conversion, preventing incorrect painting of neighboring cells. A missing/hidden active end hides everything. A missing/hidden opposite end leaves only the valid caret.
- **Disconnection**: Local offline hides remote ranges/carets. Normal SSE closure and window closure use existing server leave events to remove remote display. Checked actual received leave, empty presence in server hello, offline peer, and 0 remote DOM elements together. Sudden network loss racing with an in-flight presence POST was not reproduced.

**Tests and browser**: Added 6 PM and 4 demo regressions. They cover forward/backward/collapsed selection, multi-paragraph/full selection, post-edit tracking, invalid endpoints, deleted/merged cells, overlap, leave, and local offline. Related 23 tests and all type checks passed. All 14 real-browser cases passed too. Selections and edits used keyboard/mouse input; checks read POST, SSE, server state, and DOM. No app runtime errors appeared beyond the existing favicon 404.

**Final integration tests**: After source edits ended, reran `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` with Node 22.19.0. Library **97/97**, demo **10/10**, total **107/107**, 0 failures, about 147 seconds. Each 2/4-participant × GC off/on configuration ran 3000 traces with 0 divergence, mirror mismatch, receive fallback, or server rejection. GC ran 1500/1091 times and compacted 5899/4027 tombstones. PM passed 300 traces each with 2/3 participants. Root `npm run typecheck`: 0 errors. Full logs and final hashes: `output/validation/presence-20261022/validation.json` and logs in that folder.

Browser raw data and 7 source hashes: `output/playwright/presence-validation.json`; screenshots: `presence-*.png` in the same folder. Validation used `DATA_DIR=/tmp/doc-sync-presence-20261022`, port 5412. Server and browser were closed. The migration validation server on port 5411 was also stopped. Existing 8 data files are unchanged. The only library change after Presence implementation is `pm/binding.ts`. CRDT, SyncClient, protocol, server, History, and GC source match the pre-migration baseline. §5.4 does not measure Presence rendering cost.

### 5.6 Fixing 22 IME/caret failures in the comparison demo (2026-10-22)

**Causes**: Slate restored numeric offsets and paragraph paths unchanged, producing wrong positions after remote insertion/deletion/split and format-leaf splitting (7). Lexical lost selected node keys when replacing the root (8). Slate and Lexical replaced composing DOM, damaging input (3 each). PM duplicated input when remote insertion shared the composition boundary (1). Total: 22. Additional table tests also found 2 PM caret errors after row/column insertion.

**Fix**: `apps/demo/compat/input-session.mjs` stores both selection ends as token IDs and restores native-document paths/UTF-16 offsets. Composition edits a CRDT draft with the same participant ID. The live client continues receiving remote changes while the composing editor's display stays intact. On completion, operations retain the draft's original token IDs and origins and are applied/sent through the real document. This prevents stale-model comparison from deleting remote text. One undo/redo covers the whole composition. Draft operation numbers are reserved in the live clock and reserved again after reconnection, preventing collisions with undo. Omitted model events for identical snapshots and empty-document reset are handled too.

**Rules and scope**: This commit changes only comparison-demo bindings. CRDT order, same-position Enter, wire form, SyncClient, History, GC, and public PM binding are unchanged. It does not establish that default `/pm` IME is fixed. Remote display is deferred during composition until completion; cloning the document at composition start has a cost. Do not extend this result to performance improvement or OS Korean keyboard validation. Parallel performance source and measurement results are excluded from this commit.

**Integration validation**: On an independent copy of committed core, `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` passed 113/113 and compat passed 31/31. All type checks and compat build passed. Chrome CDP composition checks passed original diagnostics 36/36, extended input 33/33, table input 12/12, empty-document reset 3/3: input total 84/84. Also checked 20 general editing regressions and 30 operation traces. Every diagnostic `status` was inspected; process exit codes alone did not determine passes.

Cause records and execution instructions: `apps/demo/compat/README.md`. Original browser work report: local `output/playwright/editor-compatibility/input-fixed/report.html`. Additional integration tests, source hashes, and comparison against the original 22 failures: local `output/validation/ime-cursor-fix-20261022/validation.json`. For reruns, follow installation, build, server, and Chrome scripts in the comparison demo README.

### 5.7 Sequential roadmap execution (2026-10-23, pre-integration measurements)

**Measurement baseline**: Included model/paragraph-DOM reuse WIP from another task above then-HEAD `8d0f887`. Froze initial diff/hashes and measurement copies first. Existing `editor.ts`, performance report, and model-cache tests retained their hashes. `doc.ts` also matched starting WIP except for this task's large-string addition. There is one Git working tree. Source was uncommitted during measurement. §5.8 records final integration scope, including these changes and existing WIP.

**Implementation**:

- `sync/model-events.ts`: Narrows only text/del/set in one live, visible text block. A text ID must be ahead of the previously observed clock. Old concurrent insertions can pass other markers after their origin, so they retain the full path. Structure, multiple blocks, new-token dependencies, virtual blocks, hidden cells, undo/redo, and undel also retain the full path. Narrow events map back to original paths and receive block-level verification. Failure uses existing whole-document replacement fallback.
- `Doc.apply(text)`: For strings longer than 256 UTF-16 units, clears the affected sequence's block/position caches once. It avoids copying growing arrays per character. Stored IDs, RGA order, formatting, wire form, and GC remain unchanged.
- `History.idsOf`: Counts strings in UTF-16 units so both emoji tokens enter undo history. Other actors' text and deletions remain intact. The difference between model code-point positions and stored UTF-16 positions remains a separate limitation.
- `PmBinding`: Reuses internal models and PM documents for the same Doc object/version. A replacement Doc is reread even with the same version. Selection/presence calculations and callbacks remain. Related 19 tests passed, including cache, multiple Steps, reentrancy, hidden cells, snapshot/reset, draft replacement, and 300 random PM traces. Composition input rules did not change.
- Added `docs/spec.md`, 6 property tests, an 8-participant long-run harness, and nightly CI. CI uses 8 shards with at least 125,000 wire Ops each. It starts new document batches of about 512 Ops. This does not establish one million accumulated operations in a single document, disk-failure handling, lease-expiry recovery, actual GitHub execution, or two-week observation.

**Receive performance**: Used the same single-character trace at 10,000/100,000 characters, 160 characters per paragraph, 5 warmups, and 30 measured samples. Interval: server-event receipt through `onModelEvents` callback completion. Mirror application, network, and DOM are excluded.

| Initial characters | Before p95 | After p95 | Full model reads per event |
|---|---:|---:|---:|
| 10,000 | 20.253ms | 0.781ms | 2 → 0 |
| 100,000 | 186.249ms | 1.174ms | 2 → 0 |

In every sample, applying events to the previous mirror matched sender and receiver models. Fallback: 0. External load was not guaranteed equal. This is not product SLO approval. Raw data and reproduction harness: `benchmarks/results/roadmap-2026-10-23/remote-events/`, `benchmarks/remote.ts`.

**One large paste**: Before the change, the 100,000-character case did not complete within 120 seconds. Afterward, the same case completed with local 128.358ms, remote 113.309ms, and snapshot + first model opening p95 235.161ms (5 runs). Models matched. One local/remote insertion is not a distribution. Do not calculate a speedup ratio from the timeout. Alternating smaller-size measurements and CPU evidence are also preserved in the new results folder.

**Test timing**: Default tests including large strings and PM cache passed core 138 + demo 10. Expanded `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` immediately before the large-string addition passed core 128 + demo 10. Later checks covered focused large-string/cache/receive regressions, 300 PM traces, and current-source default tests. Compat 31 and type checks passed. Local long-run tests passed 1,000,021 wire Ops across 8 shards with 8 replicas each. Do not combine counts from different source states and call them one expanded run.

**Chrome**: Before the PM cache and on final source, checked CDP input 84, general regressions 20, and operation traces 30 each. Final-source record: `output/playwright/roadmap-pm-cache-20261023/summary.json`. The original empty-document reset test timed out once. HEAD control and current original repeat passed. The cause was not confirmed as a product regression. Tests added waiting for actual reset receipt by all 5 EventSources, retaining final Z, native/client/server equality, and pending/failures checks. This is separate from actual OS Korean keyboard validation.

**Actual screen and long-run observation**: Before PM cache, headless screen p95 was 270.0/271.6ms and headed p95 was 573.2/361.2ms. These modes are not directly comparable. After PM cache, headed p95 was 291.0ms demo→PM and 259.8ms PM→demo. All 70 inputs, including warmups, had matching final models, pending 0, and fallback 0. Before runs had much higher external load and overlapped our long-run tests. After runs followed our long-run tests, but external apps continued. Do not attribute the reduction solely to caching. Raw data: `output/playwright/roadmap-latency-20261023/`, `output/playwright/roadmap-latency-headed-20261023/`, `output/playwright/roadmap-latency-pm-cache-20261023/`. Hundreds of ms of screen latency remain; product targets have not passed. The original stage 0 observation lasted 1,800,060ms wall-clock. Last persisted convergence was 1320 rounds/5280 edits for 4 replicas per engine. The 1800-round/1Hz target was incomplete. Exact in-memory completed rounds and timer delay at interruption are unknown. Do not mark the long-run trace passed. Final integration report: `benchmarks/results/roadmap-2026-10-23/integration-report.md`. Local validation summary: `output/validation/roadmap-execution-20261023/`. Distinguish local evidence under `output/` from Git-tracked measurement summaries.

```sh
npm run remote --workspace @doc-sync/benchmarks -- --out results/new-remote.json
npm run stage0:freeze --workspace @doc-sync/benchmarks -- /tmp/new-stage0-receipt
node packages/doc-sync/test/long-fuzz.ts --ops 1000 --peers 8 --seed 23 --out output/long-fuzz/new-smoke.json
```

See `docs/roadmap-status.md` for stage decisions and `benchmarks/stage0/README.md` for measurement setup/execution. This run does not complete the roadmap or approve production operation/deployment.

### 5.8 Final checks before main integration (2026-10-23)

**Scope**: Integrate uncommitted changes above `8d0f887` together. Includes another task's `Doc` model cache, demo paragraph DOM reuse, model-cache tests, and existing performance report/raw data. Tested together with receive comparison, large strings, Unicode undo, PM cache, specifications, and long-run CI changes. Existing concurrent Enter, RGA, participant-specific undo, wire, GC rules, and public entry points remain. Ignored local files such as `data/`, `node_modules/`, and `output/` are excluded. Original measurement patches/log whitespace is preserved. `.gitattributes` excludes only raw `benchmarks/results/` data from whitespace warnings; product-source checks remain.

**New final tests**: Reran the following with Node 22.19.0. Product source was unchanged after testing began.

| Item | Result |
|---|---|
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Core 138 + demo 10 passed, 0 failures; current source includes large strings and PM cache. |
| `npm test --prefix apps/demo/compat` | 31 passed, 0 failures |
| `npm run typecheck` | 0 errors |
| Compat bundle in a separate output folder | Passed; separate from a release-library build. |
| Stage 0 harness tests | ours/Yjs 6 passed; 8 with the public Yorkie SDK. |
| Chrome 156.0.8078.47 | CDP input 84 + general regressions 20 passed; 30 operation traces checked; 0 failures. |
| 8-replica long-run harness smoke | 1,001 accepted wire Ops passed. |

Reused existing local 8-shard/1,000,021-wire-Op results after matching relevant source hashes. The full million-Op test was not rerun for this final check. All 7 relevant source hashes for §5.7 screen measurements also match. This is not a new performance measurement. Screen p95 291.0/259.8ms, the 30-minute trace's missed 1800-round/1Hz target, unapproved G0/G1, and unverified actual OS IME/production/two-week CI remain open.

Git-tracked final summary and source hashes: [`main-validation.json`](benchmarks/results/roadmap-2026-10-23/main-validation.json). Logs and Chrome originals are local in `output/validation/main-push-20261023/` and `output/playwright/main-push-20261023/`. The commit includes this final summary and documents. Confirm the exact integration SHA and remote state with `git log -1` and `git fetch origin main && git rev-list --left-right --count HEAD...origin/main`. Matching output is `0 0`. This integration is not npm publication or roadmap completion.

### 5.9 Improving paragraph model recalculation in screen latency (2026-10-23)

**Baseline and cause**: Started from main `f9370df`. First measured current Chrome at the same 100,000 characters/625 paragraphs. Existing `Doc.toJSON()` reused output only at the same version. After one character changed, the next read recalculated every character, format, and run. Demo status display and PM checks paid this cost. Median time including `toJSON` in the observed screen interval was 118.45/119.55ms by direction.

**Change**: `doc.ts` reuses a raw model per TextBlock. The internal path in `model.ts` uses a WeakMap to reuse normalized text models per immutable raw model. Insert/delete rereads the changed Block. Character formatting on the same Block clears its paragraph cache only for an actual LWW write. Structure, restoration, and GC clear all caches. List grouping and table/flow normalization still run each time. Public `canonical()` and the contract that returned models can be modified remain. RGA, same-position concurrent Enter, participant-specific undo, wire, GC policy, and public exports are unchanged. New tests reduced character/format lookups after insertion from 100,001 to 161.

**Chrome before/after**: Node 22.19.0, Chrome 156.0.8078.47 headed, 1440×1000, DPR 1. Each run/direction used 5 warmups and 30 measured inputs. Used real local HTTP/SSE and JSONL storage. Interval: key-event creation through the second rAF after remote DOM confirmation. This is not physical screen presentation time.

| Direction | Before p95 | Improved p95 | Baseline source rerun p95 |
|---|---:|---:|---:|
| Demo→PM | 246.5ms | 124.1ms | 248.9ms |
| PM→demo | 260.4ms | 120.2ms | 276.5ms |

Observed reductions: 49.7%/53.8%. Checked 210 inputs across three runs, including warmups. Each run's two clients and server models matched; pending/fallback were 0. Median time including `toJSON` fell to 0.85/0.90ms; demo DOM processing stayed near 6ms. External apps remained running. Start→end 1-minute load average was 18.23→26.35 before, 33.92→30.75 improved, and 22.61→23.10 for baseline rerun. Our regression tests and other benchmarks did not run during timing. Source reruns and lookup counts strengthen the evidence, but this is not a statistical experiment with controlled external CPU load.

**Final tests**: Current-source `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` passed core 144 + demo 10, 0 failures. Focused regressions 24, compat units 31, type checks, and separate compat bundle build passed. An additional 8-replica harness passed 10,007 wire Ops. Chrome passed 30 paragraph-DOM/polling/formatting/undo/redo/structure/table/container/Presence cases, comparison-demo CDP input 84, and general regressions 20. Operation traces 30 were checked. This is not actual OS Korean IME validation. Earlier million-operation results belong to earlier source and were not reused for this source.

**Remaining scope**: Initial model generation and post-structure/restoration/GC paths still perform full calculation. Returned-model copying, list/table normalization, editor conversion, DOM, request waits, and frame waits remain. Memory targets and latency for large tables, IME, and contended input were not newly approved. G0/G1, the 30-minute 1800-round/1Hz trace, lease-expiry recovery, and actual two-week CI observation remain open.

Raw data, source hashes, before/after calculations, and reproduction conditions: [screen latency report](benchmarks/results/screen-latency-2026-10-23/report.md). Summary: `validation.json` in the same folder. Full test logs/browser originals are local in `output/playwright/screen-latency-20261023/`, `screen-regression-20261023/`, and `screen-compat-20261023/`. Existing user servers/tabs stayed open. Only servers/Chrome created for this task were stopped. No commit/push was performed in this request.

### 5.10 Improving screen Paint/PrePaint cost (2026-10-23)

**Scope**: Preserved §5.9 paragraph-model cache source and additionally changed only demo CSS. Ordinary Changes had no intentional transport-delay timer. Current Chrome traces showed remaining Paint/PrePaint cost. Final rule: `.surface > .blk.paragraph:not(:has(.composing)) { isolation: isolate; }`. It applies only to top-level ordinary paragraphs. Headings, lists, quotes, table/container interiors, and captions are excluded. During composition, isolation returns to existing `auto`. Browsers without `:has()` support ignore the entire new rule. Core, transport, PM, storage, collaboration rules, and public API did not change at this stage.

**Narrowed after finding a regression**: The first candidate isolated all `.blk` elements and changed paint order where a long name label overlapped composing text in the next paragraph. A 155-pixel difference reproduced in the same settled B→A→B state. That candidate was rejected. A 5-pixel callout-boundary difference from an intermediate candidate was also preserved. The final candidate had 0 pixels exceeding an RGB-channel difference of 12 across 13 settled A→B→A comparisons. Cases covered long names outside table cells, overlapping forward/backward ranges, IME previews, images/placeholders, empty paragraphs, lists, quotes, and table/container boundaries. Synthetic composition start/update/end confirmed `auto`↔`isolate` transitions and existing display behavior. This is not actual OS IME validation.

**Final Chrome before/after**: Same as §5.9: 100,000 characters/625 paragraphs, 5 warmups + 30 samples per direction, real HTTP/SSE/JSONL, headed Chrome 156. Interval: key event through second rAF after remote DOM confirmation.

| Direction | Before p95 | Final improved p95 | Final baseline source rerun p95 |
|---|---:|---:|---:|
| Demo→PM | 111.7ms | 69.5ms | 108.1ms |
| PM→demo | 120.4ms | 68.5ms | 121.9ms |

All 210 inputs across the three accepted runs matched models, with pending/fallback 0. One-minute load: before 53.68→40.72; improved 15.62→10.23; baseline rerun 10.50→9.45. External load was uncontrolled. Our tests/other benchmarks did not overlap timing. Separate traces of 3 inputs/direction corrected nested Paint with the union of time intervals per event type. Do not extend this evidence to full 100,000-character repaint, GPU cost, physical display, or pure network latency.

**Final tests**: Expanded tests with the same TypeScript source passed core 144 + demo 10, compat units 31, type checks, and separate compat bundle build. Final CSS passed Chrome basic regressions 30, compat CDP input 84 + general regressions 20; operation traces 30 were checked. Boundary features 10 and separate real bullet overlap passed. Two core concurrent deletion/bold probes matched across both delivery orders and duplicate delivery. Deleting `c` while bolding `bc` leaves final `ab` with only `b` bold.

Full model calculation initially/after structure, returned copying, conversion, DOM, layout, request waits, and frame waits remain. This does not approve G0/G1, product SLOs, large tables/contention/memory targets, lease-expiry recovery, or actual two-week CI observation. Existing user servers, tabs, and data were untouched. Only validation servers/Chrome created for this request were stopped. This change was uncommitted; no commit/push was performed at this stage.

Figures, failed candidates, source hashes, conditions, compressed traces, and validation evidence: [screen Paint report](benchmarks/results/screen-paint-2026-10-23/report.md) and `validation.json` in the same folder. Full local browser records: `output/playwright/screen-next-20261023/`, `screen-next-boundary-20261023/`, `screen-next-main-20261023/`, `screen-next-compat-20261023/`.

### 5.11 Collaboration intent specifications and regression tests (2026-10-23)

**Scope**: Preserved existing uncommitted core caches, demo CSS, documents, and measurements. New changes are `docs/collaboration-intent.md`, `docs/spec.md`, this HANDOFF, and new `packages/doc-sync/test/intent-preservation.test.ts`. Product, History, SyncClient, PM, transport, GC, public API, and collaboration policy are unchanged. Main baseline: `f9370df`. No commit/push at this stage either.

**Specification at that time**: [Collaboration intent rules](docs/collaboration-intent.md) distinguishes convergence from intended document meaning. Deletion/formatting applies to IDs chosen at creation; concurrent new characters do not enter that range retroactively. New input inherits left formatting observed in that Doc at creation. Deletion undo cancels only its own deletion ID. Formatting undo/redo writes a new value only when the current local write Ticket exactly equals that Step's `mine`. Already observed other writes are skipped. Unreceived writes still compete through ordinary LWW. Undo by the winner of same-value writes creates a new write of its observed prior value; it does not reelect the losing value. This choice is not a guarantee to preserve every user's intent.

**41 new regressions**: I01 deletion/formatting/insertion 8; I02 overlapping deletion/insertion 4; I03 preserve observed later format writes 8; I04 same-value winner/loser undo 4; I05 formatting inheritance after observation 2; I06 Bold/Italic combinations 4; I07 insertion undo with another actor's later text/formatting 1; I08 different values for the same key 2; I09 LWW race between unreceived link writes and undo 4; I10 concurrent Enter cancellation 4. Uses actual SyncClient/History/DocHub through MemoryNet. Independent operations are created from the same baseline before varying server acceptance order. Required causal observation order stays intact. Checks initial target IDs, actual server-accepted actor order, fixed full models after every merge/undo/redo, all clients/hub, pending 0, and snapshot reinterpretation. Replica equality alone is insufficient to pass.

**Checked examples**: Starting from plain `abc`, overlapping deletion of `c` and Bold produces `ab`. Deletion undo restores bold `c`. If both users undo their own actions, the result is plain `abc`. A new three-user case also preserves another user's intervening `X`. For independent Bold writes by two users on the same character, winner undo does not promise to display the loser's Bold again. See the case table for observation relationships and step-by-step results.

| New final check | Result |
|---|---|
| Focused new intent-preservation file | 41 passed, 0 failures |
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Core 185 + demo 10 passed; failures/skip/todo 0. Includes existing related tests and all 41 new cases. |
| `npm test --prefix apps/demo/compat` | 31 passed, 0 failures |
| `npm run typecheck` | 0 errors |
| Compat bundle build in a separate output folder | Passed; separate from a library release build. |

**Defect found at that time**: A single actor turning Bold on→off→undo→undo on the same character skipped the second undo and left Bold active. It occurred without another user. Product code was not changed at this stage, and this was not approved as normal intent-preservation behavior. The follow-up fix and verification completed in **§5.12**. Current reproduction commands and expected results: [consecutive formatting regression specification](docs/collaboration-intent.md#5-consecutive-formatting-undo-and-redo-regressions).

Execution logs, initial WIP hash/diff, actual/expected models and Tickets for the limitation, new-test summary, and product-source hashes are local in `output/validation/intent-rules-20261023-_t9kmnrv/`. `validation.json` does not count the separate limitation as passed. This `output/` data is excluded from Git. Specification reproduction commands and regression sources remain in the repository.

Product source was unchanged, so Chrome, OS IME, and performance were not rerun at this stage. Historical §5.9/§5.10 screen evidence retains its source and scope. These 41 fixed ASCII cases are finite tests. They do not prove all intent preservation, every schedule, large tables, all Unicode, GUI input, G0/G1, or roadmap completion. Existing user servers, tabs, and data were untouched.

### 5.12 Fixing consecutive formatting undo/redo (2026-10-23)

**Result**: Bold on→off→undo→undo on the same character returns to plain text. redo→redo restores bold→plain in order. All 3 basic pre-fix regressions failed. All 19 new fixed regressions passed afterward. Earlier WIP and §5.9/§5.10 raw measurements were preserved. This change was also uncommitted above main `f9370df`; no commit/push was performed.

**Cause and fix**: Old `SetStep` stored only the prior value and its own write ID. Undoing a later record created a new Ticket, so an earlier record could not recognize its restored state. `Doc.run` now records the actual previous write Ticket in local `priorOf` metadata. `History` connects before/after state references per token ID and attribute key. It connects them **only within the same History and only when the actual previous Ticket matches exactly**. Successful undo/redo updates the restored state's Ticket and current reference. Undo success is stored separately per target, so redo does not newly write targets skipped by undo.

**Other-user protection**: Skip targets whose Ticket changed through an already observed other write. Protect new same-value writes too. For partial overlap, cancel/restore only the other targets. Do not connect unrecorded writes from the same actor or another History. Restoring a remote value does not revive ownership of an older local history record. Unreceived remote writes and undo retain Ticket LWW competition. I04's rule that winner undo does not reelect a losing write remains. Deletion ledger, target IDs, format inheritance, concurrent Enter, GC pins, wire/snapshot formats, and public exports are unchanged.

**Lifetime and cost**: Connections are local History metadata. Recording looks up current references per target, without scanning all old records. Discarding redo or leaving the depth-100 history reduces reference counts. Clear empties stacks and caches. Retained state is proportional to retained targets. This is not a guarantee of absolute typing-group size or total product memory bounds. Same-value undo targets also accumulate through push instead of repeated array copying. Screen performance was not remeasured for this fix. §5.9/§5.10 figures belong to their historical source.

**New regressions**: HF01–HF18 in `packages/doc-sync/test/history-format.test.ts`; HF07 true/false makes 19 total. Covers repeated undo/redo, multiple writes in one commit, overlapping ranges, different keys, links/block types, remote same/different values and Ticket preservation, same-actor unrecorded writes, independent History, redo discard/clear/depth 100, a new branch for the same key, and partial redo preserving remote writes after undo. Every step checks actual MemoryNet client/hub full models, snapshot reinterpretation, and pending 0. Existing 41 intent tests are unchanged. Updated [collaboration intent rules §2.5/§5](docs/collaboration-intent.md#25-formatting-undo-and-redo-check-currently-known-writes) and [state specification §5](docs/spec.md#5-undo-and-redo).

| Current-source validation | Result |
|---|---|
| New consecutive-formatting focused tests | 19 passed; failures/skip/todo 0 |
| Existing intent-preservation focused tests | 41 passed; failures/skip/todo 0 |
| `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Core 204 + demo 10 passed; failures/skip/todo 0. 3000 traces per 2/4-peer and GC configuration; 300 PM traces each with 2/3 peers. |
| `npm test --prefix apps/demo/compat` | 31 passed, 0 failures |
| `npm run typecheck` | 0 errors |
| Compat bundle in a separate folder | Build passed; separate from a release build. |
| Chrome basic demo/PM regressions | 30 passed: DOM preservation, structure, presence, formatting undo/redo. |
| Chrome focused defect scenarios | 13 steps each in demo/PM, 26 total passed. Actual toolbar buttons exercised consecutive undo/redo and preservation of remote Bold/Italic; DOM and fixed server models checked. |
| Chrome compat input/caret regressions | CDP-based 84 passed; general regressions 20 checked; operation traces 30 captured. |
| Independent review | State linking, remote ownership, reference lifetime, and test quality approved; 0 required changes. |

Ran on Node 22.19.0 and Chrome 156.0.8078.47. Browser input uses CDP composition, not actual OS Korean IME. These are finite regressions, not proof of every delivery schedule, full product performance, G0/G1, or roadmap completion. Used separate servers, temporary data, and named Chrome sessions. Existing user servers/tabs/data were untouched. Validation servers and browsers were stopped.

Local evidence: initial WIP hash/diff, plan, full logs, and `validation.json` in `output/validation/history-format-fix-20261023-r_47r_73/`. Pre-fix 3-failure copy and focused 19-test logs: `output/validation/history-format-20261023/`. Chrome: `output/playwright/history-format-main-20261023/`, `history-format-targeted-v2-20261023/`, `history-format-compat-20261023/`. The first focused browser harness failed due to an ORIGIN substitution error; v2 fixed it and passed 26 steps. That failure counts as neither a product failure nor a pass. `output/` is excluded from Git.

### 5.13 Final checks and main integration of all changes (2026-10-23)

**Integration scope**: At user request, combine all uncommitted changes after `f9370df` into one integration commit. Includes paragraph model caches (`doc.ts`/`model.ts`), ordinary-paragraph CSS isolation excluding composing paragraphs, exact-Ticket-linked consecutive-formatting undo/redo, specifications, and 66 new regressions (model 6, intent 41, format History 19). Preserve both screen-performance reports and raw data. Keep one public library and private demo/benchmarks. Other-user write protection and existing collaboration rules follow §5.12.

**Final checks**: Product, demo, compat, and schema source match all final §5.12 Chrome validation hashes. Expanded tests, compat units, and type checks were rerun for this request. With no product-source changes, reused Chrome results bound to matching hashes. This is not a screen-performance remeasurement. Independent review of changed/added files also found no required changes.

| Final check | Result |
|---|---|
| Node 22.19.0, rerun `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Core 204 + demo 10 passed; failures/skip/todo 0 |
| Rerun `npm test --prefix apps/demo/compat` | 31 passed, 0 failures |
| Rerun `npm run typecheck` | 0 errors |
| Same-source Chrome regression evidence | Basic 30, focused 26 steps, compat input 84 + general 20 passed; operation traces 30 captured. |
| Same-source separate compat bundle | §5.12 build-pass evidence remains valid. |
| Measurements | Preserved all 654 raw files in two folders. Total new files 658, about 17.7MB; largest about 1.34MB. |
| Diff/commit scope | No whitespace errors. `data/`, `node_modules/`, `output/`, `.omx/`, and `.playwright-cli/` remain untracked/ignored. |

**Records**: Initial full-file hash/diff, test logs, final validation, and Git results for this rerun are local in `output/validation/final-main-20261023-g24jae92/`. Chrome evidence follows §5.12 `validation.json` and browser folders. Local outputs are excluded from Git. Measurements in both `benchmarks/results/screen-*-2026-10-23/` folders, specifications, and regressions are included.

**Git reference**: The commit containing this section is the full integration unit. Use `git log -1 --oneline` to get its ID. Remote: `https://github.com/barocss/doc-sync.git`; target: `main`. After push, check remote main ID, local HEAD, and working-tree state, and save them in the local Git results above. Uncommitted labels in §5.9–§5.12 and performance reports describe their execution-time state. Integration does not replace raw measurements or source hashes with new results.

Actual OS IME, screen-performance remeasurement, product G0/G1, lease-expiry recovery, and full roadmap exit criteria are separate from completing this commit/push. Preserve existing user servers, tabs, and data.

### 5.14 Roadmap priority: remote comparison of multiple text blocks (2026-10-23)

**Choice and result**: Reviewed stage0 evidence and remaining roadmap work. G0/G1 and product targets remain unapproved. Following the safe single-block optimization's validation method, first narrowed comparison of multiple text blocks without structural changes. Product changes are only `packages/doc-sync/src/sync/model-events.ts` and `client.ts`. Measurement baseline main was `6f15291`; changes were uncommitted then. No commit/push occurred in that implementation request. Follow-up final checks and main integration are in §5.15.

**Safe scope**: If one Change's text/del/set affects at most 8 independent TextBlocks, verify all targets/paths before reading before-models. Apply CRDT operations once, then emit one model-event callback after per-block diff/verification. An entirely no-op Change adds neither callbacks nor stats. If verification fails for a later block, discard earlier partial events and emit full-replacement fallback. A ninth block, structure, node/undel, old insertion, new-token dependencies, marker/inline target changes, dead/missing targets, and hidden/virtual blocks retain the full path. Undo/redo, snapshot, and reset also remain. RGA, token IDs, concurrent Enter, format inheritance, History, deletion ledger, LWW, GC, transport, and public exports are unchanged.

**Preventing regressions on wide changes**: The first unbounded candidate searched blocks per target. A single 100,000-character full-Bold diagnostic slowed from 264.4 to 1819.9ms. Even with reused block membership, rebuilding 625 before-models cost about 325–362ms in repeated diagnostics, versus baseline about 250–264ms. Both candidates were rejected. Final implementation adopts the measured 1/2/8-block scope and returns to the full path immediately on the ninth new block. Eight is not a globally optimal threshold or a guarantee against regression in every document. Repeated targets in one block do not increase the count. From the second block, membership reuses actual marker/chars only within the call and excludes aliases. The first block keeps the existing search.

**Final before/after measurements**: Node 22.19.0, 10,000/100,000 characters, 160 per paragraph, 1/2/8 changed blocks, insertion/deletion/formatting: 18 cases. Same harness ran before→final improvement→baseline-copy rerun. Each case used 5 warmups + 30 samples. Across 3 runs: 1890 inputs, 1620 measured samples. All inputs matched independent expected models, event mirrors, and actual sender/receiver models, with fallback 0 and one callback. Safe 2/8-block full-model reads changed 2→0; one block stayed 0→0. Actual import paths and source hashes distinguish frozen baseline from current source.

| 100,000-character receive p95 (ms) | Before | Final improvement | Baseline rerun |
|---|---:|---:|---:|
| 2-block insertion | 41.859 | 1.739 | 34.127 |
| 2-block deletion | 31.330 | 1.653 | 51.707 |
| 2-block formatting | 46.928 | 1.694 | 34.372 |
| 8-block insertion | 36.132 | 5.700 | 38.242 |
| 8-block deletion | 44.818 | 6.410 | 61.063 |
| 8-block formatting | 40.954 | 3.917 | 33.578 |

Metric: **synchronous receive through model-event callback completion**. Excludes mirror application, PM conversion, network, server, DOM, and screen. Not every small case became faster; raw data retains external-load and short-sample variation. Final full-Bold diagnostic was 240.9ms with 2 full reads. Single-paragraph 100,000-character insertion was 239.8/239.5/236.9ms for before→improved→baseline rerun, with 0 full reads. These diagnostics each have one sample, so they are not p95 or SLO evidence. Initial block lookup/path calculation and temporary memory proportional to selected block sizes remain. A limit of 8 blocks is not a character-count or product-memory bound.

| Current-source tests/review | Result |
|---|---|
| New multi-block + existing remote regressions | 29 + 9 = 38 passed. Baseline's first 2-block case failed because 2 full reads ≠ expected 0. |
| Expanded `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Core 233 + demo 10 passed; failures/skip/todo 0 |
| Compat units / type checks / separate bundle | 31 passed / 0 errors / build passed |
| Stage0 harness | Ours/Yjs configuration 6 passed. Yorkie excluded this time. |
| Chrome basic + new focused | 30 + 10 steps passed. Real HTTP/SSE multi-paragraph insertion/deletion/formatting, PM range formatting, undo/redo, preserved remote same-value writes, and no-op callbacks. |
| Compat Chrome | Input/caret 84 + general regressions 20 checked; operation traces 30 captured. |
| Independent review | Architecture, security boundary, product/measurement quality approved; 0 required changes. |

New fixed tests cover 2/8/9 blocks, cross-block IDs in one set/del, overlapping ranges/different keys, lists/containers/table cells/inline/Unicode, partial/full LWW no-op, exclusion in the last operation, absorbed aliases, real server AB/BA acceptance, other-user Tickets, and undo/redo. They verify full diff application, fixed models, snapshots, callbacks, and stats together. The 32-paragraph/5120-target case uses the full path. Membership searches were 204, below the 10240 bound, with no timing assertion. Existing intent 41 and History 19 tests remain.

**Validation limits and tool fixes**: The branch forcing verification failure in a later scope was not executed; it received static review only. Normal fallback 0 and full-path exclusion tests are not evidence of that branch's execution. Chrome is 156.0.8078.47. CDP composition is not actual OS IME validation. The basic demo does not subscribe to model events; PM does. The first focused harness wrongly assumed both subscribed and timed out. V2 checked actual subscription state and passed basic 30 + focused 10 steps again. Diagnostic source copies retain content hashes as `.ts.txt`, keeping them outside root type checks.

**Data**: [Full report/reproduction](benchmarks/results/remote-multiblock-2026-10-23/report.md), `comparison.json`, `validation.json`, `source-stages.json`, raw data, candidate code, and baseline archive share that folder. `after.json` is the rejected unbounded membership candidate; final data is `after-bounded.json`. Local runs/reviews/initial hashes: `output/validation/roadmap-next-20261023-65yw9nr4/`. Chrome: `output/playwright/roadmap-multiblock-main-v2-20261023/` and `roadmap-multiblock-compat-20261023/`. Existing data was not overwritten. Existing user servers/tabs/data stayed intact; only task-created validation servers/Chrome were stopped.

This task reviewed existing stage0 gaps but did not newly complete Yorkie timeouts, real edit traces, a new 30-minute 1800-round/1Hz run, comparable memory/GC/wire evidence, or product targets. G0/G1, lease-expiry recovery, actual two-week CI observation, and the full roadmap remain incomplete. Next priority: **measure and improve current full-recalculation costs after structural changes**, followed by **the lease-recovery contract**. Stage0 exit evidence and long-run observation also remain.

### 5.15 Final checks and main integration of multi-text-block remote comparison (2026-10-23)

**Integration scope**: At user request, combine all uncommitted changes after `6f15291`, including this section, into one commit. Product changes are two files: SyncClient and model-event scope calculation. Compare at most 8 safe independent TextBlocks; a ninth block or existing exclusion retains the full path. Also includes 29 new regressions, changed expectations for safe multi-block cases in existing remote tests, expanded measurement harness, raw data from final/rejected candidates, and document updates. Existing CRDT, History, collaboration rules, and public exports remain.

**Final recheck**: At request start, all 10 product/test/harness/document hashes matched the §5.14 validation receipt. Reran expanded tests, compat, Stage0 harness, and type checks. Product source matched, so reused Chrome and separate compat-bundle results bound to current hashes. These are not newly executed browser, screen-performance, or 30-minute trace results.

| Final check | Result |
|---|---|
| Rerun `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` | Core 233 + demo 10 passed; failures/skip/todo 0 |
| Rerun compat units | 31 passed, 0 failures |
| Rerun Stage0 harness | Ours/Yjs 6 passed. Yorkie excluded from this run. |
| Rerun `npm run typecheck` | 0 errors |
| Existing same-product-source focused/Chrome evidence | Remote 38, Chrome basic 30 + new 10 steps, compat 84 + general 20 checked; operation traces 30 captured. |
| Performance data | §5.14 raw data, source archive, and rejected candidates preserved unchanged. Final figures use `after-bounded.json`. |
| Commit scope/diff | All intended changes included; no whitespace errors. data, node_modules, output, OMX, and browser temporary files remain excluded. |

Local recheck data: `output/validation/multiblock-main-20261023-48lwejwm/`. Includes initial full-file hash/diff, retest logs, `validation.json`, staged manifest, and `git-result.json`. Locations/limits of existing measurement/browser data follow §5.14. Raw data under `benchmarks/results/remote-multiblock-2026-10-23/` is committed; `output/` is excluded.

**Git reference**: The commit containing this section is the integration unit. Use `git log -1 --oneline` for its ID. Target: main in `https://github.com/barocss/doc-sync.git`. After push, verify actual remote main, origin/main, and local HEAD IDs match, check working-tree state, and save results above. Uncommitted labels in §5.14 and the report describe their execution-time state. Integration does not alter historical measurement-source hashes or results.

Costs for 9+ blocks, structure, and undo/redo; lease recovery; Stage0 exit evidence; product targets; G0/G1; and actual long-run CI observation remain. Follow §6 priorities for the next implementation unit.

### 5.16 Improving paragraph recalculation after structural changes (2026-10-23)

**Result and scope**: Baseline main: `10dfd86`. Improved the path where one structural change discarded paragraph models for every sequence. Product change: only `packages/doc-sync/src/crdt/doc.ts`. Full remote structural-event comparison/verification, same-boundary concurrent Enter absorption, RGA, IDs, wire form, LWW, deletion ledger, per-user undo/redo, and GC policy remain. Public API is unchanged. No commit/push in this request.

**Cache updates**:

- Actual node insertion, deletion/restoration that changes live status, and winning node-attribute writes clear the affected sequence's block/position caches. Rows/columns update the parent sequence containing the table.
- Visibility clears its entire cache to account for parent, descendant, and hidden-cell dependencies. GC still clears all caches.
- Structural sequence boundaries use the existing full scan. Reuse paragraphs/models only when the previous cache's nonvirtual text block matches in marker, type, attributes, character order, and absorbed markers. Retain only one previous cache per sequence; release it during recalculation.
- Character/inline attribute writes while recalculation is pending also invalidate previous paragraph models. List/table/flow normalization and returned-model copy contracts remain.

**Core before/after**: Node 22.19.0; main text 10,000/100,000 characters + 600 nested characters; 6 structural cases. Measures synchronous receive through model notification, excluding network/DOM. Each case uses 5 warmups, 30 timing samples, and 2 separate formatting-instrumentation runs. Preserved 1080 timing samples and 1332 Change verifications across original/final/original-repeat. Results at 100,000 characters:

| Case | Original p95 ms | Final p95 ms | Original rerun p95 ms | Final formatting lookups |
|---|---:|---:|---:|---:|
| Body split/merge | 169.830 | 63.493 | 198.613 | 160 |
| Container split/merge | 292.377 | 62.117 | 179.840 | 120 |
| Body type change | 160.939 | 115.216 | 160.756 | 160 |
| Cell split/merge | 183.373 | 46.512 | 156.163 | 120 |
| Table row add/delete | 214.140 | 72.644 | 162.050 | 0 |
| Cell merge/split | 226.743 | 101.239 | 167.302 | 0 |

Original formatting lookups were 100,600 in every case. Fixed EditOp expected models, receive-event mirrors, sender/receiver models, and fresh snapshot interpretation all matched. Full boundary scans within the same sequence, full-model comparison, copying, and table normalization remain. These values are not screen latency or a product SLO decision.

**Chrome before/after**: Chrome 156.0.8078.47, headed `/pm`, 100,000 characters/625 paragraphs. Alternated actual Enter and Backspace. Each direction used 6 warmups and 30 timing samples. Interval: key timestamp through expected DOM on both sides and the second rAF. Preserved 240 timing samples and 48 warmups across 4 runs. Checked trusted events/expected DOM for every sample, fixed final models, two-client/server convergence, pending 0, and fallback 0 at each run's end.

| Direction | Original p95 ms | Modified p95 ms | Original rerun p95 ms | Modified repeat p95 ms |
|---|---:|---:|---:|---:|
| Demo→PM | 601.7 | 771.1 | 605.2 | 467.3 |
| PM→demo | 598.0 | 435.5 | 553.3 | 452.9 |

Medians fell in both modified runs. The first modified demo→PM p95 regression remains part of the result. Its last 6 samples were 628.6–775.7ms; this instrumentation did not isolate the cause. External load also differed. Do not confirm CPU/GC as the cause or claim screen p95 always improved. Screen tail latency and full structural comparison/copying/conversion/DOM costs remain performance follow-ups.

**Validation**:

| Item | Result |
|---|---|
| New structural-cache regressions | 13 passed: positions, visibility, fresh snapshots, hidden cells/parents, attributes during pending cache refresh, duplicate/lower Tickets, concurrent Enter representative replacement, undo/redo preserving other users' text/formatting. |
| Final expanded tests | `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: core 246 + demo 10 passed; failures/skip/todo 0. |
| Comparison-demo units | 31 passed |
| Stage0 Ours/Yjs | 6 passed. Yorkie excluded from this run. |
| Type checks | Passed |
| Chrome basic/nested/Presence/multi-text-block | 40 steps passed |
| Chrome compat and bundle | Separate bundle built. Input 84 + general regressions 20 (convergence 18, probe 2) passed. Confirmed 30 captured operation traces. CDP composition; actual OS IME is separate. |

Raw data, execution source, hashes, original archive, and detailed limits: `benchmarks/results/structural-cache-2026-10-23/report.md`. Command: `node benchmarks/structure.ts --chars 10000,100000 --out /tmp/new-structure.json`. Reproduce Chrome traces with the report's `browser/measure.py`. Final logs: `output/validation/structural-cache-20261023/`; screenshots/JSON: `output/playwright/structural-cache-20261023/`; basic/compat regressions: `output/playwright/structural-cache-{main,compat}-20261023/`. Git-excluded evidence exists only on this computer.

The report separates early trace/test-API/type-display errors and the first Chrome run that an agent stopped early. Only completed measurements appear in final tables. Existing data was not overwritten. User servers, tabs, and data stayed intact. Validation servers/Chrome created for this task were stopped. Lease recovery, production operation, schema evolution, actual OS IME, G0/G1, long-run CI observation, and the full roadmap remain incomplete.

### 5.17 Final integration checks for the structural cache change (2026-10-23)

At the user's follow-up commit/push request, combined §5.16 product changes, 13 regressions, benchmarks, measurement evidence, and documents. Baseline main: `10dfd86`. Confirmed all 26 source and 32 result hashes from final validation matched. Separate read-only review found no user-data, secret-file, or out-of-scope changes. Hash matching confirmed existing final evidence: expanded core 246 + demo 10, compat 31, Stage0 Ours/Yjs 6, type checks, compat bundle, Chrome basic 40, input 84, general 20, and operation traces 30. Focused structural-cache/remote-model-event/model-cache tests 54 and type checks also passed again.

Uncommitted labels in the report and §5.16 describe measurement-time state. This follow-up request authorizes main commit/push. Exact commit SHA and push confirmation are recorded under `output/validation/structural-cache-commit-20261023/`. The documentation site will follow in a separate commit under `apps/docs`. The first Chrome demo→PM p95 regression and unresolved cause remain explicit.

### 5.18 English documentation and GitHub Pages (2026-10-23)

The structural-cache work in §5.16–§5.17 was committed and pushed to main as `baead96d740a3cbda2a4a70429c09622fb0c874c`. This follow-up adds a separate private workspace, `apps/docs`, while retaining one library package and its four exported entry points. Public documentation URL: **https://barocss.github.io/doc-sync/**. The user made the repository public, requested public documentation, and selected GitHub Pages. Pages is configured with GitHub Actions as its source. The workflow builds and checks pull requests; successful main builds deploy only `apps/docs/dist` with the Pages artifact and OIDC actions.

All 30 previously tracked Markdown/HTML documents were reviewed for English: 26 were translated or updated, and 4 already-English files remained byte-identical. README, this HANDOFF, specifications, design notes, roadmap pages, and benchmark reports now use English prose. Literal Unicode/IME fixtures remain unchanged. Raw benchmark JSON, measured source snapshots, archives, original manifests, test sources, and measurements were not translated or remeasured. `docs/translation-provenance-20261023.json` records the original and current document hashes and the immutable benchmark-file check (1,011 non-Markdown/HTML files matched the source commit). Historical receipts retain their original document hashes; they are not claims about translated document bytes. Seventeen translated heading links were repaired; seven historical local source links now point to the measured Git commit. Illustrative output-path placeholders now use English.

The site includes schema definition, all nine shapes, model editing, synchronization, presence, ProseMirror, Slate, Lexical, API design, the wire/state specification, collaboration intent, status, and performance limits. The block guide has 11 executable examples: text split/merge/type/attributes, direct EditOps, lists, nested callouts, table axes, merged/hidden cells, inline images, value-mark links, atoms, schema restrictions, and fixed concurrent-Enter expectations. They execute against the real workspace package. The primary interface is `doc.edit()` with current model paths for text, blocks, lists, containers, rows, cells, and spans. `commands` remains an optional wrapper layer; it is not a separate editing engine. The long example schema can be expanded only when needed. Slate/Lexical examples use the tested private compatibility adapters and disclose their fixed demo schema, full-document replacement, selection, history, and composition requirements. No `SlateBinding` or `LexicalBinding` export was added. Public extraction requires a separate lifecycle/schema/input acceptance scope; it is not needed to make these examples available.

The app pins VitePress `2.0.0-alpha.20` (a prerelease). Stable `1.6.4` was rejected after development-tool dependency audit findings. The selected toolchain has 0 npm audit findings; existing dependency versions are unchanged. VitePress preview ignored the host flag and printed port 0 literally, so the app uses Vite static preview with explicit loopback binding. The schema guide correctly distinguishes boolean-mark inheritance from opt-in value-mark inheritance. Authoritative `docs/spec.md`, `docs/collaboration-intent.md`, and `docs/edit-api.md` are copied to ignored reference pages at build time. HANDOFF and local validation logs are not site pages.

Fresh checks: library 246 + demo 10 + documentation 22 passed with default random seeds (the initial site had 14 documentation tests; generated diagrams add 8); type checking passed. Documentation checks verified 18 HTML pages and 742 internal links/assets/fragment targets, including relative and same-page URLs, English rendered prose, and absence of local paths or hosting credentials. Repository Markdown links passed 117 local-target checks. The first expanded build found a missing editing-API reference, then the asset check found the favicon in the wrong source directory; both were corrected. The first code-copy browser assertion expected the wrong first code block; the assertion was corrected to compare the actual displayed block. These initial failures are retained in local logs.

Chrome desktop/mobile/search passed. The final model-path guides, collapsed schema disclosure, and 390px mobile layout also passed a focused Chrome recheck. The first GitHub Actions deployment passed for `e050aa6db30f848aa521de1e5f44d7230210446b`: https://github.com/barocss/doc-sync/actions/runs/39971334761 (build 27s, deploy 11s). Eight anonymous production HTTP checks passed, including the model-path guide, block guide, Slate/Lexical, references, and SVG icon. Actions reported upstream Node 20→24 action-runtime deprecation notices and an ubuntu-latest image migration notice; neither failed the run. At the user's follow-up request, added six SVG diagrams generated by actual Doc.edit execution: insert/delete/update/split/merge and a three-state table span. Eight fixed-expectation tests verify the operations and before/after models, hidden-cell text retention, complete restoration, accessible SVG labels, and output files. The generator initially seeded an extra empty paragraph; a fixed expected-model assertion exposed it, and setup was corrected. Generated SVGs and models.json are ignored build outputs; no runtime or package dependency changed. All SVGs parse as XML. Chrome loaded all six images and checked disclosure, light/dark rendering, and mobile horizontal scrolling (390px document; 342px figure viewport, 640px scroll area). A first browser diagram lookup used a stale same-document hash navigation; full reload corrected the test setup. The diagram change was committed/pushed as `094dd36aba0850e8878966ddb3d8cd9fe6153104` and deployed successfully: https://github.com/barocss/doc-sync/actions/runs/39972926996. Nine anonymous production HTTP checks passed; all six SVGs and models.json matched locally generated bytes exactly. Production Chrome 156.0.8078.47 loaded all six diagrams, navigated Slate/Lexical/ProseMirror, followed a search result to the table-span section, toggled the theme, and verified a 390px mobile document with no horizontal document overflow. There were no page/console/resource errors. Checkout retains full Git history for accurate per-page update dates. Final deployment/source/push receipts are saved under the local validation directory. The loopback preview on port 62490 remains available for the user's current documentation tab. Existing user tabs, data, and services were preserved. Local logs: `output/validation/docs-site-20261023/`. Browser evidence: `output/playwright/docs-site-20261023/`. No new runtime performance or actual OS IME claim is made. The first structural-cache Chrome regression and all remaining roadmap gates stay open.

### 5.19 Public editor bindings and document capabilities

**Scope.** The user requested reusable Slate/Lexical bindings, the full sample schema, current English API references, and all four discussed capability gaps. This later instruction explicitly replaces the old no-move decision. One public library package remains; the demo, docs and benchmarks remain private workspaces. Six public subpaths now cover core, sync, server, ProseMirror, Slate and Lexical. Optional editor peers are not loaded by core/sync/server imports. A copied package was checked in an isolated consumer with no editor peers installed.

**Editor bindings.** SlateBinding and LexicalBinding use the supplied schema and real native editors. They preserve schema-represented data, UTF-16 selections, composition drafts, remote updates without echo, reset/reconnect, CRDT history and disposal. Adjacent typing groups by default; `groupTyping: false` retains the previous comparison-demo undo granularity. Undo completes a draft before undoing it. Rejected native Lexical input restores authoritative content before reporting the error. Client callback subscriptions coexist and clean up independently. Slate maps separate native block-move updates directly; mixed move/mutation updates are rejected. Lexical recognizes exact sibling moves and one reparented native key; multiple reparents or creation of a destination plus movement in one update are rejected and restored. Specialized native rendering/plugins remain application work. The comparison app now uses public bindings by default; `?legacy=1` retains old adapters for bounded comparison. Its full-schema view uses safe placeholders for atomic content.

**Placement and history.** `doc.edit([{op: "move", from, at}])` moves paragraphs, stored flows, grids, atoms and group constituents without copying content or changing Item.line/origins. The destination parent path is read before removal; a same-parent final index excludes the source. Physical text fragments and logical placement are separate. Root/default/trailing paragraphs have stable editable storage. Moved text supports split, merge, resplit and block paste. Placement projection replays retained moves in Ticket order and suppresses cycles deterministically. Required slots cannot move or change type. Structural normalization can add an empty input paragraph before a block moved to index 0. Own movement undo checks exact current/restored ownership. Split undo also checks the tail placement; it skips an observed foreign or same-actor unrecorded move. Shared history ownership permits consecutive recorded move/split/join undo and redo. Deletion remains independent of placement. Movement logs are retained through GC; bounded movement-log pruning is not implemented.

**Rules, fields and annotations.** Flow `childRules` uses bounds from 0 to 1000. Projection retains overflow and deterministic editable required identities. Deleting a required structured child clears its contents and keeps identity/attrs. Fields opt in to per-leaf LWW/conditional undo; explicit same-value writes retain ownership, patches keep omitted leaves, null resets defaults. Existing scalar attrs keep atomic LWW. Supported field positions are stored text/inline/nested flow/grid/atom nodes and cells; root/row/cell-body-flow/group/span/value-mark fields are rejected by schema validation. Persistent create/update/delete/getAnnotations helpers use a reserved metadata line, independent per-field metadata and UTF-16 token endpoints. Boundary expansion is explicit. An endpoint follows the affinity-side token after movement; missing/compacted/hidden/cross-slot results remain explicit. Live endpoints pin retained tokens through GC. The application provides comment UI, author identity and access control.

**Wire and recovery.** Six wire operations are the original five plus `move`; field, annotation and join state use validated reserved node/set namespaces. Feature snapshots require format 2 and capability flags. Protocol 2 hello requires all four capabilities and a document epoch. Nothing queued is sent before compatible hello. Invalid snapshots are built/validated before pending acknowledgments or state replacement. Clean epoch changes reset old history and composition; changes with unconfirmed local edits disconnect while preserving doc/history/pending. Each demo process gets a new epoch, including restart. HTTP streams carry protocol/epoch; changes/ack/presence/leave check epoch, including an actual in-flight body crossing reset. This safe blocking boundary does not complete lease recovery or automatic schema migration. Provide the same schema to clients and DocHub for extended capability validation.

**Review fixes.** Independent functional and security reviews found and fixed: moved split/join undo tail loss; reclaiming an observed foreign move; invalid derived required IDs/axis origins/recursive rules; missing required paths/model events; snapshot feature downgrade/forged metadata; duplicate birth IDs causing partial server application; nested output/op/snapshot/log aliases; getter evaluation before reserved-payload validation; unsafe Lamport numbers; stale subscriptions/reentrant reconnect and pending loss during invalid hello. Every reproduced case has a fixed regression. Clock exhaustion throws before repeating an ID. These checks do not certify all hostile inputs or supply production authentication/rate limits.

**Verification.** `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: library **458/458**, demo **12/12**, docs **27/27** PASS; compatibility units **31/31**, root TypeScript and compat build PASS. The 3000-seed legacy generators and PM300 checks preserve their original operation scope; they do not add randomized move coverage. New fixed capability/review suites and an independent finite 100-combination moved-paragraph sweep cover new semantics. Functional and security reviewers approved 137 focused checks. Chrome **156.0.8078.47**: input/caret **84/84**, ordinary editing **20/20**, actual operation/history traces **30/30**, and new capability flows **8/8** PASS. The new flows use real HTTP, five native editors, whole sample-schema nine-shape round trips, annotations through move/split/join, and table/container/atom/list movement. Node mirror checks and captured traces are distinct evidence. Actual OS IME remains NOT EVALUATED.

**Documentation and evidence.** The complete example schema is generated from fixtures/demo-schema.ts without changing its rules; documentation-only UI strings are English. Five current references/guides describe public APIs without implementation-date/design-note titles. A seventh actual-engine diagram shows movement. The public docs add document rules and annotations. Local logs and frozen hashes: `output/validation/editor-bindings/`. Final Chrome originals: `output/playwright/document-capabilities-final/`. Historical translation/benchmark receipts remain tied to their original sources; they are not rewritten to claim current verification. **Performance.** The source-frozen sequential ABBA comparison against `ce42144` completed all 12 process runs, 5 warmups/30 samples per case. All model checks passed, with zero remote fallback. The 26 comparison rows include regressions: for example, 10,000-character remote one-block insert p95 was 0.527/0.629 ms before and 2.091/0.902 ms after. At 100,000 characters, root split p95 was 118.137/90.830 ms before and 68.716/96.884 ms after, while table row changes were 68.217/63.617 ms before and 89.418/73.428 ms after. These are separate per-run p95 values, not pooled percentiles. External one-minute load was 22.15 at start and 16.07 at end; no test/build job or active comparison-editor page overlapped timing. No universal improvement is claimed.

A current-only 30-sample capability run measured 100,000-character remote text insert p95: plain 0.999 ms, stored annotation 1.346 ms, required-child rule 25.484 ms, prior move 88.828 ms. Declared field update p95 was 49.793 ms and is a different operation. Moved/required and field-write paths took two full-model reads per change. All ten rows passed mirror checks with zero fallback. Annotation reads/rendering, native conversion, network and DOM are excluded. Full-comparison costs are a known latency limit. Next performance priority: narrow logical moved/required text comparison without changing semantics or output ownership. Unmeasured clone shortcuts were not applied. Raw data, source hashes, limitations and reproducer: `benchmarks/results/document-capabilities-2026-10-24/`. All **1011** previously tracked result files remain byte-identical. Root type checking also passed after adding the current-only benchmark.

**Final delivery.** Functional, security and quality reviews approved the frozen source. Documentation build and static checks passed: 20 pages, 881 internal links/fragments/assets, English prose and no local paths. Markdown target checks passed 124 links. Local Chrome loaded six updated pages, all nine schema shapes, code-copy control and the move diagram; a 390px viewport had no document overflow or page/console/resource errors. The initial docs probe expected a different heading; correcting that expectation passed without a product change. Package dry-run passed with six public exports and source-only package files; the first default-cache attempt hit EACCES and a task-local cache succeeded. Frozen runtime verification matched all 126 files. Tracked source/test/browser/performance receipts are in `benchmarks/results/document-capabilities-2026-10-24/validation.json`; local documentation screenshots/logs are in `output/playwright/document-capability-docs/`. Implementation commit **`bb0a562125c1c0eea1188f1be25bfcbd2ba6e063`** was pushed to main; remote main matched it. [GitHub Pages run 39989535020](https://github.com/barocss/doc-sync/actions/runs/39989535020) passed clean `npm ci`, 27 documentation tests, build, static checks and public deployment. Ten anonymous production HTTP checks passed. Public move.svg and models.json matched locally generated bytes exactly. Production Chrome loaded the same six updated pages, all nine schema shapes, code-copy control, move diagram and 390px mobile layout with zero page/console/resource errors. Local search navigated to the new persistent-annotations section. Updated source/deployment receipts are in the tracked validation.json above. This section's receipt-only follow-up does not change runtime or published-page source. The owned comparison server on 59940/59941 and named Chrome session were stopped after validation; the existing docs preview on 62490 and user resources were preserved. The autopilot state tools were unavailable; only this delivery's own session record was marked complete/inactive with its original saved under local output. Other mode/session state was not cleared.

### 5.20 Bounded text comparison for moved and required-child documents

**Request and scope.** Reduce the full-comparison bottleneck recorded in §5.19 while preserving existing collaboration rules. Baseline main: `84fa81df7ff2288551fd33285dd6f3f2fa2de781`. Product changes are limited to `src/sync/model-events.ts` and the block-path lookup in `src/crdt/edit.ts`. Changes remained uncommitted at that checkpoint. The later commit/push authorization and final integration are recorded in §5.22.

**Implementation.** Remove the blanket hasMoves/hasCardinality exclusion. For each eligible text operation, find its physical text block, resolve its logical parent, verify that the projected visible block really contains the token, and use the existing at-most-eight-block diff/verification path. Joined fragments use the complete token resolver. Repeated targets reuse verified membership within that Change. Ordinary flow block lists already represent logical placement, so blockPath redirects only private required/text-storage paths instead of scanning all token locations for every ordinary path. All operations are checked before any before-model read. One uncertain target sends the whole Change through full comparison. Existing fallback verification is unchanged.

**Exclusions and rules.** Private automatic/default/fragment storage can change structural visibility and stays on full comparison. Hidden cells/overflow, inline-node mutation, moves/splits/merges, local undo/redo, undel restoration, old-clock text, references to tokens newly created in the same Change and nine or more text blocks also keep the full path. This is not a general incremental structural engine. CRDT application, placement/cycle handling, required-child projection, conditional history ownership, same-boundary Enter absorption, snapshots, GC and protocol are unchanged. Physical block lookup and projection still have costs; Slate/Lexical still rebuild native trees.

**Performance.** The final corrected runner uses a separate git archive for the baseline, each measured tree as cwd, Node 22.19.0, 5 warmups and 30 samples. Sequential order: before/after/after/before. Timing ends at the synchronous model-event callback; it excludes network, native conversion, DOM and correctness checks. No tests/build or active comparison page overlapped timing. External one-minute load went from 17.88 to 12.88; values are separate per-run p95s, not pooled percentiles.

| 100,000-character remote insertion | Before 1 p95 ms | After 1 | After 2 | Before 2 | Whole-model reads before → after |
|---|---:|---:|---:|---:|---:|
| Prior movement | 95.088 | 14.220 | 12.827 | 81.507 | 2 → 0 |
| Required-child rules | 35.144 | 2.061 | 1.904 | 26.413 | 2 → 0 |

All ten rows in all four runs passed mirrors with zero fallback. Plain/annotation controls retained zero whole-model reads; field updates retained two and are outside this change. Exploratory candidates are preserved. The first ABBA runner's baseline self-reported hashes came from current cwd; those originals remain in diagnostic-abba and are excluded from the final claim. Corrected abba raw baseline hashes were checked against Git blobs, and updated hashes match current runtime. Report/reproducer/raw files: `benchmarks/results/logical-text-scopes-2026-10-24/`. No screen-latency improvement or product SLO is claimed.

**Node verification.** New `remote-logical-scopes.test.ts`: 31 tests, including fixed expected models and two deterministic 100-round mixed text/move histories. It covers actual moved/cross-parent/retained-birth text, joined fragments, private required text/groups, nested requirements, overflow, covered cells, same-boundary Enter, 2/8/9 scopes, old/new origins, same-value ownership and both undo/redo orders. The new suite on the archived baseline passed 10 and failed 21 specifically at the expected zero whole-model-read assertion. Expanded `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: library 489/489, demo 12/12, documentation 27/27 PASS. Compatibility 31/31, root type checking and comparison build PASS. Legacy random generators retain their old operation scope; the new deterministic histories do not prove every schedule.

**Initial checks and retained limits.** New fixture mistakes were corrected without changing product semantics: MemoryNet needs clientSchema to configure both clients and hub; equal-Lamport writer ownership follows actor Ticket order rather than receipt order. A structural split fixture was narrowed to the last paragraph because a pre-existing moved-sibling ordering effect is outside this optimization. A separate before/current probe confirmed two unchanged structural behaviors: inserting into automatic leading storage after a structured move can expose its text twice, and splitting before a previously moved sibling can change following sibling order. They are not designated intention rules. Both defects were subsequently fixed and verified in §5.21. Automatic storage/structural batches remain excluded. The source-bound probe and initial failures are saved under `output/validation/logical-text-scopes/`.

**Chrome and final evidence.** Chrome 156.0.8078.47 passed **149/149** finite checks: input/caret 84, ordinary editing 20, actual operation/history traces 30, existing capability flows 8, new logical-path flows 2 with the unchanged demo schema and 5 with an isolated minimum-two-paragraph schema. The latter uses a copied demo/server fixture with `content.childRules.paragraph.min = 2`, all five real native editors and real HTTP, while resolving the current library source. Original fixtures/demo-schema.ts is unchanged. Native Slate input into a derived required paragraph, Lexical UTF-16 input/undo/redo, remote formatting, moved/stationary text and PM input all retained native/client/server equality, pending 0 and fallback 0. Console errors were 0. Actual OS IME is NOT EVALUATED; no browser latency metric was collected. Screenshot: `output/playwright/logical-text-scopes/required-paragraph.png`. Originals and summary: `output/playwright/logical-text-scopes/`; Node/build/source/fixture logs: `output/validation/logical-text-scopes/`. Tracked receipt: `benchmarks/results/logical-text-scopes-2026-10-24/validation.json`.

Documentation build and static checks passed 20 pages and 882 internal link/fragment/asset targets, English prose and absence of local paths. Performance/status/roadmap sources now distinguish the new eligible text path from the older capability baseline. No new publication was requested. Final path/diff review was performed by the implementing agent; no independent approval is claimed. Only the owned comparison servers (56400/56401 and 56510/56511) and named browser were stopped after verification. User tabs, existing preview on 62490 and other services/data are preserved. All measured product source hashes still match the verified implementation. All 1041 previously tracked benchmark-result files remain byte-identical. A final standalone rerun of the new suite passed 31/31.

### 5.21 Automatic paragraph identity and split order after movement

**Request and checkpoint.** Fix the two structural defects identified in §5.20, preserve existing collaboration rules, verify regressions and Chrome, and update this document. Main remains `84fa81df7ff2288551fd33285dd6f3f2fa2de781`. The inherited uncommitted receive optimization in edit.ts and model-events.ts is preserved byte-for-byte. This task changes doc.ts and placement.ts, adds fixed Node/browser regressions, and updates the intent/status documents. No commit, push or deployment was requested at that checkpoint; later integration follows §5.22.

**Cause and result.** A materialized automatic head could occur in both the placement result and a synthesized input gap. Typing into it therefore displayed the same identity twice. Automatic gap birth entries now use their earliest retained content stamp for sibling ordering, while explicit moves keep their own placement Ticket. Output emits each paragraph identity once. If a populated automatic paragraph moves, or another structured move creates a new gap before it, existing fragment storage provides a distinct editable replacement keyed by the retained move stamp. Arbitrary paste fragments are not treated as automatic gaps. Later explicit moves can still precede the populated paragraph.

A split's physical partition marker previously became the birth anchor of stationary following siblings. That could change `abc | ghi | def` into `a | bc | def | ghi`. Such markers now retain their own logical placement without reanchoring the older siblings: the expected result is `a | bc | ghi | def`. The implementation does not emit corrective moves for those siblings. Private text-storage anchors validate against their immutable owning flow; a foreign-flow anchor remains rejected. A per-line virtual-block map avoids repeated searches while deriving gap ranks.

**Preserved rules.** Text IDs, RGA origins, placement/cycle arbitration, same-boundary concurrent Enter absorption, deletion ledgers, conditional undo/redo ownership, required-child projection and protocol/snapshot formats remain. Remote formatting survives split undo/redo. Moving a paragraph retains its content; replacement gaps do not copy it. Automatic storage and structural batches remain on full event comparison. This is a correctness fix, not a new incremental structural algorithm.

**Regression evidence.** `move-structure-regressions.test.ts` contains 18 fixed cases: ordinary/UTF-16 input, one occurrence per automatic identity, same/across-parent movement and replacement input, split at start/middle/end, several moved siblings, exact untouched placement ownership, foreign bold through history, concurrent same-boundary split/input/format in both receipt orders, actual tombstone compaction, snapshots and private-anchor validation. The same final file on archived main fails 18/18; updated code passes 18/18. Initial candidate failures are preserved locally. One later test draft used delete.length instead of the public delete.count; its log is retained and the fixture was corrected. No product deletion rule was changed to satisfy that draft.

Final `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: **library 507/507, demo 12/12, documentation 27/27 PASS**. Compatibility **31/31 PASS**. Root type checking and comparison build PASS. The earlier expanded run passed 506 library cases before the last anchor test was added; the final run includes all 18 new cases. Legacy random generators retain their previous operation scope. These finite tests do not prove every possible history.

**Chrome.** Chrome 156.0.8078.47 passes **163 finite checks**: 84 input/caret cases, 20 ordinary checks, 30 operation/history trace captures, 8 capability flows, 7 logical-path flows (including 5 on the isolated minimum-two-paragraph schema), and 14 new structural checks. The new checks use actual native input/Enter/undo/redo in Slate, Lexical and ProseMirror over real HTTP. They verify fixed expected models across the server, five client models and five native models, including remote bold preservation and a moved automatic paragraph's editable replacement. All 318 saved snapshots have zero reported failures and fallback 0. Final console query: 0 errors. The driver initially required a status field from status-less legacy checks; it was corrected to respect their internal assertions and to require captured status for the 30 traces. Original outputs were retained and parsed. No product assertion was relaxed.

Screenshot inspected: `output/playwright/move-structure-fix/replacement-split-full.png`. Browser originals/scripts/summary: `output/playwright/move-structure-fix/`. Node/build/fixture/driver originals: `output/validation/move-structure-fix/`. Actual OS IME is **NOT EVALUATED**. No Chrome latency metric was collected.

**Performance boundary.** A separate current-source smoke run used Node 22.19.0, 5 warmups and 30 samples per row, before the final tests/browser work. No test/build or active comparison-editor page overlapped timing. One-minute external load was 21.73→21.31. At 100,000 characters, moved-text receive p95 was **15.368 ms**, required-child p95 **2.717 ms**; both retained zero full-model reads. All ten rows passed mirror assertions with fallback 0. Field writes retained two full-model reads. These are current-only synchronous receipt measurements, excluding network/native conversion/DOM. The fixture does not time automatic-gap creation or split. The §5.20 ABBA files remain unchanged and describe their original source; this smoke is not a new causal speedup or performance-regression verdict. Current report, raw samples and source-bound receipt: `benchmarks/results/move-structure-fix-2026-10-24/`.

Documentation build/static checks and final source/resource cleanup are recorded in that receipt. All earlier benchmark files remain unchanged. Existing user tabs, preview on 62490 and other services/data are preserved. Review was performed by the implementing agent; no independent approval is claimed.

### 5.22 Final checks and main integration

**Authorization and scope.** The user requested final review of all uncommitted changes, fresh passing tests, commit/push to main and an updated HANDOFF. Starting main and origin/main both matched `84fa81df7ff2288551fd33285dd6f3f2fa2de781`. Include the bounded logical text receive optimization, automatic paragraph/split corrections, fixed Node/browser cases, reports and English documents. Preserve prior raw evidence, user data, existing tabs and services. Earlier §5.20/§5.21 receipts retain the source hashes from their original checkpoints; they are not rewritten as current-source evidence.

**Additional review finding and correction.** Read-only review found an index error after a populated automatic paragraph's adjacent block moves again. After lazy replacement creation and another edit, private storage classified the empty leading replacement as virtual because its stored nonce was non-null. Model serialization retained a leading paragraph but editing paths omitted it; insert/delete/format/split could then target `lead` instead of `ab`. Projection now uses the resolved logical gap address for this classification. A leading replacement stays visible to both model serialization and editing paths. Normal trailing gaps keep their existing behavior. Independent re-review reproduced all four operations and confirmed the corrected target and snapshot result.

**Fixed cases and fresh checks.** New automatic-gap-paths.test.ts adds 18 cases across incoming structured movement, same-parent automatic movement and cross-parent movement. It forces reads between edits and a later cache rebuild; checks visible paths/anchors, all four text operations, a fresh peer, snapshot restoration and deletion undo/redo. The final 18-case file fails 18/18 against the initial dirty doc.ts hash `030489607c6e7575cef2e34aefeb979522063dc9484ecffe8bb62a7cd695ccda`; updated code passes. The first draft incorrectly separated initial delete/insert and then asserted an optional flag was undefined instead of false. Those diagnostic failures are retained and excluded from the final before/after comparison. The valid before receipt confirms the original product hash. Related focused cases pass 67/67.

Final expanded `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: **library 525/525, demo 12/12, documentation 27/27 PASS**. Compatibility **31/31**, root type checking and compatibility build PASS. The first integration rerun passed the old 507 cases before review found the missing case; it is retained separately and is not the final corrected-source run. Fresh Chrome 156.0.8078.47 verification passes **175 finite checks**, including the previous 163 checks and 12 new native input/delete/format/split checks across Slate, Lexical and ProseMirror. These force an empty replacement plus remote mutation before editing later text. Native/client/server models converge with no pending changes or fallback; native deletion undo/redo preserves the unrelated paragraph. Actual OS IME remains NOT EVALUATED, and no browser latency metric was collected. All 330 saved snapshots have zero reported failures and fallback 0. Final console query: 0 errors. Documentation build/static checks pass 20 pages and 882 internal link/fragment/asset targets, English prose and absence of local paths. Source-bound receipt: benchmarks/results/main-integration-2026-10-24/validation.json; originals: output/validation/main-integration-20261024/ and output/playwright/main-integration-20261024/. Owned comparison ports 64149/64150 and 64156/64157 and the named browser were stopped; existing preview on 62490 and user resources were preserved. No new performance timing was collected after the logical-gap visibility correction; the earlier ABBA and current-only smoke remain historical measurements with their original scope.

**Delivery.** Implementation commits **`d0b8ab5ad12e9425e42dce6df03f3dfe6b4b128f`** (bounded text comparison) and **`3f6a7b922470caf4f83a6abfe5cabd8fb92d6ffb`** (automatic paragraph/split/path correctness and integration documents) were pushed to main. Remote main was verified equal to `3f6a7b922470caf4f83a6abfe5cabd8fb92d6ffb`. [GitHub Pages run 40061069142](https://github.com/barocss/doc-sync/actions/runs/40061069142) passed clean npm ci, 27 documentation tests, build, static checks and deployment. Three anonymous production HTTP checks passed for status, performance and the collaboration-intent reference; their new expected text is present. These checks verify published content, not a new production-browser run. Deployment/public HTTP receipts are in benchmarks/results/main-integration-2026-10-24/. This receipt-only follow-up changes no runtime or published-page source; it records delivery without triggering another Pages build. Final local/remote equality is checked again after pushing this follow-up. No npm release or protocol change is included.

### 5.23 Guarded comparison windows for structural events

**Scope and baseline.** Reduce remaining full comparison/recalculation costs while preserving collaboration rules. Baseline: clean main `d46db51b75120539d1f649e4025800b7c96b7506`. This request authorizes implementation, measurements, regressions and documentation; changes remain uncommitted and no push/deployment was requested. Product edits are limited to sync/client.ts and sync/model-events.ts. CRDT/model/schema/history/editor-binding source, wire formats, public mutable-output isolation and snapshot/GC rules are unchanged.

**Cause.** For a small structural change in 100,000 body characters, diagnostic receipt samples spent roughly 54–74 ms outside Doc.apply/toJSON, compared with 0.00–0.05 ms in application itself. Full event verification called applyEdits, which canonicalized unchanged text again. Separate diagnostic samples counted about 201,000 JSON.stringify calls outside application/model reads. An initial whole-process CPU profile includes setup and correctness work and is not used as timed-path attribution. Diagnostic wrapper times include instrumentation overhead; the final timing distributions use unwrapped samples.

**Change and guard.** Keep actual whole before/after model reads. Find an identical top-level prefix/suffix, retain boundary nodes and compare/verify at most eight top-level nodes, including complete nested subtrees. Translate validated local event paths back to document paths. A retained standalone text start and no top-level text group in the window/boundary prevent root leading-text insertion or regrouping across the slice. Small documents (at most eight top-level children), root child-count rules, group boundaries, wider spans and windows covering the complete tree retain the previous whole comparison/verification path. Nested child-count/group rules stay inside their complete subtree. The existing whole replacement fallback uses the original full before/after models if verification fails. No wire-op prediction, identity change or borrowed mutable cache is introduced. The text-only scope path remains unchanged. Generated model-event patches can differ from whole-tree LCS; their complete-document application is tested against the same canonical result.

**Remaining cost.** Whole model reads/copies, prefix/suffix scanning, raw structural projection and native tree conversion remain. The limit counts top-level nodes; one nested subtree may itself be large. This is not a general incremental structural model engine or a bounded-time guarantee. Local editing normalization is outside the change. The optimization also applies to eligible undo/redo and other changes that already require whole model reads.

**Measurements.** Node 22.19.0, Apple M3 Max (14 logical CPUs), 36 GiB RAM. Same new structural-events.ts harness with only bare product imports redirected into an archived baseline. Each process uses its measured tree as cwd; archived product hashes match Git blobs. Sequential order: before/after/after/before, 5 warmups + 30 samples + 2 separate diagnostic samples for each of 16 rows (8 scenarios × 10,000/100,000 body characters). Timing is synchronous receipt through model-event callback; setup, network, native conversion, DOM and correctness work are excluded. No tests/build or active comparison page overlapped timing. External one-minute load was 23.15→13.78 and remained uncontrolled. Values are per-run p95 (floor(0.95×30), index 28), not pooled percentiles.

| 100,000-character structural receipt | Before 1 p95 ms | After 1 | After 2 | Before 2 |
|---|---:|---:|---:|---:|
| Root split/join | 65.746 | 21.147 | 13.172 | 60.397 |
| Nested split/join | 56.563 | 5.453 | 3.617 | 51.190 |
| Block type | 66.485 | 14.468 | 14.082 | 55.572 |
| Cell split/join | 56.965 | 3.663 | 3.746 | 47.239 |
| Table row insert/delete | 68.679 | 15.695 | 15.639 | 62.634 |
| Cell merge/split | 68.858 | 17.323 | 16.221 | 62.262 |

All 64 rows and 2,368 Changes passed callback, full event mirror and sender/receiver model assertions with zero fallback; 128 diagnostic Changes also checked fresh snapshots. There are 1,920 timing samples, 320 warmups and 128 diagnostic samples. Supported rows reduced repeated verification stringification to a few thousand calls. Root-list and root-cardinality controls retain full verification and vary: root-list after p95 70.448–78.693 ms versus before 62.420–83.931 ms; no improvement is claimed there. The later root-list baseline was faster than either updated run. No causal explanation or product SLO is assigned to these control differences. Raw phase counters, samples, source hashes, controls, exploratory files and reproduction are in benchmarks/results/structural-events-2026-10-24/.

**Regression evidence.** New structural-event-window.test.ts passes 31 cases, including two deterministic 100-round structural histories with unique/repeated paragraphs. Fixed cases cover full mirror application, root/first/last/nested/cell splits and joins, types, node/row insert/delete, spans, small/wide changes, 8/9-node guards, root/nested child rules, root/nested groups, adjacent/wide movement, both concurrent Enter/delete/format receipt orders, conditional history, same-boundary absorption, callback payload isolation and repeated automatic-gap reconstruction. Related focused suite passed 101 cases before the final automatic-gap case was added. Expanded `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: **library 556/556, demo 12/12, documentation 27/27 PASS**. Compatibility 31/31 and type checking/build PASS. Legacy fuzz operation scope is unchanged; finite tests do not establish every history.

**Chrome and explicit existing limit.** Chrome 156.0.8078.47 passed **211 finite regression/roundtrip checks**: the earlier 175 plus 24 structural and 12 repeated-paragraph cursor/selection cases. Structural checks exercise actual native Enter/Backspace and undo/redo in Slate, Lexical and ProseMirror across root, callout and cell content, remote rows and span/unspan roundtrips. Selection cases check unchanged-range forward/backward endpoints, an outside caret and a caret inside the split paragraph. Completed checked states retain native/client/server equality, pending 0 and fallback 0. Three span roundtrip checks establish stored model equality while merged and native equality after unmerge; they do not pass native equality during the merged interval.

The first new Chrome attempt failed at that merged interval. A separate archived-baseline server and bundle, with matching configs and dependency versions, reproduce the same native-model failures. Lexical a/b expose an extra grid column; PM readback without a hidden-cell reference has empty hidden text. All five stored client models match the server throughout. Before merge and after unmerge, all five native models match too. Baseline/current native models match exactly at all three probe phases. Native merged-state equality is explicitly **FAIL before and after** for lexical-a, lexical-b and pm-a; this existing limitation is not fixed or counted as native merge acceptance. The span diagnostic is preserved separately from successful roundtrip assertions. A second test-draft timeout came from expected object-key insertion order and was corrected without product changes. Original failures, probes and metadata are retained. Baseline helper setup also retained its initial archive-buffer/config warnings before the final source/config-bound probe.

Browser originals and scripts: output/playwright/structural-events/. Node/build/driver/fixture logs: output/validation/structural-events/. The baseline browser helper and native-span-limit.json are in the result folder. Actual OS IME is **NOT EVALUATED**; Chrome latency is **NOT MEASURED**. Performance claims above cover core receipt only. Documentation build/check PASS: 20 pages, 883 internal links, English and local-path exclusion. Final source hashes match the ABBA measurements. Only the owned named Chrome session and three compatibility/backend pairs were stopped; all six owned ports are closed, and the existing docs preview at port 62490 remains. Details and local evidence hashes are recorded in benchmarks/results/structural-events-2026-10-24/validation.json. The Markdown performance/regression report is README.md in that folder. Review is by the implementing agent; no independent review or production acceptance is claimed.

### 5.24 Merged-grid native consistency and retained content

**Request and inherited work.** Fix Lexical/PM merged-cell display models without changing collaboration rules or losing covered content. The previous structural-event implementation remains uncommitted and unchanged; its before/after source hashes, measurements and historical failure receipts remain valid for that recorded source. This task does not commit, push or deploy. A WIP hash inventory is saved under output/validation/merged-grid/.

**Cause and change.** Lexical previously inserted every full-grid cell into its native table, then hid covered DOM cells. With registerTablePlugin enabled, the owner span and the retained native cells occupied the same coordinates; native padding added columns. Native rows now contain only visible cells. The table's serialized NodeState retains complete covered cells, including marks, nested content and attributes. Stable per-cell origin metadata remaps the retained data when native rows/columns are inserted before a merge. Readback reconstructs the complete canonical grid. Native unmerge restores retained data into the blank split cells and synchronizes their metadata, content and presentation. Selection and native reparent mapping use logical grid columns rather than compressed native indices. DOM hiding is no longer required. Standalone conversion still reads legacy serialized full-grid states.

The PM public converter already accepts a full-model reference because native PM contains no covered cells. The compatibility app now passes the matching input model. The converter deep-copies the full covered cell, retaining nested attribute objects as well as its body and preventing reference mutation. The demo core-edit helper also pulls the selected native view after committing, including local PM commands. No CRDT, schema, history, wire, token identity or sync event source is changed by this task. The shared full-grid model and hidden-text retention/GC contract remain unchanged.

**Node evidence.** New merged-grid.test.ts passes 11 cases with real Lexical table transforms enabled: four horizontal/vertical/rectangular/full-grid geometries, serialization, visible/hidden selection coordinates and native text edits, both receipt orders for concurrent merge/hidden text/format edits, conditional merge history and native unmerge, native row/column insertion before a merge, legacy JSON reading, and PM rich covered-cell/attribute/output-isolation conversion. Focused binding/conversion/cache tests pass 41/41. Expanded FUZZ_SEEDS=3000 PM_SEEDS=300 npm test passes **567 library, 12 demo and 27 documentation tests**. Compatibility unit tests pass **31/31**; type checking and compatibility build pass. Finite histories do not prove every possible native command or concurrent history.

**Chrome evidence.** New checks-merged-grid.js passes **96** states across Slate, Lexical and PM initiators and 1×2, 2×1, 2×2 and 3×3 merges. Each scene has nine distinct filled cells. Checks include native typing into the owner, foreign hidden text/bold/background edits, typing undo, merge undo, merge redo, typing redo and unmerge. All five stored/native models match the server, pending and fallback counts are zero, and DOM visible-cell counts and owner row/column spans match fixed expected geometry at each checked state. The prior structural script now asserts native equality while merged and passes 27 states; its three previous diagnostic-only merge intervals are actual assertions. A separate 30-state script exercises forward/backward DOM ranges in logical column 2 after a 2×2 merge, remote hidden edits, actual native range replacement, undo/redo and unmerge. The final aggregate contains **340** checks: the previous 211, three promoted merged-state assertions, 96 new merged-grid states and 30 merged-selection states. It includes an isolated two-paragraph minimum fixture. Aggregate browser results and final resources are recorded in docs/reports/merged-grid-2026-10-24/validation.json.

The original §5.23 merged-state FAIL remains historical evidence. A new Node reproduction fails on the pre-fix table representation. Intermediate logs preserve the native unmerge experiments, a legacy test fixture missing its native header state (corrected in the fixture), and the first new Chrome run that exposed the demo PM core-edit helper's missing pull. These failures are not removed or reported as successful final checks. Actual OS IME remains **NOT EVALUATED** and screen latency is **NOT MEASURED** in this task. The earlier structural performance figures are not new editor measurements.

**Evidence and limits.** Report, required-child browser helper and final receipt: docs/reports/merged-grid-2026-10-24/. Local original logs and source hashes: output/validation/merged-grid/; Chrome JSON, initial failures and screenshots: output/playwright/merged-grid/. Implementing-agent review only; no independent review or production acceptance is claimed. The change preserves inherited WIP, historical benchmark receipts and user-owned browser tabs/services. Final documentation build/check passes 20 pages and 884 internal links (English, local paths excluded). Final product/check hashes are unchanged through validation. The merged 2×2/3×3-grid screenshot was visually inspected; final console has zero errors/warnings. The named browser and two owned compatibility/backend pairs are closed, all four owned ports are closed, and the existing docs preview at port 62490 remains. Original data and evidence are retained.

### 5.25 Verified main integration and editor design lessons

**Scope and commits.** The user authorized final review, tests, commit and push of all existing WIP to main, plus reusable documentation of editor differences and solved problems. Implementation commit **0951185** contains both guarded structural events and the merged-grid fixes with their tests/evidence. They belong together because the structural browser script now asserts native merged-state equality. The documentation commit containing this section adds the English Editor design lessons guide, sidebar/overview/README links and a required-page build check. This integration supersedes the uncommitted checkpoint descriptions in §5.23–§5.24; their measurements and first failures remain historical source-bound evidence.

**Guide.** apps/docs/src/guide/editor-lessons.md compares PM transaction positions, Slate paths/leaves, Lexical node keys/plugins and the custom demo's input/rendering responsibilities. It explains composition drafts, operation-number reservation, selection restoration, conditional history, movement restrictions, native table geometry, covered-cell retention, lifecycle/error recovery and rendering costs. Source/test links identify concrete implementations. A separate collaboration-experience table explains favorable behavior and current friction for each editor. These are engineering assessments of the current bindings, not a comparative user study or a measured editor-latency ranking. Official framework documentation supports the framework descriptions; tested dependency versions are explicit.

**Fresh verification.** FUZZ_SEEDS=3000 PM_SEEDS=300 npm test: library **567/567**, demo **12/12**, docs **27/27 PASS**. Compatibility **31/31**, type checking and compatibility build PASS. Documentation build/check PASS: **21 pages, 957 internal links**, English and local-path exclusion. A named Chrome smoke checks the new guide, four editor sections, comparison/experience/fix tables, overview navigation, mobile page width and runtime errors. Desktop/mobile screenshots and original selector failure are retained. The first smoke used an exact accessible heading name that included VitePress's permalink; the locator was corrected. Mobile capture waits for the responsive transition.

**Existing browser/performance evidence.** All 42 source/check hashes in the merged-grid receipt still match current files, so its 340 finite editor checks apply to unchanged runtime/check source. Those 340 editor checks were not rerun in this integration; the new docs smoke is separate. The ABBA structural measurements retain their measured source, and current sync/client.ts and sync/model-events.ts still match it. The later Lexical/PM fixes intentionally differ from that earlier whole-source hash set. No new core or screen timing is claimed. Actual OS IME remains NOT EVALUATED. A delegated read-only scope/Git review found no blocking issue; it did not execute tests.

**Records and publication.** Fresh logs, WIP inventory and final integrity receipt: output/validation/main-editor-lessons/. New-page browser records: output/playwright/main-editor-lessons/. Historical benchmark and merged-grid receipts are retained unchanged. The authorized integration is committed on main and pushed through the normal Git path; GitHub Pages uses the existing docs-pages workflow. The final documentation/integration revision is the commit containing this section. Verify remote main and the Pages workflow for the publication revision. No unrelated user tabs, data or preview services are removed.

**Next requested work.** Build representative Word-style, Notion-style and presentation schemas and test their structure, concurrency, history, snapshot restoration and binding conversion. This is a schema/concurrency exercise; exact product file compatibility and page/canvas rendering require separate evidence. Keep the current demo schema and collaboration rules unchanged.

## 5.26 Representative product schemas and snapshot regressions

**Requested scope.** The user asked to exercise Word-style documents, Notion-style pages and presentations after publishing the prior implementation and editor-experience documentation. That prior publication is on main as `0951185` and `c423a32`; GitHub Pages run `40084728838` succeeded for `c423a32`. The separate profile change keeps one library package, DEMO_SCHEMA and the existing collaboration policies.

**Profiles.** `fixtures/product-schemas.ts` exports WORD_SCHEMA, NOTION_SCHEMA and PRESENTATION_SCHEMA. `fixtures/product-documents.ts` supplies canonical sample documents. Word covers sections, nested page/margin fields, required header/footer flows, lists, tables, rich inline content, figures and page breaks. Notion covers recursive blocks, toggles/callouts/tasks, two-to-four-column projection, tables, database-shaped grid/view fields, embeds and equations. Presentations cover ordered slides, required titles/notes, text boxes, images/shapes/charts, nested object groups and frame fields. Chart data remains atomic metadata. Flows still begin with their default text block.

**Defects exposed and fixed.** Initial profile tests had 21 passes and 9 failures. Grid canonicalization omitted nested cell-field defaults that Doc materialized; canonGrid now uses the existing patchFields rule for declared fields, producing 24 passes and 6 failures. Those six failures were snapshot restore errors: the required namespace check mistakenly matched a required flow's ordinary body-slot identity, and trailing-paragraph validation compared a derived required block's physical line instead of its immutable owning flow. Reserved identity detection now checks the actual line-ticket actor prefix, and restoration resolves the anchor's owning flow. Canonical heads, required-child addresses/types, movement destinations and malformed/character/foreign-flow anchors remain validated. The schema fixture also uses `code-block` for a node and `code` for a mark because ProseMirror cannot use the same name for both.

**Profile proof.** `packages/doc-sync/test/product-schemas.test.ts`: 33 cases, 11 per profile. They cover schema validity and immutability; full canonical sample load/snapshot restore; three headless editor conversions; three-client text/delete/format conflicts in two receipt orders; participant history with independent fields; merged hidden text/fields and all codecs; section/toggle/slide movement with concurrent descendant input; editable required replacements; and negative snapshot references. Network cases compare clients, server, event mirrors, pending queues and zero event-application fallbacks. No concurrency policy is changed.

**Diagnostic boundary.** A later raw-operation probe targeted dormant internal trailing storage rather than a visible editable paragraph. It is retained under output/validation/product-schemas/ as a diagnostic, not an accepted user-command regression or a supported editing route. The attempted receive-validator change and exploratory cold-replica tests were removed. The live operation validation contract is unchanged. Do not infer a current visible-input failure from that probe.

**Chrome setup correction.** The initial logical-scope run converged across all five native editors with zero fallbacks, but typed `gamm!aS` instead of the intended `gammaS!`. The saved DOM probe showed offset 4 immediately after End and after settling; the expected end was offset 6. A required-child run similarly inserted an emoji before the final d. The comparison check now places each target native caret explicitly, checks the editor/paragraph/DOM offset, and then types through the real keyboard path. The same convergence/formatting assertions remain. The first failure, state and probe are retained. Existing completed cases are reused only with exact runtime/check hash matches; the corrected logical checks and the remaining scripts run afterward against the same product source.

**Verification.** Node 22.19.0, Chrome 156.0.8078.47. FUZZ_SEEDS=3000 PM_SEEDS=300 npm test passes 600 library, 12 demo and 27 docs tests. Compatibility passes 31; typecheck and compatibility build pass. Existing-schema Chrome coverage records 310 asserted cases plus 30 captured operation traces (340 records), including the isolated required-child fixture. The new English guide builds directly from tested schema/sample source snippets; its executable example runs. Documentation has 22 pages; all links/fragments, English prose and local-path exclusion checks pass. Desktop/mobile guide smoke has 5 passes and saved screenshots. A delegated read-only review found no blocker and did not run additional tests.

**Evidence and limits.** Tracked report/receipt: `docs/reports/product-schemas-2026-10-24/`. Local logs, diagnostic failures and fixture receipt: output/validation/product-schemas/. Local browser JSON/logs/screenshots: output/playwright/product-schemas/. These profiles establish bounded model/concurrency/headless-conversion behavior. Native editing/rendering for the new profiles, DOCX/PPTX import/export, pagination, database queries, canvas interactions, large-profile latency and actual OS IME are NOT RUN or NOT EVALUATED. Existing Chrome cases use the comparison demo schema, not the product profiles. No new performance comparison is claimed; prior measurements remain historical evidence. User-owned preview port 62490 and browser tabs are preserved. The public guide is `/guide/product-schemas.html`; the English editor experience guide remains `/guide/editor-lessons.html`.

## 5.27 Native product-schema editing and large-document measurements

**Scope and implementation.** The user requested native screens for all three profiles, Chrome input/selection/history checks, large-document measurements and an updated HANDOFF. `apps/demo/products/` now provides three native editing views on each profile: Slate, Lexical and ProseMirror, using the public bindings. The app defines schema-aware Slate elements, ProseMirror DOM hints and an application-owned Lexical codec for safe media/atom labels. The default demo and single library package are unchanged. No library source or concurrency policy is changed.

**Transport and execution.** `npm run dev:products` builds and starts the local app on loopback port 5413; PRODUCT_PORT=0 chooses a random port. Install the comparison harness dependencies first as described in apps/demo/products/README.md. The build reuses that installation. The product server runs a separate existing HTTP/SSE backend and fresh temporary DATA_DIR for each profile. DOC_PROFILE selects the backend schema; unknown profiles fail startup, and an unset profile retains DEMO_SCHEMA. The compatibility remote helper accepts an optional explicit schema and keeps its existing default. New document names seed once; existing documents retain edits. The app labels presentation objects as an outline, displays toggles expanded for editing and uses media placeholders. It does not provide product page/canvas/file fidelity.

**Chrome behavior proof.** Chrome 156.0.8078.47 passes 90 editing cases across all nine profile/editor-source combinations. They cover trusted Chrome Unicode input, Korean/emoji Backspace, input undo/redo, forward/backward selection through remote insertion, native formatting/history, participant undo/redo with foreign input, nested Enter/join, complete native/client/server equality and zero event-application fallbacks. Another 39 cases cover headers/footers/captions/cells, columns/database cells/callouts/tasks, notes/object groups/titles, merged native cell visibility, foreign hidden text/fields and history. Twelve more checks cover desktop/mobile views, retained edits on repeated seeding, and profile/document/size guards. Total: 141 asserted Chrome cases. This is separate from the earlier demo-schema suite; those old checks are not promoted into new profile evidence.

**First failure.** The first structure check matched Reviewer when it intended the cell Review. The application converged but the intended cell was unchanged. The check now uses exact text and verifies the native model path before input. The original script, failure and state are retained under output/playwright/product-native/. No library rule changed for this setup error. The final structure run passes all 39 cases.

**Workload and method.** The large preset retains each rich sample and adds exactly 100,000 generated UTF-16 units in 625 paragraphs across 20 nested sections/toggles/slides. It includes container labels in addition to that payload. Targets are nested paragraphs in the rich sample; each target is inside the editor and browser viewports. Node 22.19.0, localhost HTTP/SSE, development bundles, 1680×1100 viewport and three editors in one Chrome page. Six fresh profile/size documents, three sources per document, 5 warmups + 30 measured keyboard inputs per batch: 18 batches, 540 measured inputs, 90 excluded warmups and 1,080 remote rendering-opportunity endpoints. Native/client/server model comparisons run before/after each batch, outside timed input intervals. All measured inputs are trusted and all batch comparisons pass with zero event-application fallbacks.

The timestamp sequence is beforeinput → commit → transport send/response → SSE handler → target DOM match → second requestAnimationFrame. The last endpoint is a rendering-opportunity proxy, not physical screen display. HTTP-response spans include scheduling and are not pure network latency. Three native editors share one main thread; do not interpret this as independent remote machines or a vendor ranking. Raw records preserve every sample and long-task observations. The source order rotates by profile, but this is one development run, not an ABBA/randomized experiment.

| Profile | Sample worst-peer p95 range across sources | Large worst-peer p95 range across sources |
| --- | ---: | ---: |
| Word-style | 45.3–174.5 ms | 332.3–621.7 ms |
| Notion-style | 61.0–77.2 ms | 345.6–549.7 ms |
| Presentation | 44.7–210.1 ms | 336.4–558.3 ms |

For each source, worst-peer means the worse of its two receiving editors' p95 values, using nearest-rank percentiles on 30 samples. High sample-workload values are retained. Large-workload SSE handler p95 ranges are Slate 226.8–237.0 ms, Lexical 103.6–161.2 ms and ProseMirror 3.7–4.5 ms. These spans identify an expensive application phase, not CPU self-time of one function. Current Slate/Lexical receive paths rebuild their native trees. Whole-document conversion/replacement is the next profiling candidate. Short PM handler time does not remove shared-main-thread delay. Large-document performance remains a gap; no release target or before/after optimization gain is claimed.

**Aggregate verification.** FUZZ_SEEDS=3000 PM_SEEDS=300 npm test passes 600 library + 16 demo + 27 docs tests. Compatibility passes 31. Typecheck, product build, documentation build/link checks and root startup smoke pass. The generated-payload tests verify exact size, canonical form, target paths and fixture isolation; startup rejects an unknown schema profile. The docs remain English. No commit, push or deployment is made for this request.

**Records and remaining scope.** `benchmarks/results/product-native-2026-10-24/` contains the Markdown performance report, summary, all 18 raw batch JSON files and validation receipt with source/evidence hashes. Local CLI logs/screenshots/first failures are under output/validation/product-native/ and output/playwright/product-native/. The bundle sourcemap matches the current bundled repository sources. The dedicated review server used port 60012 with isolated backend data; user preview port 62490, existing user tabs and original data are preserved. Actual OS IME, native paste/import/export, accessibility, product layout, collapse/query UI, canvas geometry and production/WAN performance remain separate work. The public package and original collaboration rules are unchanged.

## 5.28 Remote native projection and repeated Chrome comparison

**Scope.** Improved remote projection in the public Slate and Lexical bindings. No CRDT, protocol, schema, placement, required-child, history ownership or composition policy changes. The measured browser bundles differ in exactly four repository sources: Slate binding/codec and Lexical binding/conversion. Core, product UI, codecs supplied by the app, fixtures and instrumentation match. ProseMirror is unchanged.

**Implementation.** Bindings retain identical root blocks before and after a changed interval, and convert/replace only that interval. Slate caches the native immutable child array, skips repeat reads when it has not changed, and only permits interval reuse for an exact known projection. Native content edits invalidate projection eligibility. Presentation-only normalization is checked through semantic readback and retains full recovery. Lexical invalidates the cached EditorState on local content updates and caches actual readback after projection so application transforms remain visible. Cell-metadata restoration leaves the cache invalid. Anchored selection restoration, focus guards, composition drafts, disposal and existing codecs remain in use.

**First failures and corrections.** The first cache candidate failed the existing native-unmerge test: canonical hidden-cell readback matched before the visible native cells were restored. Metadata synchronization now invalidates the cache. Two new tests cover presentation-only Slate normalization and a Lexical transform that rewrites projected content. Initial test-fixture type errors were corrected. A raw selector in the new DOM-retention check was replaced with the established accessible-role locator. Later Chrome merged selection reported a PM backward unmerge failure; its saved final state contained the correct hidden text and visible cell. The wait had accepted the previous matching cached server/native state. `checks-merged-selection.js` now waits for the remote edit receipt's server revision on both the server cache and every peer, then checks full native/client/server equality. All 30 cases pass with that stronger condition. Failures and corrections are retained locally; no collaboration rule was changed.

**Repeated performance proof.** Node 22.19.0, Chrome 156.0.8078.47, M3 Max, localhost HTTP/SSE, development bundles, 1680×1100, three editors on one main thread. Same rich sample plus exactly 100,000 generated UTF-16 units in 625 paragraphs across 20 containers. Four comparison rounds (A1/F3/A2/F4), 18 batches each, 5 excluded warmups + 30 measured trusted keyboard inputs per batch: **2,160 measured inputs, 360 excluded warmups and 4,320 remote rendering-opportunity endpoints**. Intermediate candidates are excluded. Fresh document per profile/size/round; rotated source order is held constant across variants. All initial models match across variants, all batch model checkpoints match and event fallbacks remain zero. This is an interleaved repeated local comparison, not a randomized or uninterrupted ABBA trial.

Pooled nearest-rank p95 uses 60 samples per profile/size/source/variant. Ranges below span the three input sources; each value is the worse receiving editor's p95. The endpoint is input → target DOM match → second requestAnimationFrame, a rendering-opportunity proxy, not physical display.

| Profile | Before large worst-peer p95 | After large worst-peer p95 |
| --- | ---: | ---: |
| Word-style | 349.0–610.1 ms | 94.0–175.7 ms |
| Notion-style | 305.6–558.1 ms | 70.1–160.6 ms |
| Presentation | 332.4–548.6 ms | 79.9–176.5 ms |

Across the nine large profile/source cells, observed reduction is 65.2–86.9%. Sample p95 remains about 47–49 ms, with changes from −1.9% to +3.2%. Remote SSE handler p95 ranges, excluding self acknowledgements: Slate **234.5–267.2 → 5.3–14.4 ms**; Lexical **101.2–115.9 → 46.9–49.5 ms**; unchanged PM **3.6–4.7 → 3.2–3.9 ms**. These are elapsed spans, not CPU self-time; shared-thread scheduling affects every editor. No vendor, WAN, production or release target claim follows.

**Final verification.** `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: **608 library + 16 demo + 27 docs**, all pass. Compatibility unit tests: **31**. New headless regressions: six profile/editor cases for retained identities through remote Unicode/format changes, duplicate pulls, root insertion and deletion, plus the two normalization/transform cases. Chrome: **150 product assertions** (90 editing + 39 structure + 12 UI/guards + 9 retained DOM), **310 existing comparison assertions**, and **30 separately captured operation traces**. Both browser suites report zero console errors. The new DOM check fails on the baseline because a distant Slate paragraph is rebuilt, and passes for all nine final profile/editor combinations. Typecheck, isolated product/compat builds, documentation build and checks (22 pages, 1,028 internal links, English) pass.

**Execution and records.** Existing commands in §1 still apply. `PRODUCT_BUNDLE=output/playwright/my-check/bundle.js npm run dev:products` isolates a build and its server; pass the same variable when running build/serve separately. Do not overwrite a bundle served by an active user session. The original review app on port 60012, documentation preview on 62490, user tabs and original data are preserved. The optimized review app uses **http://127.0.0.1:53138/?profile=word** with separate temporary backend storage. `benchmarks/results/native-receive-2026-10-24/` contains the Markdown report, per-round raw measurements, pooled/per-round summary and validation receipt. Local source archives, bundle/sourcemap checks, first failures, CLI logs and screenshots are under output/validation/native-receive/ and output/playwright/native-receive/. Work remains local and uncommitted.

**Remaining limits.** This is root-interval projection. A large changed root container and wide changed intervals still rebuild their full contents. Whole comparisons and Doc.toJSON copies remain. Lexical keeps full readback for each projected state; local input conversion, selection and cell recovery still have costs. Broader structural-operation performance, independent remote machines, production/WAN, physical display, actual OS IME and product layout/file fidelity remain separate work. Prior §5.27 evidence is retained as historical baseline data.

## 5.29 Runtime ID metadata compression

**Scope and implementation.** Replaced the private string-keyed ID Map with an actor/range index. Consecutive Lamport IDs use ranges of at most 256 entries; highly fragmented sequences switch to numeric Map keys. After the existing stable-GC rules merge tombstones, equal references in a range collapse to one reference. Insertions reuse an existing equal origin-key string. Snapshot restoration reuses the exact single-ID predecessor key. References to an interior compacted ID keep their original logical key. This does not resume live-character grouping: Item/Line/Block identities, one Item per live UTF-16 unit, logical IDs, register ownership, conflict ordering, required-child and placement rules, annotation pins, undo/redo, hidden content, snapshots and wire format remain unchanged. No dependency or public API change.

**Before/after evidence.** Frozen baseline core matches all twelve CRDT files at `499c221bcd7ce85fc91f9d6f2a144822e385b46a`. Node 22.19.0, macOS arm64/M3 Max, deterministic ASCII, six workloads × two variants × three fresh processes = **36 workers**. Variant order alternates by repetition. No browser validation, build or test overlaps these timings. User services/tabs remain open, and unrelated desktop load is uncontrolled. Four forced collections precede each measurement. The table reports median incremental post-GC JS heap (worker initial heap subtracted), before explicit model materialization. It is not an exact object-size census or a browser/WASM memory figure.

| Workload | Before MiB | After MiB | Reduction |
| --- | ---: | ---: | ---: |
| 100k plain UTF-16 units | 30.45 | 25.08 | 17.6% |
| 1m plain units | 300.69 | 252.23 | 16.1% |
| 100k units, 100 actors | 31.78 | 25.43 | 20.0% |
| 100k units, initial bold registers | 51.85 | 46.49 | 10.3% |
| 100k units, sparse Lamport IDs | 31.16 | 27.62 | 11.4% |
| 100k units after stable deletion/GC | 6.73 | 0.26 | 96.1% |

With model caches populated, the plain 1m heap is **341.60 → 293.15 MiB (14.2%)**. Its whole-process warm RSS median is **782.09 → 723.19 MiB**; RSS includes runtime and allocator capacity. Plain 100k/1m retain 100,001/1,000,001 physical root-line Items and logical IDs; only index representation changes (392/3,908 ranges). Every initial model hash, final snapshot hash, serialized ASCII JSON size and Item count matches across variants. Restoration re-encodes the same snapshot; timed sender/receiver results match. The stable-GC case retains all logical IDs and two Items; no extra history is discarded. These figures do not reproduce Automerge's reported compression ratio.

**Performance and limits.** Ten excluded warmups, then 100 middle-insertion samples per live 100k case and 30 samples for 1m. Values are medians of three nearest-rank per-process p95s, not pooled p95. Plain 100k `Doc.edit` is **5.029 → 4.812 ms**, receive `apply + toJSON` **92.890 → 90.041 ms**. For 1m, edit is **113.385 → 111.260 ms**, while full receive/model p95 is **1,146.307 → 1,190.076 ms (+3.8%)**. The marked receive/model case is +1.9%. A 100-actor after run reaches 154.61 ms p95 versus 88.90 ms in its paired before run; all outliers and run values remain in the report. No universal speedup or regression-free latency claim. Core measurements exclude SyncClient events, native conversion, transport and DOM. Character Items/tickets, formatting maps, block/position caches and histories remain character-level storage; full model reconstruction/copy is still expensive. Browser heap, snapshot-load retained memory, arbitrary actor counts and long-lived histories are not measured.

**Regression evidence.** `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: **616 library + 16 demo + 27 docs**, all pass; compatibility unit tests **31**; typecheck passes. Eight new tests cover range bridges, shuffled writes, sparse fallback, replacement, maximum/noncanonical IDs, constant aliases, clear, independent Map lookup/model/snapshot/position comparison, concurrent/duplicate/partial UTF-16 replay, exact interior tombstone origins and foreign formatting through deletion undo and format undo/redo. Two pilot timing records are retained locally and excluded: the final harness moves temporary snapshot/restoration work after receiver timing. The expected initial test failure was a missing index module before implementation.

**Chrome and documentation.** Chrome 156.0.8078.47 passes **150 product assertions** across the three schemas and **310 existing compatibility assertions**, with **30 separately captured operation traces** and zero console errors. Required-child coverage includes five cases with an explicitly verified two-paragraph fixture. Its first preflight timed out because the local proxy's fixture bootstrap was not passed to the spawned backend; the saved state showed server/client schema mismatch and all peers offline. The isolated harness now passes the bootstrap to that child; all five cases pass. No production rule/code changed for that correction. Typecheck, isolated product/compat builds, docs build and link/English checks pass (**22 pages, 1,029 internal links**). Current docs unit tests also pass 27. Browser memory, before/after browser latency, physical display and actual OS IME were not measured in this task.

**Records and execution.** `benchmarks/metadata-memory.mjs` measures either a supplied frozen core module or the current one. `benchmarks/results/metadata-memory-2026-10-24/` contains the Markdown report, all 36 process records, baseline/current source hashes, summaries, reproduction commands and final validation receipt. Local source backup, inherited binary patch, pilot/first-test logs, browser evidence and isolated harnesses are under output/validation/metadata-memory-20261024/ and output/playwright/metadata-memory/. Existing commands remain valid. No commit, push or deployment. The dedicated metadata Chrome session and its three test proxy servers/backends are stopped after verification. Inherited WIP, user tabs, original data and review servers on 60012, 62490 and 53138 are preserved.

## 5.30 Receive model materialization with preserved ID compression

**Scope and cause.** Profiled the metadata-compressed source from §5.29. Changed text was projected into one Unit per character, converted to runs, then expanded to per-character Units again during canonicalization. Temporary allocations/GC dominate the sampled profile; updating an immutable paragraph also rewrote every membership Map entry. Changes are limited to `crdt/doc.ts` and `crdt/model.ts`. `key-index.ts` remains byte-identical. Inherited WIP is preserved.

**Implementation and invariants.** Private per-block references point to the latest immutable TextBlock, so a character insertion registers one membership entry and deletion removes one. Public old Block/character arrays/text remain unchanged. Virtual-block fallback and structural invalidation remain in use. Projection combines adjacent equal canonical marks into temporary chunks, with strict equality for span values; normalization keeps existing text runs whole. Public `runsToUnits` is unchanged for editing/diff offsets, including its runtime handling of non-string inputs. This does not merge live Items. Logical IDs, UTF-16 storage, token counts, conflict ordering, LWW/history ownership, moved/required projection, annotation pins, hidden cell text, GC eligibility and snapshot/wire formats remain unchanged.

**Before/after provenance.** The baseline is uncommitted §5.29 core, not plain HEAD. All thirteen frozen files match the previous measured compressed source. `baseline-core.patch` recreates them exactly from `499c221`; reconstruction was checked byte for byte. Node 22.19.0, macOS arm64/M3 Max, six primary workloads × two variants × three fresh processes = **36 primary workers**, plus **18 control workers**. Variant order alternates by repetition. No primary/control measurement overlaps tests, builds, profiling or Chrome validation; user services/tabs remain open and unrelated desktop load is uncontrolled. All initial model/final snapshot hashes, serialized sizes, physical Item counts and index diagnostics match. Control initial/final model and wire hashes also match.

**Core performance.** Ten excluded warmups, then 100 measured primary operations per live 100k case and 30 for 1m. Values are medians of three per-worker nearest-rank p95s, not pooled p95. Receive means `Doc.apply + Doc.toJSON`, including full model copying, excluding SyncClient/network/native/DOM work.

| Workload | Before p95 ms | After p95 ms | Reduction |
| --- | ---: | ---: | ---: |
| 100k plain, one paragraph | 82.955 | 25.697 | 69.0% |
| 1m plain, one paragraph | 1,049.757 | 352.018 | 66.5% |
| 100k plain, 100 actors | 81.095 | 24.884 | 69.3% |
| 100k initial bold | 100.513 | 35.691 | 64.5% |
| 100k sparse Lamport IDs | 80.973 | 25.971 | 67.9% |

For 1m, model-only p95 is **953.151 → 344.800 ms** and apply p95 **105.740 → 8.204 ms**. These separate percentiles must not be added. Sender `Doc.edit` p95 is **105.329 → 6.438 ms** for 1m and **5.129 → 0.894 ms** for plain 100k. Primary data retains **2,580 measured sender edits and receiver intervals**, plus 300 excluded warmups in each direction. CPU profiles are separate diagnostic runs: setup plus ten 1m-character insert/materialize iterations. Character reads, rawBlock/marksOf and GC remain in the after profile.

**Controls and limits.** Controls add 540 measured receiver intervals plus 180 warmups. 625 paragraphs × 160 units is **0.919 → 1.009 ms** p95 median (about +0.090 ms, per-run ranges overlap). 20k characters with alternating bold is **37.376 → 38.316 ms (+2.5%)**; the third pair is 36.031 → 39.809 ms and is retained. 20k link-span text is **33.662 → 10.255 ms**. No universal speedup or regression-free latency claim. Full reads in a changed paragraph, slice/splice/reindex work, structural sequence scans, tree normalization and copying remain. Very fragmented formats still require many runs. Browser latency/heap, WAN and release SLOs are not measured or closed.

**Memory preservation.** Same four-collection fresh-process method as §5.29, initial heap subtracted. Plain 1m cold JS heap is **251.899 → 251.915 MiB** (+0.016 MiB), warm **292.820 → 291.880 MiB**. Its whole-process warm RSS median is **716.69 → 503.16 MiB**; lower temporary allocation/allocator capacity is not an exact retained-object census. Plain 100k cold is 25.084 → 25.088 MiB. Stable-GC cold is 0.264 → 0.268 MiB, only a few KiB difference. Logical ID/range diagnostics and physical Items are unchanged. The original metadata savings remain active; the earlier uncompressed run is historical evidence, not a third variant measured here. No additional text/history is removed, and no long-lived per-character cache is added.

**Regressions and first failures.** `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` passes **622 library + 16 demo + 27 docs**; compatibility unit tests **31**; typecheck passes. Six new tests include 500 seeded mixed-run/nested-span cases against the unchanged character-unit oracle, non-string runtime rejection, a one-entry membership bound with old public Block immutability, latest-block invalidation after formatting/deletion, object-valued span identity and both multiple-span priority orders. Baseline membership-bound test intentionally fails with 10,001 writes instead of one. An initial candidate wrongly merged distinct object-valued spans with equal JSON; its failing case is retained and the strict-value guard fixes it. One exploratory pilot is excluded from the 36 final primary workers. No failed final functional case is omitted.

**Chrome and docs.** Chrome 156.0.8078.47 passes **150 product assertions** across the three schemas plus **310 existing compatibility assertions**, with **30 separately captured operation traces** and zero console errors. Required-child tests use the same explicit two-paragraph fixture in the proxy/backend and bundle; all five cases pass. No unexpected Chrome failure occurs in this run. Product/compat isolated builds, typecheck, docs build/link/English checks (**22 pages, 1,030 internal links**) pass. Browser memory and before/after native-input latency are not measured; actual OS IME remains separate. The dedicated test browser and three test proxies/backends are stopped after validation; the original review servers remain running.

**Records and execution.** `benchmarks/receive-model.mjs` and `receive-model-controls.mjs` accept a baseline/current module path and workload. `benchmarks/results/receive-model-2026-10-24/` contains the report, baseline reconstruction patch, all 54 fresh-process records, individual ordered samples, summaries, CPU profile summaries and validation receipt. Local inherited patch, source copy, profiles, first failures, browser evidence and isolated harnesses are under output/validation/receive-model-20261024/ and output/playwright/receive-model/. Existing commands remain valid. No commit, push or deployment is requested. User tabs, original data and review servers 60012, 62490 and 53138 remain protected.

## 5.31 Verified main integration

**Delivery scope.** Integrates the previously uncommitted work in §§5.27–5.30: Word/Notion/presentation native demos and schema-profile HTTP servers; Slate/Lexical root-interval projection and native-state cache guards; receipt-aware merged-selection browser checks; runtime ID metadata compression; receive/model materialization; regression tests, English guides and raw benchmark reports. The public package stays one package. Collaboration ordering, logical IDs, history ownership, hidden data, snapshots and wire contracts remain unchanged. Previous sections and measurement receipts retain their original per-run local/uncommitted descriptions; this section records the later user-authorized integration.

**Final checks (2026-10-25, Asia/Seoul).** Re-ran `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test`: **622 library + 16 demo + 27 documentation tests**, zero failures. Compatibility tests **31**, typecheck and isolated native product build pass. Root `npm run dev:products` startup passes using a separate bundle and fresh temporary backend storage. HTTP smoke checks all three profile pages, sample seeding and exact canonical server models. The earlier Chrome run is reused with verified current source/evidence hashes: **150 product + 310 compatibility assertions**, **30 separately captured operation traces**, zero console errors. These browser suites were not rerun for this integration because runtime sources are byte-identical to their verified receipt. Documentation build/link/English checks pass: **22 pages, 1,030 internal links**. No new performance run is made; the source-bound before/after reports and their limits remain in §§5.28–5.30.

**Scope review and publication.** Reviewed every changed path and new-file inventory. All new JSON files parse; no installed dependencies, generated bundles, user document data or credential patterns are included. Total new files are about 11.4 MiB; the largest is below 0.5 MiB. Product-demo dependencies already exist in the comparison harness manifests and its documented install command. `git diff --check` passes. The integration commit includes this section and targets `main` at `https://github.com/barocss/doc-sync.git`, based on `499c221`. The public documentation workflow runs automatically after this push; deployment outcome is verified separately from local tests.

**Evidence and preserved state.** `.dev/plans/main-integration-20261025/validation.json` binds the committed candidate files to this verification. Local test/build/smoke logs, inherited patch and final commit/remote receipts are under output/validation/main-integration-20261025/. The final commit SHA is recorded by Git and the post-push receipt, avoiding a self-referential hash in this section. Only the integration smoke server and its three temporary backends are stopped. Existing user tabs, data and review servers 60012, 62490 and 53138 remain running. Actual OS IME, browser heap/screen latency for the latest core change, long-running CI observation and release SLOs remain separate work.

## 5.32 Headless Node and MCP integration

**Scope.** `@barocss/doc-sync/node` exports `NodeHttpTransport`, which uses Node fetch and SSE to connect an existing `SyncClient` to the demo HTTP protocol. The private `apps/mcp` workspace uses the official MCP SDK over stdio. Its `get_schema`, `read_document`, `edit_document`, `undo` and `redo` tools operate through one long-lived participant. Edits are first checked on a cloned document; unknown input fields are rejected. Confirmation requires the participant's server echo. An unconfirmed result can mean that the server accepted the edit; the process retains pending changes only in memory and cannot recover them after exit. Per-session undo history is also in memory. Other participants' changes use the existing wire and collaboration rules. The public library remains one package. Configuration and examples are in `apps/docs/src/guide/ai.md`.

**Concurrency and current limits.** The edit base checks the MCP replica's epoch and `serverSeq`; it is not an atomic server-side precondition. A remote edit can be in flight after a read. Strict stale-path rejection requires a separately designed server-side conditional submission and safe rejection/recovery for optimistic local changes. The demo transport/server does not provide production authentication or authorization. Automatic SSE reconnection is tested with a controlled SSE server; the real-server test covers explicit disconnect/reconnect. A real-server accepted-change/lost-echo reconnection remains unverified. `read_document` permits inspection of local state and pending count when disconnected, but does not make an unknown server outcome definitive.

**Schema changes.** Schema objects are injected separately into clients and `DocHub`; neither the hello protocol nor snapshots negotiate a schema version or fingerprint. Mutating the schema during a live session is not supported, and loading a snapshot under another schema is not a complete migration or compatibility check. A future migration needs a shared version/fingerprint, rejection of incompatible peers, a coordinated editing boundary, preservation and reconciliation of pending edits, a validated state transformation that retains identities and hidden data, and an explicit history/rollback policy. Additive and incompatible changes both need compatibility analysis; no automatic migration was implemented here.

**Validation (2026-10-27, Node 24.22.1).** `npm test` passed **624 library + 16 demo + 27 docs + 4 MCP tests**. `npm run typecheck`, `npm run docs:build`, and `npm run docs:check` passed; the site check covered **23 pages and 1,097 internal links**. The separate editor compatibility suite passed **31 tests**. Its first sandboxed run failed four tests because `listen` on loopback returned `EPERM`; the permitted rerun passed all 31. The Node transport tests cover concurrent insertion, per-participant undo, and reconnect convergence using an isolated real demo server. An official SDK stdio client test covers AI formatting concurrent with a user's offline deletion, user undo restoring the formatted character, AI undo/redo, and replica convergence; it also checks local stale-base rejection and invalid-batch preservation. Lost-echo and process-lifetime cases are separately exercised. No Chrome, performance or real OS IME validation is claimed for this change.

**Actual Codex check.** Codex CLI connected to the final stdio MCP server and called `get_schema`, `read_document`, `edit_document`, then `read_document`. Its isolated edit returned `confirmed` with no pending changes, and an independent server read returned `Codex MCP verified`. The first Codex run could read but its edit was blocked by the noninteractive approval policy; the final run approved only this isolated test's edit tool in its invocation. No persistent Codex settings were changed. Local source hashes, Codex JSONL, server state and test logs are in `output/validation/mcp-node-20261027/`; this ignored directory is not a committed artifact. No commit, push or deployment was requested.

## 5.33 Atomic edit bases and compatible schema transitions

**Scope and compatibility.** Protocol 3 adds a canonical SHA-256 fingerprint of the complete finite plain-JSON schema, including UI metadata. It replaces protocol 2 because a schema identity is required on schema-aware connections and writes. Older protocol 2 clients are rejected and must be upgraded together with the server. The explicitly schema-free mode remains unverified and cannot transition schemas. Schema definitions are validated and copied before use; clients and hubs do not adopt caller mutations. `apps/demo/compat/remote-edit.mjs` checks and transmits the schema version as well.

**Atomic edits.** `edit_document` uses the exact `{epoch, serverSeq, schemaVersion}` returned by the read. The demo server checks this base and applies the CRDT change in one synchronous hub operation. Edits are prepared on a clone; stale or incompatible bases do not mutate the local document, sequence, pending queue, or undo history. Exact conditional receipts bind base, actor, sequence and payload, and are persisted with the operation. In the same epoch, an exact retry can identify an earlier acceptance after other edits or a compatible schema transition. A different base, payload or ordinary change is not a receipt. Epoch is checked before retry matching, so reset/restart cannot mistake a later identical change for the old request. A lost response across epoch change remains **unconfirmed**; the request and local state remain available in the live client for manual reconciliation. An HTTP timeout also remains unconfirmed. The MCP process keeps pending requests and history in memory only; process exit does not durably preserve them.

**Schema transitions.** `DocHub.transitionSchema` atomically checks epoch, server sequence and schema fingerprint. The first supported transition is conservative: existing rules must remain unchanged; eligible new nodes, children and marks can be appended, subject to compatibility checks. Removing or narrowing rules, changing existing attributes/defaults or changing grouping interpretation is rejected. A transition that first requires `fields-v1` or `cardinality-v1` can be refused if the old snapshot lacks the required capability. The hub restores a validated snapshot under the new schema without resetting document identities. The demo records transitions in order and refuses to open a document if log replay fails. Connected old-schema clients stop; explicit `SyncClient.upgradeSchema` or MCP `upgrade_schema` validates the compatible extension and reconnects while retaining live pending edits and history. Applications must rebuild editor bindings and restore selection for the new schema; active editor hot migration is not established. Incompatible schema migrations and durable offline recovery remain separate work. Demo endpoints do not implement authentication or authorization.

**Tests (2026-10-27, Node 24.22.1).** The final `npm test` passed **645 library + 20 demo + 27 docs + 11 MCP tests**. The separate comparison-editor suite passed **32**. Typecheck, docs build, docs checks (**23 pages, 1,098 internal links**) and `git diff --check` passed. The new tests cover stale bases, concurrent edit/transition ordering, exact-retry receipts, persistence failure, damaged-log rejection, old-schema writes, protocol 2 rejection, lost replies, pending edits and undo/redo through transition, and hidden merged-cell content. Listener failures after acceptance cannot turn a committed hub operation into a rejection; callback failures during conditional finalization are recorded without losing the accepted edit or undo. An intermediate suite initially failed one old header fixture and one MCP tool-list assertion; both were corrected and the final suite passed. The protocol migration's first focused run also needed an old response expectation updated from 2 to 3. Earlier sandboxed HTTP runs returned `EPERM` on loopback; permitted reruns passed. No fresh Chrome, real OS IME or performance acceptance is claimed.

**Actual Codex check.** Codex CLI connected to the final MCP source using an isolated demo document, inserted `Codex final atomic verified` with a confirmed conditional edit, added `codexReview` through `transition_schema`, and received a stale-base rejection when it reused the old schema revision. A separate server-state and schema read confirmed the text, server sequence 1, matching schema fingerprint and new mark. The stale rejection observed by Codex occurred at the local base check; independent HTTP tests exercise the server's atomic rejection. Source hashes, logs, Codex JSONL and server state are stored in the ignored local `output/validation/atomic-schema-20261027/` directory. No commit, push or deployment was requested.

## 5.34 Numbered roadmap and current integration

**Plan.** [`apps/docs/src/roadmap.md`](apps/docs/src/roadmap.md) is the current numbered order and separates implemented behavior, local proof and completion conditions. [`docs/recovery-plan.md`](docs/recovery-plan.md) specifies a proposed review-only conditional intent journal and later server receipt, history and GC contracts. It is a design, not a completed recovery implementation. Protocol 3/browser integration is complete for the bounded item 1 scope; item 2 has started but durable restart recovery remains open.

**Fixes and evidence.** Chrome initially found that `apps/demo/products/main.jsx` dropped the `schemaVersion` argument in its instrumented transport wrapper. Edits received repeated HTTP 409 responses and stayed pending. The wrapper now forwards it. In a fresh isolated Chrome 156.0.8078.48 session, all **90 native input/selection/undo/redo checks and 39 structural checks** passed across three product profiles and the Slate, Lexical and ProseMirror bindings; final console errors and warnings were zero. The original failure, final JSON, browser logs, source hashes and screenshots are in `output/playwright/protocol3-roadmap-f3acOhoK/` and `output/playwright/protocol3-roadmap-8RoRXOmD/`. These checks do not establish actual OS IME, performance or editor binding reconstruction during a schema transition.

MCP shutdown no longer sends `leave` while an ordinary or conditional edit is unconfirmed. A normal leave has a five-second timeout. This retains only the server's existing acknowledgment and pin during its current lease; it does not persist pending requests, create an unconfirmed deletion pin, extend the lease, or recover history after process exit. The latest aggregate run passed **645 library + 20 demo + 27 docs + 15 MCP tests**, plus **32 compatibility tests**; typecheck passed. A fresh actual Codex MCP session confirmed an edit and a compatible schema transition, then rejected an old schema revision. Independent server state confirmed the text and schema. Logs and source hashes are in `output/validation/roadmap-integration-20261027/`. The product wrapper was subsequently covered by the fresh Chrome run. Final documentation build and link checks passed **25 pages and 1,249 internal links**. Live editor schema rebinding, production operation, actual OS IME and current performance gates remain open.

**Evidence incident.** The first native Chrome script used a hard-coded screenshot path and overwrote the prior untracked `output/playwright/product-native/{word,notion,presentation}-desktop.png` files. Their prior hashes were found in the historical validation record, but no byte-identical copies were found in `output/`; the original three files were not recovered. Similar `*-desktop-final.png` files remain but are not verified as identical. The native and UI scripts now write screenshots into per-run directories. These screenshot-path changes were syntax checked after the browser run; the browser receipt records the tested runtime source hashes, and the structure check used an isolated screenshot path. Existing unrelated user servers and tabs were preserved.

## 5.35 Durable conditional intent and restart evidence

This section records the earlier implementation. Section 5.36 supersedes its recovery limitations and test counts.

**Scope.** MCP conditional `edit_document` requests now have a review-only durable journal. On macOS, a private single-writer journal is enabled by default under `~/.local/state/doc-sync/recovery`; `DOC_SYNC_JOURNAL_DIR` supplies another stable directory and `DOC_SYNC_JOURNAL=off` explicitly selects the old ephemeral mode. The file is keyed by document ID, so independent servers or actors with the same document ID need separate directories. The macOS kernel lock is released on process termination; journal writes use a same-directory temporary file, file and directory sync, atomic rename, a bounded 16 MiB record, and request/record digests. The exact actor, document generation, base, change, model edits, pre-edit snapshot and schema are saved before the conditional POST. If persistence fails before the first send, the result is `not_sent`; an error after a possible send remains unconfirmed. A matching retry re-syncs and validates existing evidence before any send. If cleanup cannot be confirmed, the session reports uncertainty and blocks another edit.

**Restart contract.** An unresolved record starts the MCP session in `recovery_required` without connecting as the actor, acknowledging, retrying, editing, or changing schema. `recovery_status` exposes the preserved record and an exact read-only receipt result. New demo logs store a document generation across server restart; reset changes it. The single-process demo checks the complete durable log and returns `accepted` only for an exact generation/base/actor/sequence/payload receipt. Missing, legacy, pruned or different-generation evidence returns `unknown`, not rejection. A missing receipt query does not create a document. The server persists log entries and schema changes before acknowledgment, rejects requests holding a poisoned stale hub after storage uncertainty, closes its streams for safe reconnect, prevents stale scheduled GC, and returns an uncertain outcome after post-persist installation failures. This is a local demo-server storage boundary, not multi-server or production authorization.

**Process evidence.** Two macOS subprocess cases use real MCP stdio, an isolated proxy and `SIGKILL`: after journal persistence but before proxy forwarding, and after server acceptance but before response. Each restarts the demo server, applies a human edit, restarts MCP with the same journal and verifies no recovery stream, ACK or automatic retry. In the first case the original intent remains and receipt is `unknown`; in the second it remains and the exact receipt is `accepted`, with a single server application. Both preserve the human edit and original journal bytes. These tests do not prove intent survives a kill before journal persistence, power loss, multi-server operation or automatic history restoration. A fresh actual Codex MCP session also confirmed a journaled edit and a clear recovery status after its echo.

**Verification and first failures.** Final `npm test`: **649 library + 26 demo + 27 docs + 29 MCP passed**, with **one non-macOS journal test skipped**; separate compatibility tests **32 passed**. Typecheck, docs build, docs link/English checks (**25 pages, 1,251 links**) and `git diff --check` passed. Recovery tests include stale rejection, lost replies, journal corruption and write failure, rename followed by directory-sync failure, listener and post-persist failures, stale in-flight server requests and GC, restart/reset, and other-user edits. The first typecheck exposed a test environment type error and passed after correction. The first accepted-after-restart process test returned `unknown` because the receipt request lacked the protocol header; it passed after the header fix. Source hashes, final logs, Codex JSONL and independent server state are in the ignored local `output/validation/recovery-journal-20261027/` directory. Earlier Chrome results in §5.34 precede this server storage change; no fresh Chrome or performance claim is made.

**Remaining work.** Roadmap item 2 remains open. Ordinary undo/redo and their pending operations are not journaled; undo/redo History and previous-value ownership are not restored after process exit. The current record is inspect-only: it has no automatic replay, history reconstruction or automatic session resume. Existing acknowledged pins survive only their current lease, and a server restart or GC can prevent undo recovery. Enabled journals fail closed outside macOS; the explicit opt-out removes durability. Server logs and fsync are implemented for a single demo process on the tested filesystem; power-loss durability and multi-server consistency remain unverified. See [`docs/recovery-plan.md`](docs/recovery-plan.md) for the staged remaining contracts.

## 5.36 Protected MCP history and pending-change recovery

This section records the earlier recovery implementation. Section 5.37 adds a safe history-discard and reservation-release operation.

**Scope.** The macOS MCP app now writes a versioned private checkpoint containing the actor, schema, document snapshot, pending ordinary changes, deletion sequences, and undo/redo history. History snapshots preserve grouping and shared formatting, move and split ownership. Before sending an ordinary undo or redo, the app disconnects and flushes the resulting checkpoint. The demo server durably records a reservation for the checkpoint before edits are allowed; the reservation is independent of the ordinary peer lease and survives a server restart. Different reservation IDs for the same actor remain independent. A prepared checkpoint records the ID before reservation creation, so a process interruption does not make that ID unavailable locally.

**Automatic recovery.** At restart, the app checks the generation, schema, original reservation and GC boundary before it joins. The demo server's atomic recovery submission either identifies the exact accepted ordinary change or accepts that same change once; another payload at the same actor and sequence is rejected. The client requests a complete server snapshot to merge other participants' edits and restore its history. An accepted conditional edit is restored only after an exact receipt; an unknown conditional outcome stays in `recovery_required` with its intent preserved. Generation/schema mismatch, missing protection, conflicting sequence, storage uncertainty, or unavailable recovery also blocks automatic recovery. Existing collaboration rules remain in force. `SyncClient` exposes checkpoint mechanisms, but applications outside MCP must provide their own durable storage and protection.

**Evidence.** On macOS with Node v24.22.1, a workspace run passed **666 library, 29 demo, 27 documentation, and 39 MCP tests**, with one non-macOS MCP test skipped. After that run, a recovery guard was added to prevent schema changes while recovery is blocked; the MCP suite, typecheck and documentation tests were rerun. The separate comparison-editor suite passed **32 tests**. Documentation build, documentation checks (**25 pages, 1,250 internal links**), and `git diff --check` passed. Real MCP and demo subprocess tests cover SIGKILL before send and after server acceptance for both undo and redo, repeated MCP and server restarts, another user's edit, accepted conditional recovery, an unknown conditional intent, and recovery after a temporary server failure. They assert no duplicate application and test subsequent undo/redo. A separate server subprocess test advances its controlled clock by 121 seconds to test ordinary lease expiry; it is not a real-time two-minute wait. History tests also cover shared formatting ownership, concurrent deletion, move, split, typing grouping and GC metadata. The final source was an uncommitted working tree based on `be9f346dfde740f5da95b9a18d200bae22bf7360`; source hashes and logs are in `output/validation/roadmap2-recovery-20261027/`.

**First failures and limits.** The first workspace run had one lock-test failure because its child process no longer retained the journal object; the test now retains it, and the full rerun passed. The first comparison-editor run encountered sandbox `listen EPERM`; its isolated-port retry passed. Earlier process tests expected accepted conditional intents to remain review-only; their expectations were updated to verify automatic recovery, undo/redo and preservation of the other user's edit. The earlier Chrome evidence in §5.34 predates these server changes; no new browser, OS IME, performance, power-loss or multi-server claim is made.

**Remaining work.** Roadmap item 2 is still in progress. Unknown conditional outcomes require inspection; schema changes across an interrupted operation and broader concurrent failure cases need more coverage. Reservations do not expire and can hold back GC; MCP does not yet expose a safe discard-and-release operation. The durable journal is macOS-only; `DOC_SYNC_JOURNAL=off` explicitly selects an ephemeral session. The demo uses a single local server process without authentication or production retention guarantees. The [recovery plan](docs/recovery-plan.md) records the remaining lifecycle and failure cases. No commit or push was performed for this work.

## 5.37 Safe history discard and reservation release

This section records the earlier reservation-release implementation. Section 5.38 adds bounded released-reservation metadata for the normal demo-server path.

**Scope and contract.** The MCP `discard_history` tool permanently clears the calling actor's undo and redo history. It rejects pending or uncertain local edits and conditional intents. If the disk checkpoint still contains a change after a late echo, the server must prove that exact change was accepted before discard can continue. The session disconnects, records an empty history with a `releasePending` marker, and flushes the checkpoint before requesting release of its own old reservation. Another actor's document changes and other reservation IDs are not removed. A successful release is idempotent; the demo server records a released-ID tombstone and refuses to reuse that ID in the same generation. After release the session records a fresh reservation ID, establishes new protection and reconnects using a full server snapshot before accepting more edits. Existing version-1 checkpoints without a release marker remain readable.

**Interruption handling.** If the process stops before the marker is durable, the old checkpoint and reservation remain the recovery path. If it stops after the marker, startup retries release before reconnecting. If release or the new reservation has an uncertain outcome, the durable marker or prepared checkpoint is retained and editing remains blocked until a later restart resolves it. A changed generation or schema also blocks completion instead of guessing. Ordinary peer pins and other recovery reservations can still postpone GC. The demo server schedules its normal GC after a successful release; release does not guarantee immediate compaction.

**Verification.** On macOS with Node v24.22.1, the final `npm test` passed **669 library, 30 demo, 27 documentation, and 51 MCP tests**, with one non-macOS MCP test skipped. Comparison-editor tests passed **32**, and typecheck, documentation build, documentation checks (**25 pages, 1,251 internal links**), and `git diff --check` passed. Six real MCP/server process tests cover normal discard and GC, process termination before release and after server acceptance, server restart, other users' edits and reservations, unresolved ordinary and conditional edits, and a late echo with an unknown exact receipt. Six additional injected-failure tests cover checkpoint errors before and after a completed write, lost release responses, new-reservation errors before and after acceptance, and late-echo receipt uncertainty. Server tests cover independent reservations, restart, GC, repeated release, delayed reservation requests and generation reset. These are process and local-filesystem tests; they do not establish power-loss durability or production readiness.

**First failures and limits.** The first aggregate run failed only because the SDK integration test's exact tool list did not yet include `discard_history`; its expectation was updated and the full run passed. An early focused test used a TypeScript parameter property unsupported by Node's strip-only execution and was corrected before the final run. The demo remains a single unauthenticated server process, and the durable MCP journal remains macOS-only. Released-ID tombstones and the server log grow without a retention or compaction policy. Old logs that already reused a released reservation ID cannot distinguish a delayed old release from a newer use of that same ID; new reservations use fresh UUIDs and cannot reuse released IDs. A schema or generation change during discard requires inspection rather than automatic completion. Earlier Chrome evidence predates these changes; no new browser, OS IME, performance, power-loss or multi-server claim is made. The source remains uncommitted on top of `be9f346dfde740f5da95b9a18d200bae22bf7360`; saved logs and source hashes are in `output/validation/discard-history-20261027-uBlLV3/`. No commit or push was performed.

## 5.38 Recovery reservation metadata compaction

This section records the earlier synchronous compaction. Section 5.39 moves active-document compaction and receipt verification off the HTTP event loop.

**Implementation.** The single-process demo server compacts recovery reservation metadata after 128 recorded events by default; `RECOVERY_COMPACT_THRESHOLD` selects another positive threshold. Each compaction atomically advances a durable reservation era and retains every active `(actor, reservationId, pin)`. An active older-era reservation remains recoverable and continues to constrain GC. An inactive sealed-era ID cannot be reserved again; its repeated release is an idempotent no-op. New MCP reservations use era-qualified UUIDs. An unconfirmed prepared checkpoint may be rekeyed after its era is sealed only when its history, pending changes and conditional intent are empty. Confirmed or nonempty checkpoints are never silently rekeyed. Original version-1 checkpoints and active legacy IDs remain readable.

**Storage and safety.** Before replacement, the server validates the whole durable log against live document state, ordered envelopes, exact conditional receipts and active reservations. It retains all document changes, GC records, schema transitions and receipt data in their original order, removes old recovery metadata and appends one canonical recovery state. Replacement uses a same-directory temporary file, file sync, atomic rename and directory sync. An uncertain failure invalidates the live hub; corrupt or inconsistent source is not rewritten. An incompatible pre-existing legacy ID or future-era-shaped tombstone defers compaction instead of dropping protection or blocking the accepted reservation operation. Metadata can grow while compaction is deferred. The old ambiguity for legacy logs that already reused a released ID remains; older unversioned clients cannot create new reservations after an era is sealed.

**Evidence.** On Darwin arm64 with Node v24.22.1, `npm test` passed **675 library, 35 demo, 27 documentation and 58 MCP tests**, with one non-macOS test skipped. Comparison-editor tests passed **32**, as did typecheck, docs build, docs checks (**25 pages, 1,251 internal links**) and `git diff --check`. Real server and MCP subprocess tests cover active old-era pins, stale reserve/release/recovery requests, GC, another user's changes, exact receipts, prepared and release-pending checkpoints, and SIGKILL/restart. Separate synthetic checkpoint fixtures verify that history, pending edits or a conditional intent prevent unsafe rekeying. Server tests cover corrupted source, changed conditional receipt metadata, legacy deferral and repeated compaction. Direct operating-system rename/directory-fsync fault injection and power-loss tests were not run.

**Measurement and limits.** In one paired 48-cycle local fixture, threshold 10,000 produced **10,343 bytes and 97 recovery records**; threshold 8 produced **812 bytes and one recovery record**. Both retained the document, exact receipt and active pin after server restart. These are file sizes for two configurations of the same source, not heap, latency or throughput measurements. The default threshold is 128. Document logs and active reservations still grow, and compaction synchronously reads, replays, compares and rewrites the full log; large-log latency and peak memory were not measured. See the [measurement report](benchmarks/results/recovery-retention-2026-10-27/report.md) for conditions and limits. The source is uncommitted on base `be9f346dfde740f5da95b9a18d200bae22bf7360`; raw logs and source hashes are in `output/validation/recovery-retention-20261027-SWu7RT/`. No commit or push was performed.

**First failures and remaining scope.** A parallel intermediate typecheck ran before the hub API was complete, and a test used an overly narrow inferred UUID type; both were fixed before the passing aggregate run. The demo remains an unauthenticated single server process; generation-free legacy logs are not compacted. Old clients and ambiguous legacy ID reuse retain the limitations above. Active reservations, document log retention, production authorization, multi-server consistency, and power-loss durability remain separate work. Earlier Chrome evidence predates these server changes; no new browser or OS IME claim is made.

## 5.39 Large recovery log event-loop bottleneck

This section records the earlier implementation. Section 5.40 supersedes its statements about synchronous first load, append, and publication sync.

**Implementation.** The demo server maintains a durable log byte-digest anchor and an incremental digest and revision for each fsynced append, including conditional receipt metadata. A worker reads and verifies the full source, prepares the recovery-metadata replacement and syncs its temporary file without running that work on the HTTP event loop. The server checks the source identity, live hub, document generation and durable revision before atomic rename, directory sync and era installation. Concurrent writes or reset discard a stale candidate; three attempts are made before a later background retry. Corrupt or inconsistent source invalidates the hub instead of replacing the log. Active pins and all change, GC, schema and exact receipt records remain protected. Live-document receipt queries also verify the durable source in a worker, with one in-flight verification shared per document; a changed revision is retried. A missing document remains a read-only unknown result.

**Large-log measurement.** With the same 30,000-change, 5,093,177-byte fixture, two warmups and 12 samples per source on Darwin arm64 / Node v24.22.1, nearest-rank median/p95 in milliseconds were: compaction HTTP **374.40/482.80 → 137.57/194.27**; separate edit started about 1 ms later **379.17/494.42 → 20.76/34.22**; exact receipt HTTP **263.51/342.42 → 35.42/116.42**; and separate state read started about 1 ms after that receipt **262.29/341.15 → 1.27/2.41**. The second request finished first in 0/12 before and 12/12 after samples for each pair. Every sample checked document state, exact receipt, active reservation, compaction completion and server restart. This is one-character repeated formatting in a large accumulated log, measured as local HTTP responses; it is not a large visible document, editor latency or heap test. With 12 samples p95 is the maximum, runs were sequential rather than ABBA, and shared-host load differed. See the [report](benchmarks/results/recovery-log-2026-10-27/report.md) and its raw JSON for all conditions, hashes and samples.

**Verification.** Final workspace `npm test` passed **675 library, 43 demo, 27 docs and 59 MCP tests**, with one non-macOS MCP test skipped; comparison-editor tests passed **32**. Typecheck, docs build, docs link/English checks and `git diff --check` passed. Eight real-process large-log tests use 20,000 actual formatting changes and a 3,388,529-byte log. Deterministic test-only worker gates establish overlap with a human edit, GC, reservation change, reset, a same-length conditional receipt modification and server SIGKILL/restart. Tests verify coalesced concurrent receipt queries, accepted versus unknown receipts and that a missing-document query creates no file. The gated corruption case preserves an already accepted concurrent edit. A separate real stdio test runs two MCP agents on the same document with distinct actors and journals: one stale conditional edit is rejected, the agent reads again and retries, and each actor's undo/redo preserves the other's edit. Synthetic failure fixtures and process tests do not establish physical power-loss safety.

**Limits.** First document load and cold receipt queries still replay the complete log synchronously. Append/file fsync and final rename/directory fsync remain synchronous. Workers still read full logs into memory; cross-document worker concurrency has no global bound. Continuous writes can delay compaction, and force-killed workers can leave their own temporary files. Direct OS rename/fsync failure injection and power-loss, multi-server, authentication and production retention remain unverified. The server is a local demo; the MCP durable journal remains macOS-only. Earlier Chrome evidence predates these changes; no new browser or OS IME claim is made. The source remains uncommitted on base `be9f346dfde740f5da95b9a18d200bae22bf7360`; validation logs are in `output/validation/recovery-log-20261027-dhcoN1/`. No commit or push was performed.

## 5.40 Cold log replay and durable file synchronization

**Implementation.** First access shares one in-flight load per document. File reads, file synchronization, rename and directory synchronization use asynchronous filesystem operations. Log replay retains the existing validation and order, and yields after batches of 128 records. Same-document mutations and publication remain serialized. A mutation stages its exact durable record without exposing state or events, persists and syncs it, then commits it to the hub. Source identity and the durable revision are checked around asynchronous work; an uncertain or changed source invalidates the hub instead of acknowledging unproven state. Reset and recovery-metadata compaction use the same publication discipline. Active reservations, exact receipts, GC constraints and existing collaboration rules remain in force. A reservation reply is rechecked after compaction so that a concurrent release cannot produce a stale protected reply.

**Measured result.** A local HTTP test used the same 5,093,156-byte log with 30,000 real CRDT changes, two warmups and 12 measured samples per version. Median / nearest-rank p95 for the first state request was **258.56 / 267.62 ms before and 263.52 / 273.43 ms after**. A separate warm document's append started about 1 ms after the cold request was **263.31 / 271.20 ms before and 13.94 / 14.88 ms after**. It finished before the cold response in 0/12 before and 12/12 after samples. A separate warm append without cold replay was **5.18 / 6.25 ms before and 5.99 / 6.28 ms after**. The change reduces interference between documents in this test; it does not establish a faster first-open response or faster standalone fsync. The fixture is a long edit history with one visible character, not a large rendered document. The client timer does not prove server request arrival order; p95 is the maximum of 12 samples and the runs were sequential on a shared host. The [report](benchmarks/results/cold-recovery-2026-10-27/report.md) records raw samples, conditions, checks and source hashes.

**Verification.** Final local `npm test` passed **680 library, 57 demo, 27 docs and 59 MCP tests**; one platform-specific MCP test was skipped. Comparison-editor tests passed **32**. Typecheck, docs build, docs checks (**25 pages, 1,252 internal links**) and `git diff --check` passed; the docs tests were rerun after the roadmap update. Fourteen new real-server tests use a log with 20,000 actual changes and cover shared cold load, other-document progress, queued same-document mutations, GC and recovery pins, exact receipts, corrupted or replaced files, reset, concurrent release and compaction, and SIGKILL after file sync before in-memory commit followed by restart. Five core staging tests cover pre-commit invisibility, persistence before GC, changed reservations, reentrant listeners and a changing GC frontier. Earlier large-log tests and the two-agent MCP concurrency test also pass in the aggregate suite. Tests validate process interruption and the local filesystem, not physical power loss.

**Failures and limits.** A sandboxed benchmark smoke run could not bind a loopback port (`listen EPERM`); the local-server benchmark succeeded with permission. One intermediate race test expected a normal unknown receipt but received a safe 503 during concurrent reset; its assertion now also accepts that uncertain result and rejects a false accepted receipt. Two existing tamper tests were updated: the new pre-write identity check rejects modified bytes before appending a release. Replay still reads the complete log into memory and runs each record on the main thread; a single expensive record can block it. File identity checks include synchronous metadata calls. Cross-document worker concurrency remains unbounded, and sustained writes can delay compaction. Actual OS fsync/rename failures, physical power loss, multi-server consistency, authentication, production storage and current-source Chrome or OS IME behavior were not tested. The server is a local demo and the MCP durable journal remains macOS-only. The source is uncommitted on base `be9f346dfde740f5da95b9a18d200bae22bf7360`; validation logs are in `output/validation/cold-recovery-20261027-Yyl8pa/`. No commit or push was performed.

## 5.41 Main integration validation

The accumulated changes through §5.40 were prepared for integration on `main` from base `be9f346dfde740f5da95b9a18d200bae22bf7360`. The earlier statements that no commit or push was performed describe their respective checkpoints. Before integration, `npm test` passed **680 library, 57 demo, 27 documentation and 59 MCP tests**, with one platform-specific MCP test skipped; comparison-editor tests passed **32**. Typecheck, docs build and docs checks (**25 pages, 1,252 internal links**) passed. The benchmark's recorded server, worker, core staging and hub source hashes still matched the measured files. The saved pre-push logs are under `output/validation/cold-recovery-20261027-Yyl8pa/`. These tests do not add browser, operating-system IME or power-loss evidence.

## 5.42 Codex and editor collaboration in Chrome

**Scope.** Starting at `main` commit `1343183c990006af512719f8b0b5ed73a918752a`, an isolated product-demo server, document, journal and Chrome 156.0.8078.48 sessions were used. An actual Codex CLI process connected to the real stdio MCP server, with a separate actor and a Word-style schema. Each of Slate, Lexical and ProseMirror made a native browser edit and held a forward selection while Codex read the same document and inserted text. The selected text survived the insertion; the native model, client models and server agreed. Each editor's undo and redo preserved the Codex edit. Each Codex edit returned `confirmed`.

**Reconnect and agent history.** Chrome network emulation disconnected all three editor peers. Slate created an offline edit with one pending operation while Codex independently inserted text into the same server document. After network restoration, the pending operation reached the server, all three peers returned online with zero pending operations, and native, client and server models agreed with both edits present. In a subsequent real Codex session using the same protected journal, MCP undo removed the agent's last insertion without removing the offline user edit, and redo restored it. The three browser peers matched the server after redo. This is a simulated network interruption, not a browser or server process restart.

**Additional Chrome checks.** The corrected `checks-native.js` passed **90/90** native checks: 30 each for the Word-style, Notion-style and presentation profiles across all three editor bindings. These cover Unicode input, forward and backward selections, concurrent remote input, formatting and text undo/redo, split/join and native/client/server convergence. Their remote participant is the demo test client; the actual Codex interleaving above uses the Word-style profile only. The final native browser console reported zero errors and warnings. Browser input and selection were automated; real human editing, OS IME, editor schema rebinding, production performance and power-loss behavior were not established.

**Failures and corrections.** The first Codex invocation used an account-unsupported default model; two alternative model attempts were also unsupported. A supported account model then connected, but its first write was blocked by the noninteractive tool-approval policy. The final isolated invocation explicitly enabled only the requested test edit tool; no persistent Codex settings changed. The first reconnect probe observed one pending operation because its asynchronous browser wait treated a promise as a successful predicate. A bounded polling check then confirmed eventual convergence. The same wait defect existed in `apps/demo/products/checks-native.js`; it now explicitly awaits snapshots until they agree, and all 90 checks were rerun. A full Node run also exposed a history-recovery test comparing two separately recorded wall-clock timestamps one millisecond apart. The test now fixes its clock; the production history and collaboration rules were not changed. Preserve the first failures alongside the final evidence.

**Evidence.** After the fixes, `npm test` passed **680 library, 57 demo, 27 docs and 59 MCP tests**, with one platform-specific MCP test skipped. Comparison-editor tests passed **32**; typecheck, docs build, docs checks (**25 pages, 1,252 internal links**) and `git diff --check` passed. The seven focused history-recovery tests also passed on Node 22.19.0. Fresh logs, Codex JSONL tool calls, browser results, screenshots, initial failures and source hashes are under `output/playwright/codex-editors-20261028-fFRugR/`, which is local and ignored by Git. The test document and processes were isolated from existing user sessions. No commit or push was requested.

## 5.43 Main integration verification

The four changed files from §5.42 were reviewed for integration on `main`, based on `1343183c990006af512719f8b0b5ed73a918752a`. The no-commit statement in §5.42 describes that earlier checkpoint. No collaboration runtime code changed in this integration. A fresh `npm test` passed **680 library, 57 demo, 27 documentation and 59 MCP tests**, with one platform-specific MCP test skipped. Comparison-editor tests passed **32**. Typecheck, native-check script syntax, docs build, docs checks (**25 pages, 1,252 internal links**) and `git diff --check` passed. The §5.42 Chrome and actual Codex results were not rerun for this integration; their recorded checks for the native test script, product app, server, MCP session, sync client and browser bundle still match these files. Their scope and limitations remain as recorded in §5.42. Fresh integration logs are in `output/validation/main-integration-20261028-Vx4Vxu/`, which is local and ignored by Git.

## 5.44 Schema transitions in open editors

**Implementation.** `upgradeOpenEditorSchema` in the sync entry point coordinates an application-owned editor after the server accepts a compatible schema. A synchronous host pauses input, reports a model text selection, prepares replacement resources without modifying the mounted view, and detaches it. The helper validates compatibility and a replacement document snapshot, anchors both selection endpoints to CRDT tokens, upgrades the existing client, resolves the selection and installs the replacement. It waits for a verified connection before resuming input. Pending operations and the client's history remain on the same client. Concurrent transitions on one client are rejected. A known document epoch change during reconnect is intercepted before the client can reset its local document or history, even if an existing event callback throws.

**Application integration.** The product demo implements the host for Slate, Lexical and ProseMirror. It preflights every peer, rebuilds each native editor and binding, restores forward or backward text selections or a caret, and retains each participant's client. **Load server schema** fetches an already accepted schema and performs the rebuild; it does not propose a transition. Active composition and unsupported native selections are rejected before teardown. If preparation fails, the old editor resumes; if detachment, installation or reconnect fails, the client disconnects and the affected editor stays paused for inspection. The host must block all input and preserve its own composition draft; native plugins and codecs are application responsibilities. Compatible additions only are supported. Incompatible schema migration, process-level recovery during rebuilding and automatic application plugin migration are not implemented.

**Verification.** Chrome 156.0.8078.48 passed **28/28** schema checks: 27 combinations of three product profiles, three editors and forward/backward/caret selection, plus one synthetic Slate composition guard and retry. Each combination starts with one offline pending user edit, accepts a different participant's edit and a server schema transition, uses the actual UI button, checks token selection after reconnect, verifies native/client/server convergence and undo/redo, then verifies native typing and an added atom type. The complete model comparison includes each rich sample; this is not an exhaustive hidden-cell migration proof. The existing **90/90** native input, selection and history Chrome checks also passed. The final browser console had zero errors and warnings. Synthetic composition is not a real OS IME test. The seven-plus-one focused Node cases cover invalid schema, preparation and installation failures, selection failure, composition refusal, pending and remote edits, reconnect timeout and retry, competing schema changes and reset during installation.

**Aggregate and limits.** On Node 24.22.1, the final package and workspace runs passed **688 library, 57 demo, 27 docs and 59 MCP tests**, with one platform-specific MCP test skipped; comparison-editor tests passed **32**. Typecheck, docs build, docs checks (**25 pages, 1,254 internal links**) and `git diff --check` passed. The eight focused cases also passed on Node 22.19.0. An intermediate typecheck rejected a test's mutation of readonly marks; the test was corrected and the final check passed. The product demo was rebuilt and the final Chrome tests were rerun after the runtime changes. An actual Codex MCP/editor scenario was not rerun in this task. Full document snapshots are constructed during preflight; no large-document transition performance or real OS IME result is claimed. Source hashes, logs and screenshots are in `output/playwright/schema-rebind-20261028-wDPdZk/`, which is local and ignored by Git. The source is uncommitted on base `d5f1192b1cbe2235d199bf4be64bfe3a40da5eb7`. No commit or push was requested.

## 5.45 Main integration verification for open-editor transitions

The changes described in §5.44 were reviewed for integration on `main`, based on `d5f1192b1cbe2235d199bf4be64bfe3a40da5eb7`. The no-commit statement in §5.44 describes that earlier checkpoint. A fresh `npm test` passed **688 library, 57 demo, 27 documentation and 59 MCP tests**, with one platform-specific MCP test skipped. Comparison-editor tests passed **32**. Typecheck, schema-check script syntax, docs build, docs checks (**25 pages, 1,254 internal links**) and `git diff --check` passed. The Chrome checks in §5.44 were not rerun for this integration. The recorded hashes of the product app, schema-check and native-check scripts, transition helper, sync client and entry point, focused test and browser bundle still match. Their scope and limitations remain as recorded in §5.44. Fresh integration logs are in `output/validation/schema-main-20261028-EZRZXc/`, which is local and ignored by Git.

## 5.46 Documentation-site refresh

Added a dedicated open-editor schema transition guide with the host lifecycle, selection conversion fragments for Slate, Lexical and ProseMirror, failure handling and tested limits. The sidebar, schema, synchronization, editor and API pages link to it. Corrected the public API entry-point list, the overview's operation count, and stale status and recovery descriptions. The authoritative state and intent documents now distinguish ordinary `SyncClient` reconnect from the bounded macOS MCP recovery path; the documentation build generates their reference pages from those sources. No runtime collaboration behavior changed.

Documentation tests passed **28/28**; the production build and static checks passed for **26 pages and 1,350 internal links**. Typecheck and `git diff --check` passed. Chrome 156.0.8078.48 verified the three editor-guide links, API entries, recovery status, code-copy controls and a 390px viewport without page errors or document overflow. Local search found the transition guide and navigated to its section. The first automated visual check looked for a heading's exact accessible name and timed out on its permalink; a corrected anchor-based check passed. Screenshots and logs are in `output/playwright/docs-refresh-20261028-jMh8Wb/` and `output/validation/docs-refresh-20261028-jMh8Wb/`, which are local and ignored by Git. These are documentation checks, not new editor, OS IME or recovery runtime evidence. This update was prepared on base `4804edd8249372cc340f5bf2d42664b15f3e79b8` for GitHub Pages publication.

## 5.47 Documentation publication verification

Documentation source commit `a34ea5979d383311fe6757c58a967c5f5c60d874` was pushed to `main`; [GitHub Pages run 40655087905](https://github.com/barocss/doc-sync/actions/runs/40655087905) completed successfully. Chrome 156.0.8078.48 loaded the public transition guide and checked the three editor-guide links, API entries, recovery status, code-copy controls and a 390px viewport without page errors or document overflow in a settled run. Public search for `upgradeOpenEditorSchema` found the new guide and navigated to its section. Nine further fast navigations across the three editor links passed without reported errors. Public screenshots and logs are under `output/playwright/docs-refresh-20261028-jMh8Wb/` and `output/validation/docs-refresh-20261028-jMh8Wb/`.

The first public navigation probe observed a hydration mismatch and did not render the requested section within its timeout; a second reported a `nextSibling` exception. A reload, a settled navigation check and the nine subsequent fast navigations passed. The cause of the initial errors was not established, so the later passes do not prove they cannot recur. This section records documentation-site evidence only; it does not add editor or OS IME acceptance evidence.

## 5.48 Runnable documentation and selection restoration (2026-10-28)

Added English runnable Word-profile schema-transition walkthroughs for Slate, Lexical, and ProseMirror, a Codex/user editing and stale-base walkthrough, troubleshooting, an operations and performance guide, and an accessible transition diagram. The CLI `apps/demo/products/transition-example.mjs` submits a conditional compatible mark addition and checks the returned schema; `word-schema.mjs` exports the profile schema for the MCP app. The browser demo's Slate and Lexical hosts now restore the DOM selection when resuming after a schema rebuild; ProseMirror uses its view focus method. The core concurrency rules were not changed.

The runnable examples revealed a pre-fix defect when a selected editor had pending input but no other participant edited during a transition: Slate and Lexical selection collapsed to the start on focus. Chrome 156.0.8078.48 passed all **37** schema checks: 27 profile/editor/direction cases with a competing remote edit, nine Word-profile forward/backward/caret cases without one, and one synthetic composition case. It also passed **90** native editor checks. The three actual example CLI commands were run against separate Word demo documents; selection, pending input, undo, redo and convergence passed. Repeating the Slate command returned `already-present`. Synthetic input does not validate OS IME.

A real Codex CLI MCP session, using a separate ephemeral actor on a Word-profile demo document, confirmed an AI insertion, undo and redo after browser input. Reads showed `Opening text HUMAN`, `AI: Opening text HUMAN`, `Opening text HUMAN`, then `AI: Opening text HUMAN`; a separate Chrome read found all three editors online, zero pending and converged on the final state. This particular exercise did not include a live stale-revision race; the guide describes the expected rejection and the existing MCP test suite covers stale bases. Ephemeral MCP history does not survive process termination.

Fresh `npm test`: **688** library, **57** demo, **28** docs, **59** MCP passed, one platform-specific MCP test skipped. Comparison-editor tests **32** passed; typecheck passed. The final docs build produced **30** pages and passed **1,673** internal link checks; Chrome opened the five new or revised pages and loaded the diagram without page errors. No performance benchmark was run in this task; the operations guide cites an earlier source-bound report and its limitations.

At this checkpoint, the published-site hydration problem was **not fixed**; see §5.49 for the later fix. One of 30 quick Chrome navigations failed to show the Lexical anchor and logged `Hydration completed but contains mismatches`; a further 24 fast navigations had no failures or errors. This intermittent evidence does not establish a root cause. Reloading was previously observed to restore the page; investigate further without treating a reload as a fix. The troubleshooting guide records the issue. Raw logs and screenshots are in the ignored local directory `output/playwright/docs-examples-20261028-uCiuXu/`; they are not release artifacts. No real OS IME or production acceptance was established. The changes were uncommitted and not yet published at this checkpoint.

## 5.49 Documentation hydration race and integration (2026-10-28)

VitePress installs its click router before its initial page module has loaded and before it mounts the initial SSR HTML. A link click in that interval can update the route while the original HTML is still on screen, then hydrate the wrong page. This is a demonstrated cause of the previously observed mismatch, though the evidence does not establish that every possible hydration mismatch has the same cause.

A synchronous, same-origin pre-hydration click guard lets eligible links use normal browser navigation until the root Vue component mounts. After mounting, the guard removes itself and VitePress handles internal navigation normally. Links with modifiers, a target, downloads, and `.vp-raw` content retain their normal handling. The documentation site's `apps/docs/test/hydration-browser.js` delays the initial lean page module and exercises the three editor-guide links; it checks the target and browser errors, then checks client-side navigation after hydration.

Before the fix, the controlled Chrome 156.0.8078.48 run produced hydration mismatch errors on all three links, two missing target sections, and one `nextSibling` exception. After the fix all three delayed-module cases passed without errors; normal client navigation remained active after hydration. Thirty additional fast local navigations passed, as did keyboard navigation, browser back, and navigation with JavaScript disabled. This test controls a module delay and is not proof against every browser or network race. Browser logs are under `output/playwright/hydration-fix-20261028/` (ignored locally).

Fresh `npm test` passed **688** library, **57** demo, **28** documentation, and **59** MCP tests, with one platform-specific MCP test skipped. Comparison-editor tests **32** passed, as did typecheck, docs build, **30** pages and **1,702** internal link checks, and `git diff --check`. The editor and actual Codex browser evidence in §5.48 was produced before this docs-only hydration fix and was not rerun in this integration; its stated scope remains unchanged. No OS IME or production service acceptance is claimed.

## 5.50 Documentation publication verification (2026-10-28)

Documentation source commit `31f5a3e1fd66533df11403b6eeee54f24d03e056` was pushed to `main`. GitHub Pages [run 40658973927](https://github.com/barocss/doc-sync/actions/runs/40658973927) completed successfully. The deployed `pre-hydration.js` SHA-256 matched the committed file. Chrome ran the controlled delayed-module regression against the public site: all three editor links passed, no browser errors were observed, and client navigation after hydration remained active. Chrome also opened the runnable examples, AI walkthrough, troubleshooting, operations, and schema transition pages and loaded the diagram without errors. This is bounded browser evidence, not proof of all network or browser conditions. Raw local logs and screenshots are in `output/playwright/hydration-fix-20261028/`.

## 5.51 Expanded AI collaboration scenarios (2026-10-28)

Added `apps/mcp/test/ai-scenarios.test.ts`. Seven isolated scenarios use real stdio MCP server processes, a separate scripted `SyncClient` user, and a local demo server. They check the server model and all participant replicas after each relevant step: three agents racing with the same revision and retrying after a reread; offline same-position user/AI insertion and independent undo/redo; user deletion concurrent with AI bold and both histories; offline user paragraph split concurrent with AI insertion; a user deletion of AI-inserted text across AI undo/redo; a stale edit and invalid atomic batch followed by a valid edit; and macOS durable agent restart with history while a later user edit survives undo/redo. The restart case is skipped on non-macOS platforms. These are scripted MCP clients rather than seven autonomous model runs.

The focused test passed **7 scenarios** (8 Node test entries including the parent). A separate actual Codex CLI `gpt-6-sol` session and an external scripted user client used a fresh local document. Codex confirmed insertion `A`, read and saved revision 1, the user inserted `H`, and the saved revision's attempted `X` was rejected by the local session as stale. After rereading `AH`, Codex confirmed `B`, undo, and redo; successive model reads were empty, `A`, `AH`, `AHB`, `AH`, `AHB`. A separate HTTP read captured server state. This particular stale rejection was local; the three-agent test checks simultaneous conditional edits but does not identify where each stale rejection occurred. The first Codex attempt stopped after its shell selected Node 18; the second attempt's sandboxed shell could not connect to localhost (`EPERM`), so its stale precondition was not met. Both failures are preserved separately. The successful attempt used a separate external user process and did not change persistent Codex settings.

Fresh `npm test` passed **688 library, 57 demo, 28 documentation, and 67 MCP test entries**, with one platform-specific MCP test skipped. Typecheck, docs build, **30** pages and **1,703** internal links, and `git diff --check` passed. See the updated AI walkthrough for the scenarios and command. Local logs and Codex JSONL are in `output/validation/ai-scenarios-20261028/` (ignored by Git). These results do not establish browser interaction by a real human, real OS IME, physical power loss, or production authorization. No commit or push was requested.

## 5.52 Fifteen scripted AI participants and three browser editors (2026-10-28)

Added the repeatable local harness `benchmarks/ai-editor-concurrency.mjs` and [measurement report](benchmarks/results/ai-15-editors-2026-10-28/report.md) with sanitized raw result JSON and source hashes. One Chrome 156.0.8078.48 page mounted Slate, Lexical and ProseMirror as separate peers of one Word-profile sample. Fifteen real stdio MCP server processes used separate actor IDs, grouped five per editor by the test harness. These are scripted MCP clients, not autonomous language models; the product does not enforce those group associations. Journals were disabled for this test.

The 15 agents sent conditional insertions from the same revision. During that request wave, the harness dispatched a change through each editor's demo test API; wall-clock intervals overlapped. A later automated native keystroke was sent through each editor. One initial agent request was confirmed, 14 were rejected as stale, and no request was unconfirmed. All 14 reread and successfully retried. All 21 unique agent, scripted editor and native input markers were present exactly once, and all native editor, browser client, 15 MCP client and server models agreed. The browser context then went offline, Slate queued a user edit, and one agent added another edit. After the context reconnected, both edits survived. That agent's undo and redo preserved the user's edit, with all replicas equal. The agents stayed online: this does not test agent/server restart or real OS IME. In a preceding differently scoped run, a Slate native keystroke overlapped the agent request wave, while the other two keystrokes occurred afterward.

In the final single run on an Apple M3 Max, Darwin arm64 and Node 24.22.1, 15-process startup took **611.8 ms**, the initial wave took **64.8 ms**, and the 15 initial responses had median / nearest-rank p95 **43.6 / 64.7 ms**. The 14 sequential retry calls had **36.1 / 60.3 ms** median / p95. A single `ps` sample totaled **2,561,552 KiB RSS** across the 15 processes; RSS can count shared pages more than once and excludes browser/server memory. These are small-sample MCP response timings, not model inference, end-to-end UI latency, peak memory, or production targets. See the report for workload, limits, raw data and source identity.

Fresh `npm test` passed **688 library, 57 demo, 28 documentation, and 67 MCP test entries**, with one platform-specific MCP test skipped. Typecheck, docs build, **30** pages / **1,703** internal links, and `git diff --check` passed. The first sandboxed local server start failed with `listen EPERM`; an allowed isolated run was used. The first allowed test run failed because the CLI page-code environment did not expose `performance`; the harness was corrected and the first failure retained locally. Two later runs passed before the final three-editor overlap run. Browser and raw local logs are in `output/validation/ai-15-editors-20261028*`. No commit or push was requested.

## 5.53 Headless agent presence in editors (2026-10-28)

The MCP server exposes `set_presence` for an explicitly supplied name, six-digit hex color, current revision, active caret path, and optional opposite selection endpoint. It validates the synchronized local session, matching local revision, visible text paths, and a shared visible document line/slot before converting paths to stable token anchors. Both null endpoints hide the presence. The result is `sent` with delivery `unconfirmed`: the underlying transport is best effort, not a server receipt. Presence is transient, does not change the document or undo history, and is not journaled. The agent must report its actual location and update it explicitly after editing; the server does not infer intent. A concurrent server change can still be in flight when the local revision is checked. Connection leave removes the participant's presence.

The product demo now displays labeled caret and range overlays for resolvable Slate and Lexical native text points without modifying the native document or selection. ProseMirror uses its existing presence decorations and refreshes them when presence changes. Unresolvable or hidden positions are not invented; the Slate/Lexical overlay does not cover every non-text native position. Lexical exports `$lexicalPoint` for read-only model-to-native point mapping. Documentation explains the tool, limitations, and agent workflow.

A real Codex CLI process called `set_presence` on a Word-profile sample; Chrome 156.0.8078.48 showed the `Codex` caret and selection in all three editor panels and removed them after the process left. A separate reproducible MCP/Chrome harness `apps/demo/products/check-agent-presence.mjs` checked two simultaneous agents and leave, forward/backward ranges, collapsed and paragraph-start carets, hiding, the existing Slate user selection, and position movement after another user inserted text. The first browser harness run failed because it used `window` outside page context; it was corrected and retained. MCP integration and session tests checked transient revisions, token-following, invalid/stale paths, and cross-cell range rejection. Final Chrome native checks passed **90/90** and schema-transition checks **37/37**. Actual Codex's selection test preceded the final synchronized-session and cross-slot guards; the final guard behavior was checked by the later MCP/Chrome and session tests, not by another Codex run.

One local Word-sample MCP-to-DOM timing sample recorded DOM / second animation-frame delays: Slate **34 / 66 ms**, Lexical **17 / 49 ms**, ProseMirror **19 / 49 ms**. The second frame is only a rendering-opportunity proxy; one sample under shared load does not establish physical paint, smoothness, large-document performance, remote network latency, or a percentile. See `benchmarks/results/agent-presence-2026-10-28/report.md` and raw JSON. Full `npm test` passed **688 library, 57 demo, 28 docs and 68 MCP test entries**, with one platform-specific MCP test skipped; comparison-editor tests **32** passed. Typecheck, docs build, **30** pages / **1,708** internal links, and `git diff --check` passed. Screenshots and raw Chrome/Codex logs are in the ignored `output/validation/agent-presence-20261028/`. Real OS IME, production authorization and sustained large-document presence load remain untested. No commit or push was requested.

## 5.54 One-shot document bot runtime (2026-10-28)

Added the private `apps/bot` workspace. A user runs one bounded mission with a stable actor ID. The runner starts a real MCP stdio process, discovers the server schema as data through the opt-in `DOC_SYNC_DISCOVER_SCHEMA=on` setting, verifies its fingerprint and the connected schema, and reads the document. A Codex planner produces a validated single-step JSON plan; the runner, not the planner, executes text insert/delete via the existing MCP conditional revision checks and publishes best-effort presence. A definite stale rejection causes a reread and replan within the step limit. Unknown outcomes, model failures and incompatible or unavailable schema stop for attention. A local last read before `finish` also catches already-observed document changes; it is not an atomic server-side completion guarantee.

Mission files are written with atomic replacement, file and directory sync and private file permissions. They retain status, confirmed and stale plans, base/reply revisions, and any pending intent written before submission. The MCP journal is separate, keyed by server/document/actor. If a process stops, a record may remain `running` with a pending intent: do not blindly rerun it. Automatic mission resume/reconciliation is not implemented. Durable MCP journal support is currently macOS-only; explicitly disabling it is ephemeral. One bounded task per invocation is implemented, not a background scheduler, task UI, authorization service, or general tool platform.

Actual authenticated Codex CLI `gpt-6-sol` missions completed against isolated local demo documents. In an earlier Word-profile Chrome run, a user's native Slate insertion made the bot's initial plan stale; the bot reread and replanned, and the user and bot text converged across all three editors. A controlled real-process test withheld the conditional reply after server acceptance, killed the bot, verified the pending mission and `may_have_been_sent` MCP journal remained, restarted the server, and found one copy of the edit. This is process/server restart evidence, not power-loss proof or automatic recovery. Incorrect schema fingerprints stop before the planner runs. Usage and limitations are in `apps/bot/README.md` and the documentation guide.

## 5.55 Bot character design and behavior (2026-10-28)

Each bot has a configurable cat/fox/owl/robot character, a curious/careful/creative/concise planner style, a name, color and actor identity. Defaults are deterministic from actor ID and may collide. Personality guides model style; it does not grant permissions or guarantee model behavior. Optional presence metadata reports thinking, editing, happy or concerned work state; it is transient and does not change the CRDT. A thinking bot with no known position appears in the roster without a guessed cursor. A final expression is stored in the mission record; transient presence is removed on leave.

The product editor now shows compact expressive characters beside the editor title and small matching markers at known work locations. Names are hidden by default and appear on hover or keyboard focus; the roster exposes an accessible name and state. Reduced-motion settings disable the decorative animation. The design and candidate roles/capabilities are in `docs/bot-product-design.md` and `apps/docs/src/guide/bot-design.md`. Roles, scoped authorization, suggestions, task UI, durable automatic recovery, scheduled triggers, cost controls, external research and long-term memory remain proposals, not implemented capabilities.

Two actual concurrent Codex `gpt-6-sol` bots, a curious fox and careful owl, edited the same Word-profile sample. One stale conditional edit was rejected and replanned. Both completed; the final server and three editor/native models agreed on `Opening text [FOX] [OWL]`. The browser observed thinking, editing and happy states for both bots in all three panels. A controlled Chrome test checked hover and keyboard name disclosure, two bot selections and leave, and unchanged local selection. A separate five-agent fixture checked 1280 px and 390 px layouts, no horizontal page overflow, and reduced motion. Final Chrome regression passed **90 native editing** and **37 schema-transition** cases. The actual duo task times were 15.098 and 24.388 seconds in one shared-host run; the second included a stale replan. These are not general model or production performance claims. The [report](benchmarks/results/bot-runtime-2026-10-28/report.md) records source identity, raw synthetic data and limitations.

Fresh `npm test` passed **689 library, 5 bot, 57 demo, 28 docs and 68 MCP test entries**, with one platform-specific MCP test skipped. Comparison-editor tests **32** passed. Typecheck, documentation build and link check (**32 pages, 1,871 internal links**) and `git diff --check` passed. Evidence is under the ignored `output/validation/bot-runtime-20261028/`. An initial five-bot browser test used the port of a stopped test server and failed with connection refused; the corrected isolated retry passed. Real OS IME, physical power loss, autonomous background scheduling and production security remain unverified. No commit or push was requested.

## 6. Next work (in order)

The current numbered execution order and acceptance criteria are in [`apps/docs/src/roadmap.md`](apps/docs/src/roadmap.md). The stage notes below retain historical context and measurement boundaries; they do not supersede that list.

Receive model allocation and membership rewriting are improved in §5.30 while retaining §5.29 ID compression. The structural paragraph-recalculation improvement is complete within §5.16 scope. The later editor-binding and document-capability delivery is in §5.19. Protocol epochs now reject unsafe pending replay across reset/restart; full lease-expiry recovery remains the next separate contract. Full structural-sequence scans, full-event comparison, returned copying, and normalization costs remain. Stage 0 exit evidence and long-run CI observation below remain separate work.

### 6.0 Product profile follow-up

The first model profiles (§5.26), bounded native editing checks (§5.27) and remote root-block projection (§5.28) are complete within their stated scope. Repeated large-document worst-peer p95 is now 70.1–176.5 ms. Profile local native input conversion, Lexical full readback, changed large root containers and remaining full comparisons/copies next. Then add product-specific views and keyboard/paste/accessibility coverage. File-format fidelity, Word pagination, database execution and presentation canvas behavior still need application contracts. These results do not close stage 0 performance or release gates.

### 6.1 Finish stage 0 (remaining work)

0. **Baseline measurement exit evidence**: Reviewed gaps in §5.14. New evidence remains to be collected. Added harnesses for a fixed 50×10 table, opening after 10,000 edits, and public Yorkie Tree comparison. Yorkie 10,000-character single input and opening after 10,000 edits remain incomplete at the 120-second limit. Review target rate and completed rounds in the 4-replica 30-minute observation. Concurrent row/column/merge policies are not validated by a common cross-engine comparison.
1. **Real editing trace**:
   - Example: automerge-perf paper-editing trace. Ask the user for the file, source, and size before obtaining it.
2. **Client/editor paths**: Safe moved/required text comparison is improved in §5.20; automatic-storage duplication and split ordering are fixed in §5.21; guarded structural comparison is improved in §5.23; remaining full model reads/copies, projection and native conversion costs need separate work; the merged-grid readback defect is fixed in §5.24. Safe single-text-block paths improved in §5.7; up to 8 blocks improved in §5.14. Nine or more blocks, structure, and undo/redo retain full-model events. Structural sequence/paragraph cache reuse improved in §5.16. PM conversion/application and screen updates need separate analysis.
3. **Review results and incomplete items, then set targets and G0.**
   - Roadmap artifact: https://claude.ai/artifact/ESfhwaZAnzcGjFpUjevafc
   - Source to update: `docs/roadmap.html`.

### 6.2 Stage 1: performance (profile order)

1. ~~Keep the position index~~ — **Done** (§5.1). Remaining: replace the sequence with a **chunk list** or B-tree to remove O(n) copying in `splice`. Yjs uses a linked list + marker cache; diamond-types uses a B-tree. Live-character counts per chunk would also make nth-character lookup O(log n).
2. ~~Incremental block-list calculation for characters~~ — **Done** (§5.1). Remaining:
   - **Incremental marker insertion/deletion**: split one block into two; join two into one. Concurrent same-position Enter absorption ("first live marker per boundary") needs a persistent boundary → markers Map. This was about half of an earlier profile. Remeasure its current share.
   - Document-version and unchanged-text-block reuse are done (§5.7, §5.9). Affected-sequence and same-paragraph reuse after structural changes improved in §5.16. Structural boundary scans, returned copying, and list/table normalization remain.
3. Runtime ID metadata is compressed in §5.29; physical live Items and their public identities are unchanged. This does not resume the following separate live-span decision.

   **Group consecutive characters** — ⛔ **Do not implement (user decision, 2026-10-22).** Leave unchanged until the user asks to resume. Historical notes only:
   - Saved size is 1.8MB for 10,000 characters. Group one participant's consecutive input into one token (span).
   - GC already uses `span` (`Item.span`, registered under lamport+i in `byKey`). Extend that mechanism to live tokens.
4. **Wire/storage form**: Short snapshot keys and omitted defaults are done (§5.2). Binary formats, actor tables, and wire-operation forms are ⏸ **under user consideration**. Do not propose them first; answer when asked.
5. **Narrow receive comparison**: Safe up-to-8-text-block scope is done (§5.7, §5.14). Nine or more blocks, structure, and undo/redo retain the full path. Decide additional scope after measuring current costs.

- Exit criteria are in roadmap stage 1 (proposed values such as 100,000-character local p95 < 2ms).
- Preserve 0 divergence with `npm test` and `FUZZ_SEEDS=3000 npm test` after every change.

### 6.3 Later stages

- **Stage 2**: Specifications, property tests, and long-run CI foundations are added. Lease-expiry recovery, actual CI/two-week observation, and single-document long-run requirements remain.
- **Stage 3**: Storage/operations: snapshots, log compaction, WebSocket, sharding.
- **Stage 4**: Schema evolution: refer to Fluid SharedTree stored/view schemas and widening-only rules.
- **Stage 5**: Schema-based document editor integration: the destination.
- **Stage 6**: Fill feature gaps: refer to Loro `configTextStyle` for format-boundary rules.
- **Stage 7**: Release preparation.

See the roadmap for details.

## 7. Decisions: do not reopen

- **Identity-preserving block movement is authorized and implemented in §5.19.** This later user decision supersedes the old no-move decision. Arbitrary subtree cuts and row/column/inline/span movement remain separate. Cell spans retain hidden text.
- Concurrent Enter at one position → one line (user rule). Enter after observing the other Enter creates a separate line.
- Validate immutable facts only. Do not add block-level checks that differ across replicas.
- Undo is participant-specific and uses inverse operations. Do not restore another participant's deletion.
- Measurements rejected recording Yorkie §7.4 decisions in operations. Do not propose it again.
- Do not pursue an adapter over yorkie.Text.
- Links are value formatting and are not inherited by new input. Bold and similar formats inherit from the left.
- Column insertion is one column node in the CRDT. Schema-based editors/ProseMirror supply cell insertions per row; the compiler folds them.
- Flows start with a text block. Tables are full grids. If these differ from the editor, normalize reports the difference; the adapter must correct it.

## 8. User agreements

- **All replies must be in Korean**, including short progress reports. Project documents, including README and HANDOFF, must use English (user decision, 2026-10-23).
- Commit, push, and PR only when requested. On 2026-10-22, the user requested Git initialization, `first commit`, branch `main`, the origin above, and first push. On 2026-10-23, the user requested final checks of all current uncommitted changes, then commit/push to main after tests passed. The user then requested final checks, commit, and main push of all current changes including screen latency, intent preservation, and consecutive-formatting undo (§5.13). Later, the user also requested final checks and main commit/push for all uncommitted multi-text-block remote comparison changes (§5.15). The current follow-up also authorizes committing/pushing the structural-cache work and the English documentation site, with public deployment through GitHub Pages. Future unrelated commit/push/PR work requires a separate request.
- Do not modify `/Users/user/github/yorkie-js-sdk`. Never download public npm `phup.js`.
- Do not touch the internal artifactory `_authToken`. Do not bypass registry settings with public npm in other repositories. Only this folder has an exception.
- Do not print or enter API keys/passwords.
- The user will discuss upstreaming this library to Yorkie directly. Do not suggest it first.
- Do not discard the three worktrees in the earlier Yorkie experiment repository (`/Users/user/github/zero-js/yorkie/zero-yorkie`): suspicious-newton-ea5231, compassionate-sinoussi-66fb15, reverent-bhaskara-38f4d1.

## 9. Known gaps

- Performance (§5) is the largest gap.
- Product profiles have headless model coverage (§5.26) and bounded native editing proof (§5.27). Large-document p95 remains 332.3–621.7 ms; product formats/layout, actual OS IME and production latency acceptance remain open.
- The merged-grid native mismatch recorded in §5.23 is fixed and validated in §5.24. Actual OS IME and product performance acceptance remain separate work.
- Flow `childRules` now express required/minimum and maximum child counts through deterministic projection (§5.19). Overflow remains stored. Required slot identities cannot be moved or retyped.
- Validation is per sequence. Hand-built operations can insert text into an image block.
- Normalize cases: uneven columns, columns inside merged cells, overlapping merges, merging virtual blocks containing text, and the leading paragraph. See `docs/edit-api.md`, "When normalize occurs."
- 18% of ProseMirror Steps use diff (block type changes, table rows/columns, paste).
- Long-disconnected participants leave the watermark calculation after a 2-minute lease. Forced snapshot recovery is absent.
- No authentication, authorization, or multiple servers. No multi-cell selection. No row/column attributes.

## 10. Pitfalls

- `~/.npm` cache EACCES → install with `--cache <temporary-folder>`. Do not use sudo to fix it.
- Browsers allow only 6 HTTP/1.1 connections per host. `/multi` therefore uses `a.localhost`, and so on, for each frame.
  - Offscreen iframe timers slow down and produce less automatic input.
- On first opening `/pm`, a "different — exchanging changes" status can appear for a few seconds before convergence. Server state is polled every 700ms.
- Demo server `upgradeV2` migrates old logs. It can be removed if old `data/` logs are deleted.
- `bench` needs `--expose-gc` for valid heap values (`npm run bench` includes it).
  - A 100,000-character run takes about 21 seconds (33 minutes before fixes). Use `--engines ours` to measure only this library.
- Changing receive-side event hooks for debugging breaks mirror checks. The mirror is in `packages/doc-sync/test/fuzz-core.ts`.

## 11. Artifacts

- Report: https://claude.ai/artifact/1MLn5nhrom5SHH4igkJQ5L — source `docs/report.html`.
- Roadmap: https://claude.ai/artifact/ESfhwaZAnzcGjFpUjevafc — source `docs/roadmap.html`. Includes Fluid in stage 4 and Loro in stage 6.
- Related-system research (2026-10-22): Automerge rich text (block markers + SchemaAdapter), Fluid SharedTree (stored/view schemas), BlockSuite (block schema on Yjs), Loro (format expansion configuration).
  - No public CRDT was found with all of schema injection, editor operations, fact-based server validation, and tables within one document.
- Backup: `/Users/user/github/zero-js/yorkie/zero-yorkie-backups/2026-10-22/`.

## 12. Example first message for a new session

> Read `/Users/user/github/doc-sync/HANDOFF.md` and continue from §6.1. Reply in Korean.


## 5.56 Bot mascot, activity, and explicit range review

**Scope.** The demo now uses one code-generated vector character system for the roster and all three editor carets. Fox, owl, cat, and robot share a silhouette language and seven work-state expressions. Names remain visible only on hover or keyboard focus. The roster marks document context, a caret, or a selection and exposes the reported activity and mode to assistive technology. A selected reading range has restrained animation; reduced-motion settings disable it. The [expression sheet](apps/docs/src/public/mascots/expression-sheet.svg) is generated from the same runtime SVGs by the documentation build.

**Presence and safety.** MCP presence accepts optional activity and expanded expression values. A bot can ask the planner to inspect an explicit, non-collapsed range. Both endpoints must resolve within the same visible text line against a settled revision. The next planning step receives that range and the full document. The runner discards the numeric range if a later read observes a different revision. Whole-document context does not create a guessed caret or simulated movement. Presence is best effort and does not modify document content. Existing atomic edit and concurrency rules are unchanged. Characters and personality are presentation and planner-style preferences, not permissions or reliable emotions. Continuous autonomous movement, broad scanning telemetry, scheduling and production authorization remain unimplemented.

**Evidence.** On the current workspace, `npm test` passed before the final small runner validation refinement; the bot workspace suite passed again after it, including a second actor editing between range review and completion. The MCP stdio integration test passed after adding activity round-trip and invalid activity rejection. Typecheck, documentation build/link checks, and `git diff --check` passed. Chrome 156.0.8078.48 passed 90 native editing checks and 37 schema-transition checks. A separate real MCP/Chrome test passed forward and backward range, caret, local selection preservation, two agents, movement after a user insertion, and leave in Slate, Lexical and ProseMirror. A five-bot Chrome fixture passed desktop, 390px mobile, hover/keyboard names and reduced-motion checks. The initial run caught an outdated accessible-label assertion and mobile tooltip overflow; both were corrected and rerun. Evidence is in `output/validation/bot-activity-20261028/`.

A real Codex `gpt-6-sol` bot connected to the Word-profile sample via MCP, selected a nonempty range for review, inserted `[reviewed]`, and reported completion with a confirmed edit; its sample mission record is `output/validation/bot-activity-20261028/codex-mission.json`. The Chrome position tests used controlled MCP participants; they did not capture the actual Codex run in Chrome. Browser input is automated, not real OS IME. This work did not measure end-to-end responsiveness or production load. The server and browser sessions used isolated test data.


## 5.57 Round bot mascot

The demo now uses one circular mascot with four palettes and seven expressions. The existing `fox`, `owl`, `cat`, and `robot` presence and CLI identifiers remain compatible; they now select orange, violet, rose, and mint faces rather than animal silhouettes. Names remain on hover or keyboard focus. A subtle eye movement signals reported reading activity and is disabled by reduced-motion settings. It does not describe a position or scan path. The roster, cursor, and selection behavior from §5.56 remains unchanged. The [expression sheet](apps/docs/src/public/mascots/expression-sheet.svg) is generated from the runtime vectors.

**Verification.** Typecheck, `git diff --check`, documentation build and link check, two mascot tests, and 42 targeted ProseMirror presence, Slate and Lexical binding tests passed. Chrome 156.0.8078.48 used isolated test documents: five bots passed desktop and 390px mobile layout, hover/focus and reduced motion; the MCP presence harness passed two participants, forward/backward ranges, caret and selection updates, an intervening user edit, and leave across all three editors. Screenshots and logs are under `output/validation/round-mascots-20261028/`. This was an automated browser test with controlled MCP participants, not a human usability, OS IME, or performance test. No full-suite run or real Codex run was repeated for this presentation change.


## 5.58 Schema-aware bot editing and interactive demo

The bot planner now receives the verified schema and current document and can propose a bounded JSON batch of the existing six `EditOp` forms, including node insertion, table edits, attributes, split, merge and move. The runner checks the batch envelope before recording a pending intent; the MCP client compiles against a draft and validates operations, and the server performs the existing atomic revision check. A stale rejection causes a reread and replan. Unknown outcomes still require inspection and are not blindly replayed. Structural paths do not generate invented text carets. The planner has a 512 KiB input limit; a structural plan has a 64 KiB JSON limit and at most 20 edits. Schema validity does not establish that generated content is factually correct or that the model will always choose the right location.

The product demo can opt into a local, one-shot Codex task UI with `PRODUCT_ENABLE_BOTS=1 PRODUCT_BOT_MODEL=gpt-6-sol npm run dev:products` and `?profile=word&doc=bot-demo&bot=1`. The local server enforces a loopback Host and same-origin POST for this endpoint, limits each document to one running bot, and uses an ephemeral MCP session. It has no production authentication or durable recovery. The existing demo server and earlier presence showcase were preserved. At the time of this session a separate instance was available at `http://127.0.0.1:53505/?profile=word&doc=try-real-bot&bot=1`; it contains a real bot-created heading and table and lets the user start another task.

**Evidence.** Actual Codex `gpt-6-sol` runs created schema-valid heading/table content in Word-style and Notion-style documents and a table in a presentation slide. A separate Word-style run changed only the requested heading and table cell in the inspected sample. In Chrome 156.0.8078.48, a real Codex bot launched from the demo UI created a heading and table while automated native Slate input inserted `[human]`; the server and all three editor views contained both results and converged. This is automated input, not a human usability or OS IME test. The first browser harness used an incorrect `waitForFunction` argument and timed out after 30 seconds; a second inspection found the correct final DOM, and a fresh corrected run passed. Another real Codex race recorded a stale rejection and a successful replan after user input. Raw evidence and screenshots are under `output/validation/schema-bot-live/`.

The bot regression test covers a stale structural batch, replan, heading and table insertion, table-cell text update, another actor's edit, and rejection of a malformed planned operation before a pending record. The full workspace suite passed: 690 core, 5 bot, 57 demo, 28 documentation, and 68 MCP tests, with one platform-specific MCP test skipped. Typecheck, documentation build and link checks passed; a cross-origin demo bot launch returned 403. The final UI changes preserve the opt-in `bot=1` query when switching profile or document size and disable task submission until all editors synchronize; the readiness behavior passed a separate Chrome smoke check. No performance or production security claim follows from these checks.


## 5.59 Concurrent bot personas and local task UI

The local bot runner now accepts `writer`, `reviewer`, and `organizer` roles as well as the existing personality and appearance settings. Personality supplies bounded style guidance to Codex. The reviewer runner rejects insert, delete, and structural edit plans before recording a pending edit; it may inspect and report. Writer and organizer remain planning preferences. This guard belongs to this runner, not the server authorization boundary. Different planner functions can be supplied to `runMission`, but the shipped CLI and demo use Codex only.

The opt-in product demo has four configurable presets: Mori (curious writer), Nuri (careful reviewer), Bori (creative writer), and Tobi (concise organizer). Different presets can run concurrently on one document with independent generated actors; each preset can have one task in flight per document. The task selector reports results and shows compact status faces without permanently listing names on the document. Presence retains the observed-position rules in §5.56. The UI is a local prototype: profile presets are not durable personal identities, tasks are one-shot and ephemeral, and it has no production authorization, scheduler, task cancellation, or automatic recovery. See `apps/docs/src/guide/bot-design.md` and `docs/bot-product-design.md`.

**Evidence.** In Chrome 156.0.8078.48, two actual Codex `gpt-6-sol` participants ran simultaneously: Mori inserted a schema-valid heading and 2×2 table; Nuri reviewed without editing. Automated Slate input occurred while both ran, and the server and all three native editor views converged with the user's input and the new structure. The final icon-based UI was tested in a fresh run; evidence and screenshots are in `output/validation/bot-team-20261028/`. This is automated user input, not a human usability or OS IME test. Bot tests also exercised simultaneous structure edits from the same base, stale rejection/replanning, and a reviewer edit being rejected before any pending intent. Typecheck, documentation build and checks, and `git diff --check` passed. The workspace suite passed 690 core, 5 bot, 57 demo, 28 docs and 68 MCP tests, with one platform-specific MCP test skipped; that suite ran before the final icon presentation and Codex prompt wording, which were covered by the subsequent Chrome run. No production load or security assessment was performed.

A separate local instance remains running at `http://127.0.0.1:59824/?profile=word&doc=team-studio&bot=1` for user inspection. Mori and Nuri have completed sample tasks there. Existing user tabs and previous demo servers remain untouched.


## 5.60 Local bot profiles and duplicate-plan guard

The private bot workspace now supports `profile-create`, `profile-list`, `profile-show`, and `run --profile`. A profile stores a generated identity and an explicit name, character, personality, role, and color in a private local file. Creation fsyncs a temporary file and uses an exclusive link, so an existing ID is not overwritten. The stable actor derives from the generated identity, canonical server URL, and document ID. Profile runs reject identity overrides and ephemeral mode; they use the existing per-actor durable MCP journal and checkpoint. `localhost` and `127.0.0.1` remain separate endpoint identities. Preserving the state directory and endpoint is required. The CLI profile implementation does not add persistent identities to the browser demo, automatic task resumption, profile editing, or cross-device identity sync.

A real Codex trial found that a second task repeatedly inserted the same `!`: the isolated sample became `Hello!!!!` and stopped at its step limit. This failure is retained in `output/validation/bot-profiles-20261029/mission-two.json`. The runner now supplies the last confirmed edit to the planner and stops before submitting an identical consecutive edit at the same observed revision. The comparison normalizes object-key order and catches both direct and structured forms. This conservative guard may also stop a task that intentionally repeats the same edit; it does not provide general semantic deduplication or validate the model's answer.

**Evidence.** A macOS integration test held one profile's journal while a second same-document task attempted to start; the second did not reach its planner. A bot task inserted `A`, the server was stopped and restarted on the same port with its data directory, a later task inserted `B`, and an MCP session restored the actor's history. After a separate user inserted `H`, bot undo removed `B` and preserved `AH`. These tests use a deterministic planner and graceful server restart, not power-loss evidence. Real Codex `gpt-6-sol` then ran two tasks on the same profile and document with equivalent trailing-slash URLs; both completed with the same actor and the sample ended `Hello!`. This actual run preceded the final object-key-normalization refinement, which was verified by the targeted bot test. Full logs and actual mission records are under `output/validation/bot-profiles-20261029/`. The original CLI test failed when run from the workspace because it resolved a path against the wrong current directory; it was fixed to use a module-relative path and rerun. Profile configuration and mission records may contain personal data and require protection.

Final verification for §5.60: the workspace suite passed 690 core, 8 bot, 57 demo, 28 docs, and 68 MCP tests; one platform-specific MCP test was skipped. Typecheck, docs build/link checks, and `git diff --check` passed. No new browser validation was performed because the profile commands and runner guard do not change the demo UI.


## 5.61 Profile-backed browser demo and restart evidence

The product demo can now connect to existing CLI bot profiles when `PRODUCT_ENABLE_BOTS=1`, `PRODUCT_BOT_STATE_DIR`, `PRODUCT_DATA_DIR`, and a fixed nonzero `PRODUCT_PORT` are set on macOS. The browser lists saved profiles and starts tasks with the profile's stable document-scoped actor and durable MCP journal. Each product schema writes to its own persistent data directory. The same port, canonical URL, document ID and state directories must be used after restart. Existing temporary demo behavior remains available when the bot-state directory is not set. The server is loopback-only and is not a production authentication boundary; two instances must not use the same data directory.

The controller restores each profile’s latest mission status from disk; earlier mission records remain available through the CLI. A previously running, queued, or pending mission blocks another task for that profile/document and appears as interrupted; the browser and server do not replay it. The demo does not yet provide an interactive resolution flow for interrupted tasks. A confirmed completed mission restores its normal MCP history, but an uncertain edit still requires journal/receipt inspection. The current conservative block can also stop a mission interrupted before submission. Profiles, documents, journals and task results may contain private data. See `apps/docs/src/guide/bots.md`.

**Verification.** With two actual Codex `gpt-6-sol` profiles and Chrome 156.0.8078.48, Mori inserted a heading/table while Nuri reviewed and automated Slate input added `[human]`. Server state and Slate, Lexical and ProseMirror agreed. After restarting the product server and its three backends with the same directories and port, the profiles, actor IDs, mission IDs and completed results remained, and the browser restored the document. A separate MCP session restored Mori's history: undo removed the bot's heading while preserving `[human]`; after a second server restart, redo restored it and still preserved `[human]`. Nuri then completed a new review with the same actor and a new mission ID. A custom CLI-created Alex profile appeared in the browser selector. Evidence and screenshots are in `output/validation/browser-profiles-20261029/`.

A separate actual bot task was interrupted while its mission record was running with no pending edit. After a graceful server stop/restart, the document model and server sequence were unchanged; the UI showed recovery inspection required and a second launch returned HTTP 409. This is not evidence for a crash after submission or automatic resolution of an uncertain receipt. Unit tests cover a retained pending mission and fail-closed behavior. The lower-level MCP crash/recovery coverage from earlier sections remains separate. Browser input was automated, not human or OS IME evidence.

A user-facing profile demo was started separately at `http://127.0.0.1:53492/?profile=word&doc=profile-demo&bot=1`. Its bot state is `.doc-sync-bots/browser-demo-isx4Pj` and document data is `data/browser-demo-2YBowH`; both are ignored by Git and must be preserved. Existing user tabs and servers were not stopped.

Final verification for §5.61: the workspace suite passed 690 core, 8 bot, 58 demo, 28 docs and 68 MCP tests; one platform-specific MCP test was skipped. Typecheck, documentation build/link checks and `git diff --check` passed. The final documentation clarification was made after the workspace suite and checked by a fresh docs build. To reopen the user-facing instance, use the same port and both paths from §5.61 with `PRODUCT_ENABLE_BOTS=1`; do not discard or overwrite the existing directories. The instance is running separately, and stopping it was not part of this task.

## 5.62 Browser task history and interrupted-task visibility

The profile-backed demo shows the selected bot's 20 most recent saved tasks for the current document and server. It displays the last saved status, steps, result, error, mission ID and whether an edit is pending. Content is rendered as text. All mission records remain on disk and accessible with the CLI. This view does not resolve receipts, resume work, or clear a recovery block. In particular, a running record without a pending marker is not proof that its process is no longer active. Keep blocking uncertain tasks until a safe reconciliation protocol is implemented. Task records may contain private information.

**Evidence.** The demo workspace suite and TypeScript check passed. In Chrome, a separate server and synthetic interrupted mission were used to check history after a server restart: the pending marker appeared, task submission remained disabled, and text containing `<script>` was displayed as text without creating a script element. This test did not perform an actual interrupted submission or test resolution. Prior actual-Codex concurrency and recovery evidence remains in §5.61. Existing demo instances and data were preserved.

## 5.63 Interrupted bot recovery: proof gap remains open

Automatic bot-task recovery and unblock are **not implemented**. The current mission record and the MCP journal are separate durable records. After MCP restores an accepted edit, it clears the journal; the mission can still say the edit is pending. A clear journal alone does not identify what happened to that mission's pending plan, and a mission's `running` status alone does not prove its process has exited. Clearing the block on either observation can duplicate an edit or race a live process.

The next implementation needs an exclusive, process-lifetime claim shared by task execution and recovery, plus durable evidence binding each mission step to the exact submitted change and authoritative receipt. Recovery must remain idempotent across a second crash while reconciling, preserve the bot's undo history, fail closed for unknown receipts and legacy records without sufficient evidence, and avoid overwriting concurrent user edits. Define and test how ownership is established before a mission can be created, how evidence survives journal cleanup, and how both records are committed before releasing the claim. Do not manually clear pending records as a workaround.

**Regression evidence.** `apps/bot/test/runner.test.ts` now withholds an accepted conditional response, sends SIGKILL to the bot, restarts the server from the same data directory, and makes a separate user edit. Reconnecting the original MCP actor restores the accepted bot edit and user edit. Undo removes the bot edit and preserves the user's change. The test also verifies that MCP removed its intent while the mission still retained its pending plan; no automatic mission resolution is claimed. This is a process/server restart test, not a power-loss test. The original mission and journal are test fixtures in an isolated temporary directory.

The bot workspace suite passed 8 tests and the repository TypeScript check passed. The full workspace suite and a Chrome recovery test were not run for this regression-only change.

## 5.64 Profile task claims and real bot document samples

Profile-backed runs now acquire a macOS kernel file claim for the stable document-scoped actor before creating a mission. The claim lasts through MCP shutdown and is released on process exit, including SIGKILL. Under the claim, the runner refuses a new task when a matching profile/server/document has an unresolved running, queued, or pending mission; this also protects direct CLI runs, not only browser-controller launches. This requires the same state directory for that profile and is not a server authorization mechanism. Legacy running tasks created before this claim implementation cannot be assumed to hold a claim.

**Recovery status: incomplete.** This claim is a prerequisite, not an implementation of automatic recovery or unblock. The mission-to-receipt evidence gap and other conditions in §5.63 remain. The changes do not clear or replay pending tasks. In particular, do not use a free claim alone as proof that a legacy task is safe to resolve.

**Examples.** Three actual Codex `gpt-6-sol` missions ran against isolated, pre-seeded rich sample documents through ephemeral MCP sessions. Word inserted a heading and 2×2 table, Notion inserted a heading and task, and presentation changed a slide title and added a text box. The requested nodes and text, required section header/footer and slide notes are present in the saved server models. Full models and the task descriptions are in `apps/bot/examples/`; raw mission and server outputs are in `output/validation/bot-samples-20261029/`. These are edits to existing sample models, not proof of full document creation, visual quality, every schema shape, or factual correctness. The isolated product instance was started on port 55381 with data in `/tmp/doc-sync-samples-20261029`; it is separate from the user's existing demo.

**Verification.** The bot suite passed 9 tests after the claim change, including the earlier accepted-edit crash/restart regression. A subsequent focused run passed 5 profile and example tests, including process SIGKILL and reacquisition of the claim, an active-claim conflict, unresolved direct-run blocking, and requested sample structure. The demo suite passed 58 tests; typecheck and `git diff --check` passed. The full workspace suite, browser tests and end-to-end automatic recovery/unblock tests were not run.

## 5.65 Profile mission step reconciliation

New profile missions use recovery protocol 1. Before sending a conditional edit, the MCP session durably writes a private step record containing the exact journal request, keyed by a random mission step ID that the bot has already saved in its pending mission. A failure to persist the record prevents submission. The profile claim covers the mission lifetime; recovery acquires the same claim and the actor's journal lock. After a crash, recovery matches mission, profile, document, base and edits against the step evidence, checks the authoritative receipt, restores the protected MCP checkpoint and verifies its intent digest. It then durably records the confirmed step and clears the pending marker without resubmitting. Repeating reconciliation is idempotent. If no evidence or journal exists for a new-protocol step, the request was not sent; if evidence exists but the receipt is unknown, recovery leaves the mission blocked. Evidence from before this protocol is not inferred and legacy interrupted tasks stay blocked.

The persistent product demo starts a recovery scan on server startup and retries periodically. The browser displays the restored task status. CLI users can run `recover --id MISSION_ID --state-dir DIRECTORY`. Reconciliation marks the interrupted task `needs_attention`, allowing a new task after recovery finishes; it does not resume the planner or assert that the user's mission is complete. The demo remains local, macOS-only and unauthenticated. Keep the same state directory and endpoint. Step evidence is retained on disk after reconciliation, contains document data, and has no compaction or deletion policy yet. Do not run the same actor from unrelated state directories.

**Evidence.** Automated restart tests withheld an accepted response, SIGKILLed the profile bot, restarted the document server, and added a separate user's `H`. Both a retained journal and a journal already reconciled by an earlier MCP restart were restored and unblocked without a second `X`; repeating recovery did not duplicate history. The recovered bot's undo removed `X` and preserved `H`. A separate case withheld the request from the server; the unknown receipt stayed blocked and preserved `H`. Tests also cover an interrupted pre-submission step, a live claim, a failed evidence write that sends no request, and automatic product-server startup recovery. These tests use deterministic planners and isolated local processes; they do not simulate power loss or prove automatic continuation of the AI task. Initial full-suite execution exposed a test/UI race between mission persistence and claim release; the controller now keeps the task blocked until its recovery process releases the claim.

Final verification: the full workspace suite passed 690 core, 13 bot, 59 demo, 28 docs and 69 MCP tests; one platform-specific MCP test was skipped. Typecheck, documentation build and internal-link checks, and `git diff --check` passed. Chrome was not rerun for this recovery change.

## 5.66 Continue an interrupted profile mission

New profile missions persist their original maximum planner steps and the number already used. After exact recovery (§5.65), a mission with remaining budget is durably queued under the same mission ID. The product demo starts a bounded `resume` process; the CLI also supports `resume --id MISSION_ID --state-dir DIRECTORY`. The resume process claims the same profile, rereads the current schema and document, restores the previous confirmed edit as planner context, and spends only the remaining budget. A crash after recovery but before continuation leaves a queued mission that can be resumed again. Unknown receipts and insufficient recovery evidence remain blocked. An exhausted budget or a planner failure stops for attention. Older missions without continuation metadata retain their earlier recovery-only behavior.

The first edit planned after continuation is rejected if it exactly matches the last confirmed edit, even when another participant has changed the revision. This conservative guard may reject an intentional repeat; it does not detect all semantic duplicates or guarantee model quality. The underlying exact-request receipt prevents resubmission of the recovered step. Profile claims and journal locks still require the same local state directory and are not server authorization.

**Evidence.** Isolated tests killed a profile bot after server acceptance, restarted the document server, applied another user's edit, and resumed the same mission with a deterministic planner. The bot added the remaining change, retained its original ID and step limit, and the original accepted edit appeared once. Bot undo removed both bot edits while retaining the user's edit. Cases covered both retained and previously cleared journals, an unknown receipt that remains blocked, a repeated first plan that stops, and repeated reconciliation of a queued mission. Chrome 156 headless opened a separate restarted product demo with a synthetic interrupted mission and a controlled planner process. The same mission completed and the marker appeared once in Slate, Lexical and ProseMirror; the completion screenshot is `output/validation/resume-chrome-20261029/completed.png`. That browser run was not an actual Codex planner run or human-input test. The process-kill and concurrent-user proof is from the separate deterministic restart tests, not the Chrome fixture.

The workspace suite passed 690 core, 14 bot, 59 demo, 28 documentation and 69 MCP tests, with one platform-specific MCP test skipped. The bot and demo suites passed again after the final affected-file refinements. Typecheck, documentation build and link checks, and `git diff --check` passed.

## 5.67 Three-bot proposal and restart scenario

`apps/bot/test/team-proposal-restart.test.ts` exercises three durable profile-backed bot runners and a separate user participant on a Word-style proposal. The writer adds a goals heading and paragraph; its accepted server response is held. While the writer is waiting, an organizer plans a milestone table, a reviewer plans a read-only review, and the user adds `[USER]` to the proposal. The organizer and reviewer re-read/replan when needed. The writer process and document server are then SIGKILLed, the server restarts from its saved data, and a new writer process resumes the same mission and adds milestones.

The test verifies one copy of each writer addition and the user marker, one table, two headings, the section's required header/footer, and equality of the server model and the reconnected user's model. The reviewer has no edit history and its undo returns `no_change`. Undoing the writer's two changes retains both the user's marker and the organizer's table; undoing the organizer's table also retains the user marker. Final user and server models agree. In the observed run, the organizer made three planner calls and the reviewer made two.

This scenario uses the real profile runner, MCP sessions, durable journals, document server, HTTP transport and OS processes with deterministic test planners and an automated `SyncClient` user. It is not an actual Codex model evaluation, browser test, human usability test, or power-loss test. The deterministic proxy gates an accepted writer response to locate the interruption; it does not measure latency. The test uses a private temporary directory and cleans up its own processes and data.

Verification: the bot workspace suite passed 15 tests, followed by a fresh pass of the final focused scenario after strengthening its intermediate undo and convergence assertions. Typecheck and `git diff --check` passed. The full workspace suite was not repeated for this test-only change.

## 5.68 Actual Codex bots and Chrome proposal restart

An isolated persistent product demo used three real `gpt-6.1-sol` Codex-backed profiles: Mori wrote a heading and paragraph, Tobi organized a 2×2 table, and Nuri reviewed without editing. Chrome 156.0.8078.48 automated native Slate input of `[human-proposal]` while all three tasks reported running. The last pre-shutdown observation showed the user's text and Mori's heading on the server, all three tasks running, and Mori's mission marked pending. The product server was then stopped with SIGINT; it sent SIGTERM to its child processes. It restarted with the same port and data directories, and the three original mission IDs subsequently completed. The final section contained one copy of the requested heading, paragraph, table cells and user marker, with required header/footer present. Server model, client models and native Slate, Lexical and ProseMirror models were equal.

Nuri's MCP undo returned `no_change`. Mori's undo removed its heading and paragraph while preserving the user's text and Tobi's table. Tobi's undo removed that table while preserving the user's text. Chrome then showed all three native models equal to the server again. Screenshots, mission snapshots and undo results are under `output/validation/realteam-restart-20261029/` (`after-edit-before.json`, `after-edit-after.json`, `after-edit-verify.log`, `after-edit-undo.json`, and `after-edit-verify-undo.log`). User input was automated, not a human usability test.

The pre-shutdown observation and the actual process termination were not atomic. The resumed Mori record does not establish that its accepted edit was still pending at the instant of termination; therefore this run does not prove the precise accepted-before-ack crash boundary with a real Codex planner. That boundary remains covered by the controlled process test in §5.67. An earlier `gpt-6-sol` trial restarted while all tasks were planning; Tobi and Nuri completed but Mori stopped with a model-capacity error and needed a separate new `gpt-6.1-sol` task. Another initial browser harness timed out because it read an async snapshot without awaiting it; the corrected harness awaited the snapshot and passed. These earlier outcomes are retained in the same evidence directory. No power-loss, sustained-load or semantic-quality claim follows from these runs.

## 5.69 Actual Codex accepted-before-response gate

An isolated macOS product demo and a test HTTP proxy exercised a real `gpt-6.1-sol` profile bot. The proxy read the server's accepted conditional response and withheld it from the bot. It saved the exact request and response, sent SIGKILL to the bot process, and sent SIGINT to the product server, which shut down its backend processes. Before restarting, the mission was still running with a pending step; its durable journal and step evidence had the same digest and exact change as the accepted request. After restarting the same server data, an exact receipt query returned `accepted` at the original server sequence. A new real Codex `resume` process restored the same mission, recorded `Recovered the confirmed edit without resubmission`, and completed it.

Two user-input conditions produced different results:

1. **Unconfirmed Chrome input: fail for automatic reconnection.** In `codex-gate`, the Slate user input `[gate-human]` was pending at shutdown. After restart it remained visible in Slate's local model and native view, but Slate stayed offline with one pending change; the server, Lexical and ProseMirror did not contain the text. Existing epoch-change handling intentionally retains unconfirmed changes locally and blocks reconnection. The bot's accepted edit was recovered, but this run does not establish durable preservation or delivery of the user's unconfirmed edit. The isolated Chrome session `codex-gate-validation`, product server on port 55428, and `/tmp/doc-sync-codex-gate-llxyQq` data were left running/preserved to retain that local pending state. Do not reload or close that tab if its local state is needed.
2. **Server-confirmed Chrome input: pass for recovery and undo.** In `codex-confirmed-two`, a separate proxy gate held bot submissions until `[confirmed-human]` was server-confirmed and all three editor models matched at sequence 2. The bot's old base was rejected as stale, it replanned, and its accepted edit at sequence 3 was held before response and interrupted as described above. After restart the receipt was accepted, the confirmed user text and one bot heading remained, and the same mission resumed without resubmission. A bot MCP undo removed its heading and paragraph while preserving `[confirmed-human]`, the required header and footer. Chrome 156.0.8078.48 then showed the server, Slate, Lexical and ProseMirror in agreement at sequence 4. Chrome input was automated.

**Content-quality failure.** The requested paragraph was `Confirmed exactly once.` but the real model inserted only `Confirmed` and reported completion. The exact-once recovery assertion concerns the accepted operation; it does not imply the generated content met the mission. A separate `codex-confirmed` setup attempt timed out while its test proxy held the request too long; it left an unconfirmed mission and was not counted as the successful run. A first receipt probe used the wrong test protocol number and got HTTP 426; the corrected protocol-3 probe returned the accepted receipt. Raw gate captures, mission/journal/bridge snapshots, receipts, browser logs, and undo evidence are in `output/validation/codex-accepted-gate-20261029/`. Tests used isolated data and do not simulate power loss or establish production reliability. No full workspace suite was rerun for this verification-only work.

## 5.70 Browser recovery transport groundwork; automatic recovery remains open

`HttpTransport` now exposes the existing server recovery-state, protected reservation, exact ordinary-change receipt, exact recovery submission and reservation-release operations. These delegate to the same HTTP validation as `NodeHttpTransport`. This is transport groundwork only: `SyncClient` and the product demo do not invoke the operations or automatically reconnect after an epoch change with pending edits. The existing fail-closed behavior and live pending state from §5.69 remain unchanged.

Before implementing automatic recovery, preserve evidence tying the local replica to the original server generation and schema, protect the relevant history against GC, reconcile each exact pending change in order using server receipts and a protected reservation, and handle concurrent local editing, reset/schema transitions, lost replies, undo history and reservation release. Do not infer that an unknown receipt means the change was rejected or discard the old pending state merely because a server sequence advanced. Sessions created before a safe generation association was captured may need separate recovery inspection. The saved Slate session from §5.69 remains open; no reload, restart or mutation of that session was attempted in this work.

**Verification so far.** A server integration test using the browser transport established a reservation, recovered a pending change alongside another actor's change, SIGKILLed and restarted the server, then checked an exact receipt and repeated the recovery submission. Both texts appeared once. A fresh isolated Chrome 156.0.8078.48 session successfully read recovery metadata, created/released a protected reservation, obtained an `unknown` receipt, and rejected recovery for a wrong generation; evidence is in `output/validation/browser-recovery-primitives-20261029/`. This is not a Chrome pending-edit or automatic-reconnection test. Automatic user-edit recovery remains unimplemented and §5.69's original scenario remains unresolved.

The demo workspace suite passed 60 tests, four focused browser/Node transport tests passed, and typecheck and `git diff --check` passed. No full-workspace suite was run.

## 5.71 Document authoring bot product design

Added `docs/document-authoring-bot-design.md` to define the proposed authoring workflow, task brief, verification contract, roles, concurrent-edit and recovery boundaries, examples, and staged acceptance gates. This is a design document, not an implementation. The real partial-content completion failure in §5.69 motivates independent post-edit requirement checks. Browser recovery with unconfirmed edits remains open as described in §5.70 and is the first delivery gate. Existing local role restrictions are not server authorization; review/proposals, scoped authorization, source checking, and independent completion verification remain proposed.

Verification: inspected the existing bot runner, planner and product design, and checked the design and handoff diff for whitespace errors. No implementation, browser run, model run, or test suite was performed for this design-only change.

## 5.72 Experimental read-only review watcher

Added `apps/bot/src/watch.ts` and a `watch` CLI command. A running local watcher records an in-memory server-state baseline, coalesces sequence advances into serial bounded reviewer missions, and stops on identity/schema/epoch change, failure, or the configured run limit. The first observation does not launch a review. The runner's existing local reviewer guard rejects edits; this is not server authorization. Ctrl-C stops new work but does not cancel a review already in progress. The watcher does not persist its cursor or recover missed events, and it provides no browser integration or proposal/apply workflow. Server sequence advances may include non-content events. See `apps/bot/README.md` for operation and limits.

Browser recovery from §5.70 remains unimplemented; no automatic pending-input recovery or autonomous write capability is claimed. The watcher is an independent read-only experiment, not completion of the recovery-first plan.

Verification: the bot workspace suite passed 18 tests, including three new watcher tests for baseline/coalescing, budget, overlapping polls, stop, changed identity and uncertain outcomes. Typecheck and `git diff --check` passed. A CLI option check confirmed invalid intervals are rejected. The watcher was not tested against a live server, real Codex, Chrome, server restart, or a human user. An initial CLI/typecheck attempt exposed an incorrect import and was fixed before the final checks; an earlier concurrently started bot suite included that pre-fix CLI failure and is not the final result.

## 5.73 Preserve pending work on live reset

A live `reset` event previously cleared the client document, pending changes, and undo history even when a local change had not been acknowledged. `SyncClient` now disconnects with an error and retains the previous epoch and local state if pending work exists. It checks both before reset callbacks and after them, because an editor callback may commit an in-progress draft. Clean resets still follow the existing reset path. This is a preservation guard, not automatic recovery; the user must retain the local session and the unresolved limitations in §5.70 remain.

Verification: two added protocol regressions cover pending work before the reset and work committed by a reset callback, including history and epoch preservation. The protocol plus demo reset tests passed 24/24; the full core workspace passed 692/692; typecheck and `git diff --check` passed. An isolated headless Chrome 156 page using the real client and a synthetic transport showed the pending checkpoint and epoch unchanged, a reported error, and the disconnected state. The fixture is under `output/playwright/reset-preservation/`. This was not a native editor interaction, an actual server restart, a multi-user convergence test, or a test of automatic reconnection. The pre-existing pending Slate session was not touched.

## 5.74 Opt-in live browser recovery and restart history

The product demo now enables live recovery with `?recovery=1`. Before editing, `LiveRecovery` binds the local session to the server generation and schema and obtains a durable reservation that protects the required history against GC. After a server restart, it checks exact change receipts, recovers pending changes in order, and preserves undo and redo history. Recovery stops and retains local state if the generation or schema changes, required proof is missing, or local changes occur during recovery. This is an opt-in demo feature, not production acceptance.

**Chrome evidence.** Headless Chrome 156 used a Word document with native Slate, Lexical and ProseMirror editors. Automated keyboard input added `[remote]` in Lexical. The browser then blocked Slate POST requests while native Slate input added `[local]`, leaving seven pending changes. The product server stopped gracefully with SIGINT and restarted with the same data and port. Automatic reconnection made the native editor models, client models and server model converge, with each marker present once. Seven Slate undo operations removed `[local]` and retained `[remote]`; seven redo operations restored `[local]`. A second graceful restart with no pending changes retained the history: seven undo operations again retained `[remote]`, and seven redo operations restored `[local]`. All models converged after redo.

The Chrome run used automated native keyboard input. It was not a human-input, OS-IME, power-loss or production-reliability test. The exact accepted-but-unconfirmed boundary and another user's change after restart are covered by separate server integration tests, not by this Chrome run. The browser session keeps its recovery state in memory; page reload recovery is not implemented. Safe retirement of GC protection is not available, so durable GC pins remain retained. A schema upgrade stops this recovery protection and requires separate handling. This evidence does not resolve recovery for the older unprotected session preserved in §5.69.

**Verification.** The core suite passed 699 tests and the demo suite passed 64 tests. Typecheck and `git diff --check` passed. These results cover the stated suites and live browser scenario; they are not a full-workspace or production acceptance result.

## 5.75 Durable browser reload recovery and explicit retirement

The opt-in product demo (`?recovery=1`) now saves each editor actor, recovery proof, client checkpoint and retirement intent in `localStorage`. Web Locks prevent a second tab from using the same recovery actor at the same time. Reload uses the saved actor for the same origin, server, document and editor slot. Checkpoint writes precede change submission. A failed storage write stops the session. Restoration checks the server proof before editing or subscribing. This extends §5.74: page reload recovery and explicit retirement are now implemented. Schema upgrades are disabled while this recovery mode is enabled.

**Chrome evidence.** Chrome 156 opened a Word document with native Slate, Lexical and ProseMirror editors. Automated native Lexical input added `[remote]` and reached the server. Blocking Slate `/changes` requests then left seven pending changes from native Slate input of `[local]`. The saved browser records contained the actor IDs and seven pending Slate changes. `page.reload()` restored the same actors. All three editor models and the server model converged to `Project brief[remote][local]`, with each marker present once.

The product server then stopped with SIGINT and restarted on the same port with the same data. After another page reload, seven Slate undo operations removed `[local]`, retained `[remote]`, and left all models equal. A further reload preserved the redo history: seven redo operations restored `[local]`, and all models were equal again.

**Retirement evidence.** The browser forwarded Slate's reservation-release request to the actual server, then replaced the successful response with HTTP 503. The browser retained the saved release intent. On reload it retried the same reservation ID, recorded `retired: true`, and left Slate offline. The server log contained the exact Slate `recoveryPin` record with `pin: null`. The other editors kept their recovery protection, and document content stayed unchanged. This tests a simulated lost release response after server acceptance. It does not simulate power loss.

Explicit retirement discards that editor's undo and redo history and stops its editing session. Further editing requires a new session. Reload alone does not retire other reservations: their protection is intentionally retained for later recovery. This feature still requires the saved origin-local storage and the same document identity. It does not recover the older unprotected session in §5.69, prove OS-IME behavior, or establish production reliability.

**Verification.** The core suite passed 719/719 tests and the demo suite passed 64/64 tests. Typecheck, the product bundle build and `git diff --check` passed. After the final change to block local mutations when closing a recovery actor lock, a fresh focused run passed 11 browser-recovery and 17 live-recovery tests (28 total). The full suites preceded that last change. Chrome also confirmed that an actual duplicate tab was rejected by the Web Lock. The browser scenario used automated native keyboard input. Its evidence is under `output/playwright/durable-recovery-20261101/`; earlier raw browser logs are under `.playwright-cli/`.

## 5.76 Isolated Rust and WebAssembly storage experiment

`experiments/rust-core/` contains an isolated UTF-16 text-splice primitive. It is not part of the production engine or npm workspaces. It has no CRDT merge, operation identity, synchronization, persistence, undo history, presence or editor adapter. It preserves UTF-16 code units, including isolated surrogates, and rejects an invalid range before mutation. It does not establish compatibility with the production document engine.

Four Rust unit tests, the format check, the native release build and the WebAssembly release build passed. JavaScript and WASM checksums matched for 0, 1, 31 and 1,000 edits; the native 1,000-edit checksum also matched. With 100,000 input code units, 1,000 edits per batch and seven measured samples, the observed medians were 1.523 ms for native Rust, 1.677 ms for JavaScript `Uint16Array`, and 7.273 ms for Rust WASM. WASM was slower than JavaScript in this run.

These measurements used Apple Silicon, Rust 1.86 and Node 18.10.0. They are not results for the repository's required Node 24 runtime. Timing includes allocation, initialization, edits and checksum; it excludes WASM loading and compilation. One WASM call runs a whole batch, so the measurements do not include text transfer or per-edit boundary costs. The implementations use different allocation strategies. Engine integration, full CRDT equivalence, browser execution and editor input latency are **NOT_RUN**. No production-engine speedup follows from this experiment.


## 5.77 Ordered bot delivery and initial brief verification

**Scope.** The engine roadmap retains items 1–9. `docs/bot-roadmap.md` records a separate sequence: B1 recovery within the opt-in local demo scope; B2 structured briefs and completion checks; B3 plans, proposals and server authorization; B4 templates and schema-specific authoring; B5 coordination and a persistent watcher; B6 operations, sources and memory. The authoring design and bot README link this sequence. The initial B2 CLI checks are implemented, but the B2 stage remains in progress. The Rust experiment remains a separate lane, not an engine migration or a B2 acceptance result. Node 24 and browser experiment work is continuing separately.

**Implementation.** `run --brief FILE` accepts a version-1 brief with an objective and explicit requirements. The original mission remains required. Initial requirement kinds are `exact_text`, `node_type`, and `manual`. Paths follow schema model `children` indexes, not editor positions or text offsets. Exact text compares the whole text node, including supported declared spans; it is not a substring or occurrence-count check. Brief validation rejects unsupported or oversized inputs. The saved brief is supplied to the planner and retained across supported profile recovery.

Before accepting a planner's finish, the runner rereads the settled document, verifies the schema fingerprint, and compares the read revision with authoritative server metadata. A revision mismatch requires another planning iteration within the original budget. This barrier prevents a local read delayed behind the server event stream from passing an obsolete result. The report records requirement results and `checkedRevision`. All requirements must pass for `completed` with `completion: verified`. A failed requirement or an unchecked manual requirement yields `needs_attention` and the saved report. A mission without a brief can still report `completed`, but is labeled `completion: model_reported` and `verification.status: not_checked`. Verification states what was observed at the checked revision; it cannot guarantee later edits or general document quality.

**Evidence.** The bot workspace passed **38/38 tests**, with zero failures and zero skips. The pure brief checks passed **10/10**. Workspace typecheck and `git diff --check` passed. These include rejection of the partial `Confirmed` result for the exact requirement `Confirmed exactly once.`, check failures, manual requirements, and the supported integration and recovery paths. Documentation tests passed **28/28**. Documentation build and static checks passed **32 pages and 1,880 internal link, fragment and asset targets**, with English prose and local-path exclusion checks.

A real Codex run using `gpt-6.1-sol` passed after the authoritative revision barrier and schema fingerprint correction. Mission `87d48ffe-4d0f-459a-8d7a-7085ba920d0f`, document `verified-final`, inserted `Confirmed exactly once.` and finished with `completion: verified`. Both `node_type: paragraph` and `exact_text` at `[0]` passed at server sequence 1. An independent server state read matched the exact text and sequence. Receipts: `output/validation/bot-brief-20261101/final-receipt.json` and `codex-final.json` in the same directory. The earlier positive model run preceded the final guards and is not the final-source receipt.

**Limits.** This is a CLI runner change, with no new Chrome check or browser brief-entry integration. Source verification, general preservation and placement requirements, template acceptance, proposal storage, and server-enforced bot scope remain later work. A local reviewer restriction is not server authorization. The 719 core and 64 demo counts in §5.75 remain historical checkpoint results with their stated final-change boundary; they are not new full-workspace evidence for this change. No commit, push, publication or production acceptance is established by this section.


## 5.78 Rust storage experiment: Node 24 differential and Chrome evidence

The production server and client remain TypeScript. The isolated package in `experiments/rust-core/` now has a native test-only line protocol and a deterministic differential check against a JavaScript UTF-16 string oracle. All 265 sequential operations passed: 142 valid edits and 123 invalid edits. The check compares the complete state after each operation and covers random edits, invalid ranges, atomic rejection, end insertion, empty text, and isolated surrogates. Four Rust unit tests, the format check, and native/WASM release builds passed. This is a narrow text-storage contract, not full CRDT equivalence.

The follow-up used Node 24.22.1 and recorded seven samples after three warm-ups for a 1,000-edit batch over 100,000 initial UTF-16 code units. Median timings were 1.759 ms for JavaScript `Uint16Array` and 8.050 ms for Rust WASM. Both returned checksum `719347296`. This replaces the Node 18 runtime limitation for this follow-up only; the original receipt remains historical. Raw samples and differential counts are in `experiments/rust-core/receipt-node24.json`.

Actual Headless Chrome 156 execution of the standalone `browser.html` harness passed with the same input size, edit count, sample count, warm-up count, and checksum. Median timings were 1.700 ms for JavaScript and 7.300 ms for Rust WASM. The exact browser result is preserved in `output/validation/rust-browser-20261101/chrome-result.json` and copied to `experiments/rust-core/receipt-chrome.json`. English methodology and result notes are in `experiments/rust-core/README.md` and `RESULTS.md`.

WASM was slower than the JavaScript baseline in both follow-up runs. Timing includes allocation, initialization, edits, and checksum; it excludes WASM loading, compilation, text transfer, and per-edit boundary calls. Browser PASS applies only to this isolated batch harness. Production integration, full engine semantics, server/client Rust migration, editor input latency, and production acceptance remain NOT_RUN. No commit, push, or publication is established by this section.

## 5.79 Rust roadmap and parallel storage/bridge slices

**Scope.** `docs/rust-roadmap.md` defines R1 UTF-16 contract and baseline, R2 safe storage comparison, R3 per-edit UTF-16 bridge, R4 shadow CRDT semantics, R5 native server and WASM client shadow adapters, and R6 end-to-end gates with an explicit go/no-go decision. The engine and bot roadmaps and the experiment README link this sequence. R1 retains the bounded evidence in §5.78. R2 and R3 have initial slices; full stage acceptance remains pending. R4–R6 are planned. These experiments do not switch the production TypeScript server or client to Rust.

**R2 native storage slice.** `experiments/rust-core/` adds a safe gap buffer and a native comparison against the existing vector. Four new tests and four existing tests passed. The new trace and growth/shrink tests compare complete Vec/Gap state after each of 59,000 operations. Separate cases cover invalid-range atomicity, empty boundaries, surrogate units, and gap growth. Format and Clippy checks passed. The first plain release-test attempt failed because the existing release profile uses `panic = "abort"`; `CARGO_PROFILE_RELEASE_PANIC=unwind cargo test --offline --release` passed all eight tests. The profile itself was not changed for that test.

The native benchmark used Homebrew Rust 1.87 on aarch64, release LTO, 100,000 initial UTF-16 units, 10,000 edits, seed `305419896`, one warm-up per implementation, and seven samples with alternating implementation order. Vec/Gap median edit-batch times were 10.203625/0.144333 ms for local edits, 13.737791/7.875500 ms for random far jumps, and 17.584583/27.428667 ms for alternating ends. The gap buffer regressed on alternating-end edits. Construction and full-result materialization have separate raw arrays. Construction includes the input copy; trace generation, checks, and destruction are excluded. The 100,064 initialized gap-storage units are not capacity, peak allocation, or RSS. Complete final vectors matched in every timed sample. Results and limits are in `experiments/rust-core/STORAGE-RESULTS.md` and `storage-comparison-native.jsonl`. The reference is the existing Rust vector, not an independent JavaScript oracle. Independent JavaScript storage parity and the WASM storage comparison remain pending for full R2 acceptance.

**R3 bridge slice.** The separate `experiments/rust-bridge/` crate exercises real per-edit UTF-16 input and full-output transfers, handles, disposal, stale-handle rejection, bounds, capacity limits, and WASM memory growth. Two native tests and the WASM build passed. An initial doctest attempt failed because rustup rustc 1.86 was mixed with Homebrew rustdoc 1.87; selecting both rustup tools fixed that invocation. Independent review reproduced two wrapper bounds defects: mutable scratch capacity and an overridden `Uint16Array.length`. Both were fixed and given regressions. Independent final hostile-input review found no remaining blocker. Earlier pre-fix receipts are superseded for acceptance.

Final Node 24.22.1 and actual Headless Chrome 156 runs each passed 4,000 random edits and 4,018 exact-read/hash checks. The final Chrome receipt is `output/validation/rust-bridge-20261101/chrome-final.json`, copied to `experiments/rust-bridge/receipt-chrome.json`. Node evidence is `experiments/rust-bridge/receipt-node24.json`. Final source hashes identify the reviewed wrapper and suite; the WASM SHA-256 is `76aa6dc0e07df754c8c190da5fe6dcb8da94b5d8152eb1df2116a1394512b68f`. The earlier `chrome-result.json` is pre-fix evidence and is not the final acceptance receipt.

For 100,000 initial units, 2,000 edits, one warm-up, and five samples, Node medians were 49.965 ms for JavaScript string edits, 14.582 ms for WASM per-edit input, 83.122 ms for per-edit input plus full output, and 14.293 ms for the whole WASM batch. Final Chrome medians were 12.30, 14.70, 63.60, and 14.40 ms for those named paths. The timing boundaries differ: JavaScript measures string edits; the per-edit input path includes checks, input copy, and splice; the full-output path also copies the document each edit; the whole batch includes initialization, PRNG, and hashing without text transfer. These numbers do not isolate ABI overhead or pure allocation/edit cost and do not establish a production speedup. Startup and encode/create+copy/read+copy/decode/close phases are recorded separately; short Chrome phases are timer-resolution limited. This is a bounded initial R3 slice, not full R3 acceptance or CRDT/editor integration.

**Limits and verification.** The roadmap documents use English prose and preserve local-edit versus far-jump workloads, separate timing phases, full-state correctness gates, and explicit no-go outcomes. Documentation tests passed 28/28 before the later result-only prose updates; scoped whitespace checks passed. Final integration review and any later documentation build are recorded separately. Full CRDT equivalence, production Rust adapters, actual editor latency, and production acceptance remain NOT_RUN. No commit, push, publication, or engine migration is established by this section.


## 5.80 R2 bounded storage comparison: independent JavaScript and WASM

**Scope and decision.** The declared bounded R2 storage comparison gate passed.
The isolated `experiments/rust-core/` package now compares the existing Rust
Vec and safe Gap implementations against an independent JavaScript UTF-16
string oracle in Node 24.22.1 and actual Headless Chrome 156. Each runtime
passed 30,538 validation operations with complete state comparison after each
operation for both WASM backends; the receipts report 29 invalid cases. All
three final trace hashes also match the native benchmark. This is storage
acceptance within the declared workloads, not full Rust CRDT equivalence.
The production TypeScript server and client remain unchanged by this work.

**Correctness and review.** Eleven native tests passed, including three added
adapter tests for slot lifecycle, UTF-16 preservation, invalid-input atomicity,
and exact capacity. The offline WASM build passed. Review exposed a JavaScript
wrapper bounds defect when a shared typed-array getter changed after import.
The fix captures intrinsic accessors and primitive lengths. Final regressions
cover changed prototype and own getters, oversized input with a false length,
detached input, rejected coercion, growth/shrink, invalid ranges, and
clear/reinitialize behavior. Explicit WASM memory growth detached the old
buffer; later operations still matched. Earlier receipts from before these
fixes are superseded. The final source manifest stayed unchanged across the
Chrome run. The existing TypeScript core regression suite passed 720 tests.

**Timings and regression.** Workloads use 100,000 initial UTF-16 units, 10,000
edits per trace, seed `305419896`, one warm-up, and seven samples. Implementation
order cycles through all six permutations, then repeats the first. Node
JavaScript string/Vec/Gap edit-batch medians were 267.339/59.062/1.235 ms for
local edits, 272.150/71.707/48.223 ms for far jumps, and
259.388/73.219/145.448 ms for alternating ends. Chrome medians were
58.9/58.4/1.1, 61.6/70.9/47.4, and 62.9/71.6/143.4 ms respectively.
Gap regressed against Vec for alternating ends in native and both WASM runs.
Chrome Vec also regressed against JavaScript strings for far jumps and
alternating ends. The original native benchmark and R1 baseline remain
separate historical measurements.

Construction, edit batches, and full-result materialization retain separate
raw arrays. Construction includes input conversion/copy. WASM edits include
JavaScript checks, per-edit input copying, and ABI calls. Full WASM reads copy
through output scratch into a fresh JavaScript array. Trace generation,
correctness checks, hashing, and disposal are outside the timers. Loading and
compilation are excluded. These intervals do not isolate pure storage or ABI
cost. Chrome sub-0.1 ms phases are timer-resolution limited; recorded zero
values do not mean zero cost. Logical text and each scratch buffer are bounded
to 1,048,576 units; two scratch buffers reserve 2 MiB each. This does not
measure allocator capacity, peak memory, retained memory, or process RSS.

**Evidence and limits.** Final raw receipts are
`experiments/rust-core/receipt-storage-node24-r2.json` and
`experiments/rust-core/receipt-storage-chrome-r2.json`; source and artifact
hashes are in `experiments/rust-core/receipt-storage-source-r2.json`.
The original final Chrome capture is
`output/validation/r2-storage-20261101/chrome-final.json`. English conditions,
phase tables, commands, and limits are in `experiments/rust-core/README.md`
and `STORAGE-RESULTS.md`; `docs/rust-roadmap.md` records the bounded R2 status.
R3 full acceptance remains pending. Full CRDT equivalence, production Rust
adapters, actual editor latency, and production acceptance remain NOT_RUN.
No commit, push, publication, or production speedup is established here.

Documentation verification passed 28/28 tests. The final docs build passed;
the build check inspected 32 pages and 1,880 internal links, with English and
local-path exclusion checks passing. All 24 relative Markdown link targets in
the four updated roadmap/experiment documents exist. Scoped `git diff --check`
passed. These checks validate the documents; they do not add product evidence.


## 5.81 R3 bounded boundary costs and lifetime completion

**Decision.** R3 passed its declared bounded boundary and lifetime gate. The
production server and client remain TypeScript. Full CRDT semantics, Rust
production adapters, actual editor latency, and production acceptance remain
NOT_RUN. This section adds evidence to the historical initial slice in §5.79;
it does not rewrite its original receipts or source hashes.

**Correctness and lifetime.** Six native Rust tests and the offline release
WASM build passed. Node v24.22.1 on macOS arm64 and actual Headless Chrome
156.0.0.0 each passed 4,000 differential edits, 4,018 complete UTF-16 read/hash
checks, 2,000 lifetime cycles, and 5,997 stale-handle rejections. Final live
handles and logical units were zero. Disposal is terminal and idempotent;
injected close failure preserves the failed handle for retry and does not skip
other handles. Ownership, hostile metadata, forged brands, detached inputs,
and view refresh after growth passed. A separate independent audit passed 13
assertions, including a genuine cross-realm Uint16Array. No blocker remained
in this declared contract.

Linear memory was 7,667,712 bytes before/after the repeated cycles, then
7,733,248 after explicit growth by one 64 KiB page in both runtimes. These
counters and observations establish logical release and view validity. They
do not prove allocator, process RSS, or JavaScript GC leak freedom. Raw exports
remain trusted instance-level access. Trap recovery and allocation failure
are outside the gate.

**Costs and regressions.** Both runtimes completed 42 calibrated boundary
cases with seven measured batches each. Controls cover scalar/probe calls,
reused input/output copies, fresh output allocation plus copy, and a Rust
scratch transfer that includes its WASM call. At 100,000 UTF-16 units,
Node/Chrome median WASM-memory input-copy costs were 2.690/2.856 us; reused
output 2.581/2.661 us; fresh output 20.333/7.617 us; Rust scratch transfer
13.911/14.063 us. Rust scratch transfer was slower than the JS control in both
runs. Loop/JIT effects remain; no subtraction isolates pure ABI or allocator
cost. Seven batches of 1,000 complete create/read/close cycles had median
46.721/41.200 ms. The aggregate includes copies, allocation/drop, views, and
assertions. First startup observations have unknown engine cache state;
repeated retained-module instantiation and wrapper-init batches are separate.

For the original 2,000-edit workload, Node/Chrome medians were
50.384/11.700 ms for JS string edits, 14.874/14.500 ms for per-edit input,
79.018/64.000 ms for input plus full output, and 14.213/14.300 ms for one whole
WASM batch. Chrome per-edit input regressed against its JS string path. Full
output was slower in both runtimes. Boundaries differ, so these are standalone
observations and do not establish a production speedup.

**Evidence.** Final receipts are
`experiments/rust-bridge/receipt-boundary-node24.json` and
`experiments/rust-bridge/receipt-boundary-chrome.json`. Chrome's raw capture is
`output/validation/r3-boundary-20261101/chrome-final.json`. Both receipts match
the final measured sources and WASM SHA-256
`047cbee64965a7e4826210486350e29041d2b2eb06a509a77b8525501dc97306`.
They retain every sample, call count, checksum, workload, runtime, and source
hash. English methodology and tables are in the bridge README and RESULTS;
roadmaps record bounded R3 acceptance. Production TypeScript tests were not
rerun because this completion changes only the isolated experiment and docs.
No commit, push, publication, or production migration is established here.


Documentation verification after the R3 prose updates: **28/28 passed**.
The docs build passed. The build check inspected 32 pages and 1,880 internal
links; English and local-path exclusion checks passed. All 12 relative Markdown
link targets in the four scoped roadmap/bridge documents exist. Scoped
`git diff --check` passed. These checks validate documentation and do not add
production or editor evidence.


## 5.82 Same-algorithm JavaScript Gap and Rust WASM Gap

**Scope and decision.** This follow-up compares JavaScript Gap with the existing
Rust WASM Gap backend under the same gap algorithm, prepared UTF-16 inputs,
traces, and fresh contiguous output contract. The current practical WASM path
has no measured gain. Current measurements do not provide a performance
justification for production migration; the formal R6 decision is pending.
Production TypeScript remains authoritative. This is storage evidence, not
full CRDT or editor evidence.

**Matched conditions.** Both start with 64 initialized gap units, move the gap
with overlapping copy, delete before growth, and grow by
`max(required - gap, floor(logicalLength / 2), 64)`. Each runtime uses 100,000
initial units, 10,000 edits, seeds 305419896 and 192837465, local/far-jump/
alternating-end traces, one warm-up per implementation, and seven samples
with alternating order. Construction includes input copy; edits, fresh output,
and the per-sample sum have separate arrays. Preparation, checks, hashing,
disposal, and module instantiation are excluded. WASM includes wrapper checks,
input/output scratch work, per-edit calls, and the Rust mutex. JavaScript growth
always allocates a new typed array; Rust Vec can reuse capacity. This does not
isolate a Rust language, ABI, or allocation effect.

**Correctness.** The JavaScript suite passed 4,062 assertions, including 4,000
oracle operations. Node v24.22.1 on macOS arm64 and actual Headless Chrome
156.0.0.0 each passed 60,033 operations with complete-state comparison after
every operation, including 19 invalid cases and six seed/trace pairs. Checks
include growth, isolated surrogates, fresh-output mutation isolation, and view
refresh after memory growth. An independent algorithm audit passed. Source
and WASM hashes match across Node, Chrome, and the before/after browser checks.
These finite checks do not prove all storage histories or CRDT semantics.

**Costs and regressions.** For seeds 305419896/192837465, Node JS/WASM edit
medians in ms per 10,000 edits were local 1.071/1.218 and 0.943/1.116;
far-jump 9.967/48.328 and 9.427/48.262; alternating ends 29.568/142.938 and
29.646/145.744. Chrome JS/WASM edit medians were local 0.900/1.100 for both
seeds; far-jump 9.100/47.500 and 8.700/46.800; alternating ends 28.300/142.800
and 28.700/143.700. WASM edit and pipeline medians were higher in all six
seed/trace pairs in both runtimes. Chrome's first local pair had one of seven
WASM pipeline samples below its paired JS sample; the other five had none.
Small rounded phase medians are not zero-cost evidence.

The earlier string-versus-Gap gain does not establish an intrinsic Rust benefit:
JavaScript can use the same algorithm. This practical comparison does not rank
native Rust, server execution, or pure language cost. Timed steady traces do
not measure growth performance. Initialized storage lengths and scratch bounds
do not measure allocator capacity, peak allocation, retained memory, JavaScript
heap, or RSS. Production integration, full CRDT parity, real editor input
latency, and production acceptance remain NOT_RUN. The earlier 720 TypeScript
tests were not rerun because this follow-up changes only the experiment and
docs.

**Evidence.** Receipts are `experiments/rust-core/receipt-gap-node24-r3.json`
and `experiments/rust-core/receipt-gap-chrome-r3.json`. Raw Chrome capture:
`output/validation/same-gap-20261101/chrome-final.json`. The experiment README
has reproduction steps; STORAGE-RESULTS has separate phase/total tables and
limits. The Rust and bot roadmaps retain R4–R6 as planned. Historical receipts
remain unchanged. No commit, push, publication, or production replacement is
established by this section.


Documentation verification after these updates: **28/28 PASS**. The docs build
passed. The build check inspected 32 pages and 1,880 internal links; English
and local-path exclusion checks passed. Scoped `git diff --check` passed.
These checks validate documentation and add no production or editor evidence.

## 5.83 No-WASM native Rust Gap versus Node.js Gap

**Scope and result.** The isolated storage experiment now compares native
Rust Gap with the same-algorithm Node.js Gap, without WASM. Native edit and
pipeline medians were lower in all six measured seed/trace conditions. Native
whole-process RSS was lower at all six sampled stages. This supports further
native experiments. It does not measure the current production server, isolate
an intrinsic Rust language benefit, or approve a production migration. The
previous WASM regressions remain historical evidence for their own paths.

**Matched conditions.** The final receipt uses Node v24.22.1 on macOS arm64,
Apple M3 Max, 14 logical CPUs. The native release build used rustup Rust 1.86.0,
LTO, one codegen unit, and panic abort. Ambient Homebrew Rust 1.87.0 is separate.
An earlier run had incomplete compiler attribution; a corrected full rerun
provides the final values. Both runtimes read identical binary trace bytes
outside the timers. Each condition uses 100,000 initial UTF-16 units and
10,000 edits; two seeds cover cursor-local, far-jump, and alternating ends.
Seven paired samples alternate order. Each runtime/sample starts a fresh
process with five complete untimed warm-ups. Construction, edits, and fresh
output have separate timers. Pipeline is their sum per sample. Startup, parsing,
JSON, IPC, oracle checks, hashing, and release are excluded. External host load
is uncontrolled. These are storage timings, not process or IPC timings.

**Correctness and regression.** An independent JavaScript string oracle passed
24,009 operations against both runtimes with full state checked after every
operation. Six 4,000-edit traces start with 128 units; nine additional cases
cover errors and growth, including four atomic rejections. Initialized storage
growth parity passed. All 84 measured outputs and twelve memory-run outputs
passed complete final-state checks. Final source/binary hashes match before
and after measurement; an independent receipt integrity audit passed. Native
regression tests passed 13/13 (seven library, two native runner, four storage).
The JavaScript suite passed 4,062 assertions, including 4,000 oracle operations.
Production TypeScript source was not changed, and its earlier 720-test result
was not rerun or promoted to current evidence.

**Timing and regressions.** For seeds 305419896/192837465, Node/native pipeline
medians in milliseconds were cursor-local 0.928375/0.138876 and
1.027583/0.133792; far-jump 9.236333/8.216250 and 9.315251/8.178208;
alternating ends 30.001999/27.107958 and 29.341499/27.239125. Native pipeline
won 41/42 paired samples. One first-seed far-jump sample was slower than its
Node pair. Native first-seed alternating-end fresh-output median also regressed:
0.026375 ms versus Node 0.021666 ms. Large gap movement still dominates far-jump
and alternating-end costs. Phase and pipeline tables preserve these limits.

**Memory.** Twelve separate fresh processes pause before trace load and after
load, construction, edits, materialization, and release. The parent samples
external Darwin `ps` RSS in KiB for both runtimes. Native baseline was 1,248 KiB;
Node baseline was 47,088–47,680 KiB. Materialized native RSS was 2,928–3,056 KiB;
Node was 63,616–65,104 KiB. Parsed trace data remains retained through release
in both runtimes; no forced GC is used. Full-output JSON serialization occurs
after the materialized snapshot and before release. Values include runtime,
trace, allocator, and output effects. They do not measure per-document heap,
peak RSS, leak freedom, multiple-document scaling, or amortization of runtime
baseline in an existing server. Post-release RSS is not a leak verdict.

**Decision and evidence.** `experiments/rust-core/receipt-native-gap-node24-r1.json`
retains raw samples, paired order, six-stage memory observations, fixture hashes,
compiler attribution, and source/binary freeze. The experiment README has
reproduction steps. STORAGE-RESULTS adds full phase and RSS tables. The Rust
and bot roadmaps separate the native gain from the earlier WASM regression.
JIT, GC, checks, allocators, and runtime baselines differ. Production server
throughput, concurrency, CRDT semantics, adapters, recovery, editor latency,
and production acceptance remain NOT_RUN. R4–R6 remain planned. No commit,
push, publication, deployment, or production replacement is established here.

Documentation verification after these updates: **28/28 PASS**. The docs build
passed. The build check inspected 32 pages and 1,880 internal links; English
and local-path exclusion checks passed. Scoped `git diff --check` passed.
These checks validate documentation, not production or editor behavior.

## 5.84 First bounded R4 native CRDT shadow slice

**Scope and result.** R4 is in progress. The independent native crate at
`experiments/rust-shadow` applies actual wire operations from TypeScript. It
does not receive expected TypeScript state as input. The pinned manifest has
a flow root, one implicit paragraph, and boolean `bold` and `italic` marks.
The supported operations are UTF-16 `text`, `del`, `undel`, and boolean-or-null
`set`. Production server and client code remain TypeScript.

**Semantic evidence.** The final harness receipt passed 614 full-state
comparisons over 588 input batches and 1,214 records, with four saved random
seeds. Comparisons include ordered token IDs and origins, UTF-16 units,
tombstones, deletion cancellations, attribute values and last-writer-wins
tickets, clock, counts, and the projected model. The harness uses the real
TypeScript `Doc`, `History`, `SyncClient`, and `DocHub` through an in-memory
network. Deterministic cases cover concurrent changes, foreign edits followed
by undo, repeated undo/redo, and duplicate replay. The random traces use
sequential causal delivery. TypeScript `History` generates inverse operations;
Rust only applies them. There is no independent Rust history implementation.

**Recovery evidence.** Two cases stop the native process and start a new one.
One snapshot includes saved `SyncClient.pending` operations; the other excludes
them. Both replay the original pending operations after foreign changes.
The Rust-owned snapshot format stores the explicit schema manifest and the
complete supported state. It is not compatible with TypeScript snapshots.
Missing required fields and invalid restore are rejected atomically. This
checks bounded native document recovery and duplicate replay, not full server
recovery or protected GC.

**Exclusions.** Nodes, moves, GC, other marks, general schemas, and schema
transitions must fail closed. Births with clock zero, reserved `~root` actor,
or null birth marks are rejected. Isolated-surrogate actor names are
unsupported; all UTF-16 text units remain supported. Unicode actor comparator
fixtures use raw `Doc.apply` outside the production server actor gate. Raw
TypeScript can accept some inputs outside this scope. General rejection parity
is not claimed.

**Integrity and decision.** Native tests passed 9/9. The final independent
audit confirmed all 53 recorded source hashes against the current files and
the before/after receipt. The native binary SHA-256 is
`ca454ee71f4ee4e59efa5bb91a52e3e761b331c38cacd50afb50e75d2e571c98`.
Eight independent TypeScript/Rust edge checkpoints and a fresh-process restore
also passed. Evidence is `experiments/rust-shadow-harness/receipt.json`; both
experiment READMEs provide reproduction steps. The crate and harness are
isolated experiments. No production TypeScript mutation or fresh core-suite
result is established by this work. R4 is not complete. Full CRDT equivalence,
full server recovery, protected GC, protocol compatibility, R5 adapters, WASM,
Chrome, performance, and production acceptance remain NOT_RUN. No commit,
push, publication, deployment, or production replacement is established here.

Documentation verification after these updates: **28/28 PASS**. The docs build
passed. The build check inspected 32 pages and 1,880 internal links; English
and local-path exclusion checks passed. Scoped `git diff --check` passed.
These checks validate documentation, not production or editor behavior.


## 5.85 Independent Rust History, selection, and pending inverse replay

**Delivery.** Rust now generates its own undo and redo operations for the pinned
single-paragraph schema. TypeScript remains the production engine and the
reference. The isolated native implementation captures prior registers for local
operations, preserves shared formatting ownership identities, groups contiguous
input within the existing 1,500 ms window, retains 100 history groups, returns
caret keys, invalidates redo branches, clears history, and exports deletion pins.
It does not receive expected TypeScript states or inverse operations.

Undo cancels only the participant's deletion. A foreign deletion keeps its
characters hidden. A format inverse checks the current write ticket; a later
foreign write, including a same-value write, remains authoritative. Same-actor
unrecorded writes also block an old history claim. Shared ownership states keep
sequential formatting undo/redo connected without transferring a foreign write
into an earlier local claim.

**Completed checkpoint evidence.** The final History-only checkpoint uses Node
24.22.1 and native binary SHA-256
`e7e3187f40a60ffbd524c27abf0d2a0a915475cd7c5c50c1cdeb573bf7241170`.
Its receipts are separate from the original apply-only receipt in section 5.84:

| Receipt | Result at this checkpoint |
| --- | --- |
| `experiments/rust-history-harness/receipt.json` | 1,039 full document states and exact History graphs; 291 generated inverse and caret comparisons; 2,078 undo/redo flags; 1,046 pin comparisons; four atomic rejections; nine processes and eight restarts; four saved random seeds. |
| `experiments/rust-selection-harness/receipt.json` | 281 document states and History graphs; 27 generated inverses; 150 captures; 7,604 endpoint resolutions; 3,803 range comparisons; two processes and one restart; two saved seeds. |
| `experiments/rust-shadow-harness/receipt-current-history.json` | Existing apply-only regression: 614 full states, 588 input batches, and 1,214 records. TypeScript still generates this harness's inverses. |

Native tests passed **23/23**: eleven History tests, three selection tests, and
nine existing interpreter tests. Focused TypeScript regressions passed
**72/72** across `history-format`, `history-unicode`, `intent-preservation`, and
`client-checkpoint`. This is not a fresh full production-core suite result.

An independent Sol High review passed 23 additional exact History graph and 15
inverse/caret comparisons, 74 anchor assertions, and nine atomic rejection
probes. Before/after/current SHA-256 checks passed for 60 History-receipt files,
59 selection-receipt files, and 60 compatibility-receipt files. The original
section 5.84 receipt was preserved byte-for-byte with SHA-256
`44d88d0d969cf56ccf5f527bfc51e2d59cc67713beb343229589b504c1897039`.
Later native changes need separate current receipts; these hashes identify this
completed checkpoint and must not be treated as evidence for a different binary.

**Recovery.** Native checkpoints bind actor, schema manifest, document state,
and the shared History graph. Restore validates the detached candidate before
replacing either live component. Validation rejects cross-slot state references,
missing targets, future history tickets, invalid ownership counts, and actor
mismatches. Plain document-only restore clears old history.

The tests use actual `SyncClient.pending` from `MemoryNet`. An insertion fixture
restores checkpoints before and after pending input. The subsequent matrix saves
checkpoints after pending deletion, formatting, undo, and redo generation. Each
case starts a fresh native process, receives another participant's overlapping
deletion or same-key write, and replays the exact saved operations twice through
plain apply. Replay leaves the saved History graph unchanged. Four subsequent
undo/redo actions match TypeScript and preserve the foreign write or effective
deletion. Pin tickets and minimum known deletion sequence also match.

This proves the recorded native checkpoint and replay result. Child processes
are closed and restarted from exported checkpoints; this does not prove crash
journal durability, full server generation recovery, protected GC, or browser
recovery. A checkpoint saved before an inverse does not contain its History
transition. Reconstructing that transition from wire operations alone remains
unsupported. Never regenerate an inverse with a new ticket and call it an exact
retry.

**Selection and delivery.** Native token anchors preserve collapsed, forward,
and reversed ranges, including the boundary between UTF-16 surrogate units.
Deleted endpoints resolve through physical predecessors. Strict product-style
selection returns null for unknown keys; raw lookup retains TypeScript's start
fallback. Native capture accepts valid offsets only and does not mirror raw
invalid-offset clamping. Three actors generate each round before any other
actor receives that round. Different causal delivery orders and reverse duplicate
replay cover 96 delayed and 96 duplicate batches. State converges after each
round. This does not assume buffering for arbitrary missing birth dependencies.

**API boundary.** `history_record` applies and records fresh, distinct local
builder operations for its own actor and existing targets. It rejects repeated
local tickets and overlapping text birth spans within a batch. This command is
not a retry-deduplicated submission API. Already-present pending changes use plain
`apply`, without recording history again. Raw TypeScript WeakMap object-reference
aliasing is outside this JSON interface. Native invalid records/restores and
clock exhaustion preserve both document and history atomically. Raw TypeScript
History can have different failure behavior and accepts some malformed graphs
that native restore rejects. General rejection parity is not claimed.

The bounded History graph is compared with the TypeScript HistorySnapshot graph,
and valid exported native graphs are restored by TypeScript in the harness.
The joint native checkpoint and native document snapshot remain their own
formats; this is not general TypeScript snapshot compatibility.

**Reproduce.** Use the same installed Rust toolchain for cargo, rustc, and rustdoc:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-history-harness/harness.ts
node experiments/rust-selection-harness/harness.ts
RUST_SHADOW_RECEIPT=experiments/rust-shadow-harness/receipt-current-history.json node experiments/rust-shadow-harness/harness.ts
node --test packages/doc-sync/test/history-format.test.ts packages/doc-sync/test/history-unicode.test.ts packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/client-checkpoint.test.ts
```

Each receipt applies to its recorded source and binary hashes. R4 remains in
progress. Next work covers paragraph node identity, legacy split/merge aliases,
node History, and multi-paragraph selection. General shapes and attributes,
movement/logical joins, schema changes, GC, R5 adapters, native/WASM product
integration, Chrome, and performance acceptance remain outside this checkpoint.
No production engine mutation, commit, push, publication, deployment, or migration
is established here.


## 5.86 R4 legacy paragraph node identity, split/merge, and structural recovery

**Continuation.** After completing section 5.85, multi-agent implementation
continued through UTF-16 selection, pending inverse replay, and this structural
slice. The same pinned schema now has an explicit opt-in native capability,
`paragraph-markers-v1`. It supports authored paragraph node births using the
actual production no-move split builder's `leftKey|rightKey` boundary. Base mode
continues to reject nodes. No production TypeScript source was changed.

Rust stores immutable marker identity, origin, born type and boundary, and the
initial `$type` value and write ticket. Projection selects the first live marker
for a boundary in physical token order. Other live markers become aliases.
Three concurrent Enter operations at one boundary create exactly one additional
paragraph. Removing the primary elects a remaining live alias. An alias that is
physically separated from its primary must not reset the current block. The
regression for that case preserves the three paragraphs `['ab', '', 'cd']`.

The native History records an ordinary paragraph birth as an existence step.
Merge deletes the primary and live alias markers. Undo cancels only that
participant's deletion, retains foreign deletions, and restores the same marker
identities. Foreign text inserted across a concurrent merge remains present.
Native selection resolves primary markers and visible characters directly;
absorbed aliases and tombstones use the actual TypeScript physical-predecessor
walk. Both anchor and focus retain their orientation across paragraphs.

**Final evidence.** The canonical structural receipt is
`experiments/rust-structure-harness/structure.json`. The final binary SHA-256 is
`8e200ff7c589f368a1ad472365439f349cd1e7dae72c00c5f103c048345d42c0`.
All four final receipts use this binary and unchanged recorded source bytes:

| Receipt | Result |
| --- | --- |
| `experiments/rust-structure-harness/structure.json` | 507 full document states and exact History graphs; 75 native inverse/caret comparisons; 507 pin comparisons; 642 captures; 9,284 ranges; 18,568 endpoints; five atomic rejections; two fresh process restarts. |
| `experiments/rust-history-harness/receipt-current-structure.json` | 1,039 full states and History graphs; 291 inverse/caret comparisons; 1,046 pin comparisons; pending delete/format/undo/redo matrix and eight fresh process restarts remain passing. |
| `experiments/rust-selection-harness/receipt-current-structure.json` | 281 full states and History graphs; 27 native inverses; 150 captures; 7,604 endpoints; 3,803 ranges; 96 delayed and 96 duplicate batches remain passing. |
| `experiments/rust-shadow-harness/receipt-current-structure.json` | 614 full apply-only states, 588 input batches, 1,214 records remain passing. |

The structural receipt adds two saved seeds, 42 and 20261101, with ten rounds
per seed and three actors. Each actor creates its local operation before any
actor receives that round. Observed operations include insertion, formatting,
undo/redo, split, and merge. Different causal delivery permutations and reverse
duplicate replay cover 120 delayed and 120 duplicate batches. Every round
converges. This is not arbitrary missing-dependency buffering.

Actual production builders cover split inside a surrogate pair, start/end
splits, empty paragraphs, Backspace and forward Delete merges, model merge,
three-actor aliases in both delivery orders, primary re-election, reverse actor
undo/redo, merge of all aliases, and physically separated aliases. Comparisons
include complete ordered tokens, immutable born/boundary fields, type register
values and tickets, deletion/cancellation state, full projected blocks, primary
and alias IDs, character membership, UTF-16 model runs, clock, counts, and the
exact shared History graph. Rust receives operations, positions, keys, and its
own checkpoints; expected TypeScript states and inverse outputs remain in the
Node parent process.

Native tests passed **31/31**: nine original interpreter tests, eleven History
tests, three selection tests, and eight paragraph-marker tests. The offline
build passed. The separate focused TypeScript structural-cache,
intent-preservation, and editor-session run passed **65/65**. This overlaps the
72-test section 5.85 reference run; do not add the counts as distinct tests.
There was no fresh full production-core suite or editor/browser run in this work.

**Recovery and format.** Actual `SyncClient.pending` split and merge operations
are saved after generation with matching native document and History state.
A fresh native process restores each checkpoint, applies a foreign insertion,
and replays the exact saved structural batch twice through plain apply. The
History graph remains unchanged. Subsequent independently generated undo/redo
matches TypeScript and preserves foreign text.

Opted replicas use `doc-sync-rust-shadow-v2` with exactly the explicit paragraph
capability. Base v1 retains its original JSON state and document snapshot format.
Restore checks required marker metadata, immutable type-register identity,
boundary endpoints, and capability/version agreement. Missing metadata, unknown
or duplicate capabilities, and a v2-to-v1 downgrade reject atomically. Existing
v1 checkpoints restore separately; this is not a TypeScript document snapshot
format or an automatic production schema migration.

An independent review found that a forged History SetStep could target a
paragraph marker even though authored node attributes are unsupported. The
final implementation rejects it, preserves the exact active joint checkpoint,
and still permits subsequent valid undo. This fix has a regression. Independent
structure probes also passed 19 checkpoints and four corrupt-snapshot cases,
including raw actor strings with delimiters and Unicode outside the production
server actor gate. General acceptance/rejection parity is not claimed.

Final before/after/live manifest checks passed for 67 structure files, 67 History
files, 66 selection files, and 67 apply-compatibility files. These manifests also
bind the Rust test sources. The prior four receipts, including the original
section 5.84 result and the section 5.85 checkpoint, remain unchanged. Their
old source hashes are historical: the earlier binaries/source trees were not
archived before later implementation, so they are not current-binary evidence.

**Reproduce from the repository root.** Use Node 24 and the matching installed
Rust toolchain. Offline Cargo dependencies must already be cached.

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-structure-harness/harness.ts
RUST_HISTORY_RECEIPT=experiments/rust-history-harness/receipt-current-structure.json node experiments/rust-history-harness/harness.ts
RUST_SELECTION_RECEIPT=experiments/rust-selection-harness/receipt-current-structure.json node experiments/rust-selection-harness/harness.ts
RUST_SHADOW_RECEIPT=experiments/rust-shadow-harness/receipt-current-structure.json node experiments/rust-shadow-harness/harness.ts
node --test packages/doc-sync/test/structural-cache.test.ts packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/editor-session.test.ts
```

**Remaining R4.** General attributes and additional node shapes, placement and
logical split/join, derived storage, schema validation/transitions, protected GC,
and broader serialization/recovery remain open. These unsupported operations
must stay blocked. This slice does not establish a native production server,
WASM client, complete server recovery, crash-journal durability, Chrome behavior,
performance, or production migration. R5 and R6 remain planned. No commit, push,
publication, deployment, or production replacement is established here.


Documentation verification after the final updates passed **28/28** tests, the
site build, and the build/link check: 32 pages and 1,880 internal links, English
prose true, and local-path exclusion true. Scoped tracked diff and whitespace
checks passed; the explicit whitespace scan also covered 20 experiment and
roadmap source/documentation files. A final post-build check again matched all
four current receipts' before/after/live source and binary hashes. All 45
production TypeScript source hashes also match the completed section 5.85
checkpoint. Documentation build checks do not establish publication or browser
behavior.


## 5.87 R4 pinned text/atom blocks and JSON attributes

**Delivery and boundary.** Multi-agent work added a separate opt-in block schema
inside `experiments/rust-shadow`. The production TypeScript engine remains
unchanged and authoritative. The schema ID is
`general-flow-blocks:json-attrs:v1`; the exact native capability is
`general-blocks-attrs-v1`. Its manifest is `schema-general.json`. The native
snapshot format is `doc-sync-rust-shadow-v3`. Original base v1 and paragraph v2
schemas and snapshots retain their contracts. This is a pinned flat schema,
not arbitrary schema negotiation or a complete block engine.

| Type | Shape and attributes |
| --- | --- |
| `paragraph` | Text; alignment left/center/right, default left; bounded JSON `meta`, default null. |
| `heading` | Text; paragraph attributes and level 1–6, default 1. |
| `divider` | Atom; style line/dots, default line; JSON `meta`. |
| `image` | Atom; string `src`, finite nonnegative `width`, boolean `decorative`, and JSON `meta`. |

Null is accepted for declared attributes and projects the schema default.
Text markers, including the implicit root paragraph, can change between paragraph
and heading. A null type write restores the immutable birth type or the root
flow default. Stored attributes survive type changes. Admission follows the
immutable shape, as TypeScript `Doc.check` does: a heading-only level can remain
stored on a paragraph, and an image-only source can remain stored on a divider.
Projection hides attributes that the current type does not declare.

`meta` accepts bounded JSON strings, finite numbers, booleans, null, arrays, and
objects. Each JSON attribute is one atomic LWW register. Concurrent objects with
different nested keys do not merge their fields. This slice does not implement
`fields-v1`. Native History checks current write tickets, so undo preserves
later foreign writes, including same-value writes. Consecutive owned attribute
states retain the existing shared-state identity rules.

Atoms have virtual text positions after them. Empty virtual paragraphs appear
in raw blocks but are omitted from the public model. Selection must distinguish
physical block indexes from model paths. The implementation matches the existing
InputSession capture/resolve behavior and atom-anchor fallback. UTF-16 text units,
including isolated surrogates, remain intact.

**JSON contract.** The pinned `serde_json` dependency now enables `preserve_order`;
new locked registry dependencies were fetched once. Subsequent test/build runs
passed offline. Native inverse grouping retains ordinary object key insertion
order, sorts JavaScript array-index keys first, and normalizes numeric equality.
This preserves the operation grouping produced by TypeScript `JSON.stringify`,
without using expected grouping results as native inputs.

Wire attribute names and string values require Unicode scalar strings. TypeScript
can accept isolated-surrogate attribute strings that the native JSON parser
rejects; rejection leaves state unchanged and the process continues. JSON wire
transport normalizes signed zero. Arbitrary JSON depth, nonfinite values, and
raw in-memory JavaScript value equivalence are not qualified. Parser and History
snapshot limits remain explicit. Native rejection can be stricter than raw
TypeScript apply/History; general acceptance/rejection parity is not claimed.

**Final evidence.** All five current receipts use Node 24.22.1 and native binary
SHA-256 `ecd8c35f761a80858e96cc54d4ac288926a13d613bb99cd3696df6379f4ad2b2`.
The Rust toolchain is stable 1.86.0. Expected TypeScript models, complete states,
and inverse operations stay in the Node parent; the native child receives actual
wire operations, selection inputs, record metadata, and its own checkpoints.

| Receipt | PASS result |
| --- | --- |
| `experiments/rust-blocks-harness/receipt.json` | 746 full document states and exact History graphs; 102 native inverse/caret comparisons; 746 pins; 750 captures; 12,714 ranges; 25,428 endpoints; 14 admission comparisons; six fresh-process restarts. |
| `experiments/rust-shadow-harness/receipt-current-blocks.json` | 614 full apply-only states, 588 batches, 1,214 records. |
| `experiments/rust-history-harness/receipt-current-blocks.json` | 1,039 states/History graphs; 291 native inverse/caret comparisons; 1,046 pin checks. |
| `experiments/rust-selection-harness/receipt-current-blocks.json` | 281 states/History graphs; 27 native inverses; 150 captures; 3,803 ranges; 7,604 endpoints. |
| `experiments/rust-structure-harness/receipt-current-blocks.json` | 507 states/History graphs; 75 native inverse/caret comparisons; legacy split/merge, aliases, and structural replay remain passing. |

Three saved seeds, 42, 20261101, and 73511, cover 36 three-actor rounds. Every
actor creates its local batch before receiving that round's other batches.
Different causal delivery orders and reverse duplicate replay cover 216 delayed
and 216 duplicate deliveries. State converges after every round. This does not
assume buffering for arbitrary missing dependencies.

Admission checks use actual production `Doc.check`, not permissive `Doc.apply`.
Eight typed/unknown-attribute/type-on-atom/character-mark rejections and six
accepted hidden-attribute or boolean-mark cases match. A separate
isolated-surrogate string case records the known native wire limitation. That
parser rejection is recorded separately from the fourteen admission matches.

Native tests passed **40/40**: nine original interpreter tests, eleven History,
three selection, eight paragraph-marker, and nine general-block tests. Offline
build, formatting, and Clippy all-targets with warnings denied passed. Clippy used
an isolated target and the matching stable compiler/tool PATH. Focused production
TypeScript regressions passed **104/104** across `features`, `history-format`,
`intent-preservation`, `editor-session`, `client-checkpoint`, and
`structural-cache`. Some reference tests cover wider TypeScript capabilities;
they do not establish native support for those capabilities. No fresh full
production-core suite or browser run is claimed.

**Recovery.** Six fixtures use actual `SyncClient.pending`: attribute update,
text type change, atom insertion, atom deletion, undo, and redo. The matching
native document/History checkpoint is saved after original operation generation.
A fresh child restores it, receives foreign text and, in the attribute fixture,
a later same-key foreign write. The original pending batch is applied twice
without recording new History. The saved History graph stays unchanged.
Subsequent native undo/redo matches TypeScript and preserves foreign changes.
This proves recorded native checkpoint/replay results, not server generation,
GC protection, crash-journal durability, or complete client/server recovery.

**Independent review and fixes.** Thirty-three independent checks passed on the
final binary. They compare actual TypeScript model/register/History/selection
behavior and atom/root/default rules, plus malformed checkpoint rejection.
Valid changed-attribute duplicate node births must not reset original birth
metadata or foreign current writes. That rule now has a regression. Another
review found that an extra attribute accepted with a same- or earlier-than-birth
write ticket could produce a snapshot that native restore rejected. The extra
restore restriction was removed while preserving original birth-register checks.
Before/same-birth accepted writes now round-trip. Root existence mutations and
immutable metadata corruption remain rejected atomically.

All five final receipts contain the same 73-file source/test/schema/dependency/
harness/binary manifest. Before/after/live hashes match, including after the
independent probes. All 21 preexisting receipts remain byte-for-byte unchanged.
Before edits, the native source and binary baseline was copied to
`output/r4-general-baseline/`; all 15 archive entries match its manifest, including
the section 5.86 binary. This archive is local evidence under ignored `output/`,
not a published artifact. New receipts remain separate from historical receipts.

**Reproduce from the repository root.** Cache locked dependencies first if
needed, then use a matching installed Rust toolchain:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-blocks-harness/harness.ts
RUST_SHADOW_RECEIPT=experiments/rust-shadow-harness/receipt-current-blocks.json node experiments/rust-shadow-harness/harness.ts
RUST_HISTORY_RECEIPT=experiments/rust-history-harness/receipt-current-blocks.json node experiments/rust-history-harness/harness.ts
RUST_SELECTION_RECEIPT=experiments/rust-selection-harness/receipt-current-blocks.json node experiments/rust-selection-harness/harness.ts
RUST_STRUCTURE_RECEIPT=experiments/rust-structure-harness/receipt-current-blocks.json node experiments/rust-structure-harness/harness.ts
node --test packages/doc-sync/test/features.test.ts packages/doc-sync/test/history-format.test.ts packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/editor-session.test.ts packages/doc-sync/test/client-checkpoint.test.ts packages/doc-sync/test/structural-cache.test.ts
```

**Remaining R4.** Nested flow, grid/row/cell, group, inline/span, derived storage,
movement and logical split/join, field-level merging, arbitrary schema validation
and transitions, protected GC, and broader serialization/recovery remain open.
Atom type changes, unsupported reserved metadata, and the `virtual:` materialized
node birth route remain blocked. R5 adapters and R6 product gates remain planned.
This result establishes no native production server, WASM client, Chrome proof,
performance benefit, commit, push, publication, deployment, or engine migration.


Final documentation checks passed **28/28** tests, the static site build, and
the build/link checker: 32 pages, 1,880 internal links, English prose true, and
local-path exclusion true. Scoped tracked diff and explicit whitespace checks
passed; the scan covered 24 experiment and roadmap source/documentation files.
A post-build verification again matched all five receipts' 73 before/after/live
hashes. All 45 production TypeScript source hashes also match the earlier
structural checkpoint. These checks do not establish publication or Chrome
behavior.


## 5.88 R4 pinned recursive flows, tables, and nested recovery

**Delivery.** Multi-agent implementation added a separate recursive schema to
`experiments/rust-shadow`. Schema identity is
`nested-flows-tables:json-attrs:v1`, with exactly capability
`nested-flows-tables-v1`, manifest `schema-nested.json`, and native document format
`doc-sync-rust-shadow-v4`. Earlier v1/v2/v3 modes retain their contracts. The
production TypeScript server and client remain unchanged and authoritative.

The fixed schema adds `callout` flow blocks and
`table > table-row > table-cell > table-cell-body`. Root, callout bodies, and
cell bodies accept paragraph, heading, divider, image, callout, and table blocks.
Callout has tone info/warning and atomic JSON metadata. Table has atomic JSON
metadata. Cells have background and atomic JSON metadata; rowspan, colspan,
and spanned are computed. This does not provide arbitrary runtime schema
negotiation, group/inline/span shapes, or nested field merging.

**Storage and projection.** Rust now retains a native arena of stable token IDs
and distinct physical lines with owner, slot, deterministic head, and per-line
RGA order. The recursive model is computed from these lines; it is not a stored
copy of the TypeScript model. Body, axis, and cell heads have zero Lamport IDs,
empty immutable birth type, and no synthetic type register. They do not consume
clock ticks. Row and column births come from actual operations, not automatic
axis creation. A grid needs a live row and a live column to project.

Parent deletion hides the body, and axis deletion hides affected cells. Neither
operation discards descendant contents. Full-grid models retain covered cell
text and attributes during merge. Span extent counts live axes through stored
physical endpoints. Concurrent insertion inside that extent expands the span;
deleted endpoints shrink it. Deleting a span's top-left axis removes that
coverage. Overlapping spans use descending writer tickets. Equal-ticket span
keys retain attribute insertion order, which the v4 snapshot stores explicitly.

**Canonical storage read.** TypeScript creates derived slot heads lazily. Raw
birth-and-delete batches can leave a different number of empty heads from an
eager native implementation. The comparison therefore uses an explicit zero-clock
normalization: create valid body heads for every physical callout, and row/column
heads plus every physical nonhead row-by-column intersection for every table,
including deleted owners and axes. The reference invokes actual `Doc.get` and
asserts that the clock does not change. Native v4 creates the same closure.

Lines are compared in key order; each line's authored token order, IDs, values,
register writers, and deletion/cancellation ledgers remain fully compared.
This does not assert equality of lazy allocation timing, TS Map insertion order,
or TypeScript snapshot bytes. Enumerating this closure is not a performance or
memory acceptance result, particularly for many retained deleted axes.

**History, selection, and restore.** Rust independently generates inverses for
nested text and nodes, axis insertion/deletion, cell attributes, and spans. The
existing ownership rule preserves later foreign writes, including same-value
writes. Cancelling an owned deletion does not cancel a foreign deletion.
Product-style selection returns null for covered cells, deleted axes, and
deleted ancestors. Raw token lookup retains the reference adjacent-cell or
owner-block escape. Both endpoints retain UTF-16 identity and orientation.

Joint restore first rebuilds immutable births and complete physical membership,
then validates dependent registers and History. This is required because a table
register can reference rows and columns restored later. Edited body/cell heads
must restore with their legitimate type/attribute state. When a History state
and the current document register share a writer ticket, their values must agree.
A later foreign writer can legitimately make an older History state stale.
Invalid restore must preserve both current document and History.

**Final tests and reference results.** The frozen native executable has SHA-256
`0fc8790a2109ae169c06bb5e62d129d886fe2d932568478ccd78ff3e314c5431`.
The toolchains are Node 24.22.1 and rustup stable Rust 1.86.0. Expected reference
states, models, and inverse outputs are never sent to the native child.

| Current receipt | PASS comparisons |
| --- | --- |
| `experiments/rust-nested-harness/receipt.json` | 582 full document states and exact History graphs; 85 independently generated inverse/caret comparisons; 582 pins; 1,373 captures; 31,927 ranges; 63,854 raw endpoints; eight fresh-process restores. |
| `experiments/rust-shadow-harness/receipt-current-nested.json` | 614 apply-only full states. |
| `experiments/rust-history-harness/receipt-current-nested.json` | 1,039 full states/History graphs; 291 native inverse/caret comparisons. |
| `experiments/rust-selection-harness/receipt-current-nested.json` | 281 full states/History graphs; 27 native inverses. |
| `experiments/rust-structure-harness/receipt-current-nested.json` | 507 full states/History graphs; 75 native inverses. |
| `experiments/rust-blocks-harness/receipt-current-nested.json` | 746 full states/History graphs; 102 native inverses. |

Three saved seeds, 42, 20261101, and 73511, cover 24 three-actor rounds with
144 delayed and 144 duplicate deliveries. Every actor creates its local batch
before receiving the other batches for that round. Every completed round
converges. This does not assume buffering of arbitrary missing dependencies.

Deterministic fixtures cover nested callouts, tables in callouts and cells,
row/column edits, cell attributes, merge/split with retained hidden text,
overlapping spans in both delivery orders, span growth and shrinkage,
deleted span origins, parent deletion with foreign descendant edits, and
same-value foreign cell-attribute ownership. Raw fixtures cover born-and-deleted
owners, zero-axis tables, and deleted-axis intersections under canonical reads.
Ten admission comparisons use actual `Doc.check`. Eight native rejection cases
also cover unsupported move, GC, schema, and capability requests; these counters
do not establish general rejection parity with raw TypeScript.

Native tests passed **50/50**: the prior 40 and ten new nested/grid tests.
Offline build, formatting, and isolated stable-toolchain Clippy all-targets with
warnings denied passed. Focused TypeScript regressions passed **115/115** across
`features`, `merged-grid`, `history-format`, `intent-preservation`,
`editor-session`, `client-checkpoint`, and `structural-cache`. This includes
headless Lexical/ProseMirror codec and binding tests. It is not Chrome evidence
or a fresh full production-core suite. Wider TypeScript test coverage does not
establish wider native capabilities.

**Pending recovery.** Seven actual `SyncClient.pending` cases cover nested text,
parent deletion, row insertion, column deletion, span change, undo, and redo.
Each saves a matching document/History checkpoint after operation generation.
The fresh native process receives foreign changes, then replays the exact
original pending batch twice through plain apply. History stays unchanged during
replay, and four subsequent independently generated undo/redo steps match TS.
An eighth restart restores the inactive physical-storage fixture.

The final combination checks put bold foreign text inside the deleted callout,
inside the deleted column of the affected grid, and inside the affected covered
cell. They retain each foreign token's exact ID, UTF-16 unit, attributes, writer,
and ledgers after restore/delivery, both replays, and every undo/redo. Hidden
selections stay unavailable; undo restores visible selections and projected
foreign text, while redo hides the affected subtree again without losing stored
content. Other recovery cases retain visible foreign input. These are native
checkpoint and replay tests with actual in-memory SyncClient/DocHub operations,
not complete server-generation recovery or crash-journal durability tests.

Covered-cell text remains in the canonical full-grid model even while editing
visibility and selection are hidden. Deleted parent/axis content instead remains
in physical storage until restored to the public model. An independent trace
review compared 147 exact foreign rawItem states across the 21 same-target
recovery phases: six visible and fifteen hidden selection phases all matched.

**Independent review.** On the final native binary, 22 independent TypeScript/
Rust probes and 15 malformed joint checkpoint rejection cases passed. They found
and verified fixes for hidden selection capture, default-valued cell attributes,
editable derived-head restore, table-dependent register restore order, and
same-writer document/History value disagreement. Malformed owner/axis/body/row
membership, immutable type metadata, future tickets, and bad capabilities reject
without mutation. Register insertion order and deleted span endpoints also have
independent probes. No remaining blocking finding was reported.

Before edits, native source and executable baseline were copied to
`output/r4-nested-baseline/`. All 18 entries match its manifest, including the
section 5.87 executable. This is local evidence under ignored `output/`. All 26
preexisting receipt files retain their original SHA-256 values. New regression
receipts use separate filenames. All six current receipts share the same
78-file before/after/live source/test/schema/dependency/harness/binary manifest.
The independent audit checks the trace hashes and requests separately.

**Trace storage.** The new readable receipt contains counters, proof boundaries,
recovery descriptors, source manifests, and a trace descriptor. Every original
request, response, and comparison record is retained in
`experiments/rust-nested-harness/trace.json.gz`; no checks are removed to compress
it. The descriptor records count, raw/compressed lengths, and both SHA-256 values.
This keeps the full evidence out of a single large uncompressed repository file.
The final trace retains 98,871 records, including 98,205 native requests. Its
compressed/raw lengths are 2,628,088/63,281,786 bytes. Compressed SHA-256 is
`e14633af3b5869d3c8c59182aabfc77e1488257217b2242f4386b3f5aca76c0e`;
raw SHA-256 is `a2449dc73c9366ef560de018eeb22c8862c2c5c4392fa139a27078eedeabcae0`.
The independent audit verified decompression, both hashes, record counts, and
the absence of expected model/state/inverse inputs to the native process.

**Reproduce from the repository root.** Use cached locked dependencies and a
matching installed Rust toolchain:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-nested-harness/harness.ts
RUST_SHADOW_RECEIPT=experiments/rust-shadow-harness/receipt-current-nested.json node experiments/rust-shadow-harness/harness.ts
RUST_HISTORY_RECEIPT=experiments/rust-history-harness/receipt-current-nested.json node experiments/rust-history-harness/harness.ts
RUST_SELECTION_RECEIPT=experiments/rust-selection-harness/receipt-current-nested.json node experiments/rust-selection-harness/harness.ts
RUST_STRUCTURE_RECEIPT=experiments/rust-structure-harness/receipt-current-nested.json node experiments/rust-structure-harness/harness.ts
RUST_BLOCKS_RECEIPT=experiments/rust-blocks-harness/receipt-current-nested.json node experiments/rust-blocks-harness/harness.ts
node --test packages/doc-sync/test/features.test.ts packages/doc-sync/test/merged-grid.test.ts packages/doc-sync/test/history-format.test.ts packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/editor-session.test.ts packages/doc-sync/test/client-checkpoint.test.ts packages/doc-sync/test/structural-cache.test.ts
```

**Remaining R4.** Group/inline/span shapes, movement and logical split/join,
private derived storage, field-level merging, arbitrary schemas and schema
transitions, protected GC, and broader serialization/recovery remain open.
Native v4 targets fresh valid builders and rejects physical line-head deletion,
arbitrary axis attributes, and missing mutation targets. Raw TypeScript can
accept some inputs outside this contract, including ordinary flow-head deletion.
Unicode scalar JSON strings and parser/History limits remain as in section 5.87.
R5 integration and R6 product gates remain planned. This establishes no native
production server, WASM client, Chrome behavior, performance or memory benefit,
commit, push, publication, deployment, or production migration.


Final documentation validation passed **28/28** tests, the static site build,
and the build/link check: 32 pages and 1,880 internal links, English prose true,
and local-path exclusion true. Scoped tracked diff and whitespace checks passed;
the explicit scan covered 28 experiment and roadmap source/documentation files.
After the build, all six current receipts again matched their 78 before/after/live
hashes, and all 26 historical receipts retained their initial hashes. All 45
production TypeScript source hashes match the preceding block checkpoint.
These checks do not establish publication, deployment, or Chrome behavior.


## 5.89 R4 pinned groups, inline units, and string-valued spans

**Delivery.** Multi-agent work added an explicit v5 schema variant to the private
Rust shadow crate. Its identity is
`groups-inline-spans:json-attrs:value-marks:v1`, with exactly capability
`groups-inline-spans-v1`, manifest `schema-shapes.json`, and native document
format `doc-sync-rust-shadow-v5`. Earlier v1–v4 modes retain their behavior and
reject the new shapes without the new opt-in. The production TypeScript server
and client remain unchanged and authoritative.

This variant extends the recursive flow/grid schema with three model shapes:

| Shape | Fixed-schema behavior |
| --- | --- |
| `group` | Physical `list-item` text markers form a contiguous `list` when level and listType match. Group attributes are placed on the model container, not repeated on item models. |
| `inline` | `inline-image` has its own immutable token ID and occupies one text position. Its block-text placeholder is U+FFFC; raw stored unit is null. Attributes are source, nonnegative width, decorative flag, and atomic JSON metadata. |
| `span` | A string-valued character `link` mark projects as an `inline-hyperlink` run with URL attribute. Null and empty values are omitted. Inline nodes stop spans; boolean mark changes create inner text runs. |

List level has values 1–6, default 1. List type is bullet/ordered, default bullet.
The group compares both level and listType. Different levels create adjacent
flat lists; they do not create nested list containers. Paragraphs or other block
shapes stop the contiguous group. Group and span containers create no physical
tokens, heads, or clock ticks. Stable item IDs retain ownership when `$type`
changes move text into or out of a group. The selected schema has no required
child or private group-boundary constraints. Explicit adjacent lists with equal
grouping values merge in this model.

The value mark is a primitive string. This does not qualify JavaScript object-
identity-valued span marks or URL-pattern validation. The TypeScript authoring
compiler determines span-to-mark flattening and noninheritance (`inherit: false`)
and emits explicit wire operations. Rust independently applies those operations,
projects runs, generates History inverses, resolves positions, and restores
checkpoints. A native high-level authoring compiler is not provided.

**Storage, History, and selection.** The v4 physical line, owner/slot, axis, cell,
coverage, and canonical zero-clock derived-head closure contracts continue in
v5. Grouped model paths add the list entry and item indexes. Span runs do not
add a model path level. UTF-16 positions include surrogate-half boundaries and
count each inline node once. Covered cells and deleted ancestors reject product
selection while preserving all stored shape content for later undo.

Local History uses the existing independent shared-state ownership graph for
list attributes, type writes, inline attributes, and link values. A later foreign
write, including a same-value write, prevents an older owned inverse from
replacing it. Cancelling an owned deletion leaves independent foreign deletion
records active. Native checkpoint restore validates immutable births, full
physical membership, current registers, shared History references, writer
ownership, and schema/capability/version agreement before replacement. Invalid
restore preserves both active document and History.

**Reference and tests.** The final native binary SHA-256 is
`32ecd9b575e7eaeb75ab05f1528b4bf8d3726a5fa0042f13b04880aaab3580df`.
Node is 24.22.1 and Rust is rustup stable 1.86.0. Native tests passed **60/60**,
including all prior 50 and ten v5 tests. Offline build, formatting, and isolated
stable-toolchain all-targets Clippy with warnings denied passed. Focused
TypeScript regressions passed **128/128** across `features`, `edit`, `merged-grid`,
`history-format`, `intent-preservation`, `editor-session`, `client-checkpoint`,
and `structural-cache`. Wider reference coverage, including headless editor
codecs, does not establish corresponding native capabilities or Chrome proof.
A fresh full production-core suite is not claimed.

An independent final-binary probe passed 17 full model/state/History comparisons,
1,306 all-offset selection comparisons, four exact inverse/caret comparisons,
and five malformed/invalid atomic rejections. Its 2,642 native requests contain
operation inputs, record metadata, selection inputs, and native-owned
checkpoints. Expected TypeScript states, models, and inverse results stay in
the parent process.

Independent review found a raw JSON numeric-form edge: accepted level values
`1` and `1.0` formed separate native groups even though JavaScript reads them as
the same Number. Group comparison now uses the existing normalized JSON key.
A native regression and independent raw JSON probe confirm one group with both
items. Group model and path construction share the grouping rule. No raw
in-memory signed-zero or object-identity equivalence is claimed.

**Differential scenario coverage.** The new shape harness compares normalized
physical lines, immutable token births and origins, ordered token membership,
inline identity, current values and writer tickets, deletion/cancellation
ledgers, every line's blocks, the recursive model, exact shared History graphs,
inverse arrays, carets, and pins. Fixtures include group attribute edits and
`$type` changes, three-actor concurrent split/merge with distinct grouping
values, inline birth/deletion and foreign attributes, same-value foreign writers,
link value changes/null reset, boolean formatting inside links, insertion inside
same/different links, recursive callouts/cells, covered cells, and deleted
ancestors.

Selection capture checks every offset at capture checkpoints. It then retains
24 evenly distributed stable ranges for checks after later operations. These
are representative ongoing ranges, not a claim to check every possible range
after every operation. Three saved seeds use three actors with causal delayed
batches, reordered independent batches, duplicates, and separate History actions.

**Pending recovery.** Nine real `SyncClient.pending` cases cover group attributes,
group type, inline birth, inline deletion, inline attributes, span value, span
null reset, undo, and redo. A matching native document/History checkpoint is
saved after original operation generation. A fresh native process restores it,
receives foreign input in the same affected list item/range, and applies the
original saved batch twice through plain apply. Replay leaves History unchanged.
Subsequent independently generated undo/redo matches the reference.

The checks retain exact foreign token ID, UTF-16 units, attributes, writer
metadata, and deletion/cancellation ledgers through restore, both replays, and
four later History steps. They also retain the foreign same-value inline
attribute writer and original-character link writer, including the null-reset
case. Group visibility and model paths may change without losing those stored
edits. These are native checkpoint/replay tests with actual in-memory
SyncClient/DocHub operations, not complete server-generation recovery or
crash-journal durability tests.

**Final differential evidence.** All seven current receipts passed against the
same frozen binary and unchanged 83-file before/after/live manifest:

| Current receipt | PASS comparisons |
| --- | --- |
| `experiments/rust-shapes-harness/receipt.json` | 606 complete document states and exact History graphs; 71 native inverse/caret comparisons; 606 pin checks; 5,812 captures; 16,510 ranges; 33,020 endpoints; nine fresh-process restores. |
| `experiments/rust-shadow-harness/receipt-current-shapes.json` | 614 complete apply-only states; this legacy harness still receives TypeScript-generated inverse operations. |
| `experiments/rust-history-harness/receipt-current-shapes.json` | 1,039 states/History graphs; 291 native inverse/caret comparisons. |
| `experiments/rust-selection-harness/receipt-current-shapes.json` | 281 states/History graphs; 27 native inverses. |
| `experiments/rust-structure-harness/receipt-current-shapes.json` | 507 states/History graphs; 75 native inverses. |
| `experiments/rust-blocks-harness/receipt-current-shapes.json` | 746 states/History graphs; 102 native inverses. |
| `experiments/rust-nested-harness/receipt-current-shapes.json` | 582 states/History graphs; 85 native inverses; all earlier nested/grid recovery cases remain passing. |

Three saved seeds cover 24 three-actor rounds, 144 delayed deliveries, and
144 duplicates. Dedicated concurrent group split/merge cases are separate from
that seeded round count. Four admission comparisons and ten invalid-request or
malformed-checkpoint rejections have separate counters; they do not establish
general raw TypeScript rejection parity.

Independent recovery review matched every foreign raw token and register in
63 native trace states (nine cases, seven preservation phases each). It then
replayed the native checkpoints and recorded recovery operations in nine fresh
processes. All 72 complete native responses matched the recorded state, History,
inverse, and caret results exactly. This is independent replay of the same
scenarios, not eighteen distinct recovery scenarios.

**Evidence and preservation.** Current results use the new
`experiments/rust-shapes-harness/receipt.json` and six distinct prior-harness
`receipt-current-shapes.json` outputs. The shape trace is compressed in
`experiments/rust-shapes-harness/fulltrace.json.gz`. The nested regression uses
`RUST_NESTED_TRACE` to write `trace-current-shapes.json.gz`, preserving its
historical canonical trace. Summary descriptors bind raw/compressed bytes,
record counts, and both SHA-256 values. Source manifests include all seven
harnesses and READMEs, native sources and tests, schema manifests, Cargo files,
production source, the test helper, and the executable.

Before native edits, 20 actual source files were archived at
`output/r4-shapes-baseline/native-source-before.tar.gz`, SHA-256
`75eeee61c5e0b0c9b814fc0fc04bcd21e64fe2d9b767cd5aa8d99443951bed51`.
The separate copied executable retains the section 5.88 SHA-256. The native
archive manifest distinguishes macOS metadata entries from the actual source
files. These baseline copies are local evidence under ignored `output/`.
All 32 preexisting receipts, including nonstandard `structure.json`, and the
historical nested gzip trace remain byte-for-byte unchanged. The final independent
audit verified both trace descriptors, counts, compressed/raw lengths and hashes,
and the absence of expected model/state/inverse fields in native requests for
the new shape interpreter.

The shape trace retains 57,090 records, including 56,449 native requests. Raw and
compressed lengths are 121,936,380 and 6,341,104 bytes. Compressed SHA-256 is
`bf260bce00936cceb37604c2ab52a0cf2817d4b75b2df2508300679259a2d09d`;
raw SHA-256 is `9d75e42da1f290b70fcee8528f1de5158f3ab97b1a293f1fa294d1bfaf70ef8e`.

**Reproduce from the repository root.** Use cached locked dependencies and a
matching installed Rust toolchain:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-shapes-harness/harness.ts
RUST_SHADOW_RECEIPT=experiments/rust-shadow-harness/receipt-current-shapes.json node experiments/rust-shadow-harness/harness.ts
RUST_HISTORY_RECEIPT=experiments/rust-history-harness/receipt-current-shapes.json node experiments/rust-history-harness/harness.ts
RUST_SELECTION_RECEIPT=experiments/rust-selection-harness/receipt-current-shapes.json node experiments/rust-selection-harness/harness.ts
RUST_STRUCTURE_RECEIPT=experiments/rust-structure-harness/receipt-current-shapes.json node experiments/rust-structure-harness/harness.ts
RUST_BLOCKS_RECEIPT=experiments/rust-blocks-harness/receipt-current-shapes.json node experiments/rust-blocks-harness/harness.ts
RUST_NESTED_RECEIPT=experiments/rust-nested-harness/receipt-current-shapes.json RUST_NESTED_TRACE=experiments/rust-nested-harness/trace-current-shapes.json.gz node experiments/rust-nested-harness/harness.ts
node --test packages/doc-sync/test/features.test.ts packages/doc-sync/test/edit.test.ts packages/doc-sync/test/merged-grid.test.ts packages/doc-sync/test/history-format.test.ts packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/editor-session.test.ts packages/doc-sync/test/client-checkpoint.test.ts packages/doc-sync/test/structural-cache.test.ts
```

**Remaining R4.** Movement, logical split/join, private derived text storage,
required-child and group-boundary constraints, broader schema/value-mark rules,
field-level attributes, schema transitions, protected GC, and wider serialization/
recovery remain open. Runtime arbitrary-schema support and object-valued span
semantics are not qualified. Existing Unicode scalar JSON string and parser/
History limits remain. Native v5 still targets the declared valid builder/wire
subset; general admission/rejection parity is not claimed. R5 adapters and R6
product gates remain planned. This work establishes no native production server,
WASM client, Chrome behavior, performance or memory benefit, commit, push,
publication, deployment, or production migration.


Final documentation validation passed **28/28** tests, the static site build,
and the build/link checker: 32 pages, 1,880 internal links, English prose true,
and local-path exclusion true. Scoped tracked diff and whitespace checks passed;
the explicit scan covered 32 experiment and roadmap source/documentation files.
A post-build verification again matched all seven receipts' 83 before/after/live
hashes, all 32 historical receipt hashes, and the original compressed trace's
hash and length. All 45 production TypeScript source hashes match the preceding
nested checkpoint. These checks do not establish publication or browser behavior.

### 5.90. Pinned Rust movement, logical text storage, and schema delivery boundary

**Result and scope.** The private native v6 interpreter now implements retained
block/subtree placement, logical split/join, private text storage, and independent
movement History. The declared state, History, strict selection, and pending
replay comparisons pass. Four raw endpoint comparisons are **NOT_RUN** because
the production TypeScript reference throws for a hidden root gap. Full raw
endpoint parity and the complete R4 gate are not passed. The production engine
remains TypeScript; this work does not change production collaboration rules.

Three agents owned native implementation, differential fixtures, and independent
review. Native semantics/review used Sol High; ordinary harness work used Sol
Medium. The parent ran the seven prior differential suites and documentation
checks. Inherited uncommitted work outside this slice remains intact. There is
no commit, push, publication, or deployment from this checkpoint.

**Native contract.** Opt in with schema
`movement-logical-storage:json-attrs:value-marks:v1`, exactly capability
`movement-logical-storage-v1`, and native snapshot `doc-sync-rust-shadow-v6`.
The schema manifest retains the v5 nine shapes. Earlier v1–v5 capabilities and
snapshot contracts remain separate. The final executable SHA-256 is
`a7f65e9b20da9071b3d43946ae68b91a00d9f22dc9ecc2cff6fa54f352a77a4f`.

Movement records retain physical line membership, immutable origins, token IDs,
UTF-16 units, and deletion ledgers. Ticket-ordered replay suppresses ancestor
cycles. Text blocks, atoms, callouts, full tables, and individual list items can
move. Row, column, inline-node, and span-container movement remains unsupported.
Private `~text` and `~fragment` heads keep automatic paragraph storage. Logical
split births retain physical partitions; `$join` registers and aliases project
them without copying or deleting foreign input. `virtual:` births promote
retained physical trailing text before movement. Canonical reads close private
flow/cell heads without advancing the document clock.

Native Move and Split History steps generate fresh inverse operations. Current
placement and register writers fence ownership, including unrecorded movement
by the same actor. An inverse of a move on a deleted target is still retained,
so a later foreign undelete reveals the correct placement. Split does not
reattach stationary siblings. Coupled checkpoints validate placement tuples,
shared ownership, current-state references, immutable split values, physical
membership, actor syntax, and clock bounds before replacing live state. Tests
also cover discarded redo branches and deleting a moved marker without
reattaching its text to the previous block. Native v6 snapshots are canonical
across fresh restore; earlier snapshot formats retain their contracts.

**New differential and recovery evidence.** The movement harness sends actual
TypeScript wire operations from `Doc.edit`, commands, `History`, `InputSession`,
and in-memory `SyncClient`/`DocHub`. Native state/model/inverse expectations remain
in the parent process. Successful restore inputs exactly match earlier native
exports; undo/redo requests contain no inverse operations.

The new receipt passed 360 complete state/History/pin comparisons, 56 independent
native inverse/caret comparisons, 802 selection captures, 2,833 range resolves,
and 5,662 successful raw endpoint comparisons. Three saved seeds cover 12
three-actor rounds, 72 delayed deliveries, and 72 duplicates. Automatic leading
gap move/replacement/split/resplit uses actual editing commands. The separate
model-hidden trailing-gap fixture labels its low-level physical seed/move/edit;
later virtual promotion, movement, and split/resplit use actual editing commands.
It does not claim an editor path to an empty model-hidden trailing gap.

Five fresh native processes restore actual pending move, split, join, undo, and
redo checkpoints. Each replays the exact saved batch twice and then runs four
History actions. Checks retain foreign text IDs, UTF-16 units, attributes and
writer metadata in the same original moved/split subtree. The foreign bold
writer on an original character and align writer on the original affected
marker also remain intact. This is native checkpoint/replay evidence, not
durable server-generation recovery, crash-journal, lease, or protected-GC proof.

**Known reference bug and selection limit.** At four recorded checkpoints,
`Doc.posAfter("0@~text:0%40~root:")` passes a null physical owner into `posFrom`
and throws `TypeError: Cannot read properties of null (reading 'key')`.
`tokenLocation` identifies this root-leading gap as hidden. The harness omits
only that exact key/error after checking the hidden location and null owner.
Its receipt reports `rawEndpointStatus: PARTIAL_WITH_NOT_RUN`,
`rawEndpointNotRun: 4`, and the exact stack for every omission. Successful
endpoint counts exclude those four. `InputSession.resolve` comparisons still
run in full and correctly return null for the hidden storage anchor.

The first failing reference snapshot/schema/History and the source repro are
saved at `/tmp/r4-hidden-root-gap-reference.json` and
`/tmp/r4-hidden-root-gap-repro.ts`. Independent repro/probe files are under
`/tmp/doc-sync-r4-audit/`. A source/synthetic ProseMirror undo caret probe also
propagates the exception because binding selection calls `pathAt` before its
catch. That probe is not an observed browser/user-History failure. A targeted
reference fallback policy and regression tests remain required before claiming
complete movement raw-selection parity. This slice leaves production source
unchanged rather than inventing a new fallback rule inside the Rust oracle.

**Final checks.** Native tests passed 74/74: 60 prior tests and 14 new movement
tests. Offline build, formatting, and isolated stable-toolchain all-target
Clippy with warnings denied passed. The native lane records these results in
`output/r4-move-native-final/receipt.json` and associated logs. Focused
TypeScript movement tests passed 47/47. Separate TypeScript schema-version,
schema-transition, open-editor, and HTTP-schema reference tests passed 21/21.
Those schema checks are not Rust dynamic-schema proof. No full production
suite or new Chrome/WASM/performance check is claimed here.

| Current receipt | PASS comparisons |
| --- | --- |
| `experiments/rust-move-harness/receipt.json` | 360 state/History graphs; 56 native inverse/caret comparisons; five fresh-process restores; four raw endpoint comparisons explicitly NOT_RUN. |
| `experiments/rust-shadow-harness/receipt-current-move.json` | 614 apply-only states; this legacy suite still receives TypeScript-generated inverse operations. |
| `experiments/rust-history-harness/receipt-current-move.json` | 1,039 state/History graphs; 291 native inverse/caret comparisons. |
| `experiments/rust-selection-harness/receipt-current-move.json` | 281 state/History graphs; 27 native inverse comparisons. |
| `experiments/rust-structure-harness/receipt-current-move.json` | 507 state/History graphs; 75 native inverse comparisons. |
| `experiments/rust-blocks-harness/receipt-current-move.json` | 746 state/History graphs; 102 native inverse comparisons. |
| `experiments/rust-nested-harness/receipt-current-move.json` | 582 state/History graphs; 85 native inverse comparisons. |
| `experiments/rust-shapes-harness/receipt-current-move.json` | 606 state/History graphs; 71 native inverse comparisons. |

Independent native review passed 15 exact model/History/inverse checkpoints,
atomically rejected 14 malformed coupled checkpoints, and atomically rejected
five invalid move batches. These are separate checks, not a general claim of
raw TypeScript admission parity. Current receipts share an unchanged 88-file
before/after/live manifest, including production source, every schema/harness
source/README, native tests/Cargo files, and the executable.

The new `experiments/rust-move-harness/fulltrace.json.gz` retains 10,294 records,
including 9,912 native requests. Raw/gzip lengths are 24,452,506/1,227,836 bytes.
Gzip SHA-256 is
`f36ce7f0516486951d5b98a21b6b35603c99f49315401ae4cd0f6ef52ef480bf`;
raw SHA-256 is
`20c15c65a2c74def73adad644500206d113adf7cd864c51483628230dafa3f52`.
The two previous trace-producing suites use distinct `trace-current-move.json.gz`
and `fulltrace-current-move.json.gz` outputs. All 39 preexisting receipts,
including nonstandard `structure.json`, and all ten historical compressed
traces remain byte-for-byte unchanged.

Before native edits, 22 actual source files were archived at
`output/r4-move-baseline/native-source-before.tar.gz`, SHA-256
`2ec3c412f52d42bc498d4196059a4793b73f1ba04fff38696dca84052b28fa1c`.
The separately copied executable retains the section 5.89 SHA-256
`32ecd9b575e7eaeb75ab05f1528b4bf8d3726a5fa0042f13b04880aaab3580df`.
The manifest distinguishes source files from macOS archive metadata. These
baseline copies and output logs are local evidence under ignored `output/`.

**Dynamic schema answer and next steps.** Rust can accept schemas as data.
The current implementation cannot yet load arbitrary schemas at runtime or
replace an open document's schema. It has six compiled-in modes and fixed
type/slot/attribute classifiers. Accepting JSON without replacing those rules
would not satisfy dynamic-schema support.

After resolving the reference endpoint bug, the next native milestone is an
immutable per-document `CompiledSchema`. It must drive validation, projection,
model paths, History, and checkpoint checks with shape/child/group/grid rules,
defaults, attributes, marks/spans, inheritance, and grouping keys. Canonical
schema identity must match TypeScript, including UI. At least two independently
renamed schemas must run in one process and pass edit/History/selection/restore
comparisons. Invalid rules, references, defaults, and wrong digests must reject
atomically. Unsupported descriptors must fail closed.

Initial runtime schema loading is separate from compatible live transition.
The existing TypeScript path permits append-only boolean marks, new nodes, and
allowed new text/flow child types under its exact compatibility rules. Existing
node attributes/defaults/rules, value marks, root, and UI cannot change through
that contract. Live Rust transition must check epoch/server sequence/schema
version atomically, prepare and persist before switching, and retain identity,
exact pending operations, History ownership, selection anchors, and recovery/GC
evidence. Incompatible migration is separate. The 21 TypeScript tests confirm
the compatible reference transition path only; this native transition remains
unimplemented. TypeScript recovery proofs bind a schema version separately;
automatic recovery-proof migration across a live schema transition is not
established by this checkpoint.

**Reproduce.** From the repository root, use matching cached Rust tools:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
node experiments/rust-move-harness/harness.ts
RUST_SHADOW_RECEIPT=experiments/rust-shadow-harness/receipt-current-move.json node experiments/rust-shadow-harness/harness.ts
RUST_HISTORY_RECEIPT=experiments/rust-history-harness/receipt-current-move.json node experiments/rust-history-harness/harness.ts
RUST_SELECTION_RECEIPT=experiments/rust-selection-harness/receipt-current-move.json node experiments/rust-selection-harness/harness.ts
RUST_STRUCTURE_RECEIPT=experiments/rust-structure-harness/receipt-current-move.json node experiments/rust-structure-harness/harness.ts
RUST_BLOCKS_RECEIPT=experiments/rust-blocks-harness/receipt-current-move.json node experiments/rust-blocks-harness/harness.ts
RUST_NESTED_RECEIPT=experiments/rust-nested-harness/receipt-current-move.json RUST_NESTED_TRACE=experiments/rust-nested-harness/trace-current-move.json.gz node experiments/rust-nested-harness/harness.ts
RUST_SHAPES_RECEIPT=experiments/rust-shapes-harness/receipt-current-move.json RUST_SHAPES_TRACE=experiments/rust-shapes-harness/fulltrace-current-move.json.gz node experiments/rust-shapes-harness/harness.ts
node --test packages/doc-sync/test/move.test.ts packages/doc-sync/test/move-history-review.test.ts packages/doc-sync/test/move-structure-regressions.test.ts
node --test packages/doc-sync/test/schema-version.test.ts packages/doc-sync/test/schema-transition.test.ts packages/doc-sync/test/open-editor-schema.test.ts packages/doc-sync/test/http-schema-transport.test.ts
```

**Remaining.** The reference endpoint fix, runtime schemas/live transitions,
required-child/group boundary rules, field-level attributes, broader value-mark
semantics, protected GC, and serialization/recovery limits remain open. R5
adapters and R6 product gates remain planned. This checkpoint establishes no
native production server, WASM client, Chrome result, performance/memory gain,
or complete CRDT equivalence.

Documentation validation passed 28/28 tests, the static build, and the build/link
checker: 32 pages, 1,880 internal links, English prose true, and local-path
exclusion true. Successful audit/repro and documentation logs are also copied
to ignored `output/r4-move-final-audit/`. All 45 production TypeScript source
hashes still match the preceding shape checkpoint. Local documentation checks
do not establish site publication or browser behavior.

The final post-build audit passed all eight receipts' 88-file
before/after/live/cross-receipt hash checks, all three new compressed trace
descriptors, and preservation of all 39 historical receipts and ten old traces.
It checked 247,742 recorded native request boundaries for oracle leakage and
39 successful History restores for exact earlier-native-export provenance.
The legacy apply-only suite retains only ten explicit request records; this
request count does not mean all of its 614 state inputs were serialized, or
that it generates independent native History inverses. The final audit is
`output/r4-move-final-audit/final-artifact-audit.json`, SHA-256
`037b78062b4265caaa91e2b37bfc3b0c6ef2be6afb0406edc0040b1ee5d715d8`.
Scoped diff/whitespace checks and a scan of 36 experiment/roadmap source and
documentation files passed.

### 5.91. Hidden root-gap cursor correction and Rust documentation

**Result.** The four raw endpoint comparisons omitted in section 5.90 now pass.
They no longer throw in TypeScript and resolve to the same root-start caret in
Rust. The new movement receipt reports `rawEndpointStatus: PASS`,
`rawEndpointNotRun: 0`, and 5,666 successful raw endpoint comparisons. These are
finite semantic comparisons, not a complete R4 or browser acceptance gate.

**Cause and correction.** A hidden private leading root text line has no owner.
`Doc.escape` previously asserted an owner and called `posFrom(null)`. The fix
returns root start only at that ownerless terminal. Existing owned nested,
neighboring-cell, and deleted-owner escape rules remain unchanged. Native raw
resolution uses the same terminal after visible logical placement is checked.
Strict `InputSession.resolve` and native model-range resolution still return
null for hidden endpoints. Hidden storage does not become visible presence.

The TypeScript production source change is confined to `crdt/doc.ts`. It does
not emit operations, change actor/ticket identities, advance clocks, replace
History, or alter collaboration conflict rules. Native changes are confined to
the corresponding raw-position fallback, its focused regression, and the
current test-count documentation.

**Tests.** Six new cursor tests passed; five reproduced the original exception
before the correction. They cover empty/nonempty replacement roots, exact
fallback paths, snapshot/clock/History/operation purity, strict null ranges,
nested/deleted owners, and synthetic `PmBinding.undo()`/`redo()` caret selection.
The latter calls the real binding methods with a supplied caret; it is not a
Chrome or real user-History scenario. The saved original reference snapshot
also passes, retaining its grouped model path and unchanged state/clock.

The complete TypeScript library suite passed **726/726**, the focused cursor and
movement suites **53/53**, and root type checking passed. Native tests passed
**75/75**. Offline build, full formatting plus included-module checks, and
isolated stable-toolchain all-target Clippy with warnings denied passed.
Native validation is `output/r4-move-final-audit/cursor-native-validation.json`.
The native binary SHA-256 is
`11ede868feedc12a29a55f22fe704373c2b1988e03050ffb50fb5d4716f2e9c8`.

**Differential evidence.** All eight final suites write distinct
`receipt-current-cursor.json` outputs. Their state counts are movement 360,
apply-only 614, History 1,039, selection 281, paragraph structure 507, blocks
746, nested 582, and shapes 606. Independent inverse counts remain 56, 291,
27, 75, 102, 85, and 71 in the corresponding non-apply-only suites. Movement
also compares 802 captures, 2,833 ranges, all 5,666 raw endpoints, and all four
exact formerly omitted hidden checkpoints. Each of those four matches
`{b: 0, o: 0}` while its strict range stays null.

All eight receipts share 89 unchanged before/after/live source and binary
hashes, including the new cursor regression. Independent audit checked 247,736
recorded native requests for oracle leakage and 39 coupled restores for exact
earlier-native-export provenance. The base apply-only suite has no complete
request log; its snapshot provenance is source-audited and it still receives
TypeScript-generated inverses. It is not independent native History proof.
All three new gzip descriptors pass raw/compressed hashes, lengths, and counts.

The movement trace is `experiments/rust-move-harness/fulltrace-current-cursor.json.gz`:
10,298 records, 24,448,746 raw bytes, and 1,226,453 gzip bytes. Gzip SHA-256 is
`9bbdb6248df286f8ad6489c180c93fe9c3ee07b844fbded76f91652dc9cc76ea`;
raw SHA-256 is
`ad216647eadfec81bae3b23c5ea32e803670014a4bbb30b669ec3bc3210381a3`.
The final audit is `output/r4-move-final-audit/cursor-artifact-audit.json`,
SHA-256 `b6a51c250d26243281e09c9cffc4cb3a7a53ece6e356e489e886b22824b18e67`.

**Preservation.** All 47 prior JSON artifacts, 13 compressed traces, and the
previous movement summary are unchanged. The new baseline agrees with the
older 39-JSON/ten-trace inventory; all 47 saved JSON copies match. Core and
native RED/GREEN sources, logs, and probes are under `output/r4-cursor-baseline/`,
`output/r4-cursor-native-baseline/`, and `output/r4-move-final-audit/`.
The final 89-file checkpoint is additionally archived at
`output/r4-cursor-final-sources/sources.tar.gz`, SHA-256
`32942112952585d7ba1e473c9b2b3a3a08f6ee7aec7c67af99315aa6dcfd1a23`.
These local output archives are ignored by Git. Later adapter work must not
overwrite these receipts or describe them as a later source checkpoint.

**Documentation.** The local VitePress preview uses port 5415 under `/doc-sync/`.
The new Rust engine page explains native versus WASM work, stored/projection
state, operation admission, UTF-16, History, selections, checkpoint recovery,
dynamic-schema plans, measured storage results, and the missing product adapters.
Every one of the 14 existing Build an editor guides has a topic-specific Rust
experiment section. Thirteen printed JSONL examples were executed against the
frozen native binary with semantic assertions. The sync guide uses the existing
five-case pending-replay suite with distinct output paths. The documented
TypeScript rule command passed 81/81; this is also part of the complete library
suite, not an additional distinct coverage count. The engine guide's three-line
protocol example also renders `Hi` as documented.

Evidence is in `output/r4-cursor-evidence/docs-core-examples.json`,
`docs-integration-examples.json`, and `docs-jsonl-example.json`. The examples
demonstrate the private engine boundary; they do not supply a Rust editor SDK,
production adapter, MCP connection, or browser selection implementation.
Documentation tests passed 28/28 and the static build passed after those edits.
No new Chrome editing, OS IME, WASM, performance, or deployment result follows.

**Next work.** Runtime schemas, compatible live transitions, broader schema
rules, protected GC, and R5/R6 remain open. Dedicated TypeScript Tiptap support
is being implemented in the isolated `codex/tiptap-support` worktree. A separate
native SDK crate is being built on the same Rust semantic core. Their API and
integration evidence must be recorded separately from this cursor checkpoint.
No commit, push, publication, or production Rust migration occurred here.

### 5.92. Tiptap support and callable native Rust SDK

**Result.** Added the optional `@barocss/doc-sync/tiptap` entry point, a real
two-editor demo, and an experimental native Rust SDK. The production engine
and all four browser/editor bindings remain TypeScript. The Rust SDK is a
separate private Cargo crate; it does not provide a Rust Tiptap integration or
replace the existing server/client. Runtime arbitrary Rust schemas and live
schema transitions remain unimplemented.

**Ownership and integration.** Tiptap implementation and tests/demo work used
the isolated `/Users/user/github/doc-sync-tiptap` worktree on
`codex/tiptap-support`, seeded from the current uncommitted main workspace.
Existing source/dependency files were compared against the seed hashes before
selective integration. The only four preexisting files changed by that lane
were root `package.json`, root `package-lock.json`, the library `package.json`,
and `pm/binding.ts`. New API/tests/demo/docs were copied separately. The main
cursor checkpoint had already passed and was archived before integration.
`output/tiptap-main-integration/manifest.json` retains the pre-integration copies
and hashes. Inherited bot, sync, Presence, and recovery work was preserved.

Native SDK work stayed under `experiments/rust-sdk/`. It reuses the existing
Rust semantic core through a path dependency, with a separate build target.
The frozen shadow executable remains
`11ede868feedc12a29a55f22fe704373c2b1988e03050ffb50fb5d4716f2e9c8`.
There was no commit, push, release, publication, deployment, or worktree cleanup.

**Tiptap API.** `DocSync` plus `createTiptapExtensions(client.schema)` mount a
real Tiptap 3.32.2 Editor. Generated nodes and marks match the current PM
converter, including its flat list representation and visible-cell tables.
Schema semantics are checked; incompatible nodes/marks, local History and
other collaboration bindings reject. Arbitrary StarterKit schemas are not a
qualified integration path. Editor peers remain optional subpaths of the one
npm library. Tiptap core/pm peers and test dependencies are installed in the
workspace; esbuild serves the new private demo.

Tiptap owns its EditorState and applies accepted transactions. The shared PM
bridge converts local accepted/appended changes to CRDT operations while
preserving plugin state and filters. Remote operations do not echo. Existing
client content supplies initial editor content without creating local History.
Commands `docSyncUndo`/`docSyncRedo` and Mod-Z/Mod-Shift-Z/Mod-Y use actor-owned
History. Combining a History command and document edits in one chain rejects
before either document changes, even if that History action is unavailable.
Selection-only History chains remain supported.

One mounted editor owns a client binding. Destroy restores wrapped callbacks
conditionally and leaves connection ownership with the application. Hidden
cell data remains in the reference model. A compatible open-schema change
requires destroying/rebuilding Tiptap extensions; a dedicated transition host
has not been qualified. The existing tested transition hosts remain PM, Slate,
and Lexical.

**Bugs found during verification.** A real Chrome run exposed a Presence
feedback loop that a no-op headless transport did not expose. The fix suppresses
remote-only republishing, deduplicates endpoints/profile before sending, and
republishes once after reconnect/profile changes. Independent review also
reproduced a throwing application callback interrupting state installation
after a CRDT commit. Host callbacks and Presence sends now run in guarded
microtasks after state application. `onError(error, callback)` reports failures;
reporter errors are contained and queued work stops after destroy. Reentrant
callbacks can issue a later editor command without a partial state transition.

**Tiptap evidence.** Final main-workspace library tests passed **742/742**, with
zero skipped. This includes **16/16** real Tiptap/jsdom cases; do not add them
again to the 742 count. Root and package type checking passed. The earlier
737-test staged result predates the Presence/callback fixes and is historical,
not the final proof. Tests cover chains, appended/filtered transactions, native
marks/split/list/table conversion, foreign-text-preserving undo, UTF-16 ranges,
initial snapshot mount, readonly receive, reconnect, callbacks, Presence
lifecycle, mixed History rejection, and teardown.

The final main demo runs at `http://127.0.0.1:5416`, started with
`TIPTAP_PORT=5416 node apps/demo/tiptap/start.mjs`. Its queued in-memory transport
uses production DocHub and two real Editors; this is not HTTP synchronization.
The actual Chrome keyboard sequence converged to `AliceBob`; Alice undo left
`Bob`; redo restored `AliceBob`. Selection `[1,3]` produced distinct stable
endpoints and one visible remote range. Offline divergence converged after
reconnect. Disposing Bob, editing Alice, then remounting Bob converged with both
pending queues empty. The browser error list was empty. Chrome 147 evidence and
two inspected screenshots are under `output/tiptap-main-browser/`. OS IME is
**NOT_RUN**. Stage receipts remain separately under `output/tiptap-evidence-stage/`.

Reproduce the browser check with a separately started demo:

```sh
TIPTAP_BROWSER_OUT=output/tiptap-main-browser node apps/demo/tiptap/check-browser.mjs http://127.0.0.1:5416
```

It creates and closes only its named Chrome session. `TIPTAP_BROWSER_OUT` keeps
evidence outside source directories and cleanup does not mask the first error.

**Native SDK API.** `doc-sync-native-sdk` exposes `Document`, six fixed
`SchemaPreset` modes, typed `Op` variants, `Key`, `Utf16Text`, `ModelNode`/
`ModelRun`/`ModelText`, ranges, History status, `Change`, and opaque coupled
`Checkpoint`. `insert_text`, `delete_text`, and `set_mark` allocate own tickets
and record own History. `record` accepts explicit typed block/move/attribute
operations. `apply_remote` delivers or retries the original operations without
adding local History or pending entries. Undo and redo return exact operations
for the host to deliver. Acknowledgement removes only an exact pending prefix.

Checkpoint restore validates actor/preset, native document/History, and pending
replay before replacement. SDK History commands stage a fresh native replica
before decoding results and committing pending metadata. A decode failure
cannot commit a partial SDK change. This currently restores a full checkpoint
per command; there is no performance acceptance claim. The host must provide
trusted persistence, acknowledgements, networking, and GC protection.
Checkpoints are not authenticated or production TypeScript snapshots.

**SDK evidence.** Native tests passed **14/14** (one unit and 13 integration
tests), formatting, strict all-target Clippy, target/example checks, the
two-author restart example, and a copyable README doctest. The actual example
prints `BA`, then `B` after Alice's restored undo, then `BA` after redo.
Eight independent review cases checked six presets/UTF-16, tombstones, anchors,
checkpoint equality, clock exhaustion and forged pending rejection.

An additional independent SDK authoring comparison passed **20 actions and 40
actor states** against TypeScript `Doc`, `History`, and commands. It compares
normalized generated operations, models, History availability and pending
operations through concurrent insertion/deletion, isolated UTF-16, explicit
marks, foreign same-value ownership, undo/redo, restart and duplicate replay to
source and peer. Expected TypeScript models/inverses never enter Rust. The only
normalizations are strings to UTF-16 units, omitted empty birth marks to an
empty map, and omitted empty model containers to empty containers. It is not
full History graph comparison or a general `doc.edit()` compiler proof.

Evidence: `output/r4-sdk-evidence/receipt.json`, `sdk-typescript-receipt.json`,
Rust/TypeScript traces, and `output/r4-sdk-adapter-review/`. SDK library SHA-256
is `0fe75325d4e6fe1eb978f748324e2f106ddb23430b486b8d7fc09ff6a6946f6e`.
The existing semantic core and frozen executable are unchanged by the facade.

**Documentation and limits.** The Rust guide now starts with actual native SDK
calls and explains how a Rust host delivers `Change.ops`. It explicitly shows
the current TypeScript editor path and the missing native/WASM adapter boundary.
All 14 original Build an editor pages contain SDK-first complete programs; all
14 printed programs compiled and ran with **41 assertions**. Old protocol probes
remain in expandable sections as lower-level inspection examples. Their exact
source/binary/SDK hashes are in `output/r4-sdk-evidence/docs-examples.json`.
The new Tiptap page links the same native SDK boundary and adds the fourth
TypeScript binding to navigation. README and roadmaps distinguish these APIs.

The SDK has no arbitrary runtime schema loader, live transition, full native
editing compiler/mark inheritance, transport/storage driver, WASM package,
Node binding, MCP adapter, or editor adapter. No native production migration,
Rust browser performance, or memory benefit is established. Tiptap open-schema
transition, arbitrary StarterKit schemas and real OS IME remain unqualified.

Dependency installation reports the existing Zod 3.25.76 advisory
`GHSA-mrhx-c7xc-m3w5`. The pre-integration lock already contained that exact
version; it is not introduced by Tiptap. `npm audit` is therefore not clean.
This task did not perform an unrelated major Zod migration.

**Final integration audit.** All eight R4 suites passed again after Tiptap
integration in distinct `receipt-current-tiptap.json` files. They share 90
unchanged before/after/live source and binary hashes, including the new Tiptap
module and PM bridge. The audit checked 4,735 states, 707 independently generated
inverse comparisons, 247,736 recorded requests, and 39 coupled restores. All
707 logged History travel requests contain no supplied inverse operations.
The apply-only harness retains its separately declared request-log and inverse
limitations. This comparison does not execute a Rust Tiptap adapter.

All three new gzip traces match raw/compressed hashes, lengths and record counts.
The 73 older artifacts (55 JSON, 16 gzip, two summaries) are unchanged. The
movement suite still compares all 5,666 raw endpoints with no omissions and
all four formerly failing root gaps pass. Audit receipt:
`output/tiptap-main-integration/final-rust-artifact-audit.json`, SHA-256
`b662aa2ad17b84bdd7bf632346e079eeaf0eecd039f0ab1f99ba083cf60c9d45`.

Final documentation validation passed 28/28 tests, the static build, and link/
English/local-path checks: **34 pages and 2,155 internal links**. The dev server
was restarted with `CHOKIDAR_USEPOLLING=true` after detecting stale Vite transform
content despite updated Markdown. A fresh Chrome read confirms the native SDK
heading, current introductory text, and Tiptap navigation. The inspected SDK
page screenshot is `output/r4-sdk-evidence/sdk-guide.png`. The site and Tiptap
demo remain local previews; public GitHub Pages was not redeployed.

**User-directed next stage.** The user requested independent binding packages
and a future TS/Rust-WASM choice, then authorized continued roadmap work while
away. This supersedes the earlier single-public-npm-package preference for the
next packaging stage. An isolated `codex/binding-packages` worktree is seeded
from this completed main checkpoint. The next stage must preserve old facade
imports, add independently buildable/packageable bindings, and define a
portable engine contract. It must not advertise WASM parity before the schema,
compiler, recovery and real browser adapter gates pass. This note records the
next work; package extraction is not part of the section 5.92 PASS evidence.

### 5.93. Independent binding packages and engine-contract groundwork

**Result and policy.** The latest user request replaces the earlier single-
public-package preference with independently releasable bindings. The source
is now split into six npm workspaces: `@barocss/doc-sync-core`,
`@barocss/doc-sync-prosemirror`, `@barocss/doc-sync-tiptap`,
`@barocss/doc-sync-slate`, `@barocss/doc-sync-lexical`, and the compatibility
facade `@barocss/doc-sync`. All remain version 0.0.0 and `private: true` for
release preparation. No registry publication or remote push occurred.

The facade keeps all eight public entry points: root, sync, node, server,
prosemirror, tiptap, slate and lexical. Core owns the prior CRDT/sync/editor/
server/node implementation; each binding owns its own code. Bindings depend
on Core as a peer; Tiptap also peers on the PM binding. The facade depends on
Core and has four optional binding peers. Core-only consumers do not install
or load editor peers. There are no binding-to-facade dependency cycles.

**Build and release artifacts.** Production exports now resolve ESM JavaScript
and declarations under `dist`. TypeScript 5.8.3 rewrites relative `.ts` imports
to `.js`. `npm run build` builds Core, PM/Slate/Lexical, Tiptap, then facade.
Root test/typecheck/dev commands build prerequisites first. Every package has
`prepack: npm run build`; the shared helper validates a known package, cleans
only that package's generated `dist`, and emits it again. Plain `npm pack`
rebuilds a poisoned index and removes an orphan JS artifact for all six packages.
The independent freshness probe also checks orphan declaration removal.

Seven separate tarball consumer checks passed without workspace symlinks or
esbuild aliases. They cover core-only loading/type checking, independent editor
peers/types, all legacy entry points, class identity, and actual Tiptap tests
against installed artifacts. A separately packed Slate 0.0.1 artifact consumed
unchanged facade/Core 0.0.0 files. This proves the local independent patch
mechanism; it is not a registry-release result. The actual package ranges allow
compatible patches below 0.1.0, not arbitrary breaking API changes.

Independent audit found exactly one implementation each of Doc, History,
PmBinding, SlateBinding and LexicalBinding across all six artifacts. All old
public symbols remain available. The 44 preexisting implementation files have
the same AST bodies after excluding imports/reexports/comments. A separate
in-memory TypeScript compilation emitted 66 Core files that matched both the
current workspace `dist` and final packed Core file set/bytes exactly. The
packed facade and new package references share the same Core and PM class graph.

**Draft engine API.** `@barocss/doc-sync-core/engine` exports a value-DTO
`DocumentEngine`/`EngineFactory` contract and `typescriptEngine`. It supports
actual compile/normalize, causal wire application, local History, stable
anchors/selections, and coupled checkpoints. Checkpoints identify engine,
contract revision, actor and schema fingerprint; the common payload is opaque,
with a separate TypeScript payload type. Unsupported composition, events, GC
and live-schema capabilities reject explicitly.

The adapter stages candidate document/History state for error atomicity.
DTO copies validate finite plain values and use `structuredClone`; they do not
expose Item/Line/Clock/Map instances. Snapshot/History JSON number semantics
remain the existing Core semantics. Tests compare shared/distinct object span
inputs and negative-zero behavior to actual Doc/History rather than pure model
helpers. Same-actor edit/undo/redo echoes remain valid idempotent wire retries.

All 15 focused tests pass: renamed schemas, nonempty table normalization,
UTF-16/unpaired units, delayed/duplicate delivery, foreign writer/deletion
ownership, strict hidden selection, same-actor retries, checkpoint continuation,
and error atomicity. The prototype's successful-call revision is not a server
sequence or content hash. It copies a full snapshot per mutation and has no
latency guarantee. It is deliberately **not connected** to production
SyncClient/InputSession/bindings and must not replace their optimized hot path.
No WASM engine, backend selector, pending-network recovery controller, or Rust
snapshot compatibility is provided by this contract groundwork.

**Main integration and tests.** Implementation ran in the isolated
`codex/binding-packages` worktree. The guarded main integration copied 221 file
changes, including 84 new files and 44 old implementation-path removals.
Original files were archived before replacement and compared with the seeded
working hashes. An accidentally rewritten historical `.dev` receipt path list
was restored byte-for-byte; old evidence is not relabeled as new source.

Final main `npm test`: **957 total, 956 PASS, one SKIP, zero FAIL**. The skip is
the existing “unsupported platforms fail closed instead of using an unsafe
lock” platform case. Counts are library 742, engine 15, bot 38, demo 64, docs
28 and MCP 70. The Tiptap 16 cases are already included in the library count.
Root type checking and package build passed. Compat tests passed 32/32;
compat/products builds passed. Main `check:packages` passed all seven consumers.
Full packaging and clean-output evidence is under `output/binding-packages/`;
source/before files are under `output/binding-packages-main-integration/`.

**Browser scope.** The isolated main demo server uses port 5417 and
`DATA_DIR=/tmp/doc-sync-bindings-main-browser-20261102`. Actual Chrome `/`
input converged three peers to `MainAMainB`; A undo retained `MainB`; redo
restored the combined text; remote selection decorations appeared. `/pm`
converged native/PM/server models to `SourceAPMB`; PM undo retained `SourceA`;
redo restored it; a selected `So` appeared remotely. Old/new browser imports of
Doc, History, SyncClient, PmBinding and REMOTE_META share identity and resources
use the canonical Core/PM source routes.

A freshly bundled main Tiptap demo on port 5418 passed the existing keyboard,
own-undo/redo, range, offline/reconnect and dispose/remount check. Its actual
served bundle contains a single Core/PM class graph with no aliases. Page-error
lists are empty. Evidence is under `output/binding-packages-main-browser/`.
The verifier closed only its own Chrome sessions and its own 5418 process;
root's 5417 server and prior user-facing previews were preserved. `/multi`
browser testing and OS IME are **NOT_RUN**. The first attempted 5417 startup
overlapped `pretest` cleaning `dist` and failed module resolution; after build
completion the server and browser checks passed. Build/pack mutations must be
sequenced before runtime fingerprint collection.

**Documentation and provenance.** README and the new package guide describe
six packages, local tarball installation, required peers, compatibility imports,
private release status and the separate native SDK. Current implementation
links use canonical new paths; historical receipts/reports retain old paths.
Printed Rust SDK programs remain byte-identical. The package/engine usage
example executes against the current compiled Core. Docs build and link checks
pass **35 pages, 2,252 internal links**, English true and local-path exclusion
true. No public Pages deployment is established.

All eight native parity harnesses and the SDK authoring verifier now execute
the packaged Core `dist`, not a mixed source/dist graph. Shared fingerprints
cover the six source/JS/declaration trees, manifests, build helpers/configs,
TypeScript compiler inputs, Rust sources/schemas and actual binary. Module URLs
and Doc/History equality with the public Core entry point are verified. Final
packaged-source Rust reruns passed in eight separate
`receipt-current-packages.json` files. The final audit verifies 374 common
before/after/live hashes, 4,735 states, 707 independent inverse comparisons,
247,736 recorded requests and 39 coupled native checkpoint restores. All
707 logged undo/redo requests supply no inverse operations. The older apply-only
suite retains its incomplete request-log and inverse-generation limits.
All 5,666 movement endpoints pass with zero omissions, including the four
formerly failing hidden-root gaps. Three compressed traces pass both compressed
and raw hash/length/count checks. The SDK comparison also passes 20 actions
and 40 actor states with the same 373 source/runtime inputs and its separately
hashed native SDK executable.

All 85 historical artifacts (63 JSON, 19 gzip, three summaries) are unchanged.
The final audit and frozen source/dist archive are under
`output/binding-packages-final-audit/`; `checkpoint.json` identifies their
SHA-256 values. The first packaged attempt exposed a missing local `binary`
declaration in the selection harness, before comparison began. That failure
and its original source were preserved; all eight suites passed after this
collector-only fix. No engine rule changed. Earlier receipts remain immutable.

**Next seam.** Production bindings still use concrete Doc through SyncClient.
The next H1 stage should add a binding-facing EditorHost backed directly by
existing SyncClient/InputSession, then make PM logic host-only while retaining
the exact legacy PmBinding client property/constructor. Preserve callback
ordering, draft/live document generations, retained versus visible anchor
resolution, and zero added hot-path snapshots. A later H2 covers Slate/Lexical.
Rust still needs broader compiler/runtime-schema/recovery/GC parity and an
actual WASM bridge before a selectable backend can promise the same behavior.


### 5.94. Production editor hosts and independent bindings

**Delivered scope.** Core exports `EditorHost`, `EditorSession` and
`createSyncClientEditorHost` through `@barocss/doc-sync-core/editor`. The adapter
uses the existing SyncClient/InputSession directly. Ordinary edits do not
stage a full checkpoint. Borrowed immutable model views use generation and
revision stamps, including same-version document replacement and draft/live
switches. The separate DTO `DocumentEngine` prototype remains outside this
production path.

`PmHostBinding`, `SlateHostBinding` and `LexicalHostBinding` contain the shared
binding implementations. Legacy PmBinding/SlateBinding/LexicalBinding wrappers
retain their constructor APIs and exact `.client` references. Lexical's
`.input` remains the original InputSession; the host session delegates to it
and composition creates one fork. Shared implementations use the host contract,
not concrete Doc/Item/Line/Clock objects or SyncClient callbacks. Tiptap retains
its existing client/options/storage API and shares the PM implementation.
`sync-client-compat.ts` isolates its callback ordering, presence deduplication,
re-entry receipts, queued-callback cancellation and owned-hook restoration.
There is no host-only Tiptap extension or Rust/WASM backend selector yet.

**Safety and review corrections.** Post-mutation model/update observers all
run in app-first order before errors propagate. A single error retains its
identity; multiple failures use ordered AggregateError. Pre-event ordering is
unchanged. Ordinary notification errors still propagate to their caller;
only accepted conditional finalization captures `notificationErrors`.
An additional PM regression initially assumed the latter behavior for an
ordinary remote update. Its expected error handling was corrected; it now
verifies both the surfaced original error and the already-current PM view.
The original failed full-run log remains preserved.

A narrow `client.assertLocalEditing()` reuses the pause/conditional gate without
adding custom Doc guard calls to live edits. Draft mutations still check the
live guard before changing draft state. Review found a real regression where
session clock reservation also used that gate. This prevented native update
callbacks during an unresolved conditional or recovery pause. Clock observation
now only reserves existing tickets and remains allowed; begin/apply/commit/end
stay blocked. The RED run had five failures in 20 cases. The corrected
Core/native/legacy focused run passes 55/55, including real server acceptance
followed by response loss, disconnect, identical retry and reconnect, plus
remote display updates during a recovery pause with local input blocked.

The compat PM demo reuses its existing composition session through the host
adapter and disposes its observer/view on pagehide. The product demo's existing
debug disconnect API now has a matching connect API for same-editor replay
verification. This does not change the document protocol or editing rules.

**Final main verification.** `npm test` exits successfully: **983 total,
982 PASS, one existing platform SKIP, zero FAIL**. Counts: library 748,
Core engine/host 27, Slate host 4, Lexical host 4, bot 38, demo 64, docs 28,
MCP 70 (69 PASS, one SKIP). Root type checking and `git diff --check` pass.
Compat tests pass 33/33 and its build passes. Seven isolated tarball consumers
pass, including actual installed PM/Slate/Lexical Host edit/undo/redo. All six
packages still export compiled ESM/declarations and remain private at 0.0.0.
No registry publication, commit, push or Pages deployment occurred.

Chrome 147 passes **nine rich-profile combinations**: Word/Notion/presentation
× Slate/Lexical/PM. Each uses trusted native Unicode beforeinput, an independent
foreign edit, exactly one own undo and redo preserving foreign text, forward
and backward native selections, and actual disconnect/connect on the same
mounted DOM editor. The disconnected view stays stale while other peers receive;
reconnect converges exactly, without duplicate text, with pending zero and no
page/app errors. Tiptap separately passes keyboard input, own undo/redo, range
presence, offline/reconnect and dispose/remount. OS IME is NOT_RUN and these
functional checks are not screen-latency measurements. Evidence:
`output/editor-host-browser/native-proof/receipt.json` and `tiptap/`.

Browser harness failures remain in three attempt directories: Chrome offline
emulation did not close existing SSE streams; PM redraw removed a temporary
DOM attribute; the coordinate CLI requires integers. The final harness uses
actual client disconnect/connect and stable coordinate clicks. No editing
rule was changed to satisfy those checks.

**Performance boundary.** H0 froze source/dist, raw samples and fixed guards
before implementation. The final H2 count/semantic gate passes all 20 pairs
(10k/100k × ten scenarios). Generated operations, models, pending changes,
semantic History, fallback statistics and remote scope budgets match H0.
Ordinary edits add zero snapshots; selection/presence add zero model reads or
PM conversion; eligible remote 1/2/8 scopes add zero whole-model reads before
PM pull. Composition retains one snapshot/restore and one History group.
Final Core/PM aggregate:
`b126453cbd294a41a62d62f631a2e9f849cc4516a6b80da34a6caa69353662e3`.

H1 timing remains **UNRESOLVED**, pinned to its earlier aggregate
`77828080f50189184ec464e5e8459de340c9f2bc581b7efd466d9b1eb6a1555f`.
Its full ABBA x3 run retains 1,920 observations; three of 20 fixed guards were
exceeded: 10k mark +1.806 ms, 100k presence +2.202 ms, and 100k structure
+8.470 ms. All six conditions in one targeted repeat were within the original
guards; the three original deltas became -0.044/+0.062/-0.174 ms. The targeted
allocation history differs and does not replace the full result. Original H0
self-control noise exceeded five of 20 guards. GC pauses were recorded, but
clock-origin calibration was missing, so per-sample GC causality is UNPROVEN.
The invalid overlap draft is retained and explicitly marked. No H2 timing or
Chrome latency acceptance is claimed. See `output/editor-host-evidence/`.
Only top-level History group wall-clock `at` fields are normalized for semantic
comparison, outside the timer; the original false-positive hash reports remain.

**Final native differential audit.** Eight separate
`receipt-current-editor-host.json` files pass against the actual packaged Core.
All 392 before/after/live source, declaration, compiler and native-binary hashes
match. The independent audit verifies 4,735 states, 707 independent inverse
comparisons, 247,736 recorded requests and 39 coupled native checkpoint restores.
All 707 History travel requests omit supplied inverse operations. The older
614-state apply-only slice retains its incomplete request-log/inverse limits.
Three gzip traces pass compressed/raw hashes, sizes and record counts. All
5,666 movement endpoints pass, zero omissions, including the four hidden-root
cases. SDK authoring passes 20 actions/40 states with the same 391 source inputs
and its separate executable. This does not exercise a Rust EditorHost or WASM.

All 98 older artifacts (72 JSON, 22 gzip, four summaries; 410,783,170 bytes)
remain unchanged. The final audit is
`output/editor-host-final-audit/editor-host-rust-artifact-audit.json`, SHA-256
`37c70d84dd521c9c55d8eeccb9dfcefbbfc051ac8b680318ea6ff1571018249a`.
The input archive contains 393 inputs plus its manifest, with contents checked
on readback; SHA-256
`dbb581185897bcf48b557a6b79f1e4e2a536b5833fc0e01e7f2d846c0b470e91`.
The Rust binary and SDK implementation remain unchanged.

**Worktree ownership.** H1 was built in `codex/editor-host`; H2 was built in
`codex/editor-host-native`. A hash-guarded ten-file H2 import preceded the
37-file guarded main integration. Before-files and manifests are under
`output/editor-host-main-integration/`. Later browser-harness and documentation
changes are separately retained. Inherited WIP, existing worktrees, user tabs,
prior previews and historical evidence were preserved.

**Next engine work.** The shared binding seam is delivered for the TypeScript
backend. Rust still needs its schema/compiler, events, composition, History,
recovery/GC and actual WASM host gates. Native fixed-preset SDK/shadow success
must not be described as interchangeable TS/WASM editor support.

### 5.95. AI documentation and server connection

AI and bot documentation now has its own top-level navigation and sidebar,
separate from Build an editor. `/ai/` introduces the server-authoritative
connection model. `/ai/server.html` leads with an application document server,
HTTPS placeholder configuration, schema discovery, isolated actors/journals,
exact HTTP/SSE endpoints and the required build commands. Existing `/guide/ai`
and `/guide/ai-walkthrough` URLs remain; local Codex exercises are explicitly
development walkthroughs. README, API, status and roadmap entries match the
six-package compiled-artifact and production-host state. Rust fenced programs
in all 15 Rust-containing guide pages remain byte-identical to the seeded
checkpoint; prior SDK compilation evidence is not relabeled as a new run.

The current MCP application remains a stdio process with an outbound
NodeHttpTransport connection. `DOC_SYNC_URL` can name a remote document server.
It does not create a hosted MCP endpoint. Hosted Streamable HTTP, client
identity/document authorization, document-server credential forwarding, isolated
hosted sessions and deployment-platform durable storage remain implementation
work. The current durable journal is macOS-only. An actor ID is not an
authenticated principal. The guide does not invent unavailable URL/auth options
or describe the unauthenticated demo as a production deployment.

Documentation tests pass 28/28. Final build/link validation covers **37 pages
and 2,501 internal links**, English true and local paths excluded. The owned 5415 VitePress
preview retained stale navigation despite current Markdown. Restarting that
owned server with polling restored the current AI & bots menu. A fresh Chrome
read verifies the new heading/navigation, build steps, remote example and
explicit hosted-MCP/credential gaps. Screenshots and browser receipt are under
`output/editor-host-browser/ai-*`. The user-facing preview remains
`http://127.0.0.1:5415/doc-sync/ai/`; public GitHub Pages was not redeployed.

### 5.96. Private HTTP MCP, Linux recovery, bounded reads, and bot checks

**Implementation.** The private MCP app now supports authenticated Streamable
HTTP routes at `/mcp/{tenant}/{document}/{slot}`. Static bearer grants bind a
principal, fixed upstream document, and actor to read/write/schema permissions.
All HTTP verbs bind the session to the exact grant and route. Upstream requests
use configured credentials, reject redirects, and bound non-SSE waits. The
service bounds requests, bodies, sessions, and admitted calls. Config and data
files require private owned storage. A read-only session cannot replay a pending
write journal. Routine HTTP session closure drains work and retains recovery
reservations; it sends no unfenced upstream leave/release. JSON responses are
supported; authenticated GET returns 405, without notification replay. This is
one-host private infrastructure, not OAuth, public TLS, document-server access
control, distributed storage, or deployment acceptance. Keep the upstream
private or place it behind application authorization.

Durable MCP journals and bot-profile claims now support Linux with the existing
kernel-lock contract. `/usr/bin/flock` uses the inherited open file description;
the parent retains exclusion after the helper exits and releases it on close or
process termination. Missing helpers, unsafe files, or failed locks stop startup.
No PID, lock-file deletion, or ephemeral fallback replaces exclusion. Darwin
retains its previous locking path and journal format. New Linux CI covers MCP,
bot/profile recovery, product recovery startup, and Core tests; remote CI has
not run in this local task.

Core exports `readDocumentSlice`. MCP adds `read_document_slice`, with HMAC
continuations bound to the session, document instance/version, epoch, sequence,
schema, and query. Child, node/run, UTF-16, depth, and JSON-byte budgets reject
oversized results before projection where possible. Successful MCP tool-result
bytes include both content and structured content, excluding the JSON-RPC frame
and headers. Canonical model reads retain covered table-cell content. Ambiguous
group addressing and model-only minimum fallbacks fail closed. First sibling
indexing, nested ancestors, and global projections can still scan more state;
this does not establish constant-time reads or a complete performance gate.

Bot version-1 briefs add `text_occurrences` and `child_types`: exact nonoverlapping
UTF-16 matches and ordered direct canonical-child types. Inline objects and
text-node boundaries break matching; retained hidden cell text counts. Checks
remain separate from planner completion, preserve the original brief after
restart, and require an authoritative matching revision. They do not validate
all attributes, cardinality, provenance, placement, or document quality. B2,
proposal acceptance, and broader operations remain open.

**Current checkpoint evidence.** macOS Node 24.22.1 `npm test` passes **1,054
total: 1,052 PASS, two platform SKIPs, zero FAIL**. Counts: library 748, Core 42,
Slate 4, Lexical 4, bots 51, demo 64, docs 28, MCP 113 (111 PASS, two SKIPs).
The comparison suite passes 33/33, typecheck passes, and seven isolated tarball
consumers pass. An earlier overlapping build removed generated files during two
bot cases and one comparison import; those orchestration failures are retained.
The final workspace run and comparison run were sequential after the build and
passed. A bad new documentation anchor was fixed; the final build checks
**39 pages and 2,710 internal links**, English true and local paths excluded.

Actual Linux validation uses Debian 12 arm64, Node 24.22.1, UID 1000, util-linux
flock 2.38.1, network disabled, no host mounts, and container-local overlay
storage. **955 total: 954 PASS, one expected platform SKIP, zero FAIL**: MCP 113,
bots 51, product bot-recovery startup 1, Core 42, library 748. Real process-kill,
server restart, duplicate suppression, history, and foreign-edit checks passed.
Image ID: `sha256:a206a3bc0a8ec022f034595d30452c130f98a0fb7e94049899661b38020123f4`.
The source manifest and OS/filesystem/container receipts are in
`output/server-mcp-stage/linux-final/`. Later changes in its source recheck are
documentation/CI only. NFS, physical power loss, and multi-host consistency are
not tested.

Fresh Headless Chrome 147 passes all nine Word/Notion/presentation ×
Slate/Lexical/ProseMirror combinations for native input, independent history,
forward/backward selection, remote changes, and mounted-editor reconnect.
Tiptap passes its separate input/range/history/reconnect/remount checks. The
HTTP transport's original absolute-only validation broke headerless browser
relative bases; it now preserves those bases while requiring absolute origins
for configured credentials. Focused regressions and the rebuilt browser tests
pass. Actual OS IME and editor latency acceptance remain NOT_RUN/UNRESOLVED as
previously stated. Receipts and screenshots are in the integration worktree's
`output/server-mcp-stage/chrome-products/` and `chrome-tiptap/`.

An actual Codex 0.165.0 process with `gpt-6.1-sol`, Medium, made four HTTP MCP
calls: schema read, document read, edit, and reread. No shell tool edited the
document. Unauthorized access returned 401. Separate SDK restart/undo/redo
checks preserved `_USER_PRESERVED`; an independent server-log rehydration found
both exact markers at sequence 4 without changing log bytes. This model run
predates the relative-browser compatibility fix and bounded-read integration;
those later paths have separate SDK and browser evidence. Direct authoritative
assertions were added to the reusable script after the model run and were not
exercised by a second paid model run. Safe receipts, original tool JSONL, setup
failures, and the independent rehydration are under
`output/server-mcp-stage/codex-hosted/`.

**Ownership and remaining work.** Runtime work used separate hosted-MCP,
Linux-journal, bounded-read, bot-check, and Linux-bot worktrees, then guarded
imports into `codex/roadmap-integration`. Independent reviews covered hosted
lifecycle/auth and bounded-read projection/resource safety. Existing WIP,
user tabs, previews, and previous evidence are preserved. The canonical group
ModelPath bug found during this work is a separate next lane; changing required
or maximum-child visibility to fix it is explicitly excluded. Domain work is
deferred at the user's request. No commit, push, registry publication, Pages
settings change, or deployment is part of this checkpoint. Rust remains the
fixed-preset private native experiment; these results do not add WASM editor
support or replace the previous source-bound native receipts.

### 5.97. Canonical stored-group ModelPath correction

A valid type change can retain an attribute that is invalid for the new type.
The canonical model uses that type's default and can merge adjacent groups;
edit paths previously grouped the raw values instead. A valid second child then
failed path resolution. The bounded correction shares the canonical attribute
normalization for stored-group addresses and inherited group insertion values.
It does not rewrite registers, IDs, wire order, History ownership, or the
existing required/maximum-child projection. The broad visibility experiment
was quarantined because it changed existing min/max output. Model-only minimum
fallbacks remain unsupported edit targets and can retain the earlier attribute
placement difference from applyEdits. Bounded reads retain their stricter
canonical/raw boundary guard.

The focused implementation checks pass 11/11, including 1,280 mixed edits and
144 concurrent/duplicate-delivery states. Independent adversarial checks pass
23/23, covering scalar/field/computed defaults, canonical addresses, anchors,
hidden/minimum children, movement, unchanged snapshots, foreign writes and
actor undo/redo. Root integration `npm test` passes **1,065 total: 1,063 PASS,
two platform SKIPs, zero FAIL**: library 748, Core 53, Slate 4, Lexical 4, bot 51,
demo 64, docs 28, MCP 113 (111 PASS, two SKIPs). Typecheck and comparison 33/33
pass. Seven rebuilt isolated tarball consumers pass. Fresh rebuilt Chrome again
passes all nine rich-profile/editor combinations and Tiptap's separate checks;
actual OS IME and product latency acceptance are not established.

An actual nonroot Linux rerun passes **966 total: 965 PASS, one platform SKIP,
zero FAIL**. It adds the 11 canonical-path cases to the previous scope. Image
`sha256:f5a8e0a3984e131e6b1c56c21e3255d22f2f9f1cffb6e793a1aa92e3f3f8abba`
retains the same local-overlay/no-host-mount/network-none boundary. Receipts are
in `output/server-mcp-stage/linux-canonical/`. The task's own Colima profile was
stopped after these tests; other profiles and the global Docker context were
preserved.

Eight fresh native Rust differential suites pass against the actual packaged
Core. Their 401 common before/after/live input hashes match. They compare 4,735
states, 707 independently generated inverse pairs, 247,736 recorded requests,
39 coupled restores, and all 5,666 movement endpoints without omissions. Three
gzip traces pass hashes, lengths, and record checks. All 98 original artifacts
(410,783,170 bytes) and prior receipts remain unchanged. The supported grouping
supplement adds five exact states and ten capture/resolve pairs. The exact
multi-type attribute-domain fixture passes TypeScript but is rejected as an
unsupported native manifest; its Rust parity is NOT_RUN. No Rust source/binary,
SDK authoring build, WASM, live editor backend, or dynamic schema support was
added. Audit: `output/server-mcp-stage/canonical-rust/current-canonical-rust-audit.json`,
SHA-256 `0c5ff7b62b2f6d6094b514c6ca5d47261bd93d183dd627e4d2dc519e7b750ca8`.

A fresh real Codex HTTP proof also passes on the final read/canonical code:
`get_schema -> read_document_slice -> edit_document -> read_document_slice`.
The configured model is gpt-6.1-sol Medium; CLI 0.165.0, Node 24.22.1, SDK 1.32.2.
All four model calls return 200; unauthorized access returns 401 and authenticated
GET returns 405. No shell tool edits the document. After service restart, SDK
undo and redo preserve `_USER_PRESERVED`; direct authoritative server assertions
pass at the model result and sequences 3 and 4. The reusable script's
`DOC_SYNC_CODEX_SLICE=1` mode preserves its full-read default. All 148 recorded
source/compiled inputs stay unchanged and match main after the guarded import.
This closes the earlier script assertion gap without claiming browser/model
coexecution. Safe evidence is under `output/server-mcp-stage/codex-bounded/`.

The guarded main imports preserve the original 503-file WIP baseline and all
40 tracked deletions. The first 70-file import, separate three-file path import,
and proof-script import have before-files and manifests. Main remains based on
3bbb4651a497494339c15f6984ceafb8410d8fe3 without a commit or push. Docs preview
5415 was restarted with the existing source and polling; its new hosted/read
sidebar links and bounded-read heading load in a fresh isolated Chrome session.

### 5.98. Full-document and bounded-read workload measurements

The reproducible `benchmarks/bounded-ai-reads.mjs` compares full `Doc.toJSON`
plus JSON serialization with selected-child reads on matching restored replicas.
There are four workloads, one first observation per mode, and 21 alternating
warm samples per mode: 176 observations. All 88 bounded results match their
selected-child full-model oracle. Snapshot digests and Core source/dist hashes
remain exact; an oversized single child rejects before projection or toJSON.
The report and raw receipt are in
`benchmarks/results/bounded-ai-reads-2026-11-02/`.

On Node 24.22.1, macOS arm64, Apple M3 Max, the 100,000 one-character paragraph
case records first model-plus-JSON 344.525 ms full versus 135.320 ms bounded;
warm medians 70.936 versus 0.484 ms, and p95 75.800 versus 0.520 ms. Full output
is 4,600,027 bytes; warm bounded output is 2,095 bytes for 20 children. The first
slice indexes 100,000 blocks; warm slices index zero, project 20 and call toJSON
zero times. Output scopes differ, so this is not an equivalent-output speedup
or an implementation before/after claim. For the rich retained-table path,
bounded warm model time is worse (3.315 versus 2.122 ms median) and scoped
pre-GC heap is larger (6.943 versus 3.855 MiB). Smaller output alone does not
prove less internal work. Heap deltas are not peak memory or total allocation.

These are local Core measurements, not MCP/network/model/editor latency or a
product SLO. Nested/global scans, first-read indexing, and the full roadmap-5
gate remain open. Previous H1 tail-latency limits stay UNRESOLVED. Domain work,
public deployment and publication remain deferred. The next B3 proposal work
runs separately, with document application disabled until its own gates pass.

### 5.99. Pending proposal HTTP/CLI foundation, without application

B3a adds opt-in `proposals.enabled` to the private hosted service. A creator
credential has read + proposal_create and cannot combine write, schema, or owner
capabilities. Separate same-principal owner grants have proposal_read and
proposal_decide. Creator POST stores one immutable version-1 replace_text
proposal; owner HTTP/CLI can list, inspect, or reject it. No accept endpoint,
proposal MCP adapter, planner integration, document application, or editor review
UI is implemented. Existing MCP meanings and default behavior are preserved.
Owner credentials must stay outside the planner. Static grants authorize a
configured action; they do not prove a real human reviewed it.

The supported target is one visible, unstyled text block physically stored in
MAIN. Nested, automatic/required, aliased, fragmented, marked, inline and span
targets are refused even when they have a nonnull model identity. Source length
is at most 16,384 UTF-16 units; selection and replacement at most 4,096 each.
Scalar boundaries and replacement line separators are checked. Preview is pure
string replacement, without Doc.edit, operation compilation, live clock
allocation, or applied History. Capture requires a matching authoritative
generation, epoch, sequence, and schema and rejects pending intent/checkpoint or
release work before upstream access. It holds the fixed actor claim and journal
guard but uses an anonymous upstream wire stream with no ACK, changes, presence,
recovery writes, or fixed-actor disconnect. Initial synchronization still
hydrates the upstream snapshot; bounded previews do not bound whole-document
transport or startup memory.

The separate private store binds physical origin/document/actor and principal.
It uses a permanent kernel lock inode, strict versioned schema and digests,
preview invariants, private bounded files, fsynced temporary writes, atomic
rename, and directory fsync. The same create UUID/content returns its prior
outcome before upstream access; differing content conflicts. Reject uses an
exact digest and decision UUID and is terminal. Quotas are 128 pending and 256
total records per namespace, without automatic deletion. Corrupt records are
refused and preserved. CLI inputs require private owned regular files and token
environment variables; owner inspect/reject never starts a document participant.
Body, record, and response limits are 256 KiB.

Independent review found two concrete issues before integration: using the fixed
actor on a temporary SSE connection could queue an unfenced disconnect that
would affect a later writer; owner GET requests also bypassed capacity admission.
Anonymous wire capture removes the actor-close path. All proposal methods now
share global/principal admission through response completion and store cleanup;
shutdown drains them, and late bodies cannot start storage or capture. These
fixes retain the original endpoint/role boundaries. The final independent
suite passes 14/14, including protected history, controlled-clock lease expiry,
real demo GC, restored undo/redo, delayed anonymous socket closure after writer
reconnect, synthetic target refusals, pending-journal preservation, retarget and
principal isolation, busy actor, request limits, and shutdown races. Controlled
lease time is not two minutes of actual wall-clock waiting. Review evidence:
`output/server-mcp-stage/b3-review/`.

Worker checks pass focused 15/15 and changed integration 37/37. Fresh integrated
`npm test --ignore-scripts` passes **1,080 total: 1,078 PASS, two platform SKIPs,
zero FAIL**. Counts: library 748, Core 53, Slate 4, Lexical 4, bot 52, demo 64,
docs 28, MCP 127 (125 PASS, two SKIPs). This direct workspace run reuses the
already built, unchanged public package artifacts rather than deleting them
during tests. Root and main typecheck pass. No Core/binding/package-lock bytes
changed for B3a; the preceding seven-consumer, Chrome, Rust and performance
receipts remain scoped to those same component bytes.

Actual unprivileged Linux tests pass **981 total: 980 PASS, one platform SKIP,
zero FAIL**: MCP 127, bot 52, product startup 1, Core 53, library 748. New store
SIGKILL/permanent-lock/restart, route capture, dirty-journal, owner/admission and
no-document-mutation cases pass with UID 1000, no host mounts and network none.
Image ID: `sha256:72a44945bc409bf837049a9dc1e7f50b80c9443e012547fa9e4b96356a30b7de`.
Receipts, source hashes, runtime/container inspection and logs are under
`output/server-mcp-stage/linux-proposals/`. Physical power loss, exhaustive
fsync/rename failure windows, NFS and multi-host consistency remain unproven.

A final real gpt-6.1-sol Medium Codex HTTP regression passes on the new hosted
front door: schema -> bounded read -> edit -> bounded read. Unauthorized 401,
authenticated GET 405 and DELETE 200 are observed. SDK service-restart own
undo/redo and direct authoritative assertions preserve the separate user's
input. All 152 source/compiled hashes remain unchanged and match main after the
12-file guarded import. Proposals are disabled in this model run; it verifies
existing MCP behavior, not autonomous proposal creation. Safe evidence is in
`output/server-mcp-stage/codex-after-proposals/`.

The English guide `/ai/proposals.html` documents configuration, separate grants,
base/target matching, busy actor behavior, JSON and CLI usage, limits and future
work. The B3 roadmap remains in progress. Next is explicit owner acceptance with
prepared-wire scope validation and exact durable decision/intent/receipt linkage;
no real proposal is accepted while the owner is absent. The source-backed plan
is `output/server-mcp-stage/b3-plan.md`. Domain/DNS/Pages changes, remote CI,
commit/push, public deployment and publication remain NOT_RUN/deferred.

Final documentation validation passes 28/28 tests and the static check for
**40 pages / 2,818 internal links**, English true and local paths excluded.
All Rust fenced programs across 15 guide pages retain their pre-edit hashes.
The task's temporary product/Tiptap servers and its own Colima VM were stopped;
existing user previews, user tabs, files and other VM profiles were preserved.
The owned documentation preview stays on port 5415. Final source/receipt hashes
and all integration manifests are indexed at
`output/checkpoints/server-mcp-roadmap.json`.

A final isolated Chrome read confirms the new proposal heading, sidebar link,
CLI guidance and explicit no-application scope. No page errors were reported;
`output/server-mcp-stage/docs-proposals.png` retains the screenshot. The final
main component check matches all 401 native input hashes and all 152 actual
Codex source/compiled hashes.

### 5.100. Explicit owner approval, application, and exact-attempt recovery

**Result and scope.** The private HTTP/CLI proposal path now supports explicit
owner acceptance and reconciliation. Both proposals.enabled and the new
proposals.acceptanceEnabled must be true; acceptance remains disabled by default.
The current route owner needs read + proposal_accept. Creator credentials cannot
hold approval, writer, schema, or owner decision permissions. Acceptance is not
an MCP planner tool. The owner sends only proposal ID, exact immutable digest,
and a new approval request UUID; request-supplied edits, base, actor, upstream,
and filesystem authority are refused. Scope remains one physically root-stored,
visible, unstyled text range. Structural operations, marks, nested/cell content,
aliases, derived automatic/required storage, and compiler promotion are refused.
No real user document or proposal was approved during implementation; tests use
isolated synthetic documents and explicit test-owner decisions.

**Durable flow.** The proposal's B3a immutable payload and preview policy remain
unchanged. A separate acceptance policy fingerprint binds the owner decision.
The kernel-serialized store durably records the decision/attempt before sending.
A server-owned Session authorizer validates the detached pre-edit snapshot,
exact base/schema/generation, model edits, deletion membership, insertion origin,
text, actor and ticket allocation before journal.prepare or transport. It rejects
non-text/delete operations and independently recompiles the approved edit.
Configuring this authorizer without a durable journal fails at construction,
before transport access; ordinary ephemeral sessions remain supported.

The existing journal prepares an exact JournalRecord. An immutable private bridge
links that record to physical origin/document/actor, principal, proposal, digest,
approval UUID/grant, and policy. The bridge and its metadata are synced before
conditional submission. Stored record JSON stays within 256 KiB; private bridge
records are capped at 16 MiB and lifetime entries at 256. No full snapshot or
wire-intent bridge is returned by proposal HTTP inspection. Same-decision retries
return or reconcile the existing attempt. Cross-proposal UUID reuse conflicts
before mutation, including after terminal outcomes. Accept/reject and two-host
accept races have one serialized winner. Rejection remains distinct from undo.

**Recovery and History.** On restart, an exact bridge, actor journal/checkpoint,
and current authorized route/grant are checked before participant startup. An
accepted server receipt is queried before joining, ACK, restoring History, or
replaying anything. Both a retained intent and an already-cleared intent with
matching protected checkpoint sourceIntentDigest can be reconciled. This path
restores the configured actor's History and marks the accepted attempt applied
without resubmission, even when another actor has since edited. Applied is a
historical receipt state and does not change after actor undo/redo. Two accepted
proposals create two non-typing History groups, not a mission-wide undo group.
The approving human editor's separate actor History is not used.

Unrelated ordinary pending changes, conditional intents, release work, missing
proof, corrupt evidence, unknown receipts, or incompatible protection remain
blocked with evidence preserved. Outstanding approved attempts block generic
MCP startup, new captures, and acceptance of another proposal for the actor.
This includes the checkpoint-cleared/status-not-saved window, so a later edit
cannot overwrite the first attempt's recovery tag. Inspection remains available.

**Important conservative limit.** Staleness found before session startup yields
terminal stale without sending a change. A foreign edit after the last base
check but before the conditional POST yields no document change, but the guarded
path retains its intent/bridge and can remain needs_attention, then unconfirmed
on repeated reconciliation, even after a definitive stale rejection. Durable
negative-receipt cleanup is not implemented. Missing bridge or pre-send unknown
outcomes are likewise not blindly regenerated or resent. This is safe blocking,
not universal automatic unblocking. A refreshed proposal requires a new create
UUID, matching new base, inspection, and a new owner approval.

**Verification.** Fresh macOS Node 24.22.1 workspace tests pass **1,110 total:
1,108 PASS, two platform SKIPs, zero FAIL**. Counts: library 748, Core 53, Slate 4,
Lexical 4, bot 53, demo 64, docs 28, MCP 156 (154 PASS, two SKIPs). Root direct
TypeScript checking passes. The current process suite passes 18/18 within the macOS workspace and final
Linux run; the independent reviewer first ran 17/17, then the three affected
scenarios after the final hardening. Cases include: approval response held after upstream acceptance, SIGKILL of
host and document server, exact recovery with a foreign edit, retained and cleared
journal paths, duplicate reconciliation, original actor undo/redo, two approval
groups, preapproval restart/stale, cross-process accept/accept and accept/reject,
revoked grants, missing/corrupt bridges, unrelated pending intent, and the
cross-proposal checkpoint-tag gap. The stale-submission race asserts only the
foreign edit remains and no retry is sent. Additional independent constructor
and terminal-UUID probes pass. Store/evidence regressions cover original-format
records, immutable proof/digests, private/symlink/hardlink/FIFO input, lifetime
quota, permission failure and no mutation on refused decisions.

The first actual Linux checkpoint passes **1,009 total: 1,008 PASS, one platform
SKIP, zero FAIL** before the final cached-outcome hardening. MCP 154 includes 17/17 process scenarios; bot 53, startup 1, Core 53,
and library 748 all pass. Tests use Node 24.22.1, UID 1000, local overlay storage,
network none, and no host mounts. All 1,774 in-image source hashes match the
frozen input manifest. Image:
sha256:b3a4c1cbc261480865e1f8378c27c258246344db10908a88347abd0fff9ab73e.
Logs, image/container/private-permission checks and hashes are in
output/proposal-acceptance/linux/. Power loss, NFS, multi-host storage consistency,
and exhaustive physical fsync/rename failure windows remain NOT_RUN. Two hosted
processes against the same local store are tested; that is not multi-host storage.

Final review found that the application fast path returned cached applied/stale
records without the store's durability recheck. It now calls the exact idempotent
beginAccept path, which syncs the record and namespace before success. Real
file/directory sync-fault probes return 503 with zero upstream access and exact
proposal/journal/checkpoint/bridge bytes preserved. Clearing the injected fault
returns the same applied result without another conditional request. This tests
an I/O acknowledgement boundary, not physical power loss.

The final Linux image is
sha256:fadabb8ae3c912dfb7dae48ed67f856f5a44e8ad01210ca906377ac09364a7bc.
Fresh MCP tests pass **156 total: 155 PASS, one platform SKIP, zero FAIL**, including
18/18 real-process cases. Bot 53, startup 1, Core 53 and library 748 results are
reused only after component-source equality checks; the combined selected scope
is **1,011 total: 1,010 PASS, one SKIP, zero FAIL**. The receipt explicitly marks
these reused suites. All 1,774 image inputs and the final 26-file candidate delta
match. Final logs, inspection, hashes and qualification are in
output/proposal-acceptance/linux-final/; the first checkpoint remains unchanged.


All 166 public-package source/config/test files and the package lock remain
unchanged. No CRDT, ordering, schema, wire, editor, or Rust engine rule changed.
Prior browser/Rust/package/performance receipts keep their earlier scopes; they
were not rerun as approval UI or actual-model approval evidence. There is no
editor approval UI or actual Codex approval run in this task. Source work used
separate store/evidence and apply/session/CLI owners plus independent process
review in codex/proposal-acceptance; initial inherited WIP was mirrored and
preserved. A shared pretypecheck build briefly removed generated modules during
a focused test; the build completed and affected tests were rerun successfully.
A docs command initially used unsupported Node 18; the Node 24 check passed.
Those setup failures do not represent CRDT faults. Independent tests also found
and corrected nested store acquisition, response-status mapping, and the
checkpoint-tag overwrite gap before integration.

English documentation describes the feature flags, separate owner grants,
accept/reconcile CLI and HTTP bodies, current states, History ownership, limits,
and safe blocked outcomes. B3 remains in progress: planner integration, editor
review, general structural authorization and broader operational gates remain.
No commit, push, deployment, domain change or package publication was requested
or performed. Final source/receipt indexing is
output/checkpoints/proposal-acceptance.json.

Final documentation checks pass **28/28**, **40 pages / 2,824 internal links**,
English true and local paths excluded. The sidebar now names Proposals and owner
approval. All Rust fenced programs retain their previous bytes. The task-owned
Linux VM was stopped after qualification; user previews, files, worktrees, tabs,
and other VM profiles were preserved. Source integration is hash-guarded against
the inherited WIP baseline, with before-files and all evidence retained under
output/proposal-acceptance/.


### 5.101 Conditional rejection settlement and safe approval cleanup

**Scope.** This checkpoint closes the B3 owner-approval submission race described
in section 5.100. A stale response or absent receipt is still insufficient to
clear pending work. B3 remains in progress; this adds no planner integration,
editor approval UI, structural approval, domain configuration, or publication.

The document server exposes `POST /settle-conditional` with the original
`{generation, base, change}` and protocol header. It serializes settlement with
submission. An exact accepted conditional request returns its accepted receipt;
an already accepted body under another base remains unknown. Otherwise the
server persists a generation-bound seal before returning `not_applied`, with
SHA-256 request/body digests and a stable seal ID. Missing documents are not
created. Missing/corrupt storage, incompatible generations, capacity exhaustion,
and uncertain I/O return unknown. Every negative response, including cached and
replayed outcomes, verifies the source and syncs the log and directory again.

Seals do not alter document text, document server sequence, actor sequence,
schema, or History. Conditional, ordinary, and recovery submission cannot apply
the same sealed change body. Replay validates seals; GC and recovery-log
compaction retain them. At most 4,096 active body identities are held in memory.
A later accepted actor sequence safely retires obsolete active entries; existing
document-log retention remains unchanged. The endpoint shares the document
upstream's existing private-network/authorization boundary.

Hosted approval reconciliation requires the original decision UUID, digest,
owner grant, private bridge, and matching checkpoint. It rechecks generation,
schema, sequence, and the original existing protection reservation. It then
persists a private negative-proof/retirement plan, records its digest, rewrites
the exact retired checkpoint, and clears only the matching intent before
recording terminal `not_applied`. The plan permits only the expected before/after
checkpoint digests, survives interruption, and reruns file/directory durability
barriers after an I/O failure. Unknown outcomes and unrelated or invalid recovery
state remain blocked. Terminal retries also recheck store durability.

Retirement preserves snapshot content, actor sequence, confirmed History,
protection ID, and the previous source-intent tag. It advances only the local
Lamport allocation watermark past the rejected operation IDs. Same-epoch hello
snapshot adoption now preserves that watermark; different-epoch reset rules
remain unchanged. This prevents the next legitimate same-actor edit from reusing
retired IDs. No text ordering, ownership, schema projection, or CRDT undo rule
changes. A stale or not-applied proposal must be recreated and separately
approved; no automatic refresh or resend occurs.


**Verification.** Fresh macOS Node 24.22.1 full-workspace tests pass **1,144 total:
1,142 PASS, two platform SKIPs, zero FAIL**. Counts: library 748, Core 62, Slate 4,
Lexical 4, bot 53, demo 68, docs 28, MCP 177 (175 PASS, two SKIPs). Root direct
TypeScript checking and package build pass. The 31 real proposal process cases
are included in the workspace run, not added again to its total. The independent
process reviewer also passed all 31 before the final input-validation hardening;
the final full workspace covers them again with that hardening.

Tests cover the late foreign-edit race, an accepted response lost after upstream
commit, delayed conditional/rebased/ordinary/recovery submissions, GC, reservation
compaction, host SIGKILL at four cleanup stages, server restart, retained and new
actor History, foreign-text preservation, duplicate decisions, unexpected valid
checkpoint digests, changed generation, unknown outcomes, and actual
FileHandle.sync EIO at server and private plan/checkpoint barriers. Repeated
faults keep the intent; clearing the fault allows exact cleanup without replay.

Independent review found that hello adoption could discard the retired clock
watermark. A stronger next-proposal test exposed overlapping IDs despite a saved
checkpoint, and now proves all fresh IDs exceed the retired watermark. Full
regression then found fence hashing before Doc.check could execute a rejected
join accessor. Hashing now occurs only after original validation, ownership
copying, and revalidation. No hash work occurs when no active seal exists. The
original security regression now passes with zero getter calls and unchanged
document/sequence. The first macOS/Linux logs retain the failure; final logs
refer to the corrected source. An initial Node 18 direct-test invocation was a
setup error; all reported results use Node 24.22.1.

No fresh Chrome approval UI, actual-model approval, Rust/native/WASM, package
consumer, or performance result is claimed here. Their previous receipts keep
their original scope. Power loss, arbitrary filesystem rollback, NFS, and
multi-host consistency remain NOT_RUN. Linux lock tests require /usr/bin/flock.
No CRDT model/History operation rule or editor binding source changed; the
TypeScript client allocation watermark, server control path, and Node adapter
are part of this checkpoint and are freshly tested above.


Fresh unprivileged Linux Node 24.22.1 tests pass **1,108 total: 1,107 PASS,
one platform SKIP, zero FAIL**: Core 62, library 748, MCP 177 (176 PASS, one SKIP),
demo 68, bot 53. All suites are fresh; no earlier suite is reused in this total.
The process tests are included in MCP. UID is 1000, network is none, storage is
container-local overlay/tmp, and there are no host mounts. All 344 frozen runtime
source inputs match the image. Final image:
sha256:e524d9d59163f7b2668a1b77c3def2c89b0418234a01a6c3c687d5b49633d380.
Logs, source hashes, image/container inspection, and per-suite counts are under
output/rejection-recovery/linux-final/. The initial failed checkpoint remains
under output/rejection-recovery/linux/; it is not the final qualification.

English proposal guides, hosted/bot/MCP READMEs, status, and the B3 roadmap now
explain not_applied, original-decision reconciliation, server support, protection,
private quotas, and fail-closed outcomes. Documentation tests pass 28/28; the
production site build and English/link checks pass with 40 pages and 2,824
internal links. Source work used separate server/adapter and private-retirement
owners with an independent High process/safety reviewer in
codex/rejection-recovery. Existing files and 40 inherited legacy deletions were
preserved. Only the reviewed task delta is integrated into the main worktree;
source hashes and the before/final archives are indexed under
output/checkpoints/rejection-recovery.json. B3 remains in progress. No commit,
push, deployment, domain change, or package publication was requested or performed.


### 5.102 Final main review and Rust SDK/WASM usage

**Scope.** Review and retain all existing uncommitted work, improve SDK and
engine documentation, correct final-review blockers, and publish the tested
source to main. Six npm packages remain private at version 0.0.0; the native
Cargo crates remain unpublished. No domain or registry-release work is included.
The main commit that adds this section is the source checkpoint; use Git history
to resolve its SHA. The final push/CI receipts are local under
output/final-main-push/ and output/checkpoints/final-main-push.json.

**Documentation.** The Rust guide now gives an external Cargo path-dependency
quickstart and complete selection/checkpoint/retry/exact-prefix-acknowledgement/
undo/redo recipe. Both programs were compiled and run as separate Cargo consumers.
The storage-only WASM section gives its actual raw-module build, Node ESM
loading/init/splice/read/clear program, browser fetch/import example, ABI check,
UTF-16 limits, shared-slot exclusivity, copies, and resource lifetime. README,
package/editor/getting-started guides, experiment READMEs, and sidebar links make
these paths discoverable. The Node WASM recipe was actually run; the browser
recipe is source-checked and links the existing harness, not a fresh Chrome result.

The supported editor/client path remains TypeScript. Existing SyncClient and
bindings use Doc; there is no engine:'wasm' or engine:'rust' selector. The draft
typescriptEngine factory and shared EditorHost seam are distinct from a full
client backend migration. The native SDK supports six fixed schema presets;
runtime arbitrary Rust schemas, live transitions, full doc.edit compilation,
Rust editor/network/Node/MCP adapters, and a full WASM CRDT SDK remain open.
The WASM storage wrapper is not that missing engine. These are explicit limits,
not hidden setup steps or promised working configuration.

**Final-review correction.** Independent review reproduced a cached-decision
I/O bug: create/reject save could rename successfully, fail directory sync,
then acknowledge a matching retry without another durability barrier. Cached
create and reject now call the existing file/directory confirmDurable path.
The HTTP create fast path reuses store.create(existing.payload) after exact
request equality, without recapturing the document or accessing upstream.
Storage uncertainty returns 503; 400/404/409/429 meanings remain intact. New
real FileHandle.sync tests hold file/directory EIO across retries and verify no
false success, file-byte/inode rewrite, upstream request, or changed-decision
acceptance. Clearing the fault returns the exact stored outcome. Focused store,
route, and new durability tests pass 17/17; full MCP tests include those cases.
Independent review found no unresolved actionable blocker after this fix.

**Fresh macOS verification.** Node 24.22.1 workspace tests: **1,148 total,
1,146 PASS, two platform SKIPs, zero FAIL**. Library 748, Core 62, Slate 4,
Lexical 4, bot 53, demo 68, docs 28, MCP 181 (179 PASS, two SKIPs). Comparison
demo tests separately pass **33/33**. Root package build and direct TypeScript
checking pass. All six real tarballs pass **seven isolated consumers**, including
runtime/types, peer isolation, stale/orphan prepack cleanup, Host/history,
compatibility imports, and an independent Slate patch under the unchanged
facade. No npm publication occurred. Package checks completed before the full
test run so generated modules were not removed while tests used them.

**Fresh Linux verification.** Current MCP tests pass **181 total: 180 PASS,
one platform SKIP, zero FAIL** using Node 24.22.1, UID 1000, network none, local
container storage, and no host mounts. All 345 frozen runtime inputs match the
image. Relative to §5.101, runtime changes are only proposal-store.ts,
proposal-routes.ts, and the added cached-durability test. This is a fresh MCP
scope, not a new full-Linux-suite aggregate. Image, source manifests, logs and
container inspection are under output/final-main-push/linux/. The task-owned
Colima profile is stopped after qualification; other profiles are preserved.

**Fresh native/storage verification.** Stable Rust/Cargo 1.86.0: SDK 14 tests,
semantic core 75, storage 13, formatting, Clippy, native build, raw wasm32 build,
and two_actors all pass. The SDK/TypeScript check passes **20 actions / 40 actor
states**, comparing exact operations, UTF-16 models, History availability, and
pending queues. JS Gap passes 4,062 checks; native splice/string comparison
passes 265 operations; WASM storage, checksum and same-algorithm Gap suites pass
their independent oracle checks. Initial Clippy failure was a Homebrew1.87 vs
stable1.86 routing mismatch; selecting the stable bin path fixes it without
source changes or target cleanup. Commands, versions, source/runtime hashes,
isolated target locations and path-only harness adaptations are recorded in
output/final-push-rust/SUMMARY.md and its receipts. Old targets were preserved.

Eight broad native differential harnesses were inspected but not rerun. No fresh
Chrome, live Rust editor/server/MCP, full WASM CRDT, or engine-switch proof is
claimed. Storage timing is not a product performance acceptance result. Physical
power loss, arbitrary filesystem rollback, NFS and multi-host consistency remain
NOT_RUN. Earlier browser/native/full-Linux receipts keep their exact old scope.
All current public documentation remains English; production build/link checks
cover 40 pages and 2,919 internal links. There is no npm/Cargo release or domain
change in this checkpoint. GitHub Pages and MCP CI outcomes must be read from
the final pushed SHA's separate receipts, not inferred from local tests.


Final staging found one trailing space and three extra EOF blank lines in
inherited new files. Only those bytes were removed. All 132 generated package
JavaScript/declaration hashes remain identical after rebuild; private MCP code
and Rust .rs/.toml inputs are unchanged. The full workspace/consumer results
above are qualified by those identical execution inputs rather than rerun for
formatting. The changed WASM workload and SDK comparison were rechecked against
current source hashes: checksum 1,000 rounds/seven samples, JS Gap 4,062 checks,
storage/Gap correctness smoke, and SDK 20 actions/40 states pass. Earlier full
storage/Gap receipts keep their unchanged workload inputs. Final staged
whitespace checks pass. See output/final-push-rust/final-recheck/receipt.json
and output/final-main-push/whitespace-qualification.json.


### 5.103 Rust/WASM delivery planning

Planning only. The SDK/runtime implementation checkpoint remains dd0c4a1,
whose Pages and MCP workflows completed successfully (41375285141 and
41375285155). Final push receipts are in output/checkpoints/final-main-push.json.
No new Rust, WASM, client or binding implementation is established by this plan.

The canonical ordered queue is docs/rust-roadmap.md, Delivery goal and ordered
work; the site summary is guide/rust.md, Ordered delivery work. D1 is the next
implementation task: complete real client/engine/host callable ports and route
an existing binding through the selected TypeScript engine, preserving legacy
TS APIs and incremental performance. A factory-only change is insufficient.
D2 is runtime schemas; D3 the editing compiler; D4 sessions, events, recovery,
GC and compatible schema transitions; D5 the complete native SDK; D6 a full
CRDT WASM package; D7 unchanged bindings with selected mixed TS/WASM clients;
D8 separate package/product qualification. Optional D9 creates a new server
engine seam for native Rust; it is not required for the WASM client.

Backend selection is at instance creation. Live engine hot swap, cross-engine
checkpoint conversion, incompatible schema migration and automatic production
replacement remain separate work. A text-only early browser prototype is
allowed after the ports settle, with other capabilities blocked and no full
schema/recovery claim. The native SDK and WASM delivery lanes share the semantic
kernel but can ship independently. The prototype factory's per-mutation full
snapshot copy must not enter the production keystroke path.

Two independent source/planning lanes supplied file/line facts and dependency
critique. The plan corrects dependencies so D7 does not require the D5 native
SDK release, and D8 makes independent native/WASM go/no-go decisions. Source
plans are in .omx/plans/rust-wasm-delivery-roadmap.md and the linked analysis
artifacts. Existing R1–R6 receipts remain historical evidence; numbered plans
are not new PASS results. Only documentation verification is rerun here.


Planning documentation verification passes 28/28 tests, the production site
build, and 40-page/2,921-link English checks. No engine/runtime files changed.
This documentation continues the authorized main publication task; its commit
is separate from the dd0c4a1 runtime changes. Publication receipts are recorded
under output/checkpoints/rust-wasm-roadmap.json rather than inferred from these
local checks.


### 5.104 Selected TypeScript client engine

D1 connects the production SyncClient, input sessions and editor host to a
selected ClientEngineFactory. TypeScript is the default and the only delivered
production engine. This does not enable Rust/WASM clients or engine hot swap.

The production contract is client-contract.ts; typescript-client.ts owns the
live Doc and History. The older immutable DocumentEngine is a separate
experiment. Portable bindings call the selected port. Legacy Doc/History access
returns the authoritative TS objects through an optional compatibility extension.
A synthetic Doc-based application facade uses an explicitly named TS adapter;
it is not the normal selected-engine path.

Apply compiles and mutates; client.commit records and queues once. InputSession
publishes its retained operations and passes those same applied objects to one
combined commit. This retains
History's prior-state identities, actor ownership and foreign writes. Snapshot
preparation/replay, conditional edits, model events, GC and compatible schema
changes also use the selected engine. Unsupported factories fail before connect.

Format-1 checkpoint APIs retain the legacy TS envelope. New captureState and
restoreState use format 2 with one opaque, tagged engine checkpoint plus transport
metadata. Restore requires a matching engine, actor, schema, contract version and
external epoch/GC proof. LiveRecovery and the Node journal remain format-1 TS
adapters; portable durable recovery is still D4 work. Disconnect keeps local
state; disposal rejects protected work, unknown conditional work and undo/redo
History.

Performance review found and corrected repeated parent-path scans and duplicate
anchor resolution. Common text edits and plain root text split/merge use bounded
validation. Complex structural edits retain detached preflight. The initial
legacy guard runs before that proof. Guards must act as assertions; arbitrary
side effects in later emit guards do not form a rollback transaction. A copied
DTO visit cap was removed so a valid large marked snapshot can still restore.

Final frozen source passes 1,199 full-workspace cases on macOS: 1,197 PASS,
two platform SKIPs, zero FAIL, with FUZZ_SEEDS=3000 and PM_SEEDS=300. Counts are
751 library, 110 Core, four Lexical Host, four Slate Host, 53 bot, 68 demo,
28 documentation and 181 MCP (179 PASS/two SKIP). Type checking, comparison demo
33/33 and six-package/seven-consumer checks pass. An independent final source
review found no further blocker; it is not browser or performance proof.

Chrome 156.0.8078.74 passes nine rich-profile combinations for trusted native
Unicode input, foreign edits, actor-owned undo/redo, forward/backward selections
and same-mounted-editor reconnect. An additional nine combinations pass native
Enter/Backspace, exact split/merge model and caret restoration. Real selected
apply/session/record/receive/history calls are asserted. Tiptap passes default
and explicit TS selection, input, selection, undo/redo, reconnect and remount;
an unsupported selector fails before editor mount. Normal paths have zero
console/page errors. Actual OS IME remains NOT_RUN.

A vanished task-owned product server caused an initial connection refusal.
Its failed infrastructure receipt is retained separately; only the complete
retry against the restarted owned server is a functional PASS. Lexical handles
Enter at keydown, so the structural browser helper asserts trusted native keys
and exact effects while retaining beforeinput observations; it does not require
a beforeinput event that Lexical suppresses.

The original 20 size/scenario count cells and eight additional local PM split/
join records match baseline model, wire-operation, History and conversion counts.
The receive path now validates and owns the batch before scoped reads, then
applies that same proof once. Stale event captures reject before mutation.
Deletion keys come from the applied owned batch, so source mutation cannot
corrupt the transport ledger. Seven additional regressions cover this boundary.
The fixed Node runs retain all original guard crossings. No identical median
guard persists across both final full runs. Supplementary 32-pair mark checks
are within the median/p95 guards; remote8 median 2.267→2.353 ms is within its
0.227 ms guard, while p95 3.751→5.595 ms remains reported.

Original separate-server Chrome comparison retains 12/27 flagged source/target
cells. A no-Proxy diagnostic also flags 12 cells in different directions, so
Proxy overhead alone does not explain them. Same-Chrome paired stage timestamps
locate the investigated extra intervals before receive or after DOM, not in a
persistent synchronous commit/receive cost. A fresh shared unchanged baseline
backend with symmetric proxy origins resolves the tested median increases.
Focused Notion PM 64-pair comparison gives local rendering-opportunity median
10.0→10.1 ms and p95 17.9→18.8 ms (rank 61 of 64), within the original 2/4 ms guards.
DOM median is 4.1→4.1 ms and p95 is 5.0→5.5 ms. Commit median is 0.3→0.3 ms
and p95 is 0.5→0.5 ms. No overlapping LongTask/LongAnimationFrame entry was
recorded in 128 intervals; this does not
rule out shorter work or prove a scheduler/GC/network cause.

The final Node remote8 investigation uses four independent 32-pair blocks with
fixture/prelude resets. Pooled median is 2.164→2.263 ms within its 0.216 ms guard;
p95 rank 122 of 128 is 3.681→3.663 ms within its 0.552 ms guard. All four block
medians pass; two block p95 crossings remain recorded. Observed GC overlaps
associate with many tails but do not prove a cause.

All 12 original Chrome flagged cells now have exact common-backend controlled
coverage, with no persistent crossing under those conditions. Focused Notion
Slate 64-pair DOM p95 is 60.9→61.8 ms for Lexical and 65.5→66.1 ms for PM,
within their guards. Source commit median is 0.3 ms in both versions. Original
separate-server scores and the changed control topology remain explicit.

Routing/regression/count gates pass. Repeated/pooled Node and controlled Chrome
results qualify the investigated client migration.
General separate-server Chrome latency acceptance remains OPEN. The original
12 flags are not rewritten as PASS and global product latency is not qualified.
Full conditions, original values and limits are in
benchmarks/results/client-engine-selection/report.md. Receipts are under
output/d1-engine-selection in the baseline and isolated candidate worktrees.


A separate array-storage investigation addresses the JS linked-list hypothesis.
Current TS sequences use Item arrays plus an independent logical-ID index;
origin is CRDT ancestry, not a next pointer. Node24/V8 diagnostics of an actual
100k Doc before/after middle insertion show packed object elements, no holes and
no dictionary elements. Chrome156 synthetic 10k/100k/1m arrays separate direct
indexing, indexOf, middle splice and a hand-built list traversal. Direct random
read medians are 1.6/1.8/8.4 ns (batch-derived); indexOf medians are
439/3,809/39,063 ns. These are different operations and not editor latency.
Splice results are non-monotonic; no scaling or storage-replacement acceptance
is inferred. Chrome internal element kinds and exact Chrome-source revision
were not inspected. See benchmarks/results/array-storage-investigation/report.md
and ignored output/array-storage-investigation for raw samples, sources, Node
kind checks and the Korean report. No production storage change was made.


The reviewed D1 source was first integrated into main as an uncommitted
checkpoint. Section 5.105 records the publication follow-up.
The isolated codex/d1-engine-selection worktree is retained. Transfer required a
clean main at dafe2c762a205f4570e3e9cbefc008befd5b866c and verified every copied
source file. Original generated baseline artifacts and overwritten source files
are preserved under output/d1-engine-selection/integration.

Fresh main checks pass six package tarballs/seven consumers, workspace typecheck,
28 selected-engine routing/staged-receive/real-binding cases, 28 documentation
tests, production documentation build and 40-page/2,928-internal-link English
checks. The full 1,199-case enhanced-fuzz run and Chrome checks were executed in
the isolated candidate. All 70 main runtime JavaScript files are byte-identical
to those tested inputs. Of 140 generated files, 139 are byte-identical; one
client-contract declaration differs only in final JSDoc comments, with unchanged
type signatures. Fresh main consumers use the final declarations. These facts
qualify the full candidate results rather than relabel a focused main rerun as
a fresh full main suite.

Runtime and public-API source reviews found no remaining blocker. A documentation
review caught an overly broad performance summary; it was corrected to retain
original end-to-end/block-tail limits and the exact controlled evidence scopes.
Final receipts are output/d1-engine-selection/integration/final-verification.json,
receive-final-tests/receipt.json and after/receive-final-status.json. The original
baseline source is recoverable from its Git SHA; generated baseline files are
archived before main rebuild. Do not rerun an old baseline helper against the
now-modified main tree without restoring that baseline first.

The implementation checkpoint did not commit, push, release or deploy D1. Task-owned
browser sessions, proxy servers, baseline/candidate demo servers and their
children were closed; existing user tabs/services and all temporary evidence
were preserved. Actual OS IME and physical display latency remain outside this
checkpoint.


### 5.105 Final D1 review and main publication

This checkpoint publishes the reviewed D1 implementation, regressions, demo
routing, English guides and array-storage investigation on main as one cohesive
change. It does not publish npm or Cargo packages or change the site domain.

Before publication, all 37 changed source files and all 140 generated files
matched the final main verification receipt. All 70 JavaScript inputs remain
identical to the tested implementation. A separate read-only review checked
staged receive, deletion-ledger ownership, session/History publication, legacy
compatibility, checkpoints and public API examples and found no new blocker.
Only this publication record changes after that source/hash check; no runtime,
test, schema, package manifest or browser workload is changed.

The enhanced full-workspace result remains 1,199 cases: 1,197 PASS, two platform
SKIPs, zero FAIL, with FUZZ_SEEDS=3000 and PM_SEEDS=300. That run was executed in
the isolated candidate and qualified to main by identical runtime inputs. Fresh
main routing/staged-receive/binding 28/28, documentation 28/28, type checking,
six-package/seven-consumer verification and the 40-page/2,928-link English build
retain their exact scopes. The publication preflight repeats the focused and
documentation checks; it does not relabel them as a new full-workspace run.

Controlled client timing covers all 12 original Chrome flagged cells and the
pooled 128-pair Node remote8 check. The original separate-server 12/27 flags and
two of four small-block Node p95 flags remain in the reports. General product
latency acceptance stays OPEN. Chrome functionality, OS IME, physical display,
TypeScript-only backend selection and future Rust/WASM work keep the scope in
section 5.104. No new Chrome or Rust runtime result is claimed by this commit.

Publication follows the normal GitHub Pages and MCP durable-recovery workflows:
[documentation](https://github.com/barocss/doc-sync/actions/workflows/docs-pages.yml)
and [MCP recovery](https://github.com/barocss/doc-sync/actions/workflows/mcp-durable-recovery.yml).
The exact final commit, remote ref, workflow runs, deployment result and public
HTTP byte checks are recorded separately in
output/checkpoints/d1-main-push.json and output/d1-final-publication. Local
preflight PASS alone does not establish a successful push or deployment.

### 5.106 Memory-only LocalClient and documentation categories

The new `@barocss/doc-sync-core/local` entry exports `LocalClient`,
`LocalEditorHost` and `createLocalEditorHost`. It owns the production TypeScript
client engine directly, without a transport, SyncClient, presence service or
server. No new package is introduced. Models are borrowed immutable views;
convenience edits apply and record once. Native adapters use complete, ordered
apply/commit batches. Cloned, partial, reordered, duplicate or foreign batches
are rejected. Per-view origins prevent self-echo; each mounted native view needs
its own host even when several hosts share one local client.

Selections use identity anchors and UTF-16 offsets. Engine-created composition
drafts reserve clocks, keep external live edits and publish original owned
operations once. Recorded segments form one History group; null-record segments
remain outside History, including mixed sessions. Cancel keeps live edits.
Session cleanup is safe after client disposal. Observer errors remain visible in
a bounded message-only log without reversing accepted edits; synchronous
observer mutation is rejected. The local cause is additive to the editor type
contract and does not change server wire events.

The guide documents setup, native binding use, selections, apply/commit,
composition, notifications and lifecycle. The textarea example computes one
changed UTF-16 interval, preserves unchanged identities, and is executed against
the public Core entry. It is one plain paragraph, not a full structured browser
adapter. Local state remains memory-only: persistence, refresh/restart recovery,
local schema transitions, synchronized-session conversion and Rust/WASM local
engines are open. The current Tiptap extension still requires SyncClient.
L1–L4 in the site roadmap record this separate local delivery lane.

Documentation now has exactly four primary categories: Guide, Editor
integrations, AI & bots, and Reference. ProseMirror, Tiptap, Slate, Lexical,
custom-editor and runnable examples share the editor category. Status is removed
from primary navigation; its existing URL and heading anchor remain available
as Verification and limits under Reference. Existing published guide URLs remain
unchanged. A real Chrome check found that VitePress's slash-depth sort chose the
root Guide fallback before same-depth Reference pages. Moving the root fallback
last fixes status, roadmap and performance. Regression tests use the installed
VitePress sidebar resolver and active helper, including every sidebar destination.

Validation was performed in the isolated `codex/local-client` worktree based on
main `12da94d527d4a9edcca7d0a5752f73ea615f6459`, using Node 24.22.1 on macOS:

- Full default-fuzz workspace run: 1,226 cases, 1,224 PASS, two platform SKIPs,
  zero FAIL. Groups: library 755, Core 130, Lexical 4, Slate 4, bot 53, demo 68,
  docs 31 and MCP 181. This uses default 500 fuzz seeds, not the previous
  enhanced 3,000-seed D1 run.
- Later focused Core run: 136/136 PASS, including six added rich-profile cases
  for Word, Notion and presentation. They cover structural edits, attributes,
  exact undo/redo, merged hidden cells and preserved independent unrecorded edits.
- Actual headless PM/Slate/Lexical local-binding run: 4/4 PASS. Native changes,
  external edits, selection, History, multi-apply commit and draft/live editing
  are covered. These four tests are also included in the workspace library group.
- Final docs: 34/34 PASS; typecheck PASS; six package tarballs/seven isolated
  consumers PASS. The Core-only consumer disables fetch and checks local
  editing/history with zero network calls and without editor dependencies.
- Production docs build and English/link checks PASS: 42 pages. The final link
  count and main integration hashes are recorded in the integration receipt.
- Chrome 156 documentation checks: 14 desktop routes with correct primary and
  sidebar category; 390px main/sidebar menus; AI category navigation; local
  search-result navigation; no page or console errors or document overflow.
  This is documentation UI proof, not Local browser/OS IME acceptance.

One docs run overlapped a package rebuild and failed with missing generated
Core modules. The log is retained. Repeating after the build, and again after
navigation correction, passes all documentation cases. The npm install cache
permission failure was bypassed with a task-local cache; user cache ownership
was not changed. No test failure was hidden by changing assertions or budgets.

Performance uses the same frozen baseline, real offline Sync editor host and
Local host, at 10k and 100k UTF-16 units. All 48 count cells match model/operation
hashes and conversion counts. Ordinary input adds no snapshot or conversion;
existing whole-model/native conversion costs remain. All 68 existing JavaScript
files in the frozen Core/PM/Slate/Lexical/facade scope are byte-identical. This
scope excludes Tiptap and is not every generated repository file.

The original full timing keeps 18 PASS / 14 INVESTIGATE comparisons, including
seven flags in unchanged Sync control. Same-process ABBA keeps 14 PASS /
2 INVESTIGATE. Focused equally profiled repeated-input checks resolve those two
within the original guards: redo10k median 1.932→1.916 ms, p95 2.285→2.304 ms;
delete100k median 1.722→1.681 ms, p95 1.897→1.808 ms. No persistent Local-only
hotspot was established. The narrower checks do not relabel original scores or
qualify all browser latency. The initial heap-exhaustion attempt was harness
fixture retention; the corrected helper yields outside timed intervals and is
used for all final targets. No product memory result is inferred from that abort.
See `benchmarks/results/local-client/report.md` and its retained comparison JSON.
Raw inputs, profiles, scripts and logs remain under ignored
`output/local-client` in the preserved isolated worktree.

Main integration requires a clean original main at the stated baseline. It
backs up overwritten source/generated artifacts and verifies copied source and
built JavaScript against the tested candidate. Fresh main checks and hashes are
in `output/local-client/integration/verification.json`; candidate full-suite
results are qualified by those hashes, not called a fresh full main suite.
This checkpoint does not commit, push, release packages or deploy Pages. Existing
user browser tabs/services, other worktrees and temporary evidence are preserved.

Fresh main integration passes Core 136/136, native local bindings 4/4,
documentation 34/34, TypeScript checking, and six-package/seven-consumer checks.
All 146 generated files match the tested candidate; all 70 pre-existing runtime
JavaScript files match baseline. The performance archive's smaller 68-file scope
remains stated separately. All 162 built documentation files match the Chrome-
tested candidate byte for byte; checks cover 42 English pages and 1,845 internal
links. Task-owned Chrome and preview processes were closed. The existing user
preview on port 5415 remains running from the main workspace.

### 5.107 LocalClient example links

Removed Runnable editor examples from the editor sidebar and the integration
overview's links. Its existing URL retains its editor category for compatibility.
The overview now has a LocalClient examples section linking schema/edit/history,
ProseMirror host, anchored selection and complete textarea adapter examples.
The Guide sidebar label names LocalClient explicitly. These are code examples;
the existing product demo uses synchronized clients. A LocalClient browser demo
remains open. This documentation-only follow-up changes no runtime source.

Fresh documentation tests pass 34/34; production build and checks pass 42 English
pages and 1,838 internal links. Logs are `/tmp/doc-sync-docs-nav-cleanup-*.log`.
The section 5.106 source/build hashes and Chrome receipt describe the earlier
checkpoint; Chrome was not rerun for this small navigation/link follow-up.
No commit, push or deployment was performed.

### 5.108 LocalClient and SyncClient comparison

The Local editing guide now compares imports and constructors, the shared
TypeScript editing model, direct edit calls, editor hosts and supported bindings,
selection/presence, History, connection state, pending changes, storage/recovery
and compatible schema changes. It distinguishes disconnected synchronized
sessions from memory-only local editing. Neither ordinary client automatically
persists participant state. Checkpoint capture alone does not establish GC-safe
recovery, and JSON copying is not an identity/History-preserving client handoff.
The performance section links the existing bounded offline comparison without
claiming a general speedup. Integration, synchronization and custom-editor pages
link directly to this comparison.

This is a documentation-only update. Fresh docs tests pass 34/34; production
build and English/link checks pass 42 pages and 1,846 internal links. Logs are
`/tmp/doc-sync-client-comparison-*.log`. No runtime, Chrome or performance test
was rerun, and no commit, push or deployment was performed.

### 5.109 LocalClient native editor demo and Chrome verification

`npm run dev:local` builds the public packages and starts the dedicated demo in
`apps/demo/local`. ProseMirror, Slate and Lexical each own an independent
LocalClient and LocalEditorHost. The sample has two paragraphs and one bold run;
initial History is empty. Native keyboard and per-panel Undo/Redo, Insert prefix
and Reset controls use the real bindings. Application insertion preserves token
selection. Remount retains the client and History; reset replaces one client;
refresh starts fresh samples. No save/recovery API is implied.

The loopback preview serves fixed HTML/CSS/JavaScript assets and diagnostic
reports only. It starts no document backend, SyncClient, transport or MCP
service. Unsupported paths return 404 and mutation methods return 405. CSP
sets connect-src to none. The bundle imports public compiled ESM entry points
and rejects emitted synchronization-client, transport and document-server code.
Unused barrel references can remain in the input graph; the test checks positive
output-byte contributions, not mere input presence. All dependencies come from
the existing workspaces/compat installation, with no new package or lock change.

Chrome exposed and fixed two actual binding defects. Lexical ignored native
selection-only updates, leaving stale tokens for an external application edit.
It now captures the current selection without a content edit or History entry.
ProseMirror's text diff could map a selection to the wrong occurrence after
inserting an identical prefix. It now reuses token keys already captured by
its change handler and restores TextSelection against the new document. Native
selection, document identity and generation guards preserve fallbacks for
non-text, replaced or unavailable endpoints and owner-managed state. No extra
anchor capture is added to the existing PM change handler. Core CRDT operations,
conflict rules, wire format and History ownership remain unchanged.

Three Lexical forward/backward/collapsed regressions and three PM repeated-prefix
regressions FAIL against the old compiled bindings and PASS after rebuilding.
The latter also check exact text, undo/redo and no extra History. The demo's
pagehide cleanup skips persisted pages rather than disposing a cached view.
Read-only source review found no remaining blocker in the final binding fixes,
including the PM external-dispatch/Tiptap fallback. This review is separate from
browser or full Tiptap qualification.

Final Chrome 156 proof is `output/local-demo/chrome-proof-05/receipt.json`.
All three editors pass trusted Unicode input/delete, forward/backward/collapsed
selection, toolbar and keyboard undo/redo, independent content and History,
external prefix insertion in both directions with exact logical and DOM ranges,
remount, reset and refresh with empty History. Editing continues after browser
networking is disabled and fetch/XHR/EventSource/WebSocket/beacon are blocked.
Document requests, attempted document networking, notification errors, console
errors and page errors are all zero. The emitted report has 151 contributing
modules and no forbidden module. The exact served bundle SHA-256 is
`1af8ed1ba3de593058b5e2604de9919cfae2b9cda8eac0c0fc6b4eebf8d3e574`;
the served bundle and both manifests are archived beside the receipt.

The proof retains 239 input/selection telemetry events; this is an event count,
not 239 independent tests. A 390x844 screenshot/overflow smoke check passes.
A synthetic persisted:true PageTransitionEvent followed by trusted input and
undo exercises the teardown guard. Actual BFCache navigation, operating-system
IME, broad mobile editing, performance/memory benchmarks, physical display
latency and all rich schema shapes remain NOT_RUN or outside this demo scope.
Earlier LocalClient timing results predate these binding fixes and are not
relabelled as fresh performance acceptance.

Runs 01/02 preserve harness caret-position failures on macOS; they are not
classified as product failures. Run 03 preserves the real Lexical failure and
run 04 the real PM repeated-prefix failure. Full assertions remain in the final
run. After proof05, only unreachable optional-manifest code/comments in the
check helper were removed; executed assertions and behavior are unchanged.

Fresh Node 24.22.1 verification passes:

- Library 758/758 with default fuzz settings, including the seven local-binding
  cases. No fresh 3,000-seed full-workspace run is claimed.
- Lexical and Slate package host tests 11/11, including the three new Lexical
  selection cases.
- Core 136/136, checked after the Lexical fix; Core generated bytes remain
  unchanged through the final PM rebuild.
- Demo 71/71, including three new seed/bundle/static-route cases.
- Documentation 34/34, root type checking, production docs build, and checks for
  42 English pages and 1,852 internal links.

The first parallel demo run passed 70/71 and failed an existing bot-recovery
startup assertion. Its original log is retained as `demo-after.log`; the isolated
case and subsequent unchanged full 71-case run pass. No bot source or assertion
was changed, and no root cause is claimed from the successful retry.

Within 146 generated package files, only PM host JavaScript/declaration and
Lexical host JavaScript differ from the pre-demo checkpoint. All Core and other
generated inputs match. Hashes, selected-suite scopes and current sources are
recorded in `output/local-demo/final-verification.json`. Package artifact
consumers, MCP/HTTP recovery, synchronized-editor Chrome, actual Tiptap Chrome
and Rust tests were not rerun for this demo; earlier receipts keep their scope.

The local guide, integration overview, custom-editor page, README, verification
page and L2 roadmap now explain the executable local demo and bounded browser
results. The demo is left running at http://127.0.0.1:50832 and opened in a new
in-app browser tab. Only validation-owned Chrome and older preview processes
were closed. Existing tabs, user services, inherited uncommitted work and the
isolated local-client worktree remain preserved. No commit, push, package release
or Pages deployment was performed.

### 5.110 Final local-editing review and main publication

This publication checkpoint covers the reviewed LocalClient/LocalEditorHost,
per-view origin and History ownership, public Core export, native local demo,
PM/Lexical selection fixes, native regressions, reproducible offline benchmark,
English integration guides and four-category documentation navigation. It
preserves all inherited work in this task series rather than replacing it with
a narrower demo-only change. No registry release or domain change is included.

The final Node 24.22.1 main-worktree run passes 1,244 full-workspace cases:
1,242 PASS, two expected platform SKIPs, zero FAIL. Groups are library 758,
Core 136, Lexical 7, Slate 4, bot 53, demo 71, docs 34 and MCP 181. Default
fuzz settings are used; this is not a fresh enhanced-fuzz run. The macOS SKIPs
are unsupported-platform lock rejection and Linux-helper failure handling.
The existing bot-startup case passes in this complete run without a source or
assertion change. Earlier transient failure records remain under section 5.109.

Fresh root type checking, six package tarballs/seven isolated consumers,
documentation 34/34, production build and 42-page/1,853-link English checks pass.
The Core-only tarball consumer checks LocalClient without network access or
native editor dependencies; the native binding tarball consumers still use
SyncClient. Do not reinterpret those seven consumers as three packaged local
native-editor tests. All 146 generated files match the Chrome-tested source
checkpoint after rebuild and prepack. No runtime source changes follow the full
workspace run. Final prose adds the shared-local-document explanation and these
publication facts; final documentation checks cover that guide revision.

The Chrome receipt from section 5.109 is reused with identical runtime inputs.
It verifies independent LocalClients in PM, Slate and Lexical, including input,
selection, History, external edits and memory-only lifecycle. It is not a fresh
Chrome run for this publication and does not establish OS IME, actual BFCache,
Tiptap Chrome, synchronized-editor or performance acceptance.

The user's shared-editor question has a separate fresh direct integration check:
one LocalClient, two distinct LocalEditorHosts and actual public PM/Slate native
bindings. Nine headless Node stages verify native edits in both directions,
shared actor/History, undo from one view, redo from the other, exact models and
zero notification errors. The script and receipt are
`output/local-main-publication/shared-views.mjs` and `receipt.json`. This is not
shared-document Chrome proof. The guide now explains that one client can serve
several views, while two independent clients, browser tabs, workers or processes
do not exchange changes automatically. Sharing one host between views remains
unsupported because its origin suppresses needed events.

Independent read-only runtime, demo/documentation and Git preflight reviews
found no remaining blocker. Before staging, main and fetched origin/main both
point to 12da94d527d4a9edcca7d0a5752f73ea615f6459. The reviewed inventory has 48
source files and no tracked output, dist or dependency artifacts. Other worktrees,
existing services and browser tabs remain intact. The local demo stays available
on its existing static preview URL.

Publication uses a normal main commit and push. The exact final source hashes,
commit/remote identity, documentation and MCP workflow URLs/results, and public
Pages checks are recorded in ignored
`output/local-main-publication/final-verification.json` and `publication.json`.
Workflow entry points are
[documentation](https://github.com/barocss/doc-sync/actions/workflows/docs-pages.yml)
and [MCP recovery](https://github.com/barocss/doc-sync/actions/workflows/mcp-durable-recovery.yml).
Local PASS alone is not proof of remote push, CI or deployment completion.

### 5.111 Host-based custom editor and shared LocalClient Chrome demo

The local demo now has a Shared document mode (`?mode=shared`) alongside the
existing independent mode. Custom textarea, ProseMirror, Slate and Lexical use
exactly one LocalClient and four distinct LocalEditorHosts. They share one actor,
document and undo/redo History. Selection remains per view rather than being
copied as a global caret. Existing independent mode keeps its three separate
clients and rich seed.

`apps/demo/local/custom-editor.mjs` exports the reusable demo adapter
`mountCustomEditor(textarea, host, {onError})`. The adapter reads and edits through
the public EditorHost contract only; it does not access LocalClient internals,
Doc, History, transport or server. It is a demo module, not a new Core export.
Its declaration is adjacent in custom-editor.d.mts. The primary custom-editor
guide now mounts it through createLocalEditorHost and includes a shared native
ProseMirror example with explicit borrowed-client ownership. The executable guide
test loads this actual adapter rather than the earlier direct-client toy code.

The renderer supports a flow root with one plain text paragraph type, no marks
or attributes. Textarea newlines map to paragraph boundaries. Rich shapes,
text:false, inline children and child rules are rejected at mount before model,
History, textarea or listener mutation. Supported native edits compute the
changed UTF-16 interval, preserve unchanged identities, collect original
apply/deleteRange/split operations in order, and commit once. DOM-derived
readModel reconstructs the native paragraph model from textarea.value; it does
not return the authoritative model to manufacture equality. Anchors retain
forward/backward/collapsed ranges across other views' edits without taking focus.
Composition uses an isolated host session and reserves clocks during foreign
updates. Headless tests cover draft publication and concurrent application input;
Chrome composition and actual OS IME remain NOT_RUN.

Remount recreates one view while retaining the shared client and History.
Reset shared document detaches all observers before disposing that client and
mounts all four views against a new seeded client with empty History. Controls
are disabled while mounting; a live busy getter lets probes avoid stale/disposed
view state. Page teardown disposes each unique client once and keeps the existing
persisted-page guard. Refresh clears local edits. There is still no persistence,
automatic tab/process synchronization or network collaboration in this demo.

Fresh Node 24.22.1 checks pass focused demo/adapter 13/13 (four demo and nine
adapter cases), Core 136/136, native local/Slate/Lexical bindings 18/18, docs
34/34 and root type checking. The docs production build and English checks pass
42 pages and 1,856 internal links. All 146 generated package files are
byte-identical to main bfbcc28e38a33106445b1d9bbc98ceaa41c83554. No Core, native
binding, wire or collaboration rule implementation is changed in this phase.
The earlier 1,244-case full-workspace run keeps its publication scope; a new full
workspace/MCP/Rust/package-consumer/performance run is not claimed here.

Actual Google Chrome 156 proof is indexed in
`output/custom-shared/validation-summary.json`:

- Shared `shared-20261102-caret/receipt.json`: 15 scenario groups PASS. Trusted
  Unicode input/delete from each of four views updates all native/client models.
  Toolbar and keyboard undo/redo from other views act on the shared History.
  Custom inactive forward/backward/caret ranges track native PM inserts with no
  focus steal; each active editor keeps ranges through identical prefix inserts.
  Native paragraph split, join and cross-paragraph deletion pass in all four.
  Remount, shared reset and refresh preserve or clear state as specified.
- Independent `independent-20261102-final/receipt.json`: the unchanged three-editor
  browser checker passes on the new bundle, including its native input,
  selection, History, application edits and lifecycle regressions.
- Both checks archive and use the same served bundle SHA-256:
  b4e3220e8d6e1c8fa3fce372fa053be9bf28a98bafb67d7d7381836c7d02d49c.
  Client count is one and distinct-host count is four in shared mode. Emitted
  forbidden modules, document network attempts/requests, notification errors,
  console errors and page errors are zero. Editing is checked after network
  access is disabled. Static files are still served by a loopback preview.
- Desktop and 390x844 screenshot/overflow smoke checks pass. Broader mobile
  editing, actual BFCache, shared Chrome composition, OS IME, physical display
  latency and backend collaboration remain outside this proof.

Three original shared failures are retained. The initial and fixed runs recorded
an intended Slate Redo click that actually landed elsewhere because its toolbar
was below the viewport. The checker now scrolls the inspected target into view,
uses a unique selector and verifies the trusted click's pane and label. It does
not call a model helper to substitute for the button. The third run required
none/forward direction equality for a collapsed textarea caret; the final check
keeps exact caret positions and compares direction only for noncollapsed ranges.
The actual missing busy probe and unsupported-schema guards were also corrected.
No engine or native binding change was needed to make cross-view History pass.

Run `npm run dev:local`, select Shared document, then use
`npm run check:local:shared -- --url http://127.0.0.1:PORT --output output/custom-shared/chrome`
to reproduce the shared proof with the installed agent-browser CLI. Root README,
local demo README, integration/custom/local guides, status and L2 roadmap now
explain both modes and their limits. Detailed source hashes and check scopes are
in `output/custom-shared/final-verification.json`.

The new static preview stays running at http://127.0.0.1:49231/?mode=shared and
is open in a new in-app browser tab. The user's earlier 50832 demo, documentation
service, tabs and prior evidence are preserved. Only the task's superseded
64289 preview and validation-owned Chrome sessions were closed. Changes remain
uncommitted; no push, Pages deployment, registry release or domain change was
performed in this task.

### 5.112 Final shared-custom-editor review and main publication

This checkpoint publishes the reviewed host-based custom textarea, the shared
four-view LocalClient mode, strict plain-text schema boundary, lifecycle/reset
controls, reproducible Chrome checker, focused regressions and current English
guides. It changes no Core/native-binding implementation, public package export,
lockfile, wire rule or registry release configuration.

The fresh Node 24.22.1 full-workspace run passes 1,254 cases: 1,252 PASS, two
expected platform SKIPs, zero FAIL. Groups are library 758, Core 136, Lexical 7,
Slate 4, bot 53, demo 81, docs 34 and MCP 181. The demo group includes all
13 focused custom/local cases. Default fuzz settings are used; no new enhanced
3,000-seed or nightly session result is claimed. The macOS SKIPs cover
unsupported-platform lock rejection and Linux-helper error handling.

Fresh root type checking, final documentation 34/34, production build and
42-page/1,856-internal-link English checks pass. The full test prebuild reproduces
all 146 generated package files exactly. The preceding six-tarball/seven-consumer
result retains its existing scope: package sources, manifests, declarations,
build/check scripts and dependency lock are unchanged, and no new package-consumer
run is claimed for this demo-only publication. Native local-view behavior is
covered by the browser and workspace regressions, not reclassified tarball tests.

Independent read-only source review found no remaining blocker in operation
ownership, selection, composition sessions, schema rejection, shared reset,
unique-client disposal, borrowed-client lifecycle or guide claims. Current
20-file source and 146-file runtime hashes matched section 5.111's verification
receipt before final publication prose was added. No runtime or test code
changes follow the full suite. The status page now records this fresh combined
run separately from the preceding 1,244-case publication.

The existing shared 15-scenario and independent three-editor Chrome proofs from
section 5.111 are reused with identical runtime/demo inputs. This is not a new
Chrome run. Their actual Google Chrome, trusted input, model/DOM comparison,
network-blocking, error, lifecycle and schema limits remain unchanged. Actual
OS IME, shared browser composition, broad mobile behavior, actual BFCache,
network collaboration, Rust and performance acceptance are not added by this
publication. Initial failed browser records and their harness explanations are
preserved.

Git preflight found exactly the intended 20 changed files, an empty index,
clean diff checks and no tracked build/dependency/output artifacts. Main and
fetched origin/main both pointed to bfbcc28e38a33106445b1d9bbc98ceaa41c83554 before
staging. Publication uses one cohesive normal main commit and push. No package
release, domain change, worktree cleanup or user tab/service reset is included.
The existing 49231 shared demo and earlier 50832 demo remain available.

Exact reviewed hashes and final local checks are recorded in
`output/custom-shared-publication/final-verification.json`. The final commit,
remote ref, documentation/MCP workflow runs and public Pages byte checks are
recorded after publication in `publication.json` in that same ignored directory.
Workflow entry points are
[documentation](https://github.com/barocss/doc-sync/actions/workflows/docs-pages.yml)
and [MCP recovery](https://github.com/barocss/doc-sync/actions/workflows/mcp-durable-recovery.yml).
A local test PASS does not by itself establish push, CI or deployment success.


### 5.113 Unified local and synchronized Client

**API and ownership.** Core `/client` exports `Client`, `BindingClient`, the host
factory and client helpers. The facade adds `/client`; both roots export Client.
`new Client({schema, actor?})` constructs only a LocalClient. Supplying a valid
actor and transport constructs the existing SyncClient. Mode is fixed. The local
backend has no SyncClient, server sequence, transport outbox, ACK timer or remote
presence. The unified module graph does include sync code; the existing `/local`
entry remains the narrower module boundary. Neither local mode nor a disconnected
sync backend makes pending work durable.

`edit()` applies, records and queues once as appropriate; do not commit its return
value. Common methods cover immutable model reads, History, anchors, selections,
subscriptions, status and presence. `client.sync` is null locally and exposes the
actual synchronized backend for advanced conditional, recovery and schema APIs.
Local persistence, local schema transitions, local-to-sync handoff, live engine
switching and a Rust/WASM production factory remain open. `syncOptions` forwards
the existing TypeScript engine factory, ACK delay and before-send persistence hook.

**Bindings.** PmBinding, SlateBinding, LexicalBinding and DocSync accept Client or
the legacy clients directly and create a distinct host per view. Existing explicit
HostBindings remain available. Raw and structural SyncClient arguments retain the
legacy route; Lexical retains its original InputSession in that route. The new
sync bridge suppresses native self-echo and checks exact staged operation objects,
origin and order. Composition completion rejects sibling uncommitted operations
without discarding the active draft. Observer errors are isolated and bounded.
Own change echoes do not recapture old native coordinates against the new model.
The CRDT, History, sync, local backend, engine and server implementations are
unchanged relative to main `0bc37f9af7ed41b2d268ebff51bc0e75e5b69f46`.

**Defects exposed and fixed.** The first full run found the structural SyncClient
fallback and missing old-demo import maps. The old synthetic cursor test was kept;
all three unbundled pages now map Core `/client` and `/local` and facade `/client`.
A Chrome Remount failure came from a DOM variable shadowing its mount function.

Chrome then exposed a pre-existing Slate ownership bug, reproduced with raw and
unified APIs. After Alice inserted `actorA ` and Bob inserted `actorB ` before it,
JSON converged but a prefix diff reused Alice's `actor` tokens. Undo Alice produced
`B actorEdit...`. Lexical reproduced the same defect. Slate now uses native text
operation positions, validates the changed block, and replays complex leaf batches
only within that block. Lexical uses a validated native selection splice and
unchanged prefix/suffix and sibling checks. Other structures retain the guarded
model fallback. These fixes preserve native input ownership without changing CRDT
merge/History policy. Sixteen new cases cover raw/unified APIs, actual bold input,
astral emoji, selected-range replacement, exact carets, retained identities and
both participants' undo/redo.

A separate review found Tiptap teardown could leave a dead callback under a later
Client subscription. Retired owned hooks now forward application callbacks and
resolve the live predecessor during restoration. Six lifecycle cases cover both
mount/subscription orders, both disposal orders, exact restored callback identity,
stopped observers, cancelled queued editor callbacks and unrelated replacement
hooks. This changes Core's editor callback adapter, not the sync protocol.

**Demo and Chrome.** Run `npm run dev:client` after installing the documented compat
dependencies. Default `?mode=local` shares one Client across ProseMirror, Slate,
Lexical and Tiptap. `?mode=sync` creates four actors on a queued in-browser DocHub
transport. The server is a static asset preview, not an HTTP document backend.
Use `?size=10000` or `?size=100000` for exact text payloads. `?api=legacy` is a
current-code control; its local Tiptap route is newly supported, not a historical
Tiptap local implementation.

Final Chrome 156 default checks pass all eight binding/mode cases, unchanged
shared/per-actor History assertions, offline edits plus a foreign participant,
reconnect with pending zero and equal native/client models, trusted Unicode input,
delete, forward/back/caret ranges, application prefix selection restoration,
Remount, Reset and refresh. Local counters for hubs, subscriptions, sends and
presence remain zero. Networking is blocked after static assets load; request,
notification, console and page-error gates pass. Desktop and 390px screenshots
have no horizontal overflow. OS IME, browser composition, physical display latency,
HTTP document-server restart and rich-schema browser qualification are not supplied
by this new demo. Existing bounded regression suites retain their own scopes.

Functional receipt: `output/unified-client-delivery/chrome-functional-final-attempt-1/receipt.json`.
All earlier failed attempts and the raw/unified native-ownership reproductions
remain under the same directory. `source-freeze.json` records runtime/test source
hashes. Existing user servers, tabs and other worktrees were preserved. The
baseline worktree `doc-sync-client-baseline` is isolated at the original main SHA.

**Packages and documentation.** Six rebuilt tarballs and seven isolated consumers
pass. Checks include Core/facade Client root/subpath identity, compiled types,
Core-only absence of editor dependencies, three direct Client native-binding
consumers, legacy host and client types, Tiptap typing/native tests, and an
independent Slate patch through the unchanged facade. Receipt:
`output/binding-packages/pack-consumers.json`. Private package flags remain set;
this is not registry publication.

The new Client guide is the primary setup path. README, all four editor guides,
custom adapter, local/sync comparison, packages, API, schema-transition, Rust,
editing/block/rule introductions, AI server guide, editor lessons and roadmap
explain the same boundaries. Low-level Doc examples and advanced HostBinding
constructors remain valid. The custom wrapper creates its host internally.

**Verification history.** The initial workspace run had 1,288 cases with two
failures (structural compatibility and import maps), now fixed. A later full run
passed the library, Core, native, bot, demo and docs groups but had one MCP
SIGKILL-after-accept failure: an unexpected HTML response could not be parsed as
JSON. No runtime cause was established. The isolated two-case recovery run and
then the full MCP suite passed (179 PASS, two platform SKIPs). The failed log is
retained as `full-tests-final.log`; focused and MCP rerun logs are adjacent.
The final confirmation run and separate performance results are recorded below.


**Final confirmation.** `full-tests-confirmation.log` is a fresh full-workspace
run with **1,310 cases: 1,308 PASS, two platform SKIPs, zero FAIL**. Groups:
library 793, Core 152, Lexical 7, Slate 4, bot 53, demo 85, docs 35 and MCP 181
(179 PASS, two platform SKIPs). The default 500-seed fuzz suites ran. Root tsc and
all six package/seven consumer checks pass. No source was changed to conceal the
intermittent MCP failure above. Its cause remains unestablished.

**Performance.** `benchmarks/results/unified-client/report.md` and its JSON/gzip
artifacts preserve original captures, failures, repeated runs and hashes. The PM
comparison uses isolated baseline/current package graphs, 10k/100k text, eight
scenarios and disconnected sync. All 32 count/semantic pairs pass with no extra
ordinary snapshots, restores or model/native reconstruction calls. First timing
retains 8/32 flags. Focused ABBA passes all local rows, leaves two sync flags,
and a final matched 60-sample-per-side investigation puts those two inside the
original guards. Do not relabel the first timing as PASS.

The independent native-input comparison uses raw SyncClient on both checkouts,
so it measures the Slate/Lexical fixes separately from Client. All 16 semantic,
History and count cells pass. Basic input uses zero snapshots/restores; marked
replacement uses one of each in both versions. Internal codec conversion counts
are not instrumented. A six-capture A-B-B-A-A-B run pools 24 samples per side.
At 100k, insert medians are Slate 19.170 to 5.985 ms and Lexical 31.259 to
18.450 ms. It retains one Slate 10k insert p95 flag: 2.123 to 4.481 ms, while
median improves 1.333 to 0.947 ms. High candidate values occur in the first
measured sample of two captures; a warmup/JIT or allocation cause is only a
hypothesis. The tail is not qualified. Node guards remain median max(10%,0.1ms),
p95 max(15%,0.2ms).

Chrome timing completes **320 trusted inputs** (64 warmup, 256 measured), with
all four target views observed. Functional/correctness assertions pass. All 64
paired DOM medians, every sync cell and every 100k cell meet the declared guards.
**59/64 full DOM cells pass**. Five local 10k p95 cells cross: PM→Slate 6.4→9.6ms;
Slate→PM 3.1→5.2ms; Slate→Slate 6.0→9.7ms; Slate→Lexical 3.1→5.2ms;
Slate→Tiptap 3.1→5.3ms. Overall timing remains **INVESTIGATE**. The DOM guards,
declared before timing, are median max(10%,1ms) and p95 max(15%,2ms). Raw RAF2
medians span 6.7–57.6ms and p95 13.6–71.8ms; these are rendering opportunities,
not physical display latency or a strict performance PASS.

The timed interval starts at trusted beforeinput, reads only the measurement
object until all DOM/frame observations finish, and performs no diagnostic model
snapshot in that interval. Selection setup is outside the clock. The full run
uses a trusted first-block click and a selection helper, then asserts both native
DOM and logical caret at zero. Native-key setup and trusted Tiptap input/undo
pass all eight mode/API/size routes; helper/DOM setup passes all 32 editor/route
combinations. Earlier selector/cursor failures and an interrupted partial run
are retained separately and excluded from the final samples. The final functional
and timing bundles both hash to
`0e4983478afb6cc898342ac46209f729645a61b782413a8cbc70b9f57f08d31c`.

Receipt: `output/unified-client-delivery/chrome-performance-final-attempt-4/receipt.json`.
The control uses the same current native fixes; it is not an old-source Tiptap
local implementation. Chrome's sync transport remains in-page. There is no new
HTTP server-restart, actual OS IME, rich-schema browser, memory-saving, Rust/WASM
or physical display acceptance claim.

**Next bounded work.** Profile the retained Slate/local 10k early-input tails
before changing algorithms or widening any guard. Local save/open and History
retention, local schema transitions, explicit session handoff and Rust/WASM
factory delivery remain separate roadmap items. The unified Client changes are saved in the local checkpoint commit described
below; this task does not publish a package or update remote main.


Final documentation checks: **35/35 PASS**, VitePress build PASS, **43 pages and
1,942 internal links** checked, English prose and absence of local paths PASS.
The final source freeze permits only the documented timing-harness setup change
and demo README update after runtime verification; production code remains fixed.
`benchmarks/results/unified-client/artifacts.json` binds preserved raw gzip files
to their original byte counts and SHA-256 values. The local four-editor preview
is running at `http://127.0.0.1:63439/`; docs remain at
`http://127.0.0.1:5415/doc-sync/guide/client.html`. These are temporary local URLs.
No user-owned server, tab, data directory or other worktree was removed.


**Local checkpoint (2026-11-03).** The unified Client implementation, tests,
documentation and preserved benchmark artifacts are committed together before
performance follow-up. All 45 final source-freeze hashes match. All 91 preserved
artifacts match their compressed, original-content and source-file hashes. The
existing verification receipts remain valid; no long test suite was repeated.
Performance remains **INVESTIGATE** for the five Chrome local 10k p95 cells and
the Node Slate 10k insert p95 cell above. No push or release is part of this
checkpoint.


### 5.114 Input-tail diagnostics and explicit local save/open

**Checkpoint and task boundary.** The previously verified Client work was committed
as `409ee2abc5add5bf611b7070fe90da39bc484f39` before new implementation. The 45
frozen source hashes and 91 preserved artifact triples matched. No push or registry
release was made. The new performance work below is diagnostic; the local-state
implementation is a separate source change. Three agents owned profiling, Core
state and the browser demo, with builds/correctness work outside profiling captures.

**Performance result stays INVESTIGATE.** The original Node Slate 10k p95 flag and
five local 10k Chrome p95 flags remain unchanged. A separate fixed A-B-B-A trace
run keeps all 64 semantic/count/History checks. CPU-profile A/B captures a new
5.395ms input, including major GC 3.788ms; fixture/oracle preparation raises heap
from 57.45 to 91.61MB before that input, then GC leaves 40.64MB. This explains the
captured sample; the old B2/B3 captures have no GC trace, so their cause remains
unproven. Driver operation cloning and runtime commit take tens of microseconds,
not milliseconds. Both API routes include Slate callbacks and React work.

An 80-input local10k Chrome trace pair preserves native/model and History checks
but does not reproduce the old 9.6/9.7ms events. Instrumented times are not latency
acceptance. No runtime optimization was justified, no sample was excluded, and no
guard/warmup was changed to manufacture PASS. See
`benchmarks/results/input-tail-diagnostics/{report.md,summary.json,manifest.json}`.
31 raw files (118.8MB) are preserved as 11.1MB deterministic gzip with hashes.
Those captures use compiled 409ee2 before the separate local persistence build.

**Local API.** LocalClient and Client(local) now expose `captureState()` and
`fromState(unknown, {schema})`. LocalClient restore options also accept its
notification-error callback. LocalClientState is exported by Core/local,
Core/client and package roots; facade/client mirrors Core/client. Its envelope
`doc-sync-local-state-v1` carries actor, schema fingerprint and the production
TypeScript engine checkpoint. Restore returns a new LocalClient-backed instance,
not a live reset. Client uses an internal Symbol path without allocating a dummy
engine. It has no SyncClient, transport metadata or automatic server attachment.

The saved state preserves CRDT IDs, clock, document, hidden content, undo and redo.
Cache generation/revision stamps regenerate; byte-identical revision stamps are
not promised. The caller supplies the exact schema. Finite plain JSON is copied
without invoking property getters, then engine state is prepared/installed into
an unexposed candidate. Local-only known-field checks validate token/placement
references, History ownership and the original saved allocation floor; arbitrary
user JSON is not interpreted as internal History. Required-child deterministic
identities are not ordinary clock allocations. Errors dispose the candidate and
leave the caller's existing client unchanged. These checks are structural, not
signatures/authenticity proof. SyncClient and engine contracts are unchanged.

Capture refuses uncommitted host operations, active composition (including empty
or multiple drafts), notification reentry and disposed clients. Rejection does
not discard drafts or operations. Active composition uses a counter, not a strong
collection of inactive view sessions. Sync facade capture directs applications
to the existing SyncClient recovery API; no server epoch/GC proof is bypassed.

**Regression discovered.** Nested move→split→move→undo state initially failed to
open because History.after may identify an old movement operation, not a token.
The local validator now permits only a stored movement anchor whose parent
matches. Arbitrary missing anchors/parents still reject. Membership uses stored
tokens and does not materialize implicit storage. New tests reopen after repeated
move/split undo/redo, including root and nested moves.

**Browser storage demo.** `npm run dev:client`, then `?persist=1`, enables explicit
Save locally, Open saved and Forget saved for unified local mode. Startup reopens
the last successful Save; later typing is not auto-saved. Core supplies data only;
the demo owns one atomic localStorage key and its separate per-view selection
wrapper. `storageKey` isolates a slot. Schema/JSON/selection validation and the
current client's settled-state guard run before views detach. The old client stays
available until all four replacement mounts succeed. Mount failure rolls back.
Quota/open failure preserves the previous saved bytes and live model/History.
Forget removes the saved copy and keeps the live document. Default routes stay
ephemeral; legacy and sync routes disable this storage feature. Multiple tabs,
background durability, large-storage policies and power-loss survival are not
provided by this demo.

Hidden reload exposed an existing readiness problem: mount waited for two RAFs,
which can suspend in a hidden tab. Lifecycle settle now has a visibility/timer
fallback while still awaiting Slate's effect. The measurement RAF2 code is
unchanged. Final Chrome proves visibility=hidden with ready=true, busy=false and
all four native/client models equal before activating the owned tab.

**Final verification.** Fresh whole-workspace run: **1,325 cases, 1,323 PASS,
two platform SKIPs, zero FAIL**. Groups: library 793, Core 163, Lexical 7, Slate 4,
bot 53, demo 88, docs 36, MCP 181 (179 PASS, two SKIPs). Core local-state tests
11/11 and app storage+demo focused7/7 pass; root/app/Core tsc pass. Default fuzz
settings ran. Six rebuilt tarballs/seven isolated consumers pass with explicit
public capture/open runtime and type checks. The first new package type fixture
used an unbound alias; that fixture was corrected, with no production change.

Fresh Chrome storage proof covers 10 scenarios plus all four native editor
save/reload/cross-view undo/redo roundtrips. Fresh unchanged default checker runs
all eight local/sync cases, ranges, History, remount/reset/refresh and reconnect
with no skips or errors. Both use bundle
`ae00354b17bc503611889d7589f83639c4a676bf66d55c33a6584456b948b604`.
Receipts: `output/local-persistence/chrome-final-frozen/receipt.json` and
`chrome-default-final-frozen/receipt.json`. Earlier focus/poll failures and the
hidden-RAF stall are retained separately. Synthetic composition guard checks are
separate from real OS IME acceptance. Quota is simulated; no OS crash, power-loss,
server restart or new latency certification is claimed. The repeated current
32-cell PM count comparison passes with the original baseline/harness: no extra
ordinary snapshots, model/native conversions or changed model/History results.

**Documentation and next work.** The new local-storage guide provides public API,
write boundaries, restore/rebuild order, errors, schemas and opt-in demo setup.
README, package/API, Client/local comparison, Rust boundary, status and roadmap
are updated. Remaining work includes persistent-session tail profiling, scheduled
background saving/storage providers and multi-tab ownership, local schema
transitions, identity-preserving session handoff and Rust/WASM production factories.


A separate final synthetic-composition Chrome receipt proves that Open and Save
both reject an empty active Slate draft without changing any live model, History,
actor or saved byte; after synthetic compositionend, both actions succeed.
Receipt: `output/local-persistence/chrome-composition-guard/receipt.json`. Events
are untrusted and this does not qualify actual OS IME. Only the optional checker
branch changed after the broad Chrome receipts; runtime bundle stayed fixed.

Final docs: **36/36 PASS**, build PASS, **44 pages / 2,011 internal links**, English
and local-path checks PASS. The local state evidence is archived under
`benchmarks/results/local-state/` with a human report, summary, source seal and
raw gzip artifacts. Input-tail evidence remains in its separate diagnostic lane.
The current preview is `http://127.0.0.1:58326/?persist=1`; docs are available at
`http://127.0.0.1:5415/doc-sync/guide/local-storage.html`. URLs are local/temporary.

At the end of this implementation checkpoint, the initial source was committed
at 409ee2 and the later diagnostics/local-state changes were verified but
uncommitted. No push or release had occurred at that point. See §5.115 for the
subsequent publication review and remote confirmation.


### 5.115 Publication review for local state and diagnostics

The user authorized commit and push to main. Before staging, all 18 final
runtime/test/demo source-seal hashes matched. The 38 local-state artifacts and
31 input-tail artifacts passed compressed/decompressed SHA-256 integrity checks;
the four diagnostic script hashes also matched. No runtime changes were made
during publication review. Existing source-bound results are reused: full
workspace 1,325 cases (1,323 PASS, two platform SKIPs), root/Core/app type checks,
six packages/seven consumers, current 32 count rows, fresh default Chrome8,
local-state Chrome10 plus four native roundtrips, synthetic composition guard,
and docs36/build44pages/2,011 links. Passing checks were not repeated merely for
Git acknowledgement.

Fetched origin/main was 0bc37f9 and local main was 409ee2, ahead one and behind
zero. The work is limited to the documented Client/local-state, demo, tests,
docs and preserved diagnostics; no unrelated paths were found. Planned atomic
commits separate input-tail diagnostics from local save/open. The original
Node one-cell and Chrome five-cell p95 investigation flags remain. These are
not blanket performance PASS results. There is no registry release.

Publication target: `https://github.com/barocss/doc-sync.git`, branch `main`.
Remote confirmation is appended after a successful non-force push. GitHub Pages
workflow/deployment status is separate from Git push success.


**Remote confirmation (2026-11-03).** The normal push to `origin/main` succeeded.
`git ls-remote origin refs/heads/main` independently matched local HEAD
`c3636d22e0ce7cb340497b3f8859c5982a71fa9d` after that push. The pushed sequence is
`409ee2abc5add5bf611b7070fe90da39bc484f39` (unified Client checkpoint),
`d782d22d07a0dc664ea479bc487de7130c647746` (input-tail diagnostics), and
`c3636d22e0ce7cb340497b3f8859c5982a71fa9d` (local state persistence). The working
tree was clean at that confirmation. This paragraph is a separate documentation
receipt; it changes no runtime source or verification artifact. Original timing
remains **INVESTIGATE** for one Node Slate 10k p95 cell and five Chrome local
10k p95 cells. Remote push success does not establish CI or Pages deployment
success. No registry publication or release was performed.


### 5.116 Five library packages, actor profiles, and release preparation

The user requested consolidation into five packages, unified active imports,
regression verification, and HANDOFF updates. Actual npm publication is deferred.
Sol Medium workers handled source/test consolidation, app/docs/harness migration,
and actor profiles with separate file ownership. Root integrated and verified.

**Current package graph.** `@barocss/doc-sync` now contains the actual dependency-free
core from the former `packages/doc-sync-core`. The redundant package is removed.
The four independent packages are `@barocss/doc-sync-prosemirror`,
`@barocss/doc-sync-tiptap`, `@barocss/doc-sync-slate`, and
`@barocss/doc-sync-lexical`. Bindings peer on core; Tiptap also peers on the PM
binding. Core has eight exports: root, `/client`, `/local`, `/sync`, `/editor`,
`/engine`, `/node`, `/server`. Binding subpaths under core are removed. Active
source, docs, demos, test imports, and CI use the canonical package names. Core
and former facade tests were merged without dropping their 956 existing cases.
Historical receipts, reports, and benchmark hashes retain their old paths. The
benchmark layout helper can still load a detached pre-migration core layout.

**Actor options.** `actor` remains the string replica ID in operations, History,
server ownership, and saved state. Optional `profile` supplies `name`, `color`,
`avatar`, `userId`, `kind: 'human' | 'bot'`, and bounded JSON `metadata` on Client,
LocalClient, or SyncClient. It is copied and frozen; resolved name/color have
stable defaults. Presence can use those defaults or explicit display overrides.
Concurrent replicas can share userId but must keep different actor IDs. Profile
fields grant no permissions. Saved state stays unchanged and profiles are passed
separately on local restore. Avatar metadata does not install a renderer. Public
profile types compile from installed root/client/local/sync entries. Limits and
examples are in the Client and Presence guides.

**Changesets.** Root has the dev-only CLI 3.0.3, independent version configuration,
an initial minor changeset for all five libraries, status/version commands, and
`check:release`. The real CLI rehearsal operates on temporary manifest copies:
initial 0.1.0 versions, supported peers, and a later Slate-only 0.1.1 patch pass;
other library versions and private app versions remain unchanged. Source checkout
versions/lock hashes are checked unchanged. All five stay private at 0.0.0. No
publish command or auto-publish workflow was added. License, final metadata,
first stable/beta choice, npm identity, and explicit publication approval remain
release gates. The existing private MCP Zod 3.25.76 advisory is unchanged and needs
separate compatibility work; none of the five core/binding packages adds it as a
runtime dependency.

**Verification.** See `docs/reports/five-package-migration-2026-11-03/README.md`,
`validation.json`, `source-seal.json`, and compressed raw receipts with hashes.

- Workspace coverage: 1,328 distinct cases; 1,326 PASS/two platform SKIPs/zero
  unresolved failures. Full run initially found one docs extractor failure after
  the new profile example became the first code block. An explicit local-example
  marker fixed the extractor; affected docs rerun 36/36 PASS. All unchanged non-doc
  groups passed the coordinated full run. Consolidated core 959/959 includes three
  new profile regressions. Compatibility app separately 33/33 PASS.
- Root types, five-package build, and packed consumers: PASS. Five tarballs/seven
  isolated consumer cases include public profile types and independent binding
  patching. Early concurrent prepack/test runs saw deleted-dist transients and
  are not acceptance evidence; final coordinated results supersede them. Do not
  run prepack consumers concurrently with tests loading shared dist.
- Fresh Chrome retry: all eight native cases PASS across PM/Slate/Lexical/Tiptap
  and local/queued in-page sync modes. Trusted input, forward/backward selection,
  undo/redo, actor-owned history, remount, reconnect, refresh, zero local network
  allocation, and no page/console errors pass. Bundle SHA256:
  `13ca5adf71a3a993f381b4215068b2b2262664403c177faf2eb1b31f5e049f23`.
  The first automation timeout is retained separately. Optional fresh storage
  browser checking did not complete due automation timeouts; NOT_RUN/incomplete.
  Local-state unit regressions passed, but are not fresh browser-storage proof.
- Count mode:64 rows/32 legacy-unified pairs at 10k/100k have equal model, History,
  call counts and native stats. Required generated operations 28/28 match. Four
  external pairs retain the existing recorder-route exception (two sync hashes
  differ). Sync is disconnected/stubbed in this count check. All 17 relocated CRDT
  source files are byte-identical to base d624a56. Timing is NOT_RUN; old Node and
  Chrome p95 flags remain INVESTIGATE, not cleared by count/source checks.
- Docs 36 PASS; build 45 pages / 2,072 links; English/local-path checks PASS. Package,
  Client, profiles, editor, Rust/WASM import examples, API, and release guides use
  the current package structure. Documentation is local; no new remote deployment
  is claimed. No new OS IME, HTTP-server Chrome restart, Codex, Rust differential,
  or nightly million-op acceptance is claimed.

The owned Chrome session is closed. Fresh static preview remains at
`http://127.0.0.1:62170/` (exec session 28762); other user tabs/processes are preserved.

**Graphic-schema discussion only.** The user clarified a future API distinction
between DocumentSchema and GraphicSchema. Recommended direction: domain-specific
public schemas sharing common primitives and the CRDT engine. Current Schema
requires a flow root and default text; a real graphical scene needs empty
containers, placement/transforms, object selection and a canvas binding. Existing
presentation shape/frame samples are not full graphical document support. No
DocumentSchema/GraphicSchema API or graphic engine was implemented in this task.

Base main remains d624a56. These changes are uncommitted; no new commit, push,
registry publication, or remote Pages result is claimed.


### 5.117 DocumentSchema and GraphicSchema with stored empty containers

The user requested implementation through multiple agents while preserving
existing Schema compatibility, collaboration rules, and inherited WIP. Sol
Medium agents owned schema/capability/binding contracts, core container logic,
and new fixtures/regressions/docs. A separate Sol High agent reviewed the hard
CRDT identity/placement/history cases. Schema/security, functional, and CRDT
reviews all APPROVE. Source checkout base remains d624a56; the preceding
five-package/profile changes were preserved rather than reset or committed.

**Public schema contract.** `Schema` remains the shared input. `domain` is
optional and defaults to document. `DocumentSchema` permits an explicit document
marker. Original plain finite JSON validation runs before normalization; that
marker is omitted from the fingerprint, keeping equivalent legacy identities
and bidirectional additive compatibility. `GraphicSchema` requires
`domain: 'graphic'` and a `container` root. Public `ContainerSpec`, `OrderedSpec`,
and `SchemaDomain` types are exported from core. A graphic frame or object group
is a named stored container. The existing `group` remains a computed list within
a document flow. No new npm package or separate CRDT engine was added.

**Empty and nested object semantics.** Containers have ordered children and no
automatic leading/interstitial/trailing paragraph. They accept declared stored
container/flow/text/grid/atom children; computed wrappers and inline/row/cell
nodes cannot be direct container children. They have no default or childRules.
Graphic root attributes are rejected; stored frame/group/object attributes use
existing scalar/field rules. Nested text-box flows keep default paragraphs and
computed lists. Direct Doc/canonical and selected Client engine paths reject
invalid new domain/container combinations. Graphic edit batches are staged and
causally checked before live mutation.

**Concurrency and History.** The same token IDs, body slots, placement-v1, LWW
fields, deletion ledger, and History are reused. Graphic schemas activate logical
projection from the schema, without a no-op movement of the original object.
The first placement of a newly born graphic object is retained as its birth
rather than a separately replayed MoveStep; later real movements remain recorded.
This exception is graphic-only; the legacy document History branch is unchanged.
These decisions fix exact concurrent insertion rank after redo, original text
tails after split/merge/object insertion, and split versus peer reparent intent.
Deleted objects hide unobserved peer text without dropping its retained storage;
undo restores it. Container-only cache invalidation prevents that text leaking
into an earlier sibling. Text owner validation uses immutable causal lineage,
including inline origins and text:false restrictions.

Stable object IDs are available through readDocumentSlice blockId; regression
checks preserve them through reorder, reparent, History and snapshots. Numeric
paths still address edit operations. The user's ID-based lookup question was
answered; a public getNode(id) or ID-edit convenience API was not added.

**Fail-closed integrations.** Protocol 3 and the four document capabilities stay
unchanged. A graphic hub adds `containers-v1`, and a graphic client requires that
capability and a matching non-null schema identity before applying hello state.
Failure preserves the local model, pending changes, and History. Document/graphic
schema conversion is incompatible. Existing text binding builders, native and
host constructors, converters, and selection/position helpers reject graphics
before accessing native state or allocating sessions. Caller-supplied schema info
cannot bypass these checks. Generic EditorHost remains available to a future
canvas integration. Native Rust/WASM graphic support was not introduced.

**Fresh verification.** Tracked receipts and tested source hashes are under
`docs/reports/schema-domains-2026-11-03/` (README, validation.json,
source-seal.json, compressed logs/receipts). The previous five-package report and
historical benchmarks remain immutable.

- One coordinated npm test with its final prebuild: 1,401 cases, 1,399 PASS,
  two platform SKIPs, zero FAIL. Core is 1,031/1,031: previous 959 cases plus 72 new
  regressions (31 graphic model/state/sync, seven schema-domain, five capability,
  29 binding guard cases). Docs are 37/37 including the public graphic example.
- Root types PASS; comparison-app regressions separately 33/33 PASS.
- Five real tarballs and seven isolated consumers PASS. Packed core checks new
  domain types, empty graphic Client, reparent/undo/reopen, stable document
  identity, graphic hub capability, and no editor dependency. Existing independent
  binding consumers/patch proof still pass. Packaging ran after shared tests;
  prepack must not run concurrently with tests loading dist.
- Changesets temporary-copy version/peer/independent patch rehearsal PASS.
  All five library workspaces remain private at 0.0.0. No publish was invoked.
- Docs build PASS: 46 pages / 2,134 internal links; English/local-path checks PASS.
  Updated schema/domain/API/spec/package/Rust guides, navigation, README and
  package README. Public guide: apps/docs/src/guide/graphic-schema.md.
- Sol High source-only review additionally checked four three-actor scenarios in
  all six delivery orders, snapshot/GC roundtrips, actor undo/redo, birth ranking
  after a real move, and two later explicit movements. These are review observations,
  not extra committed suite counts. Final built full-suite results above are the
  acceptance evidence, superseding early stale-dist and pre-fix failures.

**Limits and next work.** There is no canvas renderer, hit testing, drag/resize,
transform math, or graphic browser UI acceptance. Large-scene throughput is not
measured; graphic edits currently preflight complete batches. Root metadata and
container cardinality need separate designed support. An inherited explicit text
merge can display joined text with its receiver despite a concurrent reparent,
leaving that destination frame empty; its placement/content is retained and this
task does not introduce a new move-wins rule. New timing/paint/OS IME, live Codex,
real-process graphic restart and Rust differential checks are NOT_RUN. Previous
performance INVESTIGATE flags stay open.

The existing five-package release gates still apply. No source commit, push,
registry release, or new remote Pages deployment was performed.


## 5.118 Private PixiJS graphic editor, stable ID adapter and Chrome evidence (2026-11-03)

**Scope.** Continues the five-package and GraphicSchema WIP from §5.116–5.117.
A Sol High worker implemented bounded uniform-transform geometry and matrix
oracle tests; Sol Medium workers implemented the session/server, Pixi studio,
and browser proof scripts. Root integrated, executed final Chrome checks and
measurements, and documented proof limits. The prior schema section remains a
historical headless checkpoint; a private canvas renderer now exists.

**Implementation.** `fixtures/graphic-canvas-schema.ts` and
`apps/demo/graphic/` provide stored canvas/frame/group nodes, rectangle/ellipse
atoms, plain labels, keyed Pixi nodes, layers/name-or-ID search, inspector,
selection/cursor presence, drag, reparent/reorder, delete and per-actor History.
Geometry supports positive uniform scale; reparent preserves world transforms
within schema bounds. Resize uses the inspector. Field updates and minimal
UTF-16-safe text splices preserve unrelated peer edits. Stale text forms fail
before mutation. IDs resolve against a revision-cached visible Map, with missing
or hidden IDs rejected rather than rebound to an index. This is a demo adapter,
not a public ID-edit API or published canvas binding. PixiJS 8.22.0 belongs only
to the private demo; core retains zero runtime dependencies.

The two browser peers own independent public Client/HttpTransport/History
instances over real HTTP POST/SSE. The bounded loopback memory server validates
protocol/schema/epoch and never resets an existing room. Presence does not
create document edits. The core graphic-label event fix uses a scoped container
root while preserving the existing projection/cardinality OR and CRDT rules.
Queue overflow/lifecycle handling, unlock behavior, drag rollback, label fill,
UTF-16 retained identities and controlled stale edits have focused coverage.

**Checks.** Coordinated full workspace: **1,421 cases, 1,419 PASS, two platform
SKIPs, zero FAIL** (core 1,032; Lexical 7; Slate 4; bot 53; demo 107; docs 37;
MCP 181/179 PASS). New geometry/session/HTTP/core cases: 20/20 PASS. Selected
remote/structural/graphic source regressions: 53/53 PASS. Final root TypeScript,
seven packed consumers/five tarballs, and isolated Changesets rehearsal pass.
The docs navigation mapping was corrected after an initial missing-route test
failure; final docs tests pass 37/37. Documentation build/link output is archived
in `docs/reports/graphic-demo-2026-11-03/`.

Final Chrome functional proof: **20/20 PASS**, including trusted drag and forms,
independent server/model equality, concurrent different fields, selective undo,
stable IDs through reparent/delete/undo/redo, duplicate names, offline pending
input and reconnect, actual Pixi label text/fill, remote presence, 390px layout,
and zero session/app/console/page errors. The final emitted bundle SHA is
`013d6c8c3451aceaf71aec1c66e3a5838064456a25b67391644430070a5bd6df`.
The later HTML Source-link correction does not change that JavaScript.

**Performance.** Chrome 156, Apple M3 Max, WebGL/ANGLE Metal, 1720 × 1080;
three warmups and ten recorded attribute edits for each fresh room:

| Objects | Client edit p50/p95 ms | Peer convergence p50/p95 ms | Cold ready wall s |
| --- | --- | --- | --- |
| 9 | 2.4 / 3.0 | 8.3 / 8.9 | 2.56 |
| 100 | 13.8 / 14.9 | 21.2 / 22.5 | 0.66 |
| 1,000 | 125.7 / 135.6 | 194.8 / 210.7 | 4.29 |
| 5,000 | 649.7 / 686.4 | 1,570.3 / 1,686.2 | 113.84 |

Correctness passes; **large-scene interactive performance is INVESTIGATE**.
Cached 1,000 same-ID lookup batches take about 0.3 ms p50 at every size. Three
complete 5,000-distinct-ID sweeps take 1.2/1.2/1.3 ms without reindexing. At 5k,
index rebuild is 68.7 ms p50 and Pixi update CPU about 2 ms per view. Lookup
cost excludes index creation. A Node-only 1k edit diagnostic counts three
snapshots/restores and two model JSON reads. Next priorities are full-document
staging/model allocation and cold bulk seeding, then incremental indexing.
These are diagnostics, not a before/after optimization result.

Client time includes synchronous engine/History/enqueue and excludes deferred
views. Target-ID convergence is timed separately from whole-model equality.
Cold wall includes seeding, startup and tools, not isolated first paint. Pixi
CPU/rAF metrics do not establish GPU completion or physical display latency.

**Execution and limits.** `npm run dev:graphic` starts the private server on
loopback port 5420; `GRAPHIC_PORT=0` selects a free port. With the server running,
use `GRAPHIC_URL=http://127.0.0.1:5420 npm run check:graphic` and
`GRAPHIC_URL=http://127.0.0.1:5420 npm run bench:graphic`. Manual preview:
`http://127.0.0.1:57215/?doc=graphic-studio-live&size=sample` (owned exec session
98844), opened in a new IAB tab. Test server 56412 (session 83580) retains
synthetic proof rooms. Other user services/tabs are preserved. Both servers are
memory-only; no durable graphic server restart or unconfirmed-refresh recovery,
production auth, local-only canvas mode, Rust/WASM canvas adapter, actual OS IME,
or remote production networking acceptance is claimed. Current changes are
uncommitted; no push, npm publication or hosted docs deployment was performed.

**Spreadsheet clarification.** Current `grid` is a document table. Its JSON
projection expands rows × columns, including blank/covered cells; this differs
from internal token allocation. Large worksheets need sparse cells, implicit
blank axes/ranges, non-default overrides, stable axis identities, and bounded
queries. Virtual rendering and a `SpreadsheetSchema` alias are insufficient.
No spreadsheet implementation is part of this change. The schema guide now
explains this boundary.

**Evidence.** New source seal, compressed raw functional/performance receipts,
geometry/session tests, full-suite/types/package/release/docs logs, emitted build
proof and diagnostic records are under
`docs/reports/graphic-demo-2026-11-03/`. Original failed harness runs and earlier
bundle timings remain under `output/graphic-demo-proof/`; earlier report folders
are unchanged. Final screenshots were visually inspected. The independent
follow-up Sol High review could not run due model capacity; this is not an
independent final-review approval claim.


## 5.119 Schema documentation category and experimental sparse-sheet S1 (2026-11-03)

**Requests.** Explain graphic completion, new schema types, documentation,
performance and Rust/WASM application. Add a Schemas category. In parallel,
research and begin Excel-style collaboration without allocating every blank
cell. Sol Medium handled navigation/examples and independent tests/measurements;
Sol High handled the sparse representation, exact writer fences and validated
state/history replay. Root reviewed source, checked native SDK and integrated
reports. Existing uncommitted work and previous source seals remain intact.

**Graphic/engine status.** `GraphicSchema`, stored `container`, minimal
`fixtures/graphic-schema.ts` and complete `fixtures/graphic-canvas-schema.ts`
exist in TypeScript. The private PixiJS editor supplies frames/groups,
rectangle/ellipse/plain labels, transforms and independent peer editing. This
is not a completed Figma engine: vector paths, layout constraints, nonuniform
transforms and graphic Rust/WASM support are absent. The preceding 20 Chrome
functional checks remain source-bound proof; graphic runtime did not change.
The 5k client/convergence medians remain 649.7/1,570.3 ms, INVESTIGATE.

`experiments/rust-sdk` supports six closed document presets. `Shapes` means
document group/inline/span, not graphic shapes. Fresh isolated stable-toolchain
SDK tests pass **13/13**. Initial Homebrew cargo/toolchain-cache attempts failed;
no Rust source changed and no old target was cleaned. No complete WASM CRDT or
ClientEngineFactory ships. WASM storage calls do not provide schemas, shared
History, transport or editor integration. A new support matrix in the Rust guide
states the runtime-schema/container, full engine, factory, scene adapter and
mixed TS/WASM proof gates. No new Rust/WASM canvas benchmark is claimed.

**Sparse implementation.** `experiments/sparse-sheet/src/sheet.ts` is a private
standalone primitive using public Clock/Ticket comparison. Extent is two counts;
blank axis/cell arrays are absent. Cell/field coordinates address the same
register even on concurrent first writes. `value`, `formula`, `fill`, `bold`,
`numberFormat` are independent LWW fields; explicit null retains clear metadata.
Atomic receive validates IDs and batches, detects conflicting same-ticket
payloads including losing writes, and accepts exact duplicate delivery. Local
History checks exact stamps, including peer same-value fences, with linked
states for consecutive undo/redo. Pending acknowledgement uses an exact prefix.
State restoration validates/replays the journal and derived checkpoint before
replacing live state. Own-actor forks are unsupported. Peers must pre-agree
sheet identity/extent/policy; snapshots require trusted storage.

This does **not** add a public SpreadsheetSchema domain, Client, DocHub, wire
extension or editor binding. Existing document/graphic rules and production
runtime files are unchanged. No formula calculation or axis editing is implied.
The design avoids pretending current dense grid or graphic object insertion
already solves coordinate identity. Numeric coordinates remain fixed until S2.

**Checks.** Independent sparse tests **18/18 PASS**, including huge blank/far
cells, deterministic first-write ties and shuffled delivery, field merge,
exact retry and losing-ID conflicts, linked undo/redo, foreign same-value
preservation, mixed invalid batch/state atomicity, clear tombstones, bounded
ranges, pending prefix and restart/retry, and a three-replica ticket oracle.
Standalone strict NodeNext source/test types pass (experiments are excluded
from root tsconfig). Four benchmark correctness cases pass. Docs **40/40 PASS**,
including the actual runnable repository-root sparse example. Production full
workspace **1,419 PASS/two SKIPs** is the preceding unchanged-runtime checkpoint,
not a fresh integrated spreadsheet run. Browser sheet/HTTP/restart durability,
WASM and full Rust differential comparison are NOT_RUN for this primitive.

**Allocation/performance.** A 1,000,000,000 × 1,000,000 blank extent captures as
251 JSON bytes with zero registers. Four far/tiny writes use 2,940 bytes. With
1,000/10,000 written cells, JSON captures use 693,799/7,204,800 bytes; 10,000
point reads take 12.49/18.98 ms. At 10k writes, capture is 58.59 ms and a sparse
full-range scan 8.06 ms. The observed 10k heap delta is 17,997,992 bytes. These
are single Node 24/M3 Max samples, not distributions or performance acceptance.
Small GC heap deltas can be negative noise. Range scans are O(retained field
registers), captures copy full state, restores replay all history, and journal/
ledger/tombstones/History grow without GC. JSON byte counts are not heap bytes.

**Docs and queue.** Top navigation is Guide, Schemas, Editor integrations,
AI & bots, Reference. Existing schema page URLs are preserved and assigned to
the new sidebar. `schemas/index.md` distinguishes domains and fixtures;
`schemas/spreadsheets.md` has the runnable S1 example, limitations and S1–S6
queue. S2 interval axes/stable IDs and row/column edits is next; S3 shared
Schema/Client/protocol/History integration; S4 formulas; S5 virtual sheet UI,
HTTP/recovery and Chrome; S6 Rust/WASM and release gates. `performance.md`
separates graphic latency from sparse allocation observations. The report at
`docs/reports/sparse-sheet-2026-11-03/` retains source hashes and raw evidence.
No commit, push, npm publish or hosted docs deployment was performed.

Final §5.119 documentation check: **50 pages / 2,255 internal links PASS**, all
English, local paths excluded. The built docs Chrome smoke passes five route/
active-menu checks, Document/Graphic/Spreadsheet order and mobile 390px overflow, with zero page/console errors;
this does not qualify a sheet editor. Screenshot was visually inspected. A first
harness wait targeted an incorrect heading; its failure note is retained.
Built preview: `http://127.0.0.1:62051/doc-sync/schemas/` (owned exec session
11214). Existing dev docs port 5415, graphic previews and user tabs are preserved.
The owned headless docs proof session is closed. All 163 package source/test
hashes covered by the preceding graphic seal are unchanged. Its old full-suite
and Chrome results remain evidence for those unchanged files, not new sheet
integration checks.

The final schema sidebar and landing content follow **Document → Graphic →
Spreadsheet**. `schemas/document.md` adds the Document overview, while existing
graphic and spreadsheet URLs remain unchanged. All three are under Schemas.
The public schema union still has only document and graphic domains; the
spreadsheet implementation remains the isolated S1 primitive.


## 5.120 Intrinsic graphic data, native domain APIs and real spreadsheet collaboration (2026-11-03)

**Scope and ownership.** Continues inherited WIP from §5.116–5.119. Sol High
workers implemented/reviewed native graphic and sparse APIs plus standard TS
graphic data/History constraints. Sol Medium implemented VTable HTTP/SSE demo,
proof scripts, docs/examples and the static import harness correction. Root
integrated exports, private dependencies/scripts, checks, source evidence and
roadmaps. No production document merge/placement/history algorithm changed.
The prior162 covered package source/test files are byte-identical; the common
entry adds graphic exports and new files hold the opt-in helpers/schema.

**Library graphic contract.** `packages/doc-sync/src/graphic/` exports
`createGraphicSchema`, `BUILTIN_GRAPHIC_SCHEMA`, typed constructors and Doc-based
stable-ID read/edit helpers. The 17 types cover canvas/frame/group,
rectangle/ellipse/label/path/component/instance/boolean, vertex/segment,
paint/gradient-stop/stroke/source-ref/instance-override. Standard attrs include
six affine coefficients, size/visibility/locks/opacity, vertex/curve handles,
solid/gradient/image paint data, strokes and reference records. Consumers do not
need custom schema declarations for these standard data. Existing
container/atom/text storage is reused; no new low-level Shape enum is claimed.

Override assignment is one atomic `{property,value}` register, with targetId
separate. This fixes the review's invalid concurrent property/value composition.
Helpers validate exact payload/type/bounds; raw core AttrSpec only checks the
outer atomic object. Native pinned validation follows the stricter helper
contract. This is not a generic new wire validator. Helpers require Doc; an
engine-neutral Client object-read/ID-edit port remains open. Layout attrs store
intent, Boolean records store sources, and instance records store references;
there is no new renderer/layout/Boolean solver/effective-instance expansion.
The old PixiJS minimal canvas and its measurements are preserved separately.

**Native Rust.** Existing Document six presets remain. `GraphicDocument` uses
`GraphicPreset::Canvas` or `Builtins`; `with_preset` selects the pinned 17-node
manifest that equals the frozen TS contract. Native Token/RGA/LWW/deletion,
movement projection and History are reused. UTF-16 labels include surrogate
units and declared marks. Positive-ticket actors use a checked ASCII profile;
invalid births/moves fail without mutation. `SparseSheet` adds the independent
fixed-axis sparse register/history/checkpoint API. All native checkpoints retain
pending retry and actor ownership within their documented API. No arbitrary
runtime schema, portable Client factory, graphic selections, exact graphic wire
or cross-runtime network exchange is qualified. WASM is still storage-only.

**Actual spreadsheet example.** `apps/demo/spreadsheet/` and scripts
`dev:spreadsheet`, `check:spreadsheet`, `bench:spreadsheet` provide two independent
TS sparse actors/Histories over HTTPPOST/SSE. Logical extent1,048,576×16,384
uses no dense model; VTable gets at most 100 × 26 view records. UI supports native
cell input, dirty-field inspector, rectangular presence and actual remote
shading, local undo/redo, held inbound concurrency, far jump and live reconnect.
Active native/inspector drafts survive remote updates. Actor/token/epoch/exact
schema policy/request sequence checks and a 20,000-retained-op cap bound each
room; exact accepted retries return their original receipt once. Epoch mismatch
preserves pending state and blocks unsafe reuse. This is a private protocol,
not public SpreadsheetSchema/Client/DocHub. The server is memory-only; no server
restart/reload recovery, structural axes, formula evaluation or GC is claimed.

**Dependency decision.** VTable 1.26.8 and editors 1.26.8 are private demo-only.
Univer and Glide were considered; official model/editing docs informed the
bounded adapter choice. Scoped overrides fix the new dependency chain to
lodash 4.18.1 / minimist 1.2.8. Final named-demo production audit reports zero
vulnerabilities. Core remains free of editor/Pixi/VTable runtime dependencies.
Five tarballs and seven consumers pass. Changesets rehearsal passes in a copy;
source versions and lock are unchanged by rehearsal. No release is performed.

**Tests.** Final coordinated workspace: **1,445 cases, 1,443 PASS, two platform
SKIPs, zero FAIL**. Core 1,044, Lexical 7, Slate 4, bot 53, demo 115, docs 41,
MCP 181 / 179 PASS. New graphic 12/12, independent TS sparse 18/18, new demo 8/8 pass.
Root types, packed consumers and isolated release rehearsal pass. A first full
run failed only because an old regex import scanner interpreted the literal
`from` as an import; AST parsing fixed the harness and fresh full rerun passes.
An initial typecheck overlapped declaration rebuilding; stable rerun passes.

Native SDK **42 PASS** (Document 13, Canvas 7, Builtins 7, sheet 14, unit 1); existing
shadow **75/75 PASS**. Canvas comparison **20 actions/40 normalized states**;
Builtins **35 actions/70 normalized model+History states**, with exact manifest.
Sheet final-source comparison **31 actions/62 states** checks exact operations,
models, full History/pending/journal/checkpoint. These are different boundaries;
no graphic exact-wire or WASM claim follows. Printed native Canvas/Builtins/
sheet examples compile and run. Independent P1/P2 focused closure observations
were reported without saved raw repro logs; the report states this limitation.

**Chrome.** Final functional **21/21 PASS**: trusted VTable edit and actual peer
values/styles, focused/active draft preservation, deterministic held first-write
conflicts and independent fields, consecutive own undo/redo, observed peer
same-value fence, actual rectangular shading, XFD1048576 input/clear in a bounded
window, offline pending/reconnect, independent Node state oracle, distinct actor
HTTP submissions and separate SSE streams, zero page/console errors and 390px
no horizontal overflow. Browser makes zero state-oracle GETs. Style-only refresh
and option-preserving jump defects were found and fixed; earlier failed runs
remain separate. Final emitted bundle SHA:
`a8ecd1f914c8611d467450d185839b768de165de13168411f7c3e8126307045c`.
Screenshots were visually inspected. Owned proof browsers are closed.

**Receive performance correction.** Logical extent is not stored data. The
benchmark's10k means10k populated cells, not10k blank coordinates. Requests
already sent changed ops only, but the original server copied/replayed the full
retained state for every batch. The UI also called full getRange merely for
status counts. Both unnecessary hot paths are removed. A bounded ticket index
preflights new request identities, then calls atomic SparseSheet.receive;
exact prior request receipts remain first. Index/log/receipt changes occur only
after successful validation. Tests at1k/10k prove zero capture/restore calls,
invalid mixed/fresh-prefix collision atomicity, and preserved retry/epoch rules.
View summary reads constant-size stats including pending count without cloning
pendingChanges. Active edit/remote refresh getRange calls are zero.

Backend-only ABBA holds the UI bundle and immutable harness/data fixed:

| Run | Handler | 1k peer p95 ms | 10k peer p95 ms |
| --- | --- | --- | --- |
| A1 | full replay | 51.4 | 287.0 |
| B1 | incremental preflight | 21.1 | 33.8 |
| B2 | incremental preflight | 26.2 | 33.7 |
| A2 | full replay | 38.8 | 285.9 |

The paired10k reductions are88.2% (8.49×/8.48×). Original handler, rehosted
import/HERE-only adapter and exact phase1 source/bundle hashes are retained.
Workspace source metadata in the old raw harness is not the executed backend;
the ABBA wrapper pins actual handlers. Phase1 optimized functional20/20 passes.
The second phase changes UI summary only and has its own bundle/receipts:

| Stored cells | Sparse edit p50/p95 ms | Peer convergence p50/p95 ms | Maximum view render CPU p95 ms |
| --- | --- | --- | --- |
| 0 | 0.1/0.3 | 12.1/23.8 | 5.9 |
| 1,000 | 0.0/0.1 | 12.8/27.1 | 5.1 |
| 10,000 | 0.1/0.2 | 17.9/26.8 | 5.4 |

Chrome156/M3Max/1720×1080; fresh browser/room per size,3warmups+10samples.
Convergence waits for sender ack and addressed peer value. Full sparse equality
and Node oracle run after timing. Sparse edit includes History/pending; zero
readings reflect timer resolution. GPU completion/physical paint are not
measured. Cold wall2.41/1.49/1.96s includes Chrome/CLI startup;10k seeding276.6ms
is separate. Final observations are not merged into the backend-only ratio.
No production latency budget, WAN or100k-populated-cell gate is claimed.
Initial joins/exports/ranges/retention still scale; GC/durability remain open.

**Roadmaps and docs.** Document→Graphic→Spreadsheet category order remains.
`docs/spreadsheet-roadmap.md` preserves S1–S6; S5a early real-transport preview
does not close S2 interval/stable axes or S3 common schema/Client/wire. S2 is the
next structural priority, then S3, formula/calculation, durable resource handling
and full native/WASM client parity. `docs/graphic-roadmap.md` separates stored
data, effective references, geometry/layout/rendering, pinned native profiles
and WASM. Runtime arbitrary schemas remain D2 work. Docs 41/41 pass; build 50 pages /
2,273 links passes English/local-path checks. Runtime API examples execute.
No hosted deployment is performed.

**Run and evidence.** `npm run dev:spreadsheet` defaults to 5422; use
`SPREADSHEET_PORT=0` for an assigned port. Proof commands accept SPREADSHEET_URL.
The original manual preview remains at
`http://127.0.0.1:51497/?room=collaborative-sheet-live`(exec40650). A separate
optimized preview is open at
`http://127.0.0.1:58318/?room=collaborative-sheet-optimized`(exec60445), with twelve
confirmed sample cells copied. Original pending edits and History remain in the
original tab/server; no live migration or tab replacement is claimed. Baseline
and proof services retain isolated synthetic rooms; user services/tabs remain.
The new `docs/reports/domain-delivery-2026-11-03/` records raw compressed proofs,
source seals, exact measured hashes, findings and unsupported gates. Historical
reports are not rewritten. No commit, push, npm publication or release occurred.

Final §5.120 built documentation Chrome smoke passes four routes (Schemas,
graphic contract, Rust engine, sparse-sheet demo guide) and their active
categories, with zero page/console errors. The source seal includes the final
S1–S6 and graphic roadmaps. The manual sheet preview remains open in IAB.

Final static UI cleanup for §5.120 removes explanatory intro/footer layers and
keeps the Memory only badge. JavaScript and widget dimensions are byte-for-byte
unchanged. A separate clean-UI functional receipt passes21/21, including zero
normal-refresh full-range reads. Timings remain bound to the preserved phase2
HTML/CSS and exact same JS/widget size; no post-cleanup timing rerun is claimed.
The final optimized tab is a separate confirmed-data copy; original local
History, draft and pending state remain in their original preserved tab.


### 5.121 Custom schema definitions and editor-specific mappings (2026-11-03)

**Request and design.** Define custom schemas without forcing every editor to
have the same native model. Shared data descriptors define types, defaults,
constraints and child rules; view profiles declare rendering/input/selection
support separately. Existing schema.ui remains valid and fingerprint-bound.
Tree Schema remains Document | Graphic; legacy document fingerprints and
collaboration semantics remain unchanged.

**TypeScript API.** Root core exports experimental SpreadsheetSchema,
createSpreadsheetSchema, assertSpreadsheetSchema, spreadsheetSchemaVersion,
DEFAULT_SPREADSHEET_SCHEMA and SparseSheet. The experiment path re-exports the
same implementation. Fields accept string/number/boolean/scalar, bounds,
non-null choices and UTF-16 maxLength. getCellValue resolves defaults without
allocating. Null clears. Same-coordinate writes merge per field; linked own
undo/redo fences foreign writes, including same-value writes. Arbitrary custom
field names may reuse formula/bold with different types; public cell types no
longer impose the old named field types. Legacy runtime validation stays exact.

Omitting schema preserves legacy v1 ops/state. Supplying any descriptor opts
into schema-bound v2 operations/checkpoints. Descriptor identity is canonical
and key-order independent. Invalid local/remote/replay/schema batches reject
before mutation. There is no live v1/v2 or schema transition. Sheets remain
standalone: no Client, DocHub, public wire, axis edits, formulas or GC.

createGraphicHelpers(schema) binds custom container/text/atom nodes to actual
Doc IDs. It validates the supplied schema/node/content, resolves fresh paths
and rejects missing IDs instead of rebinding. Built-in specialized helpers are
unchanged. Custom ID lookup traverses visible objects, and some destination
checks project a model; no indexed/O(1) object lookup or Client port is claimed.

/editor exports inspectEditorSchema and inspectSpreadsheetSchema with explicit
capability types. Missing mapping is an error; opaque/preserve is a warning.
These are declaration preflights, not installed or verified renderers. A custom
Document fixture roundtrips native ProseMirror, Slate and Lexical state and
creates Tiptap extensions. PM/Tiptap reject normalized-name collisions and the
reserved native text name before construction. These are headless checks,
not browser qualification of all four custom-node interfaces.

**Native subset.** RuntimeSchema/RuntimeDocument accept owned descriptors for
Graphic container/text/atom and flat Document root-flow/text/atom with renamed
nodes/attributes, scalar document attrs, boolean marks and supported graphic
field registers. RuntimeSheet/SpreadsheetSchema own arbitrary scalar fields.
The old preset/Canvas/Builtins/legacy-sheet APIs remain available. Unsupported
nested document shapes, value marks and advanced rules reject with a path.
This is partial D2, not its all-shape/product-schema gate. No native live schema
transition, production Client/WASM factory, renderer or network adapter ships.

Independent review found an integer identity collision. Native tree admission
now rejects integer tokens not exactly representable by JavaScript Number,
including UI/constraint positions, so distinct retained defaults cannot share
a rounded identity. Regression covers unsafe signed/unsigned values and keeps
representable boundaries. Canonical tests also cover float thresholds, -0 and
UTF-16 key ordering. serde_json float_roundtrip is enabled; source versions and
resolved toolchain paths are retained in the final native receipt.

**Demo.** ?profile=tasks provides title/progress/archived; ?profile=sensors
provides reading/unit. A separate view profile chooses the native primary field
and typed inspector controls. Custom fields do not implicitly become CSS via
legacy fill/bold names. Default protocol/META remain unchanged. A room's first
valid descriptor and canonical identity bind its operations; later mismatches
reject before server mutation and preserve local pending state. Normal refresh
retains bounded viewport/constant-size summary and zero full-range reads.
No live profile switch, reload durability or server persistence is provided.

**Final verification.** Aggregate of latest applicable workspace suites:
1,464 cases, 1,462 PASS, two expected platform SKIPs, zero FAIL. Core1059,
Lexical7, Slate4, Bot53, Demo118, Docs42, MCP181/179PASS. The first full invocation
failed only an obsolete docs navigation expectation; it was corrected and all
42 docs rerun PASS. Other unaffected passing suites are reused, not relabeled
as a new monolithic run. Final focused schema/editor/sheet-demo26/26 and sparse
experiment23/23 pass. Root tsc and five-package consumer/artifact checks pass.
Native SDK48/48 and shadow78/78 pass. Six independent runtime descriptors in one
native build/process cover Graphic30+Document26+Sheet26 actions and164 actor
states. Tree comparison normalizes models and History availability; no exact
cross-runtime tree wire claim. Sheet comparison is exact for ops/model/stats/
pending/journal/full History/checkpoints. Invalid Document op tests use TS
Doc.check, because raw Doc.edit does not provide that preflight.

Final Chrome156 default21/21 and custom29/29 pass on the exact same bundle:
172f710a0c70b4980283d27ec27a56eb1ab243af482ccf8cfbe4fc48eb576095.
Coverage includes trusted native keyboard/pointer input, typed controls, peer
projection, active drafts, dirty-only foreign-field preservation, own History,
pending/reconnect, mismatch atomicity and zero normal getRange calls. No page
or console errors. Screenshots visually inspected. Early failed harness
selection attempts with nonempty defaults are retained separately.

Current default-profile Chrome observation (M3Max/1720x1080,3warmups+10samples):
0/1k/10k populated cells have peerp95 18.2/18.9/18.8ms, sparse-editp95
0.2/0.2/0.1ms, max-view-CPUp95 3.6/4.1/4.2ms. This is a regression observation,
not paired speedup against §5.120. Physical paint, WAN,100k populated cells and
custom long histories remain unqualified. Full equality/oracle run outside timing.

**Docs and run.** Schemas→Custom schemas and editor mappings contains executable
Document/Graphic/Spreadsheet examples and per-editor mapping guidance. Rust
runtime_quickstart.rs runs directly through Cargo; guide includes the complete
program and support matrix. Preset-only statements in editor guides were
corrected. D2/S3 remain partial in roadmaps. Docs42PASS, final build51pages/
2346links passes English/local-path checks; Chrome156 smoke passes three routes
and correct categories with zero errors. No hosted deployment occurred.

npm run dev:spreadsheet prints the loopback address. Choose a fresh room with
?profile=tasks or ?profile=sensors. Native commands:
cargo run --offline --locked --manifest-path experiments/rust-sdk/Cargo.toml
--example runtime_quickstart; node experiments/runtime-schema-native/compare.mjs.
The harness discovers rustup via PATH or RUSTUP, and uses stable by default or
RUNTIME_SCHEMA_TOOLCHAIN. Production engine remains TypeScript.

Evidence and source seal: docs/reports/custom-schemas-2026-11-03/. Final native
raws: output/runtime-schema-native-final-20261103/. New isolated preview servers
58545(exec65788) and62675(exec10133) remain available. Earlier user tabs, original
pending/History and services remain untouched. No commit, push, registry
publication, migration or release occurred.


### 5.122 Tested checkpoint before Spreadsheet S2 (2026-11-03)

At the user's request, inherited current changes are committed before S2 code
starts. A fresh full workspace invocation passes 1,464 cases: 1,462 PASS, two
expected SKIPs, zero FAIL. Root tsc and git diff --check pass. Source seal601
matched before current Graphic/Rust roadmap wording was corrected. Package
migration/inventory and evidence archive checks found no commit blocker.
The checkpoint includes all inherited current changes; older reports remain
immutable. The exact SHA is recorded by the subsequent S2 delivery section.
No push or package publication is part of this request.

S2 will be opt-in, with stable row/column IDs, compressed initial axis intervals,
insert/delete/move, selective structural History, and unchanged legacy S1 paths.
Before this checkpoint, S2 agents only performed read-only design work.
Evidence: docs/reports/spreadsheet-s2-2026-11-03/baseline.md.


### 5.123 Spreadsheet S2 stable axes, structural History and desktop proof (2026-11-03)

**Checkpoint first.** Before S2 implementation, all inherited work was committed
as 9334e591e25e9ff641eed8c6cd7c65ce9de4724a after a fresh full workspace
invocation passed 1,464 cases: 1,462 PASS, two expected SKIPs, zero FAIL, plus root
tsc. Current Graphic/Rust roadmap wording was corrected; historical reports
were preserved. That is the only commit made for this request. No push.

**Parallel ownership.** Sol High designed/implemented axis.ts and reviewed the
wrapper's CRDT/reference boundaries. Sol Medium implemented StructuralSheet,
cell History/state, demo/HTTP/browser work and independent property/performance
checks. A separate Medium lane diagnosed the existing recovery-start test race.
No existing user tabs, original pending/History or preview bundles were migrated.

**S2 API.** Root exports StructuralSheet and StructuralSheetOptions/Op/State,
StructuralCellOp/AxisOp and AxisId/Span/Action types. Fixed-axis SparseSheet and
its v1/v2 serialization are unchanged. S2 uses doc-sync-structural-sheet-v1.
Each initial axis is one implicit interval. Stable IDs are source+offset within
the initial or inserted run; row/column namespaces are distinct. Cell registers
key the stable pair and field, so structural edits do not rewrite cells.
rows/columns report current visible extents; ID/index mapping returns -1 for
hidden/absent IDs. getCellById can inspect retained hidden cells; local
setCellById rejects a hidden or missing target. Remote valid offline writes
remain retained under deleted axes. Custom SpreadsheetSchema is supported.

insertRows/Columns, deleteRows/Columns and moveRows/Columns capture observed
identity spans. Numeric move destination refers to the axis AFTER target
removal. Concurrent unseen inserts are not added to the observed target set.
Axis actions replay in Lamport/actor Ticket order over split/coalesced intervals.
Moves extract exact IDs and place before a stable anchor, avoiding graph cycles
for opposing moves. Hidden anchors remain retained. Undo/redo toggles only the
owner's original structural action; peer moves/deletes/inserts remain active.
Cell undo retains S1 exact-writer fences and linked compensation, including
foreign same-value writes and consecutive own History. One local History and
one Lamport clock cover cells and both axes.

**Validation and recovery.** Entire batches validate before mutation. Identical
retries are no-ops; conflicting ticket payloads, actor forks, wrong schema,
unsafe values, cross-axis/nonbirth/overrun references and invalid toggles reject.
Stable cell keys ignore JSON property order. Client receive may retain unseen
earlier causal references for delivery-order independence. Strict server receive
requires known references for fresh ops from room creation. Global indexed
references validate same-batch dependencies and completion of prior unresolved
sources; rejected batches do not leak into the reverse index. Strict mode does
not retroactively revalidate unresolved duplicates previously accepted in
default mode. Invalid arbitrary operation unions have no convergence guarantee.
State restore replays journal and verifies clock, axis/model registers, History
and exact pending operations. Acknowledgement requires an exact pending prefix.
Validation is consistency proof, not checkpoint authenticity or durable storage.

**Demo.** ?axes=stable selects S2 at construction in a fresh room, optionally
with profile=tasks/sensors. Protocol and schema mismatch reject before mutation.
Input and inspector targets capture stable IDs; remote insert/move does not
redirect a draft. A deleted target retains the actual native input and blocks
commit to a neighbor. Dirty blurred inspector drafts survive refresh. Selection
range endpoint IDs drive native VTable border and remote presence projection.
Native selection restoration waits for active input commit/cancel. Programmatic
restoration suppresses selected events and preserves dirty drafts/presence.
VTable internal range flags are normalized before comparison. Bounded viewport
and summary remain; normal edit/structural refresh getRange calls are zero.

**Final tests.** Fresh qualified workspace command
npm run test --workspaces --if-present (using the already built/frozen packages)
passes 1,511 cases: 1,509 PASS, two expected platform SKIPs, zero FAIL. Counts:
Core1099, Lexical7, Slate4, Bot53, Demo124, Docs43, MCP181/179PASS. Root tsc,
git diff --check and package consumer/artifact checks pass. Axis6 tests include
an independent dense-ID oracle,70 mixed actions and20 shuffled deliveries,
100 concurrent action permutations and a billion-row one-run check. Structural
wrapper14 tests cover cell writer fences, own structural History, hidden cells,
atomic invalid batches, references, JSON ordering, exact replay/pending and
accessor rejection. Property20 seeds each author40 mixed operations and compare
five shuffled delivery replicas plus restore/pending. Native core is unchanged
from the already qualified pre-S2 checkpoint; no Rust structural-axis parity.

An initial full run failed the preexisting bot-recovery-start test: persisted
needs_attention precedes session close/claim release and controller unblocking.
The test now waits within its existing deadline for actual API settled status,
retaining pending=null and unchanged-restart assertions. Production recovery
code is unchanged. An intermediate demo rerun overlapped package prepack and
failed four imports while dist was being recreated; final tests ran with frozen
artifacts and pass. The docs build had the same initial dist race; sequential
build succeeds. Failed logs are retained, not relabeled as passing.

**Desktop Chrome.** Same final emitted bundle
ada76174d37af1d18edb2ecf57caa3f6b27004b8aa2135fef904564e78409aa9
passes desktop acceptance76: structural21, S1 default20, custom29, Escape6.
Raw pre-steering receipts have78 checks including two completed mobile checks.
The user's subsequent instruction excludes mobile; those two are excluded from
current acceptance. No mobile browser action ran after the instruction. Browser
CLI scripts now default to desktop; the gated mobile branch was syntax-checked
only. Exact executed script copies and hashes remain with their raw receipts.

Chrome checks trusted native input, row/column controls, own undo/redo, drafts,
actual rectangular borders/presence/shading, zero full-range reads and exact
Node server oracle equality. Page and console errors are empty. Desktop
screenshots inspected. An initial native border remap defect was fixed. Earlier
headless tests stalled waiting for frames; final proof explicitly requests
screenshots before view assertions and bounds nonessential frame probes. It
does not measure latency, GPU completion or physical paint. Active-input border
remap is deliberately deferred to preserve the real draft.

**Node diagnostic.** Nine fresh --expose-gc Node24.22.1 processes on M3Max test
extents1k/1m/1e9 × histories0/25/100. Initial axes each have one run, no registers
or operations, observed post-GC delta5,584–6,120 bytes (noise included). Point
editp95 .0404–.0529ms; capturep50 .865–1.746ms; replayp50 11.506–53.391ms.
Capture/replay fixtures include120 retained warmup/sample point writes; replay
excludes JSON parse. Structural replay grows with retained history. These are
Node observations, not a production budget or browser performance acceptance.
Some untimed S2 view CPU diagnostics exceed a frame; view projection still needs
dedicated profiling. No matched speedup, WAN, long-history, GC or Rust/WASM
performance claim is made.

**Docs, run and evidence.** Schemas→Spreadsheet→Stable rows and columns gives
a runnable public API recipe, move convention, ID/deletion/History semantics,
strict admission and explicit boundaries. Roadmaps mark TypeScript S2 and keep
S3 Client/protocol/recovery, native S2, formulas, GC and browser performance open.
Final docs43/43PASS and build52pages/2400internal links pass English/local-path
checks. No docs browser rerun or mobile testing followed the user scope change.
Run npm run dev:spreadsheet and open ?axes=stable&room=stable-example. The final
isolated qualified preview remains at http://127.0.0.1:5438 (exec66923), with
output/spreadsheet-s2-qualified. SPREADSHEET_OUTPUT_DIR isolates build/server
artifacts; older user bundles/services remain untouched. The memory-only demo
has no page-reload/server-restart durability or live schema/axis-mode switch.
Evidence: docs/reports/spreadsheet-s2-2026-11-03/. Raw browser overview:
output/spreadsheet-s2-qualified/verification.json. Node diagnostic:
output/spreadsheet-s2-node-performance-20261103/receipt.json. S2 changes remain
uncommitted. No push, npm/Cargo publication, release or hosted deployment.


### 5.124 Per-user spreadsheet ranges and ephemeral live input (2026-11-03)

**User steering.** Show actor-specific selection colors and typing before Enter.
Explain whether intermediate state belongs to a schema. The latest standing
instruction prohibits mobile testing; none was performed in this checkpoint.

**Architecture.** Accepted values keep the existing schema/CRDT/History path.
Typing, cursor/range and composition state use a separate ephemeral Presence
message contract. The view combines committed model plus temporary previews.
No DocumentSchema/GraphicSchema/SpreadsheetSchema flag, new data shape, schema
fingerprint change or CRDT operation was added. Partial raw numeric text may be
previewed while the accepted number remains unchanged. This is private demo
session/transport/view work; a universal public draft API across all bindings
and domains is not delivered. Durable user drafts need separate persistence.

**Protocol.** New presence.ts supplies bounded identity/preview types. Session
adds name/color, preview(target,field,text,{composing}) and clearPreview. Existing
presence(range) remains compatible. Target IDs captured at edit start follow
S2 structure. Preview text max8192UTF16, name/color/field/mode/schema/target and
actor/token/epoch validate before mutation. Per-actor presence sequence rejects
stale messages. One in-flight request and50ms coalescing/trailing updates bound
client queuing;100 generated drafts use at most two requests in the unit test.
Presence cannot change document clock, pending, server acceptance sequence,
cell registers, journal or own History. Cancel/disconnect clears; a new stream
clears prior draft, and stale stream close cannot erase a newer stream.
No durable preview persistence, production TTL/resource guarantee or new auth
permission model is claimed.

**View.** Alice blue3975c5 and Bob red d64b55 drive range tint/border and preview
text. Generic actors use a deterministic palette, which can repeat. Primary
and formula drafts show raw text; other field drafts show field:text. Peer
projection is cached once per refresh. Actual input/draft is protected. Native
editing opened on a peer preview starts from own committed value, not peer
text. Invalid final values and active composition keep native input open.
Inspector blur clears shared preview but retains local dirty fields; focus can
republish, Escape restores latest committed values. Stable delete hides preview
and blocks writes into neighbors. Only confirmed edits enter ordinary History.

Two actual UI lifecycle defects were fixed: delayed cleanup of an older editor
could clear a newer target; and blurred dirty S1 inspector input could reset
when its own preview-clear refreshed the view. Guards now protect both modes.
The original user5438 tab/bundle and unsaved draft/History were preserved.

**Tests.** Full workspace1516cases=1514PASS/two expected platform SKIP/zeroFAIL:
Core1099, Lexical7, Slate4, Bot53, Demo129, Docs43, MCP181/179PASS. Final
affected Demo129/129 and root tscPASS after last UI changes. The five new real
HTTP/SSE cases validate unchanged before-commit model/clock/history/pending/log,
identity/color, atomic malformed/stale messages, stable move/delete, coalescing
and cancel/reconnect/older-stream cleanup. Core engine source is unchanged from
S2. Docs43PASS, build52pages/2404links passes English/local-path checks.

**Desktop proof.** Same JS bundle
9a2218517d3e2a1bc6060da8a2b40747463d0c11dbce14c1a2ce4eb1045f688d
passes92desktop checks: live16, default20, custom29, stable21, cancel6. Raw
regressions use5448; final live run uses a fresh58880 server. Trusted native and
inspector typing shows on the peer before commit while exact model/accepted log
remain unchanged. Empty draft, peer-preview editing baseline, Escape, one-action
commit+undo/redo, raw formula, dirty blur, blue/red scene fills, disconnect,
S2 move/delete and incomplete numeric Enter all pass. Page/console errors0.
Composition events are simulated; real OS IME NOT_RUN. Mobile NOT_RUN.
Desktop screenshots visually inspected. No latency/GPU/physical paint claim.

Earlier harness select-all shortcuts, Node fetch keepalive and headless frame
waits failed. Final proof uses trusted Home+Shift+End, node:http agent:false,
exact latest actor/range acknowledgement and bounded frame requests before
view assertions. One repeated test server hit its intentional room cap; a fresh
isolated process completed the proof. Prior failures and an explicitly
INTERRUPTED attempt remain distinct. CSS trailing whitespace cleanup changed
no semantic style or emitted JS. No runtime change was made to fake a frame.

**Docs/run.** Custom schemas guide separates stored data and live interactions;
Presence guide documents the private protocol and limits. Evidence and source
seal: docs/reports/spreadsheet-live-presence-2026-11-03/. Browser overview:
output/spreadsheet-live-presence-demo/verification-final.json. Fresh preview:
http://127.0.0.1:58880/?axes=stable&room=live-presence-review (exec11090).
Shared Client integration, durable recovery, formula evaluation, GC, native/WASM
S2 and browser latency/resource qualification remain open. Baseline9334e59 is
the only new commit; S2 and presence changes remain uncommitted. No push,
publication, release, old-tab migration or hosted docs deployment occurred.


### 5.125 Ordinary peer text and independent selection outlines (2026-11-03)

**Request.** Peer input should look like local editing, without italic styling.
The user supplied an adjacent red/blue border artifact. Mobile tests prohibited.

**Cause.** cellStyle colored each cell's four shared grid borders. VTable edge
sharing caused neighboring colors to compete and internal range lines to look
like selection edges. Preview text also forced italic/actor color, and native
InputEditor padding differed from the canvas cell.

**Repair.** Normal neutral text/font preserves stored bold and matches local
input. The native editor derives horizontal padding from the actual cell style
and cell/input rectangles, compensating borders while leaving vertical position
unchanged. Grid lines remain neutral. An input-transparent SVG layer draws each
remote range's original outer edges from authoritative VTable rectangles. Body
clipping excludes headers; scrolling/resizing/window jumps redraw cached peer
projections without enumerating logical ranges. Window clipping never invents
an edge at a cut boundary. Stable insert/move/delete projection is retained.

Exactly coincident remote geometry uses deterministic1/3/5px actor lanes; more
coincidences share inner dashed phases. Unrelated peers do not alter a range's
inset. Native local selection remains owned by VTable. Preview cells and remote
selection cannot change document data or steal focus. Schema/CRDT/server/session
contracts are unchanged by this repair. Source ownership: SolMedium main/style/
geometry and SolMedium independent desktop proof; root docs/integration.

**Verification.** Demo136/136PASS includes geometry7/7. Root tsc and diff-check
PASS. Same final bundle
4a4e90617ff4cf6bfe883bdf1aec3d4c5f2a475f4ead9456ad42e0e04250812c
passes desktop57/57: focused14, clip3, coincidence3, live16, stable21. Error and
console lists are empty. The oracle checks actual SVG/native bounds, adjacent
boxes,2x3 outer-only borders, overlaps, XY scrolling, header/body clip, window
cuts, unrelated-peer invariance and stable row/column edits. Native input and
peer text start72px/72px (tolerance0.5px). Enter's actual selected address and
inspector agree; no new advance policy. Desktop screenshots inspected. Mobile
NOT_RUN. IME in reused live checks is simulated, not a real OS IME claim.

An isolated baseline reproduces forced italic/color and missing independent
outlines. A first browser harness tried JSON serialization of getter-backed
VTableRect and failed; explicit fields fixed it. Earlier initial repair and
final padding/lane receipts are preserved separately. Existing full-workspace
qualification is §5.124; this UI repair uses affected tests rather than claiming
a new full run. No latency or physical-paint qualification is inferred.

**Docs/run.** Presence guide and demo README describe ordinary peer text and
independent outlines. Docs43/43PASS, local build52pages/2404links passes
English/local-path checks. New report/source seal:
docs/reports/spreadsheet-selection-2026-11-03/. Qualified preview:
http://127.0.0.1:50796/?axes=stable&room=selection-review (exec84940). Existing
user58880 and earlier5438 tabs/bundles were preserved with their draft/History;
no live migration or reload occurred. Baseline9334e59 is unchanged. No commit,
push, registry release or hosted deployment.

**Follow-up question.** Remote intra-cell caret/character selection is not yet
shown. Current PresenceEditing carries target/field/text/composing only. The
proposed extension is UTF-16 selectionStart/selectionEnd/direction in ephemeral
Presence plus font/padding-aware rendering, retaining stable targets and IME
behavior. It does not need a data schema or CRDT change. No caret feature code
was added for this question-shaped request.


### 5.126 Remote text carets, character selections and domain checks (2026-11-03)

**Delivery.** Optional editing.selection carries UTF-16 start/end/direction
relative to transmitted editing.text. Equal endpoints mean a caret; backward
selection uses start as its active end. Legacy preview messages remain valid.
Preview truncation avoids split surrogates; offsets clamp to transmitted text
and code-point boundaries. Server validation is atomic before presence/sequence
mutation. Session copies nested selection state. Stable target IDs follow both
row and column insert/move; deleted targets hide rather than redirect.

Native text input publishes input/focus/keyboard/pointer/selection/composition.
Actual control capability determines metadata: raw numeric text in native
InputEditor has a caret; inspector number/color/checkbox/select controls omit
character selection. DOM Range text shaping uses the cell font/padding. Only
the displayed preview winner gets a caret; own native editing suppresses it.
Field prefixes adjust display offsets. Cell/body/window clipping remains; long
text reveals the active caret without copying sender pixel scroll. Presence
cannot change committed registers, clock, pending, acceptance sequence, journal
or History. Only confirmed edits enter the existing undo/redo path.

**Verification.** Affected Demo141/141PASS and root tscPASS. Independent desktop
Chrome68/68PASS: new32 plus live16 and selection/clip/coincidence20, errors0,
sourceDrift empty. Same final bundle:
af5a94cfbe214b7930e3070dea56a50a5e7de501d3def30810089b968e38a5ec.
Seven pinned source hashes match the checkout. Independent DOM Range/cell/body
geometry uses0.75CSSpx tolerance. Hangul/emoji/ZWJ/combining text, trusted native
arrows/mouse drag, backward/empty/long selection, numeric raw input, inspector
prefix/nontext omission, winner/own-editor rules, both-axis changes, scrolling,
window/delete and peer-preserving commit/undo/redo pass. Screenshots reviewed.
Synthetic composition PASS; actual OS IME NOT_RUN. Mobile NOT_RUN. No latency,
physical paint or production resource claim. Prior full-workspace evidence is
§5.124; this delivery does not claim another full run.

**Other domains.** Focused tests54/54PASS (overlap Demo tests; do not sum unique
cases). Domain Chrome7/7PASS: ProseMirror/Slate/Lexical remote token caret/range,
collapse/disconnect cleanup without model/pending/server changes; Graphic native
pointer/object selection, local drag preview/cancel, exactly one accepted edit
on release and peer convergence. Shared remote Document uncommitted text-draft
rendering and remote Graphic drag-preview geometry are NOT_IMPLEMENTED. Tiptap
was not browser-tested in this domain pass. Metadata transport alone is not
proof of a renderer. No core engine or domain production change was required.

**Attempts.** Initial26-case cursor proof predates native numeric capability
correction. A test selected enum without focus; trusted click fixed the harness.
Another repeated navigation stalled pending1; EventSource pool exhaustion is a
hypothesis, not trace-proven. Explicit teardown of own prior sessions and a fresh
owned server completed final32. Preserve these failures separately from final
qualification. Browser-owned64252 and domain58943/58944 servers stopped; user
and root preview servers/tabs remain intact.

**Docs/evidence.** Presence/custom schema guides and spreadsheet README updated.
Official Yjs Awareness, Automerge Repo ephemeral messages and Liveblocks Presence
links explain the established layering pattern without wire compatibility or
universal IME policy claims. Docs43/43PASS; build52pages/2407internal linksPASS,
English/local-path checksPASS. Report/source seal:
docs/reports/spreadsheet-text-cursor-2026-11-03/.
Overview: output/spreadsheet-text-cursor-proof-qualified/browser-summary.json;
domain: output/domain-ephemeral/chrome/receipt.json. Fresh retained preview:
http://127.0.0.1:62007/?axes=stable&room=text-cursor-review (exec67491).
Older user tabs/drafts/History remain untouched. Baseline9334e59 is unchanged;
S2/Presence work remains uncommitted. No push, release or hosted deployment.


### 5.127 Shared Presence state, DOM views and framework adapters (2026-11-03)

**Delivery.** Multi-agent SolMedium ownership: Core state/bridge/tests; shared
DOM renderer and independent Chrome proof/review; React/Vue/Svelte adapters,
SSR/lifecycle tests and playground. Root integrated package/release tooling,
lockfile, public guides, full checks and sealed evidence. All inherited WIP is
preserved. Nine private0.0.0 library packages now build independently: existing
Core/four editor bindings plus Presence UI/React/Vue/Svelte. No actual registry
release, commit, push or hosted docs deployment occurred.

Core `/presence` exports createPresenceStore, connectClientPresence, validated
target/state/draft types and a stable immutable snapshot API. Targets cover
Document token anchors, Graphic IDs/pointer, Spreadsheet stable IDs/ranges.
Draft field/text/composition/UTF16selection is ephemeral. Split-surrogate
endpoints and malformed/oversized state reject atomically. Expiry is explicit
and uses local receipt time; no implicit timer or durable document storage.
The bridge reversibly wraps the owning sender, keeps editor anchors/unrelated
metadata, and uses the existing metadata transport. Mount before editor bindings
or supply current initialPresence. Custom unowned EditorHost calls are only
intercepted through that host. Dispose bridge before store/source. Feature
updates coalesce at50ms, clears are immediate; normal editor sends keep their
cadence. Validated final envelopes expose lastError/onError. Nested feature
profile metadata is omitted; existing source-profile metadata stays in place.

Session UUID+monotonic sequence and state:null tombstones block late drafts at
existing receivers, retaining bounded high-water history across clear/leave:
1000actors/eight retired sessions per actor. New observers, unseen earlier
sessions and evicted history are outside that guarantee. Raw legacy/server
Presence remains last-arrival; authoritative server-wide ordering is follow-up.
Reconnect clears stale draft. Ordinary pending edit/ACK does not clear draft.
No schema/CRDT/History algorithm, pending queue or existing binding was changed.

**Views.** Shared DOM mount/update/invalidate/dispose renders avatars/bot faces,
cursors, selections and content-sized drafts with host typography and actor
colors. Names appear on hover with accessible labels. Host projectors return
viewport CSS rectangles or null separately for each domain/role; the component
never materializes the document. Scroll/resize/manual invalidation coalesces a
single pending animation frame. Overlays leave native focus/selection untouched.
React supports context/hooks/components and StrictMode cleanup; Vue supports
reactive providers/composables/components; Svelte has a real compiled component
and readable store with browser/server/source exports. No framework runtime is
added to Core. Unmounting a view never disconnects its client. Draft capture and
domain mapping remain application responsibilities; private spreadsheet demo
protocol and native-editor IME drafts are not automatically migrated.

**Checks.** Full workspace1552cases=1550PASS/two expected platform SKIP/zeroFAIL:
Core1114, Lexical7, React2, Svelte2, UI3, Vue2, Slate4, Bot53, Demo141, Docs43,
MCP181/179PASS. Final core includes15new store/bridge/HTTP cases. Real HTTP/SSE4
holds an earlier composing draft until after draft-clear/local-clear/dispose/
reconnect; stale SSE reaches raw SyncClient while public state remains clear.
Before-patch2FAIL was observed in agent tool output; raw prepatch artifact
NOT_SAVED. Final4PASS is in the preserved workspace log. Root tscPASS. Final
DOM sizing/character-caret changes followed the full run; affected UI4 plus
React2/Vue2/Svelte2 (10/10), root tsc, consumer checks and Chrome27 ran afterward. No second full run is claimed.

Nine tarballs/11isolated consumer casesPASS: runtime/types, SSR-safe imports,
no unrelated editors/frameworks, prepack stale/orphan cleanup, original native
binding tests and independent Slate0.0.1 against unchanged Core. Release
rehearsalPASS: all nine0.1.0 in temp copy, internal peers compatible, independent
Slate0.1.1, private app versions and source manifests/lock unchanged. Actual
versions remain0.0.0/private. Docs43/43PASS;53pages/2471internal linksPASS,
English/local-path checksPASS. Root diff-checkPASS.

**Desktop.** Chrome27/27PASS/errors0 on actual DOM/React/Vue/Svelte mounts.
Independent native DOM/Range/fixture geometry tolerance1CSSpx. Same final bundle:
73cb413c327e0f42de1284c1a6010c277367e02299b4da4fa217e77223269308.
Ten pinned source hashes match current checkout. Trusted Hangul/emoji, native
UTF16selection, fully visible glyphs/normal font, active document caret,
Graphic pointer and sheet fixture projection, null hiding, hover names, confirm1
accepted edit/cancel0, undo/redo retaining peer input and reconnect pass. Three
mount cycles prove UI subscriptions4→0→4 and one root per framework. Screenshots
visually inspected. React19.3.1/Vue3.5.44/Svelte5.57.3 were tested; peer ranges
are not an exhaustive version matrix. Browser uses in-page memory DocHub and
four real ProseMirror views, not cross-browser HTTP. Graphic/Spreadsheet are
projection fixtures, not full editors. Actual HTTP ordering proof is separate.
Native OS IME composition and mobile NOT_RUN. No latency/long-run resource SLO.

**Corrections.** Review fixed metadata envelope depth, pre-existing selection
clearing on bridge mount, Vue provider replacement, draft clearing on ordinary
ACK and delayed HTTP resurrection. Initial npm cacheEACCES used a fresh task
cache without modifying user cache permissions. Browser attempt1 preserved a
harness quote failure and visible clipping. Attempt2 functionally22PASS but
visually failed for an oversized opaque preview. Role-aware projection and
bounded content-sized rendering fixed both; attempt3 passed24 plus visual
review. A final completeness pass adds native Range draft character caret and
explicit selection markers; matching ordinary caret is suppressed, clear
restores it, and flags cover both types. Attempt4 preserved a stale harness
selector failure after that intentional suppression. Final attempt5 passes27
plus visual review, including backward/forward emoji active endpoint geometry. Keep historical attempts distinct from final qualification.

**Docs/run/evidence.** New guide presence-components.md covers store/bridge,
projection, all three UI frameworks, lifecycle, ordering bounds and package
installation status. Packages/releasing/API/overview/getting-started/presence/
roadmap/README updated to the nine-package structure. Run npm run dev:presence;
set PRESENCE_URL to printed address for npm run check:presence. Final retained
preview http://127.0.0.1:49849 (exec87558). Browser proof:
output/playwright/presence-components-proof-attempt5/receipt.json. Report/source
seal: docs/reports/presence-components-2026-11-03/. Earlier reports and user
servers/tabs/drafts/History were preserved. Only owned proof browser sessions
were closed. S2 and all inherited/current Presence changes remain uncommitted.


**3D follow-up question.** Source inspection shows container/atom/attribute
storage can express a scene graph, while built-in GraphicTransform is2D.
A custom3D model and renderer would need separate tests. No3D SDK/schema or
public independent Map/List/Text CRDT API was added in this delivery. The
recommended direction is common storage primitives plus schema validation and
domain presets, with new storage shapes only for demonstrated semantic needs.
This is an architectural recommendation, not a completed primitive-API roadmap.


### 5.128 Shared data first slice, separation roadmap and SolidJS (2026-11-03)

**Scope/ownership.** SolMedium lanes implemented Map/List, independently reviewed
architecture/tests/roadmap, and implemented Solid plus real HTTP proof. Root
integrated exports/build/packaging/Changesets/docs and final regression checks.
All inherited WIP remains. No existing CRDT/Client/Schema/History/sync/local
engine source was changed. Public source under packages/doc-sync/src/data is
explicitly unignored; root data/ runtime rule otherwise hides it from Git.
No staging/commit/push, registry version/publish or hosted docs deployment.

**Roadmap.** docs/common-data-roadmap.md is the maintained English plan and is
copied into docs Reference. P1 caller API is delivered. P2 authoritative semantic
admission/resource limits, restart/recovery/GC/performance has partial evidence
only. P3 optionally exposes existing text nodes through a thin API if needed;
no new text CRDT. P4 extracts storage/structural checks/Schema/domain projection.
P5 migrates selected domains. Document/Graphic and standalone Spreadsheet do not
already share one wire. Caller-facing schema-free API is not completed storage
schema independence. Existing Schema compatibility is retained.

**Data API.** Core `/data` exports DataClient, SharedMap, SharedList,
createDataSchema and typed values/IDs/local validator. A fixed internal graphic
container encoding stores the graph. Root SharedMap supports dynamic string
keys, null vs missing, set/delete and sorted traversal. SharedList supports
stable ID insert/push/get/set/delete/move and array-style at(index). Collection
IDs are opaque data:UUID, separate from current indexes and CRDT token IDs.
Values are finite scalars or explicit same-client Map/List handles. Plain
objects/arrays/undefined/nonfinite numbers and foreign handles reject. Shared
reference cycles work; raw cyclic JavaScript objects are unsupported.

Atomic tagged assignments keep reference kind/payload together. Existing entry
writes use LWW and actor-owned History. Concurrent first writes to a key use
lexicographic DataId winner projection; losing candidates stay stored. Delete
targets all observed candidates; unseen concurrent inserts can survive. Lists
reuse existing ordering/move rules. createMap/createList allocations are
non-undoable structural records. Links are undoable; removing the final root
link retains peer content through stable handles/getMap/getList. Automatic
collection-graph reclamation is not implemented.

validate(write) is optional local application policy; throws reject before
editing and facade reentrant writes reject. It is not authorization/distributed
schema identity. Full server semantic admission is P2. Malformed encoded values,
IDs/references fail closed when the facade indexes applied content, not at the
authoritative endpoint. A per-revision cloned/frozen projection protects cache
records and builds ID/key indexes. Repeated lookups reuse it; first read after
a revision still scans/clones the visible model. No large-data incremental
performance gate is claimed. captureState/fromState keeps the existing local
Client state/History format. Sync exposes underlying Client/SyncClient lifecycle
and pending/recovery contracts; captureState is still local-only. Map strings
are atomic; character-level editing keeps using schema text nodes.

**Solid.** New @barocss/doc-sync-presence-solid is private0.0.0 with SSR-safe
PresenceProvider/PresenceOverlay/named layers and createPresence/usePresence/
usePresenceStore accessors. Reactive replacement releases old subscriptions;
owner cleanup releases UI, never the client. Shared store/renderer/geometry and
transport semantics are reused. Ten library candidates build and pack separately.
The playground now has DOM/React/Vue/Svelte/Solid and five actual PM views.
Browser transport remains in-page memory DocHub; Graphic/Spreadsheet are
projection fixtures. Solid1.9.18 tested; declared peer range is not exhaustive.

**Verification.** Full workspace1588cases=1586PASS/two expected platform SKIP/
zeroFAIL: Core1146, Lexical7, React2, Solid3(SSR1+lifecycle2), Svelte2, UI4, Vue2,
Slate4, Bot53, Demo141, Docs43, MCP181/179PASS. Root tsc/build and diff-checkPASS.
Focused Map/List29(implementation17+review12) are included, not extra unique
cases: six three-peer delivery permutations, keywise/duplicate keys, null/special
keys, stable list IDs/concurrent insert+move/peer set, selective History,
reference graph/last-link retention, local restore, malformed remote decoding,
cache mutation guards and seeded150-op list oracle. Review corrected mutable
candidate exposure, malformed tagged payloads and restore constructor injection.
Existing actor validation stays unchanged; DataIDs are actor-independent UUIDs.

Real NodeHttpTransport loopback HTTP/SSE3PASS included in Core: validates actual
protocol/epoch/schema headers, keywise/same-key convergence, list peer edits with
undo/redo, pending reconnect and rejected local policy generating no request/
accepted sequence. Initial test assumptions about no-op undo sequence and sync
captureState were corrected; failed attempts remain separate. Final log/receipt:
output/data-solid-proof/data-http-test-final.log and data-http-receipt.json.
This is not process/server restart, GC or complete P2 admission qualification.

Ten tarballs/12isolated consumersPASS, including data runtime/types/local restore,
Solid SSR import, unrelated peer absence, stale/orphan prepack cleanup, original
native binding tests and independent Slate0.0.1. Changesets temp rehearsalPASS:
all ten0.1.0, compatible peers, independent Slate0.1.1, source versions/lock and
private app versions unchanged. Actual packages remain private0.0.0. Docs43PASS;
55pages/2590internal linksPASS; English/local-path checksPASS.

**Desktop.** Solid five-surface Chrome27/27PASS/errors0; eleven source hashes
match checkout. Bundle:
e693385e791ac6472938565e8c4df4a7f9256b14dbff5b9236b91904f893a6ce.
Native DOM/Range/fixture rectangles use1CSSpx tolerance. Trusted Hangul/emoji,
character selection+active caret, native focus, typography/colors, null hiding,
hover names, confirm1/cancel0, own undo/redo preserving peer changes, reconnect,
repeated mount/subscription cleanup pass. Screenshots inspected by worker/root.
Native OS IME composition and mobile NOT_RUN; no browser HTTP/WAN/large-data/
latency SLO. Browser and actual Node HTTP proofs remain separate.

**Docs/run/evidence.** New guide/shared-data.md and generated common-data-roadmap
Reference explain APIs, local policy, Text choice and remaining layers. Presence
components/packages/API/releasing/overview/roadmap/README updated for Solid/ten
packages. Run npm ci then npm run build; import @barocss/doc-sync/data. Run
npm run dev:presence and set PRESENCE_URL for npm run check:presence. Retained
preview http://127.0.0.1:55787 (exec33962). Proof:
output/playwright/presence-components-proof-attempt6/receipt.json. New bundle/
map/metafile saved there. Launcher initially wrote default artifacts; previous
bundle/map/metafile were restored byte-identically using unchanged49849 and its
sourcemap. Older services/receipts and user tabs/drafts/History were preserved;
owned proof Chrome closed. Report/source seal:
docs/reports/common-data-solid-2026-11-03/. No publication/push; WIP remains.


### 5.129 Guarded data admission before persistence/application (2026-11-03)

**Request and API rationale.** P2 now rejects duplicate Map/List IDs and malformed
values/references before authoritative application, preserving existing Schema,
concurrency and History. The user also asked why DataClient exists: it hides
fixed encoding/schema/index setup over one Client and delegates transport/pending/
History. It is a convenience facade, not a second engine. The new validator is
independent of that name, so a future Client-plus-data-view interface can reuse
it. No facade removal/rename or model migration was performed.

**Ownership.** SolMedium lanes implemented pure admission+server hooks/factory,
independently reviewed adversarial cases and detached snapshot reads, and tested
actual HTTP/SSE. Root integrated packaging/release checks, full regression,
English guides/roadmap/HANDOFF and source/evidence seals. Inherited WIP and user
services/tabs/drafts/History are preserved. No commit/push/publication occurred.

**Server.** @barocss/doc-sync/server exports createDataHub and DataHubOptions.
Pure data/schema.ts retains the original encoding literal/fingerprint; pure
admission.ts validates raw descriptors and every authored encoded value/identity
before a private candidate is applied. Generic HubOptions now optionally accept
trusted read-only validatePayload/validateChange policies. The factory installs
both; plain DocHub({schema:createDataSchema()}) remains generic. Server imports
no DataClient/browser facade. Existing Schema/CRDT/History/protocol algorithms
are unchanged; generic users do not stage candidates without the optional hook.

Raw payloads must be finite plain JSON without getters/symbol/nonenumerable/
foreign-prototype fields; actor/seq/ops and op tags validate before clone or
fingerprinting. IDs are unique across retained live/deleted records. Stored ID,
birth kind, key and Map/List membership semantics are immutable. Same key with
different IDs remains legal. Tagged finite scalars/root or retained collection
references must match their declared kind. Forward refs within a batch are
allowed. Hidden/deleted records and LWW losers cannot hide malicious writes.
Birth values must be explicit tags, including{scalar:null}; omitted empty key is
allowed because compiler elides that default. Guarded encoding is stricter than
the broad generic Schema defaults.

All semantic checks precede onAppend and live doc/clock/log/lastSeq/receipts/
broadcast mutation. Corrected rejected actor sequences remain available;
accepted exact retries remain idempotent. Ordinary/conditional/recovery/staged
submission and change replay share admission; raw receipt/negative seal paths
also validate before inspecting untrusted JSON. Append failure still allows an
exact retry. The fixed schema identity is unchanged:
sha256:96b65879a3d426ab2aeeeb7e60b02e207ba5bfb66e9b211f14b2707be972f23f.

**References/client reads.** A queued reference to a known retained hidden
collection is legal. DataClient.read no longer poisons unrelated root keys:
it can return a retained handle; operations on that hidden collection reject
until undo/restoration makes it visible. Readonly Client.snapshot and
LocalClient.snapshot return detached document storage including hidden/current
pending nodes, without History/recovery proof. Reads are safe in notification
callbacks and pending local state, emit nothing and alter no clock/History.
Returned-object mutation cannot affect engine state. captureState keeps its
existing settled-state/recovery boundary; it is not used inside read observers.

**GC limitation.** createDataHub gc returns null; replayGc rejects. Existing
compaction erases attrs required to reserve deleted IDs/resolve hidden targets,
so guarded data retains tombstones and storage grows. Generic DocHub GC remains
unchanged. Compacted legacy data logs cannot be transparently adopted. Change
records replay through submit; reset creates a new epoch/identity domain.
Metadata-aware compaction/durable identity reservation remains P2 follow-up.
Local business validate callbacks, auth/actor binding/quotas/durable I/O and hub
serialization are separate responsibilities. Trusted direct hub.doc mutation
is outside admission. Full P2 is not complete merely because this slice passes.

**Verification.** Full workspace1616cases=1614PASS/two expected platform SKIP/
zeroFAIL: Core1174, Lexical7, React2, Solid3, Svelte2, UI4, Vue2, Slate4, Bot53,
Demo141, Docs43, MCP181/179PASS. Data60(older32+admission5+independent20+HTTP3)
and legacy focused35 overlap the full count. Build/root tsc/diff-checkPASS.
Independent checks cover tombstone UUID collision, LWW-losing bad values,
identity/membership writes, raw descriptors, hidden queued child/ref+undo,
forwardrefs/cycles/root kinds, empty/Unicode/__proto__/null compatibility,
conditional/staged rejection, append failure exact retry, GC/schema lock/reset,
observer/pending snapshot reads and nested snapshot ownership.

Actual HTTP/SSE3PASS on final code: eleven ordinary malformed mixed batches
with valid prefix reject409 without append/state/seq/receipt/peer exposure;
corrected same actor/seq and exact retries pass. Conditional/recovery rejection
and correction also pass. Three actors edit map/list/moves, undo/redo and pending
reconnect with exact model convergence. Accepted journals replay into fresh
in-process guarded hubs. Full process/server restart NOT_RUN. Final evidence:
output/data-admission-proof/final-http.log, raw requests, journals/receipts,
final-source-sha256.json(10files), final-artifact-sha256.json. Earlier artifacts
remain before-source-freeze/ and before-final-envelope-guard/.

Ten tarballs/12consumersPASS including guarded server runtime/types, generic
compatibility and owned snapshot APIs; original native binding/isolation checks
remain. Changesets temp rehearsalPASS: ten0.1.0, compatible peers, independent
Slate0.1.1, source manifests/lock/private apps unchanged. Actual packages remain
private0.0.0. Docs43PASS;55pages/2594linksPASS; English/local-path checksPASS.
No fresh browser/mobile proof; prior SolidChrome27 is historical. No latency/
large-data resource qualification for candidate snapshot/index staging.

**Corrections.** Initial actual HTTP run exposed legitimate synthetic list-head
rejection; attempt-02.log is preserved. Positive review caught compiler-elided
empty key, cross-kind movement and hidden-reference facade reads. The snapshot
accessor avoids using captureState during notifications. The first root tsc
started during build's dist cleanup and failed module resolution; post-build
sequential tsc passes without a new runtime change. Preserve failed attempts
separately from the final receipts; do not label them all product regressions.

**Docs/evidence.** Shared-data guide now explains DataClient rationale, guarded
server setup, GC policy and snapshot boundaries. API/package/roadmap/README
updated; maintained common-data-roadmap records delivered intrinsic admission
and remaining resource/restart/compaction gates. Report/source seal:
docs/reports/data-admission-2026-11-03/. No user service or browser state changed.
All current/inherited changes remain uncommitted with no push or deployment.


### 5.130 Map/List access on the existing Client (2026-11-03)

**Request.** Replaced the separate unreleased DataClient/DataClientOptions
exports with Client.data. No compatibility wrapper or second Client remains.
Core /data exports createDataSchema, SharedMap, SharedList and their types,
including the SharedData interface. Construct Client with
{schema:createDataSchema(), data?:{validate}}. Use client.data.root,
createMap/createList/getMap/getList for collections and Client for transport,
subscriptions, History, selection and save/open. Client.fromState accepts the
optional local data policy; callbacks are not stored in snapshots.

**Ownership.** Sol Medium implementation, migration and independent review
lanes worked on separate files. Root integrated package consumers, English
documentation, full tests and evidence. All inherited WIP, user services,
browser tabs and prior reports remain. No commit, push, deployment or npm
publication was performed.

**Compatibility and safety.** Access is lazy and stable per Client. It creates
no backend, subscription or saved state. Exact data schema identity is required;
other Document/Graphic models reject without mutation. Cached access and retained
handles recheck identity after schema transitions. Storage IDs, schema
fingerprint, local state format, pending transport and actor-owned History keep
their existing rules. Same-Client references work; cross-Client handles reject.
Local validation is captured in private state; validator mutation reentry through
Client/data methods rejects. Raw Client.edit remains an advanced API that bypasses
this optional local business policy. Use createDataHub for server admission.

Eight files are byte-identical to the prior P2 seal: data/schema.ts,
data/admission.ts, server/data.ts, server/hub.ts, crdt/doc.ts, crdt/history.ts,
crdt/schema.ts and local/client.ts. Intrinsic server validation still precedes
persistence/application. Generic Schema behavior and CRDT arbitration are
unchanged. Guarded data GC remains disabled, reserving retained deleted IDs;
metadata-aware compaction, resource budgets and full P2 qualification remain
open. This refactor does not add a separate Text engine or storage extraction.

**Verification.** Final full workspace run: 1635 cases, 1633 PASS, two expected
platform SKIP, zero FAIL. Core1193; Lexical7; React2; Solid3; Svelte2; UI4; Vue2;
Slate4; Bot53; Demo141; Docs43; MCP181/179PASS. New focused implementation5 and
independent14 cases are included in Core. Existing data60 migration tests also
pass, including six actual HTTP/SSE cases. They cover concurrent Map/List writes,
moves, actor-owned undo/redo, pending reconnect, malformed mixed batches,
corrected same-sequence retries, conditional/recovery admission and journal replay
into fresh in-process hubs. Three guarded journals retain accepted append counts
11,16,2 and matching hashes. The final run's HTTP artifacts are captured separately
from the migration lane's earlier non-frozen receipt.

The first full run had one bot unknown-restart barrier timeout; original cause
is NOT_PROVEN because temporary state had been removed. Focused unknown1/1,
unmodified runner8/8, diagnostic runner8/8 and the final full run pass. The only
bot change adds early-exit and persisted mission/request diagnostics. Timeouts,
restart scenarios and assertions are unchanged; no bot production fix is claimed.
The initial failed run is retained beside the successful final evidence.

Build and final root TypeScript checks PASS. Ten package tarballs and twelve
installed runtime/type consumers PASS, including Client.data, absence of the old
DataClient export and unchanged server guard. Changesets temporary rehearsal
PASS; source manifests and lock are unchanged. Actual packages remain private
0.0.0. Docs43 tests, build and 55-page/2600-link English/local-path checks PASS.
No fresh browser, mobile or latency/resource benchmark was run for this API
refactor. Existing bot restart tests are current; new data HTTP replay proves
in-process replay, not a new full-process durability qualification.

**Documentation and evidence.** README, Client/shared-data/custom-schema/package/
API guides, common-data roadmap and status notes use Client.data. The guide covers
local/sync setup, validation, save/open, migration and remaining limits. A minor
Changeset records removal of the unreleased facade. Report, immutable evidence
copies and source seal: docs/reports/client-data-access-2026-11-03/.


### 5.131 Final main checkpoint and Presence lifetime review (2026-11-03)

**Scope.** Consolidates the pending sections5.123–5.130: stable Spreadsheet
axes/structural History and live text Presence, optional DOM/React/Vue/Svelte/
Solid components, common Map/List access, guarded server admission and Client.data.
The prior local9334e59 commit was also ahead of origin/main at the initial audit.
Publication scope is commit/push to main. All ten libraries remain private0.0.0;
no registry publish, release tag or package version change is part of this task.

**API decision.** Keep client.data as the fixed Map/List namespace. Application
keys/collections live inside it. It is not the entire document model or an engine
selector. Client.edit/model remain the schema editing/reading APIs. Access still
requires the exact createDataSchema identity; arbitrary Document/Graphic models
are not converted or given hidden Map/List storage. P4 storage/schema separation
is still open. Connection, pending edits, History, selection and save/open remain
owned by Client. Local business validation does not replace createDataHub
admission or host authorization. Guarded data GC stays disabled.

**Final review fixes.** Three Sol Medium lanes reviewed Client/data/server,
Spreadsheet, and Presence/framework/package changes. Root reviewed the final
test diffs and integrated docs, evidence and the main checkpoint.

1. The core Presence bridge now delivers every accepted newer sequence to the
   store, even when state is identical. This refreshes receipt-time TTL and can
   restore locally expired state. Earlier/replayed packets still fail the
   sequence fence. Identical active state does not notify a new snapshot.
2. Updated SheetSession sends a server-issued Presence generation from join and
   SSE hello. Join retires old stream ownership. Close/leave rotate the generation
   and clear Presence; late preview/leave requests cannot revive an offline
   selection or remove a newer one. Old stream callbacks cannot mutate a new
   session. HTTP-only sessions use the same generation. Legacy direct requests
   omitting it retain sequence-only behavior. An old in-flight Presence request
   can delay a fresh preview, independently of document edits.
3. Graphic HTTP/SSE test now holds the pointer request until the prior selection
   packet is observed. It verifies that first cursor-null packet, then waits for
   the requested cursor and selection. The old Boolean readiness gate could
   accept the first packet too early. Exact payload/model/History/disconnect
   assertions remain. No Graphic production fix was needed.

**MCP test resource/diagnostic boundary.** An early full run failed the bot unknown
restart case before conditional submission: nested MCP connection closed, with
no pending edit and only schema GET observed. The original cause remains
NOT_PROVEN. A later instrumented run passed Bot53 but hit many MCP deadlines
during high host load and left test children alive. The restart-history child
was cancelled by its parent120s deadline, not a demonstrated undo assertion.
Only the owned run's process tree was captured and interrupted; all thirteen
captured descendants were verified gone. User services/tabs were preserved.
Raw failed and cancelled runs remain in the new evidence archive.

MCP now executes four independent test files at once instead of a CPU-derived
pool (about13 on this host). Within-file multi-agent scenarios, individual
timeouts and expected results remain. Full bounded MCP181/179PASS/twoSKIP took
36.44s; an external300s watchdog did not trigger. Bot fixture now forwards nested
MCP stderr and fails on an unexpected mission return. Proxy diagnostics include
HTTP completion/server errors. AI fixture drains bounded stderr, cleans up a
failed startup before registration and labels restart failure stages. These are
test observability/cleanup changes, not a proven bot/MCP production fix. Bot53
and twenty concurrent isolated startup attempts pass; they do not explain the
prior fast startup failure. Host load as the sole cause is also NOT_PROVEN.

**Final verification.** The final standard workspace invocation passes all1638
cases:1636PASS/two expected platformSKIP/zeroFAIL/zeroCANCEL. Core1194; Lexical7;
React2; Solid3; Svelte2; UI4; Vue2; Slate4; Bot53; Demo143; Docs43;
MCP181/179PASS. All552 captured runtime/test/build source hashes remain unchanged
after the run. Data HTTP/SSE6 are included. Guarded journal append counts11/16/2
and hashes match. New regressions cover receipt TTL/expiry/replay and late HTTP/
SSE disconnect, replacement and reconnect. Focused Graphic2 and Demo143 also pass.
Build/root TypeScript, docs build55pages/2600links and release rehearsal pass.
Final tarball/consumer verification is recorded in the checkpoint report.
No fresh browser/mobile/Rust/performance run was performed during this final
review. Historical browser and benchmark reports retain their source boundary.

**Documentation/evidence.** Fixed obsolete five-package text in the package
READMEs and getting-started/releasing/graphic guides. Core README lists /data and
/presence. Shared-data guide explains fixed namespace versus model/engine and
the exact-schema boundary. Presence guides describe TTL receipt refresh and
the private Spreadsheet generation limit. Maintained source/evidence seal and
final gate records: docs/reports/main-checkpoint-2026-11-03/.


### 5.132 MCP bootstrap lifetime, safe cleanup and startup provenance (2026-11-03)

**Request and baseline.** Diagnose and fix intermittent MCP initial closure with
multiple agents, preserve pending/foreign edits, run restart regressions and
update English docs/HANDOFF. Initial main HEAD was0de9f0f with a clean tree.
Sol Medium CLI lanes separated source investigation, reproduction, production,
tests and independent review. The prior collaboration transport was closed;
OMX CLI/file evidence was used without deleting existing team/runtime state.
User services, tabs and prior reports remain. This task has no commit/push or
publication scope.

**Causal proof and its limit.** Normal journal acquisition contains referenced
filesystem work, not the initially suspected unref-only lock wait. Controlled
unref injection reproduces schema-only exit0 but is not a normal-code or historical
cause proof. Real writer contention rejects with exit1 and a lock error; writer
exclusion was not weakened. The original failure lacks nested exit/stderr data,
so its exact discovery-only trigger remains NOT_PROVEN.

A reachable supported DOC_SYNC_SCHEMA module awaits an unreferenced timer before
exporting a valid schema. With stdin not owned until after recovery, the actual
MCP entry exits0 before SDK initialize. Early PassThrough ownership fixed a small
initialize but still failed with a valid262144-byte client name: buffer saturation
paused stdin, removing its active reference. An8-byte control connected. This
second failure was caught during root review, not accepted as a passing fix.

The final same-test matrix has9/9PASS. Archived0de9f0f fails7/9 and passes2/9.
A source copy retaining all new cleanup and the proxy but removing only its
startup lease fails1/9: large early initialize still exits0. The final fixture
observes real64KiB saturation before schema export/SDK start without adding a
data consumer, timer or reference. It verifies the exact parsed name length/hash,
13 tools, read_document and unchanged upstream model/sequence. These are supported
async-module proofs, not proof that the original discovery incident had that
trigger.

**Production change.** main.ts owns raw stdin through a64KiB PassThrough before
bootstrap. A referenced interval holds only startup liveness while input may be
paused; no code awaits a tick and it is not a timeout or retry. It is cleared on
ready, failure, observed EOF/close/error, signal or final cleanup. SDK admission
still occurs only after existing session.start/recovery gates. Early bytes are
not parsed or dropped during startup. All former operation deadlines remain.

One idempotent cleanup path covers acquired journal/session/server resources.
Cancellation is sticky at bootstrap boundaries; cleanup waits for current startup
work before closing late ownership. Startup failure/cancellation closes locally
without uncertain leave. Ready closure uses existing drain and settled-only
leave rules. A failed drain still attempts local disconnect/journal close. No
intent clearing, checkpoint deletion, lock unlink, recovery-reservation release
or automatic mission retry was added. Cleanup errors do not mask the primary
startup phase diagnostic; stdout remains MCP only.

Bot runner retains at most96 bytes of a stderr line prefix and stores only an
allowlisted startup phase when connect fails. It discards raw stderr and preserves
the original cause. Split markers, oversized/unknown text and private canaries
are tested. Bot remote schema discovery and forced-empty DOC_SYNC_SCHEMA remain
unchanged. An initial worker enabled ambient schema inheritance merely for its
test; root rejected that scope change and restored the original policy. Final
Bot tests use a test-only preload and assert ambient modules never execute.
The earlier worker receipt does not qualify this final policy.

**Pending/restart proof.** Actual SDK children and real HTTP/SSE servers exercise
unknown and accepted durable intents across failed startup, EOF and restart.
Unknown intent/checkpoint bytes remain exact, no conditional replay or leave is
sent, new edits remain blocked and a foreign accepted edit survives. Accepted
receipts reconcile once; actor undo/redo preserves the foreign edit. Ready EOF
with an accepted response held upstream drains admitted work, exits naturally,
closes SSE, releases the writer and restarts without duplicate application.
Stdio-start rejection after live SSE now exits nonzero and releases local
ownership; the archived entry retained its stream until the test deadline.

**Final gates.** Node24.22.1: MCP190cases/188PASS/two expected platformSKIP/
zeroFAIL/zeroCANCEL in34.37s; Bot56/56PASS; product server restart recovery1/1PASS.
The9 lifecycle and3 Bot provenance cases are included, not additional counts.
All focused and integration external watchdogs stayed inactive. Build and root
TypeScript PASS. Docs43PASS; build55pages/2601internal links, English/local-path
checks PASS. Final tested six-file source hashes remain unchanged. Public Core,
Schema, History, engine/transport and fixtures match the baseline; their previous
full-suite receipts remain historical, not new runs. No fresh whole-workspace,
Chrome/mobile, Rust, benchmark, package publication or deployment result is claimed.

**Limits and docs.** Executable schema code that never settles is not internally
cancelled. Paused input can delay EOF observation; session.start remains atomic
at this owner boundary. MCP hosts retain their own process deadline/escalation
policy. Raw application stderr can contain private schema-thrown text even though
Bot mission persistence excludes it. AI server guide and MCP README document
readiness, lifetime, phase errors, pending-safe restart and cancellation limits.
Report/source/evidence seal: docs/reports/mcp-startup-lifetime-2026-11-03/.


### 5.133 Final startup-lifetime review and full-suite main checkpoint (2026-11-03)

**Scope.** User authorized final review of all pending changes, a full test run,
docs/HANDOFF updates, commit and push to main. Initial HEAD/origin main both
0de9f0f. The final review used the code-reviewer workflow and existing independent
review evidence. No new runtime edit was needed. The prior688-file source seal,
report hash and188 evidence archives match. Historical source/control reports
remain immutable.

The pending code owns stdin before bootstrap, buffers raw initialize bytes with
backpressure and holds a startup-only reference until SDK readiness or closure.
Failure/EOF cleanup preserves unknown intent/checkpoint and foreign changes;
ready shutdown drains admitted work and uses the existing settled-only leave
gate. Bot retains only a known phase from bounded stderr prefixes. Remote schema
discovery remains unchanged. Source review found no new blocker. The previously
demonstrated supported async-schema gap is distinct from the old discovery-only
failure, whose exact trigger remains NOT_PROVEN. Existing cancellation and
private-stderr limits remain documented; no broader availability guarantee is
claimed.

**Fresh verification.** Node24.22.1 `npm test`, including its package build,
exits0:1650cases/1648PASS/two expected platformSKIP/zeroFAIL/zeroCANCEL in133.22s.
Core1194; Lexical7; React2; Solid3; Svelte2; UI4; Vue2; Slate4; Bot56; Demo143;
Docs43; MCP190/188PASS. Nine lifecycle and three Bot provenance regressions are
included. Pending/foreign preservation, exact recovery, process/server restart,
duplicate prevention and undo/redo are exercised by these suites. The external
360s watchdog did not fire and no failure was retried.

Post-build root `npx tsc --noEmit` PASS. Docs workspace build and check PASS:
55pages/2601internal links, English=true and localPathsExcluded=true. All688
source hashes were unchanged after the full test and before this documentation
summary. Public packages, fixtures, manifests and lock remain unchanged from
the prior main checkpoint; no new tarball/release rehearsal was necessary for
these private application changes. No fresh browser/mobile, native Rust or
controlled performance run is claimed.

**Publication.** Commit/push scope is main only; all ten library packages retain
their existing private0.0.0 state. No npm publication, release tag, actor migration
or data cleanup is part of this checkpoint. Remote commit, automatic Pages and
Linux CI outcomes are checked after source commit and reported separately.
Source/evidence report: docs/reports/mcp-startup-main-checkpoint-2026-11-03/.
