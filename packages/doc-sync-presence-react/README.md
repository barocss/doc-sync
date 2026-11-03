# DocSync Presence for React

Private, optional React 19 bindings. Supply one headless `PresenceStore` from
`@barocss/doc-sync/presence` and a projector from `@barocss/doc-sync-presence-ui`.
The shared DOM renderer owns avatar, cursor, selection, and draft visuals.
Names appear on hover. This package adds no transport or editor geometry.

```tsx
import {PresenceOverlay, PresenceProvider, usePresence} from '@barocss/doc-sync-presence-react';

function EditorPresence({store, projector}) {
  return <PresenceProvider store={store}>
    <PresenceOverlay options={{projector}} />
  </PresenceProvider>;
}
```

`PresenceOverlay` accepts `store` directly, or gets it from `PresenceProvider`.
`options` is `PresenceUIOptions`; projection rectangles use viewport CSS pixels.
Place the host in your editor's overlay container and set `className` or `style`
as needed. `AvatarStack`, `CursorLayer`, `SelectionLayer`, and `DraftPreview`
accept the same props and enable only their own visual layer.

`usePresence(store?)` uses `useSyncExternalStore` and returns the stable store
snapshot. `usePresenceStore(store?)` resolves the explicit or provided store.
Imports and initial rendering do not read browser globals. Effects mount the DOM
renderer and dispose it on unmount or store replacement. React Strict Mode can
mount again without retaining the old subscription. The caller owns the store
and network client; these bindings never dispose or disconnect them.
