# @barocss/doc-sync-slate

Connect real Slate operations to a schema-driven Doc Sync client. The binding handles model conversion, remote updates, selection restoration, composition drafts and CRDT history. It has no React dependency and does not provide renderers or a toolbar.

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
- `slate` (`^0.146.0`; repository tests use `0.146.0`)

A React UI additionally needs compatible `slate-react`, React and React DOM dependencies. Those are application choices, not binding dependencies.

## Minimal headless example

```ts
import {createEditor} from "slate";
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {SlateBinding} from "@barocss/doc-sync-slate";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema});
const editor = createEditor();
const binding = new SlateBinding(client, editor, {
    onError: error => console.error(error),
});

// Inspect the initialized document without mounting a browser UI.
console.log(client.model(), editor.children);
binding.dispose();
client.dispose();
```

`SlateBinding` also accepts `LocalClient` and legacy `SyncClient`; `SlateHostBinding` accepts an explicit host. Each binding creates a view-specific host and retains the exact client reference. Several local views can share one client and history.

## Browser integration and ownership

Configure plugins (for example `withReact`) before constructing the binding. It initializes `editor.children`; use `binding.initialValue` with a Slate React provider. The binding wraps `onChange`, `isInline` and `isVoid` and preserves the previous change callback. Do not install another model-diff/commit listener or a competing shared-history authority.

Provide renderers for your schema nodes and marks. Wire `binding.beginComposition()` and `binding.endComposition()` to composition events, or supply `options.element` for removable DOM listeners, not both. Use `binding.undo()` and `binding.redo()` for shared history. `groupTyping` defaults to true; composition commits as one group.

`binding.dispose()` (also `destroy()`) removes listeners, restores owned wrappers and cancels an uncommitted composition draft. Repeated disposal is safe. It does not tear down another view, the application-owned client, React root or other plugins.

## Conversion and limits

`toSlate` / `fromSlate` convert models; point/range helpers map UTF-16 model offsets to Slate paths. Schema data includes hidden covered-cell contents that are absent from the visible table projection. See the detailed guide before custom serialization or table rendering.

Remote updates currently rebuild the native tree, which has a large-document cost. Pure native move updates can map to semantic document moves; mixed moves and other mutations are rejected and the shared model is restored. This is not arbitrary text-range/table-axis movement. After an accepted compatible schema transition, recreate the binding and rendering with the new schema while preserving the client and history.

## Collaboration and safety boundaries

The examples use an in-memory TypeScript client. For independent synchronized actors, use separate clients configured with unique `actor` IDs, the same compatible schema and a transport. A binding does not provide persistence, authentication, authorization or a production document server. See the [Client guide](https://barocss.github.io/doc-sync/guide/client.html) for connection and recovery contracts.

Text-editor bindings reject graphic schemas. Schema data retention does not automatically supply native commands or rendering for every node type. Applications own rendering, URL sanitization, toolbar/plugins and their disposal. Headless and simulated browser input tests do not establish actual OS IME acceptance, production readiness or large-document latency guarantees.

## Further reading and verification

- [Slate guide and React mount](https://barocss.github.io/doc-sync/guide/slate.html)
- [Editor integration](https://barocss.github.io/doc-sync/guide/editors.html)
- Repository tests: `npm test --workspace @barocss/doc-sync-slate`
- Artifact/type checks: `npm run check:packages` and `npm run typecheck`
