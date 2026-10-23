# Editing API

`Doc.edit()` applies six model operations: `insert`, `delete`, `update`, `split`, `merge`, and `move`. The application supplies a schema. The compiler resolves current model paths and uses schema shapes to produce stable CRDT wire operations.

Use this reference with the [state and synchronization specification](spec.md) and [collaboration intent rules](collaboration-intent.md). The library's exported types and implementation are authoritative.

## Operation and result types

```ts
import type {EditOp, ModelPath, NodeJSON, Op, Run} from "@barocss/doc-sync";

// ModelPath = number[]
// EditOp contains these six cases:
type EditingOperation =
    | {op: "insert"; at: ModelPath; content: string | Array<NodeJSON | Run>}
    | {op: "delete"; at: ModelPath; count: number}
    | {op: "update"; at: ModelPath; attrs: Record<string, unknown>; length?: number}
    | {op: "split"; at: ModelPath}
    | {op: "merge"; at: ModelPath}
    | {op: "move"; from: ModelPath; at: ModelPath};

type EditingResult = {ops: Op[]; normalize: EditOp[]};
```

The method signature is `doc.edit(edits: EditOp[], options?: {normalize?: boolean}): EditingResult`. It does not return a caret. The operations in `ops` have already been applied to the local document. If the document belongs to a `SyncClient`, pass them to `client.commit(ops)` to record and send the change. Do not apply them a second time as a local edit.

```ts
const {ops, normalize} = client.doc.edit([
    {op: "insert", at: [0, 0], content: "shared"},
    {op: "split", at: [0, 3]},
], {normalize: true});
client.commit(ops);
// Apply normalize to the editor's proposed model, if needed.
```

The example assumes a schema whose first block accepts text. It uses ASCII so storage and model text offsets agree. A standalone `Doc` needs no client commit for the local model to change.

Each operation is compiled and applied in order. Later paths address the result of earlier operations in the same batch. `Doc.edit()` is not an atomic validation boundary for arbitrary untrusted edits. Invalid paths can throw, and earlier operations may already have changed the local document. Supply schema-valid edits from a validated editor model.

## Paths and coordinate units

Paths index the current `toJSON()` tree. They do not persist as CRDT identities or travel over the wire.

| Path | Meaning |
|---|---|
| `[1]` | Second root child, such as a table. |
| `[1, 0]` | First row of that table. |
| `[1, 0, 2]` | Third cell of that row. |
| `[1, 0, 2, 0]` | The cell's body flow. |
| `[1, 0, 2, 0, 1, 4]` | Offset 4 in the body's second text block. |
| `[3, 0, 2]` | Offset 2 in the first item of a list at root child 3. |

Flow and group indexes count model children. Internally, list and caption groups flatten to text blocks in their owning CRDT sequence. Row indexes count live rows. Cell indexes count the full grid, including covered cells. A cell's body is child 0.

Text coordinates need an explicit boundary:

- The text offsets, deletion counts, and formatting lengths consumed by the CRDT compiler index stored tokens. Each UTF-16 code unit occupies one token. An inline node occupies one position.
- `Pos.o` and token-to-path helpers also use stored-token offsets.
- Pure model helpers such as `runsToUnits`, `applyEdits`, and `diffModels` iterate text by Unicode code point. A supplementary-plane character occupies one model Unit but two stored tokens.
- A user-visible grapheme can contain multiple code points. Neither unit is a general grapheme index.

For example, `A😀B` contains four UTF-16 units and three code points. Inserting immediately after the emoji uses compiler text offset 3. An adapter receiving a code-point path from a model diff must convert its offset and range length before passing it to `Doc.edit()`. Do not pass native offsets, pure-model offsets, and stored-token offsets interchangeably. Use ASCII-only examples only as evidence for those examples.

`normalize` and received model events are model edit operations. When applying them to a native editor, convert their model coordinates at that boundary. Requesting normalization does not remove the current distinction between model code points and stored UTF-16 tokens.

## Insert

`insert` adds text, runs, inline nodes, or child nodes, according to the destination shape.

| Destination and content | Behavior |
|---|---|
| Text position + string | Insert characters. Read inheritable marks from the left character observed by the author. At block start there is no same-block left character to inherit from. |
| Text position + text runs | Insert the supplied text and explicit marks. |
| Text position + permitted inline node | Insert one inline token. |
| Text position + block nodes | Split the surrounding text as needed and insert the blocks between the retained text parts. |
| Flow child position + text block | Insert a block marker and its text. The first default block can reuse a flow's head. |
| Flow child position + group | Insert flat item blocks. Group attributes are copied to the items; explicit item attributes take precedence. |
| Flow child position + nested flow | Insert a container node, then recursively insert its body into the container's body sequence. |
| Flow child position + grid | Insert the table, row and column nodes, and cell-body content. The widest row determines the column count. |
| Flow child position + atom | Insert one block node with no body. |
| Grid row position + row nodes | Insert rows and their cell-body content. |
| Row cell position + cell nodes | Insert columns using the batch's column-folding rule. |

