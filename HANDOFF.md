# Handoff — @barocss/doc-sync

The hydration-race fix and publication checks are in **§5.49–§5.50**. The follow-up examples, selection fix, and validation are in **§5.48**. The documentation-site refresh and publication checks are in **§5.46–§5.47**. The open-editor schema transition and its verification are in **§5.44**; its main integration verification is in **§5.45**. The earlier Codex and editor collaboration checks are in **§5.42**; their main integration validation is in **§5.43**. The recovery storage and large-log work is in **§5.36–§5.40**.

Created 2026-10-22. The review-only durable conditional journal, server generation and process-failure evidence are in **§5.35**. The numbered roadmap, earlier Chrome integration and recovery work are in **§5.34**. Server-atomic edits, schema versioning, compatible transitions and fresh Codex validation are in **§5.33**. Headless Node synchronization, an MCP server, Codex validation and schema-change analysis are in **§5.32**. Verified main integration is recorded in **§5.31**. Receive model materialization and preserved metadata-memory evidence are in **§5.30**. Runtime ID metadata compression is in **§5.29**. Remote native projection and repeated Chrome comparison are in **§5.28**. Native product-schema editing and large-document measurements are in **§5.27**. Representative Word-style, Notion-style and presentation profiles are in **§5.26**. Verified integration and editor design lessons are in **§5.25**. Merged-grid native models and hidden-cell preservation are fixed in **§5.24**. Guarded structural event comparison is in **§5.23**. Final main integration is in **§5.22**. Automatic paragraph and post-move split fixes are in **§5.21**. The moved/required text receive optimization is in **§5.20**. Public editor bindings and extended document contracts are in **§5.19**. English documentation and the GitHub Pages app are in **§5.18**. Final integration checks for the 2026-10-23 structural cache change are in **§5.17**; implementation and measurements are in **§5.16**. Final checks and main integration for multi-text-block remote comparison are in **§5.15**; implementation and measurements are in **§5.14**. Main before that integration was `6f15291`. The previous full integration is in **§5.13**, consecutive formatting undo/redo in **§5.12**, intent preservation in **§5.11**, and screen latency in **§5.9–§5.10**. Remaining priorities are in **§6**.
See [`README.md`](README.md) for the concepts, [`docs/edit-api.md`](docs/edit-api.md) for editing API design, and the roadmap for the plan.

---

## 0. Overview

- **Purpose**: A **document CRDT** library with an externally injected schema. It does not know block types. It knows only schema shapes: text, inline, flow, group, grid, row, cell, atom, and span.
- **Supported scope**: Concurrent text, formatting, links, lists, tables, images, nested flows and atoms; public ProseMirror, Slate and Lexical bindings; identity-preserving paragraph/block/group placement; required-child projection; persistent annotations; declared nested attribute fields. See §5.19 for current tests and exact limits.
- **Final structure**: One library, `packages/doc-sync`; private demo, `apps/demo`; private documentation, `apps/docs`; private benchmarks, `benchmarks`. Three separate work chats handled browser checks, performance, and Presence. Before/after migration performance is in §5.4; remote selection ranges and validation scope are in §5.5.
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
npm test                     # Library 622 + demo 16 + documentation 27 (default 500 random traces)
npm test --prefix apps/demo/compat  # 31 comparison-demo conversion, input, and probe tests
FUZZ_SEEDS=3000 npm test     # Large random run (several minutes)
PM_SEEDS=300 npm test        # More ProseMirror random traces
npm run typecheck            # tsc (project typescript 5.8)
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
- There is no build step. `package.json` `exports` points directly to `.ts`. Add a build before npm publication (stage 7).
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
packages/doc-sync/           Single library @barocss/doc-sync (existing private setting retained)
  src/index.ts              Core: Doc, commands, History, model, schema
  src/crdt/                 Tokens, validation, application, editing API, model, compaction
  src/sync/                 SyncClient, HttpTransport, protocol
  src/server/               DocHub (transport-independent)
  src/pm/                   ProseMirror schema, conversion, binding
  src/slate/                Public Slate binding, codec and selection conversion
  src/lexical/              Public Lexical binding, schema nodes, codec and selection conversion
  src/editor/               Shared composition draft, model mapping and subscriptions
  test/                     Existing collaboration, table, editing API, PM, and random tests
apps/demo/                  Private @doc-sync/demo
  server.ts                 HTTP, SSE, static files, JSONL storage
  ui/                       Demo, multi-window, and ProseMirror UI
  test/                     HTTP, snapshot, restart, reset, and Presence tests
apps/docs/                  Private @doc-sync/docs (VitePress, GitHub Pages)
  src/, .vitepress/          English guides, generated references, theme, navigation
  scripts/, test/           Content preparation, built-link checks, executable examples
apps/mcp/                   Private @doc-sync/mcp; stdio MCP server and integration tests
benchmarks/                 Private @doc-sync/benchmarks
  trace.ts, engines.ts      Traces and comparison engines
  run.ts, client.ts         Core and local-client measurements
  profile.ts, results/      CPU profiling and raw measurements
fixtures/demo-schema.ts     Shared demo and test schema
docs/                      Design, reports, roadmap
data/                      Existing logs (do not move or delete)
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
   - Tables use a full grid with covered cells; colspan/rowspan are calculated.
10. **Editing API**: `doc.edit(EditOp[])`; EditOp is insert, delete, update, split, or merge.
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
