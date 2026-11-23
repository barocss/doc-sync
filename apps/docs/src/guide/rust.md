# Rust engine

Rust is a private engine experiment. The production server, browser clients,
MCP editing path, and editor bindings still use TypeScript. There is no public
Rust replacement API yet.

## What runs where

| Component | Current implementation | Rust work |
| --- | --- | --- |
| Production synchronization server | TypeScript on Node.js | A native shadow adapter is planned after semantic qualification. |
| Browser document engine | TypeScript | Isolated WASM storage and boundary experiments exist; a full engine adapter is planned. |
| CRDT semantic comparison | TypeScript is the reference | A separate native process applies the same operations and computes its own state, History, and selection results. |
| ProseMirror, Slate, Lexical, and MCP | Existing TypeScript integrations | Rust integration has not been qualified. |

The native process receives operations, time, options, selections, and its own
exported checkpoints. Expected document models and expected History inverses
stay in the comparison process. Passing a storage checksum is not proof of
collaborative editing behavior.

## Engine architecture

The work has three layers. They have separate acceptance gates:

| Layer | Purpose | Current scope |
| --- | --- | --- |
| UTF-16 storage | Insert, delete, and read text units efficiently. | Independent native and WASM experiments compare String, Vec, and Gap candidates. |
| CRDT semantics | Preserve identities, concurrent writes, structure, History, and anchors. | A private native interpreter compares supported wire operations with TypeScript. |
| Product adapters | Connect the engine to transport, persistence, MCP, and browser editors. | Planned after broader semantic qualification. |

The Gap benchmark is not the current CRDT engine's storage implementation.
The shadow interpreter retains tokens in a native `Vec`, ordered physical
lines, register maps, deletion sets, and projection caches. It still performs
linear lookups and clones candidate state for atomic requests. These choices
make the semantic experiment reviewable; they do not establish a tuned engine
or inherit the Gap benchmark's speed and memory results.

### Stored state and projected document

The stored document is more than its visible JSON tree:

| Stored fact | Why it stays in the engine |
| --- | --- |
| Ticket: Lamport clock and actor | Gives an operation or token a stable identity and deterministic ordering. |
| Immutable token origin and birth metadata | Retains insertion relationships and the original node identity after movement or type changes. |
| Current attribute value and writer ticket | Resolves last-writer-wins registers and prevents undo from replacing another writer's change. |
| Deletion and cancellation ticket sets | Lets one user undo their own deletion while another user's deletion remains active. |
| Physical line, owner, and slot | Keeps nested container bodies, table axes, and cell contents addressable when hidden. |
| Placement records and logical split/join metadata | Changes visible placement without copying or renumbering stored text. |
| History ownership graph | Generates local inverses and retains shared prior-state ownership across undo, redo, and restore. |

Projection derives blocks, groups, inline content, spans, and tables from this
state. A list group or link span need not create a storage token. Deleting a
container does not erase its stored body. Merging table cells hides covered
cells in the editor while retaining their text and attribute writers.

Comparisons first materialize the same valid derived slot heads in both
engines without advancing the clock. They then compare canonical physical
lines, IDs, writers, deletion ledgers, and projected models. This normalization
does not claim equal lazy allocation order or identical snapshot bytes.

### Operation application

The native executable reads one JSON request per line and writes one JSON
response. Its `Server` holds named replicas in memory. It is an experiment
driver, not the production HTTP synchronization server.

For an atomic mutating request, the driver validates the command, schema, and
capability, applies the batch to candidate state, and replaces active state
only after success. Invalid batches and coupled checkpoint restores preserve
the prior document and History. This is in-memory atomicity, not durable
database commit or authorization.

TypeScript's existing builders still decide which wire operations a user
command creates. Rust independently applies those operations and computes
projection, selection, and History inverses. A native equivalent of the
high-level `doc.edit()` authoring compiler has not been delivered.

### UTF-16 and JavaScript compatibility

Text crosses the comparison boundary as arrays of 16-bit units. An emoji can
use two units; isolated surrogate units must also survive edits and restore.
The native engine does not normalize text or reinterpret offsets as UTF-8 byte
positions. Actor ordering uses JavaScript UTF-16 ordering when tickets tie.

Actor names and JSON attribute strings use Unicode scalar strings in the
native JSON parser. Isolated surrogates in those strings are outside the
supported wire subset. Text unit arrays remain supported. Finite JSON values,
object insertion order, safe integer ticket bounds, and signed-zero behavior
also need explicit compatibility checks. A Rust type being valid does not by
itself mean its behavior matches JavaScript.