Use only node types permitted at the destination. A declared type is not automatically permitted in every flow or text block. For example, the demo allows tables in callouts but not nested tables in table-cell bodies. An inline node must be permitted by the destination text type. A `span` such as a link is a model representation of value marks, not a separate stored inline token.

## Delete

`delete` removes `count` entries from the addressed position.

| Target | Behavior |
|---|---|
| Text range | Delete the selected character or inline token IDs. |
| Flow block range | Delete block markers and text for selected text blocks. Delete the node marker for a grid, container, or atom; its descendants become hidden. |
| Group item range | Delete the selected flat items. Deleting a whole group through its parent deletes all its items. |
| Table row range | Delete row nodes. |
| Row cell range | Delete columns using column folding. |
| Last remaining row or column | Remove the table from the visible model. |

Deleting the first flow block cannot remove the sequence head. The compiler tracks that head as vacant inside the batch so delete-and-reinsert operations use the expected child positions. If it remains vacant at batch end, the next text block can fill it. Canonical flow rules still require a leading text-shaped block.

Deletion targets IDs observed when the operation is created. A later concurrent insertion is not added to that target set. Undo cancels only its own deletion ID; another actor's deletion can keep the token hidden.

## Update

`update` writes attributes or formatting. It merges the supplied keys into the addressed state rather than replacing every attribute.

| Address | Behavior |
|---|---|
| Text-block path | Set declared block attributes. `attrs.type` changes a text-shaped block to an allowed text type. |
| Group path | Apply the supplied attribute keys to its item markers. |
| Text position + `length` | Write character marks over the selected token range. Inline nodes are skipped. |
| Text position without `length` | Update the inline node at that position, if present. |
| Grid, container, or atom path | Update its declared node attributes. This does not change its shape or reparent it. |
| Cell path | Write cell attributes on the table, addressed by row/column IDs. `colspan` and `rowspan` update merge endpoints. |

Clients must use keys and values permitted by the schema. General block and mark updates are not a complete local schema filter. Some compiler paths filter attributes; that does not make every unsupported update safe or guarantee server acceptance. Attribute defaults and canonical omission are also distinct from validation.

Cell spans use end-row and end-column IDs. Updating a top-left cell to `colspan: 1, rowspan: 1` removes its merge. Covered cells remain in the full-grid model. Their content stays stored and is hidden until exposed again. Merging does not collect or copy that content. `spanned` is computed output, not a writable cell flag.

Formatting uses per-token LWW writes. Two different mark keys can coexist. For one key, the largest write Ticket wins. Formatting undo checks exact write ownership. See [collaboration intent](collaboration-intent.md) for concurrent writes, partial ranges, and undo/redo rules.

### Nested attribute fields

Attributes remain atomic LWW values unless their `AttrSpec` declares `fields`. A field schema declares a fixed recursive object. Each declared leaf has its own register and history slot. For example:

```ts
const settings = {
    default: {width: 10, appearance: {theme: "light"}},
    fields: {
        width: {default: 10, min: 0},
        appearance: {
            default: {theme: "light"},
            fields: {theme: {default: "light", values: ["light", "dark"]}},
        },
    },
};
// Declare settings in the node's attrs, then update one leaf:
const result = client.doc.edit([
    {op: "update", at: [0], attrs: {settings: {appearance: {theme: "dark"}}}},
]);
client.commit(result.ops);
```

Omitted fields keep their current values. `null` resets a leaf or every declared leaf of a branch to its default. Arrays and objects without their own `fields` declaration remain atomic leaves. Fields are supported on text blocks, inline nodes, grids, atoms, cells, and stored flow containers whose type is neither the root nor a cell-body flow type. For a list, declare fields on its text item type.

`checkSchema()` rejects field declarations on the root, rows, cell-body flow types, groups, and spans, because these positions have no independent attribute storage for fields. It also rejects `markValues.fields`. Unknown paths, unsafe names, accessors, cycles, and non-JSON values are rejected for this capability. Attributes without `fields` keep their existing atomic behavior.

