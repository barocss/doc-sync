# Doc Sync State and Synchronization Specification

This document records the current contract and known limits. It does not establish independent review, product integration approval, release approval, or two consecutive weeks of successful operation. `@barocss/doc-sync` is the only public library. Its editor bindings use subpaths of the same library. The demo and benchmarks are private workspaces.

## 1. Scope and Terms

- `Doc`: a replica with token lines and a clock.
- `Item`: a character, node, or line-head token. Deleted tokens remain as ordering references.
- `Ticket`: `{lamport: number, actor: string}`. Compare the Lamport number first, then the actor string if the numbers match. Its key is `lamport@actor`.
- `Change`: a batch of wire operations from one actor. `seq` increases from 1 for each actor.
- `Envelope`: an entry in the server log. `serverSeq` increases from 1 for each document. It contains an edit or a GC frontier.
- Model: `NodeJSON` that interprets stored state through a schema. It is distinct from the stored token list.

Implementation references are `packages/doc-sync/src/crdt/{doc,ticket,history,model}.ts`, `src/sync/{protocol,client}.ts`, and `src/server/hub.ts`. Consumers supply the schema. The core does not embed the demo's specific paragraph or table types.

## 2. State and Order

Each line has a head token and a token list in RGA order. The document body head is `0@~root`. A node's `body`, `rows`, `cols`, and `cell:rowKey,colKey` slots derive their head IDs from the owner ID and slot name. There is no separate operation to create a slot.

Each token has an ID, insertion reference `origin`, kind, original node type `born`, boundary, LWW attributes, a deletion ID set, and a cancellation ID set. Concurrent insertions after the same reference put the larger Ticket first. Causally dependent operations must be applied after their reference token. `Doc.apply` is not a network buffer for dependent operations in arbitrary order.

A token is live only if it is not compacted and has no uncancelled deletion. If A and B both deleted the same character, cancelling only A's deletion does not restore it. For each token and attribute key, the value with the largest write Ticket wins.

## 3. Six Wire Operations

| `t` | Fields | Effect |
|---|---|---|
| `text` | `id`, `origin`, `text`, optional `marks` | Insert each UTF-16 code unit with consecutive IDs. Each token after the first uses the preceding token as its reference. |
| `node` | `id`, `origin`, `type`, optional `boundary`, `attrs` | Insert a node marker. Nodes with the text shape must have a boundary. |
| `del` | `at`, `ids` | Add deletion ID `at` to each target. |
| `undel` | `at`, `cancels`, `ids` | Cancel only the specified deletion ID on each target. |
| `set` | `at`, `ids`, `key`, `value` | Write an LWW value to the target attribute. Character marks, node attributes, `$type`, and internal table keys use this operation. |
| `move` | `at`, `target`, `parent`, `after` | Retain the target's identity and record its placement in a destination flow. `after` is a preceding placement identity or null. |

Repeated delivery of stored insertion IDs and duplicate deletions, cancellations, or attribute writes must leave the state unchanged. This property covers retransmission of valid, identical operations. It does not authorize malicious requests that reuse an ID with different content.

Movement separates content identity from placement identity. The projection evaluates retained placements in total Ticket order, skips moves that would create a cycle, and orders placements after their recorded references. Concurrent edits still target the original content identities. Moves do not splice stored token arrays. Movement records are retained; deletion stability alone does not permit pruning them. Arbitrary text-range cuts, table-axis moves, replacing consecutive live characters with one physical storage item, and a binary wire format remain outside this contract.

## 4. Model and Edit Contract

`Doc.toJSON()` reads live stored state and the schema. It interprets text, flow, grid, and atom shapes, then normalizes list groups, default attributes, adjacent runs, table cells, and spans. It exposes neither deletion records nor compacted tombstones in the model. Content under merged table cells remains stored but hidden. Merging does not collect or move content.

Enter inserts a text-node marker. Concurrent Enter markers that saw the same left and right boundaries are absorbed into one visible block. Enter after observing an earlier Enter has a different boundary and creates a separate block. Paragraph merge deletes the marker when no movement state exists. With movement state, logical join registers retain physical fragments; later split and move operations preserve their identities. Virtual empty blocks and full-grid interpretation are part of model normalization.

