# Synchronization

`SyncClient` manages a local document, pending changes, acknowledgments, model events, history, and presence. `DocHub` validates and orders changes for one document. A `Transport` connects them.

## HTTP and SSE

```ts
import {SyncClient, HttpTransport} from "@barocss/doc-sync/sync";

const actor = "alice-session-1";
const client = new SyncClient(actor, new HttpTransport("example", actor), {schema});

client.onModelEvents = (events, info) => {
    // Apply remote, undo, redo, or snapshot changes to your editor.
    // Check info.cause and info.fallback when collecting diagnostics.
};
client.connect();

const result = client.doc.edit([{op: "insert", at: [0, 0], content: "Hello"}]);
client.commit(result.ops);
```

This transport expects the API served by the demo server. It does not add authentication, authorization, request limits, or production storage.

## Ordered changes

A change has an actor, an actor-local `seq`, and wire operations. The hub assigns a document-wide `serverSeq`. Dependencies must arrive before operations that reference them. `Doc.apply()` is not a buffer for arbitrary out-of-order dependencies.

Use distinct actor identities for independent replicas and sessions. Your application must define how a persisted session resumes its sequence; an actor display name alone is not a session identity.

`DocHub.submit()` checks an entire change before application. Invalid changes do not partially update the document. Repeated accepted sequences are recognized as duplicates.

## Server boundary

```ts
import {DocHub} from "@barocss/doc-sync/server";

const hub = new DocHub({schema});
// Attach authenticated transport, persistence, and document ownership here.
```

The hub is independent of HTTP. The repository demo attaches HTTP, SSE, and a JSONL log. Treat it as a development server rather than a production service.

## Reconnect and history

Pending changes can be sent after a normal disconnect. Acknowledgments include history pins so GC does not discard data still needed for undo. Fresh-session recovery after lease expiry is not implemented yet. Do not assume old pending edits or undo history can always be restored from a new snapshot.

[Read the state and reconnect contract →](../reference/spec)