An explicit same-value leaf update still writes a new Ticket. This preserves write ownership. In contrast, `diffModels()` emits only changed leaves so an editor's unrelated changes do not claim every field. Wire leaf keys use `$field:` followed by a canonical JSON path; cell keys retain their `$cell:row,col|` prefix. Applications use nested `attrs` patches rather than constructing these reserved keys.

## Split and merge

`split` takes a text position and creates a block marker with the left/right token boundary observed at compilation. A split inside a text block keeps its type. At block end, the schema's `next` type applies if present. Only attributes marked `inherit: true` carry into the new block.

Concurrent splits created from the same observed boundary produce one visible split. A split created after observing an earlier split has a different boundary and can create another block. Adapters must preserve this operation meaning instead of rebuilding a trailing paragraph through delete-and-insert.

The model has no inline-text node layer. An adapter whose editor emits separate inline and block splits must convert that native sequence into the appropriate single model split.

`merge` takes the path of the text block to merge into its preceding text block. Without retained movement state, it deletes that block's marker and absorbed marker aliases. With movement state, logical joins retain the physical fragments and their identities. It does nothing for the first block, a virtual block without a marker, a non-text block, or a predecessor that cannot receive characters. It does not merge across different flow sequences.

With movement state, split undo restores the logical join while retaining the tail's original tokens. The history step checks ownership of both the join state and the tail placement. A later observed foreign move, or an unrecorded move by the same actor, makes it skip that inverse. Undoing a later move recorded in the same history restores the shared placement ownership, so the earlier split can then be undone. Redo follows the restored ownership. This prevents split undo from reclaiming a tail that another writer has moved elsewhere.

## Move

`{op: "move", from, at}` moves one block or group into a flow. `from` selects the current source. The destination parent path is resolved before the move. Its final child index excludes the source when counting children in that same flow. For three paragraphs `[A, B, C]`, moving `from: [0]` to `at: [2]` produces `[B, C, A]`.

```ts
const {ops} = client.doc.edit([{op: "move", from: [0], at: [2]}]);
client.commit(ops);
```

The example assumes three existing paragraphs. A nested destination can be a callout body or a table-cell body when its schema accepts the source. A group move moves its flat items. Moving retains node and text identities, so concurrent input and formatting stay attached to their targets. It does not copy content through delete-and-insert.

The wire operation records a target identity, destination flow head, and preceding placement identity. Placement records are retained and resolved in Ticket order. A concurrent cycle is suppressed deterministically during projection. The compiler rejects unsupported destinations and schema-incompatible moves. Text ranges, inline nodes, spans, table rows, and table columns are not general move targets. Required children cannot move or change their fixed type.

## Column folding

The model has table rows and cells but no column node. A native editor can represent one column insertion as one cell insertion per row at the same column index. Within one edit batch, the compiler folds the matching sequence into one CRDT column insertion. Cell deletions use the corresponding rule.

A cell insertion in only one row still inserts a whole column. Other rows receive empty cell bodies. This maintains a rectangular grid. Full-grid cell indexes include covered cells, so adapters must not substitute a visible-cell-only index without converting it.

A `GridBlock` is an internal view of current rows, columns, and spans. Command helpers that consume it need a fresh view after structural edits. Model-path editing resolves current structures during compilation.

## Canonical models and normalization

`canonical()` returns a consistent model shape. `Doc.toJSON()` uses the same model rules. They include:

- A flow starts with a text-shaped block. If needed, an empty block of its schema default type is inserted. A text shape can set `text: false`, as the demo image block does.
- Flat items regroup into adjacent lists or captions. Group attributes follow the schema's `by` keys. Explicit item values can split a group.
- Declared attribute defaults are filled where model rules require them. Adjacent text with equal marks becomes a run. Value marks can become span wrappers.
- Tables are rectangular. Missing cells are supplied up to the widest row. Tables without rows or columns are omitted. Cell bodies use the declared body flow type.
- Merge spans are recomputed into top-left `colspan`/`rowspan` and covered-cell `spanned` output. Ordinary computed defaults need not appear on every cell.
- Empty virtual positions following non-text blocks are omitted from the model. A table can be the final model child even though the editor can expose a virtual cursor position after it.

### Child counts

A flow can declare `childRules: {heading: {min: 1, max: 1}}` for one of its allowed child types. Bounds are integers from 0 through 1000, and `min` cannot exceed `max`. Omitted bounds mean minimum zero and no maximum. Rules count groups as model groups, rather than counting each flattened item. Required cycles through nested flows or table bodies are invalid schema definitions.