## Concurrent editing and local History

Undo is an operation on retained CRDT state. It is not replacement of the
document with an older visible JSON tree.

For example, suppose A deletes `c` while B makes `c` bold. The merged document
hides `c` while its active deletion exists, but keeps the formatting writer.
If A undoes only their deletion, the character becomes visible according to
the remaining deletion and formatting state. If B has also undone bold, or a
third user has written another value, those events affect the result. Local
undo does not erase another user's deletion or overwrite a later foreign
writer merely to reproduce an earlier screen.

The native History generates its own inverse tickets. It checks current writer
ownership before reverting each affected target, including foreign writes
that have the same value. It retains shared before/after state, undo and redo
stacks, carets, typing groups, and deletion pins. The current experiment uses
a 1,500 ms typing window and a 100-group History limit.

`history_record` applies and records fresh local operations. It is not a
retry-safe submission API. Remote duplicates and saved pending batches use
plain `apply`, so retry does not create another History entry. Movement and
split inverses use the same ownership discipline. A foreign move can suppress
an obsolete local inverse without discarding the stored operation history.

## Cursors and selections

A token key names the position immediately after a stored token. It can remain
stable when another participant inserts text before it. Captured ranges retain
both anchor and focus, including reversed selections and UTF-16 boundaries.

There are two different resolution contracts:

| Operation | Contract |
| --- | --- |
| Raw local anchor lookup | Find an available caret position, using physical predecessors or an owning block/cell fallback when necessary. |
| Strict editor range resolution | Return a model range only when both endpoints are addressable in the visible model; otherwise return null. |

An anchor in a covered cell, deleted ancestor, or hidden private storage must
not create a remote selection in content the editor cannot display. Local
History lookup can still need a fallback. The current root-gap correction
targets this distinction: an ownerless hidden root storage line must terminate
at root start instead of following a nonexistent owner. Existing nested-owner
and neighboring-cell escape rules remain unchanged.

These native anchor checks do not prove browser DOM selection, IME behavior,
cursor animation, or editor-specific restoration. Those require adapter and
browser tests.

## Restart and pending replay

The native document snapshots belong to this crate. Formats v1 through v6
identify separate declared capabilities; they are not TypeScript document
snapshots. A coupled History checkpoint stores the actor, native document, and
shared ownership graph together.

Restore validates schema identity, manifest, physical membership, immutable
birth data, current writers, placement references, clock bounds, and History
references before replacing active state. A failed restore preserves both
parts. Plain document restore clears old History so it cannot act on a
different document.

The pending-replay tests follow this sequence:

1. Generate actual operations with a TypeScript client and retain its exact
   pending batch and matching History transition.
2. Export the matching native checkpoint and stop the native process.
3. Start a new process, restore the checkpoint, and receive a foreign edit in
   the same affected subtree or range.
4. Apply the saved pending batch twice through plain apply.
5. Compare document state, History, foreign writers, and subsequent undo/redo.

The process does not persist checkpoints by itself. The caller must retain
them and arrange GC protection. These tests do not simulate the complete
production server journal, receipt acknowledgement, lease expiry, or recovery
reservation protocol. Those belong to later adapter qualification.

## Current coverage

The native interpreter has separate, fixed capabilities for these cases:

- UTF-16 text, deletion, deletion cancellation, and boolean formatting.
- Independent undo and redo, shared formatting ownership, and deletion pins.
- Paragraph split/merge and token-based selection.
- Text blocks, atoms, typed attributes, and atomic JSON attribute values.
- Recursive containers and full tables, including content hidden by merged cells.
- Flat list groups, inline images, and string-valued link spans.
- Block and subtree movement, logical split/join, and private text storage.

Movement retains token IDs, physical origins, and foreign input. Its History
checks preserve other users' writers. Fresh-process tests restore pending move,
split, join, undo, and redo operations, replay each batch twice, and compare
later History actions. This is checkpoint/replay evidence. It does not establish
full server crash recovery, protected garbage collection, or protocol parity.

Native tests now pass 75/75. The corrected movement comparison passes 360 full
state/History checks, 56 independently generated inverse/caret checks, and
5,666 raw endpoint checks. All four formerly omitted hidden-root-gap cases now
resolve identically in TypeScript and Rust; there are no endpoint omissions in
that receipt. Strict editor range resolution still returns null for hidden
anchors. The seven earlier differential suites are being rerun against the
same corrected binary.

