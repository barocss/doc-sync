# Packages and engines

The package split is complete in this checkout. Six npm packages have compiled
JavaScript exports and type declarations. All six remain `private: true` at
version `0.0.0`. They have not been published to the npm registry.

## Choose packages

| Package | Contents | Required package peers |
| --- | --- | --- |
| `@barocss/doc-sync-core` | CRDT, local/sync clients, editor hosts, server, Node transport, input session, engine contracts | None. No external runtime dependencies. |
| `@barocss/doc-sync-prosemirror` | ProseMirror schema, conversion, and binding | Core; `prosemirror-model`, `prosemirror-state`, `prosemirror-transform`, `prosemirror-view`. |
| `@barocss/doc-sync-tiptap` | Tiptap extension and generated schema | Core; ProseMirror binding; `@tiptap/core` and `@tiptap/pm` at `3.32.2`. |
| `@barocss/doc-sync-slate` | Slate binding and codec | Core; `slate`. |
| `@barocss/doc-sync-lexical` | Lexical binding, node classes, and conversion | Core; `lexical`, `@lexical/rich-text`, `@lexical/table`. |
| `@barocss/doc-sync` | Compatibility exports for existing applications | Core dependency; optional binding package peers for the editor subpaths used. |

Core does not import an editor binding. Each binding can be maintained and
packed separately. Tiptap uses the ProseMirror binding. The compatibility facade
re-exports the same implementations; it does not contain a second engine.

Use the independent names in new applications:

```ts
import {Doc, Client, type Schema} from '@barocss/doc-sync-core';
// Client is also available from @barocss/doc-sync-core/client.
import {SyncClient, HttpTransport} from '@barocss/doc-sync-core/sync';
import {LocalClient, LocalEditorHost} from '@barocss/doc-sync-core/local';
import {NodeHttpTransport} from '@barocss/doc-sync-core/node';
import {DocHub} from '@barocss/doc-sync-core/server';
import {PmBinding} from '@barocss/doc-sync-prosemirror';
import {DocSync} from '@barocss/doc-sync-tiptap';
import {SlateBinding} from '@barocss/doc-sync-slate';
import {LexicalBinding} from '@barocss/doc-sync-lexical';
```

This list shows available imports. Install only the bindings that your
application uses, together with their required peers.

The `/client` facade entry and root `Client` export provide the unified API.
The eight existing facade imports also remain available: `@barocss/doc-sync`,
`@barocss/doc-sync/sync`, `@barocss/doc-sync/node`,
`@barocss/doc-sync/server`, `@barocss/doc-sync/prosemirror`,
`@barocss/doc-sync/tiptap`, `@barocss/doc-sync/slate`, and
`@barocss/doc-sync/lexical`. An editor subpath requires its selected binding
package and that binding's editor peers. Importing the facade's core, sync,
server, or Node entry does not load editor packages.

For a memory-only document, use the [local editing guide](./local-editing).
The `/local` entry belongs to Core and imports no native editor package.

## Save a local document

Core Client and LocalClient expose captureState/fromState. The first local state
format retains schema identity, actor, CRDT state and History. A caller supplies
storage and mounts a new restored client after validation. This is part of Core,
not a new storage package or a SyncClient recovery adapter. See
[Save and open locally](./local-storage).

## Build and use local packages

From the repository root:

```sh
npm ci
npm run build
npm run check:packages
```

The build processes Core first, then the bindings, then the facade. Each package
exports `dist/*.js` and `dist/*.d.ts`. Application imports use the public package
names. Do not import a package's source files.

`check:packages` packs all six packages and installs the tarballs in isolated
consumer directories. It checks runtime exports, type declarations, absence of
unrelated editors, old and new imports, and the Tiptap transaction tests. It
also packs a Slate `0.0.1` test copy and loads it through the unchanged facade.
The helper writes tarballs and `pack-consumers.json` to
`output/binding-packages/`. This is local package evidence, not a registry release.

For example, after that check, a separate Slate application can install the
local artifacts. Replace `/path/to/doc-sync` with the checkout's absolute path:

```sh
npm install /path/to/doc-sync/output/binding-packages/barocss-doc-sync-core-0.0.0.tgz /path/to/doc-sync/output/binding-packages/barocss-doc-sync-slate-0.0.0.tgz slate@0.146.0
```

A binding can also be packed directly from the checkout:

```sh
npm pack --workspace @barocss/doc-sync-slate --pack-destination /tmp
```

Run the root build first so that the binding's Core declarations are available.
Each package's `prepack` removes its own generated directory and rebuilds it.
The package check verifies removal of stale JavaScript and orphan files.

