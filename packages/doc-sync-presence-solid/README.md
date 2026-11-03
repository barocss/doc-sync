# @barocss/doc-sync-presence-solid

SolidJS components for `@barocss/doc-sync/presence`. Rendering and geometry use
`@barocss/doc-sync-presence-ui`. This package does not own the store or transport.

```tsx
import {PresenceProvider, PresenceOverlay, createPresence} from '@barocss/doc-sync-presence-solid';

function Peers() {
  const peers = createPresence();
  return <span>{peers().length}</span>;
}

<PresenceProvider store={store()}>
  <Peers />
  <PresenceOverlay options={{projector}} />
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
