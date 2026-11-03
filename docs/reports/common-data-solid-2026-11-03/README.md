# Shared Map/List API and SolidJS Presence

This delivery adds Core /data and an optional SolidJS Presence package. It is
the first common-data API slice, not complete removal of schema dependencies
from storage. Existing CRDT, Client, Schema validation, History, protocol and
local-client engine files are unchanged. The ten library candidates remain
private0.0.0. No commit, push, npm release or hosted docs deployment occurred.

## Roadmap and first slice

P1 supplies DataClient, SharedMap and SharedList on the existing Client engine.
P2 covers authoritative semantic admission, resource limits, synchronized
recovery/restart, GC and performance gates. P3 optionally provides a thin Text
facade if needed, reusing existing text nodes and character operations. It does
not build a second Text CRDT. P4 extracts storage invariants, structural
validation, application Schema and model projection into distinct layers. P5
migrates selected product adapters with compatibility and performance evidence.

The maintained roadmap is docs/common-data-roadmap.md, copied into the docs
reference by prepare-content. Read apps/docs/src/guide/shared-data.md for the
actual API and boundary. Caller-facing schema-free data editing is not a claim
that the storage engine has become schema-independent. Document/Graphic remain
on Doc; Spreadsheet's standalone sparse/structural wire is not merged here.

## Data API

DataClient uses a fixed createDataSchema() graphic/container encoding. The
caller supplies no application Schema. Optional validate(write) is a local
application policy, separate from encoding; throwing rejects before mutation.
Unsupported values and reentrant facade writes reject atomically. The underlying
client remains available for its established advanced contracts.

The root is a SharedMap. createMap/createList allocate non-undoable structural
collections, which can be linked through other collections. Values are finite
scalars or same-client handles. Null is distinct from missing/deleted. Plain
objects/arrays are unsupported; build shared structure explicitly. References
can form cycles. Immutable opaque data:UUID IDs are distinct from model indexes
and CRDT character-token IDs. Value/reference kind and payload are one atomic
assignment. A remote handle must be reacquired through the receiving DataClient.

Different keys merge independently. Existing entry updates use existing LWW
register/History rules. Concurrent first writes can leave competing entries;
lexicographically largest DataId is the visible winner. Losing entries remain
stored. Delete removes all observed candidates; an unseen concurrent insertion
can survive. Map iteration sorts keys. Lists expose stable entry IDs and reuse
existing insert/delete/move ordering, with move destination measured in the
resulting list. Own undo/redo preserves later peer value writes. Undoing a last
link removes reachability through that link but retains the collection and peer
content through getMap/getList(id). Collection allocation is non-undoable and
automatic collection-graph reclamation is not implemented.

Local captureState/fromState reuses the existing local Client format and
History. Sync mode uses existing Transport, epoch/schema negotiation and pending
queues; captureState remains local-only. This delivery tests queued-pending
reconnect, not process/server restart recovery for data collections. Existing
Schema data cannot be reinterpreted as this encoding through constructor injection.

IDs/key candidates use cached indexes. The first read after each revision clones
and indexes the full visible model; later lookup reuses it. This is not an
incremental large-data performance qualification. Stored values, paths and
candidate arrays are frozen to prevent cache mutation. Malformed encoded values,
duplicate IDs, dangling references or mismatched kinds fail closed on reads.
This occurs after underlying application; it is not authoritative admission.
The fixed Schema alone cannot enforce all data semantics. Production remote
admission remains P2; a local callback is neither authentication nor a distributed
schema identity.

Map strings are atomic values. Existing document text nodes still provide
character-level concurrency, marks, anchors and undo. No Text facade was added.

## SolidJS

@barocss/doc-sync-presence-solid provides PresenceProvider, PresenceOverlay,
AvatarStack, CursorLayer, SelectionLayer, DraftPreview, createPresence/usePresence
and usePresenceStore. Owner-scoped accessors follow reactive store replacement;
cleanup releases old subscriptions and UI resources. Server rendering uses no
DOM or subscriptions. Solid's native browser/server conditions select behavior.
The renderer, target projection, caret/selection/draft semantics and transport
come from the same shared Presence packages as DOM/React/Vue/Svelte.

