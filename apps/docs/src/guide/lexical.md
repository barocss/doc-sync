# Lexical adapter example

The compatibility demo connects two Lexical editors, two Slate editors, and one ProseMirror editor to one document. Each editor has its own actor and `SyncClient`.

The Lexical adapter is repository demo code. There is no public `LexicalBinding` export. The public [ProseMirror binding](./prosemirror) is a separate integration. Reuse the Lexical example only after checking its schema, input, selection, and lifecycle assumptions.

## Run the example

From the repository root, use Node.js 22.18 or later and an installed Chrome:

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm test --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

Open `http://127.0.0.1:5412/?doc=lexical-example`. Use a new `doc` value for an isolated document. Set `COMPAT_PORT` to choose another port. The server creates a separate backend process and temporary data folder. It does not use the original `data/`. Server shutdown stops that backend; temporary data is retained.

The install command keeps compatibility dependencies outside the root lockfile. It does not create another published doc-sync package.

## Conversion and event flow

The local adapter helpers are imported relative to `apps/demo/compat/main.jsx`:

```jsx
import {
    schema, fromLexical, editsFor, commitModelEdits,
} from './model.mjs';
import {
    InputSession, lexicalBlocks, lexicalModelPoint, lexicalNativePoint,
} from './input-session.mjs';
```

These files are demo modules, not public npm entry points. `fromLexical(editorState.toJSON())` converts Lexical nodes into canonical `NodeJSON` under the demo schema. It maps text-format bits and converts native table rows/cells into the shared table model. Lexical has no native `table-cell-body` node; the conversion and position helpers add that model level.

Local updates flow through `fromLexical`, `editsFor`, `commitModelEdits`, and `InputSession.commit`. `editsFor` preserves supported paragraph split/join intent before using a general model diff. `commitModelEdits` translates model code-point offsets and ranges to CRDT UTF-16 units, then calls `doc.edit()`.

The shared `makePeer` function creates the `HttpTransport`, `SyncClient`, and `InputSession`. Its send path contains the following logic; tracing and counters are omitted:

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

The returned operations are already applied locally. `InputSession` sends them through the client or stages them during composition. Remote model events cause a pull from the live client. The adapter rebuilds the native Lexical tree instead of applying each model event as a native Lexical operation.

## Create the native editor

The following focused excerpts come from `mountLexical` in `main.jsx`. They use its existing `makePeer`, `equal`, and `report` definitions. The full source also supplies composition listeners, reset handling, tracing, toolbar actions, and connection cleanup. These excerpts are not a standalone app.

```jsx
import {
    createEditor as createLexicalEditor,
    $getRoot, $getSelection, $isRangeSelection,
    $createRangeSelection, $setSelection,
    $createParagraphNode, $createTextNode,
    UNDO_COMMAND, REDO_COMMAND, COMMAND_PRIORITY_HIGH,
    SKIP_DOM_SELECTION_TAG,
} from 'lexical';
import {
    registerRichText, HeadingNode, QuoteNode,
    $createHeadingNode, $createQuoteNode,
} from '@lexical/rich-text';
import {
    TableNode, TableRowNode, TableCellNode,
    $createTableNode, $createTableRowNode, $createTableCellNode,
    registerTablePlugin, registerTableSelectionObserver,
} from '@lexical/table';

const peer = makePeer(name, 'Lexical');
const element = document.createElement('div');
element.className = 'editor';
element.contentEditable = 'true';
element.setAttribute('role', 'textbox');
element.setAttribute('aria-label', name);
peer.section.querySelector('.mount').append(element);

const editor = createLexicalEditor({
    namespace: name,
    nodes: [HeadingNode, QuoteNode, TableNode, TableRowNode, TableCellNode],
    onError: report,
});
editor.setRootElement(element);
registerRichText(editor);
registerTablePlugin(editor);
registerTableSelectionObserver(editor, true);
editor.registerCommand(UNDO_COMMAND, () => {
    peer.client.undo();
    return true;
}, COMMAND_PRIORITY_HIGH);
editor.registerCommand(REDO_COMMAND, () => {
    peer.client.redo();
    return true;
}, COMMAND_PRIORITY_HIGH);
```

Undo and redo use CRDT history. The complete demo also intercepts the undo key shortcut, captures selection, and invokes client undo or redo. It does not use an independent Lexical history as the authority for shared changes.

## Build and apply the receiving model

Lexical nodes must be created in an editor update. The demo's local `build` function converts supported common-model nodes back into native nodes. Error messages below are written in English; the conversion branches match the demo.

