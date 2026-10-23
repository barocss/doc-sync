# Schema-driven block operations

Blocks have positions. Use **`doc.edit()` for blocks and text**. The `at` path selects a place in the tree returned by `doc.toJSON()`. The operation selects the action: `insert`, `delete`, `update`, `split`, or `merge`.

| Action | Operation |
| --- | --- |
| Insert a block at root index 1 | `{op: "insert", at: [1], content: [{type: "divider"}]}` |
| Change that block's attributes | `{op: "update", at: [1], attrs: {...}}` |
| Delete that block | `{op: "delete", at: [1], count: 1}` |
| Insert text at offset 2 in the first paragraph | `{op: "insert", at: [0, 2], content: "Hi"}` |
| Split the first paragraph at offset 2 | `{op: "split", at: [0, 2]}` |
| Merge the second paragraph into the first | `{op: "merge", at: [1]}` |

Each operation in a batch uses the state **after the preceding operation**. Inserting or deleting a block can change later paths. Read the current model when you need a new path.

Start with [one editing API](./editing). `doc.edit()` applies locally and returns `{ops, normalize}`. With a `SyncClient`, pass `ops` to `client.commit(ops)`. Do not apply those operations to the local document again. The examples below use a standalone document.

## Read a block path

Paths contain child indices. The root itself is `[]`. Suppose root child 1 is a table:

| Path | Target |
| --- | --- |
| `[1]` | Table block |
| `[1, 0]` | First row |
| `[1, 0, 0]` | First cell in that row |
| `[1, 0, 0, 0]` | Cell body |
| `[1, 0, 0, 0, 0]` | First paragraph in the cell body |
| `[1, 0, 0, 0, 0, offset]` | Text position in that paragraph |

A callout at `[1]` contains its paragraphs directly: `[1, 0]` selects its first paragraph and `[1, 0, offset]` selects text there. A list group also adds a level: `[0, 1]` selects the second item of the first list; `[0, 1, offset]` selects text in that item.

For `insert`, the last index is an insertion position. For `delete` and `update`, it selects existing content. On a text position, `update` with `length` sets marks over that many characters. Without `length`, it updates an inline node at that position.

## First block example: insert and delete a divider

This example uses the shared setup below. A divider is an atom with no editable children. Insert it between `A` and `B`, then delete it. Both actions use `doc.edit()`; the two paragraphs remain separate.

