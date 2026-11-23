# Tiptap

Use the built repository workspaces or local tarballs. These package names are not yet published on npm. See [Packages and engines](./packages) for Core, binding, and editor peer requirements.

The `@barocss/doc-sync-tiptap` package connects a real Tiptap Editor to a `SyncClient`. Tiptap owns the editor state and applies transactions. Doc Sync converts accepted transactions to shared model operations. The tested peer version is Tiptap 3.32.2.

## Create an editor

Install `@tiptap/core` and `@tiptap/pm` at the same supported version. Connect the client and receive its initial snapshot before mounting the editor.

```ts
import {Editor} from '@tiptap/core';
import {DocSync, createTiptapExtensions} from '@barocss/doc-sync-tiptap';

// client is a connected SyncClient with its initial snapshot loaded.
const editor = new Editor({
    element: document.querySelector('#editor')!,
    extensions: [
        ...createTiptapExtensions(client.schema),
        DocSync.configure({
            client,
            presence: {name: 'Alice', color: '#2274a5'},
            onSelection(anchor, focus) {
                // Both endpoints are stable token keys, or null.
            },
            onError(error, callback) {
                console.error(callback, error);
            },
        }),
    ],
});

editor.chain().focus().insertContent('Hello').run();
editor.commands.docSyncUndo();
editor.commands.docSyncRedo();
editor.can().docSyncUndo();

// Dispose the editor before reusing this client for another editor.
editor.destroy();
client.disconnect();
```

The shared client document supplies the initial editor content. An `Editor` `content` option does not replace that shared content. Mounting an existing snapshot does not create a local history entry.

Host callbacks (`onSelection`, and the existing client `onUpdate` and `onModelEvents`) run in microtasks after native state updates. A callback can issue a new editor command. Callback and presence transport errors go to `onError(error, callback)`; the default reports them to the console. Pending callbacks stop when the editor is destroyed.

Use one mounted Tiptap editor per client. Use separate clients for separate actors. Destroying an editor removes its binding and restores the application callbacks that it wrapped. The application owns the client connection.

The generated schema is fixed for the mounted editor. After an accepted schema
change, destroy and rebuild the editor with new generated extensions while
retaining the client and pending changes. A dedicated Tiptap host for the
open-editor transition helper has not yet been qualified; the tested shared
transition hosts remain ProseMirror, Slate, and Lexical.

## Schema and history limits

`createTiptapExtensions(schema, domHints?)` generates the exact nodes and marks used by the ProseMirror converter. Lists use the converter's flattened list-item structure. Tables use its visible-cell representation. Use the current shared model as the reference when converting table JSON outside the binding. See [ProseMirror](./prosemirror#merged-cells-and-model-reads).

Do not combine the generated schema with StarterKit's document, text, paragraph, list, mark, or history extensions. A general StarterKit schema is not the supported shared schema. Schema-compatible command and UI extensions can be added. Extra nodes, marks, incompatible schema rules, local history, and other collaboration bindings are rejected.

Doc Sync supplies actor-owned history. The commands are `docSyncUndo` and `docSyncRedo`. The keyboard shortcuts are Mod-Z, Mod-Shift-Z, and Mod-Y. Do not add Tiptap UndoRedo, ProseMirror history, or another collaboration history.

Run undo or redo in a separate chain from document edits. For example, `editor.chain().insertContent('x').docSyncUndo().run()` throws before either document changes. A selection-only chain with undo is supported. An actor's undo preserves changes from another actor.

Accepted appended transactions keep the Tiptap plugin state. Transactions rejected by another plugin do not reach the shared document. Remote updates map both selection endpoints and do not move browser focus. A read-only editor can receive remote updates.

Presence sends the local anchor and focus through `client.setPresence`. The anchor endpoint is the active caret; focus stores the other range endpoint. The binding also renders the other actors' selections and caret labels. Supply your transport's presence send and receive paths.

## Run the two-editor demo

From the repository root:

```sh
node apps/demo/tiptap/start.mjs
```

Open the printed local URL. The page mounts Alice and Bob as real Tiptap editors. A queued in-memory transport connects them to the production `DocHub`. It does not use an HTTP server for document synchronization.

Type in each editor. Use Bold, Italic, Paragraph, List, Undo, and Redo. Use Offline / Reconnect to delay one actor's receipt. Use Dispose / Remount to replace one editor while retaining its client. The shared-state panel shows both native documents, both shared models, pending counts, connection state, and presence. `Synced` means that the native documents and client models match the hub and no changes remain pending.

The focused tests use real Tiptap with jsdom: 16/16 pass. The complete library
suite passes 742/742, including those 16 tests. Separate Chrome checks cover
actual keyboard input in both editors, actor-owned undo/redo that preserves
foreign text, visible remote ranges, disconnect/reconnect, and dispose/remount.
The final browser check reports no console errors. Browser automation does not
qualify real OS keyboard composition or Korean IME behavior. Open-schema
transition and arbitrary StarterKit integration remain outside this proof.

## Rust experiment

This integration uses the TypeScript document engine and the TypeScript ProseMirror binding. It does not provide a Rust Tiptap adapter or a full WASM document engine. The [native Rust SDK](./rust#use-the-native-rust-sdk) exposes typed document, operation, History, and selection calls in a Rust host. Run its two-author example with:

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" CARGO_TARGET_DIR=output/r4-sdk-target "$(rustup which --toolchain stable cargo)" run --offline --manifest-path experiments/rust-sdk/Cargo.toml --example two_actors
```

That example verifies engine-side convergence, retry, and actor-owned undo; it
does not mount Tiptap. See [connect an editor](./rust#connect-an-editor) for the
current TypeScript route and the missing Rust/WASM adapter boundary.
