# Tiptap

The optional `@barocss/doc-sync/tiptap` entry point connects a real Tiptap Editor to a `SyncClient`. Tiptap owns the editor state and applies transactions. Doc Sync converts accepted transactions to shared model operations. The tested peer version is Tiptap 3.32.2.

## Create an editor

Install `@tiptap/core` and `@tiptap/pm` at the same supported version. Connect the client and receive its initial snapshot before mounting the editor.

```ts
import {Editor} from '@tiptap/core';
import {DocSync, createTiptapExtensions} from '@barocss/doc-sync/tiptap';

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

The focused tests use real Tiptap with jsdom. Chrome acceptance checks are separate from these tests. Browser automation does not qualify real OS keyboard composition or Korean IME behavior.

## Rust experiment

This integration uses the TypeScript document engine and the TypeScript ProseMirror binding. It does not provide a Rust Tiptap adapter or a full WASM document engine. The private native Rust experiment starts at the shared model boundary. See [Rust engine](./rust) for its scope and commands.
