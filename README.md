# @barocss/doc-sync

A document CRDT library with an injected schema. It is written in TypeScript. The CRDT, sync client, and server have **no dependencies**. ProseMirror, Slate and Lexical integrations use optional editor peers. The repository contains the CRDT, a sync client, a server (DocHub), three editor bindings, and browser demos.
It started with an idea tested in an earlier Yorkie experiment repository: "a document as one token sequence." It is now a standalone library, separate from Yorkie and the schema-based document editor. Its name is `@barocss/doc-sync` (user decision, 2026-10-22).
**Read [`HANDOFF.md`](HANDOFF.md) first in a new session.**

**Monorepo structure**: `packages/doc-sync` is the only library that provides the public API. `apps/demo`, `apps/docs`, and `benchmarks` are separate private npm workspaces. The shared example schema is in `fixtures/demo-schema.ts`. The existing package name remains. Six entry points expose the core, sync, server, and three editor bindings. The library also keeps its existing `private: true` setting until release preparation.

**Documentation**: Read the [public documentation site](https://barocss.github.io/doc-sync/) for schema-driven block operations, ProseMirror, Slate, and Lexical integration examples, collaboration rules, and verification limits. The site is built from `apps/docs` and deployed to GitHub Pages. Slate and Lexical have public binding subpaths in the same package. The complete example schema has its own guide. [Editor design lessons](https://barocss.github.io/doc-sync/guide/editor-lessons.html) compare the bindings and explain the input, selection, history, table and rendering problems we solved.

Representative [Word, Notion and presentation schemas](https://barocss.github.io/doc-sync/guide/product-schemas.html) include complete sample models and tests for concurrent editing, history, snapshots and editor conversion. Run `npm run dev:products` for the native Slate/Lexical/ProseMirror demo; setup is in [apps/demo/products](apps/demo/products/README.md). These views do not provide product file import/export or page/canvas rendering.


**Remote user display**: The demo and ProseMirror show user-colored selection ranges and named carets. They support forward, backward, and multi-paragraph selections, position tracking after edits, and overlapping participants. Demo ranges stay within one CRDT sequence (slot). See [`HANDOFF.md` §5.5](HANDOFF.md#55-remote-user-selection-ranges-2026-10-22) for the rules and browser results.

**Input preservation in the comparison demo**: [`apps/demo/compat`](apps/demo/compat/README.md) connects Slate, Lexical, and ProseMirror. It uses token-based selection restoration and an IME composition draft. Chrome CDP checks covered input and carets during remote edits. The default `/pm` IME implementation and OS Korean keyboard validation are separate scopes.

```ts
import {Doc, commands} from "@barocss/doc-sync";     // Core: no dependencies
import {SyncClient, HttpTransport} from "@barocss/doc-sync/sync";
import {DocHub} from "@barocss/doc-sync/server";
import {PmBinding, buildPmSchema} from "@barocss/doc-sync/prosemirror";
```

The CRDT does not know block types. **Inject the schema from outside**, with a tree defined through `children`, as in a schema-based document editor. The CRDT knows only a few schema
"shapes." It has six operations, independent of type. To add a block type, change the schema.

```bash
npm install                  # Dev dependencies (prosemirror-*, typescript, yjs; yjs is for benchmarks)
npm run dev                  # http://localhost:5410  (Node 22.18+, apps/demo/server.ts)
npm test                     # Scenarios + 500 random traces
FUZZ_SEEDS=3000 npm test     # 3000 random traces × 2 and 4 participants
npm run typecheck
npm run bench:client         # SyncClient local edit benchmark
npm run bench                # Stage 0: the same trace with this library and Yjs (benchmarks/)
npm run docs:dev              # Local English documentation
npm run docs:build            # Static GitHub Pages build
npm run docs:check            # Check built pages, links, and English prose
```

Add these parameters to a demo URL: `?doc=name` (document), `?peers=1..4` (participants in this window), `?observer=0` (no server observer), and `?auto=1` (automatic input).

**Multi-window test**: `http://localhost:5410/multi?n=10&doc=multi`

- Opens 10 editor frames, each on a different host (`a.localhost` … `j.localhost`). Browsers allow only 6 HTTP/1.1 connections per host, including connections across tabs.
- Each frame uses one participant and one connection, with no observer. Frames send document fingerprints to the parent. The parent compares them with the server fingerprint and shows whether all documents match.
- Select "Start automatic input" to make all ten frames type random characters, Enter, and Backspace at the same time. Use "Disconnect → automatic input → reconnect" to test merging of offline edits.
- Result (2026-10-22, in-app browser): 20 seconds of automatic input produced 373 changes. All ten frames and the server reached one fingerprint. After disconnection and 10 seconds of input, each frame had 7–24 pending changes and there were 11 fingerprints. Within 6 seconds of reconnection, all documents matched at 514 changes.
- Browsers slow timers in offscreen iframes. Lower frames therefore produce less automatic input.


## How it works

### 1. A document is a token sequence

```
¶root a b c d ¶9C C ¶9B B ¶9A A e f g h
```

There are **character tokens** and **node tokens** (the block-opening marker ¶, tables, rows, images, and so on). The block list is not stored. It is calculated as needed by reading live tokens in order.

- Enter = insert one marker.
- Join paragraphs with Backspace = delete one marker on the original path; moved fragments use a retained join relation.
- Block type (heading, quote, list item) = the marker's `$type` attribute.

There is one main sequence and named **slot** sequences for nodes: table `rows`, `cols`, and `cell:row,col`; container and image `body` slots.
A slot's head ID is derived from its owner node ID and slot name. No separate operation creates the sequence.

Text split uses boundary markers. Block move uses a separate, cycle-safe placement projection. It preserves token IDs and immutable physical origins. A text split does not split an arbitrary subtree.

### 2. IDs alone define order (RGA)

Every token has an immutable ID, `lamport@actor`. A new token is inserted immediately after its left origin token. Concurrent tokens with the same origin are ordered with the larger ID first. IDs determine the physical sequence order. Valid causally ordered deliveries produce the same sequence. Logical block placement is projected separately when movement is used.

### 3. Concurrent Enter at the same position creates one new line

A marker records the boundary seen by its creator (left and right tokens). If multiple live markers have the same boundary, only the first in sequence order opens a paragraph. The others are **absorbed** into that paragraph (orange ¶ in the demo).

- Concurrent Enter at the same position, without seeing the other Enter → one line. All text typed into that line remains there.
- Enter after seeing the other Enter → a separate line. The left token, and therefore the boundary, differs.

### 4. Deletion ledger and undo

Deleting a token does not remove it. The token records its deletion operations and canceled deletions. If any uncanceled deletion remains, the token is dead (a tombstone).

Undo is **separate for each participant**. It sends a new inverse operation instead of returning the document to an earlier state.

- Undo an insertion → a new deletion.
- Undo a deletion → cancel **only that participant's deletion**.
- Undo a block type, attribute, or format → restore the previous value **only if the current value is still the participant's value**. Do not overwrite a value changed by someone else.

If A deletes `defgh` while B deletes and then restores `d`, `d` stays dead. The design prevents undo from restoring another participant's unseen deletion (yorkie#2237).

Editor behavior:

- Consecutive input is one undo unit, within 1.5 seconds and only while the caret is continuous.
- After undo or redo, the caret returns to its position before or after that edit. Token IDs store positions, so remote edits do not displace them.
- Replacement of selected text is one unit: deletion + insertion.
- Keep the latest 100 units. "Clear history" discards them and releases their GC pins (see §9).

### 5. Synchronization: server order is causal order

```
Editor ─ operations ─▶ SyncClient ─ Change{actor, seq, ops} ─▶ POST ─▶ DocHub ─▶ JSONL log
   ▲                                                                          │
   └──────── apply remote Change ◀── SSE ◀── broadcast with serverSeq ─────────┘
```

- Apply local edits immediately. Do not wait for the server.
- The server assigns `serverSeq` in receive order. If a token is used as an origin, it is already in the log at a lower sequence number. A participant therefore needs only its last received `serverSeq`, with no version vector.
- A participant's own returned Change is an acknowledgment only. CRDT operations converge across operation orders, so no rebase is needed.
- Queue offline edits and send them after reconnection. The server deduplicates by `(actor, seq)`, so retries are safe.
- The server holds a document with the same CRDT code. It gives new participants a snapshot. **Client and server share one implementation, which avoids differences between implementations.**

### 6. Character formatting (bold, italic, underline, strikethrough)

Formatting is stored **per character token**, rather than per range. Each character and format has an LWW value: the larger ID wins.

- A format operation is a list of observed character IDs plus on/off. Characters inserted into the range by another participant remain unchanged. Unseen characters receive no formatting.
- If the same character is formatted on and off concurrently, all replicas converge on the larger ID.
- New input inherits the left character's formatting. With no selection, ⌘B changes only the format for the next input.
- One rule, "inherit from the left," replaces separate range-end rules such as Peritext's rule for input at the end of bold text.

### 7. List editing (storage is in §11)

- Tab / Shift+Tab changes `level` from 0 to 4. Enter in an item continues with the same `listType` and level (schema `inherit`).
- Enter in an empty item, or Backspace at the start of an item → outdent one level. At level 0, convert to the sequence's default block (paragraph).
- Numbers are calculated for display. They are not stored, so concurrent item insertion does not break numbering.

### 8. Server application is atomic

A Change contains multiple operations. Before application, the server checks that all origin and target tokens exist. Tokens created by earlier operations in the same Change count as existing. If any check fails, the server rejects the entire Change with 409 and leaves the document unchanged. No partially applied document remains on the server.

### 9. GC: tombstone compaction

Tombstones are **not removed from the sequence**. Removal would change RGA ID comparisons after a shared origin and place late operations elsewhere. Instead, **stable tombstones are compacted**.

- Discard content, formatting, and the deletion ledger. Keep the position (dashed `▒` in the demo).
- Merge tombstones from consecutive input by one participant into one token (`▒×N`). Those character IDs increase by 1 and each uses the previous character as its origin. One span therefore behaves like the original characters during position resolution.

"Stable" means the token is dead and all deletions that made it dead have a `serverSeq` at or below the watermark. The server sets the watermark.

```
watermark = min over participants ( received ack , undo pin − 1 )
```

- **Acknowledgment (ack)**: the `serverSeq` that a participant has received and applied. Future operations from that participant have seen those deletions, so they do not use the compacted tokens as origins.
- **Undo pin**: the earliest `serverSeq` of any deletion that local undo or redo can cancel. Compaction stops before it, because undo must restore that token.
- Disconnected participants remain in the watermark calculation for a 2-minute lease. Closing a window removes the participant immediately through `sendBeacon`.
- Acks use **the same queue as Changes**. If an ack overtakes an unsent operation, the server could compact a token that the operation needs.

GC is itself one log entry, `{serverSeq, gc: watermark}`. All replicas compact at the same log position and watermark, so their results match. Operations that refer to compacted tokens still attach to those tokens or spans. The server runs GC after edits settle for 0.8 seconds when at least 12 tombstones can be compacted.

### 10. Schema injection and shapes

Provide a schema when creating `SyncClient`: `new SyncClient(actor, transport, {schema})`. The server can validate with the same schema, but a schema is optional there.

| Shape | Meaning | Types in the demo schema |
|---|---|---|
| `text` | Text block. A marker opens it in a flow sequence; it ends at the next marker. `children` lists allowed inline types. | paragraph · heading1·2 · quote · list-item · image |
| `inline` | Occupies one character position in a text block. | inline-image |
| `flow` | Container with one block sequence. Enter splits and Backspace joins blocks here. | content · table-cell-body · image-component · callout |
| `group` | **Visible** container that groups consecutive item blocks; not stored. | list |
| `grid` · `row` · `cell` | Table, table row, table cell. Cell `children` contains one inner flow container. | table · table-row · table-cell |
| `atom` | Block with no content. | divider |

```
content ─ paragraph(─ inline-image) · heading1 · heading2 · quote
        ─ list ─ list-item
        ─ table ─ table-row ─ table-cell ─ table-cell-body ─ paragraph · list · image-component
        ─ image-component ─ image ─ inline-image
                          ─ caption ─ caption-paragraph
        ─ callout ─ paragraph · heading2 · list · table · image-component
        ─ divider
```

The six type-independent wire operations are character insertion `text`, node insertion `node`, deletion `del`, deletion cancellation `undel`, attribute assignment `set`, and identity-preserving placement `move`.
Block type `$type`, block and image attributes, and character formatting all use `set`.

**Validation uses immutable facts only.** The server checks whether a type is allowed in a sequence and whether an attribute value is valid. It uses only the token's sequence membership
and the node's birth type. Current type and live status can differ between replicas. Rejection based on those values would cause the server and a participant that already applied the edit to diverge.
A server without a schema therefore has the same convergence behavior, with fewer checks.

Model output (`toJSON`) is a tree with schema type names, in the same form as a schema-based document editor's document JSON.

### 11. Lists: flat storage, list > list-item display

A list-item is a text block in a flow sequence with `listType` and `level` attributes. Model calculation groups consecutive list-items with the same `listType`
into one `list` (schema shape `group`, `by: ["listType"]`).

If `list` were stored as a real container, moving an item into or out of a list would require a **block move**. This includes Enter in an empty item, paragraph ↔ list conversion, and deleting the paragraph between two lists.
The design avoids that operation. Flat storage needs only a type change. Text typed by B remains when A takes the item out of a list (covered by tests). The schema-based document editor also stores lists through `listGroupId` and `listItemLevel` attributes.

### 12. Tables: row sequence × column sequence, cells identified by IDs

A table node has a `rows` sequence (table-row nodes) and a `cols` sequence (column nodes). Cells are implicit. Each row/column intersection has a `cell:rowID,colID`
slot sequence, which is its table-cell-body. The schema does not set row and column counts. Choose them at insertion, then add or remove rows and columns.

- Cells use **IDs instead of indices**. If A adds a row while B adds a column, cells remain aligned. The cell at the intersection of independently created rows and columns is immediately usable.
- If one participant deletes a column while another edits one of its cells, the column disappears. The text **remains live in a hidden cell**, rather than becoming a tombstone. Undoing the column deletion restores the text too.
- With no rows or no columns, the entire table is hidden. This can occur when two participants concurrently delete the last two rows.
- A cell contains a flow sequence. Enter, lists, images, and concurrent Enter follow the same rules as the main document.
- If another participant deletes the current column, the caret moves to a neighboring cell.

**Cell merging (colspan · rowspan)**: Cells have no tokens. Merge state is stored as a table-node attribute:
`$span:topLeftRow,topLeftCol` = `{row: endRow, col: endCol}` (all IDs, LWW). The model returns a full grid, as in the schema-based document editor. Every row has every cell.
The top-left cell has `colspan` and `rowspan`; covered cells have `spanned: true`.

- The span uses **end IDs instead of counts**. A column inserted within the span during a merge is covered too. Deleting the end column shrinks the span.
- Deleting the top-left cell's row or column removes the merge and exposes the covered cells.
- For concurrent overlapping merges, only the later ID wins. The others are discarded. All replicas produce the same result.
- Covered-cell text is hidden, not deleted. Splitting reveals it again. Moving text during a merge would require block moves. A caret in a covered cell moves to the top-left cell.
- Editor controls: "Merge →", "Merge ↓", and "Split" inside cells. Tab and arrow keys skip covered cells.

**Cell attributes (backgroundColor)**: These also use table-node attributes, `$cell:row,col|name` (LWW). Writable attributes are table-cell attributes without
`computed`. `backgroundColor` has a `#rrggbb` schema `pattern`. Direct writes to calculated `colspan`, `rowspan`, and `spanned` are rejected.
Color belongs to row and column IDs. It stays with the same cell after earlier row or column insertion and returns when a deleted column is restored.

If a table, image, or divider has no following block with its own marker, it gets an empty **virtual** block. There is always a caret position before and after a table,
and a destination for text inserted concurrently just after it.

### 13. Images: image-component > [image > inline-image, caption > caption-paragraph]

An image-component is a flow container. Its sequence contains an image block followed by caption-paragraph blocks.

- An image block rejects text (`text: false`) and contains one inline-image. inline-image is an inline node with `src`, `width`, and `height` attributes.
- Captions use the list pattern. caption-paragraph is a flat text block. Consecutive blocks form one `caption` in the model
  (`group`, `by: []`). Enter at the caption's end adds a caption line.
- Blocks do not merge into a block that rejects text. Backspace at the caption start, Delete at the image end, and deletion from image through caption all preserve a caption block.
- Paragraphs can also contain inline-image nodes. They occupy one character position and are skipped by formatting. Concurrent image resizing converges on the later ID.

### 14. Editing API: six model operations (`docs/edit-api.md`)

An editor uses model paths (child indices in the `toJSON` tree, the same numeric-array form as the schema-based editor's paths) and model nodes. It does not need to know CRDT sequences or tokens.

```ts
doc.edit([
    {op: "delete", at: [0], count: 1},                                  // Whole-document replacement form
    {op: "insert", at: [0], content: [{type: "paragraph", runs: [{text: "after", marks: {}}]}]},
]);
doc.edit([0, 1, 2].map(r => ({op: "insert", at: [1, r, 1], content: [{type: "table-cell"}]})));   // One cell per row = one column
doc.edit([{op: "update", at: [1, 0, 0], attrs: {colspan: 2, backgroundColor: "#dcfce7"}}]);
```

- Compile `insert · delete · update · split · merge · move` to wire operations by schema **shape** (`edit.ts`). Type names are not inspected.
- Deleting the first block of a flow in a batch leaves a vacant head. Later paths do not count it. An inserted leading text block fills it.
- Insertion or deletion of same-index cells across rows folds into one column operation. An operation in only one row is also corrected to one column.
- `commands.ts` converts editor commands (text, Enter, Backspace, table rows/columns, cell merging, and so on) to edit operations. It replaces 18 old editing functions.
  Before removal, the old and new functions ran side by side for 34,001 steps from the same states, with 0 model differences.
- `edit()` also returns **normalize**: the difference between direct application of the batch to the editor model and the CRDT model. Examples include a leading text block, uneven columns, and columns within merged cells.

### 15. Receive-side events

`client.onModelEvents = (events, info) => …` supplies edit operations that transform the previous model into the next model after remote changes, undo, or snapshots.
The editor applies them to its own model.

- Events come from a before/after model comparison (`diffModels` in `model.ts`). One character produces one character insertion. One column produces one cell insertion per row.
- Flow comparison uses a flat item sequence. Each operation is applied to a working copy, which supplies the next path. Paths stay correct when lists join or split.
- Before emission, events are applied to the old model for **verification**. On failure, the system **falls back** to whole-document replacement (`info.fallback`).

### 16. Links: value formatting

Link URLs are stored as a per-character LWW format value, `link`. The model groups consecutive characters with the same URL into one `inline-hyperlink {url}`.
This is the schema's `span` shape: flat storage with grouped display, like lists. New input does not inherit links (no `inherit`).
The schema `pattern` validates URLs. The server rejects values such as `javascript:` URLs.

### 17. Carets and selections

Positions have two forms: model paths for the editor, and token keys for the CRDT. Remote edits can change paths, while token keys remain stable. Store selection endpoints as token keys,
then convert them to paths when drawing: `anchorAt(doc, path)` → key; `pathAt(doc, key)` → current path.
Presence also sends remote carets as token keys. See `docs/edit-api.md` §11.

### 18. ProseMirror integration (`packages/doc-sync/src/pm/`, `/pm`)

The editing API is editor-independent. ProseMirror uses the same API. At `/pm?doc=name`, demo editor A and ProseMirror P edit the same document.

- **Schema** (`pm/schema.ts`): Derives a ProseMirror schema from the injected schema. Lists are flat: list_item is a textblock with listType and level attributes.
  Container lists from prosemirror-schema-list would require node moves when items enter or leave. Tables use the prosemirror-tables form (table, table_row, table_cell, colspan, rowspan). A link is a mark with one value.
- **Conversion** (`pm/convert.ts`): Model ↔ ProseMirror document and model path ↔ ProseMirror position. Our table is a full grid with covered cells. ProseMirror omits covered cells, so conversion adds or removes them. Hidden text is preserved from the previous model.
- **Send side** (`pm/binding.ts`): Converts each Step to model operations. It preserves the meaning of text insertion/deletion within a block, Enter (splitBlock → **split**), Backspace at block start (join → **merge**), cross-block deletion, and formatting (Add/RemoveMarkStep → update). Other Steps (type changes, table rows/columns, paste) use before/after model comparison. prosemirror-tables column insertion therefore becomes cell insertion in every row, which the CRDT folds into one column. The converted documents are compared. If needed, the local model is corrected, then ProseMirror is corrected if CRDT rules still require it.
- **Receive side**: Remote edits and undo produce one transaction that replaces only the changed range (`findDiffStart/End`). ProseMirror maps the local caret through that Step. Remote caret decorations use token key → path → position.
- **Undo**: Uses CRDT participant-specific undo (`binding.undo()`), instead of ProseMirror history.
- **Difference from y-prosemirror**: Enter is sent as one split. It is not a document diff that shortens the first paragraph and reinserts trailing text. Text typed by B into the trailing portion remains when A splits it. Concurrent Enter at the same position creates one new line (covered by tests).
- To run in the browser without a bundler, the server serves ESM from `node_modules`, and the import map in `pm.html` resolves package names.

Tests (`packages/doc-sync/test/pm.test.ts`, `packages/doc-sync/test/pm-fuzz.ts`) use real ProseMirror state and commands (splitBlock · joinBackward · deleteSelection · toggleMark · setBlockType · replaceSelectionWith(table) · addColumnAfter · addRowAfter · deleteColumn · deleteRow · mergeCells · splitCell) for random editing.
All 300 traces with 2 participants and 200 traces with 3 participants reached the same document in editor, CRDT, and server. 82% of Steps preserved intent directly (text 4,324 · Enter 1,480 · merge 92 · formatting 489 · range deletion 96). Model comparison handled 18% (1,402). Whole-document replacements: 0.

Root commands delegate to workspaces. `npm run typecheck` checks the library, tests, demo, benchmarks, and shared schema. `npm test` runs the library and demo HTTP integration tests.

```text
packages/doc-sync/  Library src/ and test/
apps/demo/          Demo server, UI, and HTTP integration tests
benchmarks/         Comparison engines, traces, measurements, and results/
fixtures/           Shared demo and test schema
docs/               Design, reports, and roadmap
data/               Existing demo logs (same location)
```

Use `DATA_DIR=/absolute/path PORT=5411 npm run dev` for a separate log folder and port. Default logs stay in root `data/`. Relative output paths in workspace commands are relative to that workspace. Examples: `npm run bench -- --out-dir results/new-name`, `npm run bench:client -- --out results/new-name.json`.

## Files

| File | Purpose |
|---|---|
| `packages/doc-sync/src/crdt/ticket.ts` | IDs and Lamport clock |
| `packages/doc-sync/src/crdt/schema.ts` | Schema types (shapes, children, attributes) and schema validation |
| `packages/doc-sync/src/index.ts` | Core entry: `Doc`, `commands`, `History`, schema and model types; `sync/index.ts`, `server/index.ts`, and `pm/index.ts` are also entry points |
| `packages/doc-sync/src/crdt/doc.ts` | Doc: sequences and slots, schema validation and operation application, model calculation (blocks, tables, spans), compaction, and `edit()` |
| `packages/doc-sync/src/crdt/model.ts` | Pure model functions: normalization, edit application, and model comparison |
| `packages/doc-sync/src/crdt/edit.ts` | Edit-to-wire compilation; path ↔ position ↔ token key |
| `packages/doc-sync/src/crdt/commands.ts` | Editor commands → edit operations |
| `packages/doc-sync/src/crdt/history.ts` | Participant-specific undo/redo: input grouping, carets, conditional attribute restoration, and pins |
| `fixtures/demo-schema.ts` | Demo editor schema; block types are defined only here; tests also use it |
| `packages/doc-sync/src/sync/protocol.ts` | Change, Envelope (change or GC), Ack, events, and Transport |
| `packages/doc-sync/src/sync/client.ts` | SyncClient: document, undo, connection, offline queue; acks and pins use the Change queue |
| `packages/doc-sync/src/sync/http-transport.ts` | Browser transport (SSE + fetch) |
| `packages/doc-sync/src/server/hub.ts` | DocHub: ordering, atomic application, broadcast, participant acks and pins, watermark and GC; transport-independent |
| `apps/demo/server.ts` | Demo server: Node http, JSONL persistence, `.ts` served to browsers after type stripping |
| `apps/demo/ui/*` | Demo: small schema-aware editor (Korean IME, tables, images, lists), per-sequence token inspector, scenarios, automatic input, and multi-window tests (`multi.html`) |
| `docs/edit-api.md` | Editing API: six model operations (insert, delete, update, split, merge, move), through schema-based editor integration |
| `docs/report.html` | Report of work to date |
| `docs/roadmap.html` | Roadmap to a usable library: stages 0–7, decision gates, and risks |
| `benchmarks/*` | Stage 0: edit traces (trace), engine wrappers (this library and Yjs), measurements (run), CPU profiling (profile); results in `benchmarks/results/` |
| `packages/doc-sync/test/harness.ts` | In-memory network; controlled delivery defines who saw what and when |
| `packages/doc-sync/test/scenarios.test.ts` | S1–S9, disconnection, late participants, and paragraph types |
| `packages/doc-sync/test/features.test.ts` | Formatting, lists, undo behavior, GC, and server atomicity |
| `packages/doc-sync/test/tables.test.ts` | Tables, virtual blocks, dividers, images, schema validation, alternate schema injection, and schema-free server |
| `packages/doc-sync/test/edit.test.ts` | Editing API: path round trips, schema-based editor operation batches, column folding, links, receive-side events, and selections |
| `packages/doc-sync/src/pm/*` | ProseMirror: schema generation, model ↔ document, path ↔ position, Step ↔ model operations (binding) |
| `apps/demo/ui/pm.html`, `pm-app.ts` | Demo editor × ProseMirror demo (`/pm`) |
| `packages/doc-sync/test/pm.test.ts`, `packages/doc-sync/test/pm-fuzz.ts` | ProseMirror tests: same-position Enter, Enter intent, column folding, undo, formatting, links, and random traces |
| `packages/doc-sync/test/fuzz-core.ts`, `packages/doc-sync/test/fuzz.test.ts` | Random concurrent editing in the body, cells, and containers; table, row, column, image, and divider insertion/deletion; disconnection, partial delivery, and arbitrary GC |

## Test results

- 2026-10-23 structural paragraph recalculation improvement (measurement baseline `10dfd86`; uncommitted at measurement time): Update only affected sequences after structural changes and reuse unchanged paragraph models. Passed 13 new regressions, expanded core 246 + demo 10, compat 31, Stage0 Ours/Yjs 6, and type checks. At 100,000 characters, receive p95 for six structural cases changed from 160.939–292.377 to 46.512–115.216ms. Chrome structural input medians fell, but the first modified run had a p95 regression in one direction. This does not establish complete screen-latency resolution or an SLO pass. See [before/after measurements and limits](benchmarks/results/structural-cache-2026-10-23/report.md) and [HANDOFF §5.16](HANDOFF.md#516-improving-paragraph-recalculation-after-structural-changes-2026-10-23).

- 2026-10-23 roadmap follow-up integration (previous baseline `6f15291`): Narrowed remote comparison for up to 8 safe text blocks. Expanded tests passed: core 233 + demo 10, compat 31, and type checks. Chrome basic 30 + new 10 steps and 104 compat regressions were checked. At 100,000 characters, 2-block receive p95 changed from 31.330–46.928 to 1.653–1.739ms; 8-block p95 changed from 36.132–44.818 to 3.917–6.410ms. These are not screen-latency figures. Nine or more blocks, structure, and undo/redo retain the full path. See the [measurement report](benchmarks/results/remote-multiblock-2026-10-23/report.md) and [HANDOFF §5.14](HANDOFF.md#514-roadmap-priority-remote-comparison-of-multiple-text-blocks-2026-10-23). Final retests and main integration follow [§5.15](HANDOFF.md#515-final-checks-and-main-integration-of-multi-text-block-remote-comparison-2026-10-23).

- 2026-10-23 final integration (`6f15291`): Includes paragraph model reuse, demo Paint improvements, intent specifications and 41 regressions, consecutive formatting undo/redo fixes and 19 regressions. Expanded tests passed: core 204 + demo 10, compat 31, and type checks. Source-hash-matched evidence also confirmed Chrome basic 30, focused 26 steps, compat 104 regressions, and 30 operation traces. See [HANDOFF §5.13](HANDOFF.md#513-final-checks-and-main-integration-of-all-changes-2026-10-23) for final checks and evidence limits. Performance figures below were measured from each report's source at that time.

- 2026-10-23 screen Paint improvement: Narrowed isolation to top-level ordinary paragraphs. Composing paragraphs, headings, lists, quotes, and nested structures retain their previous display behavior. Final 100,000-character Chrome p95 changed from 111.7/120.4 to 69.5/68.5ms; a baseline source rerun gave 108.1/121.9ms. External load and measurement scope are in the [report](benchmarks/results/screen-paint-2026-10-23/report.md); handoff is in [HANDOFF §5.10](HANDOFF.md#510-improving-screen-paintprepaint-cost-2026-10-23). Source was uncommitted during measurement. Final integration follows §5.13.

- 2026-10-23 screen latency improvement (source above baseline `f9370df` at measurement time): Reuses unchanged paragraph models. In a 100,000-character Chrome trace, screen p95 changed from 246.5 to 124.1ms for demo→PM and from 260.4 to 120.2ms for PM→demo. Expanded tests at that point passed core 144 + demo 10, with 0 failures. See [measurement conditions and scope](benchmarks/results/screen-latency-2026-10-23/report.md) and [HANDOFF §5.9](HANDOFF.md#59-improving-paragraph-model-recalculation-in-screen-latency-2026-10-23).

- 2026-10-23 main integration: Added single-block receive comparison, large-paste cache handling, Unicode undo, internal PM conversion reuse, specifications, property tests, and a long-run CI foundation. Expanded pre-integration tests (`FUZZ_SEEDS=3000 PM_SEEDS=300`) passed core 138 + demo 10. Eight local shards with 8 replicas each verified 1,000,021 wire Ops in total. This is a bounded document-batch test, separate from two weeks of actual CI observation. See [execution status](docs/roadmap-status.md), [HANDOFF §5.8](HANDOFF.md#58-final-checks-before-main-integration-2026-10-23), and [new baseline measurements](benchmarks/results/roadmap-2026-10-23/report.md). Actual screen performance and G0/G1 require separate decisions.

- Input fix integration validation (2026-10-22): `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` **113/113**; `npm test --prefix apps/demo/compat` **31/31**; type checks and build passed. Checked 84 Chrome input cases, 20 general regressions, and 30 operation traces. See [`HANDOFF.md`](HANDOFF.md) §5.6 for execution and supported scope. The final record is local `output/validation/ime-cursor-fix-20261022/validation.json`. Earlier monorepo and Presence records remain in §5.4–5.5.
- 14 scenarios: concurrent Enter at one position, subsequent text, two sequential Enter presses at the end, concurrent Enter at the end, four-way concurrency (three delivery orders), Enter versus trailing input, cross-boundary deletion, Enter undo versus remote text, undo versus concurrent deletion, concurrent paragraph type changes, offline edits, and late participants.
- 15 feature tests: formatting 3 · lists 4 · undo 3 · GC 4 · server atomicity 1.
- 30 table/schema tests: tables 9 · cell merging 6 · cell background color 3 · virtual blocks/dividers 2 · images 3 · captions 3 · schema validation 1 · alternate schema (task list) injection 1 · schema-free server 1 · table GC 1.
- 7 ProseMirror tests: same-position concurrent Enter, Enter intent preservation, addColumnAfter → one column, undo, formatting/links, and 100 random traces × 2 and 3 participants (set through `PM_SEEDS`).
- 13 editing API tests: path round trips, schema-based editor whole-document replacement/table insertion forms, column folding (all rows/one row), column deletion, update/merge, links 2, receive-side events, and selection.
- 3000 random traces × 2 and 4 participants × GC off/on: all participants and the server matched (0 divergence/errors). **Mirror check**: Each participant has an editor-side model changed only by edit operations and receive-side events. Every step compares it. Each run had 80,000–210,000 receive-side events, 0 mismatches, 0 verification failures, and 8–9 local edits with normalize. Half the traces start with a table. Edits also occur in cells and containers (128 of 300 traces retain a table to the end). Traces include cell merge/split (33 of 600 retain merged cells to the end).
  - Server rejection of client-generated operations: 0. The harness treats rejection as an error.
  - GC-enabled traces perform real compaction: 2 participants — 1500 GC runs, 5899 character positions; 4 participants — 1091 runs, 4027 positions.
- Negative controls (whether tests detect faults; measured before schema support):

  | Deliberate fault | Divergent traces (of 1000; 2 / 4 participants) |
  |---|---|
  | RGA rule | 175 of 300 |
  | Remove undo pins from the GC watermark | 28 / 41 |
  | Remove received acks from the GC watermark | 124 / 165 |

- Browser (three participants, real SSE): four scenarios, direct input, disconnection/reconnection, Korean input, recovery after server restart, bold and inheritance, list indent/outdent, word-level undo/redo, and GC (12 → 7 tokens, `▒×6`).
- Browser (schema version): two table scenarios — concurrent row/column insertion followed by input at the intersection (3×3), and column deletion versus cell input followed by undo (restored with '!!'). Cell merging (→ and ↓ to 2×2; rowSpan and colSpan 2 on all three participants), cell background color, image insertion (caret moves to caption, placeholder in empty caption), caption input, inline images, and numbered lists with levels. All three participants matched.

## Missing features

| Missing feature | Reason / approach |
|---|---|
| Row and column attributes | Add row height and column width as row/column node attributes; not implemented yet. |
| Collect text when merging cells | Covered-cell text is currently hidden. Collecting it in the top-left cell requires copying. Concurrent input into those cells can then diverge. |
| Exactly one required child | The schema cannot express exactly one image and one caption (`min`/`max`). Editing functions enforce this by blocking Enter in image and preventing caption-to-image merges. Hand-built operations can create a second image or an image without a caption. |
| Validation precision | Validation is per sequence: acceptance by any text type in the sequence is enough. An image container with a caption accepts text, so the server cannot reject a hand-built operation that inserts text into an image block. Editing functions prevent it. Block-level checks need stable block membership across replicas, but membership is current state and can differ (§10). |
| Schema-based document editor binding | The current editor is a demo. Model output already matches that editor's document JSON form. Add a converter between its model operations and these operations. |
| Authentication, authorization, multiple servers | Demo-level implementation. Per-document server routing can support horizontal scaling. |
| Performance | Position indexes, block caches, and SyncClient local verification costs were reduced. Remote model comparison and full PM conversion costs remain. Before/after raw data and monorepo comparisons are in `HANDOFF.md` §5.1–5.4. |
| Long-disconnected participants | After the 2-minute lease, participants leave the watermark calculation. If they reconnect and undo an offline edit that needs an already compacted tombstone, divergence is possible. No forced snapshot recovery exists yet. |
| Value formatting such as links and text color | Formatting is currently on/off only. The same per-character LWW mechanism can support values. |
