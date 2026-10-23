# Slate binding

Use `SlateBinding` from **`@barocss/doc-sync/slate`**. It connects a Slate editor to a `SyncClient`. The binding handles local edits, remote updates, selection restoration, composition drafts, and collaboration history.

This is a subpath of the same library. It is not a separate adapter package. The library is still unpublished; the examples resolve through the repository workspace.

## Dependencies

The binding requires the optional peer `slate` (`^0.146.0`). Importing the core library does not require Slate. The repository tests use Slate `0.146.0`.

```sh
npm install slate@0.146.0
```

For a React UI, also install your compatible React, React DOM, and `slate-react` dependencies. The binding itself does not depend on React.

## Create the binding

Start with a schema and one client per editor. This example creates an editor without mounting a UI. `HttpTransport` connects only after `client.connect()` is called.

```ts
import {createEditor} from "slate";
import {type Schema} from "@barocss/doc-sync";
import {HttpTransport, SyncClient} from "@barocss/doc-sync/sync";
import {SlateBinding} from "@barocss/doc-sync/slate";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const actor = crypto.randomUUID();
const client = new SyncClient(actor, new HttpTransport("slate-example", actor), {schema});
const editor = createEditor();
const binding = new SlateBinding(client, editor, {
    onError: error => console.error(error),
    onChange: model => console.log(model),
});
```

The constructor initializes `editor.children` from the current client document. `binding.initialValue` provides that initial value for a Slate React provider. Local edits are applied once and committed automatically. Do not add another model-diff/commit handler to the same editor.

The binding wraps `editor.onChange`, `isInline`, and `isVoid`. It preserves the previous change callback. Configure editor plugins before creating the binding, and allow the binding to retain these hooks until disposal.

## Mount a React editor

Use `withReact(createEditor())` when creating the editor above. Mount the provider with the binding's initial value. This UI excerpt uses the `editor` and `binding` created for that React editor:

```tsx
import {Slate, Editable} from "slate-react";

<Slate editor={editor} initialValue={binding.initialValue}>
    <Editable
        onCompositionStart={() => binding.beginComposition()}
        onCompositionEnd={() => queueMicrotask(() => binding.endComposition())}
        onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
                event.preventDefault();
                event.shiftKey ? binding.redo() : binding.undo();
            }
        }}
    />
</Slate>
```

After the native editor is mounted, call `client.connect()`. Provide `renderElement` and `renderLeaf` implementations for the types and marks your UI supports. The binding preserves schema data; it does not supply the application's toolbar or renderers.

Instead of composition props, pass an existing editable container as `options.element` when constructing the binding. It installs removable `compositionstart` and `compositionend` listeners there. Use one composition wiring method for an editor.

## Schema and conversion

`toSlate(schema, model)` and `fromSlate(schema, children)` convert without a binding. For example:

```ts
import {fromSlate, toSlate} from "@barocss/doc-sync/slate";

const children = toSlate(schema, client.doc.toJSON());
const model = fromSlate(schema, children);
```

The codec supports the model tree for all nine shapes: `text`, `inline`, `span`, `flow`, `group`, `grid`, `row`, `cell`, and `atom`. It retains schema type names and attributes represented by the core model. It supports arbitrary schema type names, not only the demo names.

| Model data | Slate representation |
| --- | --- |
| Node type and attributes | `element.type` and `element.attrs` |
| Character marks and values | Text-leaf properties |
| Link or other value-mark span | Editable inline element with child text |
| Inline node | Void inline element with an empty text child |
| Atom | Void block element with an empty text child |
| Lists and nested flows | Nested elements matching the model tree |
| Tables | Full rows/cells/body tree, including covered-cell text |

The binding installs schema-based inline/void behavior and the codec adds the empty text boundaries Slate requires. It rejects unknown types, unsupported marks or attributes, invalid children, and content inside atoms. It does not silently discard unsupported content.

Nested `AttrSpec.fields` are supported on text, inline, grid, atom, and cell types, and on stored flow containers whose type is neither the root nor a cell-body flow type. List fields belong to their text item type. Schema validation rejects fields on the root, rows, cell-body flow types, groups, spans, and value marks. See [nested attribute fields](../reference/edit-api#nested-attribute-fields) for patch and reset rules.

Your table renderer must hide cells whose `attrs.spanned` is true while retaining their data. Render links and images with application-approved URL policies. Schema data is not a trusted HTML fragment.

## Selection, composition, and history

Native selection offsets are UTF-16. The exported point/range helpers combine formatting leaves, flatten spans, and count each inline node as one position:

- `slatePointToModel(schema, children, point)`
- `modelPointToSlate(schema, children, path)`
- `slateRangeToModel(schema, children, range)`
- `modelRangeToSlate(schema, children, range)`

The binding captures selection through stable document identities before remote application and restores it in the new native tree. Missing or hidden endpoints are not redirected to an unrelated cell. It makes no browser focus call.

`beginComposition()` creates a draft. Native input edits that draft while the live client continues receiving remote changes. `endComposition()` commits the original draft operations as one undo group, then displays the combined document. `cancelComposition()` discards the draft and pulls the live state. Reset also cancels a draft when the live model was already empty.

Use `binding.undo()` and `binding.redo()` for shared history. These methods finish an active composition before applying history. Do not add an independent Slate history as another authority for shared changes.

`groupTyping` defaults to `true`. Adjacent typing can therefore share one undo group under CRDT history rules. Pass `{groupTyping: false}` in the binding options when each native change must form a separate history entry. Composition still commits as one group.

After movement, split undo retains the original tail tokens and checks ownership of both the logical join and tail placement. It skips a later observed foreign move or an unrecorded same-actor move. Undoing a later recorded move in the same history restores the ownership needed to undo the split.

## Cleanup and limits

```ts
binding.dispose(); // Alias of destroy(); repeated disposal is safe.
client.disconnect();
```

Disposal removes the binding's listeners and restores its wrapped editor callbacks when they are still installed. It cancels an uncommitted composition draft. The caller owns the network client, React root, and other editor plugins.

Remote changes currently rebuild the native tree. That has a cost for large documents. A native update containing only `move_node` operations and selection changes maps to document `move` edits. The binding verifies the resulting model. Perform moves in a separate native update: mixed moves and other mutations are rejected, and the shared model is restored. The core move restrictions still apply; this does not provide arbitrary text-range or table-axis movement.

The headless tests use real Slate editing operations and cover conversion, UTF-16 selections, remote edits without echo, concurrent Enter, undo/redo, composition, reset, reconnect, and disposal. Browser/CDP input checks and actual OS IME acceptance are separate evidence. These tests do not approve product performance targets or production readiness.

See [editor integration](./editors), [the editing API](./editing), and [binding source](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/slate).
