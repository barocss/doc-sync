# DocSync

Schema-driven collaborative documents, local editing, and editor bindings in TypeScript.

DocSync represents documents as CRDT token sequences. Applications supply node,
attribute, mark, and child rules; the engine provides editing, identity-preserving
operations, per-actor History, synchronization, and recovery primitives. The core
has **no external runtime dependencies**. Editor bindings and Presence views are
separate, optional packages.

> **Development status:** all ten library packages are private `0.0.0` workspaces,
> not published npm releases. Examples use a built checkout or locally packed
> tarballs. TypeScript is the production implementation in this repository, not a
> claim that every application/deployment scenario has been production-qualified.

[Documentation](https://barocss.github.io/doc-sync/) ·
[Getting started](apps/docs/src/guide/getting-started.md) ·
[Roadmap and verification](docs/roadmap-status.md) ·
[Maintainer handoff](HANDOFF.md)

## Start locally

Use **Node.js 22.18 or later** and npm. A modern browser is needed for the demos.

```sh
git clone https://github.com/barocss/doc-sync.git
cd doc-sync
npm ci
npm run build
npm run dev:client
```

Follow the URL printed by the demo. `dev:client` demonstrates ProseMirror, Tiptap,
Slate and Lexical in local/synchronized modes. `npm run dev` starts the original
HTTP/SSE demo at `http://localhost:5410`; `npm run dev:local` needs no document
server. Demos are development examples, not public deployment templates.

### A local document in one file

Save this as `example.ts` in the repository root after building, then run
`node example.ts`. The same API works in a browser bundle.

<!-- readme-example:local -->
```ts
import assert from 'node:assert/strict';
import {Client} from '@barocss/doc-sync/client';
import type {Schema} from '@barocss/doc-sync';

const schema: Schema = {
    root: 'document',
    marks: ['bold'],
    nodes: {
        document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
const client = new Client({schema, actor: 'local-example'});
client.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
const first = client.model().children?.[0]?.runs?.[0];
assert(first && 'text' in first);
assert.equal(first.text, 'Hello');
client.undo();
client.redo();
const saved = JSON.parse(JSON.stringify(client.captureState()));
const reopened = Client.fromState(saved, {schema});
assert.deepEqual(reopened.model(), client.model());
reopened.dispose();
client.dispose();
```

`edit()` already applies and records the action; do not apply its returned
operations again. `captureState()` is an explicit local snapshot, not automatic
persistence. The application must save it successfully and manage its lifetime.

## Choose your packages

Every package README has setup, API usage, lifecycle, and support boundaries.

| Package | Use it for |
| --- | --- |
| [`@barocss/doc-sync`](packages/doc-sync/README.md) | CRDT, Client, local/sync backends, server, schema, data, Presence |
| [`@barocss/doc-sync-prosemirror`](packages/doc-sync-prosemirror/README.md) | ProseMirror schema conversion and binding |
| [`@barocss/doc-sync-tiptap`](packages/doc-sync-tiptap/README.md) | Tiptap extension using the ProseMirror binding |
| [`@barocss/doc-sync-slate`](packages/doc-sync-slate/README.md) | Slate binding and codec |
| [`@barocss/doc-sync-lexical`](packages/doc-sync-lexical/README.md) | Lexical nodes, schema conversion and binding |
| [`@barocss/doc-sync-presence-ui`](packages/doc-sync-presence-ui/README.md) | Framework-free cursor, selection, draft and avatar views |
| [`@barocss/doc-sync-presence-react`](packages/doc-sync-presence-react/README.md) | React Presence components and hooks |
| [`@barocss/doc-sync-presence-vue`](packages/doc-sync-presence-vue/README.md) | Vue Presence components and composables |
| [`@barocss/doc-sync-presence-svelte`](packages/doc-sync-presence-svelte/README.md) | Svelte Presence component and store |
| [`@barocss/doc-sync-presence-solid`](packages/doc-sync-presence-solid/README.md) | SolidJS Presence components and accessors |

There is no `doc-sync-core` package or core `/prosemirror` export. Import each
binding by its package name. For another project, use the [local package recipe](
apps/docs/src/guide/packages.md), not an unverified registry install command.
`npm run check:packages` builds, packs and installs all ten packages in isolated
local consumers; it does not publish them.

### Using Tiptap

The Tiptap binding is implemented as `@barocss/doc-sync-tiptap`, with `DocSync`
and `createTiptapExtensions`. Start with the [Tiptap guide](https://barocss.github.io/doc-sync/guide/tiptap.html)
or its [package README](packages/doc-sync-tiptap/README.md). Run
`node apps/demo/tiptap/start.mjs` after the workspace build for its two-editor demo.
It uses Tiptap 3.32.2 and the separate ProseMirror binding; its generated schema
must not be mixed with StarterKit schema/history extensions. It remains a private,
unpublished workspace, like the other bindings.

## Build an editor

1. Define the [schema](apps/docs/src/guide/schema.md) and use
   [schema diagnostics/preflight](apps/docs/src/guide/schema-transition.md) before
   changing it. Identity and compatibility are protocol contracts, not merely UI
   validation.
2. Create a [Client](apps/docs/src/guide/client.md). Without transport it is local;
   adding `actor` and `transport` at construction selects synchronization. Mode
   cannot be switched later. Active replicas must have distinct actor IDs.
3. Mount an [editor binding](apps/docs/src/guide/editors.md). Bindings create a
   host per view. Multiple views of one client share an actor and History; they
   are not independent collaborators.
4. Implement [server routing, authentication and recovery](apps/docs/src/guide/sync.md)
   for your application. A profile, actor name or Presence message is not permission.
5. Dispose bindings/subscriptions when views unmount, and dispose the client when
   its owner closes the document. Handle pending changes and recovery before
   discarding synchronized state.

### Additional domains

- [Shared maps and lists](apps/docs/src/guide/shared-data.md): `Client.data` with
  `createDataSchema()` and server `createDataHub`; data GC remains disabled.
- [Graphic schemas](apps/docs/src/guide/graphic-schema.md): empty/stored containers
  use the TypeScript engine; text bindings do not provide canvas rendering.
- [Spreadsheets](apps/docs/src/schemas/spreadsheets.md): experimental SparseSheet
  and StructuralSheet APIs are not integrated with Client/DocHub synchronization.
- [Presence](apps/docs/src/guide/presence-components.md): ephemeral state and optional
  UI, separate from persistent document History. The host maps document positions
  to screen coordinates.
- [AI and bots](apps/docs/src/ai/index.md): private MCP/bot workspaces, bounded reads,
  conditional edits and owner proposals. Real-model quality, public deployment and
  automatic authority are not implied. See [bot roadmap](docs/bot-roadmap.md).
- [Rust SDK](experiments/rust-sdk/README.md): experimental native APIs with a bounded
  support matrix. Rust/WASM is not a selectable production Client backend.

## Development and documentation

Run from the repository root after `npm ci`:

| Command | What it checks or starts |
| --- | --- |
| `npm run build` | Compiled ESM and declaration outputs in dependency order |
| `npm run typecheck` | Workspace TypeScript (builds packages first) |
| `npm test` | Workspace tests, including bounded randomized scenarios |
| `npm run check:readmes` | Package coverage, local README links and executable root/core snippets |
| `npm run check:packages` | Tarballs, exports, peer dependencies and isolated consumers |
| `npm run docs:build` | VitePress site and generated content |
| `npm run docs:check` | Built documentation pages, links and English prose |
| `npm run docs:dev` | Local documentation development server |

See [documentation maintenance](apps/docs/src/guide/documentation.md) for sources,
example verification and package README conventions. Generated `dist` files are
not source edits. Run browser checks separately when changing user interactions;
unit tests do not prove IME, accessibility or real-browser behavior.

Performance reports and past validation remain in [`benchmarks/results`](benchmarks/results),
[`HANDOFF.md`](HANDOFF.md), and the [roadmap status](docs/roadmap-status.md).
Their dates, commits and scopes matter: historical results are not new measurements.
Long-duration load testing and registry publication are separate release activities.