Model editing uses `insert`, `delete`, `update`, `split`, `merge`, and `move`. Paths contain model child indexes and positions within text. A move selects one block or group and a destination flow boundary; same-flow destination indexes exclude the moving source. Local edits produce wire operations and normalization edits when needed. Remote changes, undo, redo, snapshot, and reset emit model edit events when an `onModelEvents` subscriber exists. Applying the events to the previous model must produce the next model. If verification fails, a fallback replaces all children. Cost optimizations do not change this contract. If a remote change contains only safe text/del/set operations in at most 8 independent text blocks with fixed structure and paths, only those blocks are read and compared. All targets, paths, and before states are obtained first. The change is applied once, block events are verified and combined, and the callback runs once. No model change means no callback. A ninth block or an existing exclusion selects the full path before the before model is built. Existing exclusions remain for old insertions, dependencies on new tokens, node/undel/move, marker/inline targets, hidden/virtual blocks, and the full paths for undo/redo, snapshot, and reset. If verification fails for any block, partial events are discarded and the full-replacement fallback is emitted. The value 8 is the adopted range supported by measurements and regressions. It is neither a globally optimal threshold nor a character-count limit.

`Doc.toJSON()` reuses paragraph computation through immutable TextBlocks and internal raw models. An actual LWW character-mark write invalidates that paragraph's raw model. Actual structural changes and restoration invalidate block and position caches on affected lines. Table row and column changes affect the parent line containing the table. Visibility caches are fully invalidated to account for descendants and hidden cells. When a line is read again, its existing TextBlock and model are reused if a nonvirtual paragraph has the same marker, type, attributes, character order, and absorbed markers. Mark and inline-attribute writes during pending recomputation also invalidate the corresponding raw model in the previous cache. Block boundaries are recomputed by scanning the entire affected line. GC invalidates all caches. List grouping and table/flow normalization remain in place. Returned model containers are copied, so consumer mutations cannot change internal caches. Public `canonical()` does not use this cache.

### Known Character-Unit Limits

Storage and `Pos.o` use UTF-16 token units. `runsToUnits` in `model.ts` iterates strings into code points. For example, `가😀` has 3 stored character tokens and 2 model Units. Neither is equivalent to a user-visible grapheme. Adapters must convert these units explicitly.

`History.idsOf(text)` records all insertion IDs using the same UTF-16 length as storage. A defect left part of a surrogate pair or following characters when undoing input with supplementary-plane characters. This is fixed. `history-unicode.test.ts` checks insertion undo/redo for mixed strings, multiple supplementary-plane characters, and combining strings, while preserving another actor's input and deletions. This fix does not change the model Unit's code-point coordinates. Long tests with BMP Korean and ASCII do not establish correctness for all Unicode edits.

### Attribute Fields and Child Counts

An `AttrSpec.fields` declaration opts a fixed recursive object into independent per-leaf LWW registers. Omitted patch fields remain unchanged; null resets a leaf or declared branch to defaults. Explicit same-value writes receive new Tickets. Model diffs emit only changed leaves. Fields are supported on text, inline, grid, atom, and cell types, plus stored flow container types that are neither the root nor cell-body flow types. List item fields belong to their text type. Schema validation rejects fields on the root, rows, cell-body flow types, groups, spans, and `markValues`. Other attributes remain atomic. Reserved field keys encode canonical JSON paths; unsafe names and non-JSON field values are rejected. Each leaf has independent undo ownership and survives snapshots.

A flow's `childRules` supplies optional `min` and `max` per allowed child type. Bounds are integers from 0 to 1000; omitted bounds mean zero minimum and no maximum. Group counts follow model groups. Projection retains excess candidates as overflow instead of rejecting concurrent inserts by a mutable count. `doc.overflow(lineKey?)` reads those hidden candidates. Missing minimum children use deterministic editable slots. Required children cannot move or change type; deletion clears their content while retaining identity and attributes. Required cycles through flows and grid bodies are invalid. Cardinality does not add another wire operation.

### Persistent Annotations

Annotations use reserved node/set/del storage outside the document's `NodeJSON`. Public helpers create, update, delete, and read annotation records. Endpoints store left/right token identities and affinity; expansion is `none`, `start`, `end`, or `both`. Data keys are independent atomic LWW values containing safe JSON. A record reports a resolved UTF-16 range, or an explicit `missing`, `hidden`, `cross-slot`, or `compacted` status with no range. An unresolved range is not mapped to a different visible cell. Live annotations pin endpoint identities against GC. Snapshots retain annotation storage; native review UI is an application concern.

