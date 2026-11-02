# Slate binding

Use the built repository workspaces or local tarballs. These package names are not yet published on npm. See [Packages and engines](./packages) for Core, binding, and editor peer requirements.

Use `SlateBinding` from **`@barocss/doc-sync-slate`**. It connects a Slate editor to a [Client](./client). Omit the transport for local editing, or add an actor and transport for synchronization. The binding handles local edits, remote updates, selection restoration, composition drafts, and collaboration history.

This is a separate binding package. The old `@barocss/doc-sync/slate` subpath remains a compatibility export. The examples use built repository workspaces.

## Dependencies

The binding requires the optional peer `slate` (`^0.146.0`). Importing the core library does not require Slate. The repository tests use Slate `0.146.0`.

```sh
npm install slate@0.146.0
```

For a React UI, also install your compatible React, React DOM, and `slate-react` dependencies. The binding itself does not depend on React.

## Create the binding

Start with a schema and a local client. This example creates an editor without mounting a UI. Several local views can share the same client and history.

```ts
import {createEditor} from "slate";
import {type Schema} from "@barocss/doc-sync-core";
import {Client} from "@barocss/doc-sync-core/client";
import {SlateBinding} from "@barocss/doc-sync-slate";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema}); // Local editing; no transport.
const editor = createEditor();
const binding = new SlateBinding(client, editor, {
    onError: error => console.error(error),
    onChange: model => console.log(model),
});
```

The binding creates its own editor host for each view. For synchronization, construct `new Client({actor, schema, transport})` and connect it. Existing `LocalClient` and `SyncClient` arguments remain supported. Advanced integrations can use `SlateHostBinding` with an explicit `EditorHost`. See [Client](./client) for mode and lifecycle rules.

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

For a synchronized client, call `client.connect()` after mounting. Provide `renderElement` and `renderLeaf` implementations for the types and marks your UI supports. The binding preserves schema data; it does not supply the application's toolbar or renderers.

Instead of composition props, pass an existing editable container as `options.element` when constructing the binding. It installs removable `compositionstart` and `compositionend` listeners there. Use one composition wiring method for an editor.

## Schema and conversion

`toSlate(schema, model)` and `fromSlate(schema, children)` convert without a binding. For example:

```ts
import {fromSlate, toSlate} from "@barocss/doc-sync-slate";

const children = toSlate(schema, client.model());
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

## Change the schema while open

After a compatible server transition, dispose the old binding and build the replacement editor and rendering with the new schema. Use `upgradeOpenEditorSchema` with an application host to preserve the client, pending changes, history and model selection. The [transition guide](./schema-transition#slate) shows how to convert the range in both directions.

## Cleanup and limits

```ts
binding.dispose(); // Alias of destroy(); repeated disposal is safe.
client.disconnect();
```

Disposal removes the binding's listeners and restores its wrapped editor callbacks when they are still installed. It cancels an uncommitted composition draft. The caller owns the client, React root, and other editor plugins.

Remote changes currently rebuild the native tree. That has a cost for large documents. A native update containing only `move_node` operations and selection changes maps to document `move` edits. The binding verifies the resulting model. Perform moves in a separate native update: mixed moves and other mutations are rejected, and the shared model is restored. The core move restrictions still apply; this does not provide arbitrary text-range or table-axis movement.

The headless tests use real Slate editing operations and cover conversion, UTF-16 selections, remote edits without echo, concurrent Enter, undo/redo, composition, reset, reconnect, and disposal. Browser/CDP input checks and actual OS IME acceptance are separate evidence. These tests do not approve product performance targets or production readiness.

See [editor integration](./editors), [the editing API](./editing), and [binding source](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-slate/src).

## Rust experiment

This calls the native SDK selection boundary. The Rust model position is a UTF-16 path. The host must still map Slate points and leaf paths to this path and map the resolved path back through the TypeScript binding shown above. No native browser binding is supplied.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{
    Attributes, Document, EditOptions, Key, Position, Result, SchemaPreset, Selection,
};

fn main() -> Result<()> {
    let mut doc = Document::new("slate-host", SchemaPreset::Text)?;
    let mut peer = Document::new("slate-peer", SchemaPreset::Text)?;
    let change = doc.insert_text(
        &Key::root(),
        "Hi",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    peer.apply_remote(&change.ops)?;
    let range = Selection {
        anchor: Position(vec![0, 1]),
        focus: Position(vec![0, 0]),
    };
    let captured = doc.capture_selection(Some(range.clone()))?;
    assert_eq!(peer.resolve_selection(captured)?, Some(range));
    assert_eq!(doc.model()?, peer.model()?);
    Ok(())
}
```

The existing TypeScript adapter uses `slateRangeToModel` and `modelRangeToSlate` in `packages/doc-sync-slate/src/codec.ts`. A Rust-backed adapter must connect these conversions to `capture_selection` and `resolve_selection`, and project `model()` into Slate children. The example does not install or test that adapter.

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The production Slate binding still converts Slate leaf paths and offsets through TypeScript. Test the core side separately with an emoji. Its two UTF-16 units occupy offsets 0 through 2 in paragraph 0.

Build the driver with [Run the private experiment](./rust#run-the-private-experiment), then run this from the repository root:

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"editor","actor":"editor","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"editor","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"human"},"origin":{"lamport":0,"actor":"~root"},"units":[55357,56832]}]}
{"cmd":"selection_capture","replica":"editor","range":{"anchor":[0,2],"focus":[0,0]}}
{"cmd":"selection_resolve","replica":"editor","range":{"anchor":"2@human","focus":"0@~root"}}
JSONL
```

The reversed range resolves from `[0, 2]` to `[0, 0]`. This checks UTF-16 direction and token anchors, not Slate leaf mapping, composition, or DOM selection. Inline nodes count once; link spans add no model-path level. Hidden table-cell contents stay in the core; the TypeScript binding maps visible paths and retains the reference contents.

This uses the fixed base text schema. Rust has no production editor, bot, or MCP adapter. See the [Rust engine guide](./rust) for the separate v1 through v6 capabilities and limits.

</details>
