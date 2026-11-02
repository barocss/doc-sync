# ProseMirror

Use the built repository workspaces or local tarballs. These package names are not yet published on npm. See [Packages and engines](./packages) for Core, binding, and editor peer requirements.

The optional binding builds a ProseMirror schema from the document schema and converts transactions to model operations. ProseMirror packages are peer dependencies of this entry point.

## Create the binding

```ts
import {Client} from "@barocss/doc-sync-core/client";
import {EditorView} from "prosemirror-view";
import {buildPmSchema, PmBinding} from "@barocss/doc-sync-prosemirror";

const client = new Client({schema}); // Local editing; no transport.
const info = buildPmSchema(schema);
const binding = new PmBinding(client, info);
const view = new EditorView(document.querySelector("#editor"), {
    state: binding.state,
    dispatchTransaction: binding.dispatch,
});
binding.view = view;
binding.onChange = () => view.updateState(binding.state);
```

See [Client](./client) for schema setup and synchronized construction with `{actor, schema, transport}`. The binding creates one internal host per view. It also accepts an existing `LocalClient` or `SyncClient`. Advanced integrations can still use `PmHostBinding(host, info)` with an explicit `EditorHost`.

Use the CRDT client's history for collaboration-aware undo and redo. Do not add a separate ProseMirror history as the authority for shared changes.

This is a minimal mount. Supply the keyboard and editing plugins required by your editor. Wire undo and redo keys to `client.undo()` and `client.redo()`. See the [complete demo](https://github.com/barocss/doc-sync/blob/main/apps/demo/ui/pm-app.ts) for plugin and toolbar wiring.

## Transaction handling

Common insertion, deletion, split, merge, and mark steps are converted directly where possible. Other steps use model comparison. The binding checks canonical results and reconciles the editor when needed.

Remote updates use a replacement transaction for the changed range. ProseMirror maps its selection through that transaction. Model and conversion caches depend on both the `Doc` instance and its version, so snapshot or reset replacement does not reuse the wrong document.

## Merged cells and model reads

ProseMirror contains only visible table cells. The shared document retains covered cells, including their content, marks and attributes. `PmBinding` supplies the current model as a reference during conversion. Merging cells therefore preserves covered content for unmerge and collaboration-aware history.

If your application calls the conversion helper directly, pass the matching full model as its fourth argument:

```ts
import {canonical} from "@barocss/doc-sync-core";
import {fromPmJSON} from "@barocss/doc-sync-prosemirror";

const model = canonical(schema, fromPmJSON(info, schema, view.state.doc.toJSON(), client.model()));
```

A native document alone cannot reconstruct content that it does not contain. Returned covered-cell data is copied from the reference. Application commands can use `client.edit()` to update mounted views through model notifications. Low-level code that bypasses the client notification path must call `binding.pull()` after committing its operations.

## Change the schema while open

Build a new ProseMirror schema, view state and application plugins after the server accepts a compatible schema. Save the text selection as model paths before destroying the old view. Use `upgradeOpenEditorSchema` with an application host to anchor and restore that selection while retaining the client, pending changes and history. The [transition guide](./schema-transition#prosemirror) shows the position conversions and failure handling.

## Input limits

Automated Chrome tests include remote edits during simulated composition and cursor mapping. They are not a substitute for real OS keyboard and IME acceptance tests. The basic `/pm` demo and the Slate/Lexical compatibility demo have separate input implementations.

See [status and limits](../status) before using the binding in a production editor.

## Tiptap

Use the dedicated [Tiptap extension](./tiptap) when Tiptap owns the editor.
It reuses this binding's conversion and selection code while preserving
Tiptap's state, plugin filters, appended transactions, commands, and lifecycle.
The direct `EditorView` setup above is not a Tiptap mount procedure. The new
extension has its own schema and History checks and browser evidence.

## Rust experiment

This calls the native SDK selection boundary. The Rust model position is a UTF-16 path. The host must still map ProseMirror document positions to this path and map the resolved path back through the TypeScript binding shown above. No native browser binding is supplied.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{
    Attributes, Document, EditOptions, Key, Position, Result, SchemaPreset, Selection,
};

fn main() -> Result<()> {
    let mut doc = Document::new("prosemirror-host", SchemaPreset::Text)?;
    let mut peer = Document::new("prosemirror-peer", SchemaPreset::Text)?;
    let change = doc.insert_text(
        &Key::root(),
        "Hi",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    peer.apply_remote(&change.ops)?;
    let range = Selection {
        anchor: Position(vec![0, 2]),
        focus: Position(vec![0, 1]),
    };
    let captured = doc.capture_selection(Some(range.clone()))?;
    assert_eq!(peer.resolve_selection(captured)?, Some(range));
    assert_eq!(doc.model()?, peer.model()?);
    Ok(())
}
```

The existing TypeScript adapter uses `pmPosToPath` and `pathToPmPos` in `packages/doc-sync-prosemirror/src/convert.ts`. A Rust-backed adapter must connect that editor conversion to `capture_selection` and `resolve_selection`, and project `model()` into the ProseMirror document. The example does not install or test that adapter.

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

The production `PmBinding` still maps ProseMirror positions to TypeScript model paths. This native check starts at the model-path boundary. `Hi` occupies two UTF-16 units in paragraph 0.

Build the driver with [Run the private experiment](./rust#run-the-private-experiment), then run this from the repository root:

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"editor","actor":"editor","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"editor","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"human"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"selection_capture","replica":"editor","range":{"anchor":[0,1],"focus":[0,2]}}
{"cmd":"selection_resolve","replica":"editor","range":{"anchor":"1@human","focus":"2@human"}}
JSONL
```

The resolved range is `[0, 1]` to `[0, 2]`. ProseMirror position conversion and DOM selection need binding tests. Inline nodes consume one model offset; link spans add no path level. Covered table cells retain core content but cannot produce a visible selection. The TypeScript binding supplies those mappings and the full reference model; this flat Rust example does not test them.

This uses the fixed base text schema. Rust has no production editor, bot, or MCP adapter. See the [Rust engine guide](./rust) for the separate v1 through v6 capabilities and limits.

</details>
