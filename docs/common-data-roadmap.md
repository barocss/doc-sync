# Common Data Roadmap

Provide common Map and List APIs first. Reuse the existing Doc storage engine, operations, and History. Callers can edit data without defining an application schema.

This first step still uses an internal schema. **Removing schema configuration from the caller API and removing schema dependencies from storage are separate tasks.** A facade does not complete the storage separation.

## Current boundaries

| Area | Current implementation | Common data boundary |
| --- | --- | --- |
| Storage | Tokens, IDs, deletion markers, LWW attributes, and movement in `crdt/doc.ts` | Reuse the existing algorithms. `schema: null` supports storage, application, and GC. |
| Model and editing | `Doc.blocks`, `Doc.toJSON`, `Doc.edit` | These paths use schema shapes, children, and defaults. They are not fully separate from storage. |
| Validation | `Doc.check`, `crdt/schema.ts`, `crdt/fields.ts` | Structural validation and application schema validation still share code. |
| Document | Flow, text, group, and grid models | Preserve paragraph defaults and computed groups. These differ from a general List. |
| Graphic | Container, atom, and text models on the same Doc engine | Empty containers stay empty. This supports the first Map/List implementation. |
| Spreadsheet | Separate operations, journals, and state in SparseSheet and StructuralSheet | These do not currently use the Doc wire format. A common API does not merge the protocols. |
| Presence | Independent store, client connection, and UI packages | Keep transient presence outside persistent CRDT data. Framework bindings use the common store. |

## P1. Map and List APIs

Status: implemented first slice. Focused tests cover local operations, Client/server exchange, concurrent edits, selective undo, and local capture/restore. These checks do not complete every P2 gate.

The existing Client exposes client.data with SharedMap/SharedList handles and a SharedData type. Select the fixed encoding with createDataSchema when constructing Client. Client owns connection, pending edits, History and save/open. The separate unreleased DataClient facade has been removed.

The implementation stores map, list, and entry records through an internal Graphic schema. User keys are attribute values. They are not schema attribute names. Existing nested `fields` only support declared paths and cannot replace a dynamic Map.

Collections are stored at the root and linked through handles. Each collection or entry has a stored `DataId`, separate from its current model index and the underlying CRDT token ID. These links form a reference graph, rather than a physical child storage tree.

### Data contract

1. Map keys are strings. Empty keys, Unicode, separators, and names such as `__proto__` are valid. Read them through Map indexes or safe own-property construction.
2. List indexes are integers in the current visible order. An index is not an ID. Existing entry IDs remain stable when another entry is inserted before them.
3. Values are finite JSON scalars or shared collection handles from the same Client. Build objects and arrays through explicit Map/List operations. Raw objects, arrays, undefined, nonfinite numbers, and other unsupported values are rejected before editing.
4. JSON null is a stored value. It differs from a missing key and from deletion. The encoded value preserves this distinction despite the existing attribute reset convention.
5. A whole object in one LWW attribute would be an atomic value. Concurrent changes to its fields would not merge. The current API instead uses explicit collection references for shared records and sequences.
6. Replacing a string is one LWW write. Character-level collaboration belongs to the Text contract.
7. References must belong to the same Client and point to a visible collection of the correct kind. Shared reference cycles are supported. Raw JavaScript objects, including cyclic objects, are unsupported inputs. There is no recursive JSON serializer for reference graphs.
8. Read results do not expose mutable storage values. Internal indexes and cached records also need protection from mutation through public helper methods.

### Concurrent edits

- Writes to different keys remain independent.
- Writes to the same stored entry use the existing LWW Ticket order.
- Concurrent first writes to one key can create multiple entries. All replicas select one by the same DataId string order. This selection rule differs from the Ticket order for attribute writes. Losing entries remain stored.
- Deleting a key targets all observed entries for that key. This prevents an observed losing entry from appearing immediately after deletion. An unseen concurrent insertion can survive.
- A later set updates the selected entry. It does not replace the entry or change its stable ID.
- Concurrent List insertions use the existing engine order. Replicas must agree on the resulting order.
- Map iteration uses sorted keys. It does not promise JavaScript Map insertion order.

### History and collection lifetime

Each data edit records its operations through the existing History. Updating an entry uses set operations where possible. Replacing an entry through deletion and insertion would change its ID and History semantics. A transaction that groups several API calls requires a separate contract.

History checks the current write ID before restoring an attribute. It does not overwrite a later peer write. Undoing a deletion cancels only that actor's deletion marker.

`createMap()` and `createList()` allocate permanent structural records without an undo entry. Undoing a root assignment or another link can remove reachability through that link. It does not undo the allocation. A retained handle or `getMap(id)` / `getList(id)` can still access the collection and its peer edits. Automatic collection reclamation is not part of this slice.

