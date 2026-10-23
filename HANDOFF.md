# Handoff — @barocss/doc-sync

Created 2026-10-22. English documentation and the GitHub Pages app are in **§5.18**. Final integration checks for the 2026-10-23 structural cache change are in **§5.17**; implementation and measurements are in **§5.16**. Final checks and main integration for multi-text-block remote comparison are in **§5.15**; implementation and measurements are in **§5.14**. Main before that integration was `6f15291`. The previous full integration is in **§5.13**, consecutive formatting undo/redo in **§5.12**, intent preservation in **§5.11**, and screen latency in **§5.9–§5.10**. Remaining priorities are in **§6**.
See [`README.md`](README.md) for the concepts, [`docs/edit-api.md`](docs/edit-api.md) for editing API design, and the roadmap for the plan.

---

## 0. Overview

- **Purpose**: A **document CRDT** library with an externally injected schema. It does not know block types. It knows only schema shapes: text, inline, flow, group, grid, row, cell, atom, and span.
- **Supported scope**: Concurrent text, formatting, links, lists, tables (cell merging and background color), images (captions), containers, and dividers. The sync server and ProseMirror binding work. There was 0 divergence in 3000 random traces.
- **Final structure**: One library, `packages/doc-sync`; private demo, `apps/demo`; private documentation, `apps/docs`; private benchmarks, `benchmarks`. Three separate work chats handled browser checks, performance, and Presence. Before/after migration performance is in §5.4; remote selection ranges and validation scope are in §5.5.
- **Input preservation**: Fixed 22 caret/IME failures in the Slate/Lexical/PM comparison demo, `apps/demo/compat`. Causes, composition drafts, and Chrome validation scope are in §5.6. This is separate from the default `/pm` IME implementation.
- **Current stage**: Expanded stage 0 measurements. Improved stage 1 safe single-block receive comparison and large-string cache copying. Added stage 2 specifications, property tests, and a long-run CI foundation (§5.7). Actual editor latency, G0/G1, lease-expiry recovery, and long-run exit criteria remain open. Improved paragraph model recalculation and demo Paint/PrePaint costs (§5.9–§5.10). Core timing alone does not establish product performance acceptance. Added intent-preservation case specifications and 41 regressions (§5.11). Fixed consecutive formatting undo and added regressions that preserve other users' writes (§5.12). Extended safe remote comparison to at most 8 text blocks (§5.14). Nine or more blocks, structure, and undo/redo use full event comparison. Structural paragraph cache reuse was improved in §5.16.
- **Next**: Review baseline timeouts, trace speed, and semantic differences between engines. Set targets and G0. Narrow multi-block/structural costs, editor conversion, and screen costs. Keep the existing decisions on contiguous storage, binary formats, and move policy (§6).
- **Name**: `@barocss/doc-sync` (user decision, 2026-10-22). Do not use the old name. The `@barocss` scope already includes CSS packages (browser and kit) and math-editor-lexical.

## 1. Location and execution

```
/Users/user/github/doc-sync      ← Git initialized on 2026-10-22 at user request; default branch main
```

Remote `origin`: `https://github.com/barocss/doc-sync.git`. The first commit preserved the existing README and included project source, configuration, and documents. `data/`, all `node_modules/`, `.playwright-cli/`, `.omx/`, and `output/` remain local. Evidence paths under `output/` in this document exist on the validation computer and are not in Git. Raw measurements under `benchmarks/results/` are in Git.

```bash
npm install --cache <writable-temporary-folder>/npm-cache   # ~/.npm gives EACCES; do not fix with sudo
npm test                     # Library 246 + demo 10 + documentation 14 (default 500 random traces)
npm test --prefix apps/demo/compat  # 31 comparison-demo conversion, input, and probe tests
FUZZ_SEEDS=3000 npm test     # Large random run (several minutes)
PM_SEEDS=300 npm test        # More ProseMirror random traces
npm run typecheck            # tsc (project typescript 5.8)
npm run docs:dev              # English documentation, loopback URL printed by VitePress
npm run docs:build            # Static site in apps/docs/dist
npm run docs:check            # Built pages, links, fragments, assets, and English prose
npm run docs:preview          # Static loopback preview under /doc-sync/
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
  test/                     Existing collaboration, table, editing API, PM, and random tests
apps/demo/                  Private @doc-sync/demo
  server.ts                 HTTP, SSE, static files, JSONL storage
  ui/                       Demo, multi-window, and ProseMirror UI
  test/                     HTTP, snapshot, restart, reset, and Presence tests
apps/docs/                  Private @doc-sync/docs (VitePress, GitHub Pages)
  src/, .vitepress/          English guides, generated references, theme, navigation
  scripts/, test/           Content preparation, built-link checks, executable examples
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
3. **RGA**: New tokens go immediately after their origin. Larger IDs come first for the same origin. **No move or split-tree operation.** Yorkie Tree §7.4/#2240-type problems have no corresponding operation here.
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

## 6. Next work (in order)

The current structural paragraph-recalculation improvement is complete within §5.16 scope. The next implementation unit is the lease-recovery contract. Full structural-sequence scans, full-event comparison, returned copying, and normalization costs remain. Stage 0 exit evidence and long-run CI observation below remain separate work.

### 6.1 Finish stage 0 (remaining work)

0. **Baseline measurement exit evidence**: Reviewed gaps in §5.14. New evidence remains to be collected. Added harnesses for a fixed 50×10 table, opening after 10,000 edits, and public Yorkie Tree comparison. Yorkie 10,000-character single input and opening after 10,000 edits remain incomplete at the 120-second limit. Review target rate and completed rounds in the 4-replica 30-minute observation. Concurrent row/column/merge policies are not validated by a common cross-engine comparison.
1. **Real editing trace**:
   - Example: automerge-perf paper-editing trace. Ask the user for the file, source, and size before obtaining it.
2. **Client/editor paths**: Safe single-text-block paths improved in §5.7; up to 8 blocks improved in §5.14. Nine or more blocks, structure, and undo/redo retain full-model events. Structural sequence/paragraph cache reuse improved in §5.16. PM conversion/application and screen updates need separate analysis.
3. **Review results and incomplete items, then set targets and G0.**
   - Roadmap artifact: https://claude.ai/artifact/ESfhwaZAnzcGjFpUjevafc
   - Source to update: `docs/roadmap.html`.

### 6.2 Stage 1: performance (profile order)

1. ~~Keep the position index~~ — **Done** (§5.1). Remaining: replace the sequence with a **chunk list** or B-tree to remove O(n) copying in `splice`. Yjs uses a linked list + marker cache; diamond-types uses a B-tree. Live-character counts per chunk would also make nth-character lookup O(log n).
2. ~~Incremental block-list calculation for characters~~ — **Done** (§5.1). Remaining:
   - **Incremental marker insertion/deletion**: split one block into two; join two into one. Concurrent same-position Enter absorption ("first live marker per boundary") needs a persistent boundary → markers Map. This was about half of an earlier profile. Remeasure its current share.
   - Document-version and unchanged-text-block reuse are done (§5.7, §5.9). Affected-sequence and same-paragraph reuse after structural changes improved in §5.16. Structural boundary scans, returned copying, and list/table normalization remain.
3. **Group consecutive characters** — ⛔ **Do not implement (user decision, 2026-10-22).** Leave unchanged until the user asks to resume. Historical notes only:
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

- **No move or tree-split operation.**
  - Decide block drag-and-drop separately in stage 6.
  - Cell merging hides text instead of collecting it for the same reason.
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
- The schema cannot express exactly one required child (`min`/`max`). Editing functions enforce it.
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