<!-- executable-example: divider -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [0, 0], content: "AB"},
    {op: "insert", at: [0, 1], content: [{type: "divider"}]},
]);
assert.deepEqual(doc.toJSON().children!.map(node => node.type), ["paragraph", "divider", "paragraph"]);
doc.edit([{op: "delete", at: [1], count: 1}]);
assert.deepEqual(doc.toJSON().children!.map(node => node.type), ["paragraph", "paragraph"]);
assert.deepEqual(doc.toJSON().children!.map(node => node.runs), [
    [{text: "A", marks: {}}], [{text: "B", marks: {}}],
]);
```

## Shared example setup

The schema defines allowed types and attributes. This representative schema follows [`fixtures/demo-schema.ts`](https://github.com/barocss/doc-sync/blob/main/fixtures/demo-schema.ts). It adds paragraph alignment and omits the demo's image container and captions. It includes all nine supported shapes. Type names are application choices.

Run this setup once, then run any example independently. The table helpers only create or read model JSON; they do not introduce another editing interface.

::: details Complete example schema and setup

<!-- shared-example-setup -->
```ts
import assert from "node:assert/strict";
import {Doc, checkSchema, type NodeJSON, type Schema} from "@barocss/doc-sync";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic", "underline", "strike"],
    markValues: {link: {default: "", pattern: "^(https?://\\S+)?$"}},
    nodes: {
        content: {
            shape: "flow",
            children: ["paragraph", "heading2", "list", "callout", "table", "divider"],
            default: "paragraph",
        },
        paragraph: {
            shape: "text",
            children: ["inline-image", "inline-hyperlink"],
            attrs: {align: {default: "left", values: ["left", "center", "right"]}},
        },
        heading2: {shape: "text", next: "paragraph"},
        "inline-image": {
            shape: "inline",
            attrs: {
                src: {default: ""},
                width: {default: 160, min: 16, max: 2000},
                height: {default: 90, min: 16, max: 2000},
            },
        },
        "inline-hyperlink": {shape: "span", mark: "link", attr: "url"},
        list: {shape: "group", children: ["list-item"], by: ["listType"]},
        "list-item": {
            shape: "text",
            attrs: {
                listType: {default: "bullet", values: ["bullet", "numbered"], inherit: true},
                level: {default: 0, min: 0, max: 4, inherit: true},
            },
        },
        callout: {
            shape: "flow",
            children: ["paragraph", "heading2", "list", "table"],
            default: "paragraph",
            attrs: {tone: {default: "info", values: ["info", "warn", "ok"]}},
        },
        table: {
            shape: "grid", children: ["table-row"],
            attrs: {header: {default: false, values: [true, false]}},
        },
        "table-row": {shape: "row", children: ["table-cell"]},
        "table-cell": {
            shape: "cell", children: ["table-cell-body"],
            attrs: {
                colspan: {default: 1, min: 1, computed: true},
                rowspan: {default: 1, min: 1, computed: true},
                spanned: {default: false, computed: true},
                backgroundColor: {default: "", pattern: "^(#[0-9a-fA-F]{6})?$"},
            },
        },
        "table-cell-body": {shape: "flow", children: ["paragraph", "list"], default: "paragraph"},
        divider: {shape: "atom"},
    },
};
assert.deepEqual(checkSchema(schema), []);

const fresh = (actor = "alice") => new Doc(actor, schema);
const emptyTable = (rows: number, cols: number): NodeJSON => ({
    type: "table",
    children: Array.from({length: rows}, () => ({
        type: "table-row",
        children: Array.from({length: cols}, () => ({type: "table-cell"})),
    })),
});
const tableModel = (doc: Doc): NodeJSON => {
    const table = doc.toJSON().children!.find(node => node.type === "table");
    assert.ok(table, "table model must exist");
    return table;
};
const cellModel = (doc: Doc, r: number, c: number): NodeJSON =>
    tableModel(doc).children![r].children![c];
```

:::

| Shape | Example type | Role |
| --- | --- | --- |
| `text` | `paragraph`, `heading2`, `list-item` | Holds text and permitted inline content |
| `inline` | `inline-image` | One image position within a text block |
| `span` | `inline-hyperlink` | Displays consecutive characters with the same link value |
| `flow` | `content`, `callout`, `table-cell-body` | Holds a sequence of blocks |
| `group` | `list` | Displays consecutive items grouped by `listType` |
| `grid` | `table` | Holds rows and columns |
| `row` | `table-row` | Holds cells |
| `cell` | `table-cell` | Holds one cell-body flow |
| `atom` | `divider` | A block without children |

A flow lists its allowed blocks in `children` and needs a permitted `text` default. A text block lists its allowed inline and span types. A group lists text item types. A grid must lead to a row type, a cell type, and a cell-body flow. The model always keeps a leading text block, including before a table or divider.

## Split, merge, change type, and set attributes

These actions all use `doc.edit()`. `update` at a block path changes its attributes. The `type` attribute changes a text block's type. `merge` selects the block that joins its preceding text block.

<!-- executable-example: text-blocks -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [0, 0], content: "abcdef"},
    {op: "split", at: [0, 3]},
]);
assert.deepEqual(doc.toJSON().children!.map(node => node.runs), [
    [{text: "abc", marks: {}}], [{text: "def", marks: {}}],
]);

const {ops} = doc.edit([{op: "merge", at: [1]}]);
assert.ok(ops.length > 0);
assert.deepEqual(doc.toJSON().children![0].runs, [{text: "abcdef", marks: {}}]);
assert.equal(doc.toJSON().children!.length, 1);

doc.edit([{op: "update", at: [0], attrs: {align: "center"}}]);
assert.deepEqual(doc.toJSON().children![0].attrs, {align: "center"});
doc.edit([
    {op: "update", at: [0], attrs: {type: "heading2"}},
    {op: "split", at: [0, 6]},
]);
assert.deepEqual(doc.toJSON().children!.map(node => node.type), ["heading2", "paragraph"]);

doc.edit([{op: "update", at: [0], attrs: {type: "paragraph", align: "right"}}]);
assert.deepEqual(doc.toJSON().children![0].attrs, {align: "right"});
```

