# Graphic canvas runtime

Run from the repository root with Node 24:

```sh
node apps/demo/graphic/start.mjs
```

Open `http://127.0.0.1:5420/`. Set `GRAPHIC_PORT` to change the port. The build bundles the public doc-sync APIs and PixiJS into `output/graphic-demo/main.js`. The build also writes a metafile and SHA-256 input/output hashes in `output/graphic-demo/build-proof.json`. The server binds to loopback. It does not use credentials or the existing demo server's data directory.

## State and transport

Each view owns a separate `Client`, actor ID, history, presence, and public `HttpTransport`. The browser uses real HTTP POST and SSE. “Hold incoming” queues only inbound events (maximum 2048); outbound edits still reach the server. Disconnect and reconnect use the public client methods. Selection and cursor data use presence metadata. They do not create document operations.

The HTTP server stores rooms **in memory only**. It has no restart recovery or durable storage. It allows at most 16 rooms per process. POST bodies are limited to 8 MiB. The room endpoint accepts only `sample`, 100, 1000, or 5000 objects and never resets an existing room. A conflicting requested size returns 409. Use a new room name for each performance run.

`POST /api/graphic/rooms` accepts `{doc,count}`. `GET /api/docs/:doc/state` exposes the local test oracle. The stream, change, ack, presence, and leave endpoints use the public protocol version and require compatible schema identity. POST operations also require the current epoch. The hub validates CRDT changes before it applies them.

Labels use plain text. The private canvas fixture has no bold or italic marks.

## Scene operations

The session builds a revision-cached index from public CRDT blocks and the client model. IDs are CRDT marker keys. Every action resolves the ID against the current visible index. Missing or hidden objects fail before an edit. Moves keep IDs. Reparent applies the local transform before the move in one batch. It preserves the world transform. Drag changes only local x and y. Peer fill, rotation, and scale remain separate fields.

`lookup` and `benchmarkLookup` report cached lookup cost. `reindexMs` reports the last complete scene index rebuild. `editMs` reports synchronous client editing, including history and enqueue work. `remoteMs` reports client processing from beforeEvent to update. View notifications run in a later microtask, so these values exclude view refresh, index rebuild from view reads, and rendering. They do not measure the engine alone or complete GPU work. The session still uses the public full model and the engine's full staging document. These metrics do not claim incremental full-graph editing or rendering. The UI reports renderer work separately.

Tests:

```sh
node --test apps/demo/test/graphic-session.test.ts apps/demo/test/graphic-http.test.ts
```

The HTTP test uses public `NodeHttpTransport` with a real loopback server and SSE. The session tests use deterministic in-memory transport to control stale concurrent changes. These are separate proof boundaries.