## 5. Undo and Redo

`History` records an actor's local edits. Undo creates new inverse operations instead of overwriting an earlier model. Insertion undo deletes its IDs. Deletion undo cancels only the deletion ID created by that record. Other actors' input and deletions remain. Attribute undo writes the previous value only if the current write ID equals the record's post-edit state ID. Redo applies only to targets actually undone and only if the current ID equals the pre-edit state ID. Within one History, consecutive states linked by the exact previous Ticket share a state reference. New Tickets from successful undo and redo update that reference. Consecutive mark changes can therefore be undone and redone in order. If an observed write from another actor changed the current Ticket, that target is skipped. A write not yet received competes with undo under ordinary LWW rules.

Consecutive typing is grouped into one record according to cursor and time-window conditions. The current history depth is 100 and the typing window is 1500ms. History sends the earliest server sequence of a deletion that undo or redo can restore as a GC pin. `clear()` releases these records and the pin.

Movement history checks ownership of the current placement before issuing an inverse move. It does not overwrite a later observed placement by another writer. Nested field leaves and annotation attributes use the corresponding independent attribute history slots. These checks do not protect a competing write that has not yet arrived; Ticket ordering still decides that race.

After movement, split history owns a logical break rather than the existence of the original tail tokens. Its inverse checks the current join write and tail placement. An observed foreign move or an unrecorded same-actor move blocks that inverse. A later recorded move in the same history shares placement state; undoing it restores the ownership needed to undo the earlier split. Join history also shares restored write Tickets, so split/merge undo chains retain every physical fragment.

### 5.1 Collaborative Intent Preservation Cases

[Collaborative intent preservation rules](collaboration-intent.md) define target IDs, observation relationships, and expected intermediate results for deletion, formatting, insertion, and undo. `intent-preservation.test.ts` checks fixed expected models tied to each case ID. Convergence alone does not establish that every human intention is satisfied.

The formatting undo guard requires **an exact match between the current local write Ticket and the post-edit state Ticket of the History Step**. Already received competing writes are skipped. Equal values or actors alone do not link writes. Unrecorded writes by the same actor and separate History instances remain distinct. Unreceived writes compete with undo through ordinary LWW. Undo by the winner writes the value observed before the record; it does not elect a losing write again. `history-format.test.ts` covers 19 fixed regressions for consecutive formatting undo/redo, branches, partial ranges, and preservation of remote writes.

## 6. Validation and Atomicity

`Doc.check(ops)` uses immutable facts rather than current liveness or the currently mutable node type. It checks reference and target IDs, owning lines, original types, slots, and schema compatibility. An earlier creation in the same Change can be a reference for a later operation. A causally valid edit is not rejected solely because its target was deleted.

`DocHub.submit` requires the next `seq` for each actor. An already received `seq` is ignored as a duplicate. A missing `seq` or failed validation is rejected before application. An invalid Change is never partially applied. The demo HTTP layer returns rejection as 409.

These checks do not replace authentication, authorization, request-size limits, or rate limits. Complete validation of hostile JSON shapes and numeric ranges, actor authorization, and operational security approval are separate work.

## 7. Synchronization and Reconnection

The transport must deliver an actor's `Change` and `Ack` messages to the server in the same FIFO order. The server assigns `serverSeq` in acceptance order. Clients ignore server sequences already received within the accepted document epoch. Pending changes wait for a valid hello before sending. Protocol version 2 requires `placement-v1`, `fields-v1`, `annotations-v1`, and `cardinality-v1`, plus a nonempty epoch. Legacy/future versions, missing capabilities, and malformed capability arrays are rejected. Pending edits remain local when the handshake fails.

`Transport.subscribe(since, callback, epoch?)` supplies the last accepted epoch. `hub.hello(since, epoch?)` includes a full snapshot when `since` is zero or the epoch differs. Otherwise it provides subsequent log entries. A snapshot includes deletion-ID sequences and accepted actor sequences. Within one epoch, clients remove accepted pending changes and reapply only unaccepted changes over the snapshot. Presence is separate from the edit log and contains anchor and focus token keys.

