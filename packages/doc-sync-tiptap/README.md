# @barocss/doc-sync-tiptap

A Tiptap extension that preserves Tiptap's transaction/plugin ownership while Doc Sync owns the shared model and history. It reuses the public ProseMirror binding and upstream ProseMirror classes.

## Availability and setup

This is a **private, unpublished `0.0.0` workspace**, not an npm installation promise. Use the repository workspace or locally packed artifacts. `publishConfig.access: public` describes a future release only.

From the repository root, with Node.js **22.18 or newer**:

```sh
npm ci
npm run build
npm run check:packages
```

The last command packs the library packages and checks isolated local consumers. For a separate application, pack the required Doc Sync packages with `npm pack --workspace <package-name>` from the repository root and install those local `.tgz` files together with the editor peers below. The packages export ESM JavaScript and TypeScript declarations from `dist`; they do not bundle the core or editor.

The internal Doc Sync peer range is `>=0.0.0 <0.1.0`. This is a draft local-artifact compatibility policy, not a stable registry release guarantee. See [package and release guidance](https://barocss.github.io/doc-sync/guide/packages.html).

### Required peers

- `@barocss/doc-sync` and `@barocss/doc-sync-prosemirror` (`>=0.0.0 <0.1.0`)
- `@tiptap/core` and `@tiptap/pm`, both **`3.32.2`**

Install the ProseMirror binding's editor peers as well. Keep the Tiptap pair at the same supported version.

## Minimal browser editor

Provide an element with `id="editor"` and bundle this TypeScript for the browser:

```ts
import {Editor} from "@tiptap/core";
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {DocSync, createTiptapExtensions} from "@barocss/doc-sync-tiptap";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema});
const editor = new Editor({
    element: document.querySelector("#editor")!,
    extensions: [
        ...createTiptapExtensions(schema),
        DocSync.configure({client}),
    ],
});
editor.commands.insertContent("Hello");
editor.commands.docSyncUndo();
editor.commands.docSyncRedo();

// On unmount:
function dispose() {
    editor.destroy();
    client.dispose(); // Only when the caller is finished with this client.
}
```

For synchronization, connect and receive the initial snapshot before mounting. The shared client supplies initial content; the Editor `content` option does not replace it. `DocSync` also accepts `LocalClient` and legacy `SyncClient`. Multiple local views may share one client and history with separate selections. A sync backend supports **one mounted Tiptap editor**; wrapping the same backend in another client API does not bypass that claim. Destroying the editor releases it and removes callbacks. The caller retains ownership of the client.

## Schema, history and lifecycle

- `createTiptapExtensions(schema, domHints?)` generates the exact supported schema. Do not combine it with StarterKit's document, paragraph, text, list, mark or history extensions. Compatible UI/command extensions can be added; arbitrary additional node/mark schemas cannot.
- `DocSync.configure({client, presence?, onSelection?, onError?})` installs synchronization. Callback errors are reported through `onError(error, callback)`.
- `docSyncUndo` / `docSyncRedo` and Mod-Z / Mod-Shift-Z / Mod-Y use actor-owned CRDT history. Do not install Tiptap UndoRedo, ProseMirror history or another collaboration extension.
- Run undo/redo in a separate chain from document edits. A mixed edit/history chain is rejected before either document changes.
- Local mode does not publish presence. Synchronized presence requires the transport's send/receive paths; names and colors are display metadata, not authority.
- After an accepted schema change, rebuild generated extensions and the editor. A dedicated Tiptap open-editor transition host is not yet qualified.

## Collaboration and safety boundaries

The examples use an in-memory TypeScript client. For independent synchronized actors, use separate clients configured with unique `actor` IDs, the same compatible schema and a transport. A binding does not provide persistence, authentication, authorization or a production document server. See the [Client guide](https://barocss.github.io/doc-sync/guide/client.html) for connection and recovery contracts.

Text-editor bindings reject graphic schemas. Schema data retention does not automatically supply native commands or rendering for every node type. Applications own rendering, URL sanitization, toolbar/plugins and their disposal. Headless and simulated browser input tests do not establish actual OS IME acceptance, production readiness or large-document latency guarantees.

## Further reading and verification

- [Tiptap guide](https://barocss.github.io/doc-sync/guide/tiptap.html)
- [ProseMirror conversion rules](https://barocss.github.io/doc-sync/guide/prosemirror.html)
- Two-editor demo, from repository root: `node apps/demo/tiptap/start.mjs`
- Repository checks: `npm run typecheck`, `npm run check:packages`; core tests include Tiptap integration scenarios.
