# Shared maps and lists

Use Client.data for shared key/value records and ordered lists. The existing
Client owns local/sync mode, transport, pending changes, History and save/open.
The data namespace supplies collection handles only. It creates no second
Client, connection, subscription or History.

The name data identifies Map/List collection access, not the Client's complete
document model or an engine choice. Keep this namespace fixed and define
application keys and collections inside it. Schema editing still uses
client.edit(), and document reads still use client.model(). There is no separate
Client class or configurable property name for each application data shape.

Select the fixed encoding with createDataSchema() when constructing Client.
This avoids defining an application schema, but storage still uses the same
internal graphic/container schema. Optional local business validation is
separate. Complete storage/schema separation remains roadmap work. Existing
DocumentSchema, GraphicSchema and editor bindings keep their behavior.

client.data is stable and lazy. It accepts only the exact data schema identity.
Access on another document/graphic schema rejects without editing or converting
that document. A stale namespace or handle also rejects after a schema change.

## Create local data

```ts
import {Client} from '@barocss/doc-sync/client';
import {createDataSchema, SharedList, SharedMap} from '@barocss/doc-sync/data';

const client = new Client({schema: createDataSchema(), actor: 'local-user'});
const data = client.data;
data.root.set('title', 'Project');
data.root.set('archived', false);
data.root.set('optional', null);

const tasks = data.createList();
data.root.set('tasks', tasks);
const first = tasks.push('Design');
const second = tasks.push('Review');
tasks.move(second, 0); // Destination index in the resulting list.
tasks.set(first, 'Design review');

const settings = data.createMap();
settings.set('theme', 'light');
data.root.set('settings', settings);

const shared = data.root.get('tasks');
if (shared instanceof SharedList) console.log(shared.get(first));
if (data.root.get('settings') instanceof SharedMap) console.log(settings.get('theme'));
```

A value is null, boolean, finite number, string or a SharedMap/SharedList owned
by this Client. Build nested structures through explicit shared collections.
Plain objects, arrays, undefined, nonfinite numbers and foreign-client handles
are rejected before writing. Shared collection references can form a graph,
including cycles. A raw cyclic JavaScript object is unsupported.

Strings are atomic values here. Replacing a title replaces that complete value;
there is no character-level merge inside a Map string. For collaborative text,
continue using a text node in the existing document schema and its editing API.
This delivery does not add another text engine or a Text facade.

## API

| API | Behavior |
| --- | --- |
| data.root | Shared root Map |
| data.createMap(), data.createList() | Allocate a stored collection and return its handle |
| data.getMap(id), data.getList(id) | Resolve a visible collection by stable ID and kind |
| map.get(key), map.has(key) | Read or check a string key; missing is distinct from null |
| map.set(key, value), map.delete(key) | Write a value or remove all observed candidates for that key |
| map.entries(), map.size | Sorted visible keys and their projected winners |
| list.insert(index, value), list.push(value) | Insert and return a stable entry ID |
| list.get(id), list.at(index) | Read by stable ID or current visible position |
| list.set(id, value), list.delete(id) | Update or remove that entry |
| list.move(id, index) | Move that entry to its index in the resulting list |
| list.entries(), list.length | Visible ordered entries and count |
| client.undo(), client.redo(), client.historyStatus(), client.clearHistory() | Existing actor-owned History |
| client.subscribe({update}) | Observe changes; returns unsubscribe |
| client.captureState(), Client.fromState(state, {schema, data?}) | Existing local save/open contract |

IDs are opaque data:UUID strings, not current array indexes or exposed CRDT
character-token IDs. Reacquire a remote handle through the receiving Client.data;
a handle from a different client is rejected even when both replicas share the
same document. Map traversal sorts keys; it does not mimic JavaScript Map's
local insertion order. List.at follows array-style indexing, including negative
indexes. Insert and move require explicit valid integer positions.

A cached projection builds ID/key indexes once per document revision. Repeated
Map.get/has and ID lookup reuse that projection; the first read after a revision
still clones/indexes the full visible model. This is not an incremental
large-data performance guarantee. Resource limits, retained records and cache
costs remain acceptance items in the common-data roadmap.

## Concurrent editing and undo

Different map keys merge independently. A value or shared reference is stored
as one atomic assignment, so concurrent writes cannot mix a reference kind and
another writer's payload. Writes to the same existing entry use the engine's
existing LWW registers and selective History.

If peers first create the same key concurrently, multiple entries can exist.
The facade chooses the lexicographically largest stable DataId. This projection
rule is separate from the Ticket order used for writes to an existing entry.
Losing entries remain stored. Delete targets all candidates currently observed;
an unseen concurrent insertion may later appear. Undo cancels only the actor's
own effect under existing History rules and preserves a later peer value write.

