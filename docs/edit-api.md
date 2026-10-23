# Generic Edit API Design Note (2026-10-22, Implemented)

This proposal replaces about 20 edit functions with **five model operations** (`insert · delete · update · split · merge`). Schema shapes compile them to wire operations. Names and semantics match the model operations of a schema-based document editor, to make editor integration nearly 1:1.

**Implemented.** Section 10 records the implementation and differences from the initial proposal. All decisions in §9 followed the proposal.

---

## 1. Current Structure and Problems

| Layer | Current State | Problem |
|---|---|---|
| Wire operations | Five type-independent operations: `text · node · del · undel · set` | None; retain them |
| **Edit functions** | `insertText`, `splitBlock`, `insertBlock`, `insertInline`, `appendBlock`, `insertAxis`, `deleteAxis`, `deleteBlock`, `setAttr`, `setItemAttr`, `setCellAttr`, `setSpan`, `setMark`, `setBlockType`, `setNumberAttr`, `deleteRange`, `backspace`, `deleteForward` … | Each feature adds functions. Address types differ (`Pos`, `GridBlock + r, c`, `Item`). Integrating a schema-based document editor requires another conversion from its operations to these functions. |
| Model | Editor-shaped tree calculated from tokens (`toJSON`) | None |

Edit functions perform three tasks:

1. **Resolve addresses**: find the token and line after which to edit.
2. **Expand by shape**: a table becomes a table node + following block marker + rows + columns; a list item becomes a marker + group attributes, and so on.
3. **Preserve intent**: Enter boundary keys, merge restrictions for blocks that cannot receive text, and mark inheritance.

These tasks depend on **schema shapes**, not function names. Define them once per shape.

## 2. Goals

- Editors use **model paths and model nodes**. They need no knowledge of CRDT lines, tokens, or slots.
- Five operations: `insert · delete · update · split · merge`.
- A **compiler for each shape** converts them to wire operations. New block types need only schema changes. This extends the current contract to editing.
- Undo, cursor history, server validation, and GC remain unchanged because the compiler produces the same wire operations.

```ts
/** Position in the model tree (toJSON), shaped like an editor tree path (number array). The final number inside a text block is a character position. */
type ModelPath = number[];

type EditOp =
    | {op: "insert"; at: ModelPath; content: string | NodeJSON[]}
    | {op: "delete"; at: ModelPath; count: number}
    | {op: "update"; at: ModelPath; attrs: Record<string, unknown>; length?: number}
    | {op: "split"; at: ModelPath}
    | {op: "merge"; at: ModelPath};

/** Compile and apply in order, then return the generated wire operations and resulting caret. */
doc.edit(ops: EditOp[]): {ops: Op[]; caret: string};
```

Existing functions can remain as thin wrappers over `edit()` or be removed.

## 3. Addresses: Model Paths

Paths are child indexes in the `toJSON()` tree.

```
[1]                  Second body block (table)
[1, 0]               First row of that table           (table-row)
[1, 0, 2]            Third cell of that row             (table-cell)
[1, 0, 2, 0]         Body of that cell                  (table-cell-body)
[1, 0, 2, 0, 1, 4]   Fifth character position in the second body block
[3, 0, 2]            First item of list [3], third character position
```

Each shape has one path-to-storage rule.

| Shape of the Node on the Path | Meaning of the Next Number | Storage Mapping |
|---|---|---|
| `flow` | Child index | Block in the flow line. **Count groups after flattening**: `[3, 1]` is the second item of list [3] = stored block (first list block index + 1). |
| `group` | Item index | As above |
| `grid` | Row index | Live row in the rows line |
| `row` | Cell index, including hidden cells (full grid) | Live column in the cols line → `cell:row,col` line |
| `cell` | Only 0 | Cell body = its cell line |
| `text` | Character position | Block `chars`; an inline node also occupies one position |

- Paths refer to the **current state**. Compilation happens immediately and locally. Only token IDs go over the wire, as in current edit functions. Different paths on different replicas are therefore acceptable.
- In a batch, each subsequent path is interpreted after applying earlier operations, as in a schema-based document editor's operation batch.
- Also implement the reverse mapping, token key → path, for receiving events (§6) and cursors.

## 4. Compilation by Operation and Shape

### insert(at, content)

| Destination → Content | Wire Operations |
|---|---|
| Inside text block → text (`string`) | `text`, inheriting marks from the left as today |
| Inside text block → inline node (`{type: "inline-image", attrs}`) | `node` |
| Flow child position → text block | `node` marker after the preceding block's end, boundary = left token \| right token, then its `text` |
| Flow child position → group (`list`) | One marker per item; write group attributes (`listType`) **on every item** |
| Flow child position → grid (`table`) | Table `node` + n row `node`s + m column `node`s (m = maximum cell count among rows) + recursively write each cell's body to its cell line + `colspan·rowspan` → `$span`, other cell attributes → `$cell` |
| Flow child position → flow (`callout`, `image-component`) | Container `node` + recursively write body children to its body line; reuse the line head when the first child has the container's default type |
| Flow child position → atom | `node` |
| Grid row position → `table-row` | Row `node` + bodies of its cells |
| Same cell position in every row → `table-cell` | **One column** (§5.1) |

