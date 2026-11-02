# Local document editors

Run ProseMirror, Slate, and Lexical with three independent, memory-only documents. Each native editor uses `LocalClient` through `LocalEditorHost`. The browser does not use a document server or persistent storage. A loopback static preview serves the HTML, CSS, and JavaScript assets.

Use Node 24.22.1 for the tested workflow. From the repository root:

```sh
npm install
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --ignore-scripts --cache /tmp/doc-sync-compat-npm-cache
npm run dev:local
```

The preview prints its URL. Set `LOCAL_DEMO_PORT=8080` to choose a port. `dev:local` builds the public workspace packages first. The demo imports their built ESM exports. The existing isolated `apps/demo/compat` installation supplies React, Slate React, and esbuild. This setup does not change the root lockfile.

Type in any editor. Each editor has its own Undo, Redo, Insert prefix, and Reset controls. Insert prefix adds `Local ` to the first paragraph through the local application API. The native binding keeps the current selection. Reset creates a fresh document in that panel. Refresh creates three fresh samples. Edits are not shared between panels and are not saved.

Use Command+Z or Control+Z for Undo. Use Shift+Command+Z, Control+Shift+Z, or Control+Y for Redo. The seed has two paragraphs and a bold text run. The initial history is empty.

## Checks

```sh
node --test apps/demo/test/local-demo.test.ts
npm run check:local -- --url http://127.0.0.1:PORT --output output/local-demo/chrome
```

Replace `PORT` with the port printed by the running preview. The check downloads the exact served bundle, metafile and module report into its output directory before opening Chrome.

The focused tests check seed isolation, local history, emitted package modules, fixed asset routes, rejected document routes, and the `connect-src 'none'` policy. They bundle in memory and do not replace the preview bundle. The separate Chrome check records trusted input, selection direction, history, application edits, remount, reset, refresh, and network behavior. See that check's receipt for exact PASS, FAIL, or NOT_RUN results.

`start.mjs` writes the browser bundle, source map, esbuild metafile, and module contribution report under `output/local-demo/`. It also serves the reports at `/metafile.json` and `/bundle-proof.json`. The report rejects emitted sync client, transport, recovery, or document server code. Unused barrel references can still appear in the metafile input graph. These references do not prove emitted runtime code.

`window.__localDemo` provides bounded test diagnostics: snapshots, local application prefix insertion, native selection, Undo, Redo, remount, and reset. Its selection helper is test setup. The Chrome input proof uses real browser input. A remount reuses the same local client and history. A reset replaces that client.

This demo does not qualify collaborative editing, durable storage, full IME behavior, or every rich document schema. Those paths have separate tests.
