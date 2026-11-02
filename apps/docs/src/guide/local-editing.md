# Local editing

Use `LocalClient` for a document that stays in memory in one application. It
uses the production TypeScript engine without a transport, server, presence
service or MCP connection. The same schema and editing operations apply.

The entry point is `@barocss/doc-sync-core/local`. It is part of Core, not a new
package. Core and the binding packages remain private before registry release;
use the built workspace or local tarballs described in [Packages and engines](./packages).

## Run the local editor demo

The dedicated demo opens ProseMirror, Slate and Lexical. Each editor owns an
independent LocalClient document and undo stack. Edits do not move between the
three panels.

From a repository checkout with Node 22.18 or later. The verified workflow uses
Node 24.22.1 and Chrome 156:

```sh
npm install
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --ignore-scripts --cache /tmp/doc-sync-compat-npm-cache
npm run dev:local
```

Open the URL printed in the terminal. The command builds the packages and starts
a loopback static preview for HTML and JavaScript. It starts no document server,
SyncClient, transport or MCP service. Editing runs in the browser's memory.

Type in each editor, select a forward or backward range, and use its Undo and
Redo controls. Use the application-edit control to check that a local edit can
update the native view while retaining its selection. Each editor has its own
reset control. Reloading the page starts again from the sample document; it does
not recover your edits.

To repeat the Chrome checks while the preview is running:

```sh
npm run check:local -- --url http://127.0.0.1:PORT --output output/local-demo/chrome
```

Replace `PORT` with the printed port. The check uses an isolated Google Chrome
session and the installed `agent-browser` CLI. See the
[demo source and setup](https://github.com/barocss/doc-sync/tree/main/apps/demo/local)
for the exact controls and verification scope. This small text demo includes a
formatted sample. It does not qualify every schema shape, product layout or actual OS IME.

### Verified browser behavior

Chrome 156 passes the following checks in all three native editors:

- Unicode input and deletion with native/client model equality.
- Forward, backward and collapsed selections.
- Toolbar and keyboard undo/redo, with independent document and History state.
- Application prefix insertion with exact logical and DOM selection restoration,
  including repeated identical prefixes in both selection directions.
- Remount retaining the document and History, reset restoring one panel, and
  refresh restoring all samples with empty History.
- Editing after network access is disabled. No document requests, notification
  errors, console errors or page errors were recorded.

The emitted-module report contains no synchronization client, transport or
document-server implementation. The static preview also sets `connect-src 'none'`.
Unused imports can still appear in the bundle's input graph; the report checks
the modules that contribute emitted code.

A 390px screenshot/overflow check passes. A synthetic `persisted: true` pagehide
check confirms that cached-page teardown is skipped and editing remains usable.
Actual BFCache navigation, actual OS IME, broad mobile editing and rendering
latency are not qualified by these checks. Receipts retain the first failures
and the final run; see HANDOFF section 5.109 in the repository for their locations.

## LocalClient and SyncClient

Choose `LocalClient` when the document belongs to one running application and
you do not need server synchronization. Choose `SyncClient` when independent
users, editors or agents must exchange changes through a document server.

| Area | LocalClient | SyncClient |
| --- | --- | --- |
| Import | `@barocss/doc-sync-core/local` | `@barocss/doc-sync-core/sync` |
| Construction | `new LocalClient({schema})`; actor is optional | `new SyncClient(actor, transport, {schema})`; actor and transport are required |
| Document engine | Production TypeScript engine | Same production TypeScript engine by default; only this backend currently ships |
| Schema and operations | Schema-defined text, blocks, tables and attributes | Same editing model and collaboration rules |
| Apply one application edit | `client.edit(edits)` applies and records once | `client.commit(client.engine.apply(edits))` applies, records and queues once |
| Editor host | `createLocalEditorHost(client)` | `createSyncClientEditorHost(client)` from the Core `/editor` entry |
| Editor bindings | ProseMirror, Slate and Lexical accept the local host; the current Tiptap extension requires SyncClient | ProseMirror, Tiptap, Slate and Lexical |
| Selection | Identity anchors for local selection; no remote presence | Identity anchors plus peer cursors and selection ranges |
| Undo and redo | One client History, shared by views using that client | Per-client History; independent participant changes are preserved under the collaboration rules |
| Connection and pending work | No connection, pending transport queue or server acknowledgments | Connect/disconnect, pending changes, acknowledgments and reconnect |
| Storage and restart | Memory-only; no save/open or restart recovery API | Ordinary client state is also in memory; durable recovery requires application storage and the documented server/GC protection |
| Schema changes | No local schema-transition API yet | Compatible server/client transition and editor rebuilding within the documented scope |
| Host connection status | Always offline and unsynchronized; local editing still works | Reports the client's current connection and synchronization state |

Both hosts provide `apply`, `commit`, selection anchors, composition sessions,
`undo` and `redo`. A binding can use this common contract, but changing the host
does not transfer an existing document, History, pending changes or selection.
For a LocalClient, give each native view its own host. Views sharing one client
also share its actor and undo stack; they are not independent collaborators.

### Offline editing and storage

A disconnected SyncClient is still a synchronized-session client. It retains
pending edits and History in memory for reconnect under the existing session
rules. LocalClient has no server session to reconnect and no queue to submit.
Use it for an in-memory editor, a document preview with editing, or local
document transformations.

Neither ordinary client automatically makes an edit durable across a page
refresh or process exit. A server log alone does not restore a participant's
pending changes and undo History. SyncClient checkpoint capture is only part of
recovery; valid generation, schema and GC protection must also be established.
See [synchronization and recovery](./sync#reconnect-and-history).

There is no automatic LocalClient-to-SyncClient conversion. Copying a JSON model
does not preserve CRDT identities or undo History. Define an explicit import or
session handoff before adding collaboration to an existing local document.

### Performance scope

LocalClient removes transport and server coordination from the application,
but it retains the same CRDT identities, metadata and editor conversion work.
It is not a compact JSON-only engine or a promise of faster rendering. The
[offline comparison](../performance#memory-only-client) records operation counts,
original timing flags and narrower repeated checks. It does not establish
general browser latency or a networked SyncClient speedup.

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

## Share a document between local editors

Two editor views can edit one LocalClient. Create a separate host for each view:

```ts
import {LocalClient, createLocalEditorHost} from '@barocss/doc-sync-core/local';

const shared = new LocalClient({schema});
const firstHost = createLocalEditorHost(shared);
const secondHost = createLocalEditorHost(shared);
```

Pass each host to its own native binding, such as a ProseMirror binding and a Slate binding.
Both views read the same document. An edit from either view updates the other
through local model events, without a server. Each view keeps its native
selection, but both views share one actor and one undo/redo History. Undo from
either view acts on that shared History.

This works within one JavaScript runtime. Two independent LocalClient instances
do not exchange or merge edits, even if they use the same actor. Separate tabs,
workers or processes require an explicit communication and synchronization
design; LocalClient supplies no such transport. The executable demo above uses
three independent clients, so its panels intentionally do not share edits.

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