If a flow child insertion is in the **middle** of a block, split first as current `insertBlock` does. Trailing text goes into a new block of the same type, and content is inserted between them. A schema-based document editor sends `split` then `insert`; sequential compilation produces the same result.

### delete(at, count)

| Target | Wire Operations |
|---|---|
| Characters or inline nodes in text | `del` |
| Flow block range | `del`: marker and absorbed markers for text blocks; only the node for tables, containers, and atoms, whose contents also become hidden |
| Grid row | Row `del` |
| Same cell in every row | Column `del` (§5.1) |
| Last row or column | Table `del`, as today |

### update(at, attrs, length?)

| Target | Wire Operations |
|---|---|
| Text-block or node attributes | `set` for each key; partial merge, equivalent to updating part of a schema-based document editor's data |
| Block type (`attrs.type`) | `set $type`, only between text shapes. Insert a new marker for a virtual position. |
| Text range (`length`) + marks | `set` per character, skipping inline nodes |
| `backgroundColor` and similar table-cell attributes | `set $cell:row,col\|name` on the table node |
| Table-cell `colspan·rowspan` | Find end-row/column IDs and write `set $span:row,col` |
| Inline node (`inline-image` dimensions) | `set` |

### split(at)

A position inside a text block becomes one marker `node`, using the boundary key, `next`, and `inherit`, as current `splitBlock` does.
**Discard inline-level split.** This model has no inline-text nodes. Different mark ranges are calculated views.

### merge(at)

Merge block [i] into [i-1] by deleting block [i]'s marker. If the preceding block cannot receive text (image), do nothing, as in the current rule.

## 5. Difficult Cases

### 5.1 Columns

A schema-based document editor's tree has no column nodes. Column insertion arrives as `insert [table, r, c] table-cell` **once per row**. This model addresses cells with (row, column) IDs, so it must fold that pattern into one column node.

- First scan the batch for insertion at the same index c in **every live row** of the same table → one column `node` + each new cell's body.
- A subset of rows (ragged columns) cannot be represented directly. **Proposal: normalize to one column**, leaving empty cells in other rows. Rejection would diverge from the editor display.
- Use the same pattern for column deletion: `delete [table, r, c] 1` for every row.
- Full-grid indexes include hidden (`spanned`) cells, which simplifies pattern detection.

### 5.2 Intent: Enter and Structural Split

At the same position, user Enter and a split that makes room before insertion both create one marker. The difference is **when the boundary key is captured**. Capture the current left and right tokens at compilation. This preserves the rule that Enter after observing another Enter creates a separate line.

A schema-based document editor's Enter arrives as `split [0,0,5]` and `split [0,1]`. Discard the first, inline-level split and create a marker only for the second. The earlier Yorkie collaboration plugin similarly folded Enter into one two-stage edit. This model is simpler because it has no inline layer.

### 5.3 Links (inline-hyperlink)

A schema-based document editor represents links as inline groups (`inline-hyperlink > inline-text`). This model has no such shape. One of two approaches is needed.

- **Value mark**: `link = url` LWW per character. Simple and consistent with current marks, but without a distinct link identity: consecutive identical URLs form one link.
- **Inline group shape**: start/end markers. Preserves identity, but requires new concurrent-edit rules, such as whether text inserted between markers belongs to the link (the Peritext problem).

The proposal uses value marks. Group consecutive identical URLs into one `inline-hyperlink` in model output to match the editor shape. As with lists, storage is flat and the view is grouped.

### 5.4 Undo

During collaboration, use CRDT undo per participant and disable the schema-based document editor's history, as the current Yorkie collaboration plugin does. Operations produced by `edit()` are recorded as before.

## 6. Receiving: CRDT Changes → Editor Operations

Two approaches can notify the editor about received wire operations.

| Method | Mechanism | Tradeoffs |
|---|---|---|
| A. Model comparison | Compare `toJSON` before and after receipt by block and replace changed blocks. | Simple and correct, but replaces entire blocks containing cursors or composition input. |
| B. Operation translation | Translate each wire operation at its current state to a model operation: `text` → text insert, marker → split, marker `del` → merge, row `node` → row insert, and so on. | Precise, but must handle all cases with no visible change, including absorbed markers, virtual positions, and hidden cells. |

Proposal: **use B, compare model fingerprints after application, and fall back to A on mismatch**. This follows the compiler + verification + block replacement structure used by the earlier tree CRDT prototype.

## 7. Migration Path

