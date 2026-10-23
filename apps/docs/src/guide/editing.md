# Model operations

An editor describes changes with model paths. The document compiles those changes into stable token operations. Paths address the current `NodeJSON` model; they are not transmitted as persistent identities.

## Start with one API

Use `doc.edit()` for text **and** blocks. You do not need a separate table, list, or container API. The schema determines how each operation is compiled.

For example, with the [block guide's schema](./blocks), start with a document containing one paragraph:

```ts
const {ops} = doc.edit([
    // Insert a new block after the first paragraph.
    {
        op: "insert",
        at: [1],
        content: [{type: "paragraph", runs: [{text: "New block"}]}],
    },
    // Change that block's type.
    {op: "update", at: [1], attrs: {type: "heading2"}},
    // Insert text at offset 3 inside the same block.
    {op: "insert", at: [1, 3], content: "!"},
]);
// When doc is client.doc, send the operations once.
// edit() has already applied them locally.
client.commit(ops);
```

Block positions are model paths. They use the same child indices as `doc.toJSON()`:

| Path | Target in a model with a paragraph at index 0 and a table at index 1 |
|---|---|
| `[0]` | First paragraph itself: change attributes or delete the block. |
| `[0, 3]` | Text offset 3 inside that paragraph. |
| `[1]` | Table itself: change its attributes or delete it. |
| `[1, 0]` | First table row. |
| `[1, 0, 2]` | Third cell in that row. |
| `[1, 0, 2, 0]` | That cell's body flow. |
| `[1, 0, 2, 0, 0, 4]` | Text offset 4 in its first paragraph. |

For `insert`, the last child index specifies an insertion boundary: `[1]` inserts before the current second block, or appends when only one block exists. For `update` and `delete`, it identifies an existing node. A text position has one more final offset. Paths change when the model changes; each operation in a batch reads the state produced by preceding operations. Resolve a new action against the current model instead of retaining an old index across remote edits.

[Run block, list, table, and nested-flow examples with this API →](./blocks)

## Five operations

| Operation | Model example | Result |
|---|---|---|
| `insert` | `{op: "insert", at: [0, 2], content: "x"}` | Insert text into the first block. |
| `delete` | `{op: "delete", at: [0, 2], count: 1}` | Delete the addressed content. |
| `update` | `{op: "update", at: [0, 0], length: 3, attrs: {bold: true}}` | Format three model units. |
| `split` | `{op: "split", at: [0, 3]}` | Split a text block. |
| `merge` | `{op: "merge", at: [1]}` | Merge the second block into its predecessor where allowed. |

Operations in a batch run in order. Each later path refers to the state after the earlier operation.

## Apply edits and normalize

```ts
const {ops, normalize} = doc.edit([
    {op: "insert", at: [0, 0], content: "shared"},
    {op: "split", at: [0, 3]},
], {normalize: true});
```

`ops` contains the wire operations already applied to the document. Send them with `client.commit(ops)` when the document belongs to a `SyncClient`. `normalize` contains changes needed to bring an editor's proposed model into the CRDT's canonical form.

## Optional command helpers

The `commands` namespace is a convenience layer over `doc.edit()`. It translates actions such as Backspace and inserting a table column into the same five model operations. It is useful when an editor already has command-style positions or needs keyboard-action policy.

These helpers use different addresses: `{line?, b, o}` for text positions, and a current `GridBlock` plus row/column indices for table helpers. They convert those addresses to model paths internally. They are optional; application code can use `doc.edit()` throughout. Both interfaces apply operations before returning them, so do not apply the returned operations a second time.

## Respect coordinate units

Storage positions and `Pos.o` use UTF-16 token units. Model conversion uses code points in some paths. A grapheme can contain multiple code points. An editor adapter must handle these differences explicitly; ASCII-only tests do not establish full Unicode editing behavior.

## Same-boundary Enter

Concurrent Enter operations created from the same observed boundary produce one visible split. An Enter created after observing the earlier split has a different boundary and creates another block. This rule is preserved when document caches are rebuilt.

[Read the exact collaboration rules →](../reference/collaboration-intent)
