# Slate adapter example

The repository includes a working Slate adapter in the compatibility demo. It opens two Slate editors, two Lexical editors, and one ProseMirror editor on the same document. Each editor has its own `SyncClient` and actor identity.

This adapter is demo code. The public package does not export a `SlateBinding`. The reusable ProseMirror entry point has a different API: [PmBinding](./prosemirror).

## Run the example

From the repository root, use Node.js 22.18 or later and an installed Chrome:

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm test --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

Open `http://127.0.0.1:5412/?doc=slate-example`. Choose a new `doc` value to isolate a document. `COMPAT_PORT` changes the server port. The compatibility server starts a separate demo backend with temporary data. It does not use the original `data/` directory. Stopping it stops that backend; temporary data is retained.

The install command keeps these test-editor dependencies outside the root lockfile. It does not publish another library package.

## Conversion and event flow

The adapter uses helpers from two repository files:

```jsx
// Import paths are relative to apps/demo/compat/main.jsx.
import {
    schema, fromSlate, toSlate, editsFor, commitModelEdits,
} from './model.mjs';
import {
    InputSession, slateModelPoint, slateNativePoint,
} from './input-session.mjs';
```

These helpers are not public npm entry points. `model.mjs` uses the shared demo schema and converts between Slate nodes and canonical `NodeJSON`.

The send path is:

1. Slate calls `onChange` after a native edit.
2. `fromSlate(editor.children)` produces the common model.
3. `editsFor(before, next)` recognizes supported paragraph split/join intent, then falls back to `diffModels`.
4. `commitModelEdits` converts model code-point offsets to CRDT UTF-16 offsets and calls `doc.edit()`.
5. `InputSession.commit()` sends those operations through the real `SyncClient`, or stages them during composition.

The shared `makePeer` function in `main.jsx` creates the `HttpTransport`, `SyncClient`, and `InputSession`. It installs this send function. The following excerpt omits operation tracing and counters:

```jsx
peer.send = next => {
    const doc = peer.input.doc;
    const before = doc.toJSON();
    if (equal(before, next)) return;

    const edits = editsFor(before, next);
    const ops = commitModelEdits(doc, before, edits);
    peer.input.commit(ops);

    if (!peer.input.active && !equal(peer.client.doc.toJSON(), next)) {
        peer.captureSelection();
        peer.pull();
    }
};
```

`doc.edit()` has already applied the returned operations. The adapter commits them without applying them again. The receive path reads the live client model and replaces the native Slate document. It does not apply received model events as individual Slate operations.

## Create and wire the native editor

This focused excerpt belongs inside the demo's existing `mountSlate` function. It uses `makePeer`, `equal`, `slateLeaf`, and `slateElement` from `main.jsx`. Those local definitions, composition listeners, error handling, and mount-readiness handling are required in the complete application.

```jsx
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createEditor as createSlateEditor, Editor, Transforms} from 'slate';
import {Slate, Editable, withReact} from 'slate-react';

const peer = makePeer(name, 'Slate');
const editor = withReact(createSlateEditor());
let remote = false;
const initialValue = toSlate(peer.client.doc.toJSON());
const read = () => fromSlate(editor.children);

peer.read = read;
peer.readRange = () => editor.selection ? {
    anchor: slateModelPoint(editor.children, editor.selection.anchor),
    focus: slateModelPoint(editor.children, editor.selection.focus),
} : null;
peer.flushInput = () => peer.send(read());

peer.pull = () => {
    if (peer.input.active) return;
    const model = peer.client.doc.toJSON();
    if (equal(read(), model)) return;

    remote = true;
    const next = toSlate(model);
    const saved = peer.input.resolve(peer.savedRange);
    Editor.withoutNormalizing(editor, () => {
        Transforms.deselect(editor);
        for (let i = editor.children.length - 1; i >= 0; i--) {
            Transforms.removeNodes(editor, {at: [i]});
        }
        Transforms.insertNodes(editor, next, {at: [0]});
        const anchor = slateNativePoint(editor.children, saved?.anchor);
        const focus = slateNativePoint(editor.children, saved?.focus);
        if (anchor && focus) Transforms.select(editor, {anchor, focus});
    });
    queueMicrotask(() => { remote = false; });
};

createRoot(peer.section.querySelector('.mount')).render(
    <Slate editor={editor} initialValue={initialValue}
        onChange={() => { if (!remote) peer.send(read()); }}>
        <Editable className="editor" aria-label={name}
            renderElement={slateElement} renderLeaf={slateLeaf}
            onKeyDown={event => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
                    event.preventDefault();
                    peer.captureSelection();
                    event.shiftKey ? peer.client.redo() : peer.client.undo();
                }
            }}/>
    </Slate>
);
```

The `remote` guard prevents replacement operations from becoming another local edit. The full application waits for React mounts before connecting clients. `makePeer` routes `client.onModelEvents` to `peer.pull()` and handles reset events separately.

The demo uses CRDT history for undo and redo. Do not add an independent Slate history as the authority for shared edits without defining how the histories interact.

## Selection and composition

Before a server event changes the document, the focused editor captures both selection ends. `slateModelPoint` combines offsets across formatting leaves. `InputSession.capture()` then stores CRDT token identities. After replacement, `InputSession.resolve()` finds current paths, and `slateNativePoint` converts them back into Slate leaf paths and UTF-16 offsets. A fixed numeric path alone would not survive a paragraph split or format-leaf replacement.

At composition start, `InputSession.begin()` clones the CRDT state. Local input edits this draft while the real client continues to receive remote changes. `peer.pull()` defers native replacement while the draft is active. After composition ends, the shared handler lets Slate flush its last update, captures selection, commits the draft's operations as one history group, and pulls the live model.

Draft operations retain their token IDs and origins. They are not reconstructed by diffing a stale native document against the live remote state. `reserveClock()` prevents draft/live operation-number collisions, including after reconnect snapshots. Reset cancels the draft and clears stale display state, even when the document model was already empty.

## Test scope and limits

The demo supports paragraphs, `heading1`, `heading2`, quotes, basic marks, and simple tables within its conversion rules. Slate tables use nodes and `Transforms` defined in `main.jsx`; they are not a separate public table binding. The converter rejects unsupported inline content.

The compatibility tests cover conversion and input-session behavior. Chrome scripts cover native/client/server equality, reconnect, caret mapping, composition with remote edits, formatting, split/join, table input, and composition reset. The historical post-fix report records 84/84 aggregate input checks across Slate, Lexical, and ProseMirror, plus 20 general regressions and 30 captured operation traces. Those are different evidence types.

IME diagnostics use Chrome CDP composition commands. They do not establish actual OS Korean IME acceptance. Paste, links, lists, images, cell merge/split, and general production-editor acceptance are outside that input-test pass. Inspect individual result statuses and browser errors; a script exit code alone is insufficient.

Remote application rebuilds the full native document. This has a cost for large documents and requires careful selection and composition handling. These samples do not approve performance targets, arbitrary delivery schedules, production authorization, or lease-expiry recovery. See [status and limits](../status).

The complete [adapter source](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/main.jsx), [model conversion](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/model.mjs), [input helpers](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/input-session.mjs), and [test commands and evidence](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/README.md) remain the source of truth. See also the [Lexical example](./lexical) and [synchronization contract](./sync).
