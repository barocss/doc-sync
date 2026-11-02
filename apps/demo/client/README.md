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

## Save and open a local document

Use `?mode=local&persist=1` to enable browser storage. The default route remains
ephemeral. `persist=1` with sync mode or the legacy API displays a disabled
message and does not access storage.

Select **Save locally** to store the document, actor, exact CRDT identities, undo
and redo history, and anchored selections for the four views. Select **Open saved**
to replace the open document with that saved copy. Refresh opens the saved copy
automatically. Unsaved edits are not saved on refresh. **Reset document** creates
the sample without changing storage. **Forget saved** removes only the saved copy.
It keeps the open document and its history. There is no automatic save.

The application owns one `localStorage` key, `doc-sync:client-demo:local:v1`. Use
`&storageKey=YOUR_KEY` to select a separate key. Each save uses one atomic
`setItem`; it does not remove the old value first. Storage denial, quota errors,
malformed JSON and schema mismatch display a status message. A failed save keeps
the previous bytes. A failed open keeps the current client. The application
rejects an open operation while current native work or composition is pending. It
validates a new Client and its selections before it detaches any view, then
retains the old Client until all replacement views mount. If a mount fails, it
attempts to remount the old Client. Core stores document and history; the demo
envelope stores view selections. This browser storage is separate from sync
recovery. Browser data removal can remove saved documents.

`__clientDemo.saveLocal()`, `openLocal()` and `forgetLocal()` run the same manual
actions. `__clientDemo.persistence` reports enablement, key and status.

Run the separate persistence check after builds and performance captures finish:

```sh
node apps/demo/client/check-local-storage.mjs --url http://127.0.0.1:PORT --output output/local-persistence/chrome
```

The checker uses a unique storage key and an owned browser session. It checks
hidden-tab startup before activating the tab, then trusted input in all four
restored views and shared undo/redo. Mount lifecycle waits use a hidden-tab
visibility/timer fallback because browsers can suspend animation frames. The
measurement API retains its original two-frame observations. The checker does
not clear other browser data.