### P1 acceptance boundary

- Create, read, update, delete, and link collections through the public API.
- Converge across concurrent duplicate keys, independent keys, and List insertions.
- Preserve null, missing values, special keys, stable IDs, and same-client reference ownership.
- Reject unsupported values and invalid indexes without partial edits, notifications, or History changes.
- Preserve later peer register writes through undo/redo. Preserve peer collection data after the last local link is undone.
- Keep the existing Document and Graphic implementation unchanged. This does not establish Spreadsheet protocol integration.

## P2. Synchronization, recovery, and GC

Status: intrinsic server admission delivered through createDataHub. Duplicate
retained IDs, malformed values/references, immutable identity and raw payloads
reject before persistence/application. Conditional/recovery/staged/replay paths
share the guard. Client/server exchange and local state restoration are tested.
Synchronized process restart, resource budgets and metadata-aware GC remain open.

1. Delivered: createDataHub identifies the unchanged fixed storage schema and
   validates raw payloads, all authored values (including LWW losers), retained
   ID uniqueness, references, and private candidate state before append/apply.
   Plain DocHub with only createDataSchema remains generic. Application business
   policy and adapter authentication/quotas are separate from intrinsic encoding.
   Local validation callbacks are not distributed admission policies.
2. Test transport, remote application, reconnect, pending replay, and synchronized checkpoint recovery. Exchanging operations between two Docs is narrower evidence than Client/server validation.
3. Preserve collection IDs, deletion markers, competing entries, and encoded kinds in snapshots. Test continued concurrent editing and History after restore. Local capture/restore coverage is not synchronized checkpoint recovery coverage.
4. Open: metadata-aware data compaction. Guarded data hubs currently disable GC
   and reject replayGc because existing compaction erases identity attributes.
   Retain deleted IDs and hidden reference targets. Generic DocHub GC remains
   unchanged. Define lifetimes for losing entries/unreferenced graphs and durable
   identity reservations before re-enabling data compaction.
5. Define version compatibility. Changes to the internal schema affect its fingerprint and old checkpoints.

Record local operation, Client/server, checkpoint, and GC results separately. One passing result does not establish all four.

Client.data is a lazy access layer, not another client. It checks exact encoding
schema identity and rejects other domain schemas without mutation. Cache and
local data policy belong to one Client. Server admission and fixed schema
fingerprint remain independent of this facade migration.

## P3. Reuse Text

Status: follow-up API work. Do not create another Text CRDT engine.

Reuse the existing text shape, character tokens, deletion markers, marks, anchors, and History. A regular string remains a scalar. An explicit Text value identifies collaborative character editing.

Keep the existing API if it meets the product need. Add a thin Text facade only when callers need insert, delete, format, or anchors without schema configuration. Match the existing contracts for UTF-16 offsets, surrogate pairs, grapheme boundaries, mark inheritance, and deleted anchors. Text references in Map/List must use stable IDs.

## P4. Separate storage and schema validation

Status: design and migration work remain. P1 does not complete this stage.

Storage owns IDs, order, value registers, deletion markers, movement, snapshots, and GC. Structural admission checks operation shapes, reference integrity, immutable birth facts, and resource limits. Application validation checks allowed nodes, attributes, values, and child rules. Document and Graphic projection and default creation belong above storage.

1. Inventory schema access in Doc.check and Doc.edit. Assign each dependency to storage, structural admission, or model projection.
2. Specify explicit common Map/List/Text kinds and their admission rules. Do not simply remove the internal Graphic schema.
3. Define wire capabilities and snapshot versions. Readers that cannot handle new kinds must reject them explicitly.
4. Verify convergence across admission and application. Receive decisions must not depend on replica-specific visible state.
5. Provide migration tools and regression evidence for existing Document/Graphic snapshots and History.

Completion requires common APIs, remote admission, snapshot recovery, History, and GC without an application schema. Products that use schemas must preserve their rules through upper-layer validators.

## P5. Product adapters

Status: product-specific decisions and validation remain.

- Document preserves paragraphs, rich text, tables, and required-child rules. A general JSON List does not replace these semantics.
- Graphic can connect object IDs, order, nested collections, and references to the common layer. Graphic validators retain shape and attribute rules.
- Spreadsheet preserves stable row/column IDs, sparse cells, range deletion, and its journal and recovery contracts. Replacing cells with general Maps requires performance, memory, and wire evidence.
- Presence stays outside persistent values, snapshots, and undo. SolidJS and other framework bindings connect subscriptions, cleanup, and the common UI store.

Each product needs its own compatibility, migration, and performance evidence. This roadmap is not release approval or proof that all products have passed.
