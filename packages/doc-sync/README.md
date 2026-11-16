# @barocss/doc-sync

Dependency-free TypeScript document CRDT, local/synchronized clients, schema
operations, editor hosts, server primitives and ephemeral Presence. Editor
bindings live in separate `@barocss/doc-sync-*` packages.

## Status and installation

This is a **private, unpublished `0.0.0` workspace**, not an npm release.
Use Node.js **22.18+**. From the repository root:

```sh
npm ci
npm run build
npm run check:packages
```

To try the compiled core in another ESM project, run `npm pack` from this package
directory, then install the resulting `barocss-doc-sync-0.0.0.tgz` by its local
path. `prepack` rebuilds outputs. No registry publication or version change is
performed. The package contains `dist` JavaScript, TypeScript declarations, this
README and the engine contract; no external runtime dependencies or editor peers
are required. [Full local consumer recipe](https://barocss.github.io/doc-sync/guide/packages.html).

## Quick start: local editing and explicit save/open

Save this as `example.ts` in a built repository or an ESM consumer with the local
tarball installed; run `node example.ts` on Node 22.18+.

<!-- readme-example:local -->
```ts
import assert from 'node:assert/strict';
import {Client} from '@barocss/doc-sync/client';
import type {Schema} from '@barocss/doc-sync';

const schema: Schema = {
    root: 'document', marks: ['bold'],
    nodes: {
        document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
const client = new Client({schema, actor: 'example'});
client.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
const first = client.model().children?.[0]?.runs?.[0];
assert(first && 'text' in first);
assert.equal(first.text, 'Hello');
client.undo();
assert.deepEqual(client.model().children?.[0]?.runs, []);
client.redo();
const saved = JSON.parse(JSON.stringify(client.captureState()));
const restored = Client.fromState(saved, {schema});
assert.deepEqual(restored.model(), client.model());
restored.undo(); // History survives a local save/open.
restored.dispose();
client.dispose();
```

The example does not persist to disk or start a server. Your application owns
storage writes, retention and profile restoration. `captureState()` is local-only
on the unified client; synchronized recovery has a separate proof/checkpoint
contract. Never reuse an actor ID in simultaneously active independent replicas.

## Public entry points

| Import | Purpose |
| --- | --- |
| `@barocss/doc-sync` | `Doc`, `History`, schema/model types, operations and `Client` |
| `/client` | `Client`, `BindingClient`, `createEditorHost` |
| `/local` | `LocalClient`, `LocalEditorHost`, `createLocalEditorHost` |
| `/sync` | `SyncClient`, browser `HttpTransport`, synchronization APIs |
| `/server` | `DocHub`, server protocol and `createDataHub` |
| `/node` | `NodeHttpTransport` for Node HTTP/SSE consumers |
| `/editor` | Editor hosts, input and schema-transition support |
| `/engine` | Engine contracts and TypeScript client engine factory |
| `/presence` | Ephemeral participant state and bridge |
| `/data` | `createDataSchema`, SharedMap/SharedList and data types |

The root and `/sync` do not import editor bindings. `/client` does include sync
code even in local mode; use `/local` when the narrower module boundary matters.
There is no core `/slate`, `/lexical`, `/tiptap` or `/prosemirror` entry.

## Synchronization and lifecycle

For a browser served with compatible document routes, reuse the schema above:

```ts
import {Client} from '@barocss/doc-sync/client';
import {HttpTransport} from '@barocss/doc-sync/sync';

const actor = crypto.randomUUID();
const client = new Client({
    schema,
    actor,
    transport: new HttpTransport('example-document', actor),
});
client.connect();
// Mount a binding and edit through Client or that binding.
// When the document owner is finished, after handling pending/recovery state:
client.dispose();
```

This fragment requires an application server; `DocHub` is not an HTTP server by
itself. See [server and sync setup](https://barocss.github.io/doc-sync/guide/sync.html).
Mode is fixed at construction. Disconnection does not turn a synchronized client
into a local one or guarantee durability. A single client shared by views is one
actor with one History; distinct collaborators need distinct clients/actors.

`edit()` applies, records and queues once. Its returned operations must not be
committed again. `model()` is borrowed immutable state. `subscribe(observer)`
returns an unsubscribe function; do not mutate synchronously from post-commit
notifications. Dispose view bindings first and their shared client only when its
owner closes. [Client contract](https://barocss.github.io/doc-sync/guide/client.html).

## Schema and supported boundaries

- Document schemas describe flow/text/atom/group rules. Graphic schemas add stored
  containers; existing text bindings reject graphic schemas and do not render canvases.
- Compatible additive schema changes use the existing transition protocol. Read-only
  preflight reports compatibility and handshake requirements; it does not migrate
  incompatible documents or prove renderer support.
- Shared maps/lists require `createDataSchema()` and `createDataHub`. Arbitrary schemas
  are not converted by `client.data`; data GC remains disabled. Strings in shared data
  are atomic, not collaborative text.
- Spreadsheet APIs are experimental and are not synchronized through Client/DocHub.
- The TypeScript engine is the supported client implementation. The experimental Rust
  SDK and storage-only WASM APIs do not supply a selectable Client backend.
- Presence and participant profiles are display state, not authorization. The host
  owns authentication, permissions, routing, durable storage and deployment security.
- Low-level `Doc.apply()` replication alone does not implement network sequencing,
  reconnect recovery, persistence or GC protection.

See [schema guide](https://barocss.github.io/doc-sync/guide/schema.html),
[schema transitions](https://barocss.github.io/doc-sync/guide/schema-transition.html),
[shared data](https://barocss.github.io/doc-sync/guide/shared-data.html), and
[ENGINE-CONTRACT.md](./ENGINE-CONTRACT.md).

## Verification and contributing

From the repository root, run `npm run check:readmes`, `npm run typecheck`,
`npm test --workspace @barocss/doc-sync` and `npm run check:packages`.
README examples are executed by the first command; package checks test compiled
exports and isolated local consumers. Neither constitutes long-duration load,
real-model or browser/IME qualification. See the
[documentation maintenance guide](https://barocss.github.io/doc-sync/guide/documentation.html).
