# @barocss/doc-sync-prosemirror

Connect a ProseMirror view to Doc Sync's schema-driven document and actor-owned history. The package supplies schema generation, model/selection conversion and client/host bindings, not a complete editor UI.

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

- `@barocss/doc-sync` (`>=0.0.0 <0.1.0`)
- `prosemirror-model` (`^1.25.0`)
- `prosemirror-state` (`^1.4.0`)
- `prosemirror-transform` (`^1.12.0`)
- `prosemirror-view` (`^1.42.0`)

## Minimal browser mount

Provide an element with `id="editor"`. Run this TypeScript through your application's browser build:

```ts
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {EditorView} from "prosemirror-view";
import {buildPmSchema, PmBinding} from "@barocss/doc-sync-prosemirror";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema});
const info = buildPmSchema(schema);
const binding = new PmBinding(client, info);
const view = new EditorView(document.querySelector("#editor"), {
    state: binding.state,
    dispatchTransaction: binding.dispatch,
});
binding.view = view;
binding.onChange = () => view.updateState(binding.state);

// On unmount, not immediately after mounting:
function dispose() {
    binding.dispose();
    view.destroy();
    client.dispose(); // Only if this application no longer uses the client.
}
```

Supply keyboard/input plugins and styles appropriate to your editor. Wire shared undo/redo to `binding.undo()` / `binding.redo()` or the client's history, not a separate ProseMirror history. `PmBinding` also accepts `LocalClient` and legacy `SyncClient`; it retains the exact client reference and creates one host per view. `PmHostBinding` accepts an explicit editor host. Disposing a view does not dispose a client shared with other views.

## API and model conversion

- `buildPmSchema(schema, domHints?)` returns schema/mapping information.
- `PmBinding(client, info, plugins?)` handles accepted local transactions and remote model updates.
- `toPmJSON` / `fromPmJSON` convert models; `pmPosToPath` / `pathToPmPos` convert selections.
- `REMOTE_META` identifies the binding's remote transactions.

ProseMirror represents only visible table cells. When calling `fromPmJSON` yourself, pass the current complete model as its fourth argument to retain covered-cell data. A native document alone cannot reconstruct hidden content. Use client editing methods to notify mounted views; code that bypasses those notifications must pull the binding explicitly.

Build a replacement view/schema after an accepted compatible schema transition, retaining the client and history. Do not mutate the mounted ProseMirror schema in place. For Tiptap, use the dedicated Tiptap package rather than this direct `EditorView` mount.

## Collaboration and safety boundaries

The examples use an in-memory TypeScript client. For independent synchronized actors, use separate clients configured with unique `actor` IDs, the same compatible schema and a transport. A binding does not provide persistence, authentication, authorization or a production document server. See the [Client guide](https://barocss.github.io/doc-sync/guide/client.html) for connection and recovery contracts.

Text-editor bindings reject graphic schemas. Schema data retention does not automatically supply native commands or rendering for every node type. Applications own rendering, URL sanitization, toolbar/plugins and their disposal. Headless and simulated browser input tests do not establish actual OS IME acceptance, production readiness or large-document latency guarantees.

## Further reading and verification

- [ProseMirror guide](https://barocss.github.io/doc-sync/guide/prosemirror.html)
- [Schema transitions](https://barocss.github.io/doc-sync/guide/schema-transition.html)
- [Complete demo](https://github.com/barocss/doc-sync/blob/main/apps/demo/ui/pm-app.ts)
- Repository checks: `npm run typecheck`, `npm run check:packages`; core tests include ProseMirror integration scenarios.