The heading's `next: "paragraph"` selects the new block type when it splits at its end. `inherit: true` makes a declared attribute continue into a split block. Ordinary attributes do not inherit automatically.

### Keep the editor model aligned

Request `{normalize: true}` when you need corrections for the editor's own model. Apply the original edits and then the returned `normalize` edits to that model. Corrections account for rules such as a leading text block or rectangular table.

<!-- executable-example: model-operations -->
```ts
const doc = fresh();
const {ops, normalize} = doc.edit([
    {op: "insert", at: [0, 0], content: "ab"},
    {op: "split", at: [0, 1]},
    {op: "merge", at: [1]},
    {op: "update", at: [0], attrs: {align: "center"}},
], {normalize: true});
assert.ok(ops.length > 0);
assert.deepEqual(normalize, []);
assert.deepEqual(doc.toJSON(), {
    type: "content",
    children: [{type: "paragraph", attrs: {align: "center"}, runs: [{text: "ab", marks: {}}]}],
});
```

In this batch, `[1]` exists after `split`. After `merge`, the combined paragraph is back at `[0]`. These examples use ASCII text so character and UTF-16 offsets agree.

## Lists: update the item, follow the group path

Convert a paragraph to `list-item` with `update`. Consecutive items with the same `listType` appear inside one `list` in the model. That changes their paths. After the first conversion below, the item is `[0, 0]`, inside the list at `[0]`.

<!-- executable-example: lists -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [0, 0], content: "First"},
    {op: "update", at: [0], attrs: {type: "list-item", listType: "numbered", level: 1}},
    {op: "split", at: [0, 0, 5]},
    {op: "insert", at: [0, 1, 0], content: "Second"},
]);
assert.deepEqual(doc.toJSON().children, [{
    type: "list", attrs: {listType: "numbered"},
    children: [
        {type: "list-item", attrs: {level: 1}, runs: [{text: "First", marks: {}}]},
        {type: "list-item", attrs: {level: 1}, runs: [{text: "Second", marks: {}}]},
    ],
}]);

doc.edit([{op: "update", at: [0, 1], attrs: {level: 4}}]);
assert.equal(doc.toJSON().children![0].children![1].attrs!.level, 4);
doc.edit([{op: "update", at: [0, 1], attrs: {listType: "bullet"}}]);
assert.deepEqual(doc.toJSON().children!.map(node => node.attrs!.listType), ["numbered", "bullet"]);