```jsx
const build = item => {
    if (['paragraph', 'heading1', 'heading2', 'quote'].includes(item.type)) {
        const block = item.type === 'paragraph' ? $createParagraphNode()
            : item.type === 'quote' ? $createQuoteNode()
            : $createHeadingNode(item.type === 'heading1' ? 'h1' : 'h2');
        for (const run of item.runs ?? []) {
            if (!('text' in run)) throw new Error(`Unsupported inline: ${run.type}`);
            const text = $createTextNode(run.text);
            for (const key of ['bold', 'italic', 'underline', 'strike']) {
                if (run.marks[key]) text.toggleFormat(key === 'strike' ? 'strikethrough' : key);
            }
            block.append(text);
        }
        return block;
    }
    if (item.type === 'table') {
        return $createTableNode().append(...item.children.map(build));
    }
    if (item.type === 'table-row') {
        return $createTableRowNode().append(...item.children.map(build));
    }
    if (item.type === 'table-cell') {
        return $createTableCellNode(0).append(...item.children[0].children.map(build));
    }
    throw new Error(`Unsupported node: ${item.type}`);
};

peer.read = () => fromLexical(editor.getEditorState().toJSON());
peer.readRange = () => editor.getEditorState().read(() => {
    const selection = $getSelection();
    const blocks = lexicalBlocks($getRoot());
    return $isRangeSelection(selection) ? {
        anchor: lexicalModelPoint(blocks, selection.anchor),
        focus: lexicalModelPoint(blocks, selection.focus),
    } : null;
});
peer.flushInput = () => peer.send(peer.read());

peer.pull = () => {
    if (peer.input.active) return;
    const model = peer.client.doc.toJSON();
    if (equal(peer.read(), model)) return;
    const saved = peer.input.resolve(peer.savedRange);
    const focused = element === document.activeElement;

    editor.update(() => {
        $getRoot().clear().append(...model.children.map(build));
        const blocks = lexicalBlocks($getRoot());
        const anchor = lexicalNativePoint(blocks, saved?.anchor);
        const focus = lexicalNativePoint(blocks, saved?.focus);
        if (anchor && focus) {
            const range = $createRangeSelection();
            range.anchor.set(anchor.key, anchor.offset, anchor.type);
            range.focus.set(focus.key, focus.offset, focus.type);
            $setSelection(range);
        }
    }, {
        tag: focused ? ['doc-sync-remote'] : ['doc-sync-remote', SKIP_DOM_SELECTION_TAG],
        discrete: true,
    });
};

editor.update(() => {
    $getRoot().append($createParagraphNode());
}, {tag: 'doc-sync-remote', discrete: true});

editor.registerUpdateListener(({editorState, tags, dirtyElements, dirtyLeaves}) => {
    if (tags.has('doc-sync-remote') || (!dirtyElements.size && !dirtyLeaves.size)) return;
    peer.send(fromLexical(editorState.toJSON()));
});
```

The update listener skips tagged remote changes to prevent a send/receive loop. It also skips selection-only updates without dirty content. The shared peer handler calls `peer.pull()` for model events and handles reset separately. The full application connects clients after editor setup.

## Selection and composition

Replacing the tree creates new Lexical node keys. The adapter therefore captures both selection ends as CRDT token identities before a server event changes the model. `lexicalBlocks` and `lexicalModelPoint` produce common paths. After replacement, `InputSession.resolve()` and `lexicalNativePoint` attach the selection to the new node keys. Keeping old keys or fixed numeric offsets would lose the caret when remote structure or text changes.

Only the focused editor should update browser selection. Other editors use `SKIP_DOM_SELECTION_TAG`, so a remote pull does not move input focus to another pane.

Composition uses an `InputSession` draft. Local updates edit that draft while the real client receives remote changes. Native replacement waits while `peer.input.active` is true. At composition end, the shared handler flushes the final native update, captures selection, commits the original draft operations as one history group, and pulls the combined live model.

Token IDs and origins are retained; the adapter does not turn remote text into deletions by diffing a stale composition display against the live model. `reserveClock()` keeps draft and live operation numbers distinct, including after a reconnect snapshot. Reset cancels the draft and clears stale native state even when the model was already empty.

## Test scope and limits

The converter handles paragraphs, the demonstrated headings and quotes, bold/italic/underline/strike, and simple tables using `@lexical/table`. Unsupported nodes and inline content are rejected. The shared schema supports more content than this adapter can convert; registering an extra native node alone does not extend the conversion contract.

Unit tests cover conversion and input-session behavior. Chrome checks compare native, client, and server models, and cover reconnect, caret mapping, composition with remote edits, formatting, split/join, table input, and composition reset. The historical post-fix report records 84/84 aggregate input checks across the three editor types, 20 general regressions, and 30 operation traces. Trace collection is separate evidence from an input pass.

IME checks use Chrome CDP composition commands. They do not establish actual OS Korean IME acceptance. Paste, links, lists, images, cell merge/split, and general production-editor acceptance are outside that input-test pass. Inspect individual result statuses and browser errors, not only process exit codes.

Remote pulls rebuild the full native tree. This has a cost for large documents. The samples do not approve performance targets, arbitrary delivery schedules, production authorization, or lease-expiry recovery. See [status and limits](../status).

Use the complete [adapter source](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/main.jsx), [model conversion](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/model.mjs), [input helpers](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/input-session.mjs), and [test commands and evidence](https://github.com/barocss/doc-sync/blob/main/apps/demo/compat/README.md) when adapting this example. See also the [Slate example](./slate) and [synchronization contract](./sync).
