# Save and open a local document

A local Client keeps its active state in memory. Use `captureState()` to obtain
a detached JSON value and `Client.fromState()` to open it as a new client.
Your application chooses the storage medium and the successful write boundary.
Saving is explicit; ordinary editing does not write to storage.

## Preserve the document and History

<!-- local-state-example -->
```ts
import {Client, type Schema} from '@barocss/doc-sync';

const schema: Schema = {
    root: 'document',
    marks: ['bold'],
    nodes: {
        document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
const client = new Client({schema, actor: 'local-author'});
client.edit([{op: 'insert', at: [0, 0], content: 'Hello 😀'}]);
client.edit([{op: 'update', at: [0, 0], length: 5, attrs: {bold: true}}]);
client.undo(); // Keep text and a formatting action in the redo stack.

const bytes = JSON.stringify(client.captureState());
// Write bytes using localStorage, an IndexedDB transaction, or your file adapter.
const restored = Client.fromState(JSON.parse(bytes), {schema});
restored.redo(); // Reapply the saved formatting action.
```

The restored client has the saved actor, CRDT identities, allocation clock,
retained document content and undo/redo History. Hidden table-cell content is
included. You can resolve previously captured selection anchors against it.
Selections and view focus are application state; Core does not store them in
this envelope. Cache generation and revision stamps are regenerated when opening.

`LocalClient` has the same methods in Core `/local`. `LocalClientState` is the
versioned data type exported by `/local`, `/client` and the package roots.
`fromState()` accepts unknown data and validates it before returning a client.
The first format is `doc-sync-local-state-v1`, containing the actor, schema
fingerprint and engine checkpoint. Treat the engine payload as opaque data.

## Choose the write boundary

```ts
const key = 'my-app:document:example';
const bytes = JSON.stringify(client.captureState());
localStorage.setItem(key, bytes);
```

Construct and serialize the complete value before replacing a saved record.
A failed capture or serialization must leave the previous saved bytes alone.
Web Storage replaces one key atomically, but a quota or access failure can reject
the write. For IndexedDB, commit the transaction before reporting success. A
file adapter must define its own atomic replacement and durability guarantees.
Core does not call these storage APIs or guarantee survival of power loss.
Large document checkpoints can exceed a browser storage quota.

## Validate before replacing an open document

```ts
const bytes = localStorage.getItem(key);
if (bytes !== null) {
    const replacement = Client.fromState(JSON.parse(bytes), {schema});
    // Build replacement views successfully before releasing the current client.
    // Give each replacement binding this new client.
}
```

Keep the previous client while opening and mounting the candidate. If parsing,
validation or native view setup fails, retain the previous document and saved
record. Dispose the previous client only after its views detach and replacement
succeeds. This is a new instance, not an in-place reset or a live session merge.

The caller supplies the exact schema. The saved fingerprint must match it.
Opening does not install a different schema or perform a migration. A mismatch,
unsupported format/engine, malformed finite JSON, invalid snapshot/History,
missing History targets or inconsistent allocation clock rejects opening.
Known ticket fields are checked; user attribute JSON is not interpreted as
internal History. These checks detect structural inconsistencies, not authorship
or authenticity of externally modified records.

## Finish incomplete input before saving or opening

Capture rejects uncommitted host operations, an active composition draft (even
an empty one), notification callback reentry and disposed clients. Finish the
normal apply/commit batch, or end/cancel composition, then retry. Rejection does
not discard the pending batch or draft. When replacing an open client, use the
same settled-state check before detaching its views.

Do not auto-save synchronously inside a model observer. A follow-up task can
capture after notification completes, but a production auto-save policy also
needs scheduling, composition, errors and ownership rules. The supplied demo
uses explicit Save and does not claim every keystroke is durable.

## Try the browser demo

```sh
npm run dev:client
```

Append `?persist=1` to its printed local URL. **Save locally** stores the current
document and History. **Open saved** validates and opens the saved copy. Reload
automatically opens the last successful saved copy; edits after that explicit
Save are not auto-saved. **Forget saved** removes the stored copy and keeps the
live document. The demo also retains per-view anchored selections in its own
wrapper. A failed open keeps the existing views; mounting failure attempts to
restore the previous client and views.

Browser storage belongs to the origin. Reuse the same preview port and browser
profile to reopen it. `storageKey` in the query selects an isolated saved slot,
for example `?persist=1&storageKey=my-notes`. Default routes remain ephemeral;
Sync and legacy demo routes disable this storage UI. Several views on the same
client still share one actor and History. Independent tabs are not merged or
locked by this local API; applications must define ownership of a shared slot.

## Synchronization and Rust boundaries

`Client.captureState()` is local-only. Sync mode directs applications to the
existing `client.sync.captureState()` and its server epoch/GC recovery rules.
A local state has no server sequence, pending transport queue or protection
reservation. It cannot resume a synchronized session or convert to one by adding
a transport. See [synchronized recovery](./sync#reconnect-and-history).

The native Rust SDK uses its separate checkpoint format. This TypeScript local
envelope does not enable a Rust/WASM production factory, cross-engine restore,
local schema migration or automatic background durability.