doc.edit([{op: "update", at: [0, 0], attrs: {type: "paragraph"}}]);
assert.deepEqual(doc.toJSON().children!.map(node => node.type), ["paragraph", "list"]);
assert.deepEqual(doc.toJSON().children![0].runs, [{text: "First", marks: {}}]);
```

`level` must be within this schema's 0–4 range. `listType` is a group attribute in the output; each item retains `level`. Updating `listType` on the list path changes all its items. Updating one item can split the group, as above. Numbers are calculated for display. The editor chooses its keyboard policy for empty-item Enter and outdent.

## Insert a callout and edit its children

Insert a block at a root child index, or at a text offset to split the surrounding paragraph. The callout below lands at `[1]`; its first paragraph is `[1, 0]`.

<!-- executable-example: callout-body -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [0, 0], content: "beforeafter"},
    {op: "insert", at: [0, 6], content: [{type: "callout"}]},
    {op: "insert", at: [1, 0, 0], content: "Note"},
    {op: "insert", at: [1, 1], content: [{type: "heading2", runs: [{text: "Next", marks: {}}]}]},
    {op: "update", at: [1], attrs: {tone: "warn"}},
]);
assert.deepEqual(doc.toJSON().children, [
    {type: "paragraph", attrs: {align: "left"}, runs: [{text: "before", marks: {}}]},
    {type: "callout", attrs: {tone: "warn"}, children: [
        {type: "paragraph", attrs: {align: "left"}, runs: [{text: "Note", marks: {}}]},
        {type: "heading2", runs: [{text: "Next", marks: {}}]},
    ]},
    {type: "paragraph", attrs: {align: "left"}, runs: [{text: "after", marks: {}}]},
]);
```

To insert a permitted table after those two callout children, insert at `[1, 2]`. Allowed children belong to each container. A root-level permission does not grant the same permission inside a cell or callout.

## Insert a table, then insert or delete rows and columns

A table is ordinary model content: `table > table-row > table-cell > table-cell-body`. `emptyTable(rows, cols)` in the shared setup builds that JSON. The schema defines allowed shapes; the inserted JSON determines dimensions.

A row insertion targets `[tableIndex, rowIndex]`. A column insertion is a batch of cell insertions at the same column index in every row. The compiler folds that batch into one column operation. Keep those per-row edits together in **one `doc.edit()` call**.

<!-- executable-example: table-axes -->
```ts
const doc = fresh();
doc.edit([{op: "insert", at: [0, 0], content: [emptyTable(2, 2)]}]);
assert.deepEqual(tableModel(doc).children!.map(row => row.children!.length), [2, 2]);

doc.edit([{op: "insert", at: [1, 1], content: [{
    type: "table-row", children: [{type: "table-cell"}, {type: "table-cell"}],
}]}]);
assert.deepEqual(tableModel(doc).children!.map(row => row.children!.length), [2, 2, 2]);

const inserted = doc.edit([0, 1, 2].map(r => ({
    op: "insert" as const, at: [1, r, 2], content: [{type: "table-cell"}],
})));
assert.equal(inserted.ops.filter(op => op.t === "node" && op.type === "col").length, 1);
assert.deepEqual(tableModel(doc).children!.map(row => row.children!.length), [3, 3, 3]);

doc.edit([{op: "delete", at: [1, 0], count: 1}]);
assert.deepEqual(tableModel(doc).children!.map(row => row.children!.length), [3, 3]);
const deleted = doc.edit([0, 1].map(r => ({
    op: "delete" as const, at: [1, r, 1], count: 1,
})));
assert.equal(deleted.ops.length, 1);
assert.deepEqual(tableModel(doc).children!.map(row => row.children!.length), [2, 2]);

doc.edit([
    {op: "update", at: [1], attrs: {header: true}},
    {op: "update", at: [1, 0, 0], attrs: {backgroundColor: "#dcfce7"}},
]);
assert.equal(tableModel(doc).attrs!.header, true);
assert.equal(cellModel(doc, 0, 0).attrs!.backgroundColor, "#dcfce7");

doc.edit([
    {op: "delete", at: [1, 1], count: 1},
    {op: "delete", at: [1, 0], count: 1},
]);
assert.deepEqual(doc.toJSON().children!.map(node => node.type), ["paragraph", "paragraph"]);
assert.deepEqual(doc.toJSON().children!.map(node => node.runs), [[], []]);
```

Deleting all rows or all columns removes the table from the model. Surrounding paragraphs remain. To delete a table directly, use `{op: "delete", at: [1], count: 1}`. The compiler handles row and column changes while processing the batch. The application uses model paths throughout.

### Merge and split cells while preserving hidden text

Update the top-left cell's `rowspan` and `colspan`. Set both to 1 to split its merge. `spanned` is an output flag for covered cells; do not set it directly. The full-grid model keeps every cell and its text while a cell is covered.

