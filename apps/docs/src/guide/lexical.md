# Lexical binding

Use the built repository workspaces or local tarballs. These package names are not yet published on npm. See [Packages and engines](./packages) for Core, binding, and editor peer requirements.

Use `LexicalBinding` from **`@barocss/doc-sync-lexical`**. It connects a Lexical editor to a `SyncClient`. Build the schema information first, register its node classes, and then construct the binding.

This is a subpath of the same library. The library is still unpublished; the examples resolve through the repository workspace.

## Dependencies

The Lexical entry point uses three optional peers. All three are required when importing this binding. The repository tests use `0.52.0` for each:

```sh
npm install lexical@0.52.0 @lexical/rich-text@0.52.0 @lexical/table@0.52.0
```

The core library does not require these packages when the Lexical entry point is unused. The binding has no React dependency.

## Create the editor and binding

This example creates a headless editor. A browser editor can attach its root element before constructing the binding.

```ts
import {createEditor} from "lexical";
import {type Schema} from "@barocss/doc-sync-core";
import {HttpTransport, SyncClient} from "@barocss/doc-sync-core/sync";
import {buildLexicalSchema, LexicalBinding} from "@barocss/doc-sync-lexical";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const info = buildLexicalSchema(schema);
const editor = createEditor({
    namespace: "shared-document",
    nodes: info.nodes,
    onError: error => { throw error; },
});
const actor = crypto.randomUUID();
const client = new SyncClient(actor, new HttpTransport("lexical-example", actor), {schema});
const binding = new LexicalBinding(client, editor, {
    info,
    onError: error => console.error(error),
});
```

The constructor initializes the editor from the current client document. It checks that the schema information matches the client's schema and that the required node classes are registered. You can also pass `info` directly as the third argument.

For a browser editor, set `editor.setRootElement(element)` and install the native plugins your UI needs, such as `registerRichText(editor)`. Install table plugins if you expose native table commands. After mounting, call `client.connect()`. The binding does not provide toolbar controls or replace the application's plugin setup.

Local update listeners send edits automatically. Do not add a second converter/commit listener for the same editor. The binding tags remote updates with `LEXICAL_REMOTE_TAG` to prevent an echo.

## Schema mapping and codecs

`buildLexicalSchema(schema, options?)` produces node registrations and mapping information. Its options are:

| Option | Purpose |
| --- | --- |
| `paragraph` | Schema text type used for native paragraphs; defaults to the root flow's default |
| `quote` | Schema text type used for native quotes |
| `headings` | Map native tags such as `h1` or `h2` to schema text types |
| `table` | Schema grid type used for native tables; inferred when there is one grid type |
| `codecs` | Explicit custom native conversion hooks and their node classes |

The codec supports the model tree for all nine schema shapes, including lists, nested flows, grids/rows/cells, inline nodes, atoms, and value-mark spans. It retains type names and attributes represented by the core model. Standard paragraphs, mapped headings/quotes, and tables use native Lexical classes. Other schema elements use `SchemaElementNode`; inline and atomic content use `SchemaLeafNode`. Their NodeState retains schema identity and data. Applications can style these nodes or provide explicit codecs.