A hub creates a fresh epoch on reset and on process restart. The demo does not persist that epoch with its JSONL log. On a changed-epoch reconnect with no pending changes, the client notifies reset hooks, cancels native drafts, clears old history/deletion/GC bookkeeping, and loads the full snapshot. Actor sequence numbers resume from the snapshot's accepted sequence. If pending changes exist, it disconnects with `connectionError` and preserves the old document, history, epoch, and pending changes. It does not blindly replay old-generation edits. This safe stop also applies to a restart that replays equivalent content; an application must provide any manual recovery/export flow.

HTTP SSE uses the `epoch` query parameter. Changes, acknowledgements, and presence send `x-doc-sync-epoch`; beacon leave uses an epoch query. The demo returns 409 for an old epoch before applying those requests, including a request started before reset but completed afterward. Administrative reset/GC keep their existing demo contract. Epoch checks identify a document generation; they are not authentication. Stale stream callbacks are ignored, and synchronous handshake rejection or subscription failure cannot leave a stale cleanup handle installed.

The server currently retains the entire log. There is no recovery contract after removing a log prefix. Demo JSONL replay applies existing Envelopes in order. The new long-run harness creates a fresh in-memory hub from a JSON-round-tripped full log and checks that a fresh peer can continue through a snapshot. This does not test disk-write failure or atomicity under an actual process crash.

## 8. GC and Leases

The frontier is the minimum of the ack sequences and `pin - 1` values of peers that must still be awaited. An offline peer is excluded from frontier calculation after its configured lease expires. The default lease is infinite. The server compacts stable deletions and appends a GC Envelope with that frontier. Clients compact at the same log position.

Compaction discards character content and bookkeeping while retaining ordering references. Consecutive tombstones can merge into spans, and old ID lookup resolves to the corresponding span. Compaction must not change the model. A pinned deletion must not be compacted until the frontier passes its pin.

**Remaining exit condition:** no protocol discards an expired client's old undo records and pending changes and creates a fresh session from a snapshot. Epoch mismatch safely blocks unconfirmed edits; it does not provide lease-expiry recovery. Lease calculation alone does not establish that recovery. CI does not mark this item as passed.

## 9. Verification and Long-Term Observation

The baseline `packages/doc-sync/test/properties.test.ts` checks commutation of independent operations, duplication of the original five wire operations, delayed causal dependencies, model invariance under GC, hidden tombstones, and character-unit boundaries. `move.test.ts`, `nested-fields.test.ts`, `cardinality.test.ts`, `annotations.test.ts`, and `protocol.test.ts` add focused checks for the extended contracts. Existing fuzz, scenario, and PM tests cover wider editing behavior and mirror models. Finite tests are not a mathematical proof for all executions.

The new `.github/workflows/long-fuzz.yml` supports daily runs at 18:23 UTC and manual dispatch. Each of 8 shards uses 8 peers and at least 125,000 accepted wire Ops, for at least 1,000,000 total. Neither Change count nor character count substitutes for Op count. To limit memory growth, the test starts fresh document batches after about 512 Ops. This differs from accumulating one million operations in a single document.

Each shard checks delayed FIFO delivery, duplicate submission, GC, hub replacement by full-log replay, and snapshot connection by a fresh peer. Artifacts record the seed, run time, actual counts, exclusions, source SHA, and Node version. The minimum permission is `contents: read`; no external secret is used. Adding CI does not prove a successful GitHub run. Two consecutive weeks of success require separate inspection of 14 days of actual run artifacts.

Focused local tests:

```sh
node --test packages/doc-sync/test/intent-preservation.test.ts
node --test packages/doc-sync/test/properties.test.ts
node packages/doc-sync/test/long-fuzz.ts --ops 1000 --peers 8 --seed 23 --out output/long-fuzz/smoke.json
```

Run a shard with the CI workload:

```sh
node packages/doc-sync/test/long-fuzz.ts --ops 125000 --peers 8 --seed 1 --out output/long-fuzz/seed-1.json
```

Use Node 22.19.0. The long-run harness is not a `.test.ts` file, so default `npm test` does not automatically run one million operations. Actual Korean OS IME, authentication and operational security, schema migration, log compaction and failure recovery, target-product integration, and release remain outside this stage's completion scope.
