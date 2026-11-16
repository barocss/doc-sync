# @barocss/doc-sync-presence-solid

SolidJS components for `@barocss/doc-sync/presence`. Rendering and geometry use
`@barocss/doc-sync-presence-ui`. This package does not own the store or transport.

## Installation and package status

This package is **private, version `0.0.0`, and not published to npm**. Use the
repository workspaces or local tarballs, not a registry install of this name.
Node **22.18 or later** is required for repository tooling. From the repository root:

```sh
npm ci
npm run build
npm run test --workspace @barocss/doc-sync-presence-solid
```

For a separate application, pack the required workspaces from this checkout:

```sh
mkdir -p artifacts
npm pack --workspace @barocss/doc-sync --pack-destination artifacts
npm pack --workspace @barocss/doc-sync-presence-ui --pack-destination artifacts
npm pack --workspace @barocss/doc-sync-presence-solid --pack-destination artifacts
```

Install those generated `.tgz` files together in the consuming application. Required peers are
`@barocss/doc-sync >=0.0.0 <0.1.0`,
`@barocss/doc-sync-presence-ui >=0.0.0 <0.1.0`, and `solid-js ^1.9.9`.
Use your framework’s normal build setup; these are ESM packages.

## Usage

```tsx
import {PresenceProvider, PresenceOverlay, createPresence} from '@barocss/doc-sync-presence-solid';

function Peers() {
  const peers = createPresence();
  return <span>{peers().length}</span>;
}

<PresenceProvider store={store}>
  <Peers />
  <PresenceOverlay options={{projector}} style={{position: 'relative', height: '320px'}} />
</PresenceProvider>
```

`PresenceProvider` accepts a reactive `store` prop. `PresenceOverlay` also accepts
an explicit `store`, `options`, `class`, and `style`. Use a positioned overlay
container. `AvatarStack`, `CursorLayer`, `SelectionLayer`, and `DraftPreview`
accept the same props and enable their named layer only.

`createPresence(storeOrAccessor?)` and its alias `usePresence` return a read-only
snapshot accessor. Call them inside a Solid owner. An accessor argument follows
source replacement. `usePresenceStore(storeOrAccessor?)` returns the resolved
store accessor. Without an explicit store, both use the nearest provider.

The Solid owner releases each subscription. Store replacement releases the old
subscription before creating the new one. Unmount releases overlay resources.
SSR produces an empty overlay element without DOM access or subscriptions.
Solid's native browser/server export conditions select the runtime. No JSX
compiler is required to build this package; its components use `createComponent`.

## Store, geometry and security contract

Create the store once per client actor in your application, not on each render:

```ts
import {createPresenceStore} from '@barocss/doc-sync/presence';
import {createPresenceProjector} from '@barocss/doc-sync-presence-ui';

const store = createPresenceStore({actor: 'demo-replica', ttlMs: 30_000});
store.updateLocal({profile: {name: 'Demo'}, activity: 'active'});
// Avatar-only setup: deliberately no geometry adapters.
const projector = createPresenceProjector({});
```

Pass this store and projector to the example above. This local example opens no
network connection. For real collaboration, use `connectClientPresence` from
`@barocss/doc-sync/presence` with your synchronized client. Give concurrently active
replicas distinct actor IDs. The store starts no expiry timer: the application
must call `expire()` if it needs time-based removal. Dispose the UI first, then
the bridge and store when their owning application closes. Never dispose a shared
store merely because one view unmounts.

The empty projector renders avatars but intentionally draws no document targets.
Supply document-anchor, canvas-object or sheet-cell adapters for cursors, selections
and drafts. Each adapter must return viewport CSS-pixel rectangles or `null` for
hidden, deleted, offscreen or unresolved targets. These geometry adapters belong
to your editor; they are not supplied by this package. Give the overlay a nonzero
size matching the editor viewport.

Presence is ephemeral display state, **not document persistence, edit authorization
or an acknowledgement protocol**. Names and bot labels grant no authority. Draft
text can reveal uncommitted input to other participants: publish it only when your
application intends to share it. No wrapper commits text, installs an editor, or
creates undo history. The shared renderer uses text nodes rather than interpreting
participant names or drafts as HTML.

## Documentation and verification

- [Presence components, connection and projection guide](https://barocss.github.io/doc-sync/guide/presence-components.html)
- [Package composition and engine boundaries](https://barocss.github.io/doc-sync/guide/packages.html)
- [Source and tests](https://github.com/barocss/doc-sync/tree/main/packages/doc-sync-presence-solid)
- Run `npm run dev:presence` from the repository root for the five-framework playground.

Package tests exercise renderer or framework lifecycle/SSR behavior; they do not
prove your editor’s coordinate mapping, network authorization, production deployment
or real IME behavior. Validate those integrations separately.