Limits use deterministic projection. Concurrent excess children remain stored and are available through `doc.overflow(lineKey?)`; they can become visible after deletion or undo. A missing minimum creates a deterministic required child with a stable, editable identity. This avoids each replica independently inserting a replacement. Required types stay fixed. Deleting a required child clears its content while retaining its identity and attributes. Required groups keep separate stable boundaries. These rules do not reject a concurrent operation merely because the current visible count reached its maximum.

Canonical normalization is not a complete schema validator for arbitrary trees. It does not prove that every supplied child is allowed at its current destination. Schema-valid clients must honor `children`, `text`, attribute rules, and shape constraints before producing edits.

Pass `{normalize: true}` when an adapter needs the difference between its proposed model result and the actual CRDT result. A registered `editListener` also requests that computation. Without either request, the method still returns a `normalize` array, but does not compute the comparison. An empty array in that mode is not evidence that no normalization was needed.

When requested, the document compares the expected model result with the actual model and returns edits that reconcile them. Apply those edits to the editor after its local operations. Typical differences involve leading default blocks, partial-row column edits, merges that cover newly inserted axes, and overlapping spans. Normalization describes the final model; it does not authorize invalid operations or provide rollback for a failed local batch.

## Received model events

`SyncClient.onModelEvents` supplies model edits for remote changes, undo, redo, snapshot, and reset when the model changes. Applying those edits to the prior model must produce the next model. The client computes model differences, verifies the result, and falls back to replacement if verification fails. No visible model change means no model-event callback.

Flows are compared as flattened item sequences so list regrouping does not invalidate subsequent paths. An adapter applies received edits without committing them again as new local changes. It also handles reset and snapshot lifecycle events when its input or selection state needs work even if model content is equal.

The current safe remote path can compare up to eight independent text blocks. Structural changes, excluded token dependencies, larger block sets, and undo/redo use the broader path described in the [state specification](spec.md). This optimization does not alter event meaning or establish native-editor performance.

## Server validation

`Doc.check(ops)` checks wire operations against immutable facts: token IDs, original node types, sequence membership, slot ownership, and schema compatibility. It recognizes references created earlier in the same change. Deleted targets can still receive causally valid operations.

Current block types, liveness, and visible block membership can differ between replicas while changes are in flight. Server validation therefore cannot treat every current editor constraint as an immutable rejection rule. For example, accepting characters in a sequence containing captions does not establish that a handcrafted insertion belongs in a current text-accepting block. Clients still enforce destination-specific edit rules.

`DocHub.submit()` validates a whole change before applying it and requires actor sequence order. Invalid changes do not partially update the server document. This server contract is distinct from the immediate local compilation performed by `Doc.edit()`. Neither boundary supplies authentication, authorization, request-size limits, or rate limits. Schema child counts use deterministic projection; see the document rules guide.

## History and positions

`commands` remains an exported set of editor-action helpers built on the editing layer. Model operations are the common interface for adapters; token-level helpers are available when an editor needs them.

`anchorAt(doc, path)` captures a token-key position. `pathAt(doc, key)` resolves a current path after edits. Deleted-token fallback and hidden-cell handling follow the position contract. Store token identities for selections that must survive remote edits; convert their coordinates when restoring native selection. Presence uses the library's active-end `anchor` convention.

Use collaboration history for shared undo and redo. Local `Doc.edit()` by itself does not record a networked edit history; `SyncClient.commit()` supplies the client history and transport boundary. The ownership rules are specified in [collaboration intent](collaboration-intent.md).

## Persistent annotations

Annotations are stored outside `NodeJSON` in a reserved slot. `createAnnotation(doc, range, data?, options?)` returns `{id, ops}`. `updateAnnotation(doc, id, patch)` and `deleteAnnotation(doc, id)` return operations. These helpers already apply their operations locally; pass them once to `client.commit()` for shared history and delivery. `getAnnotations(doc)` reads live records.

A range has `{anchor: ModelPath, focus: ModelPath}` in UTF-16 token positions. `options.expand` is `"none"` (default), `"start"`, `"end"`, or `"both"`. Endpoints retain the left and right token identities plus affinity. Data keys are independent atomic LWW fields. An update can supply `range`, `expand`, `data`, or `removeData`; assigning JSON `null` is distinct from removing a data key.

Each record reports its stored endpoints, data, `status`, resolved `range`, and `backward`. Status is `resolved`, `missing`, `hidden`, `cross-slot`, or `compacted`. An unresolved record has no resolved range and is not redirected to another cell. Live annotations pin their endpoint identities against GC. These records provide storage and range resolution; the application supplies comment, review, or highlight UI.