For a binding fix, change and test the selected binding, set its release version,
and pack it for an isolated consumer. Check its peer ranges before a release.
A compatible binding patch does not require source changes or a new version in
Core, sibling bindings, or the facade. Registry publication still requires a
separate release step and removal of the selected package's private flag.

## Bind a client directly

Prefer `new Client({schema})` for memory-only editing, or supply `actor` and
`transport` for synchronization. Pass it directly to PmBinding, SlateBinding,
LexicalBinding or `DocSync.configure({client})`. Each view gets its own host
internally. See [Client](./client) and the [editor guides](./editors).
The explicit host APIs below are available for advanced adapter ownership.

## Connect ProseMirror through an editor host

`EditorHost` is the in-process interface between a binding and its document
backend. `createEditorHost(client)` selects the local or sync adapter. The
explicit sync adapter below delegates to the existing TypeScript `SyncClient`.
It preserves pending edits, transport ownership, and actor-owned history:

```ts
import type {SyncClient} from '@barocss/doc-sync-core/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';
import {PmHostBinding, buildPmSchema} from '@barocss/doc-sync-prosemirror';
import {EditorView} from 'prosemirror-view';

function mountEditor(client: SyncClient, mount: HTMLElement) {
    // Keep the client's normal connect/recovery lifecycle in your application.
    const host = createSyncClientEditorHost(client);
    const binding = new PmHostBinding(host, buildPmSchema(client.schema));
    const view = new EditorView(mount, {
        state: binding.state,
        dispatchTransaction: tr => binding.dispatch(tr),
    });
    binding.view = view;
    binding.onChange = () => view.updateState(binding.state);
    return () => { binding.dispose(); view.destroy(); };
}
```

Create the view with `binding.state` before assigning `binding.view`. The shorter
`new PmBinding(client, info)` API remains supported and uses this same path;
its public `binding.client` is still the original client. Tiptap's `DocSync`
options and storage retain their existing client-based API.

Host model values are borrowed immutable views. Do not modify them. A stamp
combines document generation and revision, so replacing a document with the
same revision still invalidates the binding cache. Selection and presence
queries do not copy the full model. Ordinary mutations add no snapshot fork;
a composition session retains its existing single draft fork.

`host.apply(edits)` creates local operations and `host.commit(ops)` records and
sends them. Keep these steps together as in the existing client API. Host
sessions preserve composition and use the live client's mutation gates. The
host does not provide an atomic server transaction or replace conditional edit
checks. Disposing a binding does not disconnect the client or discard pending
changes. A host is an adapter seam, not a Rust/WASM backend implementation.

## Use the same host contract with Slate and Lexical

The independent packages export `SlateHostBinding` and `LexicalHostBinding`.
Their legacy `SlateBinding(client, editor)` and
`LexicalBinding(client, editor, info)` wrappers use the same implementation:

```ts
import {createEditor as createSlateEditor} from 'slate';
import {createEditor as createLexicalEditor} from 'lexical';
import type {SyncClient} from '@barocss/doc-sync-core/sync';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';
import {SlateHostBinding} from '@barocss/doc-sync-slate';
import {LexicalHostBinding, buildLexicalSchema} from '@barocss/doc-sync-lexical';

function bindSlate(client: SyncClient) {
    const editor = createSlateEditor();
    const binding = new SlateHostBinding(createSyncClientEditorHost(client), editor);
    return {editor, binding};
}

function bindLexical(client: SyncClient) {
    const info = buildLexicalSchema(client.schema);
    const editor = createLexicalEditor({nodes: info.nodes});
    const binding = new LexicalHostBinding(createSyncClientEditorHost(client), editor, info);
    return {editor, binding};
}
```

These functions create the bindings; add your normal native editor UI and
plugins as described in the [Slate](./slate) and [Lexical](./lexical) guides.
Call `binding.dispose()` on unmount. Keep a native editor instance owned by
one binding. Both legacy wrappers preserve `binding.client === client`.
Lexical's legacy `binding.input` remains the original `InputSession`; the
common binding's `session` delegates to it, so composition does not create a
second draft.

Clock observation remains allowed during recovery or a pending conditional
request. It reserves existing actor tickets without generating operations.
New local edits and composition commits remain blocked until the client is
safe to edit. Remote model/status updates can therefore keep the native view
current while local editing is paused.

## Engine selection is a separate milestone

Choose one of these entry points:

