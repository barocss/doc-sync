# Custom editor

A custom editor must convert native input to document edits and render accepted
model changes. It must also map selections and release its listeners. Start
with a small schema. Add richer shapes only when your renderer and input
adapter can handle them.

Choose the session type with the
[LocalClient and SyncClient comparison](./local-editing#localclient-and-syncclient).
The textarea example below uses a LocalClient through an EditorHost and keeps
its document in memory. To try it with native editors,
[run the local editor demo](./local-editing#run-the-local-editor-demo), then add
`?mode=shared` to the demo URL. Shared mode shows Custom, ProseMirror, Slate and
Lexical views of one document.

## Mount a plain textarea

The reusable `mountCustomEditor(textarea, host, {onError})` adapter is a demo
module. It is not an export of the Core package. Copy
[`custom-editor.mjs`](https://github.com/barocss/doc-sync/blob/main/apps/demo/local/custom-editor.mjs)
and its [TypeScript declaration](https://github.com/barocss/doc-sync/blob/main/apps/demo/local/custom-editor.d.mts)
into your application beside the example below. Put a `<textarea>` in your page
and call `mountTextArea(textarea)`. Build the Core workspace first, as described
in [Packages and engines](./packages).

<!-- custom-editor-example -->
```ts
import type {Schema} from '@barocss/doc-sync-core';
import {LocalClient, createLocalEditorHost} from '@barocss/doc-sync-core/local';
import {mountCustomEditor} from './custom-editor.mjs';

export function mountTextArea(textarea: HTMLTextAreaElement) {
    const schema: Schema = {
        root: 'document',
        marks: [],
        nodes: {
            document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
            paragraph: {shape: 'text'},
        },
    };
    const client = new LocalClient({schema});
    const host = createLocalEditorHost(client);
    const binding = mountCustomEditor(textarea, host, {
        onError(error: unknown) { console.error('Textarea edit failed', error); },
    });
    return {
        client,
        host,
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

Use one host per view. This example borrows a LocalClient that uses the plain
schema above, and mounts a textarea beside a native ProseMirror view:

```ts
import type {LocalClient} from '@barocss/doc-sync-core/local';
import {createLocalEditorHost} from '@barocss/doc-sync-core/local';
import {PmHostBinding, buildPmSchema} from '@barocss/doc-sync-prosemirror';
import {EditorView} from 'prosemirror-view';
import {mountCustomEditor} from './custom-editor.mjs';

function mountShared(client: LocalClient, textarea: HTMLTextAreaElement, mount: HTMLElement) {
    const customHost = createLocalEditorHost(client);
    const pmHost = createLocalEditorHost(client);
    const custom = mountCustomEditor(textarea, customHost, {onError: console.error});
    const pm = new PmHostBinding(pmHost, buildPmSchema(client.schema));
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
runtime. LocalClient supplies no transport. Two independent clients do not
exchange or merge edits. See [local editing](./local-editing#share-a-document-between-local-editors)
for the shared-client lifecycle.

## Build a structured binding

Use the [EditorHost contract](./packages#connect-prosemirror-through-an-editor-host)
when a native editor needs staged apply/commit operations, composition drafts,
selection anchors and model notifications. Use one host per editor view.
[Local editing](./local-editing) explains the local host lifecycle and its limits.

Use [model operations](./editing) and [block examples](./blocks) to implement each
supported gesture. Read [editor design lessons](./editor-lessons) for native
normalization, selection, composition and history requirements. The existing
[ProseMirror](./prosemirror), [Tiptap](./tiptap), [Slate](./slate) and
[Lexical](./lexical) bindings provide larger integration examples.
