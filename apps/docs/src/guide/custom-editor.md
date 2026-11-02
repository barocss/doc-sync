# Custom editor

A custom editor must convert native input to document edits and render accepted
model changes. It must also map selections and release its listeners. Start
with a small schema. Add richer shapes only when your renderer and input
adapter can handle them.

Choose the session type with the
[LocalClient and SyncClient comparison](./local-editing#localclient-and-syncclient).
The textarea example below uses LocalClient and keeps its document in memory.
To try native editors first, [run the LocalClient demo](./local-editing#run-the-local-editor-demo)
with ProseMirror, Slate and Lexical.

## Mount a plain textarea

This example uses `LocalClient` and one plain-text paragraph. It runs in memory.
Put a `<textarea>` in your page and call `mountTextArea(textarea)` from your
application. Build the Core workspace first, as described in
[Packages and engines](./packages).

<!-- custom-editor-example -->
```ts
import {type EditOp, type Schema} from '@barocss/doc-sync-core';
import {LocalClient} from '@barocss/doc-sync-core/local';

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
    let saved: ReturnType<typeof client.captureSelection> = null;
    let nativeInput = false;
    const text = () => (client.model().children?.[0]?.runs ?? [])
        .map(run => 'text' in run ? run.text : '').join('');

    function capture() {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const backward = textarea.selectionDirection === 'backward';
        saved = client.captureSelection({
            anchor: [0, backward ? end : start],
            focus: [0, backward ? start : end],
        });
    }
    function render() {
        textarea.value = text();
        const range = client.resolveSelection(saved);
        if (!range) return;
        const anchor = range.anchor[1];
        const focus = range.focus[1];
        textarea.setSelectionRange(Math.min(anchor, focus), Math.max(anchor, focus),
            anchor > focus ? 'backward' : 'forward');
    }
    function input() {
        const previous = text();
        const next = textarea.value;
        if (previous === next) { capture(); return; }
        // Keep unchanged UTF-16 units and their document identities.
        let start = 0;
        const limit = Math.min(previous.length, next.length);
        while (start < limit && previous[start] === next[start]) start++;
        let beforeEnd = previous.length;
        let afterEnd = next.length;
        while (beforeEnd > start && afterEnd > start
            && previous[beforeEnd - 1] === next[afterEnd - 1]) {
            beforeEnd--;
            afterEnd--;
        }
        const edits: EditOp[] = [];
        if (beforeEnd > start) edits.push({op: 'delete', at: [0, start], count: beforeEnd - start});
        if (afterEnd > start) edits.push({op: 'insert', at: [0, start], content: next.slice(start, afterEnd)});
        nativeInput = true;
        try { client.edit(edits); }
        finally { nativeInput = false; }
        capture();
    }
    const stop = client.subscribe({modelEvents() { if (!nativeInput) render(); }});
    textarea.value = text();
    capture();
    textarea.addEventListener('input', input);
    textarea.addEventListener('select', capture);
    textarea.addEventListener('keyup', capture);
    textarea.addEventListener('pointerup', capture);

    return {
        client, // Application edits, undo() and redo() also update the textarea.
        dispose() {
            textarea.removeEventListener('input', input);
            textarea.removeEventListener('select', capture);
            textarea.removeEventListener('keyup', capture);
            textarea.removeEventListener('pointerup', capture);
            stop();
            client.dispose();
        },
    };
}
```

Both textarea selection offsets and document text offsets use UTF-16 units.
A backward selection has its anchor at `selectionEnd` and focus at
`selectionStart`. Keep that direction when you restore the range. Captured
endpoints can become unavailable after deletion; this example leaves the
browser's collapsed selection when resolution returns null.

The adapter compares the common prefix and suffix, then deletes or inserts only
in the changed range. Unchanged text keeps its document identities. The
comparison can scan the paragraph; this is a small integration example, not a
large-document performance result.

The example supports one plain-text paragraph. It does not preserve rich text,
inline nodes, tables, multiple blocks or native history. Composition and actual
OS IME behavior are not qualified. A production adapter needs composition
handling, error recovery and browser tests. Call `dispose()` when you remove the
editor.

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
