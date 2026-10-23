# Lexical binding

Use `LexicalBinding` from **`@barocss/doc-sync/lexical`**. It connects a Lexical editor to a `SyncClient`. Build the schema information first, register its node classes, and then construct the binding.

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
import {type Schema} from "@barocss/doc-sync";
import {HttpTransport, SyncClient} from "@barocss/doc-sync/sync";
import {buildLexicalSchema, LexicalBinding} from "@barocss/doc-sync/lexical";

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

Covered table cells remain in the full-grid model. The binding hides their DOM cells while preserving their text. Cell-body metadata is retained even though native Lexical cells do not have a separate cell-body node.

A custom codec can declare `nodes`, `toLexical(model, context)`, and `fromLexical(node, context)`. Return null to let the normal codec handle a value. These functions run as application code and must preserve the model contract. They are not data supplied by a remote document.

## Read or convert a document

```ts
import {
    readLexicalModel, toLexicalJSON, fromLexicalJSON,
} from "@barocss/doc-sync/lexical";

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

See [editor integration](./editors), [the editing API](./editing), and [binding source](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync/src/lexical).
