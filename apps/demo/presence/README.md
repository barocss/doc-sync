# Presence component demo

Run `npm run dev:presence`. The server uses an available loopback port and writes
its bundle to `output/presence-components-demo`. It does not replace another demo
server. Data lives in one in-page `DocHub`; there is no disk or HTTP persistence.

Four desktop surfaces use the actual DOM, React, Vue, and Svelte Presence
components. Each surface also has a real ProseMirror view with `PmBinding` on
the same unified `Client`. A second Client receives typed Presence through the
existing transport bridge. A third Client shows a bot profile and can make peer
edits. The graphic object and spreadsheet cell are projection fixtures, not
full graphic or spreadsheet editors.

Type in a document view to edit durable content. Type in Draft to send only
Presence. Confirm inserts the draft through `Client.edit`. Cancel clears it.
Undo and Redo use Client history. Reconnect drops the previous draft. Use the
target buttons to inspect stable object and cell targets. Unmount removes only
the four Presence renderers; the clients and editors stay connected.

`window.__presenceDemo.ready` becomes true after all clients and surfaces mount.
`snapshot()` returns document text/model, history state, hub sequence, received
Presence states, client convergence, mounted state, counters, and errors.
`actions` exposes `draft`, `draftSelection`, `confirm`, `cancel`, `selection`,
`target`, `disconnect`, `reconnect`, `unmount`, `mount`, `undo`, `redo`,
`removeTarget`, and `peerEdit`. Each async action settles and returns a snapshot.
These are test controls, not PASS assertions. Native draft input is `#draft-input`;
editor views are `[data-framework] .ProseMirror`. No mobile verification is run.