The diagram below is generated from actual `doc.edit()` results. Cell A spans the grid after the update at `[1, 0, 0]`. B, C, and D become hidden; their text stays in their own cells. Updating the span back to 1×1 shows all four cells again.

<div class="operation-figure" tabindex="0" role="region" aria-label="Table merge and restoration diagram">

![A two-by-two table before merging, while three cells are hidden, and after restoring the original span.](/diagrams/table-span.svg)

</div>

<!-- executable-example: table-merge-split -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [1], content: [emptyTable(2, 2)]},
    {op: "insert", at: [1, 0, 0, 0, 0, 0], content: "left"},
    {op: "insert", at: [1, 0, 1, 0, 0, 0], content: "right"},
    {op: "update", at: [1, 0, 0], attrs: {rowspan: 2, colspan: 2}},
]);
assert.equal(cellModel(doc, 0, 0).attrs!.rowspan, 2);
assert.equal(cellModel(doc, 0, 0).attrs!.colspan, 2);
assert.deepEqual(tableModel(doc).children!.flatMap(row => row.children!).map(cell => cell.attrs?.spanned ?? false), [false, true, true, true]);
assert.deepEqual(cellModel(doc, 0, 1).children![0].children![0].runs, [{text: "right", marks: {}}]);
assert.deepEqual(cellModel(doc, 0, 0).children![0].children![0].runs, [{text: "left", marks: {}}]);

doc.edit([{op: "update", at: [1, 0, 0], attrs: {rowspan: 1, colspan: 1}}]);
assert.deepEqual(tableModel(doc).children!.flatMap(row => row.children!).map(cell => cell.attrs?.spanned ?? false), [false, false, false, false]);
assert.deepEqual(cellModel(doc, 0, 1).children![0].children![0].runs, [{text: "right", marks: {}}]);
```

Merging hides covered-cell text; it does not collect that text into the top-left cell. Splitting shows it again. The span uses end row/column IDs internally, so axes inserted within those endpoints join the span. Overlapping concurrent merges follow the existing deterministic winner rule.

## Insert and update an inline node

An inline node occupies one text position. Insert its model JSON at that offset. An `update` at the same position, without `length`, changes its attributes.

<!-- executable-example: inline-image -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [0, 0], content: "AB"},
    {op: "insert", at: [0, 1], content: [{type: "inline-image", attrs: {src: "https://example.com/image.png"}}]},
    {op: "update", at: [0, 1], attrs: {width: 320}},
]);
assert.deepEqual(doc.toJSON().children![0].runs, [
    {text: "A", marks: {}},
    {type: "inline-image", attrs: {src: "https://example.com/image.png", width: 320, height: 90}},
    {text: "B", marks: {}},
]);
```

The current text type must permit that inline type in `children`. The demo's full image component adds a separate flow and caption group. An inline image needs no such container. A text type with `text: false` can permit inline content while rejecting character input at the editor level.

## Set links and formatting on a text range

Use `update` with a text position and `length`. Boolean marks such as bold and value marks such as link use the same operation. The schema's `span` displays adjacent characters with one URL as an `inline-hyperlink`. New input inherits bold but does not inherit link in this schema.

<!-- executable-example: links-and-marks -->
```ts
const doc = fresh();
doc.edit([
    {op: "insert", at: [0, 0], content: "Read"},
    {op: "update", at: [0, 0], length: 4, attrs: {bold: true, link: "https://example.com"}},
    {op: "insert", at: [0, 4], content: "!"},
]);
assert.deepEqual(doc.toJSON().children![0].runs, [
    {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "Read", marks: {bold: true}}]},
    {text: "!", marks: {bold: true}},
]);

doc.edit([{op: "update", at: [0, 0], length: 4, attrs: {link: null}}]);
assert.deepEqual(doc.toJSON().children![0].runs, [{text: "Read!", marks: {bold: true}}]);
```

