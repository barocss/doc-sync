# Sparse Sheet Collaboration Studio

Run from the repository root:

```sh
node apps/demo/spreadsheet/start.mjs
# Optional isolated port:
SPREADSHEET_PORT=0 node apps/demo/spreadsheet/start.mjs
```

The default URL is http://127.0.0.1:5422. Use `?room=your-room` for an independent blank room. The startup command builds the browser bundle and writes `output/spreadsheet-demo/{main.js,main.js.map,metafile.json,build-proof.json}`. The proof records source and bundle SHA-256 hashes.

Two independent `SparseSheet` instances represent Alice and Bob. The browser sends operations through HTTP POST. A loopback server broadcasts accepted changes and rectangular range presence through SSE. Its GET state endpoint is a separate oracle. This is a private demo protocol. It uses the experimental public `SparseSheet`/`SpreadsheetSchema` API but does not use or qualify public `Client`, `DocHub` or the document sync wire protocol.

The logical extent is 1,048,576 rows × 16,384 columns. Each VTable mounts at most 100 rows × 26 columns. The sparse CRDT is the sole model authority. Bounded VTable records are disposable viewport projections. Use **Window** to jump to addresses such as `XFD1048576`. No array spans the whole logical sheet.

Double-click a grid cell and type to edit it. Press Enter to commit. The inspector exposes value, stored formula text, fill, and bold. Apply sends only fields changed in that inspector, so a stale draft preserves unrelated peer fields and unchanged value types. It does not calculate formulas. Grid changes create CRDT operations; remote view updates suppress edit events. An active grid editor keeps its draft when a remote update arrives. The inspector keeps focused drafts, too.

Each actor owns its history and selection. Undo changes a field only when that actor still owns its current ticket. A peer write with the same visible value still fences undo. Hold inbound on both peers, edit the same cell, then release to inspect concurrent field resolution. Presence uses fixed rectangular coordinates and has no axis insertion semantics.

Disconnect preserves the live model, history, and pending operations. Reconnect retries an unacknowledged request with its exact original identity. A pending operation is removed only after server acceptance. Hold queues at most 512 server entries. A gap, limit, or unknown epoch blocks the session and preserves local state. Reloading the page does not recover state. A server restart loses rooms, history, receipts, and presence. Durable restart and refresh recovery are outside this demo.

The server validates metadata, extent, epoch, actor sequence, actor ticket ownership, and every operation before mutation. A conflicting ticket invalidates the whole batch. An exact repeated request returns its original receipt and adds no log entry. Limits: 8 rooms, 16 actors per room, 32 open streams, 64 KiB request body, 256 operations per batch, and 20,000 retained operations per room. It is a bounded loopback demo, with no production authentication or durable storage.

## Validation

```sh
node --test apps/demo/test/spreadsheet-*.test.ts
npx tsc -p apps/demo/tsconfig.json
node apps/demo/spreadsheet/build.mjs
```

Tests use real HTTP and independent actors. They cover same-cell conflicts, independent fields, same-value undo fences, repeated actor undo/redo, pending reconnect, atomic rejection, duplicate receipt identity, lost-response exact retry with newer pending edits, live SSE changes and range presence, stream-close presence expiry, inspector field isolation, and epoch-reset preservation. Node tests use explicit GET pull for peer catch-up; browser SSE delivery requires browser proof.

Browser inspection API: `await window.__spreadsheetDemo.ready`; `snapshot()`; `sessions`; `actions.edit(peer,row,column,patch)`; `actions.jump(peer,address)`; `actions.select(peer,row,column)`; `actions.hold(peer,boolean)`; `actions.undo/redo/disconnect/reconnect(peer)`; and `cellScreenPoint(peer,row,column)`. Coordinates are zero-based. Metrics report synchronous local edit time, latest event observation latency, bounded projection/render submission CPU time, viewport size, sparse field count, retained operations, pending operations, and held inbound count. Render CPU is not GPU frame latency. Convergence latency is an observed local metric, not a network benchmark.

## Browser and performance receipts

With the demo server running, use the installed `agent-browser` CLI and local Google Chrome:

```sh
SPREADSHEET_URL=http://127.0.0.1:5422 node apps/demo/spreadsheet/check-browser.mjs
SPREADSHEET_URL=http://127.0.0.1:5422 node apps/demo/spreadsheet/check-performance.mjs
```

Default output is `output/spreadsheet-browser-proof/final`. Set `SPREADSHEET_PROOF_DIR` to preserve a separate diagnostic run. Each script closes only its own browser sessions. Start a fresh server before the final receipt pair: diagnostics and benchmarks consume bounded memory rooms.

Functional proof uses trusted native pointer and keyboard edits, inspector inputs, actual toolbar controls, and native Shift range selection. It checks actual VTable values and scenegraph fill, independent HTTP server equality, mobile width, page errors, and console errors. Application actions provide labeled controlled conflict, numeric/null, and remote-during-draft setup. They do not substitute for the native edit proof.

Performance proof starts a fresh browser for each 0, 1,000, and 10,000 preseeded touched-cell fixture. A separate Node SparseSheet actor seeds each room through real HTTP before timing. The point-edit target is an existing seeded cell when a fixture has seeded cells. Each case has three warmups and ten recorded samples. Timings cover synchronous client edit, observed peer convergence, and bounded projection/render submission CPU. Full sparse equality and the independent HTTP oracle run outside convergence timing. Cold navigation includes browser startup, CLI overhead, and readiness checks. It is not a pure page-load benchmark. No performance acceptance threshold is asserted. GPU completion and physical paint are not measured.

## Custom data and editor profiles

Open `/?profile=tasks&room=task-example` for title/progress/archived fields, or
`/?profile=sensors&room=sensor-example` for reading/unit fields. The default
URL retains the original protocol. Profiles keep shared data rules separate
from the native editor primary field and typed inspector. The server binds a
room to its first valid descriptor and identity before accepting edits.
A mismatch blocks synchronization while preserving the client's pending work.

There is no live profile switch, browser reload durability or server persistence.
Choose a fresh room for another schema; do not reload a live pending session.
See [custom schema recipes](../../docs/src/schemas/custom.md).
