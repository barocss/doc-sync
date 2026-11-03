# Pre-application Map/List server admission

Use createDataHub() from @barocss/doc-sync/server to enable intrinsic shared-data
validation before persistence and live application. The factory, fixed encoding
schema and pure validation module are independent of the DataClient facade.
Existing generic DocHub users keep their Schema/GC behavior. This delivery does
not remove DataClient or create another client/CRDT algorithm.

DataClient exists to select the internal encoding and supply indexed Map/List
handles over one Client. It delegates connection, pending changes, editing and
History to that Client. A future Client-plus-view API can reuse this validator;
no API rename or automatic model migration was made here.

## Admission contract

The guarded hub validates plain finite JSON descriptors before clone/stringify,
then validates the owned change before onAppend or any live mutation. Actor and
sequence shape and supported operation tags are checked. Accessors, unexpected
prototypes, symbols and hidden properties cannot be normalized away by cloning.
Optional validatePayload/validateChange hooks are trusted read-only server
policies; legacy hubs incur no candidate staging without an installed policy.

A pure retained-state index reserves each opaque DataId across visible and
hidden records. IDs, birth kind, entry key and Map/List membership semantics
cannot be rewritten. A duplicate key with distinct entry IDs is legal and uses
the existing projection rule; a duplicate DataId is rejected. Every authored
value/reference is checked even when deleted/hidden or a losing LWW write.
Atomic tags must contain a finite scalar or a known retained map/list reference
of the declared kind. Root references and forward references inside an atomic
batch are valid. Entry births require an explicit tagged value, including
{scalar:null}; this is stricter than broad Schema defaults. Omitted empty keys
remain valid because the compiler elides that default.

Only a private candidate is applied during semantic validation. Rejection
changes no live document/clock, server or actor sequence, log, acceptance receipt,
persistence callback or broadcast. A corrected change can reuse the same
rejected sequence. Accepted exact retries retain existing idempotency. Ordinary,
conditional, recovery, staged persistence and change-replay entrypoints share
the guard. Raw checks also cover negative-seal/receipt paths before serializing
untrusted data.

The fixed createDataSchema fingerprint remains:
sha256:96b65879a3d426ab2aeeeb7e60b02e207ba5bfb66e9b211f14b2707be972f23f.
The schema is now in a pure module; server imports never pull in DataClient.
The guarded factory rejects storage schema changes outside that identity.
Existing generic DocHub transitions and Schema checks remain supported.

## Hidden references and client reads

Queued edits can legitimately refer to a collection that became hidden while
its identity is retained. Such references are accepted. DataClient reads now
return a retained handle rather than rejecting the entire root projection;
operations on the hidden collection still reject until it is visible again.
Undo restores visibility and retained peer data. Unrelated keys remain readable.

Client.snapshot() and LocalClient.snapshot() expose detached retained document
storage. These read-only operations work inside notifications and with pending
local operations, and change no clock, History or notification state. Returned
object mutation cannot affect the engine. The snapshot omits History/recovery
proof and does not replace captureState or durable synchronization recovery.
This avoids using a checkpoint export inside a read notification.

## Deliberate GC boundary

Guarded data GC is disabled: gc() returns null and replayGc() rejects. Existing
compaction erases identity attributes needed to reserve deleted IDs and validate
hidden references. Deleted data remains stored and storage grows. A
metadata-aware compactor/identity reservation format is a remaining P2 gate.
Generic DocHub GC is unchanged. Compacted legacy data logs cannot be adopted
transparently; replay change records through the guarded hub. Reset starts a
new epoch/identity domain and is not a compaction mechanism.

The factory validates intrinsic encoding, not arbitrary local validate(write)
business rules. Authentication, actor/room binding, quotas, durable I/O and hub
mutation serialization remain endpoint responsibilities. Trusted host code must
not bypass admission by directly mutating/replacing hub.doc. This is not full
P2 resource, process restart or long-term recovery qualification.

## Verification

| Check | Result | Boundary |
| --- | --- | --- |
| Full workspace | 1,616 cases /1,614 PASS /2 expected platform SKIP /0FAIL | Core1174, Lexical7, React2, Solid3, Svelte2, UI4, Vue2, Slate4, Bot53, Demo141, Docs43, MCP181/179PASS |
| Data-focused | 60/60 PASS inside full core | Existing data32 plus admission5/review20/actualHTTP3; counts overlap full run |
| Legacy conditional/recovery/durable focused | 35/35 PASS | Covered again by full run |
| Actual loopback HTTP/SSE | 3/3 PASS | Final source, raw requests/journals and per-journal receipts |
| Build/root TypeScript | PASS | All ten packages; final no-emit check after build |
| Package artifacts | Ten tarballs /12 consumers PASS | Includes guarded server runtime/types and owned Client snapshot types |
| Release preparation | PASS | Temporary ten0.1.0 plan, independent Slate patch, source manifests/lock unchanged |
| Docs | 43/43 PASS;55pages /2,594internal links | English/local-path checks PASS |

Independent tests cover duplicate retained IDs (map/list/entry/tombstone), raw
malformed and losing values, immutable writes/membership, unknown/wrong-kind
references, batch forward refs, cycles, empty/Unicode/prototype-like keys/null,
known hidden references with queued writes+undo, no-op/normal selective History,
append failure retry, raw descriptors, conditional/recovery exact retry and
staged rejection. Detached snapshots are tested during local notifications,
pending local edits and through nested returned-object mutation. Golden schema
identity and plain schema-only Hub compatibility are explicit tests.

HTTP tests send malformed mixed batches with a valid prefix and assert409 with
no append, state, seq, receipt or peer event. Eleven invalid ordinary cases can
be corrected at the same actor seq; exact accepted retries append nothing.
Conditional and recovery reject/correct/retry paths also pass. Three actors
concurrently edit keys/list values/moves, then undo/redo and reconnect pending
changes while preserving peer data. Accepted journals reopen into fresh guarded
hubs in the same process. A full process/server restart was NOT_RUN.

The initial HTTP attempt exposed rejection of a legitimate synthetic list head;
that product regression is fixed and preserved as attempt-02.log. Review also
caught overly strict omitted empty-key rejection, cross-kind membership changes
and hidden-reference read poisoning. Initial root tsc overlapped build's dist
cleanup and failed module resolution; the sequential post-build check passes
without another runtime change. All failed attempts remain separate from final
receipts. No browser or mobile test was run for this server-focused slice; the
prior Solid Chrome checkpoint is historical, not fresh proof. No latency or
large-data memory claim is made for retained-state candidate staging.

## Delivery and evidence

Updated shared-data usage, server setup/API, package guide, roadmap and
DataClient rationale. HANDOFF section5.129 records the final result. Changeset
preparation stays private0.0.0. No commit, push, release or hosted deployment.
Existing user services/tabs/drafts/History and all inherited WIP remain intact.

Evidence archives include full/focused/failure logs, final raw HTTP requests,
accepted journals/receipts, pre-freeze attempts, exact source/artifact hash
manifests, package and release receipts. source-seal.json pins the current
checkout and report; evidence-index.json hashes each compressed archive. Earlier
checkpoint reports remain unchanged.