A range targets the characters observed when the operation is created. Concurrent new characters are not added to its targets later. The URL pattern here permits HTTP and HTTPS. Set a value mark's `inherit: true` only if new input should inherit that mark.

## Choose schema-valid edits

The application must choose types and attribute values allowed by its schema. In this example schema, a cell body permits paragraphs and lists, but not nested tables, callouts, or headings. `level` accepts 0–4; paragraph `align` accepts left, center, or right.

`doc.edit()` is an editing compiler. It applies locally without automatically calling `Doc.check()`. Do not assume an invalid request will be a no-op. The next example deliberately uses a disposable document to produce invalid edits. A separate receiving document checks the operations before applying them, as the server does.

<!-- executable-example: schema-restrictions -->
```ts
const draft = fresh("draft");
const receiver = fresh("receiver");
const seed = draft.edit([{op: "insert", at: [1], content: [emptyTable(1, 1)]}]).ops;
assert.equal(receiver.check(seed), null);
seed.forEach(op => receiver.apply(op));
const before = receiver.toJSON();

const forbidden = draft.edit([{
    op: "insert", at: [1, 0, 0, 0, 1], content: [{type: "callout"}],
}]).ops;
assert.ok(forbidden.length > 0);
assert.equal(typeof receiver.check(forbidden), "string");
assert.deepEqual(receiver.toJSON(), before);

const invalidAttributes = fresh("invalid").edit([
    {op: "update", at: [0], attrs: {align: "sideways"}},
]).ops;
assert.equal(typeof fresh("validator").check(invalidAttributes), "string");
assert.deepEqual(schema.nodes["table-cell-body"].shape, "flow");
```

Server validation uses immutable membership and birth types. It does not enforce every constraint about a block's current type. For example, accepting text somewhere in a container does not prove that a hand-built operation targets a text-accepting current block. See the [editing API reference](../reference/edit-api) for validation and normalization limits.

## Concurrent Enter

Use `split` for Enter. Two independent splits at the same boundary create one new line. After a participant has received that split, another Enter can create a further line.

<!-- executable-example: concurrent-enter -->
```ts
const alice = fresh("alice");
const bob = fresh("bob");
const seed = alice.edit([{op: "insert", at: [0, 0], content: "abcd"}]).ops;
seed.forEach(op => bob.apply(op));
const aliceEnter = alice.edit([{op: "split", at: [0, 2]}]).ops;
const bobEnter = bob.edit([{op: "split", at: [0, 2]}]).ops;
bobEnter.forEach(op => alice.apply(op));
aliceEnter.forEach(op => bob.apply(op));
assert.deepEqual(alice.toJSON(), bob.toJSON());
assert.deepEqual(alice.toJSON().children!.map(node => node.runs), [
    [{text: "ab", marks: {}}], [{text: "cd", marks: {}}],
]);

const laterEnter = alice.edit([{op: "split", at: [1, 0]}]).ops;
laterEnter.forEach(op => bob.apply(op));
assert.deepEqual(alice.toJSON(), bob.toJSON());
assert.deepEqual(alice.toJSON().children!.map(node => node.runs), [
    [{text: "ab", marks: {}}], [], [{text: "cd", marks: {}}],
]);
```

This checks operation exchange in memory. It does not test network delivery, reconnect, history pins, or real editor input. See [synchronization](./sync) and [editor integration](./editors) for those contracts.

## Limits and optional command helpers

There is no move or tree-split operation. Delete/copy reparenting is not a move contract and can change concurrent-edit behavior. Cell merging does not collect hidden text. The schema has no exact required-child counts: attribute `min`/`max` fields are numeric bounds, not child counts. The application must enforce any additional exact-child policy.

The optional [`commands` helpers](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/crdt/commands.ts) wrap these same edit operations for keyboard actions and add checks such as permitted types and numeric clamping. They are not required to position or edit blocks. These examples do not establish actual OS IME support, product performance targets, or release readiness.