## Examples by editor task

Every page in **Build an editor** includes a Rust experiment section. These
examples run the current native driver, or the existing differential harness,
and state the boundary between engine behavior and product integration.

| Task | Examples |
| --- | --- |
| Choose an integration boundary | [Editor integration paths](./editors#rust-experiment), [editor design lessons](./editor-lessons#rust-experiment) |
| Apply text and structural edits | [Model operations](./editing#rust-experiment), [schema-driven blocks](./blocks#rust-experiment) |
| Validate rules and recover pending work | [Document rules](./document-rules#rust-experiment), [synchronization](./sync#rust-experiment) |
| Represent agents and their History | [AI clients](./ai#rust-experiment), [document bots](./bots#rust-experiment), [Codex walkthrough](./ai-walkthrough#rust-experiment) |
| Map activity and selection | [Bot identity](./bot-design#rust-experiment), [cursors and selections](./presence#rust-experiment) |
| Connect editor positions to engine paths | [ProseMirror](./prosemirror#rust-experiment), [Slate](./slate#rust-experiment), [Lexical](./lexical#rust-experiment) |

The native examples are lower-level experiments. They do not replace the
TypeScript binding examples earlier on those pages.

## Can a document use a dynamic schema?

The production TypeScript engine accepts schema data and supports a compatible
open-editor transition. See [change an open editor's schema](./schema-transition).

Rust can use the same design, but the current native experiment has compiled-in
manifests and fixed type rules. It cannot yet accept an arbitrary schema at
runtime or replace the schema of an open document.

The work has two separate steps:

1. Compile a supplied schema into immutable per-document tables. Validation,
   projection, selection, History, and checkpoint checks must use those tables
   instead of fixed node names. Schema fingerprints must match TypeScript.
2. Add compatible live transitions. Check the document revision and schema
   version atomically, prepare and persist before switching, and retain exact
   pending operations, History ownership, selection anchors, and recovery
   protection. Recovery-proof migration across schema versions needs its own
   qualification.

The existing compatible TypeScript transition permits append-only boolean
marks, new nodes, and permitted new child types. It does not change existing
node attributes, defaults, rules, value marks, the root, or UI metadata.
Incompatible document migration is a separate feature.

## Roadmap

| Stage | Status | Qualification boundary |
| --- | --- | --- |
| R1: UTF-16 contract | Bounded baseline delivered | Storage behavior only. |
| R2: Storage comparison | Declared bounded gate passed | Independent JavaScript, native Rust, and WASM comparisons; workload regressions remain recorded. |
| R3: Boundary and resource lifetime | Declared bounded gate passed | Node.js and Chrome experiments; no production adapter approval. |
| R4: CRDT shadow semantics | In progress | Fixed schemas and declared semantic cases; broader rules, dynamic schemas, GC, and serialization remain open. |
| R5: Native server and WASM client adapters | Planned | Separate restart, reconnect, transport, editor, and recovery evidence required. |
| R6: Product decision | Planned | End-to-end correctness, latency, memory, compatibility, and rollback gates. |

The hidden-root-gap reference correction is implemented and its movement
comparison passes. The next order is runtime schema loading, then compatible
live schema transitions. A complete R4 gate
also needs broader child/group rules, field-level attributes, value marks,
protected GC, and serialization/recovery checks.

## Does Rust make editing faster?

The current WASM storage comparisons do not show a general gain over JavaScript
Gap. The matched native Rust Gap comparison has lower edit and pipeline medians
in six measured conditions and lower sampled whole-process RSS. Runtime,
allocation, and retained trace costs are included. This does not isolate a Rust
language benefit or measure the production server.

The full Rust CRDT engine has no qualified browser performance or production
speedup result. Server-native results, WASM boundary costs, and end-to-end
editor latency need separate measurements.

### Native storage measurement

The matched native Gap comparison used two seeds, 100,000 initial UTF-16 units,
10,000 edits per trace, seven paired samples, fresh processes, and five untimed
warm-ups. The table shows pipeline medians for seed `305419896` in milliseconds.
Pipeline includes construction, edits, and a fresh contiguous output.

| Trace | Node.js Gap | Native Rust Gap |
| --- | ---: | ---: |
| Cursor-local | 0.928375 | 0.138876 |
| Far jump | 9.236333 | 8.216250 |
| Alternating ends | 30.001999 | 27.107958 |

Across both seeds, the native pipeline median was lower in all six conditions;
41 of 42 paired samples were lower. One native fresh-output phase was slower
than Node.js. Gap movement across a document still dominates distant edits.
The result excludes startup, trace parsing, JSON, IPC, transport, CRDT work,
persistence, and editor rendering. It is a storage batch result.

At the materialized stage, sampled whole-process RSS was 2,928–3,056 KiB for
native Rust and 63,616–65,104 KiB for Node.js. Those observations include runtime
baseline and trace representation. They are not per-document heap, peak memory,
multi-document scaling, or leak measurements. They do not predict the savings
from replacing one component inside an existing Node.js server.

The practical WASM path was slower than JavaScript Gap in its measured Node.js
and Chrome workloads. Native results do not remove WASM copies, calls, memory
growth, and resource-lifetime costs.

## Run the private experiment

Run from a repository checkout. Existing receipts used Node.js 24 and a matching
rustup Rust compiler and rustdoc. Offline builds require the locked dependencies
to be present in the local Cargo cache.

```sh
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --offline --manifest-path experiments/rust-shadow/Cargo.toml
RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" build --offline --manifest-path experiments/rust-shadow/Cargo.toml
mkdir -p output/rust-review
RUST_MOVE_RECEIPT=output/rust-review/receipt.json RUST_MOVE_TRACE=output/rust-review/fulltrace.json.gz RUST_MOVE_SUMMARY=output/rust-review/summary.txt node experiments/rust-move-harness/harness.ts
```

Use new output paths to preserve earlier evidence. The harness performs the
editing and History comparisons. It is not an application server.

For a small protocol inspection, start the built executable and send these
three JSON lines. This uses the base text schema rather than the movement mode:

```json
{"cmd":"new","replica":"A","actor":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1"}
{"cmd":"apply","replica":"A","schema":"flow-root-paragraph:boolean-marks:bold,italic:v1","ops":[{"t":"text","id":{"lamport":1,"actor":"A"},"origin":{"lamport":0,"actor":"~root"},"units":[72,105]}]}
{"cmd":"state","replica":"A"}
```

The resulting text is `Hi`. Plain apply does not record local History. Use the
comparison harness to inspect `history_record`, `history_undo`, `history_redo`,
checkpoint export/restore, and selection requests with valid authored inputs.
These commands are private experiment interfaces, not public package exports.

## Source map and remaining limits

| Repository location | Responsibility |
| --- | --- |
| `experiments/rust-shadow/src/lib.rs` | Replica state, tickets, base apply, command admission, and atomic driver requests. |
| `experiments/rust-shadow/src/general.rs` | Fixed block types and JSON attribute behavior. |
| `experiments/rust-shadow/src/nested.rs` | Physical flow/grid storage, recursive projection, and nested selection. |
| `experiments/rust-shadow/src/movement.rs` | Placement replay, private text partitions, and logical split/join projection. |
| `experiments/rust-shadow/src/shapes.rs` | Fixed list groups, inline nodes, and string spans. |
| `experiments/rust-shadow/src/history.rs` | Independent History generation and coupled ownership checkpoints. |
| `experiments/rust-shadow/src/selection.rs` | Flat token anchors and selection dispatch. |
| `experiments/rust-*-harness/` | TypeScript reference generation, native comparison, saved receipts, and traces. |
| `experiments/rust-core/` and `experiments/rust-bridge/` | Separate storage, WASM boundary, lifetime, and native Gap experiments. |

Runtime schema compilation, compatible live transitions, required-child/group
boundary rules, field-level attribute merging, broader value-mark semantics,
protected GC, and wider serialization/recovery behavior remain open. Object
reference identity, all raw TypeScript rejection cases, and arbitrary malformed
inputs are not qualified by the supported JSON wire subset.

The engine has no qualified native production server or full WASM client.
Existing JavaScript editor and MCP functionality must not be described as Rust
integration evidence. A production decision requires semantic qualification,
adapter evidence, measured product targets, and a rollback plan.

See the [project roadmap](../roadmap) and
[performance evidence](../performance). The detailed research plan and raw
receipts remain in the repository's `docs/rust-roadmap.md` and `experiments/`
directories. Local documentation preview does not publish these changes.
