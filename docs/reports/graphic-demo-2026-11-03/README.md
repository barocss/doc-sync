# Graphic editor verification

Base HEAD: `d624a56d7ea5389fd9f67d1277637838bb343475`. This uncommitted
candidate preserves the preceding five-package, actor-profile, and schema-domain
work. It adds a private PixiJS 8.22.0 demo, not a published canvas binding.
Earlier report directories and timing investigation flags remain unchanged.

## Delivered behavior

`fixtures/graphic-canvas-schema.ts` defines an empty-capable canvas with stored
frames and object groups, rectangle/ellipse atoms, and plain text labels. The
private scene adapter pairs the TypeScript client model and CRDT block IDs once
per revision. Each action resolves its ID against the latest visible index.
Names can repeat. Deleted/hidden IDs never silently select another object.

Two independent Client/HttpTransport/History instances use real POST/SSE through
a bounded loopback server. Tools support creation, selection, drag, inspector
geometry/color/text, reparent/reorder, delete, selective undo/redo, remote
presence, and live disconnect/reconnect. Resize is inspector-only. Positive
uniform scale is the geometry contract; reparent preserves world transforms.
Local drag updates x/y only. Other users' independent field changes remain.
Minimal UTF-16-safe label splices retain unchanged character IDs and reject stale
inspector text rather than overwriting peer input.

The server is memory-only, with sixteen rooms and 8 MiB POST limits. It validates
schema, protocol, epoch and changes. It neither uses existing demo data nor
provides production authentication or durable restart/refresh recovery. The
canvas index uses the TypeScript SyncClient document compatibility surface;
local-only and Rust/WASM canvas adapters remain open. Core has no Pixi dependency
and gains no public `getNode(id)` API.

## Correctness and checks

| Check | Result | Boundary |
| --- | --- | --- |
| Full workspace | 1,421 cases; 1,419 PASS, two platform SKIPs, zero FAIL | Core 1,032; Lexical 7; Slate 4; bot 53; demo 107; docs 37; MCP 181 (179 PASS). |
| New graphics regressions | 20/20 PASS | Nine geometry, nine session, one real HTTP/SSE, one core remote graphic-label event case. |
| Root TypeScript | PASS | Final TypeScript implementation. |
| Chrome functional | 20/20 PASS | Real WebGL, trusted pointer/form input, independent server model, two actors, controlled concurrency, selective undo, stable IDs, reparent, offline pending/reconnect, actual label text/fill, 390px layout, no app/console/page errors. |
| Chrome size sweep | PASS correctness; INVESTIGATE latency | Three warmups and ten edits per size; full equality outside timing. |
| Packed consumers | Seven PASS; five tarballs | Existing independent binding consumers and patch case; no core Pixi runtime dependency. |
| Changesets rehearsal | PASS | Temporary versions only; source versions/lock unchanged; no publishing. |
| Final docs | 37/37 PASS | Graphic route assigned to Editor integrations; build/link result in compressed log. |

The core fix makes scoped graphic text events use a container root. The existing
cardinality branch remains enabled. Before the fix, a remote label edit could
throw while constructing the scoped before/after document, leaving a stale peer.
No CRDT delivery, placement, register, or History arbitration rule changes.

Additional source regression selection passed 53/53. The independent geometry
oracle uses matrix composition and tolerance 1e-9. A later docs-navigation test
initially failed because the new route lacked its editor-sidebar mapping. That
mapping and explicit route checks now pass. The final HTML-only Source link
correction leaves the measured JavaScript bundle unchanged.

## Chrome measurements

Apple M3 Max, Chrome 156, WebGL through ANGLE Metal, 1720 × 1080. Each size is a
fresh room, with three warmups and ten recorded attribute edits. Sequential size
order, no ABBA baseline: these numbers do not prove an optimization speedup.

| Objects | Client edit p50/p95 ms | Peer convergence p50/p95 ms | Cold ready wall s |
| --- | --- | --- | --- |
| 9 | 2.4 / 3.0 | 8.3 / 8.9 | 2.56 |
| 100 | 13.8 / 14.9 | 21.2 / 22.5 | 0.66 |
| 1,000 | 125.7 / 135.6 | 194.8 / 210.7 | 4.29 |
| 5,000 | 649.7 / 686.4 | 1,570.3 / 1,686.2 | 113.84 |

Cached same-ID lookup batches of 1,000 take about 0.3 ms p50 at each size.
Three full sweeps of 5,000 distinct IDs take 1.2, 1.2 and 1.3 ms, reindex delta
zero, missing ID null. This does not include cache construction. At 5,000 objects,
index rebuild is 68.7 ms p50, client remote event 270.6 ms p50, and Pixi update
CPU work about 2 ms per view. rAF waits are scheduling only, not GPU completion.

Client timing includes synchronous engine, History and enqueue and excludes
microtask-deferred view work. Target-ID/pending convergence avoids full model
serialization during timing; full-model validation runs afterward. Cold ready
wall includes seeding, browser/tool startup, connections and rendering and is a
single observation. It is not an isolated first-paint measure. GPU completion,
physical display latency, memory distribution, production remote networking,
real-process graphic durability, and actual OS IME are NOT_RUN.

A separate Node LocalClient diagnostic for one 1,000-object attribute edit counts
three snapshot calls, three restores and two JSON model reads. It has no Pixi,
transport or view observers and is not a matched browser performance baseline.
Whole-document staging/model allocation and bulk scene seeding are the next
priorities, followed by incremental scene indexing. Correct convergence does
not qualify 1,000/5,000-object interactive editing.

## Evidence integrity and execution

`validation.json` lists compressed raw receipts and hashes; `source-seal.json`
records the current implementation, declarations, tests and documentation.
Browser receipts bind the emitted JavaScript to
`013d6c8c3451aceaf71aec1c66e3a5838064456a25b67391644430070a5bd6df`.
The build metafile/input hashes and source fingerprints are retained. Earlier
failed harness runs remain under ignored `output/graphic-demo-proof/`: fractional
CLI pointer coordinates were rounded, and a stale pooled Node fetch after
blocking CLI work was replaced with a fresh connection. Neither is removed or
counted as a successful test. Later label-color correction has a fresh final
functional and performance run; earlier timings retain their original hash.

```sh
npm run dev:graphic
GRAPHIC_URL=http://127.0.0.1:5420 npm run check:graphic
GRAPHIC_URL=http://127.0.0.1:5420 npm run bench:graphic
```

Use an assigned port with `GRAPHIC_PORT=0`. Each performance run creates new
rooms; restart only your own disposable memory server when the room cap is
reached. The manual preview uses a separate fresh process. No commit, push,
registry publication, or hosted docs deployment was performed.

## Spreadsheet boundary

The existing document grid expands every row × column pair in its JSON model,
including blank/covered cells. Internal tokens are not the same as that expanded
model. A future large worksheet needs sparse non-default cells, implicit blank
axes, range overrides, stable row/column identities, bounded viewport queries,
and explicit formula/copy/move semantics. A schema alias or renderer
virtualization alone cannot solve dense model allocation. No spreadsheet engine
is implemented in this candidate.