The playground now mounts five actual framework surfaces and five ProseMirror
views. It still uses an in-page memory DocHub transport. Graphic/Spreadsheet
surfaces are projection fixtures, not complete domain editors. SolidJS1.9.18
was exercised; the declared1.9.x peer range is not a version-matrix qualification.

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Full workspace | 1,588 cases /1,586 PASS /2 expected platform SKIP /0FAIL | Core1146, Lexical7, React2, Solid3, Svelte2, UI4, Vue2, Slate4, Bot53, Demo141, Docs43, MCP181/179PASS |
| Focused data implementation/review | 29/29 PASS | Part of core/full count, not extra unique tests |
| Real HTTP/SSE data | 3/3 PASS | NodeHttpTransport through actual loopback server and DocHub/createDataSchema |
| Solid SSR/lifecycle | 3/3 PASS | SSR, source replacement, disposal, named layer/options updates |
| Desktop Chrome | 27/27 PASS, errors0 | Five real UI framework mounts; independent native rectangles tolerance1CSSpx |
| Root TypeScript/build | PASS | All ten package builds and final no-emit root check |
| Package artifacts | Ten tarballs /12 isolated consumer cases PASS | Includes data runtime/types, Solid SSR imports, unrelated peer absence and original binding checks |
| Release preparation | PASS | Ten temporary0.1.0 versions, compatible peers, independent Slate0.1.1; source versions/lock unchanged |
| Docs | 43/43 PASS;55pages /2,590internal links | English/local-path checks PASS |

Data tests include six three-peer delivery permutations, competing/new keys,
keywise updates, list stable IDs/concurrent insert+move, selective undo/redo,
missing/null/empty/dangerous keys, explicit shared references/cycles, local
restore, invalid policy/value/index rejection, cache mutation guards, malformed
remote decoding and a seeded150-operation array oracle. Review found and fixed
mutable candidate-array exposure, malformed encoded reference/value handling
and publicly exposed restore-client injection. Existing actor ID restrictions
remain unchanged; IDs themselves use actor-independent UUIDs.

Actual HTTP/SSE tests assert protocol/epoch/schema headers, keywise+same-key
convergence, list moves with peer value edits, selective undo/redo, queued
pending reconnect and no accepted sequence/request after local rejection.
Initial harness assumptions were corrected: a no-op selective undo need not
produce a new sequence, and captureState is local-only. Failed attempts/logs
are retained separately; final data-http-test-final.log and hashed receipt pass.
This does not complete P2 adversarial remote admission or durable restart/GC.

Chrome uses the same final bundle for all five frameworks:
e693385e791ac6472938565e8c4df4a7f9256b14dbff5b9236b91904f893a6ce.
Eleven source hashes and actual HTTP source hashes match the checkout. Trusted
Hangul/emoji draft, forward/backward character selection+caret, native selection,
font/color, null projection, three domain fixture geometry, hover names,
confirm1/cancel0 accepted edits, own undo/redo retaining peer edit, reconnect and
mount/subscription cleanup pass. Browser worker and root visually inspected
screenshots. Native OS IME composition and mobile are NOT_RUN. Browser memory
transport and Node HTTP proof are separate; no WAN/large-data/latency SLO claim.

## Evidence and run

New docs: guide/shared-data.md, reference/common-data-roadmap via source copy;
Presence/package/release/API/roadmap/overview guides updated for ten packages
and SolidJS. The /data source folder is explicitly unignored in root .gitignore;
the broad data/ runtime rule must not exclude this public source.

Run npm ci and npm run build. Import DataClient from @barocss/doc-sync/data.
For UI, npm run dev:presence; set PRESENCE_URL to the printed address for
npm run check:presence. Final retained Solid preview:
http://127.0.0.1:55787 (agent-owned exec33962, kept for manual review).
Owned proof Chrome was closed. User tabs, drafts, History and inherited WIP
were preserved. Previous49849 service/attempt5 evidence remain intact. The
preview launcher initially rewrote default bundle artifacts; prior bundle/map
and metafile were restored byte-identically using the untouched previous
service/sourcemap, and new artifacts were saved in attempt6 instead.

Evidence archives include full/focused logs, browser receipts/screenshots/new
bundle/map/metafile, HTTP attempts/receipt and package/release receipts.
evidence-index.json hashes each archive. source-seal.json pins current source,
report and final Solid bundle. Earlier reports remain unchanged.