Nested `AttrSpec.fields` are supported on text, inline, grid, atom, and cell types, and on stored flow containers whose type is neither the root nor a cell-body flow type. List fields belong to their text item type. Schema validation rejects fields on the root, rows, cell-body flow types, groups, spans, and value marks. See [nested attribute fields](../reference/edit-api#nested-attribute-fields) for patch and reset rules.

Covered table cells remain in the full-grid document model. Native Lexical rows contain only visible cells, so the table plugin counts merged rows and columns correctly. Serialized NodeState retains each covered cell, including its content, marks and attributes. The reader reconstructs the full grid; unmerge restores the retained cells. Selection paths use logical grid columns and exclude covered cells. Cell-body metadata is retained even though native Lexical cells do not have a separate cell-body node.

A custom codec can declare `nodes`, `toLexical(model, context)`, and `fromLexical(node, context)`. Return null to let the normal codec handle a value. These functions run as application code and must preserve the model contract. They are not data supplied by a remote document.

## Read or convert a document

```ts
import {
    readLexicalModel, toLexicalJSON, fromLexicalJSON,
} from "@barocss/doc-sync-lexical";

const model = readLexicalModel(editor, info);
const serialized = toLexicalJSON(info, model);
const restored = fromLexicalJSON(info, serialized);
```

`$toLexical(info, model)` and `$createModelNode(info, node)` run inside `editor.update()`. `$fromLexical(info)` and `$readModelNode(info, node)` run inside a Lexical read or update context. The non-`$` helpers above manage those contexts for you.

The reader rejects unsupported native nodes and features that need an explicit codec. These include native CSS text styles, text case transforms, unsupported formats, and mixed table-header states. Registering an extra native node class alone does not define its conversion.

When a local native change fails conversion, the binding cancels its draft and restores the shared document before calling `onError`. A later remote update can therefore continue normally. The standalone conversion helpers throw errors directly.

The default schema nodes do not interpret arbitrary attributes as HTML. If you add link or image renderers, apply the application's URL and rendering policies there.

## Selection, composition, and history

Selection helpers `$lexicalSelection(info)` and `$setLexicalSelection(info, range)` map to model paths with UTF-16 offsets. Inline nodes count as one position; spans flatten to their text. The binding stores stable document identities before remote changes and restores selection onto the new Lexical node keys afterward.

Unfocused editors use `SKIP_DOM_SELECTION_TAG` during remote application. Remote receipt should not take input focus from another pane.

The binding attaches removable composition listeners through Lexical's root listener, including when the root changes. Explicit methods are also available:

- `beginComposition()` starts a draft.
- `endComposition()` commits its original operations as one history group and returns those operations.
- `cancelComposition()` discards the draft and pulls the live document.

Remote changes continue reaching the live client during composition. Native replacement waits for composition completion. Draft operation numbers are reserved so live actions and reconnect snapshots do not reuse them. Reset cancels a stale draft, including when the live document model was already empty.

`binding.undo()` and `binding.redo()` use CRDT history. The binding registers Lexical `UNDO_COMMAND` and `REDO_COMMAND` handlers. These methods finish an active composition before applying history. Do not install an independent native history as another authority for shared edits.

`groupTyping` defaults to `true`. Adjacent typing can share one undo group under CRDT history rules. Pass `{info, groupTyping: false}` as the third constructor argument when each native update must form a separate history entry. Composition still commits as one group.

After movement, split undo retains the original tail tokens and checks ownership of both the logical join and tail placement. It skips a later observed foreign move or an unrecorded same-actor move. Undoing a later recorded move in the same history restores the ownership needed to undo the split.

## Change the schema while open

After a compatible server transition, build new schema information, register its nodes on a replacement editor, and recreate the binding and application plugins. Use `upgradeOpenEditorSchema` with an application host to preserve the client, pending changes, history and model selection. The [transition guide](./schema-transition#lexical) shows the read and update contexts for the range conversion.

## Cleanup and limits

```ts
binding.dispose();
client.disconnect();
editor.setRootElement(null);
```

Disposal removes registered listeners and command handlers, clears pending composition completion, and cancels an uncommitted draft. The caller owns the client connection, root element, and separately registered rich-text/table plugins; dispose those resources too.

Remote updates currently rebuild the native tree. This costs work proportional to document size. A reorder within one parent can become a move when it exactly matches a semantic document move. For a move between containers, the binding uses the retained native node key to identify one reparented block and then patches other changes in that update. Multiple reparented blocks, or creating a destination container and moving into it in the same update, are rejected and restored. Create the destination first, then move the block in a later update. The core move restrictions still apply.

Data retention for a schema shape does not provide every native keyboard command or an application-quality visual treatment for that shape. Native dragging and custom codecs need their own integration checks.

Headless tests use real Lexical editor updates. Browser/CDP input checks are a separate test layer; neither proves actual OS IME acceptance. No product performance target, production readiness, or completion of separate capability work is implied.

See [editor integration](./editors), [the editing API](./editing), and [binding source](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-lexical/src).

## Rust experiment

This calls the native SDK selection boundary. The Rust model position is a UTF-16 path. The host must still map Lexical node keys and offsets to this path and map the resolved path back through the TypeScript binding shown above. No native browser binding is supplied.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{
    Attributes, Document, EditOptions, Key, Position, Result, SchemaPreset, Selection,
};

fn main() -> Result<()> {
    let mut doc = Document::new("lexical-host", SchemaPreset::Text)?;
    let mut peer = Document::new("lexical-peer", SchemaPreset::Text)?;
    let change = doc.insert_text(
        &Key::root(),
        "😀",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    peer.apply_remote(&change.ops)?;
    let range = Selection {
        anchor: Position(vec![0, 2]),
        focus: Position(vec![0, 2]),
    };
    let captured = doc.capture_selection(Some(range.clone()))?;
    assert_eq!(peer.resolve_selection(captured)?, Some(range));
    assert_eq!(doc.model()?, peer.model()?);
    Ok(())
}
```

The existing TypeScript adapter uses `$lexicalSelection` and `$setLexicalSelection` in `packages/doc-sync-lexical/src/selection.ts`. A Rust-backed adapter must call the equivalent conversions inside Lexical read or update contexts, connect the Rust selection API, and project `model()` into Lexical nodes. The example does not install or test that adapter.

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The production Lexical binding still maps node keys and text offsets through TypeScript. This native example checks a collapsed model selection after a two-unit emoji; Lexical node keys are not CRDT token keys.

Build the driver with [Run the private experiment](./rust#run-the-private-experiment), then run this from the repository root:

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"editor","actor":"editor","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"editor","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"human"},"origin":{"lamport":0,"actor":"~root"},"units":[55357,56832]}]}
{"cmd":"selection_capture","replica":"editor","range":{"anchor":[0,2],"focus":[0,2]}}
{"cmd":"selection_resolve","replica":"editor","range":{"anchor":"2@human","focus":"2@human"}}
JSONL
```

Both endpoints resolve to `[0, 2]`. This checks the core UTF-16 caret only. Node-key conversion, composition, and DOM restoration require Lexical tests. Inline nodes count once; link spans add no model-path level. Covered table cells retain content while visible selection is unavailable; the TypeScript binding supplies the editor mapping and reference data.

This uses the fixed base text schema. Rust has no production editor, bot, or MCP adapter. See the [Rust engine guide](./rust) for the separate v1 through v6 capabilities and limits.

</details>
