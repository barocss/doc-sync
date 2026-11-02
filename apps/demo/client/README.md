# Unified Client demo

Run `node apps/demo/client/start.mjs` from the repository root after building the packages. The command prints a loopback URL. Set `CLIENT_DEMO_PORT` to choose a port. Build artifacts go to `output/client-demo`.

The default `?mode=local` route shares one `Client({schema})` across ProseMirror, Slate, Lexical, and Tiptap. The bindings receive the client directly. Each view has its own selection and shares local history. The local runtime creates no sync backend, document hub, or transport. The two-mode JavaScript bundle includes sync code; this demo does not claim zero emitted sync bytes.

The `?mode=sync` route creates four clients with separate actors. A queued in-process transport connects them to a browser `DocHub`. Document traffic remains in the page. The preview server serves static assets only. It is not an HTTP document server.

Each view has Undo, Redo, Insert prefix, and Remount actions. Sync mode also has Disconnect / Reconnect. Reset detaches all views, reconnects clients to settle pending changes, clears history, disconnects and disposes the clients, then creates the sample again.

`window.__clientDemo` exposes `snapshot`, `select`, `insertPrefix`, `undo`, `redo`, `remount`, `reset`, `disconnect`, and `reconnect`. Its `ready` and `busy` getters report lifecycle state. Snapshots contain actual client modes, backend diagnostics, native/model snapshots, selections, history, notification errors, and transport counters. Pending queues appear only for sync clients.


Use `?api=legacy` for a current-code, same-page API control. Local mode uses `LocalClient` directly. Sync mode uses `SyncClient` directly. This is not an old Tiptap local implementation. The default `api=unified` uses `Client` directly. Both routes use the same native bindings, document schema, UI, and rendering code.

Use `?size=10000` or `?size=100000` for plain documents with exactly that many text characters, split into 100-character paragraphs. The default `size=sample` retains the rich sample. `Insert prefix` inserts one `x` at the start.

For trusted-input measurements, call `__clientDemo.measure(sourceName, expectedFullText)` before browser input. Read `__clientDemo.measurement` without calling `snapshot()` during the timed interval. The next trusted `beforeinput` sets `inputAt`. Per-view MutationObservers set `peerDomAt` when DOM text equals the expected text, and `raf2` after two animation-frame callbacks. Status becomes `complete` after all four views match and reach the callbacks. These timestamps show DOM update and a rendering opportunity, not physical display. Model conversions and snapshot inspection do not run inside this measurement path. Client commit timing is not instrumented.

## Verify

```sh
npm run check:client -- --url http://127.0.0.1:PORT --output output/unified-client/chrome
node apps/demo/client/check-performance.mjs --url http://127.0.0.1:PORT --output output/unified-client/performance
```

Replace PORT with the printed static preview port. The functional checker uses
trusted native input and selections. The timing checker prepares selection
outside the clock with a trusted first-block click and the demo selection helper,
then asserts native DOM and logical caret positions. The timed beforeinput is
trusted. Run timings after all builds and correctness tests finish.

The complete run uses two warmups and eight measured samples per source/API/mode/
size: 320 inputs and 64 paired source-to-target DOM cells. Exit 2 and INVESTIGATE
mean a timing guard was crossed; they do not mean the correctness checks failed.
See [the final report](../../../benchmarks/results/unified-client/report.md).
All medians and 100k cells pass; five local 10k p95 cells remain unqualified.
OS IME, physical display latency and an HTTP document backend are not measured.
