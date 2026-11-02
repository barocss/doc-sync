# Custom editor

A custom editor must convert native input to document edits and render accepted
model changes. It must also map selections and release its listeners. Start
with a small schema. Add richer shapes only when your renderer and input
adapter can handle them.

Use [Client](./client) for local or synchronized setup. A custom wrapper can accept the client and create one `EditorHost` internally for each view. The textarea example below keeps its document in memory. The existing [local demo](./local-editing#run-the-local-editor-demo) also retains its explicit `LocalClient` and host API; its shared mode connects Custom, ProseMirror, Slate, and Lexical views.

## Mount a plain textarea

The reusable `mountCustomEditor(textarea, host, {onError})` adapter is a demo
module. It is not an export of the Core package. Copy
[`custom-editor.mjs`](https://github.com/barocss/doc-sync/blob/main/apps/demo/local/custom-editor.mjs)
and its [TypeScript declaration](https://github.com/barocss/doc-sync/blob/main/apps/demo/local/custom-editor.d.mts)
into your application beside the example below. Save the example as `textarea.ts`. Put a `<textarea>` in your page
and call `mountTextArea(textarea)`. Build the Core workspace first, as described
in [Packages and engines](./packages).

<!-- custom-editor-example -->
```ts
import type {Schema} from '@barocss/doc-sync-core';
import {Client, createEditorHost} from '@barocss/doc-sync-core/client';
import {mountCustomEditor} from './custom-editor.mjs';

// This wrapper owns a per-view host, while the caller owns the client.
export function bindTextArea(textarea: HTMLTextAreaElement, client: Client) {
    const host = createEditorHost(client);
    const binding = mountCustomEditor(textarea, host, {
        onError(error: unknown) { console.error('Textarea edit failed', error); },
    });
    return {binding, dispose() { binding.dispose(); }};
}

export function mountTextArea(textarea: HTMLTextAreaElement) {
    const schema: Schema = {
        root: 'document',
        marks: [],
        nodes: {
            document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
            paragraph: {shape: 'text'},
        },
    };
    const client = new Client({schema});
    const {binding} = bindTextArea(textarea, client);
    return {
        client,
        binding,
        dispose() {
            binding.dispose();
            client.dispose(); // This function created and owns the client.
        },
    };
}
```

The flow root can contain multiple plain-text paragraphs. A newline in the
textarea separates two paragraphs. The adapter rejects rich text, attributes,
child rules, inline nodes and text nodes with `text: false`. Use a different
binding for these shapes.

The adapter compares the common prefix and suffix. It deletes or inserts only
the changed range and uses split or merge operations for paragraph boundaries.
Unchanged text keeps its document identities. Each native input collects the
operations from host apply calls and commits them as one batch. The comparison
can scan the text; this example does not establish large-document performance.

Both textarea offsets and document text offsets use UTF-16 units. The adapter
maps offsets to paragraph paths, captures selection anchors and restores
backward ranges. It uses an EditorHost composition session for composition
drafts. Actual OS IME behavior is **NOT_RUN**; fake EventTarget tests do not
qualify browser input behavior.

Call `binding.undo()` and `binding.redo()` for adapter history actions. Application
edits through `client.edit()` also update the textarea. Call `dispose()` when
you remove the editor. The binding removes its listeners and cancels its draft;
it does not dispose the borrowed client. The wrapper above disposes the binding
first, then its owned client. The error callback reports failures. It does not
provide save, recovery or automatic merging between clients.

## Share one client with a native editor

The wrapper creates the textarea host internally. The native binding also creates its own host. This example borrows a local Client that uses the plain schema above, and mounts both views:

```ts
import type {Client} from '@barocss/doc-sync-core/client';
import {PmBinding, buildPmSchema} from '@barocss/doc-sync-prosemirror';
import {EditorView} from 'prosemirror-view';
import {bindTextArea} from './textarea.ts';

function mountShared(client: Client, textarea: HTMLTextAreaElement, mount: HTMLElement) {
    const custom = bindTextArea(textarea, client);
    const pm = new PmBinding(client, buildPmSchema(client.schema));
    const view = new EditorView(mount, {
        state: pm.state,
        dispatchTransaction: tr => pm.dispatch(tr),
    });
    pm.view = view;
    pm.onChange = () => view.updateState(pm.state);
    return () => {
        custom.dispose();
        pm.dispose();
        view.destroy();
        // The caller owns client and disposes it after all views detach.
    };
}
```

Both views share one model, one actor and one undo/redo history. Each view keeps
its own selection; the client does not supply a global caret. An edit in either
view updates the other through model notifications in the same JavaScript
runtime. A Client without a transport stays local. Two independent clients do not
exchange or merge edits. See [local editing](./local-editing#share-a-document-between-local-editors)
for the shared-client lifecycle.

## Build a structured binding

Use the [EditorHost contract](./packages#connect-prosemirror-through-an-editor-host)
when a native editor needs staged apply/commit operations, composition drafts,
selection anchors and model notifications. Use one host per editor view. The host-based `mountCustomEditor(textarea, host)` demo adapter and the native `*HostBinding` constructors remain valid advanced APIs. `LocalClient` and `SyncClient` also remain available.
[Local editing](./local-editing) explains the local host lifecycle and its limits.

Use [model operations](./editing) and [block examples](./blocks) to implement each
supported gesture. Read [editor design lessons](./editor-lessons) for native
normalization, selection, composition and history requirements. The existing
[ProseMirror](./prosemirror), [Tiptap](./tiptap), [Slate](./slate) and
[Lexical](./lexical) bindings provide larger integration examples.