- [TypeScript factory example](#engine-selection-is-a-separate-milestone): direct document engine calls in JavaScript.
- [TypeScript editor host](#connect-prosemirror-through-an-editor-host): the existing networked client with editor bindings.
- [Native Rust quickstart](./rust#use-the-native-rust-sdk): a Cargo path dependency with host-owned transport.
- [Rust restart and acknowledgement recipe](./rust#checkpoint-retry-selection-and-history-recipe): exact pending retry, stable selections, and History.
- [Storage-only WASM recipe](./rust#use-the-storage-only-wasm-adapter): build, load, initialize, splice, read, and clear a UTF-16 buffer.

`SyncClient` accepts a production `ClientEngineFactory` at construction. The
selected engine owns the document, History, and composition drafts. The common
`EditorHost` uses this port for ProseMirror, Slate, and Lexical; Tiptap uses the
same ProseMirror implementation. Only TypeScript ships today:

```ts
import {SyncClient, HttpTransport} from '@barocss/doc-sync-core/sync';
import {typescriptClientEngineFactory} from '@barocss/doc-sync-core/engine';
import {createSyncClientEditorHost} from '@barocss/doc-sync-core/editor';

const actor = 'alice-session-1';
const client = new SyncClient(actor, new HttpTransport('example', actor), {
    schema,
    engineFactory: typescriptClientEngineFactory,
});
const host = createSyncClientEditorHost(client);
host.commit(host.apply([{op: 'insert', at: [0, 0], content: 'Hello'}]));
client.connect();
```

Here `schema` is your application schema. Omit `engineFactory` to use the same
TypeScript default. Factory identity, methods, schema, and capabilities are
checked before connection. Selection happens once; live engine switching is not
supported. A Rust/WASM production factory is not available.

The common engine and host paths do not expose `Doc` or `History`. Legacy
TypeScript access returns the actual authoritative objects through an optional
compatibility extension. Existing custom Doc-based input sessions and document
facades use a separate TypeScript compatibility adapter. A portable backend does
not need to support those escape paths.

`apply` returns already-applied wire operations without History. Commit once to
record and queue them. Composition publication applies the retained draft
operations; `InputSession.end()` commits them once. `disconnect()` preserves
pending changes and History. Terminal `dispose()` rejects protected work or
remaining undo/redo History.

Selected-engine routing, regressions and conversion-count checks pass.
Repeated/pooled Node and controlled Chrome comparisons qualify the client
migration. Original separate-server latency and small-block tail crossings
remain reported; general product-latency acceptance remains open. See
[status and limits](../status) for the evidence boundary.

Core exports a draft value-based engine contract at
`@barocss/doc-sync-core/engine`. Its TypeScript factory supports edit, receive,
actor-owned history, stable anchors, and checkpoints:

```ts
import {type Schema} from '@barocss/doc-sync-core';
import {typescriptEngine} from '@barocss/doc-sync-core/engine';

const schema: Schema = {
    root: 'content',
    marks: [],
    nodes: {
        content: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
const alice = typescriptEngine.create('alice', schema);
const bob = typescriptEngine.create('bob', schema);
const change = alice.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
bob.receive('alice', change.ops);
const checkpoint = alice.checkpoint();
const restored = typescriptEngine.restore('alice', schema, checkpoint);
console.log(bob.model(), restored.model());
```

This older immutable factory is not a production `ClientEngineFactory` and
cannot be passed to `SyncClient`. This example does not connect a
`SyncClient` or an editor. The contract passes plain data values across the
boundary. Its current capabilities do not include composition, model events,
garbage collection, or schema transitions. Call `requireCapability` before
using a feature that an adapter must provide. Checkpoints are engine-specific;
a TypeScript checkpoint cannot be restored into the native Rust SDK.

| Capability | Production TypeScript path | Native Rust SDK | Browser Rust/WASM path |
| --- | --- | --- | --- |
| Runtime schema data | Supported, with compatible transition rules | Six fixed presets | Not implemented as a full document adapter |
| Browser editor bindings and `SyncClient` | Selected production TypeScript factory and editor host | No adapter | No qualified adapter or selector |
| Native text, operations, history, and anchors | Available in TypeScript | Available through a private Cargo path dependency | Not available as a full browser engine |
| WASM storage experiment | Separate from the TypeScript engine | Separate from the native SDK | Vec/Gap UTF-16 buffers only; no CRDT or editor integration |
| Draft common engine factory | TypeScript implementation | Separate native API; no common factory | Planned |
| Performance acceptance | See the measured TypeScript reports | No native SDK performance acceptance | No full-engine browser acceptance |

A Rust/WASM choice needs a production adapter and the remaining native
capabilities.
It also needs schema, recovery, selection, and history parity checks. Keep that
work separate from an independent binding release. See the [Rust guide](./rust)
and [roadmap](../roadmap) for the current native API and remaining work.