1. **Path resolver**: model path ↔ (line, block, position) ↔ token key. Test round trips for every path in random documents.
2. **`edit()` stage 1**: insert/delete/update/split/merge for text, inline, flow, group, and atom.
3. **`edit()` stage 2**: grid row insertion/deletion, cell attributes, cell merging, and column patterns (§5.1).
4. **Equivalence tests**: move current edit functions onto `edit()`. Run random scripts through the function version and edit version and compare models. Remove functions after equivalence passes.
5. **Editor adapter**: schema-based document editor operations → `EditOp` (fold inline paths to character positions, split chains, and column patterns); CRDT changes → editor operations (§6). Run 3000 scripts with a real-editor jsdom harness.

## 8. Unchanged Components

- Five wire operations, server validation, GC, and snapshots.
- Undo and cursor history, because compiled operations use the same wire format.
- Schema: compilers read only existing shapes.

## 9. Decisions to Make

1. Ragged columns: **normalize** (proposed) or reject.
2. Links: **value marks + grouped view** (proposed) or inline group shape.
3. Receiving: **B + verification + A fallback** (proposed) or A only.
4. Current edit functions: retain as `edit()` wrappers or remove.
5. Validate this API with the repository demo editor first, or proceed directly to a schema-based document editor adapter.

---

## 10. Implementation Results (2026-10-22)

| File | Responsibility |
|---|---|
| `packages/doc-sync/src/crdt/model.ts` | Pure model functions: canonical shape normalization (canonical), edit application (applyEdits), model comparison (diffModels). No CRDT knowledge. |
| `packages/doc-sync/src/crdt/edit.ts` | Model path resolution, edit-to-wire compilation (virtual heads and column folding), path ↔ position ↔ token key |
| `packages/doc-sync/src/crdt/commands.ts` | Editor commands (characters, Enter, Backspace, table rows/columns, and so on) → edit operations. Migrated 18 former Doc edit functions. |
| `Doc.edit(ops)` | Edit batch → wire operations + normalize |
| `SyncClient.onModelEvents` | Receiving events, verification, and fallback |

### Differences from the Initial Proposal

- **Receiving uses model comparison instead of operation translation.** It compares models before and after a remote change and generates edits with the same precision: one character becomes one character insertion; one column becomes one cell insertion per row, as in a schema-based document editor. Absorbed markers, virtual positions, and hidden cells need no special handling for invisible changes. Verification (does application to the before model produce the after model?) and fallback (replace the whole document) follow the proposal.
- **Comparison uses flattened item sequences.** Comparing grouped lists caused an inserted list to join its neighbor immediately and shift subsequent paths. Mirror tests found this defect. Flows are therefore flattened for comparison. Each operation is applied to a working copy, and the next path is resolved from that copy.
- **Empty virtual positions after tables are omitted from the model.** A table can be the last child of a flow, as in a schema-based document editor. The editor retains virtual positions for cursors.
- **Item attributes override group attributes.** Inserting a bulleted item inside a numbered list or changing an item's listType splits the group.

### When Normalize Occurs (Editor Application Differs from the CRDT Model)

| Case | Reason |
|---|---|
| An edit makes a flow start with a table or container. | A CRDT line head is always a text block, leaving an empty leading paragraph. Canonical model rules include this, so the repository editor agrees. A schema-based document editor adapter must account for it. |
| Insert a cell into only one row (ragged columns). | Normalize to one column, with empty cells in other rows. |
| Insert a column or row inside merged cells. | Merge endpoints use IDs, so the new column is also covered; the editor leaves colspan unchanged. |
| Overlapping cell merges | Accept only the later merge. |
| Delete a table before a virtual position that contains text. | Virtual text joins the preceding block. Rare; occurs only during collaboration. |

Each run of 3000 random scripts produced 8–9 local edits with normalize (80,000–210,000 receiving events per run, 0 mirror mismatches or verification failures).

### Equivalence Tests

The former edit functions (Doc methods) and new commands (commands → edit) ran one step at a time from identical state: 1000 scripts × 40 steps. There were **0 differences across 34,001 steps**. The first run found one difference in setSpan's already-equal-value check; it was fixed. The old functions were then removed.
Editing an empty virtual position after a table changed slightly: inserting a table at the end no longer creates a trailing empty paragraph.

## 11. Cursors and Selection

- There are two position forms: **model paths**, used by editors and schema-based document editors (`[block, …, character position]`), and **token keys**, used by the CRDT (immediately after this token).
- Other users' edits can shift paths. Token keys are stable. Store cursor and selection endpoints **as token keys**, then convert them to paths for display.
  - `anchorAt(doc, path)` → token key of the token immediately left of that position.
  - `pathAt(doc, key)` → current path. For a deleted token, use the nearest live position to its left. If its cell is hidden, use an adjacent cell.
- Editor adapter order: capture keys with `anchorAt` whenever selection changes, or immediately before a remote change; apply receiving events; then restore selection through `pathAt`.
- Remote cursors (presence) use token keys in transmission. Receivers resolve them to paths in their own document.
- Both endpoints attach to the left token. If someone inserts at my cursor, the new text appears to its right and the cursor does not move. Text inserted at a selection's start enters the selection; text inserted at its end stays outside.
- Selection is limited to one line. Selection across multiple table cells is not yet supported.
