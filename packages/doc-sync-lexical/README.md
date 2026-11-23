# @barocss/doc-sync-lexical

Connect a Lexical editor to Doc Sync with schema-derived nodes, model/selection conversion, composition handling and actor-owned history. No React dependency or toolbar is included.

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
- `lexical`, `@lexical/rich-text`, `@lexical/table` (each `^0.52.0`)

All three Lexical packages are required when importing this binding. The repository tests use `0.52.0` for each; keep the versions aligned.

## Minimal headless example

Build schema information before creating the editor so its node classes are registered:

```ts
import {createEditor} from "lexical";
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {buildLexicalSchema, LexicalBinding} from "@barocss/doc-sync-lexical";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const info = buildLexicalSchema(schema);
const editor = createEditor({
    namespace: "doc-sync-example",
    nodes: info.nodes,
    onError: error => { throw error; },
});
const client = new Client({schema});
const binding = new LexicalBinding(client, editor, {info});
console.log(client.model());
binding.dispose();
client.dispose();
```

For a browser UI, attach `editor.setRootElement(element)` and register the rich-text/table plugins needed by your commands. On unmount, dispose the binding, detach the root with `editor.setRootElement(null)` and dispose separately registered plugins. The binding does not own those resources or the client connection.

`LexicalBinding` also accepts `LocalClient` and legacy `SyncClient`; `LexicalHostBinding` accepts an explicit host. Each view gets its own host. For a legacy `SyncClient`, `.input` is its original `InputSession`; for `Client` and `LocalClient` it is the binding's `EditorSession`.

## Schema conversion and API

- `buildLexicalSchema(schema, options?)` supplies node registrations and mapping. Options include paragraph, quote, heading and table mappings plus explicit custom codecs.
- `readLexicalModel`, `toLexicalJSON`, `fromLexicalJSON` manage Lexical read/update contexts. The `$` conversion and selection helpers require the appropriate Lexical read/update context.
- `SchemaElementNode` and `SchemaLeafNode` retain schema data for elements without a native mapping. Registering an arbitrary native node class alone does not define a codec.
- `LEXICAL_REMOTE_TAG` prevents remote updates echoing as local edits. Do not add another commit listener for the same editor.
- Unsupported native features (such as unhandled CSS text styles) require a codec. A failed local conversion restores shared state and reports `onError`.

## Selection, history and lifecycle

Selections use model paths with UTF-16 offsets and stable document anchors across remote edits. The binding installs composition listeners on the editor root; explicit `beginComposition`, `endComposition` and `cancelComposition` methods are available. An uncommitted draft is canceled on disposal.

`binding.undo()` / `binding.redo()` and registered Lexical undo/redo commands use CRDT history. Do not install an independent native history as another authority. `groupTyping` defaults to true; composition remains one history group.

Remote application currently rebuilds the native tree. Single semantic moves can be recognized, but multiple reparented blocks or creation of a destination and movement into it in one update are rejected. After an accepted compatible schema transition, rebuild schema information and the editor/binding while retaining the client and history.

## Collaboration and safety boundaries

The examples use an in-memory TypeScript client. For independent synchronized actors, use separate clients configured with unique `actor` IDs, the same compatible schema and a transport. A binding does not provide persistence, authentication, authorization or a production document server. See the [Client guide](https://barocss.github.io/doc-sync/guide/client.html) for connection and recovery contracts.

Text-editor bindings reject graphic schemas. Schema data retention does not automatically supply native commands or rendering for every node type. Applications own rendering, URL sanitization, toolbar/plugins and their disposal. Headless and simulated browser input tests do not establish actual OS IME acceptance, production readiness or large-document latency guarantees.

## Further reading and verification

- [Lexical guide and codec contract](https://barocss.github.io/doc-sync/guide/lexical.html)
- [Schema transitions](https://barocss.github.io/doc-sync/guide/schema-transition.html)
- Repository tests: `npm test --workspace @barocss/doc-sync-lexical`
- Artifact/type checks: `npm run check:packages` and `npm run typecheck`
