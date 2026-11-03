# DocSync Presence for Vue

Private, optional Vue 3 bindings. Supply one headless `PresenceStore` and shared
`PresenceUIOptions`. Geometry and all visuals use `@barocss/doc-sync-presence-ui`.

```vue
<script setup>
import {PresenceOverlay} from '@barocss/doc-sync-presence-vue';
defineProps(['store', 'projector']);
</script>

<template>
  <PresenceOverlay :store="store" :options="{projector}" />
</template>
```

`PresenceOverlay`, `AvatarStack`, `CursorLayer`, `SelectionLayer`, and
`DraftPreview` accept `store` and `options`. Each named layer enables only its
own visuals. Standard HTML attributes, including class and style, reach the
host element. Projection rectangles use viewport CSS pixels.

For context, use `<PresenceProvider :store="store">` or `providePresence(store)`
in setup. `usePresence(store?)` returns a readonly shallow ref to current actors;
`usePresenceStore(store?)` resolves the explicit or injected store. Call these
composables in setup. Provider store replacement also updates injected overlays and subscriptions.

DOM mounting and composable subscriptions start after mount. Unmount stops all
subscriptions and removes the renderer. Store prop replacement disposes the old
renderer first. Imports and server rendering do not access browser globals.
The caller owns the store and network client; wrappers never disconnect them.