List inserts/moves reuse the existing ordering and placement rules. Stable entry
IDs keep a reference attached to its item after inserts or moves elsewhere.
Own undo/redo and peer edits use the same Client History as document editing.

Collection allocation is structural and is not recorded as an undo unit.
Linking a collection with map.set or list.insert is undoable. Undoing its last
link can make it unreachable from data.root, while getMap/getList(id) still
resolves the allocated collection and its peer-edited content. Automatic
collection deallocation and tracing GC of unreferenced collection graphs are
not implemented. Do not equate an unreachable link with data deletion.

## Add local application validation

```ts
import {Client} from '@barocss/doc-sync/client';
import {createDataSchema} from '@barocss/doc-sync/data';

const client = new Client({
  schema: createDataSchema(),
  actor: 'validated-user',
  data: {
    validate(write) {
      if (write.kind === 'map' && write.operation === 'set' &&
          write.key === 'priority' &&
          !(typeof write.value === 'number' && write.value >= 0 && write.value <= 5)) {
        throw new Error('priority must be between 0 and 5');
      }
    },
  },
});

client.data.root.set('priority', 3);
// client.data.root.set('priority', 9) throws before committing a write.
```

The callback receives an immutable write description. Throw to reject the
mutation before its operations enter the Client. Callback reentrant mutations
through the data facade are rejected. The callback is trusted application code;
raw client.edit is an advanced model operation outside this data write policy.
During a validator callback, mutating data/Client methods reject reentry; reads
remain available. The policy belongs to the Client and cannot be replaced by
accessing another namespace. Supply it again when opening saved state; callbacks
are not persisted.
Collection allocation has no value-policy callback and is non-undoable.

This validator applies to local API writes. It is not server authorization or
a distributed schema identity, and it does not enforce remote business rules.
Use createDataHub below for authoritative intrinsic encoding checks. The fixed
encoding Schema alone does not enforce every collection invariant.

The facade also checks values, IDs and references while indexing applied data.
A known retained hidden collection remains a valid reference: map.get returns a
handle, while operations on that hidden collection reject until it becomes
visible again. Other map keys stay readable. A queued peer reference is not
invalid merely because its target is temporarily hidden.

## Connect to the existing transport

```ts
import {Client} from '@barocss/doc-sync/client';
import {createDataSchema} from '@barocss/doc-sync/data';
import {HttpTransport} from '@barocss/doc-sync/sync';
import {createDataHub} from '@barocss/doc-sync/server';

// Server configuration; your HTTP/SSE adapter still owns its routes.
const hub = createDataHub();

// Browser configuration.
const client = new Client({
  schema: createDataSchema(),
  actor: 'browser-a',
  transport: new HttpTransport('shared-data', 'browser-a', serverOrigin),
});
client.connect();
client.data.root.set('title', 'Shared project');
```

Wait for the existing Client's synchronization lifecycle before reading remote
content. client.sync exposes its SyncClient when present. Existing epoch/schema
negotiation, pending edits and advanced
recovery APIs retain their own contracts. This guide does not replace the
server adapter or add durable storage. Local captureState() is memory-only mode;
use the existing SyncClient recovery APIs for synchronized recovery.

Document and data models have different schema identities. Accessing client.data
does not reinterpret an existing document Schema. No automatic
Document/Graphic/Spreadsheet migration is
performed. Spreadsheet still has a separate sparse/structural wire contract.

## Save and open through Client

```ts
const saved = JSON.parse(JSON.stringify(client.captureState()));
const reopened = Client.fromState(saved, {schema: createDataSchema()});
const tasks = reopened.data.root.get('tasks');
reopened.undo();
reopened.redo();
```

The existing local state format, IDs, schema fingerprint and actor-owned History
are unchanged. Synchronized captureState remains governed by the established
SyncClient recovery contract. Reading client.data does not capture/save state.

## Migrate the unreleased facade

The separate DataClient and DataClientOptions exports have been removed.
Construct Client with schema:createDataSchema(), use client.data for root and
collection operations, and keep connect/disconnect/undo/redo/captureState/dispose
on Client. Replace the old top-level validate option with data:{validate}.
Restore through Client.fromState with the same schema and optional data policy.
There is no new wrapper constructor or public attachment factory.

## Server data admission

Use createDataHub from @barocss/doc-sync/server for Map/List data received from
clients. A plain new DocHub({schema:createDataSchema()}) still provides generic
Schema checks; it does not automatically enable these data semantics.

