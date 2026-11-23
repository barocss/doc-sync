# Local editing

Use `LocalClient` for a document that stays in memory in one application. It
uses the production TypeScript engine without a transport, server, presence
service or MCP connection. The same schema and editing operations apply.

The entry point is `@barocss/doc-sync-core/local`. It is part of Core, not a new
package. Core and the binding packages remain private before registry release;
use the built workspace or local tarballs described in [Packages and engines](./packages).

## Create and edit a document

```ts
import {type Schema} from '@barocss/doc-sync-core';
import {LocalClient} from '@barocss/doc-sync-core/local';

const schema: Schema = {
    root: 'document',
    marks: ['bold'],
    nodes: {
        document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};

const client = new LocalClient({schema});
client.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
client.edit([{op: 'update', at: [0, 0], length: 5, attrs: {bold: true}}]);
client.undo(); // Remove the formatting; keep the text.
client.redo();
const model = client.model();
```

Each convenience `edit()` applies and records one action. Explicit typing
options can group actions through the existing History rules. The returned
operations are already applied. Do not commit them again. `model()` returns a
borrowed immutable view; do not modify it.

An actor is generated with `crypto.randomUUID()` unless supplied. A custom actor
must be a nonempty identifier containing ASCII letters, digits, `_`, `~` or `-`;
`~root` is reserved. Actor identifiers are separate from display names.

## Connect a native editor

```ts
import {LocalEditorHost} from '@barocss/doc-sync-core/local';
import {PmHostBinding, buildPmSchema} from '@barocss/doc-sync-prosemirror';

const host = new LocalEditorHost(client);
const binding = new PmHostBinding(host, buildPmSchema(schema));
binding.dispatch(binding.state.tr.insertText('!', 6));

// External application edits also update this binding.
client.edit([{op: 'insert', at: [0, 0], content: 'Local: '}]);

// Release the view and then the in-memory client when the application is done.
binding.dispose();
client.dispose();
```

`createLocalEditorHost(client)` is equivalent to constructing the host.
`SlateHostBinding` and `LexicalHostBinding` accept the same host contract. Give
**each native editor view its own LocalEditorHost**. Several hosts can share one
client. Sharing one host across views shares its origin and suppresses events
for those views, so it is not supported.

A host identifies native edits by origin. Its own binding already applied those
edits, while other hosts receive model events. `client.edit()` represents an
external edit and notifies subscribed views. This avoids applying native input
twice. The current Tiptap extension still accepts SyncClient; a direct local-host
option is not part of this step.

Local host status is `{online: false, synchronized: false}`. Its presence list
is empty, and native selection reports do not send network messages. The false
connection flags do not disable local editing.

## Capture a selection

```ts
const saved = client.captureSelection({anchor: [0, 5], focus: [0, 1]});
client.edit([{op: 'insert', at: [0, 0], content: 'A'}]);
const restored = client.resolveSelection(saved);
```

Paths and offsets use UTF-16 units. Captured anchors retain forward, backward
and collapsed ranges through edits when both ends remain visible. A hidden or
unavailable endpoint resolves to null. Native bindings keep their own selection
state; LocalClient supplies capture and resolution rather than a global caret.

## Low-level edits and composition

Bindings use `host.apply()` followed by `host.commit()`. Apply changes the live
engine immediately; commit records and publishes notifications once. Commit
must include all pending operation objects in application order. A concatenated
array is allowed. Copies, partial batches, reordered batches, repeated commits
and a different origin are rejected. An uncommitted batch blocks unrelated
convenience edits and history actions until committed. It is not a rollback
transaction.

Composition sessions keep a private draft, reserve clocks and publish their
retained operations once at `end()`. Cancel discards the draft and keeps live
edits. An external live edit during a draft retains its identity. A composition
is one undo group by default. Passing null as the session record option omits
those operations from History; mixed sessions record only the requested subset.

## Observe changes and errors

```ts
const stop = client.subscribe({
    modelEvents(edits, info) {
        // info.cause is 'local', 'undo' or 'redo'.
    },
    update() {
        const {canUndo, canRedo} = client.historyStatus();
    },
});

client.onNotificationError = error => console.error(error.phase, error.message);
stop();
```

Post-commit observer errors do not undo an accepted edit or stop other observers.
They are exposed through `notificationErrors` and `onNotificationError`. The log
retains at most 100 message-only entries. A mutation attempted inside an observer
is rejected; schedule follow-up edits after notification returns. Disposing the
client ends editing, cancels active drafts and releases subscriptions. Session
cancellation remains safe during later binding cleanup.

## Scope

This API is memory-only. Closing or refreshing the application does not save the
document. Storage adapters, restart recovery, local schema transitions, automatic
conversion to a synchronized session and a Rust/WASM backend are separate work.
It retains CRDT identities and metadata; it is not a compact JSON-only model.

The existing SyncClient path and concurrent editing rules remain unchanged.
The local model-event cause extends the editor contract; it does not add a server
wire event or pretend that a server has verified the document.
