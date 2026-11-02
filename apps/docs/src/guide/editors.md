# Editor integration

Choose an editor binding, give it a `SyncClient`, and keep `doc.edit()` as the shared document interface. All bindings use the same document engine and collaboration history.

| Editor | Public entry point | Guide |
| --- | --- | --- |
| ProseMirror | `@barocss/doc-sync-prosemirror`: `PmBinding`, schema builder, conversion helpers | [ProseMirror](./prosemirror) |
| Tiptap | `@barocss/doc-sync-tiptap`: `DocSync` extension and `createTiptapExtensions` | [Tiptap](./tiptap) |
| Slate | `@barocss/doc-sync-slate`: `SlateBinding`, schema codec, selection helpers | [Slate](./slate) |
| Lexical | `@barocss/doc-sync-lexical`: `LexicalBinding`, schema builder, codecs, selection helpers | [Lexical](./lexical) |
| Custom editor | `@barocss/doc-sync-core`: `doc.edit()` and model operations | [Editing](./editing) and [blocks](./blocks) |

Each binding is a separate npm package. Use built repository workspaces or local tarballs until registry release. The old `@barocss/doc-sync/<editor>` imports remain compatibility exports and require the selected binding peer. See [Packages and engines](./packages) for the dependency graph and release workflow.

Install each selected binding with its required editor peers. Core provides the shared CRDT, synchronization client, and server without native editor dependencies.

## Choose the client engine

The current `SyncClient` uses the TypeScript engine. All four bindings can use
its shared `EditorHost` path. Selecting a binding package selects an editor
integration; it does not select another document engine. There is no
`engine: 'wasm'` client option.

For an application that directly owns a document engine, Core also exports the
draft `typescriptEngine` factory. See the [factory example and capability
matrix](./packages#engine-selection-is-a-separate-milestone) and the
[host binding examples](./packages#connect-prosemirror-through-an-editor-host).
The native [Rust SDK](./rust#use-the-native-rust-sdk) and [WASM storage
adapter](./rust#use-the-storage-only-wasm-adapter) have separate APIs.

## What the bindings handle

The bindings convert native changes into model edits, apply them locally once, and commit the resulting operations. Remote changes update native state without creating another local edit. Selection is restored through stable document identities rather than old native paths or node keys.

Slate and Lexical include composition drafts. Native input edits the draft while the live client keeps receiving remote changes. Completion commits the original draft operations and displays the combined model. Both use CRDT undo/redo and provide explicit disposal. Read each guide for its composition wiring and history policy.

The application still supplies its schema, native rendering, toolbar, editor plugins, transport, and lifecycle. A codec's ability to retain data does not supply every native editing gesture for that data.

When the server accepts a compatible schema change, a mounted editor must rebuild its native schema and binding. The [open-editor transition guide](./schema-transition) shows the tested lifecycle and selection conversions for ProseMirror, Slate, and Lexical. Tiptap must also destroy and recreate its extensions; its open-schema transition host has not been qualified. Follow the [runnable examples](./runnable-examples) to try the original three editors, or the [Tiptap demo](./tiptap#run-the-two-editor-demo) for its dedicated integration.

Slate and Lexical retain unchanged root blocks during remote projection. They replace the interval between the common prefix and suffix, using the existing schema codecs. Slate checks its immutable child array and verifies normalization. Lexical invalidates its cache on native content updates and reads back projected content before caching an editor state. Composition, unknown native states and cell restoration keep their recovery paths.

This reduces repeated conversion and native tree construction. It is not a complete incremental renderer: a changed root container is still rebuilt, comparisons can scan the document, Lexical readback still converts the full model, and local native input retains conversion costs. See the [remote editor performance report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/native-receive-2026-10-24/report.md) for Chrome measurements across the three product profiles.

Read [editor design lessons](./editor-lessons) for architecture differences, the selection/composition/table problems we solved, and the regression cases that expose them.

The [Word, Notion and presentation profiles](./product-schemas) also test headless conversion of larger schemas. A separate native demo now checks structured editing with all three bindings. Product layout and file fidelity remain separate integration work.

## Compare the editors

The comparison app uses the public Slate and Lexical entry points. It opens two Slate editors, two Lexical editors, and one ProseMirror editor on one document, with a separate client identity for each.

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

Open the URL printed by the server; its default port is 5412. Use a new `doc` query value for an isolated document. The app starts a separate backend and temporary data directory. It does not use the original demo `data/` directory.

## Read the evidence at its tested scope

Library tests cover schema conversion, native edits, remote updates without echo, selection mapping, history, composition, reset, reconnect, and disposal. They use real headless Slate and Lexical editors.

The comparison app's browser scripts check native/client/server equality and input behavior. Historical browser results belong to their source versions; they do not automatically certify a later binding change. Inspect each result status and browser error, not only a script's exit code.

CDP composition is simulated browser input. Actual OS IME acceptance, product performance targets, production authorization, and separate document capability work require their own evidence. See [status and limits](../status).

[Start with one editing API →](./editing)

## Rust experiment

Call the native SDK from a Rust host. Read its projected model after each accepted edit. The host must supply an editor renderer and input adapter.

Use the [native SDK crate setup](./rust#use-the-native-rust-sdk) to run this complete Rust program.

```rust
use doc_sync_native_sdk::{Attributes, Document, EditOptions, Key, Result, SchemaPreset};

fn main() -> Result<()> {
    let mut doc = Document::new("editor-host", SchemaPreset::Text)?;
    let change = doc.insert_text(
        &Key::root(),
        "Hi",
        Attributes::new(),
        EditOptions::default(),
        0.0,
    )?;
    assert_eq!(change.ops.len(), 1);
    let model = doc.model()?;
    assert_eq!(model.children[0].node_type, "paragraph");
    let doc_sync_native_sdk::ModelRun::Text(run) = &model.children[0].runs[0] else {
        panic!("expected text")
    };
    assert_eq!(run.units.to_string().expect("valid example UTF-16"), "Hi");
    Ok(())
}
```

The native SDK uses six fixed `SchemaPreset` values. Runtime schema registration, live schema changes, the full `doc.edit()` compiler, WASM, Node, HTTP, MCP, and editor bindings are not included.

<details>
<summary>Raw protocol probe and reference checks</summary>

All four editor bindings above still use TypeScript. The [native Rust SDK](./rust#use-the-native-rust-sdk) provides a callable Rust API; it is not a browser binding. To inspect the lower engine boundary, send a text operation directly to the native process. This example uses its base paragraph fixture; it does not start an editor.

Build the private executable with the commands in [the Rust guide](./rust#run-the-private-experiment). Run the following command from the repository root. Each input line produces one JSON response.

```sh
experiments/rust-shadow/target/debug/doc-sync-rust-shadow <<'JSONL'
{"cmd":"new","replica":"A","actor":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"state","replica":"A"}
JSONL
```

The last response contains UTF-16 units `[72,105]` (`Hi`). This checks native application and state inspection. A Rust binding must separately connect native input, remote projection, composition, selection and disposal. No public Rust editor binding or full WASM CRDT client exists. See [the adapter boundary](./rust#what-runs-where).

</details>