The factory validates raw finite/plain JSON and actor/sequence/operation shape
before cloning. Then it validates an owned change against retained identities
and a private candidate document before calling onAppend or changing live state.
Rejected batches leave the document, clock, log, accepted actor/server sequence,
receipts, persistence callback and broadcasts unchanged. A corrected request can
reuse the rejected actor sequence. An exact retry of an accepted request keeps
the existing idempotency contract.

| Checked invariant | Rule |
| --- | --- |
| Data ID | Valid opaque ID; unique across retained live/deleted records; immutable after birth |
| Entry identity | Stored key, node kind and Map/List membership semantics cannot be rewritten |
| Value | One explicit tagged finite scalar or collection reference; raw malformed losing writes also reject |
| Reference | Root Map or a known retained collection of the declared kind; batch forward references allowed |
| Concurrent key | Different entries may share a key; the existing deterministic winner rule remains |
| Lifecycle | Conditional edits, recovery submissions, staged persistence and change replay use the same guard |

Entry births require an explicit tagged value, including {scalar:null}. This
encoding rule is stricter than the broad storage Schema's defaults. An omitted
empty map key remains valid because the existing compiler omits that default.
Malformed explicit keys, values and reference kinds cannot be hidden by model
normalization, deletion or a losing LWW write.

The fixed data Schema fingerprint is unchanged. Other DocHub users keep their
existing Schema, dynamic transition, collaboration and History behavior. The
new optional validatePayload/validateChange HubOptions are trusted read-only
server policies; do not mutate hub state in those callbacks. The data factory
installs both policies and locks its storage schema. Do not directly mutate or
replace hub.doc to bypass the normal admission paths.

**Data GC is deliberately disabled in this guarded factory.** gc() returns null;
replayGc() rejects. Existing generic DocHub GC is unchanged. Current compaction
erases identity attributes needed to reserve deleted IDs and validate retained
references. Until a metadata-aware compactor exists, deleted records stay stored
and storage grows. Compacted legacy data logs cannot be adopted transparently.
Replay change records through submit into a fresh guarded hub. Reset starts a
new epoch and a fresh identity domain; it is not a compaction mechanism.

The factory checks intrinsic Map/List encoding and references. It does not
serialize or enforce your local validate(write) business callback. Authentication,
room/actor binding, request-size/rate limits, durable storage and mutation
serialization remain adapter responsibilities. The existing onAppend and
prepareDurableMutation contracts apply; persist before reporting acceptance.
A raw request body must reach these guarded methods before it can affect the
accepted document. Server restart and storage compaction require their own tests.

## Read storage without exporting History

Client.snapshot() and LocalClient.snapshot() return a detached document Snapshot,
including retained hidden nodes and current pending edits. They are safe during
read notifications and do not record History or emit another update. Changing
the returned object cannot change the client. This supports retained-reference
lookup without exporting a local checkpoint inside an observer.

A snapshot is not captureState(): it omits History and transport recovery proof.
Continue using the established local state or synchronized recovery contract
when persistence/recovery is required.

## Separation roadmap

| Stage | Scope |
| --- | --- |
| P1 | Caller-facing Map/List APIs, separate local value policy, regression proof |
| P2 | Authoritative semantic admission, remote limits, restart/checkpoint/GC and performance gates |
| P3 | Optional Text facade reusing existing text nodes; no second text CRDT |
| P4 | Extract storage invariants, schema validation and domain projection into independent layers |
| P5 | Migrate selected domain integrations with compatibility and performance evidence |

P1 does not complete P4. Domain schemas continue to describe valid application
data; primitive operations alone cannot enforce normalized rotations, valid
references or spreadsheet formula semantics. The repository's
[Common Data Roadmap](../reference/common-data-roadmap)
tracks the boundaries and completion conditions. The source is maintained at
docs/common-data-roadmap.md and copied into this reference during the docs build.

## Read cost and cached projections

After the access layer has indexed the current document revision,
`list.at(index)` reads the selected cached entry and decodes that value only.
It supports the existing negative-index behavior and returns a fresh entry
wrapper. `map.size` reads the number of distinct keys from its cached key index.
Competing stored entries for one key still count as one key.

These improvements do not make every read constant time. The first read after
a revision change rebuilds and validates the visible projection. That work
scales with the number of stored visible records. References to hidden targets
can also require a retained-snapshot scan. `entries()` constructs complete read
results, and Map iteration sorts keys. Avoid repeated full enumeration when you
need one List entry or a Map count.

The access layer still checks schema identity and collection visibility before
using its cache. A retained handle can refer to a hidden collection without
making that collection visible or permitting new edits to it. The cache does
not replace server admission, History, or garbage-collection rules.
