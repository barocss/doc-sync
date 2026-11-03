# One client for local and synchronized editors

Use `Client` for a new browser integration. Supply a schema and pass the client
to an editor binding. The binding creates its own editor host internally.

## Actor identity and display profile

`actor` is a replica ID, not a display name. Each simultaneously active client
needs its own actor ID. Two tabs for the same person can share `profile.userId`
and `profile.name`, but must use different actor IDs. Use a new ID for a new
replica, or restore the saved ID through `Client.fromState()`.

```ts
const client = new Client({
    schema,
    actor: crypto.randomUUID(),
    profile: {
        userId: 'user-42',
        name: 'Alex',
        color: '#2563eb',
        avatar: 'https://example.com/avatars/alex.png',
        kind: 'human',
        metadata: {team: 'Design', locale: 'en'},
    },
});
console.log(client.actor);        // CRDT replica ID
console.log(client.profile.name); // Alex
```

The profile is optional, copied, and read-only. The default name is the actor
ID; the default color is stable for that ID. A bot can use `kind: 'bot'` with its
own replica ID and display profile. These fields describe a participant; they do
not grant document access or editing authority.

In synchronized mode, `client.setPresence({anchor, focus})` uses these profile
defaults. Explicit `name` and `color` in an update still override the defaults.
In local mode, the profile is available to the application, but no remote
presence is sent. See [Cursors and selections](./presence#participant-profiles)
for fields, limits, and rendering responsibilities.

Profiles are not stored in CRDT document or history checkpoints. Pass the
current profile separately when opening saved local state:

```ts
const restored = Client.fromState(savedState, {schema, profile: {name: 'Alex'}});
```

## Start without a server

<!-- client-local-example -->
```ts
import {Client} from '@barocss/doc-sync/client';
import type {Schema} from '@barocss/doc-sync';

const schema: Schema = {
    root: 'document',
    marks: ['bold'],
    nodes: {
        document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
const client = new Client({schema});
client.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
client.undo();
client.redo();
console.log(client.mode, client.model()); // local, document model
```

Without a transport, `Client` constructs a `LocalClient`. It does not construct
a `SyncClient`, allocate a server sequence or outbox, or send acknowledgments.
`client.sync` is null. Local connection status is offline and unsynchronized;
these flags do not disable editing. Presence is empty. `connect()` and
`disconnect()` have no network effect.

The unified module imports synchronization code. It is not a promise of a
sync-free bundle. Use the existing Core `/local` entry when that module boundary
is required. Both entry points use the production TypeScript engine.

## Add synchronization at construction

```ts
import {Client} from '@barocss/doc-sync/client';
import {HttpTransport} from '@barocss/doc-sync/sync';

const actor = 'alice-session-1';
const client = new Client({
    schema,
    actor,
    transport: new HttpTransport('example', actor),
    syncOptions: {ackDelay: 50},
});
client.connect();
client.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
```

Here `schema` is the application schema from the first example. A synchronized
client requires a distinct, valid actor identity and a real transport. The
transport uses the existing `SyncClient`, server protocol, recovery gates and
collaboration rules. See [synchronization](./sync) for server setup.

`edit()` applies, records and queues one action. Its returned operations are
already applied. Do not commit them again. Passing null as the record option
omits that action from History. `model()` returns a borrowed immutable model;
do not modify it.

Mode is fixed at construction. Adding or removing a transport later does not
convert a document, its identities, History or pending work. A disconnected
synchronized client remains synchronized-session state with pending work; it
does not become a local client.

## Keep the binding unchanged

```ts
import {PmBinding, buildPmSchema} from '@barocss/doc-sync-prosemirror';
import {SlateBinding} from '@barocss/doc-sync-slate';
import {LexicalBinding, buildLexicalSchema} from '@barocss/doc-sync-lexical';
import {DocSync} from '@barocss/doc-sync-tiptap';

const pm = new PmBinding(client, buildPmSchema(client.schema));
// Use your native editor instances with the same client:
// new SlateBinding(client, slateEditor)
// new LexicalBinding(client, lexicalEditor, buildLexicalSchema(client.schema))
// DocSync.configure({client})
```

The [editor guides](./editors) provide native view setup and cleanup. Each
binding creates a distinct host origin. Several views on one client share one
document, actor and History. They retain separate selections. They are views of
one participant, not independent collaborators. Use separate synchronized
clients and actors for independent participants.

Selection capture, `undo()`, `redo()`, `clearHistory()`, `historyStatus()`,
`subscribe()`, `status()` and presence use the same surface in both modes.
Bindings handle their native selection through engine anchors. Application code
can use `captureSelection()` and `resolveSelection()` for its own saved ranges.
Observer errors are available in the bounded `notificationErrors` log. A
mutation inside a post-commit observer is rejected; schedule it after delivery.

## Advanced APIs and compatibility

`LocalClient`, `SyncClient`, their existing constructors and host bindings remain
supported. Direct `LocalClient` and `SyncClient` arguments are accepted by all
four client-facing bindings. `Client` and its option and client types are
exported from `@barocss/doc-sync/client` and the `@barocss/doc-sync` root.
`/client` is an export path of the core package, not another package. Import
host helpers from `/client`.

Use `createEditorHost(client)` from Core `/client` for a custom adapter. Create
one host per view and keep it private inside the adapter. Explicit
`createLocalEditorHost`, `createSyncClientEditorHost` and the HostBinding
constructors remain available for applications that own this contract directly.

In sync mode, `client.sync` exposes the actual `SyncClient` for conditional
editing, checkpoint/recovery and compatible schema transitions. Check it for
null before calling sync-only APIs. Use `upgradeOpenEditorSchema(client.sync,
nextSchema, host)` with the [documented rebuild lifecycle](./schema-transition).
For explicit local capture/open, use [Save and open locally](./local-storage).
The client writes no storage and adds no local schema transition.
Finish each view's apply/commit batch before using underlying SyncClient APIs.
Do not mix direct engine mutations with an unfinished host batch.

Dispose editor bindings and native views before ending the client. Local
`dispose()` ends the in-memory document. In sync mode, first settle pending work
and release protected recovery state under its existing rules; terminal
`dispose()` rejects remaining protected work or History. `disconnect()` retains
pending work and History and is the normal temporary stop.

## API ownership and mutation rules

Keep one Client per participant. A binding owns its view and selection; the
Client owns the document, History, pending operations and transport. The
`data` namespace supplies Map/List handles for the fixed data schema. It does
not create another session or select another engine.

Use `client.edit()` for a complete action. Use a custom host's `apply()` and
`commit()` only when the adapter must own a native editor batch. Finish that
batch in its original view before another view edits or direct SyncClient APIs
run. A session draft also belongs to its original view. Sharing one Client does
not transfer a pending batch to another binding.

Observers can read the document during delivery. They must schedule a new
mutation after post-edit delivery. A local data validator can read the Client,
but it cannot start a recursive write. Exceptions must release these guards so
that the next independent action can run. A local validator is not a server
admission policy.

Treat `model()` as a borrowed read-only projection. Use `snapshot()` for a
detached storage snapshot, or `captureState()` for local save/open with History.
These are different contracts. A detached snapshot includes retained hidden
nodes; it is not a rendered document or a local persistence policy.

View subscriptions and framework callbacks remain detachable. Dispose each
view before its Client. Internal helper refactoring does not change operation
formats, selective undo, presence lifetimes, or recovery evidence.

## Run the four-editor demo

```sh
npm ci
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --ignore-scripts --cache /tmp/doc-sync-compat-npm-cache
npm run dev:client
```

Open the printed URL. `?mode=local` shares one client across ProseMirror, Slate,
Lexical and Tiptap. `?mode=sync` creates four independent actors on a queued
in-browser `DocHub` transport. The preview serves static assets. Its synchronized
mode does not exercise HTTP, server persistence or server restart recovery.

Try input, ranges, undo/redo, Insert prefix and Remount. Sync mode also has
Disconnect/Reconnect controls. Refresh and Reset recreate the sample; local
edits are not saved by default. Append `?persist=1` for explicit saved-copy Save/Open
and reload in the local unified route; see [local storage](./local-storage). Use `?size=10000` or `?size=100000` for larger text.

```sh
npm run check:client -- --url http://127.0.0.1:PORT --output output/unified-client/chrome
```

Replace `PORT` with the printed port. See the
[demo source](https://github.com/barocss/doc-sync/tree/main/apps/demo/client)
for the browser checks and measurement limits. The existing
[local host demo](./local-editing#run-the-local-editor-demo) remains available.

## Save and open a local client

```ts
const saved = JSON.stringify(client.captureState()); // Local mode only.
const replacement = Client.fromState(JSON.parse(saved), {schema: client.schema});
```

This preserves the actor, document identities, clock and undo/redo History.
It returns a new client. Your application writes the bytes and replaces views
only after validation succeeds. Pending operations and active composition block
capture. Sync mode retains its separate recovery protocol. Read
[Save and open locally](./local-storage) for errors, schemas and demo controls.

## Verification

The current save/open integration has 1,323 PASS and two platform SKIPs. Fresh Chrome
passes input, selections, History, lifecycle and offline/reconnect checks for
all four editors in both modes, plus explicit saved-copy reload and History.
The preceding Client checkpoint’s 320-input timing run has all medians and
100k cells within the guard, but five local 10k p95 crossings remain. The
[performance report](../performance#unified-client-and-native-input) also retains
one Node Slate tail. This is bounded acceptance; it is not a uniform latency PASS.

## Engine and recovery limits

Optional transport selects session behavior, not an engine. TypeScript is the
only production client engine. Sync mode accepts the existing factory through
`syncOptions.engineFactory`. Local mode currently uses the TypeScript default
and rejects `syncOptions`. There is no `engine: 'wasm'` option. The private
[native Rust SDK and storage-only WASM adapter](./rust) are separate APIs.

Explicit local save/open is available, with an opt-in saved-copy reload demo.
Automatic background saving, local schema transitions, live engine switching and
local-to-sync handoff remain open. Existing Node/MCP durable recovery still uses
its synchronized session and server/GC evidence. Omitting a transport does not
turn that recovery protocol into local persistence.


## Shared Map/List access

Use the same Client for shared records and lists:

```ts
import {Client} from '@barocss/doc-sync/client';
import {createDataSchema} from '@barocss/doc-sync/data';

const client = new Client({schema: createDataSchema()});
client.data.root.set('title', 'Project');
const items = client.data.createList();
client.data.root.set('items', items);
const id = items.push('Design');
items.set(id, 'Review');
client.undo();
```

The data namespace owns no connection or History. Local/sync mode and save/open
use the existing Client methods. ClientOptions.data.validate is optional local
policy. The exact data schema is required: this does not insert Map/List storage
into an arbitrary Document/Graphic schema. Other schemas reject data access
without changing the document. Read [Shared maps and lists](./shared-data) for
server admission, references, schema identity and GC boundaries.
