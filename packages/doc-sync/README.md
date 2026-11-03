# @barocss/doc-sync

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all library packages and installs the tarballs into isolated consumers.

The core has no external runtime dependencies. Public entries are the root, `/sync`, `/server`, `/node`, `/editor`, `/engine`, `/local`, `/client`, `/presence`, and `/data`. Root and sync imports do not require an editor.

`Client.data` provides Map/List handles when the Client uses `createDataSchema()` from `/data`. Client owns transport, History and save/open. Other document schemas are not converted by accessing this namespace. Use `createDataHub` from `/server` for intrinsic data admission; guarded data GC is currently disabled. `/presence` supplies optional ephemeral collaboration state separately from document History.

`SyncClient` accepts `engineFactory: typescriptClientEngineFactory` from `/engine` or `/sync`. The selected engine owns live document and History state and drives the client, editor hosts and input sessions. TypeScript is the default and the only production implementation. The separate immutable `typescriptEngine` API remains an experiment. See [ENGINE-CONTRACT.md](./ENGINE-CONTRACT.md) for ownership, checkpoint and compatibility rules. No Rust/WASM backend is supplied.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing core or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.

## Schema domains

`Schema` remains the common engine input. An omitted domain keeps the document
flow rules. `DocumentSchema` can explicitly use `domain: 'document'` with the
same schema fingerprint as the equivalent legacy object. `GraphicSchema` uses
`domain: 'graphic'` and a root `container` that can stay empty. Stored frames and
object groups use container shape; the computed document `group` is unchanged.
Containers, object edits, movement, History, local state and synchronization use
the TypeScript engine. Root graphic attributes and container childRules are
currently rejected. A graphic sync peer must advertise `containers-v1` and the
matching schema identity. Existing text bindings reject graphic schemas; they do
not supply a canvas renderer. The repository guide is
`apps/docs/src/guide/graphic-schema.md`.

## Unified client

`/client` exports `Client`, `BindingClient` and `createEditorHost`. The root also
exports Client. Construct `new Client({schema})` for a LocalClient backend, or
provide `actor` and `transport` for SyncClient. Mode is fixed. Native bindings
create per-view hosts internally and accept both legacy clients. `edit()` applies,
records and (in sync mode) queues once. `client.sync` exposes sync-only recovery
and schema APIs; it is null locally. The unified entry imports sync code; `/local`
remains the narrower module entry. See the repository Client guide for lifecycle
and limits. `captureState()` and `Client.fromState(state, {schema})` support explicit local save/open through caller storage. No Rust/WASM factory is supplied.

`/local` exports `LocalClient`, `LocalEditorHost` and `createLocalEditorHost` for memory-only editing with the production TS engine. Each native editor view needs its own host. LocalClient also provides captureState/fromState with saved actor, IDs and History. Capture rejects pending operations and active drafts. Storage media, successful writes, background saving and automatic server attachment belong to the application. See the repository local editing guide.
